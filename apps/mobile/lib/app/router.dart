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

const String kGirisYolu = '/giris';

/// Oturum değişince yönlendiriciyi uyandıran köprü.
/// ⚠️ `Listenable` gerekiyor çünkü go_router Riverpod bilmiyor; sağlayıcıyı dinleyip
/// `notifyListeners` çağıran ince bir katman.
class _OturumDinleyici extends ChangeNotifier {
  _OturumDinleyici(Ref ref) {
    ref.listen(oturumProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final dinleyici = _OturumDinleyici(ref);
  ref.onDispose(dinleyici.dispose);

  return GoRouter(
    initialLocation: '/armies',
    refreshListenable: dinleyici,
    redirect: (context, state) {
      final girisli = ref.read(oturumProvider) != null;
      final girisEkraninda = state.matchedLocation == kGirisYolu;

      if (!girisli) return girisEkraninda ? null : kGirisYolu;
      // Girişliyken giriş ekranında durmanın anlamı yok → oyuna al.
      return girisEkraninda ? '/armies' : null;
    },
    routes: [
      GoRoute(path: kGirisYolu, builder: (_, _) => const AuthScreen()),
      ShellRoute(
        builder: (context, state, child) =>
            OyunKabugu(yol: state.matchedLocation, child: child),
        routes: [
          for (final s in sekmeler)
            GoRoute(path: s.yol, builder: (_, _) => YerTutucuEkran(s.etiket)),
          for (final m in drawerMaddeleri)
            GoRoute(path: m.yol, builder: (_, _) => YerTutucuEkran(m.etiket)),
        ],
      ),
    ],
    errorBuilder: (_, state) =>
        Scaffold(body: Center(child: Text('Bilinmeyen sayfa: ${state.uri}'))),
  );
});
