/// ŞEHİR EKRANLARININ ORTAK PARÇALARI — şehir verisi sarmalayıcısı ve üretim bandı.
///
/// ⚠️ Üretim bandı bir ara Şehir hub'ında çiziliyordu; **ilgili ekrana taşındı** (Baraka'da
/// asker bandı, Yapılar'da inşaat). Hub bir gezinti listesi; oraya veri koymak, oyuncunun asıl
/// işini yaptığı ekranda o veriyi tekrar aramasına yol açıyordu.
///
/// ⭐⭐ Bandın HESABI burada DEĞİL, `core/city_progress.dart`ta ve web ile ortak vektörle
/// kilitli. Bu dosyada yalnız çizim var.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/city_progress.dart';
import '../../core/clock.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'city_model.dart';

/// Aktif şehrin verisini çeker, yükleme/hata durumlarını tek yerde çizer.
///
/// ⚠️ Her şehir ekranı bunu kendi başına yapsaydı beş ekranda beş farklı "yükleniyor" davranışı
/// olurdu; üstelik `cityProvider` aynı anahtarı paylaştığı için **ek istek gitmiyor**.
class CityData extends ConsumerWidget {
  const CityData({super.key, required this.builder});

  /// ⚠️ Fizik parametresi ŞART ve kutunun `physics:` alanına konmalı — gerekçe
  /// `MwRefresh`te: kısa içerikli ekran yoksa hiç kaydırılamıyor ve jest doğmuyor.
  final Widget Function(BuildContext, CityDetail, ScrollPhysics) builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(activeCityProvider).value;
    if (id == null) return const MwEmpty('Henüz bir şehrin yok.');

    return ref
        .watch(cityProvider(id))
        .when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Padding(
            padding: const EdgeInsets.all(16),
            child: MwErrorBox('Şehir alınamadı: $e'),
          ),
          /* ⭐ Aşağı çekerek tazeleme: emniyet ağı 60 sn'de bir tazeliyor ama oyuncunun
             "şimdi bak" diyebilmesi beklemekten iyi.

             ⚠️⚠️ **BİR ARA BEKLEMİYORDU** (2026-08-19'da düzeltildi): `invalidate` anında
             dönüyor, yani çark veri gelmeden kayboluyordu ve oyuncu eski sayılara bakarken
             "tazelendi" sanıyordu. Artık yeni `future`lar bekleniyor — gerekçe `MwRefresh`te.
             ⚠️ Fizik de eksikti: kısa içerikli bir ekran (tek satırlık Akademi) hiç
             kaydırılamadığı için jest hiç doğmuyordu. */
          data: (c) => MwRefresh(
            onRefresh: () {
              ref.invalidate(cityProvider(id));
              ref.invalidate(catalogProvider(id));
              return mwRefreshAll([
                ref.read(cityProvider(id).future),
                ref.read(catalogProvider(id).future),
              ]);
            },
            builder: (physics) => builder(context, c, physics),
          ),
        );
  }
}

/// ⭐ ÜRETİM BANDI — süren ve bekleyen emirler, sırayla.
///
/// ⚠️ Çağıran bunu **yalnız emir varken** çiziyor; boş bir «üretim bandı» paneli, oyuncuya
/// sürekli olmayan bir şeyin yerini gösteriyordu.
class ProductionBand extends ConsumerStatefulWidget {
  const ProductionBand({
    super.key,
    required this.city,
    required this.queues,
    required this.limit,
    required this.noun,
    required this.folder,
    required this.busy,
    required this.onMove,
    required this.onCancel,
    this.title = 'Üretim bandı',
  });

  final CityDetail city;

  /// Sıralanmış bant satırları (`position`a göre).
  final List<CityQueue> queues;

  /// Aynı anda kaç emir verilebilir — başlıkta `N/limit emir` diye yazıyor.
  final int limit;

  /// «asker» · «birim» — Savunma ekranında kelime değişiyor.
  final String noun;

  /// Görsel klasörü: `units` · `defenses`.
  final String folder;

  final bool busy;
  final void Function(int queueId, String direction) onMove;
  final void Function(CityQueue q) onCancel;

  /// «Üretim bandı» · «İnşaat» — Yapılar ekranında kelime değişiyor.
  final String title;

  @override
  ConsumerState<ProductionBand> createState() => _ProductionBandState();
}

class _ProductionBandState extends ConsumerState<ProductionBand> {
  /// ⚠️ Katlama tercihi ekranda tutuluyor, diske YAZILMIYOR: şehir şeridinin aksine bu panel
  /// yalnız emir varken görünüyor, yani "kapalı kaldı da haberim olmadı" durumu doğmuyor.
  bool _collapsed = false;

