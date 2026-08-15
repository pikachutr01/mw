/**
 * ⭐ DESTEK KUYRUĞU — yönetici ekranı (kullanıcı, 2026-08-14).
 *
 * ⚠️ **2. NESİL (react-query)** — `Moderation.tsx`in `useState + useEffect + fetch` kalıbı
 * BİLEREK kopyalanmadı; `main.tsx`teki gerekçe açık: *"sekiz ekran o üçlüyü yirmi yerde tekrar
 * ediyordu."* Emsal `Players.tsx`.
 *
 * ⚠️ **Sekme rozeti bu ekranın en önemli parçası.** Yönetici oyuncunun SONRAKİ yanıtları için
 * mail almıyor (kullanıcı kararı: *"sadece ilk açıldığında"*), yani "bizde bekleyen" sayısını
 * gösteren tek yer burası. Rozet olmasaydı cevap bekleyen bir mesaj fark edilmeden kalırdı.
 * (İkinci emniyet ağı: günlük özet maili — `support.handler.ts`.)
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  SUPPORT_CATEGORY_LABEL, type SupportCategory, type SupportStatus, type SupportThread,
} from '@mobilwar/contracts';
import { api, apiObjectUrl } from '../lib/api.ts';
import { needsStepUp } from '../lib/admin.ts';
import {
  Badge, Button, DataTable, ErrorBox, Info, Pagination, Panel, SearchInput, Select,
  type Column,
} from '../components/ui.tsx';

interface AdminTicketRow {
  id: number;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  lastSender: 'user' | 'admin';
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

const fmt = (iso: string): string =>
  new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

export function SupportScreen({ onNeedStepUp }: { onNeedStepUp: () => void }) {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<'' | SupportStatus>('open');
  const [category, setCategory] = useState<'' | SupportCategory>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const selected = params.get('t') ? Number(params.get('t')) : null;

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (category) query.set('category', category);
  if (search) query.set('search', search);
  query.set('page', String(page));

  const list = useQuery({
    queryKey: ['admin-support', status, category, search, page],
    queryFn: () => api<{ rows: AdminTicketRow[]; total: number; pending: number }>(
      `/api/v1/admin/support?${query.toString()}`,
    ),
    placeholderData: (prev) => prev,
    // Rozet panel açıkken canlı kalmalı; liste zaten aynı yanıtta geliyor.
    refetchInterval: 30_000,
  });

  const columns: Column<AdminTicketRow>[] = [
    { key: 'id', label: '#', numeric: true },
    {
      key: 'subject',
      label: 'Konu',
      render: (r) => (
        <button type="button" className="text-left underline" onClick={() => setParams({ t: String(r.id) })}>
          {r.subject}
        </button>
      ),
    },
    { key: 'category', label: 'Kategori', render: (r) => SUPPORT_CATEGORY_LABEL[r.category] },
    {
      key: 'who',
      label: 'Kimden',
      render: (r) => (
        <span title={r.email}>
          {r.displayName}
          {/* ⚠️ Anonim işareti burada ŞART: yöneticinin eklediği resmi anonim kullanıcı
              görebilir ama oyun içi bildirim ALMAZ — yalnız e-posta ile ulaşılır. */}
          {r.displayName === 'Ziyaretçi' ? <Badge>anonim</Badge> : null}
        </span>
      ),
    },
    {
      key: 'state',
      label: 'Durum',
      render: (r) => (
        <span className="flex items-center gap-1">
          <Badge>{r.status === 'open' ? 'açık' : 'kapalı'}</Badge>
          {r.status === 'open' && r.lastSender === 'user'
            ? <Badge>yanıt bekliyor</Badge>
            : null}
        </span>
      ),
    },
    { key: 'updatedAt', label: 'Son hareket', render: (r) => fmt(r.updatedAt) },
  ];

  return (
    <div className="space-y-3">
      <Panel
        title="Destek talepleri"
        right={(list.data?.pending ?? 0) > 0 ? `${list.data!.pending} yanıt bekliyor` : undefined}
      >
        <Info>
          Oyuncuların açtığı destek talepleri. ⚠️ Talebi <strong>yalnız sen</strong> açıp
          kapatabilirsin; kapalı bir talebe oyuncu yazamaz. Yeni talep açıldığında sana e-posta
          gider; oyuncunun <strong>sonraki</strong> yanıtları için mail GİTMEZ — bu yüzden
          yukarıdaki «bekliyor» sayacı ve günlük özet maili var.
        </Info>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={status} onChange={(e) => { setStatus(e.target.value as SupportStatus | ''); setPage(0); }}>
            <option value="">Tüm durumlar</option>
            <option value="open">Açık</option>
            <option value="closed">Kapalı</option>
          </Select>
          <Select value={category} onChange={(e) => { setCategory(e.target.value as SupportCategory | ''); setPage(0); }}>
            <option value="">Tüm kategoriler</option>
            {Object.entries(SUPPORT_CATEGORY_LABEL).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </Select>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Konu, ad veya e-posta" />
        </div>

        {list.isError ? <ErrorBox error={list.error} /> : null}
        <div className="mt-2">
          <DataTable
            columns={columns}
            rows={list.data?.rows ?? []}
            keyOf={(r) => r.id}
            empty="Bu süzgeçle talep yok."
          />
        </div>
        <Pagination
          page={page}
          total={list.data?.total ?? 0}
          pageSize={25}
          onPage={setPage}
        />
      </Panel>

      {selected != null ? (
        <TicketPanel
          id={selected}
          onClose={() => setParams({})}
          onNeedStepUp={onNeedStepUp}
          onChanged={() => { void qc.invalidateQueries({ queryKey: ['admin-support'] }); }}
        />
      ) : null}
    </div>
  );
}

