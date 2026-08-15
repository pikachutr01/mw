/// YAPILAR — inşaat kuyruğu + şehirdeki yapılar ve seviyeleri.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'city_panels.dart';

class BuildingsScreen extends ConsumerWidget {
  const BuildingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CityData(
      builder: (context, city) => ListView(
        padding: const EdgeInsets.all(12),
        children: [
          // ⚠️ Yalnız `building`: teknik araştırmaları Akademi'de, savunma Savunma'da.
          // ⚠️ Bant yalnız emir varken — boş panel çizilmiyor.
          if (city.queues.any((q) => q.category == 'building')) ...[
            ProductionBand(
              city: city,
              queues: city.queues
                  .where((q) => q.category == 'building')
                  .toList(),
              // ⚠️ İnşaat aynı anda TEK: sunucu ikinci bir yapı emrini reddediyor.
              limit: 1,
              noun: 'yapı',
              folder: 'buildings',
              title: 'İnşaat',
              busy: false,
              // ⚠️ Yapı kuyruğunda sıralama YOK (tek emir); iptal Faz 2'nin Yapılar turunda.
              onMove: (_, _) {},
              onCancel: (_) {},
            ),
            const SizedBox(height: 12),
          ],
          CountsPanel(
            title: 'Yapılar',
            counts: city.buildings,
            folder: 'buildings',
            cityId: city.id,
            suffix: 'sv.',
            emptyText: 'Henüz yapı yok.',
          ),
        ],
      ),
    );
  }
}
