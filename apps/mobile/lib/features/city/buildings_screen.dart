/// ⭐⭐ YAPILAR — inşaat kuyruğu + yükseltme. Web'deki `City.tsx` · `Buildings` karşılığı.
///
/// ⚠️⚠️ Bu ekran 2026-08-17'ye kadar **yalnız okuyordu**: şehirdeki yapıları ve seviyelerini
/// listeliyor, yükseltme sunmuyordu. Yani mobil uygulamada asker üretilebiliyor ama **bina
/// yapılamıyordu** — oyunun en temel eylemi eksikti.
///
/// ─ Bu ekranda yaşayan kararlar ───────────────────────────────────────────────────────────
///  • **İnşaat aynı anda TEK.** Bir yapı emri varken hepsinin düğmesi kapanıyor; sunucu da
///    ikinciyi reddediyor. Bant `limit: 1`.
///  • ⭐ **KARŞILIKLI KİLİT** (§13.11.5a): asker üretilirken Baraka, araştırma sürerken Akademi
///    yükseltilemez. Kural `train_rules.dart` · `buildingMutex`ta ve metin olarak dönüyor —
///    sebebi söylemeyen pasif bir düğme, oyuncuyu tahmine zorlar.
///  • ⭐ **Mağara meşgulse seviye ilerletilemez** (§13.20): onarımdaysa ya da içine/dışına
///    asker taşınıyorsa.
///  • **Tavandaki yapıda düğme «—»**: pasif bir «sv 31», hâlâ ilerlenebilirmiş gibi görünür.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'catalog_model.dart';
import 'city_model.dart';
import 'city_panels.dart';
import 'info_sheets.dart';
import 'progress_row.dart';
import 'train_rules.dart';
import 'upgrade_row.dart';

class BuildingsScreen extends ConsumerWidget {
  const BuildingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CityData(
      builder: (context, city, physics) {
        final catalog = ref.watch(catalogProvider(city.id));
        return catalog.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Padding(
            padding: const EdgeInsets.all(16),
            child: MwErrorBox('Katalog alınamadı: $e'),
          ),
          data: (cat) => _Buildings(city: city, catalog: cat, physics: physics),
        );
      },
    );
  }
}

class _Buildings extends ConsumerStatefulWidget {
  const _Buildings({
    required this.city,
    required this.catalog,
    required this.physics,
  });

  final CityDetail city;
  final CityCatalog catalog;

  /// ⚠️ `MwRefresh`ten gelen fizik — kutunun `physics:` alanına konmak ZORUNDA, yoksa kısa
  /// içerikli ekran hiç kaydırılamıyor ve aşağı çekme jesti doğmuyor.
  final ScrollPhysics physics;

  @override
  ConsumerState<_Buildings> createState() => _BuildingsState();
}

class _BuildingsState extends ConsumerState<_Buildings> {
  /// ⭐ Uçuştaki isteğin **hangi satıra** ait olduğu; boşta `null`.
  ///
  /// ⚠️ Eskiden düz bir `bool`du ve kullanıcı sonucunu bildirdi: *"bir butona basınca
  /// ekrandaki tüm butonlar anlık olarak bir patlama efekti veriyorlar."* Tek bayrak, listedeki
  /// her düğmeyi aynı anda pasife düşürüyordu. Gerekçenin tamamı `UpgradeRow.pending`de.
  String? _pending;
  String? _error;

  /// ⚠️ Hata/başarı geri bildirimi TEK yerden: her çağıran kendi `try`ını yazsaydı titreşim
  /// bir yerde unutulur ve davranış ekran içinde ayrışırdı (`barracks_screen` ile aynı kalıp).
  ///
  /// ⚠️ **Çift gönderim koruması burada, düğmede DEĞİL**: uçuşta bir istek varken ikinci
  /// dokunuş sessizce yutuluyor. Görsel bir kilide (tüm düğmeleri pasife almaya) gerek yok.
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

    // ⚠️ `city.queues` yalnız AÇIK satırları taşıyor → iptal/bitiş kilidi kendiliğinden çözer.
    final buildingQueues = city.queues
        .where((q) => q.category == 'building')
        .toList();
    final unitBusy = city.queues.any((q) => q.category == 'unit');
    final techBusy = city.queues.any((q) => q.category == 'tech');
    // İnşaat aynı anda tek → herhangi bir yapı emri hepsini kapatıyor.
    final buildBusy = buildingQueues.isNotEmpty;

