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
import type { CombatConfig, DeepPartial, LootConfig, MapConfig } from '@mobilwar/engine';
import type { MeritConfig, MeritTier } from '@mobilwar/catalog';

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
  'combat.trapPressureScale': nest('trap', 'pressureScale'),
  // ⭐ `combat.trapGnomeDisarm` KALDIRILDI (2026-08-13) — motorda böyle bir katsayı kalmadı.
  'combat.trapPower': nest('trap', 'power'),
  'combat.gnomeSabotagePerStruct': nest('gnomeSabotage', 'perStruct'),
  'combat.gnomeSabotageMax': nest('gnomeSabotage', 'max'),
  'combat.debrisRate': flat('debrisRate'),
  'combat.debrisFromDefenses': flat('debrisFromDefenses'),
  'combat.combatThreshold': flat('combatThreshold'),

  'hero.levelBase': nest('hero', 'levelBase'),
  'hero.skillK': nest('hero', 'skillK'),
  'hero.skillKMagic': nest('hero', 'skillKMagic'),
  'hero.mDefLevelBase': nest('hero', 'mDefLevelBase'),
  'hero.areaK': nest('hero', 'areaK'),
  'hero.durumScale': nest('hero', 'durumScale'),
  'hero.pointsPerLevel': nest('hero', 'pointsPerLevel'),
  /**
   * ⭐ TEK ANAHTAR, İKİ ALAN. `hero.xpLoser` 2026-08-14'te kaldırıldı (gerekçe `schema.ts`te):
   * tecrübe TEK havuzdan bölüşülüyor, dolayısıyla payların toplamı 1 OLMAK ZORUNDA. Kaybedenin
   * payı burada — ayarın motora dönüştüğü tek sınırda — türetiliyor, böylece değişmez tek yerde
   * garanti altında; iki ayrı düğme bırakılsaydı toplamı 1'den farklı yapmak serbest kalırdı.
   */
  'hero.xpWinner': (out, v) => {
    const share = (out['heroXpShare'] ??= {});
    share['winner'] = v;
    share['loser'] = 1 - (v as number);
  },

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
  'loot.gapMinRate': 'gapMinRate',
  /**
   * ⭐⭐ İki `combat.*` anahtarı **ganimet** yapılandırmasına akıyor (2026-08-14) — sapma değil,
   * tek kaynak kuralının gereği. Küçük hesap bandı ve 10 kat sınırı iki yerde birden
   * tüketiliyor: saldırı kapısı (`mission.service.scoreGap`) ve ganimet fark çarpanı
   * (`engine/loot.gapFactor`). Ayrı `loot.*` anahtarları açsaydık operatör birini değiştirip
   * diğerini unutabilir, kapının izin verdiği saldırı bambaşka bir oranla ödüllendirilirdi.
   */
  'combat.attackScoreBand': 'gapBand',
  'combat.attackScoreRatio': 'gapRatioLimit',
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

/**
 * ⭐ `combat.*` önekli olup motora BİLEREK gitmeyen ayarlar — savaş ÖN KOŞULLARI.
 *
 * `MAPPED_KEYS` testi "combat/hero/capture/loot önekli her ayar motora bağlanmalı" diyor ve
 * bu kural doğru: bir ayarı eşlemeye eklemeyi unutmak, panelde görünen ama hiçbir şeyi
 * değiştirmeyen sessiz bir ayar üretir. Ama savaşın bazı kuralları motorda değil savaş
 * **başlamadan önce** işliyor — koşul tutmazsa görev hiç kurulmaz ve motor çağrılmaz.
 * Bunlar operatörün gözünde savaş ayarıdır (panelde orada arar), o yüzden anahtarları da
 * `combat.` önekli kalıyor.
 *
 * ⚠️ Liste ELLE ve GEREKÇELİ tutuluyor: yeni bir MOTOR ayarı eklenip eşlemesi unutulursa
 * test yine kırmızı yanar. Muafiyet ancak buraya bilerek bir satır yazılınca doğar.
 */
export const NOT_ENGINE_BOUND: readonly string[] = [
  /*
   * ⭐ **LİSTE 2026-08-14'te BOŞALDI.** `combat.attackScoreRatio` buradaydı ve gerekçesi
   * doğruydu: 10 kat kuralı `sendAttack` ön koşuludur, oran aşılırsa görev hiç yazılmaz.
   * Ama artık **ikinci bir tüketicisi** var — ganimet fark çarpanı aynı sınırı motorda
   * kullanıyor (`LOOT_MAP`) — yani anahtar hem ön koşul hem motor ayarı. Muafiyet kalktı.
   *
   * ⚠️ Dizi boş kalsın diye silinmedi: mekanizma duruyor ve bir sonraki "panelde var, motorda
   * yok" ayarı geldiğinde tek satırla ve gerekçesiyle buraya yazılacak.
   */
];

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

/**
 * ⭐ ASKERÎ ÜNVAN eşlemesi. Diğer ikisinden farklı olarak hedef nesne **basamak indeksli**
 * (`thresholds[2]`), o yüzden ayrı bir tablo: anahtar `merit.threshold2` → `thresholds[2]`.
 */
const MERIT_MAP: Readonly<Record<string, { field: 'thresholds' | 'days'; tier: MeritTier }>> = {
  'merit.threshold1': { field: 'thresholds', tier: 1 },
  'merit.threshold2': { field: 'thresholds', tier: 2 },
  'merit.threshold3': { field: 'thresholds', tier: 3 },
  'merit.threshold4': { field: 'thresholds', tier: 4 },
  'merit.days1': { field: 'days', tier: 1 },
  'merit.days2': { field: 'days', tier: 2 },
  'merit.days3': { field: 'days', tier: 3 },
  'merit.days4': { field: 'days', tier: 4 },
};

export function meritOverrides(
  values: Values, overridden: readonly string[],
): MeritConfig | undefined {
  const out: MeritConfig = { thresholds: {}, days: {} };
  let touched = false;
  for (const key of overridden) {
    const m = MERIT_MAP[key];
    if (!m) continue;
    const v = pick(values, key);
    if (typeof v !== 'number') continue;
    out[m.field][m.tier] = v;
    touched = true;
  }
  return touched ? out : undefined;
}

/** ⭐ Harita/sefer eşlemesi — hedef nesne düz, `LOOT_MAP` ile aynı desen. */
const MAP_MAP: Readonly<Record<string, keyof MapConfig>> = {
  'map.baseSeconds': 'baseSeconds',
  'map.k': 'k',
  'map.p': 'p',
  'map.districtWeight': 'districtWeight',
  'map.continentWeight': 'continentWeight',
  'map.districtCrossSeconds': 'districtCrossSeconds',
  'map.continentCrossSeconds': 'continentCrossSeconds',
  'map.cartographyStep': 'cartographyStep',
  'map.capHours': 'capHours',
};

export function mapOverrides(
  values: Values, overridden: readonly string[],
): Partial<MapConfig> | undefined {
  const out: Partial<MapConfig> = {};
  let touched = false;
  for (const key of overridden) {
    const field = MAP_MAP[key];
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
  ...Object.keys(COMBAT_MAP), ...Object.keys(LOOT_MAP), ...Object.keys(MERIT_MAP),
  ...Object.keys(MAP_MAP),
];
