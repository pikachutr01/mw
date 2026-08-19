/// ⭐⭐ BARAKA ve SAVUNMA — **tek ekran, iki kip**. Web'deki `City.tsx` · `Trainable({kind})`
/// karşılığı ve ayrılma sebebi de aynı.
///
/// ⚠️⚠️ İkisi ayrı dosya olarak yazılsaydı şu parçalar **iki kopya** olurdu: adet kutusu ve
/// toplam satırı, canlı «eldeki adet» hesabı, üretim bandı bağlantısı, ön koşul gösterimi,
/// iptal onayı, §verify uyarısı. Bu depoda tekrar tekrar ısırılan hata tam olarak bu ve bir
/// önceki turda `catalog_bits.dart` bu yüzden ayıklandı. Kip farkı yalnız **altı satır**
/// (`_Kind` içindeki eşlemeler); gerisi ortak.
///
/// ─ İki kipin GERÇEKTEN ayrıştığı yerler ──────────────────────────────────────────────────
///  1. **Emir sınırı**: savaşçıda Baraka, savunma biriminde **Sur** seviyesi (savunma birimleri
///     surda yaşıyor).
///  2. **Karşılıklı kilit yalnız savaşçıda**: Baraka yükseltilirken asker üretilemez. Savunma
///     birimlerinin ön koşulu Sur/Kale, Baraka değil → Baraka yükseltmesi onları HİÇ etkilemez.
///  3. ⭐ **Seviye taşıyan kalemler yalnız savunmada**: Sur ve Büyü Kalkanı adet değil SEVİYE
///     taşıyor (§13.21.1b). Adet kutusu çizilmez, düğme «sv N+1» yazar, maliyet adetle
///     çarpılmaz ve ilerlemeleri **kendi satırlarında** akar — banda girmezler, birim üretimiyle
///     paralel ilerlerler (§13.21.3).
///  4. **§verify savunmada İKİ AYRI kural**: seviye taşıyanda seviye tavanı, adetli savunma
///     biriminde **tamamen yasak**. Kural `train_rules.dart` · `defenseCapped`ta, testle kilitli.
///  5. ⭐ **Onarımdaki Sur yükseltilemez** (§13.21.2).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../core/city_progress.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'catalog_bits.dart';
import 'catalog_model.dart';
import 'city_model.dart';
import 'city_panels.dart';
import 'info_sheets.dart';
import 'progress_row.dart';
import 'train_rules.dart';

/// Ekranın kipi. ⚠️ `String` yerine `enum`: yeni bir kip eklenirse `switch`ler derleme
/// zamanında eksik kalan dalı gösterir.
enum TrainKind { unit, defense }

/// Kipe bağlı olan HER ŞEY tek yerde — ekranın gövdesinde `if (kind == …)` dağılmasın.
extension _Kind on TrainKind {
  String get category => this == TrainKind.unit ? 'unit' : 'defense';
  String get folder => this == TrainKind.unit ? 'units' : 'defenses';
  String get title => this == TrainKind.unit ? 'Baraka' : 'Savunma';

  /// Üretim bandının başlığındaki isim («3 asker kaldı» · «3 birim kaldı»).
  String get noun => this == TrainKind.unit ? 'asker' : 'birim';

  List<CatalogUnit> list(CityCatalog c) =>
      this == TrainKind.unit ? c.units : c.defenses;

  Map<String, int> have(CityDetail c) =>
      this == TrainKind.unit ? c.units : c.defenses;

  /// ⭐ Emir sınırının kaynağı: savaşçıda Baraka, savunmada **Sur**.
  int limitSource(CityDetail c) => this == TrainKind.unit
      ? (c.buildings['barracks'] ?? 1)
      : (c.defenses['wall'] ?? 1);
}

class BarracksScreen extends StatelessWidget {
  const BarracksScreen({super.key});

  @override
  Widget build(BuildContext context) => const _Trainable(kind: TrainKind.unit);
}

class DefenseScreen extends StatelessWidget {
  const DefenseScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      const _Trainable(kind: TrainKind.defense);
}

class _Trainable extends ConsumerWidget {
  const _Trainable({required this.kind});

