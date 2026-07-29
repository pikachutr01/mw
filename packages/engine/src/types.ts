import type { TechLevels, UnitDef } from '@mobiwar/catalog';

/** Birim id → adet. */
export type UnitCounts = Record<string, number>;

export interface HeroInput {
  level: number;
  /** fiziksel saldırı yeteneği */
  fAtk?: number;
  /** fiziksel savunma yeteneği */
  fDef?: number;
  /** büyü saldırı (fiziksel savaşta etkisiz — D grubu) */
  mAtk?: number;
  /** büyü savunma (fiziksel savaşta etkisiz) */
  mDef?: number;
}

export interface SideInput {
  /**
   * ⭐ Sur'un savaşa GİRERKENKİ bütünlüğü (0-1). Verilmezse 1 (sağlam).
   * Onarım sürerken gelen ikinci saldırıda sur tam güçle savaşmasın diye var (§13.21.2).
   */
  wallIntegrity?: number;
  counts: UnitCounts;
  tech?: TechLevels;
  heroes?: HeroInput[];
  /** Kahraman çıkma ihtimali için (yalnız kazanan tarafta kullanılır). */
  temple?: number;
  heroCount?: number;
}

export interface SimulateInput {
  attacker: SideInput;
  defender: SideInput;
  /** Gece savaşı mı? */
  night?: boolean;
  /** Saldıranın Gece Görüşü seviyesi. */
  nightVisionAttacker?: number;
  /** Savunanın Gece Görüşü seviyesi. */
  nightVisionDefender?: number;
  /**
   * Deterministik seed. Üretimde `mission_id`, simülatörde kullanıcı verebilir veya rastgele üretilir.
   * Sonuçta geri döner → savaş yeniden oynatılabilir.
   */
  seed: string | number;
}

/** Motorun iç birim kaydı (statlar teknikle ölçeklenmiş hâlde). */
export interface ArmyUnit {
  id: string;
  name: string;
  type: 1 | 2 | 3;
  kind: 'warrior' | 'defense';
  /** canlı adet (savaş içinde kesirli olabilir) */
  count: number;
  /** savaş öncesi adet */
  count0: number;
  /** tur başı fotoğrafı */
  snap: number;
  /** onarım + savunma tabanı uygulanmış nihai adet (tam sayı) */
  countFinal: number;
  /** tuzak tükendi mi (onarılmaz) */
  spent: boolean;
  /** savunma tabanıyla geri gelen adet (rapor için) */
  restoredByFloor: number;
  stats: ScaledStats;
}

export interface ScaledStats {
  ref: UnitDef;
  hp: number;
  magicHp: number;
  carry: number;
  poolHp: number;
  poolMagicHp: number;
  pAtk: number;
  pDef: number;
  mAtk: number;
  mDef: number;
  unitPower: number;
}

/** Kahramanın savaşa giren ölçeklenmiş statları (`heroStats()` üretir). */
export interface HeroCombatStats {
  hp: number;
  magicHp: number;
  pAtk: number;
  pDef: number;
  mAtk: number;
  mDef: number;
  /** Savaş "birim puanı" = Alan; savunma havuzu P'ye bu girer. */
  unitPower: number;
}

export interface HeroState extends HeroInput {
  /**
   * 100'den başlar, hasar aldıkça düşer. ⭐ Kahraman **YALNIZ durum 0'a inince** ölür
   * (kullanıcı kararı 2026-07-29: olasılıklı ölüm yok).
   */
  durum: number;
  /** Seviye + yeteneklerden hesaplanmış savaş statları. */
  combat: HeroCombatStats;
}

/**
 * ⭐ SUR ve BÜYÜ KALKANI — binary'de **AYNI NESNE SINIFI** (mekanizma 2026-07-29'da çözüldü).
 *
 * Ordu yapısında iki ayrı alandır (Sur = ordu+0x10, Kalkan = ordu+0x98) ve savaş bağlamına
 * ctx+0x5c / ctx+0x60 olarak bağlanırlar. `HasarKayipCekirdegi` bunlardan **faza göre yalnız
 * birini** hatta alır: faz 1-2 (menzilli/yakın) → SUR · faz 3 (büyü) → KALKAN.
 * İkisi de "adet" değil **seviye + durum(0..100)** taşır; ekranda gösterilen yüzde `durum`dur
 * (`FUN_004132b0` = seviye>0 ? durum : 0). Tek yapısal farkları hasar bölücüsüdür:
 * Sur ölçekli mDef, Kalkan HAM mDef kullanır (bkz. `gradeTakeHit`).
 */
export interface GradedStruct {
  level: number;
  /** DURUM: 0..100 (binary +0x80). Ekrandaki yüzde birebir budur. */
  durum: number;
  stats: ScaledStats;
  /** Seviye üssünün tabanı (binary 1,8) — denge düğmesi, `CombatConfig`ten gelir. */
  base: number;
}

export type WallState = GradedStruct;
export type ShieldState = GradedStruct;

export interface Army {
  units: ArmyUnit[];
  heroes: HeroState[];
  heroLevel: number;
  tech: TechLevels;
  wall: WallState | null;
  shield: ShieldState | null;
  lossMag: number;
}

export interface SideResult {
  /** hayatta kalan toplam (onarım + taban sonrası) */
  alive: number;
  /** kaybedilen SAVAŞÇI sayısı (savunma yapıları bu toplama girmez) */
  lost: number;
  counts: UnitCounts;
  /** savunma tabanının geri getirdiği birimler (yalnız savunanda anlamlı) */
  floorRestored: UnitCounts;
  heroes: { level: number; durum: number; alive: boolean }[];
  /** sur bütünlüğü 0-1 (sur yoksa null) */
  wallIntegrity: number | null;
  /** büyü kalkanı bütünlüğü 0-1 (kalkan yoksa null) */
  shieldIntegrity: number | null;
}

export interface SimulateResult {
  winner: 'attacker' | 'defender' | 'draw';
  turns: number;
  attacker: SideResult;
  defender: SideResult;
  /** enkaz (iki tarafın NET ölülerinden) */
  debris: { gold: number; food: number };
  xp: number;
  captureChance: number;
  /** hayatta kalan saldıran birimlerin toplam taşıma kapasitesi (ganimet hesabı için) */
  attackerCarryCapacity: number;
  engineVersion: string;
  catalogHash: string;
  seed: number;
}
