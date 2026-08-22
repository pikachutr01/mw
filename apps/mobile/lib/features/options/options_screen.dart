/// ⭐⭐ SEÇENEKLER — web'deki `OptionsScreen` (`Placeholders.tsx`) karşılığı.
///
/// Kullanıcı isteği (2026-08-20): *"mobilde Seçenekler sayfasını da kodlamaya başla. Burada
/// gece-gündüz modu seçebilecek kısım da eklenmesi lazım. Webdeki seçenekler sayfasına göre
/// uygulamaya da yap."*
///
/// ─ ⚠️ WEB'DEKİ SEKİZ PANELİN MOBİLDEKİ KARŞILIĞI ─────────────────────────────────────────
/// ✔ **Görünüm** (Gece/Gündüz/Sistem) · **Hesap** · **Bildirimler** · **Tatil modu** ·
///    **Engellenenler** — ilk turda (2026-08-20) geldi.
/// ✔ **Cihazlar** · **Şehir yönetimi** · **Hesabı sil** — 2026-08-22'de geldi; ilk turda
///    ertelenmişlerdi ve gerekçeleri aşağıda **düzeltiliyor**.
/// ⛔ **Tercihler** (arka plan görseli) — web'e özel bir görsel ayarı; mobilde karşılığı yok.
///    Tek bilerek eksik panel bu.
///
/// ─ ⚠️⚠️ İLK TURDAKİ ÜÇ GEREKÇE NEDEN GEÇERSİZ ÇIKTI ──────────────────────────────────────
/// Not düşmenin amacı buydu: erteleme gerekçesi yazılıysa sınanabiliyor. Üçü de sınandı.
///
/// 1. *"Liste `x-device-id` ile eşleşiyor, «bu cihaz hangisi» ayrımını yanlış göstermek
///    oyuncuya kendi oturumunu kapattırabilirdi."* → **Yanlıştı.** Ayrımı istemci yapmıyor:
///    `auth.service.ts` · `listSessions` `current` bayrağını `bool_or(f.id = currentSessionId)`
///    ile SUNUCUDA hesaplıyor ve listeyi kendi cihaz üstte olacak şekilde sıralıyor. Tahmin
///    edilen bir şey yok, dolayısıyla yanlış işaretlenecek bir şey de yok.
///
/// 2. *"Şehir yönetimi Şehir sekmesine daha yakın duruyor."* → Web'de de **Seçenekler**'de
///    (`CityAdminPanel`). Şehir sekmesinde ona ayrılmış bir yer yok ve iki yere birden koymak
///    üçüncü bir kopya olurdu. Web ile aynı yerde durması, oyuncunun iki istemcide aynı işi
///    aynı yerde araması demek.
///
/// 3. *"Hesap silme Google Play şartı gereği webde kalmak zorunda."* → Şart **yıkıcı adım**
///    için: `MOBIL_UYGULAMA.md` §5'in dediği, silme SAYFASININ webde ve **oturumsuz** kalması
///    (bağlantı çoğu zaman posta uygulamasından oturumsuz bir tarayıcıda açılır). Aynı
///    paragraf açıkça *"silmeyi kayıttan zorlaştırmamak mağaza kuralı, kolaylaştırmak
///    serbest"* diyor. Buradaki düğme hesabı silmiyor; yalnız `delete-account/request` ile
///    e-postaya 12 saatlik bağlantı yollatıyor. Yıkıcı adım hâlâ jetonlu ve hâlâ webde.
///
/// ⚠️ Bildirim İZNİ düğmesi hâlâ yok: mobilde push henüz kurulmadı (Faz 3). Kategori
/// anahtarları yine de anlamlı — oyun açıkken görünen toast'ı da onlar yönetiyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../gen/contracts.g.dart';
import '../../gen/facts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
// ⚠️ Özellikler arası tek import ve bilinçli: `isNameLengthOk` ad uzunluğunun GENEL kuralı
// (sunucuda şehir ve kahraman adı aynı `gameName` şemasından geçiyor), yalnız tapınakta
// yaşıyor olması bir tesadüf. İkinci bir kopya yazmak iki kuralı ayrıştırırdı.
import '../temple/hero_rules.dart';
import 'options_rules.dart';

