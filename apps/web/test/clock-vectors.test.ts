/**
 * ⭐⭐ DİLLER ARASI EŞİTLİK KAPISI — web tarafı.
 *
 * Kullanıcının «tam eşitlik» kararı (iki istemci, aynı oyun) bugüne kadar bir NİYETTİ. Bu dosya
 * ve Dart'taki kardeşi (`apps/mobile/test/core/clock_test.dart`) onu bir **kapıya** çeviriyor:
 * ikisi de `packages/contracts/fixtures/clock-vectors.json` dosyasını okuyor ve aynı girdilerin
 * aynı metni ürettiğini ölçüyor.
 *
 * ⚠️ Neden zaman biçimlendirmesiyle başlıyor: oyunun ekranlarının çoğu bir geri sayım gösteriyor
 * ve bu metinler oyuncunun karar verdiği asıl veri («ordu 4 dk sonra varıyor»). İki istemcinin
 * burada ayrışması, aynı hesabı iki cihazdan açan oyuncuya farklı iki oyun göstermek olurdu.
 *
 * ⚠️ Bu dosya `clock.test.ts`in YERİNE GEÇMEZ. O, saat sapması ve bakım donması gibi **durum**
 * davranışını ölçüyor; bu ise iki dilin ortak **çıktısını**. Biri bozulunca diğeri yakalamaz.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatClock, formatDuration, formatLongDuration, gameNow,
  noteServerTime, serverNow, timeAgo,
} from '../src/lib/hooks.ts';

/**
 * ⚠️ Dosya GÖRELİ YOLDAN okunuyor, `test/fixtures/`e kopyalanmıyor. Kopya olsaydı iki kopya
 * arasında sürüklenme başlardı — tam olarak kaçındığımız şey.
 */
const VECTORS = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../packages/contracts/fixtures/clock-vectors.json', import.meta.url)),
    'utf8',
  ),
) as {
  pauseThresholdMs: number;
  durations: { seconds: number; duration: string; long: string; clock: string }[];
  timeAgo: { agoSeconds: number; text: string }[];
  pause: { skewMs: number; paused: boolean }[];
};

const BROWSER_NOW = Date.parse('2026-08-07T12:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BROWSER_NOW);
  noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW));
});

describe('⭐⭐ ortak vektörler — süre biçimleri', () => {
  it.each(VECTORS.durations)('$seconds sn → $duration', (v) => {
    expect(formatDuration(v.seconds)).toBe(v.duration);
    expect(formatLongDuration(v.seconds)).toBe(v.long);
    expect(formatClock(v.seconds)).toBe(v.clock);
  });

  /**
   * ⚠️ Vektör dosyasının BOŞ ya da eksik okunması testi sessizce «geçirir» — `it.each([])`
   * hiçbir şey koşmaz ve yeşil görünür. Sayı iddiası o sessiz başarısızlığı kapatıyor.
   */
  it('vektör dosyası gerçekten okundu (sessiz boş küme değil)', () => {
    expect(VECTORS.durations.length).toBeGreaterThan(10);
    expect(VECTORS.timeAgo.length).toBeGreaterThan(10);
    expect(VECTORS.pause.length).toBeGreaterThan(3);
  });
});

describe('⭐⭐ ortak vektörler — geçmişe bakan süre', () => {
  it.each(VECTORS.timeAgo)('$agoSeconds sn önce → $text', (v) => {
    expect(timeAgo(iso(BROWSER_NOW - v.agoSeconds * 1000))).toBe(v.text);
  });
});

describe('⭐⭐ ortak vektörler — bakım sezgisi', () => {
  it('eşik değeri iki dilde AYNI sabittir', () => {
    // Sabit `hooks.ts` içinde private; davranışından okunuyor: eşiğin tam üstü duraklatır,
    // tam kendisi duraklatmaz. İkisi birlikte sayıyı tek bir değere kilitliyor.
    const t = VECTORS.pauseThresholdMs;
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - t));
    expect(gameNow()).toBe(serverNow());

    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - t - 1));
    expect(gameNow()).not.toBe(serverNow());
  });

  it.each(VECTORS.pause)('sapma $skewMs ms → duraklamış: $paused', (v) => {
    // ⚠️ Her vektörden önce çıpa sıfırlanmalı: `noteServerTime` duraklama durumunu yalnız
    // `gameNow` verildiğinde günceller, yani önceki vektörün donmuş hâli sızabilirdi.
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW));
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - v.skewMs));

    if (v.paused) {
      expect(gameNow()).toBe(BROWSER_NOW - v.skewMs);
    } else {
      expect(gameNow()).toBe(serverNow());
    }
  });
});
