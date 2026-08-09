/**
 * ⭐ AÇIK SOHBET PENCERESİ TOAST'I SUSTURUR (`Toaster.tsx` → `suppressToast`).
 *
 * Kullanıcı 2026-08-09: *"Bir kişiyle sohbet ederken, sohbet penceresi açıkken karşıdaki kişinin
 * yazdığı mesaj anlık olarak sohbete düşüyor ama aynı zamanda sol altan notify olarak da
 * çıkıyor… Eğer mesaj atan kişinin sohbet penceresi açıksa bu notify çıkmasın, pencere kapalıysa
 * çıksın."*
 *
 * ⚠️ Bu testlerin asıl bekçilik ettiği şey **kuralın DAR kalması**: yalnız DM, yalnız AÇIK OLAN
 * kanal. Fazla geniş bir bastırma (bütün DM'leri sustur, ya da pencere açıkken her bildirimi
 * sustur) gelen saldırı uyarısını yutardı — sessizce kaybolan bir bildirim, fazladan görünen
 * bir toast'tan çok daha pahalı.
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

  it('⭐ DM DIŞI bildirimler sohbet açıkken bile susturulmaz', () => {
    // ⚠️ En pahalı yanlış bu olurdu: sohbet ederken gelen saldırı uyarısını yutmak.
    for (const category of ['attack', 'report', 'production', 'mention']) {
      expect(suppressToast({ category, channelId: 57 }, 57)).toBe(false);
    }
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
