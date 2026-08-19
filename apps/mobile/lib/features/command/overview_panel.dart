/// ⭐ GENEL DURUM — «Hükümdarlık» künyesi + teknikler + şehir tablosu.
///
/// Panel adı **«Hükümdarlık»**, sayfa adı «Genel Durum» — ikisi orijinalde de farklı.
///
/// ─ ⭐⭐ ŞEHİR TABLOSU DEVRİK VE İLK SÜTUNU SABİT ──────────────────────────────────────────
/// Satır = kalem (Altın · Cüce · Sur…), sütun = şehir. Bir ara tersiydi; orijinal de bu yönde
/// ve sebebi net: oyuncu *"hangi birimden toplam kaç tane, nerede"* diye bakıyor. Şehir sayısı
/// 4-10 arasında kalıyor ama birim türü 20'ye çıkıyor, yani sütunu şehre bağlamak tabloyu
/// dar tutuyor.
///
/// ⚠️⚠️ Telefonda beş şehir yedi sütun demek ve sığmıyor. Web `overflow-x-auto` ile yatay
/// kaydırıyor; burada da öyle **ama ilk sütun SABİT**. Fark kritik: kalem adı kayıp gitseydi
/// oyuncu sağa kaydırdığında hangi satıra baktığını kaybederdi — tablonun tek çıpası o sütun.
/// Savaş raporunda tabloyu tamamen bıraktık çünkü orada kaydırma **bilgiyi gizliyordu**;
/// burada gizlemiyor, çünkü çıpa yerinde duruyor ve başlık satırı şehir adlarını yazıyor.
///
/// ⚠️ İki taraf **aynı sabit satır yüksekliğini** kullanmak zorunda (`_rowH`): sabit sütun ile
/// kayan sütunlar ayrı `Column`'lar ve hizaları ancak böyle tutuyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../ui/primitives.dart';
import 'command_rules.dart';
import 'command_screen.dart';
import 'overview_model.dart';

/// Tablonun satır yüksekliği — sabit sütun ile kayan sütunların hizası buna bağlı.
const double _rowH = 38;

/// Kalem adı sütununun genişliği. ⚠️ Dar telefonda bile şehir sütunlarına yer kalmalı;
/// 118 px «Büyü Kalkanı» + 24 px ikonu alıyor ve 320 px'lik ekranda iki şehir sütunu sığıyor.
const double _labelW = 118;

/// Şehir sütunu genişliği — altı haneli kaynak sayısı sığacak kadar.
const double _colW = 76;

class OverviewPanel extends ConsumerWidget {
  const OverviewPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref
        .watch(overviewProvider)
        .when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => MwErrorBox('Genel durum alınamadı: $e'),
          data: (d) => Column(
            children: [
              _Realm(d: d),
              const SizedBox(height: 10),
              _CityTable(d: d),
            ],
          ),
        );
  }
}

/// Orijinalin «Hükümdarlık» paneli: künye + teknik seviyeleri.
class _Realm extends StatelessWidget {
  const _Realm({required this.d});

  final Overview d;

  @override
  Widget build(BuildContext context) {
    final p = d.player;
    final unvan = meritOf(p.meritTier);

    return MwPanel(
      title: 'Hükümdarlık',
      trailing: MwSnapshotNote(
        takenAt: d.ranking.takenAt,
        nextAt: d.ranking.nextAt,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Line(label: 'Puan', value: mwNumber(p.score), strong: true),
          _Line(label: 'Sıra', value: rankText(p.rank, p.totalPlayers)),
          _Line(label: 'Sıra Değişim', child: MwChangeText(p.rankChange)),

          /* ⭐ Kendi askerî unvanı — oyuncunun rozetini görebildiği TEK yer (terfi bildirimi
             anlıktır ve kaybolur). ⚠️ Unvansızken satır HİÇ çizilmiyor: boş bir «Rütbe: -»
             satırı, çoğu oyuncunun hiç kazanamayacağı bir alanı sürekli hatırlatırdı.
             ⚠️ Buradaki «Rütbe» ile İTTİFAK rolü (Asker/Konsey/Lider) farklı şeyler; bu
             panelde ittifak rolü hiç yazmadığı için çakışma ekrana yansımıyor. */
          if (unvan != null)
            _Line(
              label: 'Rütbe',
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // ⚠️ Dosya adı `kMeritTiers`ten ve o üretilmiş (`facts:check`): elle
                  // yazılsaydı rozet sessizce çizilmezdi.
                  MwIcon(folder: 'ranks', id: unvan.id, size: 18),
                  const SizedBox(width: 5),
                  Text(
                    unvan.name,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: MwColors.of(context).gold,
                    ),
                  ),
                ],
              ),
            ),

