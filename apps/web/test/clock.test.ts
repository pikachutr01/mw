/**
 * ⭐ İSTEMCİ SAATİ — `serverNow` / `gameNow` / `remaining*` ailesi.
 *
 * **Neden şimdi yazıldı:** bu ailenin hiç testi yoktu ve tam da bu yüzden aynı hata sınıfı
 * canlıda **iki kez** çıktı: 2026-08-02'de casusluk geri sayımı sürekli «varıyor» yazıyordu,
 * 2026-08-07'de asker üretim sayacı kalıcı olarak «sipariş tamamlandı» gösteriyordu. İkisinin
 * de sebebi aynı: **oyun saatindeki bir damgayı gerçek saatle karşılaştırmak.**
 *
 * ⚠️ Asıl işlevi ileriye dönük: Faz 2'de `gameOffsetMs` kaldırılıp `gameNow()` yeniden
 * tanımlanacak. Bu dosya o değişikliğin **sözleşmeyi bozmadığını** ölçen ağdır — özellikle
 * «bitmiş» (`null`) ile «henüz bilmiyorum» ayrımını.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatClock, formatDuration, formatLongDuration,
  gameNow, noteServerTime, remaining, remainingClock, remainingLong, serverNow,
} from '../src/lib/hooks.ts';

/** Sabit bir "tarayıcı şimdisi" — sapma ölçümü ancak böyle deterministik olur. */
const BROWSER_NOW = Date.parse('2026-08-07T12:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BROWSER_NOW);
  // Çıpaları her testte bilinen bir noktaya çek (modül düzeyinde durum tutuluyor).
  noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW));
});

describe('saat çıpaları', () => {
  it('tarayıcı saati ileriyse sapma ölçülüp geri alınır', () => {
    // Sunucu 30 sn GERİDE → tarayıcı 30 sn ileri demektir.
    noteServerTime(iso(BROWSER_NOW - 30_000));
    expect(serverNow()).toBe(BROWSER_NOW - 30_000);
  });

  it('tarayıcı saati geriyse de düzeltilir', () => {
    noteServerTime(iso(BROWSER_NOW + 45_000));
    expect(serverNow()).toBe(BROWSER_NOW + 45_000);
  });

  /**
   * ⭐ Oyun saati gerçek saatin GERİSİNDE (canlıda 196,5 sn). Geri sayımı çizilen her mutlak
   * damga o ölçekte tutuluyor.
   */
  it('gameNow, sunucunun bildirdiği oyun saatini izler', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - 196_563));
    expect(gameNow()).toBe(BROWSER_NOW - 196_563);
    expect(serverNow() - gameNow()).toBe(196_563);
  });

  /** `gameNow` göndermeyen uçlar offset'i BOZMAMALI, yalnız güncellememeli. */
  it('yalnız serverNow gönderen yanıt oyun çıpasını bozmaz', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - 196_563));
    noteServerTime(iso(BROWSER_NOW));               // gameNow yok
    expect(serverNow() - gameNow()).toBe(196_563);
  });

  it('bozuk damga çıpayı bozmaz', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - 5_000));
    noteServerTime('bu bir tarih değil', 'bu da değil');
    expect(serverNow() - gameNow()).toBe(5_000);
  });
});

describe('remaining — varsayılan çıpa OYUN saati', () => {
  /**
   * ⭐⭐ 2026-08-02 HATASININ BEKÇİSİ. Casusluk 120 sn sürüyor; oyun saati 196,5 sn geride
   * olduğu için varış anı gerçek saatle bakıldığında HEP geçmişte kalıyor ve geri sayım
   * yerine sürekli «varıyor» yazıyordu. Hata görev SÜRESİ kısaldıkça görünür oluyor — uzun
   * seferlerde yutuluyordu, bu yüzden aylarca fark edilmedi.
   */
  it('kısa görev (120 sn) oyun saatiyle doğru sayar, gerçek saatle "bitmiş" görünür', () => {
    const offset = 196_563;
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - offset));
    const varis = iso(gameNow() + 120_000);          // oyun saatinde 2 dakika sonra

    expect(remaining(varis)).toBe('2 dk 00 sn');     // ⭐ doğru çıpa
    expect(remaining(varis, serverNow())).toBeNull(); // ⛔ yanlış çıpa: "bitmiş" görünüyor
  });

  it('bitmiş süre null döner', () => {
    expect(remaining(iso(gameNow() - 1_000))).toBeNull();
  });

  it('boş/geçersiz girdi null döner', () => {
    expect(remaining(null)).toBeNull();
    expect(remaining(undefined)).toBeNull();
    expect(remaining('çöp')).toBeNull();
  });

  it('remainingClock aynı çıpayı kullanır', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - 196_563));
    expect(remainingClock(iso(gameNow() + 271_000))).toBe('04:31');
  });

  /**
   * ⚠️ `remainingLong` varsayılanı GERÇEK saat — çünkü tek çağıranı tatil paneli ve oradaki
   * damga gün ölçeğinde. Çıpa isteyen açıkça geçmeli. Bu testin işi o asimetriyi **bilinçli**
   * kılmak: değişirse burada görünür.
   */
  it('remainingLong varsayılanı GERÇEK saat (bilinçli asimetri)', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - 196_563));
    const gunler = iso(serverNow() + 3 * 86_400_000);
    expect(remainingLong(gunler)).toBe('3 gün');
  });
});

describe('biçimlendirme', () => {
  it('formatDuration saniyeyi HER ZAMAN yazar (kullanıcı kararı)', () => {
    expect(formatDuration(7_457)).toBe('2 sa 04 dk 17 sn');
    expect(formatDuration(192)).toBe('3 dk 12 sn');
    expect(formatDuration(9)).toBe('9 sn');
    expect(formatDuration(-5)).toBe('0 sn');
  });

  it('formatLongDuration bir günden kısasını formatDuration\'a devreder', () => {
    expect(formatLongDuration(86_399)).toBe('23 sa 59 dk 59 sn');
    expect(formatLongDuration(86_400)).toBe('1 gün');
    expect(formatLongDuration(30 * 86_400 - 60)).toBe('29 gün 23 sa');
  });

  it('formatClock dar yerler için saat biçimi verir', () => {
    expect(formatClock(271)).toBe('04:31');
    expect(formatClock(7_467)).toBe('2:04:27');
  });
});
