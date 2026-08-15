/**
 * ⭐ DENGE TEZGÂHI (`/denge`) — oyunun süreyle işleyen HER mekaniği tek ekranda.
 *
 * Sorun şuydu: yapı/teknik/asker/savunma/kahraman ekranları hep **bir sonraki seviyeyi** gösterir
 * ve birbirinden habersizdir. Denge ayarlarken sorulan sorular ise kümülatif ve çapraz —
 * *"sıfırdan Ejderha'ya kaç gün, kaça, kaç puan?"*, *"Mimar Okulu 10 olunca bütün inşaat süreleri
 * ne kadar kısalıyor?"*, *"Baraka 8'e düşünce hangi birimler kapanıyor?"* Bu sayfa onları tek
 * yerde, kaydırıcılarla anlık cevaplıyor.
 *
 * ⚠️ **Hiçbir şeyi DEĞİŞTİRMEZ.** Yalnız okur ve hesaplar; oyuncunun şehrine dokunmaz.
 *
 * ⚠️ Bütün hesap `lib/balance-model.ts`te saf fonksiyonlarda (testleri `test/balance-model.test.ts`).
 * Bu dosya yalnız çizer — ev kuralı: tarayıcı testi altyapısı olmadığı için karar bileşenden
 * ayrı tutulur.
 *
 * ⚠️ Menüye BAĞLI DEĞİL, yalnız adresten ulaşılır (kullanıcı kararı): bir denge/test aracı,
 * oyuncunun günlük akışında yeri yok.
 */
import { useMemo, useState } from 'react';
import { fmt, formatLongDuration } from '../lib/hooks.ts';
import { useBalance } from '../lib/queries.ts';
import {
  EMPTY_STATE, TECH_SLIDER_MAX, acceleratorInfo, castleUsage, caveInfo, heroInfo,
  productionInfo, report, unlockedBy, unmetText, wallInfo,
  type BalanceBundle, type BalanceState, type Row, type Totals,
} from '../lib/balance-model.ts';
import {
  Badge, BoundedAmountInput, Button, CatalogIcon, Empty, ErrorBox, Panel, Res, Slider,
  type CatalogArt,
} from '../components/ui.tsx';

/* ═══ Küçük gösterim parçaları ══════════════════════════════════════════════ */

function Line({ label, gold, food, seconds, points }: {
  label: string; gold: number; food: number; seconds: number; points?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      <span className="w-14 shrink-0">{label}</span>
      <Res kind="gold" value={fmt(gold)} size={14} nativeTitle={false} />
      <Res kind="food" value={fmt(food)} size={14} nativeTitle={false} />
      <span className="tnum">{formatLongDuration(seconds)}</span>
      {points != null ? <span className="tnum text-accent">{fmt(points)} puan</span> : null}
    </div>
  );
}

