/// GERÇEK TAŞIMA — `Sender` dikişinin dio ile uygulanışı.
///
/// ⚠️ Buraya **iş mantığı yazılmaz**: yenileme, oturum düşürme, 409 ve tekrar kararlarının
/// hepsi `api_client.dart`'ta ve testleri cihazsız koşuyor. Bu dosya yalnız "baytları taşı"
/// işini yapıyor; interceptor koymak o mantığı ikiye bölerdi.
library;

import 'package:dio/dio.dart';

import 'api_client.dart';

/// API kökü.
///
/// ⭐ Geliştirmede varsayılan `http://127.0.0.1:3002` — telefon `adb reverse tcp:3002 tcp:3002`
/// ile PC'deki API'ye bağlanıyor (`MOBIL_MIMARI.md` §6). Canlı yapıda derleme anında verilir:
///
///     flutter build apk --release --dart-define=MW_API=https://mobilwar.com
///
/// ⚠️ `--dart-define` derleme zamanı sabitidir; çalışma anında değiştirilemez. Bilerek: API
/// kökünü çalışma anında oynatılabilir yapmak, kötü niyetli bir yapılandırmayla oyuncunun
/// jetonlarını başka bir sunucuya yollatmanın en kolay yolu olurdu.
const String kApiRoot = String.fromEnvironment(
  'MW_API',
  defaultValue: 'http://127.0.0.1:3002',
);

/// dio tabanlı gönderici üretir.
Sender dioSender({String root = kApiRoot, Dio? dio}) {
  final d =
      dio ??
      Dio(
        BaseOptions(
          baseUrl: root,
          // ⚠️ `validateStatus: hepsi geçerli` — dio varsayılanı 4xx/5xx'te FIRLATIYOR.
          // Durum kodlarının kararı `MwApi`de veriliyor (401 yenile, 503 tekrarla, 409 çakışma);
          // burada istisnaya çevirmek o mantığı try/catch'e gömerdi.
          validateStatus: (_) => true,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
          responseType: ResponseType.json,
        ),
      );

  return (RawRequest request) async {
    final response = await d.request<dynamic>(
      request.path,
      data: request.body,
      options: Options(method: request.method, headers: request.headers),
    );
    return RawResponse(response.statusCode ?? 0, response.data);
  };
}
