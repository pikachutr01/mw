/**
 * @mobiwar/engine — savaş motoru. SAF ve YAN ETKİSİZ: girdi → çıktı.
 * DB, zaman, IO bilmez; rastgelelik yalnız enjekte edilen seed'li PRNG'den gelir (§5).
 *
 * Aynı motor hem gerçek savaşları hem menüdeki dahili simülatörü besler.
 */
export { simulate, applyTech, nightMultiplier, captureChance } from './combat.ts';
export { calculateLoot, plunderRate, type LootInput, type LootResult, type Resources } from './loot.ts';
export {
  DEFAULT_COMBAT_CONFIG, DEFAULT_LOOT_CONFIG, ENGINE_VERSION, mergeCombatConfig,
  type CombatConfig, type DeepPartial, type LootConfig,
} from './config.ts';
export { createRng, hashSeed, type Rng } from './rng.ts';
export {
  distance, armySpeed, travelSeconds, DEFAULT_MAP_CONFIG,
  type Coordinates, type MapConfig, type TravelInput,
} from './travel.ts';
export {
  heroSkillBudget, heroSkillTotal, assertHeroSkills, type HeroSkillBudget,
} from './hero.ts';
export type {
  SimulateInput, SimulateResult, SideInput, SideResult, UnitCounts, HeroInput,
} from './types.ts';
