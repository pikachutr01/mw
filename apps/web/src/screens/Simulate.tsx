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
  seed: string;
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

/** Yetenek toplamı `3 × seviye`yi aşamaz (`contracts/simulate.ts`). Sunucu da reddediyor. */
const heroSpent = (h: HeroRow): number => num(h.fAtk) + num(h.fDef) + num(h.mAtk) + num(h.mDef);
const heroBudget = (h: HeroRow): number => num(h.level) * HERO_POINTS_PER_LEVEL;

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

  const atkCounts = toCounts(counts.attacker);
  const defCounts = toCounts(counts.defender);
  const ready = Object.keys(atkCounts).length > 0 && Object.keys(defCounts).length > 0;
  const overspent = [...heroes.attacker, ...heroes.defender].some((h) => heroSpent(h) > heroBudget(h));

  const view = results?.[Math.min(shown, results.length - 1)] ?? null;

  const sidePayload = (s: Side): Record<string, unknown> => ({
    counts: toCounts(counts[s]),
    tech: Object.fromEntries(
      COMBAT_TECHS.filter((t) => !(s === 'attacker' && DEFENDER_ONLY_TECH.has(t.id)))
        .map((t) => [t.id, num(tech[s][t.id])]),
    ),
    heroes: heroes[s].map((h) => ({
      level: num(h.level), fAtk: num(h.fAtk), fDef: num(h.fDef), mAtk: num(h.mAtk), mDef: num(h.mDef),
    })),
    temple: num(temple[s]),
    heroCount: num(heroCount[s]),
  });

  const run = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ results: SimResult[] }>('/api/v1/simulate', {
        method: 'POST',
        body: {
          attacker: sidePayload('attacker'),
          defender: sidePayload('defender'),
          night,
          nightVisionAttacker: num(vision.attacker),
          nightVisionDefender: num(vision.defender),
          repeat: Math.min(50, Math.max(1, num(repeat) || 1)),
        },
      });
      setResults(r.results);
      setShown(0);
    } catch (err) {
      setError(err);
      setResults(null);
    } finally {
      setBusy(false);
    }
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
                    <td className="px-3 py-1 text-ink">{t.name.tr}</td>
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
            <div className="flex flex-wrap items-center gap-4 px-3 py-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)}
                  className="h-4 w-4 accent-[var(--mw-color-accent)]" />
                Gece savaşı
              </label>
              <label className="flex items-center gap-2 text-muted">
                Gece Görüş · saldıran
                <AmountInput min={0} placeholder="0" value={vision.attacker} disabled={!night}
                  onChange={(e) => setVision((p) => ({ ...p, attacker: e.target.value }))} />
              </label>
              <label className="flex items-center gap-2 text-muted">
                savunan
                <AmountInput min={0} placeholder="0" value={vision.defender} disabled={!night}
                  onChange={(e) => setVision((p) => ({ ...p, defender: e.target.value }))} />
              </label>
            </div>
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
          <Button disabled={!ready || overspent || busy} onClick={() => void run()}>
            {busy ? 'Hesaplanıyor…' : 'Savaştır'}
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted">
            Tekrar
            <AmountInput min={1} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </label>
          <Button variant="ghost" size="sm" onClick={clearAll}>Temizle</Button>
          {!ready ? <span className="text-xs text-muted">İki tarafa da en az bir birim yaz.</span> : null}
          {overspent ? (
            <span className="text-xs text-danger">
              Bir kahramanın yetenek toplamı seviyesinin izin verdiğini aşıyor.
            </span>
          ) : null}
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
              Kahraman eklenmedi. Savaş kahramansız çevrilir.
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
        <Stat k="Enkaz altını" v={fmt(r.debris.gold)} />
        <Stat k="Enkaz yemeği" v={fmt(r.debris.food)} />
        <Stat k="Deneyim" v={fmt(r.xp)} />
        <Stat k="Kahraman çıkma" v={`%${r.captureChance.toFixed(2)}`} />
        <Stat k="Taşıma kapasitesi" v={fmt(r.attackerCarryCapacity)} />
        {r.defender.wallIntegrity != null
          ? <Stat k="Sur bütünlüğü" v={`%${(r.defender.wallIntegrity * 100).toFixed(1)}`} /> : null}
        {r.defender.shieldIntegrity != null
          ? <Stat k="Kalkan bütünlüğü" v={`%${(r.defender.shieldIntegrity * 100).toFixed(1)}`} /> : null}
      </div>

      <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
        Birim birim kalanlar yukarıdaki tabloların <b>Kalan</b> sütunlarında.
        {/* Seed olmadan aynı savaşı bir daha oynatmanın yolu yok. */}
        <span className="tnum ml-2">seed {r.seed}</span>
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
