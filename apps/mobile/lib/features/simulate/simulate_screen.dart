/// ⭐⭐ SAVAŞ SİMÜLATÖRÜ — web'deki `Simulate.tsx` karşılığı.
///
/// Gerçek savaşlarla **aynı motoru** çağırıyor (`POST /api/v1/simulate`); istemci hiçbir şey
/// hesaplamıyor, yalnız formu topluyor ve sonucu çiziyor.
///
/// ─ ⚠️ OTURUM ŞART (kullanıcı, 2026-08-22) ────────────────────────────────────────────────
/// *"Uygulamada simülatöre oturumsuz ulaşılamasın… sadece oturum açan simülatör kullanabilsin."*
/// Sunucu ucu hâlâ oturumsuz (`OptionalAuthGuard`) ve **web'de misafir onu kullanmaya devam
/// ediyor**; kapanan şey yalnız uygulamanın kapısı (`routing_rules.dart` · `kGuestPaths`).
///
/// ⚠️ Kararın somut bir karşılığı var: birim adları ve sırası `GET /cities/:id/catalog`tan
/// geliyor ve o uç oturum **ve şehir sahipliği** istiyor. Misafire açık kalsaydı ya adları
/// derlenmiş bir kopyadan okumak (kataloğu Dart'a üretmeme kararını delerdi) ya da ekranı
/// isimsiz göstermek gerekirdi.
///
/// ─ ⚠️ WEB'DEN AYRILAN YERLER (üçü de dar ekran yüzünden, bilinçli) ───────────────────────
///  1. Web iki tarafı yan yana **geniş tablolarda** çiziyor. Burada satır başına iki dar kutu
///     var ve «Kalan» ayrı bir sütun değil, kutunun altındaki küçük yazı: 360 px'e üç sütun
///     (giriş + kalan) × iki taraf sığmıyor.
///  2. Kahramanlar **ayrı bir sheet'te**. Satır başına beş kutu (Sv · F.Sld · F.Svn · B.Sld ·
///     B.Svn) telefonda hiçbir düzende sığmıyor; sheet'te dikey yerleşim rahat.
///  3. Sonuç paneli tek koşuyu çiziyor; çoklu koşuda üstte kim kaç kez kazandı şeridi ve bir
///     koşu seçici var (web'de de öyle).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../gen/facts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import '../city/catalog_model.dart';
import 'simulate_model.dart';
import 'simulate_prefill.dart';
import 'simulate_rules.dart';

/// Kutu anahtarları — `a`/`d` taraf öneki. Tek bir haritada tutuluyor ki `dispose` tek yerde
/// olsun; yüz küçük alanı ayrı ayrı alan olarak tutmak dosyayı okunmaz yapardı.
const String _atk = 'a';
const String _def = 'd';

class SimulateScreen extends ConsumerStatefulWidget {
  const SimulateScreen({super.key});

  @override
  ConsumerState<SimulateScreen> createState() => _SimulateScreenState();
}

class _SimulateScreenState extends ConsumerState<SimulateScreen> {
  final Map<String, TextEditingController> _kutular = {};
  final Map<String, List<MwSimHero>> _kahramanlar = {_atk: [], _def: []};

  bool _gece = false;
  bool _busy = false;

  /// ⚠️⚠️ Girdi değişti ama sonuç eski. Ekrandaki «kalan» sayıları bir ÖNCEKİ koşuya ait ve
  /// sessizce durmaları en kötüsü olurdu: oyuncu yeni bir sayı yazıp eski sonuca bakarak
  /// karar verirdi. Web'de de aynı şerit var.
  bool _bayat = false;
  String? _error;
  List<MwSimResult>? _sonuclar;
  int _gorunen = 0;

  TextEditingController _k(String anahtar) =>
      _kutular.putIfAbsent(anahtar, () => TextEditingController());

  /// ⚠️ Yalnız sonuç varken ve HENÜZ bayatlamamışken `setState`: her tuş vuruşunda ekranı
  /// baştan çizmek, yüz kutuluk bir formda hissedilir bir takılma olurdu.
  void _bayatlat() {
    if (_sonuclar == null || _bayat) return;
    setState(() => _bayat = true);
  }

  @override
  void initState() {
    super.initState();
    _kutular['repeat'] = TextEditingController(text: '1');
    unawaited(_devriOku());
  }

