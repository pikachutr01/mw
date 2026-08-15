/// Kalıcı depo — **dikiş (seam)**, mock değil.
///
/// ⭐ Neden arayüz: cihaz kimliğinin doğru çalıştığını sınamanın tek yolu *"uygulama kapandı,
/// yeniden açıldı"*ı taklit etmek — yani AYNI deponun üstünde YENİ bir nesne kurmak. Gerçek
/// `flutter_secure_storage` testte platform kanalı istiyor ve `flutter test` başsız koşuyor.
///
/// ⚠️ Bu bir mock DEĞİL: beklenti/`verify` yok, gerçek okuma-yazma var. Depo mock sevmiyor
/// (API testleri gerçek Postgres kullanıyor); burada da taklit edilen şey davranış değil
/// yalnız **taşıyıcı**.
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class Store {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// Üretimdeki depo. Android'de EncryptedSharedPreferences, iOS'ta Keychain.
class SecureStore implements Store {
  /// ⚠️ **`encryptedSharedPreferences: true` ARAMA — v11'de o bayrak YOK.** Eski sürümlerde
  /// gerekliydi (varsayılan düz SharedPreferences'a düşüyordu); 11.0.0'da varsayılan
  /// yapılandırma zaten AES-GCM + RSA-OAEP anahtar sarma, yani bayrak gereksizleştiği için
  /// kaldırıldı. İnternetteki çoğu örnek hâlâ eski API'yi gösteriyor ve derlenmiyor.
  SecureStore([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// Testler için bellek deposu. ⭐ Aynı örnek iki `DeviceIdentity` arasında paylaşılarak
/// "uygulama yeniden açıldı" durumu birebir taklit edilir.
class MemoryStore implements Store {
  MemoryStore([Map<String, String>? initial]) : _m = {...?initial};

  final Map<String, String> _m;

  /// Testin depoya doğrudan bakabilmesi için (iddia kurmak amacıyla).
  Map<String, String> get contents => Map.unmodifiable(_m);

  @override
  Future<String?> read(String key) async => _m[key];

  @override
  Future<void> write(String key, String value) async => _m[key] = value;

  @override
  Future<void> delete(String key) async => _m.remove(key);
}
