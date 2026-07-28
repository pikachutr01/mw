/**
 * ⭐ SAVAŞÇI ÜRETİMİ — **teker teker, tembel** (kullanıcı kararı 2026-07-28).
 *
 * Eski davranış: 300 Cüce siparişi tek bir geri sayımdı ve 300'ü de en sonda barakaya
 * ekleniyordu. Yeni kural: her birim kendi süresi dolunca **anında** şehre eklenir, sipariş
 * sayacı bir azalır ve döngü baştan başlar.
 *
 * ## Neden "tembel", neden birim başına görev değil
 * 300 birim için 300 zamanlanmış görev yazmak kayıt patlaması demekti. Onun yerine kaynak
 * birikiminde işe yarayan desen kullanılıyor: **hiç tick yok**, şehir okunduğunda geçen süreye
 * kaç birim düştüğü hesaplanıp bir kerede yazılıyor.
 *
 * 🎯 **Kritik sonuç:** oyuncu çevrimdışıyken şehrine saldırı gelirse savaş çözümü şehri
 * `ctx.at` anına kadar ilerletir (`CityService.materialize` bu fonksiyonu çağırır) → o ana kadar
 * üretilmiş askerler savaşta **gerçekten vardır**. Casusluk, nakliye, her okuma için aynı.
 *
 * ## Sıra
 * `position = 1` üretimi süren emirdir ve `started_at`'i doludur. Biten emir kapanır, sıradaki
 * **tam bittiği anda** başlatılır (aradaki boşluk kaybolmaz) ve döngü aynı çağrı içinde devam
 * eder — böylece bir hafta çevrimdışı kalan oyuncunun tüm kuyruğu tek okumada yakalanır.
 */
import { sql } from 'drizzle-orm';

/** `db` veya transaction — ikisi de `execute` sunuyor. */
export interface Runner {
  execute<T = Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]>;
}

interface OpenRow {
  id: number;
  itemType: string;
  count: number;
  done: number;
  perUnit: number;
  startedAt: Date | null;
  position: number;
}

/** Sonsuz döngü sigortası: normalde en fazla `Baraka seviyesi` kadar dönülür. */
const MAX_CHAIN = 50;

/**
 * Şehrin savaşçı kuyruğunu `at` anına kadar ilerletir. Üretilen birimler `units` tablosuna
 * eklenir, biten emirler kapatılır, sıradaki emir başlatılır.
 *
 * @returns eklenen birimler (`{ dwarf: 12 }`) — çağıran isterse bildirim üretebilir.
 */
/**
 * ⭐ BANT KATEGORİLERİ (2026-07-29). Baraka'daki tek-bant mantığı Savunma'ya da genişletildi
 * (kullanıcı isteği): savunma BİRİMLERİ de teker teker, sırayla üretilir. Sur ve Büyü Kalkanı
 * bu banda GİRMEZ — onlar seviye taşır ve kendi satırlarında paralel ilerler (§13.21.3).
 */
export type BandCategory = 'unit' | 'defense';

/**
 * ⚠️ Bant sorgularının hepsinde `target_level IS NULL` var. Sebep: **Sur ve Büyü Kalkanı**
 * da `category = 'defense'` satırıdır ama banda GİRMEZ (seviye taşır, paralel ilerler).
 * Bu koşul olmadan bir Sur yükseltmesi banttaki sırayı işgal ediyor ve üretim emirleri
 * 2. sıradan başlıyordu (§13.21.3).
 */

export async function materializeUnitQueues(
  runner: Runner, cityId: number, at: Date, category: BandCategory = 'unit',
): Promise<Record<string, number>> {
  const produced: Record<string, number> = {};

  for (let guard = 0; guard < MAX_CHAIN; guard++) {
    const rows = await runner.execute<Record<string, unknown>>(sql`
      SELECT id, item_type, count, done, per_unit_seconds, started_at, position
        FROM queues
       WHERE city_id = ${cityId} AND category = ${category} AND target_level IS NULL
         AND completed_at IS NULL AND canceled_at IS NULL
       ORDER BY position, id
       LIMIT 1
    `);
    const r = rows[0];
    if (!r) break;

    const q: OpenRow = {
      id: Number(r['id']),
      itemType: String(r['item_type']),
      count: Number(r['count'] ?? 0),
      done: Number(r['done'] ?? 0),
      perUnit: Math.max(0.001, Number(r['per_unit_seconds'] ?? 0)),
      startedAt: r['started_at'] == null ? null : new Date(String(r['started_at'])),
      position: Number(r['position'] ?? 1),
    };
    if (!q.startedAt || q.count <= 0) break;

    const elapsed = (at.getTime() - q.startedAt.getTime()) / 1000;
    if (elapsed <= 0) break;

    // Geçen süreye kaç birim düşüyor? (Sipariş adediyle sınırlı.)
    const producible = Math.min(q.count, Math.floor(elapsed / q.perUnit));
    const delta = producible - q.done;

    if (delta > 0) {
      await runner.execute(sql`
        INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${q.itemType}, ${delta})
        ON CONFLICT (city_id, type) DO UPDATE SET count = units.count + ${delta}
      `);
      await runner.execute(sql`UPDATE queues SET done = ${producible} WHERE id = ${q.id}`);
      produced[q.itemType] = (produced[q.itemType] ?? 0) + delta;
      q.done = producible;
    }

    if (q.done < q.count) break;   // sipariş sürüyor → zincir burada durur

    // ── Sipariş bitti: kapat ve sıradakini TAM bitiş anında başlat ──────────
    const finishedAt = new Date(q.startedAt.getTime() + q.count * q.perUnit * 1000);
    await runner.execute(sql`
      UPDATE queues SET completed_at = ${finishedAt.toISOString()}::timestamptz
       WHERE id = ${q.id} AND completed_at IS NULL
    `);
    await promoteNext(runner, cityId, finishedAt, category);
  }

  return produced;
}

