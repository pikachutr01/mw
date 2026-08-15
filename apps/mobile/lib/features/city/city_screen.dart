/// ŞEHİR — kaynak sayacı, yapılar ve üretim bandı.
///
/// Web'de bu bilgi iki yere dağılmış: kaynak çubuğu `Shell.tsx` · `InfoBar`da (her ekranın
/// üstünde), yapı/bant ise `City.tsx`te. Mobilde tek ekranda toplandı — telefonda kalıcı bir
/// üst bilgi çubuğu, zaten dar olan dikey alanın her ekranda bir dilimini yerdi.
///
/// ⭐⭐ İki sayaç da **istemcide türetiliyor** ve hesapları `core/city_progress.dart`ta, web ile
/// ortak vektörle kilitli. Burada yalnız çizim var; formül yok.
///
/// ⚠️⚠️ ÇIPALAR FARKLI ve karıştırılması iki kez canlı hata üretti:
///   • kaynak sayacı → `serverNow` (yanıtın gerçek okunma anı)
///   • üretim bandı  → `gameNow`   (oyun saati; bakımda DONAR)
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/city_progress.dart';
import '../../core/clock.dart';
import '../../ui/primitives.dart';
import 'city_model.dart';

class CityScreen extends ConsumerWidget {
  const CityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = ref.watch(activeCityProvider);

    return active.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => const MwErrorBox('Şehir listesi alınamadı.'),
      data: (id) {
        if (id == null) return const MwEmpty('Henüz bir şehrin yok.');
        return _CityBody(cityId: id);
      },
    );
  }
}

class _CityBody extends ConsumerWidget {
  const _CityBody({required this.cityId});

  final int cityId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final city = ref.watch(cityProvider(cityId));

    return city.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(16),
        child: MwErrorBox('Şehir alınamadı: $e'),
      ),
      data: (c) => RefreshIndicator(
        // ⭐ Aşağı çekerek tazeleme: emniyet ağı 60 sn'de bir tazeliyor ama oyuncunun
        // "şimdi bak" diyebilmesi, beklemekten daha iyi bir cevap.
        onRefresh: () async => ref.invalidate(cityProvider(cityId)),
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            _Header(city: c),
            const SizedBox(height: 12),
            _Resources(city: c),
            const SizedBox(height: 12),
            _Queues(city: c),
            const SizedBox(height: 12),
            _Buildings(city: c),
          ],
        ),
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.city});

  final CityDetail city;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cities = ref.watch(citiesProvider).value ?? const [];
    final co = city.coordinates;

    return MwPanel(
      title: city.name,
      trailing: city.isCapital
          ? const Text('Başkent', style: TextStyle(fontSize: 12))
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${co.k}:${co.d}:${co.s}',
            style: TextStyle(color: MwColors.of(context).muted),
          ),
          if (city.onVacation) ...[
            const SizedBox(height: 8),
            // ⭐ Ayrı bayrak: «üretim 0 ⇒ tatilde» çıkarımı yanlış olurdu (yeni şehrin de
            // üretimi 0). Sunucu ayrımı veriyor, ekran onu gösteriyor.
            Text(
              'Tatil modunda — üretim durdu.',
              style: TextStyle(color: MwColors.of(context).warning),
            ),
          ],
          // ⚠️ Şehir seçici yalnız birden çok şehir varken: tek şehirli oyuncuya hiçbir şey
          // seçtirmeyen bir açılır liste göstermek gürültü.
          if (cities.length > 1) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: city.id,
              decoration: const InputDecoration(
                labelText: 'Şehir',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: [
                for (final s in cities)
                  DropdownMenuItem(value: s.id, child: Text(s.name)),
              ],
              onChanged: (v) {
                if (v != null) ref.read(activeCityProvider.notifier).select(v);
              },
            ),
          ],
        ],
      ),
    );
  }
}

/// ⭐ KAYNAK SAYACI — saniyede bir, ekstrapolasyonla.
class _Resources extends ConsumerWidget {
  const _Resources({required this.city});

  final CityDetail city;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Saniyelik sayaca abone ol; değerin kendisi kullanılmıyor, tetiklemesi yeterli.
    ref.watch(tickProvider);
    final clock = ref.watch(clockProvider);

    // ⚠️ Çıpa `serverNow` — `gameNow` DEĞİL (dosya başlığındaki gerekçe).
    final r = extrapolateResources(
      ResourceInput(
        gold: city.gold,
        food: city.food,
        goldPerHour: city.goldPerHour,
        foodPerHour: city.foodPerHour,
        serverNow: city.serverNow,
      ),
      clock.serverNow(),
    );

    return MwPanel(
      title: 'Kaynaklar',
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _ResChip(
            kind: 'gold',
            // ⚠️ `floor` — sunucu tam sayı tutuyor ve yuvarlama, oyuncunun ekranda gördüğü
            // sayının bir an için gerçekte sahip olduğundan FAZLA çıkmasına yol açardı.
            // Bir yapıya "yetiyor" sanıp reddedilmek, eksik göstermekten kötü.
            amount: r.gold.floor(),
            perHour: city.goldPerHour,
          ),
          _ResChip(
            kind: 'food',
            amount: r.food.floor(),
            perHour: city.foodPerHour,
          ),
        ],
      ),
    );
  }
}

