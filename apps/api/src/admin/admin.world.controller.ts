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
import { SETTINGS, SETTING_GROUPS } from '@mobiwar/settings';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { scheduleSnapshot } from '../ranking/ranking.service.ts';
import { SettingsError, SettingsService } from '../settings/settings.service.ts';
import { GameClockService } from '../world/game-clock.service.ts';
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
const resetPatch = z.object({ keys: z.array(z.string()).min(1).max(200) });

@Controller('api/v1/admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminWorldController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly clock: GameClockService,
  ) {}

  /* ── Dünyalar ─────────────────────────────────────────────────────────────── */

  @Get('worlds')
  async worlds(): Promise<Record<string, unknown>> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT w.id, w.name, w.state, w.clock_offset_ms, w.paused_at, w.started_at,
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
  @Post('worlds/:id/ranking-run')
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
