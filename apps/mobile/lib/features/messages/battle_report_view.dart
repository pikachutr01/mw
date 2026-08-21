/// ⭐⭐ SAVAŞ RAPORU EKRANI — sonuç · birim dökümü · kahramanlar · sur/mağara · ganimet.
///
/// ⭐ **Savaş animasyonu YOK** (kullanıcı kararı): rapor bir metin dökümüdür. Sayıların
/// kendisi sunucuda `battles.result`'tan türetiliyor; burada yalnız gösteriliyor.
///
/// ─ ⚠️ TABLO — 2026-08-19'da GERİ GELDİ ───────────────────────────────────────────────────
/// Burada bir süre *"tablo yok, satır var"* yazıyordu: web'in altı sütunlu `<table>`ı 360
/// dp'ye sığmadığı için döküm serbest metne indirgenmişti («ad · 120 → 84 · −36»). Kullanıcı
/// sonucu doğrudan reddetti (2026-08-19): *"Bu şekilde anlaması epeyi güç. Gerçek bir tablo
/// bile çizebiliriz bu ordular için."*
///
/// ⭐ Sığdırma sorunu **sütun sayısını azaltarak** çözüldü, tabloyu bırakarak değil: web'in
/// altı sütunu yerine ÜÇ sütun (Katılan · Kalan · Kayıp). Ok işareti ve «taban» sütunu
/// kalktı — biri süs, diğeri nadir ve satırın altına ikinci satır olarak yazılıyor.
/// ⚠️ Yatay kaydırma yine YOK: raporun en önemli kısmı ekran dışında kalmamalı.
/// ⭐ Solda birim resmi (kullanıcı isteği) — ad okunmadan hangi birim olduğu anlaşılıyor.
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
        /* ⭐⭐ SONUÇ EN ÜSTTE VE BİR BANT (kullanıcı, 2026-08-19: *"Hiyerarşik düzen olarak en
           önemli ve kullanıcının ilk görmek isteyeceği bilgiyi en üste almamız lazım.
           KAZANDINIZ veya KAYBETTİNİZ yazısı mesela en üstte olsa iyi olur."*).

           Metin zaten en üstteydi ama satır içinde, tur sayısıyla aynı ağırlıkta duruyordu.
           Şimdi tam genişlikte, renkli zeminli bir bant: rapor açılır açılmaz okunan tek şey.
           ⚠️ Kalıp `battleHeadline`dan geliyor — beraberlik `won` ile ifade edilemiyor ve o
           ayrım testle kilitli (`k.java` kalıbı). */
        _SonucBandi(r: r),
        const SizedBox(height: 10),

        MwRouteLine(origin: r.origin, target: r.target, onNavigate: onNavigate),

        /* ⭐⭐ ORDULAR ARTIK GERÇEK BİR TABLO (kullanıcı: *"Bizim ve rakip ordunun savaşa
           katılan ve kalan askerlerini daha şık şekilde gösteren bir mimariye geçelim. Bu
           şekilde anlaması epeyi güç. Gerçek bir tablo bile çizebiliriz… Askerlerin küçük
           resimleri de yanlarında gösterilebilir."*).

           Eskiden her satır «ad · 120 → 84 · −36» biçiminde serbest bir metindi: sütun
           yoktu, başlık yoktu, ok işareti ile eksi işareti aynı satırda yarışıyordu.
           Şimdi başlıklı üç sütun (Katılan · Kalan · Kayıp) ve solda birim resmi. */
        for (final s in r.sections)
          if (s.lines.isNotEmpty)
            MwReportSection(
              title: s.title,
              child: _OrduTablosu(section: s),
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

        /* ⭐⭐ GANİMET ÜÇ SATIRDAN İKİYE İNDİ (kullanıcı, 2026-08-19).

           Eskiden üç blok vardı ve kullanıcı haklı olarak *"en üstteki Ganimet ile Taşınan
           aynı bilgiyi veriyor"* dedi:
             • «Ganimet: …»            → eve dönen yük
             • «Ortaya çıkan: …»       → savaş sonrası enkazdan doğan toplam
             • «Taşınan: …»            → eve dönen yük  ← Ganimet'in AYNISI
           Kalanlar: **Ortaya çıkan** (savaşın ürettiği toplam) ve **Taşınan** (bunun eve
           gelen kısmı). İkisi farklı sorulara cevap veriyor, tekrar yok.

           ⛔ «Kapasiten yetmedi — şehirde kaldı» satırı da KALDIRILDI (kullanıcının kararı:
           *"Kazananın bunu bilmesine gerek yok"*). ⚠️ Bu satır 2026-08-08'de bir oyuncu
           sorusuna cevap olarak eklenmişti («neden bu kadar az ganimet?»); artık iki sayının
           farkı zaten aynı soruyu cevaplıyor.

           ⚠️ `lootBreakdown` yoksa ESKİ tek satıra düşülüyor: eski kayıtlarda döküm alanı yok
           ve o raporlarda ganimeti hiç göstermemek bilgi kaybı olurdu. */
        if (r.lootBreakdown != null)
          _LootBreakdown(r.lootBreakdown!)
        else if (r.loot != null)
          MwResPair(
            label: r.side == 'attacker' ? 'Ganimet:' : 'Yağmalanan:',
            gold: r.loot!.gold,
            food: r.loot!.food,
          ),

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
          /* ⭐ SONUÇ CÜMLESİ KUTUNUN İÇİNDE (kullanıcı, 2026-08-21): *"mağara yıkıldığında
             içindeki ordu şehre kaçıyor bilgi notunu aynı kutu içinde yazalım. Ayrı ayrı
             notlar olmasın."* Eskiden `notes` listesine düşüyor ve raporun EN ALTINDA, mağara
             kutusundan kopuk bir madde işareti olarak çıkıyordu.
             ⚠️ Metin sunucudan (`cave.note`); web'deki karşılığıyla AYNI dize. */
          if (cave.note != null) ...[
            const SizedBox(height: 4),
            Text(cave.note!, style: TextStyle(fontSize: 11, color: c.muted)),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Flexible(
              child: MwResPair(
                label: 'Ortaya çıkan:',
                gold: b.revealed.gold,
                food: b.revealed.food,
                size: 13,
              ),
            ),
            /* ⭐⭐ AYRINTILI HESAP (kullanıcı, 2026-08-19): *"kenarda bir de info ikonu olsun.
               Buna tıklanınca tüm ayrıntılı ganimet hesabı tooltip üzerine gösterilsin."*

               ⚠️⚠️ Bu ikon olmadan ekrandaki iki sayı **kapanmıyordu**; canlı veriyle
               doğrulandı (savaş #29). Gerekçenin tamamı `BattleLootDetail`de.
               ⚠️ Eski kayıtta `detail` null → ikon HİÇ çizilmiyor: boş bir tooltip açan bir
               ikon, çalışmıyormuş gibi görünürdü. */
            if (b.detail != null)
              _GanimetBilgisi(detail: b.detail!, capacity: b.capacity),
          ],
        ),
        if (b.carried != null)
          MwResPair(
            label: 'Taşınan:',
            gold: b.carried!.gold,
            food: b.carried!.food,
            size: 13,
          ),
        /* ⛔ «Kapasiten yetmedi — şehirde kaldı» SATIRI 2026-08-19'da kaldırıldı (kullanıcı:
           *"Kazananın bunu bilmesine gerek yok"*) — ama bilgi kaybolmadı, yukarıdaki info
           ikonunun altına taşındı. ⚠️ İlk denemede satır tamamen silinmişti ve gerekçem
           *"iki sayının farkı aynı soruyu cevaplıyor"* idi; canlı veri bunu **çürüttü**:
           fark iki ayrı sebebi (enkazdan sığmayan + kasadan sığmayan) birbirine karıştırıyor
           ve tek başına hiçbir soruyu cevaplamıyordu. */
      ],
    );
  }
}

