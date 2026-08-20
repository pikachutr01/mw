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

/// ⭐⭐ ÜÇ SHEET TÜRÜNÜN ORTAK AÇILIŞ AYARLARI — tek yerde.
///
/// ⚠️⚠️ **`useRootNavigator: true` ŞART** (2026-08-19). `ShellRoute` kendi iç navigator'ını
/// kuruyor; onsuz sheet **kabuğun gövdesinin içinde** açılıyordu, yani üstte şehir şeridinin
/// altından başlayıp altta gezinme çubuğunda kesiliyordu. Sonucu iki katlıydı:
///   • sheet ekranın ancak ~%70'ini kullanabiliyordu (kullanıcı: *"daha yüksek yapalım"*),
///   • `mwTallSheet`in `%94 × ekran yüksekliği` hesabı **yalan** oluyordu — istediği yükseklik
///     kutusuna sığmadığı için sessizce kırpılıyordu.
/// Kök navigator'da sheet gerçekten ekranın tamamını kaplıyor ve ölçüler anlamına kavuşuyor.
///
/// ⚠️ **`showDragHandle: false` ve tutamağı KENDİMİZ çiziyoruz.** Material'ınki sheet'in
/// zemininde, başlık bandının ÜSTÜNDE duruyordu; bant renkli olduğu için tutamağın altında
/// boş bir şerit kalıyor ve "başlığın üstünde boşluk var" izlenimi doğuyordu (kullanıcı
/// bildirdi). Tutamak artık bandın İÇİNDE — `_SheetBaslik`te.
/// ⚠️ Sürükleyerek kapatma KAYBOLMADI: `enableDrag` varsayılan olarak açık ve sheet'in
/// tamamı sürüklenebiliyor; değişen yalnız tutamağın çizildiği yer.
///
/// ⚠️ `clipBehavior: antiAlias`: bant kenardan kenara uzandığı için sheet'in yuvarlatılmış
/// üst köşelerini taşardı; kırpma olmadan bandın köşeleri keskin görünüyordu.
Future<T?> _sheet<T>(BuildContext context, WidgetBuilder builder) =>
    showModalBottomSheet<T>(
      context: context,
      useRootNavigator: true,
      useSafeArea: true,
      showDragHandle: false,
      isScrollControlled: true,
      clipBehavior: Clip.antiAlias,
      builder: builder,
    );

/// ⭐ ORTAK BOTTOM SHEET — ekranların tek sheet kapısı.
///
/// ⚠️ `showModalBottomSheet` tercih ediliyor çünkü geri tuşuyla kapanma, dışarı dokununca
/// kapanma ve odak tuzağı **bedava** geliyor; elle çizilen bir bindirmede üçünü de ayrı ayrı
/// doğru yapmak gerekirdi (`more_sheet.dart`ta aynı gerekçe yazılı).
///
/// ⚠️ Bu sheet içerik kadar yer kaplıyor. **Uzun içerikler `mwTallSheet` kullanıyor** —
/// gerekçe orada; bu dosya 2026-08-17'de o ihtiyacı önceden not etmişti ve sefer formu geldi.
///
/// ⚠️ `useSafeArea`: liste gezinme çubuğunun altına kaymasın.
/// ⚠️⚠️ `titleIsUserText`: başlık OYUNCUNUN YAZDIĞI bir metinse (şehir adı, kullanıcı adı)
/// **true** verilmeli — `mwTallSheet`teki aynı bayrağın ikizi. Cinzel küçük harf taşımıyor ve
/// `mwUpper` metni gerçekten büyütüyor: «Mithlond» ekranda «MİTHLOND» oluyordu. Kullanıcı
/// 2026-08-19'da Dünya'daki hedef künyesinde bunu yakaladı; bayrak `mwSheet`te YOKTU, yani
/// oyuncu adları düzeltilemez biçimde büyük yazılıyordu.
Future<T?> mwSheet<T>(
  BuildContext context, {
  required String title,
  required Widget child,
  bool titleIsUserText = false,
}) {
  return _sheet<T>(
    context,
    (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ⭐ Başlık bandı `mwTallSheet` ile ORTAK (gerekçe `_SheetBaslik`te).
          _SheetBaslik(title: title, titleIsUserText: titleIsUserText),
          // ⚠️ Uzun içerik sığmazsa kaydırılabilir olmalı: telefon yatayken ya da yazı
          // boyutu büyütülmüşken sheet ekranı aşabiliyor.
          // ⚠️ Yan dolgu artık BURADA, dışta değil: bant kenardan kenara uzanmalı.
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              child: child,
            ),
          ),
        ],
      ),
    ),
  );
}