  /// ⭐⭐ «Simülatöre Aktar» ile gelen künyeyi forma basar — **bir kez**, sonra siler.
  ///
  /// ⚠️ Okuyan SİLİYOR: kayıt kalsaydı oyuncu bir hafta sonra simülatörü açtığında formu
  /// eski bir casusluk raporunun verisiyle dolmuş bulurdu ve nereden geldiğini anlayamazdı.
  /// Silme okumadan HEMEN sonra, çözümlemeden önce: bozuk bir kayıt da temizlensin.
  Future<void> _devriOku() async {
    final store = ref.read(storeProvider);
    final ham = await store.read(kSimPrefillKey);
    if (ham == null) return;
    await store.delete(kSimPrefillKey);
    final devir = MwSimTransfer.decode(ham);
    if (devir == null || !mounted) return;
    setState(() {
      _uygula(_atk, devir.attacker);
      _uygula(_def, devir.defender);
    });
  }

  void _uygula(String p, MwSimPrefill? d) {
    if (d == null || d.bos) return;
    void yaz(String anahtar, int? v) {
      if (v != null && v > 0) _k(anahtar).text = '$v';
    }

    for (final e in d.counts.entries) {
      yaz('$p:c:${e.key}', e.value);
    }
    for (final e in d.tech.entries) {
      yaz('$p:t:${e.key}', e.value);
    }
    yaz('$p:heroCount', d.heroCount);
    yaz('$p:vision', d.vision);
    if (d.heroes.isNotEmpty) _kahramanlar[p] = [...d.heroes];
    /* ⚠️ Gece görüşü GELDİYSE gece anahtarı da açılıyor: kutuya bir sayı yazıp anahtarı
       kapalı bırakmak, girilen değerin hiçbir işe yaramadığı sessiz bir durum olurdu. */
    if (d.vision != null && d.vision! > 0) _gece = true;
  }

