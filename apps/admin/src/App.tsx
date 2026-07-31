/**
 * ⭐ YÖNETİM PANELİ KABUĞU (Faz 0).
 *
 * Üç durum var ve üçü de sunucudan gelir, istemci tahmin etmez:
 *   oturum yok        → giriş formu
 *   oturum var, yetki yok → "yetkin yok" (403 gövdesi aynen gösterilir)
 *   yetki var         → kabuk + ekranlar
 *
 * ⚠️ Yetki kontrolü **istemcide yapılmaz**, `/admin/me` çağrısının sonucundan okunur. İstemci
 * tarafında bir `if (role === 'admin')` yazsaydık bu bir güvenlik sınırı gibi görünür ama
 * olmazdı — gerçek sınır `AdminGuard`.
 */
import { useCallback, useEffect, useState } from 'react';
import { getSession, login, setSession, type AdminSession } from './lib/api.ts';
import { fetchMe, stepDown, stepUp, type AdminMe } from './lib/admin.ts';
import { Badge, Button, ErrorBox, Field, Input, Panel } from './components/ui.tsx';
import { SettingsScreen } from './screens/Settings.tsx';
import { WorldsScreen } from './screens/Worlds.tsx';

/** Faz 1'de iki ekran var; kalanlar sırayla açılacak. */
type Tab = 'worlds' | 'settings' | 'soon';

export function App() {
  const [session, setSessionState] = useState<AdminSession | null>(getSession);
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('worlds');
  /**
   * ⭐ Yükseltme diyaloğu TEK YERDE (üst şerit). Ekranlar 403 alınca `onNeedStepUp` çağırır;
   * her ekran kendi diyalog kopyasını taşısaydı 15 dakika dolduğunda hangisinin açılacağı
   * ekrana göre değişirdi.
   */
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const refreshMe = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setMe(await fetchMe());
    } catch (err) {
      setMe(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) { setMe(null); return; }
    void refreshMe();
  }, [session, refreshMe]);

  if (!session) {
    return <LoginScreen onDone={(s) => setSessionState(s)} />;
  }

  return (
    <div className="min-h-dvh">
      <TopBar
        me={me}
        onSignOut={() => { setSession(null); setSessionState(null); }}
        onElevated={() => void refreshMe()}
        stepUpOpen={stepUpOpen}
        setStepUpOpen={setStepUpOpen}
      />
      <main className="mx-auto max-w-5xl space-y-3 p-3">
        {loading && !me ? <p className="text-sm text-muted">Yükleniyor…</p> : null}
        <ErrorBox error={error} />
        {me ? (
          <>
            <Tabs value={tab} onChange={setTab} />
            {tab === 'worlds'
              ? <WorldsScreen onNeedStepUp={() => setStepUpOpen(true)} />
              : tab === 'settings'
                ? <SettingsScreen worldId={session.worldId} onNeedStepUp={() => setStepUpOpen(true)} />
                : <Placeholder />}
          </>
        ) : null}
      </main>
    </div>
  );
}

