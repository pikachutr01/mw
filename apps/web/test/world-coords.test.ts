/**
 * ⭐⭐ «Kendi diyarıma dön» — 2026-08-16 canlı hatasının hesabı.
 *
 * Kullanıcı bildirdi: *"Dünya sayfasını bir casusluk raporu üzerinden açarsak bu butona
 * tıklayınca aktif şehrimizin diyarına değil dünya sayfasının açıldığı ilk diyara gidiyor."*
 *
 * Sebep: düğme yalnız seçimi boşaltıyordu (`setSel(null)`) ama öncelik zinciri
 * `sel → adres → ev` olduğu için sıra eve değil ADRESE düşüyordu.
 */
import { describe, expect, it } from 'vitest';
import { homeAction, visibleCoords, type Coords } from '../src/lib/world-coords.ts';

const EV: Coords = { k: 3, d: 12 };
const RAPOR: Coords = { k: 1, d: 5 };

describe('koordinat önceliği', () => {
  it('elle seçim her şeyi ezer', () => {
    expect(visibleCoords({ k: 7, d: 99 }, RAPOR, EV)).toEqual({ k: 7, d: 99 });
  });

  it('seçim yoksa ADRES gelir — derin bağlantı hedefi göstermeli', () => {
    expect(visibleCoords(null, RAPOR, EV)).toEqual(RAPOR);
  });

  it('adres de yoksa aktif şehrin diyarı', () => {
    expect(visibleCoords(null, null, EV)).toEqual(EV);
  });

  it('hiçbiri yoksa 1:1', () => {
    expect(visibleCoords(null, null, null)).toEqual({ k: 1, d: 1 });
  });
});

describe('⭐⭐ «Kendi diyarıma dön» düğmesi', () => {
  /**
   * ⚠️⚠️ HATANIN KENDİSİ. Eski davranış `sel = null` ile yetiniyordu; aşağıdaki ilk `expect`
   * o hâlde `RAPOR` döndürüyordu — yani oyuncu kendi diyarına gidemiyordu.
   */
  it('casusluk raporundan açılmış sayfada EVE götürür, adresteki diyara değil', () => {
    const eylem = homeAction(RAPOR);
    expect(eylem.clearUrl).toBe(true);

    // Adres temizlendiği için zincirde `fromUrl` artık yok.
    const sonra = visibleCoords(eylem.sel, null, EV);
    expect(sonra).toEqual(EV);
    expect(sonra).not.toEqual(RAPOR);
  });

  it('⚠️ adres temizlenmezse ESKİ HATA geri gelir — regresyonun kanıtı', () => {
    const eylem = homeAction(RAPOR);
    // `clearUrl` yok sayılsaydı zincir yine adrese düşerdi:
    expect(visibleCoords(eylem.sel, RAPOR, EV)).toEqual(RAPOR);
  });

  it('adres zaten yokken gereksiz yönlendirme YAPILMAZ', () => {
    const eylem = homeAction(null);
    expect(eylem.clearUrl).toBe(false);
    expect(visibleCoords(eylem.sel, null, EV)).toEqual(EV);
  });

  /**
   * ⭐ `sel` daima `null` — eve ait koordinat SABİTLENMEZ. Oyuncu sonradan şehir değiştirirse
   * görünüm yeni aktif şehri izlemeli; koordinatı `sel`e yazsaydık takip ölürdü.
   */
  it('seçimi sabitlemez, aktif şehri izlemeye döner', () => {
    expect(homeAction(RAPOR).sel).toBeNull();
    const yeniEv: Coords = { k: 9, d: 400 };
    expect(visibleCoords(homeAction(RAPOR).sel, null, yeniEv)).toEqual(yeniEv);
  });
});
