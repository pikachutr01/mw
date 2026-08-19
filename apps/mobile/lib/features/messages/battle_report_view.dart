/// ⭐⭐ SAVAŞ RAPORU EKRANI — sonuç · birim dökümü · kahramanlar · sur/mağara · ganimet.
///
/// ⭐ **Savaş animasyonu YOK** (kullanıcı kararı): rapor bir metin dökümüdür. Sayıların
/// kendisi sunucuda `battles.result`'tan türetiliyor; burada yalnız gösteriliyor.
///
/// ─ ⚠️ TABLO YOK, SATIR VAR ───────────────────────────────────────────────────────────────
/// Web'de döküm gerçek bir `<table>`: altı sütun (birim · katılan · → · kalan · ölen · taban).
/// Telefonda o tablo 360 dp'ye sığmıyor ve yatay kaydırmaya alınsaydı raporun EN ÖNEMLİ
/// kısmı ekranın dışında kalırdı — oyuncu kaydırmayı fark etmeden "ölen" sütununu hiç
/// görmezdi. Aynı veri satır başına tek bir hizada yazılıyor: solda ad, sağda
/// «katılan → kalan» ve altında kayıp. Sütun başlıkları da kalktı, çünkü satırın kendisi
/// zaten okunuyor (`120 → 84` ile `−36` başlık istemiyor).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../ui/primitives.dart';
import 'battle_report.dart';
import 'message_rules.dart';
import 'report_bits.dart';

class BattleReportView extends ConsumerWidget {
  const BattleReportView({super.key, required this.battleId, this.onNavigate});

  final int battleId;

  /// Güzergâha dokunulduğunda çağrılır — sheet'i kapatmak çağıranın işi.
  final VoidCallback? onNavigate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    return ref
        .watch(battleProvider(battleId))
        .when(
          loading: () => Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'Rapor yükleniyor…',
              style: TextStyle(fontSize: 12, color: c.muted),
            ),
          ),
          error: (_, _) => const MwErrorBox('Rapor okunamadı.'),
          data: (r) => _Body(r: r, onNavigate: onNavigate),
        );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.r, this.onNavigate});

  final BattleReport r;
  final VoidCallback? onNavigate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final sozluk = ref.watch(reportNamesProvider).value;
    String adOf(String id) => sozluk?.names[id] ?? id;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      // ⚠️ `min` ŞART: bu sütun sheet'in kaydırma alanının içinde yaşıyor, yani dikeyde
      // sınırsız. `max` bırakmak, kutuyu içeriğinden bağımsız büyütmeye çalışmak olurdu
      // (`MwPanel`de aynı kusur ölçülmüştü: panel bomboş şekilde alta kadar uzamıştı).
      mainAxisSize: MainAxisSize.min,
      children: [
        /* Sonuç başlığı — orijinal oyunun kalıbı (`k.java`). Karar `battleHeadline`da:
           beraberlik `won` ile ifade edilemiyor ve o ayrım testle kilitli. */
        Row(
          children: [
            Text(
              battleHeadline(winner: r.winner, won: r.won),
              style: mwDisplayStyle(
                fontSize: 17,
                color: r.won ? c.success : c.danger,
              ),
            ),
            // ⭐ GECE = YALNIZ AY SİMGESİ (kullanıcı, 2026-08-05): *"Sadece kazanan veya
            // kaybeden yazısının yanında ay simgesi olması yeterli."* Önceden «· gece savaşı»
            // ve notlarda «vuruş gücü düştü» yazıyordu; ikisi de kalktı.
            if (r.night) ...[
              const SizedBox(width: 6),
              const Text('🌙', style: TextStyle(fontSize: 14)),
            ],
            const SizedBox(width: 8),
            Text(
              '${r.turns} tur',
              style: TextStyle(fontSize: 11, color: c.muted),
            ),
          ],
        ),
        const SizedBox(height: 8),

        MwRouteLine(origin: r.origin, target: r.target, onNavigate: onNavigate),

        for (final s in r.sections)
          if (s.lines.isNotEmpty)
            MwReportSection(
              title: s.title,
              child: Column(children: [for (final l in s.lines) _LineRow(l)]),
            ),

        if (r.myHeroes.isNotEmpty)
          MwReportSection(title: 'Kahramanların', child: _HeroWrap(r.myHeroes)),
        if (r.enemyHeroes.isNotEmpty)
          MwReportSection(
            title: 'Rakip kahramanlar',
            child: _HeroWrap(r.enemyHeroes),
          ),

        // ⚠️ Yalnız BANA çıkan kahraman kutlanıyor: rakibe çıkan bir kahraman iyi haber değil
        // ve `notes` satırlarında zaten yazıyor.
        if (r.captured?.mine == true) ...[
          _Box(
            color: c.success,
            child: Row(
              children: [
                const MwIcon(folder: 'hero', id: 'kahraman', size: 34),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Savaştan yeni bir kahraman çıktı: ${r.captured!.name}!',
                    style: TextStyle(fontSize: 12, color: c.success),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],

        if (r.wall != null) ...[_WallBox(r.wall!), const SizedBox(height: 8)],
        if (r.cave?.present == true) ...[
          _CaveBox(cave: r.cave!, side: r.side, nameOf: adOf),
          const SizedBox(height: 8),
        ],

        /* ⚠️ İki blok AYRI koşulda: kaybeden saldıranda «Ganimet» satırı YOK ama «Ortaya
           çıkan» VAR — ölen askerlerden enkaz oluşur, yalnız tamamı savunanın şehrine gider.
           Bir ara ikisi tek koşula bağlıydı ve sunucu ganimeti `null` yapınca döküm de
           kaybolurdu (2026-08-08 düzeltmesinin istemci yarısı). */
        if (r.loot != null)
          MwResPair(
            label: r.side == 'attacker' ? 'Ganimet:' : 'Yağmalanan:',
            gold: r.loot!.gold,
            food: r.loot!.food,
          ),
        if (r.lootBreakdown != null) _LootBreakdown(r.lootBreakdown!),

        if (r.notes.isNotEmpty) ...[
          const SizedBox(height: 6),
          for (final n in r.notes)
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text(
                '• $n',
                style: TextStyle(fontSize: 12, color: c.muted),
              ),
            ),
        ],

        _Provenance(r.provenance),
      ],
    );
  }
}

