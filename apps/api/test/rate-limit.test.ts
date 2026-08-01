/**
 * Hız sınırı — **yalnız kimliksiz uçlar** (§9.3.7).
 *
 * Testlerin çoğu saf sayaca (`hit`) bakıyor: guard'ın kendisi ince bir sarmalayıcı, asıl
 * yanlış yapılabilecek şey pencere mantığı ve anahtar ayrımı.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetRateLimit, clientIp, hit } from '../src/auth/rate-limit.ts';

const W = 60_000;

describe('hız sınırı sayacı', () => {
  beforeEach(() => { __resetRateLimit(); });

  it('sınıra kadar geçirir, sonra reddeder', () => {
    const now = 1_000_000;
    for (let i = 1; i <= 3; i++) {
      expect(hit('a', 3, W, now).allowed, `${i}. istek`).toBe(true);
    }
    expect(hit('a', 3, W, now).allowed).toBe(false);
  });

  it('kalan hak doğru sayılır', () => {
    const now = 1_000_000;
    expect(hit('a', 3, W, now).remaining).toBe(2);
    expect(hit('a', 3, W, now).remaining).toBe(1);
    expect(hit('a', 3, W, now).remaining).toBe(0);
    expect(hit('a', 3, W, now).remaining).toBe(0);
  });

  it('⭐ pencere dolunca sayaç sıfırlanır', () => {
    const now = 1_000_000;
    hit('a', 1, W, now);
    expect(hit('a', 1, W, now).allowed).toBe(false);
    // Pencerenin sonundan bir milisaniye sonrası
    expect(hit('a', 1, W, now + W + 1).allowed).toBe(true);
  });

  it('⚠️ FARKLI IP\'ler birbirini ETKİLEMEZ — asıl korkulan buydu', () => {
    const now = 1_000_000;
    hit('simulate:1.1.1.1', 1, W, now);
    expect(hit('simulate:1.1.1.1', 1, W, now).allowed).toBe(false);
    // Aynı kova, başka IP: tertemiz başlar.
    expect(hit('simulate:2.2.2.2', 1, W, now).allowed).toBe(true);
  });

  it('⚠️ farklı kovalar ayrı sayılır (simülatör tükenince giriş kilitlenmez)', () => {
    const now = 1_000_000;
    hit('simulate:1.1.1.1', 1, W, now);
    expect(hit('simulate:1.1.1.1', 1, W, now).allowed).toBe(false);
    expect(hit('auth:1.1.1.1', 1, W, now).allowed).toBe(true);
  });

  it('reddedince ne kadar bekleneceğini söyler', () => {
    const now = 1_000_000;
    hit('a', 1, W, now);
    const r = hit('a', 1, W, now + 20_000);
    expect(r.allowed).toBe(false);
    // Pencerenin kalanı 40 sn
    expect(r.retryAfterSeconds).toBe(40);
  });

  it('⚠️ süresi geçen anahtarlar temizlenir (harita sonsuza dek büyümez)', () => {
    const now = 1_000_000;
    for (let i = 0; i < 500; i++) hit(`ip-${i}`, 5, W, now);
    // Pencere geçtikten sonra tek bir istek tüm eskileri süpürür.
    const r = hit('yeni', 5, W, now + W + 1);
    expect(r.allowed).toBe(true);
    // Eskiler silindiği için biri yeniden tam hakla başlar.
    expect(hit('ip-0', 5, W, now + W + 2).remaining).toBe(4);
  });
});

describe('istemci IP okuma', () => {
  it('vekil arkasında x-forwarded-for İLK değeri alınır', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })).toBe('9.9.9.9');
  });

  it('başlık yoksa sokete düşer', () => {
    expect(clientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })).toBe('127.0.0.1');
  });

  it('hiçbir kaynak yoksa çökmez', () => {
    expect(clientIp({})).toBe('bilinmiyor');
  });
});