  @override
  void dispose() {
    for (final c in _kutular.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final cityId = ref.watch(activeCityProvider).value;
    if (cityId == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final katalog = ref.watch(catalogProvider(cityId));

    return katalog.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(16),
        child: MwErrorBox('Katalog alınamadı: $e'),
      ),
      data: (k) {
        /* ⚠️ Teknikler SÜZÜLÜYOR: katalog ucu 12 tekniğin hepsini döndürüyor ama
           Casusluk · Haritacılık · Sömürgecilik savaşa hiç girmiyor. Kutularını çizmek,
           hiçbir etkisi olmayan alanlar sunmak olurdu. Küme `facts.g.dart`tan
           (`kCombatTechs`) ve katalogdan türetiliyor — sıra sunucudan geldiği gibi. */
        final teknikler = k.techs
            .where((t) => kCombatTechs.contains(t.id))
            .toList();
        final sonuc = _aktifSonuc;

        return ListView(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
          children: [
            _Savascilar(
              units: k.units,
              sonuc: sonuc,
              kutu: _k,
              turlar: sonuc?.turns,
              onDegisti: _bayatlat,
            ),
            const SizedBox(height: 10),
            _Savunma(
              defenses: k.defenses,
              sonuc: sonuc,
              kutu: _k,
              onDegisti: _bayatlat,
            ),
            const SizedBox(height: 10),
            _Teknikler(techs: teknikler, kutu: _k, onDegisti: _bayatlat),
            const SizedBox(height: 10),
            _Gece(
              acik: _gece,
              onChanged: (v) => setState(() => _gece = v),
              kutu: _k,
            ),
            const SizedBox(height: 10),
            _Kahramanlar(rows: _kahramanlar, kutu: _k, onEdit: _kahramanSheet),
            const SizedBox(height: 10),
            MwPanel(
              title: 'Savaştır',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: MwButton(
                          label: 'Savaştır',
                          busy: _busy,
                          onTap: _busy ? null : _calistir,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Tekrar',
                        style: TextStyle(fontSize: 12, color: c.muted),
                      ),
                      const SizedBox(width: 6),
                      MwAmountInput(
                        controller: _k('repeat'),
                        hint: '1',
                        width: 54,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  MwSmallButton(
                    label: 'Temizle',
                    kind: MwButtonKind.ghost,
                    onTap: _busy ? null : _temizle,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    MwErrorBox(_error!),
                  ],
                ],
              ),
            ),
            if (sonuc != null) ...[
              const SizedBox(height: 10),
              if (_bayat)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: MwErrorBox(
                    'Girdiler değişti; aşağıdaki sonuç bir önceki koşuya ait. '
                    'Yeniden savaştır.',
                  ),
                ),
              _Sonuc(
                sonuclar: _sonuclar!,
                gorunen: _gorunen,
                onSec: (i) => setState(() => _gorunen = i),
              ),
            ],
          ],
        );
      },
    );
  }

  MwSimResult? get _aktifSonuc {
    final s = _sonuclar;
    if (s == null || s.isEmpty) return null;
    return s[_gorunen.clamp(0, s.length - 1)];
  }

  Future<void> _kahramanSheet(String taraf) async {
    final sonuc = await mwTallSheet<List<MwSimHero>>(
      context,
      title: taraf == _atk ? 'Saldıran kahramanları' : 'Savunan kahramanları',
      child: _HeroEditor(baslangic: _kahramanlar[taraf]!),
    );
    if (sonuc == null || !mounted) return;
    setState(() => _kahramanlar[taraf] = sonuc);
  }

  MwSimSide _taraf(
    String p,
    List<CatalogUnit> units,
    List<CatalogUnit> defs,
    List<CatalogUpgradable> techs,
  ) {
    final counts = <String, String?>{
      for (final u in units) u.id: _kutular['$p:c:${u.id}']?.text,
      // ⚠️ Savunma yalnız savunanda: saldıranın okçu kulesi diye bir şeyi yok.
      if (p == _def)
        for (final d in defs) d.id: _kutular['$p:c:${d.id}']?.text,
    };
    final tech = <String, String?>{
      for (final t in techs)
        if (techEditable(t.id, attacker: p == _atk))
          t.id: _kutular['$p:t:${t.id}']?.text,
    };
    final temple = simAmount(_kutular['$p:temple']?.text);
    final heroCount = simAmount(_kutular['$p:heroCount']?.text);
    return MwSimSide(
      counts: simCounts(counts),
      tech: simCounts(tech),
      heroes: simHeroes(_kahramanlar[p]!),
      // ⚠️ 0 GÖNDERİLMİYOR: alan yoksa motor «bilinmiyor» diyor, 0 ise «hiç tapınağı yok».
      temple: temple > 0 ? temple : null,
      heroCount: heroCount > 0 ? heroCount : null,
    );
  }

  Future<void> _calistir() async {
    final cityId = ref.read(activeCityProvider).value;
    final k = cityId == null ? null : ref.read(catalogProvider(cityId)).value;
    if (k == null) return;
    final teknikler = k.techs
        .where((t) => kCombatTechs.contains(t.id))
        .toList();

    final saldiran = _taraf(_atk, k.units, k.defenses, teknikler);
    final savunan = _taraf(_def, k.units, k.defenses, teknikler);

    if (!simCanRun(
      attackerCounts: saldiran.counts,
      defenderCounts: savunan.counts,
    )) {
      setState(() => _error = 'Önce en az bir birim gir.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final istek = MwSimRequest(
        attacker: saldiran,
        defender: savunan,
        night: _gece,
        // ⚠️ Gece kapalıyken görüş sıfırlanıyor: kutular pasif ama içlerinde eski bir sayı
        //    kalmış olabilir ve onu göndermek motora yalan söylemek olurdu.
        visionAttacker: _gece ? simAmount(_kutular['$_atk:vision']?.text) : 0,
        visionDefender: _gece ? simAmount(_kutular['$_def:vision']?.text) : 0,
        repeat: simRepeat(_kutular['repeat']?.text),
      );
      final ham = await ref.read(simulatorProvider).run(istek.toJson());
      final liste = ham
          .whereType<Map<String, dynamic>>()
          .map(MwSimResult.fromJson)
          .toList();
      await mwTapOk();
      if (mounted) {
        setState(() {
          _sonuclar = liste;
          _gorunen = 0;
          _busy = false;
          _bayat = false;
        });
      }
    } on MwApiError catch (e) {
      await mwTapError();
      if (mounted) {
        setState(() {
          _busy = false;
          /* ⚠️ 400'de sunucu DÜZ zod çıktısı döndürüyor (`{formErrors, fieldErrors}`) ve
             `message` alanı yok — ham hâlde basmak okunmaz bir metin olurdu. Kendi
             cümlemizi yazıyoruz; bu tek yer, çünkü diğer uçlar Türkçe mesaj gönderiyor. */
          _error = e.status == 400
              ? 'Girdilerden biri geçersiz. Sayıları kontrol et.'
              : e.message;
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

  /// ⚠️ «Tekrar» 1'e DÖNÜYOR, boşalmıyor: boş bir kutu bir sonraki koşuda yine 1 demek ama
  /// ekranda «hiç girilmedi» gibi duruyor.
  void _temizle() {
    setState(() {
      for (final e in _kutular.entries) {
        e.value.text = e.key == 'repeat' ? '1' : '';
      }
      _kahramanlar[_atk] = [];
      _kahramanlar[_def] = [];
      _gece = false;
      _sonuclar = null;
      _gorunen = 0;
      _error = null;
      _bayat = false;
    });
  }
}

/* ══ BÖLÜMLER ═════════════════════════════════════════════════════════════════════════════ */

typedef _Kutu = TextEditingController Function(String);

/// İki sütunlu başlık şeridi — hangi kutunun hangi tarafa ait olduğunu söyleyen tek yer.
class _Baslik extends StatelessWidget {
  const _Baslik({this.tekTaraf = false});

  final bool tekTaraf;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final st = TextStyle(fontSize: 11, color: c.muted);
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          const Spacer(),
          if (!tekTaraf) ...[
            SizedBox(width: 64, child: Text('Saldıran', style: st)),
            const SizedBox(width: 6),
          ],
          SizedBox(width: 64, child: Text('Savunan', style: st)),
        ],
      ),
    );
  }
}

