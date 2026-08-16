/**
 * ⭐ YERLEŞİM ALGORİTMASI (§13.6) — kullanıcı isteği, 2026-08-03.
 *
 * ⚠️ **Neyin yerine geçtiği:** düpedüz *"en küçük boş indeks"*. Kullanıcı bunu canlıda gördü —
 * *"benden sonra kayıt olan bir başka hesap da 1:1:2'ye yerleştirildi"* — ve haklıydı.
 *
 * Bu dosyanın ölçtüğü asıl şey **dağılım**: tek tek çağrıların hangi koordinatı verdiği değil,
 * 200 kayıttan sonra dünyanın nasıl göründüğü. Yerleşim ağırlıklı rastgele olduğu için
 * "şu koordinatı ver" diye bir beklenti yazılamaz — yazılsaydı test rastgeleliği ölçmez,
 * onu yasaklardı.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PlacementService, placementConfig } from '../src/world/placement.service.ts';
import { districtIndex, WORLD_SHAPE } from '../src/world/world-shape.ts';
import { setLiveSettings } from '../src/settings/live.ts';
import type { DbHandle } from '../src/db/client.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let svc: PlacementService;

beforeAll(async () => {
  h = await setupTestDb();
  svc = new PlacementService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
});

afterEach(() => { setLiveSettings({}); });

/**
 * Oyuncu satırı — gerçek bir `accounts` satırıyla birlikte.
 * ⚠️ `players.account_id` YABANCI ANAHTAR: uydurma bir sayı geçmek testi
 * «violates foreign key constraint» ile düşürüyor (bir kez düşürdü).
 */
async function newPlayer(name: string, score = 0): Promise<number> {
  const t = randomUUID().slice(0, 8);
  const [acc] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO accounts (email, password_hash) VALUES (${`${t}@t.local`}, 'x') RETURNING id
  `);
  const [ply] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO players (world_id, account_id, username, score)
    VALUES (${worldId}, ${Number(acc!['id'])}, ${name}, ${score}) RETURNING id
  `);
  return Number(ply!['id']);
}

/** Gerçek kayıt akışını taklit eder: koordinat seç → şehri yaz. */
async function place(accountSeed: number, score = 0): Promise<{ k: number; d: number; s: number }> {
  const t = randomUUID().slice(0, 8);
  const playerId = await newPlayer(`p_${t}`, score);
  const c = await svc.pickCapital(worldId, accountSeed);
  await h.db.execute(sql`
    INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital, gold, food, resources_at)
    VALUES (${worldId}, ${playerId}, ${`c_${t}`}, ${c.k}, ${c.d}, ${c.s}, true, 0, 0, now())
  `);
  return c;
}

/** Belirli bir koordinata şehir koy — kalabalık/koloni kurgularını kurmak için. */
async function putCity(
  playerId: number, k: number, d: number, s: number, isCapital: boolean,
): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital, gold, food, resources_at)
    VALUES (${worldId}, ${playerId}, ${`c${k}_${d}_${s}`}, ${k}, ${d}, ${s},
            ${isCapital}, 0, 0, now())
  `);
}

/** Bir diyarın künyesi: kaç şehir, kaç başkent, kaç farklı oyuncu. */
async function districtStats(d: number): Promise<{ cities: number; players: number }> {
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT COUNT(*)::int AS cities, COUNT(DISTINCT player_id)::int AS players
      FROM cities WHERE world_id = ${worldId} AND k = 1 AND d = ${d}
  `);
  return { cities: Number(row?.['cities'] ?? 0), players: Number(row?.['players'] ?? 0) };
}

/**
 * `pickCapital`ı N tohumla çağırıp seçilen diyarların dağılımını döndürür.
 * ⚠️ YERLEŞTİRME YAPMAZ: her ekleme doluluğu değiştirir ve ölçüm kendi kendini bozardı.
 */
async function sampleChoices(n: number, seedBase: number): Promise<Map<number, number>> {
  const hist = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const c = await svc.pickCapital(worldId, seedBase + i);
    const g = districtIndex(c.k, c.d);
    hist.set(g, (hist.get(g) ?? 0) + 1);
  }
  return hist;
}

