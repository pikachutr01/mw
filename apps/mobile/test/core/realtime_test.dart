/// ⭐⭐ ARKA PLANDAN DÖNÜŞ — mobilin web'de karşılığı olmayan tuzağı.
///
/// Android uygulamayı dondurunca iki şey oluyor ve ikisi de **sessiz**:
///   1. socket.io'nun üstel backoff'u bir `Timer`a dayanıyor; donmuş uygulamada o zamanlayıcı
///      hiç çalışmıyor. Geri dönünce istemci "birazdan denerim" diye bekliyor olabiliyor ve o
///      «birazdan» dakikalar sonra geliyor.
///   2. **Hayalet soket:** işletim sistemi TCP bağlantısını öldürüyor ama istemci hâlâ
///      `connected` sanıyor. Ekranda yeşil nokta yanıyor, hiçbir olay gelmiyor.
///
/// İkincisi kullanıcı açısından en kötü hâl: **gösterge yalan söylüyor.** Bu yüzden geri
/// dönüşte socket.io'nun kendi durumuna güvenilmiyor, karar açıkça veriliyor ve burada
/// kilitleniyor.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/realtime.dart';

void main() {
  group('⭐⭐ shouldForceReconnect — geri dönüş kararı', () {
    test('bağlı DEĞİLKEN her zaman yeniden bağlanır (backoff beklenmez)', () {
      for (final s in [
        MwConnectionState.offline,
        MwConnectionState.connecting,
      ]) {
        expect(
          shouldForceReconnect(state: s, awayFor: Duration.zero),
          isTrue,
          reason:
              '$s durumunda socket.io\'nun donmuş zamanlayıcısını beklemek '
              'dakikalarca sessizlik demek',
        );
      }
    });

    test('kısa süre uzaktaysak ve BAĞLIYSAK dokunulmaz', () {
      // Oyuncu bildirim panelini üç saniye açtı. Gereksiz el sıkışma yapmanın anlamı yok.
      expect(
        shouldForceReconnect(
          state: MwConnectionState.online,
          awayFor: const Duration(seconds: 3),
        ),
        isFalse,
      );
    });

    test(
      '⚠️⚠️ UZUN süre uzaktaysak bağlı GÖRÜNSEK bile yeniden kurulur (hayalet soket)',
      () {
        expect(
          shouldForceReconnect(
            state: MwConnectionState.online,
            awayFor: const Duration(minutes: 5),
          ),
          isTrue,
          reason: 'yeşil nokta yanıp hiç olay gelmemesi kabul edilemez',
        );
      },
    );

    test('⭐ eşik TAM sınırda yeniden bağlanır (`>=`)', () {
      // ⚠️ Sınırda hangi tarafa düşüleceği bilinçli: şüphede kalınca YENİDEN BAĞLAN.
      // Gereksiz bir el sıkışmanın bedeli bir istek; kaçırılan hayalet soketin bedeli
      // oyuncunun hiçbir olay almaması. Asimetri açık.
      expect(
        shouldForceReconnect(
          state: MwConnectionState.online,
          awayFor: kGhostSocketThreshold,
        ),
        isTrue,
      );
      expect(
        shouldForceReconnect(
          state: MwConnectionState.online,
          awayFor: kGhostSocketThreshold - const Duration(milliseconds: 1),
        ),
        isFalse,
      );
    });

    test('⚠️ eşik Engine.IO ping zaman aşımının ALTINDA', () {
      // Sunucunun varsayılan `pingTimeout`u 20 sn. Eşiği onun üstüne koysaydık, sunucunun
      // çoktan düşürdüğü bir soketi "sağ" sayabilirdik.
      expect(kGhostSocketThreshold.inSeconds, lessThan(20));
    });
  });

  group('çakışma hatası ayırt ediliyor', () {
    test('⭐ `session_conflict` sıradan bir bağlantı hatası DEĞİL', () {
      // Ayırt edilmezse socket.io bunu ağ arızası sanıp sonsuz yeniden bağlanma döngüsüne
      // girer; oysa yapılması gereken perdeyi açıp durmaktır.
      expect(isConflictError('session_conflict'), isTrue);
      expect(isConflictError({'message': 'session_conflict'}), isTrue);
    });

    test('başka hatalar çakışma sayılmaz', () {
      expect(isConflictError('unauthorized'), isFalse);
      expect(isConflictError('xhr poll error'), isFalse);
      expect(isConflictError(null), isFalse);
    });
  });

  group('⚠️ olay tablosu', () {
    test('konu adları sunucunun yaydıklarıyla birebir', () {
      // Yanlış yazılmış bir konu adı hiçbir yerde hata üretmez: olay gelir, kimse dinlemez,
      // ekran 60 sn boyunca eski veriyi gösterir. Sessiz arıza → testle kilitleniyor.
      expect(kInvalidates.keys.toSet(), {
        'city:changed',
        'cities:changed',
        'city:army_returned',
        'missions:changed',
        'messages:changed',
        'battle:resolved',
        'chat:message',
        'chat:global',
        'chat:global:deleted',
        'chat:alliance',
        'chat:alliance:deleted',
        'alliance:changed',
      });
    });

    /// ⭐⭐ ORDU EVE DÖNÜNCE NE TAZELENİR (kullanıcı, 2026-08-21): *"ordu şehre geri
    /// döndüğünde oyun açık durumda olunca görevlerde anlık olarak kullanılabilir hâle
    /// gelmeli."*
    ///
    /// ⚠️⚠️ Bu satır 2026-08-21'e kadar YAZILAMIYORDU: sunucu olayı `missions:changed`
    /// konusuna düzleştiriyordu, yani adı istemciye hiç ulaşmıyordu. Eksik olan tek şey
    /// `temple`ydı ve belirtisi yalnız «dönen kahramanı sefere seçemiyorum» olarak
    /// görünüyordu — hata yok, boş liste yok, sessiz.
    test('⭐ ordu dönüşü kahramanı da tazeliyor (temple)', () {
      expect(kInvalidates['city:army_returned'], contains('temple'));
      expect(kInvalidates['city:army_returned']!.toSet(), {
        'city',
        'catalog',
        'missions',
        'temple',
        'overview',
      });
    });

    /// ⚠️ Dönüş `city:changed`in tazelediği her şeyi kapsamak zorunda: handler ikisini
    /// birden yayıyor ve dönüş şehre hem birlik hem ganimet yazıyor.
    test('ordu dönüşü, şehir olayının tazelediklerini kapsıyor', () {
      for (final k in kInvalidates['city:changed']!) {
        expect(kInvalidates['city:army_returned'], contains(k));
      }
    });

    /// ⭐⭐ ODA OLAYLARI `kInvalidates`ten AYRI bir listede ve öyle kalmalı (2026-08-19).
    ///
    /// ⚠️ O tablonun her satırı "bir sorguyu tazele" demek; `kRoomEvents`in tazeleyecek bir
    /// sorgusu YOK — «yazıyor…» ve «kaç kişi bağlı» hiçbir tabloda durmuyor, yalnız o anda
    /// var. İkisini birleştirmek, yük taşıyan bir olayın yanlışlıkla sorgu tazelemesine (ya
    /// da tersine, bir konunun yükünün okunmaya çalışılmasına) yol açardı.
    test('⭐⭐ oda olayları konu tablosuyla ÇAKIŞMIYOR', () {
      for (final ad in kRoomEvents) {
        expect(
          kInvalidates.containsKey(ad),
          isFalse,
          reason:
              '$ad iki tabloda birden — biri yük taşır, diğeri sorgu tazeler',
        );
      }
    });

    /// ⚠️ Üç oda türünün üçünün de «yazıyor» olayı dinleniyor olmalı: biri eksikse o sohbette
    /// gösterge sessizce hiç yanmaz ve bunu hiçbir hata bildirmez.
    test('⭐ üç oda türünün yazıyor olayı da dinleniyor', () {
      for (final r in MwChatRoom.values) {
        expect(
          kRoomEvents,
          contains(r.typingEvent),
          reason: '${r.name} odasının «yazıyor» olayı dinlenmiyor',
        );
      }
    });

    /// ⚠️⚠️ Sunucuda ÜÇ AYRI slot var ve her slot tek kanal tutuyor. İki oda türü aynı olay
    /// adını paylaşsaydı, biri diğerini odadan atardı — oyuncu DM ile genel sohbeti aynı anda
    /// açık tutabiliyor.
    test('⭐⭐ üç oda türünün olay adları BİRBİRİNDEN farklı', () {
      final acilis = MwChatRoom.values.map((r) => r.openEvent).toSet();
      final kapanis = MwChatRoom.values.map((r) => r.closeEvent).toSet();
      expect(acilis.length, MwChatRoom.values.length);
      expect(kapanis.length, MwChatRoom.values.length);
    });

    /// ⭐ ÖZEL MESAJ İKİ ŞEYİ tazelemek zorunda (2026-08-18): sohbet LİSTESİ (önizleme ve
    /// okunmamış rozeti) ve açık sohbetin GEÇMİŞİ (balonun kendisi).
    ///
    /// ⚠️ Yalnız geçmiş yazılsaydı, sohbet kapalıyken gelen mesaj hiçbir yerde görünmezdi:
    /// olay gelir, kimse dinlemez, Mesajlar sekmesi eski önizlemeyi göstermeye devam eder.
    /// ⚠️ Yalnız liste yazılsaydı, sohbet AÇIKKEN gelen mesaj ekrana hiç düşmezdi.
    test('⭐ `chat:message` hem listeyi hem geçmişi tazeliyor', () {
      expect(
        kInvalidates['chat:message'],
        containsAll(['chat', 'chat-history']),
      );
    });

    /// ⭐ Kullanıcı şartı (2026-08-16): saldırı yenen oyuncunun **Baraka ekranı** anında
    /// tazelensin. O ekran hem şehri hem katalogu okuyor; biri eksikse ekranın yarısı
    /// savaş öncesini göstermeye devam eder ve bu sessiz bir arızadır.
    test('⭐ savaş olayı Baraka ekranının İKİ kaynağını da tazeler', () {
      expect(kInvalidates['battle:resolved'], containsAll(['city', 'catalog']));
    });

    /// ⭐ 2026-08-18: Komuta Merkezi gelince liste **web'in `BATTLE_KEYS` dizisiyle birebir**
    /// oldu. ⚠️ `overview` eksikken Genel Durum toplamları 5 dakikaya kadar savaş öncesini
    /// yazıyordu — web'de tam bu denetimde çıkmıştı.
    test('⭐ savaş olayı web tarafının BATTLE_KEYS listesiyle birebir', () {
      expect(kInvalidates['battle:resolved']!.toSet(), {
        'messages',
        'missions',
        'city',
        'catalog',
        'temple',
        'overview',
      });
    });

    test('her konunun en az bir hedefi var (ölü satır yok)', () {
      for (final e in kInvalidates.entries) {
        expect(e.value, isNotEmpty, reason: '${e.key} hiçbir şeyi tazelemiyor');
      }
    });
  });
}
