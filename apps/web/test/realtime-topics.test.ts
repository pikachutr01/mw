/**
 * ⭐⭐ SALDIRI ANINDA HANGİ EKRAN TAZELENİR — kapsama kilidi (kullanıcı, 2026-08-16).
 *
 * Kullanıcının şartı: *"Bir oyuncu şehrine saldırı yediği anda ekran açıksa, özellikle de
 * baraka ekranında, savunma ekranında savaş sonrası kalan ordu, savunma birimi hatta ganimet
 * bilgisinin anlık olarak güncellenmesi gerekir. Varsa kahraman durumu, mağara durumu, sur
 * durumu gibi savaştan etkilenebilecek her sayfaya anlık güncelleme atılmalı."*
 *
 * ⚠️ Bu bir "tablo doğru yazılmış mı" testi değil, **kapsama** testi: savaşın DEĞİŞTİRDİĞİ
 * her verinin ekrandaki kaynağı `battle:resolved` ile tazeleniyor mu? Eksik satırın bedeli
 * sessiz: ekran hata vermiyor, yalnız savaş öncesini göstermeye devam ediyor.
 *
 * ⚠️ Denetimde bulunan üç eksik burada isim isim kilitleniyor. En sinsisi `catalog`:
 * `useCatalog` yoklama YAPMIYOR (`queries.ts`, yalnız `staleTime`), yani o satır düşerse
 * yıkılan sur ekranda **süresiz** ayakta kalır.
 */
import { describe, expect, it } from 'vitest';
import { BATTLE_KEYS, INVALIDATES } from '../src/lib/realtime-topics.ts';

/**
 * Savaşın dokunduğu veri → onu ekrana getiren sorgu anahtarı.
 *
 * ⚠️ Sol sütun oyunun dilinde yazıldı, sağ sütun istemcinin. Eşleme değişirse test adı
 * doğrudan hangi EKRANIN bozulduğunu söyler — anahtar adı tek başına söylemezdi.
 */
const SAVASIN_DEGISTIRDIKLERI: Record<string, string> = {
  'kalan ordu (Baraka)': 'city',
  'kalan savunma birimleri (Savunma)': 'city',
  'kasa, yani ganimet sonrası kalan': 'city',
  'mağara durumu': 'city',
  'sur onarım penceresi': 'city',
  'sur ve Büyü Kalkanı SEVİYESİ': 'catalog',
  'kahraman durumu (öldü, esir, tecrübe)': 'temple',
  'Komuta Merkezi dökümü': 'overview',
  'savaş raporu': 'messages',
  'Ordular listesi': 'missions',
};

describe('savaş olayı ekranları tazeliyor', () => {
  const keys = INVALIDATES['battle:resolved'] ?? [];

  for (const [ne, anahtar] of Object.entries(SAVASIN_DEGISTIRDIKLERI)) {
    it(`${ne} → ${anahtar}`, () => {
      expect(keys).toContain(anahtar);
    });
  }

  it('kapsam BATTLE_KEYS ile birebir — tablo elle değiştirilirse test düşer', () => {
    expect([...keys].sort()).toEqual([...BATTLE_KEYS].sort());
  });

  /**
   * ⚠️ `cities` (şehir şeridi) BİLEREK dışarıda: ad, koordinat ve başkentlik savaşta
   * değişmiyor. Fetih yok, şehir savaşla el değiştirmiyor. Eklenseydi her savaşta gereksiz
   * bir istek daha giderdi.
   */
  it('şehir ŞERİDİ tazelenmez — savaş adı ve koordinatı değiştirmiyor', () => {
    expect(keys).not.toContain('cities');
  });
});

describe('eşleme tablosu', () => {
  /**
   * ⚠️ Sunucu tarafında **yazılıp eşlenmemiş olay** bu projede üç kez yaşandı
   * (`city:incoming_spy`, `city:changed`, `vacation:ended`) ve üçünde de belirti aynıydı:
   * ekran donuyor, hata çıkmıyor. Aynı hatanın istemci tarafındaki karşılığı boş bir liste.
   */
  it('hiçbir konu boş listeye bağlı değil', () => {
    for (const [topic, keys] of Object.entries(INVALIDATES)) {
      expect(keys.length, `${topic} hiçbir sorguyu tazelemiyor`).toBeGreaterThan(0);
    }
  });

  it('savaş, şehir olayının tazelediği her şeyi kapsar', () => {
    /* Savaş şehri değiştiren en ağır olay; `city:changed`in tazelediklerini eksik bırakamaz. */
    for (const key of INVALIDATES['city:changed'] ?? []) {
      expect(INVALIDATES['battle:resolved']).toContain(key);
    }
  });
});

/**
 * ⭐⭐ ORDU EVE DÖNÜNCE NE TAZELENİR — kapsama kilidi (kullanıcı, 2026-08-21).
 *
 * Kullanıcının şartı: *"ordu şehre geri döndüğünde oyun açık durumda olunca görevlerde
 * anlık olarak kullanılabilir hâle gelmeli."*
 *
 * ⚠️⚠️ Bu olay tabloya girmeden ÖNCE sunucu onu `missions:changed` konusuna düzleştiriyordu
 * (`realtime.bus.ts`) — yani satırı yazmak mümkün değildi, olay adı istemciye hiç ulaşmıyordu.
 * Test hem satırı hem **neden var olduğunu** kilitliyor: biri konuyu tekrar düzleştirirse
 * `temple` sessizce kaybolur ve belirti yalnız "kahramanı sefere seçemiyorum" olarak görünür.
 */
describe('ordu dönüşü ekranları tazeliyor', () => {
  const DONUSUN_DEGISTIRDIKLERI: Record<string, string> = {
    'eve gelen askerler (Baraka)': 'city',
    'birimlerin güncel adedi (katalog)': 'catalog',
    'ganimetin kasaya eklenmesi': 'city',
    '⭐ dönen kahraman (Tapınak + sefer formu)': 'temple',
    'Ordular listesinden satırın düşmesi': 'missions',
    'Komuta Merkezi dökümü': 'overview',
  };

  const keys = INVALIDATES['city:army_returned'] ?? [];

  for (const [ne, anahtar] of Object.entries(DONUSUN_DEGISTIRDIKLERI)) {
    it(`${ne} → ${anahtar}`, () => {
      expect(keys).toContain(anahtar);
    });
  }

  /**
   * ⚠️ Dönüş, `city:changed`in tazelediği her şeyi kapsamak ZORUNDA: handler ikisini birden
   * yayıyor ve dönüş şehre hem birlik hem ganimet yazıyor, yani daha geniş bir olay.
   */
  it('şehir olayının tazelediği her şeyi kapsar', () => {
    for (const key of INVALIDATES['city:changed'] ?? []) {
      expect(keys).toContain(key);
    }
  });
});
