/* =============================================================================
 * Mobiwar savaş motoru — v0.6.0'ın TypeScript portu (SİSTEM PLANI Faz 0)
 * -----------------------------------------------------------------------------
 * JS sürümünden (mobiwar-engine.js v0.6.0) FARKLARI:
 *   1. `Math.random()` YOK → enjekte edilen seed'li PRNG (§5). Savaş yeniden oynatılabilir.
 *   2. `global.__X` override'ları YOK → `CombatConfig` (§13.7).
 *   3. Birim id'leri İngilizce (§13.14), statlar `@mobiwar/catalog`'tan gelir.
 *   4. ⭐ SAVUNMA TABANI (§13.11.10) eklendi — her savunma tipinden en az 4 kalır.
 *   5. Enkaz/XP artık NET kayıptan (taban ile geri gelenler ölü sayılmaz) — sonsuz enkaz çiftliği yok.
 *
 * Binary'den DOĞRULANMIŞ çekirdek korunur: hasar formülü (FUN_0040e0c4), tur akışı, havuz/P
 * dağıtımı, enkaz, XP, kahraman, ±%0.1 jitter, 5 tur tavanı.
 * ========================================================================== */
import {
  FLYING, NONCOMBAT, NO_POOL, NO_ROUND_LOSS, OUT_OF_BATTLE, PASSIVE_STRUCTS, SETTLE_ON_LOSS,
  LEVEL_BASED, TECHS_BY_ID, TECH_BY_UNIT, UNITS, UNITS_BY_ID, catalogHash,
  type TechLevels, type UnitDef,
} from '@mobiwar/catalog';
import { type CombatConfig, DEFAULT_COMBAT_CONFIG } from './config.ts';
import { createRng, type Rng } from './rng.ts';
import type {
  Army, ArmyUnit, HeroState, ScaledStats, SideInput, SideResult, SimulateInput, SimulateResult,
  UnitCounts, WallState,
} from './types.ts';

const round = (x: number): number => Math.round(x);

/** §2 / FUN_00410e60: (rand%3)+999, ×0.001 → 0.999 | 1.000 | 1.001 */
function jitter(rng: Rng): number {
  return (((rng.next() * 3) | 0) + 999) * 0.001;
}

/* ── Teknik ölçekleme ──────────────────────────────────────────────────────── */

/**
 * Bir birimin savaş statlarını teknik seviyeleriyle ölçekler.
 * Bir stata birden çok teknik etki ediyorsa (tek örnek: Ogre = Demircilik + İçgüdü) bonuslar
 * TOPLANIR: 1 + Σ(seviye × rate). Kahramanlar tekniklerden ETKİLENMEZ (doküman).
 */
export function applyTech(base: UnitDef, tech: TechLevels | undefined): ScaledStats {
  const bonus = { atk: 0, matk: 0, pmit: 0, mmit: 0 };
  for (const [techId, stat] of TECH_BY_UNIT[base.id] ?? []) {
    const level = Math.max(0, tech?.[techId] ?? 0);
    bonus[stat] += level * (TECHS_BY_ID[techId]?.rate ?? 0);
  }
  const hp = base.hp * (1 + bonus.atk);
  const magicHp = base.magicHp * (1 + bonus.matk);
  return {
    ref: base,
    hp,
    magicHp,
    carry: base.carry,
    // Havuz Can'ı LİNEER-teknik ölçeğinde alınır (üstel ×2 katmanı havuza girmez) [REKON-KALİBRE].
    poolHp: hp,
    poolMagicHp: magicHp,
    pAtk: base.pAtk * (1 + bonus.pmit),
    pDef: base.pDef * (1 + bonus.pmit),
    mAtk: base.mAtk * (1 + bonus.mmit),
    // mDef'i lineer teknik etkilemez → taban dayanıklılık.
    mDef: base.mDef,
    // Savaş "birim puanı" = katalogdaki Alan (binary train hücresi).
    unitPower: base.area,
  };
}

