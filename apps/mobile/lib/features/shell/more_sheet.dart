/// ⭐ «DAHA» — alt bardan yukarı açılan liste. Web'deki `MoreSheet` karşılığı.
///
/// ⚠️ Bu liste eskiden bir **drawer**dı (soldan açılan menü, üst bardaki hamburger ikonuyla).
/// Kaldırıldı: üst bar sayfa adı + hamburger için tam bir satır yüksekliği yiyordu ve o satırın
/// taşıdığı iki bilgi de başka yerde zaten var — sayfa adı sekmede yanıyor, menü ise alt bara
/// sığıyor. Telefonda dikey alan en kıt kaynak.
///
/// ⚠️ Alt barın **altıncı** maddesi, beşincisi değil: ilk beşi web'in `TABS` dizisiyle birebir
/// aynı ve o sıra korunmak zorunda (iki istemcide farklı gezinme, aynı oyunu iki ayrı oyun gibi
/// gösterirdi).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../ui/primitives.dart';
import '../chat/global_chat_sheet.dart';
import 'shell.dart';

/// Listeyi açar. ⚠️ `showModalBottomSheet` kullanılıyor: geri tuşuyla kapanması, dışarı
/// dokununca kapanması ve odak tuzağı bedava geliyor. Elle çizilen bir bindirmede üçünü de
/// ayrı ayrı doğru yapmak gerekirdi.
Future<void> showMoreSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    // ⚠️ `useSafeArea`: liste gezinme çubuğunun altına kaymasın.
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const _MoreSheet(),
  );
}

class _MoreSheet extends ConsumerWidget {
  const _MoreSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          /* ⭐⭐ GENEL SOHBET — rota DEĞİL, buradan açılan bir sheet (2026-08-19).
           *
           * ⚠️ Rota olsaydı ekranın kendisi «bağlı» hâli olurdu ve oyuncu başka bir sayfaya
           * geçtiğinde bağlantı kopardı; oysa web'de sohbet rotaların DIŞINDA yaşıyor
           * (*"oyuncu sohbet açıkken Baraka'ya geçip üretim yapabilmeli"*). Sheet de aynı
           * şeyi yapmıyor — mobilde sheet açıkken zaten başka sayfaya geçilmiyor ve
           * kullanıcının mobil için tarifi tam olarak buydu: *"alttan açılsın, açık olduğu
           * sürece sohbete bağlı kabul edilsin."*
           *
           * ⚠️⚠️ **Panelden kapalıysa madde HİÇ çizilmiyor** (`globalChat` bayrağı): kullanıcı
           * şartı özelliğin "tamamen iptal" edilebilmesi ve canlıya çıkışta bu vana
           * kapatılacak. Açık bırakılan bir madde, dokununca hata veren bir kapı olurdu. */
          if (ref.watch(worldStateProvider).value?.globalChat ?? false)
            ListTile(
              dense: true,
              leading: const MwIcon(folder: 'menu', id: 'mesaj', size: 22),
              title: const Text('Genel Sohbet'),
              onTap: () {
                Navigator.of(context).pop();
                showGlobalChatSheet(context);
              },
            ),
          for (final m in drawerItems)
            ListTile(
              dense: true,
              leading: MwIcon(folder: 'menu', id: m.icon, size: 22),
              title: Text(m.label),
              onTap: () {
                Navigator.of(context).pop();
                context.go(m.path);
              },
            ),
          const Divider(height: 1),
          ListTile(
            dense: true,
            // Web'de de aynı dosya: `menu/cikis.png`.
            leading: const MwIcon(folder: 'menu', id: 'cikis', size: 22),
            title: Text('Çıkış yap', style: TextStyle(color: c.danger)),
            onTap: () async {
              Navigator.of(context).pop();
              await ref.read(authProvider).logout();
            },
          ),
        ],
      ),
    );
  }
}
