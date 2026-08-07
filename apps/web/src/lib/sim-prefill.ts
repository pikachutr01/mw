/**
 * ⭐ SİMÜLATÖR KÖPRÜSÜ — formu tek tıkla dolduran her şey burada (kullanıcı, 2026-08-07).
 *
 * Simülatör bugüne kadar **tamamen elle** dolduruluyordu: 12 savaşçı, 8 teknik, 5 kahraman
 * satırı, 8 savunma yapısı. Kullanıcı iki köprü istedi:
 *   • `/simulate` ekranında aktif şehrin verisini forma basan iki düğme,
 *   • casusluk raporu modalında rakibin öğrenilen verisini SAVUNANA, kendi şehrini SALDIRANA
 *     basan bir düğme.
 *
 * İkisi de aynı alan listelerine, aynı eşlemeye ve aynı devir bloğuna ihtiyaç duyduğu için
 * hepsi bu dosyada. `Simulate.tsx` ile `Messages.tsx` ayrı ayrı yazsaydı — özellikle aşağıdaki
 * ⚠️⚠️ Tapınak tuzağı — biri kaçınılmaz olarak farklı davranırdı.
 */
import {
  TECHS, TECH_ORDER, UNITS, WARRIOR_ORDER, DEFENSE_ORDER, orderBy,
} from '@mobilwar/catalog';
import type { CityDetail, HeroSkills, TempleView } from './queries.ts';

export type Side = 'attacker' | 'defender';

/* ── Simülatörün alan listeleri ─────────────────────────────────────────────── */

export const WARRIORS = orderBy(UNITS.filter((u) => u.kind === 'warrior'), WARRIOR_ORDER);
/**
 * ⚠️ Sur ve Büyü Kalkanı burada SEVİYE taşır (adet değil) — `LEVEL_BASED` kuralı simülatörde de
 * geçerli. Tapınak listede YOK: savaş yapısı değil, ayrı bir alanda kahraman ihtimalini besliyor.
 */
export const DEFENSES = orderBy(
  UNITS.filter((u) => u.kind === 'defense' && u.id !== 'temple'), DEFENSE_ORDER,
);
/** Savaş statına dokunan teknikler; `stat: null` olanlar (Casusluk, Haritacılık…) savaşa girmez. */
export const COMBAT_TECHS = orderBy(TECHS.filter((t) => t.stat !== null), TECH_ORDER);
/**
 * ⚠️ Taş Ustalığı yalnız SAVUNMA yapılarını ölçekliyor (`techs.ts:52` — Okçu Kulesi, Mangonel,
 * Balista, Sur). Saldıranda yazılabilir olsaydı hiçbir etkisi olmayan bir kutu olurdu; binary
 * araç da o hücreyi çizgiyle geçiyor.
 */
export const DEFENDER_ONLY_TECH = new Set(['masonry']);

/**
 * ⚠️ `Set<string>` olarak yazılıyor, katalogun dar birleşim tipiyle (`TechId`, `UnitId`) değil:
 * anahtarlar sunucudan gelen ham `Record<string, number>`lardan geliyor ve `has()` süzgecin ta
 * kendisi — dar tip, süzgeci çağırmayı imkânsız kılardı.
 */
const WARRIOR_IDS: ReadonlySet<string> = new Set<string>(WARRIORS.map((u) => u.id));
const DEFENSE_IDS: ReadonlySet<string> = new Set<string>(DEFENSES.map((u) => u.id));
const TECH_IDS: ReadonlySet<string> = new Set<string>(COMBAT_TECHS.map((t) => t.id));

/** Formdaki her kutu METİN tutuyor; `0` yerine boş dize yazılıyor ki satır "hiç girilmedi" kalsın. */
const s = (n: number | undefined | null): string => (n && n > 0 ? String(n) : '');

/* ── Devir bloğu ────────────────────────────────────────────────────────────── */

/** Bir sütunun doldurulabilir alanları. Tümü isteğe bağlı: bilinmeyen alan YAZILMAZ. */
export interface SidePrefill {
  counts?: Record<string, string>;
  tech?: Record<string, string>;
  heroes?: { level: string; fAtk: string; fDef: string; mAtk: string; mDef: string }[];
  temple?: string;
  heroCount?: string;
  vision?: string;
}

export interface SimPrefill { v: 1; attacker?: SidePrefill; defender?: SidePrefill }

