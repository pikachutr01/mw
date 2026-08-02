/**
 * ⭐ AYAR → MOTOR EŞLEMESİ (admin Faz 4).
 *
 * Ayar anahtarları DÜZ (`combat.wallBase`), motor nesnesi İÇ İÇE (`wall.base`). Dönüşüm
 * burada, **tek yerde ve açıkça** yazılı.
 *
 * ⚠️ **EN ÖNEMLİ KURAL: hiçbir ayar değiştirilmemişse `undefined` döner.** `simulate(input)`
 * o zaman `DEFAULT_COMBAT_CONFIG`i aynen kullanır ve sonuç **bit-bit** eskisiyle aynı olur.
 * Burada her seferinde dolu bir nesne üretseydik, "varsayılan değerlerden yeniden kurulmuş"
 * bir config ile "varsayılanın kendisi" arasında bir gün sessiz bir kayma doğardı (bir alan
 * eklenir, buraya eklenmeyi unutulur, motor onu `undefined` görür). `overridden` listesi bu
 * riski tamamen kaldırıyor: dokunulmamış alan dönüştürülmüyor bile.
 *
 * Bu davranış `apps/api/test/combat-settings.test.ts`te ölçülüyor.
 */
import type { CombatConfig, DeepPartial, LootConfig } from '@mobilwar/engine';

type Values = Readonly<Record<string, Record<string, number | boolean> | undefined>>;

/** Bir ayar anahtarını motor alanına yazan fonksiyon. */
type Setter = (out: Record<string, Record<string, unknown> & Record<string, unknown>>, v: number | boolean) => void;

/** İç içe alana yazar: `nest('wall', 'base')`. */
const nest = (group: string, field: string): Setter => (out, v) => {
  (out[group] ??= {})[field] = v;
};

/** Düz alana yazar: `flat('shieldCal')`. */
const flat = (field: string): Setter => (out, v) => { out[field] = v as never; };

/**
 * ⚠️ Bu tablo motorun `CombatConfig`ini birebir yansıtır. Yeni bir ayar eklenince BURAYA da
 * satır eklenmezse ayar panelde görünür ama motora hiç ulaşmaz — sessiz ve can sıkıcı bir
 * hata olurdu. `combat-settings.test.ts` her `combat.*`/`hero.*`/`capture.*` anahtarının
 * burada karşılığı olduğunu doğruluyor.
 */
const COMBAT_MAP: Readonly<Record<string, Setter>> = {
  'combat.wallBase': nest('wall', 'base'),
  'combat.magicShieldBase': nest('magicShield', 'base'),
  'combat.shieldCal': flat('shieldCal'),
  'combat.counterK': flat('counterK'),
  'combat.nightBase': nest('night', 'base'),
  'combat.repairMin': nest('repair', 'min'),
  'combat.repairMax': nest('repair', 'max'),
  'combat.defenseFloorEnabled': nest('defenseFloor', 'enabled'),
  'combat.defenseFloorMin': nest('defenseFloor', 'minPerType'),
  'combat.trapTriggerMin': nest('trap', 'triggerMin'),
  'combat.trapTriggerMax': nest('trap', 'triggerMax'),
  'combat.trapPerGroundUnit': nest('trap', 'perGroundUnit'),
  'combat.trapGnomeDisarm': nest('trap', 'gnomeDisarm'),
  'combat.trapPower': nest('trap', 'power'),
  'combat.gnomeSabotagePerStruct': nest('gnomeSabotage', 'perStruct'),
  'combat.gnomeSabotageMax': nest('gnomeSabotage', 'max'),
  'combat.debrisRate': flat('debrisRate'),
  'combat.combatThreshold': flat('combatThreshold'),

  'hero.levelBase': nest('hero', 'levelBase'),
  'hero.skillK': nest('hero', 'skillK'),
  'hero.skillKMagic': nest('hero', 'skillKMagic'),
  'hero.mDefLevelBase': nest('hero', 'mDefLevelBase'),
  'hero.areaK': nest('hero', 'areaK'),
  'hero.durumScale': nest('hero', 'durumScale'),
  'hero.pointsPerLevel': nest('hero', 'pointsPerLevel'),
  'hero.xpWinner': nest('heroXpShare', 'winner'),
  'hero.xpLoser': nest('heroXpShare', 'loser'),

  'capture.perTempleLevel': nest('capture', 'perTempleLevel'),
  'capture.perHeroPenalty': nest('capture', 'perHeroPenalty'),
  'capture.xpScale': nest('capture', 'xpScale'),
  'capture.xpGate': nest('capture', 'xpGate'),
  'capture.maxHeroes': nest('capture', 'maxHeroes'),
};

/** Ganimet düz bir nesne; eşlemesi de düz. */
const LOOT_MAP: Readonly<Record<string, keyof LootConfig>> = {
  'loot.plunderRate': 'plunderRate',
  'loot.povertyThreshold': 'povertyThreshold',
  'loot.floorThreshold': 'floorThreshold',
  'loot.minRate': 'minRate',
  'loot.jitterMin': 'jitterMin',
  'loot.jitterMax': 'jitterMax',
};

/** Panelde görünen ama motora bilerek BAĞLANMAYAN yapılar — belgeye değil koda yazılıyor. */
export const NOT_TUNABLE = [
  // ⛔ `turnSchedule` — sayı değil, tur→faz tablosu. Bir formu doğrulanabilir biçimde
  //    üretilemez ve yanlış bir düzenleme savaşı sessizce bozar (kullanıcı kararı: KİLİTLİ).
  'turnSchedule',
  // ⛔ `defenseFloor.protectedTypes` — birim kimliği listesi; katalogla senkron olmalı (Faz 5).
  'defenseFloor.protectedTypes',
  // ⛔ `loot.condition` — sayı değil kip seçimi; üç değerden biri, ayrı bir editör ister.
  'loot.condition',
  // ⛔ `engineVersion` — türev; savaş künyesinin kimliği, elle değiştirilecek bir şey değil.
  'engineVersion',
] as const;

function pick(values: Values, key: string): number | boolean | undefined {
  const [group, leaf] = key.split('.') as [string, string];
  return values[group]?.[leaf];
}

/**
 * Değiştirilmiş anahtarlardan motor override'ı üretir.
 * Hiç değişiklik yoksa `undefined` → motor varsayılanını AYNEN kullanır.
 */
export function combatOverrides(
  values: Values, overridden: readonly string[],
): DeepPartial<CombatConfig> | undefined {
  const out: Record<string, Record<string, unknown>> = {};
  let touched = false;
  for (const key of overridden) {
    const setter = COMBAT_MAP[key];
    if (!setter) continue;
    const v = pick(values, key);
    if (v === undefined) continue;
    setter(out as never, v);
    touched = true;
  }
  return touched ? (out as unknown as DeepPartial<CombatConfig>) : undefined;
}

export function lootOverrides(
  values: Values, overridden: readonly string[],
): Partial<LootConfig> | undefined {
  const out: Partial<LootConfig> = {};
  let touched = false;
  for (const key of overridden) {
    const field = LOOT_MAP[key];
    if (!field) continue;
    const v = pick(values, key);
    if (typeof v !== 'number') continue;
    (out as Record<string, number>)[field] = v;
    touched = true;
  }
  return touched ? out : undefined;
}

/** Testin kullandığı liste: motora bağlı olması gereken tüm anahtarlar. */
export const MAPPED_KEYS: readonly string[] = [
  ...Object.keys(COMBAT_MAP), ...Object.keys(LOOT_MAP),
];
