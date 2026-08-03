/**
 * ⭐ ŞEHİR ŞERİDİ — şehir değiştirmenin tek yolu.
 *
 * **İki ayrı iş birbirinden ayrıldı** (kullanıcı kararı, 2. geri bildirim turu):
 *  1. *Şehir seçmek* — masaüstünde her ekranın üstünde durur.
 *  2. *Ordu hareketlerini görmek* — **yalnız Ordular ekranında**. Diğer ekranlarda şehirlerin
 *     altına dizilen simgeler dikkat dağıtıyordu ve zaten Ordular ekranı bu iş için var.
 *
 * **Mobilde şerit HER ekranda var ama Ordular dışında KATLI** (kullanıcı, 2026-08-03).
 * Önce mobilde yalnız Ordular'da gösteriliyordu — dar alanı korumak için. Ama şehir değiştirmek
 * her ekranda gereken bir iş: Baraka'da başka şehre bakmak için Ordular'a gidip geri dönmek
 * gerekiyordu. Çözüm görünürlük değil **katlama**: varsayılan kapalı, kapalıyken tek satırlık
 * bir başlık (aktif şehrin adı + koordinatı) yer kaplıyor, açınca tam şerit iniyor.
 * Tercih cihazda saklanıyor.
 *
 * Yerleşim iki farklı kural izliyor:
 *   • **Mobil** — sola yaslı, her hücre kendi genişliği kadar (kullanıcı, 2026-08-03).
 *   • **`sm` ve üstü** — merkez odaklı: tek şehir ortada, sayı arttıkça iki yana büyür.
 *
 * Her şehrin altında **ad**, onun altında **koordinat** yazar.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { coords } from '../lib/format.ts';
import { useMediaQuery, useTick } from '../lib/hooks.ts';
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
/**
 * ⭐ Katlama tercihi **cihaz hafızasında**, tek anahtar. Rota başına saklamak "Baraka'da
 * açtım, Yapılar'da yine kapalı" sürtünmesi yaratırdı. `City.tsx`'teki `useCollapsed` ile
 * aynı kalıp — orada da aynı gerekçe yazılı.
 */
const COLLAPSE_KEY = 'mw-strip-collapsed';

function useStripOpen(): [boolean, (v: boolean) => void] {
  // ⚠️ Varsayılan KAPALI (kullanıcı kararı) → anahtar yoksa `false`; yalnız '0' açık demek.
  const [open, setOpen] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '0');
  return [open, (next: boolean) => {
    localStorage.setItem(COLLAPSE_KEY, next ? '0' : '1');
    setOpen(next);
  }];
}