class OptionsScreen extends ConsumerWidget {
  const OptionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MwRefresh(
      onRefresh: () {
        ref
          ..invalidate(accountInfoProvider)
          ..invalidate(notifyPrefsProvider)
          ..invalidate(vacationProvider)
          ..invalidate(blockedPlayersProvider)
          ..invalidate(devicesProvider)
          ..invalidate(citiesProvider);
        return mwRefreshAll([
          ref.read(accountInfoProvider.future),
          ref.read(notifyPrefsProvider.future),
          ref.read(vacationProvider.future),
          ref.read(blockedPlayersProvider.future),
          ref.read(devicesProvider.future),
          ref.read(citiesProvider.future),
        ]);
      },
      /* ⚠️ Sıra rastgele değil: en sık dokunulan ayar üstte, geri alınamayan iş en altta.
         «Hesabı sil» dibe konmasa, oyuncu «Engeli kaldır»a giderken yolu kırmızı bir
         düğmenin üstünden geçerdi. Web'de de silme paneli sayfanın en altında. */
      builder: (physics) => ListView(
        physics: physics,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
        children: const [
          _Gorunum(),
          SizedBox(height: 10),
          _Hesap(),
          SizedBox(height: 10),
          _Sehir(),
          SizedBox(height: 10),
          _Bildirimler(),
          SizedBox(height: 10),
          _Tatil(),
          SizedBox(height: 10),
          _Engellenenler(),
          SizedBox(height: 10),
          _Cihazlar(),
          SizedBox(height: 10),
          _HesapSilme(),
        ],
      ),
    );
  }
}

/// ⭐⭐ GÖRÜNÜM — Gece / Gündüz / Sistem.
///
/// ⚠️ «Sistem» seçeneği KALDIRILMADI ve varsayılan o: telefonun gece moduna geçmesiyle oyunun
/// da geçmesi çoğu oyuncunun beklediği davranış. Yalnız iki seçenek sunmak, işletim sistemini
/// takip etmek isteyeni mecburen bir tarafa sabitlerdi.
class _Gorunum extends ConsumerWidget {
  const _Gorunum();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final secili = ref.watch(themeProvider);
    return MwPanel(
      title: 'Görünüm',
      child: Row(
        children: [
          for (final t in kThemeChoices) ...[
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(
                  left: t == kThemeChoices.first ? 0 : 6,
                ),
                child: MwSmallButton(
                  label: t.label,
                  kind: t.mode == secili
                      ? MwButtonKind.primary
                      : MwButtonKind.ghost,
                  // ⚠️ Aynı seçeneğe tekrar dokunmak diske yazmıyor: gereksiz bir yazma
                  //    ve gereksiz bir yeniden çizim.
                  onTap: t.mode == secili
                      ? null
                      : () => ref.read(themeProvider.notifier).select(t.mode),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Hesap extends ConsumerWidget {
  const _Hesap();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final hesap = ref.watch(accountInfoProvider).value;

    return MwPanel(
      title: 'Hesap',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Satir(
            label: 'E-posta',
            // ⚠️ Oyuncunun yazdığı metin → Cinzel YOK, gövde fontu.
            value: hesap?.email ?? '—',
          ),
          const SizedBox(height: 6),
          /* ⚠️ Doğrulanmamış hesap gerçekten KISITLI (§verify: saldırı, nakliye ve mesaj yok).
             Bu yüzden satır sessiz bir bilgi değil, uyarı renginde. */
          Row(
            children: [
              Icon(
                hesap?.verified ?? false
                    ? Icons.verified_outlined
                    : Icons.error_outline,
                size: 16,
                color: hesap?.verified ?? false ? c.success : c.warning,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  hesap?.verified ?? false
                      ? 'E-postan doğrulanmış.'
                      : 'E-postan doğrulanmamış. Saldırı, nakliye ve mesaj kapalı.',
                  style: TextStyle(
                    fontSize: 12,
                    color: hesap?.verified ?? false ? c.muted : c.warning,
                  ),
                ),
              ),
            ],
          ),
          /* ⛔ «Çıkış yap» BURAYA KONMADI ve bu web'in kendi kararının tekrarı: orada da
             *"«Oyunu Kapat» kaldırıldı: çıkış zaten sol menüde ve mobilde «Daha» listesinde
             var, bu ÜÇÜNCÜ kopyaydı"* yazıyor. Mobilde çıkış «Daha» sheet'inde duruyor;
             ikinci bir kopya, aynı işi iki yerde bakmak demek olurdu. */
        ],
      ),
    );
  }
}

class _Bildirimler extends ConsumerWidget {
  const _Bildirimler();

  /// ⚠️⚠️ Etiketler İSTEMCİDE, anahtarlar SUNUCUDA. Bilinmeyen bir anahtar ham adıyla
  /// çiziliyor, gizlenmiyor: sunucu yeni bir kategori eklediğinde oyuncu onu görebilmeli,
  /// yoksa "kapatamadığım bir bildirim var" durumu doğar. Web'deki `CATEGORIES` listesiyle
  /// elle hizalı (i18n paketi 2026-08-19'da reddedildi).
  static const Map<String, ({String label, String hint})> _etiketler = {
    'dm': (label: 'Özel mesaj', hint: 'Bir oyuncu sana mesaj yazdığında.'),
    'report': (
      label: 'Raporlar ve ittifak',
      hint: 'Rapor düşünce, davet gelince.',
    ),
    'production': (
      label: 'Üretim ve inşaat',
      hint: 'Bina, birim ya da araştırma tamamlandığında.',
    ),
    'mention': (
      label: 'İttifak sohbetinde bahsedilme',
      hint: 'Sohbette @ ile senden bahsedildiğinde.',
    ),
    'ticket': (
      label: 'Destek yanıtı',
      hint: 'Yönetim destek talebini yanıtladığında.',
    ),
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final prefs = ref.watch(notifyPrefsProvider);

    return MwPanel(
      title: 'Bildirimler',
      child: prefs.when(
        loading: () =>
            Text('Yükleniyor…', style: TextStyle(fontSize: 12, color: c.muted)),
        error: (_, _) => const MwErrorBox('Bildirim ayarları okunamadı.'),
        data: (map) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            /* ⚠️ Mobilde push HENÜZ YOK (Faz 3) ve bunu yazmak şart: anahtarları görüp
               "telefonuma bildirim gelecek" sanan oyuncu yanılırdı. Anahtarlar yine de
               işlevsiz değil — oyun açıkken görünen toast'ı da onlar yönetiyor. */
            Text(
              'Telefon bildirimleri henüz kurulmadı. Bu anahtarlar şimdilik oyun açıkken '
              'görünen bildirimleri yönetiyor.',
              style: TextStyle(fontSize: 11, color: c.muted),
            ),
            const SizedBox(height: 8),
            for (final e in map.entries)
              SwitchListTile(
                value: e.value,
                onChanged: (v) => ref
                    .read(optionsActionsProvider)
                    .setNotifyPref(e.key, on: v),
                contentPadding: EdgeInsets.zero,
                visualDensity: VisualDensity.compact,
                title: Text(
                  _etiketler[e.key]?.label ?? e.key,
                  style: const TextStyle(fontSize: 14),
                ),
                subtitle: _etiketler[e.key] == null
                    ? null
                    : Text(
                        _etiketler[e.key]!.hint,
                        style: TextStyle(fontSize: 11, color: c.muted),
                      ),
              ),
          ],
        ),
      ),
    );
  }
}