/** §7 Gece görüşü çarpanı — yalnız Can, BüyüCan ve Taşıma'yı etkiler. */
export function nightMultiplier(nightVision: number, cfg: CombatConfig = DEFAULT_COMBAT_CONFIG): number {
  const L = Math.max(0, Math.trunc(nightVision));
  return (1 - 3 / (L + 3)) * (1 - cfg.night.base) + cfg.night.base;
}

/* ── Ordu kurulumu ─────────────────────────────────────────────────────────── */

function buildArmy(side: SideInput, isDefender: boolean, cfg: CombatConfig): Army {
  const tech = side.tech ?? {};
  const heroes: HeroState[] = (side.heroes ?? [])
    .filter((h) => h && (h.level | 0) > 0)
    .map((h) => ({ ...h, durum: 100 }));
  const heroLevel = heroes.reduce((m, h) => Math.max(m, h.level | 0), 0);

  const units: ArmyUnit[] = [];
  for (const def of UNITS) {
    // Savunma yapıları yalnız savunan orduda bulunur.
    if (def.kind === 'defense' && !isDefender) continue;
    const count = Math.max(0, Math.trunc(side.counts[def.id] ?? 0));
    if (count <= 0) continue;
    units.push({
      id: def.id, name: def.name.tr, type: def.type, kind: def.kind,
      count, count0: count, snap: count, countFinal: count,
      spent: false, restoredByFloor: 0,
      stats: applyTech(def, tech),
    });
  }

  // §S SUR — adet değil BÜTÜNLÜK. Seviye kalıcıdır; savaşta yıpranır, savaş sonrası onarılır.
  const wallLevel = isDefender ? Math.max(0, Math.trunc(side.counts['wall'] ?? 0)) : 0;
  let wall: WallState | null = null;
  if (wallLevel > 0) {
    const masonryRate = TECHS_BY_ID['masonry']?.rate ?? 0.06;
    const masonryFactor = 1 + Math.max(0, tech.masonry ?? 0) * masonryRate;
    const wallDef = UNITS_BY_ID['wall'] as UnitDef;
    wall = {
      level: wallLevel,
      left: wallLevel,
      base: cfg.wall.power * wallLevel ** cfg.wall.exp * masonryFactor,
      tough: cfg.wall.tough * masonryFactor,
      stats: applyTech(wallDef, tech),
    };
  }

  return { units, heroes, heroLevel, tech, wall, lossMag: 0 };
}

function applyNight(army: Army, nightVision: number, cfg: CombatConfig): void {
  const m = nightMultiplier(nightVision, cfg);
  // Gece hem CAN hem BÜYÜCAN havuzunu azaltır (ikisi de "can") + taşıma kapasitesini.
  for (const e of army.units) {
    e.stats.hp *= m;
    e.stats.poolHp *= m;
    e.stats.magicHp *= m;
    e.stats.poolMagicHp *= m;
    e.stats.carry *= m;
  }
}

/* ── Kahraman ──────────────────────────────────────────────────────────────── */

/**
 * Kahramanın KENDİ P'sine katkısı (savunma) — durum düştükçe azalır.
 * fizSav ÜSSEL etki eder: 10 puan ≈ ×1,79 (ölçüm: lvl10'da 4.500 → 8.000).
 */
function heroDefPower(h: HeroState, cfg: CombatConfig): number {
  if ((h.level | 0) <= 0) return 0;
  const { defBase, defPerLevel, defSkillBase } = cfg.hero;
  const base = defBase + defPerLevel * (h.level | 0);
  return round(base * defSkillBase ** Math.max(0, h.fDef ?? 0) * h.durum / 100);
}

/**
 * Kahramanın saldırı havuzuna katkısı (ofans) — seviyeye göre kuadratik, fizSald'a göre ÜSSEL.
 * Ölçüm (lvl15): 0/6/12 puan → 17.500 / 40.000 / 125.000.
 */
