// ⭐ FAZ 0 SPIKE — socket_io_client (Dart) ↔ socket.io 4.8.3 (sunucu) protokol uyumu.
//
// Neden: sunucu ham WebSocket DEĞİL socket.io kullanıyor (`realtime.gateway.ts`, path '/ws').
// Dart istemcisinin sürüm tablosu v2~v4 diyor ama bunu VARSAYMAK yerine ölçüyoruz —
// yanlışsa gerçek zamanlı katmanın tamamı yeniden tasarlanır ve bunu Faz 2'de öğrenmek pahalı.
//
// Yöntem: BİLE BİLE geçersiz jetonla bağlan. Sunucu el sıkışmada üç şey doğruluyor
// (JWT imzası → oturum satırı → tek cihaz sahipliği) ve ilkinde 'unauthorized' atıyor.
//   • 'unauthorized' geldiyse  → Engine.IO el sıkışması TAMAMLANMIŞ, paketler çözülmüş,
//                                sunucunun UYGULAMA katmanı cevap vermiş. Uyum KANITLI.
//   • parse/transport hatası   → protokol uyuşmazlığı. Uyum YOK.
//
// Koşum: cd apps/mobile && dart run tool/ws_spike.dart [url]
//
// ⚠️ `avoid_print` muafiyeti bilinçli: bu bir komut satırı aracı, uygulama kodu değil —
// çıktısı zaten terminale yazmak için var. Muafiyet DOSYA düzeyinde ve yalnız `tool/` altında.
// ignore_for_file: avoid_print
import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;

Future<void> main(List<String> args) async {
  final url = args.isNotEmpty ? args.first : 'https://mobilwar.com';
  print('→ hedef: $url  (path: /ws)');

  final done = Completer<String>();
  final socket = io.io(url, <String, dynamic>{
    'path': '/ws',
    'transports': ['websocket'],
    'autoConnect': false,
    'reconnection': false,
    // Sunucunun el sıkışmada okuduğu yük (`realtime.gateway.ts:109-163`).
    'auth': {'token': 'gecersiz-jeton-spike', 'instanceId': 'spike-instance'},
  });

  socket.onConnect(
    (_) => done.complete('BAĞLANDI (beklenmiyordu — jeton geçersizdi)'),
  );
  socket.onConnectError((e) => done.complete('connect_error: $e'));
  socket.onError((e) => done.complete('error: $e'));

  socket.connect();

  final result = await done.future.timeout(
    const Duration(seconds: 20),
    onTimeout: () => 'ZAMAN AŞIMI — cevap yok',
  );
  socket.dispose();

  print('← sonuç: $result');
  final ok = result.contains('unauthorized');
  print(
    ok
        ? '✅ UYUM KANITLI — el sıkışma tamamlandı, sunucunun uygulama katmanı cevap verdi.'
        : '⚠️ İNCELE — beklenen "unauthorized" değil. Protokol uyuşmazlığı olabilir.',
  );
}
