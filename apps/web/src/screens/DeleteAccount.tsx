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
 * ⚠️ İKİ AŞAMA: önce özet (`preview`, jetonu TÜKETMEZ), sonra onay (`delete`, tüketir).
 * Tek aşamalı yapsaydık bağlantıya tıklayan oyuncu ne olacağını görmeden silinirdi.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { Button, Card, ErrorBox } from '../components/ui.tsx';

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

  useEffect(() => {
    if (!token) { setState('idle'); return; }
    if (asked.current === token) return;
    asked.current = token;
    void api<Preview>('/api/v1/auth/delete-account/preview', { method: 'POST', body: { token } })
      .then((p) => { setPreview(p); setState('idle'); })
      .catch((err: unknown) => { setError(err); setState('fail'); });
  }, [token]);

  /* ── Jetonsuz açılış: mağaza için yönerge ─────────────────────────────────── */
  if (!token) {
    return (
      <Frame title="Hesap silme">
        <div className="space-y-3 text-sm text-ink">
          <p>
            MobilWar hesabını silmek için oyuna gir ve <strong>Seçenekler → Hesap → Hesabımı
            Sil</strong> adımını izle. E-posta adresine tek kullanımlık bir onay bağlantısı
            göndeririz; bağlantı <strong>12 saat</strong> geçerlidir.
          </p>
          <div className="rounded-[var(--radius-sm)] border border-border bg-raised p-3 text-xs text-muted">
            <p className="mb-1 font-semibold text-ink">Silme onaylandığında ne oluyor?</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li><strong>Silinen:</strong> e-posta adresin, şifren, tüm oturumların ve
                bildirim aboneliklerin.</li>
              <li><strong>Yıkılan:</strong> başkentin dışındaki tüm şehirlerin (içlerinde ordu
                olsa bile).</li>
              <li><strong>Kalan:</strong> başkentin dünyada durur, ama adın ve şehrin adı
                anonim bir adla değiştirilir — böylece diğer oyuncuların savaş geçmişi ve
                sıralaması bozulmaz.</li>
            </ul>
          </div>
          <p className="text-xs text-muted">
            E-posta adresini doğrulamadıysan önce onu doğrulaman gerekir; doğrulanmamış bir
            adrese hesap silme yetkisi göndermeyiz.
          </p>
        </div>
      </Frame>
    );
  }

  if (state === 'done' && result) {
    return (
      <Frame title="Hesabın silindi.">
        <p className="mb-3 text-sm text-ink">
          Kişisel bilgilerin kaldırıldı ve tüm oturumların kapatıldı. Başkentin dünyada{' '}
          <strong>{result.username}</strong> adıyla duruyor
          {result.razed > 0 ? `; diğer ${result.razed} şehrin yıkıldı` : ''}.
        </p>
        <p className="text-xs text-muted">
          E-posta adresin serbest bırakıldı — istersen aynı adresle yeniden kayıt olabilirsin.
        </p>
      </Frame>
    );
  }

  if (state === 'fail') {
    return (
      <Frame title="Olmadı.">
        <p className="mb-3 text-sm text-ink">
          Bağlantı geçersiz, süresi dolmuş ya da zaten kullanılmış. Oyuna girip Seçenekler →
          Hesap bölümünden yeni bir silme bağlantısı isteyebilirsin.
        </p>
        <ErrorBox error={error} />
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
              kalır; adın ve şehrin adı anonim bir adla değiştirilir.
            </p>
            <p className="mt-1 text-muted">
              Böylece diğer oyuncuların savaş geçmişinde ve sıralamada delik oluşmaz.
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