function TicketPanel({ id, onClose, onNeedStepUp, onChanged }: {
  id: number; onClose: () => void; onNeedStepUp: () => void; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [attachmentId, setAttachmentId] = useState<number | undefined>();
  /** Açık ek — mesaj kimliği; `null` ise kapalı. */
  const [openAttachment, setOpenAttachment] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);

  const thread = useQuery({
    queryKey: ['admin-support-thread', id],
    queryFn: () => api<SupportThread & { ticket: { email?: string } }>(`/api/v1/admin/support/${id}`),
  });

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: ['admin-support-thread', id] });
    onChanged();
  };

  const reply = useMutation({
    mutationFn: () => api(`/api/v1/admin/support/${id}/messages`, {
      method: 'POST', body: { body, ...(attachmentId ? { attachmentId } : {}) },
    }),
    onSuccess: () => { setBody(''); setAttachmentId(undefined); refresh(); },
    onError: (err) => { if (needsStepUp(err)) onNeedStepUp(); else setError(err); },
  });

  const setStatus = useMutation({
    mutationFn: (status: SupportStatus) =>
      api(`/api/v1/admin/support/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: refresh,
    onError: (err) => { if (needsStepUp(err)) onNeedStepUp(); else setError(err); },
  });

  const t = thread.data;

  const upload = async (file: File): Promise<void> => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ attachmentId: number }>('/api/v1/admin/support/uploads', {
        method: 'POST', body: fd,
      });
      setAttachmentId(r.attachmentId);
    } catch (err) { setError(err); } finally { setUploading(false); }
  };

  return (
    <Panel
      title={`#${id} ${t ? t.ticket.subject : ''}`}
      right={<button type="button" className="underline" onClick={onClose}>kapat</button>}
    >
      {thread.isLoading ? <p className="text-xs text-muted">Yükleniyor…</p> : null}
      {thread.isError ? <ErrorBox error={thread.error} /> : null}

      {t ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge>{t.ticket.status === 'open' ? 'açık' : 'kapalı'}</Badge>
            <span>{SUPPORT_CATEGORY_LABEL[t.ticket.category]}</span>
            <span>· {fmt(t.ticket.createdAt)}</span>
            <Button
              onClick={() => setStatus.mutate(t.ticket.status === 'open' ? 'closed' : 'open')}
              disabled={setStatus.isPending}
            >
              {t.ticket.status === 'open' ? 'Talebi kapat' : 'Talebi yeniden aç'}
            </Button>
          </div>

          <div className="space-y-2">
            {t.messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-[var(--radius-sm)] border p-2 ${
                  m.sender === 'admin' ? 'border-strong bg-raised' : 'border-border bg-surface'
                }`}
              >
                <div className="mb-1 flex justify-between text-[11px] text-muted">
                  <span>{m.sender === 'admin' ? 'Yönetim' : m.authorName}</span>
                  <span>{fmt(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-xs text-ink">{m.body}</p>
                {m.attachmentId != null ? (
                  <button
                    type="button"
                    onClick={() => setOpenAttachment(m.attachmentId!)}
                    className="mt-1 inline-block text-[11px] underline"
                  >
                    Eklenen resmi aç
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-2 border-t border-border pt-2">
            {/**
              * ⚠️ Bu uyarı ZORUNLU: yanıtın TAM METNİ oyuncuya e-posta ile gidiyor. Kararı
              * bilgiyle vermek yöneticinin hakkı — hassas bilgi yazıp yazmayacağına burada
              * karar veriyor (`templates.ts` · `supportTicketReplied` gerekçesi).
              */}
            <p className="text-[11px] text-muted">
              ⚠️ Bu metin oyuncuya <strong>aynen e-posta ile</strong> gidecek.
            </p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5 text-xs text-ink"
              placeholder="Yanıtın…"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
                className="text-xs"
              />
              {attachmentId != null ? <Badge>resim hazır</Badge> : null}
            </div>
            {error != null ? <ErrorBox error={error} /> : null}
            {/* ⚠️ 20 karakter kuralı YOK: o yalnız talebin AÇILIŞINDA geçerli — yöneticinin
                "Çözüldü mü?" gibi kısa yanıtları engellenmemeli (contracts/support.ts). */}
            <Button onClick={() => reply.mutate()} disabled={reply.isPending || body.trim().length < 2}>
              {reply.isPending ? 'Gönderiliyor…' : 'Yanıtla ve e-posta gönder'}
            </Button>
          </div>
        </>
      ) : null}
      {openAttachment != null ? (
        <AttachmentView messageId={openAttachment} onClose={() => setOpenAttachment(null)} />
      ) : null}
    </Panel>
  );
}

/**
 * ⭐ Ek görüntüleyici — yetkiyle çekilip üstte gösteriliyor (kullanıcı, 2026-08-15).
 *
 * ⚠️ Panelde ortak bir `Modal` bileşeni YOK (web'de var). Yeni bir bileşen ailesi açmak
 * yerine tek kullanımlık bir örtü yazıldı: paneldeki tek modal ihtiyacı bu.
 */
function AttachmentView({ messageId, onClose }: { messageId: number; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    apiObjectUrl(`/api/v1/admin/support/attachments/${messageId}`)
      .then((u) => {
        if (!alive) { URL.revokeObjectURL(u); return; }
        made = u; setUrl(u);
      })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [messageId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mesaj eki"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-full overflow-auto rounded-[var(--radius-md)] border border-border bg-surface p-3"
        onClick={(e) => e.stopPropagation()}
      >
        {err ? <p className="text-xs text-danger">Resim açılamadı.</p> : null}
        {!err && url == null ? <p className="text-xs text-muted">Yükleniyor…</p> : null}
        {url != null ? (
          <img src={url} alt="Mesaja eklenen resim" className="max-h-[80vh] max-w-full object-contain" />
        ) : null}
        <div className="mt-2 text-right">
          <Button variant="ghost" onClick={onClose}>Kapat</Button>
        </div>
      </div>
    </div>
  );
}

export default SupportScreen;
