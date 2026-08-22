/// ⭐⭐ DÜNYA — **harita değil, DİYAR LİSTESİ** (§13.16.2). Web'deki `World.tsx` karşılığı.
///
/// Her diyarda **on slot** var ve hepsi listeleniyor: boş slot da dolu slot kadar yer kaplıyor.
/// Orijinal oyun da böyle (`images/scr_web03`) ve sebebi göz taraması — sütunlar kaymıyor.
///
/// ─ Mobil düzen ───────────────────────────────────────────────────────────────────────────
/// Web'in mobil görünümü üç sütunu **gizliyor** (Şehir · İttifak · Görev) çünkü dar ekranda
/// hepsi sığmıyor ve kırpılan ad zaten okunmuyordu. Aynı kararı taşıyoruz: satırda **slot no ·
/// oyuncu · sıra/puan**, gerisi satıra dokununca açılan sheet'te.
///
/// ⚠️ Şehir adı satırda YOK ama kaybolmuş da değil: sheet'te **başlık** olarak duruyor. Karar
/// şu ayrımdan geliyor — *"kim, ne kadar güçlü"* sorusu satırda, *"hangi şehir"* sorusu
/// ikinci adımda cevaplanıyor.
///
/// ⚠️ **GİZLİLİK (§13.16.5):** liste asker ve kaynak GÖSTERMEZ. Bunu öğrenmenin tek yolu
/// casusluktur; sunucu zaten göndermiyor, istemci de türetmeye çalışmıyor.
///
/// ⚠️ Bu satır bir süre *"sefer gönderme formu bu turda taşınmadı"* diyordu ve **bayattı**:
/// form `mission_form.dart`ta, hedef künyesindeki seçeneklerden açılıyor. Not güncellendi
/// çünkü yanlış bir "eksik" notu, olmayan bir işi kuyrukta tutar.
///
/// ⭐ Satırda görev simgeleri var (2026-08-21): aktif şehrimle o slot arasındaki hareketler,
/// oyuncu adının yanında, en fazla üç. Eşleştirme `movement_rules.dart` · `movementsForSlot`.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/world_coords.dart';
import '../../gen/contracts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import '../armies/movement.dart';
import '../armies/movement_icon.dart';
import '../armies/movement_rules.dart';
import '../armies/movement_sheet.dart';
import 'target_sheet.dart';

class WorldScreen extends ConsumerStatefulWidget {
  const WorldScreen({
    super.key,
    this.fromUrl,
    this.highlight,
    this.missionType,
  });

  /// Derin bağlantıdan gelen diyar (`/world/:k/:d`). Yoksa `null`.
  final MwRealm? fromUrl;

  /// ⭐⭐ Kısa bir an parlayacak slot (`?s=`, 2026-08-19). Kullanıcı isteği: *"savaş raporu,
  /// casusluk raporu gibi ekranlardan bir koordinata tıklayıp dünya ekranını açıyorsak, o
  /// koordinata kısa bir anlığına highlight verelim ki oyuncu ekranı açınca hangi şehre
  /// gittiğini anlasın."*
  final int? highlight;

  /// ⭐⭐ Rapordan gelen sefer türü (`?m=`, 2026-08-21) — `attack` ya da `spy`.
  ///
  /// ⚠️ `highlight` OLMADAN anlamsız (hangi slot?) ve o yüzden ikisi birlikte okunuyor.
  /// Rapor formu kendi açmıyor, buraya yolluyor: hedef künyesi burada taze listeden
  /// çözülüyor ve oyuncu hedefin bugünkü hâlini görüyor.
  final String? missionType;

  @override
  ConsumerState<WorldScreen> createState() => _WorldScreenState();
}

class _WorldScreenState extends ConsumerState<WorldScreen> {
  /// ⚠️ `null` = **elle seçim yapılmadı** → görünüm aktif şehri izliyor. Eve ait koordinatı
  /// buraya yazmak takibi öldürürdü (gerekçe `world_coords.dart` · `homeAction`).
  MwRealm? _sel;

  /// ⚠️ Adres temizlenebilsin diye yerel kopya: go_router'ın parametresini "unutmanın" başka
  /// yolu, gerçekten `/world`e gitmek olurdu ve bu geri tuşunu bozardı.
  bool _urlBirakildi = false;

  /// Şu an parlayan slot. `null` → vurgu yok.
  ///
  /// ⚠️ Zamanlayıcı `dispose`ta iptal ediliyor: ekran kapandıktan sonra `setState` çağırmak
  /// Flutter'da hata üretiyor ve bu, kısa ömürlü animasyonlarda en sık yapılan kaçak.
  int? _parlayan;
  Timer? _parlamaTimer;

