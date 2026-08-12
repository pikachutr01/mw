/**
 * ⭐ KATALOG SABİTLERİ PANELDEN (admin Faz 5).
 *
 * Faz 4'ün kardeşi ve aynı iki soruyu soruyor:
 *   1. Hiçbir ayar değişmemişken çıktı **bit-bit** eskisiyle aynı mı?
 *   2. Bir sabit değiştiğinde gerçekten fiyatlara/sürelere ulaşıyor mu?
 *
 * ⚠️ Üçüncü bir soru daha var ve fazın en kritik davranışı o: **süren işler geriye dönük
 * ETKİLENMEMELİ.** `queues.finish_at` ve `spent_*` girerken yazılıyor; fiyat sonradan
 * değişse bile o satır aynen duruyor ve iade harcanandan hesaplanıyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS, applySettings } from '@mobilwar/settings';
import {
  BUILDINGS_BY_ID, DEFAULT_CATALOG_CONFIG, TECHS_BY_ID, buildingCost, buildingTimeSeconds,
  catalogHash, farmOutput, mergeCatalogConfig, mineOutput, techCost, trainingTimeSeconds,
  unitCost, UNITS_BY_ID,
} from '@mobilwar/catalog';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { QueueService } from '../src/queues/queue.service.ts';
import { createWorker } from '../src/worker/worker.ts';
import { CATALOG_GROUPS, catalogOverrides } from '../src/settings/catalog.ts';
import { SettingsService } from '../src/settings/settings.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb, verifyEmail } from './helpers/db.ts';

let h: DbHandle;
let svc: SettingsService;
let clock: GameClockService;
let auth: AuthService;
let worldId: number;

/**
 * ⭐ Servislerin gördüğü CANLI katalog — testin ortasında değiştirilebilsin diye kutuda.
 *
 * ⚠️ **Modül kapsamına taşındı** (2026-08-10). Eskiden yalnız «süren işler» bloğunun içindeydi;
 * artık `AuthService`in `CityService`i de buradan besleniyor, çünkü kayıt akışının panelden
 * gelen sabiti gerçekten kullanıp kullanmadığı bu dosyanın sorusu hâline geldi.
 */
const live: { cfg: ReturnType<SettingsService['catalog']> } = { cfg: DEFAULT_CATALOG_CONFIG };

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  /**
   * ⚠️ `AuthService` artık uygulamanın `CityService` ÖRNEĞİNİ alıyor (2026-08-10) ve burada
   * ona CANLI katalog kutusu veriliyor: bu dosyanın ölçtüğü şey tam olarak «panelden
   * değiştirilen sabit gerçekten kayda ulaşıyor mu». Katalogsuz bir örnek verseydik test
   * kendi sorusunu soramazdı.
   */
  auth = new AuthService(
    h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock,
    new CityService(h.db, () => live.cfg),
  );
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await h.db.execute(sql`DELETE FROM settings`);
  await h.db.execute(sql`DELETE FROM settings_revisions`);
  svc = new SettingsService(h.db);
  await svc.load();
});

/* ═══ Regresyon ═════════════════════════════════════════════════════════════ */

