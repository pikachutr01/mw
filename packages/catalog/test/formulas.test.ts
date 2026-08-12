/**
 * §13.8 doğrulanmış formüllerin regresyon testi.
 * Bu sayılar kullanıcının verdiği orijinal oyun tablolarından geliyor — değişirlerse denge bozulur.
 */
import { describe, expect, it } from 'vitest';
import {
  buildingCost, buildingTimeSeconds, castleBudget, caveCapacity, defenseCapacity,
  dwarvesToBreakCave, farmOutput, heroLevelForXp, heroReviveCost, heroReviveSeconds,
  clampName, heroXpForLevel, mergeCatalogConfig, mineOutput, NAME_MAX, NAME_MIN,
  STARTING_RESOURCES, teleportCooldownSeconds, USERNAME_MAX, USERNAME_MIN,
  wallCurrentIntegrity, wallRepairSeconds,
  timeFromCost, trainingTimeSeconds, unitCost, unitTimeValue, UNITS_BY_ID,
  BUILDINGS, BUILDINGS_BY_ID,
} from '../src/index.ts';

/**
 * ⭐⭐ SEVİYE TAVANI — **her yapıda 40** (kullanıcı, 2026-08-12).
 *
 * Eskiden yalnız Çiftlik/Maden 40, diğerleri 20 idi. Oyunu oynamış bir oyuncu barakasının
 * 20'den yüksek olduğunu net hatırlıyor; orijinalde diğer yapılar da 20'de durmuyormuş.
 */
describe('⭐⭐ yapı seviye tavanları', () => {
  /** ⚠️ Teleport TEK İSTİSNA (kullanıcı) — gerekçesi sayı taşması, aşağıdaki testte ölçülü. */
  it('Teleport dışında hepsi 40, Teleport 20', () => {
    for (const b of BUILDINGS) {
      expect(b.maxLevel, b.id).toBe(b.id === 'teleport' ? 20 : 40);
    }
  });

  /**
   * ⚠️ Tavan yükselince Kale bütçesi (Σ seviye ≤ Kale × 10) bağlayıcı hâle GELMEMELİ — yoksa
   * oyuncu tavana çıkmış bir yapıyı ancak başka bir yapıyı yıkarak taşıyabilirdi ve "tavan 40"
   * kâğıt üstünde kalırdı. Kale'nin kendisi bütçeye girmiyor.
   */
  it('⚠️ Kale 40 bütçesi, bütün yapıları tavana çıkarmaya YETİYOR', () => {
    const tuketen = BUILDINGS.filter((b) => b.consumesCastleBudget);
    expect(tuketen.reduce((t, b) => t + b.maxLevel, 0)).toBeLessThanOrEqual(castleBudget(40));
    // Kale bütçeyi tüketenlerden biri DEĞİL (kendi kendini finanse etmez).
    expect(BUILDINGS_BY_ID['castle']!.consumesCastleBudget).toBe(false);
  });

  /**
   * ⭐⭐⭐ **SAYI TAŞMASI BEKÇİSİ — Teleport'un 20'de kalmasının gerekçesi budur.**
   *
   * Maliyet `1,8^(sv−1)` ile büyüyor: 20 seviye eklemek fiyatı **~1,3 milyon katına** çıkarıyor.
   * Teleport'un tabanı diğer yapıların ~250 katı olduğu için 40 tavanında maliyeti
   * **9,03×10¹⁵** oluyordu ve `Number.MAX_SAFE_INTEGER`'ı (9,007×10¹⁵) **aşıyordu** — fiyat
   * artık tam sayı olarak temsil edilemiyor, `Math.round` sessizce kayıyordu.
   *
   * ⚠️ Bu test sayıyı değil **sınırın kendisini** kilitliyor: hiçbir yapının tavan maliyeti
   * güvenli tam sayı aralığını aşmamalı. Biri Teleport'u 40'a çıkarırsa ya da eğriyi/tabanları
   * büyütürse burada kırmızı yanar — bulunması en zor hata sınıfı olan sessiz duyarlılık
   * kaybının, sessiz kalmadığı tek yer.
   */
  it('⭐⭐⭐ hiçbir tavan maliyeti güvenli tam sayı sınırını AŞMAZ', () => {
    for (const b of BUILDINGS) {
      const c = buildingCost(b.id, b.maxLevel);
      const toplam = c.gold + c.food;
      expect(Number.isFinite(toplam), `${b.id}: sonsuz`).toBe(true);
      expect(toplam, `${b.id}: güvenli tam sayı sınırı aşıldı`)
        .toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    }
  });
});

describe('üretim formülleri', () => {
  it('çiftlik: floor(6·L·1,16^L)', () => {
    expect(farmOutput(1)).toBe(6);
    expect(farmOutput(2)).toBe(16);
    expect(farmOutput(4)).toBe(43);
    expect(farmOutput(10)).toBe(264);
    expect(farmOutput(40)).toBe(90_893);
  });

  it('maden: floor(5·L·1,15^L)', () => {
    expect(mineOutput(1)).toBe(5);
    expect(mineOutput(4)).toBe(34);
    expect(mineOutput(10)).toBe(202);
    expect(mineOutput(40)).toBe(53_572);
  });

  it('başlangıç şehri saatte 11 kaynak üretir (§13.11.1a gerekçesi)', () => {
    expect(farmOutput(1) + mineOutput(1)).toBe(11);
  });
});

describe('kahraman tecrübesi', () => {
  it('XP(1)=500, sonrası XP(L−1)×(1+1/√(L−1))', () => {
    expect(heroXpForLevel(1)).toBe(500);
    expect(heroXpForLevel(2)).toBe(1000);
    expect(heroXpForLevel(3)).toBe(1707);
  });

  it('eşikler BİRİKİMLİ: tek savaşta birkaç seviye birden atlanabilir', () => {
    // 1800 XP seviye 0 bir kahramanı seviye 3'e taşır (500 · 1000 · 1707 aşıldı, 2707 aşılmadı).
    const xp = 1800;
    let level = 0;
    while (xp >= heroXpForLevel(level + 1)) level += 1;
    expect(level).toBe(3);
  });
});

