/**
 * ⭐ DÖNGÜ NABZI (§admin Faz 8).
 *
 * Scheduler ve dispatcher her turdan sonra buraya uğrar; bakım paneli `worker_heartbeats`
 * satırına bakıp "bu döngü yaşıyor mu" sorusuna **kanıtla** cevap verir.
 *
 * ⚠️ Nabzın kendisi bir arıza kaynağı OLMAMALI. Üç kural:
 *   1. **Kısıtlanmış** — `minIntervalMs`ten sık yazılmaz. 1 sn'lik poll'da saniyede bir UPDATE
 *      demekti; izleme kaydı izlediği sistemden fazla yazma üretmemeli.
 *   2. **Yutan** — yazım hatası sessizce yutulur. Nabız yazamadı diye görev döngüsünün durması,
 *      çözmeye çalıştığı sorunu yaratmak olurdu. (Örn. migration henüz koşmamış bir DB.)
 *   3. **Transaction DIŞINDA** — görevle aynı transaction'da olsaydı görev geri alındığında
 *      nabız da geri alınırdı; tam da arıza anında iz kaybolurdu.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';

export interface HeartbeatOptions {
  workerId: string;
  worldId?: number | null;
  role?: string;
  /** Bu süreden sık yazılmaz. */
  minIntervalMs?: number;
  /**
   * Bu yaştan eski **aynı tür + aynı dünya** nabızları ilk yazımda süpürülür (bkz. `sweep`).
   * Varsayılan 1 saat.
   */
  sweepAfterMs?: number;
  /** Süpürme sıklığı. Varsayılan 5 dakika. */
  sweepEveryMs?: number;
  /** Testler için enjekte edilebilir saat. */
  now?: () => number;
}

export class Heartbeat {
  private readonly startedAt: Date;
  private lastWrite = 0;
  private lastSweep = 0;
  private ticks = 0;
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    private readonly kind: 'scheduler' | 'dispatcher',
    private readonly opts: HeartbeatOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.startedAt = new Date(this.now());
  }

  /**
   * Bir tur bitti. `force` kısıtlamayı atlar (kapanışta son hâli yazmak için).
   *
   * ⚠️ `ticks` kısıtlanan turlarda da artar: sayaç YAZIM sayısını değil TUR sayısını ölçer.
   * Aksi hâlde panel "5 tur/dk" gibi yanlış bir hız gösterirdi.
   */
  async beat(detail: Record<string, unknown>, force = false): Promise<void> {
    this.ticks++;
    const t = this.now();
    if (!force && t - this.lastWrite < (this.opts.minIntervalMs ?? 5_000)) return;
    this.lastWrite = t;
    try {
      await this.db.execute(sql`
        INSERT INTO worker_heartbeats (kind, worker_id, world_id, pid, role, started_at, at, ticks, detail)
        VALUES (${this.kind}, ${this.opts.workerId}, ${this.opts.worldId ?? null},
                ${process.pid}, ${this.opts.role ?? process.env['ROLE'] ?? 'all'},
                ${this.startedAt.toISOString()}::timestamptz, now(), ${this.ticks},
                ${JSON.stringify(detail)}::jsonb)
        ON CONFLICT (kind, worker_id) DO UPDATE
           SET world_id = EXCLUDED.world_id, pid = EXCLUDED.pid, role = EXCLUDED.role,
               started_at = EXCLUDED.started_at, at = EXCLUDED.at,
               ticks = EXCLUDED.ticks, detail = EXCLUDED.detail
      `);
      if (t - this.lastSweep >= (this.opts.sweepEveryMs ?? 300_000)) {
        this.lastSweep = t;
        await this.sweep();
      }
    } catch {
      // Bilerek sessiz — kural 2.
    }
  }

  /**
   * ⭐ ESKİ SÜREÇLERİN ARTIKLARI. `worker_id` = `worker-<pid>` olduğu için her yeniden başlatma
   * YENİ bir satır açar; eskisi sonsuza kadar kalır ve panel birkaç gün sonra onlarca "ÖLÜ"
   * satırla dolar — gerçek bir arızayı gürültünün içinde kaybettirir.
   *
   * ⚠️ Süpürme **yalnız canlı bir halef varken** çalışır: silen taraf, aynı tür + aynı dünya
   * için az önce nabız yazmış olan süreçtir. Worker gerçekten ölüp yerine kimse gelmediyse
   * kimse süpürmez ve satır **kalır** — ki asıl görmek istediğimiz durum tam olarak budur.
   *
   * ⚠️ **Açılışta bir kez DEĞİL, periyodik** (5 dk). İlk tasarım yalnız ilk nabızda süpürüyordu
   * ve canlı ölçümde açığı görüldü: yeni süreç kalktığında selefinin satırı henüz 27 saniyelikti
   * (1 saatlik eşiğin çok altında) → hiç süpürülmedi ve panelde kalıcı iki "ÖLÜ" satır kaldı.
   * Süpürmenin bir kereye özel olmaması gerekiyor; artık her tur adayı kontrol ediliyor.
   */
  private async sweep(): Promise<void> {
    const cutoffS = Math.round((this.opts.sweepAfterMs ?? 3_600_000) / 1000);
    await this.db.execute(sql`
      DELETE FROM worker_heartbeats
       WHERE kind = ${this.kind}
         AND worker_id <> ${this.opts.workerId}
         AND world_id IS NOT DISTINCT FROM ${this.opts.worldId ?? null}
         AND at < now() - (${cutoffS} * interval '1 second')
    `);
  }
}