  final TrainKind kind;

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
          data: (cat) =>
              _Body(kind: kind, city: city, catalog: cat, physics: physics),
        );
      },
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({
    required this.kind,
    required this.city,
    required this.catalog,
    required this.physics,
  });

  final TrainKind kind;
  final CityDetail city;
  final CityCatalog catalog;

  /// ⚠️ `MwRefresh`ten gelen fizik — kutunun `physics:` alanına konmak ZORUNDA, yoksa kısa
  /// içerikli ekran hiç kaydırılamıyor ve aşağı çekme jesti doğmuyor.
  final ScrollPhysics physics;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  /// Satır başına adet kutusu. ⚠️ Denetleyiciler durumda tutuluyor: her `build`te yenisini
  /// kurmak yazarken imleci başa atardı.
  final _amounts = <String, TextEditingController>{};

  /// ⭐ Uçuştaki isteğin **hangi satıra** ait olduğu; boşta `null`. Gerekçe
  /// `UpgradeRow.pending`de: tek bayrak listedeki her düğmeyi aynı anda pasife düşürüyor ve
  /// kullanıcının bildirdiği «patlama efekti» oradan geliyordu.
  String? _pending;
  String? _error;

  @override
  void dispose() {
    for (final c in _amounts.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _ctrl(String id) =>
      _amounts.putIfAbsent(id, TextEditingController.new);

  /// ⚠️ Çift gönderim koruması BURADA, düğmede değil: uçuşta istek varken ikinci dokunuş
  /// sessizce yutuluyor, ekranı titretmeye gerek kalmıyor.
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
    final kind = widget.kind;
    final city = widget.city;
    final queues = ref.watch(cityQueuesProvider(city.id));
    final clock = ref.watch(clockProvider);

    final all = city.queues.where((q) => q.category == kind.category);

    /// ⚠️ **İKİ ŞERİT** (§13.21.3): `targetLevel` taşıyan satırlar Sur/Büyü Kalkanı
    /// yükseltmesidir ve kendi satırlarında akar; kalanlar tek banda girer.
    final band = all.where((q) => q.targetLevel == null).toList()
      ..sort((a, b) => (a.position ?? 1).compareTo(b.position ?? 1));
    final structureQueues = all.where((q) => q.targetLevel != null).toList();

    final bandLimit = bandLimitFor(kind.limitSource(city));
    final slotsFull = band.length >= bandLimit;

    /// ⭐ KARŞILIKLI KİLİT — **yalnız savaşçıda** (gerekçe dosya başlığında, madde 2).
    final locked =
        kind == TrainKind.unit &&
        city.queues.any(
          (q) => q.category == 'building' && q.itemType == 'barracks',
        );

    /// ⭐ Sur onarımı sürüyor mu? ⚠️ `gameNow`: `until` oyun saatinde. Gerçek saatle
    /// karşılaştırmak kilidi erken açıyor, oyuncu düğmeye basıyor ve sunucu reddediyordu.
    final wallRepairing =
        kind == TrainKind.defense &&
        city.wallRepair != null &&
        (DateTime.tryParse(city.wallRepair!.until)?.millisecondsSinceEpoch ??
                0) >
            clock.gameNow();

    return ListView(
      physics: widget.physics,
      padding: const EdgeInsets.all(12),
      children: [
        // ⭐ Bant YALNIZ emir varken. Boş panel çizmiyoruz.
        if (band.isNotEmpty) ...[
          ProductionBand(
            city: city,
            queues: band,
            limit: bandLimit,
            noun: kind.noun,
            folder: kind.folder,
            busy: _pending != null,
            onMove: (id, dir) => _run('move:$id', () => queues.move(id, dir)),
            onCancel: _askCancel,
          ),
          const SizedBox(height: 12),
        ],
        MwPanel(
          title: kind.title,
          trailing: Text(
            '${band.length}/$bandLimit emir',
            style: TextStyle(
              fontSize: 11,
              color: MwColors.of(context).onPanelHeader,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[
                MwErrorBox(_error!),
                const SizedBox(height: 8),
              ],
              // ⚠️ Kilit BÜTÜN satırları kapsıyor → uyarı satır satır tekrarlanmaz.
              if (locked) ...[
                const MwNote(
                  'Baraka yükseltiliyor; bitene kadar asker üretilemez.',
                ),
                const SizedBox(height: 8),
              ],
              for (var i = 0; i < kind.list(widget.catalog).length; i++)
                _Row(
                  kind: kind,
                  unit: kind.list(widget.catalog)[i],
                  city: city,
                  catalog: widget.catalog,
                  controller: _ctrl(kind.list(widget.catalog)[i].id),
                  alt: i.isOdd,
                  locked: locked,
                  slotsFull: slotsFull,
                  wallRepairing: wallRepairing,
                  pending: _pending,
                  structureQueue: structureQueues
                      .where(
                        (q) => q.itemType == kind.list(widget.catalog)[i].id,
                      )
                      .firstOrNull,
                  onOrder: (u, n) => _order(u, n),
                  onCancel: _askCancel,
                ),
            ],
          ),
        ),
      ],
    );
  }

  /// Emir ver. ⚠️ Seviye taşıyanda `count` GÖNDERİLMEZ — sunucu onu seviye emri sayıyor.
  Future<void> _order(CatalogUnit u, int n) async {
    final queues = ref.read(cityQueuesProvider(widget.city.id));
    await _run(u.id, () async {
      await queues.enqueue(
        category: widget.kind.category,
        type: u.id,
        count: u.levelBased ? null : n,
      );
      // ⭐ Yalnız BAŞARIDA temizlenir; hata olursa oyuncu yazdığı sayıyı kaybetmez.
      _ctrl(u.id).clear();
    });
  }

  Future<void> _askCancel(CityQueue q) async {
    final names =
        ref.read(catalogNamesProvider(widget.city.id)).value ?? const {};
    final ok = await mwConfirmSheet(
      context,
      title: '${names[q.itemType] ?? q.itemType} iptal edilsin mi?',
      // ⚠️ RAKAM YOK — gerekçe `mwConfirm` başlığında.
      body: q.count != null
          ? 'Üretimi biten birimler şehirde kalır. Kalan siparişin bedeli iade edilir; '
                'iadeden bir birimin bedeli düşülür.'
          : 'Harcanan kaynağın tamamlanmamış kısmı iade edilir; geçen süreye karşılık '
                'gelen kısım geri verilmez.',
      confirmLabel: 'İptal et',
    );
    if (!ok) return;
    await _run(
      q.itemType,
      () => ref.read(cityQueuesProvider(widget.city.id)).cancel(q.id),
    );
  }
}