/// ⭐⭐ UZUN SHEET — ekranın çoğunu kaplayan, içi kaydırılabilen form.
///
/// `mwSheet` içerik kadar yer kaplıyor ve sefer formu gibi bir ekranda bu yetmiyor: birim
/// listesi on satır olabiliyor, altına kahraman seçici ve kargo kutuları geliyor. İçerik
/// kadar büyüyen bir sheet o hâlde ekranı zaten dolduruyor ama **başlığı yukarı itip**
/// gönder düğmesini klavyenin altına gömüyordu.
///
/// ⚠️ Çözüm `DraggableScrollableSheet` DEĞİL, sabit yükseklikli bir kutu: sürüklenebilir
/// sheet, içinde kendi kaydırma alanı olan bir formda iki kaydırmayı çakıştırıyor (parmak
/// listeyi mi kaydırıyor, sheet'i mi kapatıyor belirsiz kalıyor). Burada yükseklik **baştan**
/// belli ve içeriğin kendisi neyin kayıp neyin sabit olduğuna karar veriyor.
///
/// ⚠️ `child` **tam yüksekliği alıyor**: form bir `Column` verip üstünü `Expanded` ile
/// kaydırılabilir, altını (gönder düğmesi) sabit yapabiliyor. İçeriği iki ayrı builder'a
/// bölmek denendi ve bırakıldı — ikisi aynı forma bakıyor ve durumu paylaşmak için ekrana
/// özel bir sağlayıcı kurmak gerekiyordu; oysa depodaki diğer formlar durumu düz `setState`
/// ile tutuyor.
///
/// ⚠️ `viewInsets` ŞART: klavye açılınca sheet onun üstüne çıkmalı, yoksa oyuncunun yazdığı
/// adet kutusu klavyenin altında kalıyor.
/// ⚠️⚠️ `titleIsUserText`: başlık OYUNCUNUN YAZDIĞI bir metinse (kullanıcı adı, şehir adı)
/// Cinzel **kullanılmaz**. Cinzel küçük harf taşımıyor, küçük harfleri büyük harf gibi
/// çiziyor: web'de bir ara şehir adına uygulandı ve oyuncu «Mithlond» yazdığı hâlde ekranda
/// «MİTHLOND» görünüyordu (`mwDisplayStyle` başlığındaki kural). Sohbet başlığı tam olarak
/// bu durumda — karşı tarafın adı orada yazıyor.
///
/// ⚠️ `trailing`: başlığın sağına oturan eylem (sohbet menüsü). Ayrı bir satıra koymak,
/// zaten dar olan sheet'ten bir satır daha yerdi.
Future<T?> mwTallSheet<T>(
  BuildContext context, {
  required String title,
  required Widget child,
  bool titleIsUserText = false,
  Widget? trailing,
}) {
  return _sheet<T>(
    context,
    (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: SizedBox(
        /* ⚠️ Ekranın %94'ü: üstte kalan şerit, arkadaki bağlamın kaybolmadığını gösteriyor
           ve dışarı dokunup kapatmak için bir hedef bırakıyor.
           ⭐ %88'den yükseltildi (kullanıcı, 2026-08-19: *"bu bottom sheet in yüksekliği daha
           fazla olabilir, daha geniş bir alanda görünsün"*). Sefer formunda birim listesi +
           kahraman seçici + kargo kutusu aynı anda duruyor ve %88'de liste sürekli kayıyordu.
           ⚠️ %100 YAPILMADI: kalan şerit kapatma hedefi ve "bu bir katman" ipucu. */
        height: MediaQuery.of(ctx).size.height * 0.94,
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              /* ⭐⭐ BAŞLIK ARTIK KENDİ ZEMİNİNDE (kullanıcı, 2026-08-19: *"Bu bottom
                 sheetlerin kendini belli eden bir header kısımları olsa daha güzel görünecek.
                 Başlık içerik ile aynı arka plana sahip olunca karışabiliyor."*).

                 ⚠️ Renk `panelHeader` — uygulamadaki her panelin başlık bandı zaten o renkte
                 (`MwPanel`). Sheet'e ÖZEL bir başlık rengi icat etmek, aynı işi yapan iki
                 farklı görsel dil demek olurdu. */
              _SheetBaslik(
                title: title,
                titleIsUserText: titleIsUserText,
                trailing: trailing,
              ),
              Expanded(child: child),
            ],
          ),
        ),
      ),
    ),
  );
}

