/**
 * ⭐ HESAP SİLME SAYFASI (`/hesap-sil`) — kullanıcı, 2026-08-01.
 *
 * ⚠️ **Oturum GEREKTİRMEZ** ve `Shell`in dışında yaşar (`EmailActions.tsx` ile aynı gerekçe):
 * bağlantı çoğu zaman telefonun posta uygulamasından, oturumsuz bir tarayıcıda açılır.
 * Google Play'in hesap silme için istediği "herkese açık sayfa" da tam olarak budur.
 *
 * ⚠️ Sayfa **jetonsuz da açılabilir**: mağaza listelemesindeki bağlantı doğrudan buraya
 * gelir ve o hâlde yönerge gösterir. Jetonsuz açılışta hata ekranı göstermek, mağaza
 * incelemesinde "sayfa çalışmıyor" olarak okunurdu.
 *
 * ⭐⭐ **TEK SAYFA, İKİ İŞ** (kullanıcı, 2026-08-12): jetonsuz açılışta artık yalnız yönerge
 * değil, **silme isteği formu** da var. Eskiden buradaki tek yol *"oyuna gir → Seçenekler →
 * Hesap"* idi ve bu, sayfayı tam da en çok ihtiyaç duyulan durumda işe yaramaz kılıyordu:
 * parolasını unutmuş, cihazını değiştirmiş ya da uygulamayı silmiş oyuncu oyuna **giremediği
 * için** hesabını da silemiyordu. Mağaza incelemelerinin aradığı "giriş yapmadan silme talebi"
 * şartı da tam olarak bu.
 *
 * ⚠️ İKİ AŞAMA: önce özet (`preview`, jetonu TÜKETMEZ), sonra onay (`delete`, tüketir).
 * Tek aşamalı yapsaydık bağlantıya tıklayan oyuncu ne olacağını görmeden silinirdi. Form bu
 * iki aşamayı **atlatmaz** — yalnız birinci aşamanın bağlantısını üretir.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { Button, Card, ErrorBox, Field, Input } from '../components/ui.tsx';

interface Preview {
  username: string;
  worldName: string;
  capital: { id: number; name: string; k: number; d: number; s: number } | null;
  razed: { id: number; name: string; k: number; d: number; s: number }[];
  blockers: string[];
}

const coords = (c: { k: number; d: number; s: number }): string => `${c.k}:${c.d}:${c.s}`;

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-md p-5">
        <h1 className="display mb-1 text-2xl font-semibold text-ink">MobilWar</h1>
        <p className="mb-4 text-sm text-muted">{title}</p>
        {children}
      </Card>
    </div>
  );
}

export function DeleteAccountScreen(): React.ReactElement {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [preview, setPreview] = useState<Preview | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'fail'>('busy');
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ username: string; razed: number } | null>(null);
  /** ⚠️ StrictMode çift etkisi: özet çağrısı jetonu tüketmiyor ama iki kez sorgulamak da gereksiz. */
  const asked = useRef<string | null>(null);

  /* ── Jetonsuz açılışın silme isteği formu (2026-08-12) ────────────────────── */
  const [email, setEmail] = useState('');
  const [mail, setMail] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [mailError, setMailError] = useState<unknown>(null);

  useEffect(() => {
    if (!token) { setState('idle'); return; }
    if (asked.current === token) return;
    asked.current = token;
    void api<Preview>('/api/v1/auth/delete-account/preview', { method: 'POST', body: { token } })
      .then((p) => { setPreview(p); setState('idle'); })
      .catch((err: unknown) => { setError(err); setState('fail'); });
  }, [token]);

  /**
   * Silme bağlantısı iste — **oturum gerekmez**.
   *
   * ⚠️ Sunucu bu uçta DAİMA 204 döner (adres kayıtlı olmasa, doğrulanmamış olsa ya da kota
   * dolmuş olsa bile). Bu yüzden ekrandaki cevap da **koşulsuz aynı**: aksi hâlde arayüz,
   * sunucunun bilerek sızdırmadığı "bu adres kayıtlı mı" bilgisini ele verirdi.
   */
  const requestLink = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setMailError(null);
    setMail('busy');
    try {
      await api('/api/v1/auth/delete-account/request-by-email', {
        method: 'POST', body: { email },
      });
      setMail('sent');
    } catch (err) {
      // ⚠️ Buraya yalnız ağ/429 düşer — "adres yok" hatası tanımı gereği gelmiyor.
      setMailError(err);
      setMail('idle');
    }
  };

  /* ── Jetonsuz açılış: silme isteği formu + mağaza yönergesi ───────────────── */
  if (!token) {
    return (
      <Frame title="Hesap silme">
        <div className="space-y-3 text-sm text-ink">
          {mail === 'sent' ? (
            <div className="rounded-[var(--radius-sm)] border border-border bg-raised p-3">
              <p className="mb-1 font-semibold text-ink">E-postanı kontrol et.</p>
              {/* ⚠️ «Gönderdik» DEĞİL «varsa gönderdik» — sayım sızdırmama kuralı arayüzde de
                  sürüyor. Kesin konuşan bir cümle, ucu hesap sorgulama aracına çevirirdi. */}
              <p className="text-xs text-muted">
                <strong className="text-ink">{email}</strong> adresine kayıtlı ve
                doğrulanmış bir hesap varsa silme bağlantısını gönderdik. Bağlantı{' '}
                <strong className="text-ink">12 saat</strong> geçerli ve tek kullanımlık.
                Bağlantıya tıkladığında neyin silineceğini gösteren bir onay ekranı açılır —
                <strong className="text-ink"> hesabın o ekranda onaylamadan silinmez</strong>.
              </p>
              <button type="button"
                className="mt-2 text-xs text-muted underline hover:text-ink"
                onClick={() => { setMail('idle'); setEmail(''); }}>
                Başka bir adres dene
              </button>
            </div>
          ) : (
            <form onSubmit={requestLink} className="space-y-3">
              <p>
                Hesabını silmek için e-posta adresini yaz, sana tek kullanımlık bir onay
                bağlantısı gönderelim.
              </p>
              <Field label="E-posta adresin">
                <Input type="email" required maxLength={320} autoComplete="email"
                  placeholder="ornek@eposta.com"
                  value={email} onChange={(ev) => setEmail(ev.target.value)} />
              </Field>
              <ErrorBox error={mailError} />
              <Button type="submit" variant="danger" className="w-full" disabled={mail === 'busy'}>
                {mail === 'busy' ? 'Gönderiliyor…' : 'Silme bağlantısı gönder'}
              </Button>
              <p className="text-[11px] text-muted">
                Bu düğme hesabını <strong>silmez</strong>; yalnız onay bağlantısını yollar.
              </p>
            </form>
          )}

          <div className="rounded-[var(--radius-sm)] border border-border bg-raised p-3 text-xs text-muted">
            <p className="mb-1 font-semibold text-ink">Silme onaylandığında ne oluyor?</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li><strong>Silinen:</strong> e-posta adresin, şifren, tüm oturumların ve
                bildirim aboneliklerin.</li>
              <li><strong>Yıkılan:</strong> başkentin dışındaki tüm şehirlerin (içlerinde ordu
                olsa bile).</li>
              <li><strong>Kalan:</strong> başkentin <strong>şu anki adıyla</strong> dünyada
                durur, böylece diğer oyuncuların savaş geçmişinde delik oluşmaz. Yalnız
                <strong> oyuncu adın</strong> anonim bir adla değiştirilir.</li>
              <li><strong>Sıralamalar:</strong> şehrin oyuncu, ittifak ve kahraman
                sıralamalarının hiçbirinde görünmez; puanın ittifakının toplamına da eklenmez.</li>
            </ul>
          </div>
          <p className="text-xs text-muted">
            Oyuna girebiliyorsan <strong>Seçenekler → Hesap → Hesabımı Sil</strong> adımı da
            aynı bağlantıyı gönderir. E-posta adresini hiç doğrulamadıysan silme bağlantısı
            gönderemeyiz.
          </p>
        </div>
      </Frame>
    );
  }

  if (state === 'done' && result) {
    return (
      <Frame title="Hesabın silindi.">
        {/* ⚠️ `result.username` artık OYUNCU adı; şehrin adı değişmediği için burada şehir
            adı yazılmıyor — oyuncu onu zaten biliyor ve "adıyla duruyor" cümlesi eski
            davranışta iki şeyi birden anlatıyordu. */}
        <p className="mb-3 text-sm text-ink">
          Kişisel bilgilerin kaldırıldı ve tüm oturumların kapatıldı. Başkentin{' '}
          <strong>adı değişmeden</strong> dünyada duruyor
          {result.razed > 0 ? `; diğer ${result.razed} şehrin yıkıldı` : ''}. Oyuncu adın
          bundan sonra <strong>{result.username}</strong>.
        </p>
        <p className="text-xs text-muted">
          E-posta adresin serbest bırakıldı, istersen aynı adresle yeniden kayıt olabilirsin.
        </p>
      </Frame>
    );
  }

  if (state === 'fail') {
    return (
      <Frame title="Olmadı.">
        <p className="mb-3 text-sm text-ink">
          Bağlantı geçersiz, süresi dolmuş ya da zaten kullanılmış.
        </p>
        <ErrorBox error={error} />
        {/* ⚠️ Eskiden burada tek çare *"oyuna girip Seçenekler → Hesap"* yazıyordu; oysa
            bağlantısı ölmüş oyuncu çoğu zaman oyuna zaten giremiyor. Artık aynı sayfanın
            jetonsuz hâli yenisini üretebiliyor — `?token` olmadan açmak yeterli. */}
        <Button className="mt-3 w-full" onClick={() => { window.location.href = '/hesap-sil'; }}>
          Yeni bağlantı iste
        </Button>
      </Frame>
    );
  }

  if (!preview) return <Frame title="Yükleniyor…"><div /></Frame>;

  const blocked = preview.blockers.length > 0;

  const confirm = async (): Promise<void> => {
    setState('busy');
    setError(null);
    try {
      const r = await api<{ username: string; razed: number }>(
        '/api/v1/auth/delete-account', { method: 'POST', body: { token } },
      );
      setResult(r);
      setState('done');
      // ⚠️ Bu tarayıcıda oturum varsa artık ölü — kalıntıyı temizle, yoksa istemci ölü
      //    token'la çalışmaya çalışıp "beklenmedik hata" gösterir.
      localStorage.removeItem('mw-session');
    } catch (err) {
      setError(err);
      setState('idle');
    }
  };

  return (
    <Frame title={`${preview.username} · ${preview.worldName}`}>
      <div className="space-y-3 text-sm">
        <p className="text-ink">
          Hesabını silmek üzeresin. <strong className="text-danger">Bu işlem geri alınamaz.</strong>
        </p>

        <div className="rounded-[var(--radius-sm)] border border-danger/40 bg-danger/5 p-3 text-xs">
          <p className="mb-1 font-semibold text-danger">Silinecek</p>
          <ul className="list-disc space-y-0.5 pl-4 text-ink">
            <li>e-posta adresin, şifren ve tüm oturumların</li>
            <li>bildirim aboneliklerin</li>
          </ul>
          {preview.razed.length > 0 ? (
            <>
              <p className="mt-2 mb-1 font-semibold text-danger">
                Yıkılacak şehirler ({preview.razed.length})
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-ink">
                {preview.razed.map((c) => (
                  <li key={c.id}>{c.name} <span className="tnum text-muted">({coords(c)})</span></li>
                ))}
              </ul>
              <p className="mt-1 text-muted">⚠️ İçlerinde ordu olsa bile yıkılır.</p>
            </>
          ) : null}
        </div>

        {preview.capital ? (
          <div className="rounded-[var(--radius-sm)] border border-border bg-raised p-3 text-xs">
            <p className="mb-1 font-semibold text-ink">Kalacak</p>
            <p className="text-ink">
              Başkentin <strong>{preview.capital.name}</strong>{' '}
              <span className="tnum text-muted">({coords(preview.capital)})</span> dünyada
              <strong> bu adıyla</strong> kalır — şehrin adı değişmez. Yalnız{' '}
              <strong>oyuncu adın</strong> anonim bir adla değiştirilir.
            </p>
            {/* ⚠️ Sıralama cümlesi burada çünkü oyuncunun asıl merak ettiği "puanım ne olacak".
                Şehir kalıyor ve ganimet üretmeye devam ediyor; ama vitrinden tamamen çıkıyor. */}
            <p className="mt-1 text-muted">
              Şehrin dünyada gerçek bir şehir olarak durur (saldırılabilir, kaynak üretir) ama{' '}
              <strong>hiçbir sıralamada görünmez</strong>; ittifakındaysan üyeliğin sürer, puanın
              ittifakının toplamına eklenmez.
            </p>
          </div>
        ) : null}

        {blocked ? (
          <div className="rounded-[var(--radius-sm)] border border-warning bg-warning/10 p-3 text-xs text-warning">
            <p className="mb-1 font-semibold">Şu an silinemez</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {preview.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
            <p className="mt-1">Engel kalkınca bu bağlantıyı yeniden aç (12 saat geçerli).</p>
          </div>
        ) : null}

        <ErrorBox error={error} />

        <Button variant="danger" className="w-full"
          disabled={blocked || state === 'busy'}
          onClick={() => void confirm()}>
          {state === 'busy' ? 'Siliniyor…' : 'Hesabımı kalıcı olarak sil'}
        </Button>
        <p className="text-center text-[11px] text-muted">
          Vazgeçtiysen bu sayfayı kapatman yeterli — hiçbir şey değişmez.
        </p>
      </div>
    </Frame>
  );
}