/// Bir satır: simge + ad + bir ya da iki kutu (+ altında «kalan»).
class _Satir extends StatelessWidget {
  const _Satir({
    required this.id,
    required this.ad,
    required this.kutu,
    required this.sonuc,
    this.rozet,
    this.tekTaraf = false,
    this.saldiranKapali = false,
    this.folder = 'units',
    this.onDegisti,
  });

  final String id;
  final String ad;
  final _Kutu kutu;
  final ({MwSimSideResult? a, MwSimSideResult? d})? sonuc;

  /// «sv» gibi küçük bir not — seviye taşıyan kalemlerde.
  final String? rozet;
  final bool tekTaraf;
  final bool saldiranKapali;
  final String folder;

  /// ⚠️ Her kutu değişimini yukarı bildiriyor: ekrandaki «kalan» sayıları bir ÖNCEKİ
  /// koşunun sonucu ve girdi değişince yalan söylemeye başlıyorlar. Bayatlık şeridi
  /// bu geri çağrıdan besleniyor.
  final VoidCallback? onDegisti;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          if (folder.isNotEmpty) ...[
            MwIcon(folder: folder, id: id, size: 20),
            const SizedBox(width: 6),
          ],
          Expanded(
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    ad,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
                if (rozet != null) ...[
                  const SizedBox(width: 4),
                  Text(rozet!, style: TextStyle(fontSize: 10, color: c.muted)),
                ],
              ],
            ),
          ),
          if (!tekTaraf) ...[
            _Hucre(
              controller: kutu('$_atk:${_pre()}:$id'),
              enabled: !saldiranKapali,
              // ⚠️ Kapalı hücre BOŞ değil «–»: boş bir kutu «girmeyi unuttum» der, çizgi
              //    «burada bir kutu olmayacak» der. Web'de de aynı işaret.
              cizgi: saldiranKapali,
              kalan: _kalan(sonuc?.a, _atk),
              onDegisti: onDegisti,
            ),
            const SizedBox(width: 6),
          ],
          _Hucre(
            controller: kutu('$_def:${_pre()}:$id'),
            enabled: true,
            cizgi: false,
            kalan: _kalan(sonuc?.d, _def),
            onDegisti: onDegisti,
          ),
        ],
      ),
    );
  }

  String _pre() => folder == 'techs' ? 't' : 'c';

  /// ⚠️ Taraf AÇIKÇA veriliyor. İlk yazımda `r == sonuc?.a` ile nesne kimliğine bakılıyordu
  /// ve bu, iki tarafın sonucu eşit çıktığı gün sessizce yanlış sütuna bakardı.
  ({String text, bool wiped})? _kalan(MwSimSideResult? r, String taraf) {
    if (r == null) return null;
    final girilen = simAmount(kutu('$taraf:${_pre()}:$id').text);
    return remainingCell(unitId: id, entered: girilen, result: r);
  }
}

