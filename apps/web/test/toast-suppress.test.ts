/**
 * ⭐ AÇIK SOHBET PENCERESİ TOAST'I SUSTURUR (`Toaster.tsx` → `suppressToast`).
 *
 * Kullanıcı 2026-08-09: *"Bir kişiyle sohbet ederken, sohbet penceresi açıkken karşıdaki kişinin
 * yazdığı mesaj anlık olarak sohbete düşüyor ama aynı zamanda sol altan notify olarak da
 * çıkıyor… Eğer mesaj atan kişinin sohbet penceresi açıksa bu notify çıkmasın, pencere kapalıysa
 * çıksın."*
 *
 * ⚠️ Bu testlerin asıl bekçilik ettiği şey **kuralın DAR kalması**: yalnız DM ve genel sohbet
 * bahsetmesi, yalnız AÇIK OLAN kanal. Fazla geniş bir bastırma (bütün DM'leri sustur, ya da
 * pencere açıkken her bildirimi sustur) gelen saldırı uyarısını yutardı — sessizce kaybolan bir
 * bildirim, fazladan görünen bir toast'tan çok daha pahalı.
 *
 * ⭐ 2026-08-10'da **ikinci dal** eklendi (genel sohbet). Üçüncü parametre o kanalın kimliği ve
 * DM slotundan AYRI: oyuncu aynı anda bir DM penceresi ve genel sohbeti açık tutabilir.
 */
import { describe, expect, it } from 'vitest';
import { suppressToast } from '../src/components/Toaster.tsx';

describe('suppressToast', () => {
  it('⭐ konuştuğum kişinin mesajı: pencere açıkken toast ÇIKMAZ', () => {
    expect(suppressToast({ category: 'dm', channelId: 57 }, 57)).toBe(true);
  });

  it('⭐ BAŞKA birinden gelen DM: toast çıkar (A ile konuşurken B yazdı)', () => {
    expect(suppressToast({ category: 'dm', channelId: 99 }, 57)).toBe(false);
  });

  it('pencere kapalıyken toast çıkar', () => {
    expect(suppressToast({ category: 'dm', channelId: 57 }, null)).toBe(false);
  });

  it('⭐ OYUN bildirimleri sohbet açıkken bile susturulmaz', () => {
    // ⚠️ En pahalı yanlış bu olurdu: sohbet ederken gelen saldırı uyarısını yutmak.
    for (const category of ['attack', 'report', 'production']) {
      expect(suppressToast({ category, channelId: 57 }, 57, 57)).toBe(false);
    }
  });

  /**
   * ⭐ GENEL SOHBET BAHSETMESİ (kullanıcı, 2026-08-10): *"Sohbete ister mobil ister masaüstünde
   * bağlı olsun kendinden bahsetmelerde notify bildirim gelmesin. Sadece sohbet bağlı değilse
   * bu bildirimler sağ alttan gelsin."*
   *
   * ⚠️ Kural DM kanalına DEĞİL, **genel sohbet kanalına** bakıyor: iki slot ayrı (`realtime.ts`),
   * çünkü oyuncu aynı anda bir DM penceresi ve genel sohbeti açık tutabilir.
   */
  describe('genel sohbet bahsetmesi', () => {
    it('⭐ sohbete BAĞLIYKEN toast ÇIKMAZ', () => {
      expect(suppressToast({ category: 'mention', channelId: 12 }, null, 12)).toBe(true);
    });

    it('⭐ sohbete bağlı DEĞİLKEN toast çıkar (kullanıcının asıl istediği)', () => {
      expect(suppressToast({ category: 'mention', channelId: 12 }, null, null)).toBe(false);
    });

    it('⚠️ İTTİFAK sohbetinin bahsetmesi (başka kanal) susturulmaz', () => {
      // Bu tur kapsamı yalnız genel sohbetti; ittifak sheet'i açıkken toast çıkmaya devam eder.
      expect(suppressToast({ category: 'mention', channelId: 99 }, null, 12)).toBe(false);
    });

    it('⚠️ açık DM penceresi bahsetmeyi SUSTURMAZ — slotlar ayrı', () => {
      expect(suppressToast({ category: 'mention', channelId: 12 }, 12, null)).toBe(false);
    });

    it('sunucu channelId göndermezse toast çıkmaya devam eder', () => {
      expect(suppressToast({ category: 'mention' }, null, 12)).toBe(false);
    });
  });

  it('sunucu channelId göndermezse (eski sürüm) toast çıkmaya devam eder', () => {
    // ⚠️ Degrade yönü ÖNEMLİ: bilinmeyen durumda bildirimi göstermek, gizlemekten iyidir.
    expect(suppressToast({ category: 'dm' }, 57)).toBe(false);
    expect(suppressToast({ category: 'dm', channelId: null }, 57)).toBe(false);
  });

  it('kanal kimliği metin gelse de karşılaştırılır', () => {
    // WS yükü `Record<string, unknown>`; sayı JSON'dan metin olarak da dönebilir.
    expect(suppressToast({ category: 'dm', channelId: '57' }, 57)).toBe(true);
  });
});
