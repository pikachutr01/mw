/**
 * ⭐ ÇOKLU HESAP — YÖNETİM UÇLARI (§9.1, Tur 7).
 *
 * ⚠️ **Burada ceza yok.** Bu denetleyici üç şey yapıyor: şüpheli çiftleri listelemek, bir çiftin
 * kanıtını açmak, ve yöneticinin verdiği KARARI kaydetmek. Ceza vermek `AdminModerationController`
 * üzerinden, ayrı bir işlem ve ayrı bir `audit_log` satırı olarak yapılıyor — ikisini burada
 * birleştirseydik "listeye baktım" ile "ban verdim" aynı kayda düşer ve geçmişte hangisinin
 * olduğu ayırt edilemezdi (aynı gerekçe şikayet kuyruğunda da yazılı).
 *
 * ⚠️ Skorlar **canlı hesaplanıyor**, tablodan okunmuyor. Sebep: ağırlıklar panelden
 * ayarlanabiliyor ve yönetici bir ağırlığı değiştirdiğinde etkisini ANINDA görmeli. Kalıcı
 * `abuse_signals` satırları haftalık tarama görevinin işi (Tur 8) ve onların tek amacı
 * "bu çifte daha önce bakıldı mı" sorusunu cevaplamak.
 */
import {
  BadRequestException, Body, Controller, Get, HttpCode, Inject, NotFoundException, Param,
  Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AsnService } from '../abuse/asn.service.ts';
import { BEHAVIOUR_INNOCENT, BEHAVIOUR_LABEL } from '../abuse/behaviour.service.ts';
import { AbuseScanService } from '../abuse/scan.service.ts';
import {
  INNOCENT_EXPLANATION, LinkService, SIGNAL_LABEL, abuseConfig,
} from '../abuse/link.service.ts';
import { AuthGuard } from '../auth/auth.guard.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';

/**
 * ⚠️ `resolution` sözlüğü şemadaki değerlerle BİREBİR (`abuse_signals.resolution`). Kendi
 * kelimemi uydursaydım tabloya şemanın tanımadığı bir durum yazılırdı.
 *
 * ⭐ `watch` ayrı bir seçenek: "masum" ile "cezalı" arasındaki gerçek karar çoğu zaman
 * *"şüpheliyim ama kanıt yetmiyor"*. O çifti listeden düşürmeden not bırakabilmek gerekiyor.
 */
const resolveBody = z.object({
  resolution: z.enum(['innocent', 'watch', 'warned', 'banned']),
  note: z.string().trim().max(1000).optional(),
});

const pairBody = z.object({
  worldId: z.number().int().min(0).max(32_000),
  a: z.number().int().positive(),
  b: z.number().int().positive(),
  resolution: z.enum(['innocent', 'watch', 'warned', 'banned']),
  note: z.string().trim().max(1000).optional(),
});

@Controller('api/v1/admin/abuse')
@UseGuards(AuthGuard, AdminGuard)
export class AdminAbuseController {
  private readonly analyzer: LinkService;
  private readonly asn: AsnService;

  constructor(@Inject(DB) private readonly db: Db) {
    this.analyzer = new LinkService(db);
    this.asn = new AsnService(db);
  }

  /* ── Davranış taraması ────────────────────────────────────────────────────── */

  /**
   * ⭐ TARAMAYI ŞİMDİ ÇALIŞTIR. Normalde haftalık `abuse_scan` görevi koşuyor; bu uç aynı
   * kodu elle tetikliyor.
   *
   * ⚠️ Elle koşu da **artımlı pencereyi ilerletiyor** — ayrı bir "önizleme" kipi bilerek yok.
   * Önizleme olsaydı elle bakılan aralık haftalık koşuda bir kez daha taranır, aynı çift iki
   * kez rapora girerdi. Tek bir pencere zinciri var ve herkes onu kullanıyor.
   */
  @Post('scan')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async scan(
    @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const w = Number((body as { worldId?: unknown })?.worldId ?? 1);
    if (!Number.isInteger(w) || w < 0) throw new BadRequestException('Geçersiz dünya.');
    const svc = new AbuseScanService(this.db);
    const result = await svc.run(w);
    const emailed = await svc.report(w, result);
    await this.audit(w, req.player!.playerId, req.player!.playerId, {
      action: 'abuse.scan.manual',
      windowFrom: result.from.toISOString(), windowTo: result.to.toISOString(),
      signals: result.signals, reported: result.reported, emailed,
    });
    return {
      ok: true, emailed,
      windowFrom: result.from.toISOString(), windowTo: result.to.toISOString(),
      signals: result.signals, pairs: result.pairs, reported: result.reported,
    };
  }

  /* ── ASN veri kümesi ──────────────────────────────────────────────────────── */

