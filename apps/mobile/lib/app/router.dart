/// YÖNLENDİRME — go_router.
///
/// ⭐ Oturum kapısı TEK yerde: `redirect` → `authRedirect` (`routing_rules.dart`). Ekranların
/// içinde `context.go` ile yönlendirme yapılsaydı (giriş başarılı → git) kural iki yere
/// dağılırdı ve biri unutulduğunda oyuncu giriş ekranında asılı kalırdı.
///
/// ⚠️ Karar bu dosyada DEĞİL, saf bir fonksiyonda — gerekçesi orada yazılı (döngü taraması
/// ancak öyle test edilebiliyor). Buradaki iş yalnız "kararı uygula".
///
/// ⭐⭐ Yollar web ile AYNI — bildirim yükündeki `url` doğrudan bu yollara denk geliyor
/// (`shell.dart` başlığındaki gerekçe).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/armies/armies_screen.dart';
import '../features/auth/auth_screen.dart';
import '../features/city/academy_screen.dart';
import '../features/city/trainable_screen.dart';
import '../features/city/buildings_screen.dart';
import '../features/city/city_hub_screen.dart';
import '../features/command/command_screen.dart';
import '../features/guest/landing_screen.dart';
import '../features/messages/messages_screen.dart';
import '../features/temple/temple_screen.dart';
import '../features/options/options_screen.dart';
import '../features/world/world_screen.dart';
import '../core/city_screens.dart';
import '../core/world_coords.dart';
import '../features/shell/shell.dart';
import 'providers.dart';
import 'routing_rules.dart';

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
    // ⚠️ Misafir buraya düşemez; `authRedirect` onu ana sayfaya alır (testle kilitli).
    initialLocation: kHomePath,
    refreshListenable: listener,
    redirect: (context, state) => authRedirect(
      location: state.matchedLocation,
      signedIn: ref.read(sessionProvider) != null,
    ),
    routes: [
      // ⚠️ Giriş ekranı kabuğun DIŞINDA: üst bardaki «Giriş yap» düğmesi giriş ekranının
      // kendisinde anlamsız olurdu.
      GoRoute(path: kAuthPath, builder: (_, _) => const AuthScreen()),
      ShellRoute(
        builder: (context, state, child) =>
            GameShell(path: state.matchedLocation, child: child),
        routes: [
          GoRoute(path: kLandingPath, builder: (_, _) => const LandingScreen()),
          // ⭐ Gerçek ekranlar listeden AYRI yazılıyor ki hangisinin yer tutucu olmadığı
          // tek bakışta görünsün.
          // ⚠️ Ordular **açılış rotası** (`kHomePath`): aşağıdaki `tabs` döngüsü onu yer
          // tutucuya bağlamasın diye orada ayrıca eleniyor.
          GoRoute(path: '/armies', builder: (_, _) => const ArmiesScreen()),
          GoRoute(path: '/city', builder: (_, _) => const CityHubScreen()),
          GoRoute(path: '/world', builder: (_, _) => const WorldScreen()),
          // ⭐⭐ DERİN BAĞLANTI `/world/:k/:d` — web'le AYNI yol. Casusluk raporundaki
          // «Dünyada göster» bağlantısı ve bildirim yükü bu adresi taşıyor; rota olmasaydı
          // oyuncu «Bilinmeyen sayfa» hatasına düşerdi.
          // ⚠️ Kelepçeleme `realmFromPath`te ve saf: bozuk bir adres reddedilmiyor, en yakın
          // geçerli diyara kırpılıyor (gerekçe orada).
          GoRoute(
            path: '/world/:k/:d',
            builder: (_, s) => WorldScreen(
              fromUrl: realmFromPath(
                s.pathParameters['k'],
                s.pathParameters['d'],
              ),
              /* ⭐ `?s=` — vurgulanacak slot (2026-08-19). Yola ÜÇÜNCÜ segment eklenmedi:
                 eski bağlantıları kırardı ve slot adresin kimliği değil bir **ipucu**;
                 diyarı açan şey `k:d`, `s` yalnız "hangisine bak" diyor. Web'de de aynı
                 biçim (`World.tsx` · `useSearchParams`). */
              highlight: int.tryParse(s.uri.queryParameters['s'] ?? ''),

              /* ⭐⭐ `?m=` — rapordan gelen SEFER TÜRÜ (2026-08-21). Rapor sefer formunu
                 kendi açmıyor, buraya yönlendiriyor ve bu bilinçli: rapor tarihsel bir
                 kayıt, koordinatın sahibi o günden beri değişmiş olabilir. Buraya gelince
                 hedef künyesi TAZE listeden çözülüyor. `?s=` ile aynı biçim ve web'le aynı
                 adres (`Messages.tsx` · `toMission`). */
              missionType: s.uri.queryParameters['m'],
            ),
          ),
          GoRoute(path: '/barracks', builder: (_, _) => const BarracksScreen()),
          GoRoute(
            path: '/buildings',
            builder: (_, _) => const BuildingsScreen(),
          ),
          GoRoute(path: '/academy', builder: (_, _) => const AcademyScreen()),
          GoRoute(path: '/defense', builder: (_, _) => const DefenseScreen()),
          GoRoute(path: '/temple', builder: (_, _) => const TempleScreen()),
          GoRoute(path: '/messages', builder: (_, _) => const MessagesScreen()),
          GoRoute(path: '/command', builder: (_, _) => const CommandScreen()),
          // ⚠️ Kalan şehir ekranları yer tutucu ama ROTASI VAR: olmasaydı sekme şeridine
          // dokunmak «Bilinmeyen sayfa» hatasına düşerdi.
          for (final s in kCityScreens.where(
            (s) =>
                s.path != '/barracks' &&
                s.path != '/buildings' &&
                s.path != '/academy' &&
                s.path != '/defense' &&
                s.path != '/temple',
          ))
            GoRoute(
              path: s.path,
              builder: (_, _) => PlaceholderScreen(s.label),
            ),
          for (final t in tabs.where(
            (t) =>
                t.path != '/city' &&
                t.path != '/armies' &&
                t.path != '/world' &&
                t.path != '/messages' &&
                t.path != '/command',
          ))
            GoRoute(
              path: t.path,
              builder: (_, _) => PlaceholderScreen(t.label),
            ),
          // ⭐ Seçenekler artık gerçek ekran (2026-08-20) — listeden ayrı yazılıyor ki
          //    hangisinin yer tutucu OLMADIĞI tek bakışta görünsün.
          GoRoute(path: '/options', builder: (_, _) => const OptionsScreen()),
          for (final d in drawerItems.where((d) => d.path != '/options'))
            GoRoute(
              path: d.path,
              builder: (_, _) => PlaceholderScreen(d.label),
            ),
          // Web'de `/help/sefer` ayrı bir ekran; mobilde Faz 6'ya kadar yer tutucu.
          GoRoute(
            path: '/help/sefer',
            builder: (_, _) => const PlaceholderScreen('Sefer yardımı'),
          ),
        ],
      ),
    ],
    errorBuilder: (_, state) =>
        Scaffold(body: Center(child: Text('Bilinmeyen sayfa: ${state.uri}'))),
  );
});
