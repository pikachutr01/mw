/**
 * ⭐ E-POSTA DOĞRULAMA ŞERİDİ (§9.2 · §verify).
 *
 * ⚠️ **Bu metin 2026-08-01'de değişti.** Eskiden "doğrulanmamış hesap oyunun HİÇBİR yerinde
 * engellenmez" diyordu ve doğrudur — o gün kısıtlar geldi (§verify) ve cümle yalan oldu.
 * Şerit artık **ne yapılamadığını sayıyor**: oyuncu duvara çarpmadan önce görsün.
 *
 * ⚠️ Giriş hâlâ serbest (sert kapı yok): maili spam'e düşen oyuncu oyunu görebilmeli.
 *
 * ⚠️ Şerit **kapatılabilir ve kapatma hatırlanır** (`sessionStorage`). Her sayfa açılışında geri
 * gelen bir uyarı, uyarı olmaktan çıkıp gürültü olur ve oyuncu onu görmemeyi öğrenir.
 * Kapatma kalıcı DEĞİL, oturum düzeyinde: doğrulama gerçekten önemli.
 */
import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useAccount } from '../lib/queries.ts';

const DISMISS_KEY = 'mw-verify-dismissed';

export function VerifyBanner(): React.ReactElement | null {
  const account = useAccount();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === '1',
  );
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // ⚠️ Hesap bilgisi alınamadıysa sessiz kal, uyarı uydurma.
  const show = !dismissed && account.data?.email != null && !account.data.emailVerified;
  if (!show) return null;

  const dismiss = (): void => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
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
        {sent ? (
          'Doğrulama e-postasını gönderdik. Gelen kutunu (ve spam klasörünü) kontrol et.'
        ) : (
          <>
            <strong>E-posta adresini doğrulamadın.</strong> Doğrulayana kadar:{' '}
            saldırı · nakliye · yeni şehir · savunma ünitesi · ittifak · mesaj yazma{' '}
            <em>kapalı</em>; yapı ve teknikler en fazla <strong>3. seviye</strong>, en çok{' '}
            <strong>200 savaşçı</strong>. Şifreni de unutursan hesabını geri alamazsın.
          </>
        )}
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
