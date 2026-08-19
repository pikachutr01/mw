/// POSTA KUTUSU KURALLARI — **kararları** ölçer.
///
/// ⚠️ Buradaki kusurların çoğu **sessiz**: yanlış bir ikon adı hiçbir yerde hata üretmez
/// (`MwIcon` boş kutu çizer), aralık dışına düşen bir sayfa numarası boş bir liste gösterir,
/// eksik bir sızıntı etiketi savunana yanlış cevap verir. Üçü de ekranda "çalışıyor" gibi
/// görünür — bu yüzden hepsi burada kilitleniyor.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/messages/message.dart';
import 'package:mobilwar/features/messages/message_rules.dart';
import 'package:mobilwar/gen/contracts.g.dart';

MessageRow _msg(int id, String at) => MessageRow.fromJson({
  'id': id,
  'kind': 'system',
  'subject': 'duyuru',
  'at': at,
  'readAt': null,
});

ChatConversation _chat(int id, String? at, {int unread = 0}) =>
    ChatConversation.fromJson({
      'channelId': id,
      'playerId': 100 + id,
      'username': 'oyuncu$id',
      'lastMessage': 'selam',
      'lastFromMe': false,
      'lastMessageAt': at,
      'unreadCount': unread,
      'blocked': false,
    });

