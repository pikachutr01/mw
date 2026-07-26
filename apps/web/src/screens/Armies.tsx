/**
 * ⭐ ORDULAR — giriş sonrası oyuncuyu KARŞILAYAN ekran ve şehir değiştirme yeri.
 *
 * Orijinal davranış (referans `images/mobil arayüz2.jpg`, `scr_itv01`, `scr_web01`):
 *   • Şehirler ÜSTTE yan yana dizilir (kale simgesi + ad); tıklayınca **aktif şehir değişir**.
 *   • O şehirle ilgili her ordu hareketi, şehrin simgesinin ALTINA dikey olarak asılır.
 *   • Sıra **görevin başladığı ana** göredir (varış sırası değil) — kullanıcı kuralı.
 *
 * Şehir değiştirme başka hiçbir ekranda tekrarlanmaz: oyuncu "şehir değiştireceksem Ordular'a
 * giderim" alışkanlığını tek yerde kurar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmt, remaining, useTick } from '../lib/hooks.ts';
import { describeUnits } from '../lib/names.ts';
import { useCities, useCity, useMovements, type Coords, type Movement } from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { Empty, Panel, Res } from '../components/ui.tsx';

/** Görev tipi → Türkçe ad. Tooltip başlığı bu. */
const TYPE_LABEL: Record<string, string> = {
  attack: 'Saldırı',
  return: 'Dönüş',
  transport: 'Nakliye',
  support: 'Destek',
  spy: 'Casusluk',
  found_city: 'Şehir Kurma',
  teleport: 'Teleport',
};

const coordText = (c: Coords | null): string => (c ? `${c.k}:${c.d}:${c.s}` : '—');

export function Armies() {
  const cities = useCities();
  const movements = useMovements();
  const { cityId, setCityId } = useActiveCity();
  const city = useCity(cityId);
  useTick();

  const [tip, setTip] = useState<{ m: Movement; x: number; y: number } | null>(null);
  const list = cities.data?.cities ?? [];
  const all = movements.data?.movements ?? [];

  // Mobilde tooltip TIKLAMAYLA açılıyor → boşluğa dokununca kapanmalı.
  useEffect(() => {
    if (!tip) return;
    const close = (): void => setTip(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [tip]);

  const byCity = useCallback(
    (id: number): Movement[] => all
      .filter((m) => m.cityId === id)
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)),
    [all],
  );

  return (
    <div className="space-y-3" onClick={() => setTip(null)}>
      <Panel title="Ordular" right={all.length > 0 ? `${all.length} hareket` : 'sakin'}>
        {list.length === 0 ? (
          <Empty>Şehir yükleniyor…</Empty>
        ) : (
          <div className="flex gap-3 overflow-x-auto p-3">
            {list.map((c) => (
              <CityColumn
                key={c.id}
                name={c.name}
                coords={c.coordinates}
                active={c.id === cityId}
                movements={byCity(c.id)}
                onSelect={() => setCityId(c.id)}
                onTip={setTip}
              />
            ))}
          </div>
        )}
        <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
          Şehre tıklayarak aktif şehri değiştirirsin. Simgeler görevin <b>başlama sırasına</b> göre dizilir.
        </div>
      </Panel>

      {/* Aktif şehrin dikey bilgi paneli (orijinalde sağda duran "Durum Özeti"). */}
      <Panel title="Durum Özeti" right={city.data?.name}>
        <div className="space-y-1.5 px-3 py-2 text-sm">
          {all.length === 0 ? (
            <span className="text-muted">Şehrinde herhangi bir hareketlilik yok.</span>
          ) : (
            <MovementSummary movements={all} />
          )}
          {city.data ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-xs">
              <Res kind="gold" value={fmt(city.data.resources.gold)} size={14} />
              <Res kind="food" value={fmt(city.data.resources.food)} size={14} />
              <span className="text-muted">
                {coordText(city.data.coordinates)}{city.data.isCapital ? ' · Başkent' : ''}
              </span>
            </div>
          ) : null}
        </div>
      </Panel>

      {tip ? <Tooltip m={tip.m} x={tip.x} y={tip.y} /> : null}
    </div>
  );
}

