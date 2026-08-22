/// ⭐⭐ SİMÜLATÖRE AKTAR — casusluk künyesinden forma devir.
///
/// ⚠️ Buradaki kusurların hepsi sessiz: sur `structures`tan alınmazsa casusluktan gelen bir
/// savunmada sur hep sıfır görünür; savaşa girmeyen bir teknik devredilirse simülatörde
/// kutusu olmadığı için kaybolur; sürüm damgası okunmazsa eski bir kayıt formu çöple doldurur.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/simulate/simulate_prefill.dart';

void main() {
  group('simSideFromIntel', () {
    test('savaşçı ve savunma adetleri geçiyor, sıfırlar düşüyor', () {
      final p = simSideFromIntel({
        'warriors': {'dwarf': 120, 'elf': 0},
        'defenses': {'guard': 30, 'trap': 0},
      });
      expect(p.counts, {'dwarf': 120, 'guard': 30});
    });

    /// ⚠️⚠️ ASIL TUZAK: sunucu Sur ve Büyü Kalkanı'nı `defenses`ten AYIKLIYOR (adet değil
    /// seviye taşıdıkları için "toplam savunma ünitesi"ne girmemeleri gerekiyordu) ve ayrı
    /// bir `structures` kaydına yazıyor. Simülatörde ikisi de aynı `counts` tablosunda.
    /// Birleştirme atlanırsa casusluktan gelen savunmada sur HEP SIFIR görünür.
    test('⭐⭐ sur ve kalkan structures\'tan counts\'a katılıyor', () {
      final p = simSideFromIntel({
        'defenses': {'guard': 10},
        'structures': {'wall': 6, 'magic_shield': 3, 'castle': 12},
      });
      expect(p.counts['wall'], 6);
      expect(p.counts['magic_shield'], 3);
      // ⚠️ Kale savaş yapısı değil, simülatörde kutusu yok — devredilmemeli.
      expect(p.counts.containsKey('castle'), isFalse);
    });

    /// ⚠️ Tapınak `kLevelBased` kümesinde ama savaş yapısı DEĞİL: simülatörde ayrı bir
    /// alanda kahraman ihtimalini besliyor, `counts` tablosuna girmemeli.
    test('⭐ tapınak counts\'a girmiyor', () {
      final p = simSideFromIntel({
        'structures': {'temple': 8, 'wall': 2},
      });
      expect(p.counts.containsKey('temple'), isFalse);
      expect(p.counts['wall'], 2);
    });

    /// ⚠️ Savaşa girmeyen teknikler devredilmiyor: simülatörde kutuları yok, yazsaydık
    /// sessizce kaybolurlardı.
    test('⭐⭐ yalnız savaş teknikleri devrediliyor', () {
      final p = simSideFromIntel({
        'techs': {
          'archery': 5,
          'masonry': 3,
          'espionage': 9,
          'cartography': 4,
          'colonization': 2,
        },
      });
      expect(p.tech, {'archery': 5, 'masonry': 3});
    });

    /// ⚠️ Gece görüşü `tech`ten AYRI bir alan: simülatörde kendi kutusu var ve teknik
    /// listesinde görünmüyor.
    test('⭐ gece görüşü ayrı alana çıkıyor', () {
      final p = simSideFromIntel({
        'techs': {'night_vision': 4, 'archery': 2},
      });
      expect(p.vision, 4);
      expect(p.tech.containsKey('night_vision'), isFalse);
    });

    test('kahramanlar en fazla beş, yetenekler okunuyor', () {
      final p = simSideFromIntel({
        'heroes': [
          for (var i = 0; i < 7; i++)
            {
              'level': 10 + i,
              'skills': {'fAtk': 5, 'fDef': 4, 'mAtk': 3, 'mDef': 2},
            },
        ],
      });
      expect(p.heroes, hasLength(5));
      expect(p.heroes.first.level, 10);
      expect(p.heroes.first.fAtk, 5);
      expect(p.heroes.first.mDef, 2);
    });

    /// ⚠️ Yetenek bloğu eksik olabilir (düşük casusluk kademesi): çökmemeli, sıfır olmalı.
    test('⭐ yetenek bloğu yoksa sıfır, çökmüyor', () {
      final p = simSideFromIntel({
        'heroes': [
          {'level': 7},
        ],
      });
      expect(p.heroes.single.level, 7);
      expect(p.heroes.single.fAtk, 0);
    });

    test('boş künye boş devir üretiyor', () {
      expect(simSideFromIntel(const {}).bos, isTrue);
    });
  });

  group('simIntelTransferable', () {
    /// ⚠️ Casusluk KADEMELİ: düşük kademede yalnız kaynak sızıyor. Boş bir formu
    /// "aktardım" diye açmak, düğmenin çalışmadığını düşündürürdü.
    test('⭐ yalnız kaynak sızan künye aktarılabilir değil', () {
      expect(
        simIntelTransferable({
          'resources': {'gold': 100},
        }),
        isFalse,
      );
      expect(simIntelTransferable(const {}), isFalse);
    });

    test(
      '⭐ asker, savunma, kahraman ya da kahraman sayısı varsa aktarılabilir',
      () {
        expect(simIntelTransferable({'warriors': const {}}), isTrue);
        expect(simIntelTransferable({'defenses': const {}}), isTrue);
        expect(simIntelTransferable({'heroes': const []}), isTrue);
        expect(simIntelTransferable({'heroCount': 2}), isTrue);
      },
    );
  });

  group('MwSimTransfer kodlama', () {
    test('gidiş dönüş alanları koruyor', () {
      final t = MwSimTransfer(
        defender: const MwSimPrefill(
          counts: {'dwarf': 10, 'wall': 5},
          tech: {'archery': 3},
          heroes: [(level: 12, fAtk: 6, fDef: 5, mAtk: 0, mDef: 0)],
          heroCount: 2,
          vision: 4,
        ),
      );
      final geri = MwSimTransfer.decode(t.encode())!;
      final d = geri.defender!;
      expect(d.counts, {'dwarf': 10, 'wall': 5});
      expect(d.tech, {'archery': 3});
      expect(d.heroes.single.level, 12);
      expect(d.heroCount, 2);
      expect(d.vision, 4);
      // ⚠️ Yazılmayan taraf `null` kalıyor — boş harita ile karıştırılmamalı.
      expect(geri.attacker, isNull);
    });

    /// ⚠️⚠️ SÜRÜM DAMGASI: depo elle düzenlenebilir ve eski bir biçimi zorla okumak formu
    /// çöple doldururdu. Uyuşmayan kayıt sessizce atılıyor.
    test('⭐⭐ sürüm uyuşmazsa kayıt atılıyor', () {
      expect(MwSimTransfer.decode('{"v":99,"defender":{}}'), isNull);
      expect(MwSimTransfer.decode('{"defender":{}}'), isNull);
    });

    /// ⚠️ Bozuk kayıt ÇÖKMEMELİ: form boş açılsın, uygulama açılmasın değil.
    test('⭐ bozuk ve boş kayıt null, çökmüyor', () {
      expect(MwSimTransfer.decode('{bozuk'), isNull);
      expect(MwSimTransfer.decode('[]'), isNull);
      expect(MwSimTransfer.decode(''), isNull);
      expect(MwSimTransfer.decode(null), isNull);
    });
  });
}