/// ⭐⭐ GANİMET HESABI İKONU — dokununca tüm döküm tooltip olarak açılıyor (2026-08-19).
///
/// ⚠️ Metin **web'deki `LootDetail` ile aynı bilgiyi aynı sırayla** veriyor; iki istemcinin
/// dökümü ayrışırsa aynı savaş iki farklı hesap anlatır.
///
/// ⭐ Son satır («kapasite önce enkaza») dökümün en değerli parçası: canlı örnekte oyuncu
/// kasadan **sıfır** almıştı ve sebebi buydu — 6,2 milyonluk enkaz kapasitenin tamamını
/// yutmuştu. O kural yazılmadan «kasadan 0 taşındı» satırı bir hata gibi okunuyor.
class _GanimetBilgisi extends StatelessWidget {
  const _GanimetBilgisi({required this.detail, required this.capacity});

  final BattleLootDetail detail;
  final int? capacity;

  String _satir(String etiket, MwRes v) =>
      '$etiket: ${mwNumber(v.gold)} altın, ${mwNumber(v.food)} yemek';

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final metin = [
      'ENKAZ — ölen ordudan çıktı',
      _satir('Oluşan', detail.debrisTotal),
      _satir('Taşınan', detail.debrisCarried),
      _satir('Şehirde kaldı', detail.debrisLeft),
      '',
      'KASA — şehrin deposundan',
      _satir('Alınabilirdi', detail.plunderTotal),
      _satir('Taşınan', detail.plunderCarried),
      _satir('Şehirde kaldı', detail.plunderLeft),
      '',
      if (capacity != null) 'Taşıma kapasiten: ${mwNumber(capacity!)}',
      'Kapasite önce enkaza harcanır; artarsa kasadan alınır.',
    ].join('\n');