  /**
   * ⭐ IP → ASN/ÜLKE ARALIK TABLOSUNU TAZELE (iptoasn.com, Public Domain).
   *
   * ⚠️ **Otomatik değil, elle tetikleniyor.** Açılışta ya da zamanlanmış olarak indirseydik
   * sunucu her yeniden başlatmada dış bir servise bağımlı olurdu; o servis yavaşlarsa ya da
   * kaybolursa API'nin kalkışı bunu bekliyor olurdu. Aralık verisi günlerce bayat kalsa bile
   * hiçbir oyun mekaniği bozulmaz — yalnız künye eskir.
   *
   * ⚠️ Yükleme sırasında giriş akışı BLOKLANMIYOR: tazeleme `DELETE`+`INSERT` ile tek
   * transaction'da yapılıyor, `TRUNCATE` ile değil (gerekçesi `asn.service.ts`te).
   */
  @Post('asn/refresh')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async refreshAsn(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const rows = await this.asn.refresh();
    const filled = await this.asn.backfill();
    await this.audit(0, req.player!.playerId, req.player!.playerId, {
      action: 'asn.refresh', rows, backfill: filled,
    });
    return { ok: true, rows, backfill: filled, status: await this.asn.status() };
  }

  /**
   * Şüpheli çiftler + ayarların etkin görüntüsü + IP zinciri teşhisi.
   *
   * ⚠️ Üçü TEK uçta çünkü ekran üçünü birden gösteriyor ve ayarlar olmadan skorlar okunamaz
   * ("40 puan çok mu?" sorusunun cevabı eşiğin kaç olduğuna bağlı).
   */
  @Get('links')
  async list(
    @Query('worldId') worldId?: string,
    @Query('minScore') minScore?: string,
  ): Promise<Record<string, unknown>> {
    const w = Number(worldId ?? 1);
    if (!Number.isInteger(w) || w < 0) throw new BadRequestException('Geçersiz dünya.');
    const min = minScore == null || minScore === '' ? undefined : Number(minScore);
    if (min != null && !Number.isFinite(min)) throw new BadRequestException('Geçersiz eşik.');

    const cfg = abuseConfig();
    /**
     * ⭐ İKİ KAYNAK TEK LİSTEDE: teknik sinyaller **canlı** hesaplanıyor (ucuz, ağırlık
     * değişince etkisi anında görünmeli), davranış sinyalleri ise son `abuse_scan`ın
     * yazdığı satırlardan geliyor (pahalı, her panel açılışında koşturulamaz).
     */
    const scanner = new AbuseScanService(this.db);
    const pairs = await this.analyzer.pairs(w, {
      ...(min == null ? {} : { minScore: min }),
      extra: await scanner.openBehaviourSignals(w),
    });
    const resolved = await this.resolutionsFor(pairs.map((p) => [p.a.id, p.b.id]));

    return {
      config: {
        reportThreshold: cfg.reportThreshold,
        weights: cfg.weights,
        maxGroupSize: cfg.maxGroupSize,
        lookbackDays: cfg.lookbackDays,
        cohortMinutes: cfg.cohortMinutes,
        handoffMinutes: cfg.handoffMinutes,
      },
      /**
       * Sinyal sözlüğü sunucudan: etiket ve masum açıklama TEK yerde yaşasın.
       * ⚠️ İki aile birleşiyor — teknik (`link.service`) ve davranış (`behaviour.service`).
       */
      signalInfo: {
        ...Object.fromEntries(
          (Object.keys(SIGNAL_LABEL) as (keyof typeof SIGNAL_LABEL)[])
            .map((k) => [k, { label: SIGNAL_LABEL[k], innocent: INNOCENT_EXPLANATION[k] }]),
        ),
        ...Object.fromEntries(
          (Object.keys(BEHAVIOUR_LABEL) as (keyof typeof BEHAVIOUR_LABEL)[])
            .map((k) => [k, { label: BEHAVIOUR_LABEL[k], innocent: BEHAVIOUR_INNOCENT[k] }]),
        ),
      },
      ipChain: await this.analyzer.ipChainHealth(w),
      /** ⭐ Künye kaynağının tazeliği — boş sonuçların sebebi bayat/yüklenmemiş tablo olabilir. */
      asn: await this.asn.status(),
      /**
       * ⭐ Son davranış taraması. Boş liste iki farklı şey olabilir — "temiz dünya" ya da
       * "hiç taranmadı"; ekranın ikisini ayırt edememesi en kötü sonuç olurdu.
       */
      scan: await this.lastScan(w),
      items: pairs.map((p) => ({
        worldId: p.worldId,
        a: p.a, b: p.b, score: p.score,
        signals: p.signals.map((s) => ({ kind: s.kind, score: s.score, evidence: s.evidence })),
        /** Daha önce karara bağlanmışsa kararı taşı — aynı çifte iki kez bakılmasın. */
        resolved: resolved.get(`${p.a.id}:${p.b.id}`) ?? null,
      })),
    };
  }

