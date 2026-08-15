/// ⭐⭐ İSTEMCİ SAATİ — durum davranışı + DİLLER ARASI EŞİTLİK KAPISI.
///
/// İki bölüm, iki ayrı iş:
///
///   1. **Durum** (`saat çıpaları`, `remaining`) — web'deki `apps/web/test/clock.test.ts`in
///      aynadaki karşılığı. Sapma ölçümü, bakım donması, çıpa seçimi.
///   2. ⭐⭐ **Ortak vektörler** — `packages/contracts/fixtures/clock-vectors.json` dosyasını
///      TS testiyle **aynı dosyadan** okuyup aynı sonuçları bekliyor. Kullanıcının «tam
///      eşitlik» kararı böylece umut değil kapı oluyor.
///
/// ⚠️ Vektör dosyası KOPYALANMIYOR, göreli yoldan okunuyor (`MOBIL_MIMARI.md` §5.1): kopya,
/// öldürmeye çalıştığımız bayatlamanın ta kendisi olurdu.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/clock.dart';

/// ⚠️ `flutter test` çalışma dizini paket kökü (`apps/mobile`) — yol oradan kuruluyor.
final _vectors =
    jsonDecode(
          File(
            '../../packages/contracts/fixtures/clock-vectors.json',
          ).readAsStringSync(),
        )
        as Map<String, dynamic>;

List<Map<String, dynamic>> _grup(String ad) =>
    (_vectors[ad] as List<dynamic>).cast<Map<String, dynamic>>();

/// Sabit bir "cihaz şimdisi" — sapma ölçümü ancak böyle deterministik olur.
const int _cihazSimdi = 1786060800000; // 2026-08-07T12:00:00.000Z

String _iso(int ms) =>
    DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true).toIso8601String();

/// Saati sabit cihaz anına çıpalanmış, dünyası ÇALIŞAN bir saat kurar.
MwClock _saat({int? simdi}) {
  var an = simdi ?? _cihazSimdi;
  final c = MwClock(deviceNow: () => an);
  c.noteServerTime(_iso(an), _iso(an));
  return c;
}

