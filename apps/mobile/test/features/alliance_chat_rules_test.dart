/// İTTİFAK SOHBETİ YETKİ MATRİSİ — **kararları** ölçer.
///
/// ⚠️⚠️ Bu matris sunucudan (`assertCanModerate`) **kopyalandı** ve kopya olduğu için
/// ayrışma riski taşıyor. Kural karar VERMİYOR — sunucu son sözü söylüyor; buradaki iş
/// reddedilecek bir düğmeyi hiç göstermemek. Testler kuralın her satırını tek tek sayıyor.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobilwar/features/chat/alliance_chat_rules.dart';

void main() {
  group('rütbe sabitleri', () {
    /// ⚠️⚠️ Sayılar sunucudaki `ROLE` ile AYNI olmak zorunda ve karşılaştırmalar (`>=`) buna
    /// dayanıyor. Sıra bozulursa Konsey Lider'i susturabilir hâle gelirdi.
    test('⭐⭐ sunucudaki ROLE ile aynı ve SIRALI', () {
      expect(MwRole.member, 1);
      expect(MwRole.council, 2);
      expect(MwRole.leader, 3);
      expect(MwRole.member < MwRole.council, isTrue);
      expect(MwRole.council < MwRole.leader, isTrue);
    });

    test('etiketler', () {
      expect(roleLabel(MwRole.leader), 'Lider');
      expect(roleLabel(MwRole.council), 'Konsey');
      expect(roleLabel(MwRole.member), 'Asker');
      // ⚠️ Bilinmeyen rütbe (ileride eklenebilir) «Asker»a düşüyor — boş etiket değil.
      expect(roleLabel(99), 'Asker');
    });
  });

  group('susturma yetkisi', () {
    /// ⚠️ Asker kimseyi susturamaz — ilk kapı.
    test('⭐ Asker hiç kimseyi susturamıyor', () {
      expect(
        canMute(
          myRole: MwRole.member,
          myPlayerId: 1,
          targetRole: MwRole.member,
          targetPlayerId: 2,
        ),
        isFalse,
      );
    });

    test('Konsey Asker\'i susturabiliyor', () {
      expect(
        canMute(
          myRole: MwRole.council,
          myPlayerId: 1,
          targetRole: MwRole.member,
          targetPlayerId: 2,
        ),
        isTrue,
      );
    });

    /// ⚠️⚠️ Sunucunun cümlesi: *"Konsey yalnız Asker rütbesindeki üyeleri susturabilir."*
    test('⭐⭐ Konsey başka bir Konsey\'i susturAMIYOR', () {
      expect(
        canMute(
          myRole: MwRole.council,
          myPlayerId: 1,
          targetRole: MwRole.council,
          targetPlayerId: 2,
        ),
        isFalse,
      );
    });

    test('Lider Konsey\'i susturabiliyor', () {
      expect(
        canMute(
          myRole: MwRole.leader,
          myPlayerId: 1,
          targetRole: MwRole.council,
          targetPlayerId: 2,
        ),
        isTrue,
      );
    });

    /// ⚠️⚠️ Sunucunun cümlesi: *"Lider susturulamaz."* — Lider bile başka bir Lider'e
    /// dokunamıyor.
    test('⭐⭐ Lider ASLA susturulamıyor', () {
      for (final rutbe in [MwRole.council, MwRole.leader]) {
        expect(
          canMute(
            myRole: rutbe,
            myPlayerId: 1,
            targetRole: MwRole.leader,
            targetPlayerId: 2,
          ),
          isFalse,
          reason: '${roleLabel(rutbe)} Lider\'i susturamamalı',
        );
      }
    });

    /// ⚠️ `mute_self` — kendini susturmak anlamsız ve sunucu reddediyor.
    test('⭐ kendini susturAMIYOR', () {
      expect(
        canMute(
          myRole: MwRole.leader,
          myPlayerId: 7,
          targetRole: MwRole.leader,
          targetPlayerId: 7,
        ),
        isFalse,
      );
      expect(
        canMute(
          myRole: MwRole.council,
          myPlayerId: 7,
          targetRole: MwRole.council,
          targetPlayerId: 7,
        ),
        isFalse,
      );
    });
  });

  group('mesaj kaldırma yetkisi', () {
    /// ⚠️⚠️ **EN KOLAY KAÇIRILACAK ASİMETRİ.** Susturmada kendine dokunmak YASAK, silmede
    /// SERBEST: «kendini susturamazsın» anlamlı bir koruma, «kendi sözünü geri alamazsın»
    /// değil. Susturma ileriye, silme geriye bakıyor.
    test('⭐⭐ KENDİ mesajım serbest — susturmanın TERSİ', () {
      expect(
        canDeleteMessage(
          myRole: MwRole.council,
          myPlayerId: 7,
          senderId: 7,
          senderRole: MwRole.council,
        ),
        isTrue,
      );
      // Karşılaştırma: aynı kişi için susturma YASAK.
      expect(
        canMute(
          myRole: MwRole.council,
          myPlayerId: 7,
          targetRole: MwRole.council,
          targetPlayerId: 7,
        ),
        isFalse,
      );
    });

    /// ⚠️⚠️ Ayrılmış üyenin mesajı SERBEST: mesajlar üyelikten bağımsız yaşıyor ve rütbesi
    /// artık bu ittifağın rütbesi değil. Kapatsaydık ayrılan bir üyenin küfrü kanalda
    /// **kalıcı** olurdu — tam da silmenin var olma sebebi.
    test('⭐⭐ AYRILMIŞ üyenin mesajı serbest (rütbesi null)', () {
      expect(
        canDeleteMessage(
          myRole: MwRole.council,
          myPlayerId: 1,
          senderId: 99,
          senderRole: null,
        ),
        isTrue,
      );
    });

    /// ⚠️ Aynı hiyerarşi silmede de geçerli — yalnız «kime uygulanır» sorusu farklı.
    test('⭐ Konsey, Konsey\'in mesajını kaldırAMIYOR', () {
      expect(
        canDeleteMessage(
          myRole: MwRole.council,
          myPlayerId: 1,
          senderId: 2,
          senderRole: MwRole.council,
        ),
        isFalse,
      );
    });

    test('⭐⭐ Lider\'in mesajı ASLA kaldırılamıyor', () {
      for (final rutbe in [MwRole.council, MwRole.leader]) {
        expect(
          canDeleteMessage(
            myRole: rutbe,
            myPlayerId: 1,
            senderId: 2,
            senderRole: MwRole.leader,
          ),
          isFalse,
        );
      }
    });

    test('Asker hiçbir mesajı kaldıramıyor — kendi mesajı dâhil', () {
      expect(
        canDeleteMessage(
          myRole: MwRole.member,
          myPlayerId: 7,
          senderId: 7,
          senderRole: MwRole.member,
        ),
        isFalse,
      );
    });

    /// ⚠️ Sistem duyurusunun sahibi yok → kaldırılacak bir şey de yok.
    test('⭐ sistem duyurusu kaldırılamıyor', () {
      expect(
        canDeleteMessage(
          myRole: MwRole.leader,
          myPlayerId: 1,
          senderId: null,
          senderRole: null,
        ),
        isFalse,
      );
    });

    test('Lider, Asker\'in mesajını kaldırabiliyor', () {
      expect(
        canDeleteMessage(
          myRole: MwRole.leader,
          myPlayerId: 1,
          senderId: 2,
          senderRole: MwRole.member,
        ),
        isTrue,
      );
    });
  });

  group('susturma süreleri', () {
    /// ⚠️⚠️ **KALICI seçenek listede AÇIKÇA duruyor.** Sözleşmede alan zorunlu + nullable ve
    /// gerekçesi aynı: isteğe bağlı olsaydı alanı unutmak **en ağır cezayı kazara** verirdi.
    /// Listede olmasaydı da arayüz onu erişilemez kılardı — ikisi de yanlış.
    test('⭐⭐ «Kalıcı» seçeneği VAR ve `minutes` null', () {
      final kalici = kMuteDurations.where((d) => d.minutes == null).toList();
      expect(kalici.length, 1);
      expect(kalici.single.label, 'Kalıcı');
    });

    /// ⚠️ Üst sınır 30 gün (43.200 dk) — sunucu şeması bunu reddediyor, daha uzunu için
    /// kalıcı susturma var.
    test('⭐ süreli seçenekler sunucunun 30 günlük tavanının ALTINDA', () {
      for (final d in kMuteDurations) {
        if (d.minutes == null) continue;
        expect(d.minutes! > 0, isTrue);
        expect(d.minutes! <= 43200, isTrue, reason: '${d.label} tavanı aşıyor');
      }
    });

    /// ⚠️ En yıkıcı seçenek listenin İLKİ olmamalı: parmağın ilk düştüğü yer orası.
    test('⭐ «Kalıcı» listenin başında DEĞİL', () {
      expect(kMuteDurations.first.minutes, isNot(isNull));
    });
  });

  group('susturma etiketi', () {
    test('susturulmamışta boş dize', () {
      expect(muteLabel(muted: false, until: null), '');
      expect(muteLabel(muted: false, until: '2026-08-20T00:00:00Z'), '');
    });

    /// ⚠️ Süreli ile kalıcı AYRI: «susturuldu» tek başına, cezanın ne zaman biteceğini soran
    /// üyeye cevap vermiyor.
    test('⭐ kalıcı ile süreli AYRI yazılıyor', () {
      expect(muteLabel(muted: true, until: null), 'kalıcı susturuldu');
      expect(
        muteLabel(muted: true, until: '2026-08-20T00:00:00Z'),
        'susturuldu',
      );
    });
  });
}
