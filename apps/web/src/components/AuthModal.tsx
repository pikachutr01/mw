/**
 * ⭐ GİRİŞ / KAYIT MODALI (kullanıcı, 2026-08-02) — eski tam sayfa `screens/Auth.tsx`in yerine.
 *
 * Misafir artık ana sayfayı ve simülatörü geziyor; giriş formu için sayfayı terk etmesi
 * gereksizdi. Modal her misafir ekranından `useAuthModal()` ile açılıyor.
 *
 * ⚠️ **`footer` KULLANILMIYOR, form bütünüyle `children` içinde.** `Modal` (`Modal.tsx:87`)
 * `footer`ı `children`ın KARDEŞİ olarak çiziyor; oraya konan `type="submit"` düğmesi `<form>`ün
 * dışında kalır ve Enter ile gönderim çalışmaz.
 *
 * ⚠️ **Mod değiştirme düğmeleri `<form>`ün DIŞINDA.** `type` taşımıyorlar; form içine
 * alınsalardı varsayılan `type="submit"` ile giriş denemesi tetiklerlerdi.
 *
 * ⚠️ `onDone` YOK: `login()`/`register()` zaten `setSession()` çağırıyor, `App` de
 * `onSessionChange`e abone. Ağaç kendiliğinden değişiyor ve modal onunla birlikte kalkıyor.
 */
import { useState } from 'react';
import { USERNAME_MAX, USERNAME_MIN, USERNAME_RULE_MESSAGE } from '@mobilwar/catalog';
import { api, login, register } from '../lib/api.ts';
import { Button, ErrorBox, Field, Input } from './ui.tsx';
import { Modal } from './Modal.tsx';

export type AuthMode = 'login' | 'register' | 'forgot';

const TITLE: Record<AuthMode, string> = {
  login: 'Giriş yap',
  register: 'Kayıt ol',
  forgot: 'Şifremi unuttum',
};

export function AuthModal({ mode: initialMode = 'login', onClose }: {
  mode?: AuthMode;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const go = (next: AuthMode): void => {
    setMode(next); setError(null); setSent(false);
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await api('/api/v1/auth/forgot-password', { method: 'POST', body: { email } });
        setSent(true);
        return;
      }
      if (mode === 'login') await login(username, password);
      else await register(email, password, username);
      // Başarılıysa `setSession` ağacı değiştiriyor; modal zaten sökülüyor.
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  /**
   * ⭐ Sunucu, adres kayıtlı OLMASA DA başarılı döner (sayım sızdırmaz). Bu yüzden ekrandaki
   * metin de "gönderdik" DEMEZ — *"kayıtlıysa gönderdik"* der. Aksi hâlde arayüz, sunucunun
   * bilerek gizlediği bilgiyi ele verirdi.
   */
  if (mode === 'forgot' && sent) {
    return (
      <Modal title={TITLE.forgot} onClose={onClose} width="sm">
        <div className="space-y-3 p-4">
          <p className="text-sm text-ink">
            Bu adres kayıtlıysa şifre sıfırlama bağlantısını gönderdik. Gelen kutunu
            (ve gereksiz/spam klasörünü) kontrol et.
          </p>
          <p className="text-xs text-muted">
            Bağlantı 1 saat geçerli ve yalnız bir kez kullanılabilir.
          </p>
          <Button className="w-full" onClick={() => go('login')}>Girişe dön</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={TITLE[mode]} onClose={onClose} width="sm">
      <div className="p-4">
        <p className="mb-3 text-sm text-muted">
          {mode === 'login' ? 'Dünyana geri dön.'
            : mode === 'register' ? 'Yeni bir başkent kur.'
              : 'Kayıtlı e-posta adresini yaz, sıfırlama bağlantısı gönderelim.'}
        </p>

        <form onSubmit={submit} className="space-y-3">
          {/* ⭐ GİRİŞTE e-posta değil KULLANICI ADI sorulur (kullanıcı kararı): oyuncunun
              ezberlediği ve oyunda gördüğü ad odur. E-posta kayıtta ve şifre sıfırlamada. */}
          {mode !== 'login' ? (
            <Field label="E-posta">
              <Input type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          ) : null}

          {mode !== 'forgot' ? (
            <Field label={mode === 'login'
              ? 'Kullanıcı adı'
              : `Kullanıcı adı (${USERNAME_MIN}-${USERNAME_MAX} karakter, sonradan değiştirilemez)`}>
              {/*
                ⚠️ `pattern` KONULMAZ. Eski `[A-Za-z0-9]+` deseni sunucunun `\p{L}\p{N}`
                kuralıyla çelişiyordu: "Ayşe" tarayıcıda reddediliyor, sunucuda kabul
                ediliyordu — yani Türkçe adlar hiç kayıt olamıyordu. HTML `pattern` Unicode
                özellik sınıflarını desteklemediği için desen denetimi tek yerde (sunucuda).
              */}
              <Input required minLength={USERNAME_MIN} maxLength={USERNAME_MAX}
                autoComplete="username"
                title={USERNAME_RULE_MESSAGE}
                value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
          ) : null}

          {/* ⚠️ Alt sınır 8: sunucu sözleşmesi `min(8)` diyor, burası uzun süre 10 yazıyordu →
              8-9 karakterli parola sunucuda geçerliyken tarayıcı reddediyordu. */}
          {mode !== 'forgot' ? (
            <Field label="Parola (en az 8 karakter)">
              <Input type="password" required minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          ) : null}

          <ErrorBox error={error} />

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Bekleyin…'
              : mode === 'login' ? 'Giriş yap'
                : mode === 'register' ? 'Hesap oluştur' : 'Sıfırlama bağlantısı gönder'}
          </Button>
        </form>

        {mode === 'login' ? (
          <button type="button" onClick={() => go('forgot')}
            className="mt-3 w-full text-center text-xs text-muted underline hover:text-ink">
            Şifremi unuttum
          </button>
        ) : null}

        <button type="button"
          onClick={() => go(mode === 'login' ? 'register' : 'login')}
          className="mt-2 w-full text-center text-xs text-muted underline hover:text-ink"
        >
          {mode === 'login' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}
        </button>
      </div>
    </Modal>
  );
}