/// ⭐ TATİL MODU — orijinalde de Seçenekler menüsünün maddesi (`g.java` case 63).
///
/// ⚠️ Panel oyuncuya **ne kaybedeceğini önden** söylüyor. Tatil modu "saldırıya kapalıyım"
/// düğmesi değil: üretim, ilerletme ve kaynak birikimi de duruyor. Bunu onay kutusuna
/// sıkıştırmak yerine gövdeye yazmak gerekiyordu — onayı okumadan geçen oyuncu 48 saat
/// boyunca donmuş bir imparatorlukla kalıyor ve geri alamıyor (web'de aynı karar).
class _Tatil extends ConsumerWidget {
  const _Tatil();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final v = ref.watch(vacationProvider);

    return MwPanel(
      title: 'Tatil modu',
      child: v.when(
        loading: () =>
            Text('Yükleniyor…', style: TextStyle(fontSize: 12, color: c.muted)),
        error: (_, _) => const MwErrorBox('Tatil durumu okunamadı.'),
        data: (d) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              d.onVacation
                  ? 'Tatildesin. Şehirlerine saldırılamaz; üretim ve ilerletme durdu.'
                  : 'Tatilde şehirlerine saldırılamaz. Karşılığında üretim, ilerletme ve '
                        'kaynak birikimi de durur.',
              style: TextStyle(fontSize: 12, color: c.muted),
            ),
            /* ⚠️ Engeller LİSTE hâlinde (sunucu da öyle döndürüyor): tek engel gösterseydik
               oyuncu onu çözer, tekrar dener, bu sefer başkasını görürdü — her adım yeni bir
               sürpriz olurdu. */
            if (d.blockers.isNotEmpty) ...[
              const SizedBox(height: 8),
              for (final b in d.blockers)
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    '• $b',
                    style: TextStyle(fontSize: 12, color: c.warning),
                  ),
                ),
            ],
            const SizedBox(height: 12),
            MwButton(
              label: d.onVacation ? 'Tatilden çık' : 'Tatile gir',
              kind: d.onVacation ? MwButtonKind.primary : MwButtonKind.ghost,
              // ⚠️ Engel varken düğme KAPALI ama panel yine de çiziliyor: sebep hemen
              //    üstünde yazıyor, oyuncu neyi çözeceğini biliyor.
              onTap: d.blockers.isNotEmpty && !d.onVacation
                  ? null
                  : () => _degistir(context, ref, gir: !d.onVacation),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _degistir(
    BuildContext context,
    WidgetRef ref, {
    required bool gir,
  }) async {
    final ok = await mwConfirmSheet(
      context,
      title: gir ? 'Tatile gir' : 'Tatilden çık',
      body: gir
          ? 'Üretim, ilerletme ve kaynak birikimi duracak. En erken 48 saat sonra '
                'çıkabilirsin. Emin misiniz!'
          : 'Şehirlerin yeniden saldırıya açılacak. Emin misiniz!',
      confirmLabel: gir ? 'Tatile gir' : 'Çık',
      danger: gir,
    );
    if (!ok) return;
    try {
      await ref.read(optionsActionsProvider).setVacation(on: gir);
      await mwTapOk();
    } on MwApiError catch (_) {
      await mwTapError();
    }
  }
}