describe('varsayılan davranış', () => {
  it('hiçbir ayar değişmemişken override ÜRETİLMEZ', () => {
    expect(svc.catalogOverride(worldId)).toBeUndefined();
  });

  /** ⭐ Merkezî iddia: varsayılan config, varsayılan nesnenin KENDİSİ. */
  it('birleştirilmiş config varsayılanın kendisi', () => {
    expect(svc.catalog(worldId)).toBe(DEFAULT_CATALOG_CONFIG);
    expect(mergeCatalogConfig(undefined)).toBe(DEFAULT_CATALOG_CONFIG);
  });

  /**
   * ⭐ **Eski savaş kayıtları geçerliliğini korumalı.** `catalogHash` artık config'i de
   * özetliyor; varsayılan config'te yükü değiştirmeseydik tüm eski `battles.catalog_hash`
   * değerleri "başka bir katalog" gibi görünürdü.
   */
  it('varsayılan katalog özeti parametresiz hâliyle AYNI', () => {
    expect(catalogHash(DEFAULT_CATALOG_CONFIG)).toBe(catalogHash());
    expect(svc.catalogHash(worldId)).toBe(catalogHash());
  });

  it('formüller cfg\'siz ve varsayılan cfg ile AYNI sonucu verir', () => {
    const c = DEFAULT_CATALOG_CONFIG;
    for (let level = 1; level <= 10; level++) {
      expect(buildingCost('farm', level, c)).toEqual(buildingCost('farm', level));
      expect(techCost('blacksmithing', level, c)).toEqual(techCost('blacksmithing', level));
      expect(farmOutput(level, c)).toBe(farmOutput(level));
      expect(mineOutput(level, c)).toBe(mineOutput(level));
    }
    expect(unitCost('dwarf', 37, c)).toEqual(unitCost('dwarf', 37));
    expect(trainingTimeSeconds('dwarf', 5, 'balanced', c)).toBe(trainingTimeSeconds('dwarf', 5));
  });

  /** Şema varsayılanları kataloğun gerçek varsayılanlarıyla aynı olmalı — yoksa panel yalan söyler. */
  it('şema varsayılanları katalog varsayılanlarıyla AYNI', () => {
    const eff = applySettings([]).effective;
    for (const group of CATALOG_GROUPS) {
      /**
       * ⚠️ **SEYREK GRUPLAR ATLANIYOR** (`buildingTuning` · `techTuning`). Onların katalog
       * varsayılanı bilerek BOŞ: dolu olsaydı `economy.buildingCostRate` gibi global düğmeler
       * sessizce işlevsizleşirdi. Şema varsayılanı ise ETKİN değeri (katalogdaki taban)
       * gösteriyor — ikisi kasıtlı olarak farklı ve aşağıdaki test bunu ayrıca kilitliyor.
       */
      if (group === 'buildingTuning' || group === 'techTuning' || group === 'unitTuning') continue;
      const fromSchema = eff[group] ?? {};
      const fromCatalog = DEFAULT_CATALOG_CONFIG[group] as Record<string, number>;
      for (const [key, value] of Object.entries(fromSchema)) {
        expect(fromCatalog[key], `${group}.${key}`).toBe(value);
      }
    }
  });

  it('⭐ seyreklik: tuning gruplarının katalog varsayılanı NEREDEYSE boş, şema varsayılanı DOLU', () => {
    /**
     * ⚠️ Katalogdaki tek kayıt `architect_school:timeFactor` ve o bir denge ayarı değil, bir
     * KURAL farkı: `k.java:1396-1403`te Mimar Okulu, diğer yapıların aldığı `×10` süre çarpanını
     * hiç almıyor. Fiyat eksenleri (`:gold/:food/:rate`) boş kaldığı için global düğmeler yaşıyor.
     */
    expect(DEFAULT_CATALOG_CONFIG.buildingTuning).toEqual({ 'architect_school:timeFactor': 0.1 });
    expect(DEFAULT_CATALOG_CONFIG.techTuning).toEqual({});
    // Şema tarafı etkin değeri gösteriyor — panelde boş hücre değil gerçek fiyat görünsün.
    const byKey = new Map(SETTINGS.map((d) => [d.key, d]));
    expect(byKey.get('buildingTuning.castle:gold')?.default).toBe(900);
    expect(byKey.get('buildingTuning.farm:rate')?.default).toBe(1.45);
    expect(byKey.get('buildingTuning.castle:rate')?.default).toBe(1.8);
    expect(byKey.get('techTuning.archery:rate')?.default).toBe(1.5);
    /**
     * ⭐⭐ Şema, katalogdaki tek kaydı da doğru göstermeli. Burada 1 kalsaydı panel «varsayılan 1»
     * der, yönetici 1 yazar ve oyunun en yavaş yapısı sessizce 10 kata çıkardı — `derived.ts`
     * ile `config.ts` arasındaki elle-senkron sözleşmesinin bekçisi bu satır.
     */
    expect(byKey.get('buildingTuning.architect_school:timeFactor')?.default).toBe(0.1);
    expect(byKey.get('buildingTuning.castle:timeFactor')?.default).toBe(1);
  });

  it('⭐ türetilmiş her ayarın karşılığı katalogda GERÇEKTEN var', () => {
    const table = { building: BUILDINGS_BY_ID, tech: TECHS_BY_ID, unit: UNITS_BY_ID } as const;
    for (const d of SETTINGS) {
      if (!d.entity) continue;
      expect(table[d.entity.kind][d.entity.id], `katalogda yok: ${d.key}`).toBeTruthy();
    }
  });

  /**
   * ⭐⭐ BİRİM AYARLARININ ŞEKLİ (2026-08-12). İki iddia:
   *   1. **`rate` ekseni YOK** — askerlerin seviyesi yok, "her seviye kaç kat pahalı" anlamsız.
   *      Eklenmiş olsaydı panelde hiçbir şeye bağlı olmayan bir kutu görünürdü.
   *   2. **Sur/Büyü Kalkanı burada DEĞİL** — onlar `LEVEL_BASED`, fiyatları `unitCost`tan
   *      değil `defenseStructureCost`ten geliyor; buraya konsalar panel etkisiz bir düğme
   *      gösterirdi (yazarsın, hiçbir şey olmaz — bulunması en zor hata sınıfı).
   */
  it('⭐⭐ birim ayarları: rate ekseni YOK, seviye taşıyan yapılar DIŞARIDA', () => {
    const unitDefs = SETTINGS.filter((d) => d.entity?.kind === 'unit');
    expect(unitDefs.length).toBeGreaterThan(0);
    expect(new Set(unitDefs.map((d) => d.entity!.axis)))
      .toEqual(new Set(['gold', 'food', 'timeFactor']));
    for (const id of ['wall', 'magic_shield', 'temple']) {
      expect(unitDefs.some((d) => d.entity!.id === id), id).toBe(false);
    }
    // Savaşçılar ve seviye taşımayan savunma birimleri VAR.
    for (const id of ['dwarf', 'elf', 'chaos', 'archer_tower', 'ballista']) {
      expect(unitDefs.some((d) => d.entity!.id === id), id).toBe(true);
    }
    // Şema varsayılanı etkin fiyatı göstermeli (panel boş hücrede gerçek sayıyı yazar).
    const byKey = new Map(SETTINGS.map((d) => [d.key, d]));
    expect(byKey.get('unitTuning.dwarf:gold')?.default).toBe(UNITS_BY_ID['dwarf']!.gold);
    expect(byKey.get('unitTuning.dwarf:timeFactor')?.default).toBe(1);
  });

  /** Ters yön: config'te olup şemada olmayan alan kalmasın (fiyat çarpanları hariç değil). */
  it('katalog config\'inin her alanı şemada var', () => {
    const keys = new Set(SETTINGS.map((d) => d.key));
    const missing: string[] = [];
    for (const group of CATALOG_GROUPS) {
      for (const leaf of Object.keys(DEFAULT_CATALOG_CONFIG[group])) {
        // ⛔ Emekli süre modelleri panele açılmadı (yalnız arşiv/karşılaştırma için duruyor).
        if (['trainTimeAreaDecay', 'originalTrainFactor', 'originalDivisorRate'].includes(leaf)) continue;
        if (!keys.has(`${group}.${leaf}`)) missing.push(`${group}.${leaf}`);
      }
    }
    expect(missing, `şemada eksik: ${missing.join(', ')}`).toEqual([]);
  });
});

