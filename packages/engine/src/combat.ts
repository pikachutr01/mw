/* =============================================================================
 * Mobiwar savaş motoru — v0.6.0'ın TypeScript portu (SİSTEM PLANI Faz 0)
 * -----------------------------------------------------------------------------
 * JS sürümünden (mobiwar-engine.js v0.6.0) FARKLARI:
 *   1. `Math.random()` YOK → enjekte edilen seed'li PRNG (§5). Savaş yeniden oynatılabilir.
 *   2. `global.__X` override'ları YOK → `CombatConfig` (§13.7).
 *   3. Birim id'leri İngilizce (§13.14), statlar `@mobilwar/catalog`'tan gelir.
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
} from '@mobilwar/catalog';
import { type CombatConfig, type DeepPartial, DEFAULT_COMBAT_CONFIG, mergeCombatConfig } from './config.ts';
import { createRng, type Rng } from './rng.ts';
import type {
  Army, ArmyUnit, HeroCombatStats, HeroState, ScaledStats, SideInput, SideResult, SimulateInput, SimulateResult,
  GradedStruct, ShieldState, UnitCounts, WallState,
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

/** §7 Gece görüşü çarpanı — yalnız Can ve Büyü Canı'nı etkiler (bkz. `applyNight`). */
export function nightMultiplier(nightVision: number, cfg: CombatConfig = DEFAULT_COMBAT_CONFIG): number {
  const L = Math.max(0, Math.trunc(nightVision));
  return (1 - 3 / (L + 3)) * (1 - cfg.night.base) + cfg.night.base;
}

/* ── Ordu kurulumu ─────────────────────────────────────────────────────────── */

function buildArmy(side: SideInput, isDefender: boolean, cfg: CombatConfig): Army {
  const tech = side.tech ?? {};
  /* ⭐ Seviye 0 kahraman da savaşır (ölçüm: sv0 puansız kahraman savunana 26 fazla kaybettiriyor).
   * Eski filtre `level > 0` istiyordu → yeni çıkmış kahraman yok sayılıyordu. */
  const heroes: HeroState[] = (side.heroes ?? [])
    .filter((h) => h && (h.level | 0) >= 0)
    .map((h) => {
      const st: HeroState = { ...h, durum: 100, combat: null as unknown as HeroCombatStats };
      st.combat = heroStats(st, cfg);
      return st;
    });
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

  /**
   * ⭐⭐ §S SUR — 2026-07-29: TASARIMSAL MODEL KALDIRILDI, BİNARY FORMÜLÜNE DÖNÜLDÜ.
   *
   * Sur, Büyü Kalkanı ile **aynı nesne sınıfıdır** ve aynı fonksiyonlardan geçer; tek farkı hangi
   * fazda hatta olduğu (Sur: menzilli+yakın · Kalkan: büyü) ve bölücüsünün ölçekli olması.
   *
   * Eski gerekçe ("binary suru P'nin %0,4'ü kadar kalıp ilk fazda yok oluyor, pratikte işlevsiz")
   * suru grup C sanan yanlış analizden geliyordu. Gerçekte seviye ÜSSEL girer — Sv 5'te güç 5.668,
   * mitigasyon 4.724, bölücü 56.685 → sur zaten "şehir savunmasının temel direği".
   * Kullanıcı ölçümü (D3): gerçek sur **%87,5** kalırken tasarımsal model %17,2 diyordu.
   * `cfg.wall.power/tough/exp` artık kullanılmıyor; yerine kalkanla ORTAK `cfg.wall.base` var.
   */
  const wallLevel = isDefender ? Math.max(0, Math.trunc(side.counts['wall'] ?? 0)) : 0;
  let wall: WallState | null = null;
  if (wallLevel > 0) {
    const wallDef = UNITS_BY_ID['wall'] as UnitDef;
    // ⭐ Onarım sürüyorsa sur HASARLI girer (§13.21.2): durum yüzde olarak taşınır.
    const startIntegrity = Math.min(1, Math.max(0, side.wallIntegrity ?? 1));
    wall = {
      level: wallLevel,
      durum: cfg.wall.durumMax * startIntegrity,   // binary +0x80 (Taş Ustalığı statlara işler)
      stats: applyTech(wallDef, tech),
      base: cfg.wall.base,
    };
  }

  /**
   * ⭐⭐ BÜYÜ KALKANI (§13.21 — binary mekanizması 2026-07-29'da ÇÖZÜLDÜ).
   *
   * Kalkan bugüne kadar "gelen büyü havuzunu yüzdesel azaltan" pasif bir çarpandı ve hiç
   * yıpranmıyordu. Binary'de ise Sur'un ikizi olan, **yalnız büyü fazında** hatta olan bir
   * savunma nesnesi (ordu+0x98; Sur = ordu+0x10). Alanları: seviye(+0x14), Alan/birimPuanı(+0xc),
   * stat bloğu(+0x20), **DURUM 0..100 (+0x80)**. Ekrandaki yüzde doğrudan durumdur.
   * Formüller `gradePower` / `gradeStat` / `gradeTakeHit` içinde (§K).
   */
  const shieldLevel = isDefender ? Math.max(0, Math.trunc(side.counts['magic_shield'] ?? 0)) : 0;
  let shield: ShieldState | null = null;
  if (shieldLevel > 0) {
    shield = {
      level: shieldLevel,
      durum: cfg.magicShield.durumMax,                 // binary +0x80: 100'den başlar
      stats: applyTech(UNITS_BY_ID['magic_shield'] as UnitDef, tech),  // ⭐ TILSIM mAtk'ı büyütür
      base: cfg.magicShield.base,
    };
  }

  return { units, heroes, heroLevel, tech, wall, shield, lossMag: 0 };
}

