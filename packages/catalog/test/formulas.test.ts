/**
 * §13.8 doğrulanmış formüllerin regresyon testi.
 * Bu sayılar kullanıcının verdiği orijinal oyun tablolarından geliyor — değişirlerse denge bozulur.
 */
import { describe, expect, it } from 'vitest';
import {
  buildingCost, buildingTimeSeconds, castleBudget, caveCapacity, defenseCapacity,
  dwarvesToBreakCave, farmOutput, heroLevelForXp, heroReviveCost, heroReviveSeconds,
  colonyName, heroXpForLevel, mergeCatalogConfig, mineOutput, NAME_MAX, STARTING_RESOURCES, teleportCooldownSeconds,
  wallCurrentIntegrity, wallRepairSeconds,
  timeFromCost, trainingTimeSeconds, unitCost, unitTimeValue, UNITS_BY_ID,
} from '../src/index.ts';

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
    expect(heroReviveCost(5)).toEqual({ gold: 22_781, food: 15_188 });
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
    // İmza zaten tapınak almıyor — kural burada belgeleniyor ki ileride yanlışlıkla eklenmesin.
    expect(heroReviveCost.length).toBe(1);
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
   * ⭐ Taban = oyuncunun ÖDEDİĞİ İLK yükseltme. Kale/Baraka/Çiftlik/Maden seviye 1 başladığı
   * için onlarda bu **1→2**'dir. Bu test o yorumu kilitler: bozulursa ekranda görünen ilk
   * fiyat kullanıcının verdiği sayı olmaktan çıkar.
   */
  it('taban fiyat = ilk ÖDENEN yükseltme (sv1→2)', () => {
    expect(buildingCost('farm', 2)).toEqual({ gold: 3, food: 4 });   // yemek ağırlıklı
    expect(buildingCost('mine', 2)).toEqual({ gold: 4, food: 3 });   // altın ağırlıklı
    expect(buildingCost('castle', 2)).toEqual({ gold: 200, food: 150 });
    expect(buildingCost('barracks', 2)).toEqual({ gold: 120, food: 80 });
    // Seviye 0'dan başlayan yapılarda taban seviye 1'in fiyatıdır (ölçekleme yok).
    expect(buildingCost('academy', 1)).toEqual({ gold: 250, food: 180 });
    // Eğri: seviye × 1,33^(seviye−1), sv2'ye göre ölçekli.
    expect(buildingCost('farm', 4)).toEqual({ gold: 11, food: 14 });
    expect(buildingCost('mine', 4)).toEqual({ gold: 14, food: 11 });
  });

  /**
   * ⭐ **SEVİYE TAVANI 40 GERÇEKTEN ULAŞILABİLİR OLMALI** (kullanıcı, 2026-07-28).
   * Maliyet `1,33^L`, üretim `1,15^L` büyüdüğü için geri ödeme yine de uzuyor — bu kasıtlı
   * (ekonomi doyar, oyuncu yağmaya yönelir) ama son seviye **bir ay** mertebesinde kalmalı,
   * bir YIL değil. 1,45 ile sv40'ın geri ödemesi 8.700 saatti; artık 870.
   */
  it('maden yükseltmesi seviye 40\'a kadar kendini amorti eder', () => {
    const geriOdeme = (level: number): number => {
      const c = buildingCost('mine', level);
      return (c.gold + c.food) / (mineOutput(level) - mineOutput(level - 1));
    };
    expect(geriOdeme(2)).toBeLessThan(2);          // ~1 saat
    expect(geriOdeme(10)).toBeLessThan(10);        // ~6,5 saat
    expect(geriOdeme(20)).toBeLessThan(50);        // ~42 saat
    expect(geriOdeme(40)).toBeLessThan(1_000);     // ~870 saat ≈ 36 gün
    // Yine de monoton artıyor: her seviye bir öncekinden pahalı bir yatırım.
    expect(geriOdeme(40)).toBeGreaterThan(geriOdeme(30));
    expect(geriOdeme(30)).toBeGreaterThan(geriOdeme(20));
  });

  it('kale 1→5 kümülatif ~4.150 (ittifak kurma eşiği, §13.15)', () => {
    // Taban artık 1→2'nin fiyatı olduğu için eğri bir basamak indi (eskiden ~7.500).
    let total = 0;
    for (let l = 2; l <= 5; l++) {
      const c = buildingCost('castle', l);
      total += c.gold + c.food;
    }
    expect(total).toBeGreaterThan(4_000);
    expect(total).toBeLessThan(4_500);
  });

  /**
   * ⭐ Yeni tabanlarla başlangıç kesesinin (4.000/4.000) rolü DEĞİŞTİ: artık ekonomiyi değil
   * **Kale'yi** finanse ediyor. Ekonomi yapıları o kadar ucuz ki Kale 1'in izin verdiği
   * 10 seviyenin tamamı 217 altın + 239 yemek tutuyor — kapı **Kale bütçesi**.
   * Bu iyi bir tasarım: erken oyunun temposunu kese değil, bilinçli bir yapı kararı belirliyor.
   */
  it('Kale bütçesi artık kesenin önüne geçiyor', () => {
    let gold = 0;
    let food = 0;
    for (let l = 2; l <= 5; l++) { const c = buildingCost('farm', l); gold += c.gold; food += c.food; }
    for (let l = 2; l <= 4; l++) { const c = buildingCost('mine', l); gold += c.gold; food += c.food; }

    // Çiftlik 5 + Maden 4 + Baraka 1 = tam 10 seviye = Kale 1 bütçesinin tamamı.
    expect(castleBudget(1)).toBe(10);
    expect(gold + food).toBeLessThan(500);              // kesenin %6'sı
    expect(gold).toBeLessThan(STARTING_RESOURCES.gold);
    expect(food).toBeLessThan(STARTING_RESOURCES.food);

    // Kalan kese Kale 2-3'e gidiyor (bütçeyi 30 seviyeye çıkarır).
    let kale = 0;
    for (let l = 2; l <= 3; l++) { const c = buildingCost('castle', l); kale += c.gold + c.food; }
    expect(kale).toBeLessThan(STARTING_RESOURCES.gold + STARTING_RESOURCES.food - gold - food);
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
  it('yüksek seviye yapı süresi patlamıyor', () => {
    const kale20 = buildingTimeSeconds('castle', 20, 10);
    expect(kale20 / 86_400).toBeLessThan(4);         // ~2,4 gün (Mimar Okulu 10)
    expect(buildingTimeSeconds('castle', 2, 0)).toBeLessThan(600);   // ilk yükseltme dakikalar
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
    expect(buildingTimeSeconds('architect_school', 5, 4)).toBeCloseTo(timeFromCost(c, 0), 10);
    // Mimar Okulu seviyesi ne olursa olsun kendi süresi DEĞİŞMEZ.
    expect(buildingTimeSeconds('architect_school', 5, 12))
      .toBeCloseTo(buildingTimeSeconds('architect_school', 5, 0), 10);
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
    // Kapalıyken eski davranış: kendi seviyesiyle hızlanır.
    expect(buildingTimeSeconds('architect_school', 5, 4, cfg)).toBeCloseTo(timeFromCost(c, 4, cfg), 10);
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

  it('aynı DEĞERDE yapı, birimin ~2 katı sürer (400/190)', () => {
    // Cüce'nin değeri 660 → aynı değere sahip bir yapı kalemiyle karşılaştırılıyor.
    const deger = unitTimeValue('dwarf');
    expect(timeFromCost({ gold: deger, food: 0 }, 0) / trainingTimeSeconds('dwarf', 0))
      .toBeCloseTo(400 / 190, 6);
  });
});

/**
 * ⭐ KOLONİ ADI — «başkentAdı sıra» (kullanıcı, 2026-08-03).
 *
 * Önceki hâl `Koloni 2` idi: oyuncunun kimliğiyle hiçbir bağı yoktu ve iki farklı oyuncunun
 * şehirleri dünya listesinde birbirinin aynı görünüyordu.
 */
describe('koloni adı', () => {
  it('başkent adının yanına sıra numarası gelir', () => {
    expect(colonyName('Çığlıktepe', 2)).toBe('Çığlıktepe 2');
    expect(colonyName('Bal', 3)).toBe('Bal 3');
  });

  it('⭐ 15 karakteri aşarsa başkent adı KIRPILIR (kullanıcının kuralı)', () => {
    // 15 karakterlik ad + " 2" = 17 → sondan 2 karakter kırpılır.
    const uzun = 'Aaaaabbbbbccccc';            // tam 15
    expect(uzun.length).toBe(NAME_MAX);
    expect(colonyName(uzun, 2)).toBe('Aaaaabbbbbccc 2');
    expect(colonyName(uzun, 2).length).toBeLessThanOrEqual(NAME_MAX);
  });

  /**
   * ⚠️ İki basamaklı sıra numarasında " 10" ÜÇ karakter tutar; kullanıcının verdiği "son 2
   * karakteri sil" kuralı bu durumda yetmezdi. Kural "gereken kadar kırp" olarak
   * genelleştirildi — sonuç HER ZAMAN sınırın içinde.
   */
  it('iki basamaklı sırada da sınır aşılmaz', () => {
    const uzun = 'Aaaaabbbbbccccc';
    expect(colonyName(uzun, 10)).toBe('Aaaaabbbbbcc 10');
    expect(colonyName(uzun, 10).length).toBe(NAME_MAX);
  });

  it('kırpma sondaki boşluğu bırakmaz', () => {
    // "Aaaaabbbbbcc dd" (15) → kırpınca "Aaaaabbbbbcc " olurdu; boşluk temizlenmeli.
    expect(colonyName('Aaaaabbbbbcc dd', 2)).toBe('Aaaaabbbbbcc 2');
  });

  it('kısa adlar hiç kırpılmaz', () => {
    expect(colonyName('Kale', 5)).toBe('Kale 5');
  });
});
