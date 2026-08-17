/// ⭐⭐ SEFER FORMU — oyunun **tek görev başlatma kapısı**.
///
/// Doküman (DÜNYA): *"tüm görev seçenekleri de (saldırı, nakliye, casusluk, destek, şehir
/// kurma ve teleport) yalnızca dünya menüsünden yapılabilir"*. Web'de bu bir modal
/// (`world-modal.tsx`), mobilde uzun bir bottom sheet (`mwTallSheet`).
///
/// ─ Ekrandaki kararlar ────────────────────────────────────────────────────────────────────
///  • ⭐ **Süre canlı**: seçilen ordunun EN YAVAŞ birimine göre yeniden hesaplanıyor. Hesap
///    motorun aynı formülünden (`core/travel.dart`, vektörle kilitli); otorite yine sunucu.
///  • ⭐ **Serbest adet gösteriliyor**, ham mevcut değil: mağaraya söz verilmiş askerlerle
///    sefere çıkılamıyor ve ham sayı, oyuncuya sunucunun reddedeceği bir seçim yaptırırdı.
///  • ⭐ Parantezdeki sayı **şehirde KALAN** adet; kutu doldukça canlı azalıyor.
///  • ⚠️ Kapalı görevde form yine açılıyor ama gönderilemiyor — sebebi üstte kırmızı kutuda.
///    Dünya listesindeki kısayol seçenek listesini atlayabildiği için bu kontrol ŞART.
///  • ⚠️ Kural anlatan paragraflar YOK (web'de kullanıcı kaldırttı): yalnız o an karar için
///    gereken **sayı** var (kalan saldırı hakkı, kapasite).
///
/// ⚠️ Durum düz `setState` ile tutuluyor, ekrana özel bir sağlayıcıyla değil — depodaki diğer
/// formlarla (`buildings_screen`, `trainable_screen`) aynı kalıp. Sheet kapanınca durum
/// kendiliğinden ölüyor, yani oyuncu bir sonraki hedefe önceki seçimiyle girmiyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../core/clock.dart';
import '../../core/travel.dart';
import '../city/catalog_model.dart';
import '../city/city_model.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'mission_options.dart';
import 'mission_rules.dart';

/// Formu açar. `option` sunucunun o tip için verdiği izin (kapalıysa sebebiyle).
Future<void> showMissionForm(
  BuildContext context, {
  required String type,
  required int originCityId,
  required ({int k, int d, int s}) target,
  required MissionOption? option,
  required int? attacksLeft,
}) {
  return mwTallSheet<void>(
    context,
    title: kMissionInfo[type]?.title ?? type,
    child: MissionForm(
      type: type,
      originCityId: originCityId,
      target: target,
      option: option,
      attacksLeft: attacksLeft,
    ),
  );
}

class MissionForm extends ConsumerStatefulWidget {
  const MissionForm({
    super.key,
    required this.type,
    required this.originCityId,
    required this.target,
    required this.option,
    required this.attacksLeft,
  });

  final String type;
  final int originCityId;
  final ({int k, int d, int s}) target;
  final MissionOption? option;
  final int? attacksLeft;

  @override
  ConsumerState<MissionForm> createState() => _MissionFormState();
}

class _MissionFormState extends ConsumerState<MissionForm> {
  final Map<String, int> _units = {};
  final List<int> _heroIds = [];
  int _gold = 0;
  int _food = 0;
  bool _busy = false;
  String? _error;

  MwFormRule get _rule => formRule(widget.type);

  /// ⭐ Sunucu bu görevi kapattıysa form gönderilemez (acemi koruması, teleport beklemesi…).
  bool get _blocked => widget.option != null && !widget.option!.enabled;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final info = kMissionInfo[widget.type];