function heroOffPower(h: HeroState, cfg: CombatConfig): number {
  if ((h.level | 0) <= 0) return 0;
  const { offCoef, offSkillBase } = cfg.hero;
  const lvl = h.level | 0;
  return round(offCoef * lvl * lvl * offSkillBase ** Math.max(0, h.fAtk ?? 0) * h.durum / 100);
}

/**
 * ⚠️ Kahraman katkısına TAVAN: kendi ordusunun katkısının en fazla `maxPoolShare` katı.
 * Üssel yetenek etkisi 0-12 puan verisiyle kalibre edildi; oyuncunun seviye 15'te 45 puanı var
 * (3/seviye). Tavan olmadan tek kahraman orduyu ikame ederdi — bu bir DENGE kararıdır, ölçüm değil.
 */
function capHeroContribution(heroValue: number, armyValue: number, cfg: CombatConfig): number {
  if (heroValue <= 0) return 0;
  const cap = armyValue * cfg.hero.maxPoolShare;
  return armyValue > 0 && heroValue > cap ? cap : heroValue;
}

const armyHeroDef = (a: Army, cfg: CombatConfig): number =>
  a.heroes.reduce((s, h) => s + heroDefPower(h, cfg), 0);
const armyHeroOff = (a: Army, cfg: CombatConfig): number =>
  a.heroes.reduce((s, h) => s + heroOffPower(h, cfg), 0);

/* ── Havuzlar ──────────────────────────────────────────────────────────────── */

const alive = (a: Army): number => a.units.reduce((n, e) => n + Math.max(0, e.count), 0);

/** Yenik kontrolü: yük/casus/gnom/tuzak SAYILMAZ (binary FUN_004114b0). */
const combatAlive = (a: Army, cfg: CombatConfig): number =>
  a.units.reduce(
    (n, e) => (NONCOMBAT.has(e.id) || e.count <= cfg.combatThreshold ? n : n + Math.max(0, e.count)),
    0,
  );

/** §2 Saldırı havuzu (FUN_0040e0c4 faz 1): tür-eşleşen birimlerin Can/BüyüCan × Adet toplamı. */
function combatPool(
  army: Army, type: 1 | 2 | 3, useSnap: boolean, sabotage: number, cfg: CombatConfig,
): number {
  let pool = 0;
  const sab = 1 - Math.max(0, Math.min(0.95, sabotage));
  for (const e of army.units) {
    const c = useSnap ? e.snap : e.count;
    if (c <= 0) continue;
    if (NO_POOL.has(e.id)) continue;            // şaman/gnom: havuza katkı vermez
    if (PASSIVE_STRUCTS.has(e.id)) continue;    // sur/kalkan/tuzak/tapınak: kendi mekanikleri var
    // §G Gnom sabotajı yalnız savunma YAPILARININ vuruş gücünü düşürür.
    const k = e.kind === 'defense' ? sab : 1;
    if (type === 3) pool += e.stats.poolMagicHp * c * k;
    else if (e.type === type) pool += e.stats.poolHp * c * k;
  }
  // Kahraman OFANSI yalnız fiziksel fazlarda. (Büyü yetenekleri etkisiz çünkü kahramanın
  // büyü TABAN statları 0 — binary formülü `taban × 1,06^yetenek` çarpımsaldır, 0×n = 0.)
  if (type !== 3) pool += capHeroContribution(armyHeroOff(army, cfg), pool, cfg);
  return pool;
}

const wallPower = (w: WallState | null): number => (w && w.left > 0 ? w.base * w.left : 0);

/** §2 Savunma güç havuzu P: Σ BirimPuan×Adet + sur + kahraman gücü. */
function powerSum(army: Army, useSnap: boolean, cfg: CombatConfig): number {
  let P = 0;
  for (const e of army.units) {
    if (PASSIVE_STRUCTS.has(e.id) || OUT_OF_BATTLE.has(e.id)) continue;
    const c = useSnap ? e.snap : e.count;
    P += e.stats.unitPower * Math.max(0, c);
  }
  P += wallPower(army.wall);
  return P + capHeroContribution(armyHeroDef(army, cfg), P, cfg);
}

