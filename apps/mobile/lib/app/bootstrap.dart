/// ÖNYÜKLEME — uygulama açılmadan önce yapılması gerekenler.
///
/// ⭐ Künye ve oturum BURADA, `runApp`tan önce hazırlanıyor. Alternatif (`FutureProvider`
/// zinciri) künyeye ihtiyaç duyan her sağlayıcıyı async yapardı ve ekranlar bir kare boyunca
/// "yükleniyor" gösterirdi — oysa ikisi de uygulama ömrü boyunca bir kez okunuyor.
library;

import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../core/client_hints.dart';
import '../core/storage.dart';
import '../features/shell/session_conflict.dart';
import '../features/shell/update_gate.dart';
import '../gen/tokens.dart';
import 'providers.dart';
import 'router.dart';

Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ⭐ SADECE GELİŞTİRMEDE ekranı açık tut. Cihazda elle deneme yaparken ekranın kendiliğinden
  // kapanması hem akışı kesiyor hem de kilit ekranı yüzünden `adb exec-out screencap` ile
  // görsel doğrulamayı imkânsız kılıyordu.
  // ⛔ `kDebugMode` şartı KALKMAMALI: üretimde ekranı zorla açık tutmak pili tüketir ve
  // oyuncunun beklemediği bir davranıştır. Bir oyunun ekranı açık tutması ancak oyuncu
  // isterse (ileride bir tercih olarak) meşru olur.
  if (kDebugMode) {
    try {
      await WakelockPlus.enable();
    } catch (_) {
      // Desteklenmeyen platform/cihaz uygulamayı açılmaktan alıkoymamalı.
    }
  }

  // ⚠️ Künye toplanamazsa uygulama AÇILMALI: cihaz sinyali olmadan da oyun oynanır, ama
  // açılmayan uygulama hiçbir işe yaramaz. Boş künye sunucuda `COALESCE` ile öncekini silmiyor.
  ClientHints hints;
  try {
    hints = await ClientHints.collect();
  } catch (_) {
    hints = const ClientHints(
      platform: 'android',
      osVersion: '',
      deviceModel: '',
      appVersion: '',
      timezone: '',
      locale: '',
    );
  }

  final container = ProviderContainer(
    overrides: [clientHintsProvider.overrideWithValue(hints)],
  );

  // Diskteki oturumu belleğe al — açılışta giriş ekranı "parlamasın".
  final session = await container.read(apiProvider).loadSession();
  container.read(sessionProvider.notifier).update(session);

  runApp(
    UncontrolledProviderScope(container: container, child: const MobilWarApp()),
  );
}

class MobilWarApp extends ConsumerWidget {
  const MobilWarApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'MobilWar',
      debugShowCheckedModeBanner: false,
      theme: MwTheme.light(),
      darkTheme: MwTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: ref.watch(routerProvider),
      // ⚠️ Çakışma perdesi ROTA DEĞİL bindirme: kapanamaz olmalı ve altındaki ekran
      // yerinde durmalı (oyuncu devralınca kaldığı yerden devam etsin).
      // ⚠️ SIRA ÖNEMLİ: sürüm kapısı EN DIŞTA. Sürümü geçersiz bir uygulamanın oturum
      // çakışması perdesini göstermesinin anlamı yok — ilk soru "bu uygulama çalışabilir mi".
      builder: (context, child) => UpdateGate(
        child: SessionConflictGate(child: child ?? const SizedBox.shrink()),
      ),
    );
  }
}

/// Testlerin ve araçların kullanabilmesi için: bellek deposuyla kap kurar.
ProviderContainer testContainer({ClientHints? hints}) => ProviderContainer(
  overrides: [
    clientHintsProvider.overrideWithValue(
      hints ??
          const ClientHints(
            platform: 'android',
            osVersion: 'test',
            deviceModel: 'test',
            appVersion: '0.0.0+0',
            timezone: '+03',
            locale: 'tr_TR',
          ),
    ),
    storeProvider.overrideWithValue(MemoryStore()),
  ],
);
