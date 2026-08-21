/// ⭐⭐ TAPINAK — kahraman ekranı (§13.11.4). Web'deki `Temple.tsx` karşılığı.
///
/// Her kahraman bir kart: portre, ad + seviye, dört yetenek, tecrübe çubuğu, durum rozeti.
/// Aksiyonlar orijinal istemcinin kendi menüsünden: **Özellikler · Adını Değiştir ·
/// Dirilt / Diriltmeyi Durdur**.
///
/// ⚠️ **Büyü yetenekleri ziyan DEĞİL.** Uzun süre *"kahramanın büyü tabanı 0, büyüye puan
/// harcamak boşa"* sanılıyordu; binary'den kahramanın stat satırı bulununca büyü tabanının
/// fizikselle aynı olduğu (1200) ortaya çıktı ve ölçüm doğruladı. Bu yüzden ekranda oyuncuyu
/// büyüden CAYDIRAN bir uyarı yok — yalnız hangi yeteneğin ne yaptığı anlatılıyor.
///
/// ⭐ NATIVE: web'de kart içinde açılan iki panel (puan dağıtımı, ad değiştirme) mobilde
/// **bottom sheet**; diriltme onayı da `mwConfirmSheet`ten geçiyor (kaynak harcıyor ve iade
/// edilmiyor). Politika `ui/native.dart`ta.
///
/// ⚠️ Kuralların anlatımı buraya DEĞİL, Yardım sayfasına gidecek (web'de kullanıcı kararı).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../core/clock.dart';
import '../../gen/facts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'hero_model.dart';
import 'hero_rules.dart';

/// «Puanı nereye harcayayım» ipuçları — **yalnız Tapınak'a özgü**.
///
/// ⚠️ Anahtar, etiket ve simge `gen/facts.g.dart`tan (web'le ortak kaynak); ipuçları burada
/// kalıyor çünkü casusluk raporu da aynı dörtlüyü çiziyor ama orada rakibin puanını okuyan
/// oyuncuya ders anlatmanın yeri yok.
const Map<String, String> _hints = {
  'fAtk': 'Yakın dövüş fazında ordunun vuruş gücüne eklenir.',
  'fDef':
      'Kahramanın fiziksel dayanıklılığını ve ordunun savunma payını artırır.',
  'mAtk':
      'BÜYÜ fazında ordunun vuruş gücüne eklenir — büyü ağırlıklı ordularda belirleyici.',
  'mDef': 'Gelen büyü hasarına karşı kahramanın direncini artırır.',
};

