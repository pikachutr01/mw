/**
 * ⭐ HESAP PANELİ (§9.2) — Seçenekler ekranında: e-posta + doğrulama rozeti + şifre değiştirme.
 *
 * "Yakında" listesinden **Şifre değiştirme** maddesini düşürür.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, getSession } from '../lib/api.ts';
import { useAccount, useCities } from '../lib/queries.ts';
import { useConfirm } from './Modal.tsx';
import { ThemePicker } from './ThemePicker.tsx';
import { Badge, Button, ErrorBox, Field, Input, Panel } from './ui.tsx';

export function AccountPanel(): React.ReactElement {
  const session = getSession();
  const cities = useCities();
  // ⚠️ Şerit ve sohbet penceresiyle AYNI sorgu (`['account']`) — üç ayrı fetch yerine tek anahtar.
  const info = useAccount().data ?? null;
  const [resendState, setResendState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState<unknown>(null);
  const [open, setOpen] = useState<'password' | 'email' | null>(null);

  const resend = async (): Promise<void> => {
    setResendState('busy');
    setResendError(null);
    try {
      await api('/api/v1/auth/verify-email/resend', { method: 'POST' });
      setResendState('sent');
    } catch (err) {
      setResendError(err);
      setResendState('error');
    }
  };

  return (
    <>
      {/* Tema seçici başlık bandının sağında — kendi kartı 2026-08-02'de kaldırıldı. */}
      <Panel title="Hesap" right={<ThemePicker />}>
        <div className="space-y-1 p-3 text-sm">
          <div className="text-ink">{session?.username}</div>
          <div className="text-xs text-muted">
            Dünya {session?.worldId} · {cities.data?.cities.length ?? 0} şehir
          </div>
          {info?.email ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted">{info.email}</span>
              {info.emailVerified
                ? <Badge tone="success">doğrulandı</Badge>
                : <Badge tone="warning">doğrulanmadı</Badge>}
            </div>
          ) : null}
        </div>

        {info && !info.emailVerified ? (
          <div className="border-t border-border px-3 py-2">
            {/* ⭐ Kısıtların TAM listesi yalnız BURADA (kullanıcı, 2026-08-01): şerit ve satır
                altları kısa kalıyor, ayrıntıyı merak eden hesabına bakıyor. */}
            <p className="mb-2 text-xs text-muted">
              Doğrulayana kadar <strong>saldırı, nakliye, yeni şehir, savunma ünitesi, ittifak
              ve mesaj yazma kapalı</strong>; yapı ve tekniklerin en fazla 3. seviyeye çıkar ve
              en çok 200 savaşçın olabilir. Ayrıca <strong>şifreni sıfırlayamazsın</strong>.
              Doğrulama bağlantısı gelmediyse gereksiz/spam klasörüne de bak.
            </p>
            {resendState === 'sent' ? (
              <p className="text-xs text-ink">Gönderdik. Gelen kutunu kontrol et.</p>
            ) : (
              <Button variant="ghost" disabled={resendState === 'busy'} onClick={() => void resend()}>
                Doğrulama E-postasını Tekrar Gönder
              </Button>
            )}
            {resendState === 'error' ? <ErrorBox error={resendError} /> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
          <Button variant="ghost" onClick={() => setOpen(open === 'password' ? null : 'password')}>
            {open === 'password' ? 'Vazgeç' : 'Şifre Değiştir'}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(open === 'email' ? null : 'email')}>
            {open === 'email' ? 'Vazgeç' : 'E-posta Değiştir'}
          </Button>
        </div>

        {open === 'password' ? <ChangePassword onDone={() => setOpen(null)} /> : null}
        {open === 'email' ? <ChangeEmail onDone={() => setOpen(null)} /> : null}
      </Panel>
    </>
  );
}

