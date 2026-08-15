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
          ProductionBand(
            city: city,
            // ⚠️ Yalnız `building`: teknik araştırmaları Akademi'de, savunma Savunma'da.
            only: const {'building'},
            title: 'İnşaat',
            emptyText: 'Şu an inşaat yok.',
          ),
          const SizedBox(height: 12),
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