/** Dünyanın su seviyesi (`worlds.placement_band`). */
async function bandOf(): Promise<number> {
  const [r] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT placement_band FROM worlds WHERE id = ${worldId}
  `);
  return Number(r?.['placement_band'] ?? 1);
}

/** Bir kuşağı başkent kotasına kadar doldurur. */
async function fillBand(firstD: number, lastD: number, quota: number): Promise<void> {
  for (let d = firstD; d <= lastD; d++) {
    for (let i = 0; i < quota; i++) {
      const pid = await newPlayer(`dolgu_${d}_${i}`);
      await putCity(pid, 1, d, i + 1, true);
    }
  }
}

describe('⭐⭐ kuşak (bant) cephesi', () => {
  it('boş dünyada İLK KUŞAĞA (diyar 1-5) düşer — ve tek diyara yığılmaz', async () => {
    const hist = await sampleChoices(120, 5000);
    for (const g of hist.keys()) expect(g).toBeLessThanOrEqual(5);
    // ⚠️ Kullanıcının şartı: "diyarların peş peşe değil rastgele dolması".
    expect(hist.size).toBeGreaterThanOrEqual(4);
  });

  it('⭐ kuşak dolunca SONRAKİ kuşak açılır', async () => {
    const cfg = placementConfig(worldId);
    await fillBand(1, 5, cfg.capitalQuota);

    const hist = await sampleChoices(60, 6000);
    for (const g of hist.keys()) {
      expect(g).toBeGreaterThanOrEqual(6);
      expect(g).toBeLessThanOrEqual(10);
    }
    expect(await bandOf()).toBe(2);
  });

  /**
   * ⭐⭐⭐ **«GERİ DÖNÜLMEZ» — bu dosyanın en önemli iddiası.**
   *
   * Su seviyesi veriden türetilseydi, 1. kuşaktaki şehirler silinince cephe geri açılırdı:
   * yeni oyuncu çoktan güçlenmiş 1. kuşağın arasına düşer ve *"hesap sil, prim slot boşalt"*
   * açığı doğardı (gerekçe `0049_placement_band.sql` başlığında).
   */
  it('⭐⭐⭐ kuşak ilerledikten SONRA şehirler silinse bile GERİ DÖNÜLMEZ', async () => {
    const cfg = placementConfig(worldId);
    await fillBand(1, 5, cfg.capitalQuota);
    await svc.pickCapital(worldId, 7001);            // su seviyesini ilerlet
    expect(await bandOf()).toBe(2);

    await h.db.execute(sql`DELETE FROM cities WHERE world_id = ${worldId} AND k = 1 AND d <= 5`);

    const hist = await sampleChoices(60, 7100);
    for (const g of hist.keys()) expect(g).toBeGreaterThanOrEqual(6);   // 1-5'e DÖNMEDİ
    expect(await bandOf()).toBe(2);
  });

  it('başkent kotası varsayılanı 3 ve aşılmıyor', async () => {
    const cfg = placementConfig(worldId);
    expect(cfg.capitalQuota).toBe(3);
    for (let i = 0; i < 15; i++) await place(8000 + i);
    for (let d = 1; d <= 5; d++) {
      const [row] = await h.db.execute<Record<string, unknown>>(sql`
        SELECT COUNT(*) FILTER (WHERE is_capital)::int AS n
          FROM cities WHERE world_id = ${worldId} AND k = 1 AND d = ${d}
      `);
      expect(Number(row?.['n'] ?? 0)).toBeLessThanOrEqual(cfg.capitalQuota);
    }
  });

  it('⭐ yabancı KOLONİLER de komşu kotasına sayılır', async () => {
    const cfg = placementConfig(worldId);
    for (let i = 0; i < cfg.neighborQuota; i++) {
      const pid = await newPlayer(`kolonici_${i}`);
      await putCity(pid, 1, 3, i + 1, false);          // başkent DEĞİL
    }
    const hist = await sampleChoices(80, 9000);
    expect(hist.get(districtIndex(1, 3)) ?? 0).toBe(0);
  });

  it('⭐ şehir kurma görevinin hedefi BOŞ sayılmaz', async () => {
    const pid = await newPlayer('kurucu');
    for (let s = 1; s <= WORLD_SHAPE.citiesPerDistrict; s++) {
      await h.db.execute(sql`
        INSERT INTO missions (world_id, type, status, owner_player_id, execute_at,
                              target_k, target_d, target_s)
        VALUES (${worldId}, 'found_city', 'scheduled', ${pid}, now() + interval '1 hour',
                1, 2, ${s})
      `);
    }
    const hist = await sampleChoices(80, 9500);
    expect(hist.get(districtIndex(1, 2)) ?? 0).toBe(0);
  });

  it('aynı hesap + aynı dünya HEP aynı sonucu verir (tohumlu)', async () => {
    const a = await svc.pickCapital(worldId, 4242);
    const b = await svc.pickCapital(worldId, 4242);
    expect(a).toEqual(b);
  });

  it('aynı koordinat İKİ KEZ verilmez', async () => {
    const gorulen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const c = await place(11000 + i);
      const anahtar = `${c.k}:${c.d}:${c.s}`;
      expect(gorulen.has(anahtar)).toBe(false);
      gorulen.add(anahtar);
    }
  });
});

describe('⭐⭐ taşma payı', () => {
  it('kuşak BOŞKEN taşma olmaz (doluluk² = 0)', async () => {
    const hist = await sampleChoices(200, 12000);
    const tasan = [...hist.entries()].filter(([g]) => g > 5).reduce((a, [, n]) => a + n, 0);
    expect(tasan).toBe(0);
  });

  /**
   * ⭐ Taşmanın var oluş sebebi: kuşak dolarken uygun diyar sayısı bire düşüyor ve o noktada
   * yerleşen HERKES aynı diyara inecek. Canlı örnek (2026-08-16): bant 1'de kotası dolmamış
   * tek diyar 1:4 kalmıştı.
   */
  it('⭐ kuşak DOLARKEN taşma devreye girer — yığılmayı dağıtır', async () => {
    const cfg = placementConfig(worldId);
    await fillBand(1, 4, cfg.capitalQuota);
    for (let i = 0; i < cfg.capitalQuota - 1; i++) {
      const pid = await newPlayer(`d5_${i}`);
      await putCity(pid, 1, 5, i + 1, true);
    }

    const hist = await sampleChoices(300, 13000);
    const tasan = [...hist.entries()].filter(([g]) => g > 5).reduce((a, [, n]) => a + n, 0);
    /**
     * ⚠️ Beklenti bir ARALIK, kesin sayı değil — taşma rastgele. Ama iki uç da yanlış olurdu:
     * 0 ise yığılma çözülmemiş, çoğunluk ise kuşak modeli anlamını yitirmiş demektir.
     */
    expect(tasan).toBeGreaterThan(0);
    expect(tasan).toBeLessThan(150);
  });

  it('taşma KAPATILABİLİR (spillChance = 0)', async () => {
    const cfg = placementConfig(worldId);
    setLiveSettings({ placement: { spillChance: 0 } });
    await fillBand(1, 4, cfg.capitalQuota);
    const hist = await sampleChoices(120, 14000);
    for (const g of hist.keys()) expect(g).toBeLessThanOrEqual(5);
  });
});

describe('yerleşim — ayarlar', () => {
  it('kuşak genişliği panelden değişiyor', async () => {
    setLiveSettings({ placement: { bandSize: 2 } });
    const hist = await sampleChoices(100, 15000);
    for (const g of hist.keys()) expect(g).toBeLessThanOrEqual(2);
  });

  it('başkent kotası panelden değişiyor', async () => {
    setLiveSettings({ placement: { capitalQuota: 1 } });
    for (let i = 0; i < 5; i++) await place(16000 + i);
    for (let d = 1; d <= 5; d++) {
      expect((await districtStats(d)).cities).toBeLessThanOrEqual(1);
    }
  });
});

describe('yerleşim — dağılım (150 kayıt)', () => {
  it('⭐ kuşaklar SIRAYLA dolar, kota aşılmaz, dünya saçılmaz', async () => {
    const cfg = placementConfig(worldId);
    for (let i = 0; i < 150; i++) await place(20000 + i);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT d, COUNT(*) FILTER (WHERE is_capital)::int AS baskent
        FROM cities WHERE world_id = ${worldId} AND k = 1 GROUP BY d ORDER BY d
    `);
    for (const r of rows) expect(Number(r['baskent'])).toBeLessThanOrEqual(cfg.capitalQuota);

    /**
     * ⭐ ASIL İDDİA — eski modelin arızasının bekçisi. Kuşak kapasitesi 5×3 = 15, yani 150
     * oyuncu ~10 kuşak = ~50 diyar demek. Eski model bunu yüzlerce diyara yayıyordu.
     * Üst sınır taşma payı için cömert tutuldu.
     */
    const enUzak = Math.max(...rows.map((r) => Number(r['d'])));
    expect(enUzak).toBeLessThanOrEqual(70);

    // İlk kuşak gerçekten DOLMUŞ olmalı — kimse boşluğa atlamamış.
    const ilkKusak = rows.filter((r) => Number(r['d']) <= 5)
      .reduce((a, r) => a + Number(r['baskent']), 0);
    expect(ilkKusak).toBe(5 * cfg.capitalQuota);
  });
});

