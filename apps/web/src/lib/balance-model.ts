/**
 * ⭐ DENGE TEZGÂHININ SAF HESABI — bileşenden ayrı, test edilebilir.
 *
 * `apps/web`te jsdom/testing-library yok; ev kuralı kararı saf fonksiyona çıkarıp onu test etmek
 * (`test/city-screens.test.ts`in başlığı). Bu dosya o kuralın en büyük uygulaması: ekran yalnız
 * çizer, buradaki fonksiyonlar hesaplar.
 *
 * ⚠️⚠️ **Formül YENİDEN YAZILMIYOR.** Her sayı `@mobilwar/catalog`un kendi fonksiyonundan geliyor
 * ve sabitler dünyanın etkin `CatalogConfig`inden (`GET /api/v1/balance`). Buradaki kod yalnız
 * **toplama** yapıyor. Bu ayrım, `city.controller.ts`teki *"istemci maliyeti kendi hesaplamaz"*
 * kuralının koruduğu şeyi koruyor: panelden bir fiyat değişince tezgâh da değişir.
 *
 * ⚠️ **Kümülatif sürenin anlamı**: "ŞU ANKİ hızlandırıcı seviyelerinle sıfırdan buraya". Mimar
 * Okulu/Akademi/Baraka yolda büyüseydi gerçek süre daha kısa çıkardı; tek iyi tanımlı okuma bu ve
 * ekranda da böyle yazıyor.
 */
import {
  BUILDINGS, BUILDINGS_BY_ID, BUILDING_ORDER, BUILDING_REQUIREMENTS,
  DEFENSE_ORDER, LEVEL_BASED, STARTING_BUILDINGS, TECHS, TECHS_BY_ID, TECH_ORDER,
  TECH_REQUIREMENTS, UNITS, UNITS_BY_ID, UNIT_REQUIREMENTS, WARRIOR_ORDER,
  buildingCost, buildingTimeSeconds, castleBudget, caveCapacity, caveRepairSeconds,
  caveTransferSeconds, checkRequirement, defenseCapacity, defenseStructureCost,
  dwarvesToBreakCave, farmOutput, heroReviveCost, heroReviveSeconds, heroXpForLevel,
  mineOutput, orderBy, pointsFromBase, scaledSeconds, techCost, techTimeSeconds,
  teleportCooldownSeconds, timeFromCost, trainingTimeSeconds, unitCost, unitsArea,
  wallRepairSeconds,
  type CatalogConfig, type UnmetRequirement,
} from '@mobilwar/catalog';

/* ═══ Tipler ════════════════════════════════════════════════════════════════ */

/** Sunucudan inen dünya sabitleri (`GET /api/v1/balance`). */
export interface BalanceBundle {
  catalog: CatalogConfig;
  combat: { hero: { pointsPerLevel: number }; capture: { maxHeroes: number } };
  speed: { resource: number; travel: number; training: number; construction: number };
  resourcePerPoint: number;
  minSeconds: number;
  catalogHash: string;
  revisionId: number | null;
}

/** Kaydırıcıların ve girişlerin tuttuğu tek durum. */
export interface BalanceState {
  buildings: Record<string, number>;
  techs: Record<string, number>;
  /** Savaşçı ADETLERİ. */
  units: Record<string, number>;
  /** Savunma: Sur ve Büyü Kalkanı SEVİYE, diğerleri ADET taşır (`LEVEL_BASED`). */
  defenses: Record<string, number>;
  heroLevel: number;
  /** Mağara transfer önizlemesi için taşınacak alan. */
  caveLoad: number;
  /** Sur onarım önizlemesi için hasar oranı (0..1). */
  wallDamage: number;
}

/**
 * ⭐ Boş tezgâh **oyunun gerçek sıfır noktası**: Kale/Baraka/Çiftlik/Maden seviye 1
 * (`STARTING_BUILDINGS`). Yatırım yine sıfır — o dört seviye bedava ve puan da vermiyor
 * (`cumulativeBuildingValue` ilk ÖDENEN seviyeden başlıyor).
 *
 * ⚠️ Hepsini 0'dan başlatmak **yanlış bir tablo** üretiyordu: Kale 0 → bütçe `0 × 10 = 0` →
 * sayfa açılır açılmaz her yapının altında "Kale seviye bütçesi dolu" yazıyordu. Oyunda Kale 0
 * diye bir durum yok; sıfırdan başlayan bir oyuncunun gerçek tablosu Kale 1 · bütçe 10 · 3'ü
 * dolu · 7 boş.
 */
