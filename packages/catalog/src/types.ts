/**
 * Katalog tipleri.
 *
 * ADLANDIRMA (SİSTEM PLANI §13.14): tüm `id` değerleri İngilizce snake_case'tir ve aynı zamanda
 * ikon dosya adıdır (`assets/<klasör>/<id>.png`). Oyuncuya görünen Türkçe ad `name.tr` alanındadır.
 *
 * ⚠️ STAT ADLARI YANILTICI (bkz. TEKNIK_MANTIK_RAPORU.md §0) — binary index adları korunmuştur
 * ama gerçek işlevleri şunlardır:
 *   hp      → fiziksel VURUŞ GÜCÜ (faz 1/2 saldırı havuzu payı)
 *   magicHp → büyü VURUŞ GÜCÜ    (faz 3 saldırı havuzu payı)
 *   pAtk    → MENZİLLİ (ok) SAVUNMASI (faz 1 mitigasyonu)
 *   pDef    → YAKIN DÖVÜŞ SAVUNMASI  (faz 2 mitigasyonu)
 *   mAtk    → BÜYÜ SAVUNMASI         (faz 3 mitigasyonu)
 *   mDef    → genel DAYANIKLILIK     (kayıp bölücüsü)
 */

/** Saldırı fazı türü: 1 = menzilli, 2 = yakın, 3 = büyü. */
export type PhaseType = 1 | 2 | 3;

/** 'warrior' = barakada üretilen savaşçı, 'defense' = surdaki savunma birimi/yapısı. */
export type UnitKind = 'warrior' | 'defense';

export interface LocalizedName {
  tr: string;
  en?: string;
}

export interface UnitDef {
  /** İngilizce snake_case; ikon dosya adı = bu değer. */
  id: string;
  name: LocalizedName;
  kind: UnitKind;
  type: PhaseType;
  /** fiziksel vuruş gücü */
  hp: number;
  /** büyü vuruş gücü */
  magicHp: number;
  /** ganimet taşıma kapasitesi (birim başına) */
  carry: number;
  /** menzilli savunma */
  pAtk: number;
  /** yakın savunma */
  pDef: number;
  /** büyü savunması */
  mAtk: number;
  /** genel dayanıklılık (kayıp bölücüsü) */
  mDef: number;
  /** üretim maliyeti — altın */
  gold: number;
  /** üretim maliyeti — yemek */
  food: number;
  /**
   * "Alan" değeri. TEK sayı ÜÇ iş yapıyor (§13.11.3):
   *   1) savaşta birim gücü (P paydası payı)
   *   2) sur/bina kapasitesinde kapladığı alan
   *   3) üretim süresi (Model A: süre = area × 0.95^(Baraka−1))
   */
  area: number;
  /**
   * Sefer hızı (§13.5.2). Ordunun hızı **en yavaş birimin** hızıdır; süre `100/v` ile ölçeklenir.
   * Savunma birimleri yürümez → 0 (sefere hiç katılamazlar).
   */
  speed: number;
}

export type TechId =
  | 'archery'
  | 'blacksmithing'
  | 'chemistry'
  | 'instinct'
  | 'sorcery'
  | 'talisman'
  | 'armor'
  | 'masonry'
  | 'espionage'
  | 'cartography'
  | 'colonization'
  | 'night_vision';

/** Bir tekniğin savaş statlarına etkisi. */
export type TechStat = 'atk' | 'matk' | 'pmit' | 'mmit';

export interface TechDef {
  id: TechId;
  name: LocalizedName;
  /** Seviye başına oran (lineer): stat × (1 + seviye × rate). Savaş etkisi yoksa 0. */
  rate: number;
  /** Hangi stata etki eder (savaş etkisi olmayan tekniklerde null). */
  stat: TechStat | null;
  /** Etkilediği birim id'leri (doküman "Etkilendiği Teknikler" listelerinden). */
  units: string[];
  /** Taban maliyet (maliyet = base × 1.5^(seviye+1)). */
  baseGold: number;
  baseFood: number;
}

export type BuildingId =
  | 'castle'
  | 'barracks'
  | 'farm'
  | 'mine'
  | 'academy'
  | 'architect_school'
  | 'cave'
  | 'temple'
  | 'teleport';

export interface BuildingDef {
  id: BuildingId;
  name: LocalizedName;
  baseGold: number;
  baseFood: number;
  /** Seviye tavanı (§13.11.2). */
  maxLevel: number;
  /** Çiftlik/Maden maliyet istisnası: base × level × 1.45^(level−1). */
  economyCostCurve: boolean;
  /** Kale bütçesini tüketir mi (§13.11.1)? Kale, Sur ve Büyü Kalkanı tüketmez. */
  consumesCastleBudget: boolean;
}