/**
 * §2b ŞAMAN KALKANI (binary `atkSub`): savunan tarafın Şaman'ı gelen saldırı gücünü emer.
 * Yeterli Şaman ile gelen güç ≤ 0 olur → o taraf o fazda SIFIR kayıp alır.
 */
function shamanShield(def: Army, cfg: CombatConfig): number {
  const sh = def.units.find((e) => e.id === 'shaman');
  if (!sh || sh.count <= 0) return 0;
  return sh.stats.poolMagicHp * sh.count * cfg.shieldCal;
}

/** §K BÜYÜ KALKANI: büyü fazında gelen havuzu yüzdesel azaltır; saldıranın Şamanları deler. */
function magicShieldMultiplier(def: Army, atk: Army, cfg: CombatConfig): number {
  const shield = def.units.find((e) => e.id === 'magic_shield');
  if (!shield || shield.count <= 0) return 1;
  const sorceryRate = TECHS_BY_ID['sorcery']?.rate ?? 0.05;
  const effectiveLevel = shield.count * (1 + Math.max(0, def.tech.sorcery ?? 0) * sorceryRate);
  let reduction = Math.min(cfg.magicShield.max, cfg.magicShield.perLevel * effectiveLevel);
  const sh = atk.units.find((e) => e.id === 'shaman');
  if (sh && sh.count > 0) {
    reduction *= 1 / (1 + sh.count / (cfg.magicShield.shamanPerLevel * Math.max(1, shield.count)));
  }
  return 1 - reduction;
}

/** §G GNOM SABOTAJI: düşman gnomları savunma yapılarının vuruşunu düşürür. */
function structSabotage(owner: Army, foe: Army, cfg: CombatConfig): number {
  const structs = owner.units.reduce(
    (n, e) => (e.kind === 'defense' && !PASSIVE_STRUCTS.has(e.id) ? n + Math.max(0, e.count) : n),
    0,
  );
  if (structs <= 0) return 0;
  const gn = foe.units.find((e) => e.id === 'gnome');
  if (!gn || gn.count <= 0) return 0;
  return Math.min(cfg.gnomeSabotage.max, gn.count / (structs * cfg.gnomeSabotage.perStruct));
}

/* ── Hasar uygulama ────────────────────────────────────────────────────────── */

/**
 * §2a Kayıp uygulayıcı (FUN_00412148 birebir): dec = net/mDef.
 *  - dec <  sayı → sayı -= dec; emilen = net
 *  - dec >= sayı → sayı = 0;    emilen = mDef×sayı (KIRPILIR — net DEĞİL!)
 * Kırpma kritik: aksi halde tek hedefe yoğun saldırıda lossMag devasa şişer.
 */
function applyLoss(e: ArmyUnit, net: number): number {
  const mDef = e.stats.mDef > 0 ? e.stats.mDef : 1;
  const dec = net / mDef;
  if (dec < e.count) {
    e.count -= dec;
    return net;
  }
  const absorbed = mDef * e.count;
  e.count = 0;
  return absorbed;
}

/** Sur hasarı: normal birimle aynı formül, "adet" yerine bütünlük azalır (sub_412db8). */
function wallTakeHit(w: WallState | null, pool: number, P: number, type: 1 | 2 | 3): number {
  if (!w || w.left <= 0) return 0;
  const mit = type === 1 ? w.stats.pAtk : type === 2 ? w.stats.pDef : w.stats.mAtk;
  const net = (wallPower(w) * pool) / P - mit * w.left;
  if (net <= 0) return 0;
  const dec = net / w.tough;
  if (dec < w.left) {
    w.left -= dec;
    return net;
  }
  const absorbed = w.tough * w.left;   // yıkılışta kırpılır
  w.left = 0;
  return absorbed;
}