/**
 * ⭐ GECE — **TAM OLARAK İKİ STAT**: Can (HP) ve Büyü Canı (MagicHP). Başka hiçbir şey.
 *
 * ── Binary kanıtı (2026-07-31, Ghidra ile satır satır okundu) ──────────────────────────────
 * Gece uygulayıcısı `FUN_004111d4` (saldıran, 2 döngü) ve `FUN_00411a80` (savunan, 3 döngü —
 * üçüncüsü savunma YAPILARI). Her ikisi de birim başına `FUN_00412624`i çağırıyor; yapılar için
 * `FUN_00413120` var ve o **bayt bayt aynı**. Modifier'ın disassembly'si (0x00412624) yalnız
 * iki oku-çarp-yaz çifti içeriyor:
 *
 *     CALL 0x412b5c  →  FLD [stat+0x00]   FMUL çarpan   CALL 0x412b68  (yaz)
 *     CALL 0x412b9c  →  FLD [stat+0x08]   FMUL çarpan   CALL 0x412ba8  (yaz)
 *
 * Stat bloğu 6 double, 8 bayt adımlı: +0x00 Can · +0x08 BüyüCan · +0x10 FizSald ·
 * +0x18 FizSav · +0x20 BüyüSald · +0x28 BüyüSav (sonuncusu `FUN_00412b3c` ile doğrulandı,
 * dağıtıcı indeksi 6 = Büyü Savunması). Yani gece **+0x00 ve +0x08**'i çarpıyor.
 *
 * ⚠️ **TAŞIMA KAPASİTESİ ÇARPILMIYOR.** Motor 2026-07-31'e kadar `carry`yi de azaltıyordu;
 * kaynağı `mobiwar_simulator_analysis.md` §7'nin *"HP ve Taşıma Kapasitesi"* ifadesiydi ve o
 * ifade YANLIŞ: ikinci alan Taşıma değil **Büyü Canı**. Taşıma o stat bloğunda bile değil.
 * Etkisi: gece saldırısında ganimet kapasitesi gereksiz yere ~%30 (NV0) kısılıyordu.
 *
 * ⚠️ Sur ve Büyü Kalkanı gece'den ETKİLENMEZ: binary'de ayrı alanlar (`ordu+0x10` / `ordu+0x98`),
 * üçüncü döngünün taradığı yapı listesinde değiller. Bizde de ayrı (`army.wall` / `army.shield`),
 * `army.units` dışında — bu yüzden kendiliğinden doğru.
 */
function applyNight(army: Army, nightVision: number, cfg: CombatConfig): void {
  const m = nightMultiplier(nightVision, cfg);
  for (const e of army.units) {
    e.stats.hp *= m;
    e.stats.poolHp *= m;
    e.stats.magicHp *= m;
    e.stats.poolMagicHp *= m;
  }
}

/* ── Kahraman ──────────────────────────────────────────────────────────────── */

/**
 * ⭐⭐ KAHRAMAN = STAT TABLOSU SATIR 12 (binary `FUN_0041440c`; 21 satır = 12 savaşçı +
 * KAHRAMAN + 8 savunma yapısı). Eski "iki bileşenli efektif model" (heroOffPower/heroDefPower +
 * durum eşiği, 6 uydurma katsayı) 2026-07-29'da KALDIRILDI — o model yapısal olarak yanlış bir
 * iskeletin üstüne oturtulmuş bir eğri uydurmasıydı.
 *
 * Kullanıcının binary simülatörde koştuğu 60+ savaş (Tur 2 + Tur 3) şunları KANITLADI:
 *   · Yetenek puanı 0 olan 12 satırın 12'si birebir → tabanlar, seviye terimi, faz eşlemesi,
 *     `Alan = mDef × 0,005` ve durum formülü doğru.
 *   · **Büyü ÇALIŞIYOR** — kahramanın büyü tabanı 0 değil, 1200 (fizikselle aynı).
 *   · Yetenek terimi **LİNEER ve seviyeden BAĞIMSIZ** — asm'deki `1,06^yetenek` 25 kat küçük.
 *
 * Ölçüm ayrıntıları ve hâlâ açık maddeler: `mobiwar-kahraman-kalan-testler` hafızası.
 */
export const HERO_BASE_STATS = {
  hp: 1200, magicHp: 1200, pAtk: 240, pDef: 240, mAtk: 300, mDef: 4000,
} as const;

/**
 * `FUN_0040d884` + ölçümden düzeltilmiş yetenek terimi:
 *   stat = round((sv+1) × taban × levelBase^sv  +  taban × (1 + skillK × yetenek))
 *   mDef = round((sv+1) × 4000 × mDefLevelBase^sv)     ← yetenek terimi YOK
 *   Alan = round(mDef × areaK)
 * Yetenek eşlemesi: fizSald→hp · fizSav→pAtk VE pDef · büyüSald→magicHp · büyüSav→mAtk.
 */
