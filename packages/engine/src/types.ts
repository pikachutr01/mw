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

export interface HeroState extends HeroInput {
  /** 100'den başlar, hasar aldıkça düşer, 0'da ölür. */
  durum: number;
}

export interface WallState {
  level: number;
  /** kalan bütünlük (SEVİYE biriminde) */
  left: number;
  base: number;
  tough: number;
  stats: ScaledStats;
}

/**
 * ⭐ BÜYÜ KALKANI BÜTÜNLÜĞÜ (§13.21) — Sur'un ikizi.
 *
 * Binary'de kalkan, Sur ile **aynı listede** (savunma yapıları grubu) duran ve **aynı hasar
 * formülünden geçen** bir birimdir; simülatörün ekranında ikisi de yüzde olarak gösterilir
 * (`sub_412a78` = kalan, float). Tek farkı ne zaman hasar aldığı: Sur her fazda, kalkan
 * **yalnız büyü fazında**.
 */
export interface ShieldState {
  level: number;
  /** kalan bütünlük (SEVİYE biriminde) */
  left: number;
  stats: ScaledStats;
}

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