describe('kahraman diriltme', () => {
  it('maliyet tabanı oyunun ekranından: seviye 0 → 3000 altın / 2000 yiyecek', () => {
    expect(heroReviveCost(0)).toEqual({ gold: 3000, food: 2000 });
    /* ⚠️ Üs 2026-08-11'de 1,50 → 1,25 (eski beklenti 22.781/15.188). Gerekçe alttaki
     * «ıraksamaz» testinde ve `formulas.ts` yorumunda; taban ölçülü olduğu için değişmedi. */
    expect(heroReviveCost(5)).toEqual({ gold: 9155, food: 6104 });
    expect(heroReviveCost(10)).toEqual({ gold: 27_940, food: 18_626 });
  });

  /**
   * ⭐⭐ ASIL DEĞİŞMEZ: **bedel, kahramanın SAVAŞ DEĞERİNDEN ıraksamaz** (kullanıcı, 2026-08-11).
   *
   * Sayıyı değil İLKEYİ kilitliyor. Kahramanın seviyeden gelen güç ölçeği `(L+1)×1,07^L`
   * (`engine/combat.ts` → `heroStats`, `cfg.hero.levelBase`). Diriltme bedeli bunun çok
   * önüne geçerse yüksek seviye kahraman **kalıcı ölü** olur: oyuncu diriltmek yerine
   * yenisinin çıkmasını bekler ve oyunun en kişiselleştirilmiş varlığı çöpe gider.
   *
   * ⚠️ Bu tam olarak 2026-08-11 öncesinin durumuydu: 1,50 üssüyle sv20'de sapma **41 katıydı**
   * (bedel 3.325× · güç 81×). 1,25 ile ~3,2'ye indi. Üssü biri 1,5'e geri çekerse bu test
   * kırmızı verir — bandı büyütmeden önce yukarıdaki gerekçe yeniden tartışılmalı.
   */
  it('⭐⭐ bedel, kahramanın savaş değerinden IRAKSAMAZ', () => {
    const guc = (L: number): number => (L + 1) * 1.07 ** L;         // heroStats'ın seviye terimi
    const sapma = (L: number): number =>
      (heroReviveCost(L).gold / heroReviveCost(0).gold) / (guc(L) / guc(0));

    expect(sapma(10)).toBeLessThan(2);
    expect(sapma(20)).toBeLessThan(4);
    /* Alt sınır da var: bedel değerin GERİSİNDE kalırsa kahraman ölümü bedava olur. */
    expect(sapma(20)).toBeGreaterThan(1);
  });

  /** Panel düğmesi gerçekten bağlı mı — `economy.heroReviveCostRate`. */
  it('üs katalog config\'inden okunur (panelden ayarlanabilir)', () => {
    const eski = mergeCatalogConfig({ economy: { heroReviveCostRate: 1.5 } });
    expect(heroReviveCost(5, eski)).toEqual({ gold: 22_781, food: 15_188 });
    expect(heroReviveCost(0, eski)).toEqual({ gold: 3000, food: 2000 });   // taban sabit
  });

  /**
   * ⭐ İKİ EKSEN TERS YÖNDE (kullanıcı, 2026-07-29 ikinci düzeltme):
   * kahraman seviyesi süreyi UZATIR (ve maliyeti artırır), Tapınak seviyesi KISALTIR.
   */
  it('kahraman seviyesi süreyi UZATIR, tapınak KISALTIR', () => {
    expect(heroReviveSeconds(0, 0)).toBe(32_400);                          // 9 sa — taban
    expect(heroReviveSeconds(5, 0)).toBeGreaterThan(heroReviveSeconds(0, 0));
    expect(heroReviveSeconds(10, 0)).toBeGreaterThan(heroReviveSeconds(5, 0));
    expect(heroReviveSeconds(0, 5)).toBeLessThan(heroReviveSeconds(0, 0));
    expect(heroReviveSeconds(0, 20)).toBeLessThan(heroReviveSeconds(0, 5));
    // Tapınak yükseltmek seviyenin getirdiği cezayı dengeleyebilir.
    expect(heroReviveSeconds(5, 10)).toBeLessThan(heroReviveSeconds(5, 0));
  });

  it('maliyet seviyeyle artar ama tapınaktan ETKİLENMEZ', () => {
    expect(heroReviveCost(3).gold).toBeGreaterThan(heroReviveCost(0).gold);
    /**
     * ⚠️ Eskiden burada `heroReviveCost.length === 1` yazıyordu ve niyeti *"tapınak parametresi
     * yok"* demekti. 2026-08-11'de ikinci parametre (config) eklendi; varsayılanlı parametreler
     * `.length`e sayılmadığı için o iddia **yanlış sebeple** yeşil kalıyordu. Yerine kuralı
     * doğrudan ölçüyoruz: tapınak seviyesi ne olursa olsun bedel aynı.
     */
    const t0 = heroReviveCost(7);
    for (const tapinak of [0, 5, 20]) {
      // Tapınak yalnız SÜREYE girer; maliyet imzasında tapınak diye bir kavram yok.
      expect(heroReviveSeconds(7, tapinak)).toBeLessThanOrEqual(heroReviveSeconds(7, 0));
      expect(heroReviveCost(7)).toEqual(t0);
    }
  });

  it('alt sınır 15 dk, üst sınır 48 saat', () => {
    expect(heroReviveSeconds(0, 60)).toBe(900);
    expect(heroReviveSeconds(40, 0)).toBe(48 * 3600);
  });

  it('oyunun ekranındaki 2:04:27 ölçümüne tapınak 20 / seviye 0 ile oturur', () => {
    /* `images/scr_itv03`: seviye 0 ölü kahraman, 2 sa 4 dk 27 sn = 7467 sn. Ekranda tapınak
     * seviyesi yazmıyor; model 7589 sn veriyor — 2 dakika fark. Ölçümün hangi tapınakta
     * alındığını bilmediğimiz için birebir tutturmaya çalışmıyoruz, 5 dakikalık bant yeter. */
    expect(Math.abs(heroReviveSeconds(0, 20) - 7467)).toBeLessThan(300);
  });

});

describe('kahraman seviyesi tecrübeden türer', () => {
  it('eşik aşıldığı anda seviye yükselir — düğme yok', () => {
    expect(heroLevelForXp(0)).toBe(0);
    expect(heroLevelForXp(499)).toBe(0);
    expect(heroLevelForXp(500)).toBe(1);
    expect(heroLevelForXp(999)).toBe(1);
    expect(heroLevelForXp(1000)).toBe(2);
  });

  /**
   * ⭐ Kullanıcının örneği: seviye 3'teki kahraman tek savaşta 5. seviyeye kadar yetecek
   * tecrübe kazanırsa ANINDA seviye 5 görünür ve 6 puan birikmiş olur.
   */
  it('tek savaşta birkaç seviye birden atlanır', () => {
    const once = heroXpForLevel(3);          // seviye 3'ün eşiği
    const hedef = heroXpForLevel(5);         // seviye 5'in eşiği
    expect(heroLevelForXp(once)).toBe(3);
    expect(heroLevelForXp(hedef)).toBe(5);
    // Aradaki fark tek savaşta kazanılırsa iki seviye birden atlanır → 2 × 3 = 6 puan.
    expect(heroLevelForXp(hedef) - heroLevelForXp(once)).toBe(2);
  });
});