  @override
  void initState() {
    super.initState();
    _parlamayiBaslat();
  }

  /// ⚠️ Diyar elle değiştirilince vurgu SÖNÜYOR: başka bir diyarda aynı numaralı slotu
  /// parlatmak yanlış yeri işaret etmek olurdu.
  void _parlamayiBaslat() {
    final s = widget.highlight;
    if (s == null || s < 1) return;
    _parlayan = s;
    _parlamaTimer?.cancel();
    /* ⚠️ 1,6 sn: kullanıcı *"kısa bir an parlayıp sönen"* dedi. Daha kısası göz kırpmayla
       kaçırılıyor, daha uzunu ekranda takılı kalmış gibi duruyor. Web'deki süreyle aynı. */
    _parlamaTimer = Timer(const Duration(milliseconds: 1600), () {
      if (mounted) setState(() => _parlayan = null);
    });
  }

  @override
  void dispose() {
    _parlamaTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeId = ref.watch(activeCityProvider).value;
    final city = activeId == null
        ? null
        : ref.watch(cityProvider(activeId)).value;
    final home = city == null
        ? null
        : (k: city.coordinates.k, d: city.coordinates.d);

    final fromUrl = _urlBirakildi ? null : widget.fromUrl;
    final realm = visibleCoords(_sel, fromUrl, home);

    /// ⚠️ Aktif şehrin koordinatı GELMEDEN sorgu atılmıyor: atılsaydı ekran önce 1:1'i çekip
    /// gösterir, sonra doğru diyara atlardı — web'de buna "1:1 parlaması" deniyor.
    final hazir = _sel != null || fromUrl != null || home != null;

    return Column(
      children: [
        _Selector(
          realm: realm,
          canGoHome: home != null,
          onChange: (r) => setState(() {
            _sel = r;
            // ⚠️ Diyar değişti → vurgu artık yanlış yeri gösterir, söndürülüyor.
            _parlayan = null;
            _parlamaTimer?.cancel();
          }),
          onHome: () => setState(() {
            final a = homeAction(fromUrl);
            _sel = a.sel;
            if (a.clearUrl) _urlBirakildi = true;
          }),
        ),
        Expanded(
          child: !hazir
              ? const Center(child: CircularProgressIndicator())
              : _List(
                  realm: realm,
                  activeCityId: activeId,
                  highlight: _parlayan,
                  /* ⚠️ Oyuncu diyarı ELLE değiştirdiyse (`_sel`) sefer türü artık geçersiz:
                     adresteki slot başka bir diyarda başka bir şeye denk gelir. Vurgunun
                     sönmesiyle aynı kural. */
                  missionType: _sel == null ? widget.missionType : null,
                ),
        ),
      ],
    );
  }
}

/// Kıta + diyar seçici — **tek satır**: liste sayfa kaydırmadan ekrana sığmalı.
class _Selector extends StatelessWidget {
  const _Selector({
    required this.realm,
    required this.canGoHome,
    required this.onChange,
    required this.onHome,
  });

  final MwRealm realm;
  final bool canGoHome;
  final ValueChanged<MwRealm> onChange;
  final VoidCallback onHome;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);

    return Container(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border)),
      ),
      child: Row(
        children: [
          Text('Kıta', style: TextStyle(fontSize: 11, color: c.muted)),
          const SizedBox(width: 6),
          // ⚠️ 10 kıta bir `DropdownButton`a sığıyor; diyar (500) sığmaz, o yüzden ikisi
          // farklı denetim kullanıyor.
          DropdownButton<int>(
            value: realm.k,
            isDense: true,
            underline: const SizedBox.shrink(),
            items: [
              for (var i = 1; i <= kMaxContinent; i++)
                DropdownMenuItem(value: i, child: Text('$i')),
            ],
            onChanged: (v) => v == null ? null : onChange((k: v, d: realm.d)),
          ),
          const SizedBox(width: 10),
          Text('Diyar', style: TextStyle(fontSize: 11, color: c.muted)),
          const SizedBox(width: 6),
          /* ⭐ ÜÇÜ TEK BİR DENETİM (kullanıcı, 2026-08-19: *"butonlar ile input birbirine çok
             yakın"*). Ayrı ayrı duran üç parçayı birbirinden UZAKLAŞTIRMAK yerine
             birleştirdim: tek çerçeve, aralarında ince ayraçlar. Yakınlık artık kaza değil
             tasarım — dokunma hedefleri de bitişik olduğu için parmak kaymıyor. */
          _RealmStepper(
            value: realm.d,
            onChange: (d) => onChange((k: realm.k, d: d)),
          ),
          const Spacer(),
          // ⭐ «Kendi diyarıma dön» — kale simgesi, web'deki gibi.
          if (canGoHome)
            IconButton(
              tooltip: 'Kendi diyarıma dön',
              onPressed: onHome,
              icon: const MwIcon(folder: 'buildings', id: 'city', size: 24),
              visualDensity: VisualDensity.compact,
            ),
        ],
      ),
    );
  }
}