export function heroStats(h: HeroState, cfg: CombatConfig): HeroCombatStats {
  const L = Math.max(0, h.level | 0);
  const { levelBase, skillK, skillKMagic, mDefLevelBase, areaK } = cfg.hero;
  const sk = (v: number | undefined): number => Math.max(0, v ?? 0);
  /** k = puan başına kaç TABAN birimi. Fiziksel ve büyü kanatları AYRI ölçüldü (aşağıya bak). */
  const g = (base: number, skill: number | undefined, k: number): number =>
    round((L + 1) * base * levelBase ** L + base * (1 + k * sk(skill)));
  const mDef = round((L + 1) * HERO_BASE_STATS.mDef * mDefLevelBase ** L);
  const phys = g(HERO_BASE_STATS.pDef, h.fDef, skillK);   // pAtk ve pDef aynı değeri alır
  return {
    hp: g(HERO_BASE_STATS.hp, h.fAtk, skillK),
    magicHp: g(HERO_BASE_STATS.magicHp, h.mAtk, skillKMagic),
    pAtk: phys, pDef: phys,
    mAtk: g(HERO_BASE_STATS.mAtk, h.mDef, skillKMagic),
    mDef: mDef > 0 ? mDef : 1,
    unitPower: round(mDef * areaK),
  };
}

/** Yaşayan kahraman mı? Ölüm YALNIZ durum 0'a inince (kullanıcı kararı — olasılık yok). */
const heroAlive = (h: HeroState): boolean => h.durum > 0;

/**
 * Havuz katkısı — `FUN_0040e0c4` param_3 dalı (asm 0x40e188): **tip filtresi YOK**.
 *   faz 1 (menzilli) → katkı YOK · faz 2 (yakın) → hp · faz 3 (büyü) → magicHp
 * ⚠️ Durum GÜCÜ ÖLÇEKLEMEZ: kahraman ölene kadar tam güçtedir (binary'de katkı `stat × adet`,
 * durum ayrı alanda tutulur).
 */
function heroPoolContribution(army: Army, type: 1 | 2 | 3): number {
  if (type === 1) return 0;
  return army.heroes.reduce(
    (s, h) => (heroAlive(h) ? s + (type === 3 ? h.combat.magicHp : h.combat.hp) : s), 0);
}

/** P katkısı: Alan × adet (normal birim gibi). */
const heroPowerSum = (army: Army): number =>
  army.heroes.reduce((s, h) => (heroAlive(h) ? s + h.combat.unitPower : s), 0);

/**
 * `FUN_00412980` — kahraman normal bir birim gibi hasar alır:
 *   net = Alan × havuz/P − faz statı ;  durum -= 100 × net/mDef ;  emilen = net
 * Durum 0'a inince kahraman ÖLÜR. Döndürülen değer `lossMag`'e eklenir.
 */
function heroTakeHit(army: Army, pool: number, P: number, type: 1 | 2 | 3, cfg: CombatConfig): number {
  let absorbed = 0;
  for (const h of army.heroes) {
    if (!heroAlive(h)) continue;
    const mit = type === 1 ? h.combat.pAtk : type === 2 ? h.combat.pDef : h.combat.mAtk;
    const net = (h.combat.unitPower * pool) / P - mit;
    if (net <= 0) continue;
    const drop = cfg.hero.durumScale * (net / h.combat.mDef);
    if (drop < h.durum) { h.durum -= drop; absorbed += net; }
    else { absorbed += h.combat.mDef * (h.durum / cfg.hero.durumScale); h.durum = 0; }
  }
  return absorbed;
}

/* ── Havuzlar ──────────────────────────────────────────────────────────────── */

/**
 * ⚠️⚠️ **HAM ADET SAYAN `alive()` KALDIRILDI (2026-08-05).** Motorda "bu ordu hâlâ ayakta mı"
 * sorusunun İKİ farklı cevabı vardı: tur döngüsü `combatAlive` ile bitiyordu (savaş-dışı
 * birimleri saymaz), kazanan ise ham adetle belirleniyordu (sayar). Sonuç, kullanıcının
 * yakaladığı istismar: **1000 casus kuşun beklediği bir şehre 120 cüceyle saldırınca hiç
 * vuruşma olmuyor** (savunanın savaşçısı yok, döngü 1. turda kopuyor), iki tarafın da kaybı
 * 0 kalıyor ve aşağıdaki *"eşitlikte savunan"* kuralı SAVUNANI kazanan ilan ediyordu —
 * saldıran ganimet de alamıyordu. Yani casus kuş (ya da yük arabası, gnom) yığmak şehri
 * dokunulmaz yapıyordu.
 *
 * Ölçüm: boş şehir → saldıran · 1 cüce → saldıran · sur sv3 → saldıran · **1000 casus kuş →
 * SAVUNAN**. Kırılan tek durum savunanda yalnız savaş-dışı birim bulunmasıydı.
 *
 * ⚠️ Düzeltme "kazanan kuralını değiştirmek" değil, **tek tanıma indirmek**: artık her yer
 * `combatAlive` kullanıyor. İki tanım kaldığı sürece bir dahaki sapma kaçınılmazdı.
 */

