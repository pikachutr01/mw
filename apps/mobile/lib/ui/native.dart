/// ⭐⭐ NATIVE DAVRANIŞ KATMANI — bottom sheet · titreşim · bilgi kalıbı.
///
/// Kullanıcı kararı (2026-08-17): *"Bu taşıma sırasında Flutter'ın native olarak sunduğu
/// imkânlardan, platforma özel ayrıcalıklardan olabildiğince yararlanmak. Bol bol bottom
/// sheet kullanmak."*
///
/// ─ Neden ortak dosya ────────────────────────────────────────────────────────────────────
/// Denetimde çıktı: uygulamada `showModalBottomSheet` **tek yerde** (Daha menüsü),
/// `HapticFeedback` **hiç** kullanılmıyordu. Bunları ekran ekran serbestçe çağırmaya
/// başlasaydık her ekran kendi tonunu seçerdi ve titreşim bir süre sonra "her şeye titreşen"
/// gürültüye dönerdi. Kural tek yerde durunca, yeni bir ekran doğru davranışı **varsayılan
/// olarak** alıyor.
///
/// ─ ⭐ TİTREŞİM POLİTİKASI ────────────────────────────────────────────────────────────────
/// Üç seviye, üç anlam. Fazlası ayırt edilemez hâle gelir:
///
/// | ne oldu | geri bildirim | neden |
/// | :-- | :-- | :-- |
/// | emir kabul edildi | `lightImpact` | olumlu, sık tekrarlanır → hafif olmalı |
/// | yıkıcı işlem onaylandı | `mediumImpact` | geri alınamaz, oyuncu "gerçekten oldu" hissetmeli |
/// | red / hata | `heavyImpact` | nadir ve dikkat çekmeli |
///
/// ⚠️ **Her dokunuşta titremiyor.** Düğmeye basmak zaten görsel geri bildirim veriyor;
/// titreşim yalnız **sunucu bir şey onayladığında ya da reddettiğinde**, yani oyuncunun
/// göremeyeceği bir olay gerçekleştiğinde anlamlı.
///
/// ⚠️ Hepsi `try/catch` içinde: titreşim motoru olmayan cihaz ya da kısıtlı platform
/// uygulamayı düşürmemeli. Oyun titreşimsiz de oynanır.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'primitives.dart';

/// Emir kabul edildi, kuyruk ilerledi, bir şey oldu.
Future<void> mwTapOk() async {
  try {
    await HapticFeedback.lightImpact();
  } catch (_) {
    /* titreşim motoru yok */
  }
}

/// Yıkıcı işlem onaylandı (iptal, silme).
Future<void> mwTapDestructive() async {
  try {
    await HapticFeedback.mediumImpact();
  } catch (_) {
    /* titreşim motoru yok */
  }
}

/// Sunucu reddetti ya da hata oluştu.
Future<void> mwTapError() async {
  try {
    await HapticFeedback.heavyImpact();
  } catch (_) {
    /* titreşim motoru yok */
  }
}

/// ⭐ ORTAK BOTTOM SHEET — ekranların tek sheet kapısı.
///
/// ⚠️ `showModalBottomSheet` tercih ediliyor çünkü geri tuşuyla kapanma, dışarı dokununca
/// kapanma ve odak tuzağı **bedava** geliyor; elle çizilen bir bindirmede üçünü de ayrı ayrı
/// doğru yapmak gerekirdi (`more_sheet.dart`ta aynı gerekçe yazılı).
///
/// ⚠️ `isScrollControlled` + `DraggableScrollableSheet` DEĞİL: buradaki sheet'ler içerik
/// kadar yer kaplıyor. Sürüklenebilir sheet, sefer formu gibi UZUN içerikler geldiğinde
/// ayrıca eklenecek — bugün olmayan bir ihtiyaç için karmaşıklık taşımıyoruz.
///
/// ⚠️ `useSafeArea`: liste gezinme çubuğunun altına kaymasın.
Future<T?> mwSheet<T>(
  BuildContext context, {
  required String title,
  required Widget child,
}) {
  return showModalBottomSheet<T>(
    context: context,
    useSafeArea: true,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(title, style: mwDisplayStyle(fontSize: 16)),
            ),
            // ⚠️ Uzun içerik sığmazsa kaydırılabilir olmalı: telefon yatayken ya da yazı
            // boyutu büyütülmüşken sheet ekranı aşabiliyor.
            Flexible(child: SingleChildScrollView(child: child)),
          ],
        ),
      ),
    ),
  );
}

/// ⭐ BİLGİ SHEET'İ — uzun basınca açılan künye.
///
/// Web'de bu bir **tooltip/popover** (`ItemName` · `info`). Telefonda tooltip yok: parmak
/// üstünde durmuyor. Doğal karşılığı uzun basma + sheet.
///
/// ⚠️ Uzun basma **keşfedilebilir değil** ve bu bilinçli bir kabul: bilgi kutusu oyunu
/// oynamak için gerekli değil, meraklıya açılan bir kapı. Her satıra bir «i» düğmesi koymak
/// dar ekranda gerçekten kullanılan alanı (ad, maliyet, düğme) daraltırdı.
Future<void> mwInfoSheet(
  BuildContext context, {
  required String title,
  required List<Widget> lines,
}) async {
  await mwTapOk();
  if (!context.mounted) return;
  await mwSheet<void>(
    context,
    title: title,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: lines,
    ),
  );
}

/// ⭐⭐ ONAY SHEET'İ — `mwConfirm`in native karşılığı, yıkıcı işlemler için.
///
/// ⚠️ Diyalog yerine sheet: telefonda başparmak ekranın ALTINDA. Ekranın ortasına çıkan bir
/// diyaloğun düğmelerine uzanmak gerekiyor; sheet düğmeleri parmağın zaten durduğu yere
/// geliyor. Aynı sebeple **yıkıcı düğme üstte, «Vazgeç» altta**: yanlışlıkla basılması en
/// muhtemel yer en alt.
///
/// ⚠️ Gövdede **RAKAM YOK** — `mwConfirm` başlığındaki kullanıcı kararı burada da geçerli:
/// ekranda görünen değerle onay anındaki gerçek iade kaçınılmaz olarak ayrışıyor.
///
/// ⚠️ Onaylanırsa `mediumImpact`: geri alınamaz bir şey oldu ve oyuncu bunu hissetmeli.
Future<bool> mwConfirmSheet(
  BuildContext context, {
  required String title,
  required String body,
  String confirmLabel = 'Onayla',
  bool danger = true,
}) async {
  final ok = await mwSheet<bool>(
    context,
    title: title,
    child: Builder(
      builder: (ctx) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(body, style: TextStyle(color: MwColors.of(ctx).muted)),
          const SizedBox(height: 16),
          MwButton(
            label: confirmLabel,
            kind: danger ? MwButtonKind.danger : MwButtonKind.primary,
            onTap: () => Navigator.of(ctx).pop(true),
          ),
          const SizedBox(height: 8),
          MwButton(
            label: 'Vazgeç',
            kind: MwButtonKind.ghost,
            onTap: () => Navigator.of(ctx).pop(false),
          ),
        ],
      ),
    ),
  );
  if (ok == true) await mwTapDestructive();
  return ok ?? false;
}
