/**
 * Ana sayfa — siteye ilk gelen ziyaretçiyi karşılar.
 *
 * ⚠️ Bu tur yalnız **iskelet**: logo, tek cümle vaat, çağrı düğmeleri ve simülatör bağlantısı.
 * Hikâye/tanıtım metni ve görsel bölümler sonraki turda (kullanıcı metni düzeltecek).
 */
import { NavLink } from 'react-router-dom';
import { useAuthModal } from '../components/GuestShell.tsx';
import { Button, Panel } from '../components/ui.tsx';

export function Landing(): React.ReactElement {
  const openAuth = useAuthModal();

  return (
    <div className="space-y-4">
      <Panel title="Mobiwar">
        <div className="space-y-4 p-5 text-center">
          <h1 className="display text-2xl font-semibold text-ink sm:text-4xl">
            Bir başkent kur, orduları yönet, dünyayı paylaş.
          </h1>
          <p className="mx-auto max-w-xl text-sm text-muted">
            Zamanlanmış olaylar üzerine kurulu ortaçağ strateji oyunu.
          </p>

          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button onClick={() => openAuth('register')}>Kayıt ol</Button>
            <Button variant="ghost" onClick={() => openAuth('login')}>Giriş yap</Button>
          </div>

          {/* ⭐ Kullanıcının özellikle vurguladığı yol: üye olmadan denenebilen tek gerçek araç. */}
          <NavLink to="/simulate"
            className="inline-block text-xs text-accent underline hover:text-ink">
            Üye olmadan savaş simülatörünü dene →
          </NavLink>
        </div>
      </Panel>
    </div>
  );
}
