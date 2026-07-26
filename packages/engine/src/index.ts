/**
 * @mobiwar/engine — savaş motoru. SAF ve YAN ETKİSİZ: girdi → çıktı.
 * DB, zaman, IO bilmez; rastgelelik yalnız enjekte edilen seed'li PRNG'den gelir (§5).
 *
 * Aynı motor hem gerçek savaşları hem menüdeki dahili simülatörü besler.
 */
export { simulate, applyTech, nightMultiplier, captureChance } from './combat.ts';
export { calculateLoot, plunderRate, type LootInput, type LootResult, type Resources } from './loot.ts';
export {
  DEFAULT_COMBAT_CONFIG, DEFAULT_LOOT_CONFIG, mergeCombatConfig,
  type CombatConfig, type LootConfig,
} from './config.ts';
export { createRng, hashSeed, type Rng } from './rng.ts';
export {
  heroSkillBudget, heroSkillTotal, assertHeroSkills, type HeroSkillBudget,
} from './hero.ts';
export type {
  SimulateInput, SimulateResult, SideInput, SideResult, UnitCounts, HeroInput,
} from './types.ts';

export const ENGINE_VERSION = '0.6.0';
