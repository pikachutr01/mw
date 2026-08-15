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
/// ⭐ `ikon` alanı bir `IconData` değil, `assets/menu/<ikon>.png` dosyasının adı. Material
/// ikonları yerine oyunun kendi görselleri kullanılıyor: iki istemcinin aynı oyunu göstermesi
/// «tam eşitlik» kararının görünen yüzü. Adlar web'deki `MENU`/`TABS` dizileriyle birebir.
const sekmeler = <({String yol, String etiket, String ikon})>[
  (yol: '/armies', etiket: 'Ordular', ikon: 'ordular'),
  (yol: '/city', etiket: 'Şehir', ikon: 'sehir'),
  (yol: '/world', etiket: 'Dünya', ikon: 'dunya'),
  (yol: '/messages', etiket: 'Mesaj', ikon: 'mesaj'),
  (yol: '/command', etiket: 'Komuta', ikon: 'komutamerkezi'),
];

/// Drawer maddeleri — web `MORE_ITEMS` (`Shell.tsx:99-108`) ile aynı dörtlü.
const drawerMaddeleri = <({String yol, String etiket, String ikon})>[
  (yol: '/simulate', etiket: 'Simülatör', ikon: 'simulator'),
  (yol: '/options', etiket: 'Seçenekler', ikon: 'secenekler'),
  (yol: '/help', etiket: 'Yardım', ikon: 'yardim'),
  (yol: '/destek', etiket: 'Destek', ikon: 'destek'),
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
            NavigationDestination(
              icon: MwIkon(klasor: 'menu', id: s.ikon, boyut: 26),
              label: s.etiket,
            ),
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
                // ⚠️ 20 px — web'in «Daha» listesiyle aynı (`Shell.tsx:788`). Alt sekme
                // çubuğunda 26 kullanılıyor (`:708`); ikisi bilerek farklı.
                leading: MwIkon(klasor: 'menu', id: m.ikon, boyut: 20),
                title: Text(m.etiket),
                onTap: () {
                  Navigator.of(context).pop();
                  context.go(m.yol);
                },
              ),
            const Spacer(),
            const Divider(height: 1),
            ListTile(
              // Web'de de aynı dosya: `menu/cikis.png` (`Shell.tsx:798`, 20 px).
              leading: const MwIkon(klasor: 'menu', id: 'cikis', boyut: 20),
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
