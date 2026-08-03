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

describe('yerleşim — temel kurallar', () => {
  it('boş dünyada 1. kıtanın erken diyarlarına düşer', async () => {
    const c = await place(1);
    expect(c.k).toBe(1);
    // Açık cephe en az 8 diyar; oyuncu bunun içinde bir yere düşmeli.
    expect(c.d).toBeLessThanOrEqual(placementConfig().minOpenDistricts);
    expect(c.s).toBeGreaterThanOrEqual(1);
    expect(c.s).toBeLessThanOrEqual(WORLD_SHAPE.citiesPerDistrict);
  });

  /**
   * ⭐ ASIL ŞİKÂYET BUYDU: 1:1:1'den sonra 1:1:2 geliyordu.
   * Ölçüm tek bir çağrıya değil, arka arkaya 12 kayda bakıyor — ardışık indeksler bir
   * ARTIŞ ZİNCİRİ oluşturuyorsa algoritma hâlâ sıralı demektir.
   */
  it('⭐ arka arkaya kayıtlar ARDIŞIK şehir yerlerine dizilmez', async () => {
    const list: { k: number; d: number; s: number }[] = [];
    for (let i = 0; i < 12; i++) list.push(await place(100 + i));

    const idx = list.map((c) => (districtIndex(c.k, c.d) - 1) * WORLD_SHAPE.citiesPerDistrict + c.s);
    let ardisik = 0;
    for (let i = 1; i < idx.length; i++) if (idx[i]! === idx[i - 1]! + 1) ardisik++;

    // Eski algoritmada bu sayı 11/11 olurdu.
    expect(ardisik).toBeLessThan(4);
    // Ve en az birkaç FARKLI diyara dağılmış olmalı.
    expect(new Set(list.map((c) => districtIndex(c.k, c.d))).size).toBeGreaterThanOrEqual(3);
  });

  it('aynı hesap + aynı dünya HEP aynı sonucu verir (tohumlu)', async () => {
    const a = await svc.pickCapital(worldId, 4242);
    const b = await svc.pickCapital(worldId, 4242);
    expect(b).toEqual(a);
    // Farklı hesap farklı tohum → (neredeyse kesin) farklı yer.
    const c = await svc.pickCapital(worldId, 4243);
    expect(`${c.k}:${c.d}:${c.s}`).not.toBe(`${a.k}:${a.d}:${a.s}`);
  });

  /**
   * ⭐ YOLDAKİ ŞEHİR KURMA GÖREVİ DE YER TUTAR (kullanıcı, 2026-08-03).
   *
   * Bir oyuncunun ordusu o koordinata şehir kurmaya gidiyorsa yeni oyuncu oraya doğmamalı;
   * yoksa gelen ordu `slot_taken` ile eli boş döner ve saatlerce süren sefer boşa gider.
   */
  it('⭐ şehir kurma görevinin hedefi BOŞ sayılmaz', async () => {
    setLiveSettings({ placement: { minOpenDistricts: 1, sampleSize: 1 } });

    // d1'in 10 yerinin 9'unu doldur, kalan tek yeri bir `found_city` görevine rezerve et.
    for (let s = 1; s <= 9; s++) {
      const pid = await newPlayer(`dolgu${s}`);
      await h.db.execute(sql`
        INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital, gold, food, resources_at)
        VALUES (${worldId}, ${pid}, ${`dolgu${s}`}, 1, 1, ${s}, false, 0, 0, now())
      `);
    }
    const ownerId = await newPlayer('kurucu');
    await h.db.execute(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, target_k, target_d, target_s,
                            execute_at, payload)
      VALUES (${worldId}, 'found_city', 'scheduled', ${ownerId}, 1, 1, 10,
              now() + interval '1 hour', '{}'::jsonb)
    `);

    // d1'in tek boş yeri (s=10) rezerve → yerleşim oraya DÜŞMEMELİ.
    const c = await svc.pickCapital(worldId, 61_000);
    expect(`${c.k}:${c.d}:${c.s}`).not.toBe('1:1:10');
  }, 60_000);

  it('aynı koordinat İKİ KEZ verilmez', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const c = await place(200 + i);
      const key = `${c.k}:${c.d}:${c.s}`;
      expect(seen.has(key), `tekrar eden koordinat: ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

describe('yerleşim — dağılım (200 kayıt)', () => {
  it('⭐ kota aşılmaz, dünya makul yayılır, kimse ıssız kalmaz', async () => {
    const cfg = placementConfig();
    const list: { k: number; d: number; s: number }[] = [];
    for (let i = 0; i < 200; i++) list.push(await place(1000 + i));

    const perDistrict = new Map<number, number>();
    for (const c of list) {
      const g = districtIndex(c.k, c.d);
      perDistrict.set(g, (perDistrict.get(g) ?? 0) + 1);
    }
    const counts = [...perDistrict.values()];

    // 1) KOTA SERT SINIR — aşılmamalı.
    expect(Math.max(...counts)).toBeLessThanOrEqual(cfg.capitalQuota);

    /**
     * 2) YAYILMA — 200 oyuncu için cephe ~67 diyar (200 / (0,6 × 5)). Hepsi tek diyara
     *    yığılmamalı ama 200 ayrı diyara da dağılmamalı.
     */
    expect(perDistrict.size).toBeGreaterThan(40);
    expect(perDistrict.size).toBeLessThan(140);

    /**
     * 3) ⭐ KOMŞULUK — Gauss tercihinin ölçülebilir izi: tek başına oturan (n=1) diyarların
     *    oranı düşük olmalı. Saf rastgele dağıtımda bu oran çok daha yüksek çıkardı.
     */
    const yalniz = counts.filter((n) => n === 1).length;
    expect(yalniz / counts.length).toBeLessThan(0.5);

    // 4) Hepsi 1. kıtada ve erken diyarlarda kalmalı (cephe bir ÖNEK).
    expect(list.every((c) => c.k === 1)).toBe(true);
    expect(Math.max(...list.map((c) => c.d))).toBeLessThanOrEqual(
      Math.max(cfg.minOpenDistricts, Math.ceil(201 / (cfg.targetOccupancy * cfg.capitalQuota))),
    );
  }, 120_000);
});

describe('yerleşim — ayarlar', () => {
  it('kota panelden kısılınca dağılım gerçekten seyreliyor', async () => {
    setLiveSettings({ placement: { capitalQuota: 2 } });
    const list: { k: number; d: number; s: number }[] = [];
    for (let i = 0; i < 30; i++) list.push(await place(3000 + i));

    const perDistrict = new Map<number, number>();
    for (const c of list) {
      const g = districtIndex(c.k, c.d);
      perDistrict.set(g, (perDistrict.get(g) ?? 0) + 1);
    }
    expect(Math.max(...perDistrict.values())).toBeLessThanOrEqual(2);
  }, 60_000);

  /**
   * ⭐ GÜÇ UYUMU (§13.6.3 C) — yeni oyuncu, güçlü oyuncuların yanına düşmeyi tercih etmemeli.
   *
   * ⚠️ Ölçüm YUMUŞAK: çarpan bir ağırlık, sert dışlama değil. "Asla oraya düşmez" denmiyor;
   * ölçülen şey, güçlü çevrenin bulunduğu diyarın **daha az** seçilmesi.
   *
   * ⚠️ **DİYARLAR BİTİŞİK OLMAMALI.** İlk kurgum d1 (dev) ve d2 (temiz) idi ve test düştü:
   * tehdit bilerek KOMŞU diyarları da kapsıyor (sefer süreleri komşu diyarı zaten ulaşılabilir
   * kılıyor), yani d2 de devi "kendi çevresinde" görüyordu ve iki diyarın C'si eşit çıkıyordu.
   * Ayrıca d1'in bir başkenti olduğu için B çarpanı ONU kayırıyordu — test aslında komşuluk
   * tercihinin çalıştığını ölçmüş oldu. Doğru kurgu: uzak diyarlar + eşit başkent sayısı,
   * böylece A ve B sabitlenir ve geriye yalnız C kalır.
   */
  it('⭐ güç uyumu: dev komşuluğu olan diyar daha az seçilir', async () => {
    setLiveSettings({
      placement: { minOpenDistricts: 6, capitalQuota: 40, targetOccupancy: 1, sampleSize: 60 },
    });

    // d1'e dev, d5'e sıradan oyuncu — ikisi de TEK başkent (B eşit), komşulukları AYRIK.
    const mk = async (_account: number, name: string, score: number, d: number): Promise<void> => {
      const pid = await newPlayer(name, score);
      await h.db.execute(sql`
        INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital, gold, food, resources_at)
        VALUES (${worldId}, ${pid}, ${name}, 1, ${d}, 1, true, 0, 0, now())
      `);
    };
    await mk(90001, 'dev', 5_000_000, 1);
    await mk(90002, 'sade', 0, 5);

    /**
     * ⚠️ Seçim ölçülüyor, YERLEŞTİRME yapılmıyor: her ekleme A ve B'yi değiştirir ve ölçüm
     * kendi kendini bozardı. Dünya sabit, yalnız tohum değişiyor.
     */
    let devDiyari = 0;
    let sadeDiyar = 0;
    for (let i = 0; i < 60; i++) {
      const c = await svc.pickCapital(worldId, 50_000 + i);
      if (c.d === 1) devDiyari++;
      if (c.d === 5) sadeDiyar++;
    }
    expect(sadeDiyar).toBeGreaterThan(devDiyari);
  }, 60_000);

  it('güç uyumu KAPATILABİLİR (threatExponent = 0)', async () => {
    setLiveSettings({ placement: { threatExponent: 0 } });
    // Kapalıyken de geçerli bir koordinat üretmeli — tek beklenti bu.
    const c = await svc.pickCapital(worldId, 777);
    expect(c.k).toBeGreaterThanOrEqual(1);
    expect(c.s).toBeGreaterThanOrEqual(1);
  });
});
