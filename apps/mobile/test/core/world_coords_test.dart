/// DÜNYA KOORDİNAT ÖNCELİĞİ — web'de **canlı bir hataya** yol açan kural.
///
/// ⚠️ Hata (kullanıcı, 2026-08-16): «Kendi diyarıma dön» düğmesi yalnız seçimi boşaltıyordu ve
/// derin bağlantıyla açılmış sayfada sıra **eve değil adrese** düşüyordu — casusluk raporundan
/// gelen oyuncu kendi diyarına değil raporun diyarına dönüyordu. Aşağıdaki son grup tam olarak
/// bunu kilitliyor.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/world_coords.dart';

void main() {
  const ev = (k: 2, d: 40);
  const adres = (k: 5, d: 120);
  const secim = (k: 7, d: 9);

  group('visibleCoords — öncelik zinciri', () {
    test('hiçbiri yoksa 1:1', () {
      expect(visibleCoords(null, null, null), (k: 1, d: 1));
    });

    test('yalnız ev varsa eve bakılır', () {
      expect(visibleCoords(null, null, ev), ev);
    });

    /// ⚠️ Adres evin ÖNÜNDE olmak zorunda: derin bağlantıyla gelen oyuncu ilk açılışta
    /// hedefi görmeli, kendi diyarını değil.
    test('adres evi EZER', () {
      expect(visibleCoords(null, adres, ev), adres);
    });

    test('elle seçim her şeyi ezer', () {
      expect(visibleCoords(secim, adres, ev), secim);
    });

    /// ⚠️ `k` ve `d` AYRI çözülüyor: oyuncu yalnız kıtayı değiştirdiğinde diyar numarası
    /// yerinde kalmalı. Çift olarak çözülseydi kıta seçimi diyarı da sıfırlardı.
    test('k ve d ayrı ayrı düşüyor', () {
      expect(visibleCoords((k: 7, d: 9), null, ev), (k: 7, d: 9));
      // Yalnız d taşıyan bir seçim: k eve düşmeli.
      const yalnizD = (k: 3, d: 9);
      expect(visibleCoords(yalnizD, null, ev).k, 3);
    });
  });

  group('homeAction — «kendi diyarıma dön»', () {
    /// ⚠️⚠️ Hatanın ta kendisi: adres varken seçimi boşaltmak YETMEZ, adres de bırakılmalı.
    test('adres varsa adres de bırakılıyor', () {
      final a = homeAction(adres);
      expect(a.sel, isNull);
      expect(a.clearUrl, isTrue);
    });

    test('adres yoksa yalnız seçim bırakılıyor', () {
      final a = homeAction(null);
      expect(a.sel, isNull);
      expect(a.clearUrl, isFalse);
    });

    /// Düğmenin sonucunu UÇTAN UCA ölçüyor: seçim ve adres bırakılınca görünüm EVE düşmeli.
    test('⭐ düğmeden sonra görünüm gerçekten eve dönüyor', () {
      final a = homeAction(adres);
      final sonra = visibleCoords(a.sel, a.clearUrl ? null : adres, ev);
      expect(sonra, ev);
    });

    /// ⚠️ Eve ait koordinat `sel`e YAZILMIYOR: `sel = null` "aktif şehri izle" demek.
    /// Oyuncu sonra şehir değiştirirse görünüm onu takip etmeli.
    test('⭐ eve döndükten sonra şehir değişimi takip ediliyor', () {
      final a = homeAction(null);
      const yeniEv = (k: 8, d: 300);
      expect(visibleCoords(a.sel, null, yeniEv), yeniEv);
    });
  });

  group('realmFromPath', () {
    test('geçerli adres okunuyor', () {
      expect(realmFromPath('5', '120'), (k: 5, d: 120));
    });

    /// ⚠️ Kelepçeleme ATMA DEĞİL: bozuk bağlantı oyuncuyu sessizce eve atmamalı.
    test('sınır dışı adres kırpılıyor, reddedilmiyor', () {
      expect(realmFromPath('11', '900'), (k: 10, d: 500));
    });

    test('sayı olmayan ya da sıfır/negatif adres null', () {
      expect(realmFromPath('a', '1'), isNull);
      expect(realmFromPath('1', ''), isNull);
      expect(realmFromPath('0', '5'), isNull);
      expect(realmFromPath('-3', '5'), isNull);
      expect(realmFromPath(null, null), isNull);
    });
  });
}