class _Engellenenler extends ConsumerWidget {
  const _Engellenenler();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final liste = ref.watch(blockedPlayersProvider).value ?? const [];

    return MwPanel(
      title: 'Engellenenler',
      child: liste.isEmpty
          ? Text(
              'Kimseyi engellemedin.',
              style: TextStyle(fontSize: 12, color: c.muted),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final b in liste)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        // ⚠️ Oyuncu adı → gövde fontu, `mwUpper` YOK.
                        Expanded(child: Text(b.username)),
                        MwSmallButton(
                          label: 'Engeli kaldır',
                          kind: MwButtonKind.ghost,
                          onTap: () async {
                            await ref
                                .read(chatProvider)
                                .setBlocked(b.playerId, blocked: false);
                            ref.invalidate(blockedPlayersProvider);
                          },
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}

/// ⭐⭐ AKTİF CİHAZLAR — web'deki `DevicesPanel` karşılığı.
///
/// ⚠️ Liste `sessions.chain_id` başına TEK satır. Satır kimliğiyle gruplansaydı dönmeli
/// refresh yüzünden aynı telefon 15 dakikada bir yeni bir cihazmış gibi görünürdü ve
/// oyuncunun «çıkar» dediği satır zaten ölü olurdu (`0028_session_chains.sql`).
///
/// ⚠️ Web «diğer cihazlar»ı bir MODAL'da gösteriyor; burada **yerinde açılıyor**. Gerekçe
/// web'inkinin tersi değil, aynı: orada panel iki sütunlu ızgarada duruyor ve uzun bir liste
/// düzeni bozardı. Burada sayfa zaten kayıyor; listeyi bir sheet'e koymak, kaydırılabilir bir
/// şeyin üstüne ikinci bir kaydırılabilir katman bindirmek olurdu.
class _Cihazlar extends ConsumerStatefulWidget {
  const _Cihazlar();

  @override
  ConsumerState<_Cihazlar> createState() => _CihazlarState();
}

class _CihazlarState extends ConsumerState<_Cihazlar> {
  bool _acik = false;
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final liste = ref.watch(devicesProvider);

    return MwPanel(
      title: 'Aktif cihazlar',
      trailing: liste.value == null || liste.value!.length < 2
          ? null
          : Text(
              '${liste.value!.length - 1} diğer',
              style: TextStyle(fontSize: 11, color: c.muted),
            ),
      child: liste.when(
        loading: () =>
            Text('Yükleniyor…', style: TextStyle(fontSize: 12, color: c.muted)),
        error: (_, _) => const MwErrorBox('Cihaz listesi okunamadı.'),
        data: (items) {
          final digerleri = items.where((d) => !d.current).toList();
          final bu = items.where((d) => d.current).firstOrNull;

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (bu != null)
                _CihazSatiri(cihaz: bu, busy: _busy, onCikar: () => _cikar(bu))
              else
                Text(
                  /* ⚠️ İki ayrı boş hâl, tek metin değil: «liste boş» ile «listede
                     varım ama işaretlenmemişim» farklı arızalar ve ikincisi sunucu
                     tarafında bir hataya işaret eder. */
                  items.isEmpty
                      ? 'Aktif oturum bulunamadı.'
                      : 'Bu cihaz listede görünmüyor.',
                  style: TextStyle(fontSize: 12, color: c.muted),
                ),

              if (digerleri.isNotEmpty) ...[
                const SizedBox(height: 10),
                MwSmallButton(
                  label: _acik
                      ? 'Diğer cihazları gizle'
                      : 'Diğer cihazlar (${digerleri.length})',
                  kind: MwButtonKind.ghost,
                  onTap: () => setState(() => _acik = !_acik),
                ),
                if (_acik)
                  for (final d in digerleri)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: _CihazSatiri(
                        cihaz: d,
                        busy: _busy,
                        onCikar: () => _cikar(d),
                      ),
                    ),
                const SizedBox(height: 10),
                MwButton(
                  label: 'Diğer tüm cihazlardan çık',
                  kind: MwButtonKind.danger,
                  busy: _busy,
                  onTap: _busy ? null : _hepsindenCik,
                ),
              ],

              if (_error != null) ...[
                const SizedBox(height: 8),
                MwErrorBox(_error!),
              ],
            ],
          );
        },
      ),
    );
  }

  /// ⚠️⚠️ KENDİ CİHAZINI ÇIKARMAK = ÇIKIŞ. Sunucu bunu engellemiyor (uzaktakini
  /// düşürebilen zaten oturumun sahibi) ve yanıtta `self` bayrağını yolluyor. Web bu
  /// bayrağı okumuyor: orada oturum ancak bir sonraki istek 401 alınca düşüyor, yani
  /// oyuncu belirsiz bir süre "hâlâ içerideymiş" gibi görünüyor. Burada bayrağı okuyup
  /// çıkışı hemen yapıyoruz — onay metninde verilen söz («giriş ekranına döneceksin») o
  /// zaman gerçekten tutuluyor.
  Future<void> _cikar(MwDevice d) async {
    final ok = await mwConfirmSheet(
      context,
      title: d.current ? 'Bu cihazdan çık' : 'Cihazı çıkar',
      body: d.current
          ? 'Bu cihazdaki oturumun kapanacak ve giriş ekranına döneceksin.'
          : 'O cihaz oyunu açıksa giriş ekranına düşer.',
      confirmLabel: d.current ? 'Çık' : 'Çıkar',
    );
    if (!ok || !mounted) return;
    await _run(() async {
      final kendisi = await ref
          .read(optionsActionsProvider)
          .revokeDevice(d.chainId);
      if (kendisi) await ref.read(authProvider).logout();
    });
  }

  Future<void> _hepsindenCik() async {
    final ok = await mwConfirmSheet(
      context,
      title: 'Diğer cihazlardan çık',
      body: 'Bu cihaz dışındaki bütün oturumlar kapanacak.',
      confirmLabel: 'Hepsini çıkar',
    );
    if (!ok || !mounted) return;
    await _run(() => ref.read(optionsActionsProvider).revokeOtherDevices());
  }

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
}

