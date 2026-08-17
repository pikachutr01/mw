/// TAPINAK KURALLARI — **kararları** ölçer.
///
/// ⚠️ Buradaki üç kural da bir yanlış okumaya açık ve ikisi canlıda düzeltildi: etiketlerin
/// birleştirilmesi (`destroyed` silinen bir durumdu) ve puan geri alma yasağı.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/temple/hero_model.dart';
import 'package:mobilwar/features/temple/hero_rules.dart';

HeroRow _h({
  int level = 3,
  int xp = 40,
  int xpForNext = 100,
  int pointsTotal = 6,
  int pointsSpent = 2,
  String state = 'in_city',
  Object? reviveCost,
}) => HeroRow.fromJson({
  'id': 1,
  'name': 'Baturalp',
  'level': level,
  'xp': xp,
  'xpForNext': xpForNext,
  'skills': {'fAtk': 1, 'fDef': 1, 'mAtk': 0, 'mDef': 0},
  'pointsTotal': pointsTotal,
  'pointsSpent': pointsSpent,
  'state': state,
  'reviveUntil': null,
  'returningAt': null,
  'caveAt': null,
  'reviveCost': reviveCost,
  'reviveSeconds': null,
});

void main() {
  group('heroStateLabel', () {
    /// ⚠️⚠️ TEK ETİKET (kullanıcı, 2026-08-01): savaşta ölen kahraman — yolda da olsa evde de
    /// olsa — «Yok Edildi» yazar. İkisi oyuncu açısından aynı: kahraman savaşamaz hâlde.
    test('⭐ dead ve returning AYNI etiketi taşıyor', () {
      expect(heroStateLabel('dead').text, 'Yok Edildi');
      expect(heroStateLabel('returning').text, 'Yok Edildi');
      expect(heroStateLabel('dead').tone, MwHeroTone.danger);
      expect(heroStateLabel('returning').tone, MwHeroTone.danger);
    });

    /// ⭐ Mağara etiketleri orijinalin kendi metinleri (`k.a[234..236]`) — çevrilmedi.
    test('mağara durumları orijinal metinleriyle', () {
      expect(heroStateLabel('in_cave').text, 'Mağarada');
      expect(heroStateLabel('entering_cave').text, 'Mağaraya Giriyor');
      expect(heroStateLabel('leaving_cave').text, 'Mağaradan Çıkıyor');
    });

    /// ⚠️ «Mağarada» yeşil: kahraman en güvenli hâlinde (savaşa girmiyor, casus göremiyor).
    /// Geçişler nötr — henüz bir şey olmadı, yalnız sayaç işliyor.
    test('mağarada yeşil, geçişler nötr', () {
      expect(heroStateLabel('in_cave').tone, MwHeroTone.success);
      expect(heroStateLabel('entering_cave').tone, MwHeroTone.muted);
      expect(heroStateLabel('leaving_cave').tone, MwHeroTone.muted);
    });

    /// ⚠️⚠️ Sunucuya yeni bir durum eklenirse ekran boş kalmamalı — ve sessizce «Şehirde»
    /// dememeli: savaşamayan bir kahramanı hazır göstermek en tehlikeli varsayılan olurdu.
    test('⭐ bilinmeyen durum ham adıyla ve NÖTR', () {
      final l = heroStateLabel('petrified');
      expect(l.text, 'petrified');
      expect(l.tone, MwHeroTone.muted);
    });
  });

  group('xpProgress', () {
    test('normal oran', () {
      expect(xpProgress(40, 100), closeTo(0.4, 1e-9));
    });

    /// ⚠️ Sıfıra bölmek `NaN` genişlik üretiyor ve Flutter çizimde patlıyor.
    test('⭐ eşik 0 ise çubuk boş — bölme YOK', () {
      expect(xpProgress(500, 0), 0);
    });

    test('taşan ve negatif değerler kelepçeleniyor', () {
      expect(xpProgress(300, 100), 1);
      expect(xpProgress(-5, 100), 0);
    });
  });

  group('puan dağıtımı', () {
    /// ⚠️⚠️ Dağıtılan puan GERİ ALINAMAZ; sunucu da aynı kuralı uyguluyor. Serbest bıraksaydık
    /// oyuncu harcanmış bir puanı geri alabildiğini sanır, kaydedince reddedilirdi.
    test('⭐ taslak kaydedilmiş değerin ALTINA inemiyor', () {
      expect(canDecreaseSkill(3, 3), isFalse);
      expect(canDecreaseSkill(2, 3), isFalse);
    });

    /// ⚠️ Ama bu turda eklenen puan geri alınabiliyor — «puanı saklayıp sonra dağıt» hakkı.
    test('⭐ bu turda eklenen puan geri alınabiliyor', () {
      expect(canDecreaseSkill(5, 3), isTrue);
    });

    test('kalan puan bitince + kapanıyor', () {
      expect(canIncreaseSkill(1), isTrue);
      expect(canIncreaseSkill(0), isFalse);
    });

    test('kalan puan taslaktan hesaplanıyor', () {
      expect(pointsLeftIn({'fAtk': 2, 'fDef': 1}, 6), 3);
      expect(pointsLeftIn({'fAtk': 6}, 6), 0);
    });

    /// ⚠️ Değişiklik yoksa Kaydet kapalı: boş bir yazma isteği göndermenin anlamı yok ve açık
    /// düğme oyuncuya «bir şey değiştirdim» hissi verirdi.
    test('⭐ değişiklik yoksa kaydet kapalı', () {
      expect(canSaveSkills({'fAtk': 1, 'fDef': 1}, 2), isFalse);
      expect(canSaveSkills({'fAtk': 2, 'fDef': 1}, 2), isTrue);
    });
  });

  group('ad uzunluğu', () {
    test('sınırlar dâhil geçerli', () {
      expect(isNameLengthOk('abc', min: 3, max: 15), isTrue);
      expect(isNameLengthOk('123456789012345', min: 3, max: 15), isTrue);
    });

    test('kısa ve uzun reddediliyor', () {
      expect(isNameLengthOk('ab', min: 3, max: 15), isFalse);
      expect(isNameLengthOk('1234567890123456', min: 3, max: 15), isFalse);
    });

    /// ⚠️ Boşluklar kırpılıyor: `'  ab  '` sunucuda 2 karakter sayılır, istemci de öyle
    /// saymalı yoksa düğme açılır ve sunucu reddeder.
    test('⭐ baştaki/sondaki boşluk sayılmıyor', () {
      expect(isNameLengthOk('  ab  ', min: 3, max: 15), isFalse);
      expect(isNameLengthOk('  abc  ', min: 3, max: 15), isTrue);
    });
  });

  group('HeroRow', () {
    test('kalan puan ve düşmüşlük türetiliyor', () {
      expect(_h(pointsTotal: 6, pointsSpent: 2).pointsLeft, 4);
      expect(_h(state: 'dead').fallen, isTrue);
      expect(_h(state: 'returning').fallen, isTrue);
      expect(_h(state: 'in_city').fallen, isFalse);
      expect(_h(state: 'reviving').fallen, isFalse);
    });

    /// ⚠️ `reviveCost` yalnız `dead` durumunda dolu; sıfırla doldurmak «bedava diriltme»
    /// gibi görünürdü ve ekran Dirilt düğmesini açardı.
    test('⭐ diriltme maliyeti yoksa null kalıyor, sıfıra düşmüyor', () {
      expect(_h().reviveCost, isNull);
      final d = _h(state: 'dead', reviveCost: {'gold': 500, 'food': 200});
      expect(d.reviveCost?.gold, 500);
      expect(d.reviveCost?.food, 200);
    });

    test('yetenek anahtarla okunabiliyor', () {
      final h = _h();
      expect(h.skill('fAtk'), 1);
      expect(h.skill('mAtk'), 0);
      // Bilinmeyen anahtar 0 — ekran çökmemeli.
      expect(h.skill('luck'), 0);
    });
  });
}