/** §2 Tek faz hasarı: net = BirimPuan×Adet×Havuz/P − Mitigasyon×Adet; kayıp = net/mDef. */
function dealType(
  atk: Army, def: Army, type: 1 | 2 | 3, rng: Rng, cfg: CombatConfig, poolK?: number,
): void {
  // Saldıran havuzu tur-başı FOTOĞRAFTAN (frozen) — iki yön de snapshot kullanır (eşzamanlılık).
  let pool = combatPool(atk, type, true, structSabotage(atk, def, cfg), cfg);
  pool -= shamanShield(def, cfg);
  if (pool <= 0) return;
  if (type === 3) pool *= magicShieldMultiplier(def, atk, cfg);
  if (poolK) pool *= poolK;              // karşı-yön kalibrasyonu (kalkandan SONRA → 0 kalan 0)
  pool *= jitter(rng);

  // Savunan P ve pay CANLI sayıdan; P faz başında sabit.
  const P = powerSum(def, false, cfg);
  if (P <= 0) return;

  // §S SUR payına düşen hasarı alır (her fazda, büyü dahil).
  def.lossMag += wallTakeHit(def.wall, pool, P, type);

  for (const e of def.units) {
    if (e.count <= 0) continue;
    if (cfg.defenderTypeFilter && type !== 3 && e.type !== type) continue;
    if (PASSIVE_STRUCTS.has(e.id)) continue;
    if (NO_ROUND_LOSS.has(e.id)) continue;
    const share = (e.stats.unitPower * e.count * pool) / P;
    const mit = type === 1 ? e.stats.pAtk : type === 2 ? e.stats.pDef : e.stats.mAtk;
    const net = share - mit * e.count;
    if (net <= 0) continue;
    def.lossMag += applyLoss(e, net);
  }

  // §KAHRAMAN DURUM HASARI: eşik üstü baskı durumu düşürür, 0'da kahraman ölür.
  const pressure = pool / P;
  for (const h of def.heroes) {
    if (h.durum <= 0) continue;
    const hDmg = (pressure - cfg.hero.durumMitigation) * heroDefPower(h, cfg);
    if (hDmg > 0) h.durum = Math.max(0, h.durum - hDmg * cfg.hero.durumK);
  }
}

/** §2c HEDEFLİ SALDIRI (Tur1 skirmish'i için) — tek savunan birime yoğunlaşmış hasar. */
function dealTargeted(
  atk: Army, def: Army, type: 1 | 2 | 3, targetId: string, rng: Rng, cfg: CombatConfig,
  opts: { poolUnitId?: string; shield?: boolean } = {},
): void {
  const target = def.units.find((e) => e.id === targetId);
  if (!target || target.count <= 0) return;
  let pool: number;
  if (opts.poolUnitId) {
    const pu = atk.units.find((e) => e.id === opts.poolUnitId);
    if (!pu || pu.count <= 0) return;
    pool = (type === 3 ? pu.stats.poolMagicHp : pu.stats.poolHp) * pu.count;
  } else {
    pool = combatPool(atk, type, true, 0, cfg);
  }
  if (opts.shield) pool -= shamanShield(def, cfg);
  if (pool <= 0) return;
  pool *= jitter(rng);
  const P = target.stats.unitPower * target.count;   // defA = yalnız hedef
  if (P <= 0) return;
  const share = (target.stats.unitPower * target.count * pool) / P;   // = pool
  const mit = type === 1 ? target.stats.pAtk : type === 2 ? target.stats.pDef : target.stats.mAtk;
  const net = share - mit * target.count;
  if (net <= 0) return;
  def.lossMag += applyLoss(target, net);
}

