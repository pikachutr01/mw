/**
 * ⭐ SAVAŞ SİMÜLATÖRÜ — binary simülatörün (`Mobiwar Simulator v0.5.5`) tam karşılığı.
 *
 * ⚠️ İlk sürüm (2026-08-01) yalnız birim adetlerini soruyordu; teknikler, kahramanlar, tapınak
 * ve gece görüşü **sözleşmede vardı ama forma konmamıştı** (`contracts/simulate.ts`). Kullanıcı
 * haklı olarak eksik buldu: teknik seviyesi savaşın sonucunu birimlerden daha çok değiştiriyor,
 * kahramanı olmayan bir simülasyon da gerçek savaşı temsil etmiyor. Bu sürüm sözleşmenin
 * TAMAMINI kullanıyor.
 *
 * Düzen binary aracın düzeni: solda savaşçılar (girdi + KALAN), ortada kahramanlar + gece,
 * sağda teknikler, altta savunma yapıları ve sonuç.
 *
 * ⚠️ **Kalan sütunu asıl çıktıdır.** Kullanıcı: *"Her savaşçıdan ayrı ayrı kaç tane kaldığını
 * göremiyoruz."* Motor `SideResult.counts` ile bunu zaten döndürüyordu, ekran basmıyordu.
 */
import { useState } from 'react';
import {
  TECHS, TECH_ORDER, UNITS, WARRIOR_ORDER, DEFENSE_ORDER, orderBy,
} from '@mobiwar/catalog';
import { HERO_POINTS_PER_LEVEL } from '@mobiwar/contracts';
import { api } from '../lib/api.ts';
import { fmt } from '../lib/hooks.ts';
import { AmountInput, Button, CatalogIcon, ErrorBox, Panel } from '../components/ui.tsx';

type Side = 'attacker' | 'defender';
type Counts = Record<string, string>;
/** Kahraman satırı — dördü yetenek, biri seviye. Metin tutulur, gönderirken sayıya çevrilir. */
interface HeroRow { level: string; fAtk: string; fDef: string; mAtk: string; mDef: string }

interface SimSide {
  alive: number;
  lost: number;
  counts: Record<string, number>;
  floorRestored: Record<string, number>;
  heroes: { level: number; durum: number; alive: boolean }[];
  wallIntegrity: number | null;
  shieldIntegrity: number | null;
}
interface SimResult {
  winner: Side | 'draw';
  turns: number;
  /** Motorun kullandığı 32-bit seed (`hashSeed` çıktısı). Ekranda gösterilmiyor. */
  seed: number;
  attacker: SimSide;
  defender: SimSide;
  debris: { gold: number; food: number };
  xp: number;
  captureChance: number;
  attackerCarryCapacity: number;
}

const WARRIORS = orderBy(UNITS.filter((u) => u.kind === 'warrior'), WARRIOR_ORDER);
/**
 * ⚠️ Sur ve Büyü Kalkanı burada SEVİYE taşır (adet değil) — `LEVEL_BASED` kuralı simülatörde de
 * geçerli. Tapınak listede YOK: savaş yapısı değil, ayrı bir alanda kahraman ihtimalini besliyor.
 */
const DEFENSES = orderBy(UNITS.filter((u) => u.kind === 'defense' && u.id !== 'temple'), DEFENSE_ORDER);
/** Savaş statına dokunan teknikler; `stat: null` olanlar (Casusluk, Haritacılık…) savaşa girmez. */
const COMBAT_TECHS = orderBy(TECHS.filter((t) => t.stat !== null), TECH_ORDER);
/**
 * ⚠️ Taş Ustalığı yalnız SAVUNMA yapılarını ölçekliyor (`techs.ts:52` — Okçu Kulesi, Mangonel,
 * Balista, Sur). Saldıranda yazılabilir olsaydı hiçbir etkisi olmayan bir kutu olurdu; binary
 * araç da o hücreyi çizgiyle geçiyor.
 */
