/// ⭐⭐ BARAKA — asker üretimi. Web'deki `City.tsx` · `Trainable(kind:'unit')` karşılığı.
///
/// Ekranın tamamı web'in **mobil** düzenine göre: satır iki katlı (üstte ikon + ad/maliyet,
/// altta sağa yaslı adet + «Üret»), üretim bandı ayrı panelde ve **yalnız emir varken**.
///
/// ─ Bu ekranda yaşayan kararlar ───────────────────────────────────────────────────────────
///  • **Bant yalnız emir varken çizilir.** Boş bir «üretim bandı» paneli, oyuncuya sürekli
///    olmayan bir şeyin yerini gösteriyordu.
///  • **Sayaç TEK BİRİMLİK** (kullanıcı, 2026-07-28): 300 birimin toplam süresi değil, sıradaki
///    BİR birimin geri sayımı; dolunca sıfırlanır ve kalan adet bir azalır.
///  • **Sıralama okları yalnız en az İKİ bekleyen emir varken.** Tek bekleyen emirde gidecek
///    başka yer yok; ok göstermek "bir işe yarar" izlenimi verip hiçbir şey yapmıyordu.
///  • **İptal onay ister ve onayda RAKAM YOK** — gerekçe `mwConfirm` başlığında.
///  • **Emir kabul edilince adet kutusu boşalır**, hata olursa KORUNUR: kalan sayı "hâlâ bir
///    şey seçili" izlenimi verip yanlışlıkla ikinci kez üretmeye davet ediyordu.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/primitives.dart';
import 'catalog_bits.dart';
import 'catalog_model.dart';
import 'city_model.dart';
import 'city_panels.dart';
import 'train_rules.dart';

class BarracksScreen extends ConsumerWidget {
  const BarracksScreen({super.key});

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
          data: (cat) => _Barracks(city: city, catalog: cat),
        );
      },
    );
  }
}

class _Barracks extends ConsumerStatefulWidget {
  const _Barracks({required this.city, required this.catalog});

  final CityDetail city;
  final CityCatalog catalog;

  @override
  ConsumerState<_Barracks> createState() => _BarracksState();
}

class _BarracksState extends ConsumerState<_Barracks> {
  /// Satır başına adet kutusu. ⚠️ Denetleyiciler durumda tutuluyor: her `build`te yenisini
  /// kurmak yazarken imleci başa atardı.
  final _amounts = <String, TextEditingController>{};
  bool _busy = false;
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

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on MwApiError catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final city = widget.city;
    final queues = ref.watch(cityQueuesProvider(city.id));

    // ⚠️ Yalnız ADETLİ asker emirleri banda girer; savaşçıda seviye taşıyan kalem yok ama
    // süzgeç yine de açık yazılı — Savunma ekranı aynı parçayı kullanacak.
    final band =
        city.queues
            .where((q) => q.category == 'unit' && q.targetLevel == null)
            .toList()
          ..sort((a, b) => (a.position ?? 1).compareTo(b.position ?? 1));

    /// ⭐ Emir sınırı = Baraka seviyesi (savunmada Sur). Kural `train_rules.dart`ta.
    final bandLimit = bandLimitFor(city.buildings['barracks'] ?? 1);
    final slotsFull = band.length >= bandLimit;

