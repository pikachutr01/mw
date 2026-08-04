/**
 * ⭐ OYUN SAAT DİLİMİ (kullanıcı, 2026-08-04 — ikinci bildirim).
 *
 * ─ Ölçülen şikâyet ────────────────────────────────────────────────────────────────────────
 * *"Oyunda sıralama sayfasında 00:00 yazıyordu, admin panelde 03:00 gösteriyor."*
 * Veritabanı doğruydu (`taken_at` = 00:00Z); iki ekran iki farklı sözleşme kullanıyordu.
 *
 * ⚠️ Bu dosyanın asıl derdi **gün sınırı**. Yanlış hesaplanan bir gün başlangıcı, günde üç kez
 * koşan sıralamayı 3 saat kaydırıyordu ve hata SESSİZDİ: sistem çalışıyor, sayılar tutarlı
 * görünüyor, yalnız oyuncunun saatiyle uyuşmuyor.
 */
import { describe, expect, it } from 'vitest';
import {
  GAME_TIME_ZONE, NIGHT_FROM_HOUR, NIGHT_TO_HOUR, formatGameHhmm, formatGameTime, isNightHour,
  zoneOffsetMs, zonedDayStart, zonedHour,
} from '../src/time.ts';

/** Türkiye kalıcı UTC+3 (2016'dan beri yaz saati yok). */
const H3 = 3 * 3_600_000;

describe('bölge kayması', () => {
  it('Türkiye her mevsim UTC+3', () => {
    // Yaz saati uygulayan bir bölge olsaydı bu ikisi farklı çıkardı — kasıtlı çapa.
    expect(zoneOffsetMs(new Date('2026-01-15T12:00:00Z'))).toBe(H3);
    expect(zoneOffsetMs(new Date('2026-07-15T12:00:00Z'))).toBe(H3);
  });

  /** ⚠️ Yardımcı bölgeye BAĞIMLI değil: kural bir gün taşınırsa hesaplar kendiliğinden doğru. */
  it('yaz saati uygulayan bir bölgede kayma mevsime göre değişir', () => {
    const winter = zoneOffsetMs(new Date('2026-01-15T12:00:00Z'), 'Europe/Berlin');
    const summer = zoneOffsetMs(new Date('2026-07-15T12:00:00Z'), 'Europe/Berlin');
    expect(winter).toBe(1 * 3_600_000);
    expect(summer).toBe(2 * 3_600_000);
  });
});

describe('gün başlangıcı', () => {
  /**
   * ⭐ ASIL HATA BURADAYDI. Türkiye'de gün 21:00Z'de başlıyor; `Date.UTC(...)` ile hesaplamak
   * günü 00:00Z'de başlatıyor ve sıralama yuvalarını 3 saat kaydırıyordu.
   */
  it('Türkiye günü bir önceki 21:00Z’de başlar', () => {
    // 4 Ağustos 22:01 TSİ → o günün başlangıcı 4 Ağustos 00:00 TSİ = 3 Ağustos 21:00Z.
    expect(zonedDayStart(new Date('2026-08-04T19:01:00Z')).toISOString())
      .toBe('2026-08-03T21:00:00.000Z');
  });

  /** ⚠️ Sınır: TSİ gece yarısının bir dakika ÖNCESİ hâlâ önceki gün. */
  it('gece yarısı sınırı doğru tarafa düşer', () => {
    expect(zonedDayStart(new Date('2026-08-04T20:59:00Z')).toISOString())
      .toBe('2026-08-03T21:00:00.000Z');
    expect(zonedDayStart(new Date('2026-08-04T21:00:00Z')).toISOString())
      .toBe('2026-08-04T21:00:00.000Z');
  });

  it('gün başlangıcının kendisi sabit nokta', () => {
    const s = zonedDayStart(new Date('2026-08-04T19:01:00Z'));
    expect(zonedDayStart(s).toISOString()).toBe(s.toISOString());
  });

  /**
   * ⚠️ İKİ ÇEVRİMLİ hesabın sebebi: kaymayı `at` anından okuyoruz ama gün başlangıcı BAŞKA
   * bir an ve saat kaymalı bir bölgede o iki an farklı kaymalara düşebiliyor. Berlin'in
   * geçiş gecesi bunu ölçüyor.
   */
  it('saat kayması gecesinde gün başlangıcı yine yerel 00:00’dır', () => {
    // 29 Mart 2026: Berlin 02:00'de 03:00'e atlıyor. Günün başlangıcı yine yerel gece yarısı.
    const s = zonedDayStart(new Date('2026-03-29T12:00:00Z'), 'Europe/Berlin');
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(s);
    expect(local).toBe('00:00');
  });
});