/**
 * Bekleyen emirleri bir sıra yukarı alır ve zinciri yeniden kurar.
 * `startAt` = bandın boşaldığı an (biten emrin bitişi ya da iptal anı).
 */
export async function promoteNext(
  runner: Runner, cityId: number, startAt: Date, category: BandCategory = 'unit',
): Promise<void> {
  await runner.execute(sql`
    UPDATE queues SET position = position - 1
     WHERE city_id = ${cityId} AND category = ${category} AND target_level IS NULL
       AND completed_at IS NULL AND canceled_at IS NULL AND position > 1
  `);
  /**
   * ⚠️ Bandı yeni devralan emrin saati **burada** kurulur. `rescheduleUnitChain` 1. sıranın
   * `started_at`'ine dokunmaz (yarısı üretilmiş olabilir) — o koruma, henüz hiç üretmemiş
   * yeni emirde yanlış olurdu: bekleme süresi üretim süresi sayılırdı.
   */
  await runner.execute(sql`
    UPDATE queues SET started_at = ${startAt.toISOString()}::timestamptz, done = 0
     WHERE city_id = ${cityId} AND category = ${category} AND target_level IS NULL
       AND completed_at IS NULL AND canceled_at IS NULL AND position = 1
  `);
  await rescheduleUnitChain(runner, cityId, startAt, category);
}

/**
 * ⭐ **TEK ÜRETİM BANDI** (kullanıcı kararı 2026-07-28) — kuyruğun zamanlarını sırayla kurar.
 *
 * 🐛 Düzeltilen hata: emirler sipariş ANINDAN itibaren zamanlanıyordu, yani üç sipariş
 * **paralel** geri sayıyordu. Doğrusu fabrika mantığı: 1. emir bitmeden 2.'nin sayacı hiç
 * başlamaz. Bu fonksiyon her değişiklikte (sipariş · iptal · bitiş) çağrılır ve:
 *
 *   • **1. sıra** üretimi sürendir; `started_at`'ine DOKUNULMAZ (yarısı üretilmiş olabilir),
 *     yalnız bitişi `başlangıç + adet × birimSüresi` olarak düzeltilir.
 *   • **2. ve sonrası** bir öncekinin bitişinde başlar — böylece ekrandaki "ne zaman başlar"
 *     sayacı gerçeği söyler.
 *
 * Sıradaki emrin bekleme süresi ona **maliyet yazmaz**: bandı devraldığında `done = 0` ve
 * saati o an başlar.
 */
export async function rescheduleUnitChain(
  runner: Runner, cityId: number, bandFreeAt: Date, category: BandCategory = 'unit',
): Promise<void> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT id, count, done, per_unit_seconds, started_at, position
      FROM queues
     WHERE city_id = ${cityId} AND category = ${category} AND target_level IS NULL
       AND completed_at IS NULL AND canceled_at IS NULL
     ORDER BY position, id
  `);

  let cursor = bandFreeAt;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const id = Number(r['id']);
    const count = Number(r['count'] ?? 0);
    const perUnit = Math.max(0.001, Number(r['per_unit_seconds'] ?? 0));
    const isActive = i === 0;

    if (isActive) {
      // Süren emir: başlangıcı korunur (üretilmiş birimler kaybolmamalı).
      const started = r['started_at'] == null ? cursor : new Date(String(r['started_at']));
      const finish = new Date(started.getTime() + count * perUnit * 1000);
      await runner.execute(sql`
        UPDATE queues
           SET position = 1,
               started_at = ${started.toISOString()}::timestamptz,
               finish_at = ${finish.toISOString()}::timestamptz
         WHERE id = ${id}
      `);
      cursor = finish;
    } else {
      // Bekleyen: bandın boşalacağı anda başlar, o ana kadar hiçbir şey üretmez.
      const finish = new Date(cursor.getTime() + count * perUnit * 1000);
      await runner.execute(sql`
        UPDATE queues
           SET position = ${i + 1}, done = 0,
               started_at = ${cursor.toISOString()}::timestamptz,
               finish_at = ${finish.toISOString()}::timestamptz
         WHERE id = ${id}
      `);
      cursor = finish;
    }
  }
}

/** Şehirdeki AÇIK savaşçı emri sayısı (Baraka seviyesi kadar olabilir). */
export async function openUnitQueueCount(
  runner: Runner, cityId: number, category: BandCategory = 'unit',
): Promise<number> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT COUNT(*)::int AS n FROM queues
     WHERE city_id = ${cityId} AND category = ${category} AND target_level IS NULL
       AND completed_at IS NULL AND canceled_at IS NULL
  `);
  return Number(rows[0]?.['n'] ?? 0);
}
