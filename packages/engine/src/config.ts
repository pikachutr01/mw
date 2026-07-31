/**
 * Savaş motoru sabitleri. Motorda **hiçbir sihirli sayı kalmaz** (SİSTEM PLANI §13.7) —
 * hepsi buradan okunur, üretimde `world_config.combat` ile dünya bazında geçersiz kılınır.
 *
 * Eski v0.6 JS motorundaki `global.__X` override'larının yerini bu nesne aldı.
 */

/**
 * ⭐ TEK KAYNAK motor sürümü (2026-07-30, "temiz başlangıç"): `package.json`, `/health`
 * ve `battles.engine_version` hepsi buradan beslenir. `reference.test.ts` package.json
 * ile senkron kalmasını kilitler.
 *
 * Sürüm geçmişi: **1.0.0** temiz başlangıç · **1.1.0** (2026-07-31) ganimet taban oranı
 * %5 → %20. Denge sabiti değiştiği için ara sürüm artışı: eski savaş kayıtları künyesinde
 * 1.0.0 kalır, "bu savaş hangi dengeyle çözüldü" sorusu künyeden cevaplanabilir.
 */
export const ENGINE_VERSION = '1.1.0';

export interface CombatConfig {
  engineVersion: string;

  /** ⭐ [S] Sur — Büyü Kalkanı ile AYNI formül (bkz. magicShield), yalnız FİZİKSEL fazlarda hatta
   *  ve bölücüsü ölçekli. 2026-07-29: tasarımsal power/tough/exp modeli kaldırıldı. */
  wall: { base: number; durumMax: number };

  /**
   * ⭐ [K] Büyü Kalkanı — binary mekanizması (2026-07-29, `combat.ts` §K'ya bak).
   * Kalkan pasif çarpan DEĞİL; yalnız BÜYÜ fazında hatta olan, Sur'un ikizi bir savunma nesnesi:
   *   güç = round(base^Sv × Alan × durum/100) → P'ye girer (hasarın bir kısmını üstüne çeker)
   *   mitigasyon = mAtk × Sv × base^Sv × durum/100
   *   durum(0..durumMax) net hasarla erir; ekrandaki yüzde budur.
   * ⚠️ `base` binary'de 1,8. Oyunda seviye tavanı 40 → 1,8^40 ≈ 1,6e10; denge için düşürülebilir,
   * ama binary doğrulama koşularında 1,8 kalmalı.
   */
  magicShield: { base: number; durumMax: number };

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

  /**
   * [O] Savaş sonrası yapı onarımı: kaybın bu oranı geri gelir (her tür için bağımsız rulo).
   *
   * ⚠️ **ÖLÇÜM DOKÜMANLA ÇELİŞİYOR — ölçüm esas alındı** (kullanıcı kuralı: *"tablo ile metin
   * çelişirse tabloyu esas al, ama sayıyı tunable bir sabite koy ve çelişkiyi bildir"*).
   * Oyunun kendi metni *"%50-70 arası oranda yenilenir"* diyor; binary simülatörde alınan
   * **12 ölçüm** (2 yapı türü × gündüz/gece × 3 koşu) hepsi **0,75-0,81** aralığını ima ediyor.
   * Eski %50-70 aralığı ölçümün EN DÜŞÜĞÜNE bile ulaşamıyordu (200 kuleyle en çok 140 kalan
   * üretebiliyor, orijinalin en düşüğü 152) → aralık kesin olarak çürüdü.
   * Ayrıntı ve ham sayılar: `docs/veri/gece-savasi-olcumleri.md` C grubu.
   */
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

  /**
   * Şaman kalkanı katsayısı. ⭐ Binary'de katsayı YOK (`FSUBR` ile ham stat çıkarılır) → 1,0.
   * 2026-07-29'a kadar 0,85'ti; kullanıcının 8 ölçümlük kalkan serisi 1,0'ı kesinleştirdi
   * (kalkan yüzdesi RMSE 40,8 → 0,53 puan).
   */
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
  /**
   * ⭐ KAHRAMAN — binary modeli (2026-07-29, 60+ ölçümle doğrulandı).
   * Statlar `heroStats()` içinde; buradaki sabitler o formülün düğmeleri.
   */
  hero: {
    /** Seviye teriminin üs tabanı — binary `FUN_0040d884`: 1,07. */
    levelBase: number;
    /**
     * ⭐ Yetenek terimi: `taban × (1 + skillK × yetenek)` — **LİNEER ve seviyeden BAĞIMSIZ**.
     * Binary asm'de bu terim `taban × 1,06^yetenek` yazıyor ama ölçüm onu 25 kat küçük buluyor.
     * İki grup kesin sonuç verdi: L grubu (fizSald 12 sabit, sv 5/10/15/20 → katkı 68.866 /
     * 69.392 / 69.813 / 71.731 = sabit) ve P grubu (sv 0, puan 1-9 → puan başına 5.260…5.624).
     * Katsayı taraması net minimum veriyor: 4,0→%3,25 · 4,4→%1,58 · **4,8→%0,74** · 5,2→%1,86.
     */
    skillK: number;
    /**
     * ⭐ BÜYÜ kanadının katsayısı (büyüSald→magicHp, büyüSav→mAtk). Fizikselden AYRI çünkü
     * ölçüm öyle diyor: MK grubu (savunanda 900 Şaman) büyüSald 40'ta savunana yalnız 15 kayıp
     * verdiriyor; fiziksel katsayı 4,8 ile aynı satır 787 kayıp veriyor.
     * ⚠️ **DOĞRULANMADI** — M3/M4 ölçümü doygun çıktı (805/889 üzerinden 900). Temiz tarama
     * gerekiyor: `mobiwar-kahraman-kalan-testler` madde 2.
     */
    skillKMagic: number;
    /** mDef'in seviye üssü — yetenek terimi YOK (asm). */
    mDefLevelBase: number;
    /** Alan = round(mDef × areaK) — binary sabit 0x40dca8 = 0,005. */
    areaK: number;
    /** Durum düşüşü: `durum -= durumScale × net/mDef` — binary 100. */
    durumScale: number;
    /** Seviye başına verilen geliştirme puanı (oyun ekranından 5/5 doğrulandı). */
    pointsPerLevel: number;
  };

