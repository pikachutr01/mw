/// OYUN KABUĞU — bilgi çubuğu · şehir şeridi · şehir sekmeleri · içerik · alt gezinti.
///
/// Web'deki `Shell.tsx`in **mobil** düzeniyle aynı dizilim (orada: bilgi çubuğu → şehir şeridi
/// → içerik + alt bar). Kullanıcı kararı: *"mobil web ile mobil uygulama görünümü birbirine
/// yakın kalmalı"*.
///
/// ⛔⛔ **ÜST BAR (AppBar) YOK ve geri gelmemeli.** Bir ara sayfa adı + hamburger taşıyan bir
/// AppBar vardı; kaldırıldı çünkü telefonda dikey alan en kıt kaynak ve o satırın taşıdığı iki
/// bilgi de zaten başka yerde duruyor:
///   • sayfa adı  → alt bardaki sekme yanıyor, şehir ekranlarında ayrıca sekme şeridi var
///   • hamburger  → alt barın altıncı maddesi «Daha» (`more_sheet.dart`)
/// Yerine geçen bilgi çubuğu **her ekranda** altın/yemek/koordinat/bağlantı gösteriyor; yani
/// aynı yükseklik boş bir başlık yerine gerçekten kullanılan veriye gidiyor.
///
/// ⚠️⚠️ **SafeArea yalnız ÜSTTE ve YANLARDA, altta DEĞİL.** Alt gezinti çubuğunun kendisi
/// `SafeArea` sarmalıyor: `bottom: true` en dışta verilseydi çubuğun ALTINDA boş bir şerit
/// kalır ve çubuk ekranın dibine oturmazdı. Üstte ise şart — bilgi çubuğu durum çubuğunun
/// altına kayarsa saat ve pil ikonları rakamların üstüne biner.
///
/// ⭐⭐ **Rota yolları web ile AYNI** (`/armies`, `/city`, …) ve bu bilinçli: bildirim yükündeki
/// `url` alanı web rotaları taşıyor (`notify.catalog.ts`). Aynı yolları kullanmak, derin
/// bağlantı için bir çeviri tablosuna olan ihtiyacı tamamen ortadan kaldırıyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/routing_rules.dart';
import '../../core/city_screens.dart';
import '../../features/armies/movement_rules.dart';
import '../../ui/primitives.dart';
import 'city_strip.dart';
import 'city_tabs.dart';
import 'info_bar.dart';
import 'more_sheet.dart';

/// Alt sekmeler — web `Shell.tsx` · `TABS` ile aynı beşli, **aynı ikon dosyalarıyla**.
///
/// ⭐ `icon` alanı bir `IconData` değil, `assets/menu/<icon>.png` dosyasının adı. Material
/// ikonları yerine oyunun kendi görselleri kullanılıyor: iki istemcinin aynı oyunu göstermesi
/// «tam eşitlik» kararının görünen yüzü.
const tabs = <({String path, String label, String icon})>[
  (path: '/armies', label: 'Ordular', icon: 'ordular'),
  (path: '/city', label: 'Şehir', icon: 'sehir'),
  (path: '/world', label: 'Dünya', icon: 'dunya'),
  (path: '/messages', label: 'Mesaj', icon: 'mesaj'),
  (path: '/command', label: 'Komuta', icon: 'komutamerkezi'),
];

/// «Daha» listesinin maddeleri — web `MORE_ITEMS` ile aynı dörtlü.
const drawerItems = <({String path, String label, String icon})>[
  (path: '/simulate', label: 'Simülatör', icon: 'simulator'),
  (path: '/options', label: 'Seçenekler', icon: 'secenekler'),
  (path: '/help', label: 'Yardım', icon: 'yardim'),
  (path: '/destek', label: 'Destek', icon: 'destek'),
];

/// ⚠️ «Şehir» sekmesi şehir ALT ekranlarında da yanmalı. Düz ön ek karşılaştırması
/// `/barracks`ı `/city` ile eşleştiremiyor ve o beş sayfada alt barda **hiçbir sekme aktif
/// olmuyordu** — üst bar da kalktığına göre "neredeyim" ipucu tamamen kaybolurdu.
/// Web'de aynı düzeltme var (`Shell.tsx`, 2026-08-09).
int activeTabIndex(String path) {
  final i = tabs.indexWhere((t) => path.startsWith(t.path));
  if (i >= 0) return i;
  if (matchCityScreen(path) != null) {
    return tabs.indexWhere((t) => t.path == '/city');
  }
  return -1;
}

class GameShell extends ConsumerWidget {
  const GameShell({super.key, required this.child, required this.path});

  final Widget child;
  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(sessionProvider) != null;
    final index = activeTabIndex(path);

    return Scaffold(
      body: Column(
        children: [
          // ⚠️ Üst güvenli alan bilgi çubuğunun DIŞINDA değil, çubuğun kendi zemini onu
          // kapsasın diye içinde: aksi hâlde durum çubuğunun arkası tema zemini kalır ve
          // çubuğun rengi ekranın tepesine kadar uzanmaz.
          if (signedIn) ...[
            const _TopSafeArea(child: InfoBar()),
            CityStrip(path: path),
            CityTabs(path: path),
          ] else
            const _TopSafeArea(child: _GuestBar()),
          Expanded(child: SafeArea(top: false, bottom: false, child: child)),
        ],
      ),
      bottomNavigationBar: signedIn ? _BottomBar(index: index) : null,
    );
  }
}

/// Durum çubuğunun altına kaymayı önler ve zemini onun arkasına kadar uzatır.
class _TopSafeArea extends StatelessWidget {
  const _TopSafeArea({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: MwColors.of(context).panelHeader,
      child: SafeArea(bottom: false, child: child),
    );
  }
}