/// Sheet başlık bandı — `mwTallSheet` ve `mwSheet` aynı bandı kullanıyor.
///
/// ⚠️ Tek yerde: iki sheet türünün başlığı ayrışırsa oyuncu aynı uygulamada iki farklı
/// "başlık" kavramı görür. `MwPanel`in bandıyla da aynı renkte, aynı sebeple.
class _SheetBaslik extends StatelessWidget {
  const _SheetBaslik({
    required this.title,
    required this.titleIsUserText,
    this.trailing,
  });

  final String title;
  final bool titleIsUserText;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: c.panelHeader,
        border: Border(bottom: BorderSide(color: c.borderStrong, width: 2)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 8, 12, 10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          /* ⭐ SÜRÜKLEME TUTAMAĞI BANDIN İÇİNDE (kullanıcı, 2026-08-19: *"header kısmı en
             üstteki bottom sheet i aşağı yukarı kaydıran çizgiyi de kapsasın. Şu anki gibi
             bir header olunca onun üzerinde bir boşluk kalmış gibi görünüyor."*).
             Material'ın kendi tutamağı sheet zemininde, bandın ÜSTÜNDE duruyordu. */
          Container(
            width: 34,
            height: 4,
            decoration: BoxDecoration(
              color: c.onPanelHeader.withValues(alpha: 0.45),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                // ⚠️ `mwUpper` yalnız SİSTEM metninde — Cinzel'de `i`nin noktası kaybolur
                // (gerekçe `mwUpper`da). Oyuncunun yazdığı ad gövde fontunda.
                child: Text(
                  titleIsUserText ? title : mwUpper(title),
                  overflow: TextOverflow.ellipsis,
                  style: titleIsUserText
                      ? TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.3,
                          color: c.onPanelHeader,
                        )
                      : mwDisplayStyle(fontSize: 16, color: c.onPanelHeader),
                ),
              ),
              ?trailing,
            ],
          ),
        ],
      ),
    );
  }
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

