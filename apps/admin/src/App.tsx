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
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { USERNAME_MAX, USERNAME_MIN } from '@mobilwar/catalog';
import { getSession, login, setSession, type AdminSession } from './lib/api.ts';
import { fetchMe, stepDown, stepUp, type AdminMe } from './lib/admin.ts';
import { Badge, Button, Countdown, ErrorBox, Field, Input, Panel } from './components/ui.tsx';
import { AbuseScreen } from './screens/Abuse.tsx';
import { SignupsScreen } from './screens/Signups.tsx';
import { AnnounceScreen } from './screens/Announce.tsx';
import { MissionsScreen } from './screens/Missions.tsx';
import { DatabaseScreen } from './screens/Database.tsx';
import { HealthScreen } from './screens/Health.tsx';
import { BulkScreen } from './screens/Bulk.tsx';
import { ModerationScreen } from './screens/Moderation.tsx';
import { PlayersScreen } from './screens/Players.tsx';
import { SettingsScreen } from './screens/Settings.tsx';
import { WorldsScreen } from './screens/Worlds.tsx';

/**
 * ⭐ Sekmeler artık **rota** (panel 2. nesil). `useState<Tab>` üç şeyi imkânsız kılıyordu:
 * derin bağlantı, tarayıcı geri tuşu, yenilemede yerinde kalma.
 *
 * ⚠️ «Oturumlar» sekmesi kalktı — içeriği `/oyuncular/:id/oturumlar` altına taşındı. Oyuncu
 * verisi üç sekmeye dağılmış olduğu için (arama Oturumlar'da, künye Moderasyon'da, ordular
 * Veri tabanı'nda) "bu oyuncuda ne oluyor" sorusu üç ekran geziyordu.
 */
const NAV: [string, string][] = [
  ['/oyuncular', 'Oyuncular'],
  ['/dunya', 'Dünya'],
  // ⭐ «Görevler» Dünya'dan ayrı: orası dünyanın AYARLARI, bu ise o an akan trafik.
  ['/gorevler', 'Görevler'],
  ['/ayarlar', 'Ayarlar'],
  ['/toplu', 'Toplu işlem'],
  ['/moderasyon', 'Moderasyon'],
  // ⭐ «Duyuru» Moderasyon'dan AYRI: orası bir oyuncuya KARŞI yapılan işi topluyor (yasak,
  // şikâyet), bu ise oyunculara YÖNELİK bilgilendirme. Birleştirmek "herkese duyur"
  // düğmesini ceza düğmelerinin arasına koymak olurdu.
  ['/duyuru', 'Duyuru'],
  // ⭐ «Çoklu hesap» Moderasyon'dan AYRI sekme: o ekran gelen ŞİKAYETİ işliyor (birileri
  // bildirdi), bu ise kimsenin bildirmediği bir deseni arıyor. İkisini birleştirmek, ikinci
  // listenin birincinin altında kaybolması demekti.
  ['/coklu-hesap', 'Çoklu hesap'],
  // ⭐ «Kayıtlar» AYRI sekme: «Çoklu hesap» oyun İÇİNDEKİ ilişkiye bakıyor, bu ise hesabın
  // DOĞDUĞU ana. Birleştirseydik iki farklı soru tek listede karışırdı.
  ['/kayitlar', 'Kayıtlar'],
  ['/veri', 'Veri tabanı'],
  ['/bakim', 'Bakım'],
];

export function App() {
  const [session, setSessionState] = useState<AdminSession | null>(getSession);
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  /**
   * ⭐ Yükseltme diyaloğu TEK YERDE (üst şerit). Ekranlar 403 alınca `onNeedStepUp` çağırır;
   * her ekran kendi diyalog kopyasını taşısaydı 15 dakika dolduğunda hangisinin açılacağı
   * ekrana göre değişirdi.
   */
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const openStepUp = useCallback(() => setStepUpOpen(true), []);

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
            <Tabs />
            <Routes>
              {/* ⭐ Açılış artık Oyuncular: panelin en sık sorulan sorusu "bu oyuncuda ne oluyor". */}
              <Route path="/" element={<Navigate to="/oyuncular" replace />} />
              <Route path="/oyuncular" element={<PlayersScreen onNeedStepUp={openStepUp} />} />
              {/* Aynı bileşen üç yol için: liste hep açık kalsın, altında künye değişsin. */}
              <Route path="/oyuncular/:playerId" element={<PlayersScreen onNeedStepUp={openStepUp} />} />
              <Route path="/oyuncular/:playerId/:tab" element={<PlayersScreen onNeedStepUp={openStepUp} />} />
              <Route path="/dunya" element={<WorldsScreen onNeedStepUp={openStepUp} />} />
              <Route path="/gorevler" element={<MissionsScreen worldId={session.worldId} />} />
              <Route
                path="/ayarlar"
                element={<SettingsScreen worldId={session.worldId} onNeedStepUp={openStepUp} />}
              />
              <Route path="/toplu" element={<BulkScreen onNeedStepUp={openStepUp} />} />
              <Route path="/moderasyon" element={<ModerationScreen onNeedStepUp={openStepUp} />} />
              <Route
                path="/duyuru"
                element={<AnnounceScreen worldId={session.worldId} onNeedStepUp={openStepUp} />}
              />
              <Route
                path="/coklu-hesap"
                element={<AbuseScreen worldId={session.worldId} onNeedStepUp={openStepUp} />}
              />
              <Route
                path="/kayitlar"
                element={<SignupsScreen worldId={session.worldId} onNeedStepUp={openStepUp} />}
              />
              <Route path="/veri" element={<DatabaseScreen onNeedStepUp={openStepUp} />} />
              <Route path="/bakim" element={<HealthScreen onNeedStepUp={openStepUp} />} />
              <Route path="*" element={<Navigate to="/oyuncular" replace />} />
            </Routes>
          </>
        ) : null}
      </main>
    </div>
  );
}

