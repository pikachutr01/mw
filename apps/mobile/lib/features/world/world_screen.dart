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
/// ⚠️ Sefer gönderme formu (web'deki `world-modal.tsx`, 606 satır) **bu turda taşınmadı**;
/// sheet bugün yalnız hedefi tanıtıyor. Sahte bir düğme koymak yerine eksik olduğu yazılı.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/world_coords.dart';
import '../../gen/contracts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'target_sheet.dart';

class WorldScreen extends ConsumerStatefulWidget {
  const WorldScreen({super.key, this.fromUrl});

  /// Derin bağlantıdan gelen diyar (`/world/:k/:d`). Yoksa `null`.
  final MwRealm? fromUrl;

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
          onChange: (r) => setState(() => _sel = r),
          onHome: () => setState(() {
            final a = homeAction(fromUrl);
            _sel = a.sel;
            if (a.clearUrl) _urlBirakildi = true;
          }),
        ),
        Expanded(
          child: !hazir
              ? const Center(child: CircularProgressIndicator())
              : _List(realm: realm, activeCityId: activeId),
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
          const SizedBox(width: 4),
          _Step(
            label: '−',
            onTap: realm.d > 1
                ? () => onChange((k: realm.k, d: realm.d - 1))
                : null,
          ),
          _RealmField(
            value: realm.d,
            onCommit: (d) => onChange((k: realm.k, d: d)),
          ),
          _Step(
            label: '+',
            onTap: realm.d < kMaxRealm
                ? () => onChange((k: realm.k, d: realm.d + 1))
                : null,
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

class _Step extends StatelessWidget {
  const _Step({required this.label, required this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return SizedBox(
      width: 30,
      height: 32,
      child: TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          padding: EdgeInsets.zero,
          minimumSize: Size.zero,
          foregroundColor: c.muted,
        ),
        child: Text(label, style: const TextStyle(fontSize: 16)),
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
      width: 62,
      height: 34,
      child: TextField(
        controller: _c,
        focusNode: _focus,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _isle(),
        style: const TextStyle(
          fontSize: 14,
          fontFeatures: [FontFeature.tabularFigures()],
        ),
        decoration: const InputDecoration(
          isDense: true,
          contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 6),
          border: OutlineInputBorder(),
        ),
      ),
    );
  }
}

class _List extends ConsumerWidget {
  const _List({required this.realm, required this.activeCityId});

  final MwRealm realm;
  final int? activeCityId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final world = ref.watch(worldProvider(realm));

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
      data: (slots) => MwRefresh(
        onRefresh: () {
          ref.invalidate(worldProvider(realm));
          return mwRefreshAll([ref.read(worldProvider(realm).future)]);
        },
        builder: (physics) => ListView.builder(
          physics: physics,
          padding: const EdgeInsets.only(bottom: 12),
          itemCount: slots.length,
          itemBuilder: (context, i) => _Row(
            slot: slots[i],
            alt: i.isOdd,
            activeCityId: activeCityId,
            realm: realm,
          ),
        ),
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return ListView(
      padding: const EdgeInsets.only(bottom: 12),
      children: [
        for (var i = 0; i < 10; i++)
          Container(
            height: 46,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: i.isOdd ? c.raised.withValues(alpha: 0.35) : null,
              border: Border(bottom: BorderSide(color: c.border)),
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
    );
  }
}

class _Row extends ConsumerWidget {
  const _Row({
    required this.slot,
    required this.alt,
    required this.activeCityId,
    required this.realm,
  });

  final WorldSlot slot;
  final bool alt;
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

    return InkWell(
      onTap: () => showTargetSheet(context, slot: slot, realm: realm),
      child: Container(
        // ⚠️ SABİT yükseklik: boş slot da dolu slot kadar yer kaplıyor, böylece 10 satır her
        // diyarda aynı yüksekliği tutuyor ve göz sütunları kaydırmadan tarıyor.
        height: 46,
        decoration: BoxDecoration(
          color: alt ? c.raised.withValues(alpha: 0.35) : null,
          border: Border(
            bottom: BorderSide(color: c.border),
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
                              // ⭐ Kendi şehrim vurgulu; müttefik rozetle ayrılıyor.
                              color: city.isOwn ? scheme.primary : null,
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
      ),
    );
  }
}