/** Tek şehir: kale simgesi + ad + altına asılan hareket simgeleri. */
function CityColumn({
  name, coords, active, movements, onSelect, onTip,
}: {
  name: string;
  coords: Coords;
  active: boolean;
  movements: Movement[];
  onSelect: () => void;
  onTip: (t: { m: Movement; x: number; y: number } | null) => void;
}) {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center">
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        title={`${name} (${coordText(coords)})`}
        className={`w-full rounded-[var(--radius-sm)] border-2 p-1 transition-colors ${
          active ? 'border-accent bg-accent/15' : 'border-transparent hover:bg-raised'
        }`}
      >
        <img src="/assets/buildings/castle.png" alt="" width={48} height={48}
          className="mx-auto h-12 w-12 object-contain" />
        <span className={`mt-0.5 block truncate text-[11px] ${active ? 'font-semibold text-accent' : 'text-muted'}`}>
          {name}
        </span>
      </button>

      {/* Hareketler dikey olarak şehrin ALTINA asılır. */}
      <div className="mt-1 flex flex-col items-center gap-1">
        {movements.map((m) => <MovementIcon key={m.key} m={m} onTip={onTip} />)}
      </div>
    </div>
  );
}

function MovementIcon({
  m, onTip,
}: { m: Movement; onTip: (t: { m: Movement; x: number; y: number } | null) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const left = remaining(m.executeAt);

  // Fare TAKİPLİ tooltip (masaüstü) · dokunmatikte tıklama noktasına sabit (mobil web).
  const show = (e: React.MouseEvent): void => onTip({ m, x: e.clientX, y: e.clientY });

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseMove={show}
      onMouseLeave={() => onTip(null)}
      onClick={(e) => { e.stopPropagation(); show(e); }}
      className="relative inline-flex cursor-help flex-col items-center"
    >
      <img src={`/assets/missions/${m.icon}.png`} alt={TYPE_LABEL[m.type] ?? m.type}
        width={32} height={32}
        className={`h-8 w-8 object-contain ${m.direction === 'in' ? 'drop-shadow-[0_0_3px_var(--mw-color-danger)]' : ''}`} />
      <span className="tnum text-[10px] leading-tight text-muted">{left ?? 'varıyor'}</span>
    </span>
  );
}

/** Fareyi takip eden tooltip. Konum viewport'a göre kırpılır ki ekran dışına taşmasın. */
function Tooltip({ m, x, y }: { m: Movement; x: number; y: number }) {
  const W = 240;
  const left = Math.min(x + 14, window.innerWidth - W - 8);
  const top = Math.min(y + 14, window.innerHeight - 90);

  return (
    <div
      role="tooltip"
      style={{ left, top, width: W, boxShadow: 'var(--mw-shadow-md)' }}
      className="pointer-events-none fixed z-50 rounded-[var(--radius-sm)] border-2 border-strong bg-surface"
    >
      <div className="display border-b-2 border-strong bg-panel-header px-2 py-1 text-xs font-semibold tracking-wide text-on-panel-header uppercase">
        {TYPE_LABEL[m.type] ?? m.type}
        {m.direction === 'in' ? ' (gelen)' : m.direction === 'own' ? ' (dönüş)' : ''}
      </div>
      <div className="space-y-0.5 px-2 py-1.5 text-xs">
        <div className="text-ink">
          Kaynak: <span className="tnum">{coordText(m.origin)}</span>
          {m.originPlayer ? ` (${m.originPlayer})` : ''}
        </div>
        <div className="text-ink">
          Hedef: <span className="tnum">{coordText(m.target)}</span>
          {m.targetPlayer ? ` (${m.targetPlayer})` : ''}
        </div>
        {m.units && Object.keys(m.units).length > 0 ? (
          <div className="border-t border-border pt-0.5 text-muted">{describeUnits(m.units, fmt)}</div>
        ) : null}
      </div>
    </div>
  );
}

/** "2 saldırı geliyor · 1 nakliye yolda" gibi tek satırlık özet. */
function MovementSummary({ movements }: { movements: Movement[] }) {
  const incoming = movements.filter((m) => m.direction === 'in');
  const outgoing = movements.filter((m) => m.direction === 'out');
  const returning = movements.filter((m) => m.direction === 'own');

  return (
    <div className="space-y-0.5">
      {incoming.length > 0 ? (
        <div className="font-semibold text-danger">
          ⚠ {incoming.length} hareket sana doğru yolda
        </div>
      ) : null}
      {outgoing.length > 0 ? (
        <div className="text-ink">{outgoing.length} seferin sürüyor</div>
      ) : null}
      {returning.length > 0 ? (
        <div className="text-success">{returning.length} ordun dönüyor</div>
      ) : null}
    </div>
  );
}
