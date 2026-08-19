/// ⭐⭐ SEÇENEKLER — web'deki `OptionsScreen` (`Placeholders.tsx`) karşılığı.
///
/// Kullanıcı isteği (2026-08-20): *"mobilde Seçenekler sayfasını da kodlamaya başla. Burada
/// gece-gündüz modu seçebilecek kısım da eklenmesi lazım. Webdeki seçenekler sayfasına göre
/// uygulamaya da yap."*
///
/// ─ ⚠️ BU TURDA GELENLER ve GELMEYENLER ───────────────────────────────────────────────────
/// Web'de sayfa **sekiz panelden** oluşuyor. Hepsini tek turda taşımak yerine oyuncunun
/// telefonda gerçekten kullanacağı beşi geldi; kalanların neden ertelendiği aşağıda yazılı —
/// "unutuldu" ile "bilerek bekliyor" ayrımı görünür kalsın.
///
/// ✔ **Görünüm** (Gece/Gündüz/Sistem) — kullanıcının açıkça istediği parça.
/// ✔ **Hesap** — e-posta ve doğrulama durumu.
/// ✔ **Bildirimler** — kategori anahtarları.
/// ✔ **Tatil modu** — durum, engeller, gir/çık.
/// ✔ **Engellenenler** — liste + engeli kaldır.
///
/// ⛔ **Oturumlar/cihazlar** — web'de her oturumun künyesi ve "diğerlerini kapat" var. Mobilde
///    ertelendi: liste `x-device-id` ile eşleşiyor ve "bu cihaz hangisi" ayrımını yanlış
///    göstermek, oyuncuya kendi oturumunu kapattırabilirdi.
/// ⛔ **Şehir yönetimi** (ad değiştir · terk et) — şehre bağlı işlemler; Şehir sekmesine
///    daha yakın duruyor ve orada bir yeri yok. İki yere birden koymak üçüncü bir kopya olurdu.
/// ⛔ **Tercihler** (arka plan görseli) — web'e özel bir görsel ayarı; mobilde karşılığı yok.
/// ⛔⛔ **HESABI SİL — bilerek YOK ve olmayacak.** `MOBIL_UYGULAMA.md` §5: hesap silme sayfası
///    Google Play şartı gereği **web'de** kalmak zorunda. Ekranda yerine web adresini
///    gösteren bir not var; sahte bir düğme koymak, mağaza şartını da oyuncuyu da yanıltırdı.
///
/// ⚠️ Bildirim İZNİ düğmesi de yok: mobilde push henüz kurulmadı (Faz 3). Kategori anahtarları
/// yine de anlamlı — oyun açıkken görünen toast'ı da onlar yönetiyor.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/api_client.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
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
          ..invalidate(blockedPlayersProvider);
        return mwRefreshAll([
          ref.read(accountInfoProvider.future),
          ref.read(notifyPrefsProvider.future),
          ref.read(vacationProvider.future),
          ref.read(blockedPlayersProvider.future),
        ]);
      },
      builder: (physics) => ListView(
        physics: physics,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
        children: const [
          _Gorunum(),
          SizedBox(height: 10),
          _Hesap(),
          SizedBox(height: 10),
          _Bildirimler(),
          SizedBox(height: 10),
          _Tatil(),
          SizedBox(height: 10),
          _Engellenenler(),
          SizedBox(height: 10),
          _HesapSilmeNotu(),
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

/// ⛔⛔ HESAP SİLME MOBİLDE YOK — bir eksiklik değil, **mağaza şartı**.
///
/// `MOBIL_UYGULAMA.md` §5: hesap silme sayfası Google Play şartı gereği web'de kalmak zorunda.
/// Buraya bir düğme koymak hem şartı hem oyuncuyu yanıltırdı; yerine adresin kendisi yazılı.
class _HesapSilmeNotu extends StatelessWidget {
  const _HesapSilmeNotu();

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return MwPanel(
      title: 'Hesabı sil',
      child: Text(
        'Hesap silme işlemi mobilwar.com adresinden yapılıyor. Tarayıcıdan giriş yapıp '
        'Seçenekler sayfasını aç.',
        style: TextStyle(fontSize: 12, color: c.muted),
      ),
    );
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
