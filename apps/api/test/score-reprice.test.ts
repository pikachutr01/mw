/**
 * ⭐⭐ FİYAT DEĞİŞİMİNDE YENİDEN FİYATLAMA (2026-08-14).
 *
 * Kullanıcının sorusu: *"tekniklerin taban fiyatlarını aşağı çektim; önceden pahalıyken alan
 * oyuncu fazla puanlı kalıyor mu, bu bir dengesizlik mi?"* Cevap: evet ve asıl kusur daha
 * derindeydi — **alacak ödeme anındaki, borç bugünkü fiyattan** işleniyordu.
 *
 * Bu dosyanın kilitlediği değişmez koşul TEK cümle:
 *
 * > Oyuncunun HÂLÂ SAHİP OLDUĞU her varlığın `score_base` içindeki payı, o varlığın BUGÜNKÜ
 * > katalog bedeline eşittir. Tüketilmiş şeylerin (ölen ordu, iptal edilen sipariş, terk
 * > edilen şehir) payı tarihsel kalır.
 *
 * Bozulduğunda ekranda **makul ama yanlış** bir sayı görünür: kimse "puanım 12 fazla" demez,
 * sıralama sessizce yanlış olur. O yüzden testler sayıyı değil **simetriyi** ölçüyor:
 * al → yeniden fiyatla → tamamını kaybet → taban tam olarak başladığı yere dönmeli.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILDINGS, DEFAULT_CATALOG_CONFIG, TECHS, UNITS, buildingCost, defenseStructureCost,
  mergeCatalogConfig, techCost, unitCost, type CatalogConfig,
} from '@mobilwar/catalog';
import { SETTINGS } from '@mobilwar/settings';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { catalogOverrides } from '../src/settings/catalog.ts';
import {
  addScoreBase, addScoreBaseBulk, debitLosses, holdingsValue,
  recomputeScoreBaseFromHoldings, repriceWorld, scoreValue,
} from '../src/scoring/score.service.ts';
import { affectsPrices } from '../src/scoring/reprice.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb, verifyEmail } from './helpers/db.ts';

let h: DbHandle;
let auth: AuthService;
let worldId: number;

const CFG0 = DEFAULT_CATALOG_CONFIG;
const HALF_UNITS = mergeCatalogConfig({ economy: { unitCostMultiplier: 0.5 } });
const DOUBLE_UNITS = mergeCatalogConfig({ economy: { unitCostMultiplier: 2 } });

beforeAll(async () => {
  h = await setupTestDb();
  const clock = new GameClockService(h.db);
  auth = new AuthService(
    h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock,
    new CityService(h.db),
  );
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
});

async function newPlayer(): Promise<{ playerId: number; cityId: number }> {
  const t = randomUUID().slice(0, 8);
  const r = await auth.register(
    { email: `rp-${t}@test.local`, password: 'parola-12345', username: `rp_${t}`, worldId },
    { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' },
  );
  await verifyEmail(h, r.playerId);
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT id FROM cities WHERE player_id = ${r.playerId}
  `);
  return { playerId: r.playerId, cityId: Number(rows[0]!['id']) };
}

async function base(playerId: number): Promise<number> {
  const r = await h.db.execute<Record<string, unknown>>(sql`
    SELECT score_base FROM players WHERE id = ${playerId}
  `);
  return Number(r[0]!['score_base']);
}

async function setRow(
  table: 'units' | 'cave_units' | 'defenses', cityId: number, type: string, n: number,
): Promise<void> {
  /**
   * ⚠️ `ON CONFLICT (city_id, type)` — `ON CONSTRAINT <ad>` DEĞİL. Şemada bunlar
   * `uniqueIndex(...)` ile kuruluyor, yani adlandırılmış bir *constraint* değil *indeks*;
   * `ON CONSTRAINT units_pk` çalışma zamanında "does not exist" ile patlıyor.
   */
  const t = sql.raw(table);
  await h.db.execute(sql`
    INSERT INTO ${t} (city_id, type, count) VALUES (${cityId}, ${type}, ${n})
    ON CONFLICT (city_id, type) DO UPDATE SET count = ${n}
  `);
}

