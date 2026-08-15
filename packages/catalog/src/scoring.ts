/**
 * ⭐ PUANIN KATALOG MATEMATİĞİ — saf, DB'siz, dünya bilmeyen kısım.
 *
 * Kural (oyunun kendi dokümanı): *"Harcanmış her 1000 birim kaynağa karşılık 1 puan."* Buradaki
 * fonksiyonlar o kuralın **fiyat tarafını** hesaplar; kim ne zaman ne kadar harcadı sorusu ve
 * `players.score_base` yazımı API'de (`apps/api/src/scoring/score.service.ts`) kalır.
 *
 * ⚠️ **Neden katalog paketinde?** Aynı sayıyı üç ayrı tüketici istiyor: puanı yazan API, denge
 * tezgâhı ekranı (`apps/web`), ve testler. Web `apps/api`den import edemez — kopyalasaydık bu
 * dosyanın komşusundaki `defenseStructureCost`un hikâyesi tekrarlanırdı: fiyat formülü üç dosyaya
 * çıplak `1.8` olarak kopyalanmış, dünya bazlı bir override'da oyuncu bir fiyattan ödeyip başka
 * bir fiyattan puanlanır olmuştu (`formulas.ts` · «DEFENSE_STRUCTURES» başlığı).
 *
 * ⚠️ **Bölen burada YOK.** `resourcePerPoint(worldId)` canlı ayar okuyor (`liveNumberFor`) ve
 * dünya kavramı bu pakette yasak — bu yüzden `pointsFromBase` böleni PARAMETRE alır. Varsayılanı
 * dokümanın 1000'i; çağıran dünyanınkini geçmekle yükümlü.
 */
import { LEVEL_BASED, UNITS_BY_ID } from './units.ts';
import { BUILDINGS_BY_ID, STARTING_BUILDINGS } from './buildings.ts';
import { TECHS_BY_ID } from './techs.ts';
import { buildingCost, defenseStructureCost, techCost, unitCost } from './formulas.ts';
import type { CatalogConfig } from './config.ts';

/** Kaç birim kaynak 1 puan eder (doküman: 1000) — panel dokunmamışsa bu kullanılır. */
export const RESOURCE_PER_POINT = 1000;

export interface ResourceAmount {
  gold: number;
  food: number;
}

/** Kaynağın puan tabanındaki karşılığı: altın ve yemek EŞİT ağırlıkta (doküman "kaynak" der). */
export function scoreValue(amount: ResourceAmount): number {
  return Math.max(0, amount.gold) + Math.max(0, amount.food);
}

/**
 * Taban → gösterilen puan. Tek yerde durur ki sunucu, ekran ve testler aynı yuvarlamayı kullansın.
 *
 * ⚠️ Yuvarlama `floor` ve bu bilinçli: puan TÜREV, kayıt değil. Taban saklanıp puan ondan
 * üretildiği için 900 + 900 harcayan oyuncu 1 puan alır; her harcamada ayrı ayrı yuvarlasaydık
 * binlik artıklar çöpe giderdi.
 */
export function pointsFromBase(base: number, perPoint = RESOURCE_PER_POINT): number {
  return Math.floor(Math.max(0, base) / Math.max(1, perPoint));
}

/**
 * ⭐ Adetli birimlerin (savaşçı + savunma birimi) katalog bedeli.
 *
 * Sur ve Büyü Kalkanı `LEVEL_BASED`: adet değil seviye taşırlar, savaşta adet kaybetmezler →
 * buraya girmezler (seviye bedeli `cumulativeDefenseStructureValue`de). Kahramanlar da hariç:
 * kaynakla üretilmiyorlar, savaştan çıkıyorlar.
 *
 * ⚠️ `unitCost` çağrılıyor, `def.gold + def.food` DEĞİL: ham okuma `economy.unitCostMultiplier`i
 * görmezdi ve çarpanı 2 olan bir dünyada oyuncu iki katı ödeyip tek katı puan kaybederdi — yani
 * ordu kaybetmek kârlı olurdu.
 */
export function unitsValue(counts: Record<string, number>, cfg?: CatalogConfig): number {
  let total = 0;
  for (const [id, n] of Object.entries(counts)) {
    if (!(n > 0) || LEVEL_BASED.has(id)) continue;
    if (!UNITS_BY_ID[id]) continue;
    total += scoreValue(unitCost(id, Math.trunc(n), cfg));
  }
  return total;
}

/**
 * Bir yapının ilk ÖDENEN seviyesinden `level`'a kadar ödenen TOPLAM bedeli.
 *
 * ⚠️ Kale/Baraka/Çiftlik/Maden seviye 1 hediyedir (§13.9) → toplam `STARTING_BUILDINGS[type] + 1`
 * seviyesinden başlar. 1'den başlatmak, oyuncunun hiç ödemediği bir seviyeyi puanlardı.
 */
export function cumulativeBuildingValue(
  type: string, level: number, cfg?: CatalogConfig,
): number {
  if (!BUILDINGS_BY_ID[type]) return 0;
  let total = 0;
  for (let l = (STARTING_BUILDINGS[type] ?? 0) + 1; l <= level; l++) {
    total += scoreValue(buildingCost(type, l, cfg));
  }
  return total;
}

export function cumulativeTechValue(type: string, level: number, cfg?: CatalogConfig): number {
  if (!TECHS_BY_ID[type]) return 0;
  let total = 0;
  for (let l = 1; l <= level; l++) total += scoreValue(techCost(type, l, cfg));
  return total;
}

/** Sur / Büyü Kalkanı seviye taşır; maliyeti katalogdan (`defenseStructureCost`) gelir. */
export function cumulativeDefenseStructureValue(
  type: string, level: number, cfg?: CatalogConfig,
): number {
  if (!UNITS_BY_ID[type]) return 0;
  let total = 0;
  for (let l = 1; l <= level; l++) total += scoreValue(defenseStructureCost(type, l, cfg));
  return total;
}