class _CihazSatiri extends ConsumerWidget {
  const _CihazSatiri({
    required this.cihaz,
    required this.busy,
    required this.onCikar,
  });

  final MwDevice cihaz;
  final bool busy;
  final VoidCallback onCikar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    /* ⚠️ `tickProvider` BİLEREK izlenmiyor: bu bir geri sayım değil, geçmiş bir damga.
       Saniyede bir yeniden çizmek «5 dakika önce»yi değiştirmez, yalnız gürültü olurdu. */
    final gorulme = ref.read(clockProvider).timeAgo(cihaz.lastSeenAt);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      describeDevice(
                        platform: cihaz.platform,
                        deviceModel: cihaz.deviceModel,
                        userAgent: cihaz.userAgent,
                      ),
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (cihaz.current) ...[
                    const SizedBox(width: 6),
                    Text(
                      'bu cihaz',
                      style: TextStyle(fontSize: 11, color: c.success),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 2),
              Text(
                deviceDetails(
                  gorulme: gorulme,
                  ip: cihaz.ip,
                  appVersion: cihaz.appVersion,
                  osVersion: cihaz.osVersion,
                ),
                style: TextStyle(fontSize: 11, color: c.muted),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        MwSmallButton(
          label: cihaz.current ? 'Bu cihazdan çık' : 'Çıkar',
          kind: MwButtonKind.ghost,
          onTap: busy ? null : onCikar,
        ),
      ],
    );
  }
}