describe('sur onarımı', () => {
  it('tam yıkım seviye 1\'de 12 saat, seviye yükseldikçe kısalır', () => {
    expect(wallRepairSeconds(1, 0)).toBe(12 * 3600);
    expect(wallRepairSeconds(10, 0)).toBeLessThan(wallRepairSeconds(1, 0));
    expect(wallRepairSeconds(20, 0)).toBeLessThan(wallRepairSeconds(10, 0));
  });

  it('kısmi hasar, tam yıkım süresiyle ORANTILI', () => {
    const tam = wallRepairSeconds(5, 0);
    expect(wallRepairSeconds(5, 0.5)).toBeCloseTo(tam * 0.5, 0);
    expect(wallRepairSeconds(5, 0.9)).toBeCloseTo(tam * 0.1, 0);
    expect(wallRepairSeconds(5, 1)).toBe(0);          // sağlam sur onarılmaz
  });

  /** ⭐ Onarımda geçen süre boşa gitmez: sur, o ana kadar onarılmış yüzdeyle savaşa girer. */
  it('onarım ilerledikçe bütünlük doğrusal olarak 1\'e yaklaşır', () => {
    const from = new Date('2026-07-29T00:00:00Z');
    const until = new Date('2026-07-29T12:00:00Z');
    expect(wallCurrentIntegrity(0, from, until, from)).toBe(0);
    expect(wallCurrentIntegrity(0, from, until, new Date('2026-07-29T06:00:00Z'))).toBeCloseTo(0.5, 6);
    expect(wallCurrentIntegrity(0, from, until, new Date('2026-07-29T09:00:00Z'))).toBeCloseTo(0.75, 6);
    // Bitince tam sağlam.
    expect(wallCurrentIntegrity(0, from, until, until)).toBe(1);
    expect(wallCurrentIntegrity(0, from, until, new Date('2026-07-30T00:00:00Z'))).toBe(1);
  });

  it('kısmi hasarda da aynı kural: %40\'tan başlayıp 1\'e yürür', () => {
    const from = new Date('2026-07-29T00:00:00Z');
    const until = new Date('2026-07-29T10:00:00Z');
    expect(wallCurrentIntegrity(0.4, from, until, from)).toBeCloseTo(0.4, 6);
    expect(wallCurrentIntegrity(0.4, from, until, new Date('2026-07-29T05:00:00Z'))).toBeCloseTo(0.7, 6);
  });

  it('onarım yoksa sur tam sağlamdır', () => {
    expect(wallCurrentIntegrity(0.3, null, null, new Date())).toBe(1);
  });
});

describe('mağara', () => {
  it('yıkmak için gereken cüce sayısı', () => {
    expect(dwarvesToBreakCave(1, 0)).toBe(100);
    expect(dwarvesToBreakCave(2, 0)).toBe(150);
    expect(dwarvesToBreakCave(1, 4)).toBe(83);
  });

  /**
   * ⭐⭐ **ÖLÇÜLEN TABLONUN TAMAMI** — `docs/veri/cuce-magara.md` (kaynak: `cuce-magara.png`).
   *
   * ⚠️ Bugüne kadar bu formülün yalnız **10 örnek hücresi** test ediliyordu. 120 hücrenin
   * 10'unu kontrol etmek, iki modeli birbirinden ayırmaya yetmez: Demircilik etkisinin
   * TOPLAMSAL (`1 + 0,05·d`) mı yoksa ÜSSEL (`0,95^d`) mı olduğu ancak yüksek seviyelerde
   * ayrışıyor ve seçilen örnekler oraya değmiyordu. Fark küçük değil — Demircilik 30'da
   * toplamsal model 1/2,5 = 0,40, üssel model 0,95³⁰ = 0,21 veriyor, yani **iki kat**.
   *
   * ⚠️ **Tabloda BİR basım hatası var ve bilerek dışarıda:** Demircilik 4 · Mağara 22 →
   * tabloda 415.667, formül 415.657. Hücre tablonun KENDİ ×1,5 zinciriyle de tutmuyor
   * (277.105 × 1,5 = 415.657,5), yani rakam basımında 5↔6 yer değiştirmiş. Kalan **119/120
   * hücre birebir** tutuyor — bu, formülün ölçümden türediğinin kanıtı.
   */
  const CUCE_MAGARA: Readonly<Record<number, readonly number[]>> = {
    0: [100, 150, 225, 338, 506, 759, 1139, 1709, 2563, 3844, 5767, 8650, 12975, 19462, 29193,
      43789, 65684, 98526, 147789, 221684, 332526, 498789, 748183, 1122274],
    1: [95, 143, 214, 321, 482, 723, 1085, 1627, 2441, 3661, 5492, 8238, 12357, 18535, 27803,
      41704, 62556, 93834, 140752, 211127, 316691, 475037, 712555, 1068833],
    2: [91, 136, 205, 307, 460, 690, 1036, 1553, 2330, 3495, 5242, 7863, 11795, 17693, 26539,
      39809, 59713, 89569, 134354, 201531, 302296, 453444, 680166, 1020249],
    3: [87, 130, 196, 293, 440, 660, 990, 1486, 2229, 3343, 5014, 7522, 11282, 16923, 25385,
      38078, 57117, 85675, 128512, 192769, 289153, 433729, 650594, 975891],
    4: [83, 125, 188, 281, 422, 633, 949, 1424, 2136, 3204, 4805, 7208, 10812, 16218, 24327,
      36491, 54737, 82105, 123158, 184736, 277105, 415667, 623486, 935228],
  };
  /** Bilinen basım hatası: `[demircilik, mağara seviyesi]`. */
  const BASIM_HATASI: readonly (readonly [number, number])[] = [[4, 22]];

  it('⭐ ölçülen tablonun 119/120 hücresi birebir tutuyor', () => {
    const sapan: string[] = [];
    let kontrol = 0;
    for (const [dStr, satır] of Object.entries(CUCE_MAGARA)) {
      const d = Number(dStr);
      satır.forEach((beklenen, i) => {
        const seviye = i + 1;
        if (BASIM_HATASI.some(([bd, bs]) => bd === d && bs === seviye)) return;
        kontrol++;
        const bulunan = dwarvesToBreakCave(seviye, d);
        if (bulunan !== beklenen) {
          sapan.push(`Demircilik ${d} · Mağara ${seviye}: tablo ${beklenen}, formül ${bulunan}`);
        }
      });
    }
    expect(kontrol).toBe(119);
    expect(sapan, `ölçümden sapan hücreler:\n${sapan.join('\n')}`).toEqual([]);
  });

  /**
   * ⚠️ Basım hatasının **hâlâ hata olduğunu** kilitliyor. Bir gün tabloyu yeniden okuyup
   * 415.657 yazan biri çıkarsa bu test kırılır ve muafiyetin kaldırılması gerektiğini söyler —
   * yani muafiyet sessizce kalıcı bir örtü hâline gelemez.
   */
  it('bilinen basım hatası hücresi hâlâ ölçümden 10 sapıyor', () => {
    expect(dwarvesToBreakCave(22, 4)).toBe(415_657);
    expect(CUCE_MAGARA[4]![21]).toBe(415_667);
    // Tablonun kendi ×1,5 zinciri de formülü doğruluyor, basılı sayıyı değil.
    expect(Math.round(CUCE_MAGARA[4]![20]! * 1.5)).toBe(415_658);
  });

  /**
   * ⭐ MODEL AYRIMI — toplamsal payda mı, üssel mi? Tablo yalnız Demircilik 0-4'ü veriyor;
   * asıl fark yüksek seviyede doğuyor ve orada ölçüm yok. Bu test seçimi AÇIKÇA yazıyor ki
   * biri "0,95^d daha doğal durur" deyip değiştirmesin.
   */
  it('demircilik etkisi TOPLAMSAL paydadır, üssel değil', () => {
    // 1 + 0,05×30 = 2,5 → 100/2,5 = 40. Üssel olsaydı 100 × 0,95³⁰ ≈ 21 olurdu.
    expect(dwarvesToBreakCave(1, 30)).toBe(40);
    expect(dwarvesToBreakCave(1, 20)).toBe(50);
    // Yapılmamış mağara yıkılamaz — «0 cüce yeter» tuzağı.
    expect(dwarvesToBreakCave(0, 0)).toBe(Infinity);
    expect(dwarvesToBreakCave(0, 30)).toBe(Infinity);
  });

  it('kapasite 50 × 2^(sv−1)', () => {
    expect(caveCapacity(1)).toBe(50);
    expect(caveCapacity(5)).toBe(800);
  });
});

