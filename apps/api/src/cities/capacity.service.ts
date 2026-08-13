/**
 * ⭐ ALAN / BÜTÇE KURALLARI — tek yerden (SİSTEM PLANI §13.11.1c)
 *
 * Kullanıcı isteği: *"sonradan kolayca değiştirilebilir bir kod mimarisi"*. Bu yüzden kurallar
 * koda gömülmüyor, **veri** olarak tanımlanıyor ve tek servis genel olarak uyguluyor:
 * Sur'u bina bütçesine dahil etmek istersek `consumers` dizisine bir eleman eklemek yeterli —
 * kod değişmez.
 *
 * İki ayrı bütçe var:
 *  1. **Kale bütçesi:** Σ(BİNA seviyeleri) ≤ Kale × 10. Kale kendisi, Sur ve Büyü Kalkanı HARİÇ.
 *  2. **Savunma kapasitesi:** 25.000 × 1,30^(Sur−1). Her savunma birimi katalogdaki `area` kadar tüketir.
 */
import { BUILDINGS_BY_ID, UNITS_BY_ID, castleBudget, defenseCapacity } from '@mobilwar/catalog';

export interface AreaRules {
  buildingBudget: {
    sourceBuilding: string;
    perLevel: number;
    consumers: readonly string[];
  };
  defenseCapacity: {
    sourceBuilding: string;
    base: number;
    rate: number;
    consumers: readonly string[];
    /**
     * ⭐ Kural UYGULANSIN mı? Kullanıcı kararı (2026-07-27): **hayır** — savunma birimleri, üretim
     * ön-şartları sağlandığı sürece sınırsız üretilebilir. Sur'un kapasite vermesi mekaniği
     * hazır duruyor ama kapıyı kapatmıyor; denge gerektirirse tek `true` ile geri gelir.
     * Hesaplama her hâlükârda yapılır (arayüz "ne kadar yer kaplıyor" diyebilsin).
     */
    enforced: boolean;
  };
}

/** Varsayılan kurallar — üretimde `world_config.areaRules` bunları geçersiz kılar. */
export const DEFAULT_AREA_RULES: AreaRules = {
  buildingBudget: {
    sourceBuilding: 'castle',
    perLevel: 10,
    consumers: BUILDINGS_BY_ID['castle']
      ? Object.values(BUILDINGS_BY_ID).filter((b) => b.consumesCastleBudget).map((b) => b.id)
      : [],
  },
  defenseCapacity: {
    sourceBuilding: 'wall',
    base: 25_000,
    rate: 1.3,
    consumers: ['archer_tower', 'trap', 'oil_cauldron', 'mangonel_tower', 'guard', 'ballista', 'magic_shield'],
    enforced: false,
  },
};

export interface BudgetStatus {
  used: number;
  total: number;
  free: number;
  fits: boolean;
}

export class CapacityService {
  constructor(private readonly rules: AreaRules = DEFAULT_AREA_RULES) {}