/** Seferdeki ordu: bir görev + `mission_units` satırı. */
async function sendOnMission(
  playerId: number, cityId: number, type: string, n: number, status = 'scheduled',
): Promise<void> {
  const m = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, execute_at)
    VALUES (${worldId}, 'attack', ${status}, ${playerId}, ${cityId}, now() + interval '1 hour')
    RETURNING id
  `);
  await h.db.execute(sql`
    INSERT INTO mission_units (mission_id, unit_type, count)
    VALUES (${Number(m[0]!['id'])}, ${type}, ${n})
  `);
}

const unitBase = (type: string, n: number, cfg: CatalogConfig): number =>
  scoreValue(unitCost(type, n, cfg));

describe('yeniden fiyatlama — simetri', () => {
  /**
   * ⭐ ASIL İDDİA. Düzeltme olmadan: taban `X/2` kalıyordu, yani **var olmayan bir ordudan
   * artakalan puan** — "indirimden sonra ordunu öldür" puan-pozitif bir hamle oluyordu.
   */
  it('fiyat yarıya inince ordu değeri yarılanır ve ölünce taban TAM SIFIRA döner', async () => {
    const { playerId, cityId } = await newPlayer();
    const N = 120;
    await setRow('units', cityId, 'dwarf', N);
    // Oyuncu bu orduyu ESKİ fiyattan almıştı:
    await addScoreBase(h.db as never, worldId, playerId, unitBase('dwarf', N, CFG0));
    expect(await base(playerId)).toBeCloseTo(unitBase('dwarf', N, CFG0), 6);

    const n = await repriceWorld(h.db, worldId, CFG0, HALF_UNITS);
    expect(n).toBe(1);
    expect(await base(playerId)).toBeCloseTo(unitBase('dwarf', N, HALF_UNITS), 6);

    // Ordu savaşta tamamen yok olur → `debitLosses` BUGÜNKÜ (yeni) fiyattan düşer.
    await debitLosses(h.db as never, worldId, playerId, { dwarf: N }, HALF_UNITS);
    expect(await base(playerId)).toBeCloseTo(0, 6);
  });

  /**
   * ⚠️ Ters yön daha tehlikeliydi: fiyat artınca ölen ordu kazandırdığından fazlasını götürüyor,
   * `GREATEST(0,…)` kelepçesi yüzünden oyuncu başka yerden kazandığı puanı da kaybediyordu.
   */
  it('fiyat iki katına çıkınca taban artar ve ölünce yine TAM SIFIRA döner', async () => {
    const { playerId, cityId } = await newPlayer();
    const N = 90;
    await setRow('units', cityId, 'elf', N);
    await addScoreBase(h.db as never, worldId, playerId, unitBase('elf', N, CFG0));

    await repriceWorld(h.db, worldId, CFG0, DOUBLE_UNITS);
    expect(await base(playerId)).toBeCloseTo(unitBase('elf', N, DOUBLE_UNITS), 6);

    await debitLosses(h.db as never, worldId, playerId, { elf: N }, DOUBLE_UNITS);
    expect(await base(playerId)).toBeCloseTo(0, 6);
  });

  /**
   * ⭐ "Yalnız HÂLÂ SAHİP OLUNANLAR" kuralı. Kaybedilmiş ordunun bıraktığı geçmiş
   * `score_base`de kalmalı — `recomputeScoreBaseFromHoldings`in aksine bu kanca tabanı
   * sıfırdan YAZMIYOR, yalnız farkı işliyor.
   */
  it('kaybedilmiş ordunun geçmişi yeniden fiyatlamadan ETKİLENMEZ', async () => {
    const { playerId, cityId } = await newPlayer();
    // Geçmişte harcanıp savaşta tamamen kaybedilmiş bir yatırım (elde hiçbir şey yok):
    await addScoreBase(h.db as never, worldId, playerId, 500_000);
    await setRow('units', cityId, 'dwarf', 0);

    const before = await base(playerId);
    const n = await repriceWorld(h.db, worldId, CFG0, HALF_UNITS);
    expect(n).toBe(0);                                   // oynatılacak satır yok
    expect(await base(playerId)).toBeCloseTo(before, 6);
  });
});

describe('yeniden fiyatlama — ordunun DURDUĞU her yer', () => {
  /**
   * ⚠️ `cave_units` eski `holdingsValue`da HİÇ okunmuyordu. Bu yalnız yeniden fiyatlamayı
   * değil, yönetici panelindeki «puanı yeniden hesapla» düğmesini de bozuyordu.
   */
  it('MAĞARADAKİ ordu da yeniden fiyatlanır', async () => {
    const { playerId, cityId } = await newPlayer();
    const N = 200;
    await setRow('cave_units', cityId, 'dwarf', N);
    await addScoreBase(h.db as never, worldId, playerId, unitBase('dwarf', N, CFG0));

    await repriceWorld(h.db, worldId, CFG0, HALF_UNITS);
    expect(await base(playerId)).toBeCloseTo(unitBase('dwarf', N, HALF_UNITS), 6);
  });

  /** ⚠️ REGRESYON: aynı boşluk canlıda bir hataydı — düğme mağaradaki orduyu siliyordu. */
  it('«puanı yeniden hesapla» mağaradaki ordunun değerini ARTIK SİLMİYOR', async () => {
    const { playerId, cityId } = await newPlayer();
    await setRow('cave_units', cityId, 'dragon', 40);

    const written = await recomputeScoreBaseFromHoldings(h.db as never, worldId, playerId);
    expect(written).toBeCloseTo(unitBase('dragon', 40, CFG0), 6);
    expect(written).toBeGreaterThan(0);
  });

  /**
   * ⭐ Seferdeki orduyu dışarıda bırakmak muhasebe eksiği değil **sömürü** olurdu: fiyat
   * indirimini duyan oyuncu ordusunu uzun bir sefere yollayıp yeniden fiyatlamayı atlatır,
   * dönüşte şişik puanla otururdu. Zamanlamayı oyuncu kontrol ediyor.
   */
  it('SEFERDEKİ ordu da yeniden fiyatlanır', async () => {
    const { playerId, cityId } = await newPlayer();
    const N = 75;
    await sendOnMission(playerId, cityId, 'elf', N);
    await addScoreBase(h.db as never, worldId, playerId, unitBase('elf', N, CFG0));

    await repriceWorld(h.db, worldId, CFG0, HALF_UNITS);
    expect(await base(playerId)).toBeCloseTo(unitBase('elf', N, HALF_UNITS), 6);
  });

  /**
   * ⚠️ ÇİFT SAYMA KORUMASI. `mission_units` satırları varışta silinmiyor, dönüş görevine
   * taşınıyor; `status` süzgeci olmadan eve dönmüş ordu hem `units`ta hem burada sayılırdı.
   */
  it('BİTMİŞ görevin birlikleri sayılmaz (çift sayma koruması)', async () => {
    const { playerId, cityId } = await newPlayer();
    await setRow('units', cityId, 'elf', 50);              // ordu evde
    await sendOnMission(playerId, cityId, 'elf', 50, 'done'); // aynı ordunun bitmiş kaydı

    expect(await holdingsValue(h.db as never, playerId))
      .toBeCloseTo(unitBase('elf', 50, CFG0), 6);
  });
});

describe('yeniden fiyatlama — kapsam sınırları', () => {
  /** Sur `defenses.count` sütununda SEVİYE taşır (§13.11.1b) ve `buildingCostRate`e bağlıdır. */
  it('SEVİYE taşıyan savunma yapısı (Sur) doğru fiyatlanır', async () => {
    const { playerId, cityId } = await newPlayer();
    await setRow('defenses', cityId, 'wall', 5);
    const cum = (cfg: CatalogConfig): number => {
      let t = 0;
      for (let l = 1; l <= 5; l++) t += scoreValue(defenseStructureCost('wall', l, cfg));
      return t;
    };
    await addScoreBase(h.db as never, worldId, playerId, cum(CFG0));

    const cfgB = mergeCatalogConfig({ economy: { buildingCostMultiplier: 2 } });
    await repriceWorld(h.db, worldId, CFG0, cfgB);
    expect(await base(playerId)).toBeCloseTo(cum(cfgB), 6);
  });

  /** Hediye seviyeler iki değerlemede de aynı alt sınırdan başlar → fark tam 0. */
  it('hiç oynamamış oyuncuda (yalnız başlangıç yapıları) delta TAM SIFIR', async () => {
    const { playerId } = await newPlayer();
    expect(await base(playerId)).toBe(0);

    const cfgB = mergeCatalogConfig({ economy: { buildingCostMultiplier: 3 } });
    const n = await repriceWorld(h.db, worldId, CFG0, cfgB);
    expect(n).toBe(0);
    expect(await base(playerId)).toBe(0);
  });

  /**
   * ⚠️ KUYRUK BİLEREK DIŞARIDA: `queues.spent_gold/spent_food` ödenen tutarı taşıyor ve iade
   * aynı sayıyı düşüyor → orada kredi/borç zaten simetrik.
   */
  it('kuyrukta bekleyen sipariş yeniden fiyatlanmaz', async () => {
    const { playerId, cityId } = await newPlayer();
    const paid = 12_345;
    await h.db.execute(sql`
      INSERT INTO queues (world_id, city_id, player_id, category, item_type, count,
                          started_at, finish_at, spent_gold, spent_food, position)
      VALUES (${worldId}, ${cityId}, ${playerId}, 'unit', 'dwarf', 10,
              now(), now() + interval '1 hour', ${paid}, 0, 1)
    `);
    await addScoreBase(h.db as never, worldId, playerId, paid);

    const n = await repriceWorld(h.db, worldId, CFG0, HALF_UNITS);
    expect(n).toBe(0);
    expect(await base(playerId)).toBeCloseTo(paid, 6);
  });

  it('başka dünyadaki oyuncuya dokunulmaz', async () => {
    const a = await newPlayer();
    await setRow('units', a.cityId, 'dwarf', 100);
    await addScoreBase(h.db as never, worldId, a.playerId, unitBase('dwarf', 100, CFG0));

    const otherWorld = freshWorldId();
    await createWorld(h, otherWorld);
    const savedWorld = worldId;
    worldId = otherWorld;
    const b = await newPlayer();
    await setRow('units', b.cityId, 'dwarf', 100);
    await addScoreBase(h.db as never, otherWorld, b.playerId, unitBase('dwarf', 100, CFG0));
    worldId = savedWorld;

    const untouched = await base(b.playerId);
    await repriceWorld(h.db, worldId, CFG0, HALF_UNITS);
    expect(await base(b.playerId)).toBeCloseTo(untouched, 6);
  });
});

describe('addScoreBaseBulk', () => {
  /**
   * ⚠️ `SET` ifadesi `addScoreBase` ile BİT BİT aynı olmak zorunda; ayrışırlarsa puanlar
   * yavaşça iki farklı kurala göre hesaplanır ve hata sessiz kalır.
   */
  it('tek tek `addScoreBase` ile AYNI sonucu verir', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    await addScoreBase(h.db as never, worldId, a.playerId, 7_777.5);
    await addScoreBaseBulk(h.db as never, worldId, new Map([[b.playerId, 7_777.5]]));
    expect(await base(a.playerId)).toBeCloseTo(await base(b.playerId), 6);

    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT score FROM players WHERE id IN (${a.playerId}, ${b.playerId})
    `);
    expect(Number(rows[0]!['score'])).toBe(Number(rows[1]!['score']));
  });

  it('taban asla negatife inmez (GREATEST kelepçesi)', async () => {
    const { playerId } = await newPlayer();
    await addScoreBase(h.db as never, worldId, playerId, 100);
    await addScoreBaseBulk(h.db as never, worldId, new Map([[playerId, -5_000]]));
    expect(await base(playerId)).toBe(0);
  });
});

