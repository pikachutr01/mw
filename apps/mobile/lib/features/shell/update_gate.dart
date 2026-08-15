/// SÜRÜM KAPISI — "bu uygulama artık çok eski".
///
/// ⚠️ Bu bir **acil vana**, rutin bir davranış değil. Normalde `client.minAndroidBuild = 0`
/// ve kapı hiç görünmez; ilk çare her zaman API'yi geriye uyumlu tutmaktır (`DAGITIM.md` §6).
/// Vana yalnız geriye uyumu bozan bir değişiklik zorunlu olduğunda açılır — o zaman eski
/// uygulamaların **sessizce bozuk çalışması** yerine açık bir ekran görmesi tercih edilir.
///
/// ⚠️ Kapı `acilisProvider`e bağlı ve o uç **oturumsuz** çalışıyor: eski uygulama giriş
/// DENEMEDEN durdurulmalı, yoksa önce jeton alır sonra bozulur.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/app_version.dart';
import '../../ui/primitives.dart';

class SurumKapisi extends ConsumerWidget {
  const SurumKapisi({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final acilis = ref.watch(acilisProvider);
    final kunye = ref.watch(kunyeProvider);

    // ⚠️ Veri gelmeden ya da hata alınca kapı AÇIK kalır. Sunucuya ulaşılamadığı için
    // oyuncuyu "güncelle" ekranına hapsetmek, geçici bir arızayı kalıcı bir engele çevirirdi.
    final gerekli = guncellemeGerekli(
      surum: kunye.appVersion,
      // ⚠️ Riverpod 3'te `valueOrNull` YOK; `value` zaten nullable dönüyor.
      enDusukYapi: acilis.value?.enDusukYapi,
    );
    if (!gerekli) return child;

    return _GuncellemeEkrani(surum: kunye.appVersion);
  }
}

class _GuncellemeEkrani extends StatelessWidget {
  const _GuncellemeEkrani({required this.surum});

  final String surum;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: MwPanel(
                baslik: 'Güncelleme gerekli',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Bu sürüm artık desteklenmiyor. Oyuna devam etmek için '
                      'uygulamayı mağazadan güncellemen gerekiyor.',
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Yüklü sürüm: $surum',
                      style: TextStyle(color: MwRenk.of(context).muted),
                    ),
                    const SizedBox(height: 16),
                    // ⚠️ Mağaza bağlantısı Faz 4'te (uygulama yayımlanınca) eklenecek —
                    // bugün mağazada bir sayfa YOK ve olmayan bir yere düğme koymak,
                    // oyuncuyu ölü bir bağlantıya göndermek olurdu.
                    Text(
                      'Play Store bağlantısı uygulama yayımlanınca burada olacak.',
                      style: TextStyle(color: MwRenk.of(context).muted),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
