/// ⭐⭐ BİLGİ KÜNYELERİ — uzun basınca açılan bottom sheet'ler.
///
/// Kullanıcı isteği (2026-08-17): *"Yapılar sayfasındaki uzun basınca bilgi notu çıkma
/// mantığını diğer sayfalara da yapacağız. Baraka sayfasındaki askerlere, savunma sayfasındaki
/// yapı ve ünitelere. Hatta webde yazan bilgilerin aynıları yazmalı."*
///
/// ⚠️⚠️ **İçerik ÜRETİLİYOR, elle yazılmıyor** (`lib/gen/facts.g.dart` ← `ops/facts-to-dart.ts`).
/// Metinler web'le aynı kaynaktan; teknik listesi ve vuruş fazı ise **savaş motorunun
/// kataloğundan türetiliyor**. İkincisi kritik: oyunun kendi dokümanı motorla dört yerde
/// çelişiyor ve elle yazılan bir liste bu yanlışları oyuncuya öğretmeye devam ederdi.
///
/// ⚠️ Web'de bu bir **popover** (fareyle üstüne gelince); telefonda karşılığı uzun basma +
/// sheet. Gerekçe `ui/native.dart` · `mwInfoSheet`te.
///
/// ─ Bölümler (web'deki `UnitInfo` ile birebir sıra) ───────────────────────────────────────
///   1. açıklama · 2. «Özellikler» · 3. «Etkilendiği teknikler» · 4. «Özel»
library;

import 'package:flutter/material.dart';

import '../../gen/facts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'catalog_model.dart';

/// Birimin (savaşçı ya da savunma) künyesi.
///
/// ⚠️ Açıklaması olmayan birimde sheet **hiç açılmaz** — boş bir kutu açmak, uzun basmanın
/// bir işe yaradığı izlenimi verip hiçbir şey göstermek olurdu (web'de de `ItemName` o
/// satırda düğme çizmiyor).
Future<void> showUnitInfo(BuildContext context, CatalogUnit u) async {
  final text = kUnitInfo[u.id];
  if (text == null) return;

  final stats = _stats(u);
  final techs = kUnitTechNames[u.id] ?? const <String>[];

  await mwInfoSheet(
    context,
    title: u.name,
    lines: [
      Builder(
        builder: (ctx) {
          final c = MwColors.of(ctx);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(text.desc, style: TextStyle(color: c.muted)),

              if (stats.isNotEmpty) ...[
                const _Heading('Özellikler'),
                for (final s in stats) _StatRow(label: s.$1, value: s.$2),
              ],

              /// ⚠️ **Boş liste GERÇEK bir bilgi** (Yük Arabası, Casus Kuş): bölümü hiç
              /// çizmemek "bilgi eksik" gibi okunurdu.
              /// ⚠️ Metin «savaş tekniklerinden» diyor, «hiçbir teknikten» değil: Casus Kuş'un
              /// «Özel» bölümü Casusluk'tan söz ediyor ve ikisi çelişiyor görünürdü. Casusluk
              /// birimin savaş statlarını ölçeklemiyor, istihbarat kademesini belirliyor.
              const _Heading('Etkilendiği teknikler'),
              if (techs.isEmpty)
                Text(
                  'Savaş tekniklerinden etkilenmez.',
                  style: TextStyle(color: c.muted),
                )
              else
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [for (final t in techs) _Badge(t)],
                ),

              if (text.extra != null) ...[
                const _Heading('Özel', accent: true),
                Text(text.extra!, style: TextStyle(color: c.muted)),
              ],
            ],
          );
        },
      ),
    ],
  );
}

/// «Özellikler» satırları.
///
/// ⚠️ **SIFIR SATIR ÇİZİLMEZ.** Savunma birimlerinin hızı 0 (sefere çıkmazlar), çoğunun
/// taşıma kapasitesi 0. «Hız 0 · Kapasite 0» yazmak bilgi değil gürültü olurdu.
///
/// ⚠️⚠️ **«Alan» YALNIZ SAVAŞÇILARDA** (kullanıcı kararı, web'de 2026-08-11): savaşçıda alan
/// gerçek bir kısıt (Mağara kapasitesini o tüketiyor), savunmada ise ölü bir sayı —
/// `defenseCapacity.enforced: false`, yani savunma birimleri sınırsız üretilebiliyor.
/// Oyuncunun hiçbir kararını değiştirmeyen bir sayı, onu boş yere "bir yere sığmalıyım" diye
/// düşündürürdü. Kural `kUnitKind` üzerinden — kaynağı katalogun kendisi.
///
/// ⚠️ Sayılar **sunucudan gelen** `CatalogUnit`ten okunuyor: ikisi de dünya başına override
/// edilebiliyor ve istemcide sabit tutmak ekranın yanılması demekti.
List<(String, String)> _stats(CatalogUnit u) {
  final rows = <(String, String)>[];
  if (u.speed > 0) rows.add(('Hız', mwNumber(u.speed)));
  if (u.carry > 0) rows.add(('Taşıma kapasitesi', mwNumber(u.carry)));
  if (kUnitKind[u.id] == 'warrior') rows.add(('Alan', mwNumber(u.area)));
  final strike = kUnitStrike[u.id];
  if (strike != null) rows.add(('Vuruş', strike));
  return rows;
}

/// Yapı künyesi — seviye/üretim satırları `UpgradeRow`da, buradaki yalnız AÇIKLAMA.
String? buildingInfoText(String id) => kBuildingInfo[id];

/// Teknik künyesi.
String? techInfoText(String id) => kTechInfo[id];

class _Heading extends StatelessWidget {
  const _Heading(this.text, {this.accent = false});

  final String text;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Divider(height: 1, color: c.border),
          const SizedBox(height: 8),
          Text(
            text,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
              color: accent ? Theme.of(context).colorScheme.primary : c.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: TextStyle(color: c.muted)),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: c.raised,
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(text, style: const TextStyle(fontSize: 12)),
    );
  }
}