class _Hucre extends StatelessWidget {
  const _Hucre({
    required this.controller,
    required this.enabled,
    required this.cizgi,
    required this.kalan,
    this.onDegisti,
  });

  final TextEditingController controller;
  final bool enabled;
  final bool cizgi;
  final ({String text, bool wiped})? kalan;
  final VoidCallback? onDegisti;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    if (cizgi) {
      return SizedBox(
        width: 64,
        child: Center(
          child: Text('–', style: TextStyle(color: c.muted)),
        ),
      );
    }
    return SizedBox(
      width: 64,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          MwAmountInput(
            controller: controller,
            hint: '0',
            width: 64,
            enabled: enabled,
            onChanged: onDegisti == null ? null : (_) => onDegisti!(),
          ),
          if (kalan != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                kalan!.text,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: kalan!.wiped ? c.danger : c.success,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Savascilar extends StatelessWidget {
  const _Savascilar({
    required this.units,
    required this.sonuc,
    required this.kutu,
    required this.turlar,
    required this.onDegisti,
  });

  final List<CatalogUnit> units;
  final MwSimResult? sonuc;
  final _Kutu kutu;
  final int? turlar;
  final VoidCallback onDegisti;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final s = sonuc == null ? null : (a: sonuc!.attacker, d: sonuc!.defender);
    return MwPanel(
      title: 'Savaşçılar',
      trailing: turlar == null
          ? null
          : Text('$turlar tur', style: TextStyle(fontSize: 11, color: c.muted)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _Baslik(),
          for (final u in units)
            _Satir(
              id: u.id,
              ad: u.name,
              kutu: kutu,
              sonuc: s,
              onDegisti: onDegisti,
            ),
        ],
      ),
    );
  }
}

class _Savunma extends StatelessWidget {
  const _Savunma({
    required this.defenses,
    required this.sonuc,
    required this.kutu,
    required this.onDegisti,
  });

  final List<CatalogUnit> defenses;
  final MwSimResult? sonuc;
  final _Kutu kutu;
  final VoidCallback onDegisti;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final s = sonuc == null ? null : (a: null, d: sonuc!.defender);
    return MwPanel(
      title: 'Savunma yapıları',
      trailing: Text(
        'yalnız savunan',
        style: TextStyle(fontSize: 11, color: c.muted),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _Baslik(tekTaraf: true),
          for (final d in defenses)
            _Satir(
              id: d.id,
              ad: d.name,
              kutu: kutu,
              sonuc: s,
              tekTaraf: true,
              folder: 'defenses',
              onDegisti: onDegisti,
              // ⭐ «sv» rozeti: Sur ve Büyü Kalkanı adet değil SEVİYE taşıyor. Rozetsiz
              //    bırakmak oyuncuya «12 sur» yazdırırdı.
              rozet: kLevelBased.contains(d.id) ? 'sv' : null,
            ),
        ],
      ),
    );
  }
}

class _Teknikler extends StatelessWidget {
  const _Teknikler({
    required this.techs,
    required this.kutu,
    required this.onDegisti,
  });

  final List<CatalogUpgradable> techs;
  final _Kutu kutu;
  final VoidCallback onDegisti;

  @override
  Widget build(BuildContext context) => MwPanel(
    title: 'Teknikler',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Baslik(),
        for (final t in techs)
          _Satir(
            id: t.id,
            ad: t.name,
            kutu: kutu,
            sonuc: null,
            folder: 'techs',
            saldiranKapali: !techEditable(t.id, attacker: true),
            onDegisti: onDegisti,
          ),
      ],
    ),
  );
}

class _Gece extends StatelessWidget {
  const _Gece({
    required this.acik,
    required this.onChanged,
    required this.kutu,
  });

