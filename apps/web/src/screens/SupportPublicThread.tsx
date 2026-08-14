/**
 * ⭐ ANONİM DESTEK TAKİBİ — `/destek/t/:token` (2026-08-14).
 *
 * ⚠️ **Kabuğun DIŞINDA**, e-posta rotalarıyla aynı ailede: bağlantı çoğu zaman telefonun posta
 * uygulamasından, oturumu olmayan bir tarayıcıda açılıyor. "Önce giriş yap" duvarına çarpması
 * saçma olurdu — kullanıcının hesabı zaten yok, talebi tam da bu yüzden anonim.
 *
 * ⚠️ Jeton bir **taşıyıcı yetki**: bağlantıya sahip olan okur ve yazar. Kabul edilebilir,
 * çünkü tek gittiği yer kullanıcının kendi verdiği adres ve jeton 256 bit. Sunucuda yalnız
 * sha256'sı duruyor ve süresi doluyor.
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { SUPPORT_CATEGORY_LABEL, type SupportThread } from '@mobilwar/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, ErrorBox, SectionTitle } from '../components/ui.tsx';
import { api } from '../lib/api.ts';

const fmt = (iso: string): string =>
  new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

export function SupportPublicThreadScreen() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const [body, setBody] = useState('');

  const thread = useQuery({
    queryKey: ['support-public', token],
    queryFn: () => api<SupportThread>(`/api/v1/support/public/tickets/${token}`),
    enabled: token !== '',
  });

  const reply = useMutation({
    mutationFn: (b: string) =>
      api(`/api/v1/support/public/tickets/${token}/messages`, { method: 'POST', body: { body: b } }),
    onSuccess: () => {
      setBody('');
      void qc.invalidateQueries({ queryKey: ['support-public', token] });
    },
  });

  const t = thread.data;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
      {/* ⚠️ `Card` iç boşluk taşımıyor (`ui.tsx`); `SectionTitle` kendi px/pt'sini getiriyor,
          gövde ise `px-4 pb-4` ile ayrıca padding almalı. */}
      <Card>
        <SectionTitle>Destek talebin</SectionTitle>
        <div className="px-4 pb-4">
          {thread.isLoading ? (
            <p className="text-sm text-muted">Yükleniyor…</p>
          ) : thread.isError ? (
            /* ⚠️ Süresi dolmuş ve hiç var olmamış jeton AYNI hatayı verir (sunucuda 404). */
            <p className="text-sm text-danger">
              Bu bağlantı geçersiz ya da süresi dolmuş. Yeni bir destek talebi açabilirsin.
            </p>
          ) : t ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge tone={t.ticket.status === 'open' ? 'success' : 'muted'}>
                  {t.ticket.status === 'open' ? 'Açık' : 'Kapalı'}
                </Badge>
                <span>{SUPPORT_CATEGORY_LABEL[t.ticket.category]}</span>
                <span>· {fmt(t.ticket.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-ink">{t.ticket.subject}</p>
            </>
          ) : null}
        </div>
      </Card>

      {t ? (
        <Card className="space-y-2 p-4">
          {t.messages.map((m) => (
            <div
              key={m.id}
              className={
                'rounded-[var(--radius-sm)] border p-3 '
                + (m.sender === 'admin' ? 'border-accent/40 bg-raised' : 'border-border bg-panel')
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
                  href={`/api/v1/support/public/attachments/${m.attachmentId}/${token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs underline"
                >
                  Eklenen resmi aç
                </a>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}

      {t?.canReply ? (
        <Card className="space-y-2 p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            minLength={20}
            maxLength={4000}
            placeholder="Yanıtını yaz…"
            className="w-full rounded-[var(--radius-sm)] border border-border bg-raised px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
          {reply.isError ? <ErrorBox error={reply.error} /> : null}
          <Button
            onClick={() => reply.mutate(body)}
            disabled={reply.isPending || body.trim().length < 20}
          >
            {reply.isPending ? 'Gönderiliyor…' : 'Yanıtla'}
          </Button>
        </Card>
      ) : t ? (
        <Card className="p-4">
          <p className="text-xs text-muted">
            Bu talep kapatıldı. Yeni bir sorun için oyundan yeni talep açabilirsin.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default SupportPublicThreadScreen;
