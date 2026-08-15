/// OYUN KABUĞU — alt sekme çubuğu + drawer.
///
/// Web'deki `Shell.tsx`in mobil karşılığı. Sekmeler web'in `TABS` dizisiyle, drawer ise
/// `MORE_ITEMS` ile aynı içerikte — iki istemcide farklı gezinme, aynı oyunu iki ayrı oyun
/// gibi gösterirdi.
///
/// ⭐⭐ **Rota yolları web ile AYNI** (`/armies`, `/city`, …) ve bu bilinçli: bildirim yükündeki
/// `url` alanı web rotaları taşıyor (`notify.catalog.ts` → `/armies`, `/messages?dm=`,
/// `/destek?t=`). Aynı yolları kullanmak, derin bağlantı için bir çeviri tablosuna olan
/// ihtiyacı tamamen ortadan kaldırıyor — o tablo yazılsaydı sunucu yeni bir rota eklediğinde
/// sessizce eksik kalırdı.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../ui/primitives.dart';

/// Alt sekmeler — web `Shell.tsx:81-87` ile aynı beşli, **aynı ikon dosyalarıyla**.
///
/// ⭐ `icon` alanı bir `IconData` değil, `assets/menu/<icon>.png` dosyasının adı. Material
/// ikonları yerine oyunun kendi görselleri kullanılıyor: iki istemcinin aynı oyunu göstermesi
/// «tam eşitlik» kararının görünen yüzü. Adlar web'deki `MENU`/`TABS` dizileriyle birebir.
const tabs = <({String path, String label, String icon})>[
  (path: '/armies', label: 'Ordular', icon: 'ordular'),
  (path: '/city', label: 'Şehir', icon: 'sehir'),
  (path: '/world', label: 'Dünya', icon: 'dunya'),
  (path: '/messages', label: 'Mesaj', icon: 'mesaj'),
  (path: '/command', label: 'Komuta', icon: 'komutamerkezi'),
];

/// Drawer maddeleri — web `MORE_ITEMS` (`Shell.tsx:99-108`) ile aynı dörtlü.
const drawerItems = <({String path, String label, String icon})>[
  (path: '/simulate', label: 'Simülatör', icon: 'simulator'),
  (path: '/options', label: 'Seçenekler', icon: 'secenekler'),
  (path: '/help', label: 'Yardım', icon: 'yardim'),
  (path: '/destek', label: 'Destek', icon: 'destek'),
];

class GameShell extends ConsumerWidget {
  const GameShell({super.key, required this.child, required this.path});

  final Widget child;
  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final index = tabs.indexWhere((t) => path.startsWith(t.path));

    return Scaffold(
      appBar: AppBar(
        title: Text(_title(path)),
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Theme.of(context).colorScheme.onPrimary,
      ),
      drawer: _Drawer(username: session?.username ?? ''),
      body: child,
      bottomNavigationBar: NavigationBar(
        // ⚠️ `-1` (eşleşme yok) NavigationBar'ı patlatıyor → 0'a kelepçeleniyor.
        selectedIndex: index < 0 ? 0 : index,
        onDestinationSelected: (i) => context.go(tabs[i].path),
        destinations: [
          for (final t in tabs)
            NavigationDestination(
              icon: MwIcon(folder: 'menu', id: t.icon, size: 26),
              label: t.label,
            ),
        ],
      ),
    );
  }
}

/// Web'deki `PAGE_TITLE` (`Shell.tsx:116-131`) ile aynı eşleme.
/// ⚠️ SIRA ÖNEMLİ: uzun yollar önce, yoksa `/command` alt sayfalarını yutar.
String _title(String path) {
  const table = <(String, String)>[
    ('/command/rankings', 'Sıralamalar'),
    ('/command/alliance', 'İttifak'),
    ('/command/search', 'Arama'),
    ('/command', 'Genel Durum'),
    ('/armies', 'Ordular'),
    ('/city', 'Şehir'),
    ('/world', 'Dünya'),
    ('/messages', 'Mesajlar'),
    ('/simulate', 'Simülatör'),
    ('/options', 'Seçenekler'),
    ('/help', 'Yardım'),
    ('/destek', 'Destek'),
  ];
  for (final (prefix, name) in table) {
    if (path.startsWith(prefix)) return name;
  }
  return 'MobilWar';
}

class _Drawer extends ConsumerWidget {
  const _Drawer({required this.username});

  final String username;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    return Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              color: c.panelHeader,
              padding: const EdgeInsets.all(16),
              child: Text(
                username.isEmpty ? 'MobilWar' : username,
                style: TextStyle(
                  color: c.onPanelHeader,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            for (final d in drawerItems)
              ListTile(
                // ⚠️ 20 px — web'in «Daha» listesiyle aynı (`Shell.tsx:788`). Alt sekme
                // çubuğunda 26 kullanılıyor (`:708`); ikisi bilerek farklı.
                leading: MwIcon(folder: 'menu', id: d.icon, size: 20),
                title: Text(d.label),
                onTap: () {
                  Navigator.of(context).pop();
                  context.go(d.path);
                },
              ),
            const Spacer(),
            const Divider(height: 1),
            ListTile(
              // Web'de de aynı dosya: `menu/cikis.png` (`Shell.tsx:798`, 20 px).
              leading: const MwIcon(folder: 'menu', id: 'cikis', size: 20),
              title: Text('Oyunu kapat', style: TextStyle(color: c.danger)),
              onTap: () async {
                Navigator.of(context).pop();
                await ref.read(authProvider).logout();
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Faz 2'de gerçek ekranlarla değişecek yer tutucu.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen(this.name, {super.key});

  final String name;

  @override
  Widget build(BuildContext context) => MwEmpty('$name — Faz 2\'de gelecek.');
}
