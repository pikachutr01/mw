/// ⚠️⚠️ CİHAZ KİMLİĞİ — mobilin en pahalı tuzağının yaşadığı yer.
///
/// Sunucu her istekte iki kimlik okuyor (`DAGITIM.md` §6, `abuse/device-context.ts`):
///
///   `X-Device-Id`       — kurulum başına kimlik, çoklu hesap sinyali (`player_devices`)
///   `X-Client-Instance` — "uygulamanın çalışan tek kopyası", tek cihaz kuralının ayracı
///
/// ⚠️⚠️ **İKİSİ DE KALICI DEPODA TUTULMAK ZORUNDA.** Web'de `X-Client-Instance` bir SEKMEYİ
/// temsil ettiği için `sessionStorage`'ta; mobilde sekme yok, kopya = **kurulum**.
///
/// Bellekte üretilirse şu yaşanır ve teşhisi zordur: mobil uygulamalar sürekli öldürülüp
/// açılır → her açılışta yeni kimlik doğar → önceki kimliğin sahipliği
/// `session.claimGraceSeconds` (90 sn) boyunca TAZE kalır → oyuncu **kendi hesabına giremez**
/// ve ekranda *"hesabın başka bir cihazda açık"* yazar. Kalıcı kimlikle yeniden açılış aynı
/// sahipliği anında geri alır.
///
/// ⭐ **Mobilde ikisinin AYNI değer olması tamamen doğrudur** (`DAGITIM.md` §6): ayırmak yalnız
/// web'de, sekmeler yüzünden anlamlı. Bu yüzden tek bir kimlik üretilip iki başlığa da veriliyor.
///
/// Sunucu tarafındaki sözleşme `apps/api/test/presence.test.ts` →
/// *"⭐⭐ mobil: instanceId kalıcı olmalı"* bloğunda kilitli.
library;

import 'package:uuid/uuid.dart';

import 'storage.dart';

/// ⚠️ Sunucu `X-Device-Id`i **UUID regex'iyle** doğruluyor (`device-context.ts`); uymayan
/// değer sessizce `null` sayılıyor ve cihaz künyesi hiç yazılmıyor. Üretilen biçim bu yüzden
/// serbest değil.
const String kDeviceIdKey = 'mw-device-id';

class DeviceIdentity {
  DeviceIdentity(this._store, {String Function()? newUuid})
    : _generate = newUuid ?? (() => const Uuid().v4());

  final Store _store;
  final String Function() _generate;

  /// Bellek içi önbellek — aynı açılışta depoya tekrar tekrar gitmemek için.
  String? _cache;

  /// Kurulum kimliği. İlk çağrıda üretilip **kalıcı olarak** yazılır, sonrakiler aynı değeri
  /// döndürür. Uygulama yeniden başlasa da (yeni `DeviceIdentity` nesnesi) değer korunur.
  Future<String> deviceId() async {
    final cached = _cache;
    if (cached != null) return cached;

    final stored = await _store.read(kDeviceIdKey);
    if (stored != null && _isValidUuid(stored)) {
      _cache = stored;
      return stored;
    }

    // ⚠️ Bozuk/eski değer varsa ÜZERİNE yazılır: geçersiz UUID sunucuda sessizce yok
    // sayılıyordu, yani cihaz künyesi hiç toplanmıyordu. Sessiz kayıp yerine tazele.
    final fresh = _generate();
    await _store.write(kDeviceIdKey, fresh);
    _cache = fresh;
    return fresh;
  }

  /// ⭐ `X-Client-Instance` — mobilde **bilerek `deviceId` ile aynı**. Gerekçe dosya başlığında.
  Future<String> instanceId() => deviceId();
}

/// ⚠️ **Sunucudaki `UUID_RE` ile BİREBİR aynı** (`abuse/device-context.ts:25`) — bilerek.
///
/// Sunucu sürüm/varyant hanelerine BAKMIYOR (`[0-9a-f]{4}` yazıyor, `[1-5]`/`[89ab]` değil).
/// Burada daha katı bir kalıp kullanmak, sunucunun kabul ettiği ve daha önce diske yazılmış
/// bir kimliği "bozuk" sayıp yeniden üretmemize yol açardı — yani tam da kaçındığımız şeye,
/// kimliğin değişmesine. Aynı kuralı iki yerde farklı yazmak bu projenin en sık ısırıldığı
/// hata sınıfı; kural gevşekse ikisi de gevşek kalır.
final RegExp _uuidRe = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

bool _isValidUuid(String s) => _uuidRe.hasMatch(s);