class _ResChip extends StatelessWidget {
  const _ResChip({
    required this.kind,
    required this.amount,
    required this.perHour,
  });

  final String kind;
  final int amount;
  final num perHour;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        MwResource(kind: kind, amount: amount),
        const SizedBox(height: 2),
        Text(
          '${perHour.round()}/sa',
          style: TextStyle(fontSize: 12, color: MwColors.of(context).muted),
        ),
      ],
    );
  }
}

/// ⭐ ÜRETİM BANDI — sayaç TEK BİRİMLİK (kullanıcı kararı 2026-07-28).
///
/// Ekranda 300 birimin toplam süresi değil, sıradaki BİR birimin geri sayımı görünür ve
/// dolunca sıfırlanır, kalan adet bir azalır.
class _Queues extends ConsumerWidget {
  const _Queues({required this.city});

  final CityDetail city;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(tickProvider);
    final clock = ref.watch(clockProvider);

    if (city.queues.isEmpty) {
      return const MwPanel(
        title: 'Üretim bandı',
        child: MwEmpty('Şu an süren bir iş yok.'),
      );
    }

    // ⚠️⚠️ Çıpa `gameNow` — `startedAt` oyun saatinde tutuluyor. Gerçek saatle okunursa her
    // sayaç dünyanın toplam duraklama süresi kadar ileri gider ve kısa süreli birimlerde bant
    // kalıcı olarak «tamamlandı» gösterir (canlıda yaşandı).
    final now = clock.gameNow();

    // ⚠️ Adlar henüz gelmediyse boş harita: satır `id`'yi gösterir, ekran BEKLEMEZ. Katalog
    // için beklemek, gerçek veri hazırken ekranı boş tutmak olurdu.
    final adlar = ref.watch(catalogNamesProvider(city.id)).value ?? const {};

    return MwPanel(
      title: 'Üretim bandı',
      child: Column(
        children: [
          for (final q in city.queues)
            _QueueRow(q: q, now: now, clock: clock, adlar: adlar),
        ],
      ),
    );
  }
}

class _QueueRow extends StatelessWidget {
  const _QueueRow({
    required this.q,
    required this.now,
    required this.clock,
    required this.adlar,
  });

  final CityQueue q;
  final int now;
  final MwClock clock;
  final Map<String, String> adlar;

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

    final ad = adlar[q.itemType] ?? q.itemType;
    final String baslik = q.targetLevel != null ? '$ad → ${q.targetLevel}' : ad;

    // Adetli satırda geri sayım TEK BİRİMİN penceresinden; diğerlerinde işin bitişinden.
    final String? kalan = p != null
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
              MwIcon(folder: _folder(q.category), id: q.itemType, size: 22),
              const SizedBox(width: 8),
              Expanded(child: Text(baslik)),
              if (p != null)
                Text(
                  'kalan ${p.remaining}',
                  style: TextStyle(color: c.muted, fontSize: 12),
                ),
              const SizedBox(width: 8),
              Text(
                // ⚠️ `null` = bitmiş. Sunucunun kapatma görevi birazdan satırı silecek;
                // o ana kadar «birazdan» yazmak, donmuş bir sayı göstermekten dürüst.
                kalan ?? 'birazdan',
                style: TextStyle(
                  fontFeatures: const [FontFeature.tabularFigures()],
                  color: kalan == null ? c.muted : null,
                ),
              ),
            ],
          ),
          if (p != null) ...[
            const SizedBox(height: 6),
            LinearProgressIndicator(
              value: _oran(p.unitStart, p.unitEnd, now),
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

  /// ⚠️ 0..1 aralığına kelepçeli: `now` pencereyi aşmışsa (bitmiş ama satır hâlâ açık)
  /// `LinearProgressIndicator` 1'in üstünde bir değerle çizilemez.
  static double _oran(int start, int end, int now) {
    if (end <= start) return 0;
    final v = (now - start) / (end - start);
    return v.clamp(0.0, 1.0);
  }

  /// ⚠️ Görsel klasörü kategoriye göre: savunma birimlerinin resmi `assets/defenses/` altında
  /// (web `City.tsx` · `art` parametresiyle aynı ayrım).
  static String _folder(String category) => switch (category) {
    'unit' => 'units',
    'defense' => 'defenses',
    'tech' => 'techs',
    _ => 'buildings',
  };
}

class _Buildings extends ConsumerWidget {
  const _Buildings({required this.city});

  final CityDetail city;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final adlar = ref.watch(catalogNamesProvider(city.id)).value ?? const {};
    // ⚠️ Sunucudan gelen sıra rastgele (satır sırası); ada göre sıralanıyor ki her açılışta
    // aynı yerde dursunlar. Sıçrayan bir liste, dokunmatikte yanlış satıra basmak demek.
    final entries = city.buildings.entries.where((e) => e.value > 0).toList()
      ..sort((a, b) => a.key.compareTo(b.key));

    if (entries.isEmpty) return const MwEmpty('Henüz yapı yok.');

    return MwPanel(
      title: 'Yapılar',
      child: Column(
        children: [
          for (final e in entries)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  MwIcon(folder: 'buildings', id: e.key, size: 22),
                  const SizedBox(width: 8),
                  Expanded(child: Text(adlar[e.key] ?? e.key)),
                  Text('sv. ${e.value}'),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