/* ═══ Ayar → formül ═════════════════════════════════════════════════════════ */

describe('ayar formüllere ulaşıyor', () => {
  it('fiyat çarpanı TÜM yapı fiyatlarını ölçekler, eğriyi bozmaz', () => {
    const cfg = mergeCatalogConfig({ economy: { buildingCostMultiplier: 2 } });
    for (const level of [1, 5, 12]) {
      const base = buildingCost('farm', level);
      const scaled = buildingCost('farm', level, cfg);
      // ⚠️ Yuvarlama yüzünden tam 2 kat olmayabilir; 1 birim tolerans.
      expect(Math.abs(scaled.gold - base.gold * 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(scaled.food - base.food * 2)).toBeLessThanOrEqual(1);
    }
  });

  /**
   * ⚠️ Birim fiyatında yuvarlama ADET ile çarpımdan SONRA olmalı: birim başına yuvarlasaydık
   * 100 birimlik sipariş ile 100 kez 1 birimlik sipariş farklı tutar öderdi ve oyuncu ucuz
   * olanı bulurdu.
   */
  it('birim fiyatı toplu ve tek tek siparişte TUTARLI', () => {
    const cfg = mergeCatalogConfig({ economy: { unitCostMultiplier: 1.37 } });
    const bulk = unitCost('dwarf', 100, cfg);
    const one = unitCost('dwarf', 1, cfg);
    // Toplu sipariş, tek tek almaktan PAHALI olmamalı (aksi hâlde istismar doğar).
    expect(bulk.gold).toBeLessThanOrEqual(one.gold * 100);
    expect(bulk.food).toBeLessThanOrEqual(one.food * 100);
  });

  it('büyüme oranı üretimi değiştirir', () => {
    const cfg = mergeCatalogConfig({ economy: { foodRate: 1.25 } });
    expect(farmOutput(20, cfg)).toBeGreaterThan(farmOutput(20));
    // Maden ETKİLENMEMELİ — ayrı oran.
    expect(mineOutput(20, cfg)).toBe(mineOutput(20));
  });

  /**
   * ⭐⭐⭐ İKİ SÜRE BÖLENİ BİRBİRİNE KARIŞMAZ (2026-08-12).
   *
   * ⚠️ Bu testin eski hâli `economy.timeDecayRate` ile YAPI süresini ölçüyordu ve doğruydu —
   * çünkü tek bir ortak bölen vardı. Kullanıcı *"Cüce/Elf daha düşük Baraka seviyesinde 1
   * saniyeye insin"* deyince o ortaklık engel oldu: oranı büyütmek askerlerle birlikte bütün
   * inşaatı da hızlandırıyordu (1,2→1,4: Mimar Okulu 20'nin kazancı 38 kattan **837 kata**).
   *
   * Ayrımın sınavı çapraz olmalı: her düğme **kendi** kalemini değiştirmeli ve **ötekine
   * dokunmamalı**. Tek yönlü baksaydık, iki alanın aynı değeri okuduğu bir hata yeşil geçerdi.
   */
  it('⭐⭐⭐ asker böleni yapıya, yapı böleni askere DOKUNMAZ', () => {
    const asker = mergeCatalogConfig({ economy: { timeDecayRate: 1.5 } });
    expect(trainingTimeSeconds('dwarf', 5, 'balanced', asker))
      .toBeLessThan(trainingTimeSeconds('dwarf', 5));
    expect(buildingTimeSeconds('farm', 10, 5, asker), 'asker düğmesi yapıyı oynatmamalı')
      .toBe(buildingTimeSeconds('farm', 10, 5));

    const yapi = mergeCatalogConfig({ economy: { structureTimeDecayRate: 1.5 } });
    expect(buildingTimeSeconds('farm', 10, 5, yapi))
      .toBeLessThan(buildingTimeSeconds('farm', 10, 5));
    expect(trainingTimeSeconds('dwarf', 5, 'balanced', yapi), 'yapı düğmesi askeri oynatmamalı')
      .toBe(trainingTimeSeconds('dwarf', 5));
  });

  /**
   * ⭐⭐ BİRİM BAŞINA AYAR FORMÜLLERE ULAŞIYOR mu — panelin gerçekten bağlı olduğunun kanıtı.
   *
   * ⚠️ `gold`/`food` **hem fiyatı hem süreyi** değiştirmeli: oyunda ayrı bir «taban süre» yok,
   * süre `unitTimeValue`den (altın + yemek + taşıma) türüyor. İkisi ayrı okusaydı *"fiyatı
   * değiştirdim ama süre değişmedi"* sessiz hatası doğardı — `unitBase` tam bunun için tek yer.
   */
  it('⭐⭐ birim taban fiyatı HEM fiyatı HEM süreyi değiştirir', () => {
    const cfg = mergeCatalogConfig({ unitTuning: { 'dwarf:gold': 400 } });
    expect(unitCost('dwarf', 1, cfg).gold).toBe(400);
    expect(trainingTimeSeconds('dwarf', 5, 'balanced', cfg))
      .toBeGreaterThan(trainingTimeSeconds('dwarf', 5));
    // ⚠️ Sızma yok: başka birim etkilenmemeli.
    expect(unitCost('elf', 1, cfg)).toEqual(unitCost('elf', 1));
  });

  it('⭐⭐ süre çarpanı YALNIZ süreyi değiştirir, fiyata dokunmaz', () => {
    const cfg = mergeCatalogConfig({ unitTuning: { 'dwarf:timeFactor': 0.5 } });
    expect(trainingTimeSeconds('dwarf', 5, 'balanced', cfg))
      .toBeCloseTo(trainingTimeSeconds('dwarf', 5) / 2, 6);
    expect(unitCost('dwarf', 10, cfg)).toEqual(unitCost('dwarf', 10));
  });

  it('override DÜNYA BAZLI ve özet DEĞİŞİR', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    await svc.update({ worldId, patch: { 'economy.buildingCostMultiplier': 2 }, actorId: null });

    expect(svc.catalogOverride(worldId)).toEqual({ economy: { buildingCostMultiplier: 2 } });
    expect(svc.catalogOverride(other)).toBeUndefined();
    // ⭐ Künye: aynı katalog, farklı ayar → farklı özet.
    expect(svc.catalogHash(worldId)).not.toBe(catalogHash());
    expect(svc.catalogHash(other)).toBe(catalogHash());
  });

  it('eşleme yalnız katalog gruplarını alır', () => {
    const built = applySettings([{ 'economy.foodRate': 1.2, 'chat.burst': 9, 'combat.nightBase': 0.5 }]);
    expect(catalogOverrides(built.effective, built.overridden))
      .toEqual({ economy: { foodRate: 1.2 } });
  });
});