          _Line(label: 'İttifak Adı', value: p.alliance ?? '-'),
          _Line(
            label: 'İttifak Sırası',
            value: p.allianceRank == null ? '-' : mwNumber(p.allianceRank!),
          ),
          _Line(
            label: 'İttifak Sıra Değişim',
            child: MwChangeText(p.allianceRankChange),
          ),

          if (d.techs.isNotEmpty) ...[
            const SizedBox(height: 10),
            Divider(height: 1, color: MwColors.of(context).border),
            const SizedBox(height: 8),
            /* ⚠️ Teknikler İKİ SÜTUN: on iki teknik tek sütunda paneli gereksiz uzatıyor ve
               oyuncu künyeyi görmek için kaydırmak zorunda kalıyordu. ⚠️ Seviye 0 olan da
               yazılıyor (silik): "bu teknik var ama açmadım" bir bilgi. */
            for (var i = 0; i < d.techs.length; i += 2)
              Row(
                children: [
                  Expanded(child: _TechLine(d.techs[i])),
                  const SizedBox(width: 12),
                  Expanded(
                    child: i + 1 < d.techs.length
                        ? _TechLine(d.techs[i + 1])
                        : const SizedBox.shrink(),
                  ),
                ],
              ),
          ],
        ],
      ),
    );
  }
}

class _TechLine extends StatelessWidget {
  const _TechLine(this.t);

  final ({String id, String name, int level}) t;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              t.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: c.muted),
            ),
          ),
          Text(
            '${t.level}',
            style: TextStyle(
              fontSize: 12,
              // ⚠️ Açılmamış teknik SİLİK, gizli değil: listede olması "açılabilir" demek.
              color: t.level == 0 ? c.muted : null,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({
    required this.label,
    this.value,
    this.child,
    this.strong = false,
  });

  final String label;
  final String? value;
  final Widget? child;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: TextStyle(fontSize: 13, color: c.muted)),
          ),
          child ??
              Text(
                value ?? '',
                style: TextStyle(
                  fontSize: strong ? 16 : 13,
                  fontWeight: strong ? FontWeight.w700 : FontWeight.normal,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
        ],
      ),
    );
  }
}

/// Şehir tablosu — satır = kalem, sütun = şehir; ilk sütun sabit, gerisi yatay kayıyor.
class _CityTable extends ConsumerWidget {
  const _CityTable({required this.d});

  final Overview d;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final birimler = ownedTypes(d.unitTypes, d.totals.units);
    final savunma = ownedTypes(d.defenseTypes, d.totals.defenses);

    /* Satır tanımları tek yerde kuruluyor: sabit sütun ile kayan sütunlar AYNI listeyi
       geziyor, yoksa ikisi ayrışır ve hizalar kayardı. */
    final satirlar = <_RowSpec>[
      const _RowSpec.section('Kaynaklar'),
      _RowSpec.res('gold', 'Altın'),
      _RowSpec.res('food', 'Yemek'),
      const _RowSpec.section('Baraka'),
      if (birimler.isEmpty)
        const _RowSpec.empty('Henüz savaşçın yok.')
      else
        for (final t in birimler) _RowSpec.item(t.id, t.name, 'units'),
      const _RowSpec.section('Savunma'),
      if (savunma.isEmpty)
        const _RowSpec.empty('Henüz savunma birimin yok.')
      else
        for (final t in savunma) _RowSpec.item(t.id, t.name, 'defenses'),
    ];