describe('kapasite kuralları', () => {
  it('savunma kapasitesi 25.000 × 1,30^(Sur−1)', () => {
    expect(defenseCapacity(1)).toBe(25_000);
    expect(defenseCapacity(3)).toBe(42_250);
    expect(defenseCapacity(20)).toBeGreaterThan(3_600_000);
  });

  it('referans savaşın karma savunması Sur 3 kapasitesine sığar', () => {
    const used =
      129 * UNITS_BY_ID['archer_tower']!.area
      + 300 * UNITS_BY_ID['trap']!.area
      + 111 * UNITS_BY_ID['oil_cauldron']!.area
      + 60 * UNITS_BY_ID['mangonel_tower']!.area
      + 33 * UNITS_BY_ID['guard']!.area;
    expect(used).toBe(42_006);
    expect(used).toBeLessThanOrEqual(defenseCapacity(3));
  });

  it('kale bütçesi = Kale × 10', () => {
    expect(castleBudget(1)).toBe(10);
    expect(castleBudget(5)).toBe(50);
  });
});

describe('maliyetler (§13.11.1a başlangıç kesesinin dayanağı)', () => {
  /**
   * ⭐ Ekonomi yapıları ürettikleri kaynaktan AĞIR yer (kullanıcı kararı 2026-07-27):
   * Maden altın üretir → 4 altın / 3 yemek · Çiftlik yemek üretir → 3 altın / 4 yemek.
   */
  /**
   * ⭐ Taban = oyuncunun ÖDEDİĞİ İLK yükseltme. Kale/Çiftlik/Maden seviye 1 başladığı için
   * onlarda bu **1→2**'dir. Bu test o yorumu kilitler: bozulursa ekranda görünen ilk fiyat
   * kullanıcının verdiği sayı olmaktan çıkar.
   *
   * ⚠️ **Baraka iki kez taraf değiştirdi** ve kural her seferinde AYNEN uygulandı:
   * 2026-08-09'da seviye 0'a indi (taban sv1'e kaydı), 2026-08-12'de geri 1'e çekildi
   * (taban sv2'ye döndü). Yani baraka artık yine "seviye 1 başlayan yapılar" grubunda.
   */
  it('taban fiyat = ilk ÖDENEN yükseltme', () => {
    expect(buildingCost('farm', 2)).toEqual({ gold: 9, food: 12 });   // yemek ağırlıklı
    expect(buildingCost('mine', 2)).toEqual({ gold: 12, food: 9 });   // altın ağırlıklı
    expect(buildingCost('castle', 2)).toEqual({ gold: 900, food: 700 });
    // Seviye 0'dan başlayan yapılarda taban seviye 1'in fiyatıdır (ölçekleme yok).
    expect(buildingCost('academy', 1)).toEqual({ gold: 1400, food: 1000 });
    // ⭐ Baraka seviye 1 başlıyor → ilk ödenen sv2 ve taban oraya oturuyor.
    expect(buildingCost('barracks', 2)).toEqual({ gold: 700, food: 500 });
    // sv1 oyuncunun hiç ödemediği seviye — yine de eğrinin ölçeği kilitleniyor.
    expect(buildingCost('barracks', 1)).toEqual({ gold: 389, food: 278 });
    // Eğri: seviye × 1,45^(seviye−1), sv2'ye göre ölçekli.
    expect(buildingCost('farm', 4)).toEqual({ gold: 38, food: 50 });
    expect(buildingCost('mine', 4)).toEqual({ gold: 50, food: 38 });
  });

  /**
   * ⭐⭐ **GERİ ÖDEME DÜZGÜN BÜYÜR — AMA BİR TAVANI YOK** (kullanıcı, 2026-08-10).
   *
   * ⚠️ Bu test 2026-07-28 ile 2026-08-10 arasında **tam tersini** kilitliyordu:
   * *"seviye tavanı 40 gerçekten ulaşılabilir olmalı … son seviye bir AY mertebesinde kalmalı"*
   * (`geriOdeme(40) < 1000`). O kural, `economyCostRate`'i Java'nın 1,45'inden 1,33'e çekmenin
   * gerekçesiydi. Kullanıcı bu turda kuralı **açıkça terk etti**: *"illa da saatlik üretimlerine
   * göre … amorti etme zorunluluğu şeklinde bakmayalım."*
   *
   * ⭐ Yerine geçen değişmez: **eğri düzgün, sıçramasız.** Kâr eşiği (~sv25) aşıldıktan sonra
   * yükseltme geliri değil PUANI satın alıyor (puan = harcanan/1000) — yani ölü içerik değil,
   * geç oyunun asıl kaynak gideri. Bir sıçrama olsaydı oyuncu "buradan sonrası anlamsız" diye
   * okurdu; kademeli uzama "buradan sonrası pahalı ama hâlâ bir yatırım" diye okunur.
   */
  it('⭐ maden geri ödemesi düzgün büyür, hiçbir noktada KOPMAZ', () => {
    const geriOdeme = (level: number): number => {
      const c = buildingCost('mine', level);
      return (c.gold + c.food) / (mineOutput(level) - mineOutput(level - 1));
    };
    // Erken oyun gerçekten kârlı: ilk yükseltmeler saatler içinde kendini ödüyor.
    expect(geriOdeme(2)).toBeLessThan(4);            // ~2,6 saat
    expect(geriOdeme(5)).toBeLessThan(15);           // ~10 saat
    expect(geriOdeme(10)).toBeLessThan(60);          // ~47 saat ≈ 2 gün
    // Kâr eşiği: sv20 hâlâ makul (~25 gün), sv25'ten sonra puan yatırımına dönüyor.
    expect(geriOdeme(20)).toBeLessThan(700);         // ~594 saat
    expect(geriOdeme(25)).toBeGreaterThan(1_000);    // ~1.989 saat — eşik burada geçiliyor
    /**
     * Monoton VE sıçramasız: her beş seviye bir öncekinin 3-5 katı, hiçbir yerde uçurum yok.
     * Üstelik oran **azalıyor** (4,66 → 3,68 → 3,46 → … → 3,25) ve `1,45^5 / 1,15^5 = 3,19`
     * limitine yaklaşıyor: eğrinin şekli maliyet/üretim oranının kendisi, uydurma bir kesme değil.
     */
    let onceki = Infinity;
    for (const l of [10, 15, 20, 25, 30, 35, 40]) {
      const oran = geriOdeme(l) / geriOdeme(l - 5);
      expect(oran, `sv${l - 5}→${l} sıçraması`).toBeGreaterThan(3);
      expect(oran, `sv${l - 5}→${l} sıçraması`).toBeLessThan(5);
      expect(oran, `sv${l - 5}→${l} bir önceki adımdan sert olmamalı`).toBeLessThan(onceki);
      onceki = oran;
    }
    const limit = 1.45 ** 5 / 1.15 ** 5;                 // 3,187 — maliyet/üretim oranı
    expect(geriOdeme(40) / geriOdeme(35)).toBeGreaterThan(limit);
    expect(geriOdeme(40) / geriOdeme(35)).toBeLessThan(limit * 1.05);
  });

  it('kale 1→5 kümülatif ~19.000 (ittifak kurma eşiği Kale 5, §13.15)', () => {
    let total = 0;
    for (let l = 2; l <= 5; l++) {
      const c = buildingCost('castle', l);
      total += c.gold + c.food;
    }
    expect(total).toBeGreaterThan(18_000);
    expect(total).toBeLessThan(20_000);
  });

  /**
   * ⭐⭐ **İLK GÜN ÖLÜ DURAK BEKÇİSİ** (2026-08-10) — başlangıç kesesinin alt sınırını bir
   * TERCİH değil bir YAPI KURALI belirliyor.
   *
   * Kale 1'in bütçesi 10 seviye ve Çiftlik/Maden zaten 1'den başlıyor → oyuncunun Kale 2'ye
   * kadar yapabileceği tek şey **Çiftlik 5 + Maden 5**. Ondan sonrası kapalı: Akademi Kale 2
   * ister, Baraka'ya bütçe kalmaz, savaşçı üretimi Akademi→Demircilik ister. Yani kese Kale 2'yi
   * karşılamazsa oyunun **hiçbir şey sunmadığı** bir bekleme doğar.
   *
   * ⚠️ Bu test kese VEYA Kale tabanı tek başına değişirse kırılır — ikisi birbirine bağlı ve
   * bağın kendisi görünmez. (Ölçüm: kese 500/500 → 10,9 saat · 750/750 → 6,5 · 1000/1000 → 2,0.)
   */
  it('⭐ ilk gün ölü durak 3 saati aşmıyor (kese ↔ Kale 2 bağı)', () => {
    expect(castleBudget(1)).toBe(10);
    let harcanan = 0;
    for (let l = 2; l <= 5; l++) {
      harcanan += buildingCost('farm', l).gold + buildingCost('farm', l).food;
      harcanan += buildingCost('mine', l).gold + buildingCost('mine', l).food;
    }
    // Çiftlik 5 + Maden 5 = tam 10 seviye = Kale 1 bütçesinin tamamı, ve kese onu karşılıyor.
    const kese = STARTING_RESOURCES.gold + STARTING_RESOURCES.food;
    expect(harcanan).toBeLessThan(kese);

    const kale2 = buildingCost('castle', 2);
    const gelir = farmOutput(5) + mineOutput(5);          // 113 kaynak/saat
    const eksik = Math.max(0, kale2.gold + kale2.food - (kese - harcanan));
    expect(eksik / gelir, 'Kale 2 için ölü bekleme (saat)').toBeLessThan(3);
  });
});

