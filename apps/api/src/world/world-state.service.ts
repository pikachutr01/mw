/**
 * ⭐ DÜNYA DURUMU — bakım kilidinin **bellek-içi** kaynağı (admin Faz 2).
 *
 * `MaintenanceInterceptor` her mutasyonda "bu dünya bakımda mı?" diye soruyor. Bunu her seferinde
 * `worlds` tablosundan okusaydık kilidin bedeli **her yazma isteğine bir sorgu** olurdu — Faz 1'de
 * ayarlar için reddettiğimiz maliyetin aynısı. Bu yüzden aynı deseni kullanıyoruz:
 *
 *     Açılışta bir kez:   worlds ──► bellek-içi durum haritası
 *     Her mutasyonda:     isPaused(worldId) ──► Map okuması, 0 sorgu
 *     Bakıma alındığında: yazım + pg_notify('mw_world') ──► tüm süreçler tazeler (ms)
 *
 * ⚠️ **`GameClockService` bu önbelleği KULLANMAZ, taze okur.** İkisi aynı satıra bakıyor ama
 * farklı soruları var: buradaki soru "yazmaya izin var mı" (kısa süre bayat kalması zararsız,
 * en kötü ihtimalle bir istek geçer), oradaki soru "oyun saati kaç" (bir milisaniyelik sapma
 * `finish_at` hesabına girer ve KALICI olur). Türev durumu paylaşmak yerine ayırmak, iki
 * sorunun birbirinin doğruluğunu bozmamasını garantiliyor.
 *
 * ⚠️ Zamanlayıcı **emniyet ağı**, birincil yol değil: `NOTIFY` kaybolursa (bağlantı kopması,
 * süreç yeniden bağlanırken gelen duyuru) kilit sonsuza kadar bayat kalmasın. Sıcak yolda
 * çalışmaz — arka planda döner.
 */
import { sql } from 'drizzle-orm';
import type postgres from 'postgres';
import type { Db } from '../db/client.ts';

/** Dünya durumu değişikliğinin duyurulduğu Postgres kanalı. */
export const WORLD_CHANNEL = 'mw_world';

/** Duyuru kaçarsa en geç bu kadar sonra kendiliğinden düzelir. */
const REFRESH_MS = 30_000;

export interface WorldState {
  worldId: number;
  state: 'running' | 'maintenance' | 'archived';
  paused: boolean;
  pausedAt: Date | null;
  notice: string | null;
  eta: Date | null;
}

export class WorldStateService {
  private states = new Map<number, WorldState>();
  private unlisten: (() => Promise<void>) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private loaded = false;

  constructor(
    private readonly db: Db,
    /** `LISTEN` için ham bağlantı. Verilmezse geçersiz kılma yalnız bu süreçte çalışır. */
    private readonly raw?: postgres.Sql | null,
  ) {}