/** Yenik kontrolü: yük/casus/gnom/tuzak SAYILMAZ (binary FUN_004114b0). */
/**
 * ⭐ Yaşayan kahraman orduyu AYAKTA TUTAR — `FUN_00411db4` üç listeye bakar: savaşçılar,
 * **kahramanlar** (durum > 0) ve yapılar. Motor kahramanı saymayınca son savaşçı ölür ölmez
 * savaş erken bitiyordu; ölçüm 5 tur derken motor 3 tur veriyordu (Tur 2 X grubu).
 *
 * ⚠️⚠️ **`LEVEL_BASED` YAPILAR SAYILMAZ (2026-08-07).** Sur · Büyü Kalkanı · Tapınak girdide
 * ADET değil **SEVİYE** taşıyor (`Sur 8` = sekizinci seviye sur, sekiz sur değil) ve savaşta
 * seviyeleri hiç düşmüyor. Burada sayıldıkları için **seviye, canlı birim adedi gibi
 * davranıyordu**: ordusu olmayan ama Sur 8'i olan şehir "8 birim ayakta" görünüyor, savaş
 * 5 tur boşa dönüyor, kimse kayıp vermiyor ve karar *"eşitlikte savunan"* kuralına düşüyordu.
 *
 * Canlı örnek (kullanıcı raporu, 2026-08-07): **132 Yük Arabası + 2 Ejderha**, savunanın
 * şehrinde **hiç ordu yok**, yalnız Sur 8 — saldıran 5 tur sonra 0 kayıpla **KAYBETTİ** ve
 * sur bütünlüğü %31'e indi. Doğrusu: savunanda savaşacak kimse yok → savaş 1 turda biter,
 * saldıran kazanır, sur hiç yıpranmaz.
 *
 * ⚠️ Bu, 2026-08-05'te düzeltilen "1000 casus kuş" hatasının **ikizi**: o zaman savaş-dışı
 * BİRİMLER şehri ayakta tutuyordu, burada seviye taşıyan YAPILAR tutuyordu. Katalogdaki
 * `LEVEL_BASED` yorumu zaten *"hayatta kalan birim toplamına KATILMAZLAR"* diyordu ve
 * raporun `alive` sayacı (aşağıda) onu doğru uyguluyordu — sapan tek yer burasıydı.
 *
 * ⚠️ Sur'un savaştaki ROLÜ değişmiyor: savunanın ordusu varsa Sur yine güç havuzuna giriyor,
 * mitigasyon uyguluyor ve yıpranıyor (`PASSIVE_STRUCTS` mekanizması). Değişen tek şey,
 * "ortada savaşacak kimse var mı" sorusuna verdiği cevap.
 */
const combatAlive = (a: Army, cfg: CombatConfig): number =>
  a.units.reduce(
    (n, e) => (
      NONCOMBAT.has(e.id) || LEVEL_BASED.has(e.id) || e.count <= cfg.combatThreshold
        ? n
        : n + Math.max(0, e.count)
    ),
    0,
  ) + a.heroes.reduce((n, h) => (h.durum > 0 ? n + 1 : n), 0);

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
  pool += heroPoolContribution(army, type);   // faz 2 → hp · faz 3 → magicHp · faz 1 → yok
  return pool;
}

/**
 * §2 Savunma güç havuzu P: Σ BirimPuan×Adet + (sur | kalkan) + kahraman gücü.
 *
 * ⭐ FAZA BAĞLI (binary `HasarKayipCekirdegi`, param_10 dalı): faz 1-2'de **SUR**, faz 3'te
 * **BÜYÜ KALKANI** P'ye girer. Hangisi P'de yer tutuyorsa gelen hasarın bir kısmını da ÜZERİNE
 * ÇEKER — koruma tam olarak buradan gelir. (Eski sürüm suru her fazda P'ye koyuyordu.)
 */
function powerSum(army: Army, useSnap: boolean, cfg: CombatConfig, type: 1 | 2 | 3): number {
  let P = 0;
  for (const e of army.units) {
    if (PASSIVE_STRUCTS.has(e.id) || OUT_OF_BATTLE.has(e.id)) continue;
    const c = useSnap ? e.snap : e.count;
    P += e.stats.unitPower * Math.max(0, c);
  }
  P += gradePower(type === 3 ? army.shield : army.wall);   // faz3 → kalkan · faz1/2 → sur
  return P + heroPowerSum(army);              // kahraman P'ye Alan×adet ile girer
}

/**
 * §2b ŞAMAN KALKANI (binary `atkSub`): savunan tarafın Şaman'ı gelen saldırı gücünü emer.
 * Yeterli Şaman ile gelen güç ≤ 0 olur → o taraf o fazda SIFIR kayıp alır.
 */
function shamanShield(def: Army, type: 1 | 2 | 3, cfg: CombatConfig): number {
  const sh = def.units.find((e) => e.id === 'shaman');
  if (!sh || sh.count <= 0) return 0;
  // ⭐ 2026-07-29: FAZA GÖRE STAT. Binary faz 1-2'de `sub_4121d4(şaman, 1)` = CAN, faz 3'te
  // `(şaman, 2)` = BÜYÜCAN gönderir. Şaman'ın ikisi de 200 olduğu için teknik 0'da fark yoktu;
  // hata ancak Büyücülük açılınca görünür (yalnız BüyüCan'ı büyütür). Kullanıcı E grubu yakaladı:
  // Büyücülük 2'de savunan gerçekte 112 kaybederken motor 93 diyordu.
  const stat = type === 3 ? sh.stats.poolMagicHp : sh.stats.poolHp;
  return stat * sh.count * cfg.shieldCal;
}

