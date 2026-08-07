/**
 * ⭐⭐ DÜNYA SAATİ ve BAKIM MODU (SİSTEM PLANI §2) — **TEK ZAMAN ÇİZGİSİ** (2026-08-07).
 *
 *     gameNow() = now()        (dünya çalışıyorken — yani oyun saati = gerçek saat = UTC)
 *     gameNow() = pausedAt     (dünya bakımda — SAAT DONAR)
 *
 * ⚠️⚠️ **`clockOffsetMs` ARTIK YOK.** Eskiden dünyanın toplam duraklama süresi bir sütunda
 * birikiyor ve tüm vadeler gerçek saatten o kadar geride, ayrı bir "oyun saati" ölçeğinde
 * tutuluyordu. İki ölçek yan yana durdukça karıştırıldı: canlıda asker üretim sayacı kalıcı
 * «sipariş tamamlandı» gösterdi, sur onarım oranı yanlış okundu, `GAME_NOW_SQL`in beş
 * kopyasından biri bozuk kaldı. Hata sınıfı polislenerek kapanmadı, **kaldırılarak** kapandı.
 *
 * Bakım artık saati geri bırakmıyor: duraklama bitince **bekleyen vadeler duraklama süresi
 * kadar ileri kaydırılıyor** (`time-shift.ts` · kapsam `time-registry.ts`). Oyuncunun gördüğü
 * kalan süre bit-bit aynı kalıyor, ama veritabanındaki hiçbir damga "hangi saatte yazılmıştı?"
 * sorusunu sordurmuyor.
 *
 * ⚠️ Bakımda saatin DONMASI korunuyor: donmasaydı oyuncu bakım boyunca kaynağının arttığını ve
 * geri sayımlarının azaldığını görür, devam edince kaydırma bunları geri alır ve ekranda gözle
 * görülür bir geri sıçrama olurdu.
 */
import { eq, sql } from 'drizzle-orm';
import { toDate, type Db } from '../db/client.ts';
import { worlds } from '../db/schema.ts';
import { drainStatus, resumeAndShift, type ShiftOutcome } from './time-shift.ts';

export interface WorldClock {
  worldId: number;
  state: 'running' | 'maintenance' | 'archived';
  pausedAt: Date | null;
  /** O andaki oyun saati (= gerçek saat, ya da bakımdaysa donmuş `pausedAt`). */
  gameNow: Date;
  paused: boolean;
}

export class GameClockService {
  constructor(private readonly db: Db) {}

  /**
   * Gerçek zamanı enjekte edilebilir tutuyoruz — testler saati ileri sarabilsin.
   * ⚠️ **Vade ÜRETMEK için kullanılmaz** (aşağıdaki `gameNow` uyarısına bak).
   */
  now(): Date {
    return new Date();
  }

  gameNowFrom(world: { pausedAt: Date | null }, realNow = this.now()): Date {
    return world.pausedAt ?? realNow;
  }

  /**
   * ⭐⭐ OYUN SAATİ — **veritabanının saatinden** okunur, sürecin `new Date()`'inden DEĞİL.
   *
   * ⚠️ Bu, 2026-08-03'te canlıda yaşanan hatanın nihai çözümü. O gün süreç saati bir an ileri
   * okudu ve **7 saat 47 dakika erken** bir sıralama anlık görüntüsü alındı (geri alınamaz:
   * `prev_rank` kayar). Kuyruk tarafı `claimDue` içinde SQL'e taşınarak düzeltilmişti, ama
   * vadeyi ÜRETEN taraf (tüm controller'lar) hâlâ süreç saatini kullanıyordu — yani kıyaslamanın
   * iki ucu iki ayrı saatten geliyordu.
   *
   * Artık ikisi de DB'den: vade `now()`'dan doğuyor, `claimDue` da `now()` ile kıyaslıyor.
   * Süreç saati ne okursa okusun vade kayamaz; `ROLE=api`/`ROLE=worker` ayrı süreçlere
   * bölündüğünde aralarındaki NTP kayması da hesaba hiç girmez.
   *
   * ⚠️ Maliyet SIFIR: `read()` zaten `worlds` satırını okuyordu, yalnız hesap DB'ye taşındı.
   */
  async read(worldId: number): Promise<WorldClock> {
    const [w] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT state, paused_at, COALESCE(paused_at, now()) AS game_now
        FROM worlds WHERE id = ${worldId}
    `);
    if (!w) throw new Error(`Dünya bulunamadı: ${worldId}`);
    const pausedAt = w['paused_at'] == null ? null : toDate(w['paused_at']);
    return {
      worldId,
      state: String(w['state']) as WorldClock['state'],
      pausedAt,
      gameNow: toDate(w['game_now']),
      paused: pausedAt !== null,
    };
  }

  async gameNow(worldId: number): Promise<Date> {
    return (await this.read(worldId)).gameNow;
  }

  /**
   * Bakıma al. Scheduler yeni görev almayı bırakır (çalışan görevi bitirir — graceful drain).
   * Zaten bakımdaysa hiçbir şey yapmaz (idempotent).
   *
   * ⚠️ `paused_at` **DB saatinden** yazılıyor. Süreç saatinden yazsaydık, `resume`daki kaydırma
   * miktarı (`now() − paused_at`) iki farklı saatin farkı olurdu ve bir saat sıçraması dünyanın
   * tüm vadelerini kalıcı olarak kaydırırdı — geri alınamaz bir yazma.
   */
  async pause(worldId: number): Promise<WorldClock> {
    await this.db.update(worlds)
      .set({ state: 'maintenance', pausedAt: sql`now()` })
      .where(sql`${worlds.id} = ${worldId} AND ${worlds.pausedAt} IS NULL`);
    return this.read(worldId);
  }

  /**
   * ⭐ Bakımdan çıkar **ve bekleyen tüm vadeleri kaydırır** (`time-shift.ts`).
   *
   * ⚠️ Drenaj bariyeri sağlanmazsa `DrainNotReadyError` atar — çağıran bunu 409'a çevirmeli.
   * Uçuştaki bir handler kaydırmadan sonra commit ederse **kaymamış vade** yazar ve o görev
   * duraklama süresi kadar erken ateşlenir.
   */
  async resume(worldId: number, opts: { actorId?: number | null; force?: boolean } = {}): Promise<ShiftOutcome> {
    return resumeAndShift(this.db, {
      worldId,
      actorId: opts.actorId ?? null,
      ...(opts.force === undefined ? {} : { force: opts.force }),
    });
  }

  /** Bakım panelinin «devam ettir» düğmesini ne zaman açacağını bilmesi için. */
  async drain(worldId: number): Promise<Awaited<ReturnType<typeof drainStatus>>> {
    return drainStatus(this.db, worldId);
  }
}