    final city = ref.watch(cityProvider(widget.originCityId)).value;
    final catalog = ref.watch(catalogProvider(widget.originCityId)).value;
    if (city == null || catalog == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final serbest = freeUnits(city.units, city.caveStoreUnits);
    final gorunur = _visibleUnits(
      catalog,
      _rule.units,
    ).where((u) => (serbest[u.id] ?? 0) > 0).toList();

    final kapasite = carryCapacity(
      _units,
      (id) => _unit(catalog, id)?.carry ?? 0,
    );
    final kargoToplam = _gold + _food;
    final sigar = kargoToplam <= kapasite;
    final yeter = city.gold >= _gold && city.food >= _food;

    final gonderilebilir = canSendMission(
      type: widget.type,
      blocked: _blocked,
      unitCount: _units.length,
      heroCount: _heroIds.length,
      cargoFits: sigar,
      affordCargo: yeter,
      cargoTotal: kargoToplam,
      pending: _busy,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── Kayan bölüm ────────────────────────────────────────────────────
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Header(
                  icon: info?.icon ?? 'attack',
                  title: info?.title ?? widget.type,
                  eta: _etaText(city, catalog),
                ),
                const SizedBox(height: 12),

                if (_blocked) ...[
                  MwErrorBox(
                    widget.option?.reason ?? 'Bu görev şu anda gönderilemez.',
                  ),
                  const SizedBox(height: 10),
                ],

                // ⭐ Kural anlatmak yerine SAYI: oyuncu kaç hakkı kaldığını görüyor.
                if (widget.type == 'attack' &&
                    widget.attacksLeft != null &&
                    !_blocked) ...[
                  _AttacksLeft(left: widget.attacksLeft!),
                  const SizedBox(height: 10),
                ],

                if (_rule.units != MwUnitScope.none)
                  gorunur.isEmpty
                      ? MwEmpty(_bosOrduMetni())
                      : _unitList(gorunur, serbest, c),

                if (kHeroMissions.contains(widget.type)) ...[
                  const SizedBox(height: 12),
                  _HeroPicker(
                    cityId: widget.originCityId,
                    picked: _heroIds,
                    onToggle: (id) => setState(() {
                      _heroIds.contains(id)
                          ? _heroIds.remove(id)
                          : _heroIds.add(id);
                      _error = null;
                    }),
                  ),
                ],
              ],
            ),
          ),
        ),

        // ── Sabit alt bölüm ────────────────────────────────────────────────
        // ⚠️ Kargo ve gönder düğmesi kaydırmaya KARIŞMIYOR: birim listesi uzasa da hep
        // görünür kalmalı (web'de de `sticky bottom-0`).
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_rule.cargo) ...[
                _CargoBox(
                  capacity: kapasite,
                  total: kargoToplam,
                  fits: sigar,
                  afford: yeter,
                  type: widget.type,
                  onGold: (v) => setState(() {
                    _gold = v;
                    _error = null;
                  }),
                  onFood: (v) => setState(() {
                    _food = v;
                    _error = null;
                  }),
                ),
                const SizedBox(height: 8),
              ],
              if (_error != null) ...[
                MwErrorBox(_error!),
                const SizedBox(height: 8),
              ],
              MwButton(
                label: '${info?.title ?? widget.type} başlat',
                busy: _busy,
                onTap: gonderilebilir ? _gonder : null,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _unitList(
    List<CatalogUnit> gorunur,
    Map<String, int> serbest,
    MwColors c,
  ) => Container(
    decoration: BoxDecoration(
      border: Border.all(color: c.border),
      borderRadius: BorderRadius.circular(6),
    ),
    clipBehavior: Clip.antiAlias,
    child: Column(
      children: [
        for (var i = 0; i < gorunur.length; i++)
          _UnitRow(
            unit: gorunur[i],
            have: serbest[gorunur[i].id] ?? 0,
            picked: _units[gorunur[i].id] ?? 0,
            alt: i.isOdd,
            onChange: (n) => setState(() {
              n > 0 ? _units[gorunur[i].id] = n : _units.remove(gorunur[i].id);
              _error = null;
            }),
          ),
      ],
    ),
  );

  String _bosOrduMetni() => switch (_rule.units) {
    MwUnitScope.spy => 'Şehrinde Casus Kuş yok. Önce Baraka\'dan üret.',
    _ when kArmyOptional.contains(widget.type) =>
      'Şehrinde savaşçı yok — kahraman tek başına da gidebilir.',
    _ => 'Şehrinde savaşçı yok. Önce Baraka\'dan üret.',
  };

  CatalogUnit? _unit(CityCatalog cat, String id) =>
      cat.units.where((u) => u.id == id).firstOrNull;

  /// Süre önizlemesi. `—` → ordu da kahraman da seçilmemiş.
  String _etaText(CityDetail city, CityCatalog catalog) {
    if (widget.type == 'teleport') return 'anlık';

    final leg = route(city.coordinates, widget.target, city.map);

    /// ⚠️ Kahraman sayısı da geçiliyor: kahraman orduyu **yavaşlatabilir**. Geçmezsek
    /// «9 kuş + 1 kahraman» önizlemesi 40 sn yazar, sunucu 20 dk hesaplar (gerekçe
    /// `core/travel.dart` · `armySpeed`).
    final hiz = armySpeed(
      _units,
      (id) => _unit(catalog, id)?.speed,
      heroCount: _heroIds.length,
    );
    if (hiz == null) return '—';

    return formatDuration(
      travelSeconds(
        distance: leg.distance,
        speed: hiz,
        cartography: city.techs['cartography'] ?? 0,
        crossesDistrict: leg.crossesDistrict,
        crossesContinent: leg.crossesContinent,
        speedMultiplier: city.travelSpeedMultiplier,
        cfg: city.map,
      ),
    );
  }

  Future<void> _gonder() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(missionsProvider)
          .send(
            type: widget.type,
            originCityId: widget.originCityId,
            target: widget.target,
            units: _units,
            heroIds: _heroIds,
            cargo: _rule.cargo ? (gold: _gold, food: _food) : null,
          );
      await mwTapOk();
      // ⚠️ Sheet'i kapatan taraf BURASI: gönderimden sonra açık kalan bir form, oyuncuyu
      // aynı orduyu ikinci kez göndermeye davet ederdi.
      if (mounted) Navigator.of(context).pop();
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    } catch (_) {
      await mwTapError();
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Sunucuya ulaşılamadı.';
        });
      }
    }
  }
}

