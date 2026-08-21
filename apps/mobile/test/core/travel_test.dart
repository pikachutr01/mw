/// ⭐⭐ DİLLER ARASI EŞİTLİK KAPISI — sefer matematiği, Dart tarafı.
///
/// Kardeşi `apps/web/test/travel-vectors.test.ts`. İkisi de
/// `packages/contracts/fixtures/travel-vectors.json` dosyasını **aynı yerden** okuyor
/// (`clock_test.dart` ile aynı desen).
///
/// ⚠️⚠️ Korunan asıl şey `pow(D, p)`: kesirli üs iki dilde son basamakta ayrışabilir ve sonuç
/// yukarı yuvarlandığı için ekrandaki süre sunucununkinden **bir saniye** sapabilir.
///
/// ⚠️ Hızlar fixture'dan geliyor, katalogdan değil — Dart'ta katalog yok (gerekçe
/// `lib/core/travel.dart` başlığında). O yüzden fixture'daki hızların gerçek katalogla aynı
/// kaldığını **TS testi** ayrıca ölçüyor; ikisi birlikte kapıyı kapatıyor.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/travel.dart';

/// ⚠️ `flutter test` çalışma dizini paket kökü (`apps/mobile`) — yol oradan kuruluyor.
/// ⚠️ Dosya KOPYALANMIYOR: kopya, öldürmeye çalıştığımız bayatlamanın ta kendisi olurdu.
final _vectors =
    jsonDecode(
          File(
            '../../packages/contracts/fixtures/travel-vectors.json',
          ).readAsStringSync(),
        )
        as Map<String, dynamic>;

List<Map<String, dynamic>> _grup(String ad) =>
    (_vectors[ad] as List<dynamic>).cast<Map<String, dynamic>>();

MwCoordinates _koord(Map<String, dynamic> j) =>
    (k: j['k'] as int, d: j['d'] as int, s: j['s'] as int);

void main() {
  group('mesafe — ortak vektörler', () {
    for (final t in _grup('distance')) {
      test(t['ad'] as String, () {
        expect(
          distance(
            _koord(t['a'] as Map<String, dynamic>),
            _koord(t['b'] as Map<String, dynamic>),
          ),
          t['beklenen'],
        );
      });
    }
  });

  group('ordu hızı — ortak vektörler', () {
    for (final t in _grup('armySpeed')) {
      test(t['ad'] as String, () {
        final counts = (t['counts'] as Map<String, dynamic>).map(
          (k, v) => MapEntry(k, v as int),
        );
        final speeds = (t['speeds'] as Map<String, dynamic>).map(
          (k, v) => MapEntry(k, v as int),
        );
        /* ⚠️ Ayar vektörden geliyor: Yük Arabası muafiyeti dünya başına açılıp
           kapanabiliyor (`map.cargoIgnoresSpeed`). Yazılmadıysa varsayılan **açık** —
           motorun `DEFAULT_MAP_CONFIG`i ile aynı. */
        final ayar = t['cargoIgnoresSpeed'];
        expect(
          armySpeed(
            counts,
            (id) => speeds[id],
            heroCount: t['heroCount'] as int,
            cfg: ayar is bool
                ? MwMapConfig(cargoIgnoresSpeed: ayar)
                : MwMapConfig.defaults,
          ),
          t['beklenen'],
        );
      });
    }
  });

  group('sefer süresi — ortak vektörler', () {
    for (final t in _grup('travelSeconds')) {
      test(t['ad'] as String, () {
        final i = t['input'] as Map<String, dynamic>;
        expect(
          travelSeconds(
            distance: i['distance'] as num,
            speed: i['speed'] as num,
            cartography: (i['cartography'] as num?) ?? 0,
            crossesDistrict: (i['crossesDistrict'] as bool?) ?? false,
            crossesContinent: (i['crossesContinent'] as bool?) ?? false,
            speedMultiplier: (i['speedMultiplier'] as num?) ?? 1,
          ),
          t['beklenen'],
        );
      });
    }
  });

  /// Vektörlerin ölçmediği tek şey: `route` bayrakları.
  ///
  /// ⚠️ Ayrı ölçülüyor çünkü hata biçimi farklı: bayrağı yanlış üretmek süreyi bugün HİÇ
  /// değiştirmiyor (geçiş süreleri varsayılanda 0) — yani yanlış tamamen **sessiz** kalır ve
  /// ancak panelden geçiş süresi açıldığı gün ortaya çıkardı.
  group('route — geçiş bayrakları', () {
    test('aynı diyar, aynı kıta → ikisi de false', () {
      final r = route((k: 1, d: 2, s: 1), (k: 1, d: 2, s: 5));
      expect(r.crossesDistrict, isFalse);
      expect(r.crossesContinent, isFalse);
      expect(r.distance, 4);
    });

    test('diyar değişiyor', () {
      final r = route((k: 1, d: 2, s: 1), (k: 1, d: 3, s: 1));
      expect(r.crossesDistrict, isTrue);
      expect(r.crossesContinent, isFalse);
    });

    test('kıta değişiyor — diyar da farklıysa ikisi birden', () {
      final r = route((k: 1, d: 2, s: 1), (k: 2, d: 9, s: 1));
      expect(r.crossesDistrict, isTrue);
      expect(r.crossesContinent, isTrue);
    });
  });

  group('MwMapConfig.fromJson', () {
    /// ⚠️ Sunucudan gelen kısmi override varsayılanla BİRLEŞMELİ: eksik alanı 0 saymak
    /// süreyi sessizce sıfırlardı.
    test('eksik alanlar varsayılana düşüyor', () {
      final cfg = MwMapConfig.fromJson({'k': 2400});
      expect(cfg.k, 2400);
      expect(cfg.baseSeconds, MwMapConfig.defaults.baseSeconds);
      expect(cfg.p, MwMapConfig.defaults.p);
    });

    test('alan hiç gelmezse tamamen varsayılan', () {
      expect(MwMapConfig.fromJson(null).k, MwMapConfig.defaults.k);
      expect(MwMapConfig.fromJson('bozuk').p, MwMapConfig.defaults.p);
    });

    /// ⭐ Override GERÇEKTEN süreyi değiştiriyor mu — sabitleri okuyup kullanmamak,
    /// okumamakla aynı şey.
    test('⭐ override süreyi değiştiriyor', () {
      final varsayilan = travelSeconds(distance: 1, speed: 100);
      final hizli = travelSeconds(
        distance: 1,
        speed: 100,
        cfg: MwMapConfig.fromJson({'baseSeconds': 600}),
      );
      expect(hizli, lessThan(varsayilan));
    });
  });
}
