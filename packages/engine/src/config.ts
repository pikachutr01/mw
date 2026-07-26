/**
 * Savaş motoru sabitleri. Motorda **hiçbir sihirli sayı kalmaz** (SİSTEM PLANI §13.7) —
 * hepsi buradan okunur, üretimde `world_config.combat` ile dünya bazında geçersiz kılınır.
 *
 * Eski v0.6 JS motorundaki `global.__X` override'larının yerini bu nesne aldı.
 */
export interface CombatConfig {
  engineVersion: string;

  /** [S] Sur: güç = power × sv^exp × bütünlük · bölücü = tough. */
  wall: { power: number; tough: number; exp: number };

  /** [K] Büyü Kalkanı: büyü hasarını min(max, perLevel × etkinSeviye) kadar azaltır. */
  magicShield: { perLevel: number; max: number; shamanPerLevel: number };

  /** [Z] Tuzak: tek kullanımlık salvo. */
  trap: {
    triggerMin: number;
    triggerMax: number;
    /** 1 tuzağın tetiklenmesi için gereken yer-birimi payı (doygunluk). */
    perGroundUnit: number;
    /** Saldırandaki her Gnom ortalama bu kadar tuzağı etkisiz bırakır (±%30 rastgele). */
    gnomeDisarm: number;
    /** Salvo şiddeti çarpanı. */
    power: number;
  };

  /** [G] Gnom sabotajı: savunma yapılarının vuruş gücünü düşürür. */
  gnomeSabotage: { perStruct: number; max: number };

  /** [O] Savaş sonrası yapı onarımı: kaybın %50-70'i geri gelir (her tür için bağımsız rulo). */
  repair: { min: number; max: number };

  /**
   * ⭐ SAVUNMA TABANI (§13.11.10, kullanıcı kuralı): her savunma birimi TİPİNDEN savaş sonrası
   * en az `minPerType` tanesi kalır (savaş öncesi adedi kadarıyla sınırlı).
   */
  defenseFloor: {
    enabled: boolean;
    minPerType: number;
    /** Tuzak HARİÇ — tek kullanımlık mühimmat, "yıkıldı" değil "kullanıldı" sayılır. */
    protectedTypes: readonly string[];
    /** Enkaz/XP NET kayıptan hesaplansın mı? (Kapalıysa sonsuz enkaz çiftliği açılır.) */
    debrisFromNetLosses: boolean;
  };

  /** Şaman kalkanı kalibrasyon katsayısı [REKON]. */
  shieldCal: number;

  /** Karşı-yön (savunan→saldıran) kalibrasyonu [REKON]: motor saldıranı ~%1 az öldürüyordu. */
  counterK: number;

  /**
   * Kahraman modeli [REKON-KALİBRE — `KAHRAMAN_TESTLERI.md`, G/S/D/X **+ Y** turları].
   *
   * ⚠️ **DÜZELTME (Y turu, 2026-07-26):** bir ara "yetenek etkisi ÜSSEL, puan başına ×1,18"
   * demiştim — **yanlıştı.** O çıkarım yalnız 0-12 puanlık pencereden geliyordu. Y turu 24/45/60
   * puanı ölçtü ve puan başına kazanç **yavaşlıyor**: ×1,244 → ×1,082 → ×1,043 → ×1,036 → ×1,018.
   * Tüm aralığa bakıldığında şekil **TOPLAMSAL ve puanda LİNEER**.
   *
   *   heroOff = offLevelCoef × seviye²  +  offPerPoint × fizSald
   *   heroDef = defBase + defPerLevel × seviye  +  defPerPoint × fizSav
   *
   * Geri çözülen ofans (lvl15): 0/6/12/24/45 puan → 16.9k / 62.7k / 100.7k / 166k / 346k;
   * lvl20 60 puan → 455k. Yüksek puanda **seviye terimi gürültü** kalıyor (lvl15 s45 ile
   * lvl20 s60 aynı doğruya oturuyor) — çünkü oyunda puan zaten seviyeye bağlı (3/seviye).
   */
  hero: {
    /** Savunma katkısı: defBase + defPerLevel × seviye + defPerPoint × fizSav */
    defBase: number;
    defPerLevel: number;
    defPerPoint: number;
    /** Ofans katkısı: offLevelCoef × seviye² + offPerPoint × fizSald */
    offLevelCoef: number;
    offPerPoint: number;
    /**
     * Kahraman katkısına tavan (kendi ordusunun havuzunun/P'sinin katı olarak).
     *
     * ⚠️ **Y turu tavanı ÇÜRÜTTÜ:** ölçüm, tam puanlı kahramanın gerçekten **ordu ölçeğinde**
     * olduğunu gösterdi (lvl20/60 puan: saldıran 4.300 birimin yalnız 318'ini kaybederek
     * savunanı 4 turda siliyor). Bu yüzden varsayılan **2,0** = ölçülen aralıkta devre dışı.
     * Alan yine de duruyor: denge gerekçesiyle kısmak istenirse tek config satırı (oyun tasarımı
     * kararı olur, ölçüm değil).
     */
    maxPoolShare: number;
    /** Seviye başına verilen geliştirme puanı (kullanıcı doğrulaması, 2026-07-26). */
    pointsPerLevel: number;
    /** Kahramanın bedava taşıdığı baskı eşiği (pool/P). */
    durumMitigation: number;
    /** Eşik üstü baskının durumu düşürme hızı. */
    durumK: number;
  };