/// Bir birim satırı: solda ad, sağda «katılan → kalan» ve kayıp.
///
/// ⚠️ Ad `Expanded` + `ellipsis`: uzun bir birim adı sayıları ekranın dışına itmemeli —
/// taşan şey ad olmalı, çünkü sayılar raporun asıl bilgisi.
class _LineRow extends StatelessWidget {
  const _LineRow(this.l);

  final ReportLine l;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    const tnum = [FontFeature.tabularFigures()];

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l.name,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${mwNumber(l.before)} → ${mwNumber(l.after)}',
                style: TextStyle(
                  fontSize: 12,
                  color: c.muted,
                  fontFeatures: tnum,
                ),
              ),
              const SizedBox(width: 10),
              // ⚠️ Kayıp 0 olsa bile «−0» yazılıyor: sütun hizası bozulmasın ve "bu birim hiç
              // kayıp vermedi" bilgisi de görünsün. Satırın kendisi zaten sayı taşıyor.
              SizedBox(
                width: 58,
                child: Text(
                  '−${mwNumber(l.lost)}',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    fontSize: 12,
                    color: l.lost > 0 ? c.danger : c.muted,
                    fontFeatures: tnum,
                  ),
                ),
              ),
            ],
          ),
          if (l.restoredByFloor > 0)
            Text(
              'taban +${mwNumber(l.restoredByFloor)}',
              style: TextStyle(
                fontSize: 10,
                color: c.success,
                fontFeatures: tnum,
              ),
            ),
        ],
      ),
    );
  }
}

class _HeroWrap extends StatelessWidget {
  const _HeroWrap(this.heroes);

  final List<ReportHeroLine> heroes;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 6,
    runSpacing: 6,
    children: [
      for (final h in heroes)
        MwHeroCard(
          name: h.name,
          level: h.level,
          alive: h.alive,
          xpGained: h.xpGained,
        ),
    ],
  );
}

class _WallBox extends StatelessWidget {
  const _WallBox(this.wall);

  final ({int? level, double? integrity, bool destroyed}) wall;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return _Box(
      color: c.border,
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        children: [
          const Text(
            'Sur',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
          Text(
            'seviye ${wall.level ?? 0}',
            style: TextStyle(fontSize: 12, color: c.muted),
          ),
          if (wall.destroyed)
            Text(
              'YIKILDI',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: c.danger,
              ),
            )
          else if (wall.integrity != null)
            Text(
              'bütünlük %${wallPercent(wall.integrity!)}',
              style: TextStyle(fontSize: 12, color: c.muted),
            ),
        ],
      ),
    );
  }
}

class _CaveBox extends StatelessWidget {
  const _CaveBox({
    required this.cave,
    required this.side,
    required this.nameOf,
  });

  final BattleCave cave;
  final String side;
  final String Function(String id) nameOf;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final kacanlar = cave.escaped.entries.where((e) => e.value > 0).toList();

