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
        'missions:changed',
        'messages:changed',
      });
    });

    test('her konunun en az bir hedefi var (ölü satır yok)', () {
      for (final e in kInvalidates.entries) {
        expect(e.value, isNotEmpty, reason: '${e.key} hiçbir şeyi tazelemiyor');
      }
    });
  });
}