const PREFILL_KEY = 'mw-sim-prefill';

/**
 * ⚠️ **Neden `navigate(path, { state })` değil:** projede o desenin tek bir örneği yok; ekranlar
 * arası niyet ya kendini temizleyen sorgu parametresiyle (`?dm=`, `?chat=1`) ya da bağlamla
 * taşınıyor. İstihbarat bloğu sorgu parametresine sığmaz, `Simulate.tsx` ise bugün hiç router
 * import etmiyor — depolama köprüsü onu öyle bırakıyor ve `mw-sim-last`in zaten kurduğu deseni
 * (sürümlü blob + savunmacı okuyucu) tekrarlıyor.
 *
 * ⚠️ `sessionStorage`, `localStorage` DEĞİL: bu bir tercih değil, tek atımlık bir devir. Sekme
 * kapanınca kaybolmalı.
 */
export function writeSimPrefill(p: SimPrefill): void {
  try {
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify(p));
  } catch {
    /* Kotası dolu / gizli mod: devir yapılamaz ama ekran değişimi yine olsun. */
  }
}

/**
 * Okur, doğrular ve **SİLER** — tek atımlık.
 *
 * ⚠️ Silme şart: kayıt kalsaydı oyuncu simülatöre bir daha girdiğinde eski casusluk verisi
 * formu sessizce ezerdi. Aynı sebeple sayfa yenilendiğinde de tekrar uygulanmaz.
 * ⚠️ Depolama elle düzenlenebilir; şemaya güvenilmez (`Simulate.tsx` `readLast()` emsali).
 */
export function readSimPrefill(): SimPrefill | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PREFILL_KEY);
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (d['v'] !== 1) return null;
    const okSide = (v: unknown): boolean => v == null || (typeof v === 'object' && v !== null);
    if (!okSide(d['attacker']) || !okSide(d['defender'])) return null;
    return d as unknown as SimPrefill;
  } catch {
    return null;
  }
}

/* ── Kaynak → sütun eşlemeleri ──────────────────────────────────────────────── */

/**
 * ⭐ AKTİF ŞEHİR → bir sütun.
 *
 * ⚠️⚠️ **Tapınak tuzağı.** Şehrin `defenses` kaydında Tapınak SEVİYESİ de duruyor ama
 * simülatörün `DEFENSES` listesi onu dışlıyor (savaş yapısı değil). Filtre uygulanmasaydı
 * `counts`a `temple` anahtarı yazılır ve `toCounts` onu motora **birim adedi** olarak
 * gönderirdi — ekranda hiç görünmeyen, sonucu bozan bir sayı. Her iki yön de yalnız bu
 * dosyadaki id kümelerine yazıyor.
 *
 * ⚠️ Savunma yapıları ve Taş Ustalığı YALNIZ `defender` sütununa: saldıran sütununda o satırlar
 * hiç çizilmiyor, yazılan değer görünmez bir hayalet olurdu.
 * ⚠️ Ordu **yalnız şehirdekiler** (kullanıcı kararı): mağaradakiler ve seferdekiler ayrı
 * havuzlar, `city.units` onları zaten içermiyor.
 * ⚠️ `techs` oyuncu geneli (şehir başına değil) — `CityDetail` onu öyle döndürüyor.
 */
export function sideFromCity(city: CityDetail, temple: TempleView, side: Side): SidePrefill {
  const counts: Record<string, string> = {};
  for (const [id, n] of Object.entries(city.units)) {
    if (WARRIOR_IDS.has(id)) counts[id] = s(n);
  }
  if (side === 'defender') {
    for (const [id, n] of Object.entries(city.defenses)) {
      if (DEFENSE_IDS.has(id)) counts[id] = s(n);
    }
  }

  const tech: Record<string, string> = {};
  for (const [id, lv] of Object.entries(city.techs)) {
    if (!TECH_IDS.has(id)) continue;
    if (side === 'attacker' && DEFENDER_ONLY_TECH.has(id)) continue;
    tech[id] = s(lv);
  }

  /**
   * ⚠️ Yalnız ŞEHİRDEKİ kahramanlar: görevdeki ya da diriltilen kahraman bu savaşa katılamaz.
   * Sözleşme en çok 5 kahraman kabul ediyor (`contracts/simulate.ts`).
   */
  const heroes = temple.heroes
    .filter((h) => h.state === 'in_city')
    .slice(0, 5)
    .map((h) => ({
      level: s(h.level),
      fAtk: s(h.skills.fAtk), fDef: s(h.skills.fDef),
      mAtk: s(h.skills.mAtk), mDef: s(h.skills.mDef),
    }));

  return {
    counts,
    tech,
    heroes,
    /** Çıkma ihtimali oyuncunun TÜM şehirlerinin tapınak toplamına bakıyor — alanın tarifi bu. */
    temple: s(temple.templeTotal),
    heroCount: s(temple.heroCount),
    vision: s(city.techs['night_vision']),
  };
}

