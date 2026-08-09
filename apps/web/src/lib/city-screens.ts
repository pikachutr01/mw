/**
 * ⭐ ŞEHİR EKRANLARININ TEK KAYNAĞI — Baraka · Yapılar · Savunma · Akademi · Tapınak.
 *
 * ⚠️ Bu liste 2026-08-09'a kadar **üç ayrı yerde** duruyordu: `Shell.MENU` (masaüstü sol menü),
 * `Shell.CITY_SCREENS` (geri butonunun koşulu) ve `CityHub.ITEMS` (mobil liste ekranı). Biri
 * güncellenip diğeri unutulsa geri butonu ya da aktivite noktası **sessizce** kaybolurdu.
 * Mobil sekme şeridi dördüncü kopya olacaktı; onun yerine hepsi buraya bağlandı.
 *
 * ⚠️ `Shell.MENU` **bilerek birleştirilmedi**: onun ikonları ayrı bir kümeden geliyor
 * (`assets/menu/baraka.png` ↔ buradaki `assets/buildings/barracks.png`) ve içinde şehir dışı
 * yedi madde var. Zorlama bir birleştirme iki ikon setini tek nesneye tıkardı; kazancı yok.
 */

export interface CityScreen {
  /** Rota — `App.tsx`teki `<Route path>` ile birebir. */
  to: string;
  /** Sekmede ve liste satırında görünen ad. */
  label: string;
  /** Yalnız `CityHub` liste satırının ikinci satırı; sekmede kullanılmaz. */
  hint: string;
  /** `assets/buildings/<icon>.png` — yalnız `CityHub`. Sekmeler ikonsuz (kullanıcı şartı). */
  icon: string;
}

export const CITY_SCREENS: readonly CityScreen[] = [
  { to: '/barracks', label: 'Baraka', hint: 'Savaşçı üret', icon: 'barracks' },
  { to: '/buildings', label: 'Yapılar', hint: 'Bina yükselt', icon: 'castle' },
  { to: '/defense', label: 'Savunma', hint: 'Sur ve savunma birimleri', icon: 'architect_school' },
  { to: '/academy', label: 'Akademi', hint: 'Teknik araştır', icon: 'academy' },
  { to: '/temple', label: 'Tapınak', hint: 'Kahramanlar', icon: 'temple' },
];

/**
 * Bu yol bir şehir ekranı mı? Değilse `undefined`.
 *
 * ⚠️ **Eşleşme `===` DEĞİL, sınır kontrollü ön ek.** `startsWith` tek başına yazılsaydı
 * ileride eklenecek `/academy-x` gibi bir rota **sessizce** şehir ekranı sayılırdı; tam
 * eşitlik ise `/barracks/123` biçiminde bir alt yol eklendiğinde şeridi sessizce kaybederdi.
 * İkisinin arası: ya tam eşit ya da hemen ardından `/` gelmeli.
 *
 * ⚠️ Saf ve ayrı dosyada, çünkü projede tarayıcı testi altyapısı yok — karar ancak böyle
 * sınanabiliyor (`lib/deep-link.ts` ile aynı gerekçe).
 */
export function matchCityScreen(pathname: string): CityScreen | undefined {
  return CITY_SCREENS.find(
    (s) => pathname === s.to || pathname.startsWith(`${s.to}/`),
  );
}
