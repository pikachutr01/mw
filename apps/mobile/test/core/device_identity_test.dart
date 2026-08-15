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
class _ForgetfulStore implements Store {
  int writeCount = 0;

  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async => writeCount++;

  @override
  Future<void> delete(String key) async {}
}

void main() {
  group('DeviceIdentity', () {
    test('ilk çağrıda üretir ve kalıcı olarak yazar', () async {
      final store = MemoryStore();
      final id = await DeviceIdentity(store).deviceId();

      expect(id, isNotEmpty);
      expect(
        store.contents[kDeviceIdKey],
        id,
        reason: 'değer depoya yazılmalı',
      );
    });

    test('aynı nesne ikinci çağrıda AYNI değeri döndürür', () async {
      final identity = DeviceIdentity(MemoryStore());
      expect(await identity.deviceId(), await identity.deviceId());
    });

    test('⚠️⚠️ UYGULAMA YENİDEN AÇILINCA kimlik DEĞİŞMEZ '
        '(değişirse oyuncu 90 sn kendi hesabına giremez)', () async {
      final store = MemoryStore(); // disk: iki açılış arasında yaşıyor
      final firstLaunch = await DeviceIdentity(store).deviceId();
      final secondLaunch = await DeviceIdentity(
        store,
      ).deviceId(); // yeni nesne = yeni açılış

      expect(secondLaunch, firstLaunch);
    });

    test(
      '⚠️ kalıcılık YÜK TAŞIYOR — depo hatırlamazsa kimlik her açılışta değişir',
      () async {
        // Doğru davranışın yanına YANLIŞININ SONUCUNU da koymak bu deponun geleneği. Burada
        // taklit edilen hata, kimliğin bellekte üretilmesi (ya da eşdeğeri: yazılanın geri
        // okunamaması). Sonucu: iki açılış, iki farklı kimlik → sunucu ikinciyi başka bir kopya
        // sanar → 90 saniyelik kilit.
        final forgetful = _ForgetfulStore();
        final first = await DeviceIdentity(forgetful).deviceId();
        final second = await DeviceIdentity(forgetful).deviceId();

        expect(
          forgetful.writeCount,
          2,
          reason: 'her açılışta yeniden üretildi',
        );
        expect(
          second,
          isNot(first),
          reason: 'kalıcılık olmadan kimlik korunamaz — kaçınılan durum',
        );
      },
    );

    test(
      '⭐ instanceId ile deviceId AYNI değerdir (mobilde doğrusu bu)',
      () async {
        // Web'de ikisi ayrıdır çünkü orada "kopya" bir SEKME. Mobilde sekme yok, kopya =
        // kurulum → ayırmanın anlamı yok (DAGITIM.md §6).
        final identity = DeviceIdentity(MemoryStore());
        expect(await identity.instanceId(), await identity.deviceId());
      },
    );
  });

  group('biçim — sunucu reddetmemeli', () {
    /// Sunucudaki `UUID_RE` (`abuse/device-context.ts:25`) ile BİREBİR aynı kalıp.
    final serverRe = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      caseSensitive: false,
    );

    test('⭐ üretilen kimlik sunucunun UUID kalıbına uyar', () async {
      final id = await DeviceIdentity(MemoryStore()).deviceId();
      expect(
        serverRe.hasMatch(id),
        isTrue,
        reason: 'uymayan değer sunucuda SESSİZCE null sayılır',
      );
    });

    test('⚠️ bozuk kayıtlı değer tazelenir (sessizce kullanılmaz)', () async {
      // Sunucu geçersiz kimliği yok sayıyor ve cihaz künyesini HİÇ yazmıyor. Sessiz kayıp
      // yerine yeni kimlik üretmek doğrusu.
      final store = MemoryStore({kDeviceIdKey: 'bu-bir-uuid-degil'});
      final id = await DeviceIdentity(store).deviceId();

      expect(id, isNot('bu-bir-uuid-degil'));
      expect(serverRe.hasMatch(id), isTrue);
      expect(
        store.contents[kDeviceIdKey],
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
        const serverAccepts = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        final store = MemoryStore({kDeviceIdKey: serverAccepts});

        expect(await DeviceIdentity(store).deviceId(), serverAccepts);
      },
    );
  });
}