/// ⭐⭐ METİN GİRİŞ SHEET'İ — ad değiştirme, ittifak metni, toplu mesaj.
///
/// Web'de bunlar ayrı ayrı modal/inline formlar; mobilde tek bir kapı. ⚠️ Ortak dosyada
/// çünkü dördü de **aynı üç şeyi** istiyor: klavye açılınca kutunun görünür kalması, sınıra
/// yaklaşınca sayaç ve boş/geçersiz metinde kapalı düğme. Ekran ekran yazılsaydı üçünden
/// biri her seferinde unutulurdu.
///
/// ⚠️ `viewInsets` dolgusu ŞART: klavye kutuyu örterse oyuncu ne yazdığını göremiyor.
///
/// ⚠️ Dönüş `null` = **iptal**; boş dize ise gerçek bir değer (ittifak metnini silmek meşru).
/// İkisini birleştirmek "metni temizle" işlemini imkânsız kılardı.
///
/// ─ ⚠️⚠️ DENETLEYİCİYİ BU FONKSİYON KURMAZ — `_TextSheetBody` SAHİPLENİR ──────────────────
/// İlk yazımda denetleyici burada kuruluyor ve `.whenComplete(controller.dispose)` ile
/// atılıyordu. Bu **çökme üretti** (2026-08-20, cihazda yakalandı): sheet'in `Future`u
/// `Navigator.pop` ile ANINDA tamamlanıyor, oysa kapanma animasyonu daha sürüyor ve
/// `TextField` hâlâ ağaçta. Denetleyici altından çekilince odak değişimi şuraya düşüyordu:
///
///   `EditableTextState._handleFocusChanged` → `_openOrCloseInputConnectionIfNeeded`
///   → `TextEditingController.clearComposing` → *"used after being disposed"*
///
/// ⚠️⚠️ **Ekranda görünen hata bu DEĞİLDİ.** Atılmış denetleyici çizimi yarıda bırakıyor,
/// arkasından `RenderFlex overflowed by 99700 pixels` ve `'_dependents.isEmpty': is not true`
/// geliyordu; kırmızı ekran **sonuncusunu** yazıyor. 2026-08-20'de o son iddia kök neden
/// sanılıp `keyboard_guard.dart`ta aranmıştı — yanlış yer. Ders: kırmızı ekran ilk değil
/// **son** istisnayı gösterir; kök neden için `flutter run` konsolundaki İLK bloğa bak.
///
/// ⚠️ Arıza yalnız **klavye AÇIKKEN kapatınca** çıkıyor: klavye kapalıysa pop sonrası bir odak
/// değişimi olmuyor ve atılmış denetleyiciye kimse dokunmuyor. Bu yüzden "bazen çalışıyor"
/// görünüyordu — sınarken alanı odaklayıp öyle kaydet.
///
/// ⭐ Doğrusu: denetleyiciyi **onu kullanan parçacık** kursun ve `dispose()`unda atsın; o an
/// `TextField` çoktan ağaçtan çıkmış olur.
Future<String?> mwTextSheet(
  BuildContext context, {
  required String title,
  required String initial,
  required int maxLength,
  String hint = '',
  String? note,
  bool multiline = false,
  bool Function(String)? validate,
}) {
  return _sheet<String>(
    context,
    (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      // ⚠️ Yan dolgu gövdenin İÇİNDE: başlık bandı kenardan kenara uzanmalı.
      child: SafeArea(
        child: _TextSheetBody(
          title: title,
          initial: initial,
          maxLength: maxLength,
          hint: hint,
          note: note,
          multiline: multiline,
          validate: validate,
        ),
      ),
    ),
  );
}

class _TextSheetBody extends StatefulWidget {
  const _TextSheetBody({
    required this.title,
    required this.initial,
    required this.maxLength,
    required this.hint,
    required this.note,
    required this.multiline,
    required this.validate,
  });

  final String title;
  final String initial;
  final int maxLength;
  final String hint;
  final String? note;
  final bool multiline;
  final bool Function(String)? validate;

  @override
  State<_TextSheetBody> createState() => _TextSheetBodyState();
}

