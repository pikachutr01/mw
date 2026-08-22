/// ⭐⭐ ODA MESAJI — genel ve ittifak sohbetinin **ortak** satırı.
///
/// ─ ⚠️ NEDEN TEK DOSYA ───────────────────────────────────────────────────────────────────
/// Bu widget 2026-08-22'ye kadar iki dosyada **birebir kopya** duruyordu
/// (`global_chat_sheet.dart` ve `alliance_chat_sheet.dart`). Kopya olduğu için de ikisi
/// birlikte eskidi: ikisinde de baloncuk yoktu, ikisinde de gruplama yoktu ve ikisi de
/// `roomIsMine` yerine ham `senderId == myId` yazıyordu. Tek dosyaya çıkarmak, bir sonraki
/// düzeltmenin yalnız bir yerde yapılmasını sağlıyor.
///
/// ─ ⭐ BALONCUK (kullanıcı, 2026-08-21: *"baloncuk, hizalama, gönderen ayrımı"*) ──────────
/// Önceki düzen düz satırdı ve gerekçesi şuydu: *"on kişilik bir odada sağ/sol hizalama
/// okumayı kolaylaştırmıyor, kim yazdı sorusunun cevabı hizalama değil ad."* Yarısı doğru —
/// **başkalarını** birbirinden ayıran şey gerçekten ad. Ama «benimki hangisi» sorusunun
/// cevabı hizalama ve web'in üç sohbeti de yıllardır öyle çiziyor. Yeni düzen ikisini
/// birden yapıyor: hizalama beni ayırıyor, ad başkalarını.
///
/// ⚠️ Kendi baloncuğumda ad YOK: sağda ve dolu renkte olması zaten söylüyor.
/// ⚠️ Sistem duyurusu ne sağda ne solda — ortada, baloncuksuz. Bir tarafa yaslamak onu bir
/// oyuncunun sözü gibi gösterirdi.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../ui/primitives.dart';
import 'room_message.dart';
import 'room_rules.dart';

class MwRoomLine extends ConsumerWidget {
  const MwRoomLine({
    super.key,
    required this.m,
    required this.myId,
    required this.onceki,
    this.onDelete,
  });

  final RoomMessage m;
  final int? myId;

  /// Bir ÖNCEKİ (daha eski) mesaj — gruplama için.
  ///
  /// ⚠️ Ters listede bu `mesajlar[i + 1]`; gerekçe `showSenderName` başlığında.
  final RoomMessage? onceki;

  /// `null` → kaldırma yetkim yok; uzun basma hiçbir şey yapmıyor.
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = MwColors.of(context);
    final scheme = Theme.of(context).colorScheme;
    final clock = ref.watch(clockProvider);
    // ⚠️ Damgalar göreli («5 dakika önce») ve saniyede bir tazelenmeli.
    ref.watch(tickProvider);

    if (isSystemMessage(m)) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: Text(
            m.body,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: c.muted),
          ),
        ),
      );
    }

    final benim = roomIsMine(m, myId);
    final bana = mentionsMe(m, myId);
    final adYaz = showSenderName(m, onceki, myId);
    final parts = splitMentions(m.body, m.mentions);

    return InkWell(
      // ⚠️ Uzun basma — posta kutusundaki seçim kipiyle aynı jest ve aynı gerekçe: satırın
      // yanında kalıcı bir çöp kutusu, dar ekranda en kıt kaynağı yer.
      onLongPress: onDelete,
      child: Padding(
        // ⚠️ Gruplanmış mesajlar birbirine YAKIN (2 px), yeni gönderen AYRIK (6 px):
        //    boşluk, adı tekrar yazmadan grubun nerede başladığını söyleyen tek işaret.
        padding: EdgeInsets.only(top: adYaz ? 6 : 2, bottom: 2),
        child: Row(
          mainAxisAlignment: benim
              ? MainAxisAlignment.end
              : MainAxisAlignment.start,
          children: [
            /* ⚠️ %82 tavan: baloncuk kenara dayanırsa hangi tarafa yaslı olduğu okunmaz
               hâle geliyor ve ayrımın tamamı hizalamaya bağlı. */
            ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.82,
              ),
              child: Container(
                padding: const EdgeInsets.fromLTRB(10, 6, 10, 5),
                decoration: BoxDecoration(
                  color: benim ? scheme.primary : c.raised,
                  borderRadius: BorderRadius.circular(8),
                  /* ⭐ Bana bahsedilen mesaj KALIN accent çerçeveyle (web'de de öyle):
                     gövdedeki vurgu tek başına yetmiyor, kayan bir listede göz önce
                     baloncuğun biçimine takılıyor. */
                  border: benim
                      ? null
                      : Border.all(
                          color: bana ? scheme.primary : c.border,
                          width: bana ? 2 : 1,
                        ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (adYaz)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Text(
                          // ⚠️ Ad çözümü `senderLabel`da: kaldırılmış oyuncuda ham `id`
                          //    ASLA yazılmaz (§13.14).
                          // ⚠️ Oyuncunun yazdığı metin → gövde fontu, Cinzel YASAK.
                          senderLabel(m),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: c.info,
                          ),
                        ),
                      ),
                    /* ⚠️ Bahsetme parçaları `TextSpan` olarak basılıyor — Flutter işaretleme
                       yorumlamıyor, yani gövdeye gömülü bir şey metin olarak görünür. */
                    Text.rich(
                      TextSpan(
                        children: [
                          for (final p in parts)
                            TextSpan(
                              text: p.text,
                              style: p.mentionId == null
                                  ? null
                                  : TextStyle(
                                      fontWeight: FontWeight.w700,
                                      // ⚠️ Kendi baloncuğumda zemin accent: vurguyu da
                                      //    accent yapmak metni görünmez ederdi.
                                      color: benim
                                          ? scheme.onPrimary
                                          : scheme.primary,
                                      decoration: benim
                                          ? TextDecoration.underline
                                          : null,
                                    ),
                            ),
                        ],
                      ),
                      style: TextStyle(
                        fontSize: 14,
                        color: benim ? scheme.onPrimary : null,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        clock.timeAgo(m.createdAt),
                        style: TextStyle(
                          fontSize: 10,
                          // ⚠️ Kendi baloncuğumda `muted` okunmuyor (accent zemin):
                          //    aynı metin rengi, saydamlıkla geriye itiliyor.
                          color: benim
                              ? scheme.onPrimary.withValues(alpha: 0.75)
                              : c.muted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
