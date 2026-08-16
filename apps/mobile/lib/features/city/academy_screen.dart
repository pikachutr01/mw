/// ⭐ AKADEMİ — teknik araştırması. Web'deki `City.tsx` · `Techs` karşılığı.
///
/// ─ Bu ekranda yaşayan kararlar ───────────────────────────────────────────────────────────
///  • ⭐⭐ **AKADEMİLER ORTAK.** Teknik seviyesi oyuncuya aittir, şehre değil; bir teknik
///    herhangi bir şehirde araştırılıyorsa **her şehirde** kapalıdır. Bu yüzden liste
///    `city.techQueues`ten besleniyor (TÜM şehirler), `city.queues`ten değil (yalnız bu şehir).
///    Yalnız bu şehre bakan bir ekran, aynı tekniği iki şehirden başlatmaya davet ederdi.
///  • **İptal yalnız BAŞLATAN şehirden** (kullanıcı kuralı). Başka şehirde sürüyorsa satır
///    onun adını yazar ve iptal düğmesi çizilmez.
///  • ⭐ **KARŞILIKLI KİLİT** (§13.11.5a) araştırma yönü: bu şehirde Akademi yükseltiliyorsa
///    araştırma açılamaz. ⚠️ Kilit ŞEHİR BAŞINA — başka şehrin akademisi yükseltilirken
///    buradan araştırma açmak serbest.
///  • **Araştırma aynı anda tek** (bu şehirde): biri sürerken hepsi kapalı.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'catalog_bits.dart';
import 'catalog_model.dart';
import 'city_model.dart';
import 'city_panels.dart';
import 'progress_row.dart';
import 'train_rules.dart';
import 'upgrade_row.dart';

class AcademyScreen extends ConsumerWidget {
  const AcademyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CityData(
      builder: (context, city) {
        final catalog = ref.watch(catalogProvider(city.id));
        return catalog.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Padding(
            padding: const EdgeInsets.all(16),
            child: MwErrorBox('Katalog alınamadı: $e'),
          ),
          data: (cat) => _Academy(city: city, catalog: cat),
        );
      },
    );
  }
}

class _Academy extends ConsumerStatefulWidget {
  const _Academy({required this.city, required this.catalog});

  final CityDetail city;
  final CityCatalog catalog;

  @override
  ConsumerState<_Academy> createState() => _AcademyState();
}

class _AcademyState extends ConsumerState<_Academy> {
  /// ⭐ Uçuştaki isteğin **hangi satıra** ait olduğu; boşta `null`. Gerekçe
  /// `UpgradeRow.pending`de: tek bayrak, listedeki her düğmeyi aynı anda pasife düşürüyor
  /// ve kullanıcının bildirdiği "patlama efekti" oradan geliyordu.
  String? _pending;
  String? _error;

  /// ⚠️ Çift gönderim koruması BURADA, düğmede değil: uçuşta istek varken ikinci dokunuş
  /// sessizce yutuluyor. Görsel bir kilide gerek yok.
  Future<void> _run(String id, Future<void> Function() action) async {
    if (_pending != null) return;
    setState(() {
      _pending = id;
      _error = null;
    });
    try {
      await action();
      await mwTapOk();
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _pending = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final city = widget.city;
    final caps = widget.catalog.verify;

    /// Hangi teknik nerede araştırılıyor — TÜM şehirlerden.
    final byTech = {for (final q in city.techQueues) q.itemType: q};

    final busyHere = city.queues.any((q) => q.category == 'tech');
    final academyUpgrading = city.queues.any(
      (q) => q.category == 'building' && q.itemType == 'academy',
    );

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        MwPanel(
          title: 'Akademi',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[
                MwErrorBox(_error!),
                const SizedBox(height: 8),
              ],
              // ⚠️ Kilit BÜTÜN tekniklere işliyor → uyarı satır satır değil, panelin başında.
              if (academyUpgrading) ...[
                const MwNote(
                  'Akademi yükseltiliyor; bitene kadar teknik araştırılamaz.',
                ),
                const SizedBox(height: 8),
              ],
              for (var i = 0; i < widget.catalog.techs.length; i++)
                _row(
                  widget.catalog.techs[i],
                  i.isOdd,
                  city,
                  caps,
                  byTech[widget.catalog.techs[i].id],
                  busyHere: busyHere,
                  academyUpgrading: academyUpgrading,
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _row(
    CatalogUpgradable t,
    bool alt,
    CityDetail city,
    VerifyCaps? caps,
    TechQueue? q, {
    required bool busyHere,
    required bool academyUpgrading,
  }) {
    final structures = city.structureLevels;
    final unmet = unmetFor(
      t.requirements,
      structures: structures,
      techs: city.techs,
    );
    final afford =
        t.nextGold != null &&
        t.nextFood != null &&
        city.gold >= t.nextGold! &&
        city.food >= t.nextFood!;
    final capped = caps != null && t.level >= caps.maxTechLevel;

    // ⭐ İptal YALNIZ araştırmayı başlatan şehirden (kullanıcı kuralı).
    final mineHere = q != null && q.cityId == city.id;

    return UpgradeRow(
      item: t,
      folder: 'techs',
      structures: structures,
      techs: city.techs,
      unmet: unmet,
      alt: alt,
      capNote: capped
          ? 'E-posta doğrulanmadan en çok sv ${caps.maxTechLevel}.'
          : null,
      enabled: canResearch(
        capped: capped,
        afford: afford,
        hasUnmet: unmet.isNotEmpty,
        busyHere: busyHere,
        alreadyRunning: q != null,
        academyUpgrading: academyUpgrading,
        // ⚠️⚠️ SATIR BAZINDA — `_pending != null` yazılırsa uçuştaki tek istek tüm düğmeleri
        //    pasife düşürür (kullanıcının bildirdiği "patlama efekti").
        pending: _pending == t.id,
      ),
      pending: _pending == t.id,
      onUpgrade: () => _research(t),
      progress: q == null
          ? null
          : ProgressRow(
              startedAt: q.startedAt,
              finishAt: q.finishAt,
              // ⚠️ Başka şehirdeyse ADI yazılır: oyuncu nereye bakacağını bilmeli.
              label: mineHere
                  ? 'seviye ${q.targetLevel}'
                  : 'seviye ${q.targetLevel} · ${q.cityName}',
              busy: _pending != null,
              onCancel: mineHere ? () => _askCancel(q, t.name) : null,
            ),
    );
  }

  Future<void> _research(CatalogUpgradable t) async {
    final queues = ref.read(cityQueuesProvider(widget.city.id));
    await _run(t.id, () => queues.enqueue(category: 'tech', type: t.id));
  }

  Future<void> _askCancel(TechQueue q, String name) async {
    final ok = await mwConfirmSheet(
      context,
      title: '$name araştırması iptal edilsin mi?',
      body:
          'Harcanan kaynağın tamamlanmamış kısmı iade edilir; geçen süreye karşılık gelen '
          'kısım geri verilmez.',
      confirmLabel: 'İptal et',
    );
    if (!ok) return;
    await _run(
      q.itemType,
      () => ref.read(cityQueuesProvider(widget.city.id)).cancel(q.id),
    );
  }
}
