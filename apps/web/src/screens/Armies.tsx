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
import { useCallback, useEffect, useState } from 'react';
import { fmt, formatDuration, remaining, serverNow, useTick } from '../lib/hooks.ts';
import { describeUnits } from '../lib/names.ts';
import {
  useCancelMission, useCities, useCity, useMovements, type Coords, type Movement,
} from '../lib/queries.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { Button, Empty, ErrorBox, Panel, Res } from '../components/ui.tsx';
import { Modal, useConfirm } from '../components/Modal.tsx';

/** Görev tipi → Türkçe ad. */
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

/**
 * Hareketin başlığı. Dönüş bacağında **hangi görevden dönüldüğü** yazılır ("Casusluk dönüşü"),
 * çünkü simge de aslına göre seçiliyor — sadece "Dönüş" deseydik simge ile metin çelişirdi.
 */
function titleOf(m: Movement): string {
  if (m.direction === 'own' && m.returnOf) {
    return `${TYPE_LABEL[m.returnOf] ?? m.returnOf} dönüşü${m.canceled ? ' (iptal edildi)' : ''}`;
  }
  const name = TYPE_LABEL[m.type] ?? m.type;
  return m.direction === 'in' ? `Gelen ${name.toLowerCase()}` : name;
}

export function Armies() {
  const cities = useCities();
  const movements = useMovements();
  const { cityId, setCityId } = useActiveCity();
  const city = useCity(cityId);
  useTick();

  const [tip, setTip] = useState<{ m: Movement; x: number; y: number } | null>(null);
  const [open, setOpen] = useState<Movement | null>(null);
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
                onOpen={setOpen}
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

      {tip && !open ? <Tooltip m={tip.m} x={tip.x} y={tip.y} /> : null}
      {open ? <MovementModal m={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/** Tek şehir: kale simgesi + ad + altına asılan hareket simgeleri. */
function CityColumn({
  name, coords, active, movements, onSelect, onTip, onOpen,
}: {
  name: string;
  coords: Coords;
  active: boolean;
  movements: Movement[];
  onSelect: () => void;
  onTip: (t: { m: Movement; x: number; y: number } | null) => void;
  onOpen: (m: Movement) => void;
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
        {movements.map((m) => <MovementIcon key={m.key} m={m} onTip={onTip} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function MovementIcon({
  m, onTip, onOpen,
}: {
  m: Movement;
  onTip: (t: { m: Movement; x: number; y: number } | null) => void;
  onOpen: (m: Movement) => void;
}) {
  const left = remaining(m.executeAt);
  const isReturn = m.direction === 'own';

  // Fare TAKİPLİ tooltip (masaüstü); dokunmatikte parmak yoksa tooltip de yok → tıklama modalı açar.
  const show = (e: React.MouseEvent): void => onTip({ m, x: e.clientX, y: e.clientY });

  return (
    <button
      type="button"
      onMouseEnter={show}
      onMouseMove={show}
      onMouseLeave={() => onTip(null)}
      onClick={(e) => { e.stopPropagation(); onTip(null); onOpen(m); }}
      title={titleOf(m)}
      className="relative inline-flex cursor-pointer flex-col items-center rounded-[var(--radius-sm)] p-0.5 hover:bg-raised"
    >
      <span className="relative">
        <img src={`/assets/missions/${m.icon}.png`} alt={titleOf(m)}
          width={32} height={32}
          className={`h-8 w-8 object-contain ${
            m.direction === 'in' ? 'drop-shadow-[0_0_3px_var(--mw-color-danger)]' : ''
          }`} />
        {/* ⭐ Dönüş rozeti: oyuncu İLK BAKIŞTA giden mi dönen mi ayırt edebilmeli. */}
        {isReturn ? (
          <span aria-hidden
            title="Geri dönüyor"
            className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full
              border border-strong bg-success text-[9px] leading-none text-on-accent">
            ↩
          </span>
        ) : null}
      </span>
      <span className="tnum text-[10px] leading-tight text-muted">{left ?? 'varıyor'}</span>
    </button>
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
        {titleOf(m)}
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

/**
 * Hareket detay modalı + **iptal**.
 *
 * ⭐ İptal geri alınamaz ve bir bedeli var (ordu gidilen yol kadar geri döner) → **global onay
 * diyaloğundan** geçer. Bedelin ne olduğu onay metninde AÇIKÇA yazar; oyuncu "iptal = anında
 * geri geldi" sanmamalı.
 */
function MovementModal({ m, onClose }: { m: Movement; onClose: () => void }) {
  const confirm = useConfirm();
  const cancelMission = useCancelMission();
  useTick();

  const elapsedS = Math.max(0, Math.round((serverNow() - Date.parse(m.startedAt)) / 1000));
  const left = remaining(m.executeAt);
  const units = describeUnits(m.units, fmt);

  const onCancel = async (): Promise<void> => {
    const ok = await confirm({
      title: `${titleOf(m)} iptal edilsin mi?`,
      danger: true,
      confirmLabel: 'Orduyu geri çağır',
      body: (
        <div className="space-y-2">
          <p>Ordu geri çağrılacak ve <b>gittiği yol kadar</b> sürede şehre dönecek.</p>
          <p className="text-muted">
            Şu ana kadar <b>{formatDuration(elapsedS)}</b> yol aldı; dönüş de yaklaşık o kadar sürer.
          </p>
          {m.direction === 'out' && m.targetPlayer ? (
            <p className="text-muted">
              {m.targetPlayer} bu hareketin iptal edildiğini görecek.
            </p>
          ) : null}
        </div>
      ),
    });
    if (!ok) return;
    cancelMission.mutate(m.id, { onSuccess: onClose });
  };

  return (
    <Modal
      title={titleOf(m)}
      onClose={onClose}
      footer={m.canCancel ? (
        <>
          <Button variant="ghost" onClick={onClose}>Kapat</Button>
          <Button variant="danger" disabled={cancelMission.isPending} onClick={() => void onCancel()}>
            {cancelMission.isPending ? 'İptal ediliyor…' : 'Görevi iptal et'}
          </Button>
        </>
      ) : <Button variant="ghost" onClick={onClose}>Kapat</Button>}
    >
      <div className="space-y-3 px-3 py-3 text-sm">
        <div className="flex items-center gap-3">
          <img src={`/assets/missions/${m.icon}.png`} alt="" width={40} height={40}
            className="h-10 w-10 shrink-0 object-contain" />
          <div>
            <div className="font-medium text-ink">{titleOf(m)}</div>
            <div className="tnum text-xs text-muted">
              Varış: {left ?? 'varıyor'} · başlangıç {new Date(m.startedAt).toLocaleString('tr-TR')}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted">Kaynak</dt>
          <dd className="tnum text-ink">
            {coordText(m.origin)}{m.originPlayer ? ` (${m.originPlayer})` : ''}
          </dd>
          <dt className="text-muted">Hedef</dt>
          <dd className="tnum text-ink">
            {coordText(m.target)}{m.targetPlayer ? ` (${m.targetPlayer})` : ''}
          </dd>
          {units ? (
            <>
              <dt className="text-muted">Ordu</dt>
              <dd className="text-ink">{units}</dd>
            </>
          ) : null}
        </dl>

        {m.direction === 'own' ? (
          <div className="rounded-[var(--radius-sm)] border border-success bg-success/10 px-2.5 py-2 text-xs text-success">
            ↩ Bu ordu <b>geri dönüyor</b>{m.canceled ? ' (görev iptal edildiği için)' : ''}.
            Vardığında birlikler şehre, varsa ganimet kasaya eklenecek.
          </div>
        ) : null}

        {m.direction === 'in' ? (
          <div className="rounded-[var(--radius-sm)] border border-danger bg-danger/10 px-2.5 py-2 text-xs text-danger">
            Bu hareket <b>sana doğru</b> geliyor. Ne getirdiği gizlidir — öğrenmek için casusluk gerekir.
          </div>
        ) : null}

        {!m.canCancel && m.direction === 'out' ? (
          <div className="text-xs text-muted">
            Görev işlenmeye başladı, artık iptal edilemez.
          </div>
        ) : null}

        <ErrorBox error={cancelMission.error} />
      </div>
    </Modal>
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