    return MwTapTip(
      message: metin,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Icon(Icons.info_outline, size: 16, color: c.muted),
      ),
    );
  }
}

/// ⭐ SONUÇ BANDI — raporun ilk ve en büyük bilgisi.
class _SonucBandi extends StatelessWidget {
  const _SonucBandi({required this.r});

  final BattleReport r;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    // ⚠️ Beraberlikte ne yeşil ne kırmızı: `won` false ama kaybedilmiş de değil.
    final beraber = r.winner == 'draw';
    final renk = beraber ? c.muted : (r.won ? c.success : c.danger);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: renk.withValues(alpha: 0.12),
        border: Border.all(color: renk.withValues(alpha: 0.55)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          /* ⭐⭐ `mwUpper` ŞART (kullanıcı, 2026-08-21): *"en üstte büyük yazan KAYBETTİNİZ
             yazısında büyük İ harfi gözükmüyor."*

             ⚠️⚠️ Sebep FONT ve **fontun içinde ölçüldü** (`Cinzel-VF.ttf`, glyf tablosu):
               • `i` (U+0069) → gövde yüksekliği 600, **noktasız**; dotless `ı` (U+0131) ile
                 birebir aynı glif yapısı. Cinzel küçük harfi küçük BÜYÜK harf gibi çiziyor
                 (kural `mwDisplayStyle` başlığında) ve bu sürümde noktayı hiç koymuyor.
               • `İ` (U+0130) → yüksekliği 851 olan BİLEŞİK glif: büyük `I` + üstünde nokta.
             Yani «Kaybettiniz» ekranda zaten büyük görünüyordu ama `i`ler noktasız çiziliyordu
             — «İ kayboldu» şikâyeti tam olarak buydu. U+0130 fontta VAR, tofu çıkmıyor.

             ⚠️ Dart'ın `toUpperCase()`i yerelden bağımsız (`i` → `I`), yani hatanın aynısını
             üretirdi. `mwUpper` `i` → `İ` yapıyor.
             ⚠️ «KAZANDINIZ»da `i` yok — kusur yalnız kaybedilen savaşta görünüyordu.
             ⚠️ **WEB'DE AYNI YAMA YOK ve bu bilinçli**: web Google Fonts'un Cinzel'ini
             kullanıyor ve orada küçük `i` NOKTALI çiziliyor (tuvalde ölçüldü). Gerekçe
             `Messages.tsx`teki karşı notta.
             ⚠️ `battleHeadline`ın kendisi DEĞİŞMEDİ: kaynak dize orijinal oyunun `k.java`
             metni ve testle kilitli; büyütme yalnız çizim anında yapılıyor. */
          Expanded(
            child: Text(
              mwUpper(battleHeadline(winner: r.winner, won: r.won)),
              style: mwDisplayStyle(fontSize: 20, color: renk),
            ),
          ),
          /* ⭐ GECE = YALNIZ AY SİMGESİ (kullanıcı, 2026-08-05): *"Sadece kazanan veya kaybeden
             yazısının yanında ay simgesi olması yeterli."*
             ⭐ 2026-08-19: simge artık **tıklanınca açıklıyor**. Eskiden ne olduğunu bilmeyen
             oyuncu için sessiz bir süstü — kullanıcı bunu doğrudan istedi. */
          /* ⭐ 2026-08-21: ipucu TEK CÜMLEYE indi (kullanıcı: *"gece savaşı tooltip ine sadece
             savaş gece gerçekleşti yazsın, detaylı açıklama yazmasın"*). Kalkan kısım gece
             görüşünün vuruş gücüne etkisini anlatıyordu. Web'deki `Tooltip` ile aynı dize. */
          if (r.night) ...[
            const MwTapTip(
              message: 'Savaş gece gerçekleşti.',
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: Text('🌙', style: TextStyle(fontSize: 18)),
              ),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            '${r.turns} tur',
            style: TextStyle(
              fontSize: 11,
              color: c.muted,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

/// ⭐⭐ ORDU TABLOSU — başlıklı üç sütun ve solda birim resmi.
///
/// ⚠️⚠️ **Klasör bölümün anahtarına göre**: savunma yapıları `assets/defenses/` altında,
/// askerler `assets/units/` altında. `MwIcon` eksik dosyada **sessizce boş kutu** çiziyor,
/// yani yanlış klasör hata vermez — yalnız resimler kaybolur. Bu oturumda tam olarak o hata
/// bir kez yapıldı (`MwUnitChips`), o yüzden ayrım burada açıkça yazılı.
class _OrduTablosu extends StatelessWidget {
  const _OrduTablosu({required this.section});

  final ReportSection section;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final klasor = section.key == 'defenderStructs' ? 'defenses' : 'units';

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(8),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          // ── Sütun başlıkları ───────────────────────────────────────────────
          Container(
            color: c.raised,
            padding: const EdgeInsets.fromLTRB(8, 5, 8, 5),
            child: Row(
              children: [
                const Expanded(child: SizedBox.shrink()),
                _Baslik('Katılan', c),
                _Baslik('Kalan', c),
                _Baslik('Kayıp', c),
              ],
            ),
          ),
          for (var i = 0; i < section.lines.length; i++)
            _TabloSatiri(
              line: section.lines[i],
              folder: klasor,
              alt: i.isOdd,
              son: i == section.lines.length - 1,
            ),
        ],
      ),
    );
  }
}