/// ⭐ ŞEHİR YÖNETİMİ — web'deki `CityAdminPanel` karşılığı; her işlem **seçili şehir** için.
///
/// ⚠️ Başkent seçme/taşıma yok ve bu bir eksiklik değil: sunucuda da yok. Başkent yalnız
/// salt okunur bir etiket ve terk etmeyi engelleyen bir şart.
class _Sehir extends ConsumerStatefulWidget {
  const _Sehir();

  @override
  ConsumerState<_Sehir> createState() => _SehirState();
}

class _SehirState extends ConsumerState<_Sehir> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final sehirler = ref.watch(citiesProvider).value ?? const <CitySummary>[];
    final aktif = ref.watch(activeCityProvider).value;

    /* ⚠️ Liste boşken panel HİÇ çizilmiyor (web'de de öyle): "şehrin yok" demek, şehri
       olmayan bir oyuncunun zaten göreceği tek şey olurdu ve burada söylenecek yer değil. */
    if (sehirler.isEmpty) return const SizedBox.shrink();

    final sehir = sehirler.firstWhere(
      (s) => s.id == aktif,
      // ⚠️ Sunucu `is_capital DESC` sıraladığı için ilk sıra pratikte başkent.
      orElse: () => sehirler.first,
    );
    final k = sehir.coordinates;

    return MwPanel(
      title: 'Şehir',
      trailing: Text(
        '${k.k}:${k.d}:${k.s}',
        style: TextStyle(fontSize: 11, color: c.muted),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              // ⚠️ Oyuncunun yazdığı ad → gövde fontu, `mwUpper` YOK.
              Flexible(
                child: Text(
                  sehir.name,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (sehir.isCapital) ...[
                const SizedBox(width: 6),
                Text(
                  '(başkent)',
                  style: TextStyle(fontSize: 11, color: c.muted),
                ),
              ],
            ],
          ),
          const SizedBox(height: 2),
          Text(
            'İşlem seçili şehir için geçerlidir.',
            style: TextStyle(fontSize: 11, color: c.muted),
          ),
          const SizedBox(height: 10),
          MwSmallButton(
            label: 'Şehir adını değiştir',
            kind: MwButtonKind.ghost,
            onTap: _busy ? null : () => _adDegistir(sehir),
          ),

          /* ⚠️ Başkentte terk bölümü HİÇ çizilmiyor: düğmeyi sunup reddetmek boş umut
             olurdu. Sebep zaten bir satır yukarıda, «(başkent)» etiketinde yazıyor. */
          if (!sehir.isCapital)
            _Terk(sehir: sehir, busy: _busy, onTerk: () => _terkEt(sehir)),

          if (_error != null) ...[
            const SizedBox(height: 8),
            MwErrorBox(_error!),
          ],
        ],
      ),
    );
  }

  Future<void> _adDegistir(CitySummary sehir) async {
    final ad = await mwSheet<String>(
      context,
      title: 'Şehir adını değiştir',
      child: _AdKutusu(mevcut: sehir.name),
    );
    if (ad == null || !mounted) return;
    await _run(() => ref.read(cityAdminProvider).rename(sehir.id, ad));
  }

  Future<void> _terkEt(CitySummary sehir) async {
    final ok = await mwConfirmSheet(
      context,
      title: '${sehir.name} terk edilsin mi?',
      body:
          'Bu işlem geri alınamaz.\n\n'
          '• Binalar ve savunma yapıları silinir.\n'
          '• Şehirdeki altın ve yemek yok olur.\n'
          '• Bu şehrin yapı ve savunmasından kazandığın puanı kaybedersin.\n'
          '• Koordinat boşalır; başka bir oyuncu oraya şehir kurabilir.',
      confirmLabel: 'Şehri terk et',
    );
    if (!ok || !mounted) return;
    await _run(() => ref.read(cityAdminProvider).abandon(sehir.id));
  }

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
      if (mounted) setState(() => _error = _mesaj(e));
    } catch (_) {
      await mwTapError();
      if (mounted) setState(() => _error = 'Sunucuya ulaşılamadı.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// ⚠️⚠️ 409 `abandon_blocked` gövdesinde **`message` YOK**, `blockers` var. Ham hâlde
  /// basmak oyuncuya yalnız «İstek başarısız (409)» gösterirdi — webde bugün tam olarak bu
  /// oluyor. Engelleri açıp yazmak, ön kontrolden sonra araya giren bir değişikliği
  /// (ordu yola çıktı, kuyruğa iş girdi) oyuncuya anlatan tek yer.
  String _mesaj(MwApiError e) {
    final govde = e.body;
    if (govde is Map && govde['code'] == 'abandon_blocked') {
      final engeller = (govde['blockers'] as List<dynamic>? ?? const [])
          .map((x) => '$x')
          .toList();
      if (engeller.isNotEmpty) {
        return 'Şehir terk edilemedi:\n${engeller.map((b) => '• $b').join('\n')}';
      }
    }
    return e.message;
  }
}

/// Terk bölümü — ön kontrol sonucuna göre ya engel listesi ya düğme.
class _Terk extends ConsumerWidget {
  const _Terk({required this.sehir, required this.busy, required this.onTerk});

  final CitySummary sehir;
  final bool busy;
  final VoidCallback onTerk;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final kontrol = ref.watch(abandonCheckProvider(sehir.id));

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: kontrol.when(
        loading: () => Text(
          'Denetleniyor…',
          style: TextStyle(fontSize: 12, color: c.muted),
        ),
        /* ⚠️ Ön kontrol patlarsa SEBEP yazılıyor. Webde `catch` sessiz: düğme kalıcı
           olarak kapalı kalıyor ve oyuncu neden olmadığını hiçbir yerde göremiyor. */
        error: (_, _) => const MwErrorBox(
          'Terk denetimi yapılamadı. Sayfayı aşağı çekip yeniden dene.',
        ),
        data: (d) => d.blockers.isEmpty
            ? MwButton(
                label: 'Şehri terk et',
                kind: MwButtonKind.danger,
                busy: busy,
                onTap: busy ? null : onTerk,
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Bu şehir şu an terk edilemez:',
                    style: TextStyle(fontSize: 12, color: c.muted),
                  ),
                  const SizedBox(height: 2),
                  /* ⚠️ Engeller LİSTE hâlinde (tatil panelindeki gerekçenin aynısı): tek
                     engel gösterseydik oyuncu onu çözer, tekrar dener, bu sefer
                     başkasını görürdü. */
                  for (final b in d.blockers)
                    Text(
                      '• $b',
                      style: TextStyle(fontSize: 12, color: c.warning),
                    ),
                ],
              ),
      ),
    );
  }
}