/**
 * ⭐ HESAP SİLME (kullanıcı, 2026-08-01) — **ayrı panel**, Hesap panelinin içinde değil.
 *
 * ⚠️ Bilinçli olarak ayrı ve **sayfanın EN ALTINDA**: geri alınamaz tek işlem bu ve "şifre
 * değiştir"in yanında duran bir düğme olarak yanlışlıkla tıklanmaya davetiye çıkarırdı.
 *
 * ⚠️⚠️ **Yorum uzun süre gerçeğe uymuyordu.** "En altta" yazıyordu ama panel `AccountPanel`in
 * içinden çıktığı için ekranda **ikinci sırada**, diğer kartların ÜSTÜNDE duruyordu
 * (kullanıcı, 2026-08-06). Artık `OptionsScreen`in en sonunda çiziliyor ve doğrulama bilgisini
 * kendi okuyor — `useAccount()` zaten paylaşılan bir sorgu (`['account']`), ek istek doğmuyor.
 *
 * ⚠️ Düğme silmez, **bağlantı ister**. Silme, e-postadaki tek kullanımlık bağlantıdan
 * açılan `/hesap-sil` sayfasında onaylanır (Google Play'in istediği akış).
 *
 * ⭐ **ÖNCE ONAY DİYALOĞU** (kullanıcı, 2026-08-10). Düğme doğrudan POST atıyordu: tek bir
 * yanlış tıklama, oyuncunun gelen kutusuna *"hesabını sil"* postası düşürüyordu. Geri
 * alınabilir bir adım olması onu zararsız yapmıyor — panik yaratan şey postanın kendisi.
 *
 * ⚠️ Onay, e-postadaki ikinci onayın YERİNE geçmiyor, ÜSTÜNE biniyor. İkisi farklı soruları
 * soruyor: bu, *"bağlantı istemek istediğine emin misin"*; oradaki, *"hesabı gerçekten
 * siliyoruz"*. Google Play akışı ikincisini zorunlu kılıyor, birincisini biz ekliyoruz.
 */
export function DeleteAccountPanel(): React.ReactElement {
  const verified = useAccount().data?.emailVerified ?? false;
  return <DeleteAccountBody verified={verified} />;
}

function DeleteAccountBody({ verified }: { verified: boolean }): React.ReactElement {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<unknown>(null);
  const confirm = useConfirm();

  const request = async (): Promise<void> => {
    /**
     * ⚠️ Metin, silmenin **sonuçlarını** tekrarlıyor — yukarıdaki paragrafı okumadan tıklayan
     * oyuncu da neyi kaybedeceğini görmeli. `danger: true` düğmeyi kırmızıya çeviriyor.
     */
    const ok = await confirm({
      title: 'Hesabını silmek istiyor musun?',
      danger: true,
      confirmLabel: 'Onay bağlantısı gönder',
      body: (
        <div className="space-y-2 text-sm">
          <p>
            E-posta adresine <strong>12 saat</strong> geçerli, tek kullanımlık bir onay
            bağlantısı göndereceğiz. Hesap o bağlantıya tıklayana kadar <strong>silinmez</strong>.
          </p>
          <p>
            Onayladığında e-postan, şifren ve oturumların silinir; başkentin dışındaki
            şehirlerin <strong>yıkılır</strong> ve bu işlem <strong>geri alınamaz</strong>.
          </p>
        </div>
      ),
    });
    if (!ok) return;

    setState('busy');
    setError(null);
    try {
      await api('/api/v1/auth/delete-account/request', { method: 'POST' });
      setState('sent');
    } catch (err) {
      setError(err);
      setState('idle');
    }
  };

  return (
    <Panel title="Hesabı Sil">
      <div className="space-y-2 p-3 text-xs text-muted">
        <p>
          Hesabını kalıcı olarak silebilirsin. E-posta adresine tek kullanımlık bir onay
          bağlantısı göndeririz; bağlantı <strong>12 saat</strong> geçerlidir.
        </p>
        <p>
          Onayladığında e-postan, şifren ve oturumların silinir; <strong>başkentin dışındaki
          şehirlerin yıkılır</strong>. Başkentin <strong>şu anki adıyla</strong> dünyada kalır;
          oyuncu adın anonimleşir ve şehrin hiçbir sıralamada görünmez.
        </p>
        {!verified ? (
          <p className="text-warning">
            ⚠️ Hesabını silebilmek için önce e-posta adresini doğrulaman gerekiyor.
          </p>
        ) : null}
      </div>
      <div className="border-t border-border px-3 py-2">
        {state === 'sent' ? (
          <p className="text-xs text-ink">
            Onay bağlantısını gönderdik. Gelen kutunu (ve gereksiz/spam klasörünü) kontrol et.
          </p>
        ) : (
          <Button variant="danger" disabled={!verified || state === 'busy'}
            onClick={() => void request()}>
            {state === 'busy' ? 'Gönderiliyor…' : 'Hesabımı Sil'}
          </Button>
        )}
        <ErrorBox error={error} />
      </div>
    </Panel>
  );
}

