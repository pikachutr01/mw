/**
 * ⭐ BİLDİRİM AYARLARI PANELİ (§7.2) — Seçenekler ekranında.
 *
 * ⚠️ İzin yalnız BURADAN, oyuncunun açıkça bastığı düğmeyle istenir (`lib/push.ts` gerekçesi:
 * kendiliğinden sorulan izin reddedilirse karar KALICI olur). Bu yüzden panel, izin durumunu
 * dürüstçe yazar ve reddedilmişse "tarayıcı ayarlarından aç" der — sahte bir düğme göstermez.
 *
 * Kategori anahtarları izinden BAĞIMSIZ çalışır: bunlar sunucudaki `accounts.notify_prefs`
 * kaydı ve uygulama açıkken görünen toast'ı da kapsar. Yani push'a izin vermeyen oyuncu da
 * "üretim bildirimi istemiyorum" diyebilir.
 */
import { useEffect, useState } from 'react';
import {
  getPushStatus, setPushPrefs, subscribeToPush, unsubscribeFromPush, type PushState,
} from '../lib/push.ts';
import { Badge, Button, Panel } from './ui.tsx';

const CATEGORIES: readonly (readonly [string, string, string])[] = [
  ['attack', 'Gelen saldırı ve casusluk', 'Şehrine ordu ya da casus kuş yola çıktığında.'],
  ['dm', 'Özel mesaj', 'Bir oyuncu sana mesaj yazdığında.'],
  ['report', 'Raporlar ve ittifak', 'Savaş bitince, rapor düşünce, davet gelince.'],
  ['production', 'Üretim ve inşaat', 'Bina, birim ya da araştırma tamamlandığında.'],
];

const STATE_TEXT: Record<PushState, string> = {
  unsupported: 'Bu tarayıcı bildirim desteklemiyor. iPhone/iPad\'de önce «Ana Ekrana Ekle» ile kur.',
  disabled: 'Bildirimler sunucuda henüz açık değil.',
  denied: 'Bildirime izin vermemişsin. Açmak için tarayıcının adres çubuğundaki kilit simgesinden '
    + 'bu site için bildirimlere izin ver.',
  default: 'Oyun kapalıyken de haberin olsun.',
  subscribed: 'Bu cihaz bildirim alıyor.',
};

export function NotifySettings(): React.ReactElement {
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPushStatus().then((s) => {
      if (!alive) return;
      setState(s.state);
      setPrefs(s.prefs);
    });
    return () => { alive = false; };
  }, []);

  const toggle = (key: string): void => {
    const next = { ...prefs, [key]: prefs[key] === false };
    setPrefs(next);                                    // iyimser: anahtar anında dönsün
    void setPushPrefs({ [key]: next[key]! }).then(setPrefs).catch(() => setPrefs(prefs));
  };

  const enable = async (): Promise<void> => {
    setBusy(true);
    try {
      await subscribeToPush();
    } finally {
      setBusy(false);
      setState((await getPushStatus()).state);
    }
  };

  const disable = async (): Promise<void> => {
    setBusy(true);
    try {
      await unsubscribeFromPush();
    } finally {
      setBusy(false);
      setState((await getPushStatus()).state);
    }
  };

  return (
    <Panel
      title="Bildirimler"
      right={state === 'subscribed' ? <Badge tone="success">açık</Badge> : undefined}
    >
      <div className="space-y-2 p-3">
        <p className="text-xs text-muted">{state == null ? 'Yükleniyor…' : STATE_TEXT[state]}</p>

        {state === 'default' ? (
          <Button variant="primary" disabled={busy} onClick={() => void enable()}>
            Bildirimleri Aç
          </Button>
        ) : null}
        {state === 'subscribed' ? (
          <Button variant="ghost" disabled={busy} onClick={() => void disable()}>
            Bu Cihazda Kapat
          </Button>
        ) : null}
      </div>

      <div className="border-t border-border">
        {CATEGORIES.map(([key, label, hint]) => (
          <label
            key={key}
            className="flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0"
          >
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={prefs[key] !== false}
              onChange={() => toggle(key)}
            />
            <span className="min-w-0">
              <span className="block text-sm text-ink">{label}</span>
              <span className="block text-[11px] leading-snug text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </div>

      {/* ⚠️ Buradaki «oyun açıkken sistem bildirimi gitmez» açıklaması 2026-08-02'de
          kaldırıldı (kullanıcı): davranışın kendisi DEĞİŞMEDİ (`NotifyService.deliver()`
          tek dallanma), yalnız anlatımı gereksiz bulundu. */}
    </Panel>
  );
}