class TempleScreen extends ConsumerWidget {
  const TempleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cityId = ref.watch(activeCityProvider).value;
    if (cityId == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final temple = ref.watch(templeProvider(cityId));

    return temple.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(16),
        child: MwErrorBox('Tapınak alınamadı: $e'),
      ),
      /* ⚠️ Şehir de tazeleniyor: diriltme kaynak harcıyor ve üst bardaki kasa aynı jestle
         güncellenmezse oyuncu iki farklı tazelikte iki sayı görür. */
      data: (t) => MwRefresh(
        onRefresh: () {
          ref.invalidate(templeProvider(cityId));
          ref.invalidate(cityProvider(cityId));
          return mwRefreshAll([
            ref.read(templeProvider(cityId).future),
            ref.read(cityProvider(cityId).future),
          ]);
        },
        builder: (physics) => ListView(
          physics: physics,
          padding: const EdgeInsets.all(12),
          children: [
            MwPanel(
              title: 'Tapınak',
              trailing: Text(
                'sv ${t.templeLevel} · ${t.heroCount}/${t.maxHeroes}',
                style: TextStyle(
                  fontSize: 11,
                  color: MwColors.of(context).onPanelHeader,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              child: t.heroes.isEmpty
                  ? const MwEmpty('Bu şehirde hiç kahraman yok.')
                  : Column(
                      children: [
                        for (var i = 0; i < t.heroes.length; i++) ...[
                          if (i > 0) const SizedBox(height: 10),
                          _HeroCard(hero: t.heroes[i], cityId: cityId),
                        ],
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroCard extends ConsumerStatefulWidget {
  const _HeroCard({required this.hero, required this.cityId});

  final HeroRow hero;
  final int cityId;

  @override
  ConsumerState<_HeroCard> createState() => _HeroCardState();
}

class _HeroCardState extends ConsumerState<_HeroCard> {
  bool _busy = false;
  String? _error;

  /// ⚠️ Hata/başarı geri bildirimi TEK yerde — her çağıran kendi `try`ını yazsaydı titreşim
  /// bir yerde unutulur ve davranış kart içinde ayrışırdı (`buildings_screen` ile aynı kalıp).
  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
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
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final h = widget.hero;
    final clock = ref.watch(clockProvider);
    // Geri sayımlar (diriltme, dönüş) saniyede bir yenilensin.
    ref.watch(tickProvider);

    final durum = heroStateLabel(h.state);
    final renk = switch (durum.tone) {
      MwHeroTone.success => c.success,
      MwHeroTone.warning => c.warning,
      MwHeroTone.danger => c.danger,
      MwHeroTone.muted => c.muted,
    };

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ⭐ Düşmüş kahramanın portresi GRİ: durum rozeti zaten yazıyor ama kart
              // kalabalık ve renk, metinden önce okunuyor.
              ColorFiltered(
                colorFilter: h.fallen
                    ? const ColorFilter.matrix(<double>[
                        0.2126, 0.7152, 0.0722, 0, 0, //
                        0.2126, 0.7152, 0.0722, 0, 0, //
                        0.2126, 0.7152, 0.0722, 0, 0, //
                        0, 0, 0, 1, 0,
                      ])
                    : const ColorFilter.mode(Colors.transparent, BlendMode.dst),
                child: const MwIcon(folder: 'hero', id: 'kahraman', size: 48),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            h.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'sv ${h.level}',
                          style: TextStyle(fontSize: 12, color: c.muted),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    // ⭐ Dört yetenek — sıra oyunun kendi sırası (`kHeroSkills`).
                    Wrap(
                      spacing: 10,
                      runSpacing: 2,
                      children: [
                        for (final s in kHeroSkills)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              MwIcon(folder: 'hero', id: s.icon, size: 16),
                              const SizedBox(width: 3),
                              Text(
                                '${h.skill(s.key)}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontFeatures: [FontFeature.tabularFigures()],
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 7,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      border: Border.all(color: renk),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      durum.text,
                      style: TextStyle(fontSize: 10, color: renk),
                    ),
                  ),
                  if (h.state == 'reviving' && h.reviveUntil != null)
                    _Sayac(clock.remaining(h.reviveUntil)),
                  if (h.state == 'returning' && h.returningAt != null)
                    _Sayac(
                      '${clock.remaining(h.returningAt) ?? 'birazdan'} sonra şehirde',
                    ),
                  if ((h.state == 'entering_cave' ||
                          h.state == 'leaving_cave') &&
                      h.caveAt != null)
                    _Sayac(clock.remaining(h.caveAt)),
                ],
              ),
            ],
          ),

          const SizedBox(height: 8),
          _XpBar(hero: h),

          if (h.state == 'returning') ...[
            const SizedBox(height: 6),
            Text(
              'Savaşta düştü ve şehre dönüyor. Ordusundan kimse kalmadıysa kendi hızıyla '
              'yalnız yürür. Vardığında Tapınak\'tan diriltebilirsin.',
              style: TextStyle(fontSize: 11, color: c.muted),
            ),
          ],

          if (_error != null) ...[
            const SizedBox(height: 8),
            MwErrorBox(_error!),
          ],

          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              MwSmallButton(
                // ⭐ Seviye savaşta kendiliğinden atlıyor; oyuncuya kalan tek iş bu puanları
                // dağıtmak, o yüzden sayı düğmenin üstünde.
                label: h.pointsLeft > 0
                    ? 'Özellikler · ${h.pointsLeft} puan'
                    : 'Özellikler',
                kind: h.pointsLeft > 0
                    ? MwButtonKind.primary
                    : MwButtonKind.ghost,
                onTap: _busy ? null : () => _puanSheet(h),
              ),
              MwSmallButton(
                label: 'Adını Değiştir',
                kind: MwButtonKind.ghost,
                onTap: _busy ? null : () => _adSheet(h),
              ),
              if (h.state == 'dead' && h.reviveCost != null)
                MwSmallButton(
                  label: 'Dirilt',
                  onTap: _busy ? null : () => _dirilt(h),
                ),
              if (h.state == 'reviving')
                MwSmallButton(
                  label: 'Diriltmeyi Durdur',
                  kind: MwButtonKind.danger,
                  onTap: _busy ? null : () => _durdur(h),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _puanSheet(HeroRow h) async {
    final sonuc = await mwSheet<Map<String, int>>(
      context,
      title: 'Puan dağıt',
      child: _SkillEditor(hero: h),
    );
    if (sonuc == null || !mounted) return;
    await _run(
      () => ref.read(heroesProvider).setSkills(widget.cityId, h.id, sonuc),
    );
  }

  Future<void> _adSheet(HeroRow h) async {
    final ad = await mwSheet<String>(
      context,
      title: 'Adını değiştir',
      child: _RenameBox(hero: h),
    );
    if (ad == null || !mounted) return;
    await _run(() => ref.read(heroesProvider).rename(widget.cityId, h.id, ad));
  }

  Future<void> _dirilt(HeroRow h) async {
    final c = h.reviveCost!;
    final ok = await mwConfirmSheet(
      context,
      title: '${h.name} diriltilsin mi?',
      /* ⚠️⚠️ Burada RAKAM VAR ve bu, `mwConfirm`in «rakam yazma» kuralının bilinçli istisnası:
         orada sorun, ekrandaki tahminin sunucunun ONAY ANINDAKİ hesabından sapmasıydı (iade
         oranı zamanla değişiyor). Diriltme maliyeti ise seviyeye bağlı ve zamanla değişmiyor;
         üstelik oyuncunun karar verebilmesi için kaç kaynak gideceğini bilmesi ŞART.

         ⚠️ `body` düz metin karşılığı olarak duruyor (gerekçe `mwConfirmSheet`te); ekranda
         çizilen `bodyWidget`. */
      body:
          'Maliyet: ${mwNumber(c.gold)} altın, ${mwNumber(c.food)} yemek. '
          'Süre: ${formatDuration(h.reviveSeconds ?? 0)}. '
          'Kaynak şehrinden düşer ve iptal edilse bile iade edilmez.',
      /* ⭐⭐ MALİYET ARTIK İKONLU ve SÜRE DE YAZIYOR (kullanıcı, 2026-08-22: *"diriltme
         maliyeti için altın ve yemek resimleri olsun… Diriltme maliyeti ile beraber diriltme
         süresi de başlamadan önce gösterilsin."*).

         ⚠️ Süre alanı (`reviveSeconds`) modelde BAŞTAN BERİ vardı ama hiç çizilmiyordu:
         oyuncu kaç kaynak gideceğini görüyor, ne kadar bekleyeceğini görmüyordu. Web zaten
         gösteriyordu, eksik olan yalnız mobildi.
         ⚠️ Metinde **tire yok** (kullanıcı isteği + deponun yazım kuralı): ayırıcı olarak
         nokta ve virgül kullanıldı. */
      bodyWidget: Builder(
        builder: (ctx) {
          final renk = MwColors.of(ctx).muted;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 10,
                runSpacing: 4,
                children: [
                  Text('Maliyet', style: TextStyle(fontSize: 13, color: renk)),
                  MwResource(kind: 'gold', amount: c.gold, size: 16),
                  MwResource(kind: 'food', amount: c.food, size: 16),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Text('Süre', style: TextStyle(fontSize: 13, color: renk)),
                  const SizedBox(width: 10),
                  Text(
                    formatDuration(h.reviveSeconds ?? 0),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(ctx).colorScheme.primary,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'Kaynak şehrinin kasasından düşer ve iptal edilse bile iade edilmez.',
                style: TextStyle(fontSize: 12, color: renk),
              ),
              const SizedBox(height: 4),
              Text(
                'Kahramanın seviyesi arttıkça süre de maliyet de yükselir. '
                'Bu şehrin Tapınağını yükseltmek süreyi kısaltır.',
                style: TextStyle(fontSize: 12, color: renk),
              ),
            ],
          );
        },
      ),
      confirmLabel: 'Dirilt',
      danger: false,
    );
    if (!ok || !mounted) return;
    await _run(() => ref.read(heroesProvider).revive(widget.cityId, h.id));
  }

  Future<void> _durdur(HeroRow h) async {
    final ok = await mwConfirmSheet(
      context,
      title: 'Diriltme durdurulsun mu?',
      body: 'Harcanan kaynak iade edilmez.',
      confirmLabel: 'Durdur',
    );
    if (!ok || !mounted) return;
    await _run(
      () => ref.read(heroesProvider).cancelRevive(widget.cityId, h.id),
    );
  }
}

class _Sayac extends StatelessWidget {
  const _Sayac(this.text);

  final String? text;

  @override
  Widget build(BuildContext context) => text == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(
            text!,
            style: TextStyle(
              fontSize: 11,
              color: MwColors.of(context).muted,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        );
}

class _XpBar extends StatelessWidget {
  const _XpBar({required this.hero});

  final HeroRow hero;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '${mwNumber(hero.xp)} / ${mwNumber(hero.xpForNext)}',
          style: TextStyle(
            fontSize: 11,
            color: c.muted,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(height: 3),
        // ⚠️ `animate: false`: tecrübe savaş sonrası **sıçrayarak** artıyor, yumuşak geçiş
        // çubuğu "doluyor" gibi gösterip olmayan bir ilerleme hissi veriyordu.
        MwBar(value: xpProgress(hero.xp, hero.xpForNext), animate: false),
      ],
    );
  }
}

/// Puan dağıtım sheet'i — kaydedilince taslağı döndürüyor.
class _SkillEditor extends StatefulWidget {
  const _SkillEditor({required this.hero});

  final HeroRow hero;

  @override
  State<_SkillEditor> createState() => _SkillEditorState();
}

class _SkillEditorState extends State<_SkillEditor> {
  late final Map<String, int> _draft = {
    for (final s in kHeroSkills) s.key: widget.hero.skill(s.key),
  };

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final h = widget.hero;
    final kalan = pointsLeftIn(_draft, h.pointsTotal);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Text('Kalan puan', style: TextStyle(color: c.muted)),
            const Spacer(),
            Text(
              '$kalan',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: kalan > 0 ? c.warning : c.muted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        for (final s in kHeroSkills)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    MwIcon(folder: 'hero', id: s.icon, size: 20),
                    const SizedBox(width: 8),
                    Expanded(child: Text(s.label)),
                    _Step(
                      label: '−',
                      // ⭐ Taban KAYDEDİLMİŞ değer: dağıtılan puan geri alınamıyor. Bu turda
                      //   eklenen puanı geri almak serbest, gerekçe `canDecreaseSkill`de.
                      onTap: canDecreaseSkill(_draft[s.key]!, h.skill(s.key))
                          ? () => setState(
                              () => _draft[s.key] = _draft[s.key]! - 1,
                            )
                          : null,
                    ),
                    SizedBox(
                      width: 34,
                      child: Text(
                        '${_draft[s.key]}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                    _Step(
                      label: '+',
                      onTap: canIncreaseSkill(kalan)
                          ? () => setState(
                              () => _draft[s.key] = _draft[s.key]! + 1,
                            )
                          : null,
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.only(left: 28, top: 1),
                  child: Text(
                    _hints[s.key] ?? '',
                    style: TextStyle(fontSize: 11, color: c.muted),
                  ),
                ),
              ],
            ),
          ),
        Text(
          'Dağıtılan puan geri alınamaz. Puanı saklayıp sonra dağıtabilirsin.',
          style: TextStyle(fontSize: 11, color: c.muted),
        ),
        const SizedBox(height: 12),
        MwButton(
          label: 'Kaydet',
          // ⚠️ Değişiklik yoksa kapalı: boş bir yazma isteği göndermenin anlamı yok.
          onTap: canSaveSkills(_draft, h.pointsSpent)
              ? () => Navigator.of(context).pop(_draft)
              : null,
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

class _Step extends StatelessWidget {
  const _Step({required this.label, required this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return SizedBox(
      width: 36,
      height: 36,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          padding: EdgeInsets.zero,
          minimumSize: Size.zero,
          side: BorderSide(color: c.border),
          foregroundColor: c.muted,
        ),
        child: Text(label, style: const TextStyle(fontSize: 16)),
      ),
    );
  }
}

/// Ad değiştirme sheet'i — kaydedilince yeni adı döndürüyor.
class _RenameBox extends StatefulWidget {
  const _RenameBox({required this.hero});

  final HeroRow hero;

  @override
  State<_RenameBox> createState() => _RenameBoxState();
}

class _RenameBoxState extends State<_RenameBox> {
  late final _c = TextEditingController(text: widget.hero.name);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final gecerli = isNameLengthOk(_c.text, min: kNameMin, max: kNameMax);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        TextField(
          controller: _c,
          // ⚠️ Sayılar üretilmiş olgulardan (`gen/facts.g.dart`): elle yazılsaydı kutu
          // sunucunun reddedeceği bir adı kabul edip düğmeyi açardı — web'de tam bu yaşandı.
          maxLength: kNameMax,
          autofocus: true,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Kahraman adı',
            border: OutlineInputBorder(),
          ),
        ),
        Text(kNameRuleMessage, style: TextStyle(fontSize: 11, color: c.muted)),
        const SizedBox(height: 12),
        MwButton(
          label: 'Kaydet',
          onTap: gecerli
              ? () => Navigator.of(context).pop(_c.text.trim())
              : null,
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
