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

  /** Kahraman efektif model katsayıları [REKON-KALİBRE]. */
  hero: {
    defBase: number;
    defPerLevel: number;
    defPerFSav: number;
    offPerLevel2: number;
    offPerFSald: number;
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
    defBase: 1500,
    defPerLevel: 70,
    defPerFSav: 0.2,
    offPerLevel2: 120,
    offPerFSald: 0.25,
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
