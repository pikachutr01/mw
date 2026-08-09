/**
 * ⭐ ŞEHİR EKRANI EŞLEŞTİRİCİSİ (`lib/city-screens.ts` → `matchCityScreen`).
 *
 * Bu fonksiyon üç yeri birden besliyor: mobil sekme şeridinin **görünüp görünmemesi**
 * (`CityTabs`), alt bardaki «Şehir» sekmesinin **yanıp yanmaması** (`Shell`) ve ileride
 * eklenecek her tüketici. Yanlış eşleşirse şerit ya hiç çıkmaz ya da çıkmaması gereken
 * ekranda çıkar — ikisi de sessiz hatalar.
 *
 * ⚠️ Projede tarayıcı testi altyapısı yok (`jsdom`/`testing-library` bağımlılığı yok), bu
 * yüzden karar bileşenden ayrı saf bir fonksiyona çıkarıldı — `deepLinkAction` · `tipReduce` ·
 * `placePopover` ile aynı gerekçe.
 */
import { describe, expect, it } from 'vitest';
import { CITY_SCREENS, matchCityScreen } from '../src/lib/city-screens.ts';

describe('matchCityScreen', () => {
  it('beş şehir ekranının her biri kendi kaydını bulur', () => {
    expect(matchCityScreen('/barracks')?.label).toBe('Baraka');
    expect(matchCityScreen('/buildings')?.label).toBe('Yapılar');
    expect(matchCityScreen('/defense')?.label).toBe('Savunma');
    expect(matchCityScreen('/academy')?.label).toBe('Akademi');
    expect(matchCityScreen('/temple')?.label).toBe('Tapınak');
  });

  it('⭐ şehir ekranı OLMAYAN rotalar eşleşmez', () => {
    for (const p of ['/armies', '/world', '/messages', '/command', '/options', '/simulate', '/']) {
      expect(matchCityScreen(p), p).toBeUndefined();
    }
  });

  /**
   * ⚠️ **`/city` HUB'IN KENDİSİ eşleşmemeli.** Şerit orada çıkarsa ekranda aynı beş bağlantı
   * iki kez görünür (liste + sekmeler) ve alt bardaki «Şehir» zaten `startsWith` ile yanıyor.
   */
  it('⭐ /city hub ekranı şehir EKRANI sayılmaz', () => {
    expect(matchCityScreen('/city')).toBeUndefined();
  });

  /**
   * ⚠️ Alt yollar eşleşmeli: bugün hiçbirinde parametre yok ama `/temple/:heroId` gibi bir
   * rota eklendiğinde şerit **sessizce kaybolmamalı**. Tam eşitlikle yazılsaydı olan buydu.
   */
  it('alt yollar da eşleşir (/barracks/123)', () => {
    expect(matchCityScreen('/barracks/123')?.to).toBe('/barracks');
    expect(matchCityScreen('/temple/7/skills')?.to).toBe('/temple');
  });

  /**
   * ⚠️ Ama düz `startsWith` de yeterli DEĞİL: sınır kontrolü olmasaydı `/academy-arsiv` gibi
   * bambaşka bir rota Akademi sayılır ve şerit yanlış ekranda çıkardı.
   */
  it('⭐ ön eki paylaşan YABANCI rota eşleşmez (/academy-arsiv)', () => {
    expect(matchCityScreen('/academy-arsiv')).toBeUndefined();
    expect(matchCityScreen('/defensex')).toBeUndefined();
  });

  it('katalog beş kayıt taşır ve her alanı dolu', () => {
    expect(CITY_SCREENS).toHaveLength(5);
    for (const s of CITY_SCREENS) {
      expect(s.to.startsWith('/'), s.to).toBe(true);
      expect(s.label.length, s.to).toBeGreaterThan(0);
      expect(s.hint.length, s.to).toBeGreaterThan(0);
      expect(s.icon.length, s.to).toBeGreaterThan(0);
    }
  });
});