export const EMPTY_STATE: BalanceState = {
  buildings: { ...STARTING_BUILDINGS },
  techs: {}, units: {}, defenses: {},
  heroLevel: 0, caveLoad: 100, wallDamage: 1,
};

export interface Sum {
  gold: number;
  food: number;
  seconds: number;
}

/**
 * ⚠️ `base` = altın + yemek (puanın ham tabanı). Puanı satır satır yuvarlayıp toplamıyoruz:
 * oyunun kendisi tabanı biriktirip **bir kez** bölüyor (`score_base` → `score`), satır satır
 * yuvarlasaydık her kalemin binlik artığı çöpe gider ve toplam gerçek puandan düşük çıkardı.
 */
export interface Totals extends Sum {
  base: number;
  points: number;
}

export const ZERO: Totals = { gold: 0, food: 0, seconds: 0, base: 0, points: 0 };

export interface Row {
  id: string;
  name: string;
  /** Yapı/teknik/Sur'da SEVİYE, adetli birimlerde ADET. */
  n: number;
  max: number;
  locked: boolean;
  unmet: UnmetRequirement[];
  /** Kale seviye bütçesi doluysa yükseltme kapalı (yalnız yapılarda). */
  budgetBlocked: boolean;
  /** Bir sonraki seviyenin / tek bir adedin maliyeti ve süresi. */
  next: Sum | null;
  /** Bu satırın toplamı — kilitliyse SIFIR. */
  cum: Totals;
}

/* ═══ Ortak yardımcılar ═════════════════════════════════════════════════════ */

/**
 * Ön-şart kontrolü için "elde ne var" görüntüsü.
 *
 * ⚠️ **Sur ve Büyü Kalkanı `buildings` altında aranıyor** (`UNIT_REQUIREMENTS.oil_cauldron` →
 * `{ castle: 3, wall: 3 }`) ama tezgâhta savunma durumunda duruyorlar. Birleştirmeseydik Sur 10
 * olmasına rağmen Kazancı kilitli görünürdü.
 */
export function held(state: BalanceState): {
  buildings: Record<string, number>; techs: Record<string, number>;
} {
  const buildings: Record<string, number> = { ...state.buildings };
  for (const id of LEVEL_BASED) {
    if (state.defenses[id]) buildings[id] = state.defenses[id]!;
  }
  return { buildings, techs: state.techs };
}

/**
 * ⭐⭐ **KİLİTLİ KALEM SIFIR SAYILIR — ve bu zincirleme yürür.**
 *
 * Kaydırıcılar bağımsız oldukları için imkânsız bir kurulum kurulabilir: Büyücülük 12'ye çekilir,
 * sonra Akademi 0'a indirilir. Ham `held()` görüntüsünde Büyücülük hâlâ 12 görünür ve Ejderha
 * açık kalır — yani sayfa **oyunda mümkün olmayan** bir kurulumu geçerli gösterir. Oysa kullanıcı
 * kapıların uygulanmasını istedi: sayfanın cevapladığı soru "bu kurulum mümkün mü".
 *
 * Sabit noktaya kadar dönüyor çünkü sıfırlama zincirleme: Akademi düşer → Büyücülük geçersizleşir
 * → Tapınak (Büyücülük 6 ister) geçersizleşir → Teleport (Tapınak istemez ama Büyücülük 12 ister)
 * … Zincirler sığ; 12 tur fazlasıyla yeter ve döngü kendini `changed` ile erken kapatır.
 *
 * ⚠️ Durumun KENDİSİ değişmiyor — yalnız bu görüntü. Akademi geri çıkınca Büyücülük 12 aynen
 * geri gelir; kullanıcının girdiği hiçbir sayı kaybolmaz.
 */
export function effectiveHeld(state: BalanceState): {
  buildings: Record<string, number>; techs: Record<string, number>;
} {
  let cur = held(state);
  for (let pass = 0; pass < 12; pass++) {
    const buildings = { ...cur.buildings };
    const techs = { ...cur.techs };
    let changed = false;
    const drop = (map: Record<string, number>, id: string, req: Parameters<typeof checkRequirement>[0]): void => {
      if (!map[id]) return;
      if (checkRequirement(req, cur).length === 0) return;
      map[id] = 0;
      changed = true;
    };
    for (const b of BUILDINGS) drop(buildings, b.id, BUILDING_REQUIREMENTS[b.id]);
    for (const t of TECHS) drop(techs, t.id, TECH_REQUIREMENTS[t.id]);
    for (const id of LEVEL_BASED) drop(buildings, id, UNIT_REQUIREMENTS[id]);
    cur = { buildings, techs };
    if (!changed) break;
  }
  return cur;
}

