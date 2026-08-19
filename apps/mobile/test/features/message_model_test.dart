/// POSTA KUTUSU MODELLERİ — **gizlilik sınırlarını ve degrade davranışını** ölçer.
///
/// ⚠️ Bu dosyadaki testlerin çoğu bir alanın `null` KALMASINI kilitliyor. Sebep hep aynı:
/// `null` ile `0` bu sözleşmede farklı şeyler ve ikisini birleştirmek ya bir gizlilik
/// sınırını deler (mağara dökümü) ya da olmayan bir olayı olmuş gibi gösterir (ganimet).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/messages/battle_report.dart';
import 'package:mobilwar/features/messages/message.dart';

Map<String, dynamic> _report([Map<String, dynamic> ek = const {}]) => {
  'battleId': 7,
  'side': 'attacker',
  'winner': 'attacker',
  'won': true,
  'turns': 4,
  'night': false,
  'at': '2026-08-18T10:00:00.000Z',
  'sections': <dynamic>[],
  'heroes': {'mine': <dynamic>[], 'enemy': <dynamic>[], 'captured': null},
  'notes': <dynamic>[],
  'provenance': {'seed': 12, 'engineVersion': 'e1', 'catalogHash': 'c1'},
  ...ek,
};

void main() {
  group('MessageRow', () {
    test('okunmamışlık damgadan türetiliyor', () {
      final okunmus = MessageRow.fromJson({
        'id': 1,
        'kind': 'system',
        'subject': 'x',
        'at': 'A',
        'readAt': 'B',
      });
      final yeni = MessageRow.fromJson({
        'id': 2,
        'kind': 'system',
        'subject': 'x',
        'at': 'A',
        'readAt': null,
      });
      expect(okunmus.unread, isFalse);
      expect(yeni.unread, isTrue);
    });

    /// ⚠️ `side` ve `battleId` gerçekten null gelebiliyor (sistem satırları, ittifak
    /// davetleri). Varsayılan atamak, olmayan bir savaşa bağlantı kurmak olurdu.
    test('⭐ taraf ve savaş kimliği null kalabiliyor', () {
      final m = MessageRow.fromJson({
        'id': 3,
        'kind': 'alliance_invite',
        'side': null,
        'battleId': null,
        'missionId': null,
        'subject': 'Davet',
        'at': 'A',
        'readAt': null,
      });
      expect(m.side, isNull);
      expect(m.battleId, isNull);
    });
  });

  group('MessagePage', () {
    test('sayaçlar ve satırlar okunuyor', () {
      final p = MessagePage.fromJson({
        'unread': 5,
        'total': 42,
        'counts': {
          'reports': 30,
          'messages': 12,
          'unreadReports': 4,
          'unreadMessages': 1,
        },
        'items': [
          {'id': 1, 'kind': 'battle_report', 'subject': 's', 'at': 'A'},
        ],
      });
      expect(p.unread, 5);
      expect(p.total, 42);
      expect(p.counts.unreadReports, 4);
      expect(p.items.single.id, 1);
    });

    /// ⚠️ Eksik yanıt ekranı düşürmemeli: sayaçlar sıfıra, liste boşa düşer.
    test('eksik alanlar sıfıra degrade oluyor', () {
      final p = MessagePage.fromJson(const {});
      expect(p.items, isEmpty);
      expect(p.total, 0);
      expect(p.counts.reports, 0);
    });
  });

  group('BattleReport — gizlilik ve degrade', () {
    /// ⚠️⚠️ **GANİMET `null` KALMALI.** Kaybeden saldıranda ganimet satırı hiç çizilmiyor.
    /// `(0, 0)`a düşürseydik ekran «Ganimet: 0 altın 0 yemek» yazardı — oysa enkaz ÇIKTI,
    /// tamamı savunana gitti ve bunu «Ortaya çıkan» satırı anlatıyor.
    test('⭐ ganimet yoksa null, sıfıra düşmüyor', () {
      expect(BattleReport.fromJson(_report()).loot, isNull);
      final r = BattleReport.fromJson(
        _report({
          'loot': {'gold': 0, 'food': 0},
        }),
      );
      expect(r.loot, isNotNull);
      expect(r.loot!.gold, 0);
    });

    /// ⚠️ `won` sunucudan okunuyor, `winner == side` diye TÜRETİLMİYOR: beraberede o
    /// karşılaştırma iki tarafa da yanlış cevap verirdi.
    test('⭐ kazanç bilgisi türetilmiyor, okunuyor', () {
      final r = BattleReport.fromJson(
        _report({'side': 'attacker', 'winner': 'attacker', 'won': false}),
      );
      expect(r.won, isFalse);
    });

    /// ⚠️⚠️ **MAĞARANIN İÇİ SALDIRANA GİTMEZ.** Sunucu `escaped` anahtarını saldıran tarafta
    /// silerek gönderiyor; istemci onu boş sözlüğe çeviriyor ve satırı hiç çizmiyor.
    test('⭐ mağara kaçış dökümü yoksa boş sözlük', () {
      final r = BattleReport.fromJson(
        _report({
          'cave': {'present': true, 'broken': false, 'escaped': null},
        }),
      );
      expect(r.cave!.escaped, isEmpty);
    });

    /// ⚠️ Sunucudaki alan adı `required`; Dart'ta o bir anahtar kelime. Adı değişince
    /// eşlemenin kopması sessiz olurdu — «gereken 0 cüce» yazardı.
    test('⭐ `required` → `needed` eşlemesi kopmamış', () {
      final r = BattleReport.fromJson(
        _report({
          'cave': {
            'present': true,
            'broken': false,
            'required': 250,
            'survivingDwarves': 90,
            'reason': 'not_enough_dwarves',
          },
        }),
      );
      expect(r.cave!.needed, 250);
      expect(r.cave!.survivingDwarves, 90);
    });

    test('mağara hiç yoksa null', () {
      expect(BattleReport.fromJson(_report()).cave, isNull);
    });

    /// ⚠️ Kapasite yettiğinde `leftBehind` null geliyor ve satır çizilmiyor. `(0,0)`a
    /// düşürseydik her raporda «şehirde kaldı: 0» satırı belirirdi.
    test('⭐ geride kalan yoksa null', () {
      final r = BattleReport.fromJson(
        _report({
          'lootBreakdown': {
            'revealed': {'gold': 100, 'food': 50},
            'carried': {'gold': 100, 'food': 50},
            'leftBehind': null,
            'capacity': 9000,
          },
        }),
      );
      expect(r.lootBreakdown!.leftBehind, isNull);
      expect(r.lootBreakdown!.carried!.gold, 100);
      expect(r.lootBreakdown!.capacity, 9000);
    });

    /// ⚠️ Saldıran kaybettiyse `carried` null ama `revealed` DOLU: enkaz oluştu, taşınmadı.
    test('⭐ kaybeden saldıranda taşınan null, ortaya çıkan dolu', () {
      final r = BattleReport.fromJson(
        _report({
          'lootBreakdown': {
            'revealed': {'gold': 4000, 'food': 900},
            'carried': null,
          },
        }),
      );
      expect(r.lootBreakdown!.carried, isNull);
      expect(r.lootBreakdown!.revealed.gold, 4000);
    });

    /// ⚠️ Sur bütünlüğü 0..1 oran ve **kesirli**: `int` okusaydık 0.87 → 0 olurdu.
    test('sur bütünlüğü kesirli okunuyor', () {
      final r = BattleReport.fromJson(
        _report({
          'wall': {'level': 8, 'integrity': 0.87, 'destroyed': false},
        }),
      );
      expect(r.wall!.integrity, closeTo(0.87, 1e-9));
      expect(r.wall!.level, 8);
    });

    /// ⚠️ Savunanda sur hiç yoksa `null` — «seviye 0 Sur» diye bir kutu çizmemek için.
    test('sur yoksa null', () {
      expect(BattleReport.fromJson(_report()).wall, isNull);
    });

    /// ⚠️ Koordinat adları 2026-08-04/08-07'den ESKİ raporlarda yok. Satır adsız çizilmeli,
    /// çökmemeli.
    test('⭐ eski raporda koordinat adsız okunuyor', () {
      final r = BattleReport.fromJson(
        _report({
          'coords': {
            'origin': {'k': 1, 'd': 2, 's': 3},
            'target': null,
          },
        }),
      );
      expect(r.origin!.k, 1);
      expect(r.origin!.owner, isNull);
      expect(r.target, isNull);
    });

    test('birim satırında taban iadesi yoksa 0', () {
      final r = BattleReport.fromJson(
        _report({
          'sections': [
            {
              'key': 'mine',
              'title': 'Savaşçıların',
              'lines': [
                {
                  'id': 'dwarf',
                  'name': 'Cüce',
                  'before': 120,
                  'after': 84,
                  'lost': 36,
                },
              ],
            },
          ],
        }),
      );
      final l = r.sections.single.lines.single;
      expect(l.restoredByFloor, 0);
      expect(l.name, 'Cüce');
      expect(l.lost, 36);
    });

    /// ⚠️ Rakip kahramanın tecrübesi sunucuda 0 geliyor (sızdırılmıyor); istemci onu
    /// "bilinmiyor" diye başka bir şeye çevirmemeli.
    test('kahraman satırları iki taraf için de okunuyor', () {
      final r = BattleReport.fromJson(
        _report({
          'heroes': {
            'mine': [
              {'name': 'Baturalp', 'level': 7, 'alive': false, 'xpGained': 120},
            ],
            'enemy': [
              {'name': 'Rakip', 'level': 5, 'alive': true, 'xpGained': 0},
            ],
            'captured': {'name': 'Yeni', 'mine': true},
          },
        }),
      );
      expect(r.myHeroes.single.alive, isFalse);
      expect(r.myHeroes.single.xpGained, 120);
      expect(r.enemyHeroes.single.xpGained, 0);
      expect(r.captured!.mine, isTrue);
    });
  });
}
