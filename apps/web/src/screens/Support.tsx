/**
 * ⭐ DESTEK / İLETİŞİM (kullanıcı, 2026-08-14).
 *
 * **Tek ekran, iki kip.** Oturumlu oyuncu talep geçmişini görür ve satıra tıklayınca yazışma
 * modalda açılır; misafir yalnız formu görür ve gönderdikten sonra takip bağlantısını alır.
 *
 * ⚠️ İki ayrı ekran yazmak cazipti ama form, doğrulama kuralları, kategori listesi, resim
 * yükleme ve hata metinleri **birebir aynı**. İkiye bölseydik biri güncellenip diğeri
 * bayatlardı — bu depoda tam olarak bu sınıf hatanın (`combat.ts:34`) tekrar tekrar uyarısı var.
 * Ayrılan tek şey veri kaynağı; o da `authed` bayrağıyla iki satırda çözülüyor.
 *
 * ⚠️ Misafir kipinde **hiçbir oturumlu sorgu çağrılmıyor** (`useSupportTickets` ve
 * `useSupportForm` zaten `enabled: useAuthed()` kapısının arkasında) — misafirde 401 yağmuru
 * `GuestShell.tsx`in başındaki kuralın gereği.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  SUPPORT_CATEGORY_LABEL, type SupportCategory, type SupportTicketSummary,
} from '@mobilwar/contracts';
import { Modal } from '../components/Modal.tsx';
import {
  Badge, Button, Card, Empty, ErrorBox, Field, Input, SectionTitle, Select, Skeleton,
} from '../components/ui.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useSession } from '../lib/hooks.ts';
import {
  useCreateSupportTicket, useReplySupportTicket, useSupportForm, useSupportThread,
  useSupportTickets, useSupportUpload,
} from '../lib/queries.ts';

/** Sunucu **kod** döndürür, Türkçeleştirme burada (`chat.ts` sözleşme kuralı). */
const ERROR_TR: Record<string, string> = {
  ticket_closed: 'Bu talep kapatıldı. Yeni bir talep açabilirsin.',
  too_many_open: 'Çok fazla açık talebin var. Mevcut taleplerin yanıtlanmasını bekle.',
  rejected: 'İstek reddedildi. Lütfen biraz bekleyip tekrar dene.',
  attachment_too_large: 'Resim çok büyük.',
  attachment_invalid: 'Yalnız PNG, JPEG ve WEBP resimler yüklenebilir.',
  upload_disabled: 'Resim yükleme şu anda kapalı.',
  invalid_request: 'Bilgiler eksik ya da hatalı.',
};

function errorText(err: unknown): string {
  const code = err instanceof ApiError ? err.code : undefined;
  return (code && ERROR_TR[code]) || (err instanceof Error ? err.message : 'Bir şeyler ters gitti.');
}

const CATEGORIES = Object.entries(SUPPORT_CATEGORY_LABEL) as [SupportCategory, string][];

const fmt = (iso: string): string =>
  new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

/* ── Resim seçici (form ve yanıt kutusu ortak kullanıyor) ─────────────────────── */

function ImagePicker({ uploadPath, onPicked, disabled }: {
  uploadPath: string;
  onPicked: (id: number | undefined) => void;
  disabled?: boolean;
}) {
  const upload = useSupportUpload(uploadPath);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);

  const clear = (): void => {
    setName(null);
    onPicked(undefined);
    upload.reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* ⚠️ `accept` yalnız DOSYA SEÇİCİYİ daraltır, bir güvenlik önlemi değil: gerçek
          doğrulama sunucuda magic byte ile yapılıyor. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || upload.isPending}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setName(f.name);
          upload.mutate(f, {
            onSuccess: (r) => { onPicked(r.attachmentId); },
            onError: () => { onPicked(undefined); },
          });
        }}
      />
      <Button
        type="button"
        variant="ghost"
        disabled={disabled || upload.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {upload.isPending ? 'Yükleniyor…' : 'Resim ekle'}
      </Button>
      {name != null && upload.isSuccess ? (
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="max-w-[12rem] truncate">{name}</span>
          <button type="button" className="underline" onClick={clear}>kaldır</button>
        </span>
      ) : null}
      {upload.isError ? (
        <span className="text-xs text-danger">{errorText(upload.error)}</span>
      ) : null}
    </div>
  );
}

/* ── Talep formu ─────────────────────────────────────────────────────────────── */

