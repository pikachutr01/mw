/**
 * ⭐ ŞEHİR YÖNETİMİ — Seçenekler ekranının "Şehir" paneli.
 *
 * Orijinalde bu iki madde **Seçenekler** menüsünde duruyor (`DecompiledSrc/src/g.java` case 63:
 * `a[4]` = "Şehir Terk Et" → ekran 61, `a[5]` = "Şehir Adı Değiştir" → ekran 62) ve ikisi de
 * **seçili şehir** üzerinde çalışıyor (`teknik_ve_yapi_dokumantasyonu.md:934`). Menü yeri de
 * hedef seçimi de oradan alındı — biz yalnız şehri açıkça yazıyoruz ki oyuncu hangi şehirle
 * uğraştığını tahmin etmesin.
 *
 * ⚠️ Panel `AccountPanel` desenini izler: kapalı dururken tek düğme, açılınca form. Seçenekler
 * ekranı zaten uzun; her aksiyonu açık forma çevirmek sayfayı kaydırılabilir bir duvara döndürüyordu.
 */
import { useEffect, useState } from 'react';
/**
 * ⚠️ Sayılar KATALOGDAN (2026-08-01). Burada `NAME_MIN`/`NAME_MAX` **elle kopyalanmıştı** ve
 * yorumu "sunucudakiyle aynı sayılar" diyordu — sınır 15'e çıkınca o cümle yalan olacaktı.
 * Aynı hatanın canlı örneği `Temple.tsx`teydi: 24 yazıyordu, sunucu 10 istiyordu.
 */
import { NAME_MAX, NAME_MIN } from '@mobilwar/catalog';
import { coords } from '../lib/format.ts';
import { ApiError, api } from '../lib/api.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { useCities, type CitySummary } from '../lib/queries.ts';
import { useConfirm } from './Modal.tsx';
import { Button, ErrorBox, Field, Input, Panel, UserText } from './ui.tsx';
import { useQueryClient } from '@tanstack/react-query';


export function CityAdminPanel(): React.ReactElement | null {
  const cities = useCities();
  const { cityId } = useActiveCity();
  const [open, setOpen] = useState(false);

  const list = cities.data?.cities ?? [];
  const active = list.find((c) => c.id === cityId) ?? list[0] ?? null;
  if (!active) return null;

  return (
    <Panel title="Şehir" right={coords(active.coordinates)}>
      <div className="space-y-1 p-3 text-sm">
        <div className="text-ink">
          {active.name}
          {active.isCapital ? <span className="ml-1 text-xs text-muted">(başkent)</span> : null}
        </div>
        <div className="text-xs text-muted">
          İşlem <b>seçili şehir</b> için geçerlidir.
        </div>
      </div>

      <div className="border-t border-border px-3 py-2">
        <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Vazgeç' : 'Şehir Adı Değiştir'}
        </Button>
      </div>

      {open ? (
        <RenameCity cityId={active.id} current={active.name} onDone={() => setOpen(false)} />
      ) : null}

      {/* ⭐ Başkent hiç gösterilmez: orijinalde de terk edilemiyor, düğmeyi sunup
          reddetmek boş bir umut olurdu (`teknik_ve_yapi_dokumantasyonu.md:648`). */}
      {active.isCapital ? null : <AbandonCity city={active} />}
    </Panel>
  );
}

