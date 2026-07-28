/**
 * Giriş / kayıt.
 *
 * ⚠️ Kullanıcı adı **3-10 karakter, boşluk ve noktalama YOK** (oyunun kendi dokümanı) ve
 * **değiştirilemez** — bu yüzden kayıt ekranında açıkça uyarılıyor.
 */
import { useState } from 'react';
import { login, register } from '../lib/api.ts';
import { Button, Card, ErrorBox, Field, Input } from '../components/ui.tsx';

export function Auth({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(username, password);
      else await register(email, password, username);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-sm p-5">
        <h1 className="display mb-1 text-2xl font-semibold text-ink">Mobiwar</h1>
        <p className="mb-4 text-sm text-muted">
          {mode === 'login' ? 'Dünyana geri dön.' : 'Yeni bir başkent kur.'}
        </p>

        <form onSubmit={submit} className="space-y-3">
          {/* ⭐ GİRİŞTE e-posta değil KULLANICI ADI sorulur (kullanıcı kararı): oyuncunun
              ezberlediği ve oyunda gördüğü ad odur. E-posta yalnız kayıtta gerekiyor. */}
          {mode === 'register' ? (
            <Field label="E-posta">
              <Input type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          ) : null}

          <Field label={mode === 'login'
            ? 'Kullanıcı adı'
            : 'Kullanıcı adı (3-10 karakter, sonradan değiştirilemez)'}>
            <Input required minLength={3} maxLength={10} pattern="[A-Za-z0-9]+"
              autoComplete="username"
              title="Yalnız harf ve rakam, 3-10 karakter"
              value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>

          <Field label="Parola (en az 10 karakter)">
            <Input type="password" required minLength={10}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>

          <ErrorBox error={error} />

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Bekleyin…' : mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'}
          </Button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          className="mt-4 w-full text-center text-xs text-muted underline hover:text-ink"
        >
          {mode === 'login' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}
        </button>
      </Card>
    </div>
  );
}