    return MwPanel(
      title: 'Şehirler',
      trailing: Text(
        '${d.cities.length} şehir',
        style: TextStyle(
          fontSize: 11,
          color: MwColors.of(context).onPanelHeader,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ⚠️ SABİT ÇIPA: sağa kaydırılırken kalem adı ekranda kalıyor.
          SizedBox(
            width: _labelW,
            child: Column(
              children: [
                const SizedBox(height: _rowH), // başlık satırının hizası
                for (final r in satirlar) _LabelCell(r),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _HeaderRow(cities: d.cities),
                  for (final r in satirlar) _ValueRow(spec: r, d: d),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Bir tablo satırının ne olduğu. ⚠️ Bölüm şeridi ve boş satır da buraya giriyor ki sabit
/// sütun ile kayan sütunlar **aynı sayıda** satır çizsin.
class _RowSpec {
  const _RowSpec.section(this.label) : kind = 'section', id = '', folder = '';
  const _RowSpec.empty(this.label) : kind = 'empty', id = '', folder = '';
  const _RowSpec.res(this.id, this.label) : kind = 'res', folder = 'ui';
  const _RowSpec.item(this.id, this.label, this.folder) : kind = 'item';

  final String kind;
  final String id;
  final String label;
  final String folder;
}

class _LabelCell extends StatelessWidget {
  const _LabelCell(this.spec);

  final _RowSpec spec;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);

    if (spec.kind == 'section') {
      return Container(
        height: _rowH,
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        /* ⚠️ Bölüm şeridi panel BAŞLIĞININ rengini kullanıyor, uydurma bir ton değil: bir ara
           `raised` ile çiziliyordu ve satır zeminleriyle neredeyse aynıydı — üç tablo tek
           tablo gibi görünüyordu (web'de kullanıcı bildirdi). */
        color: c.panelHeader,
        child: Text(
          mwUpper(spec.label),
          style: mwDisplayStyle(fontSize: 11, color: c.onPanelHeader),
        ),
      );
    }
    if (spec.kind == 'empty') {
      return SizedBox(
        height: _rowH,
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text(
            spec.label,
            maxLines: 2,
            style: TextStyle(fontSize: 11, color: c.muted),
          ),
        ),
      );
    }

    return SizedBox(
      height: _rowH,
      child: Row(
        children: [
          MwIcon(folder: spec.folder, id: spec.id, size: 22),
          const SizedBox(width: 5),
          Expanded(
            child: Text(
              spec.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderRow extends StatelessWidget {
  const _HeaderRow({required this.cities});

  final List<OverviewCity> cities;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Row(
      children: [
        for (final city in cities)
          SizedBox(
            width: _colW,
            height: _rowH,
            child: Center(
              /* ⚠️ Şehir adı OYUNCUNUN yazdığı metin: Cinzel yok, büyütme yok. Web'de bu
                 satır iki kez düzeltildi — `uppercase` kaldırıldı ama Cinzel kaldığı için ad
                 hâlâ büyük görünüyordu (`mwDisplayStyle` başlığındaki kural). */
              child: Text(
                '${city.name}${city.isCapital ? ' ★' : ''}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        SizedBox(
          width: _colW,
          height: _rowH,
          child: Center(
            child: Text(
              mwUpper('Toplam'),
              style: mwDisplayStyle(fontSize: 11, color: c.muted),
            ),
          ),
        ),
      ],
    );
  }
}

class _ValueRow extends StatelessWidget {
  const _ValueRow({required this.spec, required this.d});

  final _RowSpec spec;
  final Overview d;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final genislik = _colW * (d.cities.length + 1);

    if (spec.kind == 'section') {
      return Container(width: genislik, height: _rowH, color: c.panelHeader);
    }
    if (spec.kind == 'empty') {
      return SizedBox(width: genislik, height: _rowH);
    }

    int degerOf(OverviewCity city) => switch (spec.kind) {
      'res' => spec.id == 'gold' ? city.gold : city.food,
      _ => (spec.folder == 'units' ? city.units : city.defenses)[spec.id] ?? 0,
    };

    final toplam = switch (spec.kind) {
      'res' => spec.id == 'gold' ? d.totals.gold : d.totals.food,
      _ =>
        (spec.folder == 'units'
                ? d.totals.units
                : d.totals.defenses)[spec.id] ??
            0,
    };

    return Row(
      children: [
        for (final city in d.cities)
          SizedBox(
            width: _colW,
            height: _rowH,
            child: Center(
              child: Text(
                // ⚠️ 0 için «-»: sıfır yazmak tabloyu okunamaz bir sayı denizine çeviriyor.
                degerOf(city) == 0
                    ? '-'
                    : cellAmount(spec.id, degerOf(city), mwNumber),
                style: TextStyle(
                  fontSize: 12,
                  color: degerOf(city) == 0 ? c.muted : null,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
        SizedBox(
          width: _colW,
          height: _rowH,
          child: Center(
            child: Text(
              // ⚠️ Sur/Kalkan SEVİYE taşıyor → şehirler arası TOPLANAMAZ (karar
              // `totalAmount`ta, testli).
              totalAmount(spec.id, toplam, mwNumber),
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