/// Katalog satırı — ikon · ad(adet/seviye) · mağara · maliyet · ön koşul · emir kutusu.
///
/// ⚠️ Durumlu: adet kutusuna yazılan her karakter hem toplam satırını hem düğmenin
/// açık/kapalı olmasını değiştiriyor. Durumsuz yazıp dışarıdan yeniden çizim tetiklemek, TÜM
/// listeyi her tuşta yeniden kurardı.
class _Row extends ConsumerStatefulWidget {
  const _Row({
    required this.kind,
    required this.unit,
    required this.city,
    required this.catalog,
    required this.controller,
    required this.alt,
    required this.locked,
    required this.slotsFull,
    required this.wallRepairing,
    required this.pending,
    required this.structureQueue,
    required this.onOrder,
    required this.onCancel,
  });

  final TrainKind kind;
  final CatalogUnit unit;
  final CityDetail city;
  final CityCatalog catalog;
  final TextEditingController controller;

  /// Zebra deseni — web'de `bg-row-alt`.
  final bool alt;
  final bool locked;
  final bool slotsFull;
  final bool wallRepairing;

  /// Uçuştaki isteğin satır kimliği (bu satırınki değilse görünüm değişmez).
  final String? pending;

  /// Bu kalemin SEVİYE emri (yalnız Sur / Büyü Kalkanı'nda dolu olabilir).
  final CityQueue? structureQueue;

  final void Function(CatalogUnit, int) onOrder;
  final void Function(CityQueue) onCancel;

  @override
  ConsumerState<_Row> createState() => _RowState();
}