  async load(): Promise<void> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, state, paused_at, maintenance_notice, maintenance_eta FROM worlds
    `);
    const next = new Map<number, WorldState>();
    for (const r of rows) {
      const worldId = Number(r['id']);
      const pausedAt = r['paused_at'] == null ? null : new Date(String(r['paused_at']));
      next.set(worldId, {
        worldId,
        state: String(r['state']) as WorldState['state'],
        paused: pausedAt !== null,
        pausedAt,
        notice: r['maintenance_notice'] == null ? null : String(r['maintenance_notice']),
        eta: r['maintenance_eta'] == null ? null : new Date(String(r['maintenance_eta'])),
      });
    }
    this.states = next;
    this.loaded = true;
  }

  /**
   * ⚠️ Ham bağlantı parametre olarak da alınabiliyor: Nest'in örneği DI fabrikasından
   * bağlantısız çıkıyor ve `main.ts` onu `app.get(WorldStateService)` ile alıp burada
   * bağlıyor. Kilidi okuyan interceptor **Nest'in** örneğini enjekte ediyor; başlatılan
   * başka bir örnek olsaydı kilit hiç yüklenmemiş bir haritaya bakardı.
   */
  async start(raw?: postgres.Sql | null): Promise<void> {
    const conn = raw ?? this.raw;
    await this.load();
    this.timer = setInterval(() => {
      void this.load().catch(() => { /* emniyet ağı sessiz döner; bir sonraki tur dener */ });
    }, REFRESH_MS);
    // Node'un kapanmasını bu zamanlayıcı geciktirmesin.
    this.timer.unref?.();

    if (!conn) return;
    const sub = await conn.listen(WORLD_CHANNEL, () => {
      void this.load().catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[world] durum tazeleme başarısız:', err);
      });
    });
    this.unlisten = () => sub.unlisten();
  }

  async stop(): Promise<void> {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    await this.unlisten?.();
    this.unlisten = null;
  }

  /* ── Okuma (SICAK YOL — sorgu YOK) ───────────────────────────────────────── */

  /**
   * ⚠️ **Bilinmeyen dünya `paused: false` sayılır.** Ters kural (bilinmiyorsa kilitle) daha
   * "güvenli" görünür ama pratikte felakettir: önbellek henüz yüklenmemişken veya yeni bir
   * dünya eklendiğinde tüm oyun yazmaları 503 döner. Bakım zaten AÇIKÇA açılan bir durum;
   * varsayılanı "açık" yapmak onu kazayla açılabilir kılardı.
   */
  isPaused(worldId: number): boolean {
    return this.states.get(worldId)?.paused ?? false;
  }

  get(worldId: number): WorldState | null {
    return this.states.get(worldId) ?? null;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /* ── Yazma ────────────────────────────────────────────────────────────────── */

  /**
   * Bakıma alır. Saatin kendisini `GameClockService.pause()` donduruyor; burada yalnız
   * oyuncuya gösterilecek metin/tahmin yazılıyor ve önbellek tazeleniyor.
   *
   * ⚠️ Metin `pausedAt IS NULL` koşuluna BAĞLI DEĞİL: zaten bakımdayken metni güncellemek
   * (ör. "15 dk daha sürecek") geçerli bir işlem ve bunun için bakımdan çıkıp girmek gerekmemeli.
   */
  async setNotice(worldId: number, o: {
    notice: string | null; eta: Date | null; actorId: number | null;
  }): Promise<void> {
    /**
     * ⚠️ Tarih ISO METİN olarak + açık cast ile gidiyor: postgres.js parametrede ham bir
     * Date nesnesi kabul etmiyor ("the string argument must be of type string" ile patlıyor).
     * Kod tabanındaki diğer zaman parametreleri de aynı biçimde yazılıyor.
     */
    await this.db.execute(sql`
      UPDATE worlds SET maintenance_notice = ${o.notice},
                        maintenance_eta = ${o.eta?.toISOString() ?? null}::timestamptz,
                        maintenance_by = ${o.actorId}
       WHERE id = ${worldId}
    `);
    await this.refreshEverywhere();
  }

  /** Bakım bitince perde metnini de temizle — sonraki bakımda eski metin görünmesin. */
  async clearNotice(worldId: number): Promise<void> {
    await this.db.execute(sql`
      UPDATE worlds SET maintenance_notice = NULL, maintenance_eta = NULL, maintenance_by = NULL
       WHERE id = ${worldId}
    `);
    await this.refreshEverywhere();
  }

  /** Kendi önbelleğini tazeler ve diğer süreçlere de tazelemelerini söyler. */
  async refreshEverywhere(): Promise<void> {
    await this.load();
    try {
      await this.db.execute(sql`SELECT pg_notify(${WORLD_CHANNEL}, '1')`);
    } catch (err) {
      // Duyuru gitmezse emniyet ağı zamanlayıcısı en geç 30 sn içinde toparlar.
      // eslint-disable-next-line no-console
      console.error('[world] duyuru başarısız:', err);
    }
  }
}