    return _Box(
      color: c.border,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            children: [
              const Text(
                'Mağara',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              ),
              /* ⚠️⚠️ ÜÇ DURUM, İKİ DEĞİL: «zaten yıkıktı» hâli `reason`dan okunuyor. Bu port
                 düzeltme öncesi web kodundan yazılmıştı ve aynı çelişkiyi taşıyordu — kutu
                 yeşille «dayandı» derken notta «zaten onarımdaydı» yazıyordu. Karar
                 `caveState`te ve testli. */
              Builder(
                builder: (_) {
                  final durum = caveState(
                    broken: cave.broken,
                    reason: cave.reason,
                  );
                  return Text(
                    caveStateLabel(durum),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: durum == MwCaveState.broken
                          ? FontWeight.w700
                          : FontWeight.normal,
                      // ⚠️ «zaten yıkıktı» SARI: ne başarı ne yıkım — saldırı bir şey
                      // değiştirmedi ve yeşil yazmak onu başarı gibi gösterirdi.
                      color: switch (durum) {
                        MwCaveState.broken => c.danger,
                        MwCaveState.alreadyBroken => c.warning,
                        MwCaveState.held => c.success,
                      },
                    ),
                  );
                },
              ),
              // Saldırana tek işe yarar sayı: bir dahaki sefere kaç cüce gerektiği.
              if (showCaveRequirement(
                side: side,
                broken: cave.broken,
                reason: cave.reason,
              ))
                Text(
                  'gereken ${mwNumber(cave.needed)} cüce · '
                  'sağ kalan ${mwNumber(cave.survivingDwarves)}',
                  style: TextStyle(
                    fontSize: 11,
                    color: c.muted,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
            ],
          ),
          /* ⚠️ Burada ad KATALOGTAN çözülüyor, `ReportLine.name` gibi sunucudan gelmiyor:
             kaçış dökümü ham `Record<string, number>` olarak geliyor. Bilinmeyen id ham
             hâliyle yazılır — boş bırakmak "kimse çıkmadı" gibi okunurdu. */
          if (kacanlar.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Mağaradaki askerler şehre yola çıktı: '
              '${kacanlar.map((e) => '${mwNumber(e.value)} ${nameOf(e.key)}').join(', ')}',
              style: TextStyle(fontSize: 11, color: c.muted),
            ),
          ],
        ],
      ),
    );
  }
}

class _LootBreakdown extends StatelessWidget {
  const _LootBreakdown(this.b);

  final BattleLootBreakdown b;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MwResPair(
          label: 'Ortaya çıkan:',
          gold: b.revealed.gold,
          food: b.revealed.food,
          size: 13,
        ),
        if (b.carried != null)
          MwResPair(
            label: 'Taşınan:',
            gold: b.carried!.gold,
            food: b.carried!.food,
            size: 13,
          ),
        /* ⭐ «Neden bu kadar az ganimet?» sorusunun cevabı (oyuncu bildirimi, 2026-08-08):
           yağma oranı kasaya uygulanıyor ama eve dönen yük TAŞIMA KAPASİTESİYLE sınırlı.
           ⚠️ Satır yalnız gerçekten geride bir şey kaldığında çizilir — kapasite yettiğinde
           «0 kaldı» yazmak bilgi değil gürültü olurdu. */
        if (b.leftBehind != null)
          MwResPair(
            label: b.capacity != null
                ? 'Kapasiten yetmedi (${mwNumber(b.capacity!)}) — şehirde kaldı:'
                : 'Kapasiten yetmedi — şehirde kaldı:',
            gold: b.leftBehind!.gold,
            food: b.leftBehind!.food,
            size: 13,
            color: c.warning,
          ),
      ],
    );
  }
}

/// ⭐ DETERMİNİZM KÜNYESİ — motor sürümü · katalog hash'i · RNG tohumu (§5).
///
/// ⚠️ Etiketsiz ve küçük: oyuncu bu değerleri **anlamak** zorunda değil, yalnız bir
/// tartışmada bize **iletebilmeli**. Web'de tek tıkla kopyalanıyor; mobilde uzun basma +
/// seçilebilir metin aynı işi yapıyor ve pano izni gerektirmiyor.
class _Provenance extends StatelessWidget {
  const _Provenance(this.p);

  final ({int seed, String engineVersion, String catalogHash}) p;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Align(
        alignment: Alignment.centerRight,
        child: SelectableText(
          '${p.engineVersion} · ${p.catalogHash} · ${p.seed}',
          style: TextStyle(
            fontSize: 9,
            color: c.muted.withValues(alpha: 0.7),
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ),
    );
  }
}

/// Çerçeveli bilgi kutusu — sur, mağara, kahraman kutlaması.
class _Box extends StatelessWidget {
  const _Box({required this.color, required this.child});

  final Color color;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: c.raised,
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(6),
      ),
      child: child,
    );
  }
}
