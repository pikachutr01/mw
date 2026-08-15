/// ⭐ «ÜRET» KAPISI — emir verilebilir mi?
///
/// Her koşul sunucunun bir reddinin aynası. Yanlışı **iki yönde de** kötü: gevşek olursa
/// oyuncu düğmeye basar ve sunucu sebebi anlaşılmaz biçimde reddeder; sıkı olursa oyuncu
/// yapabileceği bir şeyi yapamaz ve neden yapamadığını göremez.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/city/catalog_model.dart';
import 'package:mobilwar/features/city/train_rules.dart';

CatalogUnit _unit({
  int gold = 200,
  int food = 450,
  num seconds = 9,
  num? baseSeconds,
  List<NamedRequirement> reqs = const [],
}) => CatalogUnit(
  id: 'dwarf',
  name: 'Cüce',
  area: 1,
  gold: gold,
  food: food,
  seconds: seconds,
  baseSeconds: baseSeconds,
  levelBased: false,
  current: 0,
  requirements: reqs,
);

bool _ok({
  int count = 5,
  bool afford = true,
  bool hasUnmet = false,
  bool slotsFull = false,
  bool locked = false,
  bool busy = false,
}) => canTrain(
  count: count,
  afford: afford,
  hasUnmet: hasUnmet,
  slotsFull: slotsFull,
  locked: locked,
  busy: busy,
);

void main() {
  group('canTrain', () {
    test('her şey uygunsa açık', () {
      expect(_ok(), isTrue);
    });

    test('⚠️ BOŞ kutuyla emir gitmez (0 ve negatif)', () {
      expect(_ok(count: 0), isFalse);
      expect(_ok(count: -3), isFalse);
    });

    test('kaynak yetmiyorsa kapalı', () {
      expect(_ok(afford: false), isFalse);
    });

    test('ön koşul karşılanmıyorsa kapalı', () {
      expect(_ok(hasUnmet: true), isFalse);
    });

    test('bant doluysa kapalı', () {
      expect(_ok(slotsFull: true), isFalse);
    });

    test('⭐ Baraka yükseltiliyorsa kapalı (karşılıklı kilit)', () {
      expect(_ok(locked: true), isFalse);
    });

    test('⚠️ uçuşta istek varken kapalı — çift gönderim koruması', () {
      // Aksi hâlde hızlı iki dokunuş İKİ emir açardı ve ikincisi bant sınırını aşabilirdi.
      expect(_ok(busy: true), isFalse);
    });
  });

  group('bandLimitFor', () {
    test('sınır yapı seviyesidir', () {
      expect(bandLimitFor(15), 15);
      expect(bandLimitFor(1), 1);
    });

    test('⚠️ seviye 0 olsa bile EN AZ 1 — yoksa hiç emir verilemezdi', () {
      expect(bandLimitFor(0), 1);
      expect(bandLimitFor(-2), 1);
    });
  });

  group('unmetRequirements', () {
    const wizardry = NamedRequirement(
      id: 'wizardry',
      name: 'Büyücülük',
      level: 12,
      kind: 'tech',
    );
    const wall = NamedRequirement(
      id: 'wall',
      name: 'Sur',
      level: 5,
      kind: 'building',
    );

    test('yeterli seviye varsa boş döner', () {
      expect(
        unmetRequirements(
          _unit(reqs: const [wizardry]),
          structures: const {},
          techs: const {'wizardry': 12},
        ),
        isEmpty,
      );
    });

    test('eksik teknik listelenir', () {
      final eksik = unmetRequirements(
        _unit(reqs: const [wizardry]),
        structures: const {},
        techs: const {'wizardry': 11},
      );
      expect(eksik.single.name, 'Büyücülük');
    });

    test(
      '⚠️⚠️ SUR bir YAPI koşulu ama `defenses` tablosunda yaşıyor — `structureLevels` şart',
      () {
        // Yalnız `buildings`e bakılsaydı Sur daima 0 görünür ve Sur ön koşullu her savunma
        // birimi kilitli kalırdı. Web'de ve sunucuda aynı hata yaşandı.
        final u = _unit(reqs: const [wall]);
        expect(
          unmetRequirements(u, structures: const {}, techs: const {}),
          isNotEmpty,
          reason: 'Sur bilinmiyorsa koşul karşılanmamış sayılmalı',
        );
        expect(
          unmetRequirements(
            u,
            // `CityDetail.structureLevels` Sur'u buraya koyuyor.
            structures: const {'wall': 5},
            techs: const {},
          ),
          isEmpty,
        );
      },
    );
  });

  group('trainTotal — adetle çarpım', () {
    test('altın, yemek ve süre adetle çarpılır', () {
      final t = trainTotal(_unit(), 25);
      expect(t.gold, 5000);
      expect(t.food, 11250);
      expect(t.seconds, 225);
    });

    test(
      '⚠️ ÇARPANSIZ süre de çarpılır — yoksa indirim etiketi 100 birimde saçmalardı',
      () {
        final t = trainTotal(_unit(seconds: 9, baseSeconds: 90), 10);
        expect(t.seconds, 90);
        expect(t.baseSeconds, 900);
      },
    );

    test('çarpan yoksa `baseSeconds` null KALIR (0\'a düşmez)', () {
      // "Alan yok" ile "çarpan 1" farklı şeyler; null kalınca indirim etiketi hiç çizilmiyor.
      expect(trainTotal(_unit(), 3).baseSeconds, isNull);
    });
  });
}
