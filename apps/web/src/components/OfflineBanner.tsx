/**
 * ⭐ ÇEVRİMDIŞI ŞERİDİ (kullanıcı isteği: *"internet yoksa ekranda bildirim gözükecek"*).
 *
 * Neden ayrı bir gösterge? Bilgi çubuğundaki nokta **WebSocket** durumunu söyler; oyuncunun
 * interneti gittiğinde asıl mesele soketin değil, ekrandaki her sayının bayatlamış olmasıdır.
 * Sessiz kalmak en kötüsü: oyuncu "gelen ordu yok" görüntüsüne bakarken aslında hiçbir şey
 * güncellenmiyordur.
 *
 * ⚠️ `navigator.onLine` **yalanabilir**: internetsiz bir Wi-Fi'ye bağlı cihaz "online" der.
 * Bu yüzden `online` olayına körü körüne güvenmiyoruz — bağlantının gerçekten döndüğü
 * `/healthz` yoklamasıyla doğrulanıyor. Tersi yönde ise `offline` olayı kesindir, anında gösterilir.
 */
import { useEffect, useState } from 'react';

const PROBE_MS = 5000;

/** Ağ gerçekten çalışıyor mu? `navigator.onLine` + doğrulama yoklaması. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    /** Ağın döndüğünü SUNUCUYA sorarak doğrular; dönene kadar tekrar dener. */
    const probe = async (): Promise<void> => {
      if (stopped) return;
      try {
        await fetch('/healthz', { cache: 'no-store' });
        if (!stopped) setOnline(true);
      } catch {
        if (!stopped) {
          setOnline(false);
          timer = setTimeout(() => void probe(), PROBE_MS);
        }
      }
    };

    const goOffline = (): void => {
      setOnline(false);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void probe(), PROBE_MS);
    };

    const goOnline = (): void => { void probe(); };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    if (!navigator.onLine) goOffline();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return online;
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div role="alert"
      className="fixed inset-x-0 top-0 z-50 border-b-2 border-strong bg-danger px-3 py-1.5
        text-center text-[13px] font-semibold text-on-accent shadow-lg">
      İnternet bağlantısı yok — ekrandaki bilgiler güncellenmiyor.
    </div>
  );
}
