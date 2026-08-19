/// SOHBET KURALLARI — **kararları** ölçer.
///
/// ⚠️⚠️ Buradaki en kritik test bir **gizlilik sınırı**: engellenen tarafa sebep söylenmiyor.
/// Kod doğru davransa bile bir sonraki düzenlemede «Bu oyuncu seni engelledi» yazmak son
/// derece doğal görünür — bu test tam olarak onu durdurmak için var.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/chat/chat_message.dart';
import 'package:mobilwar/features/chat/chat_rules.dart';

ChatMessage _m({int id = 1, int? senderId = 5}) => ChatMessage.fromJson({
  'id': id,
  'channelId': 9,
  'senderId': senderId,
  'body': 'selam',
  'createdAt': '2026-08-18T10:00:00.000Z',
});

void main() {
  group('hata metinleri', () {
    /// ⭐⭐ **SEBEP DOĞRULANMIYOR** (kullanıcı kararı): karşı taraf beni engellemişse ekranda
    /// yalnız «Mesajınız iletilemedi!» yazıyor. Sunucu da bu yüzden 4xx sınıfını ayırmıyor —
    /// istemcinin metni o kararı ekranda tamamlıyor.
    test('⭐⭐ engellenen tarafa «seni engelledi» DENMİYOR', () {
      final metin = chatErrorText('blocked');
      expect(metin, 'Mesajınız iletilemedi!');
      expect(metin.toLowerCase(), isNot(contains('engel')));
    });

    /// ⚠️ Bu tarafta sebep AÇIKÇA söyleniyor: engeli koyan benim ve nasıl kaldıracağımı
    /// bilmem gerekiyor. İki kodun ayrı metin taşıması bilinçli.
    test('⭐ engeli BEN koyduysam sebep açıkça yazılıyor', () {
      expect(chatErrorText('blocked_by_me'), contains('engelledin'));
      expect(chatErrorText('blocked_by_me'), contains('engeli kaldır'));
      expect(
        chatErrorText('blocked_by_me'),
        isNot(chatErrorText('blocked')),
        reason: 'iki taraf aynı cümleyi görürse gizlilik sınırı silinir',
      );
    });

    /// ⚠️⚠️ Bilinmeyen kodda **sunucunun ham metni gösterilmiyor**: sunucu mesajları
    /// geliştirici diliyle yazılmış olabiliyor ve §13.14 ekranda İngilizce yasaklıyor.
    test('⭐ bilinmeyen kod sabit Türkçe cümleye düşüyor', () {
      expect(chatErrorText('quantum_flux'), 'Mesaj gönderilemedi.');
      expect(chatErrorText(null), 'Mesaj gönderilemedi.');
    });

    /// ⚠️ Kaynak liste `packages/contracts/src/chat.ts` · `chatErrorCode`. DM akışında
    /// görülebilecek kodların hepsinin karşılığı olmalı; olmayan biri sessizce genel cümleye
    /// düşer ve oyuncu neden reddedildiğini öğrenemez.
    test('⭐ DM akışının tüm kodları karşılıklı', () {
      const dmKodlari = [
        'blocked',
        'blocked_by_me',
        'rate_limited',
        'duplicate_message',
        'slow_mode',
        'too_long',
        'dm_new_player_restricted',
        'self_message',
        'conversation_not_found',
        'banned',
        'wrong_world',
      ];
      for (final k in dmKodlari) {
        expect(
          kChatError.containsKey(k),
          isTrue,
          reason: '$k için Türkçe karşılık yok',
        );
      }
    });

    /// ⚠️ Oda sohbetlerinin kodları BİLEREK yok — o ekranlar mobilde henüz yok. Karşılıksız
    /// bir satır, hangi kodun gerçekten kullanıldığını bulanıklaştırırdı.
    test('oda sohbeti kodları henüz eklenmemiş', () {
      expect(kChatError.containsKey('not_alliance_member'), isFalse);
      expect(kChatError.containsKey('global_disabled'), isFalse);
    });
  });

  group('baloncuk yönü', () {
    test('kendi mesajım sağda', () {
      expect(isMine(_m(senderId: 5), 5), isTrue);
      expect(isMine(_m(senderId: 7), 5), isFalse);
    });

    /// ⚠️⚠️ `senderId == null` **sistem duyurusu** (beta/bakım). Düz bir `==`
    /// karşılaştırması, kimliğim de henüz yüklenmemişken (`null`) sistem mesajını BENİM
    /// mesajım gibi çizerdi — vurgulu zeminde, sağa yaslı.
    test('⭐⭐ sistem duyurusu benim mesajım DEĞİL', () {
      expect(isMine(_m(senderId: null), 5), isFalse);
      expect(
        isMine(_m(senderId: null), null),
        isFalse,
        reason: 'null == null tuzağı',
      );
    });

    test('kimliğim yüklenmediyse hiçbir mesaj benim sayılmıyor', () {
      expect(isMine(_m(senderId: 5), null), isFalse);
    });
  });

  group('eski sayfa imleci', () {
    /// ⚠️ Sunucu **en yeniyi önce** döndürüyor, yani bir sonraki `before` sayfanın SON
    /// elemanı. İlk elemanı verseydik aynı sayfa sonsuza kadar dönerdi.
    test('⭐ imleç sayfanın EN ESKİ (son) elemanından', () {
      final p = ChatHistoryPage(
        items: [_m(id: 30), _m(id: 20), _m(id: 10)],
        hasMore: true,
      );
      expect(olderCursor(p), 10);
    });

    test('daha yoksa null', () {
      expect(
        olderCursor(ChatHistoryPage(items: [_m(id: 5)], hasMore: false)),
        isNull,
      );
    });

    /// ⚠️ `hasMore: true` ama sayfa boş — sunucu yarışı. İmleç üretmek sonsuz döngü olurdu.
    test('⭐ boş sayfa «daha var» dese bile null', () {
      expect(
        olderCursor(const ChatHistoryPage(items: [], hasMore: true)),
        isNull,
      );
    });
  });

  group('yazma kapısı', () {
    test('normal hâlde açık', () {
      final k = writeGate(blockedByMe: false, emailVerified: true);
      expect(k.canWrite, isTrue);
      expect(k.reason, isNull);
    });

    /// ⚠️ Engellediğim biriyle yazışamam ve sebep açıkça yazılıyor.
    test('⭐ engellediysem kapalı ve sebebi yazılı', () {
      final k = writeGate(blockedByMe: true, emailVerified: true);
      expect(k.canWrite, isFalse);
      expect(k.reason, contains('engeli kaldır'));
    });

    /// ⭐ §verify — okumak serbest, yazmak değil (kullanıcı şartı). Kutuyu baştan kapatmak,
    /// mesajı yazdırıp SONRA reddetmekten dürüst.
    test('⭐ doğrulanmamış hesap yazamıyor ama sebebi okuyabiliyor', () {
      final k = writeGate(blockedByMe: false, emailVerified: false);
      expect(k.canWrite, isFalse);
      expect(k.reason, contains('okuyabilirsin'));
    });

    /// ⚠️⚠️ Bilgi HENÜZ GELMEDİYSE engellenmiyor: son sözü sunucu söylüyor. Kapatsaydık ağ
    /// yavaşken doğrulanmış bir oyuncu da susardı ve bunu hiçbir hata mesajı açıklamazdı.
    test('⭐⭐ doğrulama bilgisi YOKKEN kutu AÇIK kalıyor', () {
      final k = writeGate(blockedByMe: false, emailVerified: null);
      expect(k.canWrite, isTrue);
      expect(k.reason, isNull);
    });

    /// ⚠️ Engel doğrulamayı EZİYOR: iki kapı da kapalıysa oyuncuya söylenmesi gereken şey
    /// kendi koyduğu engel — onu kaldırmak elinde, doğrulama ayrı bir iş.
    test('iki kapı da kapalıyken engel sebebi yazılıyor', () {
      final k = writeGate(blockedByMe: true, emailVerified: false);
      expect(k.reason, contains('engeli kaldır'));
    });
  });

  group('gönder düğmesi', () {
    /// ⚠️ **Kırpılmış** uzunluğa bakılıyor — sunucu da `z.string().trim().min(1)` diyor.
    /// Kırpmadan baksaydık boşluktan ibaret bir mesaj düğmeyi açar ve sunucu reddederdi.
    test('⭐ yalnız boşluktan ibaret taslak düğmeyi AÇMIYOR', () {
      expect(canSendDraft('   ', canWrite: true, busy: false), isFalse);
      expect(canSendDraft('\n\n', canWrite: true, busy: false), isFalse);
      expect(canSendDraft(' a ', canWrite: true, busy: false), isTrue);
    });

    test('yazma hakkı yoksa ve gönderim sürerken kapalı', () {
      expect(canSendDraft('selam', canWrite: false, busy: false), isFalse);
      expect(canSendDraft('selam', canWrite: true, busy: true), isFalse);
    });

    /// ⚠️ Sınır `chat.ts` · `sendChatRequest` ile aynı sayı olmalı; ayrışırsa oyuncu reddi
    /// ancak göndermeye çalışınca öğrenir (ad kuralında tam bu yaşanmıştı).
    test('⭐ gövde üst sınırı sunucununkiyle aynı', () {
      expect(kChatBodyMax, 500);
    });

    test('sayaç yalnız sınıra yaklaşınca görünüyor', () {
      expect(showCounter('a' * 399), isFalse);
      expect(showCounter('a' * 401), isTrue);
    });
  });

  group('önizleme metni', () {
    /// ⚠️ «Sen: » öneki yalnız son mesajı BEN yazdıysam — karşı tarafın mesajını kendiminki
    /// sanmak, listede en çok yapılacak okuma hatası olurdu.
    test('⭐ kendi mesajım «Sen: » ile', () {
      expect(
        previewText(lastMessage: 'geliyorum', lastFromMe: true),
        'Sen: geliyorum',
      );
      expect(
        previewText(lastMessage: 'geliyorum', lastFromMe: false),
        'geliyorum',
      );
    });

    /// ⚠️ Yer tutucu YOK: yeni açılmış boş bir sohbette «(mesaj yok)» gürültü olurdu.
    test('mesaj yoksa boş dize', () {
      expect(previewText(lastMessage: null, lastFromMe: false), '');
      expect(previewText(lastMessage: '', lastFromMe: true), '');
    });
  });
}