  @override
  Widget build(BuildContext context) {
    ref.watch(tickProvider);
    final clock = ref.watch(clockProvider);
    final names =
        ref.watch(catalogNamesProvider(widget.city.id)).value ?? const {};
    final c = MwColors.of(context);

    // ⚠️⚠️ Çıpa `gameNow` — `startedAt` oyun saatinde tutuluyor. Gerçek saatle okunursa her
    // sayaç dünyanın toplam duraklama süresi kadar ileri gider ve kısa süreli birimlerde bant
    // kalıcı olarak «tamamlandı» gösterir (canlıda yaşandı).
    final now = clock.gameNow();

    /// ⭐ Sıralama okları YALNIZ **en az iki bekleyen** emir varken. Tek bekleyen emirde
    /// gidecek başka yer yok; ok göstermek "bir işe yarar" izlenimi verip tıklayınca hiçbir
    /// şey yapmıyordu (web'de kullanıcı kararı, 2026-07-29).
    final waiting = widget.queues.where((q) => !q.isActive).length;

    return MwPanel(
      title: widget.title,
      trailing: GestureDetector(
        onTap: () => setState(() => _collapsed = !_collapsed),
        child: Text(
          '${widget.queues.length}/${widget.limit} emir · '
          '${_collapsed ? 'göster ▾' : 'gizle ▴'}',
          style: TextStyle(fontSize: 11, color: c.onPanelHeader),
        ),
      ),
      child: _collapsed
          ? const SizedBox.shrink()
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < widget.queues.length; i++)
                  _BandRow(
                    q: widget.queues[i],
                    now: now,
                    clock: clock,
                    name:
                        names[widget.queues[i].itemType] ??
                        widget.queues[i].itemType,
                    folder: widget.folder,
                    noun: widget.noun,
                    alt: i.isOdd,
                    showArrows: !widget.queues[i].isActive && waiting > 1,
                    busy: widget.busy,
                    onMove: widget.onMove,
                    onCancel: widget.onCancel,
                  ),
              ],
            ),
    );
  }
}

class _BandRow extends StatelessWidget {
  const _BandRow({
    required this.q,
    required this.now,
    required this.clock,
    required this.name,
    required this.folder,
    required this.noun,
    required this.alt,
    required this.showArrows,
    required this.busy,
    required this.onMove,
    required this.onCancel,
  });

  final CityQueue q;
  final int now;
  final MwClock clock;
  final String name;
  final String folder;
  final String noun;
  final bool alt;
  final bool showArrows;
  final bool busy;
  final void Function(int, String) onMove;
  final void Function(CityQueue) onCancel;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);

    final p = q.isActive && q.isBatch
        ? unitProgress(
            ProgressInput(
              startedAt: q.startedAt,
              count: q.count,
              perUnitSeconds: q.perUnitSeconds,
            ),
            now,
          )
        : null;

    // ⭐ Kalan adet TÜRETİLİR; sunucunun `remaining` alanı son okuma anındaki bayat hâli.
    final remaining = p?.remaining ?? q.count ?? 0;

    /// ⚠️ Seviye ilerletmede (yapı/teknik/Sur) ADET yok: parantezde kalan sayı yerine hedef
    /// seviye yazılır ve sayaç TEK BİRİM değil işin BİTİŞİ üzerinden çizilir.
    final levelBased = q.count == null;

    return Container(
      color: alt ? c.raised.withValues(alpha: 0.35) : null,
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              MwIcon(folder: folder, id: q.itemType, size: 36),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: name,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          TextSpan(
                            text: levelBased
                                ? '  (sv ${q.targetLevel ?? '?'})'
                                : '  (${mwNumber(remaining)})',
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
                    Text(
                      levelBased
                          ? (q.isActive ? 'sürüyor' : 'sırada bekliyor')
                          : q.isActive
                          ? 'sırada üretiliyor · $remaining $noun kaldı'
                          : 'bant boşalınca başlar · $remaining $noun',
                      style: TextStyle(fontSize: 11, color: c.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              if (!q.isActive) ...[
                Text(
                  'sıra ${q.position ?? '-'}',
                  style: TextStyle(fontSize: 11, color: c.muted),
                ),
                const SizedBox(width: 6),
                if (showArrows) ...[
                  _ArrowButton(
                    icon: Icons.arrow_upward,
                    tooltip: 'Yukarı',
                    onTap: busy ? null : () => onMove(q.id, 'up'),
                  ),
                  const SizedBox(width: 4),
                  _ArrowButton(
                    icon: Icons.arrow_downward,
                    tooltip: 'Aşağı',
                    onTap: busy ? null : () => onMove(q.id, 'down'),
                  ),
                ],
              ],
              const Spacer(),
              MwSmallButton(
                label: 'İptal et',
                kind: MwButtonKind.danger,
                onTap: busy ? null : () => onCancel(q),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (q.isActive && p != null)
            _UnitTicker(p: p, now: now, noun: noun)
          // ⚠️ Adetsiz (seviye) emirde sayaç işin BİTİŞİNDEN çizilir: tek-birim penceresi yok.
          else if (q.isActive)
            _WholeTicker(q: q, now: now, clock: clock)
          else
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                // ⚠️ `null` = başlangıç anı geçmiş. «birazdan» yazmak, geçmiş bir süreyi
                // göstermekten dürüst.
                'Başlıyor: ${clock.remaining(q.startedAt, now: now) ?? 'birazdan'}',
                style: TextStyle(fontSize: 11, color: c.muted),
              ),
            ),
        ],
      ),
    );
  }
}