  /**
   * ⭐ KARARI KAYDET. Satır yoksa açılır: skorlar canlı hesaplandığı için karar anına kadar
   * `abuse_signals`ta hiçbir şey olmayabilir.
   *
   * ⚠️ `kind = 'pair'` — satır TEK BİR SİNYALİ değil ÇİFTİ temsil ediyor. Yönetici "bu iki
   * hesap" hakkında karar veriyor, "bunların aynı IP'yi paylaşması" hakkında değil; sinyal
   * başına karar isteseydik aynı çift için çelişen kararlar mümkün olurdu.
   */
  @Post('pairs/resolve')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async resolvePair(
    @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = pairBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    // Çift daima küçük id önce (şema yorumundaki sıralama kuralı) — yoksa aynı ilişki iki satır olur.
    const a = Math.min(parsed.data.a, parsed.data.b);
    const b = Math.max(parsed.data.a, parsed.data.b);
    if (a === b) throw new BadRequestException('Bir oyuncu kendisiyle eşleştirilemez.');

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, username, world_id FROM players WHERE id IN (${a}, ${b})
    `);
    if (rows.length !== 2) throw new NotFoundException('Oyuncu bulunamadı.');

    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      INSERT INTO abuse_signals (world_id, kind, subject_player_id, related_player_id,
                                 score, evidence, resolved_at, resolution, resolved_by, note)
      VALUES (${parsed.data.worldId}, 'pair', ${a}, ${b}, 0, '{}'::jsonb,
              now(), ${parsed.data.resolution}, ${req.player!.playerId},
              ${parsed.data.note ?? null})
      RETURNING id
    `);

    await this.audit(parsed.data.worldId, req.player!.playerId, a, {
      pair: [a, b], resolution: parsed.data.resolution, note: parsed.data.note ?? null,
      signalId: Number(row!['id']),
    });
    return { ok: true, signalId: Number(row!['id']) };
  }

  /**
   * Kalıcı satırın kararını güncelle (tarama görevinin açtığı satırlar için — Tur 8).
   * ⚠️ Bugün panelde çağıranı yok; uç `abuse_signals`ın karar alanlarını tek yerden yazsın diye
   * burada duruyor.
   */
  @Post('signals/:id/resolve')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async resolveSignal(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = resolveBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE abuse_signals
         SET resolved_at = now(), resolution = ${parsed.data.resolution},
             resolved_by = ${req.player!.playerId}, note = ${parsed.data.note ?? null}
       WHERE id = ${Number(id)}
      RETURNING world_id, subject_player_id, related_player_id
    `);
    if (rows.length === 0) throw new NotFoundException('Sinyal bulunamadı.');

    await this.audit(
      Number(rows[0]!['world_id'] ?? 0), req.player!.playerId,
      Number(rows[0]!['subject_player_id'] ?? 0),
      {
        signalId: Number(id), resolution: parsed.data.resolution,
        note: parsed.data.note ?? null,
        related: rows[0]!['related_player_id'] == null
          ? null : Number(rows[0]!['related_player_id']),
      },
    );
    return { ok: true };
  }

  /* ── Yardımcılar ──────────────────────────────────────────────────────────── */

  /** Son TAMAMLANMIŞ tarama; hiç yoksa `null`. Yarım kalan koşular sayılmıyor. */
  private async lastScan(worldId: number): Promise<Record<string, unknown> | null> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT window_from, window_to, finished_at, signals_found, players_flagged, emailed_at
        FROM abuse_scan_runs
       WHERE world_id = ${worldId} AND finished_at IS NOT NULL
       ORDER BY window_to DESC LIMIT 1
    `);
    if (!row) return null;
    return {
      windowFrom: toDate(row['window_from']).toISOString(),
      windowTo: toDate(row['window_to']).toISOString(),
      finishedAt: toDate(row['finished_at']).toISOString(),
      signals: Number(row['signals_found']),
      players: Number(row['players_flagged']),
      emailed: row['emailed_at'] != null,
    };
  }

  /** Çift başına EN SON karar. Bir çifte defalarca bakılabilir; ekranda geçerli olan sonuncusu. */
  private async resolutionsFor(pairs: [number, number][]): Promise<
    Map<string, { resolution: string; note: string | null; at: string; by: string | null }>
  > {
    const out = new Map<string, {
      resolution: string; note: string | null; at: string; by: string | null;
    }>();
    if (pairs.length === 0) return out;
    const ids = [...new Set(pairs.flat())];
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT DISTINCT ON (s.subject_player_id, s.related_player_id)
             s.subject_player_id AS a, s.related_player_id AS b,
             s.resolution, s.note, s.resolved_at, p.username AS by_username
        FROM abuse_signals s
        LEFT JOIN players p ON p.id = s.resolved_by
       WHERE s.resolved_at IS NOT NULL
         AND s.subject_player_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
         AND s.related_player_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
       ORDER BY s.subject_player_id, s.related_player_id, s.resolved_at DESC
    `);
    for (const r of rows) {
      out.set(`${Number(r['a'])}:${Number(r['b'])}`, {
        resolution: String(r['resolution']),
        note: r['note'] == null ? null : String(r['note']),
        at: toDate(r['resolved_at']).toISOString(),
        by: r['by_username'] == null ? null : String(r['by_username']),
      });
    }
    return out;
  }

  private async audit(
    worldId: number, actorPlayerId: number, targetId: number, payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after)
      VALUES (${worldId}, ${actorPlayerId}, 'admin.abuse.resolve', 'player', ${targetId},
              ${JSON.stringify(payload)}::jsonb)
    `);
  }
}
