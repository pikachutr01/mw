/**
 * ⭐ TEK CİHAZ KURALI — tam ekran kapı (kullanıcı, 2026-08-03).
 *
 * *"İkinci bir cihazda bir hesap açılırsa oynamasını engelleyelim, tam ekran modal
 * gösterilebilir."*
 *
 * ⚠️ `Modal` KULLANILMIYOR — bilerek. `Modal` ESC ve arka plan tıklamasıyla kapanıyor; bu kapı
 * kapanmamalı, çünkü arkasındaki ekran zaten çalışmıyor (her istek 409 alıyor). Kapatılabilir
 * bir kapı, oyuncuya "kapattım, oynayabilirim" izlenimi verip her tıklamada sessizce hata
 * üretirdi.
 *
 * ⚠️ z-indeksi 40 (`Modal`) ve 60'ın (`Tooltip`) ÜSTÜNDE: çakışma anında ekranda açık bir
 * modal ya da ipucu olabilir ve bu kapı hepsinin üstünde durmalı.
 *
 * Kullanıcı kararı **devralma seçenekli**: kesin engelleme yerine «Bu cihazda devam et».
 * Gerekçe — tarayıcısı çöken ya da telefonunu kaybeden oyuncu kendi hesabından kilitli
 * kalmamalı.
 */
import { useEffect, useState } from 'react';
import { api, ApiError, getSession, logout } from '../lib/api.ts';
import { setConflict, useSessionConflict } from '../lib/session-conflict.ts';
import { Button } from './ui.tsx';

const PLATFORM_LABEL: Record<string, string> = {
  web: 'tarayıcı', android: 'Android uygulaması', ios: 'iPhone uygulaması',
};

function agoText(iso: string | null): string | null {
  if (!iso) return null;
  const sec = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(sec)) return null;
  if (sec < 60) return 'az önce';
  const dk = Math.round(sec / 60);
  return dk < 60 ? `${dk} dk önce` : `${Math.round(dk / 60)} sa önce`;
}

export function SessionConflictGate() {
  const conflict = useSessionConflict();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /**
   * ⚠️ Sahiplik zaman aşımıyla kendiliğinden düşebilir (öteki sekme kapandı, tarayıcı çöktü).
   * Kapıyı açık tutup oyuncuyu düğmeye basmaya zorlamak gereksiz sürtünme olurdu; sessizce
   * yokluyoruz ve boşalmışsa kapı kendiliğinden kapanıyor.
   */
  useEffect(() => {
    if (!conflict) return;
    const t = setInterval(() => { void attempt(false); }, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict?.kind]);

  // ⚠️ Oturum yoksa kapı da yok: `setSession(null)` çakışmayı zaten temizliyor, bu ikinci
  //    kemer yalnız yarış hâlleri için (çıkış isteği uçarken gelen bir 409 gibi).
  if (!conflict || !getSession()) return null;

  async function attempt(force: boolean): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ ok: boolean }>('/api/v1/auth/session/claim', {
        method: 'POST', body: { force },
      });
      if (r.ok) {
        setConflict(null);
        // Sahiplik bizde: soketi ve tüm sorguları taze başlat.
        window.location.reload();
      }
    } catch (e) {
      // 409 zaten kapıyı açık tutuyor; başka bir hata varsa oyuncuya söyle.
      if (e instanceof ApiError && e.status !== 409) setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const where = conflict.platform ? PLATFORM_LABEL[conflict.platform] ?? null : null;
  const ago = agoText(conflict.seenAt);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-[var(--radius-md)] border border-strong bg-surface p-5 text-center shadow-xl">
        <h2 className="display mb-2 text-lg text-ink">
          {conflict.kind === 'takeover' ? 'Oyun başka bir cihaza taşındı' : 'Hesabın başka bir yerde açık'}
        </h2>

        <p className="mb-4 text-sm text-muted">
          {conflict.kind === 'takeover'
            ? 'Bu hesapla başka bir cihazdan oyuna girildi. Aynı anda yalnız tek yerde oynanabilir.'
            : (
              <>
                Bu hesap
                {where ? <> <b className="text-ink">{where}</b> üzerinde</> : null}
                {ago ? <> (son hareket {ago})</> : null}
                {' '}zaten açık. Aynı anda yalnız tek yerde oynanabilir.
              </>
            )}
        </p>

        {err ? <p className="mb-3 text-sm text-danger">{err}</p> : null}

        <div className="flex flex-col gap-2">
          <Button onClick={() => void attempt(true)} disabled={busy}>
            {busy ? 'Devralınıyor…' : 'Bu cihazda devam et'}
          </Button>
          <Button variant="ghost" onClick={() => void logout()} disabled={busy}>
            Çıkış yap
          </Button>
        </div>

        <p className="mt-3 text-[11px] text-muted">
          «Bu cihazda devam et» dersen öteki cihazdaki oyun kapanır.
        </p>
      </div>
    </div>
  );
}