/**
 * ⚠️ `flex-wrap` + `basis` — sekme sayısı 11'e çıkınca (2026-08-05: Duyuru ve Görevler)
 * tek satır dar pencerede TAŞIYOR ve **sayfanın gövdesi yatay kayıyordu**; son sekme
 * ekran dışında kalıyordu. `flex-1` tek başına yetmiyor çünkü etiketler kelime kelime
 * sarılıp satır yüksekliğini büyütmekten başka bir şey yapamıyor.
 */
function Tabs() {
  return (
    <div className="flex flex-wrap gap-1">
      {NAV.map(([to, label]) => (
        <NavLink
          key={to} to={to}
          className={({ isActive }) => `flex-1 basis-[7.5rem] rounded-[var(--radius-sm)] border px-2 py-1.5
            text-center text-xs ${
    isActive
      ? 'border-strong bg-accent text-on-accent'
      : 'border-border bg-surface text-muted hover:bg-raised'
    }`}
        >
          {label}
        </NavLink>
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
      /*
       * ⚠️ `worldId: 1` SABİT — oyun tarafı 2026-08-03'te dünya seçicisi kazandı, panel
       * kazanmadı. Bilerek: rol **hesap** düzeyinde (`accounts.role`) ve bir admin tüm
       * dünyaları yönetiyor; giriş yalnız oturumun hangi oyuncu satırına bağlanacağını
       * belirliyor. ⚠️ Yine de bir tuzağı var: yönetici hesabının 1 numaralı dünyada bir
       * `players` satırı YOKSA giriş sessizce «invalid_credentials» döner — mesaj "parolan
       * yanlış" der ama sebep dünyadır. İkinci dünya açıldığı gün buraya da seçici gerekecek.
       */
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
        <h1 className="display text-center text-lg tracking-wide text-ink">MOBILWAR · YÖNETİM</h1>
        <Panel title="Giriş">
          <div className="space-y-3 p-3">
            {/* ⚠️ KULLANICI ADI, e-posta değil: oyunun `/auth/login` ucu `username` bekliyor.
                E-posta yalnız doğrulama ve şifre sıfırlama akışlarında kullanılıyor.

                ⚠️ Sınır **katalogdan** okunuyor, elle yazılmıyor: burada sabit `10` duruyordu
                ve tavan 2026-08-01'de 15'e çıkınca bayatladı — 15 karakterli adı olan bir
                yönetici panele giremiyordu (2026-08-03'te kullanıcı bildirdi). `name-rules.ts`
                bu sayının TEK kaynağı; oyun tarafındaki `AuthModal` da oradan besleniyor. */}
            <Field label="Kullanıcı adı">
              <Input type="text" required autoComplete="username"
                minLength={USERNAME_MIN} maxLength={USERNAME_MAX}
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
          MOBILWAR · YÖNETİM
        </span>
        <div className="flex items-center gap-2 text-xs text-on-panel-header">
          {me ? (
            <>
              <span>{me.username}</span>
              <Badge tone={me.role === 'admin' ? 'success' : 'muted'}>{me.role}</Badge>
              {/* ⭐ Yükseltme durumu HER ZAMAN görünür: oyuncu "neden 403 aldım" diye
                  aramasın, üstte yazıyor. */}
              {me.elevated
                ? (
                  <>
                    <Badge tone="warning">yükseltilmiş</Badge>
                    {/* ⭐ 15 dakika sessizce doluyordu; yönetici bunu ancak 403 alınca
                        fark ediyordu. Veri baştan beri vardı, gösterimi yoktu. */}
                    <Countdown until={me.elevatedUntil} />
                  </>
                )
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