void main() {
  // ── Bölüm 1: durum davranışı ────────────────────────────────────────────────
  group('saat çıpaları', () {
    test('⚠️ sabit doğru okundu (vektör dosyasıyla aynı sayı)', () {
      expect(kPauseThresholdMs, _vectors['pauseThresholdMs']);
    });

    test('cihaz saati ileriyse sapma ölçülüp geri alınır', () {
      final c = MwClock(deviceNow: () => _cihazSimdi);
      // Sunucu 30 sn GERİDE → cihaz 30 sn ileri demektir.
      c.noteServerTime(_iso(_cihazSimdi - 30000));
      expect(c.serverNow(), _cihazSimdi - 30000);
    });

    test('cihaz saati geriyse de düzeltilir', () {
      final c = MwClock(deviceNow: () => _cihazSimdi);
      c.noteServerTime(_iso(_cihazSimdi + 45000));
      expect(c.serverNow(), _cihazSimdi + 45000);
    });

    test('⭐⭐ dünya çalışıyorken gameNow == serverNow (tek zaman çizgisi)', () {
      final c = _saat();
      expect(c.gameNow(), c.serverNow());
    });

    test('⭐ bakımda gameNow DONAR, serverNow AKMAYA DEVAM eder', () {
      var an = _cihazSimdi;
      final c = MwClock(deviceNow: () => an);
      final pausedAt = _cihazSimdi - 10 * 60000;
      c.noteServerTime(_iso(_cihazSimdi), _iso(pausedAt));
      expect(c.gameNow(), pausedAt);

      an = _cihazSimdi + 30000; // gerçek zaman aksın
      expect(c.serverNow(), _cihazSimdi + 30000);
      expect(c.gameNow(), pausedAt, reason: 'oyun saati kıpırdamamalı');
    });

    test('⚠️ gameNow göndermeyen yanıt bakım çıpasını BOZMAZ', () {
      // Uçların çoğu `serverNow` gönderiyor ama `gameNow` göndermiyor; her biri perdeyi
      // sessizce kaldırsaydı bakım sırasında geri sayımlar rastgele akıp dururdu.
      final c = MwClock(deviceNow: () => _cihazSimdi);
      final pausedAt = _cihazSimdi - 60000;
      c.noteServerTime(_iso(_cihazSimdi), _iso(pausedAt));
      c.noteServerTime(_iso(_cihazSimdi)); // gameNow yok
      expect(c.gameNow(), pausedAt);
    });

    test('⚠️ bozuk damga çıpayı bozmaz', () {
      final c = _saat();
      c.noteServerTime('bu bir tarih değil', 'bu da değil');
      expect(c.gameNow(), c.serverNow());
    });

    test('noteMaintenance anında dondurur ve çözer', () {
      final c = _saat();
      final pausedAt = _cihazSimdi - 5000;
      c.noteMaintenance(true, _iso(pausedAt));
      expect(c.gameNow(), pausedAt);

      c.noteMaintenance(false);
      expect(c.gameNow(), c.serverNow());
    });

    test('damgasız bakım bildirimi yine de dondurur', () {
      var an = _cihazSimdi;
      final c = MwClock(deviceNow: () => an);
      c.noteServerTime(_iso(an), _iso(an));
      c.noteMaintenance(true);
      final donmus = c.gameNow();

      an = _cihazSimdi + 10000;
      expect(
        c.gameNow(),
        donmus,
        reason: 'yanlış an, ama akmaya devam etmekten iyi',
      );
    });
  });

  group('remaining — çıpa seçimi', () {
    test('⭐⭐ 2026-08-02 hatasının bekçisi: iki çıpa da aynı sonucu verir', () {
      // Casusluk 120 sn sürüyor. Oyun saati gerçek saatin gerisinde kalsaydı varış anı gerçek
      // saatle bakıldığında HEP geçmişte kalır ve geri sayım yerine sürekli «varıyor» yazardı.
      final c = _saat();
      final varis = _iso(c.gameNow() + 120000);

      expect(c.remaining(varis), '2 dk 00 sn');
      expect(c.remaining(varis, now: c.serverNow()), '2 dk 00 sn');
    });

    test('⚠️ BAKIMDA geri sayım DONMUŞ saatten çizilir', () {
      final c = MwClock(deviceNow: () => _cihazSimdi);
      final pausedAt = _cihazSimdi - 10 * 60000;
      c.noteServerTime(_iso(_cihazSimdi), _iso(pausedAt));
      final varis = _iso(pausedAt + 120000); // duraklama anından 2 dk sonrası

      expect(
        c.remaining(varis),
        '2 dk 00 sn',
        reason: '⭐ donmuş: iş ilerlemiyor',
      );
      expect(
        c.remaining(varis, now: c.serverNow()),
        isNull,
        reason:
            '⛔ gerçek saatle bakılsaydı "bitmiş" sanırdı — tam olarak o hata',
      );
    });

    test('bitmiş süre ve geçersiz girdi null döner', () {
      final c = _saat();
      expect(c.remaining(_iso(c.gameNow() - 1000)), isNull);
      expect(c.remaining(null), isNull);
      expect(c.remaining('çöp'), isNull);
    });

    test('remainingClock aynı çıpayı kullanır', () {
      final c = _saat();
      expect(c.remainingClock(_iso(c.gameNow() + 271000)), '04:31');
    });

    test('⚠️ remainingLong varsayılanı GERÇEK saat (bilinçli asimetri)', () {
      // Tek çağıranı tatil paneli ve oradaki damga gün ölçeğinde. Ailenin geri kalanından
      // ayrışması kasıtlı; değişirse burada görünür.
      final c = MwClock(deviceNow: () => _cihazSimdi);
      c.noteServerTime(_iso(_cihazSimdi), _iso(_cihazSimdi - 196563));
      expect(c.remainingLong(_iso(c.serverNow() + 3 * 86400000)), '3 gün');
    });

    test('⭐ timeAgo çıpası serverNow — bakımda bile YAŞLANMAYA devam eder', () {
      final c = MwClock(deviceNow: () => _cihazSimdi);
      final pausedAt = _cihazSimdi - 10 * 60000;
      c.noteServerTime(_iso(_cihazSimdi), _iso(pausedAt));
      expect(c.gameNow(), isNot(c.serverNow())); // saatler gerçekten ayrışmış

      final mesaj = _iso(_cihazSimdi - 5 * 60000);
      expect(c.timeAgo(mesaj), '5 dakika önce');
      // ⛔ Oyun saatiyle bakılsaydı mesaj «gelecekte» kalır ve donardı:
      expect(c.timeAgo(mesaj, now: c.gameNow()), '1 saniye önce');
    });
  });

  // ── Bölüm 2: ⭐⭐ diller arası eşitlik ───────────────────────────────────────
  group('⭐⭐ ortak vektörler — web ile AYNI dosya, AYNI sonuç', () {
    test('⚠️ vektör dosyası gerçekten okundu (sessiz boş küme değil)', () {
      // Dosya bulunamasa `readAsStringSync` zaten patlar; asıl risk yanlış anahtar okuyup
      // boş liste üzerinde dönmek — o durumda döngülü testler HİÇBİR ŞEY ölçmeden yeşil yanar.
      expect(_grup('durations').length, greaterThan(10));
      expect(_grup('timeAgo').length, greaterThan(10));
      expect(_grup('pause').length, greaterThan(3));
    });

    for (final v in _grup('durations')) {
      test('${v['seconds']} sn → ${v['duration']}', () {
        final s = v['seconds'] as num;
        expect(formatDuration(s), v['duration']);
        expect(formatLongDuration(s), v['long']);
        expect(formatClock(s), v['clock']);
      });
    }

    for (final v in _grup('timeAgo')) {
      test('${v['agoSeconds']} sn önce → ${v['text']}', () {
        final ago = (v['agoSeconds'] as num).toInt();
        final c = _saat();
        expect(c.timeAgo(_iso(_cihazSimdi - ago * 1000)), v['text']);
      });
    }

    for (final v in _grup('pause')) {
      test('sapma ${v['skewMs']} ms → duraklamış: ${v['paused']}', () {
        final skew = (v['skewMs'] as num).toInt();
        final c = _saat(); // önce dünyayı çalışır duruma çek
        c.noteServerTime(_iso(_cihazSimdi), _iso(_cihazSimdi - skew));

        if (v['paused'] as bool) {
          expect(c.gameNow(), _cihazSimdi - skew);
        } else {
          expect(c.gameNow(), c.serverNow());
        }
      });
    }
  });
}
