/// ODA SOHBETİ KURALLARI — **kararları** ölçer.
///
/// ⚠️⚠️ Bu dosyanın en önemli garantisi: **bahsetme dilimleyici gövdeyi ASLA bozmaz.** Bozuk
/// bir aralık (sunucu hatası, göç, kırpılmış gövde) bir bahsetmenin vurgulanamamasına yol
/// açabilir — ama bir harfin bile kaybolmasına ASLA. Testlerin yarısı bunu ölçüyor.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/chat/room_message.dart';
import 'package:mobilwar/features/chat/room_rules.dart';

/// Dilimlerin birleşimi daima gövdenin AYNISI olmalı.
String _joined(List<MentionPart> parts) => parts.map((p) => p.text).join();

RoomMessage _m({int? senderId = 5, String? senderName = 'Baturalp'}) =>
    RoomMessage.fromJson({
      'id': 1,
      'senderId': senderId,
      'senderName': senderName,
      'body': 'selam',
      'createdAt': '2026-08-19T10:00:00.000Z',
    });

void main() {
  group('bahsetme dilimleyici', () {
    test('bahsetme yoksa tek parça', () {
      final p = splitMentions('merhaba dünya', const []);
      expect(p.length, 1);
      expect(p.single.mentionId, isNull);
      expect(_joined(p), 'merhaba dünya');
    });

    test('⭐ aralık doğru diliniyor', () {
      // "@Ali" 0..4
      final p = splitMentions('@Ali gel', [(id: 7, at: 0, len: 4)]);
      expect(p.map((x) => x.text).toList(), ['@Ali', ' gel']);
      expect(p.first.mentionId, 7);
      expect(p.last.mentionId, isNull);
    });

    /// ⭐ Kullanıcı adında BOŞLUK serbest — tam da bu yüzden istemci parse etmiyor. Sunucu
    /// aralığı verdiği için boşluklu ad da doğru diliniyor.
    test('⭐⭐ boşluklu kullanıcı adı doğru diliniyor', () {
      const body = 'selam @Kara Murat nasılsın';
      final p = splitMentions(body, [(id: 3, at: 6, len: 11)]);
      expect(p.map((x) => x.text).toList(), [
        'selam ',
        '@Kara Murat',
        ' nasılsın',
      ]);
      expect(_joined(p), body);
    });

    test('birden çok bahsetme sırayla', () {
      const body = '@Ali ve @Ece';
      final p = splitMentions(body, [
        (id: 2, at: 8, len: 4),
        (id: 1, at: 0, len: 4),
      ]);
      expect(p.where((x) => x.mentionId != null).length, 2);
      expect(_joined(p), body);
    });

    /* ── ⚠️⚠️ BOZUK ARALIKLAR — hepsinde gövde EKSİKSİZ kalmalı ───────────────── */

    test('⭐⭐ gövdeyi AŞAN aralık atılıyor, metin bozulmuyor', () {
      const body = 'kısa metin';
      final p = splitMentions(body, [(id: 1, at: 5, len: 999)]);
      expect(_joined(p), body);
      expect(p.every((x) => x.mentionId == null), isTrue);
    });

    test('⭐⭐ negatif başlangıç atılıyor', () {
      const body = 'merhaba';
      final p = splitMentions(body, [(id: 1, at: -3, len: 4)]);
      expect(_joined(p), body);
    });

    test('⭐⭐ sıfır uzunluk atılıyor', () {
      const body = 'merhaba';
      final p = splitMentions(body, [(id: 1, at: 2, len: 0)]);
      expect(_joined(p), body);
    });

    /// ⚠️⚠️ Çakışan aralıklar atılmasaydı metin ÇOĞALIRDI — aynı harfler iki kez basılırdı.
    test('⭐⭐ çakışan aralık atılıyor, metin ÇOĞALMIYOR', () {
      const body = '@AliVeli gel';
      final p = splitMentions(body, [
        (id: 1, at: 0, len: 8),
        (id: 2, at: 4, len: 4), // birincinin içinde
      ]);
      expect(_joined(p), body);
      expect(p.where((x) => x.mentionId != null).length, 1);
    });

    /// ⚠️ Bitişik iki aralık (birinin sonu diğerinin başı) GEÇERLİ — çakışma değil.
    test('⭐ bitişik aralıklar ikisi de kalıyor', () {
      const body = '@Ali@Ece';
      final p = splitMentions(body, [
        (id: 1, at: 0, len: 4),
        (id: 2, at: 4, len: 4),
      ]);
      expect(p.where((x) => x.mentionId != null).length, 2);
      expect(_joined(p), body);
    });

    test('gövdenin tamamı bahsetme olabiliyor', () {
      const body = '@Ali';
      final p = splitMentions(body, [(id: 1, at: 0, len: 4)]);
      expect(p.length, 1);
      expect(p.single.mentionId, 1);
      expect(_joined(p), body);
    });

    test('boş gövde çökmüyor', () {
      expect(_joined(splitMentions('', [(id: 1, at: 0, len: 2)])), '');
    });
  });

  group('yazar adı', () {
    /// ⚠️⚠️ Ad `null` = oyuncu dünyadan KALDIRILMIŞ. Ham `id` ASLA yazılmamalı: oyuncuya
    /// hiçbir şey anlatmıyor ama bir kimliği ifşa ediyor (sunucu şeması bunu şart koşuyor).
    test('⭐⭐ kaldırılmış oyuncuda ham id YAZILMIYOR', () {
      final l = senderLabel(_m(senderId: 42, senderName: null));
      expect(l, 'kaldırılmış oyuncu');
      expect(l.contains('42'), isFalse);
    });

    test('boş ad da kaldırılmış sayılıyor', () {
      expect(senderLabel(_m(senderName: '')), 'kaldırılmış oyuncu');
    });

    /// ⚠️ Gönderen `null` = sistem duyurusu; kaldırılmış oyuncudan FARKLI bir şey.
    test('⭐ sistem duyurusu ayrı etiket', () {
      expect(senderLabel(_m(senderId: null, senderName: null)), 'Sistem');
    });

    test('normal oyuncu adıyla', () {
      expect(senderLabel(_m()), 'Baturalp');
    });
  });

  group('hata metinleri', () {
    /// ⚠️⚠️ Üç kodda sunucunun KENDİ metni kullanılıyor çünkü **SÜRE taşıyorlar**
    /// («14 dakika daha…»). İstemcide yeniden yazmak o bilgiyi kaybettirirdi.
    test('⭐⭐ süre taşıyan kodlarda sunucu metni kazanıyor', () {
      expect(
        roomErrorText('slow_mode', '14 saniye daha beklemelisin.'),
        '14 saniye daha beklemelisin.',
      );
      expect(
        roomErrorText('banned', '3 gün susturuldun.'),
        '3 gün susturuldun.',
      );
    });

    /// ⚠️ Sunucu metni BOŞSA yine de bir cümle çıkmalı — boş bir hata kutusu "bozuk" demek.
    test('⭐ sunucu metni boşsa genel cümleye düşüyor', () {
      expect(roomErrorText('slow_mode', null), 'Mesaj gönderilemedi.');
      expect(roomErrorText('slow_mode', ''), 'Mesaj gönderilemedi.');
    });

    /// ⚠️ Süre taşımayan kodlarda İSTEMCİNİN metni kazanıyor: sunucununki geliştirici
    /// diliyle yazılmış olabiliyor ve §13.14 ekranda İngilizce yasaklıyor.
    test('⭐ sabit kodlarda istemci metni kazanıyor', () {
      expect(
        roomErrorText('rate_limited', 'too many requests'),
        'Çok hızlı yazıyorsun, birkaç saniye bekle.',
      );
      expect(
        roomErrorText('global_disabled', 'disabled'),
        'Genel sohbet şu an kapalı.',
      );
    });

    test('bilinmeyen kod genel cümle', () {
      expect(roomErrorText('quantum', null), 'Mesaj gönderilemedi.');
      expect(roomErrorText(null, null), 'Mesaj gönderilemedi.');
    });
  });

  group('«yazıyor» şeridi', () {
    test('kimse yazmıyorsa boş — şerit yine çizilir, metni boştur', () {
      expect(typingText(const []), '');
    });

    test('bir ve iki kişi adıyla', () {
      expect(typingText(const ['Ali']), 'Ali yazıyor…');
      expect(typingText(const ['Ali', 'Ece']), 'Ali ve Ece yazıyor…');
    });

    /// ⚠️ Üçten fazlada ad SAYILMIYOR: on kişilik bir odada on ad şeride sığmaz.
    test('⭐ üç ve üstünde ad yazılmıyor', () {
      expect(typingText(const ['Ali', 'Ece', 'Veli']), 'birkaç kişi yazıyor…');
    });
  });

  group('mevcudiyet', () {
    test('sayı yazılıyor', () {
      expect(presenceText(3), '3 kişi bağlı');
    });

    /// ⚠️ Sayı bilinmiyorken «0 kişi bağlı» yazmak, kendisi bağlıyken YALAN olurdu.
    test('⭐ bilinmeyen ve sıfır sayıda boş dize', () {
      expect(presenceText(null), '');
      expect(presenceText(0), '');
    });
  });

  /* ══ BALONCUK KARARLARI (F4, 2026-08-22) ═══════════════════════════════════════════════ */

  /// ⚠️⚠️ Bu grubun varlık sebebi ÖLÇÜLMÜŞ bir hata: iki sohbet sheet'i de `roomIsMine`
  /// yerine ham `m.senderId == myId` yazıyordu ve `null == null` doğru döndüğü için sistem
  /// duyurusu, kimliğim yüklenmeden önce "benim mesajım" gibi çiziliyordu.
  group('roomIsMine', () {
    test('kendi mesajım', () {
      expect(roomIsMine(_m(senderId: 5), 5), isTrue);
    });

    test('başkasının mesajı', () {
      expect(roomIsMine(_m(senderId: 9), 5), isFalse);
    });

    /// ⭐⭐ ASIL VAKA: ikisi de null.
    test('⭐⭐ sistem duyurusu + yüklenmemiş kimlik BENİM DEĞİL', () {
      expect(roomIsMine(_m(senderId: null), null), isFalse);
    });

    test('⭐ sistem duyurusu hiçbir kimlikle benim değil', () {
      expect(roomIsMine(_m(senderId: null), 5), isFalse);
    });

    test('⭐ kimliğim yüklenmediyse hiçbir mesaj benim değil', () {
      expect(roomIsMine(_m(senderId: 5), null), isFalse);
    });
  });

  group('isSystemMessage', () {
    test('gönderensiz mesaj sistem duyurusu', () {
      expect(isSystemMessage(_m(senderId: null)), isTrue);
      expect(isSystemMessage(_m(senderId: 5)), isFalse);
    });
  });

  group('showSenderName', () {
    /// ⚠️ Kendi baloncuğumda ad HİÇ yazılmıyor: sağda ve dolu renkte olması zaten söylüyor.
    test('⭐ kendi mesajımda ad yazılmıyor', () {
      expect(showSenderName(_m(senderId: 5), null, 5), isFalse);
    });

    test('sistem duyurusunda ad yazılmıyor', () {
      expect(showSenderName(_m(senderId: null), null, 5), isFalse);
    });

    test('listenin en eski mesajında ad yazılıyor', () {
      expect(showSenderName(_m(senderId: 9), null, 5), isTrue);
    });

    /// ⚠️⚠️ GRUPLAMA: beş mesaj yazan birinin adını beş kez yazmak, ekranın yarısını aynı
    /// adla doldurmak demek.
    test('⭐⭐ ard arda aynı gönderende ad TEKRARLANMIYOR', () {
      expect(showSenderName(_m(senderId: 9), _m(senderId: 9), 5), isFalse);
    });

    test('⭐ gönderen değişince ad yeniden yazılıyor', () {
      expect(showSenderName(_m(senderId: 9), _m(senderId: 7), 5), isTrue);
    });

    /// ⚠️ Araya sistem duyurusu girerse grup KIRILIYOR: duyuru ortada, baloncuksuz ve
    /// tarafsız çiziliyor; ardından gelen mesajın adsız kalması onu duyuruya bağlarmış gibi
    /// gösterirdi.
    test('⭐ araya sistem duyurusu girince grup kırılıyor', () {
      expect(showSenderName(_m(senderId: 9), _m(senderId: null), 5), isTrue);
    });
  });

  group('mentionsMe', () {
    RoomMessage bahseden(List<int> ids) => RoomMessage.fromJson({
      'id': 1,
      'senderId': 9,
      'senderName': 'Kurt',
      'body': 'selam @Baturalp',
      'createdAt': '2026-08-19T10:00:00.000Z',
      'mentions': [
        for (final id in ids) {'id': id, 'at': 6, 'len': 9},
      ],
    });

    test('⭐ bahsedilen kişi bensem doğru', () {
      expect(mentionsMe(bahseden([5]), 5), isTrue);
      expect(mentionsMe(bahseden([7, 5]), 5), isTrue);
    });

    test('başkasından bahsedilmişse yanlış', () {
      expect(mentionsMe(bahseden([7]), 5), isFalse);
      expect(mentionsMe(_m(), 5), isFalse);
    });

    /// ⚠️ Kimliğim yüklenmediyse hiçbir şey "bana" değil: aksi hâlde her baloncuk kalın
    /// çerçeveyle yanardı.
    test('⭐ kimliğim yüklenmediyse yanlış', () {
      expect(mentionsMe(bahseden([5]), null), isFalse);
    });
  });
}
