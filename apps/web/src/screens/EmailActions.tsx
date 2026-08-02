/**
 * ⭐ E-POSTA BAĞLANTILARININ AÇTIĞI EKRANLAR (§9.2): doğrulama ve şifre sıfırlama.
 *
 * ⚠️ İkisi de **oturum GEREKTİRMEZ** ve `App.tsx`te `Shell`in dışında yaşar: bağlantı çoğu
 * zaman başka bir cihazda (telefonun posta uygulaması) açılır. Oturum şartı konsaydı
 * doğrulama, "önce giriş yap" duvarına çarpardı — oysa doğrulamanın amacı zaten oturum
 * açamayan kullanıcıya yardım etmek.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { Button, Card, ErrorBox, Field, Input } from '../components/ui.tsx';

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-sm p-5">
        <h1 className="display mb-1 text-2xl font-semibold text-ink">MobilWar</h1>
        <p className="mb-4 text-sm text-muted">{title}</p>
        {children}
      </Card>
    </div>
  );
}

/** `/verify-email?token=…` — jetonu tüketir, sonucu gösterir. */
export function VerifyEmailScreen(): React.ReactElement {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<'busy' | 'ok' | 'fail'>('busy');
  const [error, setError] = useState<unknown>(null);
  /**
   * ⚠️ **TEK KULLANIMLIK JETON + ÇİFT ETKİ = SAHTE HATA.** React StrictMode geliştirmede her
   * etkiyi İKİ KEZ koşturuyor: birinci istek jetonu tüketip başarılı oluyor, ikincisi
   * "kullanılmış" diye reddediliyor ve SONRA geldiği için ekrana *"Bağlantı geçersiz"* yazıyor.
   * Doğrulama aslında olmuş, kullanıcı olmadı sanıyor. (Canlı denemede tam bu yaşandı;
   * `email_verified_at` DB'de doluyken ekran hata gösteriyordu.)
   *
   * `alive` bayrağı bunu ÇÖZMEZ — o yalnız sonucu yok sayar, İKİNCİ İSTEĞİ ENGELLEMEZ.
   * Jeton başına tek istek için ref şart.
   */
  const requested = useRef<string | null>(null);

  const token = params.get('token') ?? '';

  useEffect(() => {
    if (!token) { setState('fail'); return; }
    if (requested.current === token) return;
    requested.current = token;
    void api('/api/v1/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('ok'))
      .catch((err: unknown) => { setError(err); setState('fail'); });
  }, [token]);

  return (
    <Frame title={state === 'busy' ? 'Doğrulanıyor…' : state === 'ok' ? 'Hazır.' : 'Olmadı.'}>
      {state === 'ok' ? (
        <>
          <p className="mb-4 text-sm text-ink">
            E-posta adresin doğrulandı. Artık şifreni unutursan hesabını geri alabilirsin.
          </p>
          <Button className="w-full" onClick={() => navigate('/armies')}>Oyuna dön</Button>
        </>
      ) : state === 'fail' ? (
        <>
          {/* ⚠️ Burası "Seçenekler → Bildirimler" diyordu ve YANLIŞTI: tekrar gönder düğmesi
              **Hesap** panelinde (`AccountPanel.tsx`). Oyuncuyu bulunmayan bir yere yolluyordu. */}
          <p className="mb-3 text-sm text-ink">
            Bağlantı geçersiz ya da süresi dolmuş. Oyuna girip <strong>Seçenekler → Hesap</strong>
            {' '}bölümünden yeni bir doğrulama e-postası isteyebilirsin.
          </p>
          <ErrorBox error={error} />
          <Button className="mt-3 w-full" onClick={() => navigate('/armies')}>Oyuna dön</Button>
        </>
      ) : null}
    </Frame>
  );
}

/** `/reset-password?token=…` — yeni parolayı alır, tüm oturumları düşürür. */
export function ResetPasswordScreen(): React.ReactElement {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const token = params.get('token') ?? '';
  const mismatch = again !== '' && password !== again;

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (mismatch) return;
    setError(null);
    setBusy(true);
    try {
      await api('/api/v1/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <Frame title="Bağlantı eksik.">
        <p className="mb-4 text-sm text-ink">
          Sıfırlama bağlantısı geçersiz görünüyor. Giriş ekranından «Şifremi unuttum» ile
          yenisini iste.
        </p>
        <Button className="w-full" onClick={() => navigate('/')}>Giriş ekranı</Button>
      </Frame>
    );
  }

  if (done) {
    return (
      <Frame title="Şifren değişti.">
        <p className="mb-4 text-sm text-ink">
          Yeni şifrenle giriş yapabilirsin. Güvenlik için açık olan <strong>tüm oturumların
          kapatıldı</strong> — diğer cihazlarında yeniden giriş yapman gerekecek.
        </p>
        <Button className="w-full" onClick={() => { window.location.href = '/'; }}>
          Giriş yap
        </Button>
      </Frame>
    );
  }

  return (
    <Frame title="Yeni şifreni belirle.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Yeni parola (en az 8 karakter)">
          <Input type="password" required minLength={8} autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Yeni parola (tekrar)">
          <Input type="password" required minLength={8} autoComplete="new-password"
            value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
        {mismatch ? (
          <p className="text-xs text-danger">İki parola aynı değil.</p>
        ) : null}
        <ErrorBox error={error} />
        <Button type="submit" disabled={busy || mismatch} className="w-full">
          {busy ? 'Bekleyin…' : 'Şifreyi Değiştir'}
        </Button>
      </form>
    </Frame>
  );
}