class _Baslik extends StatelessWidget {
  const _Baslik(this.text, this.c);

  final String text;
  final MwColors c;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: _kSutun,
    child: Text(
      text,
      textAlign: TextAlign.right,
      style: TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.3,
        color: c.muted,
      ),
    ),
  );
}

/// Sayı sütunlarının genişliği — üçü de aynı olmalı, yoksa başlıklar rakamlarla hizasız kalır.
const double _kSutun = 62;

class _TabloSatiri extends StatelessWidget {
  const _TabloSatiri({
    required this.line,
    required this.folder,
    required this.alt,
    required this.son,
  });

  final ReportLine line;
  final String folder;
  final bool alt;
  final bool son;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    const tnum = [FontFeature.tabularFigures()];

    Widget sayi(String metin, Color? renk) => SizedBox(
      width: _kSutun,
      child: Text(
        metin,
        textAlign: TextAlign.right,
        style: TextStyle(fontSize: 12.5, color: renk, fontFeatures: tnum),
      ),
    );

    return Container(
      padding: const EdgeInsets.fromLTRB(8, 5, 8, 5),
      decoration: BoxDecoration(
        color: alt ? c.raised.withValues(alpha: 0.4) : null,
        border: Border(
          bottom: BorderSide(color: son ? Colors.transparent : c.border),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              MwIcon(folder: folder, id: line.id, size: 26),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  line.name,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5),
                ),
              ),
              sayi(mwNumber(line.before), c.muted),
              // ⚠️ «Kalan» vurgulu: oyuncunun tablodan okuduğu asıl sayı bu — savaştan sonra
              //    elinde ne kaldığı.
              sayi(mwNumber(line.after), null),
              sayi(
                line.lost > 0 ? '−${mwNumber(line.lost)}' : '−0',
                line.lost > 0 ? c.danger : c.muted,
              ),
            ],
          ),
          if (line.restoredByFloor > 0)
            Padding(
              padding: const EdgeInsets.only(left: 33, top: 1),
              child: Text(
                'savunma tabanı +${mwNumber(line.restoredByFloor)}',
                style: TextStyle(fontSize: 10, color: c.success),
              ),
            ),
        ],
      ),
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
