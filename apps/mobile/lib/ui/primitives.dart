/// TASARIM SİSTEMİ PRİMİTİFLERİ.
///
/// ⚠️ **Ham renk YAZILMAZ** — her şey `Theme.of(context).colorScheme`ten ya da
/// `lib/gen/tokens.dart`ten gelir (§13.13.1, README "Değişmez kurallar" madde 3).
/// Golden testler yalnız BU dosyadaki bileşenleri kilitliyor (`MOBIL_MIMARI.md` §5.4):
/// `tokens:check` paletin içeriğini, golden ise paletin gerçekten BOYANDIĞINI ölçüyor.
library;

import 'package:flutter/material.dart';

import '../gen/tokens.dart';

/// Semantik renklere tema üzerinden erişim — `MwLightColors`/`MwDarkColors` seçimini
/// tek yerde yapar. Bileşenler `MwRenk.of(context).gold` yazar, `isDark ? ... : ...` değil.
class MwRenk {
  const MwRenk._(this.karanlik);

  factory MwRenk.of(BuildContext c) =>
      MwRenk._(Theme.of(c).brightness == Brightness.dark);

  final bool karanlik;

  Color get gold => karanlik ? MwDarkColors.gold : MwLightColors.gold;
  Color get food => karanlik ? MwDarkColors.food : MwLightColors.food;
  Color get danger => karanlik ? MwDarkColors.danger : MwLightColors.danger;
  Color get warning => karanlik ? MwDarkColors.warning : MwLightColors.warning;
  Color get success => karanlik ? MwDarkColors.success : MwLightColors.success;
  Color get info => karanlik ? MwDarkColors.info : MwLightColors.info;
  Color get muted =>
      karanlik ? MwDarkColors.textMuted : MwLightColors.textMuted;
  Color get border => karanlik ? MwDarkColors.border : MwLightColors.border;
  Color get borderStrong =>
      karanlik ? MwDarkColors.borderStrong : MwLightColors.borderStrong;
  Color get raised =>
      karanlik ? MwDarkColors.surfaceRaised : MwLightColors.surfaceRaised;
  Color get panelHeader =>
      karanlik ? MwDarkColors.panelHeader : MwLightColors.panelHeader;
  Color get onPanelHeader =>
      karanlik ? MwDarkColors.onPanelHeader : MwLightColors.onPanelHeader;
}

/// Web'deki `Panel` — başlık bandı + çerçeve. Ana görsel birim.
class MwPanel extends StatelessWidget {
  const MwPanel({super.key, this.baslik, required this.child, this.sag});

  final String? baslik;
  final Widget child;
  final Widget? sag;

  @override
  Widget build(BuildContext context) {
    final r = MwRenk.of(context);
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(color: r.border),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (baslik != null)
            Container(
              color: r.panelHeader,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      baslik!,
                      style: TextStyle(
                        color: r.onPanelHeader,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  ?sag,
                ],
              ),
            ),
          Padding(padding: const EdgeInsets.all(12), child: child),
        ],
      ),
    );
  }
}

enum MwButonTuru { birincil, hayalet, tehlike }

class MwButon extends StatelessWidget {
  const MwButon({
    super.key,
    required this.etiket,
    this.onTap,
    this.tur = MwButonTuru.birincil,
    this.mesgul = false,
  });

  final String etiket;
  final VoidCallback? onTap;
  final MwButonTuru tur;
  final bool mesgul;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final r = MwRenk.of(context);
    final (zemin, yazi) = switch (tur) {
      MwButonTuru.birincil => (scheme.primary, scheme.onPrimary),
      MwButonTuru.tehlike => (r.danger, scheme.onPrimary),
      MwButonTuru.hayalet => (Colors.transparent, scheme.onSurface),
    };

    return FilledButton(
      // ⚠️ `mesgul` iken `onTap` null verilir → düğme hem görsel hem işlevsel olarak kapanır.
      // Yalnız görsel kapatmak çift gönderime açık kapı bırakırdı.
      onPressed: mesgul ? null : onTap,
      style: FilledButton.styleFrom(
        backgroundColor: zemin,
        foregroundColor: yazi,
        side: tur == MwButonTuru.hayalet
            ? BorderSide(color: r.borderStrong)
            : null,
        minimumSize: const Size.fromHeight(46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
      child: mesgul
          ? SizedBox(
              height: 18,
              width: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: yazi),
            )
          : Text(etiket),
    );
  }
}

/// Web'deki `ErrorBox`.
class MwHataKutusu extends StatelessWidget {
  const MwHataKutusu(this.mesaj, {super.key});

  final String mesaj;

  @override
  Widget build(BuildContext context) {
    final r = MwRenk.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: r.danger.withValues(alpha: 0.12),
        border: Border.all(color: r.danger),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(mesaj, style: TextStyle(color: r.danger)),
    );
  }
}

/// Web'deki `Empty`.
class MwBos extends StatelessWidget {
  const MwBos(this.mesaj, {super.key});

  final String mesaj;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 32),
    child: Center(
      child: Text(mesaj, style: TextStyle(color: MwRenk.of(context).muted)),
    ),
  );
}

/// Kaynak göstergesi (altın/yemek). Sayı biçimi Türkçe binlik ayracıyla.
class MwKaynak extends StatelessWidget {
  const MwKaynak({super.key, required this.tur, required this.miktar});

  final String tur; // 'gold' | 'food'
  final int miktar;

  @override
  Widget build(BuildContext context) {
    final r = MwRenk.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          tur == 'gold' ? Icons.circle : Icons.eco,
          size: 14,
          color: tur == 'gold' ? r.gold : r.food,
        ),
        const SizedBox(width: 4),
        Text(mwSayi(miktar)),
      ],
    );
  }
}

/// `tr-TR` binlik ayracı — web'deki `fmt()` ile aynı görünüm.
/// ⚠️ `intl` paketi EKLENMEDİ: tek ihtiyacımız binlik ayracı ve `intl` yalnız bunun için
/// ~1 MB ve bir yerelleştirme kurulum adımı getiriyor.
String mwSayi(int n) {
  final s = n.abs().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write('.');
    b.write(s[i]);
  }
  return '${n < 0 ? '-' : ''}$b';
}