  final bool acik;
  final ValueChanged<bool> onChanged;
  final _Kutu kutu;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return MwPanel(
      title: 'Gece savaşı',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SwitchListTile(
            value: acik,
            onChanged: onChanged,
            contentPadding: EdgeInsets.zero,
            visualDensity: VisualDensity.compact,
            title: const Text(
              'Savaş gece gerçekleşsin',
              style: TextStyle(fontSize: 14),
            ),
          ),
          const _Baslik(),
          /* ⚠️ Kutular gece KAPALIYKEN pasif: gece görüşünün gündüz savaşında hiçbir etkisi
             yok ve açık bırakmak, girilen sayının bir işe yaradığını ima ederdi. */
          Row(
            children: [
              Expanded(
                child: Text(
                  'Gece Görüş',
                  style: TextStyle(fontSize: 13, color: acik ? null : c.muted),
                ),
              ),
              SizedBox(
                width: 64,
                child: MwAmountInput(
                  controller: kutu('$_atk:vision'),
                  hint: '0',
                  width: 64,
                  enabled: acik,
                ),
              ),
              const SizedBox(width: 6),
              SizedBox(
                width: 64,
                child: MwAmountInput(
                  controller: kutu('$_def:vision'),
                  hint: '0',
                  width: 64,
                  enabled: acik,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Kahramanlar extends StatelessWidget {
  const _Kahramanlar({
    required this.rows,
    required this.kutu,
    required this.onEdit,
  });

  final Map<String, List<MwSimHero>> rows;
  final _Kutu kutu;
  final Future<void> Function(String taraf) onEdit;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    Widget bolum(String p, String baslik) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                baslik,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Text(
              '${rows[p]!.length}/5',
              style: TextStyle(fontSize: 11, color: c.muted),
            ),
            const SizedBox(width: 8),
            MwSmallButton(
              label: 'Düzenle',
              kind: MwButtonKind.ghost,
              onTap: () => onEdit(p),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: Text(
                'Tapınak toplamı',
                style: TextStyle(fontSize: 12, color: c.muted),
              ),
            ),
            SizedBox(
              width: 64,
              child: MwAmountInput(
                controller: kutu('$p:temple'),
                hint: '0',
                width: 64,
              ),
            ),
          ],
        ),
        Row(
          children: [
            Expanded(
              child: Text(
                'Mevcut kahraman',
                style: TextStyle(fontSize: 12, color: c.muted),
              ),
            ),
            SizedBox(
              width: 64,
              child: MwAmountInput(
                controller: kutu('$p:heroCount'),
                hint: '0',
                width: 64,
              ),
            ),
          ],
        ),
      ],
    );

    return MwPanel(
      title: 'Kahramanlar',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          /* ⚠️ «Tapınak toplamı» ve «Mevcut kahraman» SAVAŞA GİRMİYOR: ikisi de savaş
             sonrası kahraman çıkma ihtimalini besliyor. Kahraman satırlarıyla aynı panelde
             ama ayrı satırlarda durmaları bu yüzden. */
          bolum(_atk, 'Saldıran'),
          const SizedBox(height: 10),
          bolum(_def, 'Savunan'),
        ],
      ),
    );
  }
}

class _Sonuc extends StatelessWidget {
  const _Sonuc({
    required this.sonuclar,
    required this.gorunen,
    required this.onSec,
  });

  final List<MwSimResult> sonuclar;
  final int gorunen;
  final ValueChanged<int> onSec;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final r = sonuclar[gorunen.clamp(0, sonuclar.length - 1)];
    final sayim = simTally(sonuclar);
    final renk = switch (r.winner) {
      'attacker' => c.success,
      'defender' => c.danger,
      _ => c.muted,
    };