class _TextSheetBodyState extends State<_TextSheetBody> {
  /// ⚠️⚠️ Denetleyici BURADA kuruluyor ve BURADA atılıyor — gerekçe `mwTextSheet`in
  /// başlığında. Dışarıda kurup `whenComplete` ile atmak çökmeye yol açıyordu.
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initial);
    _controller.addListener(_yenile);
  }

  @override
  void dispose() {
    // ⚠️ Sıra önemli: önce dinleyici, sonra denetleyici. `dispose` zaten dinleyicileri
    // düşürüyor ama açık bırakmak "atılmıştan sonra bildirim" penceresi açardı.
    _controller.removeListener(_yenile);
    _controller.dispose();
    super.dispose();
  }

  void _yenile() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final metin = _controller.text;
    // ⚠️ Doğrulayıcı yoksa varsayılan kural "boş olmasın": çağıranların hepsi bir metin
    // istiyor ve boş bir gönderi hiçbirinde anlamlı değil.
    final gecerli = widget.validate?.call(metin) ?? metin.trim().isNotEmpty;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ⭐ Diğer iki sheet ile ORTAK bant (gerekçe `_SheetBaslik`te). Başlık SİSTEM metni.
        _SheetBaslik(title: widget.title, titleIsUserText: false),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.note != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    widget.note!,
                    style: TextStyle(fontSize: 12, color: c.muted),
                  ),
                ),
              TextField(
                controller: _controller,
                autofocus: true,
                minLines: widget.multiline ? 3 : 1,
                maxLines: widget.multiline ? 6 : 1,
                maxLength: widget.maxLength,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: widget.hint,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              MwButton(
                label: 'Kaydet',
                onTap: gecerli
                    ? () => Navigator.of(context).pop(_controller.text.trim())
                    : null,
              ),
              const SizedBox(height: 8),
              MwButton(
                label: 'Vazgeç',
                kind: MwButtonKind.ghost,
                // ⚠️ `null` döndürüyor — boş dizeden AYRI: biri "iptal", diğeri "metni temizle".
                onTap: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// ⭐⭐ AŞAĞI ÇEKİP TAZELEME — her ekranın tek kapısı.
///
/// Emniyet ağı 60 saniyede bir tazeliyor ve WS olayları anlık; yine de oyuncunun **"şimdi
/// bak"** diyebilmesi beklemekten iyi. Telefonda bunun tek doğal jesti aşağı çekmek.
///
/// ⚠️ Tek ekrana eklemek daha kötü olurdu: oyuncu Ordular'da öğrenip Baraka'da denediğinde
/// hiçbir şey olmazsa jest "bazen çalışan bir şey" hâline gelir. Bu yüzden 2026-08-17'den beri
/// bilerek bekletildi ve ekranların hepsi gelince tek turda bağlandı.
///
/// ─ ⚠️⚠️ KAPATILAN İKİ SESSİZ TUZAK ───────────────────────────────────────────────────────
///
/// **1. Beklenmeyen tazeleme.** `RefreshIndicator` çarkı `onRefresh`in döndürdüğü `Future`
/// bitince kaldırıyor. `ref.invalidate(...)` ANINDA dönüyor, yani çark veri gelmeden kayboluyor
/// ve oyuncu eski sayılara bakarken "tazelendi" sanıyor. Depoda bu kusur gerçekten vardı
/// (`city_panels.dart` · `CityData`, bu turda düzeltildi). Doğrusu: geçersiz kıl, **sonra yeni
/// `future`u bekle**.
///
/// **2. Kısa içerik çekilemiyor.** `ListView` varsayılan fizikte, içerik ekranı doldurmuyorsa
/// **hiç kaydırılmıyor** → aşağı çekme jesti hiç doğmuyor. Boş bir posta kutusunda ya da tek
/// şehirli oyuncuda tazeleme sessizce ölürdü. `AlwaysScrollableScrollPhysics` şart.
///
/// ⭐ İkinci tuzağı **API kapatıyor**: `builder` fiziği parametre olarak veriyor, yani çağıran
/// onu yazmayı "unutamaz" — kutunun içine koymak zorunda. Bir `child` alsaydık fiziği
/// dışarıdan dayatmanın yolu yok ve her yeni ekran aynı hatayı yeniden yapardı.
class MwRefresh extends StatelessWidget {
  const MwRefresh({super.key, required this.onRefresh, required this.builder});

  /// ⚠️ **Yeni veriyi BEKLEMELİ.** `mwRefreshAll` bunu doğru yapan yardımcı.
  final Future<void> Function() onRefresh;

  /// Kaydırılabilir kök. ⚠️ Verilen fizik kutunun `physics:` alanına konmak ZORUNDA.
  final Widget Function(ScrollPhysics physics) builder;

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: onRefresh,
    child: builder(const AlwaysScrollableScrollPhysics()),
  );
}

/// ⭐ TAZELEMEYİ DOĞRU BEKLEYEN YARDIMCI.
///
/// Kullanım kalıbı — **önce geçersiz kıl, sonra yeni `future`u iste**:
/// ```dart
/// onRefresh: () {
///   ref.invalidate(cityProvider(id));
///   return mwRefreshAll([ref.read(cityProvider(id).future)]);
/// }
/// ```
///
/// ⚠️⚠️ **HATALAR YUTULUYOR** ve bu bilinçli. `Future.wait` içlerden biri patlarsa fırlatıyor;
/// o hata `onRefresh`ten çıkıp yakalanmamış zone hatasına dönüşür ve hata perdesi açılır. Oysa
/// ekranın kendisi zaten hata kutusunu çiziyor (`when(error: …)`) — tazeleme jestinin işi
/// hatayı GÖSTERMEK değil, çarkı doğru anda kaldırmak.
Future<void> mwRefreshAll(List<Future<Object?>> futures) async {
  await Future.wait(futures.map((f) => f.catchError((Object _) => null)));
}