  /** Gece görüşü: (1 − 3/(L+3)) × (1−base) + base. */
  night: { base: number };

  /** Tur programı: hangi turda hangi faz türleri devrede. Tur 1 = skirmish (genel vuruşma yok). */
  turnSchedule: Readonly<Record<number, readonly (1 | 2 | 3)[]>>;

  /** Binary'nin Tur1 gnom-skirmish'i (emekli; yalnız arşiv/karşılaştırma için). */
  turn1GnomeSkirmish: boolean;

  /** Savunanda faz-tipi filtresi (ÇÜRÜTÜLDÜ — menzilli birim yer birimini vurabilir). */
  defenderTypeFilter: boolean;

  /** Yenik kontrolünde kalan-güç eşiği. */
  combatThreshold: number;

  /** Enkaz oranı: ölen birim maliyeti × bu oran. */
  debrisRate: number;
}

export const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  engineVersion: '0.6.0',
  wall: { power: 2500, tough: 12000, exp: 0.5 },
  magicShield: { perLevel: 0.05, max: 0.6, shamanPerLevel: 50 },
  trap: { triggerMin: 0.75, triggerMax: 0.99, perGroundUnit: 0.2, gnomeDisarm: 1.5, power: 1.0 },
  gnomeSabotage: { perStruct: 4, max: 0.35 },
  repair: { min: 0.5, max: 0.7 },
  defenseFloor: {
    enabled: true,
    minPerType: 4,
    protectedTypes: ['archer_tower', 'oil_cauldron', 'mangonel_tower', 'guard', 'ballista'],
    debrisFromNetLosses: true,
  },
  shieldCal: 0.85,
  counterK: 1.01,
  hero: {
    defBase: 3000,
    defPerLevel: 140,
    defPerPoint: 420,
    offLevelCoef: 75,
    offPerPoint: 7400,
    maxPoolShare: 2.0,
    pointsPerLevel: 3,
    durumMitigation: 5.0,
    durumK: 0.0002,
  },
  night: { base: 0.7 },
  turnSchedule: { 1: [], 2: [1, 3], 3: [1, 2, 3], 4: [1, 2, 3], 5: [1, 2, 3] },
  turn1GnomeSkirmish: false,
  defenderTypeFilter: false,
  combatThreshold: 0,
  debrisRate: 0.3,
};

/** Ganimet ayarları (§13.10.4). */
export interface LootConfig {
  /** Şehir kasasından yağma oranı. */
  plunderRate: number;
  /** Yoksulluk sönümlemesi eşiği: oran × min(1, kaynak/threshold). */
  povertyThreshold: number;
  jitterMin: number;
  jitterMax: number;
  /**
   * Yağmanın şartı.
   *  attackerWon      — saldıran kazandıysa (KULLANICI KARARI, varsayılan)
   *  undefendedBefore — yalnız savaş öncesi savunmasız şehirde (eski davranış)
   *  never            — yağma yok, sadece enkaz
   */
  condition: 'attackerWon' | 'undefendedBefore' | 'never';
}

export const DEFAULT_LOOT_CONFIG: LootConfig = {
  plunderRate: 0.4,
  povertyThreshold: 100_000,
  jitterMin: 0.85,
  jitterMax: 1.15,
  condition: 'attackerWon',
};

/** Derin birleştirme yerine sığ-katman birleştirme yeter: config iki seviyeli. */
export function mergeCombatConfig(overrides?: DeepPartial<CombatConfig>): CombatConfig {
  if (!overrides) return DEFAULT_COMBAT_CONFIG;
  const base = DEFAULT_COMBAT_CONFIG as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = { ...(base[k] as object), ...(v as object) };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as unknown as CombatConfig;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };
