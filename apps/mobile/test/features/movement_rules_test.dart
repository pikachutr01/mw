/// HAREKET KURALLARI — **kararları** ölçer, alan kopyalamayı değil.
///
/// ⚠️ Buradaki her testin arkasında canlıda yaşanmış ya da web'de düzeltilmiş bir hata var;
/// hiçbiri "fonksiyon çalışıyor mu" sorusunu sormuyor. En kritik ikisi:
///   • **renk kuralı** — bir ara "gelen" ile "tehdit" eşitlenmişti ve müttefikin desteği
///     ekranda saldırıyla aynı kırmızıyla görünüyordu (kullanıcı bildirimi, 2026-08-04),
///   • **rozet önceliği** — tehdit her şeyi ezmeli; ezmezse oyuncu kendi nakliyesinin yeşil
///     rozetine bakıp gelen saldırıyı fark etmiyor.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/armies/movement.dart';
import 'package:mobilwar/features/armies/movement_rules.dart';

Movement _m({
  String key = 'k',
  int id = 1,
  String type = 'attack',
  String direction = 'out',
  int cityId = 10,
  String startedAt = '2026-08-17T10:00:00.000Z',
  String executeAt = '2026-08-17T11:00:00.000Z',
  String? returnOf,
  bool canceled = false,
  bool canCancel = false,
  Map<String, int> units = const {},
  List<MwHero> heroes = const [],
  ({int gold, int food})? cargo,
}) => Movement(
  key: key,
  id: id,
  type: type,
  direction: direction,
  icon: 'attack',
  cityId: cityId,
  startedAt: startedAt,
  executeAt: executeAt,
  origin: (k: 1, d: 2, s: 3),
  originPlayer: 'Baturalp',
  target: (k: 4, d: 5, s: 6),
  targetPlayer: 'Kurt',
  returnOf: returnOf,
  canceled: canceled,
  canCancel: canCancel,
  units: units,
  heroes: heroes,
  cargo: cargo,
);

void main() {
  group('titleOf', () {
    test('yön eki türe ekleniyor', () {
      expect(titleOf(_m(type: 'attack', direction: 'out')), 'Saldırı gidiyor');
      expect(
        titleOf(_m(type: 'attack', direction: 'in')),
        'Saldırı yaklaşıyor',
      );
      expect(
        titleOf(_m(type: 'support', direction: 'in')),
        'Destek yaklaşıyor',
      );
    });

    /// ⚠️ Yalnız «Dönüş» yazsaydık metin SİMGEYLE çelişirdi: simge görevin aslına göre
    /// seçiliyor, yani casusluk dönüşünde kuş çizilip yanında «Dönüş» yazardı.
    test('dönüşte hangi görevden dönüldüğü yazılıyor', () {
      expect(
        titleOf(_m(type: 'return', direction: 'own', returnOf: 'spy')),
        'Casusluk dönüşü',
      );
      expect(
        titleOf(
          _m(
            type: 'return',
            direction: 'own',
            returnOf: 'transport',
            canceled: true,
          ),
        ),
        'Nakliye dönüşü (iptal edildi)',
      );
    });

    /// Mağara işleri şehrin İÇİNDE geçiyor: «gidiyor/yaklaşıyor» eki karşı taraf ima ederdi.
    test('mağara işlerinde yön eki yok', () {
      expect(
        titleOf(_m(type: 'cave_return', direction: 'in')),
        'Mağaradan kaçış',
      );
    });

    /// ⚠️ Sunucuya yeni bir görev tipi eklendiğinde ekran BOŞ kalmamalı, ham adıyla görünmeli
    /// (web'deki `nameOf` ile aynı davranış).
    test('bilinmeyen tip ham adıyla görünüyor', () {
      expect(titleOf(_m(type: 'ritual', direction: 'out')), 'ritual gidiyor');
    });
  });

  group('movementTone — "bu bana tehdit mi?"', () {
    /// ⚠️⚠️ Kullanıcının bildirdiği hatanın ta kendisi: renk yalnız YÖNE bakınca gelen destek
    /// kırmızı, kendi saldırım turuncu oluyordu.
    test('gelen dostane hareket kırmızı DEĞİL', () {
      expect(
        movementTone(_m(type: 'support', direction: 'in')),
        MwTone.warning,
      );
      expect(
        movementTone(_m(type: 'transport', direction: 'in')),
        MwTone.warning,
      );
    });

    test('gelen saldırı ve casusluk kırmızı', () {
      expect(movementTone(_m(type: 'attack', direction: 'in')), MwTone.danger);
      expect(movementTone(_m(type: 'spy', direction: 'in')), MwTone.danger);
    });

    test('kendi hareketim ve kendi dönüşüm yeşil', () {
      expect(
        movementTone(_m(type: 'attack', direction: 'out')),
        MwTone.success,
      );
      expect(
        movementTone(_m(type: 'return', direction: 'own', returnOf: 'attack')),
        MwTone.success,
      );
    });

    /// ⚠️ Koordinatıma gelen `found_city` sunucuda `attack` olarak maskeleniyor. İstemci maskeyi
    /// DELMEMELİ: oyuncunun gördüğü şey bir saldırı ve rengi de öyle olmalı.
    test('maskelenmiş şehir kurma kırmızı görünüyor', () {
      expect(movementTone(_m(type: 'attack', direction: 'in')), MwTone.danger);
    });
  });

  group('armiesBadge', () {
    test('hareket yoksa null — sıfırlı rozet değil', () {
      expect(armiesBadge(const []), isNull);
    });

    /// ⚠️ En kritik satır: tehdit HER ŞEYİ ezmeli.
    test('tek bir gelen saldırı, üç kendi hareketimi eziyor', () {
      final b = armiesBadge([
        _m(direction: 'out'),
        _m(direction: 'own', type: 'return', returnOf: 'attack'),
        _m(direction: 'out', type: 'transport'),
        _m(direction: 'in', type: 'attack'),
      ]);
      expect(b, isNotNull);
      expect(b!.tone, MwTone.danger);
      // Sayı TÜM hareketlerin toplamı, yalnız tehditlerin değil.
      expect(b.count, 4);
    });

    test('tehdit yokken kendi hareketim yeşil, yalnız gelen dost sarı', () {
      expect(
        armiesBadge([
          _m(direction: 'in', type: 'support'),
          _m(direction: 'out'),
        ])!.tone,
        MwTone.success,
      );
      expect(
        armiesBadge([_m(direction: 'in', type: 'support')])!.tone,
        MwTone.warning,
      );
    });

    /// Mağara işleri `in` taşıyor ama düşmanca değil → doğal olarak sarıya düşüyorlar;
    /// ayrı bir özel durum yazmaya gerek kalmadığını kilitliyor.
    test('mağara işi tek başına sarı', () {
      expect(
        armiesBadge([_m(direction: 'in', type: 'cave_return')])!.tone,
        MwTone.warning,
      );
    });
  });

  group('threatenedCityIds', () {
    test('yalnız düşmanca gelen hareketin şehri işaretleniyor', () {
      final set = threatenedCityIds([
        _m(cityId: 10, direction: 'in', type: 'attack'),
        _m(cityId: 11, direction: 'in', type: 'support'),
        _m(cityId: 12, direction: 'out', type: 'attack'),
        _m(cityId: 13, direction: 'in', type: 'spy'),
      ]);
      expect(set, {10, 13});
    });
  });

  group('describeUnits', () {
    test('sıfır adet eleniyor, ad çözümü dışarıdan geliyor', () {
      final s = describeUnits(
        {'dwarf': 407, 'elf': 0, 'ogre': 3},
        (id) => {'dwarf': 'Cüce', 'ogre': 'Ogre'}[id] ?? id,
        (n) => '$n',
      );
      expect(s, 'Cüce 407 · Ogre 3');
    });

    /// Sunucuya yeni birim eklendiğinde satır boş kalmamalı.
    test('adı bilinmeyen birim ham id ile yazılıyor', () {
      expect(
        describeUnits({'griffin': 2}, (id) => id, (n) => '$n'),
        'griffin 2',
      );
    });
  });

  group('Movement.fromJson', () {
    /// ⚠️⚠️ TUZAK — `origin ?? {varsayılan}` YAZILAMAZ. `origin: null` geçmek "varsayılanı
    /// kullan" anlamına dönüşüyor ve testin ölçmek istediği durum (alanın GERÇEKTEN null
    /// olması) hiç kurulamıyor. İlk yazımda tam olarak bu oldu: test yeşil geçiyordu ama
    /// ölçtüğü şey varsayılan koordinattı. Sentinel, "verilmedi" ile "null verildi" ayrımını
    /// geri getiriyor.
    const verilmedi = #verilmedi;

    Map<String, dynamic> ham({
      Object? cargo,
      Object? origin = verilmedi,
      Object? units = verilmedi,
    }) => {
      'key': '77-in',
      'id': 77,
      'type': 'attack',
      'direction': 'in',
      'icon': 'attack_in',
      'cityId': 10,
      'startedAt': '2026-08-17T10:00:00.000Z',
      'executeAt': '2026-08-17T11:00:00.000Z',
      'origin': origin == verilmedi ? {'k': 1, 'd': 2, 's': 3} : origin,
      'originPlayer': 'Baturalp',
      'target': {'k': 4, 'd': 5, 's': 6},
      'targetPlayer': null,
      'returnOf': null,
      'canceled': false,
      'canCancel': false,
      'units': units == verilmedi ? {'dwarf': 407} : units,
      'heroes': [
        {'name': 'Baturalp', 'level': 7},
      ],
      'cargo': cargo,
    };

    test('sunucunun gerçek yanıt şekli okunuyor', () {
      final m = Movement.fromJson(ham());
      expect(m.key, '77-in');
      expect(m.origin, (k: 1, d: 2, s: 3));
      expect(m.units, {'dwarf': 407});
      expect(m.heroes.single.name, 'Baturalp');
      expect(m.heroes.single.level, 7);
    });

    /// ⚠️⚠️ GİZLİLİK SINIRI: saldırı gidişinde payload'da kargo YOKTUR. `null` ile `(0,0)` aynı
    /// sayılsaydı ekran «Taşınan: 0 altın» satırı çizer ve savunan, saldırıda kargo alanının
    /// var olduğunu öğrenirdi.
    test('kargo yoksa null kalıyor, sıfıra düşmüyor', () {
      expect(Movement.fromJson(ham()).cargo, isNull);
      final dolu = Movement.fromJson(ham(cargo: {'gold': 50, 'food': 0}));
      expect(dolu.cargo?.gold, 50);
      expect(dolu.cargo?.food, 0);
    });

    /// ⚠️ Şehir kurma dönüşünün kaynağı BOŞ bir koordinattır ve JOIN'den gelmez; sunucu
    /// payload'dan okuyamazsa alan null düşer. Ekran «—» yazmalı, çökmemeli.
    test('koordinat null olabiliyor', () {
      expect(Movement.fromJson(ham(origin: null)).origin, isNull);
      expect(coordText(null), '—');
    });

    /// «Tüm askerler öldü, kahraman dönüyor» hâli — boş nesne gerçek bir durum.
    test('boş ordu okunabiliyor', () {
      expect(Movement.fromJson(ham(units: <String, dynamic>{})).units, isEmpty);
    });
  });
}
