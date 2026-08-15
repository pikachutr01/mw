/// BARAKA — asker üretim bandı + şehirdeki ordu.
///
/// ⚠️ Üretim bandı BU ekranda (hub'da değil): oyuncu asker üretimine buradan bakıyor ve
/// bandın oradan buraya taşınması web'deki yerleşimle de örtüşüyor.
///
/// ⚠️ Emir verme (yeni sipariş) henüz YOK — mobil şu ana kadar yalnız okuyor. Katalog ucu ve
/// maliyet/ön koşul gösterimi gerektiriyor; bandın kendisi çalıştığı için o iş ayrı bir turda.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'city_panels.dart';

class BarracksScreen extends ConsumerWidget {
  const BarracksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CityData(
      builder: (context, city) => ListView(
        padding: const EdgeInsets.all(12),
        children: [
          ProductionBand(
            city: city,
            only: const {'unit'},
            emptyText: 'Şu an asker üretilmiyor.',
          ),
          const SizedBox(height: 12),
          CountsPanel(
            title: 'Ordu',
            counts: city.units,
            folder: 'units',
            cityId: city.id,
            emptyText: 'Bu şehirde asker yok.',
          ),
        ],
      ),
    );
  }
}