class _RowState extends ConsumerState<_Row> {
  @override
  Widget build(BuildContext context) {
    final unit = widget.unit;
    final city = widget.city;
    final kind = widget.kind;
    final c = MwColors.of(context);
    final levelBased = unit.levelBased;
    final mine = widget.pending == unit.id;

    final inCave = city.caveUnits[unit.id] ?? 0;
    final structures = city.structureLevels;

    /// ⭐⭐ ELDEKİ ADET **CANLI** (kullanıcı, 2026-08-17) — gerekçe `CityQueue.done`da.
    /// ⚠️ Yalnız ADETLİ kalemde: seviye taşıyanda üretim diye bir şey yok.
    final clock = ref.watch(clockProvider);
    ref.watch(tickProvider);
    var pending = 0;
    if (!levelBased) {
      for (final q in city.queues) {
        if (q.category != kind.category ||
            q.itemType != unit.id ||
            !q.isBatch) {
          continue;
        }
        final p = unitProgress(
          ProgressInput(
            startedAt: q.startedAt,
            count: q.count,
            perUnitSeconds: q.perUnitSeconds,
          ),
          clock.gameNow(),
        );
        if (p == null) continue;
        pending += (p.produced - q.done).clamp(0, q.count ?? 0);
      }
    }
    final have = (kind.have(city)[unit.id] ?? 0) + pending;

    // ⚠️ Dize olarak okunuyor: boş kutu 0, geçersiz metin de 0 → düğme kapalı kalır.
    final n = int.tryParse(widget.controller.text.trim()) ?? 0;

    /// ⚠️ Seviye taşıyanda maliyet adetle ÇARPILMAZ: bir seviyenin bedeli sabit.
    final total = levelBased
        ? (
            gold: unit.gold,
            food: unit.food,
            seconds: unit.seconds,
            baseSeconds: unit.baseSeconds,
          )
        : trainTotal(unit, n);
    final afford = city.gold >= total.gold && city.food >= total.food;

    final unmet = unmetRequirements(
      unit,
      structures: structures,
      techs: city.techs,
    );

    /// ⭐ §verify — savunmada iki ayrı kural (`train_rules.dart` · `defenseCapped`).
    final capped =
        kind == TrainKind.defense &&
        defenseCapped(
          caps: widget.catalog.verify,
          levelBased: levelBased,
          currentLevel: have,
        );

    /// ⭐ Onarımdaki Sur yükseltilemez (§13.21.2).
    final wallLocked = unit.id == 'wall' && widget.wallRepairing;

    final acik = levelBased
        ? (afford &&
              unmet.isEmpty &&
              !widget.slotsFull &&
              !capped &&
              !wallLocked &&
              !mine &&
              widget.structureQueue == null)
        : canTrain(
            count: n,
            afford: afford,
            hasUnmet: unmet.isNotEmpty,
            slotsFull: widget.slotsFull,
            locked: widget.locked || capped,
            busy: mine,
          );

    return InkWell(
      // ⭐ Uzun basma → künye (kullanıcı, 2026-08-17). Kısa dokunma bilerek BOŞ: satırın
      // gerçek eylemi sağdaki düğme ve satırın her yerini ona bağlamak yanlışlıkla emir
      // vermeye davet ederdi.
      onLongPress: () => showUnitInfo(context, unit),
      child: Container(
        color: widget.alt ? c.raised.withValues(alpha: 0.35) : null,
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                MwIcon(folder: kind.folder, id: unit.id, size: 36),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Ad + parantez içinde eldeki adet, seviye taşıyanda «sv N».
                      Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: unit.name,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            TextSpan(
                              text: levelBased
                                  ? '  sv $have'
                                  : '  (${mwNumber(have)})',
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.primary,
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      // ⭐ Orijinal kartta mağaradaki adet de yazıyor. Yalnız 0'dan büyükse:
                      // mağarası olmayan oyuncunun her satırda sıfır görmesi gürültü.
                      if (inCave > 0)
                        Text(
                          'Mağarada: ${mwNumber(inCave)}',
                          style: TextStyle(fontSize: 11, color: c.muted),
                        ),
                      const SizedBox(height: 2),
                      MwCostLine(
                        gold: unit.gold,
                        food: unit.food,
                        seconds: unit.seconds,
                        baseSeconds: unit.baseSeconds,
                      ),
                      MwRequirements(
                        unmet: unmet,
                        structures: structures,
                        techs: city.techs,
                      ),
                      if (capped)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: MwNote(
                            levelBased
                                ? 'E-posta doğrulanmadan en çok '
                                      'sv ${widget.catalog.verify!.maxDefenseLevel}.'
                                : 'E-posta doğrulaması gerekli.',
                          ),
                        ),
                      if (wallLocked)
                        const Padding(
                          padding: EdgeInsets.only(top: 3),
                          child: MwNote(
                            'Sur onarılıyor; bitene kadar yükseltilemez.',
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            // ⭐ MOBİL: emir kutusu + düğme alt satırda SAĞA yaslı (web'in dar ekran düzeni).
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (!levelBased && n > 0)
                  Expanded(
                    child: MwTotalLine(
                      gold: total.gold,
                      food: total.food,
                      seconds: total.seconds,
                      baseSeconds: total.baseSeconds,
                      afford: afford,
                    ),
                  ),
                // ⚠️ Seviye taşıyanda adet kutusu HİÇ çizilmez — adet diye bir şey yok.
                if (!levelBased) ...[
                  MwAmountInput(
                    controller: widget.controller,
                    enabled: !widget.locked,
                    // Her tuşta toplam satırı ve düğme durumu yeniden hesaplanmalı.
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(width: 8),
                ],
                // ⭐ Uçuştaki istek YALNIZ bu düğmede dönen bir gösterge (patlama efekti yok).
                SizedBox(
                  width: 64,
                  child: mine
                      ? const Center(
                          child: SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : MwSmallButton(
                          label: levelBased ? 'sv ${have + 1}' : 'Üret',
                          onTap: acik ? () => widget.onOrder(unit, n) : null,
                          minWidth: 64,
                        ),
                ),
              ],
            ),
            // ⭐ Seviye emrinin ilerlemesi SATIRDA (banda girmez, paralel akar — §13.21.3).
            if (widget.structureQueue != null) ...[
              const SizedBox(height: 6),
              ProgressRow(
                startedAt: widget.structureQueue!.startedAt,
                finishAt: widget.structureQueue!.finishAt,
                label: 'seviye ${widget.structureQueue!.targetLevel}',
                busy: widget.pending != null,
                onCancel: () => widget.onCancel(widget.structureQueue!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
