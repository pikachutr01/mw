import type { UnitDef } from './types.ts';

/**
 * §1 Birim ve savunma statları — binary stat tablolarından (126 stat + maliyet/eğitim/taşıma),
 * `mobiwar-engine.js` v0.6.0 WARRIOR_ROWS/DEF_ROWS ile birebir aynı sayılar.
 *
 * ⚠️ SAVUNMA YAPILARI OFF-BY-ONE (2026-07-23): binary'de yapılar index 13-20'dedir; eski motor
 * 12-20 okuyup her yapıya bir öncekinin statını veriyordu. Buradaki satırlar DÜZELTİLMİŞ hâldir
 * (Mangonel pAtk 192/menzilli · Balista pAtk 480/menzilli · Okçu Kulesi hp 60 · Büyü Kalkanı büyü).
 *
 * `area` = binary "train" hücresi = dokümandaki "Alan" (12/12 birimde doğrulandı).
 *
 * ⚠️ **`carry` binary'den GELMEZ** — oyunun kendi dokümanındaki "Kapasite" satırıdır. Simülatör
 * savaşta ortaya çıkan ganimeti hesaplar, ne kadarının taşındığını bilmez; bu yüzden taşıma
 * kapasitesinin tek kaynağı `teknik_ve_yapi_dokumantasyonu.md`'dir. 12/12 birim doğrulandı
 * (2026-07-28). Ganimet altın/yemek **eşit oranda** taşınır.
 */
export const UNITS: readonly UnitDef[] = [
  // ── SAVAŞÇILAR ────────────────────────────────────────────────────────────────
  //                                                        hp  magicHp carry pAtk pDef  mAtk    mDef   gold    food     area  hız
  u('dwarf',        'Cüce',         2,      60,      0,    10,    4,    9,     4,    182,   200,     450,      9,  100),
  u('elf',          'Elf',          1,      80,      0,     4,    9,    4,    11,    234,   450,     650,     12,  120),
  u('cavalry',      'Süvari',       2,     300,      0,    40,   72,   36,    18,    845,  1200,    2400,     52,  140),
  u('pegasus',      'Pegasus',      1,     300,    250,    40,   48,   84,    60,   1300,  4000,    3200,     80,  160),
  u('dragon',       'Ejderha',      1,    2000,   2800,   300,  540,  540,   600,  13000, 45000,   20000,    750,  160),
  u('mangonel',     'Mancınık',     1,    1500,      0,     0,  204,  120,   240,   4160, 12000,    6000,    240,  100),
  u('ogre',         'Ogre',         2,    3000,      0,   500,  420,  720,   300,  12000, 18000,   24000,    666,  100),
  u('shaman',       'Şaman',        1,     200,    200,     1,    6,    6,    12,    750,  2000,    2000,     18,  120),
  u('spy_bird',     'Casus Kuş',    1,       0,      0,     0,    1,    1,     2,     10,   100,     200,      1, 6000),
  // ⚠️ Yük Arabası taşıma kapasitesi **5000** (2026-07-28 düzeltildi, `teknik_ve_yapi_dokumantasyonu.md`).
  // Kodda 3000 yazıyordu; binary'den gelmiş gibi duruyordu ama gelemezdi: simülatör yalnız savaşta
  // ORTAYA ÇIKAN ganimeti hesaplar, ne kadarının taşındığını bilmez. Diğer 11 birimin kapasitesi
  // dokümanla birebir tutuyor — hata yalnız buradaydı.
  u('cargo_wagon',  'Yük Arabası',  2,       0,      0,  5000,   10,   10,    10,    100,  1000,    1000,      8,  140),
  u('gnome',        'Gnom',         2,     200,      0,     4,   12,   12,    12,    260,  1600,    1600,     25,  120),
  u('chaos',        'Kaos',         2,  220000, 250000,     0, 40000, 40000, 27000, 1200000, 2000000, 2000000, 40000, 80),

  // ── SAVUNMA BİRİMLERİ / YAPILARI ──────────────────────────────────────────────
  // Savunma birimleri sefere ÇIKMAZ → hız 0 (sefer doğrulaması bunu kullanıyor).
  d('archer_tower', 'Okçu Kulesi',  1,      60,      0,     0,   12,    6,    19,    325,   300,     450,     24),
  d('trap',         'Tuzak',        2,     340,      0,     0,    0,   18,     0,     42,   400,       0,      3),
  d('oil_cauldron', 'Kazancı',      2,     800,      0,     0,   30,  120,    72,   2418,  2400,    3200,    150),
  d('mangonel_tower','Mangonel',    1,     700,      0,     0,  192,   96,   120,   3744,  1000,    8000,    257),
  d('guard',        'Muhafız',      2,     200,    300,     0,   48,  144,   120,   3172,  2400,    2000,    180),
  d('ballista',     'Balista',      1,    2500,   2500,     0,  480,  240,   600,  16640, 20000,   16000,    900),
  d('wall',         'Sur',          2,       0,      0,     0,   50,   50,     0,    600,   960,     980,    300),
  d('magic_shield', 'Büyü Kalkanı', 3,       0,      0,     0,    0,    0,   320,   2000,  8000,    2000,    400),
  // Tapınak SAVAŞMAZ (bina). Binary stat tablosu idx20'de biter → savaş satırı yok.
  // Vestigial giriş: nötr (mDef=1 sıfıra bölme koruması). Savaşta hiç görünmez.
  d('temple',       'Tapınak',      3,       0,      0,     0,    0,    0,     0,      1,  8000,    2000,    400),
] as const;