/// Misafirde bilgi çubuğunun yerini alan ince şerit: oyun verisi yok, giriş bağlantısı var.
class _GuestBar extends StatelessWidget {
  const _GuestBar();

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          const MwIcon(folder: 'ui', id: 'logo', size: 22),
          const SizedBox(width: 8),
          Text(
            'MobilWar',
            style: TextStyle(
              color: c.onPanelHeader,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          TextButton(
            onPressed: () => context.go(kAuthPath),
            child: Text(
              'Giriş yap',
              style: TextStyle(
                color: c.onPanelHeader,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Alt gezinti — beş sekme + «Daha».
///
/// ⚠️ `NavigationBar` yerine elle çizildi: altıncı madde bir rota DEĞİL, yukarı açılan bir
/// liste. `NavigationBar` her hedefi bir seçim sayıyor ve «Daha»ya dokununca onu seçili
/// göstermeye çalışıyordu — oysa liste kapanınca hiçbir şey değişmemiş oluyor.
class _BottomBar extends ConsumerWidget {
  const _BottomBar({required this.index});

  final int index;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);

    /// ⭐⭐ ORDULAR ROZETİ — «ekrana bakmadan ne bekliyorum» (kullanıcı, 2026-07-28).
    ///
    /// ⚠️ Web'in kendi mobil düzeninde de tam olarak burada duruyor (`Shell.tsx` · alt sekme
    /// şeridi), yani bu bir taşıma — mobil uygulamaya özel bir icat değil.
    ///
    /// ⭐⭐ Rozet asıl işini ORDULAR DIŞINDAKİ ekranlarda yapıyor: şeritteki alarm noktası
    /// yalnız şerit açıkken görünüyor (varsayılan KAPALI) ve şehir ekranlarında oyuncu
    /// çoğunlukla üretimle meşgul. Gelen saldırıyı fark ettiren tek kalıcı sinyal bu.
    final rozet = armiesBadge(ref.watch(movementsProvider).value ?? const []);

    return Container(
      decoration: BoxDecoration(
        color: c.panelHeader,
        border: Border(top: BorderSide(color: c.borderStrong, width: 2)),
      ),
      // ⚠️ Güvenli alan BURADA (en dışta değil): çubuk ekranın dibine otursun, altında boş
      // şerit kalmasın; gezinme çubuğu olan cihazlarda içerik onun altına girmesin.
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 56,
          child: Row(
            children: [
              for (var i = 0; i < tabs.length; i++)
                _BarItem(
                  icon: tabs[i].icon,
                  label: tabs[i].label,
                  active: i == index,
                  onTap: () => context.go(tabs[i].path),
                  // ⚠️ Bugün yalnız Ordular'da; Mesaj sekmesinin okunmamış rozeti o ekran
                  // gelince aynı yerden bağlanacak (web'de ikisi yan yana).
                  badge: tabs[i].path == '/armies' ? rozet : null,
                ),
              _BarItem(
                // Web'de de aynı simge (`menu/secenekler.png`).
                icon: 'secenekler',
                label: 'Daha',
                active: false,
                onTap: () => showMoreSheet(context),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BarItem extends StatelessWidget {
  const _BarItem({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
    this.badge,
  });

  final String icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  /// Simgenin sağ üstüne oturan sayı + ton. `null` → rozet çizilmez.
  final ({int count, MwTone tone})? badge;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // ⚠️ `clipBehavior: none`: rozet simgenin çerçevesinden taşıyor; kırpılırsa
            // sayının yarısı kesilir.
            Stack(
              clipBehavior: Clip.none,
              children: [
                MwIcon(folder: 'menu', id: icon, size: 24),
                if (badge != null)
                  Positioned(top: -6, right: -10, child: _Badge(badge!)),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: active ? FontWeight.w700 : FontWeight.normal,
                // ⚠️ Seçili olmayan sekme SİLİK, gizli değil: dokunulabilir olduğu görünmeli.
                color: active
                    ? c.onPanelHeader
                    : c.onPanelHeader.withValues(alpha: 0.7),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Sayı rozeti — rengi «en kötü haber» kuralından geliyor (`armiesBadge`).
class _Badge extends StatelessWidget {
  const _Badge(this.data);

  final ({int count, MwTone tone}) data;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final bg = switch (data.tone) {
      MwTone.danger => c.danger,
      MwTone.warning => c.warning,
      MwTone.success => c.success,
    };

    return Container(
      constraints: const BoxConstraints(minWidth: 16),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        // ⚠️ Çerçeve ŞART: rozet çubuğun kendi zemininin üstünde duruyor ve sarı ton açık
        // temada zeminle neredeyse aynı parlaklıkta — sınır olmadan yüzüyor gibi görünüyordu.
        border: Border.all(color: c.borderStrong, width: 0.5),
      ),
      child: Text(
        // ⚠️ Üç haneden büyük sayı çubuğu bozar; oyuncunun aradığı bilgi zaten "çok" —
        // kesin sayı listede yazıyor.
        data.count > 99 ? '99+' : '${data.count}',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 10,
          height: 1.2,
          fontWeight: FontWeight.w700,
          // ⚠️ `Colors.white` YAZILMAZ (§13.13.1): üç zemin tonunun üçü de koyu ve okunan
          // renk temadan gelmeli. `MwButton` da vurgulu zeminlerde bunu kullanıyor.
          color: Theme.of(context).colorScheme.onPrimary,
          fontFeatures: const [FontFeature.tabularFigures()],
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
  Widget build(BuildContext context) => MwEmpty('$name — yakında.');
}
