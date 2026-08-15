/// ⚠️⚠️ CİHAZ KİMLİĞİNİN KALICILIĞI — mobilin en pahalı tuzağı.
///
/// Yanlış uygulamanın bedeli soyut değil: her açılışta yeni kimlik üretilirse önceki sahiplik
/// `session.claimGraceSeconds` (90 sn) boyunca taze kalır ve oyuncu **kendi hesabına giremez**;
/// ekranda *"hesabın başka bir cihazda açık"* yazar. Sunucu tarafındaki kardeş test:
/// `apps/api/test/presence.test.ts` → *"⭐⭐ mobil: instanceId kalıcı olmalı"*.
///
/// ⭐ Buradaki kritik test "aynı nesne aynı değeri döndürüyor mu" DEĞİL (onu önbellek de
/// sağlardı) — **yeni bir nesne, aynı deponun üstünde, aynı değeri buluyor mu**. Uygulamanın
/// öldürülüp yeniden açılması tam olarak budur.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/core/device_identity.dart';
import 'package:mobilwar/core/storage.dart';

/// Yazmayı kabul eden ama **hiçbir şey hatırlamayan** depo — "kimlik bellekte üretildi"
/// hatasının gözlemlenebilir eşdeğeri. Yalnız bu dosyadaki karşı-örnek testi için var.
class _UnutkanDepo implements KaliciDepo {
  int yazmaSayisi = 0;

  @override
  Future<String?> oku(String anahtar) async => null;

  @override
  Future<void> yaz(String anahtar, String deger) async => yazmaSayisi++;

  @override
  Future<void> sil(String anahtar) async {}
}

void main() {
  group('CihazKimligi', () {
    test('ilk çağrıda üretir ve kalıcı olarak yazar', () async {
      final depo = BellekDepo();
      final id = await CihazKimligi(depo).deviceId();

      expect(id, isNotEmpty);
      expect(depo.icerik[kDeviceIdKey], id, reason: 'değer depoya yazılmalı');
    });

    test('aynı nesne ikinci çağrıda AYNI değeri döndürür', () async {
      final k = CihazKimligi(BellekDepo());
      expect(await k.deviceId(), await k.deviceId());
    });

    test('⚠️⚠️ UYGULAMA YENİDEN AÇILINCA kimlik DEĞİŞMEZ '
        '(değişirse oyuncu 90 sn kendi hesabına giremez)', () async {
      final depo = BellekDepo(); // disk: iki açılış arasında yaşıyor
      final ilkAcilis = await CihazKimligi(depo).deviceId();
      final ikinciAcilis = await CihazKimligi(
        depo,
      ).deviceId(); // yeni nesne = yeni açılış

      expect(ikinciAcilis, ilkAcilis);
    });

    test(
      '⚠️ kalıcılık YÜK TAŞIYOR — depo hatırlamazsa kimlik her açılışta değişir',
      () async {
        // Doğru davranışın yanına YANLIŞININ SONUCUNU da koymak bu deponun geleneği. Burada
        // taklit edilen hata, kimliğin bellekte üretilmesi (ya da eşdeğeri: yazılanın geri
        // okunamaması). Sonucu: iki açılış, iki farklı kimlik → sunucu ikinciyi başka bir kopya
        // sanar → 90 saniyelik kilit.
        final unutkan = _UnutkanDepo();
        final ilk = await CihazKimligi(unutkan).deviceId();
        final ikinci = await CihazKimligi(unutkan).deviceId();

        expect(unutkan.yazmaSayisi, 2, reason: 'her açılışta yeniden üretildi');
        expect(
          ikinci,
          isNot(ilk),
          reason: 'kalıcılık olmadan kimlik korunamaz — kaçınılan durum',
        );
      },
    );

    test(
      '⭐ instanceId ile deviceId AYNI değerdir (mobilde doğrusu bu)',
      () async {
        // Web'de ikisi ayrıdır çünkü orada "kopya" bir SEKME. Mobilde sekme yok, kopya =
        // kurulum → ayırmanın anlamı yok (DAGITIM.md §6).
        final k = CihazKimligi(BellekDepo());
        expect(await k.instanceId(), await k.deviceId());
      },
    );
  });

  group('biçim — sunucu reddetmemeli', () {
    /// Sunucudaki `UUID_RE` (`abuse/device-context.ts:25`) ile BİREBİR aynı kalıp.
    final sunucuRe = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      caseSensitive: false,
    );

    test('⭐ üretilen kimlik sunucunun UUID kalıbına uyar', () async {
      final id = await CihazKimligi(BellekDepo()).deviceId();
      expect(
        sunucuRe.hasMatch(id),
        isTrue,
        reason: 'uymayan değer sunucuda SESSİZCE null sayılır',
      );
    });

    test('⚠️ bozuk kayıtlı değer tazelenir (sessizce kullanılmaz)', () async {
      // Sunucu geçersiz kimliği yok sayıyor ve cihaz künyesini HİÇ yazmıyor. Sessiz kayıp
      // yerine yeni kimlik üretmek doğrusu.
      final depo = BellekDepo({kDeviceIdKey: 'bu-bir-uuid-degil'});
      final id = await CihazKimligi(depo).deviceId();

      expect(id, isNot('bu-bir-uuid-degil'));
      expect(sunucuRe.hasMatch(id), isTrue);
      expect(
        depo.icerik[kDeviceIdKey],
        id,
        reason: 'tazelenen değer diske de yazılmalı',
      );
    });

    test(
      '⚠️ sunucunun KABUL ETTİĞİ değer geçerli sayılır — kalıp katılaştırılmamalı',
      () async {
        // v4 olmayan ama sunucunun kabul ettiği bir UUID. Burada daha katı davranmak, sunucunun
        // sorun görmediği bir kimliği "bozuk" sayıp DEĞİŞTİRMEK demekti — yani tam olarak
        // kaçındığımız şey.
        const sunucununKabulEttigi = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        final depo = BellekDepo({kDeviceIdKey: sunucununKabulEttigi});

        expect(await CihazKimligi(depo).deviceId(), sunucununKabulEttigi);
      },
    );
  });
}
