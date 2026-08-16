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

  /// ⭐⭐ SEVİYE İLERLETME KAPILARI (2026-08-17) — Yapılar ve Akademi.
  ///
  /// ⚠️ Her koşul sunucunun bir reddinin aynası ve yanlışı İKİ YÖNDE de kötü: gevşek olursa
  /// oyuncu düğmeye basar ve sebebi anlaşılmayan bir hata alır, sıkı olursa yapabileceği bir
  /// şeyi yapamaz. Bu yüzden her kapı ayrı ayrı sınanıyor — birleşik tek bir "açık mı" testi,
  /// hangi koşulun kapattığını söylemezdi.
  group('canUpgradeBuilding', () {
    bool ac({
      bool maxed = false,
      bool capped = false,
      bool afford = true,
      bool hasUnmet = false,
      bool busy = false,
      bool pending = false,
      bool mutex = false,
      bool caveLocked = false,
    }) => canUpgradeBuilding(
      maxed: maxed,
      capped: capped,
      afford: afford,
      hasUnmet: hasUnmet,
      busy: busy,
      pending: pending,
      mutex: mutex,
      caveLocked: caveLocked,
    );

    test('her şey uygunsa açık', () => expect(ac(), isTrue));
    test('tavandaki yapı kapalı', () => expect(ac(maxed: true), isFalse));
    test('§verify tavanı kapalı', () => expect(ac(capped: true), isFalse));
    test('kaynak yetmiyorsa kapalı', () => expect(ac(afford: false), isFalse));
    test('ön koşul eksikse kapalı', () => expect(ac(hasUnmet: true), isFalse));

    /// ⚠️ İnşaat aynı anda TEK: başka bir yapı emri varken HEPSİ kapalı.
    test(
      '⭐ başka bir yapı emri varken kapalı',
      () => expect(ac(busy: true), isFalse),
    );

    /// ⚠️ `pending` `busy`den AYRI: uçuştaki istek ile açık kuyruk farklı şeyler. Tek alanda
    /// birleştirilseydi iptalden sonra düğme açılmazdı.
    test(
      'istek uçuştayken kapalı (çift gönderim)',
      () => expect(ac(pending: true), isFalse),
    );

    test('⭐ karşılıklı kilit kapalı', () => expect(ac(mutex: true), isFalse));
    test(
      '⭐ mağara meşgulken kapalı',
      () => expect(ac(caveLocked: true), isFalse),
    );
  });

  group('buildingMutex — karşılıklı kilit (§13.11.5a)', () {
    test('⭐ asker üretilirken Baraka kilitli', () {
      expect(
        buildingMutex('barracks', unitBusy: true, techBusy: false),
        isNotNull,
      );
    });
    test('⭐ araştırma sürerken Akademi kilitli', () {
      expect(
        buildingMutex('academy', unitBusy: false, techBusy: true),
        isNotNull,
      );
    });

    /// ⚠️ Kilit ÇAPRAZ DEĞİL: asker üretimi Akademi'yi, araştırma Baraka'yı etkilemez.
    /// Bu ayrım sunucuda da var; karıştırmak oyuncuyu yapabileceği bir yükseltmeden alıkoyardı.
    test('⚠️ asker üretimi Akademi\'yi etkilemez', () {
      expect(buildingMutex('academy', unitBusy: true, techBusy: false), isNull);
    });
    test('⚠️ araştırma Baraka\'yı etkilemez', () {
      expect(
        buildingMutex('barracks', unitBusy: false, techBusy: true),
        isNull,
      );
    });
    test('ilgisiz yapı hiç kilitlenmez', () {
      expect(buildingMutex('farm', unitBusy: true, techBusy: true), isNull);
    });
    test('kilit metni SEBEBİ söyler (boş bool değil)', () {
      expect(
        buildingMutex('barracks', unitBusy: true, techBusy: false),
        contains('Baraka'),
      );
    });
  });

  group('canResearch', () {
    bool ac({
      bool capped = false,
      bool afford = true,
      bool hasUnmet = false,
      bool busyHere = false,
      bool alreadyRunning = false,
      bool academyUpgrading = false,
      bool pending = false,
    }) => canResearch(
      capped: capped,
      afford: afford,
      hasUnmet: hasUnmet,
      busyHere: busyHere,
      alreadyRunning: alreadyRunning,
      academyUpgrading: academyUpgrading,
      pending: pending,
    );

    test('her şey uygunsa açık', () => expect(ac(), isTrue));
    test('§verify tavanı kapalı', () => expect(ac(capped: true), isFalse));
    test('kaynak yetmiyorsa kapalı', () => expect(ac(afford: false), isFalse));
    test('ön koşul eksikse kapalı', () => expect(ac(hasUnmet: true), isFalse));
    test(
      'bu şehirde araştırma sürerken kapalı',
      () => expect(ac(busyHere: true), isFalse),
    );

    /// ⚠️⚠️ AKADEMİLER ORTAK: teknik BAŞKA şehirde araştırılıyorsa burada da kapalı olmalı.
    /// Yalnız bu şehrin kuyruğuna bakan bir ekran, aynı tekniği iki şehirden başlatmaya
    /// davet ederdi (sunucu reddeder, oyuncu sebebini anlamaz).
    test('⭐⭐ teknik başka şehirde araştırılıyorsa kapalı', () {
      expect(ac(alreadyRunning: true), isFalse);
    });

    test(
      '⭐ Akademi yükseltilirken kapalı',
      () => expect(ac(academyUpgrading: true), isFalse),
    );
  });

  group('defenseCapped — §verify savunmada İKİ AYRI kural', () {
    const caps = VerifyCaps(
      maxBuildingLevel: 3,
      maxTechLevel: 3,
      maxDefenseLevel: 3,
    );

    test('doğrulanmış hesapta hiç tavan yok', () {
      expect(
        defenseCapped(caps: null, levelBased: true, currentLevel: 99),
        isFalse,
      );
      expect(
        defenseCapped(caps: null, levelBased: false, currentLevel: 0),
        isFalse,
      );
    });

    /// Sur / Büyü Kalkanı → SEVİYE tavanı, «≥» (sunucudaki kuralın aynısı).
    test('⭐ seviye taşıyan savunma tavana kadar açık', () {
      expect(
        defenseCapped(caps: caps, levelBased: true, currentLevel: 2),
        isFalse,
      );
    });
    test('⭐ tavana ULAŞAN kapalı (≥, > değil)', () {
      expect(
        defenseCapped(caps: caps, levelBased: true, currentLevel: 3),
        isTrue,
      );
    });

    /// ⚠️ Adetli savunma birimi doğrulanmamış hesapta TAMAMEN yasak — seviyeye bakılmaz.
    test('⭐⭐ adetli savunma birimi doğrulanmadan HİÇ üretilemez', () {
      expect(
        defenseCapped(caps: caps, levelBased: false, currentLevel: 0),
        isTrue,
      );
    });
  });

  group('unmetFor — seviye taşıyan kalemlerin ön koşulu', () {
    const kale = NamedRequirement(
      id: 'castle',
      name: 'Kale',
      level: 5,
      kind: 'building',
    );
    const mimar = NamedRequirement(
      id: 'architecture',
      name: 'Mimarlık',
      level: 2,
      kind: 'tech',
    );

    test('hepsi karşılanmışsa boş', () {
      expect(
        unmetFor(
          [kale, mimar],
          structures: {'castle': 5},
          techs: {'architecture': 2},
        ),
        isEmpty,
      );
    });

    test('eksik olan LİSTELENİR (hangisi olduğu görünsün)', () {
      final eksik = unmetFor(
        [kale, mimar],
        structures: {'castle': 4},
        techs: {'architecture': 2},
      );
      expect(eksik.map((r) => r.id), ['castle']);
    });

    /// ⚠️⚠️ SUR bir YAPI koşulu ama `defenses` tablosunda yaşıyor. `structures`
    /// (`CityDetail.structureLevels`) onu içeriyor; yalnız `buildings`e bakmak Sur'u daima 0
    /// gösterir ve Sur ön koşullu her kalem kilitli kalırdı. Web'de ve sunucuda aynı hata yaşandı.
    test('⚠️⚠️ Sur `structures` üzerinden okunuyor', () {
      const sur = NamedRequirement(
        id: 'wall',
        name: 'Sur',
        level: 3,
        kind: 'building',
      );
      expect(
        unmetFor([sur], structures: {'wall': 3}, techs: const {}),
        isEmpty,
      );
      expect(
        unmetFor([sur], structures: const {}, techs: const {}),
        hasLength(1),
      );
    });
  });
}