function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const items: [Tab, string][] = [
    ['worlds', 'Dünya'], ['settings', 'Ayarlar'], ['soon', 'Sıradakiler'],
  ];
  return (
    <div className="flex gap-1">
      {items.map(([id, label]) => (
        <button key={id} type="button" onClick={() => onChange(id)}
          className={`flex-1 rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs ${
            value === id
              ? 'border-strong bg-accent text-on-accent'
              : 'border-border bg-surface text-muted hover:bg-raised'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}

/* ═══ Giriş ═════════════════════════════════════════════════════════════════ */

function LoginScreen({ onDone }: { onDone: (s: AdminSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await login({ username, password, worldId: 1 }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3">
        <h1 className="display text-center text-lg tracking-wide text-ink">MOBIWAR · YÖNETİM</h1>
        <Panel title="Giriş">
          <div className="space-y-3 p-3">
            {/* ⚠️ KULLANICI ADI, e-posta değil: oyunun `/auth/login` ucu `username` bekliyor
                (`loginRequest`, en fazla 10 karakter). E-posta yalnız doğrulama ve şifre
                sıfırlama akışlarında kullanılıyor. */}
            <Field label="Kullanıcı adı">
              <Input type="text" required autoComplete="username" maxLength={10}
                value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Parola">
              <Input type="password" required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <ErrorBox error={error} />
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </Button>
          </div>
        </Panel>
        {/* ⚠️ "Şifremi unuttum" BİLEREK yok: kurtarma akışı oyun tarafında; panel giriş
            noktası olmamalı. */}
      </form>
    </div>
  );
}

/* ═══ Üst şerit ═════════════════════════════════════════════════════════════ */

function TopBar({ me, onSignOut, onElevated, stepUpOpen, setStepUpOpen }: {
  me: AdminMe | null;
  onSignOut: () => void;
  onElevated: () => void;
  stepUpOpen: boolean;
  setStepUpOpen: (v: boolean) => void;
}) {
  const [open, setOpen] = [stepUpOpen, setStepUpOpen];

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-panel-header px-3 py-2">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <span className="display text-sm tracking-wider text-on-panel-header">
          MOBIWAR · YÖNETİM
        </span>
        <div className="flex items-center gap-2 text-xs text-on-panel-header">
          {me ? (
            <>
              <span>{me.username}</span>
              <Badge tone={me.role === 'admin' ? 'success' : 'muted'}>{me.role}</Badge>
              {/* ⭐ Yükseltme durumu HER ZAMAN görünür: oyuncu "neden 403 aldım" diye
                  aramasın, üstte yazıyor. */}
              {me.elevated
                ? <Badge tone="warning">yükseltilmiş</Badge>
                : <Badge>salt-okunur</Badge>}
              {me.elevated
                ? <Button variant="ghost" onClick={() => void stepDown().then(onElevated)}>
                    Yükseltmeyi bırak
                  </Button>
                : <Button variant="ghost" onClick={() => setOpen(true)}>Yükselt</Button>}
            </>
          ) : null}
          <Button variant="ghost" onClick={onSignOut}>Çıkış</Button>
        </div>
      </div>
      {open ? (
        <StepUpDialog
          minutes={me?.stepUpMinutes ?? 15}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); onElevated(); }}
        />
      ) : null}
    </header>
  );
}

function StepUpDialog({ minutes, onClose, onDone }: {
  minutes: number; onClose: () => void; onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await stepUp(password);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <Panel title="Yetki yükseltme">
          <div className="space-y-3 p-3">
            <p className="text-xs text-muted">
              Yıkıcı işlemler (silme, sabit kaydetme, ham düzenleme) için parolanı yeniden gir.
              Yükseltme <b>{minutes} dakika</b> geçerli ve yalnız <b>bu oturumda</b>.
            </p>
            <Field label="Parola">
              <Input type="password" required autoFocus autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <ErrorBox error={error} />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>{busy ? 'Kontrol ediliyor…' : 'Yükselt'}</Button>
              <Button type="button" variant="ghost" onClick={onClose}>Vazgeç</Button>
            </div>
          </div>
        </Panel>
      </form>
    </div>
  );
}

/**
 * Faz 0 kabuğu boş; ekranlar sonraki fazlarda geliyor. Boş bırakmak yerine sırayı yazıyoruz —
 * oyun tarafındaki `Placeholders.tsx` ile aynı gerekçe: neyin eksik olduğu ekrandan görünsün.
 */
function Placeholder() {
  const rows: [string, string, boolean][] = [
    ['Dünya', 'hız çarpanları · manuel sıralama', true],
    ['Ayarlar', 'işletim limitleri (sohbet · bildirim · posta)', true],
    ['Bakım modu', 'donma · istemci perdesi · mutasyon kilidi', false],
    ['Oturumlar', 'cihaz listesi · uzaktan çıkış', false],
    ['Motor sabitleri', 'savaş config\'i · önizleme', false],
    ['Katalog', 'birim/yapı/teknik fiyat ve süreleri', false],
    ['Oyuncular ve moderasyon', 'arama · şikayet kuyruğu · ban', false],
    ['Veri tabanı', 'tablo tarayıcı · küratörlü aksiyonlar · ham kip', false],
    ['Bakım/performans', 'tablo boyutları · temizlik görevleri', false],
  ];
  return (
    <Panel title="Fazlar" right="Faz 1 bitti">
      <ul className="divide-y divide-border">
        {rows.map(([name, desc, done]) => (
          <li key={name} className="flex items-baseline justify-between gap-3 px-3 py-2">
            <span className="text-sm text-ink">
              {done ? '✅ ' : '⏳ '}{name}
            </span>
            <span className="text-xs text-muted">{desc}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
