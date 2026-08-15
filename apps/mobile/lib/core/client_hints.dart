/// İSTEMCİ KÜNYESİ — sunucunun her istekte okuduğu cihaz başlıkları.
///
/// Sunucu tarafı: `apps/api/src/abuse/device-context.ts` · `extractDeviceContext`.
/// Toplanan künye `sessions` ve `player_devices` tablolarına yazılıyor ve çoklu hesap
/// analizinin (§9.1) ham verisi bu.
///
/// ⚠️ Künye **yalnız giriş/kayıt/yenileme** anında yazılıyor (`auth.service.ts` → `issueSession`),
/// oyun içi isteklerde değil. Bu yüzden **`refresh` çağrısında da tam künye gönderilmeli** —
/// aylarca açık kalan bir oturumun künyesi başka türlü hiç tazelenmez.
///
/// ⚠️ Sunucu alanları `COALESCE` ile yazıyor: boş gönderilen alan öncekini SİLMİYOR. Yine de
/// eksik göndermek künyeyi bayatlatır.
library;

import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// ⚠️ Uzunluk sınırları sunucudaki `trim(...)` çağrılarıyla **birebir aynı**
/// (`device-context.ts:58-63`). Sunucu zaten kırpıyor; burada da kırpmak her isteğe binen
/// başlığı gereksiz şişirmemek için — iki taraf da aynı sayıyı bilsin diye açıkça yazılı.
const int kOsVersionMax = 60;
const int kDeviceModelMax = 100;
const int kAppVersionMax = 40;
const int kTimezoneMax = 60;
const int kLocaleMax = 20;

class IstemciKunyesi {
  const IstemciKunyesi({
    required this.platform,
    required this.osVersion,
    required this.deviceModel,
    required this.appVersion,
    required this.timezone,
    required this.locale,
  });

  /// `android` · `ios` — sunucu `web|android|ios` bekliyor.
  final String platform;
  final String osVersion;
  final String deviceModel;
  final String appVersion;
  final String timezone;
  final String locale;

  /// Cihazdan gerçek künyeyi toplar. ⚠️ Platform kanalı gerektirir → `flutter test` içinde
  /// ÇAĞRILMAZ; testler `IstemciKunyesi(...)` ile doğrudan kurulur (dikiş burada).
  static Future<IstemciKunyesi> topla({
    DeviceInfoPlugin? cihaz,
    PackageInfo? paket,
    String? saatDilimi,
    String? yerel,
  }) async {
    final d = cihaz ?? DeviceInfoPlugin();
    final p = paket ?? await PackageInfo.fromPlatform();

    var platform = 'android';
    var osVersion = '';
    var model = '';

    if (Platform.isAndroid) {
      final a = await d.androidInfo;
      osVersion = 'Android ${a.version.release} (SDK ${a.version.sdkInt})';
      model = '${a.manufacturer} ${a.model}';
    } else if (Platform.isIOS) {
      platform = 'ios';
      final i = await d.iosInfo;
      osVersion = '${i.systemName} ${i.systemVersion}';
      model = i.utsname.machine;
    }

    return IstemciKunyesi(
      platform: platform,
      osVersion: _kirp(osVersion, kOsVersionMax),
      deviceModel: _kirp(model, kDeviceModelMax),
      // ⚠️ `version+buildNumber`: mağaza sürümü ile derleme numarası birlikte olmadan
      // "hangi yapı" sorusu cevaplanamıyor (aynı sürümden birden çok yapı çıkabiliyor).
      appVersion: _kirp('${p.version}+${p.buildNumber}', kAppVersionMax),
      timezone: _kirp(saatDilimi ?? DateTime.now().timeZoneName, kTimezoneMax),
      locale: _kirp(yerel ?? Platform.localeName, kLocaleMax),
    );
  }

  /// Her isteğe binen başlıklar. ⚠️ `Authorization` ve cihaz kimliği BURADA DEĞİL — onlar
  /// oturuma/kuruluma ait, künyeye değil (`http_client.dart` birleştiriyor).
  Map<String, String> basliklar() => {
    'x-platform': platform,
    if (osVersion.isNotEmpty) 'x-os-version': osVersion,
    if (deviceModel.isNotEmpty) 'x-device-model': deviceModel,
    if (appVersion.isNotEmpty) 'x-app-version': appVersion,
    if (timezone.isNotEmpty) 'x-timezone': timezone,
    if (locale.isNotEmpty) 'x-locale': locale,
  };
}

String _kirp(String s, int max) => s.length <= max ? s : s.substring(0, max);