/**
 * ⭐ ÜRETİM SÜRESİ — kurgulanan model (§13.11.3, kullanıcı kararı 2026-07-27):
 * `190 × ((altın+yemek+taşıma)/1000)^0,8 / 1,2^seviye`.
 *
 * Testler modelin **niyetini** kilitliyor, tek tek sayıları değil: oynanabilir ölçek, anlamlı
 * ama tek eksenli olmayan Baraka etkisi, elit birimin zaman avantajı ve Yük Arabası düzeltmesi.
 */
describe('üretim süresi (kurgulanan model)', () => {
  it('ölçek oynanabilir: Cüce Baraka 1\'de ~2 dk, Baraka 20\'de saniyeler', () => {
    expect(trainingTimeSeconds('dwarf', 1)).toBeCloseTo(113.6, 1);
    expect(trainingTimeSeconds('dwarf', 5)).toBeCloseTo(54.8, 1);
    expect(trainingTimeSeconds('dwarf', 20)).toBeLessThan(5);
  });

  /**
   * ⭐⭐ 1 SANİYE TABANI — tavan 40'a çıkınca İLK KEZ ulaşılabilir oldu (2026-08-12).
   *
   * ⚠️ Formülün kendisinde taban YOK: `190 × (değer/1000)^0,8 / 1,2^sv` sınırsız düşer ve
   * Baraka 40'ta Cüce **0,09 saniyeye** iner. Taban iki tüketicide duruyor ve **ikisi de
   * 1'e sabitliyor**: kuyruk (`queue.service.ts` `scaled`) ve ekran (`city.controller.ts`
   * `dur`). İkisinin ayrışması, oyuncuya gösterilen süre ile gerçekte üretilen sürenin
   * farklı olması demekti — bu test onları formülün ham çıktısı üzerinden hizada tutuyor.
   *
   * Tavan 20 iken bu hiç yaşanmıyordu (Cüce sv20 = 3,55 sn), o yüzden ölçen bir test de yoktu.
   */
  it('⭐⭐ ham formül 1 saniyenin ALTINA iner — taban tüketicide, formülde değil', () => {
    expect(trainingTimeSeconds('dwarf', 20)).toBeGreaterThan(1);
    // Cüce Baraka 27'de, Elf 30'da 1 saniyeye iner; tavanda ikisi de saniye altı.
    expect(trainingTimeSeconds('dwarf', 27)).toBeLessThanOrEqual(1);
    expect(trainingTimeSeconds('dwarf', 26)).toBeGreaterThan(1);
    expect(trainingTimeSeconds('elf', 30)).toBeLessThanOrEqual(1);
    expect(trainingTimeSeconds('elf', 29)).toBeGreaterThan(1);
    expect(trainingTimeSeconds('dwarf', 40)).toBeLessThan(0.2);
  });

  /**
   * ⚠️ Tavandaki en pahalı birim hâlâ ANLAMLI sürede kalmalı — yoksa 40 tavanı, geç oyunun
   * bütün üretim ekonomisini tek bir yapıya bağlar ve ordu kurmak bedavaya gelir.
   */
  it('en pahalı birimler tavanda bile taban süreye çakılmaz', () => {
    expect(trainingTimeSeconds('chaos', 40)).toBeGreaterThan(60);
    expect(trainingTimeSeconds('dragon', 40)).toBeGreaterThan(3);
  });

  it('her Baraka seviyesi süreyi %16,7 kısaltır (20 seviyede 32 kat)', () => {
    const b1 = trainingTimeSeconds('dwarf', 1);
    expect(trainingTimeSeconds('dwarf', 2)).toBeCloseTo(b1 / 1.2, 6);
    expect(trainingTimeSeconds('dwarf', 0) / trainingTimeSeconds('dwarf', 20))
      .toBeCloseTo(1.2 ** 20, 3);
  });

  it('birim ön-şartına ulaştığında makul sürede çıkar', () => {
    // (birim, gerekli Baraka, üst sınır saniye)
    const beklenen: [string, number, number][] = [
      ['spy_bird', 3, 60], ['cargo_wagon', 3, 600], ['cavalry', 4, 300],
      ['pegasus', 7, 300], ['dragon', 10, 900], ['ogre', 8, 900], ['chaos', 15, 3 * 3600],
    ];
    for (const [id, baraka, ustSinir] of beklenen) {
      expect(trainingTimeSeconds(id, baraka)).toBeLessThanOrEqual(ustSinir);
    }
  });

  /** Üs 0,8'in amacı: elit birim saniye başına daha çok GÜÇ üretsin (bedeli: ön-şartlar). */
  it('elit birim saniye başına ~2 kat güç üretir', () => {
    const gucBasinaSaniye = (id: string): number =>
      trainingTimeSeconds(id, 10) / UNITS_BY_ID[id]!.area;
    const oran = gucBasinaSaniye('dwarf') / gucBasinaSaniye('dragon');
    expect(oran).toBeGreaterThan(1.8);
    expect(oran).toBeLessThan(2.5);
  });

  /**
   * Taşıma terimi olmasa ganimet taşımak bedavaya gelirdi: 2.000 kaynağa **5.000 taşıma**
   * (kapasite `teknik_ve_yapi_dokumantasyonu.md`'den; 3.000 yazılıydı, 2026-07-28 düzeltildi).
   */
  it('Yük Arabası taşıma kapasitesi kadar ek süre öder', () => {
    expect(UNITS_BY_ID['cargo_wagon']!.carry).toBe(5000);
    expect(unitTimeValue('cargo_wagon')).toBe(1000 + 1000 + 5000);
    expect(unitTimeValue('dwarf')).toBe(200 + 450 + 10);
    // Taşımasız değere göre 2,7 kat.
    const tasimasiz = 190 * (2000 / 1000) ** 0.8;
    expect(trainingTimeSeconds('cargo_wagon', 0) / tasimasiz).toBeCloseTo(2.72, 1);
  });

  it('savunma birimi Mimar Okulu\'na bağlı, aynı eğriyle', () => {
    expect(trainingTimeSeconds('guard', 0)).toBeCloseTo(190 * 4.4 ** 0.8, 5);
    expect(trainingTimeSeconds('guard', 10)).toBeCloseTo(190 * 4.4 ** 0.8 / 1.2 ** 10, 5);
  });

  it('emekli modeller karşılaştırma için duruyor (varsayılan DEĞİL)', () => {
    expect(trainingTimeSeconds('dwarf', 1, 'area')).toBeCloseTo(9, 5);          // Model A
    expect(trainingTimeSeconds('dwarf', 1, 'original')).toBeCloseTo(1309.5, 1); // Model B
    expect(trainingTimeSeconds('dwarf', 1)).toBeCloseTo(113.6, 1);              // yürürlükte
  });
});

