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
 * ⚠️ YERLEŞTİRME YAPMAZ: her ekleme A ve B'yi değiştirir ve ölçüm kendi kendini bozardı.
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

describe('yerleşim — temel kurallar', () => {
  it('boş dünyada 1. kıtanın erken diyarlarına düşer', async () => {
    const c = await place(1);
    expect(c.k).toBe(1);
    // Açık cephe en az 8 diyar; oyuncu bunun içinde bir yere düşmeli.
    expect(c.d).toBeLessThanOrEqual(placementConfig(worldId).minOpenDistricts);
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
  /**
   * ⚠️ **Kurgu 2026-08-08'de değişti, sebebi öğretici.** Eskiden 9 yeri 9 FARKLI oyuncuyla
   * dolduruyordu; artık o diyar `neighborQuota` (5 komşu) filtresine takılıp tamamen elenir ve
   * test, `freeSlotIn`in rezervasyon kuralına hiç dokunmadan da geçerdi — yani ölçtüğünü
   * sandığı şeyi ölçmez olurdu. Doldurma TEK oyuncuya çevrildi: diyar aday kalıyor, tek boş
   * yeri (s=10) göreve rezerve, dolayısıyla tek doğru cevap **1:1:9**.
   */
  it('⭐ şehir kurma görevinin hedefi BOŞ sayılmaz', async () => {
    // ⚠️ `emptyReserve: 0` — rezerv açıkken cephe 13 diyara çıkar ve d1 tek aday olmaktan çıkar.
    setLiveSettings({ placement: { minOpenDistricts: 1, sampleSize: 1, emptyReserve: 0 } });

    // d1'in 10 yerinin 8'i TEK oyuncunun (komşu sayısı 1), 10. yer bir `found_city` görevinde.
    const dolgu = await newPlayer('dolgu');
    for (let s = 1; s <= 8; s++) await putCity(dolgu, 1, 1, s, false);

    const ownerId = await newPlayer('kurucu');
    await h.db.execute(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, target_k, target_d, target_s,
                            execute_at, payload)
      VALUES (${worldId}, 'found_city', 'scheduled', ${ownerId}, 1, 1, 10,
              now() + interval '1 hour', '{}'::jsonb)
    `);

    // Boş görünen iki yer var (9 ve 10); 10 rezerve → tek doğru cevap 9.
    const c = await svc.pickCapital(worldId, 61_000);
    expect(`${c.k}:${c.d}:${c.s}`).toBe('1:1:9');
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

/**
 * ⭐⭐ 2026-08-08 ONARIMI — canlıdaki arızanın yeniden üretimi ve bekçileri.
 *
 * Kullanıcı şikâyeti: *"kayıt olan herkes ilk 7 diyara doluşmuş; bazı diyarda 5 başkent,
 * bazısında 1. Bir sürü boş diyar varken 5. başkentin 4 başkentli diyara düşmesi çok çok
 * düşük ihtimal olmalı."*
 *
 * ⚠️⚠️ **Bu bloğun var olma sebebi, eski testlerin arızayı GÖREMEZ olmasıydı.** Dağılım
 * testleri her oyuncuyu `score = 0` ile yaratıyordu; o zaman tehdit çıpası 0 olur, kodun
 * `anchor <= 0 ? 1 : …` koruması devreye girer ve **güç uyumu her adayda 1 çıkar.** Yani
 * 200 kayıtlık test, canlıyı bozan çarpanı hiç çalıştırmamış. Arıza bölgesi — çıpa≈0 ve
 * tehdit≫0 — test takımından **yapısal olarak erişilemezdi.** Buradaki her kurgu bu yüzden
 * puanları AÇIKÇA veriyor.
 */
describe('yerleşim — canlı arızanın bekçileri (2026-08-08)', () => {
  /** Canlının 2026-08-08 künyesi: g=1..7'de 23 başkent / 34 şehir, iki dev, dokuz sıfır. */
  async function seedLiveWorld(): Promise<void> {
    // (diyar, başkent sayısı, toplam şehir) — canlıdan birebir.
    const layout: [d: number, capitals: number, cities: number][] = [
      [1, 5, 5], [2, 3, 3], [3, 4, 9], [4, 1, 1], [5, 3, 4], [6, 3, 3], [7, 4, 8],
    ];
    // İki dev g=3 ve g=7'de (canlıda EnKaZ0 11.037 ve ahmetbatar 13.232), gerisi düşük.
    const devDiyar = new Map([[3, 11_037], [7, 13_232]]);
    for (const [d, capitals, cities] of layout) {
      for (let i = 0; i < cities; i++) {
        const score = i === 0 ? (devDiyar.get(d) ?? 0) : 0;
        const pid = await newPlayer(`p${d}_${i}`, score);
        await putCity(pid, 1, d, i + 1, i < capitals);
      }
    }
  }

  /**
   * ⭐ ASIL ŞİKÂYET. Canlıda son üç kayıt (Sauron · SAVARONA · ShoWTiMe) **üçü de** g=1'e
   * düşüp diyarı 2 başkentten 5'e çıkarmıştı — hem de 5 başkentli diyar, ağırlık tablosunun
   * en tepesindeydi.
   */
  it('⭐ kalabalık diyarlar seçilmez, boş diyarlar seçilir', async () => {
    await seedLiveWorld();
    const hist = await sampleChoices(120, 700_000);

    // 1) Kotası dolmuş / kalabalık diyarlar (g=1: 5 oyuncu, g=3: 9, g=7: 8) HİÇ seçilmemeli.
    for (const g of [1, 3, 7]) {
      const stats = await districtStats(g);
      expect(stats.players, `g=${g} kurgu bozuk`).toBeGreaterThanOrEqual(5);
      expect(hist.get(g) ?? 0, `kalabalık g=${g} seçildi`).toBe(0);
    }

    // 2) Seçimlerin ezici çoğunluğu HENÜZ BOŞ diyarlara gitmeli (d ≥ 8).
    let bos = 0;
    for (const [g, n] of hist) if (g >= 8) bos += n;
    expect(bos / 120).toBeGreaterThan(0.7);

    // 3) Ve 8. diyarın ötesi gerçekten aday: canlıda cephe 8'de kilitliydi.
    expect(Math.max(...hist.keys())).toBeGreaterThan(8);
  }, 120_000);

  /**
   * ⭐ Kullanıcının sayısal beklentisi: *"bir sürü boş diyar varken beşinci şehrin 4 başkentli
   * bir diyara düşmesi ÇOK ÇOK DÜŞÜK ihtimal olmalı."* Onarım öncesi bu oran yalnız ~2 kattı.
   */
  it('⭐ 4 komşulu diyar, boş diyardan onlarca kat daha düşük ihtimalli', async () => {
    setLiveSettings({ placement: { minOpenDistricts: 12, emptyReserve: 0 } });
    // d1: 4 farklı oyuncunun başkenti (kota dolmadı, hâlâ aday). d2..d12: bomboş.
    for (let i = 0; i < 4; i++) {
      const pid = await newPlayer(`k${i}`, 0);
      await putCity(pid, 1, 1, i + 1, true);
    }

    const hist = await sampleChoices(200, 710_000);
    const dolu = hist.get(1) ?? 0;
    let bosToplam = 0;
    for (const [g, n] of hist) if (g > 1) bosToplam += n;
    const bosOrtalama = bosToplam / 11;

    // Aday sayısı eşitlense bile (11 boş diyar) dolu diyar en az 20 kat geride kalmalı.
    expect(bosOrtalama).toBeGreaterThan(dolu * 20);
  }, 120_000);

  /**
   * ⭐ KULLANICININ İKİNCİ İSTEĞİ: *"şehirler başkent olmasa bile bir diyarda diğer
   * oyuncuların diğer şehirleri varsa oraya da ilk kayıt anında başkent atanmaması gerekir,
   * çünkü çok kalabalık yapıyorlar."*
   *
   * ⚠️ Onarım öncesi sert filtre YALNIZ `capitals`e bakıyordu: 0 başkentli ama 5 yabancı
   * kolonili bir diyar pekâlâ aday sayılıyordu.
   */
  it('⭐ yabancı KOLONİLER de kalabalık sayılır (başkent olmasalar bile)', async () => {
    setLiveSettings({ placement: { minOpenDistricts: 12, emptyReserve: 0 } });
    // d1: 5 FARKLI oyuncunun kolonisi — hiç başkent yok.
    for (let i = 0; i < 5; i++) {
      const pid = await newPlayer(`kol${i}`, 0);
      await putCity(pid, 1, 1, i + 1, false);
    }
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*) FILTER (WHERE is_capital)::int AS caps
        FROM cities WHERE world_id = ${worldId} AND d = 1
    `);
    expect(Number(row?.['caps']), 'kurgu bozuk: başkent olmamalı').toBe(0);

    const hist = await sampleChoices(60, 720_000);
    expect(hist.get(1) ?? 0, 'kolonilerle dolu diyara başkent atandı').toBe(0);
  }, 120_000);

  /**
   * ⭐⭐ ASIL ARIZA: güç uyumu çarpanı (C) diğer ikisini eziyordu.
   *
   * Canlı rejim: 20 sıfır puanlı oyuncu + 1 dev → çıpa (medyan) **0'a yapışır**. Tehdit
   * milyonlarken oran patlar, C 1e-7'ye iner ve devin YANINDAKİ boş diyar fiilen seçilemez
   * olur. Onarım iki taraflı: çıpaya taban (`minThreatAnchor`) + C'ye alt sınır (`threatFloor`).
   *
   * ⚠️ Test yalnız düzeltilmiş hâli doğrulamıyor; **eski davranışı ayarlardan geri getirip**
   * ölçümün gerçekten ayrım yaptığını da gösteriyor. Aksi hâlde "geçti" sadece testin bu hata
   * sınıfına duyarsız olduğu anlamına gelebilirdi.
   */
  it('⭐ güç uyumu artık A ve B\'yi EZEMEZ (çıpa tabanı + alt sınır)', async () => {
    setLiveSettings({ placement: { minOpenDistricts: 8, emptyReserve: 0 } });

    /**
     * ⚠️⚠️ **ÇIPA KÜÇÜK OLMALI, SIFIR DEĞİL** — ilk yazımda 20 oyuncuya da 0 puan verdim ve
     * test düştü. Sebebi öğretici: medyan tam 0 olunca kodun `anchor <= 0 ? 1 : …` koruması
     * devreye giriyor ve güç uyumu **her adayda 1** çıkıyor, yani arıza rejimi hiç kurulmuyor.
     * Canlıdaki medyan **7** idi — sıfıra yakın ama sıfır değil. Kurgu onu taklit ediyor:
     * 0..20 arası puanlar → medyan 10.
     */
    for (let i = 0; i < 21; i++) await newPlayer(`kus${i}`, i);
    // d1'de bir dev → d2 onun komşusu (tehdit yüksek), d7 uzak (tehdit 0). İkisi de BOŞ.
    const dev = await newPlayer('dev', 5_000_000);
    await putCity(dev, 1, 1, 1, true);

    const bak = async (): Promise<{ yakin: number; uzak: number }> => {
      const hist = await sampleChoices(150, 730_000);
      return { yakin: hist.get(2) ?? 0, uzak: hist.get(7) ?? 0 };
    };

    const yeni = await bak();
    // Devin yanı hâlâ cezalı olmalı — ama kullanılamaz değil.
    expect(yeni.uzak).toBeGreaterThan(yeni.yakin);
    expect(yeni.yakin, 'devin yanındaki boş diyar fiilen seçilemez olmuş').toBeGreaterThan(0);
    expect(yeni.uzak / Math.max(1, yeni.yakin)).toBeLessThan(12);

    /**
     * ⚠️ Aynı ölçüm, iki emniyet ayardan kaldırılınca: bu ESKİ koddur. Devin yanındaki boş
     * diyar 150 denemede bir kez bile seçilmemeli — arızanın imzası tam olarak buydu.
     */
    setLiveSettings({
      placement: {
        minOpenDistricts: 8, emptyReserve: 0, minThreatAnchor: 0, threatFloor: 1e-12,
      },
    });
    const eski = await bak();
    expect(eski.yakin, 'eski davranış üretilemedi → ölçüm bu hataya duyarsız').toBe(0);
  }, 180_000);

  /**
   * ⭐ CEPHEDE BOŞ REZERV. Canlıda cephe `ceil(24/3) = 8` ile tam 8 diyarda kilitliydi:
   * 9. diyar ağırlık tablosunun tepesindeyken **aday bile değildi**. Rezerv bunu bir yan
   * etki olmaktan çıkarıp garantiye çeviriyor.
   */
  it('⭐ cephe, dolu diyarların ötesinde daima boş diyar bulundurur', async () => {
    await seedLiveWorld();                       // 7 dolu diyar, 23 başkent

    /**
     * ⚠️ Nüfus tabanı BİLEREK etkisizleştirildi (`targetOccupancy: 1` → diyar başına 5 başkent
     * → `ceil(24/5) = 5`). İlk yazımda varsayılan 0,3 ile bıraktım; nüfus tabanı 16 çıkıp
     * rezervi (13) gölgeledi ve test rezervi değil onu ölçüyordu. Ölçülecek terim yalnız
     * kalacak biçimde izole edilmeli.
     */
    setLiveSettings({
      placement: { emptyReserve: 6, minOpenDistricts: 1, targetOccupancy: 1 },
    });

    const hist = await sampleChoices(80, 740_000);
    const enUzak = Math.max(...hist.keys());
    // Cephe = dolu(7) + rezerv(6) = 13 diyar → seçimler 8..13 aralığına ulaşmalı, aşmamalı.
    expect(enUzak).toBeGreaterThanOrEqual(8);
    expect(enUzak).toBeLessThanOrEqual(13);

    // Rezerv kapatılınca cephe 7'ye (dolu diyar sayısı) düşmeli — ayarın bağlı olduğunun kanıtı.
    setLiveSettings({
      placement: { emptyReserve: 0, minOpenDistricts: 1, targetOccupancy: 1 },
    });
    const dar = await sampleChoices(80, 750_000);
    expect(Math.max(...dar.keys())).toBeLessThanOrEqual(7);
  }, 180_000);
});

describe('yerleşim — dağılım (200 kayıt)', () => {
  it('⭐ kota aşılmaz, dünya makul yayılır, kimse ıssız kalmaz', async () => {
    const cfg = placementConfig(worldId);
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
    /**
     * ⚠️ `emptyReserve: 0` (2026-08-08): rezerv açıkken cephe 14 diyara çıkıyor ve ölçülen iki
     * diyar, 12 boş diyarla ağırlık paylaşıyor — kıyas gürültüye boğulurdu. Rezervin kendi
     * bekçisi ayrı bir testte.
     */
    setLiveSettings({
      placement: {
        minOpenDistricts: 6, capitalQuota: 40, targetOccupancy: 1, sampleSize: 60,
        emptyReserve: 0,
      },
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