describe('bölgedeki saat', () => {
  /**
   * ⭐ Gece savaşı penceresi (00:00-08:00) bununla ölçülüyor. Eskiden `getUTCHours()` ile
   * ölçülüyordu, yani pencere Türkiye'de 03:00-11:00'e denk geliyordu: oyuncu sabah 10'da
   * "gece" cezası yiyordu.
   */
  it('UTC saatiyle karışmaz', () => {
    expect(zonedHour(new Date('2026-08-04T22:30:00Z'))).toBe(1);   // TSİ 01:30 → GECE
    expect(zonedHour(new Date('2026-08-04T07:30:00Z'))).toBe(10);  // TSİ 10:30 → gündüz
    expect(zonedHour(new Date('2026-08-04T00:30:00Z'))).toBe(3);   // TSİ 03:30 → gece
  });
});

/**
 * ⭐ Gece penceresi TEK KAYNAKTAN: savaş çözümü (`isNightBattle`) ve üst şeritteki gece rozeti
 * aynı fonksiyonu okuyor. İki kopya olsaydı rozet ile kural ayrışabilir ve gösterge oyuncuya
 * yanlış söyleyebilirdi.
 */
describe('gece penceresi', () => {
  it('Türkiye saatiyle 00:00–08:00', () => {
    expect(isNightHour(new Date('2026-07-25T21:00:00Z'))).toBe(true);   // TSİ 00:00
    expect(isNightHour(new Date('2026-07-26T04:59:00Z'))).toBe(true);   // TSİ 07:59
    expect(isNightHour(new Date('2026-07-26T05:00:00Z'))).toBe(false);  // TSİ 08:00
    expect(isNightHour(new Date('2026-07-26T20:30:00Z'))).toBe(false);  // TSİ 23:30
  });

  it('sınırlar sabitlerle uyumlu', () => {
    expect(NIGHT_FROM_HOUR).toBe(0);
    expect(NIGHT_TO_HOUR).toBe(8);
  });
});

describe('gösterim', () => {
  /** ⚠️ Tarayıcının yerel saatine BAĞLI DEĞİL — test hangi makinede koşarsa koşsun aynı. */
  it('her zaman Türkiye saatini yazar', () => {
    expect(formatGameHhmm('2026-08-04T19:51:00Z')).toBe('22:51');
    expect(formatGameTime('2026-08-04T19:51:00Z')).toContain('22:51');
    expect(formatGameTime('2026-08-04T19:51:00Z')).toContain('04.08.2026');
  });

  /** ⭐ Kullanıcının bildirdiği somut vaka: 22:51'de tetiklenen sıralama 19:51 görünüyordu. */
  it('şikâyetteki vaka artık doğru', () => {
    // Kullanıcı 22:51 TSİ'de tetikledi → 19:51Z saklandı → ekranda yine 22:51 görünmeli.
    expect(formatGameHhmm(new Date('2026-08-04T19:51:00Z'))).toBe('22:51');
  });

  it('bozuk değer çökertmez', () => {
    expect(formatGameTime('abc')).toBe('—');
    expect(formatGameTime(Number.NaN)).toBe('—');
  });

  it('bölge sabiti tek kaynak', () => {
    expect(GAME_TIME_ZONE).toBe('Europe/Istanbul');
  });
});
