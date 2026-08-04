/**
 * ⭐ ÇOKLU HESAP TARAMASI (§9.1.3) — davranış sinyallerini bulup `abuse_signals`a yazar.
 *
 * ─ NEDEN GÖREV, NEDEN CANLI HESAP DEĞİL ───────────────────────────────────────────────────
 * Teknik sinyaller (cihaz/IP) panel açıldığında **canlı** hesaplanıyor: ucuzlar ve ağırlık
 * değiştirince etkisi anında görünmeli. Davranış sinyalleri öyle değil — `missions` ve
 * `battles` üzerinde toplama yapıyorlar ve dünya büyüdükçe pahalılaşıyorlar. Panelin her
 * açılışında koşturmak, moderasyon ekranını dünyanın en yavaş sayfası yapardı.
 *
 * ─ ARTIMLI PENCERE ────────────────────────────────────────────────────────────────────────
 * `window_from` = son BAŞARILI taramanın `window_to`'su. Böylece "son kontrolden sonraki
 * işlemler" **tam olarak bir kez** inceleniyor.
 *
 * ⚠️ Pencere `now()`den geriye sabit bir aralık DEĞİL. Öyle olsaydı worker bir gün kapalı
 * kaldığında o günün verisi hiç taranmadan geçerdi — ve bu sessiz bir kayıp olurdu, çünkü
 * eksik bir tarama "temiz" ile aynı görünür.
 */
import { sql } from 'drizzle-orm';
import { toDate, type Db } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';
import { liveNumber } from '../settings/live.ts';
import {
  BEHAVIOUR_INNOCENT, BEHAVIOUR_LABEL, BehaviourService, type BehaviourSignal,
} from './behaviour.service.ts';
import { abuseConfig } from './link.service.ts';

type Runner = Db | Tx;

export interface ScanResult {
  from: Date;
  to: Date;
  signals: number;
  pairs: number;
  reported: number;
}

/** İlk taramada geriye ne kadar bakılacağı — sonraki koşularda pencere kendiliğinden ilerler. */
const FIRST_RUN_DAYS = 30;

export class AbuseScanService {
  constructor(private readonly db: Runner) {}

  /**
   * Bir dünyayı tarar. `to` verilmezse oyun saati değil **gerçek saat** kullanılır:
   * pencere bir depolama/denetim kavramı, oyun mekaniği değil (aynı gerekçe `ops-jobs.ts`te).
   */
  async run(worldId: number, to: Date = new Date()): Promise<ScanResult> {
    const from = await this.windowStart(worldId, to);
    const behaviour = new BehaviourService(this.db);
    const signals = await behaviour.scan(worldId, from, to);

    const [run] = await this.db.execute<Record<string, unknown>>(sql`
      INSERT INTO abuse_scan_runs (world_id, window_from, window_to)
      VALUES (${worldId}, ${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz)
      RETURNING id
    `);

    const pairs = new Set(signals.map((s) => `${s.a}:${s.b}`));
    for (const s of signals) await this.persist(worldId, s, from, to);

    // Eşiği geçen çiftler — rapora girecek olanlar.
    const reported = await this.reportablePairs(worldId, from, to);

    await this.db.execute(sql`
      UPDATE abuse_scan_runs
         SET finished_at = now(), signals_found = ${signals.length},
             players_flagged = ${new Set(signals.flatMap((s) => [s.a, s.b])).size}
       WHERE id = ${Number(run!['id'])}
    `);

    return { from, to, signals: signals.length, pairs: pairs.size, reported: reported.length };
  }