/// ⭐ BİRLEŞİK DİYAR ADIMLAYICISI — `[−][ 42 ][+]` tek çerçevede.
class _RealmStepper extends StatelessWidget {
  const _RealmStepper({required this.value, required this.onChange});

  final int value;
  final ValueChanged<int> onChange;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    final ayrac = Container(width: 1, height: 30, color: c.border);

    return Container(
      height: 30,
      decoration: BoxDecoration(
        color: c.raised,
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(6),
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Step(
            icon: Icons.remove,
            onTap: value > 1 ? () => onChange(value - 1) : null,
          ),
          ayrac,
          // ⚠️ Alan kendi çerçevesini ÇİZMİYOR (`borderless`): kabuk zaten bir çerçeve,
          //    ikincisi kutu içinde kutu görünürdü.
          _RealmField(value: value, onCommit: onChange),
          ayrac,
          _Step(
            icon: Icons.add,
            onTap: value < kMaxRealm ? () => onChange(value + 1) : null,
          ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return SizedBox(
      width: 34,
      height: 30,
      child: TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          padding: EdgeInsets.zero,
          minimumSize: Size.zero,
          shape: const RoundedRectangleBorder(),
          foregroundColor: Theme.of(context).colorScheme.primary,
          disabledForegroundColor: c.muted.withValues(alpha: 0.4),
        ),
        // ⚠️ Metin «−»/«+» yerine ikon: yazı tipine göre eksi işareti bazen tire gibi ince
        //    çiziliyordu ve iki düğme farklı ağırlıkta görünüyordu.
        child: Icon(icon, size: 17),
      ),
    );
  }
}

/// Diyar numarası alanı.
///
/// ⚠️ Değer **dize** olarak tutuluyor ve yalnız ODAK KAYBINDA/Enter'da işleniyor. Her tuşta
/// kelepçelenseydi (`clamp(1, 500)`) alanı boşaltmak imkânsız olurdu: oyuncu `1`i silince alan
/// anında 1'e geri sıçrar, `23` yazmak için önce metni seçmek gerekirdi. Web'de tam olarak bu
/// yaşandı (`AmountInput` → `BoundedAmountInput` ayrımı).
class _RealmField extends StatefulWidget {
  const _RealmField({required this.value, required this.onCommit});

  final int value;
  final ValueChanged<int> onCommit;

  @override
  State<_RealmField> createState() => _RealmFieldState();
}

class _RealmFieldState extends State<_RealmField> {
  late final TextEditingController _c = TextEditingController(
    text: '${widget.value}',
  );
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    // ⚠️ Odak kaybında işle: oyuncu klavyeyi kapatınca değeri kaybetmemeli.
    _focus.addListener(() {
      if (!_focus.hasFocus) _isle();
    });
  }

  @override
  void didUpdateWidget(covariant _RealmField old) {
    super.didUpdateWidget(old);
    // ⚠️ Dışarıdan değişirse (± düğmeleri, «eve dön») alan da güncellenmeli — ama YAZARKEN
    // değil: odak bizdeyse kullanıcının yazdığının üstüne yazmak metni parmağının altından
    // değiştirmek olurdu.
    if (widget.value != old.value && !_focus.hasFocus) {
      _c.text = '${widget.value}';
    }
  }

  @override
  void dispose() {
    _c.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _isle() {
    final n = int.tryParse(_c.text.trim());
    // ⚠️ Geçersiz/boş girdi ESKİ değere döner, 1'e DEĞİL: alanı silip başka yere dokunan
    // oyuncuyu diyar 1'e ışınlamak, yapmadığı bir gezinme olurdu.
    if (n == null) {
      _c.text = '${widget.value}';
      return;
    }
    final k = n.clamp(1, kMaxRealm);
    _c.text = '$k';
    if (k != widget.value) widget.onCommit(k);
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 52,
      height: 30,
      child: TextField(
        controller: _c,
        focusNode: _focus,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _isle(),
        style: mwFieldTextStyle,
        // ⭐ Dekorasyon artık ORTAK (`primitives.dart`): buradaki kopya, beyaz çerçeve
        //    kusurunun ikinci nüshasıydı. `borderless` — kabuk zaten çerçeveli.
        decoration: mwFieldDecoration(context, borderless: true),
      ),
    );
  }
}

