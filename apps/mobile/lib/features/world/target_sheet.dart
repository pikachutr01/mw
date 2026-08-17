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
/// ⚠️ Sefer gönderme formu (web'deki `world-modal.tsx`) henüz taşınmadı ve **sahte düğme
/// konmadı**: pasif bir «Saldır» düğmesi, oyuncuya var olmayan bir yetenek vaat ederdi. Eksik
/// olduğu tek satırda yazıyor.
library;

import 'package:flutter/material.dart';

import '../../core/world_coords.dart';
import '../../gen/contracts.g.dart';
import '../../ui/native.dart';
import '../../ui/primitives.dart';

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
              _Yakinda(),
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
            _Yakinda(),
          ],
        );
      },
    ),
  );
}

/// ⚠️ Sahte düğme yerine düz bir cümle: oyuncuya olmayan bir yetenek vaat etmiyoruz.
class _Yakinda extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final c = MwColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Text(
        'Sefer gönderme uygulamaya henüz eklenmedi.',
        style: TextStyle(fontSize: 12, color: c.muted),
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
