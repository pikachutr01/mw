/// KOMUTA MERKEZİ KURALLARI — **kararları** ölçer.
///
/// ⚠️ Üçü de ekranda **sessizce yanlış** olabilecek türden: seviye taşıyan bir kalemi adet
/// gibi yazmak («Sur 5» → beş adet sur), sırası olmayan oyuncuya «0.» demek, sunucunun kabul
/// etmeyeceği bir aramayı göndermek. Hiçbiri hata üretmez, hepsi yalan söyler.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/command/command_rules.dart';

String _fmt(int n) => '$n';

void main() {
  group('sıra değişimi', () {
    /// ⚠️⚠️ `null` (önceki anlık görüntü yok) ile `0` (değişmedi) **ayrı**. Birleştirmek yeni
    /// oyuncuya "sıran değişmedi" demek olurdu — oysa daha hiç ölçülmemiş.
    test('⭐ veri yokken «-», değişmemişken «0»', () {
      expect(changeMark(null), '-');
      expect(changeMark(0), '0');
    });

    test('yön oklarla yazılıyor', () {
      expect(changeMark(3), '▲3');
      expect(changeMark(-2), '▼2');
    });

    /// ⚠️ Ton da aynı ayrımı korumak zorunda: `null` ve `0` ikisi de NÖTR, ama farklı metin.
    test('⭐ ton — yukarı yeşil, aşağı kırmızı, ikisi de değilse nötr', () {
      expect(changeTone(5), MwChangeTone.up);
      expect(changeTone(-5), MwChangeTone.down);
      expect(changeTone(0), MwChangeTone.neutral);
      expect(changeTone(null), MwChangeTone.neutral);
    });
  });

  group('sıra metni', () {
    test('sıra ve toplam yan yana', () {
      expect(rankText(12, 812), '12 / 812');
    });

    /// ⚠️⚠️ Sırası olmayan oyuncuda `0` YAZILAMAZ: sıfırıncı sıra diye bir şey yok ve «0»
    /// "en kötü sıradasın" gibi okunur. Oysa oyuncu henüz hiç sıralanmamış.
    test('⭐ sırası yoksa «—» — sıfır DEĞİL', () {
      expect(rankText(null, 812), '—');
    });
  });

  group('anlık görüntü notu', () {
    /// ⚠️⚠️ Bu not olmadan oyuncu puanını artırıp sırasının değişmemesini **hata sanıyor**
    /// (§13.17.2, canlıda bildirildi).
    test('⭐ alınmış anlık görüntüde «güncelleme» yazıyor', () {
      final t = DateTime(2026, 8, 18, 8).toUtc().toIso8601String();
      expect(snapshotNote(takenAt: t, nextAt: ''), startsWith('güncelleme '));
    });

    /// ⚠️ Hiç anlık görüntü alınmamış dünyada başka bir cümle: «güncelleme —» yazmak,
    /// alınmış ama okunamamış gibi görünürdü.
    test('⭐ hiç alınmamışsa «ilk güncelleme»', () {
      final t = DateTime(2026, 8, 18, 16).toUtc().toIso8601String();
      expect(
        snapshotNote(takenAt: null, nextAt: t),
        startsWith('ilk güncelleme '),
      );
      expect(
        snapshotNote(takenAt: '', nextAt: t),
        startsWith('ilk güncelleme '),
        reason: 'boş dize de "yok" demek',
      );
    });

    /// ⚠️ Bozuk damga ekranı kırmamalı; saat yerine «—» yazılıyor.
    test('bozuk damga çökmüyor', () {
      expect(snapshotNote(takenAt: 'abc', nextAt: ''), 'güncelleme —');
    });

    /// ⚠️ «sıradaki güncelleme» BİLEREK yok (kullanıcı, 2026-08-03): oyuncunun bilmesi gereken
    /// tek şey verinin ne kadar taze olduğu, ileriye dönük bir takvim değil.
    test('⭐ «sıradaki» yazılmıyor', () {
      final t = DateTime(2026, 8, 18, 8).toUtc().toIso8601String();
      final n = snapshotNote(takenAt: t, nextAt: t);
      expect(n.contains('sıradaki'), isFalse);
    });
  });

  group('tablo hücresi', () {
    /// ⚠️⚠️ Sur ve Büyü Kalkanı `defenses` tablosunda **SEVİYE** tutuyor (§13.11.1b). Çıplak
    /// sayı yazsaydık «Sur 5» beş adet sur gibi okunurdu.
    test('⭐⭐ seviye taşıyan kalem «sv. N» yazıyor', () {
      expect(cellAmount('wall', 5, _fmt), 'sv. 5');
      expect(cellAmount('magic_shield', 3, _fmt), 'sv. 3');
      expect(cellAmount('temple', 2, _fmt), 'sv. 2');
    });

    test('adetli birim düz sayı', () {
      expect(cellAmount('dwarf', 407, _fmt), '407');
    });

    /// ⚠️⚠️ Üç şehirde 5'er seviye sur «15 sur» demek DEĞİL — toplanamazlar.
    test('⭐⭐ seviye taşıyan kalem toplam sütununda «-»', () {
      expect(totalAmount('wall', 15, _fmt), '-');
      expect(totalAmount('dwarf', 1200, _fmt), '1200');
    });

    /// ⚠️ Küme `facts.g.dart`ten üretiliyor (`kLevelBased`); elle yazılan bir liste katalog
    /// değişince sessizce yanlış kalırdı. Bu test o listenin gerçekten bağlı olduğunu ölçüyor.
    test('⭐ üretilmiş küme okunuyor — bilinmeyen id adet sayılıyor', () {
      expect(cellAmount('kraken', 9, _fmt), '9');
    });
  });

  group('tablo satırları', () {
    /// ⚠️ Süzgeç TOPLAMA bakıyor, tek tek şehirlere değil: bir şehirde 0 olan birim başka bir
    /// şehirde varsa satır kalmalı, yoksa oyuncu o birimi hiç göremezdi.
    test('⭐ hiç sahip olunmayan tür eleniyor, sahip olunan kalıyor', () {
      const types = [
        (id: 'dwarf', name: 'Cüce'),
        (id: 'elf', name: 'Elf'),
        (id: 'ogre', name: 'Ogre'),
      ];
      final kalan = ownedTypes(types, const {'dwarf': 120, 'ogre': 0});
      expect(kalan.map((t) => t.id).toList(), ['dwarf']);
    });

    /// ⚠️ Sıra KORUNUYOR: katalog sırası Baraka ve Savunma ekranlarıyla aynı olmalı.
    test('⭐ sıra korunuyor', () {
      const types = [
        (id: 'a', name: 'A'),
        (id: 'b', name: 'B'),
        (id: 'c', name: 'C'),
      ];
      final kalan = ownedTypes(types, const {'c': 1, 'a': 1, 'b': 1});
      expect(kalan.map((t) => t.id).toList(), ['a', 'b', 'c']);
    });
  });

  group('sıralama sayfası', () {
    /// ⚠️⚠️ Sayfa **1 tabanlı** — posta kutusu 0 tabanlı ve ikisi ayrı sözleşme. Karıştırmak
    /// sessizce bir sayfa kaydırırdı.
    test('⭐⭐ alt sınır 1, sıfır DEĞİL', () {
      expect(clampRankingPage(0, 5), 1);
      expect(clampRankingPage(-3, 5), 1);
    });

    test('üst sınır son sayfa', () {
      expect(clampRankingPage(9, 5), 5);
      expect(clampRankingPage(3, 5), 3);
    });

    /// ⚠️ Boş sıralamada `pages: 0` gelebiliyor; «Sayfa: 1 / 0» yazmamak için taban 1.
    test('⭐ sayfa sayısı 0 iken 1 dönüyor', () {
      expect(clampRankingPage(1, 0), 1);
    });
  });

  group('arama', () {
    /// ⚠️ Sunucu 2 karakterden kısa sorguda boş liste dönüyor (önek indeksi). İstemci bunu
    /// bilmeden istek atsaydı oyuncu "sonuç yok" görür ve aramanın bozuk olduğunu sanardı.
    test('⭐ iki karakterden kısa sorgu gönderilmiyor', () {
      expect(canSearch('a'), isFalse);
      expect(canSearch('ab'), isTrue);
    });

    /// ⚠️ **Kırpılmış** uzunluk: iki boşluk yazmak aramayı başlatmamalı.
    test('⭐ boşluklar sayılmıyor', () {
      expect(canSearch('   '), isFalse);
      expect(canSearch(' a '), isFalse);
      expect(canSearch(' ab '), isTrue);
    });
  });

  group('askerî unvan', () {
    /// ⚠️ Tablo `facts.g.dart`ten üretiliyor; `id` aynı zamanda rozet dosyasının adı ve elle
    /// yazılan bir liste rozetin **sessizce** çizilmemesine yol açardı.
    test('⭐ dört basamağın hepsi karşılıklı', () {
      expect(meritOf(1)?.name, 'Subay');
      expect(meritOf(2)?.name, 'Komutan');
      expect(meritOf(3)?.name, 'Başkomutan');
      expect(meritOf(4)?.name, 'Mareşal');
    });

    /// ⚠️ Rozet dosyaları `assets/ranks/` altında; ad eşleşmezse ekran boş kutu çizer ve
    /// hiçbir yerde iz bırakmaz.
    test('⭐ rozet dosya adları assets/ranks/ altında var', () {
      const varOlan = {'subay', 'komutan', 'baskomutan', 'maresal'};
      for (var t = 1; t <= 4; t++) {
        expect(
          varOlan,
          contains(meritOf(t)!.id),
          reason: '$t → assets/ranks/${meritOf(t)!.id}.png yok',
        );
      }
    });

    /// ⚠️ Unvansız oyuncuda satır HİÇ çizilmiyor — `null` bunun taşıyıcısı.
    test('⭐ unvansızda null, bilinmeyen basamakta da null', () {
      expect(meritOf(null), isNull);
      expect(meritOf(9), isNull);
    });
  });
}
