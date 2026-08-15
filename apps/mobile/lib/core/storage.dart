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

abstract class KaliciDepo {
  Future<String?> oku(String anahtar);
  Future<void> yaz(String anahtar, String deger);
  Future<void> sil(String anahtar);
}

/// Üretimdeki depo. Android'de EncryptedSharedPreferences, iOS'ta Keychain.
class GuvenliDepo implements KaliciDepo {
  /// ⚠️ **`encryptedSharedPreferences: true` ARAMA — v11'de o bayrak YOK.** Eski sürümlerde
  /// gerekliydi (varsayılan düz SharedPreferences'a düşüyordu); 11.0.0'da varsayılan
  /// yapılandırma zaten AES-GCM + RSA-OAEP anahtar sarma, yani bayrak gereksizleştiği için
  /// kaldırıldı. İnternetteki çoğu örnek hâlâ eski API'yi gösteriyor ve derlenmiyor.
  GuvenliDepo([FlutterSecureStorage? depo])
    : _depo = depo ?? const FlutterSecureStorage();

  final FlutterSecureStorage _depo;

  @override
  Future<String?> oku(String anahtar) => _depo.read(key: anahtar);

  @override
  Future<void> yaz(String anahtar, String deger) =>
      _depo.write(key: anahtar, value: deger);

  @override
  Future<void> sil(String anahtar) => _depo.delete(key: anahtar);
}

/// Testler için bellek deposu. ⭐ Aynı örnek iki `CihazKimligi` arasında paylaşılarak
/// "uygulama yeniden açıldı" durumu birebir taklit edilir.
class BellekDepo implements KaliciDepo {
  BellekDepo([Map<String, String>? baslangic]) : _m = {...?baslangic};

  final Map<String, String> _m;

  /// Testin depoya doğrudan bakabilmesi için (iddia kurmak amacıyla).
  Map<String, String> get icerik => Map.unmodifiable(_m);

  @override
  Future<String?> oku(String anahtar) async => _m[anahtar];

  @override
  Future<void> yaz(String anahtar, String deger) async => _m[anahtar] = deger;

  @override
  Future<void> sil(String anahtar) async => _m.remove(anahtar);
}
