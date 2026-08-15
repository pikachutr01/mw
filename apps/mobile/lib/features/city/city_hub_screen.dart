/// ŞEHİR HUB'I — beş şehir ekranının listesi. Web'deki `CityHub` karşılığı.
///
/// ⚠️ Şehir ADI KARTI burada YOK, bilerek: ad ve koordinat kabuktaki şehir şeridinde yazıyor
/// (web'de de 2026-08-03'te aynı sebeple kaldırıldı). İki yerde yazması, dar ekranda aynı
/// bilgiyi iki kez göstermek olurdu.
///
/// ⚠️ Kaynaklar da burada YOK: bilgi çubuğu onları **her ekranda** gösteriyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/city_screens.dart';
import '../../ui/primitives.dart';

class CityHubScreen extends ConsumerWidget {
  const CityHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        MwPanel(
          title: 'Şehir',
          child: Column(
            children: [
              for (final s in kCityScreens)
                InkWell(
                  onTap: () => context.go(s.path),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        MwIcon(folder: 'buildings', id: s.icon, size: 32),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                s.label,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                s.hint,
                                style: TextStyle(fontSize: 12, color: c.muted),
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_right, color: c.muted),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
