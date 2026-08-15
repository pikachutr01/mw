/// ŞEHİR EKRANLARININ ORTAK PARÇALARI — üretim bandı ve şehir verisi sarmalayıcısı.
///
/// ⚠️ Üretim bandı bir ara Şehir hub'ında çiziliyordu; **ilgili ekrana taşındı** (Baraka'da
/// asker bandı, Yapılar'da yapı kuyruğu). Hub bir gezinti listesi; oraya veri koymak, oyuncunun
/// asıl işini yaptığı ekranda o veriyi tekrar aramasına yol açıyordu.
///
/// ⭐⭐ Bandın hesabı burada DEĞİL, `core/city_progress.dart`ta ve web ile ortak vektörle
/// kilitli. Bu dosyada yalnız çizim var.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/city_progress.dart';
import '../../core/clock.dart';
import '../../ui/primitives.dart';
import 'city_model.dart';

/// Aktif şehrin verisini çeker, yükleme/hata durumlarını tek yerde çizer.
///
/// ⚠️ Her şehir ekranı bunu kendi başına yapsaydı beş ekranda beş farklı "yükleniyor" davranışı
/// olurdu; üstelik `cityProvider` aynı anahtarı paylaştığı için **ek istek gitmiyor**.
class CityData extends ConsumerWidget {
  const CityData({super.key, required this.builder});

  final Widget Function(BuildContext, CityDetail) builder;

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
          data: (c) => RefreshIndicator(
            // ⭐ Aşağı çekerek tazeleme: emniyet ağı 60 sn'de bir tazeliyor ama oyuncunun
            // "şimdi bak" diyebilmesi beklemekten iyi.
            onRefresh: () async => ref.invalidate(cityProvider(id)),
            child: builder(context, c),
          ),
        );
  }
}

/// ⭐ ÜRETİM BANDI — sayaç TEK BİRİMLİK (kullanıcı kararı 2026-07-28).
///
/// Ekranda 300 birimin toplam süresi değil, sıradaki BİR birimin geri sayımı görünür ve
/// dolunca sıfırlanır, kalan adet bir azalır.
///
/// ⚠️ `only` süzgeci: Baraka yalnız `unit`, Yapılar yalnız `building` satırlarını gösteriyor.
/// Hepsini her ekranda göstermek, oyuncuya o ekranda yapamayacağı işleri listelemek olurdu.
class ProductionBand extends ConsumerWidget {
  const ProductionBand({
    super.key,
    required this.city,
    required this.only,
    this.title = 'Üretim bandı',
    this.emptyText = 'Şu an süren bir iş yok.',
  });

  final CityDetail city;
  final Set<String> only;
  final String title;
  final String emptyText;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(tickProvider);
    final clock = ref.watch(clockProvider);
    final names = ref.watch(catalogNamesProvider(city.id)).value ?? const {};

    final rows = city.queues.where((q) => only.contains(q.category)).toList();
    if (rows.isEmpty) {
      return MwPanel(title: title, child: MwEmpty(emptyText));
    }

    // ⚠️⚠️ Çıpa `gameNow` — `startedAt` oyun saatinde tutuluyor. Gerçek saatle okunursa her
    // sayaç dünyanın toplam duraklama süresi kadar ileri gider ve kısa süreli birimlerde bant
    // kalıcı olarak «tamamlandı» gösterir (canlıda yaşandı).
    final now = clock.gameNow();

    return MwPanel(
      title: title,
      child: Column(
        children: [
          for (final q in rows)
            QueueRowTile(q: q, now: now, clock: clock, names: names),
        ],
      ),
    );
  }
}

class QueueRowTile extends StatelessWidget {
  const QueueRowTile({
    super.key,
    required this.q,
    required this.now,
    required this.clock,
    required this.names,
  });

  final CityQueue q;
  final int now;
  final MwClock clock;
  final Map<String, String> names;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);

    // Bant yalnız ADETLİ ve AKTİF satırda çizilir; bekleyen emir henüz bandın sahibi değil.
    final p = q.isBatch && q.isActive
        ? unitProgress(
            ProgressInput(
              startedAt: q.startedAt,
              count: q.count,
              perUnitSeconds: q.perUnitSeconds,
            ),
            now,
          )
        : null;

    final name = names[q.itemType] ?? q.itemType;
    final title = q.targetLevel != null ? '$name → ${q.targetLevel}' : name;

    // Adetli satırda geri sayım TEK BİRİMİN penceresinden; diğerlerinde işin bitişinden.
    final left = p != null
        ? clock.remaining(
            DateTime.fromMillisecondsSinceEpoch(
              p.unitEnd,
              isUtc: true,
            ).toIso8601String(),
            now: now,
          )
        : clock.remaining(q.finishAt, now: now);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              MwIcon(folder: folderOf(q.category), id: q.itemType, size: 22),
              const SizedBox(width: 8),
              Expanded(child: Text(title)),
              if (p != null)
                Text(
                  'kalan ${p.remaining}',
                  style: TextStyle(color: c.muted, fontSize: 12),
                ),
              const SizedBox(width: 8),
              Text(
                // ⚠️ `null` = bitmiş. Sunucunun kapatma görevi birazdan satırı silecek;
                // o ana kadar «birazdan» yazmak, donmuş bir sayı göstermekten dürüst.
                left ?? 'birazdan',
                style: TextStyle(
                  fontFeatures: const [FontFeature.tabularFigures()],
                  color: left == null ? c.muted : null,
                ),
              ),
            ],
          ),
          if (p != null) ...[
            const SizedBox(height: 6),
            LinearProgressIndicator(
              value: ratio(p.unitStart, p.unitEnd, now),
              minHeight: 6,
            ),
          ],
          if (!q.isActive)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'sırada',
                style: TextStyle(color: c.muted, fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }
}

/// ⚠️ 0..1 aralığına kelepçeli: `now` pencereyi aşmışsa (bitmiş ama satır hâlâ açık)
/// `LinearProgressIndicator` 1'in üstünde bir değerle çizilemez.
double ratio(int start, int end, int now) {
  if (end <= start) return 0;
  return ((now - start) / (end - start)).clamp(0.0, 1.0);
}

/// ⚠️ Görsel klasörü kategoriye göre: savunma birimlerinin resmi `assets/defenses/` altında
/// (web `City.tsx` · `art` parametresiyle aynı ayrım).
String folderOf(String category) => switch (category) {
  'unit' => 'units',
  'defense' => 'defenses',
  'tech' => 'techs',
  _ => 'buildings',
};

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