const lvl = (m: Record<string, number>, id: string): number => Math.max(0, m[id] ?? 0);

/** Hız çarpanı uygulanmış, ekrana uygun (yuvarlanmış) süre. */
const dur = (base: number, multiplier: number): number =>
  Math.round(scaledSeconds(base, multiplier));

function addTo(t: Totals, gold: number, food: number, seconds: number): void {
  t.gold += gold; t.food += food; t.seconds += seconds; t.base += gold + food;
}

/** Toplamları birleştirir ve puanı **tek seferde** tabandan türetir. */
export function combine(parts: readonly Totals[], perPoint: number): Totals {
  const out: Totals = { ...ZERO };
  for (const p of parts) {
    out.gold += p.gold; out.food += p.food; out.seconds += p.seconds; out.base += p.base;
  }
  out.points = pointsFromBase(out.base, perPoint);
  return out;
}

/* ═══ Kale seviye bütçesi ═══════════════════════════════════════════════════ */

/**
 * ⭐ `Σ(bütçe tüketen yapı seviyeleri) ≤ Kale × 10`. Kale'nin kendisi ve Sur/Büyü Kalkanı sayılmaz
 * (`consumesCastleBudget`). Oyunun gerçek kapısı bu; tezgâhta da uygulanıyor ki ekranda kurulan
 * kombinasyon oyunda gerçekten mümkün olsun.
 */
export function castleUsage(state: BalanceState): {
  used: number; budget: number; free: number;
} {
  const budget = castleBudget(lvl(state.buildings, 'castle'));
  let used = 0;
  for (const b of BUILDINGS) {
    if (!b.consumesCastleBudget) continue;
    used += lvl(state.buildings, b.id);
  }
  return { used, budget, free: Math.max(0, budget - used) };
}

/* ═══ Yapılar ═══════════════════════════════════════════════════════════════ */

export function buildingRows(state: BalanceState, cfg: BalanceBundle): Row[] {
  const architect = lvl(state.buildings, 'architect_school');
  const have = effectiveHeld(state);
  const usage = castleUsage(state);

  return orderBy(BUILDINGS, BUILDING_ORDER).map((b) => {
    const level = lvl(state.buildings, b.id);
    const unmet = checkRequirement(BUILDING_REQUIREMENTS[b.id], have);
    const locked = unmet.length > 0;

    const cum: Totals = { ...ZERO };
    if (!locked) {
      // Kale/Baraka/Çiftlik/Maden'in 1. seviyesi hediyedir → ilk ÖDENEN seviyeden başla (§13.9).
      for (let l = (STARTING_BUILDINGS[b.id] ?? 0) + 1; l <= level; l++) {
        const c = buildingCost(b.id, l, cfg.catalog);
        addTo(cum, c.gold, c.food,
          dur(buildingTimeSeconds(b.id, l, architect, cfg.catalog), cfg.speed.construction));
      }
      cum.points = pointsFromBase(cum.base, cfg.resourcePerPoint);
    }

    const nextLevel = level + 1;
    const budgetBlocked = b.consumesCastleBudget && usage.used >= usage.budget;
    const next = !locked && nextLevel <= b.maxLevel
      ? {
        ...buildingCost(b.id, nextLevel, cfg.catalog),
        seconds: dur(buildingTimeSeconds(b.id, nextLevel, architect, cfg.catalog), cfg.speed.construction),
      }
      : null;

    return { id: b.id, name: b.name.tr, n: level, max: b.maxLevel, locked, unmet, budgetBlocked, next, cum };
  });
}

/* ═══ Teknikler ═════════════════════════════════════════════════════════════ */

/** Tekniklerde tavan YOK; tezgâh pratik bir sınır koyuyor (kaydırıcı bir yerde bitmeli). */
export const TECH_SLIDER_MAX = 30;

