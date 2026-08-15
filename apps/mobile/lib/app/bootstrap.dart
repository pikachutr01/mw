/// ÖNYÜKLEME — uygulama açılmadan önce yapılması gerekenler.
///
/// ⭐ Künye ve oturum BURADA, `runApp`tan önce hazırlanıyor. Alternatif (`FutureProvider`
/// zinciri) künyeye ihtiyaç duyan her sağlayıcıyı async yapardı ve ekranlar bir kare boyunca
/// "yükleniyor" gösterirdi — oysa ikisi de uygulama ömrü boyunca bir kez okunuyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/client_hints.dart';
import '../core/storage.dart';
import '../features/shell/session_conflict.dart';
import '../gen/tokens.dart';
import 'providers.dart';
import 'router.dart';

Future<void> baslat() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ⚠️ Künye toplanamazsa uygulama AÇILMALI: cihaz sinyali olmadan da oyun oynanır, ama
  // açılmayan uygulama hiçbir işe yaramaz. Boş künye sunucuda `COALESCE` ile öncekini silmiyor.
  IstemciKunyesi kunye;
  try {
    kunye = await IstemciKunyesi.topla();
  } catch (_) {
    kunye = const IstemciKunyesi(
      platform: 'android',
      osVersion: '',
      deviceModel: '',
      appVersion: '',
      timezone: '',
      locale: '',
    );
  }

  final kap = ProviderContainer(
    overrides: [kunyeProvider.overrideWithValue(kunye)],
  );

  // Diskteki oturumu belleğe al — açılışta giriş ekranı "parlamasın".
  final oturum = await kap.read(apiProvider).oturumuYukle();
  kap.read(oturumProvider.notifier).ayarla(oturum);

  runApp(UncontrolledProviderScope(container: kap, child: const MobilWarApp()));
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
      builder: (context, child) =>
          OturumCakismaPerdesi(child: child ?? const SizedBox.shrink()),
    );
  }
}

/// Testlerin ve araçların kullanabilmesi için: bellek deposuyla kap kurar.
ProviderContainer testKabi({IstemciKunyesi? kunye}) => ProviderContainer(
  overrides: [
    kunyeProvider.overrideWithValue(
      kunye ??
          const IstemciKunyesi(
            platform: 'android',
            osVersion: 'test',
            deviceModel: 'test',
            appVersion: '0.0.0+0',
            timezone: '+03',
            locale: 'tr_TR',
          ),
    ),
    depoProvider.overrideWithValue(BellekDepo()),
  ],
);