/// Hangi birimler listelenir — kural `mission_rules.dart`ta.
List<CatalogUnit> _visibleUnits(CityCatalog cat, MwUnitScope scope) =>
    switch (scope) {
      MwUnitScope.spy => cat.units.where((u) => u.id == 'spy_bird').toList(),
      MwUnitScope.warriors =>
        cat.units.where((u) => u.id != 'spy_bird').toList(),
      MwUnitScope.all => cat.units,
      MwUnitScope.none => const [],
    };

class _Header extends StatelessWidget {
  const _Header({required this.icon, required this.title, required this.eta});

  final String icon;
  final String title;
  final String eta;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Row(
      children: [
        MwIcon(folder: 'missions', id: icon, size: 36),
        const SizedBox(width: 10),
        Text(
          title,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
        const Spacer(),
        Text('Süre: ', style: TextStyle(fontSize: 12, color: c.muted)),
        Text(
          eta,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

class _AttacksLeft extends StatelessWidget {
  const _AttacksLeft({required this.left});

  final int left;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final bitti = left <= 0;
    return Container(
      padding: const EdgeInsets.all(9),
      decoration: BoxDecoration(
        border: Border.all(color: bitti ? c.danger : c.border),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        'Bu şehre bugün kalan saldırı hakkın: $left',
        style: TextStyle(fontSize: 12, color: bitti ? c.danger : c.muted),
      ),
    );
  }
}

class _UnitRow extends StatefulWidget {
  const _UnitRow({
    required this.unit,
    required this.have,
    required this.picked,
    required this.alt,
    required this.onChange,
  });

  final CatalogUnit unit;
  final int have;
  final int picked;
  final bool alt;
  final ValueChanged<int> onChange;

  @override
  State<_UnitRow> createState() => _UnitRowState();
}

class _UnitRowState extends State<_UnitRow> {
  final _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  /// ⚠️ Kelepçe yalnız ÜST sınırda ve yalnız aşıldığında metne yazılıyor. Her tuşta
  /// kelepçelemek alanı boşaltmayı imkânsız kılıyor: oyuncu `1`i silince alan anında 1'e
  /// sıçrar ve `23` yazmak için önce metni seçmek gerekirdi (web'de tam bu yaşandı).
  void _yaz(String raw) {
    final n = int.tryParse(raw.trim()) ?? 0;
    final k = n.clamp(0, widget.have);
    if (k != n && raw.trim().isNotEmpty) {
      _c.text = '$k';
      _c.selection = TextSelection.collapsed(offset: _c.text.length);
    }
    widget.onChange(k);
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    // ⭐ Parantezdeki sayı ŞEHİRDE KALAN adet — kutu doldukça canlı azalıyor, oyuncu
    // «kaç tanesi evde kalıyor» sorusunu ayrıca hesaplamak zorunda kalmıyor.
    final kalan = (widget.have - widget.picked).clamp(0, widget.have);

    return Container(
      color: widget.alt ? c.raised.withValues(alpha: 0.35) : null,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      child: Row(
        children: [
          MwIcon(folder: 'units', id: widget.unit.id, size: 32),
          const SizedBox(width: 8),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: widget.unit.name),
                  TextSpan(
                    text: '  (${mwNumber(kalan)})',
                    style: TextStyle(color: c.muted, fontSize: 12),
                  ),
                ],
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          MwAmountInput(controller: _c, hint: '0', width: 64, onChanged: _yaz),
          const SizedBox(width: 4),
          MwSmallButton(
            label: 'hepsi',
            kind: MwButtonKind.ghost,
            onTap: () {
              _c.text = '${widget.have}';
              widget.onChange(widget.have);
            },
          ),
        ],
      ),
    );
  }
}

class _HeroPicker extends ConsumerWidget {
  const _HeroPicker({
    required this.cityId,
    required this.picked,
    required this.onToggle,
  });

  final int cityId;
  final List<int> picked;
  final ValueChanged<int> onToggle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final heroes = ref.watch(cityHeroesProvider(cityId)).value ?? const [];
    // ⚠️ Şehirde uygun kahraman yoksa bölüm HİÇ çizilmiyor: boş bir «Kahraman» başlığı,
    // seçilebilecek bir şey varmış gibi görünürdü.
    if (heroes.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text(
            'Kahraman (isteğe bağlı)',
            style: TextStyle(fontSize: 11, color: c.muted),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: c.border),
            borderRadius: BorderRadius.circular(6),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (final h in heroes)
                CheckboxListTile(
                  dense: true,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: picked.contains(h.id),
                  onChanged: (_) => onToggle(h.id),
                  title: Text(h.name, maxLines: 1),
                  secondary: Text(
                    'sv ${h.level}',
                    style: TextStyle(fontSize: 12, color: c.muted),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CargoBox extends StatefulWidget {
  const _CargoBox({
    required this.capacity,
    required this.total,
    required this.fits,
    required this.afford,
    required this.type,
    required this.onGold,
    required this.onFood,
  });

  final int capacity;
  final int total;
  final bool fits;
  final bool afford;
  final String type;
  final ValueChanged<int> onGold;
  final ValueChanged<int> onFood;

  @override
  State<_CargoBox> createState() => _CargoBoxState();
}

class _CargoBoxState extends State<_CargoBox> {
  final _gold = TextEditingController();
  final _food = TextEditingController();

  @override
  void dispose() {
    _gold.dispose();
    _food.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);

    return Container(
      padding: const EdgeInsets.all(9),
      decoration: BoxDecoration(
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'Gönderilecek kaynak',
                style: TextStyle(fontSize: 11, color: c.muted),
              ),
              const Spacer(),
              Text(
                '${mwNumber(widget.total)} / ${mwNumber(widget.capacity)}',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: widget.fits ? FontWeight.normal : FontWeight.w700,
                  color: widget.fits ? c.muted : c.danger,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const MwIcon(folder: 'ui', id: 'gold', size: 16),
              const SizedBox(width: 4),
              MwAmountInput(
                controller: _gold,
                hint: '0',
                width: 82,
                onChanged: (v) => widget.onGold(int.tryParse(v.trim()) ?? 0),
              ),
              const SizedBox(width: 12),
              const MwIcon(folder: 'ui', id: 'food', size: 16),
              const SizedBox(width: 4),
              MwAmountInput(
                controller: _food,
                hint: '0',
                width: 82,
                onChanged: (v) => widget.onFood(int.tryParse(v.trim()) ?? 0),
              ),
            ],
          ),
          // ⚠️ Sunucunun `carry_capacity` reddini forma TAŞIMADAN söylüyoruz: yalnız
          // kahraman ya da yalnız kuş seçildiğinde kapasite 0 ve sebebi görünmüyordu.
          if (!widget.afford)
            _Not('Şehrinin kaynağı yetmiyor.', renk: c.danger)
          else if (widget.capacity == 0 && widget.total > 0)
            _Not(
              'Seçtiğin orduda kaynak taşıyabilecek birim yok — Yük Arabası ekle.',
              renk: c.danger,
            )
          else if (widget.type == 'support' || widget.type == 'found_city')
            _Not('Kaynak göndermek isteğe bağlı.', renk: c.muted),
        ],
      ),
    );
  }
}

class _Not extends StatelessWidget {
  const _Not(this.text, {required this.renk});

  final String text;
  final Color renk;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 5),
    child: Text(text, style: TextStyle(fontSize: 11, color: renk)),
  );
}