/** Bir kalemin satırı: kaydırıcı + kesin giriş + maliyet/süre/puan. */
function ItemRow({ row, unit, art, onChange, extra }: {
  row: Row;
  /** Kaydırıcının ne saydığı — «sv» (seviye) ya da «adet». */
  unit: 'sv' | 'adet';
  /** Simgenin hangi klasörden okunacağı (`assets/<art>/<id>.png`). */
  art: CatalogArt;
  onChange: (n: number) => void;
  extra?: React.ReactNode;
}) {
  // Adetli kalemlerde kaydırıcı sonsuza gidemez; pratik bir tavan + kutudan serbest giriş.
  const sliderMax = unit === 'adet' ? 200 : row.max;

  return (
    <div className={`border-b border-border px-3 py-2 last:border-b-0 ${row.locked ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-2">
        <CatalogIcon kind={art} id={row.id} size={22} />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.name}</span>
        <span className="tnum shrink-0 text-xs text-muted">{unit} {fmt(row.n)}</span>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <Slider
          value={Math.min(row.n, sliderMax)}
          min={0}
          max={sliderMax}
          disabled={row.locked}
          label={`${row.name} ${unit === 'sv' ? 'seviyesi' : 'adedi'}`}
          onChange={onChange}
        />
        <BoundedAmountInput
          value={row.n}
          min={0}
          max={unit === 'adet' ? 1_000_000 : row.max}
          onCommit={onChange}
          disabled={row.locked}
          aria-label={`${row.name} sayısı`}
        />
      </div>

      {row.locked ? (
        <div className="mt-1 text-[11px] text-danger">Gerekli: {unmetText(row.unmet)}</div>
      ) : (
        <div className="mt-1 space-y-0.5">
          {row.next ? (
            <Line
              label={unit === 'sv' ? 'Sıradaki' : 'Birim'}
              gold={row.next.gold} food={row.next.food} seconds={row.next.seconds}
            />
          ) : null}
          <Line
            label="Toplam" gold={row.cum.gold} food={row.cum.food}
            seconds={row.cum.seconds} points={row.cum.points}
          />
          {extra}
        </div>
      )}
      {row.budgetBlocked && !row.locked ? (
        <div className="mt-1 text-[11px] text-warning">Kale seviye bütçesi dolu.</div>
      ) : null}
    </div>
  );
}

/** Yapıya özel canlı okuma satırı. */
function Note({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-muted">{children}</div>;
}

function GroupTotal({ label, t }: { label: string; t: Totals }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-strong px-3 py-2 text-xs">
      <span className="font-semibold text-ink">{label}</span>
      <Res kind="gold" value={fmt(t.gold)} size={15} nativeTitle={false} />
      <Res kind="food" value={fmt(t.food)} size={15} nativeTitle={false} />
      <span className="tnum text-muted">{formatLongDuration(t.seconds)}</span>
      <span className="tnum ml-auto font-semibold text-accent">{fmt(t.points)} puan</span>
    </div>
  );
}

/* ═══ Ekran ═════════════════════════════════════════════════════════════════ */

export function BalanceScreen(): React.ReactElement {
  const q = useBalance();
  const [state, setState] = useState<BalanceState>(EMPTY_STATE);

  const set = <K extends 'buildings' | 'techs' | 'units' | 'defenses'>(
    group: K, id: string, n: number,
  ): void => {
    setState((s) => ({ ...s, [group]: { ...s[group], [id]: Math.max(0, Math.trunc(n)) } }));
  };

  const cfg = q.data;
  const r = useMemo(() => (cfg ? report(state, cfg) : null), [state, cfg]);

  if (q.isError) return <Panel title="Denge Tezgâhı"><ErrorBox error={q.error} /></Panel>;
  if (!cfg || !r) return <Panel title="Denge Tezgâhı"><Empty>Yükleniyor…</Empty></Panel>;

  return (
    <div className="space-y-3">
      <Summary cfg={cfg} total={r.total} onReset={() => setState(EMPTY_STATE)} refetching={q.isFetching} />
      <Buildings cfg={cfg} state={state} rows={r.buildings} total={r.groups.buildings} set={set} />
      <Techs cfg={cfg} state={state} rows={r.techs} total={r.groups.techs} set={set} />
      <Warriors rows={r.units} total={r.groups.units} set={set} />
      <Defenses cfg={cfg} state={state} rows={r.defenses} total={r.groups.defenses} set={set} />
      <Hero cfg={cfg} state={state} setState={setState} />
      <Grand total={r.total} />
    </div>
  );
}

/* ── Üst özet (yapışkan) ──────────────────────────────────────────────────── */

function Summary({ cfg, total, onReset, refetching }: {
  cfg: BalanceBundle; total: Totals; onReset: () => void; refetching: boolean;
}) {
  return (
    /* `sticky top-0`: kaydıran kap orta sütun (Shell), sayfa gövdesi değil — bu yüzden çalışır. */
    <div className="sticky top-0 z-10">
      <Panel bare className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="display text-xs font-semibold tracking-wider text-ink uppercase">Toplam</span>
          <Res kind="gold" value={fmt(total.gold)} size={16} nativeTitle={false} />
          <Res kind="food" value={fmt(total.food)} size={16} nativeTitle={false} />
          <span className="tnum text-xs text-muted">{formatLongDuration(total.seconds)}</span>
          <span className="tnum text-sm font-semibold text-accent">{fmt(total.points)} puan</span>
          <Button size="sm" variant="ghost" onClick={onReset} className="ml-auto">Sıfırla</Button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted">
          <span>Denge sürümü {cfg.catalogHash}</span>
          {cfg.revisionId != null ? <span>· ayar #{cfg.revisionId}</span> : null}
          <span>· 1 puan = {fmt(cfg.resourcePerPoint)} kaynak</span>
          {refetching ? <Badge tone="muted">yenileniyor…</Badge> : null}
        </div>
      </Panel>
    </div>
  );
}

/* ── Yapılar ──────────────────────────────────────────────────────────────── */

function Buildings({ cfg, state, rows, total, set }: {
  cfg: BalanceBundle; state: BalanceState; rows: Row[]; total: Totals;
  set: (g: 'buildings', id: string, n: number) => void;
}) {
  const prod = productionInfo(state, cfg);
  const cave = caveInfo(state, cfg);
  const acc = acceleratorInfo(state, cfg);
  const unlocked = unlockedBy(state);
  const budget = castleUsage(state);
  const wall = wallInfo(state, cfg);
  const hero = heroInfo(state, cfg);
  const pct = (x: number): string => `%${Math.round(x * 100)}`;

  const extras: Record<string, React.ReactNode> = {
    castle: <Note>Seviye bütçesi: <b>{budget.used}</b> / {budget.budget} kullanıldı · {budget.free} boş</Note>,
    farm: <Note>Üretim: <b>{fmt(prod.farm.now)}</b>/sa → {fmt(prod.farm.next)}/sa</Note>,
    mine: <Note>Üretim: <b>{fmt(prod.mine.now)}</b>/sa → {fmt(prod.mine.next)}/sa</Note>,
    architect_school: (
      <Note>
        Yapı ve savunma sürelerini <b>{pct(acc.architect.cut)}</b> kısaltıyor
        {' '}(bölen ×{acc.architect.divisor.toFixed(2)}) · kendini hızlandırmaz
      </Note>
    ),
    academy: (
      <Note>
        Teknik sürelerini <b>{pct(acc.academy.cut)}</b> kısaltıyor · açılan teknik:{' '}
        {unlocked.techs.length ? unlocked.techs.join(', ') : '—'}
      </Note>
    ),
    barracks: (
      <Note>
        Savaşçı sürelerini <b>{pct(acc.barracks.cut)}</b> kısaltıyor · eşzamanlı sipariş:{' '}
        {Math.max(1, state.buildings['barracks'] ?? 0)} · açılan birim:{' '}
        {unlocked.units.length ? unlocked.units.join(', ') : '—'}
      </Note>
    ),
    cave: (
      <Note>
        Kapasite <b>{fmt(cave.capacity)}</b> alan · {fmt(cave.load)} alan{' '}
        <b>{formatLongDuration(cave.transferSeconds)}</b>'de dolar/boşalır · onarım{' '}
        {formatLongDuration(cave.repairSeconds)} · {Number.isFinite(cave.dwarves) ? fmt(cave.dwarves) : '∞'} cüce kırar
      </Note>
    ),
    temple: (
      <Note>
        Kahraman sv {hero.level} diriltme: <b>{formatLongDuration(hero.seconds)}</b>
        {' '}(Tapınak kısaltır, bedeli değiştirmez)
      </Note>
    ),
    teleport: <Note>Yeniden kullanım: <b>{formatLongDuration(wall.teleport)}</b></Note>,
  };

  return (
    <Panel title="Yapılar" right={`${fmt(total.points)} puan`}>
      {rows.map((row) => (
        <ItemRow key={row.id} row={row} unit="sv" art="buildings" extra={extras[row.id]}
          onChange={(n) => set('buildings', row.id, n)} />
      ))}
      <GroupTotal label="Yapılar" t={total} />
    </Panel>
  );
}

/* ── Teknikler ────────────────────────────────────────────────────────────── */

function Techs({ rows, total, set }: {
  cfg: BalanceBundle; state: BalanceState; rows: Row[]; total: Totals;
  set: (g: 'techs', id: string, n: number) => void;
}) {
  return (
    <Panel title="Teknikler" right={`${fmt(total.points)} puan`}>
      <div className="px-3 py-1 text-[11px] text-muted">
        Tekniklerde seviye tavanı yok; kaydırıcı {TECH_SLIDER_MAX}'te biter, kutuya daha büyüğü yazılabilir.
      </div>
      {rows.map((row) => (
        <ItemRow key={row.id} row={row} unit="sv" art="techs"
          onChange={(n) => set('techs', row.id, n)} />
      ))}
      <GroupTotal label="Teknikler" t={total} />
    </Panel>
  );
}

/* ── Savaşçılar ───────────────────────────────────────────────────────────── */

function Warriors({ rows, total, set }: {
  rows: Row[]; total: Totals; set: (g: 'units', id: string, n: number) => void;
}) {
  return (
    <Panel title="Savaşçılar" right={`${fmt(total.points)} puan`}>
      {rows.map((row) => (
        <ItemRow key={row.id} row={row} unit="adet" art="units"
          onChange={(n) => set('units', row.id, n)} />
      ))}
      <GroupTotal label="Savaşçılar" t={total} />
    </Panel>
  );
}

/* ── Savunma ──────────────────────────────────────────────────────────────── */

function Defenses({ cfg, state, rows, total, set }: {
  cfg: BalanceBundle; state: BalanceState; rows: Row[]; total: Totals;
  set: (g: 'defenses', id: string, n: number) => void;
}) {
  const wall = wallInfo(state, cfg);
  const extras: Record<string, React.ReactNode> = {
    wall: (
      <Note>
        Savunma alanı: <b>{fmt(wall.used)}</b> / {fmt(wall.capacity)} ·
        {' '}tam yıkımdan onarım <b>{formatLongDuration(wall.repairSeconds)}</b>
      </Note>
    ),
  };
  return (
    <Panel title="Savunma" right={`${fmt(total.points)} puan`}>
      <div className="px-3 py-1 text-[11px] text-muted">
        Sur ve Büyü Kalkanı <b>seviye</b> taşır; diğerleri <b>adet</b>.
      </div>
      {rows.map((row) => (
        <ItemRow key={row.id} row={row} extra={extras[row.id]} art="defenses"
          unit={row.id === 'wall' || row.id === 'magic_shield' ? 'sv' : 'adet'}
          onChange={(n) => set('defenses', row.id, n)} />
      ))}
      <GroupTotal label="Savunma" t={total} />
    </Panel>
  );
}

/* ── Kahraman ─────────────────────────────────────────────────────────────── */

function Hero({ cfg, state, setState }: {
  cfg: BalanceBundle; state: BalanceState;
  setState: React.Dispatch<React.SetStateAction<BalanceState>>;
}) {
  const h = heroInfo(state, cfg);
  return (
    <Panel title="Kahraman">
      <div className="space-y-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-sm text-ink">Kahraman seviyesi</span>
          <span className="tnum text-xs text-muted">sv {h.level}</span>
        </div>
        <div className="flex items-center gap-2">
          <Slider value={Math.min(h.level, 50)} min={0} max={50} label="Kahraman seviyesi"
            onChange={(n) => setState((s) => ({ ...s, heroLevel: n }))} />
          <BoundedAmountInput value={h.level} min={0} max={100} aria-label="Kahraman seviyesi"
            onCommit={(n) => setState((s) => ({ ...s, heroLevel: n }))} />
        </div>
        <Line label="Diriltme" gold={h.cost.gold} food={h.cost.food} seconds={h.seconds} />
        <Note>
          Tapınak sv {h.temple} · sonraki seviye eşiği <b>{fmt(h.xpForNext)}</b> XP ·
          {' '}dağıtılabilir puan <b>{h.points}</b> (seviye başına {cfg.combat.hero.pointsPerLevel})
        </Note>
        {/* ⚠️ Diriltme genel toplama girmiyor: bir TAMİR, edinim değil — tekrar tekrar ödenir
            ve puan da vermez. Toplama katsaydık "bu kurulumun bedeli" yanıltıcı olurdu. */}
        <Note>Diriltme bedeli genel toplama katılmaz (tamir, edinim değil).</Note>
      </div>
    </Panel>
  );
}

/* ── Genel toplam ─────────────────────────────────────────────────────────── */

function Grand({ total }: { total: Totals }) {
  return (
    <Panel title="Genel Toplam">
      <div className="space-y-1 px-3 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Res kind="gold" value={fmt(total.gold)} size={20} nativeTitle={false} />
          <Res kind="food" value={fmt(total.food)} size={20} nativeTitle={false} />
          <span className="tnum text-sm text-muted">{formatLongDuration(total.seconds)}</span>
          <span className="tnum text-lg font-semibold text-accent">{fmt(total.points)} puan</span>
        </div>
        <Note>
          Süre, <b>şu anki hızlandırıcı seviyelerinle</b> sıfırdan buraya gelmenin toplamıdır —
          Mimar Okulu/Akademi/Baraka yolda büyüseydi gerçek süre daha kısa olurdu.
        </Note>
        <Note>Kilitli kalemler (ön-şartı karşılanmayanlar) toplama katılmaz.</Note>
      </div>
    </Panel>
  );
}