/** §2d Binary'nin Tur1 gnom skirmish'i — EMEKLİ (config ile açılır). */
function turn1GnomeSkirmish(atk: Army, def: Army, rng: Rng, cfg: CombatConfig): void {
  // Sıra binary'deki gibi: önce savunan gnom mancınığı vurur, sonra gnom yok olur.
  dealTargeted(def, atk, 2, 'mangonel', rng, cfg, { poolUnitId: 'gnome', shield: false });
  dealTargeted(atk, def, 2, 'gnome', rng, cfg, { shield: true });
}

/**
 * §Z TUZAK SALVOSU — tek kullanımlık, Tur 1'de yalnız YER birimlerine, mitigasyonsuz.
 * Tetiklenen tuzak tükenir ve ONARILMAZ → kalan tuzak savaştan savaşa çok dalgalı.
 */
function trapVolley(atk: Army, def: Army, rng: Rng, cfg: CombatConfig): void {
  const tr = def.units.find((e) => e.id === 'trap');
  if (!tr || tr.count <= 0) return;

  const gn = atk.units.find((e) => e.id === 'gnome');
  const disarmed = gn && gn.count > 0
    ? Math.min(tr.count, gn.count * cfg.trap.gnomeDisarm * (0.7 + 0.6 * rng.next()))
    : 0;
  const armed = tr.count - disarmed;

  const ground = atk.units.filter((e) => e.count > 0 && !FLYING.has(e.id) && !NO_ROUND_LOSS.has(e.id));
  const groundCount = ground.reduce((n, e) => n + e.count, 0);
  if (armed <= 0 || groundCount <= 0) {
    tr.count = Math.max(0, tr.count - disarmed);
    tr.spent = true;
    return;
  }

  const saturation = Math.min(1, (groundCount * cfg.trap.perGroundUnit) / armed);
  const rate = saturation * rng.range(cfg.trap.triggerMin, cfg.trap.triggerMax);
  const fired = armed * rate;
  if (fired > 0) {
    const pool = tr.stats.poolHp * fired * cfg.trap.power * jitter(rng);
    const P = ground.reduce((s, e) => s + e.stats.unitPower * e.count, 0);
    if (P > 0) {
      for (const e of ground) {
        // Ayak altında patlayan tuzağa karşı zırh işlemez → mitigasyon UYGULANMAZ.
        const net = (e.stats.unitPower * e.count * pool) / P;
        atk.lossMag += applyLoss(e, net);
      }
    }
  }
  tr.count = Math.max(0, tr.count - disarmed - fired);
  tr.spent = true;
}

/* ── Savaş sonrası ─────────────────────────────────────────────────────────── */

/**
 * §4 Enkaz: NET ölü × maliyet × 0.3 (Ogre ×1.15^kahramanSeviyesi).
 * "NET ölü" = savaş öncesi − (onarım + SAVUNMA TABANI sonrası) → taban ile geri gelen birimler
 * enkaz üretmez. Bu olmadan saldıran, dokunulmaz 4'lükleri her saldırıda "öldürüp" sonsuz enkaz
 * çiftliği kurardı (§13.11.10, adım 5).
 */
function debris(army: Army, heroLevel: number, cfg: CombatConfig): { gold: number; food: number } {
  let gold = 0;
  let food = 0;
  for (const e of army.units) {
    const dead = cfg.defenseFloor.debrisFromNetLosses || e.kind === 'defense'
      ? Math.max(0, e.count0 - e.countFinal)
      : Math.max(0, e.count0 - e.count);
    if (dead <= 0) continue;
    let g = dead * e.stats.ref.gold * cfg.debrisRate;
    let f = dead * e.stats.ref.food * cfg.debrisRate;
    if (e.id === 'ogre') {
      const k = 1.15 ** Math.max(0, heroLevel | 0);
      g *= k;
      f *= k;
    }
    gold += g;
    food += f;
  }
  return { gold, food };
}

