/**
 * Ordu hareketlerinin PAYLAŞILAN parçaları: başlık üretimi, şerit simgesi, tooltip ve detay modalı.
 *
 * Şehir şeridi her ekranda olduğu için (bkz. `CityStrip`) bu parçalar da Ordular ekranına özel
 * olamaz — oyuncu Baraka'dayken de gelen saldırının üstüne gelip ne olduğunu görebilmeli.
 */
import { fmt, formatDuration, remaining, serverNow, useTick } from '../lib/hooks.ts';
import { describeUnits } from '../lib/names.ts';
import { useCancelMission, type Coords, type Movement } from '../lib/queries.ts';
import { Button, ErrorBox } from './ui.tsx';
import { Modal, useConfirm } from './Modal.tsx';

/** Görev tipi → Türkçe ad. */
export const TYPE_LABEL: Record<string, string> = {
  attack: 'Saldırı',
  return: 'Dönüş',
  transport: 'Nakliye',
  support: 'Destek',
  spy: 'Casusluk',
  found_city: 'Şehir Kurma',
  teleport: 'Teleport',
};

export const coordText = (c: Coords | null): string => (c ? `${c.k}:${c.d}:${c.s}` : '—');

/**
 * Hareketin başlığı. Dönüş bacağında **hangi görevden dönüldüğü** yazılır ("Casusluk dönüşü"),
 * çünkü simge de aslına göre seçiliyor — sadece "Dönüş" deseydik simge ile metin çelişirdi.
 */
export function titleOf(m: Movement): string {
  if (m.direction === 'own' && m.returnOf) {
    return `${TYPE_LABEL[m.returnOf] ?? m.returnOf} dönüşü${m.canceled ? ' (iptal edildi)' : ''}`;
  }
  const name = TYPE_LABEL[m.type] ?? m.type;
  return m.direction === 'in' ? `Gelen ${name.toLowerCase()}` : name;
}

export interface TipState { m: Movement; x: number; y: number }

/** Şehir simgesinin altına asılan tek hareket. */
export function MovementIcon({
  m, onTip, onOpen,
}: {
  m: Movement;
  onTip: (t: TipState | null) => void;
  onOpen: (m: Movement) => void;
}) {
  const left = remaining(m.executeAt);
  const isReturn = m.direction === 'own';

  // Fare TAKİPLİ tooltip (masaüstü); dokunmatikte tıklama modalı açar.
  const show = (e: React.MouseEvent): void => onTip({ m, x: e.clientX, y: e.clientY });

  return (
    <button
      type="button"
      onMouseEnter={show}
      onMouseMove={show}
      onMouseLeave={() => onTip(null)}
      onClick={(e) => { e.stopPropagation(); onTip(null); onOpen(m); }}
      title={titleOf(m)}
      className="relative inline-flex cursor-pointer flex-col items-center rounded-[var(--radius-sm)]
        p-0.5 transition-transform hover:scale-110"
    >
      <span className="relative">
        <img src={`/assets/missions/${m.icon}.png`} alt={titleOf(m)}
          width={44} height={44}
          className={`icon-shadow h-9 w-9 object-contain sm:h-11 sm:w-11 ${
            m.direction === 'in' ? 'drop-shadow-[0_0_5px_var(--mw-color-danger)]' : ''
          }`} />
        {/* ⭐ Dönüş rozeti: oyuncu İLK BAKIŞTA giden mi dönen mi ayırt edebilmeli. */}
        {isReturn ? (
          <span aria-hidden title="Geri dönüyor"
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full
              border border-strong bg-success text-[10px] leading-none text-on-accent shadow">
            ↩
          </span>
        ) : null}
      </span>
      <span className="tnum text-[10px] leading-tight text-muted">{left ?? 'varıyor'}</span>
    </button>
  );
}

/** Fareyi takip eden tooltip. Konum viewport'a göre kırpılır ki ekran dışına taşmasın. */
export function MovementTooltip({ m, x, y }: TipState) {
  const W = 250;
  const left = Math.min(x + 14, window.innerWidth - W - 8);
  const top = Math.min(y + 14, window.innerHeight - 100);

  return (
    <div role="tooltip" style={{ left, top, width: W }}
      className="tex bevel pointer-events-none fixed z-50 rounded-[var(--radius-sm)] border-2 border-strong bg-surface">
      <div className="tex-header border-b-2 border-strong bg-panel-header px-2 py-1">
        <span className="display text-xs font-semibold tracking-wide text-on-panel-header uppercase">
          {titleOf(m)}
        </span>
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
 * diyaloğundan** geçer. Bedel onay metninde AÇIKÇA yazar; oyuncu "iptal = anında geri geldi"
 * sanmamalı.
 */
export function MovementModal({ m, onClose }: { m: Movement; onClose: () => void }) {
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
            <p className="text-muted">{m.targetPlayer} bu hareketin iptal edildiğini görecek.</p>
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
          <img src={`/assets/missions/${m.icon}.png`} alt="" width={52} height={52}
            className="icon-shadow h-13 w-13 shrink-0 object-contain" style={{ width: 52, height: 52 }} />
          <div>
            <div className="display text-base font-semibold text-ink">{titleOf(m)}</div>
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
          <div className="text-xs text-muted">Görev işlenmeye başladı, artık iptal edilemez.</div>
        ) : null}

        <ErrorBox error={cancelMission.error} />
      </div>
    </Modal>
  );
}
