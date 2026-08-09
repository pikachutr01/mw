/**
 * MOBİL "Şehir" sekmesi — masaüstünde sol menüde ayrı maddeler olan şehir ekranlarının hub'ı.
 *
 * Alt bar 11 madde taşıyamaz; masaüstündeki menü sırası burada korunuyor ki oyuncu iki düzen
 * arasında geçerken aynı sırayı bulsun.
 */
import { Link } from 'react-router-dom';
import { useActiveCity } from '../lib/city-context.tsx';
import { useCity } from '../lib/queries.ts';
import { Panel } from '../components/ui.tsx';
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
    <div className="space-y-3">
      {/**
        * ⚠️ Burada bir «şehir adı + altın/yemek» kartı vardı; 2026-08-03'te kullanıcı isteğiyle
        * KALDIRILDI. Üçü de zaten ekranda: ad ve koordinat şehir şeridinin başlığında,
        * altın/yemek üst çubukta — üstelik oradaki sayılar üretim hızıyla CANLI akıyor,
        * buradaki ham `resources` ise akmıyordu. Yani kart yalnız tekrar değil, aynı zamanda
        * daha bayat bir tekrardı.
        *
        * Kaybolan tek bilgi «· Başkent» etiketiydi; o da şerit başlığına taşındı.
        */}
      <Panel title="Şehir ekranları">
        <ul className="divide-y divide-border">
          {CITY_SCREENS.map((it, i) => (
            <li key={it.to} className={i % 2 === 1 ? 'bg-row-alt' : ''}>
              <Link to={it.to} className="flex items-center gap-3 px-3 py-2.5 hover:bg-raised">
                <img src={`/assets/buildings/${it.icon}.png`} alt="" width={32} height={32}
                  className="h-8 w-8 shrink-0 object-contain" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {it.label}
                    {activity[it.to] ? <ActivityDot /> : null}
                  </span>
                  <span className="block text-[11px] text-muted">{it.hint}</span>
                </span>
                <span aria-hidden className="text-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
