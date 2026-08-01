/**
 * ⭐ ŞEHİR ŞERİDİ — şehir değiştirmenin tek yolu.
 *
 * **İki ayrı iş birbirinden ayrıldı** (kullanıcı kararı, 2. geri bildirim turu):
 *  1. *Şehir seçmek* — masaüstünde her ekranın üstünde durur.
 *  2. *Ordu hareketlerini görmek* — **yalnız Ordular ekranında**. Diğer ekranlarda şehirlerin
 *     altına dizilen simgeler dikkat dağıtıyordu ve zaten Ordular ekranı bu iş için var.
 *
 * **Mobilde şerit yalnız Ordular ekranında görünür**: her sayfanın tepesinde şehir listesi
 * taşımak zaten dar olan alanı iyice daraltıyordu. Mobil oyuncu şehrini Ordular'dan değiştirir
 * (orijinal mobil arayüzün de yaptığı bu — `images/mobil arayüz2.jpg`).
 *
 * Yerleşim: **merkez odaklı**. Tek şehir varsa ortada durur, şehir sayısı arttıkça sağa ve sola
 * doğru büyür (kullanıcı tanımı). Taşma olursa yatay kayar ve aktif şehir görünüme çekilir.
 *
 * Her şehrin altında **ad**, onun altında **koordinat** yazar.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { coords } from '../lib/format.ts';
import { useTick } from '../lib/hooks.ts';
import { useActiveCity } from '../lib/city-context.tsx';
import { useCities, useMovements, type Movement } from '../lib/queries.ts';
import {
  MovementIcon, MovementModal, MovementTooltip, type TipState,
} from './movements.tsx';

/**
 * ⚠️ Şerit TEK yerde çiziliyor (kabuk). Bir ara hem kabuk hem Ordular ekranı kendi şeridini
 * çiziyordu ve ekranda **iki şerit** birden görünüyordu; bu yüzden "Ordular'da hareketler de
 * görünsün" kuralı ikinci bir bileşenle değil, buradaki rota kontrolüyle uygulanıyor.
 */