function TicketForm({ authed, onOpened }: {
  authed: boolean;
  onOpened: (r: { ticketId: number; token?: string | null }) => void;
}) {
  const form = useSupportForm();
  const create = useCreateSupportTicket();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('bug');
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [attachmentId, setAttachmentId] = useState<number | undefined>();
  /** ⚠️ BAL KÜPÜ — gerçek kullanıcı görmez, dolayısıyla dolduramaz. */
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  /**
   * ⭐ Kullanıcının şartı birebir: doğrulanmış hesapta alan HİÇ görünmez; doğrulanmamışta
   * ön-dolu gelir, değiştirilebilir ve altında «kontrol edin» uyarısı durur.
   */
  const showEmail = !authed || form.data?.showEmailField === true;
  useEffect(() => {
    if (form.data?.email && email === '') setEmail(form.data.email);
  }, [form.data?.email, email]);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        subject, category, body, attachmentId,
        ...(showEmail ? { email } : {}),
        ...(website === '' ? {} : { website }),
      };
      if (authed) {
        const r = await create.mutateAsync(payload);
        onOpened({ ticketId: r.ticketId });
      } else {
        const r = await api<{ ticketId: number; token: string | null }>(
          '/api/v1/support/public/tickets', { method: 'POST', body: payload },
        );
        onOpened({ ticketId: r.ticketId, token: r.token });
      }
      setSubject(''); setBody(''); setAttachmentId(undefined);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionTitle>Yeni destek talebi</SectionTitle>
      {/* ⚠️ `Card` kendi iç boşluğunu TAŞIMAZ (`ui.tsx`) — içerik kendi padding'ini vermeli,
          yoksa her şey çerçeveye yapışır. `SectionTitle`ın kendi `px-3 pt-3` değeri var. */}
      <form className="space-y-3 px-4 pb-4" onSubmit={(e) => void submit(e)}>
        <Field label="Konu">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            minLength={5}
            maxLength={120}
            required
            placeholder="Kısaca sorunun ne?"
          />
        </Field>

        <Field label="Kategori">
          <Select value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
            {CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </Select>
        </Field>

        {showEmail ? (
          <div>
            <Field label="E-posta adresin">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                placeholder="ornek@eposta.com"
              />
            </Field>
            <p className="mt-1 text-xs text-muted">
              {authed
                ? 'E-posta adresin. Doğru olduğundan emin ol — yanıtı buraya göndereceğiz.'
                : 'Yanıtı bu adrese göndereceğiz, bu yüzden zorunlu.'}
            </p>
          </div>
        ) : null}

        <Field label="Mesajın">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={20}
            maxLength={4000}
            required
            rows={7}
            placeholder="Ne olduğunu, ne yapmaya çalıştığını ve ne gördüğünü yaz."
            className="w-full rounded-[var(--radius-sm)] border border-border bg-raised px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
        </Field>

        <ImagePicker
          uploadPath={authed ? '/api/v1/support/uploads' : '/api/v1/support/public/uploads'}
          onPicked={setAttachmentId}
          disabled={busy}
        />

        {/* ⚠️ Bal küpü: `display:none` DEĞİL — bazı botlar onu atlıyor; ekran dışına taşınıyor. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
        />

        {error != null ? (
          <div role="alert" className="text-sm text-danger">{errorText(error)}</div>
        ) : null}

        <Button type="submit" disabled={busy}>
          {busy ? 'Gönderiliyor…' : 'Talebi gönder'}
        </Button>
      </form>
    </Card>
  );
}

/* ── Yazışma modalı ──────────────────────────────────────────────────────────── */

function ThreadModal({ id, onClose }: { id: number; onClose: () => void }) {
  const thread = useSupportThread(id);
  const reply = useReplySupportTicket(id);
  const [body, setBody] = useState('');
  const [attachmentId, setAttachmentId] = useState<number | undefined>();
  const [error, setError] = useState<unknown>(null);

  const send = async (): Promise<void> => {
    setError(null);
    try {
      await reply.mutateAsync({ body, attachmentId });
      setBody('');
      setAttachmentId(undefined);
    } catch (err) { setError(err); }
  };

  const t = thread.data;
  return (
    <Modal
      title={t ? t.ticket.subject : 'Destek talebi'}
      onClose={onClose}
      width="lg"
    >
      {/* ⚠️ `Modal` gövdesi de kendi iç boşluğunu taşımıyor (`Modal.tsx` · `overflow-y-auto`
          sarmalayıcısı çıplak) — padding içerikten gelmeli. */}
      {thread.isLoading ? (
        <div className="p-4 text-xs text-muted">Yükleniyor…</div>
      ) : thread.isError ? (
        <div className="p-4 text-xs text-danger">Talep okunamadı.</div>
      ) : t ? (
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone={t.ticket.status === 'open' ? 'success' : 'muted'}>
              {t.ticket.status === 'open' ? 'Açık' : 'Kapalı'}
            </Badge>
            <span>{SUPPORT_CATEGORY_LABEL[t.ticket.category]}</span>
            <span>· {fmt(t.ticket.createdAt)}</span>
          </div>

          <div className="space-y-2">
            {t.messages.map((m) => (
              <div
                key={m.id}
                className={
                  'rounded-[var(--radius-sm)] border p-3 '
                  + (m.sender === 'admin'
                    ? 'border-accent/40 bg-raised'
                    : 'border-border bg-panel')
                }
              >
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span className={m.sender === 'admin' ? 'font-semibold text-accent' : ''}>
                    {m.authorName}
                  </span>
                  <span>{fmt(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink">{m.body}</p>
                {m.attachmentId != null ? (
                  <a
                    href={`/api/v1/support/attachments/${m.attachmentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs underline"
                  >
                    Eklenen resmi aç
                  </a>
                ) : null}
              </div>
            ))}
          </div>

          {t.canReply ? (
            <div className="space-y-2 border-t border-border pt-3">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                minLength={20}
                maxLength={4000}
                placeholder="Yanıtını yaz…"
                className="w-full rounded-[var(--radius-sm)] border border-border bg-raised px-3 py-2 text-sm text-ink placeholder:text-muted"
              />
              <ImagePicker uploadPath="/api/v1/support/uploads" onPicked={setAttachmentId} />
              {error != null ? (
                <div role="alert" className="text-sm text-danger">{errorText(error)}</div>
              ) : null}
              <Button
                onClick={() => void send()}
                disabled={reply.isPending || body.trim().length < 20}
              >
                {reply.isPending ? 'Gönderiliyor…' : 'Yanıtla'}
              </Button>
            </div>
          ) : (
            <p className="border-t border-border pt-3 text-xs text-muted">
              Bu talep kapatıldı. Yeni bir sorun için yeni talep açabilirsin.
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

/* ── Ekran ───────────────────────────────────────────────────────────────────── */

function TicketRow({ t, onOpen }: { t: SupportTicketSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-raised"
    >
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${t.unreadCount > 0 ? 'font-semibold text-ink' : 'text-ink'}`}>
          {t.subject}
        </span>
        <span className="block text-xs text-muted">
          {SUPPORT_CATEGORY_LABEL[t.category]} · {fmt(t.updatedAt)}
        </span>
      </span>
      {t.unreadCount > 0 ? <Badge tone="danger">{t.unreadCount}</Badge> : null}
      <Badge tone={t.status === 'open' ? 'success' : 'muted'}>
        {t.status === 'open' ? 'Açık' : 'Kapalı'}
      </Badge>
    </button>
  );
}

export function SupportScreen() {
  const authed = useSession() != null;
  const list = useSupportTickets();
  const [params, setParams] = useSearchParams();
  /** ⭐ Derin bağlantı: bildirimden ve mailden gelen `?t=<id>` doğrudan yazışmayı açar. */
  const openId = params.get('t') ? Number(params.get('t')) : null;
  const [anonResult, setAnonResult] = useState<{ ticketId: number; token?: string | null } | null>(null);

  return (
    /* ⚠️ Sayfa başlığını kabuk (`Shell`/`GuestShell` · `PAGE_TITLE`) zaten yazıyor; ayrıca bir
       «Destek» kartı koymak aynı sözcüğü iki kez göstermek olurdu. */
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      {anonResult != null ? (
        <Card className="p-4">
          <p className="text-sm text-ink">
            Talebin alındı (#{anonResult.ticketId}). Yanıtı e-posta ile göndereceğiz.
          </p>
          {anonResult.token ? (
            <p className="mt-2 text-xs text-muted">
              Talebini şu adresten takip edebilirsin:{' '}
              <a className="underline" href={`/destek/t/${anonResult.token}`}>
                bağlantıyı aç
              </a>{' '}
              — aynı bağlantı e-postanda da var.
            </p>
          ) : null}
        </Card>
      ) : null}

      {authed ? (
        <Card>
          <SectionTitle>Taleplerin</SectionTitle>
          {list.isLoading ? (
            <div className="px-4 pb-4"><Skeleton w="100%" /></div>
          ) : list.isError ? (
            <div className="px-4 pb-4"><ErrorBox error={list.error} /></div>
          ) : (list.data?.tickets.length ?? 0) === 0 ? (
            <div className="px-4 pb-4"><Empty>Henüz bir talebin yok.</Empty></div>
          ) : (
            <div className="border-t border-border">
              {list.data!.tickets.map((t) => (
                <TicketRow
                  key={t.id}
                  t={t}
                  onOpen={() => { setParams({ t: String(t.id) }); }}
                />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <TicketForm authed={authed} onOpened={(r) => {
        if (authed) setParams({ t: String(r.ticketId) });
        else setAnonResult(r);
      }} />

      {openId != null && authed ? (
        <ThreadModal id={openId} onClose={() => { setParams({}); }} />
      ) : null}
    </div>
  );
}

export default SupportScreen;
