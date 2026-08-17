/// ⭐ HEDEF KÜNYESİ — diyar listesinde bir slota dokununca açılan sheet.
///
/// ⚠️⚠️ Bu sheet **bilgi kaybını telafi ediyor, süs değil.** Dar ekranda liste üç sütunu
/// gizliyor (Şehir · İttifak · Görev — web'in mobil görünümüyle aynı karar) ve gizlenen ilk
/// şey şehrin ADI. Karar şu ayrımdan geliyor: *"kim, ne kadar güçlü"* sorusu satırda,
/// *"hangi şehir"* sorusu burada cevaplanıyor.
///
/// ⚠️ **GİZLİLİK (§13.16.5):** burada da asker ve kaynak YOK. Sunucu göndermiyor, istemci de
/// türetmeye çalışmıyor — onu öğrenmenin yolu casusluk.
///
/// ⭐⭐ İKİ ADIMLI AKIŞ (web'le aynı): önce **seçenek listesi**, sonra **görev formu**.
///   1. Seçenekler SUNUCUDAN gelir (`GET /missions/options`) — istemci "kime ne gönderilebilir"i
///      kendi hesaplamaz; hesaplasaydı kural iki yerde yaşar ve kaçınılmaz olarak kayardı.
///   2. Seçilen tipe göre form açılır (`mission_form.dart`).
///
/// ⚠️ **Kapalı seçenek gizlenmez, sebebiyle gösterilir** — oyuncu neden yapamadığını görmeli.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/world_coords.dart';
import '../../gen/contracts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';
import 'mission_form.dart';
import 'mission_options.dart';
import 'mission_rules.dart';

/// Koruma sebebinin oyuncuya görünen karşılığı.
///
/// ⚠️ **SÜRE YAZMIYOR**, yalnız sebep (§13.16.5): kalan süreyi vermek, korumanın bittiği anı
/// dakikası dakikasına bekleyip saldırmayı kolaylaştırırdı.
const Map<String, String> kProtectionLabel = {
  'beginner': 'Acemi koruması altında — saldırıya kapalı.',
  'vacation': 'Tatil modunda — saldırıya kapalı.',
};

/// Şehir adından **« şehri»** ekini atar (web'deki `cityLabel` ile aynı).
///
/// ⚠️ Bu yardımcı **eski satırlar için** duruyor: kayıtta üretilen ad bir ara
/// `"<oyuncu> şehri"` biçimindeydi, yeni kayıtlarda ek artık üretilmiyor. Web'de de aynı
/// gerekçeyle korunuyor; iki istemciden birinde silmek adları ayrıştırırdı.
String cityLabel(String name) =>
    name.replaceFirst(RegExp(r'\s+şehri$', caseSensitive: false), '');

Future<void> showTargetSheet(
  BuildContext context, {
  required WorldSlot slot,
  required MwRealm realm,
}) {
  final city = slot.city;
  final koord = '${realm.k}:${realm.d}:${slot.s}';

  return mwSheet<void>(
    // ⚠️ Boş slotta başlık koordinat: «—» yazmak sheet'i kimliksiz bırakırdı.
    context,
    title: city == null ? koord : cityLabel(city.name),
    child: Builder(
      builder: (ctx) {
        final c = MwColors.of(ctx);
        final scheme = Theme.of(ctx).colorScheme;

        if (city == null) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _Row(label: 'Koordinat', value: koord, tnum: true),
              const SizedBox(height: 10),
              Text(
                'Bu slot boş. Buraya şehir kurulabilir.',
                style: TextStyle(color: c.muted),
              ),
              const SizedBox(height: 8),
              _Options(slot: slot, realm: realm),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const MwIcon(folder: 'buildings', id: 'city', size: 40),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              city.username,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: city.isOwn ? scheme.primary : null,
                              ),
                            ),
                          ),
                          if (city.isAlly) ...[
                            const SizedBox(width: 5),
                            const MwIcon(
                              folder: 'ui',
                              id: 'alliance',
                              size: 15,
                            ),
                          ],
                        ],
                      ),
                      Text(
                        koord,
                        style: TextStyle(
                          fontSize: 12,
                          color: c.muted,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // ⭐ «başkent» burada duruyor: listede yıldız YOK (web'de kullanıcı kaldırttı ve
            // orijinal oyun da dünya ekranında başkent işareti çizmiyor — bilgi modalda).
            if (city.isCapital) _Row(label: 'Şehir', value: 'Başkent'),
            _Row(label: 'İttifak', value: city.alliance ?? '—'),
            // ⚠️ `rank` yoksa puan da yazılmıyor — ikisi aynı anlık görüntüden geliyor.
            _Row(
              label: 'Sıra / Puan',
              value: city.rank == null
                  ? '—'
                  : city.rankScore == null
                  ? '${city.rank}'
                  : '${city.rank} / ${mwNumber(city.rankScore!)}',
              tnum: true,
            ),

            if (city.protection != null) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: c.info.withValues(alpha: 0.12),
                  border: Border.all(color: c.info),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  kProtectionLabel[city.protection] ?? 'Saldırıya kapalı.',
                  style: TextStyle(fontSize: 12, color: c.info),
                ),
              ),
            ],

            const SizedBox(height: 6),
            _Options(slot: slot, realm: realm),
          ],
        );
      },
    ),
  );
}

