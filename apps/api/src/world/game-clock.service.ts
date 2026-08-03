/**
 * ⭐ OYUN SAATİ ve BAKIM MODU (SİSTEM PLANI §2)
 *
 * Otorite gerçek zaman DEĞİL, `gameNow()`:
 *
 *     gameNow() = now() − clockOffsetMs           (dünya çalışıyorken)
 *     gameNow() = pausedAt − clockOffsetMs        (dünya bakımda — SAAT DONAR)
 *
 * `clockOffsetMs` = dünyanın toplam duraklama süresi. Bakımda geçen gerçek süre oyun saatine
 * yansımaz → bakımdan çıkınca **tüm geri sayımlar bakım süresi kadar ötelenmiş** olur ve
 * bakım sırasında devam eden savaşlar/üretimler yerinde kalır (kullanıcının istediği davranış).
 *
 * Tüm `execute_at`, `finish_at`, `resources_at` değerleri OYUN SAATİNDE tutulur.
 */
import { eq, sql } from 'drizzle-orm';
import { toDate, type Db } from '../db/client.ts';
import { worlds } from '../db/schema.ts';

export interface WorldClock {
  worldId: number;
  state: 'running' | 'maintenance' | 'archived';
  clockOffsetMs: number;
  pausedAt: Date | null;
  /** O andaki oyun saati. */
  gameNow: Date;
  paused: boolean;
}

export class GameClockService {
  constructor(private readonly db: Db) {}

  /** Gerçek zamanı enjekte edilebilir tutuyoruz — testler saati ileri sarabilsin. */
  now(): Date {
    return new Date();
  }

  gameNowFrom(world: { clockOffsetMs: number; pausedAt: Date | null }, realNow = this.now()): Date {
    const base = world.pausedAt ?? realNow;
    return new Date(base.getTime() - world.clockOffsetMs);
  }

  async read(worldId: number, realNow = this.now()): Promise<WorldClock> {
    const [w] = await this.db.select().from(worlds).where(eq(worlds.id, worldId));
    if (!w) throw new Error(`Dünya bulunamadı: ${worldId}`);
    return {
      worldId,
      state: w.state as WorldClock['state'],
      clockOffsetMs: Number(w.clockOffsetMs),
      pausedAt: w.pausedAt,
      gameNow: this.gameNowFrom({ clockOffsetMs: Number(w.clockOffsetMs), pausedAt: w.pausedAt }, realNow),
      paused: w.pausedAt !== null,
    };
  }

  async gameNow(worldId: number, realNow = this.now()): Promise<Date> {
    return (await this.read(worldId, realNow)).gameNow;
  }

  /**
   * ⭐ Oyun saatini **veritabanının** saatinden okur (`gameNow()` sürecin saatini kullanır).
   *
   * ⚠️ Fark ihmal edilebilir görünür ama bir kez canlıda vurdu: görev vadesi süreç saatiyle
   * kıyaslanırken saat bir an ileri okudu ve 7,5 saat erken bir sıralama anlık görüntüsü
   * alındı (`mission.repository.ts` · `GAME_NOW_SQL`). Kuyruk artık kıyaslamayı SQL içinde
   * yapıyor; **vadeyle karşılaştırılacak** bir zaman üretmesi gereken her yer (testler,
   * elle görev yazan kod) bunu kullanmalı — `gameNow()`u değil.
   */
  async dbGameNow(worldId: number): Promise<Date> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT (COALESCE(paused_at, now()) - (clock_offset_ms * interval '1 millisecond')) AS at
        FROM worlds WHERE id = ${worldId}
    `);
    if (!row) throw new Error(`Dünya bulunamadı: ${worldId}`);
    return toDate(row['at']);
  }

  /**
   * Bakıma al. Scheduler yeni görev almayı bırakır (çalışan görevi bitirir — graceful drain).
   * Zaten bakımdaysa hiçbir şey yapmaz (idempotent).
   */
  async pause(worldId: number, realNow = this.now()): Promise<WorldClock> {
    await this.db.update(worlds)
      .set({ state: 'maintenance', pausedAt: realNow })
      .where(sql`${worlds.id} = ${worldId} AND ${worlds.pausedAt} IS NULL`);
    return this.read(worldId, realNow);
  }

  /**
   * Bakımdan çıkar: duraklama süresini offset'e EKLE → oyun saati bakım öncesinden devam eder.
   * Tek SQL ifadesi olduğu için iki eşzamanlı resume çağrısında bile süre iki kez eklenmez
   * (`pausedAt IS NOT NULL` koşulu bunu garantiler).
   */
  async resume(worldId: number, realNow = this.now()): Promise<WorldClock> {
    await this.db.update(worlds)
      .set({
        state: 'running',
        clockOffsetMs: sql`${worlds.clockOffsetMs} + (EXTRACT(EPOCH FROM (${realNow.toISOString()}::timestamptz - ${worlds.pausedAt})) * 1000)::bigint`,
        pausedAt: null,
      })
      .where(sql`${worlds.id} = ${worldId} AND ${worlds.pausedAt} IS NOT NULL`);
    return this.read(worldId, realNow);
  }

  /** Oyun saatindeki bir anı gerçek zamana çevirir (geri sayım/uyuma hesabı için). */
  realTimeOf(gameTime: Date, world: { clockOffsetMs: number }): Date {
    return new Date(gameTime.getTime() + world.clockOffsetMs);
  }
}
