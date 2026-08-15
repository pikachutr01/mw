/// ŞEHİR MODELİ — ayrıştırmanın **kararlarını** ölçer, alan kopyalamayı değil.
///
/// ⚠️ Alan alan "a → a mı" diye bakan testler yazılmadı: onlar modelin kendisinin ikinci bir
/// kopyası olur, bir alan yanlış eşlendiğinde ikisi birden yanlış olurdu. Burada ölçülen şey
/// **yorum gerektiren** noktalar — eksik alanın nasıl okunduğu, hangi satırın bant çizeceği.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/city/city_model.dart';

Map<String, dynamic> _sehir({
  Object? buildings,
  List<dynamic> queues = const [],
  bool? onVacation,
}) => {
  'id': 20,
  'name': 'Çığlıktepe',
  'coordinates': {'k': 1, 'd': 2, 's': 1},
  'isCapital': true,
  'resources': {'gold': 6092741, 'food': 6743895},
  'production': {'goldPerHour': 1636, 'foodPerHour': 2844},
  'onVacation': ?onVacation,
  'buildings': buildings ?? {'farm': 21, 'castle': 16},
  'units': {'dwarf': 407},
  'queues': queues,
  'serverNow': '2026-08-15T20:33:29.541Z',
  'gameNow': '2026-08-15T20:33:29.442Z',
};

Map<String, dynamic> _kuyruk({
  int? count,
  num? perUnitSeconds,
  int? position,
  int? targetLevel,
  String category = 'unit',
}) => {
  'id': 152,
  'category': category,
  'itemType': 'dwarf',
  'targetLevel': targetLevel,
  'count': count,
  'startedAt': '2026-08-15T20:33:29.442Z',
  'finishAt': '2026-08-15T20:39:23.202Z',
  'perUnitSeconds': perUnitSeconds,
  'position': ?position,
};

void main() {
  group('CityDetail', () {
    test('sunucunun gerçek yanıt şekli okunur', () {
      final c = CityDetail.fromJson(_sehir());
      expect(c.name, 'Çığlıktepe');
      expect(c.coordinates, (k: 1, d: 2, s: 1));
      expect(c.gold, 6092741);
      expect(c.goldPerHour, 1636);
      expect(c.buildings['farm'], 21);
    });

    test('⭐ `onVacation` YOKSA tatilde SAYILMAZ', () {
      // Eksik bayrağı "tatilde" saymak, sunucusu bu alanı göndermeyen bir sürümde herkesin
      // ekranına yanlış bir uyarı basardı.
      expect(CityDetail.fromJson(_sehir()).onVacation, isFalse);
      expect(CityDetail.fromJson(_sehir(onVacation: true)).onVacation, isTrue);
    });

    test('⚠️ sayı olmayan yapı değeri sessizce ATILIR, çökmez', () {
      // Sunucu bir alanı `null` bırakırsa ekranın tamamı kaybolmamalı; o satır düşer.
      final c = CityDetail.fromJson(
        _sehir(buildings: {'farm': 21, 'bozuk': null, 'x': 'metin'}),
      );
      expect(c.buildings, {'farm': 21});
    });

    test('kuyruk boşsa liste boş döner (null değil)', () {
      expect(CityDetail.fromJson(_sehir()).queues, isEmpty);
    });
  });

  group('CityQueue — bandı KİM çizer', () {
    test('⭐ adetli ve süresi olan satır bant çizer', () {
      final q = CityQueue.fromJson(_kuyruk(count: 40, perUnitSeconds: 8.84));
      expect(q.isBatch, isTrue);
    });

    test('⚠️ SEVİYE İLERLETME bant çizmez (adet yok)', () {
      // Yapı/teknik satırında `count` null; bant çizmeye kalkmak sıfıra bölme demekti.
      final q = CityQueue.fromJson(
        _kuyruk(category: 'building', targetLevel: 17),
      );
      expect(q.isBatch, isFalse);
      expect(q.targetLevel, 17);
    });

    test('⚠️ `perUnitSeconds` 0 ise bant çizmez', () {
      expect(
        CityQueue.fromJson(_kuyruk(count: 40, perUnitSeconds: 0)).isBatch,
        isFalse,
      );
    });

    test('⚠️⚠️ `position` YOKSA satır AKTİF sayılır', () {
      // Sunucu tek satırlı kuyrukta alanı göndermeyebiliyor. Varsayılanı "bekliyor" yapsaydık
      // tek emirli oyuncu bandı HİÇ göremezdi — en sık karşılaşılan durumda bozuk olurdu.
      expect(
        CityQueue.fromJson(_kuyruk(count: 40, perUnitSeconds: 8.84)).isActive,
        isTrue,
      );
    });

    test('sırada bekleyen satır (position 2) aktif değildir', () {
      expect(
        CityQueue.fromJson(
          _kuyruk(count: 40, perUnitSeconds: 8.84, position: 2),
        ).isActive,
        isFalse,
      );
    });
  });
}