const DEFENDER_ONLY_TECH = new Set(['masonry']);

const LEVEL_BASED = new Set(['wall', 'magic_shield']);

const num = (s: string | undefined): number => Math.max(0, Number(s) || 0);

/** `{ dwarf: '100' }` → `{ dwarf: 100 }`; boş ve sıfır satırlar düşer. */
const toCounts = (c: Counts): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [id, raw] of Object.entries(c)) {
    const n = num(raw);
    if (n > 0) out[id] = n;
  }
  return out;
};

const emptyHero = (): HeroRow => ({ level: '', fAtk: '', fDef: '', mAtk: '', mDef: '' });

/**
 * Tablo içi sayı kutusu. `AmountInput` 5rem sabit genişlikte — form satırları için doğru ama
 * burada 7 sütunlu tabloyu taşırıyor; hücreye yayılan bir sürüm gerekiyor.
 */
function NumCell(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <AmountInput {...props} style={{ width: '100%', minWidth: '2.5rem' }} />;
}

/**
 * Yetenek sayacı. Oyunda dağıtılabilecek puan `3 × seviye` ile sınırlı
 * (`hero.controller.ts:161`), ama **simülatörde aşım serbest** (kullanıcı, 2026-08-02):
 * burası "ya şöyle olsaydı" sorularının yeri. Aşım kırmızı gösterilir, engellenmez.
 */
const heroSpent = (h: HeroRow): number => num(h.fAtk) + num(h.fDef) + num(h.mAtk) + num(h.mDef);
const heroBudget = (h: HeroRow): number => num(h.level) * HERO_POINTS_PER_LEVEL;

/* ── Son savaşın cihazda saklanması ──────────────────────────────────────────── */

const LAST_KEY = 'mw-sim-last';

/**
 * ⭐ SON SAVAŞ (kullanıcı, 2026-08-02): seed ekranda **gösterilmez**, cihaza kaydedilir.
 * «Son savaşı yükle» girdileri kutulara geri doldurur ve **aynı seed'le** koşturur → birebir
 * aynı sonuç. Ardından «Savaştır»a basılırsa yeniden rastgele seed üretilir.
 *
 * ⚠️ **Seed'i istemci üretir.** Sunucu kendi ürettiğinde `repeat > 1` için `${seed}:${i}`
 * türetiyor (`simulate.controller.ts:40-43`); dönen tek sayı bir SETİ tekrar oynatmaya
 * yetmezdi. Taban seed'i biz gönderirsek sunucu aynı türetmeyi yapar ve set birebir tekrarlanır.
 */
interface LastRun {
  v: 1;
  seed: string;
  repeat: string;
  night: boolean;
  counts: Record<Side, Counts>;
  tech: Record<Side, Counts>;
  heroes: Record<Side, HeroRow[]>;
  temple: Record<Side, string>;
  heroCount: Record<Side, string>;
  vision: Record<Side, string>;
}

const isCounts = (v: unknown): v is Counts =>
  typeof v === 'object' && v !== null && Object.values(v).every((x) => typeof x === 'string');
const isSided = (v: unknown, inner: (x: unknown) => boolean): boolean =>
  typeof v === 'object' && v !== null
  && inner((v as Record<string, unknown>)['attacker'])
  && inner((v as Record<string, unknown>)['defender']);

/**
 * ⚠️ `localStorage` **elle düzenlenebilir**; şemaya güvenilmez. Bozuk kayıt sessizce yok
 * sayılır — kullanıcıyı ilgilendirmeyen bir hata için ekranı çökertmenin anlamı yok.
 */