  /**
   * ⭐ Kahraman çıkma ihtimali (28/28 ölçüm). `temple` = oyuncunun TÜM şehirlerinin tapınak
   * seviyeleri TOPLAMI.
   */
  capture: {
    /** Tapınak toplamı başına taban puan (binary 10). */
    perTempleLevel: number;
    /** Mevcut her kahramanın ÇIKARDIĞI ceza (binary 155 — çarpımsal değil). */
    perHeroPenalty: number;
    /** XP çarpanı (binary 0,000025 → 40.000 XP'de doyar). */
    xpScale: number;
    /** Bu XP'nin ALTINDA hiç kahraman çıkmaz (binary 499). */
    xpGate: number;
    /** Oyuncunun sahip olabileceği en fazla kahraman. */
    maxHeroes: number;
  };

  /**
   * ⭐ Savaşın ürettiği tecrübenin taraflar arasında paylaşımı (kullanıcı kararı, 2026-07-29).
   * Her taraf KENDİ payını kendi sağ kalan kahramanları arasında seviyeyle ters orantılı böler;
   * o tarafta kahraman yoksa (ya da hepsi öldüyse) o pay ziyan olur, karşı tarafa GEÇMEZ.
   */
  heroXpShare: {
    /** Kazanan tarafın payı. */
    winner: number;
    /** Kaybeden tarafın payı — kahramanı sağ kaldıysa o da öğrenir. */
    loser: number;
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
  engineVersion: ENGINE_VERSION,
  wall: { base: 1.8, durumMax: 100 },          // ⭐ binary: kalkanla ortak (FUN_00413610/41338c)
  magicShield: { base: 1.8, durumMax: 100 },   // ⭐ binary: FUN_00413610/41338c (1.8^Sv, durum 0..100)
  trap: { triggerMin: 0.75, triggerMax: 0.99, perGroundUnit: 0.2, gnomeDisarm: 1.5, power: 1.0 },
  gnomeSabotage: { perStruct: 4, max: 0.35 },
  // ⚠️ 0,50-0,70 DEĞİL — bkz. yukarıdaki not (ölçüm 2026-07-31, 12 gözlem).
  repair: { min: 0.76, max: 0.81 },
  defenseFloor: {
    enabled: true,
    minPerType: 4,
    protectedTypes: ['archer_tower', 'oil_cauldron', 'mangonel_tower', 'guard', 'ballista'],
    debrisFromNetLosses: true,
  },
  shieldCal: 1.0,       // ⭐ binary ham çıkarma (eski 0,85 [REKON] yamasıydı)
  counterK: 1.0,        // ⭐ 2026-07-29: 1,01 yaması kaldırıldı (24 ölçümde net minimum K=1,0)
  hero: {
    levelBase: 1.07,
    skillK: 4.8,
    skillKMagic: 1.0,   // 🟡 geçici — M3 ölçümüne oturuyor (801↔806), MK2 biraz düşük kalıyor
    mDefLevelBase: 1.06,
    areaK: 0.005,
    durumScale: 100,
    pointsPerLevel: 3,
  },
  capture: { perTempleLevel: 10, perHeroPenalty: 155, xpScale: 0.000025, xpGate: 499, maxHeroes: 5 },
  heroXpShare: { winner: 2 / 3, loser: 1 / 3 },
  night: { base: 0.7 },
  turnSchedule: { 1: [], 2: [1, 3], 3: [1, 2, 3], 4: [1, 2, 3], 5: [1, 2, 3] },
  turn1GnomeSkirmish: false,
  defenderTypeFilter: false,
  combatThreshold: 0,
  debrisRate: 0.3,
};

/** Ganimet ayarları (§13.10.4 — havuz + kaynak-bazlı oran modeli, 2026-07-30). */
export interface LootConfig {
  /** Havuzdan (kasa + enkaz) alınan tavan oran — havuz `povertyThreshold` üstündeyken. */
  plunderRate: number;
  /** Bu eşiğin üstünde oran sabit `plunderRate`; altında `floorThreshold`a doğru doğrusal iner. */
  povertyThreshold: number;
  /** Bu eşiğin altında oran sabit `minRate` — sömürünün dibi (kullanıcı: 5.000). */
  floorThreshold: number;
  /** Taban oran — havuz `floorThreshold` altındayken (kullanıcı 2026-07-31: %5 → **%20**). */
  minRate: number;
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
  floorThreshold: 5_000,
  minRate: 0.20,
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