/** §5/§6 Kahraman çıkma ihtimali (0-100) — KAZANANIN Tapınak seviyesine bağlı. */
export function captureChance(temple: number, heroCount: number, xp: number): number {
  const T = Math.max(0, temple | 0);
  const K = Math.max(0, heroCount | 0);
  if (!(xp > 499) || T <= 0 || K >= 5) return 0;
  // v0.6: ceza ÇARPIMSAL ((5−K)/5) — binary'nin çıkarma cezası 2 kahramandan sonra ihtimali
  // matematiksel olarak imkânsız kılıyordu, oysa doküman 5 kahramana kadar mümkün diyor.
  const base = T * 10 * ((5 - K) / 5);
  if (base <= 0) return 0;
  return Math.min(100, Math.max(0, base * Math.min(1, xp * 0.000025)));
}

/**
 * ⭐ SAVUNMA TABANI (§13.11.10) + savaş sonrası onarım.
 *
 * Sıra (önemli — kazanan bu adımdan ÖNCE ham kayıplarla belirlenir):
 *   1. onarım: kaybın %50-70'i geri gelir (her tür için bağımsız rulo, tükenen tuzak hariç)
 *   2. taban:  final = max(min(minPerType, savaşÖncesi), onarımSonrası)
 */
function finalize(army: Army, rng: Rng, cfg: CombatConfig): void {
  const floor = cfg.defenseFloor;
  for (const e of army.units) {
    const repairable = e.kind === 'defense' && !e.spent && !PASSIVE_STRUCTS.has(e.id);
    const repairRate = rng.range(cfg.repair.min, cfg.repair.max);
    const afterRepair = repairable
      ? e.count0 - (e.count0 - e.count) * (1 - repairRate)
      : e.count;
    let final = Math.round(afterRepair);

    if (floor.enabled && e.kind === 'defense' && floor.protectedTypes.includes(e.id)) {
      const protectedCount = Math.min(floor.minPerType, e.count0);
      if (final < protectedCount) {
        e.restoredByFloor = protectedCount - final;
        final = protectedCount;
      }
    }
    e.countFinal = final;
  }
}

/* ── Ana simülasyon ────────────────────────────────────────────────────────── */