export function techRows(state: BalanceState, cfg: BalanceBundle): Row[] {
  const academy = lvl(state.buildings, 'academy');
  const have = effectiveHeld(state);

  return orderBy(TECHS, TECH_ORDER).map((t) => {
    const level = lvl(state.techs, t.id);
    const unmet = checkRequirement(TECH_REQUIREMENTS[t.id], have);
    const locked = unmet.length > 0;

    const cum: Totals = { ...ZERO };
    if (!locked) {
      for (let l = 1; l <= level; l++) {
        const c = techCost(t.id, l, cfg.catalog);
        addTo(cum, c.gold, c.food,
          dur(techTimeSeconds(t.id, l, academy, cfg.catalog), cfg.speed.construction));
      }
      cum.points = pointsFromBase(cum.base, cfg.resourcePerPoint);
    }

    const next = !locked
      ? {
        ...techCost(t.id, level + 1, cfg.catalog),
        seconds: dur(techTimeSeconds(t.id, level + 1, academy, cfg.catalog), cfg.speed.construction),
      }
      : null;

    return {
      id: t.id, name: t.name.tr, n: level, max: TECH_SLIDER_MAX,
      locked, unmet, budgetBlocked: false, next, cum,
    };
  });
}

/* ═══ Savaşçılar ════════════════════════════════════════════════════════════ */

/** Tek bir birimin üretim süresi — savaşçıda **Baraka**, savunma biriminde **Mimar Okulu**. */
function unitSeconds(
  unitId: string, sourceLevel: number, multiplier: number, cfg: BalanceBundle,
): number {
  return scaledSeconds(trainingTimeSeconds(unitId, sourceLevel, 'balanced', cfg.catalog), multiplier);
}

export function unitRows(state: BalanceState, cfg: BalanceBundle): Row[] {
  const barracks = lvl(state.buildings, 'barracks');
  const have = effectiveHeld(state);

  return orderBy(UNITS.filter((u) => u.kind === 'warrior'), WARRIOR_ORDER).map((u) => {
    const count = lvl(state.units, u.id);
    const unmet = checkRequirement(UNIT_REQUIREMENTS[u.id], have);
    const locked = unmet.length > 0;

    /** ⚠️ Birim-başına süre KESİRLİ tutulup adetle çarpılıyor — kuyruğun yaptığının aynısı. */
    const per = unitSeconds(u.id, barracks, cfg.speed.training, cfg);
    const cum: Totals = { ...ZERO };
    if (!locked && count > 0) {
      const c = unitCost(u.id, count, cfg.catalog);
      addTo(cum, c.gold, c.food, Math.round(per * count));
      cum.points = pointsFromBase(cum.base, cfg.resourcePerPoint);
    }

    return {
      id: u.id, name: u.name.tr, n: count, max: Number.MAX_SAFE_INTEGER,
      locked, unmet, budgetBlocked: false,
      next: { ...unitCost(u.id, 1, cfg.catalog), seconds: Math.round(per) },
      cum,
    };
  });
}

/* ═══ Savunma ═══════════════════════════════════════════════════════════════ */

export function defenseRows(state: BalanceState, cfg: BalanceBundle): Row[] {
  const architect = lvl(state.buildings, 'architect_school');
  const have = effectiveHeld(state);

  return orderBy(
    UNITS.filter((u) => u.kind === 'defense' && u.id !== 'temple'), DEFENSE_ORDER,
  ).map((u) => {
    const levelBased = LEVEL_BASED.has(u.id);
    const n = lvl(state.defenses, u.id);
    // Hiçbir savunma kalemi KENDİNİ ön-şart olarak istemiyor (Sur'un ön-şartı yok, Büyü Kalkanı
    // Sur ister) → kendi seviyesini görüntüden çıkarmaya gerek yok.
    const unmet = checkRequirement(UNIT_REQUIREMENTS[u.id], have);
    const locked = unmet.length > 0;

    const cum: Totals = { ...ZERO };
    let next: Sum | null = null;

    if (levelBased) {
      // Sur/Büyü Kalkanı bir YAPI sayılır → `construction` çarpanı (kuyruktaki dağılımın aynısı).
      if (!locked) {
        for (let l = 1; l <= n; l++) {
          const c = defenseStructureCost(u.id, l, cfg.catalog);
          addTo(cum, c.gold, c.food,
            dur(timeFromCost(c, architect, cfg.catalog), cfg.speed.construction));
        }
        cum.points = pointsFromBase(cum.base, cfg.resourcePerPoint);
        const nc = defenseStructureCost(u.id, n + 1, cfg.catalog);
        next = { ...nc, seconds: dur(timeFromCost(nc, architect, cfg.catalog), cfg.speed.construction) };
      }
    } else {
      // Adetli savunma birimi bir ÜRETİM → `training` çarpanı, hızlandırıcısı Mimar Okulu.
      const per = unitSeconds(u.id, architect, cfg.speed.training, cfg);
      if (!locked && n > 0) {
        const c = unitCost(u.id, n, cfg.catalog);
        addTo(cum, c.gold, c.food, Math.round(per * n));
        cum.points = pointsFromBase(cum.base, cfg.resourcePerPoint);
      }
      next = { ...unitCost(u.id, 1, cfg.catalog), seconds: Math.round(per) };
    }

    return {
      id: u.id, name: u.name.tr, n,
      max: levelBased ? 20 : Number.MAX_SAFE_INTEGER,
      locked, unmet, budgetBlocked: false, next, cum,
    };
  });
}

