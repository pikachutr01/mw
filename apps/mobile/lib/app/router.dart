/// YÖNLENDİRME — go_router.
///
/// ⭐ Oturum kapısı TEK yerde: `redirect`. Ekranların içinde `context.go` ile yönlendirme
/// yapılsaydı (giriş başarılı → git) kural iki yere dağılırdı ve biri unutulduğunda oyuncu
/// giriş ekranında asılı kalırdı.
///
/// ⭐⭐ Yollar web ile AYNI — bildirim yükündeki `url` doğrudan bu yollara denk geliyor
/// (`shell.dart` başlığındaki gerekçe).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_screen.dart';
import '../features/shell/shell.dart';
import 'providers.dart';

/// ⚠️ Web'de karşılığı YOK: orada giriş bir modal (`AuthModal`), ayrı bir rota değil. Bu yüzden
/// «yollar web ile aynı» kuralının dışında kalıyor ve hiçbir bildirim yükü buraya işaret etmiyor.
const String kAuthPath = '/auth';

/// Oturum değişince yönlendiriciyi uyandıran köprü.
/// ⚠️ `Listenable` gerekiyor çünkü go_router Riverpod bilmiyor; sağlayıcıyı dinleyip
/// `notifyListeners` çağıran ince bir katman.
class _SessionListener extends ChangeNotifier {
  _SessionListener(Ref ref) {
    ref.listen(sessionProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final listener = _SessionListener(ref);
  ref.onDispose(listener.dispose);

  return GoRouter(
    initialLocation: '/armies',
    refreshListenable: listener,
    redirect: (context, state) {
      final signedIn = ref.read(sessionProvider) != null;
      final onAuthScreen = state.matchedLocation == kAuthPath;

      if (!signedIn) return onAuthScreen ? null : kAuthPath;
      // Girişliyken giriş ekranında durmanın anlamı yok → oyuna al.
      return onAuthScreen ? '/armies' : null;
    },
    routes: [
      GoRoute(path: kAuthPath, builder: (_, _) => const AuthScreen()),
      ShellRoute(
        builder: (context, state, child) =>
            GameShell(path: state.matchedLocation, child: child),
        routes: [
          for (final t in tabs)
            GoRoute(
              path: t.path,
              builder: (_, _) => PlaceholderScreen(t.label),
            ),
          for (final d in drawerItems)
            GoRoute(
              path: d.path,
              builder: (_, _) => PlaceholderScreen(d.label),
            ),
        ],
      ),
    ],
    errorBuilder: (_, state) =>
        Scaffold(body: Center(child: Text('Bilinmeyen sayfa: ${state.uri}'))),
  );
});