function RenameCity({
  cityId, current, onDone,
}: { cityId: number; current: string; onDone: () => void }): React.ReactElement {
  const qc = useQueryClient();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  /* Şerit başka bir şehre geçtiyse form da o şehrin adıyla başlamalı. */
  useEffect(() => { setName(current); setError(null); }, [cityId, current]);

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const tooShort = trimmed.length > 0 && trimmed.length < NAME_MIN;

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/api/v1/cities/${cityId}/rename`, { method: 'POST', body: { name: trimmed } });
      /**
       * ⚠️ Sunucu `city:renamed` olayını zaten yayınlıyor ve şerit ondan tazeleniyor; buradaki
       * `invalidateQueries` **WS kopukken** de formun sonucunu göstermek için. İkisi çakışmaz:
       * react-query aynı anahtarın iki tazelemesini birleştirir.
       */
      await qc.invalidateQueries({ queryKey: ['cities'] });
      await qc.invalidateQueries({ queryKey: ['city'] });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border p-3">
      <Field label={`Yeni ad (${NAME_MIN}-${NAME_MAX} karakter)`}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          required
          autoFocus
        />
      </Field>
      <p className="text-[11px] text-muted">
        Türkçe karakter ve boşluk kullanabilirsin; noktalama işareti kullanılamaz.
      </p>
      {tooShort ? (
        <p className="text-xs text-danger">Ad en az {NAME_MIN} karakter olmalı.</p>
      ) : null}
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || tooShort || trimmed === '' || trimmed === current}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>Vazgeç</Button>
      </div>
    </form>
  );
}

/**
 * ⭐ ŞEHİR TERK ET — geri alınamaz, bu yüzden **iki kapı** var:
 *  1. Engel listesi ekranda **peşinen** görünür (sunucudan `GET :id/abandon`).
 *  2. Engel yoksa onay diyaloğu, bedeli AÇIKÇA yazarak (orijinalin kalıbı:
 *     *"Şehri terk ediyorsunuz. Emin misiniz!"* — `g.java:613`).
 *
 * ⚠️ Ön kontrol yetki kapısı değil: sunucu `abandon()` içinde kilit altında **yeniden**
 * bakıyor. Buradaki liste yalnız "şu an neden olmuyor" sorusunu cevaplıyor.
 */
function AbandonCity({ city }: { city: CitySummary }): React.ReactElement {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { setCityId } = useActiveCity();
  const cities = useCities();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  /**
   * ⚠️ Ön kontrolün PATLAMASI ile "henüz dönmedi" ayrı tutuluyor. Tek `null` ile
   * yürütülüyordu ve arıza sinsiydi: istek hata verince düğme **kalıcı olarak** kapalı
   * kalıyor, ekranda hiçbir açıklama çıkmıyor ve oyuncunun yeniden deneme yolu olmuyordu.
   */
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setBlockers(null);
    setCheckFailed(false);
    void api<{ blockers: string[] }>(`/api/v1/cities/${city.id}/abandon`)
      .then((r) => { if (alive) setBlockers(r.blockers); })
      .catch(() => { if (alive) setCheckFailed(true); });
    return () => { alive = false; };
  }, [city.id]);

  const run = async (): Promise<void> => {
    const ok = await confirm({
      title: <><UserText>{city.name}</UserText> terk edilsin mi?</>,
      danger: true,
      confirmLabel: 'Şehri terk et',
      body: (
        <div className="space-y-2">
          <p>Bu işlem <b>geri alınamaz</b>. Şehri terk ediyorsun, emin misin?</p>
          <ul className="ml-4 list-disc space-y-0.5 text-muted">
            <li>Binalar ve savunma yapıları silinir.</li>
            <li>Şehirdeki altın ve yemek yok olur.</li>
            <li>Bu şehrin yapı ve savunmasından kazandığın puanı kaybedersin.</li>
            <li>Koordinat boşalır; başka bir oyuncu oraya şehir kurabilir.</li>
          </ul>
        </div>
      ),
    });
    if (!ok) return;

    setError(null);
    setBusy(true);
    try {
      await api(`/api/v1/cities/${city.id}/abandon`, { method: 'POST' });
      /* Orijinal istemci de terkten sonra başkente geçiyor (`g.java:616` → `this.a.c(0)`). */
      const capital = cities.data?.cities.find((c) => c.isCapital && c.id !== city.id);
      if (capital) setCityId(capital.id);
      await qc.invalidateQueries();
    } catch (err) {
      /**
       * ⚠️⚠️ 409 `abandon_blocked` gövdesi DÜZ: `{ code, blockers }` — içinde `message` yok.
       * Olduğu gibi `ErrorBox`a vermek oyuncuya yalnız *"İstek başarısız (409)"* gösterirdi.
       * Oysa bu hatanın anlamı belli: ön kontrolden sonra araya bir değişiklik girmiş (ordu
       * yola çıkmış, kuyruğa iş düşmüş). Listeyi ekrana da yazıyoruz çünkü `useEffect` yalnız
       * `city.id` değişince koşuyor; yoksa ekranda eski (boş) engel listesi kalırdı.
       */
      const taze = err instanceof ApiError && err.code === 'abandon_blocked'
        ? (err.body as { blockers?: string[] } | undefined)?.blockers
        : undefined;
      if (taze && taze.length > 0) setBlockers(taze);
      else setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-border px-3 py-2">
      {blockers && blockers.length > 0 ? (
        <>
          <div className="text-xs text-muted">Bu şehir şu an terk edilemez:</div>
          <ul className="ml-4 list-disc space-y-0.5 text-xs text-danger">
            {blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </>
      ) : checkFailed ? (
        <div className="text-xs text-warning">
          Terk denetimi yapılamadı. Sayfayı yenileyip yeniden dene.
        </div>
      ) : (
        <Button variant="danger" disabled={busy || blockers == null} onClick={() => void run()}>
          {busy ? 'Terk ediliyor…' : 'Şehri Terk Et'}
        </Button>
      )}
      <ErrorBox error={error} />
    </div>
  );
}