/**
 * Kahraman hızı (§13.5.5 cetveli). Kahraman ordunun hızını YÜKSELTMEZ — yalnız tek başına
 * yola çıktığında bu hızla gider (`harita.html`: "Kahraman orduyu hızlandırmaz").
 *
 * ⚠️ **Ama YAVAŞLATIR** (2026-08-03). Kural yıllarca "kahraman hız hesabına hiç girmez" diye
 * uygulandı ve doğru göründü — çünkü 200, her savaşçıdan (80-160) hızlıydı. Casus Kuş'un
 * **6000**'i bu varsayımı kırdı: "9 kuş + 1 kahraman" ordusu 52 saniyede varıyor göründü.
 * Doğrusu `armySpeed(units, heroCount)` (bkz. `packages/engine/src/travel.ts`).
 */
export const HERO_SPEED = 200;

function u(
  id: string, tr: string, type: 1 | 2 | 3,
  hp: number, magicHp: number, carry: number,
  pAtk: number, pDef: number, mAtk: number, mDef: number,
  gold: number, food: number, area: number, speed: number,
): UnitDef {
  return { id, name: { tr }, kind: 'warrior', type, hp, magicHp, carry, pAtk, pDef, mAtk, mDef, gold, food, area, speed };
}

function d(
  id: string, tr: string, type: 1 | 2 | 3,
  hp: number, magicHp: number, carry: number,
  pAtk: number, pDef: number, mAtk: number, mDef: number,
  gold: number, food: number, area: number,
): UnitDef {
  return { id, name: { tr }, kind: 'defense', type, hp, magicHp, carry, pAtk, pDef, mAtk, mDef, gold, food, area, speed: 0 };
}

export const UNITS_BY_ID: Readonly<Record<string, UnitDef>> = Object.fromEntries(
  UNITS.map((x) => [x.id, x]),
);

export const WARRIORS: readonly UnitDef[] = UNITS.filter((x) => x.kind === 'warrior');
export const DEFENSES: readonly UnitDef[] = UNITS.filter((x) => x.kind === 'defense');

/** Uçan birimler: yer tuzaklarına basmaz (doküman §U). */
export const FLYING: ReadonlySet<string> = new Set(['pegasus', 'dragon', 'spy_bird']);

/**
 * Pasif yapılar: normal saldırı havuzuna girmez, normal hedef de olmaz — her birinin kendi
 * mekanizması var (sur bütünlüğü · kalkan yüzdesi · tuzak salvosu · tapınak savaşmaz).
 */
export const PASSIVE_STRUCTS: ReadonlySet<string> = new Set(['wall', 'magic_shield', 'trap', 'temple']);

/** Saldırı havuzuna katkı vermeyen birimler (şaman kalkanı ayrı mekanik, gnom sabotajcı). */
export const NO_POOL: ReadonlySet<string> = new Set(['shaman', 'gnome']);