function readLast(): LastRun | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (d['v'] !== 1 || typeof d['seed'] !== 'string' || typeof d['repeat'] !== 'string') return null;
    if (typeof d['night'] !== 'boolean') return null;
    if (!isSided(d['counts'], isCounts) || !isSided(d['tech'], isCounts)) return null;
    if (!isSided(d['temple'], (x) => typeof x === 'string')) return null;
    if (!isSided(d['heroCount'], (x) => typeof x === 'string')) return null;
    if (!isSided(d['vision'], (x) => typeof x === 'string')) return null;
    if (!isSided(d['heroes'], (x) => Array.isArray(x))) return null;
    return d as unknown as LastRun;
  } catch {
    return null;
  }
}

export function Simulate(): React.ReactElement {
  const [counts, setCounts] = useState<Record<Side, Counts>>({ attacker: {}, defender: {} });
  const [tech, setTech] = useState<Record<Side, Counts>>({ attacker: {}, defender: {} });
  const [heroes, setHeroes] = useState<Record<Side, HeroRow[]>>({ attacker: [], defender: [] });
  const [temple, setTemple] = useState<Record<Side, string>>({ attacker: '', defender: '' });
  const [heroCount, setHeroCount] = useState<Record<Side, string>>({ attacker: '', defender: '' });
  const [night, setNight] = useState(false);
  const [vision, setVision] = useState<Record<Side, string>>({ attacker: '', defender: '' });
  const [repeat, setRepeat] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [results, setResults] = useState<SimResult[] | null>(null);
  /** Hangi koşunun ayrıntısı «Kalan» sütunlarında gösteriliyor — çoklu koşuda gerekli. */
  const [shown, setShown] = useState(0);

  /** Kayıt yalnız ilk çizimde okunur; sonrasında `run()` kendi güncelliyor. */
  const [hasLast, setHasLast] = useState(() => readLast() != null);

  const atkCounts = toCounts(counts.attacker);
  const defCounts = toCounts(counts.defender);
  const ready = Object.keys(atkCounts).length > 0 && Object.keys(defCounts).length > 0;

  const view = results?.[Math.min(shown, results.length - 1)] ?? null;

  /** Formun o andaki tam fotoğrafı — `run()` durumdan değil bundan besleniyor (aşağıya bak). */
  const snapshot = (): Omit<LastRun, 'v' | 'seed'> =>
    ({ repeat, night, counts, tech, heroes, temple, heroCount, vision });

  const sidePayload = (snap: Omit<LastRun, 'v' | 'seed'>, s: Side): Record<string, unknown> => ({
    counts: toCounts(snap.counts[s]),
    tech: Object.fromEntries(
      COMBAT_TECHS.filter((t) => !(s === 'attacker' && DEFENDER_ONLY_TECH.has(t.id)))
        .map((t) => [t.id, num(snap.tech[s][t.id])]),
    ),
    heroes: snap.heroes[s].map((h) => ({
      level: num(h.level), fAtk: num(h.fAtk), fDef: num(h.fDef), mAtk: num(h.mAtk), mDef: num(h.mDef),
    })),
    temple: num(snap.temple[s]),
    heroCount: num(snap.heroCount[s]),
  });

  /**
   * ⚠️ `run()` React durumunu OKUMAZ, kendisine verilen fotoğrafı kullanır. Sebep «Son savaşı
   * yükle»: `setCounts(...)` ve arkadaşları asenkron; hemen ardından durumdan okuyan bir
   * `run()` **eski** değerlerle koşardı. Fotoğrafı parametre yapmak bu yarışı tamamen kaldırıyor.
   */
  const run = async (snap: Omit<LastRun, 'v' | 'seed'>, seed: string): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ results: SimResult[] }>('/api/v1/simulate', {
        method: 'POST',
        body: {
          attacker: sidePayload(snap, 'attacker'),
          defender: sidePayload(snap, 'defender'),
          night: snap.night,
          nightVisionAttacker: num(snap.vision.attacker),
          nightVisionDefender: num(snap.vision.defender),
          repeat: Math.min(50, Math.max(1, num(snap.repeat) || 1)),
          seed,
        },
      });
      setResults(r.results);
      setShown(0);
      // Seed ekranda yok ama cihazda duruyor — aynı savaşı tekrar oynatmanın tek yolu.
      localStorage.setItem(LAST_KEY, JSON.stringify({ v: 1, seed, ...snap } satisfies LastRun));
      setHasLast(true);
    } catch (err) {
      setError(err);
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  /** Her «Savaştır» yeni bir zar demek; taban seed'i istemci üretiyor (bkz. `LastRun`). */
  const fight = (): void =>
    void run(snapshot(), `sim-${Date.now()}-${Math.trunc(Math.random() * 1e9)}`);

  /** Kayıtlı girdileri kutulara geri doldurur ve AYNI seed'le koşturur → birebir aynı sonuç. */
  const replayLast = (): void => {
    const last = readLast();
    if (!last) { setHasLast(false); return; }
    setRepeat(last.repeat);
    setNight(last.night);
    setCounts(last.counts);
    setTech(last.tech);
    setHeroes(last.heroes);
    setTemple(last.temple);
    setHeroCount(last.heroCount);
    setVision(last.vision);
    const { v: _v, seed, ...snap } = last;
    void run(snap, seed);
  };

  const clearAll = (): void => {
    setCounts({ attacker: {}, defender: {} });
    setTech({ attacker: {}, defender: {} });
    setHeroes({ attacker: [], defender: [] });
    setTemple({ attacker: '', defender: '' });
    setHeroCount({ attacker: '', defender: '' });
    setVision({ attacker: '', defender: '' });
    setNight(false);
    setResults(null);
  };

  const setCount = (s: Side, id: string, v: string): void =>
    setCounts((p) => ({ ...p, [s]: { ...p[s], [id]: v } }));
  const setTechLevel = (s: Side, id: string, v: string): void =>
    setTech((p) => ({ ...p, [s]: { ...p[s], [id]: v } }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
        {/* ── SAVAŞÇILAR: girdi + KALAN, binary aracın ana tablosu ─────────────── */}
        <Panel title="Savaşçılar" right={view ? `${view.turns} tur` : undefined}>
          <UnitTable units={WARRIORS} counts={counts} onCount={setCount} view={view} bothSides />
        </Panel>

        <div className="space-y-3">
          {/* ── TEKNİKLER ──────────────────────────────────────────────────────── */}
          <Panel title="Teknikler">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted">
                  <th className="px-3 py-1 text-left font-medium">Teknik</th>
                  <th className="w-20 py-1 text-center font-medium">Saldıran</th>
                  <th className="w-20 py-1 pr-3 text-center font-medium">Savunan</th>
                </tr>
              </thead>
              <tbody>
                {COMBAT_TECHS.map((t, i) => (
                  <tr key={t.id} className={i % 2 === 1 ? 'bg-row-alt' : ''}>
                    <td className="px-3 py-1 text-ink">
                      {/* Sanat zaten var (`assets/techs/`), Akademi de aynısını çiziyor. */}
                      <span className="flex items-center gap-2">
                        <CatalogIcon kind="techs" id={t.id} alt="" size={22} />
                        <span className="truncate">{t.name.tr}</span>
                      </span>
                    </td>
                    <td className="py-1 text-center">
                      {DEFENDER_ONLY_TECH.has(t.id) ? (
                        /* Yalnız savunma yapılarını etkiliyor → saldırandaki kutu yanıltıcı olurdu. */
                        <span className="text-muted">–</span>
                      ) : (
                        <NumCell min={0} placeholder="0" value={tech.attacker[t.id] ?? ''}
                          onChange={(e) => setTechLevel('attacker', t.id, e.target.value)} />
                      )}
                    </td>
                    <td className="py-1 pr-3 text-center">
                      <NumCell min={0} placeholder="0" value={tech.defender[t.id] ?? ''}
                        onChange={(e) => setTechLevel('defender', t.id, e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {/* ── GECE SAVAŞI ────────────────────────────────────────────────────── */}
          <Panel title="Gece savaşı">
            <label className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm">
              <input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)}
                className="h-4 w-4 accent-[var(--mw-color-accent)]" />
              Gece savaşı
            </label>
            {/* ⚠️ Teknikler tablosuyla AYNI sütun düzeni: etiket solda, Saldıran/Savunan aynı
                hizada. Eskiden üçü tek satırda akıyordu ve «Gece Görüş» yazısı saldıran
                kutusunun yanına yapışıyordu. */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted">
                  <th className="px-3 py-1 text-left font-medium">Teknik</th>
                  <th className="w-20 py-1 text-center font-medium">Saldıran</th>
                  <th className="w-20 py-1 pr-3 text-center font-medium">Savunan</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-1 text-ink">
                    <span className="flex items-center gap-2">
                      <CatalogIcon kind="techs" id="night_vision" alt="" size={22} />
                      <span className="truncate">Gece Görüş</span>
                    </span>
                  </td>
                  {(['attacker', 'defender'] as const).map((s) => (
                    <td key={s} className={`py-1 text-center ${s === 'defender' ? 'pr-3' : ''}`}>
                      <NumCell min={0} placeholder="0" value={vision[s]} disabled={!night}
                        onChange={(e) => setVision((p) => ({ ...p, [s]: e.target.value }))} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </Panel>
        </div>
      </div>

      {/* ── KAHRAMANLAR ────────────────────────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {(['attacker', 'defender'] as const).map((s) => (
          <HeroPanel key={s} side={s}
            rows={heroes[s]}
            onRows={(rows) => setHeroes((p) => ({ ...p, [s]: rows }))}
            temple={temple[s]} onTemple={(v) => setTemple((p) => ({ ...p, [s]: v }))}
            heroCount={heroCount[s]} onHeroCount={(v) => setHeroCount((p) => ({ ...p, [s]: v }))}
            result={view ? view[s].heroes : null} />
        ))}
      </div>

      {/* ── SAVUNMA YAPILARI (yalnız savunan) ──────────────────────────────────── */}
      <Panel title="Savunma yapıları" right="yalnız savunan">
        <UnitTable units={DEFENSES} counts={counts} onCount={setCount} view={view} bothSides={false} />
      </Panel>

      {/* ── ÇALIŞTIR ───────────────────────────────────────────────────────────── */}
      <Panel title="Savaştır">
        <div className="flex flex-wrap items-center gap-3 p-3">
          {/* ⚠️ Kahraman puan aşımı burayı KİLİTLEMEZ (kullanıcı, 2026-08-02): aşım kahraman
              satırında kırmızı `40/30` olarak görünür, ama savaş yine çevrilir. */}
          <Button disabled={!ready || busy} onClick={fight}>
            {busy ? 'Hesaplanıyor…' : 'Savaştır'}
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted">
            Tekrar
            <AmountInput min={1} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </label>
          {/* Kayıt yoksa düğme hiç çizilmiyor — pasif bir düğme "burada bir şey eksik" der. */}
          {hasLast ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={replayLast}>
              Son savaşı yükle
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={clearAll}>Temizle</Button>
          {!ready ? <span className="text-xs text-muted">İki tarafa da en az bir birim yaz.</span> : null}
        </div>
        <div className="px-3 pb-3"><ErrorBox error={error} /></div>
      </Panel>

      {/* ── SONUÇ ──────────────────────────────────────────────────────────────── */}
      {results && view ? (
        <ResultPanel results={results} shown={Math.min(shown, results.length - 1)} onShow={setShown} />
      ) : null}
    </div>
  );
}

/* ── Birim tablosu: ad · saldıran · kalan · savunan · kalan ──────────────────── */

function UnitTable({
  units, counts, onCount, view, bothSides,
}: {
  units: typeof UNITS[number][];
  counts: Record<Side, Counts>;
  onCount: (s: Side, id: string, v: string) => void;
  view: SimResult | null;
  /** Savunma yapıları yalnız savunanda bulunur → saldıran sütunları çizilmez. */
  bothSides: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] text-muted">
            <th className="px-3 py-1 text-left font-medium">Ünite</th>
            {bothSides ? <th className="w-20 py-1 text-center font-medium">Saldıran</th> : null}
            {bothSides ? <th className="w-16 py-1 text-center font-medium">Kalan</th> : null}
            <th className="w-20 py-1 text-center font-medium">Savunan</th>
            <th className="w-16 py-1 pr-3 text-center font-medium">Kalan</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u, i) => (
            <tr key={u.id} className={i % 2 === 1 ? 'bg-row-alt' : ''}>
              <td className="px-3 py-1">
                <span className="flex items-center gap-2">
                  <CatalogIcon kind={u.kind === 'warrior' ? 'units' : 'defenses'} id={u.id}
                    alt="" size={22} />
                  <span className="truncate text-ink">{u.name.tr}</span>
                  {LEVEL_BASED.has(u.id) ? <span className="text-[10px] text-muted">sv</span> : null}
                </span>
              </td>
              {bothSides ? (
                <>
                  <td className="py-1 text-center">
                    <NumCell min={0} placeholder="0" value={counts.attacker[u.id] ?? ''}
                      onChange={(e) => onCount('attacker', u.id, e.target.value)} />
                  </td>
                  <Remaining id={u.id} side="attacker" counts={counts} view={view} />
                </>
              ) : null}
              <td className="py-1 text-center">
                <NumCell min={0} placeholder="0" value={counts.defender[u.id] ?? ''}
                  onChange={(e) => onCount('defender', u.id, e.target.value)} />
              </td>
              <Remaining id={u.id} side="defender" counts={counts} view={view} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Tek hücre: savaştan sonra bu birimden kaç tane kaldı.
 *
 * ⚠️ Sur ve Büyü Kalkanı ADET değil BÜTÜNLÜK raporlar (seviyeleri düşmez, savaş sonrası
 * onarılırlar) — motor da onları `wallIntegrity`/`shieldIntegrity` ile ayrı döndürüyor.
 */
function Remaining({ id, side, counts, view }: {
  id: string; side: Side; counts: Record<Side, Counts>; view: SimResult | null;
}) {
  if (!view) return <td className="py-1 pr-3 text-center text-muted">–</td>;
  const before = num(counts[side][id]);
  const r = view[side];

  if (LEVEL_BASED.has(id)) {
    const integrity = id === 'wall' ? r.wallIntegrity : r.shieldIntegrity;
    if (before <= 0 || integrity == null) return <td className="py-1 pr-3 text-center text-muted">–</td>;
    const pct = Math.round(integrity * 1000) / 10;
    return (
      <td className={`tnum py-1 pr-3 text-center ${pct <= 0 ? 'text-danger' : 'text-ink'}`}>
        %{pct}
      </td>
    );
  }

  const left = r.counts[id] ?? 0;
  const restored = r.floorRestored?.[id] ?? 0;
  if (before <= 0) return <td className="py-1 pr-3 text-center text-muted">–</td>;
  return (
    <td className={`tnum py-1 pr-3 text-center ${left <= 0 ? 'text-danger' : 'text-ink'}`}>
      {fmt(left)}
      {/* Savunma tabanının geri getirdiği birimler: "neden beklediğimden çok kaldı" sorusunun cevabı. */}
      {restored > 0 ? <span className="ml-1 text-[10px] text-success">+{fmt(restored)}</span> : null}
    </td>
  );
}

/* ── Kahraman paneli ────────────────────────────────────────────────────────── */

function HeroPanel({
  side, rows, onRows, temple, onTemple, heroCount, onHeroCount, result,
}: {
  side: Side;
  rows: HeroRow[];
  onRows: (r: HeroRow[]) => void;
  temple: string;
  onTemple: (v: string) => void;
  heroCount: string;
  onHeroCount: (v: string) => void;
  result: { level: number; durum: number; alive: boolean }[] | null;
}) {
  const title = side === 'attacker' ? 'Saldıran kahramanları' : 'Savunan kahramanları';
  const set = (i: number, k: keyof HeroRow, v: string): void =>
    onRows(rows.map((h, j) => (j === i ? { ...h, [k]: v } : h)));

  return (
    <Panel title={title} right={`${rows.length}/5`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] text-muted">
            <th className="px-3 py-1 text-left font-medium">Kahraman</th>
            <th className="w-14 py-1 text-center font-medium">Sv</th>
            <th className="w-14 py-1 text-center font-medium" title="Fiziksel saldırı">F.Sld</th>
            <th className="w-14 py-1 text-center font-medium" title="Fiziksel savunma">F.Svn</th>
            <th className="w-14 py-1 text-center font-medium" title="Büyü saldırı">B.Sld</th>
            <th className="w-14 py-1 text-center font-medium" title="Büyü savunma">B.Svn</th>
            <th className="w-24 py-1 pr-3 text-center font-medium">Durum</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-3 text-center text-muted">
              Kahraman eklenmedi.
            </td></tr>
          ) : rows.map((h, i) => {
            const spent = heroSpent(h);
            const budget = heroBudget(h);
            const over = spent > budget;
            const r = result?.[i];
            return (
              <tr key={i} className={i % 2 === 1 ? 'bg-row-alt' : ''}>
                <td className="px-3 py-1 text-ink">
                  Kahraman {i + 1}
                  {/* Puan sayacı: kural "toplam ≤ 3 × seviye" ve sunucu bunu reddediyor. */}
                  <span className={`ml-1.5 text-[10px] ${over ? 'text-danger' : 'text-muted'}`}>
                    {spent}/{budget}
                  </span>
                </td>
                {(['level', 'fAtk', 'fDef', 'mAtk', 'mDef'] as const).map((k) => (
                  <td key={k} className="py-1 text-center">
                    <NumCell min={0} placeholder="0" value={h[k]}
                      onChange={(e) => set(i, k, e.target.value)} />
                  </td>
                ))}
                <td className="tnum py-1 pr-3 text-center">
                  {r == null ? <span className="text-muted">–</span>
                    : r.alive ? <span className="text-ink">%{r.durum.toFixed(1)}</span>
                      : <span className="text-danger">Yok Edildi</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-sm">
        <Button size="sm" variant="ghost" disabled={rows.length >= 5}
          onClick={() => onRows([...rows, emptyHero()])}>+ Kahraman</Button>
        <Button size="sm" variant="ghost" disabled={rows.length === 0}
          onClick={() => onRows(rows.slice(0, -1))}>− Kahraman</Button>
      </div>

      {/* ⭐ Kahraman ÇIKMA ihtimalinin iki girdisi. Savaşa katılmazlar, yalnız ihtimali belirler. */}
      <div className="flex flex-wrap items-center gap-4 border-t border-border px-3 py-2 text-sm">
        <label className="flex items-center gap-2 text-muted">
          Tapınak toplamı
          <AmountInput min={0} placeholder="0" value={temple}
            onChange={(e) => onTemple(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-muted">
          Mevcut kahraman
          <AmountInput min={0} placeholder="0" value={heroCount}
            onChange={(e) => onHeroCount(e.target.value)} />
        </label>
      </div>
      <p className="px-3 pb-2 text-[11px] text-muted">
        Tapınak toplamı = <b>tüm şehirlerindeki</b> tapınak seviyelerinin toplamı. Mevcut kahraman
        sayısı ihtimali düşürür. İkisi yalnız <b>kazanan</b> tarafta işler.
      </p>
    </Panel>
  );
}

/* ── Sonuç ───────────────────────────────────────────────────────────────────── */

function ResultPanel({ results, shown, onShow }: {
  results: SimResult[]; shown: number; onShow: (i: number) => void;
}) {
  const r = results[shown]!;
  const label = r.winner === 'attacker' ? 'Saldıran kazandı'
    : r.winner === 'defender' ? 'Savunan kazandı' : 'Berabere';
  const tone = r.winner === 'attacker' ? 'text-success'
    : r.winner === 'defender' ? 'text-danger' : 'text-muted';

  const spread = results.length > 1 ? {
    atk: results.filter((x) => x.winner === 'attacker').length,
    def: results.filter((x) => x.winner === 'defender').length,
    draw: results.filter((x) => x.winner === 'draw').length,
  } : null;

  return (
    <Panel title="Sonuç" right={results.length > 1 ? `${results.length} koşu` : undefined}>
      {spread ? (
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-3 py-2 text-sm">
          <span className="text-success">Saldıran <b className="tnum">{spread.atk}</b></span>
          <span className="text-danger">Savunan <b className="tnum">{spread.def}</b></span>
          {spread.draw > 0 ? <span className="text-muted">Berabere <b className="tnum">{spread.draw}</b></span> : null}
          <span className="ml-auto flex items-center gap-1 text-xs text-muted">
            Koşu
            <select value={shown} onChange={(e) => onShow(Number(e.target.value))}
              className="rounded-[var(--radius-sm)] border border-border bg-raised px-1.5 py-0.5 text-ink">
              {results.map((_, i) => <option key={i} value={i}>#{i + 1}</option>)}
            </select>
          </span>
        </div>
      ) : null}

      <div className={`display px-3 pt-3 text-center text-lg font-semibold ${tone}`}>{label}</div>

      <div className="grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat k="Süre" v={`${r.turns} tur`} />
        <Stat k="Saldıran kaybı" v={fmt(r.attacker.lost)} tone="danger" />
        <Stat k="Savunan kaybı" v={fmt(r.defender.lost)} tone="danger" />
        <Stat k="Saldırandan kalan" v={fmt(r.attacker.alive)} />
        <Stat k="Savunandan kalan" v={fmt(r.defender.alive)} />
        <Stat k="Savaş ganimeti · altın" v={fmt(r.debris.gold)} />
        <Stat k="Savaş ganimeti · yemek" v={fmt(r.debris.food)} />
        <Stat k="Kahraman için deneyim" v={fmt(r.xp)} />
        <Stat k="Kahraman çıkma" v={`%${r.captureChance.toFixed(2)}`} />
        <Stat k="Taşıma kapasitesi" v={fmt(r.attackerCarryCapacity)} />
        {/* ⚠️ Sur ve Kalkan bütünlüğü BURADA GÖSTERİLMEZ: ikisi de kendi satırlarının «Kalan»
            sütununda yüzde olarak zaten yazıyor, burada tekrar etmek yer israfıydı. */}
      </div>

      {/* ⚠️ Ganimet ayrımı: motor YALNIZ ölen birimlerden çıkan ganimeti hesaplar. Gerçek bir
          savaşta bu değer savunanın şehrindeki kaynakla havuzlanır ve taşınabilen kısmı ayrıca
          hesaplanır (`battle.handlers.ts` → `calculateLoot`) — orası motorun işi değil. */}
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
        Savaş ganimeti, <b>ölen birimlerden</b> çıkan değerdir. Gerçek bir savaşta buna
        savunanın şehrindeki kaynak da eklenir ve taşıma kapasitesi kadarı götürülür.
      </p>
    </Panel>
  );
}

function Stat({ k, v, tone = 'ink' }: { k: string; v: string; tone?: 'ink' | 'danger' }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-raised px-2.5 py-1.5">
      <div className="text-[10px] tracking-wide text-muted uppercase">{k}</div>
      <div className={`tnum text-base font-semibold ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}>
        {v}
      </div>
    </div>
  );
}

export const SimulateScreen = (): React.ReactElement => <Simulate />;