    return ListView(
      physics: widget.physics,
      padding: const EdgeInsets.all(12),
      children: [
        /// ⚠️⚠️ **ÜSTTE «İNŞAAT» BANDI YOK** (kullanıcı, 2026-08-17): *"Yapılar sayfasında
        /// yükseltilen bina yalnızca kendi satırında görünür, üstte ek olarak çıkmaz."*
        ///
        /// Bir ara hem bant hem satır içi geri sayım vardı ve **aynı emri iki kez** gösteriyordu.
        /// Baraka'da bant doğru araç, çünkü orada sıralanabilir BİRDEN ÇOK emir var; inşaat ise
        /// aynı anda tek ve yeri kendi satırı. Web de böyle davranıyor.
        MwPanel(
          title: 'Yapılar',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[
                MwErrorBox(_error!),
                const SizedBox(height: 8),
              ],
              for (var i = 0; i < widget.catalog.buildings.length; i++)
                _row(widget.catalog.buildings[i], i.isOdd, city, caps, {
                  'unitBusy': unitBusy,
                  'techBusy': techBusy,
                  'buildBusy': buildBusy,
                }),
            ],
          ),
        ),
      ],
    );
  }

  Widget _row(
    CatalogUpgradable b,
    bool alt,
    CityDetail city,
    VerifyCaps? caps,
    Map<String, bool> flags,
  ) {
    final structures = city.structureLevels;
    final unmet = unmetFor(
      b.requirements,
      structures: structures,
      techs: city.techs,
    );
    final afford =
        b.nextGold != null &&
        b.nextFood != null &&
        city.gold >= b.nextGold! &&
        city.food >= b.nextFood!;
    final capped = caps != null && b.level >= caps.maxBuildingLevel;
    final mutex = buildingMutex(
      b.id,
      unitBusy: flags['unitBusy']!,
      techBusy: flags['techBusy']!,
    );

    /// ⭐ Mağara meşgulse (onarımda ya da asker taşırken) seviye ilerletilemez (§13.20).
    /// ⚠️ Mağaranın durumu henüz modelde yok → bugün yalnız `false`. Mağara ekranı
    /// geldiğinde bu satır gerçek duruma bağlanacak; şimdiden kapı koymak, olmayan bir
    /// veriye dayanan sessiz bir yanlış olurdu (sunucu zaten reddediyor).
    const caveLocked = false;

    final q = city.queues
        .where((x) => x.category == 'building' && x.itemType == b.id)
        .firstOrNull;

    return UpgradeRow(
      item: b,
      folder: 'buildings',
      structures: structures,
      techs: city.techs,
      unmet: unmet,
      alt: alt,
      capNote: capped
          ? 'E-posta doğrulanmadan en çok sv ${caps.maxBuildingLevel}.'
          : null,
      lockNote: mutex,
      infoText: buildingInfoText(b.id),
      enabled: canUpgradeBuilding(
        maxed: b.maxed,
        capped: capped,
        afford: afford,
        hasUnmet: unmet.isNotEmpty,
        busy: flags['buildBusy']!,
        // ⚠️⚠️ **SATIR BAZINDA** — `_pending != null` YAZILMAZ. Öyle yazılırsa uçuştaki
        //    tek bir istek listedeki HER düğmeyi pasife düşürür ve kullanıcının bildirdiği
        //    "tüm butonlar patlama efekti veriyor" davranışı geri gelir. Çift gönderim
        //    koruması `_run`da; buradaki kapı yalnız bu satırı ilgilendiriyor.
        pending: _pending == b.id,
        mutex: mutex != null,
        caveLocked: caveLocked,
      ),
      pending: _pending == b.id,
      onUpgrade: () => _upgrade(b),
      progress: q == null
          ? null
          : ProgressRow(
              startedAt: q.startedAt,
              finishAt: q.finishAt,
              label: 'seviye ${q.targetLevel}',
              busy: _pending != null,
              onCancel: () => _askCancel(q),
            ),
    );
  }

  Future<void> _upgrade(CatalogUpgradable b) async {
    final queues = ref.read(cityQueuesProvider(widget.city.id));
    await _run(b.id, () => queues.enqueue(category: 'building', type: b.id));
  }

  Future<void> _askCancel(CityQueue q) async {
    final names =
        ref.read(catalogNamesProvider(widget.city.id)).value ?? const {};
    final ok = await mwConfirmSheet(
      context,
      title: '${names[q.itemType] ?? q.itemType} iptal edilsin mi?',
      // ⚠️ RAKAM YOK — gerekçe `mwConfirm` başlığında: ekranda görünen değerle onay anındaki
      // gerçek iade kaçınılmaz olarak ayrışıyor.
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
