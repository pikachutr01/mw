/**
 * Hız sınırı — **yalnız kimliksiz uçlar** (§9.3.7).
 *
 * Testlerin çoğu saf sayaca (`hit`) bakıyor: guard'ın kendisi ince bir sarmalayıcı, asıl
 * yanlış yapılabilecek şey pencere mantığı ve anahtar ayrımı.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { LIMITED, __resetRateLimit, clientIp, hit } from '../src/auth/rate-limit.ts';

const W = 60_000;

/**
 * ⭐ SINIRLANAN YOLLAR LİSTESİ (2026-08-06'da `reset-password` eklendi).
 *
 * ⚠️ Liste bilerek DAR: sınır IP başına ve aynı IP'yi paylaşan iki oyuncu birbirini
 * kilitleyebilir. Bu yüzden burada iki yönlü bekçi var — sınırlanması GEREKEN uçlar listede
 * olmalı, oyun içi trafik ise ASLA olmamalı.
 */
describe('sınırlanan yollar', () => {
  it('⭐ parola kurtarmanın İKİ ucu da sınırlı', () => {
    const paths = LIMITED.map((r) => r.path);
    // `forgot-password` posta kotasını, `reset-password` argon2id CPU'sunu koruyor.
    expect(paths).toContain('/api/v1/auth/forgot-password');
    expect(paths).toContain('/api/v1/auth/reset-password');
  });

  /**
   * ⭐ 2026-08-12 — `/hesap-sil` sayfası oturumsuz silme isteği alabiliyor.
   *
   * ⚠️ İkisi ayrı gerekçeyle listede: `request-by-email` **posta** üretiyor (adres başına
   * kota var ama farklı adreslerle dövülebilir), `delete-account` ise `reset-password` ile
   * aynı **argon2id** maliyetini taşıyor. İkincisi 2026-08-12'ye kadar sınırsızdı.
   */
  it('⭐ hesap silmenin oturumsuz uçları sınırlı', () => {
    const paths = LIMITED.map((r) => r.path);
    expect(paths).toContain('/api/v1/auth/delete-account/request-by-email');
    expect(paths).toContain('/api/v1/auth/delete-account');
  });

  /**
   * ⚠️ Eşleşme TAM YOL (`r.path === path`), önek değil. `delete-account`ı listeye eklemek
   * `delete-account/preview`i sessizce sınırlamamalı: önizleme jeton tüketmiyor, ucuz ve
   * sayfa açılışında koşuyor — bir oyuncunun bağlantıyı iki kez açması onu kilitlememeli.
   */
  it('⚠️ önizleme ucu sınırlı DEĞİL (tam yol eşleşmesi, önek değil)', () => {
    expect(LIMITED.map((r) => r.path)).not.toContain('/api/v1/auth/delete-account/preview');
  });

  /**
   * ⚠️ Asıl değişmez: listedeki HER yol **kimliksiz** olmalı. Oyun içi (oturumlu) bir uca IP
   * başına sınır koymak, aynı bağlantıyı paylaşan iki oyuncunun birbirini kilitlemesi demek.
   * ⭐ 2026-08-14'te kimliksiz destek uçları eklendi; kural genişledi, GEVŞEMEDİ.
   */
  const PUBLIC_PREFIXES = ['/api/v1/auth/', '/api/v1/support/public/'];

  it('⚠️ oyun içi trafik sınırlı DEĞİL', () => {
    for (const r of LIMITED) {
      const ok = PUBLIC_PREFIXES.some((p) => r.path.startsWith(p)) || r.path === '/api/v1/simulate';
      expect(ok, r.path).toBe(true);
    }
  });

  /**
   * Kova ayrımı: simülatör · kimlik · destek. ⚠️ Destek kimlik kovasını PAYLAŞMIYOR — bir
   * destek formu bir giriş hakkı yeseydi, aynı NAT arkasındaki bir aile kendini oyundan
   * kilitleyebilirdi (ve tersi: destek için gevşetmek giriş korumasını zayıflatırdı).
   */
  it('her uç doğru kovada (biri tükenince diğeri kilitlenmesin)', () => {
    for (const r of LIMITED) {
      const expected = r.path === '/api/v1/simulate' ? 'simulate'
        : r.path.startsWith('/api/v1/support/') ? 'support'
          : 'auth';
      expect(r.bucket, r.path).toBe(expected);
    }
  });

  it('⚠️ OTURUMLU destek uçları listede DEĞİL', () => {
    const paths = LIMITED.map((r) => r.path);
    expect(paths).not.toContain('/api/v1/support');
    expect(paths).not.toContain('/api/v1/support/uploads');
    expect(paths).not.toContain('/api/v1/admin/support/uploads');
  });
});

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