/**
 * ⭐⭐ CI BEKÇİSİ — `PRICE_KEYS` elle tutulan bir liste ve bu depo elle tutulan tabloların
 * bayatladığını acı deneyimle biliyor (`settings/combat.ts:34`). Bu test şemadaki HER anahtarı
 * tek tek oynatıp dört fiyat fonksiyonunu çalıştırıyor ve `fiyatDeğişti === affectsPrices([k])`
 * olmasını istiyor. Yeni bir maliyet anahtarı listeye eklenmeden CI kırılır.
 */
describe('affectsPrices — diferansiyel bekçi', () => {
  /**
   * ⚠️ Parmak izi **TÜM** katalogu dolaşmak zorunda, örneklem DEĞİL. İlk yazımda beş yapı /
   * iki teknik / beş birim örneklenmişti ve test 44 sahte uyumsuzluk üretti: `cavalry:gold`
   * gerçekten fiyat değiştiriyordu ama parmak izi süvariye hiç bakmadığı için "değişmedi"
   * görünüyordu. Örneklem, tam da bu testin yakalaması gereken şeyi kör ediyor.
   */
  function priceFingerprint(cfg: CatalogConfig): string {
    const parts: string[] = [];
    for (const b of BUILDINGS) {
      for (let l = 1; l <= 5; l++) {
        const c = buildingCost(b.id, l, cfg);
        parts.push(`b:${b.id}:${l}:${c.gold}:${c.food}`);
      }
    }
    for (const t of TECHS) {
      for (let l = 1; l <= 4; l++) {
        const c = techCost(t.id, l, cfg);
        parts.push(`t:${t.id}:${l}:${c.gold}:${c.food}`);
      }
    }
    for (const u of UNITS) {
      // `n = 7` de var: `unitCost` yuvarlamayı adetle çarptıktan SONRA yapıyor.
      for (const n of [1, 7]) {
        const c = unitCost(u.id, n, cfg);
        parts.push(`u:${u.id}:${n}:${c.gold}:${c.food}`);
      }
    }
    for (const id of ['wall', 'magic_shield']) {
      for (let l = 1; l <= 4; l++) {
        const c = defenseStructureCost(id, l, cfg);
        parts.push(`d:${id}:${l}:${c.gold}:${c.food}`);
      }
    }
    return parts.join('|');
  }

  /** Anahtarı gerçekten oynatan, sınırlar içinde kalan bir değer. */
  function nudge(def: (typeof SETTINGS)[number]): number | boolean | null {
    if (def.type === 'boolean') return !(def.default as boolean);
    const cur = Number(def.default);
    const min = def.min ?? 0;
    const max = def.max ?? Number.MAX_SAFE_INTEGER;
    for (const cand of [cur * 1.37 + 1, cur * 0.61, cur + 1, cur - 1, min, max]) {
      const v = def.type === 'int' ? Math.round(cand) : cand;
      if (v !== cur && v >= min && v <= max) return v;
    }
    return null;
  }

  it('şemadaki HER anahtar için tahmin, gerçek fiyat değişimiyle örtüşür', () => {
    const baseline = priceFingerprint(DEFAULT_CATALOG_CONFIG);
    const mismatches: string[] = [];

    for (const def of SETTINGS) {
      const v = nudge(def);
      if (v === null) continue;
      const [group, leaf] = def.key.split('.') as [string, string];
      const cfg = mergeCatalogConfig(catalogOverrides({ [group]: { [leaf]: v } }, [def.key]));
      const changed = priceFingerprint(cfg) !== baseline;
      if (changed !== affectsPrices([def.key])) {
        mismatches.push(`${def.key} → gerçek:${changed} tahmin:${affectsPrices([def.key])}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('kahraman diriltme oranı fiyat anahtarı SAYILMAZ (asimetrisi yok)', () => {
    expect(affectsPrices(['economy.heroReviveCostRate'])).toBe(false);
  });

  it('süre çarpanları fiyat anahtarı sayılmaz', () => {
    expect(affectsPrices(['buildingTuning.castle:timeFactor'])).toBe(false);
    expect(affectsPrices(['unitTuning.dwarf:timeFactor'])).toBe(false);
    expect(affectsPrices(['economy.unitTimeFactor'])).toBe(false);
  });

  it('taban fiyat ve çarpanlar fiyat anahtarı SAYILIR', () => {
    expect(affectsPrices(['unitTuning.dwarf:gold'])).toBe(true);
    expect(affectsPrices(['buildingTuning.castle:rate'])).toBe(true);
    expect(affectsPrices(['economy.unitCostMultiplier'])).toBe(true);
    expect(affectsPrices(['chat.burst', 'economy.techCostMultiplier'])).toBe(true);
    expect(affectsPrices(['chat.burst'])).toBe(false);
  });
});