void main() {
  group('tür kataloğu', () {
    /// ⭐⭐ ORİJİNALİN KENDİ BAŞLIĞI (2026-08-11). Bir süre «Saldırı Önleme Raporu» yazıyordu
    /// ve bu makul bir çıkarımdı — casusluğun savunan tarafı gerçekten «Casusluk Önleme
    /// Raporu». Ama orijinal istemci saldırı için başka bir kelime kullanıyor
    /// (`o.java:281-283` → `k.a[159]` «Şehir Savunma» + `k.a[12]` «` Raporu`») ve dize
    /// tablosunda «Saldırı Önleme» diye bir kayıt HİÇ YOK.
    test('⭐ savunan tarafın başlığı «Şehir Savunma Raporu»', () {
      expect(
        reportType('battle_report', 'defender', 'konu').title,
        'Şehir Savunma Raporu',
      );
      expect(
        reportType('battle_report', 'attacker', 'konu').title,
        'Saldırı Raporu',
      );
    });

    /// ⚠️ Aynı `kind`in iki tarafı AYRI satır: anahtar `kind:side`. Yalnız `kind`e baksaydık
    /// savunan da «Saldırı Raporu» görürdü.
    test('⭐ aynı tür, farklı taraf → farklı ikon', () {
      expect(reportType('spy_report', 'spy', '').icon, 'spy_out');
      expect(reportType('spy_report', 'target', '').icon, 'spy_back');
    });

    /// ⚠️⚠️ Sunucuya yeni bir tür eklendiğinde satır BOŞ KALMAMALI. Ham `kind` yazmak da
    /// olmaz (ekranda İngilizce görünürdü) — sunucunun yazdığı konuya düşülüyor.
    test('⭐ bilinmeyen tür sunucunun konusuna düşüyor', () {
      final t = reportType('cave_report', 'owner', 'Mağaran yıkıldı');
      expect(t.title, 'Mağaran yıkıldı');
      expect(t.icon, isNull);
    });

    test('sistem satırı «Sistem» başlığını alıyor', () {
      expect(reportType('system', null, 'her neyse').title, 'Sistem');
    });

    /// ⭐ Taraf `null` gelebiliyor (sistem satırları) — anahtar boş dizeyle kuruluyor ve
    /// eşleşme bulunamıyor. Çökmemeli.
    test('taraf null iken çökmüyor', () {
      expect(reportType('battle_report', null, 'konu').title, 'konu');
    });

    /// ⚠️⚠️ **SESSİZ KUSUR KİLİDİ.** `MwIcon` bulunamayan dosyada hata vermiyor, aynı ölçüde
    /// boşluk bırakıyor (bilinçli: yeni bir birim ekranı kırmızıya çevirmesin). Yani bir harf
    /// hatası ekranda yalnız "ikon çizilmemiş" olarak görünür. Katalogtaki her ad
    /// `assets/missions/` altında gerçekten var olan bir dosya olmalı.
    test('⭐ tüm ikon adları assets/missions/ altında var', () {
      const varOlan = {
        'attack',
        'attack_in',
        'found_city',
        'spy_back',
        'spy_out',
        'support_in',
        'support_out',
        'teleport',
        'transport_back',
        'transport_out',
      };
      for (final e in kReportType.entries) {
        final icon = e.value.icon;
        if (icon == null) continue;
        expect(
          varOlan,
          contains(icon),
          reason: '${e.key} → assets/missions/$icon.png yok',
        );
      }
    });

    /// ⭐ SEKME AYRIMI KATALOGDA GÖRÜNÜR: rapor satırları görev ikonu taşıyor, mesaj
    /// satırları taşımıyor. ⚠️ İttifak davetine bir görev ikonu koymak, onu gerçekte olmayan
    /// bir seferle ilişkilendirmek olurdu.
    test('⭐ ikon taşıyan her satır rapor, taşımayan hiçbiri değil', () {
      for (final e in kReportType.entries) {
        final kind = e.key.split(':').first;
        expect(
          e.value.icon != null,
          isReport(kind),
          reason: '${e.key} — ikon varlığı ile rapor olması ayrışmış',
        );
      }
    });

    /// ⚠️ Sunucudaki süzgeç bir DESEN (`kind LIKE '%\_report'`), liste değil. İstemcideki
    /// karşılığı da desen olmalı; liste yazsaydık yeni bir rapor türü sessizce Mesajlar
    /// sekmesine düşerdi.
    test('isReport sunucunun deseniyle aynı', () {
      expect(isReport('battle_report'), isTrue);
      expect(isReport('cave_report'), isTrue, reason: 'henüz olmayan tür');
      expect(isReport('alliance_invite'), isFalse);
      expect(isReport('system'), isFalse);
      // ⚠️ Ortada geçen «report» yakalanmamalı; desen SONA bakıyor.
      expect(isReport('report_of_something'), isFalse);
    });
  });

  group('sayfalama', () {
    test('boş kutuda tek sayfa — «0 / 0» yazılmıyor', () {
      expect(pageCount(0, 20), 1);
    });

    test('tam bölünen ve artan toplam', () {
      expect(pageCount(40, 20), 2);
      expect(pageCount(41, 20), 3);
      expect(pageCount(1, 20), 1);
    });

    /// ⚠️ Sıfıra bölmeye karşı: sayfa boyu bir sabit ama bu fonksiyon onu bilmiyor.
    test('sayfa boyu 0 iken bölme YOK', () {
      expect(pageCount(50, 0), 1);
    });

    /// ⭐⭐ WEB'DE GERÇEK BİR KUSURDU. Toplam KÜÇÜLEBİLİYOR (arka planda gelen tazeleme,
    /// başka cihazdan silinen kayıtlar) ve son sayfada duran oyuncu boş listeye bakıyordu:
    /// sayfalayıcı kelepçelenmiş bir sayı gösterirken sorgu hâlâ ham `page`i istiyordu.
    test('⭐ aralık dışına düşen sayfa son sayfaya kelepçeleniyor', () {
      expect(clampPage(7, 3), 2);
      expect(clampPage(0, 1), 0);
    });

    test('negatif sayfa 0 oluyor', () {
      expect(clampPage(-3, 5), 0);
    });

    test('aralıktaki sayfaya dokunulmuyor', () {
      expect(clampPage(2, 5), 2);
    });
  });

  group('sekme rozeti', () {
    test('sekmesine göre okunmamış sayısı', () {
      const c = (unreadReports: 3, unreadMessages: 7);
      expect(tabUnread(c, 'reports'), 3);
      expect(tabUnread(c, 'messages'), 7);
    });

    /// ⭐ Sohbet okunmamışı **Mesajlar** sekmesine ekleniyor (2026-08-18). ⚠️ Raporlara
    /// EKLENMİYOR: DM bir rapor değil ve oraya eklemek, savaş raporu arayan oyuncuyu sohbete
    /// yönlendirirdi.
    test('⭐ sohbet okunmamışı YALNIZ Mesajlar sekmesine ekleniyor', () {
      const c = (unreadReports: 3, unreadMessages: 7);
      expect(tabUnread(c, 'messages', chatUnread: 4), 11);
      expect(tabUnread(c, 'reports', chatUnread: 4), 3);
    });
  });

  group('posta kutusu birleşimi', () {
    /// ⚠️ Sunucuda birleştirme YOK: DM satırı `messages` tablosuna yazılmıyor. İki kaynak
    /// istemcide, TARİHE göre birleşiyor — en yeni üstte.
    test('⭐ iki kaynak tarihe göre iç içe diziliyor', () {
      final rows = mergeInbox(
        messages: [
          _msg(1, '2026-08-18T10:00:00.000Z'),
          _msg(2, '2026-08-18T08:00:00.000Z'),
        ],
        chats: [_chat(9, '2026-08-18T09:00:00.000Z')],
        tab: 'messages',
        page: 0,
      );
      expect(rows.map((r) => r.key).toList(), ['m1', 'c9', 'm2']);
    });

    /// ⚠️⚠️ Sohbetler **yalnız Mesajlar sekmesinde**: Raporlar sekmesi savaş kayıtları için
    /// ve oraya DM karıştırmak, sunucunun `kind` süzgecini istemcide delmek olurdu.
    test('⭐⭐ Raporlar sekmesinde sohbet YOK', () {
      final rows = mergeInbox(
        messages: [_msg(1, '2026-08-18T10:00:00.000Z')],
        chats: [_chat(9, '2026-08-18T11:00:00.000Z')],
        tab: 'reports',
        page: 0,
      );
      expect(rows.map((r) => r.key).toList(), ['m1']);
    });

    /// ⚠️⚠️ Sohbetler sayfalanmıyor. İlk sayfadan sonrasına da eklenseydi, aynı sohbetler
    /// HER sayfada tekrar görünürdü.
    test('⭐⭐ sohbetler yalnız İLK sayfada', () {
      final rows = mergeInbox(
        messages: [_msg(1, '2026-08-18T10:00:00.000Z')],
        chats: [_chat(9, '2026-08-18T11:00:00.000Z')],
        tab: 'messages',
        page: 1,
      );
      expect(rows.map((r) => r.key).toList(), ['m1']);
    });

    /// ⚠️ Hiç mesaj yazılmamış sohbet **gizlenmiyor**, en sona düşüyor: oyuncu az önce
    /// açtığı boş sohbeti listede görebilmeli.
    test('⭐ damgasız sohbet sona düşüyor, elenmıyor', () {
      final rows = mergeInbox(
        messages: [_msg(1, '2026-08-18T10:00:00.000Z')],
        chats: [_chat(9, null)],
        tab: 'messages',
        page: 0,
      );
      expect(rows.map((r) => r.key).toList(), ['m1', 'c9']);
    });

    /// ⚠️⚠️ Anahtar ÖN EKLİ: iki kaynağın kimlikleri aynı sayı olabiliyor. Ön ek olmasaydı
    /// 7 numaralı mesajı seçmek 7 numaralı sohbeti de seçili gösterirdi.
    test('⭐⭐ aynı kimlikli mesaj ve sohbet ayrı anahtar taşıyor', () {
      final rows = mergeInbox(
        messages: [_msg(7, '2026-08-18T10:00:00.000Z')],
        chats: [_chat(7, '2026-08-18T09:00:00.000Z')],
        tab: 'messages',
        page: 0,
      );
      expect(rows.map((r) => r.key).toSet(), {'m7', 'c7'});
    });

    /// ⚠️ Eşit damgada sıralama KARARLI olmalı: kararsız kalırsa liste her tazelemede yer
    /// değiştirir ve oyuncunun dokunmak üzere olduğu satır parmağının altından kayar.
    test('⭐ eşit damgada sıra kararlı (anahtara göre)', () {
      const t = '2026-08-18T10:00:00.000Z';
      final a = mergeInbox(
        messages: [_msg(2, t), _msg(1, t)],
        chats: const [],
        tab: 'messages',
        page: 0,
      );
      final b = mergeInbox(
        messages: [_msg(1, t), _msg(2, t)],
        chats: const [],
        tab: 'messages',
        page: 0,
      );
      expect(a.map((r) => r.key).toList(), b.map((r) => r.key).toList());
    });

    test('okunmamışlık iki kaynakta da doğru okunuyor', () {
      final rows = mergeInbox(
        messages: [_msg(1, '2026-08-18T10:00:00.000Z')],
        chats: [_chat(9, '2026-08-18T09:00:00.000Z', unread: 3)],
        tab: 'messages',
        page: 0,
      );
      expect(rows.every((r) => r.unread), isTrue);
    });
  });

  group('savaş sonucu başlığı', () {
    /// ⚠️⚠️ `won` TEK BAŞINA okunsaydı berabere biten savaş «Kaybettiniz !» yazardı — sunucu
    /// beraberede iki tarafa da `won: false` gönderiyor.
    test('⭐ berabere kaybetmek DEĞİL', () {
      expect(battleHeadline(winner: 'draw', won: false), 'Berabere');
      expect(battleHeadline(winner: 'draw', won: true), 'Berabere');
    });

    test('kazanan ve kaybeden orijinalin kalıbıyla', () {
      expect(battleHeadline(winner: 'attacker', won: true), 'Kazandınız !');
      expect(battleHeadline(winner: 'attacker', won: false), 'Kaybettiniz !');
    });
  });

  group('mağara durumu', () {
    /// ⚠️⚠️ **ÜÇ HÂL, İKİ DEĞİL.** Bu port düzeltme ÖNCESİ web kodundan yazılmıştı: `broken`
    /// olmayan her şeye «dayandı» diyordu. Mağara ZATEN YIKIKSA saldırı onu yıkmamış olur ama
    /// «dayandı» demek yanlış — notta «zaten onarımdaydı» yazarken kutu başarı rengiyle
    /// dayandığını söylüyordu. Sunucu turu bunu web'de düzeltti (2026-08-19'da birleştirildi),
    /// mobil onu bu testle yakaladı.
    test('⭐⭐ «zaten yıkıktı» hâli «dayandı»dan AYRI', () {
      expect(
        caveState(broken: false, reason: 'already_repairing'),
        MwCaveState.alreadyBroken,
      );
      expect(
        caveState(broken: false, reason: 'not_enough_dwarves'),
        MwCaveState.held,
      );
      expect(caveState(broken: false, reason: null), MwCaveState.held);
    });

    /// ⚠️ `broken` her şeyi eziyor: mağara gerçekten yıkıldıysa sebebin bir önemi yok.
    test('⭐ yıkılmışsa sebep okunmuyor', () {
      expect(
        caveState(broken: true, reason: 'already_repairing'),
        MwCaveState.broken,
      );
    });

    test('etiketler', () {
      expect(caveStateLabel(MwCaveState.broken), 'YIKILDI');
      expect(caveStateLabel(MwCaveState.alreadyBroken), 'zaten yıkıktı');
      expect(caveStateLabel(MwCaveState.held), 'dayandı');
    });
  });

  group('mağara ipucu', () {
    /// ⚠️⚠️ **SIZINTI SINIRI.** «Gereken N cüce» savunana gösterilseydi, oyuncu kendi
    /// mağarasının kırılma eşiğini rakibin gözünden okurdu.
    test('⭐ yalnız SALDIRANA gösteriliyor', () {
      expect(
        showCaveRequirement(
          side: 'attacker',
          broken: false,
          reason: 'not_enough_dwarves',
        ),
        isTrue,
      );
      expect(
        showCaveRequirement(
          side: 'defender',
          broken: false,
          reason: 'not_enough_dwarves',
        ),
        isFalse,
      );
    });

    /// ⚠️ Kırılmış mağarada sayının anlamı kalmıyor: yeter sayıya zaten ulaşılmış.
    test('⭐ kırılmış mağarada gösterilmiyor', () {
      expect(
        showCaveRequirement(
          side: 'attacker',
          broken: true,
          reason: 'not_enough_dwarves',
        ),
        isFalse,
      );
    });

    /// ⚠️ Başka bir gerekçeyle dayandıysa (mağara yok, cüce hiç gitmedi) sayı yanıltıcı olur.
    test('gerekçe başkaysa gösterilmiyor', () {
      expect(
        showCaveRequirement(side: 'attacker', broken: false, reason: null),
        isFalse,
      );
      expect(
        showCaveRequirement(side: 'attacker', broken: false, reason: 'no_cave'),
        isFalse,
      );
    });
  });

  group('sur bütünlüğü', () {
    /// ⚠️ Sunucu 0..1 oranı gönderiyor, ekran yüzde yazıyor. Ham oranı yazsaydık ekranda
    /// «bütünlük %0» görünürdü (0.87 → 0).
    test('oran yüzdeye çevriliyor', () {
      expect(wallPercent(0.87), 87);
      expect(wallPercent(1), 100);
      expect(wallPercent(0), 0);
    });

    test('yarımlar yuvarlanıyor', () {
      expect(wallPercent(0.005), 1);
      expect(wallPercent(0.004), 0);
    });
  });

  group('casusluk sızıntı etiketleri', () {
    /// ⚠️⚠️ Etiketler `gatherIntel`in kademeleriyle **AYNI ŞEYİ** anlatmak zorunda. Kapsam
    /// büyüyüp etiket olduğu yerde kalırsa savunan "ne sızdı" sorusuna yanlış cevap alır —
    /// ve bu yalnız savunanın zararına, yani kimse fark etmez.
    ///
    /// Kaynak: `apps/api/src/missions/mission.handlers.ts` · `order` dizisi.
    test('⭐ kademeler sunucunun listesiyle BİREBİR ve AYNI SIRADA', () {
      expect(kLeakLabel.keys.toList(), [
        'resources',
        'economy',
        'armyTotals',
        'armyTypes',
        'armyCounts',
        'full',
      ]);
    });

    /// ⚠️ Sıra anlamlı: etiketler kümülatif yazılmış («+ toplam savaşçı…»). İlk kademe
    /// artıyla başlasaydı cümle bozulurdu.
    test('⭐ ilk iki kademe artıyla BAŞLAMIYOR, üstü başlıyor', () {
      expect(kLeakLabel['resources']!.startsWith('+'), isFalse);
      expect(kLeakLabel['economy']!.startsWith('+'), isFalse);
      expect(kLeakLabel['armyTotals']!.startsWith('+'), isTrue);
      expect(kLeakLabel['armyCounts']!.startsWith('+'), isTrue);
    });

    test('bilinmeyen kademe ham adıyla dönüyor', () {
      expect(leakLabel('quantum'), 'quantum');
    });
  });

  group('şehir kurma gerekçesi', () {
    test('bilinen kodlar Türkçe cümleye çevriliyor', () {
      expect(foundCityReason('slot_taken'), contains('başka bir oyuncu'));
      expect(foundCityReason('city_limit'), contains('Şehir hakkın'));
    });

    /// ⚠️ Bilinmeyen kod için UYDURMA cümle yazılmıyor: raporun geri kalanı zaten ne olduğunu
    /// anlatıyor, yanlış bir gerekçe ise oyuncuyu başka bir yöne sürüklerdi.
    test('⭐ bilinmeyen kod null — uydurulmuyor', () {
      expect(foundCityReason('kraken_attack'), isNull);
      expect(foundCityReason(null), isNull);
      expect(foundCityReason(42), isNull);
    });
  });
}
