/// ⭐⭐ ŞEHİR SAYAÇLARI — web ile AYNI dosyadan okunan vektörler.
///
/// `clock_test.dart` ile aynı sözleşme: `packages/contracts/fixtures/city-progress-vectors.json`
/// iki uygulamayı da ölçüyor, dosya kopyalanmıyor.
///
/// ⚠️ Ölçülen iki hesap da web'de **canlı hatalardan** doğdu: üretim bandı 2026-07-28'de
/// kullanıcının bildirdiği donma, kaynak sayacı ise yoklama aralığı 60 sn'ye çıkınca görünür
/// olan sıçrama. İkisinin de web'de testi yoktu; mobil port ikisini de sınanabilir yaptı.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/city_progress.dart';

/// ⚠️ `flutter test` çalışma dizini paket kökü (`apps/mobile`).
final _vectors =
    jsonDecode(
          File(
            '../../packages/contracts/fixtures/city-progress-vectors.json',
          ).readAsStringSync(),
        )
        as Map<String, dynamic>;

List<Map<String, dynamic>> _grup(String ad) =>
    (_vectors[ad] as List<dynamic>).cast<Map<String, dynamic>>();

int _ms(String iso) => DateTime.parse(iso).millisecondsSinceEpoch;

void main() {
  group('⭐⭐ ortak vektörler — üretim bandı', () {
    for (final v in _grup('unitProgress')) {
      test(v['ad'] as String, () {
        final got = unitProgress(
          ProgressInput(
            startedAt: v['startedAt'] as String,
            count: (v['count'] as num?)?.toInt(),
            perUnitSeconds: v['perUnitSeconds'] as num?,
          ),
          _ms(v['now'] as String),
        );

        final beklenen = v['beklenen'] as Map<String, dynamic>?;
        if (beklenen == null) {
          expect(got, isNull);
          return;
        }
        expect(got, isNotNull);
        expect(got!.produced, beklenen['produced']);
        expect(got.remaining, beklenen['remaining']);
        expect(got.finished, beklenen['finished']);
        expect(got.unitStart, _ms(beklenen['unitStart'] as String));
        expect(got.unitEnd, _ms(beklenen['unitEnd'] as String));
      });
    }
  });

  group('⭐⭐ ortak vektörler — kaynak sayacı', () {
    for (final v in _grup('resources')) {
      test(v['ad'] as String, () {
        final got = extrapolateResources(
          ResourceInput(
            gold: v['gold'] as num,
            food: v['food'] as num,
            goldPerHour: v['goldPerHour'] as num,
            foodPerHour: v['foodPerHour'] as num,
            serverNow: v['serverNow'] as String,
          ),
          _ms(v['now'] as String),
        );

        final beklenen = v['beklenen'] as Map<String, dynamic>;
        // ⚠️ TAM eşitlik — `closeTo` DEĞİL. İki dil de IEEE754 double kullanıyor ve işlem
        // sırası aynı; yaklaşık karşılaştırma tam olarak yakalamak istediğimiz farkı gizlerdi.
        expect(got.gold, beklenen['gold']);
        expect(got.food, beklenen['food']);
      });
    }
  });

  group('sözleşme bütünlüğü', () {
    test('⚠️ vektör dosyası gerçekten okundu (sessiz boş küme değil)', () {
      expect(_grup('unitProgress').length, greaterThan(8));
      expect(_grup('resources').length, greaterThan(5));
    });

    test('⭐ çıpa YALNIZ `startedAt` — aynı girdiye aynı cevap', () {
      const q = ProgressInput(
        startedAt: '2026-08-15T12:00:00.000Z',
        count: 10,
        perUnitSeconds: 60,
      );
      final now = _ms('2026-08-15T12:05:00.000Z');
      expect(unitProgress(q, now)!.produced, 5);
    });
  });
}