    return MwPanel(
      title: 'Sonuç',
      trailing: sonuclar.length == 1
          ? null
          : Text(
              '${sonuclar.length} koşu',
              style: TextStyle(fontSize: 11, color: c.muted),
            ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          /* ⚠️ Çoklu koşuda ÖNCE dağılım, sonra tek koşu: 20 koşunun tek bir tanesine bakıp
             «kazandım» demek, simülatörün rastgeleliğini görmezden gelmek olurdu. */
          if (sonuclar.length > 1) ...[
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Saldıran ${sayim.attacker} · Savunan ${sayim.defender}'
                    '${sayim.draw > 0 ? ' · Berabere ${sayim.draw}' : ''}',
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
                DropdownButton<int>(
                  value: gorunen.clamp(0, sonuclar.length - 1),
                  isDense: true,
                  underline: const SizedBox.shrink(),
                  items: [
                    for (var i = 0; i < sonuclar.length; i++)
                      DropdownMenuItem(value: i, child: Text('#${i + 1}')),
                  ],
                  onChanged: (v) => v == null ? null : onSec(v),
                ),
              ],
            ),
            Divider(height: 12, color: c.border),
          ],
          Text(
            simWinnerLabel(r.winner),
            style: mwDisplayStyle(color: renk, fontSize: 16),
          ),
          const SizedBox(height: 8),
          _Deger(label: 'Tur', value: '${r.turns}'),
          _Deger(
            label: 'Saldıran kaybı',
            value: '${mwNumber(r.attacker.lost)} savaşçı',
          ),
          _Deger(
            label: 'Savunan kaybı',
            value: '${mwNumber(r.defender.lost)} savaşçı',
          ),
          if (r.defender.wallIntegrity != null)
            _Deger(
              label: 'Sur',
              value: integrityText(r.defender.wallIntegrity),
            ),
          if (r.defender.shieldIntegrity != null)
            _Deger(
              label: 'Büyü Kalkanı',
              value: integrityText(r.defender.shieldIntegrity),
            ),
          _Deger(label: 'Deneyim', value: mwNumber(r.xp)),
          _Deger(
            label: 'Kahraman ele geçirme',
            value: chanceText(r.captureChance),
          ),
          _Deger(label: 'Taşıma kapasitesi', value: mwNumber(r.carryCapacity)),
          /* ⚠️ Enkaz yalnız VARSA yazılıyor: sıfır enkaz gerçek bir sonuç ama satırı her
             zaman çizmek, yağma olmayan bir savaşta boş bir vaat gibi durur. */
          if (r.debrisGold > 0 || r.debrisFood > 0)
            _Deger(
              label: 'Enkaz',
              value:
                  '${mwNumber(r.debrisGold)} altın · '
                  '${mwNumber(r.debrisFood)} yemek',
            ),
          if (r.attacker.heroes.isNotEmpty || r.defender.heroes.isNotEmpty) ...[
            Divider(height: 16, color: c.border),
            _Kahramanlik(
              baslik: 'Saldıran kahramanları',
              list: r.attacker.heroes,
            ),
            _Kahramanlik(
              baslik: 'Savunan kahramanları',
              list: r.defender.heroes,
            ),
          ],
        ],
      ),
    );
  }
}

class _Kahramanlik extends StatelessWidget {
  const _Kahramanlik({required this.baslik, required this.list});

  final String baslik;
  final List<MwSimHeroResult> list;

  @override
  Widget build(BuildContext context) {
    if (list.isEmpty) return const SizedBox.shrink();
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(baslik, style: TextStyle(fontSize: 12, color: c.muted)),
          for (var i = 0; i < list.length; i++)
            _Deger(
              label: 'Kahraman ${i + 1} (sv ${list[i].level})',
              // ⚠️ Ölü kahraman «%0» değil «Yok edildi»: yüzde, hâlâ ayakta olan bir şeyin
              //    ölçüsü ve sıfır yüzde okuyan oyuncu onu diriltilebilir sanırdı.
              value: list[i].alive
                  ? integrityText(list[i].durum / 100)
                  : 'Yok edildi',
              danger: !list[i].alive,
            ),
        ],
      ),
    );
  }
}

class _Deger extends StatelessWidget {
  const _Deger({required this.label, required this.value, this.danger = false});

  final String label;
  final String value;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: c.muted)),
          Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: danger ? c.danger : null,
            ),
          ),
        ],
      ),
    );
  }
}

/* ══ KAHRAMAN DÜZENLEYİCİ ═════════════════════════════════════════════════════════════════
   ⚠️ Ayrı bir sheet ve bu ZORUNLU: satır başına beş kutu (Sv · F.Sld · F.Svn · B.Sld ·
   B.Svn) 360 px'e hiçbir düzende sığmıyor. Sheet'te her kahraman kendi kartında, seviye
   üstte, dört yetenek 2×2 ızgarada. */

class _HeroEditor extends StatefulWidget {
  const _HeroEditor({required this.baslangic});

