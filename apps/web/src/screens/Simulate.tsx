/**
 * ⭐ SAVAŞ SİMÜLATÖRÜ (kullanıcı: *"Sol menüye simülatör"*, 2026-08-01).
 *
 * `POST /api/v1/simulate` **aylardır çalışıyordu** ama hiçbir ekranı yoktu (`EKSIK_OZELLIKLER`
 * §2: *"Dahili simülatör ekranı — web ekranı yok"*). Bu dosya o boşluğu kapatıyor.
 *
 * ⚠️ **Gerçek savaşla AYNI motor** (`packages/engine`) ve **aynı dünya ayarları**: sunucu
 * `settings.combat(worldId)` geçiriyor. Yani buradaki sonuç bir tahmin değil, o dünyada o
 * ordularla gerçekten olacak şeyin ta kendisi (aynı `seed` ile birebir tekrar edilebilir).
 *
 * ⚠️ Ekran bilerek **sade**: birim adetleri + gece + tekrar. Teknik seviyeleri, kahramanlar ve
 * tapınak alanları sözleşmede var ama forma konmadı — 12 teknik × 2 taraf + 5 kahraman × 4
 * yetenek, ekranı kullanılamaz hâle getirirdi. Oyuncunun ilk sorusu *"bu ordu bu orduyu
 * yener mi"*; teknik/kahraman ayrıntısı sonraki tur.
 */
import { useState } from 'react';
import { UNITS, WARRIOR_ORDER, DEFENSE_ORDER, orderBy } from '@mobiwar/catalog';
import { api } from '../lib/api.ts';
import { fmt } from '../lib/hooks.ts';
import { nameOf } from '../lib/names.ts';
import {
  AmountInput, Button, CatalogIcon, ErrorBox, Panel,
} from '../components/ui.tsx';

type Counts = Record<string, string>;

interface SimSide {
  alive: number;
  lost: number;
  counts: Record<string, number>;
}
interface SimResult {
  winner: 'attacker' | 'defender' | 'draw';
  turns: number;
  seed: string;
  attacker: SimSide;
  defender: SimSide;
}

const WARRIORS = orderBy(UNITS.filter((u) => u.kind === 'warrior'), WARRIOR_ORDER);
/** ⚠️ Sur ve Büyü Kalkanı burada SEVİYE taşır (adet değil) — `LEVEL_BASED` kuralı simülatörde de geçerli. */
const DEFENSES = orderBy(UNITS.filter((u) => u.kind === 'defense'), DEFENSE_ORDER);

/** `{ dwarf: '100' }` → `{ dwarf: 100 }`; boş ve sıfır satırlar düşer. */
const toCounts = (c: Counts): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [id, raw] of Object.entries(c)) {
    const n = Number(raw) || 0;
    if (n > 0) out[id] = n;
  }
  return out;
};