/* ── §K BÜYÜ KALKANI (binary birebir) ──────────────────────────────────────────
 *
 * Kaynak fonksiyonlar: `KalkanGucPuani`(FUN_00413610) · `KalkanStat`(FUN_0041338c) ·
 * `KalkanHamStat`(FUN_004132f4) · `KalkanHasar`(FUN_00413534) · `KalkanYuzde`(FUN_004132b0).
 *
 *   güç        = round(base^Sv × Alan × durum × 0,01)        → savunan P'sine eklenir
 *   mitigasyon = mAtk × Sv × base^Sv × durum × 0,01
 *   net        = güç × havuz/P − mitigasyon
 *   düşüş      = 100 × net / mDef        ⚠️ faz 3'te bölücü **HAM** mDef (ölçeksiz) — kalkana özel
 *   durum     -= düşüş ;  emilen(lossMag) = mDef × 0,01 × düşüş  (= net; yıkılışta kırpılır)
 *
 * Neden yüksek seviye "hiç yıpranmıyor" gibi görünüyor: mitigasyon Sv×base^Sv ile, güç yalnız
 * base^Sv ile büyür → oran Sv×mAtk/Alan. Sv 4'te mitigasyon 13.437, güç 4.199 → `havuz/P` 3,2'yi
 * aşmadıkça net ≤ 0 ve durum hiç düşmez. Sv 1'de ise mitigasyon 576 < güç 720 → kalkan erir.
 */
const gradeLvlF = (o: GradedStruct): number => o.base ** o.level;   // 1,8^Sv

/** FUN_00413610: P'ye giren güç (binary'de tam sayıya yuvarlanır). */
function gradePower(o: GradedStruct | null): number {
  if (!o || o.level <= 0 || o.durum <= 0) return 0;
  return Math.round(gradeLvlF(o) * o.stats.unitPower * o.durum * 0.01);
}

/** FUN_0041338c: stat × Sv × base^Sv × durum × 0,01 — mitigasyon VE faz 1-2 bölücüsü. */
const gradeStat = (o: GradedStruct, stat: number): number =>
  stat * o.level * gradeLvlF(o) * o.durum * 0.01;

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

/**
 * ⭐ FUN_00413534 — Sur/Kalkan'ın DURUMU erir; emilen hasar `lossMag`'a yazılır (kazananı belirler).
 *
 * ⚠️ BÖLÜCÜ ASİMETRİSİ (FUN_0040e0c4): faz 1-2 (SUR) → `FUN_0041338c(obj,6)` = ÖLÇEKLİ mDef;
 * faz 3 (KALKAN) → `FUN_004132f4(obj,6)` = HAM mDef. Sur'un kalkandan çok daha dayanıklı
 * olmasının sayısal sebebi budur (Sv 5'te bölücü 56.685'e karşı 2.000).
 */
function gradeTakeHit(
  o: GradedStruct | null, pool: number, P: number, type: 1 | 2 | 3,
): number {
  if (!o || o.level <= 0 || o.durum <= 0 || P <= 0) return 0;
  const mitStat = type === 1 ? o.stats.pAtk : type === 2 ? o.stats.pDef : o.stats.mAtk;
  const net = (gradePower(o) * pool) / P - gradeStat(o, mitStat);
  if (net <= 0) return 0;              // yüksek seviyede olağan durum: hiç yıpranmaz
  const mDef = o.stats.mDef > 0 ? o.stats.mDef : 1;
  const div = type === 3 ? mDef : gradeStat(o, mDef);
  if (div <= 0) return 0;
  const drop = (100 * net) / div;
  if (drop < o.durum) {
    o.durum -= drop;
    return mDef * 0.01 * drop;         // = net
  }
  const absorbed = mDef * 0.01 * o.durum;   // yıkılışta kırpılır
  o.durum = 0;
  return absorbed;
}