  /**
   * Kale bütçesi. `extra` ile "bu yükseltmeyi yaparsam sığar mı?" sorulur.
   * Kale'nin KENDİ seviyesi sayılmaz; Sur/Büyü Kalkanı `consumers` listesinde olmadığı için girmez.
   *
   * ⚠️⚠️ **KALE YÜKSELTMESİ BU BÜTÇEYE TAKILMAZ — 2026-08-13 canlı kilitlenmesi.**
   *
   * Oyuncu bildirimi: *"20/20 kale durumundaydım ve kale basmayı bekliyordum, Baraka +1 gelince
   * 21/20 oldu. Şu an kaleye basamıyorum."* Ekranda `Kale seviyeniz yetersiz: 21/20. Kale'yi
   * yükseltin.` yazıyordu — yani hata mesajı çözümü söylüyor ve **tam da onu yasaklıyordu.**
   *
   * Sebep: `total` KALENİN O ANKİ seviyesinden hesaplanıyordu. Kale yükseltmesinde `extra`,
   * `consumers` listesinde olmadığı için `used`a eklenmiyordu (doğru) ama `total`ı da
   * büyütmüyordu (yanlış) → `used > total` olan bir şehirde kale yükseltmesi de reddediliyordu.
   * Bütçeyi artırmanın TEK yolu kaleyi yükseltmek olduğu için bu bir **çıkışsız döngü**.
   *
   * ⭐ Kural düzeltmesi tek cümle: **bu bütçe TÜKETİCİLERİ kısıtlar, kaynağını değil.** Kale
   * `consumesCastleBudget: false` taşıyor, yani zaten tüketici değil; onu kendi ürettiği
   * bütçeye karşı sınamak baştan kategori hatasıydı. Kale'nin kendi tavanı `maxBuildingLevel`
   * ile ayrıca korunuyor — burada serbest bırakmak sınırsızlık demek değil.
   *
   * ⚠️ `used > total` durumu normalde doğamaz (kapı zaten kapalı); bu şehirlere veri göçüyle
   * girildi (baraka seviye 1 eklenmesi, 2026-08-12). Yani kusur göçün değil, göçün ORTAYA
   * ÇIKARDIĞI eski bir kilitlenmenin. Düzeltme her iki yolu da kapatıyor.
   */
  buildingBudget(
    buildings: Record<string, number>,
    extra: { type: string; levels: number } | null = null,
  ): BudgetStatus {
    const { sourceBuilding, perLevel, consumers } = this.rules.buildingBudget;
    const current = Math.max(0, buildings[sourceBuilding] ?? 0);
    /** Kaynak yapının yükseltmesi bütçeyi TÜKETMEZ, BÜYÜTÜR → `total` yeni seviyeye göre. */
    const gain = extra && extra.type === sourceBuilding ? Math.max(0, extra.levels) : 0;
    const total = (current + gain) * perLevel;

    let used = 0;
    for (const type of consumers) used += Math.max(0, buildings[type] ?? 0);
    if (extra && consumers.includes(extra.type)) used += extra.levels;

    /**
     * ⭐ Kaynak yapının kendi yükseltmesi **koşulsuz** geçer. `gain` tek başına yetmezdi:
     * bütçeyi bir seviyelik kazançtan (10) daha fazla aşmış bir şehir yine kilitli kalırdı.
     * ⚠️ `extra` yokken (arayüzün "kalan bütçe" göstergesi) davranış DEĞİŞMEDİ — orada `fits`
     * hâlâ "şu an bütçe içinde miyim" sorusunun dürüst cevabı ve 21/20 kırmızı görünmeye
     * devam ediyor. Değişen yalnız "şunu yapabilir miyim" sorusunun kale için verdiği cevap.
     */
    const fits = extra != null && extra.type === sourceBuilding ? true : used <= total;
    return { used, total, free: total - used, fits };
  }

  /** Savunma kapasitesi: her birim katalogdaki `area` kadar tüketir. */
  defenseCapacity(
    buildings: Record<string, number>,
    defenses: Record<string, number>,
    extra: { type: string; count: number } | null = null,
  ): BudgetStatus {
    const wallLevel = Math.max(0, buildings[this.rules.defenseCapacity.sourceBuilding] ?? 0);
    const total = defenseCapacity(wallLevel);
    let used = 0;
    for (const type of this.rules.defenseCapacity.consumers) {
      const count = Math.max(0, defenses[type] ?? 0);
      if (count <= 0) continue;
      used += count * (UNITS_BY_ID[type]?.area ?? 0);
    }
    if (extra && this.rules.defenseCapacity.consumers.includes(extra.type)) {
      used += extra.count * (UNITS_BY_ID[extra.type]?.area ?? 0);
    }
    // Kural kapalıysa `fits` DAİMA doğru — sayılar yine hesaplanır, yalnız kapı kapanmaz.
    const fits = !this.rules.defenseCapacity.enforced || used <= total;
    return { used, total, free: total - used, fits };
  }

  /** Yapı seviye tavanı (§13.11.2): Çiftlik/Maden 40, diğer yapılar 20. */
  maxBuildingLevel(type: string): number {
    return BUILDINGS_BY_ID[type]?.maxLevel ?? 20;
  }

  /** Sur ve Büyü Kalkanı da 20 ile sınırlı ama `buildings` tablosunda değil `defenses`'ta. */
  maxDefenseStructureLevel(): number {
    return 20;
  }

  /** Arayüzün "kalan bütçe" göstergesi için tek çağrı. */
  status(buildings: Record<string, number>, defenses: Record<string, number>): {
    castle: BudgetStatus;
    defense: BudgetStatus;
  } {
    return {
      castle: this.buildingBudget(buildings),
      defense: this.defenseCapacity(buildings, defenses),
    };
  }
}

export { castleBudget, defenseCapacity };
