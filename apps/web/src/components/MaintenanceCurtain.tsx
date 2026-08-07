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
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useWorldState } from '../lib/queries.ts';
import { noteMaintenance, remaining, serverNow, useTick } from '../lib/hooks.ts';

export function MaintenanceCurtain() {
  const { data } = useWorldState();
  const qc = useQueryClient();
  const wasPaused = useRef(false);
  // Geri sayım GERÇEK zamandan çizilir: bakımda oyun saati donuk (bkz. `maintenance_eta`).
  useTick(Boolean(data?.paused && data.eta));

  /**
   * ⭐⭐ BAKIM SAATİNİN TEK BAĞLANMA NOKTASI — ve bakımdan çıkışta ÖNBELLEK TAZELEME.
   *
   * ⚠️ Perde `data.paused` false iken erken `return null` yapıyor ama **bu effect yine koşar**:
   * bileşen her zaman mount, yalnız çizimi boş. Geçişi görebilmemizin sebebi bu.
   *
   * (1) `noteMaintenance` — bakımda `gameNow()` donar, dolayısıyla ekrandaki HER geri sayım
   *     tek noktadan durur. Bunsuz sunucunun saati donarken istemcininki akmaya devam eder ve
   *     sayaçlar her tazelemede **geriye sıçrar** (kullanıcının şikâyet ettiği davranış).
   *
   * (2) ⭐ Bakım BİTİNCE `invalidateQueries()` — **pazarlıksız**. Tek zaman çizgisinde bakımdan
   *     çıkış bekleyen tüm vadeleri ileri kaydırıyor (`time-shift.ts`); önbellekteki
   *     `finish_at`/`execute_at` değerleri ise kaydırma ÖNCESİNDEN kalma. Tazelemeseydik
   *     geri sayımlar bakım süresi kadar eksik, hatta "bitmiş" görünürdü — yani düzeltmeye
   *     çalıştığımız sıçramanın aynısı, ters yönde.
   */
  useEffect(() => {
    const paused = Boolean(data?.paused);
    noteMaintenance(paused, data?.pausedAt ?? null);
    if (wasPaused.current && !paused) void qc.invalidateQueries();
    wasPaused.current = paused;
  }, [data?.paused, data?.pausedAt, qc]);

  if (!data?.paused) return null;
  // ⚠️ `serverNow()` — ham `Date.now()` DEĞİL. `eta` gerçek zamanda doğru seçilmiş ama tarayıcı
  // saati sapmışsa (bu yüzden `clockSkewMs` ölçülüyor) perde yanlış bir kalan süre gösteriyordu.
  const left = data.eta ? remaining(data.eta, serverNow()) : null;

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
        <p className="display text-lg tracking-wide text-ink">SİSTEM BAKIMI</p>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          {data.notice ?? 'Dünya bakıma alındı. Kısa süre içinde geri döneceğiz.'}
        </p>
        {/*
          ⭐ Söylenmesi gereken tek şey: hiçbir şey KAYBOLMUYOR.
          ⚠️ Metin sadeleştirildi (kullanıcı, 2026-08-06). Eskiden hangi geri sayımların
          donduğu tek tek sayılıyordu (yapılar · birimler · araştırmalar · yoldaki ordular);
          oyuncunun o an merak ettiği şey liste değil, kaybının olmadığı.
        */}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Sistem bakım aşamasında. Bittiğinde her şey <b>kaldığı yerden</b> devam edecek.
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