/// Ad kutusu — `temple_screen.dart` · `_RenameBox` ile aynı kalıp.
///
/// ⚠️ Kural `gen/facts.g.dart`tan geliyor ve **kahraman adıyla aynı**: sunucuda ikisi de
/// `gameName` şemasından geçiyor. İkinci bir kopya yazmak, iki kuralın ayrışabileceği bir
/// yer açardı. Desen (noktalama/emoji) denetimi bilerek istemcide YOK; reddi sunucu veriyor.
class _AdKutusu extends StatefulWidget {
  const _AdKutusu({required this.mevcut});

  final String mevcut;

  @override
  State<_AdKutusu> createState() => _AdKutusuState();
}

class _AdKutusuState extends State<_AdKutusu> {
  late final _c = TextEditingController(text: widget.mevcut);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    // ⚠️ Ad değişmediyse düğme de kapalı: gereksiz bir istek ve gereksiz bir olay olurdu.
    final gecerli =
        isNameLengthOk(_c.text, min: kNameMin, max: kNameMax) &&
        _c.text.trim() != widget.mevcut;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        TextField(
          controller: _c,
          maxLength: kNameMax,
          autofocus: true,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Şehir adı',
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

/// ⭐⭐ HESABI SİL — düğme hesabı **silmiyor**, yalnız posta yollatıyor.
///
/// ⚠️⚠️ Mağaza şartıyla çelişmiyor; tersine onu karşılıyor. `MOBIL_UYGULAMA.md` §5'in
/// koşulu, silme SAYFASININ webde ve **oturumsuz** kalması (bağlantı çoğu zaman posta
/// uygulamasından oturumsuz bir tarayıcıda açılır) ve *"silmeyi kayıttan zorlaştırmamak"*.
/// `POST /auth/delete-account/request` yalnız 12 saatlik tek kullanımlık bir bağlantı
/// yolluyor; yıkıcı adım hâlâ jetonlu `POST /auth/delete-account` ve hâlâ webde.
///
/// ⚠️ Oyuna giremeyen oyuncu (parola unutulmuş, cihaz değişmiş) bu paneli hiç göremez.
/// Onun yolu oturumsuz `/hesap-sil` formu ve adres altta bilerek yazılı duruyor.
class _HesapSilme extends ConsumerStatefulWidget {
  const _HesapSilme();

  @override
  ConsumerState<_HesapSilme> createState() => _HesapSilmeState();
}

class _HesapSilmeState extends ConsumerState<_HesapSilme> {
  bool _busy = false;
  bool _gonderildi = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    /* ⚠️ Yüklenmemişken `false`: ilk karede düğme KAPALI başlıyor. Ters varsayım, henüz
       bilmediğimiz bir şey yüzünden düğmeyi açıp sunucudan 403 yemek olurdu. */
    final dogrulandi = ref.watch(accountInfoProvider).value?.verified ?? false;

    return MwPanel(
      title: 'Hesabı sil',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Hesabını kalıcı olarak silebilirsin. E-posta adresine tek kullanımlık bir '
            'onay bağlantısı göndeririz; bağlantı 12 saat geçerlidir.',
            style: TextStyle(fontSize: 12, color: c.muted),
          ),
          const SizedBox(height: 6),
          Text(
            'Onayladığında e-postan, şifren, oturumların ve bildirim aboneliklerin '
            'silinir; hesabına bir daha giriş yapamazsın. Şehirlerin adlarıyla, oyuncu '
            'adın ve puanın dünyada olduğu gibi kalır, sıralamalarda görünmeye devam '
            'eder. Aynı e-postayla yeniden kayıt olabilirsin ama eski oyuncu adını '
            'alamazsın.',
            style: TextStyle(fontSize: 12, color: c.muted),
          ),
          if (!dogrulandi) ...[
            const SizedBox(height: 6),
            Text(
              'Hesabını silebilmek için önce e-posta adresini doğrulaman gerekiyor.',
              style: TextStyle(fontSize: 12, color: c.warning),
            ),
          ],
          const SizedBox(height: 12),
          /* ⚠️ Başarıdan sonra düğme KAYBOLUYOR, kapanmıyor: posta zaten yolda ve ikinci
             bir istek yalnız kotayı yakardı. Web'de de aynı davranış. */
          if (_gonderildi)
            Text(
              'Onay bağlantısını gönderdik. Gelen kutunu (ve gereksiz/spam klasörünü) '
              'kontrol et.',
              style: TextStyle(fontSize: 12, color: c.success),
            )
          else
            MwButton(
              label: 'Hesabımı sil',
              kind: MwButtonKind.danger,
              busy: _busy,
              onTap: !dogrulandi || _busy ? null : _iste,
            ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            MwErrorBox(_error!),
          ],
          const SizedBox(height: 10),
          Text(
            'Oyuna hiç giremiyorsan silme talebini mobilwar.com/hesap-sil adresinden de '
            'başlatabilirsin.',
            style: TextStyle(fontSize: 11, color: c.muted),
          ),
        ],
      ),
    );
  }

  Future<void> _iste() async {
    final ok = await mwConfirmSheet(
      context,
      title: 'Hesabını silmek istiyor musun?',
      body:
          'E-posta adresine 12 saat geçerli, tek kullanımlık bir onay bağlantısı '
          'göndereceğiz. Hesap o bağlantıya tıklayana kadar silinmez.\n\n'
          'Onayladığında e-postan, şifren ve oturumların silinir; hesabına bir daha '
          'giriş yapamazsın. Şehirlerin, oyuncu adın ve puanın dünyada olduğu gibi '
          'kalır. Bu işlem geri alınamaz.',
      confirmLabel: 'Onay bağlantısı gönder',
    );
    if (!ok || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(optionsActionsProvider).requestAccountDeletion();
      await mwTapOk();
      if (mounted) setState(() => _gonderildi = true);
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
}

class _Satir extends StatelessWidget {
  const _Satir({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(fontSize: 13, color: c.muted)),
        Flexible(
          child: Text(
            value,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}