class _List extends ConsumerStatefulWidget {
  const _List({
    required this.realm,
    required this.activeCityId,
    required this.highlight,
    required this.missionType,
  });

  final MwRealm realm;
  final int? activeCityId;

  /// Kısa bir an parlayan slot; `null` → vurgu yok.
  final int? highlight;

  /// Rapordan gelen sefer türü (`?m=`); liste gelince form kendiliğinden açılıyor.
  final String? missionType;

  @override
  ConsumerState<_List> createState() => _ListState();
}

/// ⚠️⚠️ `_List` bu yüzden DURUMLU: rapordan gelen sefer formu **bir kez** açılmalı ve bunu
/// bilmenin tek yolu bir bayrak. Durumsuz bir widget'ta her yeniden çizim formu geri açar ve
/// oyuncu onu kapatamaz. Vurgunun (`_parlayan`) disipliniyle aynı, aynı gerekçelerle.
class _ListState extends ConsumerState<_List> {
  bool _seferAcildi = false;

  /// Liste geldikten SONRA açılıyor: veri gelmeden slot çözülemez.
  ///
  /// ⚠️ Slot BOŞSA da açılıyor — boş koordinata «şehir kur» meşru bir sefer ve hedef künyesi
  /// zaten o durumu biliyor. Erken dönmek, rapordaki koordinat bu arada boşalmışsa oyuncuyu
  /// sessizce hiçbir yere götürmek olurdu.
  void _seferiAc(List<WorldSlot> slots) {
    final tur = widget.missionType;
    final s = widget.highlight;
    if (_seferAcildi || tur == null || tur.isEmpty || s == null) return;
    if (slots.isEmpty) return;
    _seferAcildi = true;
    final slot = slots.where((x) => x.s == s).firstOrNull;
    if (slot == null) return;
    // ⚠️ Çizim SIRASINDA sheet açılamaz; kare bitince açılıyor.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      showTargetSheet(
        context,
        slot: slot,
        realm: widget.realm,
        initialType: tur,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final realm = widget.realm;
    final world = ref.watch(worldProvider(realm));
    /* ⭐ SATIRA ASILAN GÖREV SİMGELERİ (kullanıcı, 2026-08-21).
       ⚠️ Sunucuya dokunulmadı: `Movement` hem iki ucu hem yönü hem `cityId`yi zaten
       taşıyor, eşleşme istemcide `k:d:s` ile yapılıyor.
       ⚠️ `.value ?? const []` — hareketler gelmeden liste çizilmeyi BEKLEMİYOR: diyar
       zaten geldiyse satırlar görünmeli, simgeler sonradan düşer. Beklemek, ilgisiz bir
       isteğin gecikmesini Dünya ekranının açılış süresine eklerdi. */
    final movements = ref.watch(movementsProvider).value ?? const <Movement>[];

    return world.when(
      // ⭐ İSKELET DEĞİL ama AYNI GEREKÇE: diyar değişirken liste boşalıp yeniden dolarsa
      // ekran zıplıyor. Sabit yükseklikli 10 gri satır o zıplamayı önlüyor.
      loading: () => const _Skeleton(),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(16),
        child: MwErrorBox('Diyar alınamadı: $e'),
      ),
      /* ⚠️ Tazeleme YALNIZ diyarı geçersiz kılıyor, şehri değil: bu ekranda oyuncunun
         merak ettiği şey slotların doluluğu. Şehir listesi de çekmek, ilgisiz bir isteği
         her jeste eklemek olurdu. */
      data: (slots) {
        // ⭐ Rapordan gelen `?m=` sefer formunu burada açıyor — veri elde olduğu tek yer.
        _seferiAc(slots);
        return MwRefresh(
          onRefresh: () {
            ref.invalidate(worldProvider(realm));
            return mwRefreshAll([ref.read(worldProvider(realm).future)]);
          },
          /* ⭐ KENARLARA YAPIŞIK DEĞİL (kullanıcı, 2026-08-19). Liste eskiden tam genişlikteydi
           ve uygulamanın geri kalanı 12 px kenar boşluğuyla çalıştığı için Dünya tek başına
           farklı görünüyordu.

           ⚠️ `ListView.builder` yerine tek çocuklu `ListView`: satırlar **ortak bir kartın**
           içine giriyor ve kart yuvarlatılmış köşeleri kırpıyor. Sanallaştırma kaybı yok —
           bir diyarda daima 10 slot var (`kSlotsPerRealm`), yani liste sabit ve kısa. */
          builder: (physics) => ListView(
            physics: physics,
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
            children: [
              _Kart(child: Column(children: _satirlar(slots, movements))),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _satirlar(List<WorldSlot> slots, List<Movement> movements) => [
    for (var i = 0; i < slots.length; i++)
      _Row(
        slot: slots[i],
        alt: i.isOdd,
        flash: slots[i].s == widget.highlight,
        // ⚠️ Son satırın alt çizgisi YOK: kartın kendi kenarı zaten orada duruyor ve iki
        //    çizgi üst üste binince alt kenar kalın görünüyordu.
        son: i == slots.length - 1,
        activeCityId: widget.activeCityId,
        realm: widget.realm,
        hareketler: movementsForSlot(movements, widget.activeCityId, (
          k: widget.realm.k,
          d: widget.realm.d,
          s: slots[i].s,
        )),
      ),
  ];
}

/// Dünya listesinin ve iskeletinin ortak kabı — ikisi ayrı çizilirse yükleme bitince
/// kart kenarı bir anlığına kayıyor.
class _Kart extends StatelessWidget {
  const _Kart({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
      children: [
        _Kart(
          child: Column(
            children: [
              for (var i = 0; i < 10; i++)
                Container(
                  height: 46,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: i.isOdd ? c.raised.withValues(alpha: 0.35) : null,
                    border: Border(
                      bottom: BorderSide(
                        color: i == 9 ? Colors.transparent : c.border,
                      ),
                    ),
                  ),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 26,
                        child: Text(
                          '${i + 1}',
                          style: TextStyle(color: c.muted, fontSize: 12),
                        ),
                      ),
                      Container(
                        width: 110,
                        height: 10,
                        decoration: BoxDecoration(
                          color: c.raised,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Row extends ConsumerWidget {
  const _Row({
    required this.slot,
    required this.alt,
    required this.son,
    required this.flash,
    required this.activeCityId,
    required this.realm,
    required this.hareketler,
  });

  final WorldSlot slot;
  final bool alt;

  /// Bu slotla aktif şehrim arasındaki hareketler — en fazla üç, en yakın varış üstte
  /// (`movementsForSlot`).
  final List<Movement> hareketler;

  /// ⭐ Rapordan gelen hedef — kısa bir an parlıyor (gerekçe `WorldScreen.highlight`te).
  final bool flash;

  /// Listenin son satırı mı — alt çizgi çizilmiyor (kartın kenarı zaten orada).
  final bool son;
  final int? activeCityId;
  final MwRealm realm;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    final city = slot.city;

    /// ⭐ AKTİF ŞEHİR BELİRTECİ — **renkle DEĞİL kenarla** (web'de kullanıcı kararı).
    /// «Bana ait» zaten bir renk kanalı kullanıyor; aktif şehri de renkle işaretlemek iki farklı
    /// anlamı aynı kanala yığar ve ikisi de okunmaz hâle gelirdi.
    final aktif = city != null && city.id == activeCityId;

    final zemin = alt ? c.raised.withValues(alpha: 0.35) : null;

    return InkWell(
      onTap: () => showTargetSheet(context, slot: slot, realm: realm),
      /* ⭐⭐ TEK BİR DARBE (kullanıcı, 2026-08-19: *"İki kere parlayıp sönmesin. Tek bir kere
         şık şekilde olsa yeterli"*). `1 → 0` sönümü + `easeOutCubic`: yükseliş ilk karede
         hazır, sönüş yavaş. Simetrik bir darbe "yanıp söndü" değil "titredi" gibi duruyor.

         ⚠️⚠️ Renk satırın ZEMİNİNE karıştırılıyor (`Color.lerp`), üstüne katman olarak
         BİNMİYOR. Üste binen saydam bir katman yazıyı da boyar ve parlama sırasında slot
         numarası ile oyuncu adı okunmaz hâle gelirdi — oysa vurgunun amacı tam da onları
         okutmak.
         ⚠️ `flash` false iken `TweenAnimationBuilder` HİÇ kurulmuyor: on satırın dokuzunda
         boşuna bir animasyon nesnesi tutmanın anlamı yok. */
      child: !flash
          ? _govde(context, zemin, aktif, scheme, c)
          : TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 1, end: 0),
              duration: const Duration(milliseconds: 1200),
              curve: Curves.easeOutCubic,
              builder: (context, t, _) => _govde(
                context,
                Color.lerp(
                  zemin ?? Colors.transparent,
                  scheme.primary,
                  0.38 * t,
                ),
                aktif,
                scheme,
                c,
              ),
            ),
    );
  }

  /// Satırın kendisi — zemin rengi dışarıdan geliyor ki parlama onu değiştirebilsin.
  Widget _govde(
    BuildContext context,
    Color? zemin,
    bool aktif,
    ColorScheme scheme,
    MwColors c,
  ) {
    final city = slot.city;
    return Container(
      // ⚠️ SABİT yükseklik: boş slot da dolu slot kadar yer kaplıyor, böylece 10 satır her
      // diyarda aynı yüksekliği tutuyor ve göz sütunları kaydırmadan tarıyor.
      height: 46,
      decoration: BoxDecoration(
        color: zemin,
        border: Border(
          bottom: BorderSide(color: son ? Colors.transparent : c.border),
          left: BorderSide(
            color: aktif ? scheme.primary : Colors.transparent,
            width: 3,
          ),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            child: Text(
              '${slot.s}',
              style: TextStyle(
                color: c.muted,
                fontSize: 12,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          Expanded(
            child: city == null
                ? Text('—', style: TextStyle(color: c.muted))
                : Row(
                    children: [
                      Flexible(
                        child: Text(
                          city.username,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            /* ⭐ Kendi şehrim vurgulu; müttefik rozetle ayrılıyor.
                               ⚠️ `c.own` (lacivert), `scheme.primary` (bronz) DEĞİL —
                               kullanıcı 2026-08-21: *"açık modda pek belli olmuyor"*.
                               Web aynı şikâyetle 2026-08-11'de geçmişti; gerekçenin
                               tamamı `MwColors.own` başlığında. */
                            color: city.isOwn ? c.own : null,
                          ),
                        ),
                      ),
                      if (city.isAlly) ...[
                        const SizedBox(width: 4),
                        const MwIcon(folder: 'ui', id: 'alliance', size: 14),
                      ],
                      // ⭐ Koruma rozeti: saldırılamayacak hedefi oyuncu **listede** görmeli,
                      // sefer formuna girip reddedilmeden önce.
                      if (city.protection != null) ...[
                        const SizedBox(width: 4),
                        Icon(Icons.shield_outlined, size: 13, color: c.info),
                      ],
                      /* ⭐ GÖREV SİMGELERİ ADIN YANINDA (kullanıcının şartı, 2026-08-21).
                         ⚠️ Ad `Flexible` + `ellipsis` olduğu için simgeler TAŞMA ÜRETMEZ,
                         yalnız uzun adı biraz erken kırpar. Doğru öncelik bu: yarım
                         çizilen bir simge hangi görev olduğunu söylemez, yarım bir ad
                         hâlâ okunur.
                         ⚠️ `MovementIcon`un kendi `onTap`i satırın `InkWell`inden ÖNCE
                         yakalıyor (iç jest kazanır); yoksa simgeye basan oyuncu hedef
                         künyesini açardı. */
                      for (final m in hareketler) ...[
                        const SizedBox(width: 4),
                        MovementIcon(
                          m: m,
                          compact: true,
                          onTap: () => showMovementSheet(context, m),
                        ),
                      ],
                    ],
                  ),
          ),
          // ⭐ Sıra TEK BAŞINA yetmiyor (web'de kullanıcı kararı): «12.» bir hedefin ne kadar
          // güçlü olduğunu söylemiyor, aradaki FARK söylüyor.
          // ⚠️ `rank` yoksa puan da yazılmıyor: ikisi aynı anlık görüntü satırından geliyor,
          // biri yoksa diğeri de yok. Tek başına puan yazmak, sıranın "hesaplanamadığını"
          // değil "sıfır" olduğunu ima ederdi.
          SizedBox(
            width: 96,
            child: Text(
              city?.rank == null
                  ? '—'
                  : city!.rankScore == null
                  ? '${city.rank}'
                  : '${city.rank} / ${mwNumber(city.rankScore!)}',
              textAlign: TextAlign.right,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                color: c.muted,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