/// ⭐ TEK BİR ASKERİN sayacı + çubuğu (kullanıcı kararı 2026-07-28).
///
/// Ekranda 300 birimin toplam süresi değil, sıradaki BİR birimin geri sayımı görünür ve
/// dolunca sıfırlanır, kalan adet bir azalır.
///
/// ⭐ Çubuk yeni askere geçerken **animasyon kapanır**: %100'den %0'a yumuşak geçiş, dolmuş
/// çubuğun geri sarması gibi görünüyordu (web'de aynı karar).
class _UnitTicker extends StatelessWidget {
  const _UnitTicker({required this.p, required this.now, required this.noun});

  final UnitProgress p;
  final int now;
  final String noun;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final span = (p.unitEnd - p.unitStart).clamp(1, 1 << 40);
    final pct = p.finished ? 1.0 : ((now - p.unitStart) / span).clamp(0.0, 1.0);
    final leftSec = ((p.unitEnd - now) / 1000).clamp(0, double.infinity);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: c.border)),
          ),
          padding: const EdgeInsets.only(top: 6, bottom: 4),
          child: Row(
            children: [
              Text(
                'sıradaki $noun',
                style: TextStyle(fontSize: 11, color: c.muted),
              ),
              const Spacer(),
              Text(
                p.finished
                    ? 'sipariş tamamlandı'
                    : formatDuration(leftSec.toDouble()),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: c.warning,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
        MwBar(
          value: pct,
          // Yeni pencerenin ilk saniyesinde çubuk geri sarmasın diye geçiş kapatılır.
          animate: p.finished || now - p.unitStart >= 1200,
        ),
      ],
    );
  }
}

/// İşin TAMAMININ sayacı — seviye ilerleten emirlerde (yapı · teknik · Sur).
///
/// ⚠️ `_UnitTicker`ın yerine geçmez: orada pencere tek bir birimindir ve dolunca sıfırlanır,
/// burada tek bir iş baştan sona akar.
class _WholeTicker extends StatelessWidget {
  const _WholeTicker({required this.q, required this.now, required this.clock});

  final CityQueue q;
  final int now;
  final MwClock clock;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    // ⚠️ `gameNow` çıpası: `startedAt`/`finishAt` oyun saatinde. Web'de bir ara çubuk gerçek
    // saatte, hemen yanındaki yazı oyun saatinde koşuyordu.
    final start = DateTime.tryParse(q.startedAt)?.millisecondsSinceEpoch;
    final end = DateTime.tryParse(q.finishAt)?.millisecondsSinceEpoch;
    final pct = (start == null || end == null || end <= start)
        ? 0.0
        : ((now - start) / (end - start)).clamp(0.0, 1.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: c.border)),
          ),
          padding: const EdgeInsets.only(top: 6, bottom: 4),
          child: Row(
            children: [
              Text('kalan', style: TextStyle(fontSize: 11, color: c.muted)),
              const Spacer(),
              Text(
                clock.remaining(q.finishAt, now: now) ?? 'birazdan biter…',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: c.warning,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
        MwBar(value: pct),
      ],
    );
  }
}

class _ArrowButton extends StatelessWidget {
  const _ArrowButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            border: Border.all(color: c.borderStrong),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(icon, size: 16, color: onTap == null ? c.muted : null),
        ),
      ),
    );
  }
}

/// Sayı gösteren basit liste paneli — ordu ve yapı dökümü aynı biçimde çiziliyor.
class CountsPanel extends ConsumerWidget {
  const CountsPanel({
    super.key,
    required this.title,
    required this.counts,
    required this.folder,
    required this.cityId,
    this.suffix,
    this.emptyText = 'Kayıt yok.',
  });

  final String title;
  final Map<String, int> counts;
  final String folder;
  final int cityId;

  /// Sayının önüne gelen etiket (`sv.` gibi). Ordu dökümünde yok.
  final String? suffix;
  final String emptyText;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final names = ref.watch(catalogNamesProvider(cityId)).value ?? const {};

    // ⚠️ Sunucudan gelen sıra rastgele (satır sırası); ada göre sıralanıyor ki her açılışta
    // aynı yerde dursunlar. Sıçrayan bir liste, dokunmatikte yanlış satıra basmak demek.
    final rows = counts.entries.where((e) => e.value > 0).toList()
      ..sort(
        (a, b) => (names[a.key] ?? a.key).compareTo(names[b.key] ?? b.key),
      );

    if (rows.isEmpty) return MwPanel(title: title, child: MwEmpty(emptyText));

    return MwPanel(
      title: title,
      child: Column(
        children: [
          for (final e in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  MwIcon(folder: folder, id: e.key, size: 22),
                  const SizedBox(width: 8),
                  Expanded(child: Text(names[e.key] ?? e.key)),
                  Text(
                    suffix == null ? mwNumber(e.value) : '$suffix ${e.value}',
                    style: const TextStyle(
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
