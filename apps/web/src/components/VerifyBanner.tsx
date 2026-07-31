/**
 * ⭐ E-POSTA DOĞRULAMA ŞERİDİ (§9.2).
 *
 * Kullanıcı kararı **yumuşak doğrulama**: doğrulanmamış hesap oyunun HİÇBİR yerinde
 * engellenmez, yalnız burada uyarılır. Sert kapı (doğrulamadan giriş yok) beta sürecinde
 * maili spam'e düşen her oyuncuyu kaybettirirdi.
 *
 * ⚠️ Şerit **kapatılabilir ve kapatma hatırlanır** (`localStorage`). Her sayfa açılışında geri
 * gelen bir uyarı, uyarı olmaktan çıkıp gürültü olur ve oyuncu onu görmemeyi öğrenir.
 * Kapatma kalıcı DEĞİL, oturum düzeyinde: doğrulama gerçekten önemli.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';

const DISMISS_KEY = 'mw-verify-dismissed';

export function VerifyBanner(): React.ReactElement | null {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    let alive = true;
    void api<{ email: string | null; emailVerified: boolean }>('/api/v1/auth/me')
      .then((r) => { if (alive && r.email && !r.emailVerified) setShow(true); })
      .catch(() => undefined);   // hesap bilgisi alınamadıysa sessiz kal, uyarı uydurma
    return () => { alive = false; };
  }, []);

  if (!show) return null;

  const dismiss = (): void => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  };

  const resend = async (): Promise<void> => {
    setBusy(true);
    try {
      await api('/api/v1/auth/verify-email/resend', { method: 'POST' });
      setSent(true);
    } catch {
      setSent(true);   // cooldown/kota da "gönderdik" gibi görünür: ayrıntı Seçenekler'de
    } finally {
      setBusy(false);
    }
  };

  return (
    /* ⚠️ Renk sınıfı `Badge` tone="warning" ile AYNI (`Shell.tsx:302`): `bg-warning` + zıt
       metin için `text-on-accent`. `text-on-warning` diye bir token YOK — Tailwind bilinmeyen
       sınıfı sessizce üretmez, metin varsayılan renkte kalırdı. */
    <div className="tex mb-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)]
      border-2 border-strong bg-warning px-3 py-1.5 text-xs text-on-accent">
      <span className="min-w-0 flex-1">
        {sent
          ? 'Doğrulama e-postasını gönderdik. Gelen kutunu (ve spam klasörünü) kontrol et.'
          : 'E-posta adresini doğrulamadın. Doğrulamazsan şifreni unuttuğunda hesabını geri alamazsın.'}
      </span>
      {sent ? null : (
        <button type="button" disabled={busy} onClick={() => void resend()}
          className="shrink-0 underline hover:opacity-80">
          Doğrulama e-postası gönder
        </button>
      )}
      <button type="button" aria-label="Kapat" onClick={dismiss}
        className="shrink-0 px-1 text-sm leading-none hover:opacity-80">×</button>
    </div>
  );
}
