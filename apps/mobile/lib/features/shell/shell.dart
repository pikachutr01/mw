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

/// Alt sekmeler — web `Shell.tsx:81-87` ile aynı beşli.
const sekmeler = <({String yol, String etiket, IconData ikon})>[
  (yol: '/armies', etiket: 'Ordular', ikon: Icons.groups),
  (yol: '/city', etiket: 'Şehir', ikon: Icons.castle),
  (yol: '/world', etiket: 'Dünya', ikon: Icons.public),
  (yol: '/messages', etiket: 'Mesaj', ikon: Icons.mail),
  (yol: '/command', etiket: 'Komuta', ikon: Icons.flag),
];

/// Drawer maddeleri — web `MORE_ITEMS` (`Shell.tsx:99-108`) ile aynı dörtlü.
const drawerMaddeleri = <({String yol, String etiket, IconData ikon})>[
  (yol: '/simulate', etiket: 'Simülatör', ikon: Icons.calculate),
  (yol: '/options', etiket: 'Seçenekler', ikon: Icons.settings),
  (yol: '/help', etiket: 'Yardım', ikon: Icons.help_outline),
  (yol: '/destek', etiket: 'Destek', ikon: Icons.support_agent),
];

class OyunKabugu extends ConsumerWidget {
  const OyunKabugu({super.key, required this.child, required this.yol});

  final Widget child;
  final String yol;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final oturum = ref.watch(oturumProvider);
    final secili = sekmeler.indexWhere((s) => yol.startsWith(s.yol));

    return Scaffold(
      appBar: AppBar(
        title: Text(_baslik(yol)),
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Theme.of(context).colorScheme.onPrimary,
      ),
      drawer: _Drawer(kullanici: oturum?.username ?? ''),
      body: child,
      bottomNavigationBar: NavigationBar(
        // ⚠️ `-1` (eşleşme yok) NavigationBar'ı patlatıyor → 0'a kelepçeleniyor.
        selectedIndex: secili < 0 ? 0 : secili,
        onDestinationSelected: (i) => context.go(sekmeler[i].yol),
        destinations: [
          for (final s in sekmeler)
            NavigationDestination(icon: Icon(s.ikon), label: s.etiket),
        ],
      ),
    );
  }
}

/// Web'deki `PAGE_TITLE` (`Shell.tsx:116-131`) ile aynı eşleme.
/// ⚠️ SIRA ÖNEMLİ: uzun yollar önce, yoksa `/command` alt sayfalarını yutar.
String _baslik(String yol) {
  const tablo = <(String, String)>[
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
  for (final (onek, ad) in tablo) {
    if (yol.startsWith(onek)) return ad;
  }
  return 'MobilWar';
}

class _Drawer extends ConsumerWidget {
  const _Drawer({required this.kullanici});

  final String kullanici;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = MwRenk.of(context);
    return Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              color: r.panelHeader,
              padding: const EdgeInsets.all(16),
              child: Text(
                kullanici.isEmpty ? 'MobilWar' : kullanici,
                style: TextStyle(
                  color: r.onPanelHeader,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            for (final m in drawerMaddeleri)
              ListTile(
                leading: Icon(m.ikon),
                title: Text(m.etiket),
                onTap: () {
                  Navigator.of(context).pop();
                  context.go(m.yol);
                },
              ),
            const Spacer(),
            const Divider(height: 1),
            ListTile(
              leading: Icon(Icons.logout, color: r.danger),
              title: Text('Oyunu kapat', style: TextStyle(color: r.danger)),
              onTap: () async {
                Navigator.of(context).pop();
                await ref.read(kimlikDogrulamaProvider).cikisYap();
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Faz 2'de gerçek ekranlarla değişecek yer tutucu.
class YerTutucuEkran extends StatelessWidget {
  const YerTutucuEkran(this.ad, {super.key});

  final String ad;

  @override
  Widget build(BuildContext context) => MwBos('$ad — Faz 2\'de gelecek.');
}
