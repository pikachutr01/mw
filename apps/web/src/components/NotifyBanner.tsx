/**
 * ⭐ BİLDİRİM DAVETİ ŞERİDİ (kullanıcı, 2026-08-02).
 *
 * Bildirimler ilk girişte KAPALI (tarayıcı izni sorulmadan açılamaz) ve oyuncunun bunu
 * Seçenekler'e girip keşfetmesi gerekiyordu. Oyun asenkron: saldırı, üretim bitişi ve
 * casusluk raporu oyuncu sekmeyi kapattıktan sonra geliyor — bildirimi olmayan oyuncu
 * oyunun yarısını kaçırıyor. Şerit bu yüzden var ve **açma düğmesi burada**: Seçenekler'e
 * gitmeye gerek yok.
 *
 * ⚠️ Doğrulama şeridiyle aynı yeri paylaşıyor ama farklı davranıyor:
 *   - Doğrulama şeridi `sessionStorage` ile kapanır (doğrulama gerçekten önemli, her oturum
 *     yeniden hatırlatılır).
 *   - Bu şerit **`localStorage`** ile kapanır — kullanıcının şartı: *"kapatırsa bu bilgi
 *     saklansın ve tekrar gözükmesin"*. Bildirim bir tercih; ısrar etmek gürültü olur.
 *
 * ⚠️ Tarayıcı izni **REDDEDİLMİŞSE** şerit hiç çizilmez: o durumda düğme hiçbir işe yaramaz
 * (izin yalnız tarayıcı ayarlarından geri alınabilir) ve oyuncuya çalışmayan bir düğme
 * göstermek en kötü seçenek.
 */
import { useEffect, useState } from 'react';
import { getPushStatus, subscribeToPush, type PushState } from '../lib/push.ts';

const DISMISS_KEY = 'mw-notify-invite-dismissed';

export function NotifyBanner(): React.ReactElement | null {
  const [state, setState] = useState<PushState | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPushStatus().then((s) => { if (alive) setState(s.state); });
    return () => { alive = false; };
  }, []);

  /**
   * Yalnız «açılabilir ama açılmamış» durumda görünür.
   * `unsupported` (tarayıcı desteklemiyor) · `disabled` (sunucuda VAPID yok) · `denied`
   * (izin reddedilmiş) · `subscribed` (zaten açık) hâllerinde şerit anlamsız.
   */
  if (dismissed || state == null || state === 'subscribed'
    || state === 'denied' || state === 'unsupported' || state === 'disabled') return null;

  const dismiss = (): void => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const enable = async (): Promise<void> => {
    setBusy(true);
    try {
      await subscribeToPush();
      const s = await getPushStatus();
      setState(s.state);
      // Başarılıysa şerit kendiliğinden kaybolur (state === 'subscribed').
    } catch {
      /* İzin reddedilirse durum `denied` olur ve şerit yine kapanır. */
      const s = await getPushStatus().catch(() => null);
      if (s) setState(s.state);
    } finally {
      setBusy(false);
    }
  };

  return (
    /* Renk düzeni doğrulama şeridiyle aynı kalıp; ton `accent` çünkü bu bir uyarı değil davet. */
    <div className="tex mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-sm)]
      border-2 border-strong bg-accent px-3 py-1.5 text-xs text-on-accent">
      <span className="min-w-0 flex-1">
        <strong>Anlık haberdar ol.</strong> Saldırı, üretim ve rapor bildirimleri için
        bildirimleri aç.
      </span>
      <button type="button" aria-label="Kapat" onClick={dismiss}
        className="shrink-0 px-1 text-sm leading-none hover:opacity-80 sm:order-last">×</button>
      <button type="button" disabled={busy} onClick={() => void enable()}
        className="w-full text-left underline hover:opacity-80 sm:w-auto sm:text-right">
        {busy ? 'Açılıyor…' : 'Bildirim aç'}
      </button>
    </div>
  );
}