  final List<MwSimHero> baslangic;

  @override
  State<_HeroEditor> createState() => _HeroEditorState();
}

class _HeroEditorState extends State<_HeroEditor> {
  late final List<MwSimHero> _rows = [...widget.baslangic];

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_rows.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(
              'Kahraman yok. Savaşa kahraman katmak için ekle.',
              style: TextStyle(fontSize: 12, color: c.muted),
            ),
          ),
        for (var i = 0; i < _rows.length; i++)
          _HeroCard(
            index: i,
            hero: _rows[i],
            onChanged: (h) => setState(() => _rows[i] = h),
            onSil: () => setState(() => _rows.removeAt(i)),
          ),
        const SizedBox(height: 8),
        // ⚠️ Tavan 5: sunucu şeması da 5 istiyor (`heroes.max(5)`). Kutuyu açık bırakıp
        //    sunucuya reddettirmek, doldurulmuş bir formu boşa harcatmak olurdu.
        MwSmallButton(
          label: 'Kahraman ekle',
          kind: MwButtonKind.ghost,
          onTap: _rows.length >= 5
              ? null
              : () => setState(() => _rows.add(kBosKahraman)),
        ),
        const SizedBox(height: 12),
        MwButton(
          label: 'Kaydet',
          onTap: () => Navigator.of(context).pop(_rows),
        ),
        const SizedBox(height: 8),
        MwButton(
          label: 'Vazgeç',
          kind: MwButtonKind.ghost,
          onTap: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}

class _HeroCard extends StatefulWidget {
  const _HeroCard({
    required this.index,
    required this.hero,
    required this.onChanged,
    required this.onSil,
  });

  final int index;
  final MwSimHero hero;
  final ValueChanged<MwSimHero> onChanged;
  final VoidCallback onSil;

  @override
  State<_HeroCard> createState() => _HeroCardState();
}

class _HeroCardState extends State<_HeroCard> {
  late final _lv = _ctl(widget.hero.level);
  late final _fa = _ctl(widget.hero.fAtk);
  late final _fd = _ctl(widget.hero.fDef);
  late final _ma = _ctl(widget.hero.mAtk);
  late final _md = _ctl(widget.hero.mDef);

  TextEditingController _ctl(int v) =>
      TextEditingController(text: v > 0 ? '$v' : '');

  @override
  void dispose() {
    for (final c in [_lv, _fa, _fd, _ma, _md]) {
      c.dispose();
    }
    super.dispose();
  }

  void _yay() {
    widget.onChanged((
      level: simAmount(_lv.text),
      fAtk: simAmount(_fa.text),
      fDef: simAmount(_fd.text),
      mAtk: simAmount(_ma.text),
      mDef: simAmount(_md.text),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final h = widget.hero;
    final asim = heroOverBudget(h);

    Widget alan(String etiket, TextEditingController ctl) => Expanded(
      child: Row(
        children: [
          Expanded(
            child: Text(etiket, style: TextStyle(fontSize: 12, color: c.muted)),
          ),
          MwAmountInput(
            controller: ctl,
            hint: '0',
            width: 56,
            onChanged: (_) => _yay(),
          ),
        ],
      ),
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: MwPanel(
        title: 'Kahraman ${widget.index + 1}',
        trailing: MwSmallButton(
          label: 'Sil',
          kind: MwButtonKind.ghost,
          onTap: widget.onSil,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Seviye',
                    style: TextStyle(fontSize: 12, color: c.muted),
                  ),
                ),
                MwAmountInput(
                  controller: _lv,
                  hint: '0',
                  width: 56,
                  onChanged: (_) => _yay(),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                alan('F.Sld', _fa),
                const SizedBox(width: 8),
                alan('F.Svn', _fd),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                alan('B.Sld', _ma),
                const SizedBox(width: 8),
                alan('B.Svn', _md),
              ],
            ),
            const SizedBox(height: 6),
            /* ⚠️ Aşım ENGELLENMİYOR, yalnız kırmızıya dönüyor (web'de de öyle): *"seviye 10
               kahramana 40 puan verseydim"* simülatörün cevaplaması gereken bir soru. */
            Text(
              'Puan ${heroSpent(h)}/${heroBudget(h)}',
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: asim ? c.danger : c.muted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