/**
 * ⭐ YAPI/TEKNİK SÜRESİ aynı eğriyi kullanır (katsayı 400). Eski `10 × maliyet` kuralı üstel
 * maliyet eğrisiyle çarpışıyordu: Kale 20 **2.869 gün** sürüyordu. Bu test o çöküşün geri
 * gelmediğini kilitler.
 */
describe('yapı ve teknik süresi', () => {
  /**
   * ⚠️ Sınırlar 2026-08-10'da yükseldi (üs 0,80 → 0,95 + tabanlar ~5 kat): Kale 20, Mimar Okulu
   * 10'da **2,4 gün** değil **27 gün**. Bu istenen sonuç — kullanıcı üst seviyelerin haftalarla
   * ölçülmesini istedi. Testin koruduğu şey hâlâ aynı: eski `10 × maliyet` kuralının 2.869 günlük
   * çöküşü geri GELMEMELİ ve ilk yükseltmeler dakikalar mertebesinde KALMALI.
   */
  it('yüksek seviye yapı süresi patlamıyor', () => {
    const kale20 = buildingTimeSeconds('castle', 20, 10);
    expect(kale20 / 86_400).toBeGreaterThan(10);     // haftalarla ölçülüyor (istenen)
    expect(kale20 / 86_400).toBeLessThan(45);        // ~27 gün — ama çökmüş değil
    expect(buildingTimeSeconds('castle', 2, 0)).toBeLessThan(900);   // ilk yükseltme dakikalar
  });

  /**
   * ⭐⭐ **SÜRE EĞRİSİ TAM 1000 KAYNAKTA DÖNER** — erken oyun garantisinin matematiksel kilidi.
   *
   * Yapı üssünü 0,80'den 0,95'e çıkarmak, `(değer/1000)^üs` yüzünden **1000'in altındaki**
   * kalemleri HIZLANDIRIR, üstündekileri yavaşlatır. Kullanıcının *"erken aşama kıtlıkla
   * geçmesin ama üst seviyeler haftalar sürsün"* şartı bu tek özellikten geliyor; `structureTime‐
   * Factor` (K) büyütmek aynı işi yapamazdı çünkü o her seviyeyi aynı oranda çarpar.
   */
  it('⭐ süre eğrisi 1000 kaynakta döner: ucuz kalem hızlanır, pahalı kalem yavaşlar', () => {
    const dusukUs = mergeCatalogConfig({ economy: { structureTimeExponent: 0.8 } });
    const ucuz = { gold: 300, food: 0 };      // 1000'in ALTINDA
    const pahali = { gold: 5_000_000, food: 0 };
    expect(timeFromCost(ucuz, 0)).toBeLessThan(timeFromCost(ucuz, 0, dusukUs));
    expect(timeFromCost(pahali, 0)).toBeGreaterThan(timeFromCost(pahali, 0, dusukUs));
    // Dönüm noktası: tam 1000'de iki üs de aynı sonucu verir.
    const pivot = { gold: 1000, food: 0 };
    expect(timeFromCost(pivot, 0)).toBeCloseTo(timeFromCost(pivot, 0, dusukUs), 9);
  });

  /**
   * ⭐⭐ **İKİ ÜS AYRI** (2026-08-10) — `structureTimeExponent` yapısal kalemleri, `timeExponent`
   * birimleri yönetir. Ayrım olmasaydı yapı sürelerini uzatmak Kaos/Ejderha üretimini de
   * patlatırdı; üstelik 0,8 `k.java`'nın kendi savaşçı üssü ve ona sadık kalınıyor.
   *
   * ⚠️ Bu test olmadan iki üs sessizce tekrar birleşir: `timeCurve`ün yeni bir çağıranı yanlış
   * üssü geçirirse hiçbir şey patlamaz, yalnız denge kayar.
   */
  it('⭐ yapı üssü birim üretimine DOKUNMAZ (ve tersi)', () => {
    const yapiUssu = mergeCatalogConfig({ economy: { structureTimeExponent: 1.4 } });
    expect(trainingTimeSeconds('dragon', 10, 'balanced', yapiUssu))
      .toBeCloseTo(trainingTimeSeconds('dragon', 10), 9);
    expect(buildingTimeSeconds('castle', 10, 0, yapiUssu))
      .not.toBeCloseTo(buildingTimeSeconds('castle', 10, 0), 3);

    const birimUssu = mergeCatalogConfig({ economy: { timeExponent: 1.4 } });
    expect(buildingTimeSeconds('castle', 10, 0, birimUssu))
      .toBeCloseTo(buildingTimeSeconds('castle', 10, 0), 9);
    expect(trainingTimeSeconds('dragon', 10, 'balanced', birimUssu))
      .not.toBeCloseTo(trainingTimeSeconds('dragon', 10), 3);
  });

  /**
   * ⭐ MİMAR OKULU KENDİNİ HIZLANDIRMAZ (kullanıcı, 2026-08-03).
   *
   * ⚠️ Bu test bir süre TAM TERSİNİ çıpalıyordu (*"kendi seviyesiyle hızlanır, özel dal YOK"*).
   * Kural kullanıcı kararıyla döndü; eski hâli, kendi kendini besleyen bir merdiven
   * yaratıyordu — yapı seviye atladıkça kendi yükseltmesi giderek ucuzluyordu.
   */
  it('⭐ Mimar Okulu KENDİ yükseltmesinde hızlanma uygulanmaz', () => {
    const c = buildingCost('architect_school', 5);
    // Bölen 4 değil 0: süre, hiç Mimar Okulu yokmuş gibi hesaplanır.
    // ⚠️ Ayrıca `timeFactor 0,1` var (aşağıdaki teste bak) — o yüzden onda biri.
    expect(buildingTimeSeconds('architect_school', 5, 4)).toBeCloseTo(timeFromCost(c, 0) * 0.1, 10);
    // Mimar Okulu seviyesi ne olursa olsun kendi süresi DEĞİŞMEZ.
    expect(buildingTimeSeconds('architect_school', 5, 12))
      .toBeCloseTo(buildingTimeSeconds('architect_school', 5, 0), 10);
  });

  /**
   * ⭐⭐ **MİMAR OKULU'NUN `timeFactor 0,1`'i = JAVA'NIN `×10`'u** (2026-08-10).
   *
   * `k.java:1396-1403` yapı süresini iki dalda hesaplıyor: Mimar Okulu'nun KENDİSİ
   * `(altın+yemek) / 1,2^kendiSeviyesi`, diğer her yapı `10 × (altın+yemek) / 1,4^MimarOkulu`.
   * Yani orijinalde Mimar Okulu o `×10` çarpanını **hiç almıyor**.
   *
   * Ham terimleri kopyalayamayız (biz diğer yapılarda 1,4 değil 1,2 kullanıyoruz), o yüzden
   * taşınan şey **oran**: Java'da `(1/10) × (1,4/1,2)^L`, bizde `0,1 × 1,2^L`. Sonuç şekli aynı —
   * erken hızlı, ~sv13-15'te dönüm, sonrasında oyunun en yavaş yapısı:
   * ```
   *   L=1  → Java 0,117 · bizde 0,120        L=15 → Java 1,010 · bizde 1,541  ← DÖNÜM
   *   L=10 → Java 0,467 · bizde 0,619        L=20 → Java 2,182 · bizde 3,834
   * ```
   * ⚠️ Bu çarpan kaybolursa Mimar Okulu 20 **36 günden 362 güne** çıkar ve kimse dokunmaz.
   */
  it('⭐⭐ Mimar Okulu erken HIZLI, geç YAVAŞ — Java\'nın ×10 dengesi', () => {
    /** Aynı maliyetteki sıradan bir yapıya göre oran (bölen: o seviyedeki Mimar Okulu). */
    const oran = (L: number): number => {
      const c = buildingCost('architect_school', L);
      return buildingTimeSeconds('architect_school', L, L) / timeFromCost(c, L);
    };
    expect(oran(1)).toBeCloseTo(0.1 * 1.2, 6);       // 0,120 — Java 0,117
    expect(oran(10)).toBeCloseTo(0.1 * 1.2 ** 10, 6); // 0,619 — Java 0,467
    // Dönüm gerçekten var: bir yerde 1'i geçiyor ve geçtikten sonra geri dönmüyor.
    expect(oran(12)).toBeLessThan(1);
    expect(oran(15)).toBeGreaterThan(1);
    expect(oran(20)).toBeGreaterThan(3);
  });

  it('istisna DİĞER yapıları etkilemez — onlar hâlâ hızlanır', () => {
    const yavas = buildingTimeSeconds('castle', 5, 0);
    const hizli = buildingTimeSeconds('castle', 5, 8);
    expect(hizli).toBeLessThan(yavas);
    expect(hizli).toBeCloseTo(timeFromCost(buildingCost('castle', 5), 8), 10);
  });

  it('istisna panelden kapatılabilir (architectSelfExempt)', () => {
    const cfg = mergeCatalogConfig({ economy: { architectSelfExempt: false } });
    const c = buildingCost('architect_school', 5, cfg);
    // Kapalıyken eski davranış: kendi seviyesiyle hızlanır (`timeFactor` yine geçerli).
    expect(buildingTimeSeconds('architect_school', 5, 4, cfg))
      .toBeCloseTo(timeFromCost(c, 4, cfg) * 0.1, 10);
  });

  /**
   * ⭐ TELEPORT BEKLEME SÜRESİ — taban 24 sa (kullanıcı, 2026-08-03; önceden 20).
   * İkisi de kurgu (doküman süreyi vermiyor), o yüzden ikisi de panelde.
   */
  it('teleport bekleme süresi: sv1 = 24 sa, her seviye %2 kısaltır', () => {
    expect(teleportCooldownSeconds(1)).toBeCloseTo(24 * 3600, 6);
    expect(teleportCooldownSeconds(2)).toBeCloseTo(24 * 3600 * 0.98, 6);
    expect(teleportCooldownSeconds(20)).toBeCloseTo(24 * 3600 * 0.98 ** 19, 6);
    // Seviye 0/negatif seviye 1 sayılır (bina yoksa zaten teleport yapılamıyor).
    expect(teleportCooldownSeconds(0)).toBeCloseTo(teleportCooldownSeconds(1), 6);
  });

  it('teleport sabitleri panelden değiştirilebilir', () => {
    const cfg = mergeCatalogConfig({ teleport: { baseHours: 6, levelStep: 0.1 } });
    expect(teleportCooldownSeconds(1, cfg)).toBeCloseTo(6 * 3600, 6);
    expect(teleportCooldownSeconds(3, cfg)).toBeCloseTo(6 * 3600 * 0.9 ** 2, 6);
  });

  /**
   * ⚠️ Oran artık **tam** 400/190 değil: iki üs ayrıldığı için (yapı 0,95 · birim 0,80) fark
   * değere bağlı. İkisi yalnız **1000 kaynakta** buluşuyor — orada `(1)^üs = 1` her ikisinde de.
   * Niyet aynı: aynı değerde bir yapı, bir birimin ~2 katı sürer (yapı kalıcı, birim ölür).
   */
  it('aynı DEĞERDE yapı, birimin ~2 katı sürer (1000 kaynakta TAM 400/190)', () => {
    expect(timeFromCost({ gold: 1000, food: 0 }, 0)).toBeCloseTo(400, 9);

    const deger = unitTimeValue('dwarf');   // 660 → 1000'in altında
    const oran = timeFromCost({ gold: deger, food: 0 }, 0) / trainingTimeSeconds('dwarf', 0);
    expect(oran).toBeCloseTo((400 / 190) * (deger / 1000) ** (0.95 - 0.8), 6);
    expect(oran).toBeGreaterThan(1.9);
    expect(oran).toBeLessThan(2.2);
  });
});

