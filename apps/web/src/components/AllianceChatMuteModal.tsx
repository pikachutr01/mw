/**
 * ⭐ SUSTURMA MODALI (§13.15c) — lider/konsey bir üyeyi sohbette susturur.
 *
 * ⚠️ Süre seçimi **açık liste**, serbest sayı değil: "kaç dakika" diye sorulan bir kutu
 * yanlışlıkla 6000 yazılabilen bir kutudur. Kalıcı seçenek ayrı ve `danger` renginde —
 * geri alınana kadar süren tek seçenek o.
 *
 * ⚠️ Onay metni orijinal kalıpla bitiyor: *"… Emin misiniz!"* (ünlem, §13.18).
 */
import { useState } from 'react';
import { Modal } from './Modal.tsx';
import { Button, ErrorBox, Input } from './ui.tsx';
import type { AllianceChatMember } from '../lib/queries.ts';

/** `null` = KALICI. Sözleşmede de alan zorunlu + nullable — unutulunca en ağır ceza verilmesin. */
const OPTIONS: readonly { label: string; minutes: number | null }[] = [
  { label: '10 dakika', minutes: 10 },
  { label: '1 saat', minutes: 60 },
  { label: '6 saat', minutes: 360 },
  { label: '1 gün', minutes: 1440 },
  { label: 'Kalıcı', minutes: null },
];

export function AllianceChatMuteModal({ member, onClose, onSubmit, error, pending }: {
  member: AllianceChatMember;
  onClose: () => void;
  onSubmit: (v: { minutes: number | null; reason?: string }) => void;
  error: unknown;
  pending: boolean;
}) {
  const [minutes, setMinutes] = useState<number | null>(60);
  const [reason, setReason] = useState('');
  const permanent = minutes === null;

  return (
    <Modal
      title="Sohbette Sustur"
      onClose={onClose}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button
            variant={permanent ? 'danger' : 'primary'}
            disabled={pending}
            onClick={() => onSubmit({ minutes, reason: reason.trim() || undefined })}
          >
            {pending ? 'Uygulanıyor…' : 'Sustur'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 px-3 py-3">
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-border
          bg-raised px-2.5 py-2 text-xs leading-relaxed text-muted">
          <span aria-hidden className="shrink-0 text-sm leading-none">🔇</span>
          <span className="min-w-0">
            <b className="text-ink">{member.username}</b> ittifak sohbetine yazamayacak;
            sohbeti <b className="text-ink">okumaya devam edecek</b>. Susturmayı istediğin
            zaman kaldırabilirsin.
          </span>
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-muted uppercase">Süre</div>
          <div className="flex flex-wrap gap-1.5">
            {OPTIONS.map((o) => {
              const on = o.minutes === minutes;
              return (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setMinutes(o.minutes)}
                  className={`rounded-[var(--radius-sm)] border-2 px-2.5 py-1 text-xs transition-colors ${
                    on
                      ? (o.minutes === null
                        ? 'border-danger bg-danger/15 text-danger'
                        : 'border-strong bg-accent text-on-accent')
                      : 'border-border bg-surface text-muted hover:bg-raised'
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {permanent ? (
          <div className="rounded-[var(--radius-sm)] border border-danger bg-danger/10 px-2.5 py-1.5
            text-[11px] leading-relaxed text-danger">
            Kalıcı susturma <b>kendiliğinden dolmaz</b>. Lider ya da bir konsey üyesi kaldırana
            kadar sürer.
          </div>
        ) : null}

        <div>
          <div className="mb-1 text-xs font-semibold text-muted uppercase">Sebep (isteğe bağlı)</div>
          <Input
            value={reason}
            maxLength={200}
            placeholder="Örn. tekrarlayan spam"
            aria-label="Susturma sebebi"
            onChange={(e) => setReason(e.target.value)}
          />
          {/* ⚠️ Sebep hedefe GÖSTERİLİYOR (posta mesajında) — panelde saklı bir not değil. */}
          <div className="mt-1 text-[10px] text-muted">
            Yazarsan susturulan üyeye gönderilen bildirimde görünür.
          </div>
        </div>

        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}