export function Simulate(): React.ReactElement {
  const [atk, setAtk] = useState<Counts>({});
  const [def, setDef] = useState<Counts>({});
  const [night, setNight] = useState(false);
  const [repeat, setRepeat] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [results, setResults] = useState<SimResult[] | null>(null);

  const attackerCounts = toCounts(atk);
  const defenderCounts = toCounts(def);
  const ready = Object.keys(attackerCounts).length > 0 && Object.keys(defenderCounts).length > 0;

  const run = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ results: SimResult[] }>('/api/v1/simulate', {
        method: 'POST',
        body: {
          attacker: { counts: attackerCounts },
          defender: { counts: defenderCounts },
          night,
          repeat,
        },
      });
      setResults(r.results);
    } catch (err) {
      setError(err);
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  /** Tekrarlı koşuda dağılım — tek sonuçta anlamsız, çoklu koşuda asıl cevap. */
  const spread = results && results.length > 1
    ? {
      atk: results.filter((r) => r.winner === 'attacker').length,
      def: results.filter((r) => r.winner === 'defender').length,
      draw: results.filter((r) => r.winner === 'draw').length,
    }
    : null;

  return (
    <div className="space-y-3">
      <Panel title="Savaş Simülatörü">
        <p className="px-3 py-2 text-xs text-muted">
          Gerçek savaşla <strong>aynı motoru</strong> ve bu dünyanın <strong>aynı denge
          ayarlarını</strong> kullanır. Sonuç bir tahmin değil; aynı ordularla gerçekten olacak
          şeydir. Kaynak harcanmaz, hiçbir şey kaydedilmez.
        </p>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2">
        <ArmyPicker title="Saldıran" units={WARRIORS} counts={atk} onChange={setAtk} />
        <ArmyPicker title="Savunan" units={[...WARRIORS, ...DEFENSES]} counts={def} onChange={setDef}
          note="Savunan tarafa savunma birimi de koyabilirsin. Sur ve Büyü Kalkanı'nda yazdığın sayı ADET değil SEVİYEdir." />
      </div>

      <Panel title="Koşul">
        <div className="flex flex-wrap items-center gap-4 p-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)}
              className="h-4 w-4 accent-[var(--mw-color-accent)]" />
            Gece savaşı
          </label>
          <label className="flex items-center gap-2 text-muted">
            Tekrar
            <AmountInput min={1} value={String(repeat)}
              onChange={(e) => setRepeat(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
          </label>
          <span className="text-xs text-muted">
            Birden fazla koşuda her tur farklı bir zar atılır; kazanma dağılımı aşağıda çıkar.
          </span>
        </div>
        <div className="border-t border-border px-3 py-2">
          <Button disabled={!ready || busy} onClick={() => void run()}>
            {busy ? 'Hesaplanıyor…' : 'Savaşı Çevir'}
          </Button>
          {!ready ? (
            <span className="ml-2 text-xs text-muted">İki tarafa da en az bir birim yaz.</span>
          ) : null}
          <ErrorBox error={error} />
        </div>
      </Panel>

      {results ? (
        <Panel title="Sonuç" right={`${results.length} koşu`}>
          {spread ? (
            <div className="flex flex-wrap gap-4 border-b border-border px-3 py-2 text-sm">
              <span className="text-success">Saldıran <b className="tnum">{spread.atk}</b></span>
              <span className="text-danger">Savunan <b className="tnum">{spread.def}</b></span>
              {spread.draw > 0 ? <span className="text-muted">Berabere <b className="tnum">{spread.draw}</b></span> : null}
            </div>
          ) : null}
          <ul className="divide-y divide-border">
            {results.map((r, i) => <ResultRow key={r.seed} r={r} i={i} alt={i % 2 === 1} />)}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function ArmyPicker({
  title, units, counts, onChange, note,
}: {
  title: string;
  units: typeof UNITS[number][];
  counts: Counts;
  onChange: (c: Counts) => void;
  note?: string;
}) {
  const filled = Object.values(counts).filter((v) => Number(v) > 0).length;
  return (
    <Panel title={title} right={filled > 0 ? `${filled} çeşit` : undefined}>
      {note ? <p className="px-3 pt-2 text-[11px] text-muted">{note}</p> : null}
      <ul className="divide-y divide-border">
        {units.map((u, i) => (
          <li key={u.id} className={`flex items-center gap-2 px-3 py-1.5 ${i % 2 === 1 ? 'bg-row-alt' : ''}`}>
            <CatalogIcon kind={u.kind === 'warrior' ? 'units' : 'defenses'} id={u.id} alt={u.name.tr} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{u.name.tr}</span>
            <AmountInput min={0} placeholder="0"
              value={counts[u.id] ?? ''}
              onChange={(e) => onChange({ ...counts, [u.id]: e.target.value })} />
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-3 py-1.5">
        <Button size="sm" variant="ghost" onClick={() => onChange({})}>Temizle</Button>
      </div>
    </Panel>
  );
}

function ResultRow({ r, i, alt }: { r: SimResult; i: number; alt: boolean }) {
  const label = r.winner === 'attacker' ? 'Saldıran kazandı'
    : r.winner === 'defender' ? 'Savunan kazandı' : 'Berabere';
  const tone = r.winner === 'attacker' ? 'text-success'
    : r.winner === 'defender' ? 'text-danger' : 'text-muted';

  return (
    <li className={`px-3 py-2 ${alt ? 'bg-row-alt' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="tnum text-muted">#{i + 1}</span>
        <span className={`font-semibold ${tone}`}>{label}</span>
        <span className="tnum text-xs text-muted">{r.turns} tur</span>
        {/* ⚠️ Seed gösteriliyor: aynı savaşı birebir tekrar oynatmanın tek yolu bu. */}
        <span className="tnum ml-auto text-[10px] text-muted">seed {r.seed}</span>
      </div>
      <div className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
        <SidePanel title="Saldıran" side={r.attacker} />
        <SidePanel title="Savunan" side={r.defender} />
      </div>
    </li>
  );
}

function SidePanel({ title, side }: { title: string; side: SimSide }) {
  const left = Object.entries(side.counts).filter(([, n]) => n > 0);
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-raised px-2 py-1.5">
      <div className="mb-0.5 font-semibold text-ink">{title}</div>
      <div className="tnum text-muted">
        Kalan <b className="text-ink">{fmt(side.alive)}</b> · Kayıp{' '}
        <b className="text-danger">{fmt(side.lost)}</b>
      </div>
      {left.length > 0 ? (
        <div className="mt-0.5 text-muted">
          {left.map(([id, n]) => `${nameOf(id)} ${fmt(n)}`).join(' · ')}
        </div>
      ) : <div className="mt-0.5 text-danger">Kimse kalmadı.</div>}
    </div>
  );
}

export const SimulateScreen = (): React.ReactElement => <Simulate />;
