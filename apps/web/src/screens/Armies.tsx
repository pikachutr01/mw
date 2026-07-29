/**
 * ⭐ ORDULAR — giriş sonrası oyuncuyu KARŞILAYAN ekran.
 *
 * Şehir şeridi ve ona asılı hareket simgeleri artık **her ekranda** (bkz. `CityStrip`), bu yüzden
 * bu ekranın işi tek şey: hareketlerin **metinli, varış sırasına göre** dökümü ve ayrıntı/iptal.
 *
 * ⚠️ Ayrı bir "Durum Özeti" paneli KALDIRILDI (kullanıcı kararı): tüm şehirlerin hareketi zaten
 * şeritte tek bakışta görünüyor, ikinci bir özet paneli ekranı gereksiz uzatıyordu.
 */
import { useState } from 'react';
import { fmt, remaining, useTick } from '../lib/hooks.ts';
import { describeUnits } from '../lib/names.ts';
import { useMovements, type Movement } from '../lib/queries.ts';
import { Empty, MissionIcon, Panel } from '../components/ui.tsx';
import { coordText, MovementModal, titleOf } from '../components/movements.tsx';

export function Armies() {
  const movements = useMovements();
  const [open, setOpen] = useState<Movement | null>(null);
  useTick();

  const all = movements.data?.movements ?? [];

  return (
    <>
      <Panel title="Ordular" right={all.length > 0 ? `${all.length} hareket` : 'sakin'}>
        {all.length === 0 ? (
          <Empty>Şehirlerinde herhangi bir hareketlilik yok.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {all
              .slice()
              .sort((a, b) => Date.parse(a.executeAt) - Date.parse(b.executeAt))
              .map((m, i) => (
                <MovementRow key={m.key} m={m} alt={i % 2 === 1} onOpen={setOpen} />
              ))}
          </ul>
        )}
        {/* Alt özet şeridi kaldırıldı (kullanıcı, 2026-07-30): hareketler zaten listede,
            gelen saldırı/casusluk ayrıca CityStrip pulse'ı ve rozet rengiyle belli. */}
      </Panel>

      {open ? <MovementModal m={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** Ordular listesindeki tek satır — şeritteki simgenin metinli karşılığı. */
function MovementRow({
  m, alt, onOpen,
}: { m: Movement; alt: boolean; onOpen: (m: Movement) => void }) {
  const left = remaining(m.executeAt);
  const tone = m.direction === 'in' ? 'text-danger'
    : m.direction === 'own' ? 'text-success' : 'text-warning';

  return (
    <li className={alt ? 'bg-row-alt' : ''}>
      <button onClick={() => onOpen(m)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-raised">
        <MissionIcon id={m.icon} size={36} title={titleOf(m)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">
            <b>{titleOf(m)}</b>
            {' · '}
            <span className="tnum">{coordText(m.origin)}</span>
            {' → '}
            <span className="tnum">{coordText(m.target)}</span>
          </span>
          <span className="block truncate text-[11px] text-muted">
            {describeUnits(m.units, fmt) || (m.direction === 'in' ? 'birleşim gizli' : '—')}
          </span>
        </span>
        <span className={`tnum shrink-0 text-sm font-semibold ${tone}`}>{left ?? 'varıyor'}</span>
      </button>
    </li>
  );
}
