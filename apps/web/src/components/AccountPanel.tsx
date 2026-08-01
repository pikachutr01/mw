/**
 * ⭐ HESAP PANELİ (§9.2) — Seçenekler ekranında: e-posta + doğrulama rozeti + şifre değiştirme.
 *
 * "Yakında" listesinden **Şifre değiştirme** maddesini düşürür.
 */
import { useState } from 'react';
import { api, getSession } from '../lib/api.ts';
import { useAccount, useCities } from '../lib/queries.ts';
import { Badge, Button, ErrorBox, Field, Input, Panel } from './ui.tsx';

export function AccountPanel(): React.ReactElement {
  const session = getSession();
  const cities = useCities();
  // ⚠️ Şerit ve sohbet penceresiyle AYNI sorgu (`['account']`) — üç ayrı fetch yerine tek anahtar.
  const info = useAccount().data ?? null;
  const [resendState, setResendState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);

  const resend = async (): Promise<void> => {
    setResendState('busy');
    setResendError(null);
    try {
      await api('/api/v1/auth/verify-email/resend', { method: 'POST' });
      setResendState('sent');
    } catch (err) {
      setResendError(err);
      setResendState('error');
    }
  };

  return (
    <>
      <Panel title="Hesap">
        <div className="space-y-1 p-3 text-sm">
          <div className="text-ink">{session?.username}</div>
          <div className="text-xs text-muted">
            Dünya {session?.worldId} · {cities.data?.cities.length ?? 0} şehir
          </div>
          {info?.email ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted">{info.email}</span>
              {info.emailVerified
                ? <Badge tone="success">doğrulandı</Badge>
                : <Badge tone="warning">doğrulanmadı</Badge>}
            </div>
          ) : null}
        </div>

        {info && !info.emailVerified ? (
          <div className="border-t border-border px-3 py-2">
            <p className="mb-2 text-xs text-muted">
              Doğrulayana kadar <strong>saldırı, nakliye, yeni şehir, savunma ünitesi, ittifak
              ve mesaj yazma kapalı</strong>; yapı ve tekniklerin en fazla 3. seviyeye çıkar ve
              en çok 200 savaşçın olabilir. Ayrıca <strong>şifreni sıfırlayamazsın</strong>.
              Doğrulama bağlantısı gelmediyse gereksiz/spam klasörüne de bak.
            </p>
            {resendState === 'sent' ? (
              <p className="text-xs text-ink">Gönderdik. Gelen kutunu kontrol et.</p>
            ) : (
              <Button variant="ghost" disabled={resendState === 'busy'} onClick={() => void resend()}>
                Doğrulama E-postasını Tekrar Gönder
              </Button>
            )}
            {resendState === 'error' ? <ErrorBox error={resendError} /> : null}
          </div>
        ) : null}

        <div className="border-t border-border px-3 py-2">
          <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? 'Vazgeç' : 'Şifre Değiştir'}
          </Button>
        </div>

        {open ? <ChangePassword onDone={() => setOpen(false)} /> : null}
      </Panel>
    </>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }): React.ReactElement {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mismatch = again !== '' && next !== again;

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (mismatch) return;
    setError(null);
    setBusy(true);
    try {
      await api('/api/v1/auth/change-password', {
        method: 'POST', body: { currentPassword: current, newPassword: next },
      });
      /*
       * ⚠️ Sunucu TÜM oturumları düşürüyor — bu oturum da dâhil. Sayfayı yeniden yüklemek
       * en dürüst davranış: istemci elindeki ölü token'la çalışmaya çalışıp "beklenmedik
       * hata" göstermez, doğrudan giriş ekranına döner.
       */
      window.location.href = '/';
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border p-3">
      <Field label="Mevcut parola">
        <Input type="password" required autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="Yeni parola (en az 8 karakter)">
        <Input type="password" required minLength={8} autoComplete="new-password"
          value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Yeni parola (tekrar)">
        <Input type="password" required minLength={8} autoComplete="new-password"
          value={again} onChange={(e) => setAgain(e.target.value)} />
      </Field>
      {mismatch ? <p className="text-xs text-danger">İki parola aynı değil.</p> : null}
      <p className="text-[11px] text-muted">
        Değiştirdiğinde açık olan tüm oturumların kapanır ve yeniden giriş yaparsın.
      </p>
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || mismatch}>
          {busy ? 'Bekleyin…' : 'Değiştir'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>Vazgeç</Button>
      </div>
    </form>
  );
}
