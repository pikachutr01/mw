/**
 * MOBİL "Şehir" sekmesi — masaüstünde sol menüde ayrı maddeler olan şehir ekranlarının hub'ı.
 *
 * Alt bar 11 madde taşıyamaz; masaüstündeki menü sırası burada korunuyor ki oyuncu iki düzen
 * arasında geçerken aynı sırayı bulsun.
 */
import { Link } from 'react-router-dom';
import { useActiveCity } from '../lib/city-context.tsx';
import { useCity } from '../lib/queries.ts';
import { ActivityDot, cityActivity } from '../lib/city-activity.tsx';
/* ⚠️ Liste artık burada TANIMLI DEĞİL: aynı beş rota mobil sekme şeridinde de kullanılıyor ve
   iki kopya kaçınılmaz olarak ayrışırdı (`lib/city-screens.ts` başlığında gerekçesi yazılı). */
import { CITY_SCREENS } from '../lib/city-screens.ts';

export function CityHub() {
  const { cityId } = useActiveCity();
  const city = useCity(cityId);
  const d = city.data;
  // ⭐ Masaüstü sol menüyle AYNI aktivite noktaları (kullanıcı, 2026-07-30) — şehir bazlı.
  const activity = cityActivity(d, cityId);

  return (
    <div className="space-y-2">
      {/**
        * ⚠️ Burada bir «şehir adı + altın/yemek» kartı vardı; 2026-08-03'te kullanıcı isteğiyle
        * KALDIRILDI. Üçü de zaten ekranda: ad ve koordinat şehir şeridinin başlığında,
        * altın/yemek üst çubukta — üstelik oradaki sayılar üretim hızıyla CANLI akıyor,
        * buradaki ham `resources` ise akmıyordu. Yani kart yalnız tekrar değil, aynı zamanda
        * daha bayat bir tekrardı.
        *
        * Kaybolan tek bilgi «· Başkent» etiketiydi; o da şerit başlığına taşındı.
        */}
      {/**
        * ⭐⭐ KART LİSTESİ — uygulamadaki Şehir sekmesinin birebir karşılığı
        * (kullanıcı, 2026-08-22: *"uygulamadaki şehir sayfası görünümü gibi. Daha büyük
        * gösterim ve ekrana tam sığan ögeler"*).
        *
        * ⚠️ **Panel KALDIRILDI.** Beş satırlık bir listeyi ahşap çerçeveye almak, ekranın
        * üçte birini kaplayıp geri kalanını boş bırakıyordu; oysa bu ekranın tek işi beş
        * kapıyı göstermek. Uygulamada da panel yok, doğrudan kartlar var.
        *
        * ⚠️ `h-24` (96 px) rastgele değil: uygulamanın `LayoutBuilder`ı kart yüksekliğini
        * kalan alana bölüp **74..108 px** arasına kelepçeliyor ve tipik telefonda ~96 px'e
        * denk geliyor. Sabit yazmak, aynı görüntüyü CSS'te bir ölçüm katmanı kurmadan
        * veriyor; kelepçenin üst sınırı zaten uzun ekranda da boşluk bırakıyordu.
        *
        * ⚠️ Zebra deseni GİTTİ: satırları ayıran şey artık kartın kendi kenarı. İkisi
        * birlikte gürültü olurdu.
        */}
      {CITY_SCREENS.map((it) => (
        <Link key={it.to} to={it.to}
          className="tex flex h-24 items-center gap-4 rounded-[var(--radius-sm)] border-2
            border-border bg-surface px-4 transition-colors hover:border-strong hover:bg-raised">
          {/* ⚠️ 32 → 56 px: varlıklar 64 px çizildi, bu ölçüde hâlâ keskin ve satırın
              yüksekliğini dolduruyor. Uygulamada da ikon kartla birlikte büyüyor. */}
          <img src={`/assets/buildings/${it.icon}.png`} alt="" width={64} height={64}
            className="h-14 w-14 shrink-0 object-contain" />
          <span className="min-w-0 flex-1">
            <span className="display flex items-center gap-1.5 text-base font-semibold text-ink">
              {it.label}
              {activity[it.to] ? <ActivityDot /> : null}
            </span>
            <span className="block text-xs text-muted">{it.hint}</span>
          </span>
          <span aria-hidden className="text-lg text-muted">›</span>
        </Link>
      ))}
    </div>
  );
}
