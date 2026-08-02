/**
 * ⭐ ADMİN → DÜNYA ve AYARLAR (Faz 1).
 *
 * İki ayrı sabit ailesi var ve **bilerek ayrı yerlerde** duruyorlar:
 *   • **hız çarpanları** → `worlds` tablosunda kolon. Zaten her sorguda okunuyor
 *     (`city.service`, `queue.service`, `cave.handlers`); `settings`e kopyalamak ikinci bir
 *     doğruluk kaynağı yaratırdı.
 *   • **işletim limitleri** → `settings` tablosu, bellek-içi anlık görüntü.
 *
 * Panel ikisini tek ekranda gösterir; sunucu ikisini ayrı tutar.
 */
import {
  BadRequestException, Body, Controller, Get, HttpCode, Inject, NotFoundException, Param,
  Post, Put, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { SETTINGS, SETTING_GROUPS, applySettings, validatePatch } from '@mobilwar/settings';
import { simulate } from '@mobilwar/engine';
import {
  buildingCost, buildingTimeSeconds, mergeCatalogConfig, techCost, techTimeSeconds,
} from '@mobilwar/catalog';
import { simulateRequest } from '@mobilwar/contracts';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import { AuthService } from '../auth/auth.service.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { scheduleSnapshot } from '../ranking/ranking.service.ts';
import { getGateway } from '../realtime/gateway-registry.ts';
import { catalogOverrides } from '../settings/catalog.ts';
import { combatOverrides } from '../settings/combat.ts';
import { SettingsError, SettingsService } from '../settings/settings.service.ts';
import { toSimulateInput } from '../simulate/simulate.controller.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { WorldStateService } from '../world/world-state.service.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';

/**
 * ⚠️ Çarpanlar TAM SAYI ve en az 1. Şema da öyle (`integer NOT NULL DEFAULT 1`). 0 verilseydi
 * süre bölmeleri sonsuza giderdi; kesirli değer `finish_at` hesabında yuvarlama kayması üretirdi.
 */
const multipliers = z.object({
  speedMultiplier: z.number().int().min(1).max(1000).optional(),
  resourceMultiplier: z.number().int().min(1).max(1000).optional(),
  trainingMultiplier: z.number().int().min(1).max(1000).optional(),
  constructionMultiplier: z.number().int().min(1).max(1000).optional(),
}).refine((o) => Object.keys(o).length > 0, 'En az bir çarpan gerekli.');

const settingsPatch = z.object({ values: z.record(z.string(), z.unknown()) });

/** Katalog önizlemesi: hangi kalem, hangi seviyeler, hangi yama. */
const catalogPreviewBody = z.object({
  values: z.record(z.string(), z.unknown()),
  kind: z.enum(['building', 'tech']),
  id: z.string().min(1).max(40),
  levels: z.array(z.number().int().min(1).max(60)).min(1).max(20)
    .default([1, 2, 5, 10, 15, 20]),
});
const resetPatch = z.object({ keys: z.array(z.string()).min(1).max(200) });

/** Önizleme: bir savaş kurgusu + denenecek yama. Yama KAYDEDİLMEZ. */
const previewBody = z.object({
  values: z.record(z.string(), z.unknown()),
  battle: simulateRequest,
  seed: z.string().min(1).max(120).optional(),
});

/**
 * Donmuş iç içe ayar nesnesini düz `grup.alan` kaydına çevirir — `applySettings` katmanları
 * bu biçimde bekliyor.
 */
function toRecord(eff: Record<string, Record<string, number | boolean> | undefined>) {
  const out: Record<string, number | boolean> = {};
  for (const [group, fields] of Object.entries(eff)) {
    for (const [leaf, v] of Object.entries(fields ?? {})) out[`${group}.${leaf}`] = v;
  }
  return out;
}

/** Admin listesinde "bu cihaz" satırı yoktur — hiçbir oturumla eşleşmeyen bir kimlik. */
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Bakım metni. ⚠️ Metin ZORUNLU DEĞİL: bakımı başlatmak, metin yazmayı hatırlamaya bağlı
 * olmamalı — acil bir durumda önce durdurulur, açıklama sonra eklenir (`PUT notice`).
 */
const pausePatch = z.object({
  notice: z.string().trim().max(500).optional(),
  /** Tahmini bitiş — GERÇEK zaman (bakımda oyun saati donuyor). */
  etaMinutes: z.number().int().min(1).max(24 * 60).optional(),
});

@Controller('api/v1/admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminWorldController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly clock: GameClockService,
    private readonly worldState: WorldStateService,
    private readonly auth: AuthService,
  ) {}

  /* ── Dünyalar ─────────────────────────────────────────────────────────────── */

  @Get('worlds')
  async worlds(): Promise<Record<string, unknown>> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT w.id, w.name, w.state, w.clock_offset_ms, w.paused_at, w.started_at,
             w.maintenance_notice, w.maintenance_eta,
             w.speed_multiplier, w.resource_multiplier, w.training_multiplier,
             w.construction_multiplier,
             (SELECT COUNT(*)::int FROM players p WHERE p.world_id = w.id)  AS players,
             (SELECT COUNT(*)::int FROM cities  c WHERE c.world_id = w.id)  AS cities,
             (SELECT MAX(taken_at) FROM ranking_runs r WHERE r.world_id = w.id) AS last_ranking
        FROM worlds w ORDER BY w.id
    `);
    return {
      worlds: rows.map((r) => {
        const worldId = Number(r['id']);
        const pausedAt = r['paused_at'] == null ? null : toDate(r['paused_at']);
        return {
          id: worldId,
          name: String(r['name']),
          state: String(r['state']),
          paused: pausedAt !== null,
          pausedAt: pausedAt?.toISOString() ?? null,
          // Oyun saati — bakımda DONAR (`gameNow = pausedAt − offset`).
          gameNow: this.clock.gameNowFrom({
            clockOffsetMs: Number(r['clock_offset_ms']), pausedAt,
          }).toISOString(),
          clockOffsetMs: Number(r['clock_offset_ms']),
          notice: r['maintenance_notice'] == null ? null : String(r['maintenance_notice']),
          eta: r['maintenance_eta'] == null ? null : toDate(r['maintenance_eta']).toISOString(),
          startedAt: toDate(r['started_at']).toISOString(),
          multipliers: {
            speedMultiplier: Number(r['speed_multiplier']),
            resourceMultiplier: Number(r['resource_multiplier']),
            trainingMultiplier: Number(r['training_multiplier']),
            constructionMultiplier: Number(r['construction_multiplier']),
          },
          counts: { players: Number(r['players']), cities: Number(r['cities']) },
          lastRankingAt: r['last_ranking'] == null
            ? null : toDate(r['last_ranking']).toISOString(),
          settingsHash: this.settings.hash(worldId),
        };
      }),
      serverNow: new Date().toISOString(),
    };
  }

  /**
   * Hız çarpanlarını değiştirir. **Yıkıcı sayılır** → adım yükseltmesi ister: oyunun temposunu
   * değiştirmek geri alınabilir ama devam eden her geri sayımı etkiler.
   *
   * ⚠️ Süren işler GERİYE DÖNÜK etkilenmez: `queues.finish_at` ve `missions.execute_at` girerken
   * hesaplanıp yazılıyor. Çarpan yalnız BUNDAN SONRAKİ işleri etkiler — kullanıcıya da bunu
   * yazıyoruz ki "hızı artırdım ama kuyruk hızlanmadı" sorusu doğmasın.
   */
  @Put('worlds/:id/multipliers')
  @UseGuards(AdminStepUpGuard)
  async setMultipliers(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = multipliers.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const worldId = Number(id);

    const [before] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT speed_multiplier, resource_multiplier, training_multiplier, construction_multiplier
        FROM worlds WHERE id = ${worldId}
    `);
    if (!before) throw new NotFoundException('Dünya bulunamadı.');

    const d = parsed.data;
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE worlds SET
          speed_multiplier        = COALESCE(${d.speedMultiplier ?? null}, speed_multiplier),
          resource_multiplier     = COALESCE(${d.resourceMultiplier ?? null}, resource_multiplier),
          training_multiplier     = COALESCE(${d.trainingMultiplier ?? null}, training_multiplier),
          construction_multiplier = COALESCE(${d.constructionMultiplier ?? null}, construction_multiplier)
        WHERE id = ${worldId}
      `);
      await tx.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, before, after)
        VALUES (${worldId}, ${req.player!.playerId}, 'admin.world.multipliers', 'world', ${worldId},
                ${JSON.stringify(before)}::jsonb, ${JSON.stringify(d)}::jsonb)
      `);
    });
    return { ok: true };
  }

  /**
   * ⭐ MANUEL SIRALAMA — sıra normalde 00/08/16'da donuyor (§13.17.2); bu uç aradaki bir anda
   * elle bir anlık görüntü aldırır.
   *
   * ⚠️ Anlık görüntüyü BURADA ALMIYORUZ, bir görev satırı yazıyoruz: sıralama zaten bir
   * `ranking_snapshot` görevi olarak modellenmiş ve o yol audit, outbox ve `ranking:updated`
   * olayını birlikte üretiyor. Burada elle `takeSnapshot` çağırsaydık aynı işi ikinci bir
   * kod yolundan yapardık ve ikisi zamanla ayrışırdı.
   */
  /**
   * ⚠️ Adım yükseltmesi 2026-08-03'te EKLENDİ — kardeş yazma uçlarının hepsinde vardı, burada
   * unutulmuştu. Sıralamayı elle koşturmak görünürde zararsız ama tüm oyuncuların sırasını
   * yeniden diziyor ve `prev_rank`i kaydırıyor: bir sonraki düzenli koşumda "değişim" sütunu
   * yanlış görünür. Yani geri alınamayan bir yazma.
   */
  @Post('worlds/:id/ranking-run')
  @UseGuards(AdminStepUpGuard)
  @HttpCode(200)
  async runRanking(
    @Param('id') id: string, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const worldId = Number(id);
    const [w] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT state FROM worlds WHERE id = ${worldId}
    `);
    if (!w) throw new NotFoundException('Dünya bulunamadı.');

    const gameNow = await this.clock.gameNow(worldId);
    /**
     * ⚠️ `scheduleSnapshot` bir sonraki DÜZENLİ saati yazıyor; manuel koşum için `execute_at`
     * "şimdi" olmalı. Tekillik anahtarı düzenli görevle çakışmasın diye ayrı bir anahtar
     * kullanılıyor — aksi hâlde manuel tetik o günün düzenli görevini yutardı.
     */
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      INSERT INTO missions (world_id, type, status, execute_at, idempotency_key, payload)
      VALUES (${worldId}, 'ranking_snapshot', 'scheduled', ${gameNow.toISOString()}::timestamptz,
              ${`ranking-manual-${worldId}-${Date.now()}`},
              ${JSON.stringify({ manual: true, actorId: req.player!.playerId })}::jsonb)
      RETURNING id
    `);
    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after)
      VALUES (${worldId}, ${req.player!.playerId}, 'admin.ranking.manual', 'world', ${worldId},
              ${JSON.stringify({ missionId: Number(row!['id']) })}::jsonb)
    `);
    // Zincirin kopmaması için düzenli görevin de yerinde olduğundan emin ol (tekrar dayanıklı).
    await scheduleSnapshot(this.db, worldId, gameNow);
    return { ok: true, missionId: Number(row!['id']), scheduledAt: gameNow.toISOString() };
  }

  /* ── Bakım modu ───────────────────────────────────────────────────────────── */

  /**
   * ⭐ BAKIMA AL — oyun saatini dondurur, mutasyonları kilitler, perdeyi açar.
   *
   * Üç şey aynı anda olur ve **üçünün de sırası önemli**:
   *   1. `clock.pause()`  → `paused_at` yazılır; oyun saati o anda donar (§2).
   *   2. `worlds.setNotice()` → perde metni + `pg_notify('mw_world')`; API süreçlerinin
   *      bakım önbelleği tazelenir → `MaintenanceInterceptor` yazmaları reddetmeye başlar.
   *   3. `outbox('world:maintenance')` → dispatcher WS'e yayar; istemci perdeyi açar.
   *
   * ⚠️ Perde (3) EN SONA bırakıldı: oyuncuya "bakım başladı" dedikten sonra hâlâ yazabildiği
   * bir aralık kalmasın. Ters sırada, perdeyi görüp de son bir emri geçiren oyuncu olurdu.
   *
   * ⚠️ Zaten bakımdaysa `pause()` hiçbir şey yapmaz (idempotent) ama metin GÜNCELLENİR:
   * "15 dakika daha sürecek" demek için bakımdan çıkıp girmek gerekmemeli.
   */
  @Post('worlds/:id/pause')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async pause(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = pausePatch.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const worldId = Number(id);
    const before = this.worldState.get(worldId);
    if (!before) throw new NotFoundException('Dünya bulunamadı.');

    const clock = await this.clock.pause(worldId);
    const eta = parsed.data.etaMinutes == null
      ? null : new Date(Date.now() + parsed.data.etaMinutes * 60_000);
    await this.worldState.setNotice(worldId, {
      notice: parsed.data.notice?.length ? parsed.data.notice : null,
      eta,
      actorId: req.player!.accountId,
    });
    await this.announce(worldId, req.player!.playerId, 'admin.world.pause', {
      paused: true, notice: parsed.data.notice ?? null, eta: eta?.toISOString() ?? null,
    });

    return {
      ok: true, paused: true,
      pausedAt: clock.pausedAt?.toISOString() ?? null,
      gameNow: clock.gameNow.toISOString(),
      // Zaten bakımdaydıysa panel "yeni başlatmadın, metni güncelledin" diyebilsin.
      alreadyPaused: before.paused,
    };
  }

  /**
   * ⭐ BAKIMDAN ÇIKAR — donmuş süre `clock_offset_ms`e eklenir, oyun **kaldığı yerden** devam
   * eder: bir kuyruğun kalan süresi bakımdan önceki değerin AYNISIDIR (bkz. `maintenance.test.ts`).
   */
  @Post('worlds/:id/resume')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async resume(
    @Param('id') id: string, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const worldId = Number(id);
    if (!this.worldState.get(worldId)) throw new NotFoundException('Dünya bulunamadı.');

    const clock = await this.clock.resume(worldId);
    await this.worldState.clearNotice(worldId);
    await this.announce(worldId, req.player!.playerId, 'admin.world.resume', { paused: false });

    return {
      ok: true, paused: false,
      gameNow: clock.gameNow.toISOString(),
      clockOffsetMs: clock.clockOffsetMs,
    };
  }

  /** Bakım devam ederken metni/tahmini güncelle (perde anında yenilenir). */
  @Put('worlds/:id/notice')
  @UseGuards(AdminStepUpGuard)
  async setNotice(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = pausePatch.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const worldId = Number(id);
    if (!this.worldState.get(worldId)) throw new NotFoundException('Dünya bulunamadı.');

    const eta = parsed.data.etaMinutes == null
      ? null : new Date(Date.now() + parsed.data.etaMinutes * 60_000);
    await this.worldState.setNotice(worldId, {
      notice: parsed.data.notice?.length ? parsed.data.notice : null,
      eta,
      actorId: req.player!.accountId,
    });
    await this.announce(worldId, req.player!.playerId, 'admin.world.notice', {
      notice: parsed.data.notice ?? null, eta: eta?.toISOString() ?? null,
    });
    return { ok: true };
  }

  /**
   * Audit satırı + WS duyurusu, tek yerde.
   *
   * ⚠️ Duyuru **outbox üzerinden** gidiyor, doğrudan `RealtimeBus` üzerinden değil: bus
   * `main.ts`te kuruluyor ve Nest DI'ında yok; ayrıca `ROLE=api`/`ROLE=worker` ayrıldığında
   * doğrudan yayın yapan bir controller yalnız kendi sürecindeki soketlere ulaşırdı. Outbox
   * satırı dispatcher tarafından (500 ms poll) alınıp `mw_realtime`e basılıyor — oyunun geri
   * kalanıyla **aynı** yol.
   */
  private async announce(
    worldId: number, playerId: number, action: string, payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${worldId}, 'world:maintenance', ${JSON.stringify({ worldId, ...payload })}::jsonb)
      `);
      await tx.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after)
        VALUES (${worldId}, ${playerId}, ${action}, 'world', ${worldId},
                ${JSON.stringify(payload)}::jsonb)
      `);
    });
  }

  /* ── Oturumlar (§admin Faz 3) ─────────────────────────────────────────────── */

  /**
   * Bir oyuncunun aktif cihazları. Destek sorusu neredeyse her zaman şu: *"hesabıma girilmiş
   * olabilir mi?"* — cevabı bu liste veriyor.
   *
   * ⚠️ Oyuncunun kendi ucundan (`/auth/sessions`) FARKLI bir sorgu değil, **aynı servis
   * metodu**: iki ayrı sorgu yazsaydık admin ile oyuncu farklı listeler görebilirdi ve
   * hangisinin doğru olduğu tartışılırdı. `currentSessionId` yerine boş bir UUID geçiliyor —
   * admin için "bu cihaz" diye bir satır yok.
   */
  /**
   * Oyuncu arama — kullanıcı adı ya da e-posta parçası.
   *
   * ⚠️ Kapsamı DAR tutuldu (yalnız kimlik + ad): tam oyuncu künyesi Faz 6'nın işi. Buradaki
   * tek amacı oturum listesine bir oyuncu seçebilmek; şimdiden zengin bir arama yazmak, Faz 6'da
   * ikinci bir arama kodu doğurur ve ikisi ayrışırdı.
   */
  @Get('players/lookup')
  async lookup(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const raw = String((req as unknown as { query?: Record<string, unknown> }).query?.['q'] ?? '');
    const q = raw.trim().slice(0, 60);
    if (q.length < 2) return { items: [] };
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT p.id, p.username, p.world_id, a.email, a.role, p.last_seen_at
        FROM players p JOIN accounts a ON a.id = p.account_id
       WHERE p.username ILIKE ${'%' + q + '%'} OR a.email ILIKE ${'%' + q + '%'}
       ORDER BY p.last_seen_at DESC NULLS LAST LIMIT 20
    `);
    return {
      items: rows.map((r) => ({
        id: Number(r['id']),
        username: String(r['username']),
        worldId: Number(r['world_id']),
        email: String(r['email']),
        role: String(r['role']),
        lastSeenAt: r['last_seen_at'] == null ? null : toDate(r['last_seen_at']).toISOString(),
      })),
    };
  }

  @Get('players/:playerId/sessions')
  async playerSessions(@Param('playerId') playerId: string): Promise<Record<string, unknown>> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT p.account_id, p.username, a.email, a.role
        FROM players p JOIN accounts a ON a.id = p.account_id WHERE p.id = ${Number(playerId)}
    `);
    if (!row) throw new NotFoundException('Oyuncu bulunamadı.');
    const accountId = Number(row['account_id']);
    return {
      playerId: Number(playerId),
      username: String(row['username']),
      email: String(row['email']),
      role: String(row['role']),
      items: await this.auth.listSessions(accountId, EMPTY_UUID),
    };
  }

  /** Tüm oturumları düşür. Açık soketler de anında kapanır. */
  @Post('players/:playerId/revoke-sessions')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async revokePlayerSessions(
    @Param('playerId') playerId: string, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT account_id, world_id FROM players WHERE id = ${Number(playerId)}
    `);
    if (!row) throw new NotFoundException('Oyuncu bulunamadı.');

    const ids = await this.auth.revokeAllIds(Number(row['account_id']));
    const sockets = getGateway()?.revokeSessions(ids) ?? 0;
    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after)
      VALUES (${Number(row['world_id'])}, ${req.player!.playerId}, 'admin.sessions.revoke',
              'player', ${Number(playerId)}, ${JSON.stringify({ revoked: ids.length, sockets })}::jsonb)
    `);
    return { ok: true, revoked: ids.length, sockets };
  }

  /* ── Ayarlar ──────────────────────────────────────────────────────────────── */

  /** Şema + o dünyanın etkin değerleri. Panel formu tamamen bundan üretilir. */
  @Get('settings/:worldId')
  settingsOf(@Param('worldId') worldId: string): Record<string, unknown> {
    const id = Number(worldId);
    const snap = this.settings.snapshot(id);
    return {
      worldId: id,
      groups: SETTING_GROUPS,
      defs: SETTINGS,
      values: Object.fromEntries(SETTINGS.map((d) => {
        const [group, leaf] = d.key.split('.') as [string, string];
        return [d.key, snap.effective[group]?.[leaf] ?? d.default];
      })),
      overridden: snap.overridden,
      hash: snap.hash,
    };
  }

  @Put('settings/:worldId')
  @UseGuards(AdminStepUpGuard)
  async saveSettings(
    @Param('worldId') worldId: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = settingsPatch.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz istek.');
    const id = Number(worldId);
    try {
      const res = await this.settings.update({
        worldId: id, patch: parsed.data.values, actorId: req.player!.accountId,
      });
      await this.db.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after)
        VALUES (${id}, ${req.player!.playerId}, 'admin.settings.update', 'settings', ${id},
                ${JSON.stringify(res)}::jsonb)
      `);
      return res;
    } catch (err) {
      // Alan hataları AYNEN istemciye: panel hangi alanın niye reddedildiğini gösterebilsin.
      if (err instanceof SettingsError) throw new BadRequestException({ issues: err.issues });
      throw err;
    }
  }

  @Post('settings/:worldId/reset')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async resetSettings(
    @Param('worldId') worldId: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = resetPatch.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz istek.');
    const id = Number(worldId);
    await this.settings.reset(id, parsed.data.keys);
    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after)
      VALUES (${id}, ${req.player!.playerId}, 'admin.settings.reset', 'settings', ${id},
              ${JSON.stringify({ keys: parsed.data.keys })}::jsonb)
    `);
    return { ok: true, hash: this.settings.hash(id) };
  }

  /**
   * ⭐ ÖNİZLEME (Faz 4) — kaydetmeden önce "bu sabit ne yapar?" sorusunun cevabı.
   *
   * Aynı savaşı **aynı seed'le** iki kez çözer: mevcut ayarlarla ve önerilen yamayla. Seed
   * aynı olduğu için aradaki tüm fark sabitlerden gelir; rastgelelik iki tarafta da birebir
   * aynı diziyi üretir. Bu olmadan bir denge değişikliğini ölçmenin tek yolu kaydedip canlı
   * savaşları izlemekti — yani geri alınması zor bir deneme.
   *
   * ⚠️ Yama BURADA KAYDEDİLMEZ. `AdminStepUpGuard` de yok: bu uç hiçbir şey değiştirmiyor,
   * yalnız hesap yapıyor. Yıkıcı kapı kaydetmede (`PUT settings/:worldId`).
   */
  @Post('settings/:worldId/preview')
  @HttpCode(200)
  preview(
    @Param('worldId') worldId: string, @Body() body: unknown,
  ): Record<string, unknown> {
    const parsed = previewBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const id = Number(worldId);

    // Yamanın kendisi de doğrulanır: geçersiz bir değerle önizleme yapmak yanılgı üretirdi.
    const { values, issues } = validatePatch(parsed.data.values);
    if (issues.length > 0) throw new BadRequestException({ issues });

    const snap = this.settings.snapshot(id);
    const current = combatOverrides(snap.effective, snap.overridden);

    /**
     * Önerilen durum = mevcut satırların üstüne yama. `applySettings` yeniden çalıştırılıyor
     * ki `overridden` listesi de yamayı içersin — yoksa yeni dokunulan alan override
     * sayılmaz ve önizleme değişikliği görmezdi.
     */
    const merged = { ...toRecord(snap.effective), ...values };
    const next = applySettings([merged], process.env);
    const proposed = combatOverrides(next.effective, next.overridden);

    const seed = parsed.data.seed ?? 'preview';
    const input = toSimulateInput(parsed.data.battle, seed);
    return {
      seed,
      current: simulate(input, current),
      proposed: simulate(input, proposed),
      changed: next.overridden.filter((k) => !snap.overridden.includes(k)),
      hash: { current: snap.hash, proposed: next.hash },
    };
  }

  /**
   * ⭐ KATALOG ÖNİZLEMESİ (2. nesil Tur 5) — savaş önizlemesinin kardeşi.
   *
   * Yapı/teknik fiyatlarını tek tek düzenlerken asıl soru *"seviye 15'te ne kadar tutacak"*.
   * Bu uç aynı kalemin seviye seviye **mevcut ve taslak** fiyat/süresini yan yana veriyor.
   *
   * ⚠️ **İstemcide hesaplamak reddedildi.** Panelin `applySettings` + `catalogOverrides` +
   * `mergeCatalogConfig` zincirini kendi kurması gerekirdi; `catalogOverrides` API paketinde
   * (`settings/catalog.ts`) yaşıyor ve panelden import edilemiyor — kopyalanması gerekirdi.
   * Kopya bir gün ayrışır ve panel oyunun ödetmediği bir fiyat gösterir. Burada, oyunun
   * fiyat hesabında kullandığı **tam** yol koşuyor.
   *
   * ⚠️ Kaydetmiyor, `AdminStepUpGuard` yok — savaş önizlemesiyle aynı gerekçe.
   */
  @Post('settings/:worldId/catalog-preview')
  @HttpCode(200)
  catalogPreview(
    @Param('worldId') worldId: string, @Body() body: unknown,
  ): Record<string, unknown> {
    const parsed = catalogPreviewBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const id = Number(worldId);

    const { values, issues } = validatePatch(parsed.data.values);
    if (issues.length > 0) throw new BadRequestException({ issues });

    const snap = this.settings.snapshot(id);
    const current = mergeCatalogConfig(catalogOverrides(snap.effective, snap.overridden));
    const merged = { ...toRecord(snap.effective), ...values };
    const next = applySettings([merged], process.env);
    const proposed = mergeCatalogConfig(catalogOverrides(next.effective, next.overridden));

    const isTech = parsed.data.kind === 'tech';
    const at = (cfg: typeof current, level: number): Record<string, number> => {
      const cost = isTech
        ? techCost(parsed.data.id, level, cfg)
        : buildingCost(parsed.data.id, level, cfg);
      const seconds = isTech
        ? techTimeSeconds(parsed.data.id, level, 0, cfg)
        : buildingTimeSeconds(parsed.data.id, level, 0, cfg);
      return { gold: cost.gold, food: cost.food, seconds: Math.round(seconds) };
    };

    /** ⚠️ Süreler hızlandırıcı yapı **0** kabul edilerek: karşılaştırma tabanı sabit olsun. */
    const levels = parsed.data.levels.map((level) => ({
      level, current: at(current, level), proposed: at(proposed, level),
    }));

    return {
      kind: parsed.data.kind,
      id: parsed.data.id,
      levels,
      changed: next.overridden.filter((k) => !snap.overridden.includes(k)),
      hash: { current: snap.hash, proposed: next.hash },
    };
  }

  /** Değişiklik geçmişi — "bu değeri kim ne zaman değiştirdi". */
  @Get('settings/:worldId/revisions')
  async revisions(@Param('worldId') worldId: string): Promise<Record<string, unknown>> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT r.id, r.hash, r.changed, r.created_at, a.email AS actor
        FROM settings_revisions r
        LEFT JOIN accounts a ON a.id = r.actor_id
       WHERE r.world_id = ${Number(worldId)}
       ORDER BY r.id DESC LIMIT 50
    `);
    return {
      items: rows.map((r) => ({
        id: Number(r['id']),
        hash: String(r['hash']),
        changed: r['changed'] ?? [],
        actor: r['actor'] == null ? null : String(r['actor']),
        createdAt: toDate(r['created_at']).toISOString(),
      })),
    };
  }
}