export function CityStrip() {
  const cities = useCities();
  const movements = useMovements();
  const { cityId, setCityId } = useActiveCity();
  const { pathname } = useLocation();
  // ⚠️ Simgelerin altındaki geri sayım SANİYEDE BİR yeniden çizilmeli. Bu satır olmadan sayaç
  //    yalnız sunucu yanıtı veya fare hareketi bileşeni tazelediğinde güncelleniyordu.
  useTick(pathname.startsWith('/armies'));
  const activeRef = useRef<HTMLButtonElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const [open, setOpen] = useState<Movement | null>(null);

  /** Hareketler (ve mobilde şeridin kendisi) yalnız Ordular ekranında. */
  const onArmies = pathname.startsWith('/armies');
  const list = cities.data?.cities ?? [];
  const all = onArmies ? movements.data?.movements ?? [] : [];

  useEffect(() => {
    if (!tip) return;
    const close = (): void => setTip(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [tip]);

  // Aktif şehir kaydırmalı şeritte görünmüyorsa görünüme çek (çok şehirli oyuncuda şart).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [cityId, list.length]);

  if (list.length === 0) return null;

  return (
    /**
     * ⭐ MOBİLDE YATAY KAYDIRMA YOK (kullanıcı, 2026-08-01).
     *
     * ⚠️ Eski hâl `overflow-x-auto` + `min-w-max` + `justify-center` idi: mobilde 5 şehir
     * ekrana sığmıyor, şerit yatay kaydırma çubuğu üretiyor ve **ortalanmaya çalışırken**
     * ilk şehir soldan taşıyordu. Kullanıcının isteği: sola yaslı, küçültülmüş, taşmasız.
     *
     * ⚠️ Çözüm mobilde `flex-1 basis-0` + `min-w-0`: beş hücre kalan genişliği eşit
     * paylaşıyor, hiçbiri sabit genişlik dayatmıyor → toplam asla ekranı aşmıyor.
     * `sm:` ve üstünde eski sabit genişlikli, ortalanmış düzen aynen sürüyor.
     */
    <div className={`mb-3 sm:overflow-x-auto ${onArmies ? '' : 'hidden lg:block'}`}>
      <div className="flex gap-1 px-1 sm:mx-auto sm:min-w-max sm:justify-center sm:gap-4">
        {list.map((c) => {
          const active = c.id === cityId;
          const mine = all.filter((m) => m.cityId === c.id);
          /* ⭐ Pulse yalnız TEHLİKELİ gelenlerde (kullanıcı, 2026-07-30): saldırı ve casusluk.
           * Nakliye/destek/mağara dönüşü dost hareketlerdir, alarm noktası üretmez. */
          const incoming = mine.some((m) => m.direction === 'in'
            && (m.type === 'attack' || m.type === 'spy'));
          return (
            <div key={c.id}
              className="flex min-w-0 flex-1 basis-0 flex-col items-center sm:w-28 sm:flex-none sm:shrink-0">
              <button
                ref={active ? activeRef : undefined}
                onClick={() => setCityId(c.id)}
                /**
                 * ⚠️ **Fareyle üzerine gelince HİÇBİR ŞEY olmaz** (kullanıcı, 2026-08-02).
                 * Önce tarayıcının ham `title`'ı vardı (`Karakol(1:3:1)`), sonra onun yerine
                 * proje ipucu kondu — ikisi de istenmiyor: ad ve koordinat zaten simgenin
                 * ALTINDA yazılı, ipucu aynı bilgiyi tekrar ediyordu. Tıklama şehri değiştirir,
                 * hepsi bu. `aria-label` kalıyor: ekran okuyucu için tek erişim yolu o.
                 */
                aria-label={`${c.name} ${coords(c.coordinates)}`}
                aria-current={active ? 'true' : undefined}
                className={`group w-full rounded-[var(--radius-md)] border-2 px-1 pt-1 pb-1.5 transition-all ${
                  active
                    ? 'border-accent bg-accent/15 shadow-[0_0_0_1px_var(--mw-color-accent)]'
                    : 'border-transparent hover:border-border hover:bg-raised/60'
                }`}
              >
                <span className="relative block">
                  {/* ⚠️ Mobilde 56px → 40px (kullanıcı: "bu şehir simgeleri küçültülebilir"):
                      5 şehir 375px'lik ekranda taşmadan sığsın. `max-w-full` ikinci emniyet. */}
                  <img
                    src="/assets/buildings/city.png"
                    alt=""
                    width={96}
                    height={77}
                    className={`icon-shadow mx-auto h-10 w-auto max-w-full object-contain
                      transition-transform sm:h-20 ${
                      active ? 'scale-105' : 'group-hover:scale-105'
                    }`}
                  />
                  {/* Saldırı altındaki şehir listede İLK BAKIŞTA ayırt edilmeli. */}
                  {incoming ? (
                    <span aria-label="gelen hareket var"
                      className="absolute -top-0.5 right-1 h-2.5 w-2.5 animate-pulse rounded-full
                        border border-strong bg-danger" />
                  ) : null}
                </span>

                <span className={`display mt-0.5 block truncate text-[10px] leading-tight sm:text-sm ${
                  active ? 'font-semibold text-accent' : 'text-ink'
                }`}>
                  {c.name}
                </span>
                <span className="tnum block truncate text-[9px] leading-tight text-muted sm:text-[11px]">
                  {coords(c.coordinates)}
                </span>
              </button>

              {/* Hareketler şehrin ALTINA, görev BAŞLAMA sırasına göre asılır (kullanıcı kuralı). */}
              <div className="mt-1 flex flex-col items-center gap-1">
                {mine
                  .slice()
                  .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
                  .map((m) => (
                    <MovementIcon key={m.key} m={m} onTip={setTip} onOpen={setOpen} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {tip && !open ? <MovementTooltip {...tip} /> : null}
      {open ? <MovementModal m={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
