/// ⭐⭐ SİMÜLATÖR KURALLARI — **kararları** ölçer.
///
/// ⚠️ Buradaki kusurların hepsi sessiz:
///   • sıfırı yükten düşürmeyi unutmak motora *"bu birim savaşa girdi ama sıfır adet"* der
///     ve sonuç tablosu «yok oldu» ile «hiç girmedi»yi karıştırır,
///   • kelepçelenmemiş bir «Tekrar» sunucudan DÜZ zod hatası döndürür (`message` alanı yok)
///     ve ekranda okunmaz bir metin çıkar,
///   • yüzdeyi tam sayıya yuvarlamak, çizilmek üzere olan bir suru «%100» gösterir.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/simulate/simulate_model.dart';
import 'package:mobilwar/features/simulate/simulate_rules.dart';

MwSimSideResult _r({
  Map<String, int> counts = const {},
  num? wall,
  num? shield,
}) => MwSimSideResult(
  alive: 0,
  lost: 0,
  counts: counts,
  floorRestored: const {},
  heroes: const [],
  wallIntegrity: wall,
  shieldIntegrity: shield,
);

void main() {
  group('simAmount', () {
    test('boş, bozuk ve negatif değer sıfıra düşüyor', () {
      expect(simAmount(null), 0);
      expect(simAmount(''), 0);
      expect(simAmount('  '), 0);
      expect(simAmount('abc'), 0);
      expect(simAmount('-5'), 0);
      expect(simAmount('12'), 12);
      expect(simAmount(' 7 '), 7);
    });
  });

  group('simCounts', () {
    /// ⚠️⚠️ ASIL KURAL: anahtarın HİÇ OLMAMASI «bu birim savaşa girmedi», `0` olması
    /// «girdi ve hepsi öldü» demek. Sıfırları göndermek sonuç tablosunu yanlış doldururdu.
    test('⭐⭐ sıfır ve boş satırlar yükten düşüyor', () {
      final r = simCounts({
        'dwarf': '10',
        'elf': '0',
        'ogre': '',
        'chaos': null,
      });
      expect(r, {'dwarf': 10});
    });

    test('hepsi boşsa harita boş', () {
      expect(simCounts({'dwarf': '', 'elf': '0'}), isEmpty);
    });
  });

  group('simRepeat', () {
    /// ⚠️ Kelepçe istemcide de var: sunucu 1..50 istiyor ve aşımda düz zod hatası dönüyor.
    test('⭐ 1 ile 50 arasına kelepçeleniyor', () {
      expect(simRepeat('0'), 1);
      expect(simRepeat('-3'), 1);
      expect(simRepeat('1'), 1);
      expect(simRepeat('50'), 50);
      expect(simRepeat('999'), 50);
    });

    /// ⚠️ Boş ya da bozuk kutu 1: oyuncu «tekrar» alanını hiç açmadıysa tek koşu ister.
    test('⭐ boş ve bozuk değer 1', () {
      expect(simRepeat(null), 1);
      expect(simRepeat(''), 1);
      expect(simRepeat('çok'), 1);
    });
  });

  group('kahraman puanı', () {
    test('harcanan ve bütçe', () {
      const h = (level: 10, fAtk: 12, fDef: 8, mAtk: 0, mDef: 0);
      expect(heroSpent(h), 20);
      expect(heroBudget(h), 30); // 10 × 3
      expect(heroOverBudget(h), isFalse);
    });

    /// ⚠️ Aşım ENGELLENMİYOR, yalnız işaretleniyor: *"seviye 10 kahramana 40 puan
    /// verseydim"* simülatörün cevaplaması gereken bir soru.
    test('⭐ aşım tespit ediliyor ama bir kapı değil', () {
      const h = (level: 10, fAtk: 40, fDef: 0, mAtk: 0, mDef: 0);
      expect(heroOverBudget(h), isTrue);
      expect(heroSpent(h), 40);
    });
  });

  group('simHeroes', () {
    /// ⚠️ Tamamen boş satır yüke GİRMİYOR: motora «savaşa bir kahraman katıldı» der ve
    /// çıkma ihtimalini boş yere değiştirirdi.
    test('⭐ tamamen boş kahraman satırı eleniyor', () {
      final r = simHeroes(const [
        kBosKahraman,
        (level: 5, fAtk: 0, fDef: 0, mAtk: 0, mDef: 0),
        (level: 0, fAtk: 3, fDef: 0, mAtk: 0, mDef: 0),
      ]);
      expect(r, hasLength(2));
    });

    test('hepsi boşsa liste boş', () {
      expect(simHeroes(const [kBosKahraman, kBosKahraman]), isEmpty);
    });
  });

  group('simCanRun', () {
    /// ⚠️ Ölçüt «İKİ tarafta da» DEĞİL: tek taraflı kurulum meşru bir soru
    /// (*"bu orduyu boş şehre sokarsam ne olur"*) ve motor cevaplıyor.
    test('⭐ tek taraf yeterli', () {
      expect(
        simCanRun(attackerCounts: {'dwarf': 1}, defenderCounts: const {}),
        isTrue,
      );
      expect(
        simCanRun(attackerCounts: const {}, defenderCounts: {'guard': 1}),
        isTrue,
      );
    });

    test('iki taraf da boşsa koşulmuyor', () {
      expect(
        simCanRun(attackerCounts: const {}, defenderCounts: const {}),
        isFalse,
      );
    });
  });

  group('integrityText', () {
    /// ⚠️⚠️ BİR ONDALIK KORUNUYOR: tam sayıya yuvarlamak, çizilmek üzere olan bir suru
    /// «%100» gösterirdi ve simülatörün amacı tam olarak o farkı görmek.
    test('⭐⭐ bir ondalık basamak korunuyor', () {
      expect(integrityText(0.999), '%99,9');
      expect(integrityText(0.4567), '%45,7');
    });

    /// ⚠️ Ondalık ayracı VİRGÜL — sayı biçimi uygulamanın geri kalanıyla aynı olmalı.
    test('⭐ ayraç virgül, nokta değil', () {
      expect(integrityText(0.125), contains(','));
      expect(integrityText(0.125), isNot(contains('.')));
    });

    test('tam sayılar ondalıksız yazılıyor', () {
      expect(integrityText(1), '%100');
      expect(integrityText(0), '%0');
      expect(integrityText(0.5), '%50');
    });

    /// ⚠️ `null` «sur yok» demek ve `%0` ile karıştırılmamalı: biri hiç yapılmamış, diğeri
    /// yıkılmış.
    test('⭐ null uzun tire, %0 değil', () {
      expect(integrityText(null), '—');
    });
  });

  group('remainingCell', () {
    /// ⚠️⚠️ ÜÇ AYRI «çizme» sebebi var ve üçü de `0` göstermekten farklı: sonuç yok,
    /// girdi yok, ya da sonuçta bu anahtar hiç geçmiyor.
    test('⭐⭐ sonuç yoksa, girdi yoksa ve anahtar yoksa çizilmiyor', () {
      expect(remainingCell(unitId: 'dwarf', entered: 5, result: null), isNull);
      expect(
        remainingCell(
          unitId: 'dwarf',
          entered: 0,
          result: _r(counts: {'dwarf': 3}),
        ),
        isNull,
      );
      expect(
        remainingCell(
          unitId: 'dwarf',
          entered: 5,
          result: _r(counts: {'elf': 3}),
        ),
        isNull,
      );
    });

    test('kalan sayı ve tükenme işareti', () {
      final kalan = remainingCell(
        unitId: 'dwarf',
        entered: 10,
        result: _r(counts: {'dwarf': 4}),
      );
      expect(kalan!.text, '4');
      expect(kalan.wiped, isFalse);

      final bitti = remainingCell(
        unitId: 'dwarf',
        entered: 10,
        result: _r(counts: {'dwarf': 0}),
      );
      expect(bitti!.wiped, isTrue);
    });

    /// ⚠️ Sur ve Büyü Kalkanı adet değil BÜTÜNLÜK: hücre yüzde göstermeli ve ayrı alandan
    /// okunmalı. `counts`a bakmak boş bir hücre bırakırdı.
    test('⭐⭐ sur ve kalkan yüzdeden okunuyor, counts\'tan değil', () {
      final sur = remainingCell(
        unitId: 'wall',
        entered: 6,
        result: _r(wall: 0.42, counts: const {}),
      );
      expect(sur!.text, '%42');
      expect(sur.wiped, isFalse);

      final kalkan = remainingCell(
        unitId: 'magic_shield',
        entered: 3,
        result: _r(shield: 0),
      );
      expect(kalkan!.text, '%0');
      expect(kalkan.wiped, isTrue);
    });

    /// ⚠️ Girdi var ama sunucu bütünlük döndürmediyse (sur hiç yoksa) çizilmiyor.
    test('⭐ bütünlük null ise hücre yok', () {
      expect(
        remainingCell(unitId: 'wall', entered: 6, result: _r(wall: null)),
        isNull,
      );
    });
  });

  group('techEditable', () {
    /// ⚠️ Taş Ustalığı yalnız SAVUNMA yapılarını ölçekliyor; saldıranda kutu sunmak hiçbir
    /// etkisi olmayan bir alan olurdu.
    test('⭐ Taş Ustalığı saldıranda kapalı, savunanda açık', () {
      expect(techEditable('masonry', attacker: true), isFalse);
      expect(techEditable('masonry', attacker: false), isTrue);
    });

    test('diğer teknikler iki tarafta da açık', () {
      for (final t in ['archery', 'blacksmithing', 'sorcery', 'armor']) {
        expect(techEditable(t, attacker: true), isTrue, reason: t);
        expect(techEditable(t, attacker: false), isTrue, reason: t);
      }
    });
  });

  group('simWinnerLabel', () {
    test('üç sonucun da kendi cümlesi var', () {
      expect(simWinnerLabel('attacker'), 'Saldıran kazandı');
      expect(simWinnerLabel('defender'), 'Savunan kazandı');
      expect(simWinnerLabel('draw'), 'Berabere');
    });

    /// ⚠️ Bilinmeyen değer beraberliğe düşüyor, boş kalmıyor.
    test('⭐ bilinmeyen değer boş kalmıyor', () {
      expect(simWinnerLabel('kraken'), 'Berabere');
    });
  });

  group('simTally', () {
    test('⭐ çoklu koşuda kim kaç kez kazandı', () {
      MwSimResult w(String kim) => MwSimResult(
        winner: kim,
        turns: 1,
        attacker: _r(),
        defender: _r(),
        debrisGold: 0,
        debrisFood: 0,
        xp: 0,
        captureChance: 0,
        carryCapacity: 0,
      );
      final t = simTally([
        w('attacker'),
        w('attacker'),
        w('defender'),
        w('draw'),
      ]);
      expect(t.attacker, 2);
      expect(t.defender, 1);
      expect(t.draw, 1);
    });
  });
}
