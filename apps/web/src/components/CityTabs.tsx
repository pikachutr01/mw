/**
 * ⭐⭐ MOBİL ŞEHİR SEKMELERİ (kullanıcı, 2026-08-09).
 *
 * *"Baraka sayfasına girdikten sonra Yapılar sayfasına geçmek için ya geri dönüp Yapılara
 * tıklamak gerekiyor, ya da tekrar Şehir tıklayıp Yapılar sayfasına geçmek gerekiyor…
 * yatayda scroll olabilecek bir tab menü oluştur."*
 *
 * Masaüstünde sol menü bu işi tek tıkla yapıyordu; mobilde karşılığı yoktu ve beş şehir ekranı
 * arasındaki her geçiş **iki tık** ediyordu. Şerit o eksiği kapatıyor.
 *
 * ─ Kararlar ────────────────────────────────────────────────────────────────────────────────
 *  • **Yalnız metin, ikon yok** (kullanıcı şartı). Beş ikon dar ekranda şeridi iki katına
 *    çıkarır ve zaten hepsi tek kelimeyle ayırt ediliyor.
 *  • **Kırılım CSS'te DEĞİL JS'te.** `hidden lg:block` masaüstünde DOM'da duran, ekran
 *    okuyucunun okuduğu **ölü bir gezinti** bırakırdı — sol menü zaten aynı beş bağlantıyı
 *    veriyor, ikisi birden okunurdu. `CityStrip.tsx`teki aynı gerekçenin ikizi.
 *  • **`<Link>`, `<button>` değil.** Bunlar rota gezintisi: orta tık yeni sekmede açsın, adres
 *    kopyalanabilsin. `role="tab"` de kullanılmıyor — projede hiç yok ve bunlar ARIA'nın
 *    "tab" tanımına (aynı sayfada panel değiştirme) uymuyor; doğru işaret `aria-current`.
 *  • **`flex-1` YOK.** Projedeki diğer dört sekme kümesi (`Command` · `Messages` · `Search` ·
 *    `cave-modal`) eşit bölünüyor; burada her sekme kendi genişliğinde olmalı, yoksa kaydırma
 *    anlamsızlaşır ve uzun adlar sıkışır.
 */
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ActivityDot, cityActivity } from '../lib/city-activity.tsx';
import { useActiveCity } from '../lib/city-context.tsx';
import { CITY_SCREENS, matchCityScreen } from '../lib/city-screens.ts';
import { useMediaQuery } from '../lib/hooks.ts';
import { useCity } from '../lib/queries.ts';

export function CityTabs() {
  const { pathname } = useLocation();
  /** ⚠️ `lg` = 1024 px — Tailwind'in `lg`siyle aynı eşik, alt barın `lg:hidden`ıyla aynı sınır. */
  const narrow = !useMediaQuery('(min-width: 1024px)');
  const { cityId } = useActiveCity();
  /**
   * ⚠️ `InfoBar` de aynı sorguyu açıyor ama TanStack Query anahtarı (`['city', cityId]`)
   * paylaştığı için **ek istek gitmiyor** — iki bileşen tek yanıtı okuyor.
   */
  const city = useCity(cityId);
  const activeRef = useRef<HTMLAnchorElement>(null);

  const current = matchCityScreen(pathname);

  /**
   * ⭐ Aktif sekme şeridin ORTASINA çekilir (kullanıcı: *"aktif sayfa bu yatay scroll un her
   * zaman görünür kısmında kalsın"*). `inline: 'center'` seçildi ki iki yanındaki komşular da
   * görünsün — uçtaki Tapınak'ta bile "sağda/solda başka sekmeler var" hissi kaybolmasın.
   *
   * ⚠️ `block: 'nearest'` şart: `'center'` olsaydı tarayıcı DİKEYDE de kaydırmaya çalışır ve
   * içerik sütununu yerinden oynatırdı. `CityStrip.tsx:94-97` ile birebir aynı çift.
   */
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);

  if (!narrow || !current) return null;

  const activity = cityActivity(city.data, cityId);

  return (
    <nav aria-label="Şehir ekranları" className="mb-2 overflow-x-auto">
      {/* `px-1`: kenardaki sekmenin çerçevesi kırpılmasın (CityStrip şeridiyle aynı pay). */}
      <div className="flex gap-1 px-1">
        {CITY_SCREENS.map((s) => {
          const active = s.to === current.to;
          return (
            <Link
              key={s.to}
              to={s.to}
              ref={active ? activeRef : undefined}
              aria-current={active ? 'page' : undefined}
              /* Görsel dil projedeki diğer sekmelerden birebir (`Command.tsx`), yalnız
                 `flex-1` yerine `shrink-0` — bkz. dosya başlığı. */
              className={`flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border-2
                px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                active
                  ? 'border-strong bg-accent font-semibold text-on-accent'
                  : 'border-border bg-surface text-muted hover:bg-raised'
              }`}
            >
              {s.label}
              {activity[s.to] ? <ActivityDot /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