/* ═══ Yapıya özel canlı okumalar ════════════════════════════════════════════ */

/** Çiftlik/Maden saatlik üretimi — dünya kaynak çarpanı UYGULANMIŞ. */
export function productionInfo(state: BalanceState, cfg: BalanceBundle): {
  farm: { now: number; next: number }; mine: { now: number; next: number };
} {
  const m = cfg.speed.resource;
  const f = lvl(state.buildings, 'farm');
  const g = lvl(state.buildings, 'mine');
  return {
    farm: {
      now: Math.floor(farmOutput(f, cfg.catalog) * m),
      next: Math.floor(farmOutput(f + 1, cfg.catalog) * m),
    },
    mine: {
      now: Math.floor(mineOutput(g, cfg.catalog) * m),
      next: Math.floor(mineOutput(g + 1, cfg.catalog) * m),
    },
  };
}

/**
 * Mağara: kapasite, girilen yükün transfer süresi, onarım süresi, kaç cüce kırar.
 * ⚠️ Dünya hız çarpanı BURAYA uygulanmaz — şehir içi iş (`caveTransferSeconds` başlığı).
 */
export function caveInfo(state: BalanceState, cfg: BalanceBundle): {
  level: number; capacity: number; load: number;
  transferSeconds: number; repairSeconds: number; dwarves: number;
} {
  const level = lvl(state.buildings, 'cave');
  const capacity = caveCapacity(level, cfg.catalog);
  const load = Math.min(Math.max(0, state.caveLoad), Math.max(0, capacity));
  return {
    level, capacity, load,
    transferSeconds: caveTransferSeconds(load, level, cfg.catalog),
    repairSeconds: level > 0 ? caveRepairSeconds(level, cfg.catalog) : 0,
    dwarves: dwarvesToBreakCave(level, lvl(state.techs, 'blacksmithing'), cfg.catalog),
  };
}

/**
 * ⭐ Mimar Okulu'nun **yüzde kaç kısalttığı**. Bölen `structureTimeDecayRate^seviye`; oran o
 * bölenin tersi. Ekranda hem bölen hem yüzde gösteriliyor çünkü "×32 hızlandı" ile "%97 kısaldı"
 * aynı sayının iki okunuşu ve denge ayarlarken ikisi de soruluyor.
 */
export function acceleratorInfo(state: BalanceState, cfg: BalanceBundle): {
  architect: { level: number; divisor: number; cut: number };
  academy: { level: number; divisor: number; cut: number };
  barracks: { level: number; divisor: number; cut: number };
} {
  const structRate = cfg.catalog.economy.structureTimeDecayRate;
  const unitRate = cfg.catalog.economy.timeDecayRate;
  const mk = (level: number, rate: number): { level: number; divisor: number; cut: number } => {
    const divisor = Math.max(1, rate) ** Math.max(0, level);
    return { level, divisor, cut: 1 - 1 / divisor };
  };
  return {
    architect: mk(lvl(state.buildings, 'architect_school'), structRate),
    academy: mk(lvl(state.buildings, 'academy'), structRate),
    barracks: mk(lvl(state.buildings, 'barracks'), unitRate),
  };
}

