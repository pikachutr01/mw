/**
 * ⭐ E-POSTA DOĞRULAMA ŞERİDİ (§9.2 · §verify).
 *
 * ⚠️ **Metin KISA tutuluyor** (kullanıcı, 2026-08-01). İlk yazımda şerit kısıtların tamamını
 * sayıyordu ve her ekranın satır altlarında da ayrı ayrı yazıyordu; kullanıcının geri bildirimi
 * net oldu: *"her yerde açık açık yazmayalım. En tepede kısaca belirtelim… Kısıtlamaların ne
 * olduğunu o kısıta çarpınca görsün."* Yani şerit **var olduğunu** söyler, ayrıntı **duvara
 * çarpınca** çıkar (Yapılar/Akademi/Savunma satırında kısa bir not, sunucu reddinde tam metin).
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
    <div className="tex mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-sm)]
      border-2 border-strong bg-warning px-3 py-1.5 text-xs text-on-accent">
      <span className="min-w-0 flex-1">
        {sent ? (
          'Doğrulama e-postasını gönderdik. Gelen kutunu (ve spam klasörünü) kontrol et.'
        ) : (
          <>
            <strong>E-posta adresini doğrulamadın.</strong> Doğrulanmayan hesaplar bazı
            kısıtlamalara tabidir.
          </>
        )}
      </span>
      {/* ⚠️ Kapatma düğmesi DOM'da metnin hemen ardında ki dar ekranda onunla AYNI satırda
          kalsın; masaüstünde `sm:order-last` ile yine en sağa geçiyor. */}
      <button type="button" aria-label="Kapat" onClick={dismiss}
        className="shrink-0 px-1 text-sm leading-none hover:opacity-80 sm:order-last">×</button>
      {/* ⚠️ Dar ekranda `w-full` ile ALT SATIRA iner (kullanıcı: "küçük ekranlı cihazlarda kötü
          görünüyor"). Eskiden `shrink-0` idi ve metni sıkıştırıp iki kelimeye düşürüyordu. */}
      {sent ? null : (
        <button type="button" disabled={busy} onClick={() => void resend()}
          className="w-full text-left underline hover:opacity-80 sm:w-auto sm:text-right">
          Doğrulama e-postası gönder
        </button>
      )}
    </div>
  );
}