  /**
   * ⚠️ Satır **karara bağlanmamışsa** güncellenir, yeni satır açılmaz. Aksi hâlde aynı çift
   * her haftalık koşuda listeye bir kez daha girer ve panel aynı ilişkiyi onlarca kez
   * gösterirdi. Karara bağlanmış bir satıra ise DOKUNULMUYOR: yöneticinin "masum" kararı,
   * bir sonraki taramanın onu yeniden açmasıyla kaybolmamalı.
   */
  private async persist(
    worldId: number, s: BehaviourSignal, from: Date, to: Date,
  ): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO abuse_signals (world_id, kind, subject_player_id, related_player_id,
                                 score, evidence, window_from, window_to)
      VALUES (${worldId}, ${s.kind}, ${s.a}, ${s.b}, ${s.score},
              ${JSON.stringify(s.evidence)}::jsonb,
              ${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz)
      ON CONFLICT (kind, subject_player_id, related_player_id)
        WHERE resolved_at IS NULL AND subject_player_id IS NOT NULL AND related_player_id IS NOT NULL
      DO UPDATE SET score = EXCLUDED.score, evidence = EXCLUDED.evidence,
                    window_from = LEAST(abuse_signals.window_from, EXCLUDED.window_from),
                    window_to = EXCLUDED.window_to
    `);
  }

  /**
   * Panelin okuduğu hâl: karara bağlanmamış davranış sinyalleri, çift anahtarına göre.
   *
   * ⚠️ `kind = 'pair'` satırları HARİÇ — onlar sinyal değil, yöneticinin verdiği KARARLAR
   * (`admin.abuse.controller`). Listeye karıştırsaydık bir çiftin kararı, o çiftin kanıtı gibi
   * görünür ve skoruna eklenirdi.
   */
  async openBehaviourSignals(worldId: number): Promise<Map<string, {
    kind: string; score: number; evidence: Record<string, unknown>;
  }[]>> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT subject_player_id AS a, related_player_id AS b, kind, score, evidence
        FROM abuse_signals
       WHERE world_id = ${worldId} AND resolved_at IS NULL AND kind <> 'pair'
         AND subject_player_id IS NOT NULL AND related_player_id IS NOT NULL
    `);
    const out = new Map<string, { kind: string; score: number; evidence: Record<string, unknown> }[]>();
    for (const r of rows) {
      const key = `${Number(r['a'])}:${Number(r['b'])}`;
      const item = {
        kind: String(r['kind']),
        score: Number(r['score']),
        evidence: (r['evidence'] ?? {}) as Record<string, unknown>,
      };
      const list = out.get(key);
      if (list) list.push(item); else out.set(key, [item]);
    }
    return out;
  }

  /** Açık davranış sinyallerinin çift başına toplamı — eşiği geçenler. */
  async reportablePairs(worldId: number, from?: Date, to?: Date): Promise<{
    a: number; b: number; aName: string; bName: string;
    score: number; kinds: string[];
  }[]> {
    const threshold = abuseConfig().reportThreshold;
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT s.subject_player_id AS a, s.related_player_id AS b,
             SUM(s.score)::int AS score,
             ARRAY_AGG(s.kind ORDER BY s.kind) AS kinds,
             MAX(pa.username) AS a_name, MAX(pb.username) AS b_name
        FROM abuse_signals s
        LEFT JOIN players pa ON pa.id = s.subject_player_id
        LEFT JOIN players pb ON pb.id = s.related_player_id
       WHERE s.world_id = ${worldId}
         AND s.resolved_at IS NULL
         AND s.kind <> 'pair'
         AND s.subject_player_id IS NOT NULL AND s.related_player_id IS NOT NULL
         ${from ? sql`AND s.window_to >= ${from.toISOString()}::timestamptz` : sql``}
         ${to ? sql`AND s.window_from <= ${to.toISOString()}::timestamptz` : sql``}
       GROUP BY s.subject_player_id, s.related_player_id
      HAVING SUM(s.score) >= ${threshold}
       ORDER BY SUM(s.score) DESC
       LIMIT 100
    `);
    return rows.map((r: Record<string, unknown>) => ({
      a: Number(r['a']), b: Number(r['b']),
      aName: r['a_name'] == null ? `#${Number(r['a'])}` : String(r['a_name']),
      bName: r['b_name'] == null ? `#${Number(r['b'])}` : String(r['b_name']),
      score: Number(r['score']),
      kinds: (r['kinds'] as string[] | null) ?? [],
    }));
  }

  /**
   * ⭐ RAPOR — `outbox` konusu `admin:abuse_report` (§9.1.4).
   *
   * ⚠️ Eşiği geçen çift yoksa **posta gönderilmiyor**. Haftalık "hiçbir şey bulunamadı"
   * e-postası, üçüncü haftadan sonra okunmayan bir bildirime dönüşür ve gerçek raporun da
   * okunmamasına yol açar.
   *
   * ⚠️ Rapora **masum açıklamalar da giriyor**. Rapor bir suçlama listesi değil; onu okuyan
   * kişi çoğu zaman panelin başında olmayacak ve tek gördüğü şey bu metin olacak.
   */
  async report(worldId: number, result: ScanResult): Promise<boolean> {
    const pairs = await this.reportablePairs(worldId, result.from, result.to);
    if (pairs.length === 0) return false;

    const kinds = [...new Set(pairs.flatMap((p) => p.kinds))];
    await this.db.execute(sql`
      INSERT INTO outbox (topic, payload)
      VALUES ('admin:abuse_report', ${JSON.stringify({
    worldId,
    windowFrom: result.from.toISOString(),
    windowTo: result.to.toISOString(),
    threshold: abuseConfig().reportThreshold,
    pairs: pairs.map((p) => ({
      a: p.aName, b: p.bName, score: p.score,
      signals: p.kinds.map((k) => BEHAVIOUR_LABEL[k as keyof typeof BEHAVIOUR_LABEL] ?? k),
    })),
    /** ⚠️ §9.1.4 şartı: her sinyalin masum açıklaması raporun İÇİNDE. */
    innocentNotes: Object.fromEntries(kinds.map((k) => [
      BEHAVIOUR_LABEL[k as keyof typeof BEHAVIOUR_LABEL] ?? k,
      BEHAVIOUR_INNOCENT[k as keyof typeof BEHAVIOUR_INNOCENT] ?? '',
    ])),
    reminder: 'Bu bir suçlama listesi değildir. Sistem otomatik ceza vermez; '
          + 'karar vermeden önce her çiftin kanıtına ve masum açıklamasına bak.',
  })}::jsonb)
    `);
    await this.db.execute(sql`
      UPDATE abuse_scan_runs SET emailed_at = now()
       WHERE world_id = ${worldId} AND window_to = ${result.to.toISOString()}::timestamptz
    `);
    return true;
  }

  /** Son başarılı taramanın bitişi; hiç tarama yoksa sabit bir geriye bakış. */
  private async windowStart(worldId: number, to: Date): Promise<Date> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT MAX(window_to) AS at FROM abuse_scan_runs
       WHERE world_id = ${worldId} AND finished_at IS NOT NULL
    `);
    if (row?.['at'] != null) {
      const prev = toDate(row['at']);
      // ⚠️ Saat ileri alınmış ya da pencere bozulmuşsa geriye doğru bir pencere üretme.
      if (prev < to) return prev;
    }
    return new Date(to.getTime() - FIRST_RUN_DAYS * 86_400_000);
  }
}

/** Bir sonraki taramanın anı — ayar panelden değiştirilebiliyor. */
export function nextScanAt(from: Date): Date {
  const hours = Math.max(1, liveNumber('abuse', 'scanIntervalHours', 168));
  return new Date(from.getTime() + hours * 3_600_000);
}