/** §2 Tek faz hasarı: net = BirimPuan×Adet×Havuz/P − Mitigasyon×Adet; kayıp = net/mDef. */
function dealType(
  atk: Army, def: Army, type: 1 | 2 | 3, rng: Rng, cfg: CombatConfig, poolK?: number,
): void {
  // Saldıran havuzu tur-başı FOTOĞRAFTAN (frozen) — iki yön de snapshot kullanır (eşzamanlılık).
  let pool = combatPool(atk, type, true, structSabotage(atk, def, cfg), cfg);
  pool -= shamanShield(def, type, cfg);
  if (pool <= 0) return;
  if (poolK) pool *= poolK;              // karşı-yön kalibrasyonu (şaman kalkanından SONRA → 0 kalan 0)
  pool *= jitter(rng);

  // Savunan P ve pay CANLI sayıdan; P faz başında sabit.
  const P = powerSum(def, false, cfg, type);
  if (P <= 0) return;

  /* ⭐ §S SUR / §K BÜYÜ KALKANI — binary'de ikisi AYNI ANDA hatta değil:
   *   faz 1 (menzilli) + faz 2 (yakın) → SUR      (ctx+0x5c)
   *   faz 3 (BÜYÜ)                     → KALKAN   (ctx+0x60)
   * Eski sürüm suru büyü fazında da vuruyor, kalkanı ise hiç yıpratmıyordu. */
  def.lossMag += gradeTakeHit(type === 3 ? def.shield : def.wall, pool, P, type);

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

  // §KAHRAMAN: normal bir birim gibi payını alır (FUN_00412980). Durum 0'da ölür.
  def.lossMag += heroTakeHit(def, pool, P, type, cfg);
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
  if (opts.shield) pool -= shamanShield(def, type, cfg);
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
 *
 * ⭐⭐ **KAÇ TUZAK PATLAR: ordunun ADEDİ değil AĞIRLIĞI belirler** (2026-08-03'te düzeltildi).
 *
 * ⚠️ Eski hâl doygunluğu `yerBirimiADEDİ × 0,2 / armed` ile ölçüyordu. `armed` sadeleşince
 * geriye `fired = adet × 0,2 × U(0,75…0,99)` kalıyor, yani **yer birimi başına en fazla 0,198
 * tuzak**. Tek birimlik bir ordu (1 Kaos) için `fired ≈ 0,2` → aşağıdaki `Math.round` bunu
 * yutuyor → **123 tuzak 123 kalıyor.** Kullanıcı bunu orijinal simülatörle yakaladı: orada
 * aynı savaşta **121 tuzak patlıyor, 2 kalıyor**.
 *
 * ⭐ Binary'deki gerçek kural (Ghidra, `FUN_0040e794` Tur 1 · `0040ea15`-`0040ebdb`):
 * ```
 *   ESIK       = tuzakAdedi × (rand%25 + 75)/100          ; 0040ea39-ea56 → %75-99
 *   BASKI      = Σ saldıranın birimleri: (stat4 + stat6) × adet
 *   tetiklenen = min( BASKI / tuzak.stat1 , ESIK )        ; 0040eb44 CMP/JLE
 * ```
 * `FUN_004121d4(kayıt, idx)` statı `kayıt+0x10`den okuyup **`[kayıt+0x8]` (adet) ile çarpıyor**;
 * getter ofsetleri (`00412afc/b1c/b3c/b5c/b7c/b9c`) altı double veriyor:
 * `1=hp · 2=magicHp · 3=pAtk · 4=pDef · 5=mAtk · 6=mDef`. Yani **BASKI = Σ(pDef + mDef) × adet**,
 * bölen **tuzağın hp'si** (katalogda 340 — burada `poolHp`).
 *
 * Sezgisi de doğru: tuzak tarlasına basan şey birimlerin SAYISI değil, üstünden geçen ordunun
 * kütlesi. Tek bir Kaos (mDef 1.200.000) bütün tarlayı tetikler, tek bir Cüce (mDef 182) bir
 * tuzağa bile yetmez.
 *
 * ⚠️ İki bağımsız ölçüm de bunu tutuyor:
 *   • 1 Kaos ↔ 123 Tuzak → `min(1.240.000/340, 123×0,75…0,99)` = `min(3647, 92…121)` → **92…121**
 *     patlar (ölçüm: 121 patladı, 2 kaldı)
 *   • 1200 Elf ↔ 1000 Tuzak → ESİK baskın → kalan **10…250** (arşiv ölçümü: 30-250)
 *
 * ⚠️ **Uçanlar hâlâ dışarıda.** Binary'nin toplamında böyle bir süzgeç GÖRÜNMÜYOR (iki liste
 * ham toplanıyor), ama oyunun kendi dokümanı tuzağın *"yer ünitelerine"* zarar verdiğini
 * söylüyor (`teknik_ve_yapi_dokumantasyonu.md`). Doküman lehine korundu; ölçümle çürütülürse
 * `ground` filtresinden `FLYING`i çıkarmak tek satır.
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
  if (armed <= 0 || ground.length === 0) {
    tr.count = Math.max(0, tr.count - disarmed);
    tr.spent = true;
    return;
  }

  /**
   * ⚠️ `poolHp` sıfır olamaz (Tuzak hp 340) ama dünya ayarıyla katalog fiyatları/statları
   * oynanabildiği için bölme korumasız bırakılmıyor: 0 olursa salvo hiç olmasın, `Infinity`
   * tuzağın tamamını tavana dayamasın.
   */
  const resistance = Math.max(1e-9, tr.stats.poolHp);
  const pressure = ground.reduce((s, e) => s + (e.stats.pDef + e.stats.mDef) * e.count, 0);
  const cap = armed * rng.range(cfg.trap.triggerMin, cfg.trap.triggerMax);
  const fired = Math.min((pressure * cfg.trap.pressureScale) / resistance, cap);
  if (fired > 0) {
    const pool = tr.stats.poolHp * fired * cfg.trap.power * jitter(rng);
    const P = ground.reduce((s, e) => s + e.stats.unitPower * e.count, 0);
    if (P > 0) {
      for (const e of ground) {
        /**
         * ⭐ MİTİGASYON UYGULANIR — tuzak **yakın dövüş** (tip 2) vuruşudur, dolayısıyla
         * hedefin *yakın savunması* (`pDef`) düşülür. `dealType`teki formülün aynısı.
         *
         * ⚠️ Burada eskiden *"ayak altında patlayan tuzağa karşı zırh işlemez"* diye mitigasyon
         * ATLANIYORDU. Bu [REKON] bir varsayımdı ve İKİ ölçümle birden çürüdü:
         *   • 1 Kaos ↔ 123 Tuzak: orijinalde saldıran **hiç kayıp vermiyor**. Mitigasyonsuz
         *     hesapta Kaos ölüyordu (pay ~34.000, `mDef` 1.200.000 → 0,03 kayıp; sonraki
         *     turlarda bu fark onu 0,5'in altına düşürüyor). Mitigasyonla: pay 34.000 −
         *     40.000 = negatif → **sıfır kayıp** ✓
         *   • 1200 Elf ↔ 1000 Tuzak: arşiv ölçümü *"1 TURDA 1200 elf öldürür"*. Elf'in yakın
         *     savunması 4 → 306.000 − 4.800 = 301.200 → 1287 elf ölür (hepsi) ✓
         * Binary de aynı yolu izliyor: tuzak salvosu standart hasar çekirdeğinden
         * (`FUN_0040e0c4`) geçiyor ve o çekirdek `net = pay − mitigasyon × adet` yapıyor.
         */
        const share = (e.stats.unitPower * e.count * pool) / P;
        const net = share - e.stats.pDef * e.count;
        if (net <= 0) continue;
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
 *
 * ⭐⭐ **SAVUNMA BİRİMLERİ ENKAZ VERMEZ** (2026-08-03, kullanıcının binary ölçümü).
 *
 * ⚠️ Motor doğduğundan beri savunma birimlerini de sayıyordu ve bu **yanlıştı**. Kullanıcının
 * orijinal simülatörde (v0.5.5) yaptığı iki ölçüm kuralı izole ediyor — saldıran hiç kayıp
 * vermiyor, ölen her şey savunma birimi:
 *   • 1 Kaos ↔ 46 Mangonel → 10 Mangonel yıkıldı, **enkaz 0 altın / 0 yemek**
 *     (bizim motor: 10 × 1.000 × 0,3 = 3.000 altın · 10 × 8.000 × 0,3 = 24.000 yemek)
 *   • 1 Kaos ↔ 143 Okçu + 123 Tuzak + 143 Kazancı + 46 Mangonel + 65 Muhafız + 33 Balista
 *     → 188 savunma birimi yıkıldı, yine **0 / 0** (bizim motor: 67.860 / 86.100)
 *
 * Binary de bunu söylüyor. `FUN_00411c4c` (savunanın enkaz hesabı) İKİ liste geziyor:
 *   1. liste (`+4`) → her girdi için `[+0x78] × [+0x84] × 0,3` toplanır  (`FUN_004120bc`)
 *   2. liste (`+8`) → **yalnız `[+0xB8] == 6` olan girdi** katkı verir, o da 1,15 çarpanlı
 *      (`FUN_00412a88` içinde `0x3ff2666666666666` = 1,15 → Ogre kuralı)
 * Yani ikinci listedeki (savunma) birimler tip 6 olmadıkça hiçbir şey eklemiyor.
 *
 * ⚠️ **`scratchpad/test_debris.js`teki T3/T9 ölçümleri bu soruyu ÇÖZEMEZ** — orada iki taraf da
 * savaşçı kaybediyor ve motorun kayıp sayıları zaten orijinalden sapıyor; iki hipotez de ölçümün
 * bir tarafında kalıyor (H1 +%11/+%19, H2 −%7/−%22). Ayrımı yapan, saldıranın hiç kayıp
 * vermediği yukarıdaki iki senaryo.
 *
 * ⚠️ Bu bir DENGE düzeltmesi de: yalnız savunma yığan bir şehir, saldırana her seferinde
 * yağmalanabilir enkaz basıyordu — savunma yatırımı saldırganı besliyordu.
 */
function debris(army: Army, heroLevel: number, cfg: CombatConfig): { gold: number; food: number } {
  let gold = 0;
  let food = 0;
  for (const e of army.units) {
    if (!cfg.debrisFromDefenses && e.kind === 'defense') continue;
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

/**
 * ⭐ §5/§6 KAHRAMAN ÇIKMA İHTİMALİ (0-100) — 28/28 ölçümle doğrulandı (2026-07-29).
 *
 *   ihtimal = (Tapınak×10 − Kahraman×155) × min(1, XP × 0,000025),   XP > 499 kapısıyla
 *
 * v0.6'da bunu çarpımsala çevirmiştik ("iki kahramandan sonra imkânsız oluyor"); ÖLÇÜM binary'yi
 * tutuyor (çarpımsal sürüm 19/28). K=1 satırları ayrımı net yapıyor: %1,137↔%1,14 · %0,828↔%0,82.
 *
 * ⚠️ `temple` = oyuncunun **TÜM ŞEHİRLERİNDEKİ tapınak seviyelerinin TOPLAMI** (kullanıcı,
 * oyunun kendi davranışı) — tek şehrin tapınağı değil.
 * ⚠️ DENGE: 155 cezasıyla K=2 için toplam Tapınak ≥ 31 gerekir. Şehir sayısı arttıkça toplam da
 * arttığı için bu, çok şehirli oyuncuyu ödüllendiren doğal bir kapı oluyor.
 */
export function captureChance(
  temple: number, heroCount: number, xp: number,
  cfg: CombatConfig = DEFAULT_COMBAT_CONFIG,
): number {
  const T = Math.max(0, temple | 0);
  const K = Math.max(0, heroCount | 0);
  if (!(xp > cfg.capture.xpGate) || T <= 0 || K >= cfg.capture.maxHeroes) return 0;
  const base = T * cfg.capture.perTempleLevel - K * cfg.capture.perHeroPenalty;
  if (base <= 0) return 0;
  return Math.min(100, Math.max(0, base * Math.min(1, xp * cfg.capture.xpScale)));
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

/**
 * ⭐ `configOverride` **KISMİ** olabilir (§admin Faz 4): panelden yalnız birkaç sabit
 * değiştirilir ve geri kalanı varsayılanda kalır. Eskiden tam `CombatConfig` isteniyordu;
 * o imza ile eksik bir nesne geçen çağıran, `undefined` alanlarla sessizce yanlış savaş
 * çözerdi. `mergeCombatConfig(undefined)` varsayılan nesnenin KENDİSİNİ döndürüyor, yani
 * override verilmediğinde davranış bit-bit aynı.
 */
export function simulate(
  input: SimulateInput, configOverride?: DeepPartial<CombatConfig>,
): SimulateResult {
  const cfg = mergeCombatConfig(configOverride);
  const rng = createRng(input.seed);

  const atk = buildArmy(input.attacker, false, cfg);
  const def = buildArmy(input.defender, true, cfg);

  if (input.night) {
    applyNight(atk, input.nightVisionAttacker ?? 0, cfg);
    applyNight(def, input.nightVisionDefender ?? 0, cfg);
  }

  /**
   * ⭐ TUR 1 **KOŞULSUZ** çalışır — yenik kontrolü ondan SONRA gelir.
   *
   * Binary de böyle: `FUN_0040dcb4` (savaş koordinatörü) önce `FUN_0040e794`'ü (Tur 1) çağırıyor,
   * `FUN_00410390` yenik kontrolünü ancak ondan sonra yapıyor.
   *
   * ⚠️ Eskiden kontrol döngünün BAŞINDAYDI ve şu deliği açıyordu: savunmasında **yalnız tuzak**
   * olan şehir "savaşacak birimi yok" sayılıp döngü hiç dönmüyor, dolayısıyla **tuzaklar hiç
   * patlamıyordu**. Oysa tuzak surun dışında duruyor ve yaklaşan orduyu vuruyor
   * (`teknik_ve_yapi_dokumantasyonu.md`); savunanın başka birimi olması şart değil.
   */
  let turns = 1;
  for (const e of atk.units) e.snap = e.count;
  for (const e of def.units) e.snap = e.count;
  // §Z Tuzak salvosu: ordu şehre yaklaşırken, karşılıklı vuruşma başlamadan.
  trapVolley(atk, def, rng, cfg);
  if (cfg.turn1GnomeSkirmish) turn1GnomeSkirmish(atk, def, rng, cfg);

  for (let r = 2; r <= 5; r++) {
    if (combatAlive(atk, cfg) <= 0 || combatAlive(def, cfg) <= 0) break;
    turns = r;
    // Tur başı fotoğrafı (yalnız HAVUZLAR için).
    for (const e of atk.units) e.snap = e.count;
    for (const e of def.units) e.snap = e.count;

    const types = cfg.turnSchedule[r] ?? [];
    for (const t of types) dealType(atk, def, t, rng, cfg);                  // saldıran → savunan
    for (const t of types) dealType(def, atk, t, rng, cfg, cfg.counterK);    // savunan → saldıran
  }

  // §4b KAYBEDEN tarafın savaş-dışı birimleri (yük/gnom) orantısal kayıp alır; casus uçarak kaçar.
  {
    // ⚠️ Aşağıdaki kazanan kararıyla AYNI ölçüyü kullanmak zorunda: ayrışırlarsa yanlış
    // tarafın yük arabası/gnomu ele geçirilir.
    const aliveA = combatAlive(atk, cfg);
    const aliveD = combatAlive(def, cfg);
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
  /**
   * ⚠️ **`combatAlive`, ham adet DEĞİL** (2026-08-05, yukarıdaki nota bak): savaş-dışı birim
   * "ayakta ordu" saymaz. `alive()` ile ölçülürken casus kuş/yük arabası/gnom yığını savunanı
   * ayakta gösteriyor, iki tarafın da kaybı 0 kaldığı için karar son satırdaki eşitlik
   * kuralına düşüyor ve savunan kazanıyordu.
   *
   * ⚠️ Son satırdaki *"eşitlikte savunan"* kuralı DEĞİŞMEDİ; zaten yanlış olan o değildi.
   * O kural artık yalnız **iki tarafın da savaşçısı varken** işliyor, yani gerçekten çekişmeli
   * bir savaşta — konulduğu yer orasıydı.
   */
  const atkStanding = combatAlive(atk, cfg);
  const defStanding = combatAlive(def, cfg);
  let winner: 'attacker' | 'defender' | 'draw';
  if (atkStanding <= 0 && defStanding <= 0) winner = 'draw';
  else if (defStanding <= 0) winner = 'attacker';
  else if (atkStanding <= 0) winner = 'defender';
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
  const capture = winSide ? captureChance(winSide.temple ?? 0, winSide.heroCount ?? 0, xp, cfg) : 0;

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
    wallIntegrity: army.wall ? army.wall.durum / 100 : null,   // ⭐ binary: FUN_004132b0
    shieldIntegrity: army.shield ? army.shield.durum / 100 : null,   // ⭐ binary: FUN_004132b0 (durum 0..100)
  };
}