/** Akademi/Baraka/Sur seviyesinin AÇTIĞI kalemler — kilitliden açığa geçiş anlık görünsün diye. */
export function unlockedBy(state: BalanceState): { techs: string[]; units: string[] } {
  const have = effectiveHeld(state);
  return {
    techs: orderBy(TECHS, TECH_ORDER)
      .filter((t) => checkRequirement(TECH_REQUIREMENTS[t.id], have).length === 0)
      .map((t) => t.name.tr),
    units: orderBy(UNITS.filter((u) => u.kind === 'warrior'), WARRIOR_ORDER)
      .filter((u) => checkRequirement(UNIT_REQUIREMENTS[u.id], have).length === 0)
      .map((u) => u.name.tr),
  };
}

/** Kahraman: diriltme bedeli (Tapınak'tan BAĞIMSIZ) ve süresi (Tapınak kısaltır). */
export function heroInfo(state: BalanceState, cfg: BalanceBundle): {
  level: number; temple: number; cost: { gold: number; food: number };
  seconds: number; xpForNext: number; points: number;
} {
  const level = Math.max(0, state.heroLevel);
  const temple = lvl(state.buildings, 'temple');
  return {
    level, temple,
    cost: heroReviveCost(level, cfg.catalog),
    seconds: heroReviveSeconds(level, temple),
    xpForNext: heroXpForLevel(level + 1),
    /** ⚠️ Uçtan geliyor (`combat.hero.pointsPerLevel`), koda gömülü DEĞİL. */
    points: level * cfg.combat.hero.pointsPerLevel,
  };
}

/** Sur: savunma alanı kapasitesi, yerleşen alan ve onarım süresi. */
export function wallInfo(state: BalanceState, cfg: BalanceBundle): {
  level: number; capacity: number; used: number; repairSeconds: number; teleport: number;
} {
  const level = lvl(state.defenses, 'wall');
  const counted: Record<string, number> = {};
  for (const [id, n] of Object.entries(state.defenses)) {
    if (!LEVEL_BASED.has(id) && n > 0) counted[id] = n;
  }
  return {
    level,
    capacity: defenseCapacity(level),
    used: unitsArea(counted),
    repairSeconds: wallRepairSeconds(level, 1 - Math.min(1, Math.max(0, state.wallDamage)), cfg.catalog),
    teleport: teleportCooldownSeconds(lvl(state.buildings, 'teleport'), cfg.catalog),
  };
}

/* ═══ Toplam ════════════════════════════════════════════════════════════════ */

export interface BalanceReport {
  buildings: Row[];
  techs: Row[];
  units: Row[];
  defenses: Row[];
  groups: { buildings: Totals; techs: Totals; units: Totals; defenses: Totals };
  total: Totals;
}

/**
 * ⭐ Kilitli satır toplamlara KATILMAZ (`cum` sıfırdır) — kullanıcının istediği davranış:
 * Baraka'yı Ejderha'nın altına düşürünce hem gösterim hem puan toplamdan silinir. Girilen adet
 * durumda **saklı kalır**, Baraka geri çıkınca aynen döner.
 *
 * ⚠️ Kahraman diriltme toplama girmez: o bir TAMİR, edinim değil (tekrar tekrar ödenir) ve puan
 * da vermez. Ekranda kendi grubunda, kendi sayılarıyla duruyor.
 */
export function report(state: BalanceState, cfg: BalanceBundle): BalanceReport {
  const buildings = buildingRows(state, cfg);
  const techs = techRows(state, cfg);
  const units = unitRows(state, cfg);
  const defenses = defenseRows(state, cfg);

  const sumOf = (rows: Row[]): Totals => combine(rows.map((r) => r.cum), cfg.resourcePerPoint);
  const groups = {
    buildings: sumOf(buildings), techs: sumOf(techs),
    units: sumOf(units), defenses: sumOf(defenses),
  };
  return {
    buildings, techs, units, defenses, groups,
    total: combine(Object.values(groups), cfg.resourcePerPoint),
  };
}

/** Eksik ön-şartı okunur metne çevirir: «Baraka 10 (7)». */
export function unmetText(unmet: readonly UnmetRequirement[]): string {
  return unmet.map((r) => {
    const name = r.kind === 'building'
      ? BUILDINGS_BY_ID[r.id]?.name.tr ?? UNITS_BY_ID[r.id]?.name.tr ?? r.id
      : TECHS_BY_ID[r.id]?.name.tr ?? r.id;
    return `${name} ${r.required} (${r.current})`;
  }).join(' · ');
}