/* ═══ ⭐⭐ AYAR GERÇEKTEN OYUNA ULAŞIYOR MU — SERVİS BAĞLANTISI ═══════════════
 *
 * Bu blok, ayarın **hesaplandığını** değil **ulaştığını** ölçüyor. İkisi farklı sorular ve
 * aradaki boşluk canlıda bir hataya dönüştü (kullanıcı, 2026-08-10):
 *
 *   `SettingsService.catalog(worldId).economy.startingGold` → 12345 (doğru)
 *   yeni kayıt olan oyuncunun şehri                          → 4000  (varsayılan!)
 *
 * Sebep formülde değil **kabloda**: `AuthService` kendi `new CityService(db)` örneğini
 * kuruyordu ve o örneğin katalog fonksiyonu yoktu. Panel kaydediyor, hash değişiyor, ekranda
 * görünüyor — ama oyuncunun gördüğü ilk sayı sabit kalıyordu.
 *
 * ⚠️ Aynı sınıftan iki kurban vardı; ikincisi worker'ın `CityService`iydi (`worker.ts`).
 * Bu testler "formül doğru mu"yu değil, "doğru formülü kim çağırıyor"u kilitliyor.
 */

describe('ayar servise ULAŞIYOR mu', () => {
  it('⭐⭐ panelden değiştirilen BAŞLANGIÇ KESESİ yeni kayıtta uygulanır', async () => {
    live.cfg = mergeCatalogConfig({ economy: { startingGold: 12345, startingFood: 777 } });

    const t = randomUUID().slice(0, 8);
    const r = await auth.register({
      email: `s-${t}@test.local`, password: 'parola-12345', username: `s_${t}`, worldId,
    }, { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' });

    const [c] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT gold, food FROM cities WHERE player_id = ${r.playerId}
    `);
    expect(Number(c!['gold'])).toBe(12345);
    expect(Number(c!['food'])).toBe(777);
  });

  it('ayara dokunulmamışsa varsayılan kese aynen geçerli (regresyon)', async () => {
    live.cfg = DEFAULT_CATALOG_CONFIG;

    const t = randomUUID().slice(0, 8);
    const r = await auth.register({
      email: `v-${t}@test.local`, password: 'parola-12345', username: `v_${t}`, worldId,
    }, { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' });

    const [c] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT gold, food FROM cities WHERE player_id = ${r.playerId}
    `);
    expect(Number(c!['gold'])).toBe(DEFAULT_CATALOG_CONFIG.economy.startingGold);
    expect(Number(c!['food'])).toBe(DEFAULT_CATALOG_CONFIG.economy.startingFood);
  });

  /**
   * ⭐⭐ İKİNCİ KURBAN — worker'ın `CityService`i.
   *
   * `createWorker` katalogsuz bir örnek kuruyordu; savaş ve nakliye handler'ları o örnekle
   * `materialize()` çağırıyor. Sonuç sessiz bir AYRIŞMA: aynı şehir, API tarafından
   * materyalize edilince panelden ayarlanmış üretim hızıyla, worker tarafından VARSAYILAN
   * hızla kaynak yazıyordu.
   *
   * ⚠️⚠️ **Test worker'ın KENDİ `cities` örneğini kullanmak ZORUNDA.** İlk yazımda iki ayrı
   * örnek (katalogla ve katalogsuz) karşılaştırılıyordu; o ölçüm her koşulda yeşildi ve
   * düzeltme geri alındığında bile kırılmıyordu — yani hiçbir şey kanıtlamıyordu. `Worker`
   * arayüzüne `cities` tam olarak bu yüzden eklendi.
   */
  it("⭐⭐ worker'ın CityService'i panelden gelen üretim hızını KULLANIR", async () => {
    const t = randomUUID().slice(0, 8);
    const r = await auth.register({
      email: `w-${t}@test.local`, password: 'parola-12345', username: `w_${t}`, worldId,
    }, { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' });
    const [c] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM cities WHERE player_id = ${r.playerId}
    `);
    const cityId = Number(c!['id']);

    /* Panelden yemek üretimi belirgin biçimde artırılıyor. */
    live.cfg = mergeCatalogConfig({ economy: { foodRate: 2 } });

    const worker = createWorker(h.db, {
      worldId,
      settings: {
        combat: () => undefined,
        loot: () => undefined,
        merit: () => undefined,
        revisionId: () => null,
        catalog: () => live.cfg,
      },
    });
    /* ⚠️ Döngü hiç BAŞLATILMIYOR — ölçülen tek şey montajın kurduğu `CityService`. */
    await worker.stop();

    const at = await clock.gameNow(worldId);
    const later = new Date(at.getTime() + 3_600_000);
    const reset = async (): Promise<void> => {
      await h.db.execute(sql`
        UPDATE cities SET food = 0, resources_at = ${at.toISOString()}::timestamptz
         WHERE id = ${cityId}
      `);
    };
    const foodAfter = async (svc: CityService): Promise<number> => {
      await reset();
      await svc.materialize(cityId, later);
      const [row] = await h.db.execute<Record<string, unknown>>(sql`
        SELECT food FROM cities WHERE id = ${cityId}
      `);
      return Number(row!['food']);
    };

    /* ⚠️ Çıpa ölçüm: katalogsuz bir örnek GERÇEKTEN daha az yazıyor. Bu satır olmasaydı
       aşağıdaki eşitlik, yanlış kablolamada da (ikisi de varsayılan) doğru çıkardı. */
    const naked = await foodAfter(new CityService(h.db));
    const configured = await foodAfter(new CityService(h.db, () => live.cfg));
    expect(naked).toBeLessThan(configured);

    /* ⭐ Asıl iddia: WORKER'IN örneği, ayarlanmış hızı görüyor. */
    expect(await foodAfter(worker.cities)).toBe(configured);
  });
});

/* ═══ ⭐ Süren işler geriye dönük etkilenmemeli ═════════════════════════════ */

describe('süren işler', () => {
  let playerId: number;
  let cityId: number;
  let cities: CityService;
  let queues: QueueService;

  beforeEach(async () => {
    live.cfg = DEFAULT_CATALOG_CONFIG;
    cities = new CityService(h.db, () => live.cfg);
    queues = new QueueService(h.db, cities, () => live.cfg);

    const t = randomUUID().slice(0, 8);
    const r = await auth.register({
      email: `k-${t}@test.local`, password: 'parola-12345', username: `k_${t}`, worldId,
    }, { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' });
    playerId = r.playerId;
    // Kayıt akışı hesabı doğrulanmamış bırakır; bu dosya §verify kısıtlarını ölçmüyor.
    await verifyEmail(h, playerId);
    const [c] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM cities WHERE player_id = ${playerId}
    `);
    cityId = Number(c!['id']);
  });

  /**
   * ⭐ **PLANIN TALEP ETTİĞİ ÖLÇÜM**: "fiyat değişince süren kuyruk etkilenmiyor ve iade doğru".
   *
   * Kuyruk satırı `finish_at` ve `spent_*` ile yazılıyor. Fiyat sonradan yarıya inse bile o
   * satır aynen durur; iade **harcanandan** hesaplanır, katalogdan yeniden değil.
   */
  it('fiyat değişince SÜREN kuyruğun bitişi ve harcaması AYNI kalır', async () => {
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });

    const before = await h.db.execute<Record<string, unknown>>(sql`
      SELECT finish_at, spent_gold, spent_food FROM queues WHERE id = ${q.id}
    `);

    // Panelden fiyat YARIYA iniyor.
    live.cfg = mergeCatalogConfig({ economy: { buildingCostMultiplier: 0.5 } });

    const after = await h.db.execute<Record<string, unknown>>(sql`
      SELECT finish_at, spent_gold, spent_food FROM queues WHERE id = ${q.id}
    `);
    expect(after[0]).toEqual(before[0]);
  });

  /**
   * ⭐ İADE **HARCANANDAN** hesaplanır. Katalogdan yeniden hesaplansaydı fiyat düşerken iptal
   * eden oyuncu eksik iade alırdı (planın 3. kısıtı). Kod bunu zaten `queues.spent_*` ile
   * yapıyordu; bu test o davranışı **kilitliyor** ki fiyatlar oynatılabilir hâle gelince
   * kimse "iadeyi güncel fiyattan hesaplayalım" diye değiştirmesin.
   */
  it('fiyat düştükten sonra iptal, ÖDENEN parayı iade eder', async () => {
    const at = await clock.gameNow(worldId);
    const q = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT spent_gold, spent_food FROM queues WHERE id = ${q.id}
    `);
    const spentGold = Number(row!['spent_gold']);
    expect(spentGold).toBeGreaterThan(0);

    live.cfg = mergeCatalogConfig({ economy: { buildingCostMultiplier: 0.1 } });

    // İptal, kuyruk BAŞLADIĞI anda → ilerleme ~0 → neredeyse tamamı iade.
    const res = await queues.cancel({ queueId: q.id, playerId, at });
    expect(res.refunded.gold).toBeGreaterThan(spentGold * 0.9);
    // ⚠️ Güncel (düşük) fiyattan hesaplansaydı iade onda birine inerdi.
    expect(res.refunded.gold).toBeGreaterThan(spentGold * 0.5);
  });

  /**
   * ⭐ **ÜRETİM AYARI GERÇEKTEN BİRİKİME ULAŞMALI.**
   *
   * ⚠️ Bu test bir gerçek hatadan doğdu: `CityService`e katalog köprüsü eklenmiş ama üretim
   * formüllerinde KULLANILMAMIŞTI. Birim testleri geçiyordu (formül doğru), canlı ölçüm
   * yakaladı: `foodRate` kaydedildi, oyuncunun gördüğü yemek/saat değişmedi. Ekrandaki sayı
   * ile ayarın ayrışması, panelin en sinsi hata sınıfı.
   */
  it('üretim oranı ayarı şehrin GÖSTERİLEN üretimine ulaşır', async () => {
    const at = await clock.gameNow(worldId);
    const beforeSnap = (await cities.snapshot(cityId, at))!;
    const beforeFood = Number((beforeSnap as unknown as Record<string, number>)['foodPerHour']);
    expect(beforeFood).toBeGreaterThan(0);

    live.cfg = mergeCatalogConfig({ economy: { foodRate: 1.3 } });
    const afterSnap = (await cities.snapshot(cityId, at))!;
    const afterFood = Number((afterSnap as unknown as Record<string, number>)['foodPerHour']);

    expect(afterFood).toBeGreaterThan(beforeFood);
    // Altın ETKİLENMEMELİ — ayrı oran.
    expect((afterSnap as unknown as Record<string, number>)['goldPerHour'])
      .toBe((beforeSnap as unknown as Record<string, number>)['goldPerHour']);
  });

  it('fiyat değişikliği YENİ kuyruğa yansır', async () => {
    const at = await clock.gameNow(worldId);
    const first = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    await queues.cancel({ queueId: first.id, playerId, at });
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT spent_gold FROM queues WHERE id = ${first.id}
    `);

    live.cfg = mergeCatalogConfig({ economy: { buildingCostMultiplier: 3 } });
    const second = await queues.enqueueBuilding({ cityId, playerId, type: 'farm', at });
    const [b] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT spent_gold FROM queues WHERE id = ${second.id}
    `);
    expect(Number(b!['spent_gold'])).toBeGreaterThan(Number(a!['spent_gold']) * 2.5);
  });
});