export function simulate(input: SimulateInput, configOverride?: CombatConfig): SimulateResult {
  const cfg = configOverride ?? DEFAULT_COMBAT_CONFIG;
  const rng = createRng(input.seed);

  const atk = buildArmy(input.attacker, false, cfg);
  const def = buildArmy(input.defender, true, cfg);

  if (input.night) {
    applyNight(atk, input.nightVisionAttacker ?? 0, cfg);
    applyNight(def, input.nightVisionDefender ?? 0, cfg);
  }

  let turns = 0;
  for (let r = 1; r <= 5; r++) {
    if (combatAlive(atk, cfg) <= 0 || combatAlive(def, cfg) <= 0) break;
    turns = r;
    // Tur başı fotoğrafı (yalnız HAVUZLAR için).
    for (const e of atk.units) e.snap = e.count;
    for (const e of def.units) e.snap = e.count;

    if (r === 1) {
      // §Z Tuzak salvosu: ordu şehre yaklaşırken, karşılıklı vuruşma başlamadan.
      trapVolley(atk, def, rng, cfg);
      if (cfg.turn1GnomeSkirmish) turn1GnomeSkirmish(atk, def, rng, cfg);
      continue;
    }
    const types = cfg.turnSchedule[r] ?? [];
    for (const t of types) dealType(atk, def, t, rng, cfg);                  // saldıran → savunan
    for (const t of types) dealType(def, atk, t, rng, cfg, cfg.counterK);    // savunan → saldıran
  }
  if (turns === 0) turns = 1;

  // §4b KAYBEDEN tarafın savaş-dışı birimleri (yük/gnom) orantısal kayıp alır; casus uçarak kaçar.
  {
    const aliveA = alive(atk);
    const aliveD = alive(def);
    const provisional = aliveD <= 0 && aliveA <= 0
      ? null
      : aliveD <= 0 ? 'attacker'
        : aliveA <= 0 ? 'defender'
          : def.lossMag > atk.lossMag ? 'attacker' : 'defender';
    const loser = provisional === 'attacker' ? def : provisional === 'defender' ? atk : null;
    if (loser) {
      const lm = loser.lossMag;
      const wm = (loser === def ? atk : def).lossMag;
      const frac = lm + wm > 0 ? lm / (lm + wm) : 0;
      for (const e of loser.units) {
        if (SETTLE_ON_LOSS.includes(e.id)) {
          e.count = Math.max(0, e.count - Math.round(e.count0 * frac));
        }
      }
    }
  }

  /* ⚠️ KAZANAN, savunma tabanından ÖNCE ve HAM kayıplarla belirlenir (§13.11.10 adım 2).
   * Aksi halde 5 balistalı bir şehir, ordusu tamamen silinmişken "kazanan" ilan edilirdi. */
  const aLM = atk.lossMag;
  const dLM = def.lossMag;
  const rawAtkAlive = alive(atk);
  const rawDefAlive = alive(def);
  let winner: 'attacker' | 'defender' | 'draw';
  if (rawAtkAlive <= 0 && rawDefAlive <= 0) winner = 'draw';
  else if (rawDefAlive <= 0) winner = 'attacker';
  else if (rawAtkAlive <= 0) winner = 'defender';
  else winner = dLM > aLM ? 'attacker' : 'defender';   // eşitlikte savunan

  // Onarım + savunma tabanı (görüntülenen ve enkaza giren nihai sayılar).
  finalize(atk, rng, cfg);
  finalize(def, rng, cfg);

  const dA = debris(atk, atk.heroLevel, cfg);
  const dD = debris(def, def.heroLevel, cfg);

  // §XP: (atkLM + defLM) × (kazananınKaybı / kaybedeninKaybı) × 0.001
  let xp = 0;
  if (winner === 'attacker' && dLM > 0) xp = round((aLM + dLM) * (aLM / dLM) * 0.001);
  else if (winner === 'defender' && aLM > 0) xp = round((aLM + dLM) * (dLM / aLM) * 0.001);

  const winSide = winner === 'attacker' ? input.attacker : winner === 'defender' ? input.defender : null;
  const capture = winSide ? captureChance(winSide.temple ?? 0, winSide.heroCount ?? 0, xp) : 0;

  return {
    winner,
    turns,
    attacker: sideResult(atk),
    defender: sideResult(def),
    debris: { gold: round(dA.gold + dD.gold), food: round(dA.food + dD.food) },
    xp,
    captureChance: capture,
    attackerCarryCapacity: atk.units.reduce((s, e) => s + e.stats.carry * e.countFinal, 0),
    engineVersion: cfg.engineVersion,
    catalogHash: catalogHash(),
    seed: rng.seed,
  };
}

function sideResult(army: Army): SideResult {
  const counts: UnitCounts = {};
  const floorRestored: UnitCounts = {};
  for (const e of army.units) {
    counts[e.id] = e.countFinal;
    if (e.restoredByFloor > 0) floorRestored[e.id] = e.restoredByFloor;
  }
  return {
    // Sur/Büyü Kalkanı/Tapınak SEVİYEdir, adet değil → "hayatta kalan birim" toplamına girmez.
    // (Sur'un durumu `wallIntegrity` ile yüzde olarak raporlanır.)
    alive: army.units.reduce((n, e) => n + (LEVEL_BASED.has(e.id) ? 0 : e.countFinal), 0),
    // "X ünite kaybetti" toplamı YALNIZ savaşçıları sayar; savunma yapıları girmez.
    lost: army.units.reduce(
      (n, e) => n + (e.kind === 'defense' ? 0 : Math.max(0, e.count0 - e.countFinal)),
      0,
    ),
    counts,
    floorRestored,
    heroes: army.heroes.map((h) => ({
      level: h.level,
      durum: Math.round(h.durum * 100) / 100,
      alive: h.durum > 0,
    })),
    wallIntegrity: army.wall ? army.wall.left / army.wall.level : null,
  };
}