/** Casusluk raporundaki kahraman satırı (`gatherIntel`, `armyCounts` kademesi). */
export interface SpyHero { name: string; level: number; skills?: HeroSkills }

/**
 * ⭐ CASUSLUK İSTİHBARATI → savunan sütunu. Kademeye göre ne varsa o yazılır.
 *
 * ⚠️ **Bilinmeyen alan BOŞ bırakılır, uydurulmaz.** Özellikle fark = 2'de yalnız kahraman
 * SAYISI biliniyor; seviye ve yetenekler bilinmiyor. O kademede kahraman satırı yazmıyoruz —
 * beş tane sıfır seviye satır uydurmak simülatöre yalan veri basmak olurdu. Sayı ayrı bir
 * alana (`heroCount`) gidiyor ve yalnız kahraman çıkma ihtimalini besliyor, savaşa girmiyor.
 * ⚠️ Rakibin Tapınak toplamı casusluk yükünde YOK → `temple` hiç yazılmıyor.
 */
export function sideFromIntel(intel: Record<string, unknown>): SidePrefill {
  const counts: Record<string, string> = {};
  const warriors = intel['warriors'] as Record<string, number> | undefined;
  const defenses = intel['defenses'] as Record<string, number> | undefined;
  const structures = intel['structures'] as Record<string, number> | undefined;

  for (const [id, n] of Object.entries(warriors ?? {})) {
    if (WARRIOR_IDS.has(id)) counts[id] = s(n);
  }
  for (const [id, n] of Object.entries(defenses ?? {})) {
    if (DEFENSE_IDS.has(id)) counts[id] = s(n);
  }
  /**
   * ⚠️ Sur ve Büyü Kalkanı `gatherIntel`te `defenses`ten AYIKLANIYOR (adet değil seviye
   * taşıdıkları için "toplam savunma ünitesi"ne girmemeleri gerekiyordu) ve ayrı bir
   * `structures` kaydına yazılıyorlar. Simülatörde ise ikisi de aynı `counts` tablosunda,
   * seviye olarak. Birleştirme burada yapılıyor.
   */
  if (structures) {
    for (const id of ['wall', 'magic_shield'] as const) {
      const lv = Number(structures[id] ?? 0);
      if (lv > 0) counts[id] = String(lv);
    }
  }

  const tech: Record<string, string> = {};
  const techs = intel['techs'] as Record<string, number> | undefined;
  for (const [id, lv] of Object.entries(techs ?? {})) {
    if (TECH_IDS.has(id)) tech[id] = s(lv);
  }

  const heroes = (intel['heroes'] as SpyHero[] | undefined)?.slice(0, 5).map((h) => ({
    level: s(h.level),
    fAtk: s(h.skills?.fAtk), fDef: s(h.skills?.fDef),
    mAtk: s(h.skills?.mAtk), mDef: s(h.skills?.mDef),
  }));

  const heroCount = intel['heroCount'];

  return {
    counts,
    tech,
    ...(heroes ? { heroes } : {}),
    ...(typeof heroCount === 'number' ? { heroCount: s(heroCount) } : {}),
    vision: s(techs?.['night_vision']),
  };
}

/**
 * Casusluk raporu simülatöre aktarılabilecek kadar veri taşıyor mu? Pratikte **fark ≥ 2**.
 *
 * ⚠️ Altındaki kademelerde düşman ordusu hakkında tek bir sayı bile yok (yalnız toplamlar var
 * ve onlar birim başına dağıtılamaz). Düğme orada da çizilseydi yalnız oyuncunun KENDİ tarafını
 * doldurup "aktardım" demiş olurdu.
 */
export function intelIsTransferable(intel: Record<string, unknown>): boolean {
  return intel['warriors'] != null || intel['defenses'] != null
    || intel['heroes'] != null || typeof intel['heroCount'] === 'number';
}