/**
 * ⭐ E-POSTA ADRESİ DEĞİŞTİRME (kullanıcı, 2026-08-01).
 *
 * ⚠️ Ekran, **doğrulamanın düşeceğini önceden söylüyor**. Kullanıcının tarifi bunu içeriyordu
 * ve sürpriz olarak yaşanması en kötü sonuç olurdu: oyuncu adresini düzeltmek isterken
 * kendini birden kısıtlı bir hesapta bulur.
 */
function ChangeEmail({ onDone }: { onDone: () => void }): React.ReactElement {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/v1/auth/change-email', {
        method: 'POST', body: { newEmail: email.trim(), currentPassword: password },
      });
      // Doğrulama durumu değişti → şerit, kısıt rozetleri ve katalog tavanları tazelenmeli.
      await qc.invalidateQueries({ queryKey: ['account'] });
      await qc.invalidateQueries({ queryKey: ['catalog'] });
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border p-3">
      <Field label="Yeni e-posta adresi">
        <Input type="email" required autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Mevcut parola">
        <Input type="password" required autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <p className="text-[11px] text-warning">
        ⚠️ Adresini değiştirince hesabın <strong>doğrulanmamış</strong> duruma düşer ve yeni
        adrese doğrulama bağlantısı gider. Doğrulayana kadar saldırı, nakliye ve mesaj yazma
        kapanır; yapı ve tekniklerin <strong>mevcut seviyeleri korunur</strong> ama daha
        yükseğe çıkamazsın.
      </p>
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? 'Bekleyin…' : 'Değiştir'}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Vazgeç</Button>
      </div>
    </form>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }): React.ReactElement {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mismatch = again !== '' && next !== again;

  if (done) {
    return (
      <div className="space-y-2 border-t border-border p-3 text-sm">
        <p className="text-ink">Şifren değiştirildi ve diğer cihazlardaki oturumların kapatıldı.</p>
        <p className="text-xs text-muted">
          Bu cihazda açık kalmaya devam ediyorsun. Bilgilendirme e-postası da gönderildi.
        </p>
        <Button variant="ghost" onClick={onDone}>Kapat</Button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (mismatch) return;
    setError(null);
    setBusy(true);
    try {
      await api('/api/v1/auth/change-password', {
        method: 'POST', body: { currentPassword: current, newPassword: next },
      });
      /**
       * ⚠️ **Artık sayfa yeniden YÜKLENMİYOR.** Sunucu 2026-08-01'den beri yalnız DİĞER
       * cihazları düşürüyor (`revokeOtherChains`), bu oturum ayakta kalıyor — oyuncuyu kendi
       * şifresini değiştirdiği için oyundan atmak gereksiz bir cezaydı.
       */
      setDone(true);
      setBusy(false);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border p-3">
      <Field label="Mevcut parola">
        <Input type="password" required autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="Yeni parola (en az 8 karakter)">
        <Input type="password" required minLength={8} autoComplete="new-password"
          value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Yeni parola (tekrar)">
        <Input type="password" required minLength={8} autoComplete="new-password"
          value={again} onChange={(e) => setAgain(e.target.value)} />
      </Field>
      {mismatch ? <p className="text-xs text-danger">İki parola aynı değil.</p> : null}
      <p className="text-[11px] text-muted">
        Değiştirdiğinde <strong>diğer</strong> cihazlardaki oturumların kapanır; bu cihazda açık
        kalırsın. E-posta adresine bilgilendirme gönderilir.
      </p>
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || mismatch}>
          {busy ? 'Bekleyin…' : 'Değiştir'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>Vazgeç</Button>
      </div>
    </form>
  );
}