/**
 * ⭐ YENİ ŞEHRİN ADI = KULLANICI ADININ AYNISI (kullanıcı, 2026-08-11).
 *
 * ⚠️ `colonyName` **emekli edildi** ve testleri buradan kalktı. Üreteç üç nesil geçirmişti
 * (`Koloni 2` → `<başkentAdı> 2` → `<kullanıcıAdı> 2`) ve hepsinin ortak varsayımı "ad
 * benzersiz olmalı" idi. Kullanıcı o varsayımı kaldırdı: ad bir **etiket**, şehri ayırt eden
 * şey koordinat. Dolayısıyla sıra numarası ve onun kırpma mantığı da gitti.
 *
 * Geriye kalan tek şart aşağıda: kullanıcı adı, şehir adı sınırına **her zaman** sığmalı.
 * Bu bir varsayım değil kanıt gerektiren bir şey — iki sabit bir gün ayrışırsa üreteç,
 * doğrulamanın reddedeceği bir ad üretmeye başlardı ve bunu kimse fark etmezdi.
 */
describe('yeni şehrin adı', () => {
  it('⭐ kullanıcı adı şehir adı sınırına HER ZAMAN sığar', () => {
    expect(USERNAME_MAX).toBeLessThanOrEqual(NAME_MAX);
    expect(USERNAME_MIN).toBeGreaterThanOrEqual(NAME_MIN);
  });

  it('en uzun kullanıcı adı kırpılmadan şehir adı olur', () => {
    const uzun = 'A'.repeat(USERNAME_MAX);
    expect(clampName(uzun)).toBe(uzun);
    expect(clampName(uzun).length).toBe(NAME_MAX);
  });

  it('adlar benzersiz DEĞİL — aynı ad iki kez üretilebilir', () => {
    // Kural bu: "bir kullanıcının şehirlerinin adları aynı olabilir".
    expect(clampName('abdullah')).toBe(clampName('abdullah'));
  });
});