/** Tur içinde kayıp almayan destek birimleri (kaybeden tarafta savaş sonrası ele geçirilir). */
export const NO_ROUND_LOSS: ReadonlySet<string> = new Set(['cargo_wagon', 'spy_bird', 'gnome']);

/** P paydasına (güç havuzuna) girmeyen birimler — savaşmıyorlar, hasarı seyreltmemeliler. */
export const OUT_OF_BATTLE: ReadonlySet<string> = new Set(['cargo_wagon', 'spy_bird', 'gnome']);

/**
 * Ordu bozulunca ele geçirilenler — **her iki tarafta da** (kayıp oranıyla orantısal).
 *
 * ⚠️ Gnom 2026-08-07'de buradan ÇIKARILDI: ölçüm D5'te saldıranın 100 gnomu, saldıran
 * kaybettiği hâlde binary'de **hiç ölmüyor**; motor ise %50'sini alıyordu. Yük Arabası ise
 * iki tarafta da ölçüldü (C2: saldıran 20 cüce + 500 araba kaybediyor) → listede kalıyor.
 */
export const SETTLE_ON_LOSS: readonly string[] = ['cargo_wagon'];

/**
 * ⭐ YALNIZ SAVUNAN TARAFTA kayıp veren savaş-dışı birimler (2026-08-07 ölçümü).
 *
 * Casus Kuş savunanda kaybedilince yük arabasıyla **aynı orantısal kuralla** gidiyor
 * (ölçüm: A2/A4/E2 → %100 · A6 → %50 · A3 → ~%83 · A1 → %0), ama **saldıran tarafta hiç
 * ölmüyor** (B2 ve A6'nın savunan-kazandığı hâli: saldıran yalnız savaşçılarını kaybediyor).
 *
 * ⚠️ Asimetri oyunun kendi kuralından geliyor: **kuş normal bir saldırıya zaten katılamaz**
 * (`mission.service.ts` yalnız casusluk · destek · şehir kurmaya izin veriyor). Yani saldıran
 * tarafta kuş bulunması ancak SİMÜLATÖRDE mümkün ve binary orada kuşu etkisiz sayıyor —
 * kullanıcının ifadesiyle *"casus kuşlar saldırı durumunda etkisiz olmaları gerekir"*.
 *
 * ⚠️ Eskiden kuş **hiçbir tarafta** ölmüyordu ("uçarak kaçar" varsayımı). Ölçüm bunu çürüttü:
 * 1000 kuşlu bir şehir düştüğünde binary 1000 kuşu da kaybettiriyor ve **ölen kuşlar ganimet
 * üretiyor**. Varsayım yalnız SALDIRAN taraf için doğruymuş.
 *
 * ⚠️ **GNOM BURADA DEĞİL** — bir ara konmuştu, ölçüm F2 çürüttü: `Cüce 120 → Gnom 500 + Cüce 1`
 * savaşında savunan gerçekten kaybediyor (3 tur) ama yalnız **4 gnom** ölüyor; bu da
 * D1'in (`Cüce 120 → Gnom 500`, savaş hiç olmuyor) birebir aynı sayısı. Yani gnom kaybı
 * savaşın sonucundan tamamen BAĞIMSIZ — ele geçirme yok, ayrı bir Tur 1 mekanizması var
 * (`docs/SAVAS_BINARY_KONTROL.md`, "Tur 1'de savunan gnomu").
 */
export const SETTLE_ON_LOSS_DEFENDER: readonly string[] = ['spy_bird'];

/** "Yenik" kontrolünde sayılmayan birimler (binary FUN_004114b0). */
export const NONCOMBAT: ReadonlySet<string> = new Set(['cargo_wagon', 'spy_bird', 'gnome', 'trap']);

/**
 * Adedi değil SEVİYESİ olan yapılar. Girdideki sayı "kaç tane" değil "kaçıncı seviye" demektir
 * (Sur 3 = üçüncü seviye sur, üç sur değil) ve savaşta seviye DÜŞMEZ — Sur'da bütünlük yüzdesi
 * ayrıca raporlanır. Bu yüzden "hayatta kalan birim" toplamına KATILMAZLAR.
 */
export const LEVEL_BASED: ReadonlySet<string> = new Set(['wall', 'magic_shield', 'temple']);