/// ⭐ SEÇENEK LİSTESİ — sunucunun bu hedefe izin verdiği görevler.
class _Options extends ConsumerWidget {
  const _Options({required this.slot, required this.realm});

  final WorldSlot slot;
  final MwRealm realm;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final aktif = ref.watch(activeCityProvider).value;
    if (aktif == null) return const SizedBox.shrink();

    final istek = ref.watch(
      missionOptionsProvider((
        originCityId: aktif,
        k: realm.k,
        d: realm.d,
        s: slot.s,
      )),
    );

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: istek.when(
        loading: () => Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Center(
            child: Text(
              'Seçenekler yükleniyor…',
              style: TextStyle(fontSize: 12, color: c.muted),
            ),
          ),
        ),
        error: (e, _) => MwErrorBox('Seçenekler alınamadı: $e'),
        data: (o) {
          /// ⚠️ «Aktif şehrin kendisi» ile «seçenek yok» AYRI cümleler: biri *"buradan
          /// bakıyorsun zaten"*, diğeri *"bu hedefe hiçbir şey gönderemezsin"* diyor.
          if (o.activeCity) {
            return Text(
              'Bu, şu anki aktif şehrin. Kendine görev gönderemezsin; başka bir şehrini '
              'seçersen nakliye, destek ve teleport açılır.',
              style: TextStyle(fontSize: 12, color: c.muted),
            );
          }
          if (o.options.isEmpty) {
            return Text(
              'Bu hedefe gönderilebilecek görev yok.',
              style: TextStyle(fontSize: 12, color: c.muted),
            );
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Divider(height: 1, color: c.border),
              for (final opt in o.options)
                _OptionRow(
                  option: opt,
                  teleportReadyAt: o.teleportReadyAt,
                  onTap: () => showMissionForm(
                    context,
                    type: opt.type,
                    originCityId: aktif,
                    target: (k: realm.k, d: realm.d, s: slot.s),
                    option: opt,
                    attacksLeft: o.attacksLeft,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _OptionRow extends ConsumerWidget {
  const _OptionRow({
    required this.option,
    required this.teleportReadyAt,
    required this.onTap,
  });

  final MissionOption option;
  final String? teleportReadyAt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final info = kMissionInfo[option.type];
    final acik = option.enabled;

    /// ⭐ Teleport beklemesi: *"hazır değil"* yetmiyor (kullanıcı, 2026-08-03), NE KADAR
    /// kaldığı lazım. ⚠️ Süre OYUN saatinde işliyor.
    final clock = ref.watch(clockProvider);
    ref.watch(tickProvider);
    final geriSayim = option.type == 'teleport' && !acik
        ? clock.remaining(teleportReadyAt)
        : null;

    return InkWell(
      // ⚠️ Kapalı seçenek TIKLANAMAZ ama görünür kalıyor: sebebi okunacak.
      onTap: acik ? onTap : null,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: c.border)),
        ),
        child: Opacity(
          opacity: acik ? 1 : 0.6,
          child: Row(
            children: [
              MwIcon(folder: 'missions', id: info?.icon ?? 'attack', size: 40),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      // ⚠️ Sunucunun `label`ı yedek: yeni bir tip eklenirse ekran boş kalmasın.
                      info?.title ?? option.label,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      acik
                          ? (info?.hint ?? '')
                          : (option.reason ?? 'Şu anda gönderilemez.'),
                      style: TextStyle(
                        fontSize: 11,
                        color: acik ? c.muted : c.danger,
                      ),
                    ),
                    if (geriSayim != null)
                      Text(
                        'Hazır olmasına $geriSayim',
                        style: TextStyle(
                          fontSize: 11,
                          color: c.warning,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                  ],
                ),
              ),
              if (acik) Icon(Icons.chevron_right, size: 20, color: c.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.tnum = false});

  final String label;
  final String value;
  final bool tnum;

  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(label, style: TextStyle(color: c.muted)),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontFeatures: tnum
                    ? const [FontFeature.tabularFigures()]
                    : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