    /// ⭐ KARŞILIKLI KİLİT (§13.11.5a): bu şehirde Baraka yükseltiliyorsa asker üretilemez.
    /// ⚠️ Sunucu da reddediyor; buradaki amaç oyuncunun düğmeye BASTIKTAN sonra değil
    /// basmadan önce görmesi.
    final barracksUpgrading = city.queues.any(
      (q) => q.category == 'building' && q.itemType == 'barracks',
    );

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        // ⭐ Bant YALNIZ emir varken. Boş panel çizmiyoruz.
        if (band.isNotEmpty) ...[
          ProductionBand(
            city: city,
            queues: band,
            limit: bandLimit,
            noun: 'asker',
            folder: 'units',
            busy: _busy,
            onMove: (id, dir) => _run(() => queues.move(id, dir)),
            onCancel: (q) => _askCancel(q),
          ),
          const SizedBox(height: 12),
        ],
        MwPanel(
          title: 'Baraka',
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
              // ⚠️ Kilit BÜTÜN satırları kapsıyor → uyarı satır satır tekrarlanmaz, panelin
              // başında bir kez yazılır.
              if (barracksUpgrading) ...[
                MwNote('Baraka yükseltiliyor; bitene kadar asker üretilemez.'),
                const SizedBox(height: 8),
              ],
              for (var i = 0; i < widget.catalog.units.length; i++)
                _UnitRow(
                  unit: widget.catalog.units[i],
                  city: city,
                  controller: _ctrl(widget.catalog.units[i].id),
                  alt: i.isOdd,
                  locked: barracksUpgrading,
                  slotsFull: slotsFull,
                  busy: _busy,
                  onTrain: (n) => _train(widget.catalog.units[i], n),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _train(CatalogUnit u, int n) async {
    final queues = ref.read(cityQueuesProvider(widget.city.id));
    await _run(() async {
      await queues.enqueue(category: 'unit', type: u.id, count: n);
      // ⭐ Yalnız BAŞARIDA temizlenir; hata olursa oyuncu yazdığı sayıyı kaybetmez.
      _ctrl(u.id).clear();
    });
  }

  Future<void> _askCancel(CityQueue q) async {
    final names =
        ref.read(catalogNamesProvider(widget.city.id)).value ?? const {};
    final ok = await mwConfirm(
      context,
      title: '${names[q.itemType] ?? q.itemType} iptal edilsin mi?',
      // ⚠️ RAKAM YOK — gerekçe `mwConfirm` başlığında.
      body: q.count != null
          ? 'Üretimi biten birimler şehirde kalır. Kalan siparişin bedeli iade edilir; '
                'iadeden bir birimin bedeli düşülür.'
          : 'Harcanan kaynağın tamamlanmamış kısmı iade edilir; geçen süreye karşılık '
                'gelen kısım geri verilmez.',
      confirmLabel: 'İptal et',
      danger: true,
    );
    if (!ok) return;
    await _run(() => ref.read(cityQueuesProvider(widget.city.id)).cancel(q.id));
  }
}

/// Katalog satırı — ikon · ad(adet) · mağara · maliyet · ön koşul · adet kutusu · «Üret».
///
/// ⚠️ Durumlu (`StatefulWidget`): adet kutusuna yazılan her karakter hem toplam satırını hem
/// «Üret» düğmesinin açık/kapalı olmasını değiştiriyor. Durumsuz yazıp dışarıdan yeniden çizim
/// tetiklemek, TÜM listeyi her tuşta yeniden kurardı.
class _UnitRow extends ConsumerStatefulWidget {
  const _UnitRow({
    required this.unit,
    required this.city,
    required this.controller,
    required this.alt,
    required this.locked,
    required this.slotsFull,
    required this.busy,
    required this.onTrain,
  });

  final CatalogUnit unit;
  final CityDetail city;
  final TextEditingController controller;

  /// Zebra deseni — web'de `bg-row-alt`.
  final bool alt;
  final bool locked;
  final bool slotsFull;
  final bool busy;
  final void Function(int) onTrain;

  @override
  ConsumerState<_UnitRow> createState() => _UnitRowState();
}

class _UnitRowState extends ConsumerState<_UnitRow> {
  @override
  Widget build(BuildContext context) {
    final unit = widget.unit;
    final city = widget.city;
    final controller = widget.controller;
    final c = MwColors.of(context);
    final have = city.units[unit.id] ?? 0;
    final inCave = city.caveUnits[unit.id] ?? 0;

    // ⚠️ Dize olarak okunuyor: boş kutu 0, geçersiz metin de 0 → düğme kapalı kalır.
    final n = int.tryParse(controller.text.trim()) ?? 0;

    // Hesap ve kapı `train_rules.dart`ta — gerekçe orada, burada yalnız çizim var.
    final total = trainTotal(unit, n);
    final afford = city.gold >= total.gold && city.food >= total.food;
    final structures = city.structureLevels;
    final unmet = unmetRequirements(
      unit,
      structures: structures,
      techs: city.techs,
    );

    final acik = canTrain(
      count: n,
      afford: afford,
      hasUnmet: unmet.isNotEmpty,
      slotsFull: widget.slotsFull,
      locked: widget.locked,
      busy: widget.busy,
    );

    return Container(
      color: widget.alt ? c.raised.withValues(alpha: 0.35) : null,
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              MwIcon(folder: 'units', id: unit.id, size: 36),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Ad + parantez içinde ELDEKİ adet (web'de aynı biçim: «Cüce (302)»).
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: unit.name,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          TextSpan(
                            text: '  (${mwNumber(have)})',
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
                    // ⭐ Orijinal Baraka kartında mağaradaki adet de yazıyor. Yalnız 0'dan
                    // büyükse: mağarası olmayan oyuncunun her satırda sıfır görmesi gürültü.
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
                    if (unmet.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Text(
                          'Gerekli: ${unmet.map((r) {
                            final lv = r.kind == 'building' ? (structures[r.id] ?? 0) : (city.techs[r.id] ?? 0);
                            return '${r.name} ${r.level} ($lv)';
                          }).join(' · ')}',
                          style: TextStyle(fontSize: 11, color: c.danger),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          // ⭐ MOBİL: adet + düğme alt satırda SAĞA yaslı (web'in dar ekran düzeni).
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (n > 0)
                Expanded(
                  child: MwTotalLine(
                    gold: total.gold,
                    food: total.food,
                    seconds: total.seconds,
                    baseSeconds: total.baseSeconds,
                    afford: afford,
                  ),
                ),
              MwAmountInput(
                controller: controller,
                enabled: !widget.locked,
                // Her tuşta toplam satırı ve düğme durumu yeniden hesaplanmalı.
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(width: 8),
              MwSmallButton(
                label: 'Üret',
                onTap: acik ? () => widget.onTrain(n) : null,
                minWidth: 64,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