export function CityStrip() {
  const cities = useCities();
  const movements = useMovements();
  const { cityId, setCityId } = useActiveCity();
  const { pathname } = useLocation();
  /**
   * ⚠️ Kırılım CSS'te DEĞİL JS'te: katlama başlığı `lg` altında **çizilmemeli**, sadece
   * gizlenmemeli — `hidden lg:block` ile bıraksaydık masaüstünde de DOM'da duran, ekran
   * okuyucunun okuduğu bir düğme olurdu. `lg` = 1024 px, Tailwind'in `lg`si ile aynı eşik.
   */
  const narrow = !useMediaQuery('(min-width: 1024px)');
  const [stripOpen, setStripOpen] = useStripOpen();
  // ⚠️ Simgelerin altındaki geri sayım SANİYEDE BİR yeniden çizilmeli. Bu satır olmadan sayaç
  //    yalnız sunucu yanıtı veya fare hareketi bileşeni tazelediğinde güncelleniyordu.
  useTick(pathname.startsWith('/armies'));
  const activeRef = useRef<HTMLButtonElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const [open, setOpen] = useState<Movement | null>(null);

  /** Hareket simgeleri yalnız Ordular ekranında — bu karar 2026-08-03'te DEĞİŞMEDİ. */
  const onArmies = pathname.startsWith('/armies');
  const list = cities.data?.cities ?? [];
  const all = onArmies ? movements.data?.movements ?? [] : [];

  /**
   * Katlama yalnız **dar ekranda ve Ordular DIŞINDA**. Ordular'ın kendisi zaten "ordularımı
   * gör" ekranı; şeridi orada kapatabilmek ekranın asıl işini gizlemek olurdu. Masaüstünde
   * yer sorunu yok, şerit hep açık.
   */
  const collapsible = narrow && !onArmies;
  const showStrip = !collapsible || stripOpen;
  const activeCity = list.find((c) => c.id === cityId) ?? list[0];

  useEffect(() => {
    if (!tip) return;
    const close = (): void => setTip(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [tip]);

  // Aktif şehir kaydırmalı şeritte görünmüyorsa görünüme çek (çok şehirli oyuncuda şart).
  useEffect(() => {
    if (!showStrip) return;
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [cityId, list.length, showStrip]);

  if (list.length === 0) return null;

  return (
    <div className="mb-2">
      {/**
        * ⭐ KAPALIYKEN DE AKTİF ŞEHİR YAZAR. Sadece bir chevron koysaydık oyuncu Baraka'da
        * "hangi şehrin barakası bu?" sorusunu cevaplayamazdı — şerit kapalı olduğu için
        * ekranda başka hiçbir yerde yazmıyor. Bir satır, iki iş: bağlam + düğme.
        */}
      {collapsible ? (
        <button type="button"
          onClick={() => setStripOpen(!stripOpen)}
          aria-expanded={stripOpen}
          className="mb-1 flex w-full items-center gap-2 rounded-[var(--radius-md)] border
            border-border bg-raised/50 px-2 py-1 text-left text-xs transition-colors
            hover:bg-raised"
        >
          <img src="/assets/buildings/city.png" alt="" width={96} height={77}
            className="icon-shadow h-5 w-auto shrink-0 object-contain" />
          <span className="display truncate font-semibold text-accent">{activeCity?.name}</span>
          {/* ⭐ Başkent etiketi buraya 2026-08-03'te taşındı: `CityHub`taki ad kartı kaldırıldı
              ve mobilde "hangisi başkentim?" sorusunun cevabı başka hiçbir yerde kalmıyordu. */}
          {activeCity?.isCapital ? (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">Başkent</span>
          ) : null}
          <span className="tnum shrink-0 text-muted">{activeCity ? coords(activeCity.coordinates) : ''}</span>
          <span aria-hidden className={`ml-auto shrink-0 text-muted transition-transform ${
            stripOpen ? 'rotate-180' : ''
          }`}>▾</span>
        </button>
      ) : null}

      {/**
        * ⭐ MOBİLDE SOLA YASLI, HER HÜCRE KENDİ GENİŞLİĞİNDE (kullanıcı, 2026-08-03).
        *
        * ⚠️ Bir önceki hâl `flex-1 basis-0` idi ve **tek şehirde** o hücre ekranın tamamını
        * kaplıyor, simge de ortasında asılı kalıyordu. Gerekçesi vardı (5 şehir 375 px'e
        * taşmasın), ama sabit `w-16` aynı işi görüyor: 5 × 64 px = 320 px, hâlâ sığıyor.
        *
        * ⚠️ Mobilde `overflow-x-auto` geri geldi — 2026-08-01'de kaldırılmıştı çünkü
        * `justify-center` ile birlikte ilk şehri soldan kırpıyordu. Sola yaslıyken o kusur
        * yok: taşma olursa şerit sağa doğru kayar, ilk şehir hep yerinde durur.
        *
        * `sm:` ve üstünde eski ortalanmış, geniş hücreli düzen aynen sürüyor.
        */}
      <div className={`overflow-x-auto ${showStrip ? '' : 'hidden'}`}>
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
                className="flex w-16 shrink-0 flex-col items-center sm:w-28">
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
                  /* ⚠️ İç boşluklar 2026-08-02'de kısıldı: şerit artık SABİT (kaydırmada
                     yukarı kaçmıyor), yani kapladığı her piksel içerikten çalınıyor. */
                  className={`group w-full rounded-[var(--radius-md)] border-2 px-0.5 pt-0.5 pb-1 transition-all ${
                    active
                      ? 'border-accent bg-accent/15 shadow-[0_0_0_1px_var(--mw-color-accent)]'
                      : 'border-transparent hover:border-border hover:bg-raised/60'
                  }`}
                >
                  <span className="relative block">
                    {/* ⚠️ Mobilde 56px → 40px (kullanıcı: "bu şehir simgeleri küçültülebilir"):
                        5 şehir 375px'lik ekranda taşmadan sığsın. `max-w-full` ikinci emniyet.
                        ⚠️ 2026-08-02'de bir tur daha küçüldü (40→32 · masaüstü 80→56): şerit
                        sabitlenince aşağıdaki içeriğe kalan yer belirleyici oldu. */}
                    <img
                      src="/assets/buildings/city.png"
                      alt=""
                      width={96}
                      height={77}
                      className={`icon-shadow mx-auto h-8 w-auto max-w-full object-contain
                        transition-transform sm:h-14 ${
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
      </div>

      {tip && !open ? <MovementTooltip {...tip} /> : null}
      {open ? <MovementModal m={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
