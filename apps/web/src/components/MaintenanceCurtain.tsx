/**
 * ⭐ BAKIM PERDESİ (admin Faz 2) — kullanıcının kararı: *"salt-okunur + tam ekran perde"*.
 *
 * Dünya bakıma alındığında ekranın tamamını kapatır. Amacı bilgilendirmek DEĞİL, **engellemek**:
 * bakımda tüm yazma uçları 503 dönüyor (`MaintenanceInterceptor`) ve perde olmasaydı oyuncu her
 * tıklamasında ayrı bir hata görürdü. Tek bir açıklama, tek bir yerde.
 *
 * ⚠️ Perde `App.tsx`te ROTALARIN DIŞINDA: sayfa değiştirmek onu kapatamamalı. Oyuncunun
 * kapatabileceği bir "×" de YOK — kapatılabilen bir perde, arkasındaki her düğmenin 503
 * döndüğü bir oyun demek olurdu.
 *
 * ⚠️ Oyun ekranı ARKADA DURUYOR (kaldırılmıyor): oyuncu şehrini, ordularını, geri sayımlarını
 * bulanık da olsa görebilsin. Bakım "oyunun kapandığı" değil "dondurulduğu" an; ekranı
 * karartmak bunu yanlış anlatırdı.
 */
import { useWorldState } from '../lib/queries.ts';
import { remaining, useTick } from '../lib/hooks.ts';

export function MaintenanceCurtain() {
  const { data } = useWorldState();
  // Geri sayım GERÇEK zamandan çizilir: bakımda oyun saati donuk (bkz. `maintenance_eta`).
  useTick(Boolean(data?.paused && data.eta));

  if (!data?.paused) return null;
  const left = data.eta ? remaining(data.eta, Date.now()) : null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Bakım modu"
      className="fixed inset-0 z-[60] flex items-center justify-center
        bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[var(--radius-md)] border-2 border-strong
        bg-panel p-5 text-center shadow-2xl">
        <p className="display text-lg tracking-wide text-ink">BAKIM MODU</p>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          {data.notice ?? 'Dünya bakıma alındı. Kısa süre içinde geri döneceğiz.'}
        </p>
        {/* ⭐ Kullanıcının en çok önem verdiği cümle: hiçbir şey KAYBOLMUYOR. */}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Tüm geri sayımlar donduruldu — yapılar, birimler, araştırmalar ve yoldaki ordular
          bakım süresince <b>ilerlemiyor</b>. Bakım bitince her şey <b>kaldığı yerden</b>
          {' '}devam edecek; kimse zaman kaybetmeyecek.
        </p>
        {left ? (
          <p className="mt-4 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2
            text-sm text-ink">
            Tahmini kalan süre: <span className="tnum font-semibold">{left}</span>
          </p>
        ) : null}
        {/* ⚠️ "Yenile" düğmesi bilinçli olarak YOK: perde WS olayıyla ve 30 sn'lik yoklamayla
            kendiliğinden kalkıyor. Düğme koysaydık oyuncu bakım boyunca ona basıp dururdu. */}
      </div>
    </div>
  );
}
