/**
 * ⭐ HIZ SINIRI — **yalnız kimliksiz uçlar** (kullanıcı, 2026-08-02).
 *
 * Misafir modu (§9.3.6) ana sayfayı ve savaş simülatörünü kimlik doğrulamasının dışına
 * çıkardı. `POST /api/v1/simulate` gerçek savaş motorunu koşturuyor ve tek istekte `repeat`
 * ile 50 savaş çevirebiliyor; sınırsız bırakmak sunucuyu bedava CPU'ya açardı. `auth/*`
 * uçları da kimliksiz ve parola denemesine açık.
 *
 * ⚠️⚠️ **OYUNUN İÇİNDEKİ TRAFİĞE UYGULANMAZ.** Sınır IP başına; oyun istemcisi dakikada
 * onlarca istek atıyor ve **aynı IP'yi paylaşan iki oyuncu birbirini kilitler** (ev, okul,
 * mobil operatör NAT'ı). Bu yüzden liste dar ve açıkça sayılı — "her şeyi sınırla, gerekeni
 * muaf tut" değil, **"yalnız şunları sınırla"**.
 *
 * ⚠️ Sayaç **süreç belleğinde**. Dağıtım profilimiz `ROLE=all` (tek süreç), orada doğru
 * çalışır. Çok süreçli bir dağıtıma geçilirse her sürecin kendi sayacı olur → gerçek sınır
 * süreç sayısıyla çarpılır. O gün paylaşımlı bir sayaç (Redis/Postgres) gerekir; bugün
 * ikinci bir altyapı bağımlılığı istemiyoruz (§4.0 küçük sunucu profili).
 *
 * ⚠️ Sabit pencere (fixed window) kullanılıyor, kayan pencere değil: pencere sınırında
 * kısa süreliğine iki katı isteğe izin verir. Kötüye kullanımı yavaşlatmak için yeterli,
 * uygulaması ve akıl yürütmesi basit.
 */
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service.ts';

/**
 * Sınırlanan yollar ve hangi kovaya düştükleri. Liste **tam** — burada olmayan sınırlanmaz.
 * ⚠️ `export`: testler listenin kendisini bekçiye bağlıyor (yeni bir uç eklenirken oyun içi
 * trafiğin yanlışlıkla sınırlanmadığı da ölçülüyor).
 */
export const LIMITED: ReadonlyArray<{ path: string; bucket: 'simulate' | 'auth' | 'support' }> = [
  { path: '/api/v1/simulate', bucket: 'simulate' },
  { path: '/api/v1/auth/login', bucket: 'auth' },
  { path: '/api/v1/auth/register', bucket: 'auth' },
  { path: '/api/v1/auth/forgot-password', bucket: 'auth' },
  /**
   * ⭐ 2026-08-06'da eklendi. ⚠️ Gerekçe KABA KUVVET DEĞİL: jeton 256 bit, tahmin edilemez.
   * Asıl mesele **CPU**: her istek jeton biçimi doğru olduğu sürece bir argon2id hash'i
   * çalıştırıyor (`resetPassword` → `passwords.hash`). Uydurma jetonla saniyede yüzlerce
   * istek atmak sunucuyu bedavaya yorardı — `simulate` ucundaki gerekçenin aynısı.
   */
  { path: '/api/v1/auth/reset-password', bucket: 'auth' },
  /**
   * ⭐ 2026-08-12'de eklendi — `/hesap-sil` sayfasının oturumsuz istek formu.
   *
   * ⚠️ Buradaki gerekçe CPU değil **POSTA**: uç, verilen adrese silme bağlantısı yolluyor.
   * `email-token.service.ts`teki kota (amaç başına 60 sn + hesap/IP günlük tavanı) asıl
   * frendir; ama o fren **hesap başına** çalışıyor. Sınırsız bırakılırsa saldırgan farklı
   * adreslerle saniyede yüzlerce istek atıp DB'yi sorgulatabilir ve gerçek olan her adres
   * için bir mail çıkartabilirdi. `forgot-password`un listede olma sebebinin aynısı.
   */
  { path: '/api/v1/auth/delete-account/request-by-email', bucket: 'auth' },
  /**
   * ⚠️ **Mevcut bir açıktı** (2026-08-12'de fark edildi, yukarıdaki uç eklenirken).
   * `reset-password` CPU gerekçesiyle listeye alınmıştı; `delete-account` de tam olarak aynı
   * şeyi yapıyor — `AccountDeleteService.execute()` anonimleştirme sırasında bir argon2id
   * hash'i çalıştırıyor. Uydurma jetonla dövülebilen, sınırsız bir argon2id ucu kalmasın.
   */
  { path: '/api/v1/auth/delete-account', bucket: 'auth' },
  /**
   * ⭐ DESTEK — kimliksiz talep açma ve resim yükleme (2026-08-14).
   *
   * ⚠️ **AYRI kova, `auth` DEĞİL.** `auth` kovası parola denemesine göre sıkı ayarlı; paylaşsalardı
   * bir destek formu bir giriş hakkı yerdi ve aynı NAT arkasındaki bir aile kendini oyundan
   * kilitleyebilirdi. Ters yön de kötü: destek için gevşetmek giriş korumasını zayıflatırdı.
   *
   * ⚠️ Gerekçe CPU değil, ikisi birden: **POSTA** (her talep iki mail üretiyor, biri bize biri
   * ziyaretçiye → Resend kotası ve alan adı itibarı) ve **DİSK** (yükleme ucu).
   *
   * ⚠️ Yalnız `public` uçlar listede. Girişli destek uçları **ASLA** eklenmemeli — dosyanın
   * başındaki kural: oyun içi trafiğe IP başına sınır uygulanmaz.
   */
  { path: '/api/v1/support/public/tickets', bucket: 'support' },
  { path: '/api/v1/support/public/uploads', bucket: 'support' },
];

interface Counter { count: number; resetAt: number }

/**
 * Sayaç deposu. Sınıf dışında modül düzeyinde: Nest guard'ı yeniden kurulsa bile sayaç
 * hayatta kalır ve test edilebilir kalır (`__resetRateLimit`).
 */
const counters = new Map<string, Counter>();

/** Süresi geçmiş anahtarları temizler — yoksa harita her yeni IP ile sonsuza dek büyür. */
function prune(now: number): void {
  for (const [key, c] of counters) {
    if (c.resetAt <= now) counters.delete(key);
  }
}

/** Testler için: sayaçları sıfırlar. Üretimde çağrılmaz. */
export function __resetRateLimit(): void {
  counters.clear();
}

/**
 * ⚠️ IP, ters vekil (nginx) arkasında `x-forwarded-for`dan okunuyor. Başlık **istemci
 * tarafından uydurulabilir**; bu yüzden yalnız İLK değer alınıyor ve vekilin onu ezmesi
 * bekleniyor (`proxy_set_header X-Forwarded-For $remote_addr`). Vekil yoksa soket adresi.
 */
export function clientIp(req: {
  headers?: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  const fwd = req.headers?.['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const first = typeof raw === 'string' ? raw.split(',')[0]?.trim() : undefined;
  return first || req.ip || req.socket?.remoteAddress || 'bilinmiyor';
}

/**
 * Saf sayaç — guard'dan ayrı, çünkü asıl test edilesi şey bu.
 * @returns kalan hak ve pencerenin bitişi; `allowed` false ise istek reddedilmeli.
 */
export function hit(
  key: string, limit: number, windowMs: number, now: number,
): { allowed: boolean; remaining: number; resetAt: number; retryAfterSeconds: number } {
  prune(now);
  const cur = counters.get(key);
  if (!cur || cur.resetAt <= now) {
    const resetAt = now + windowMs;
    counters.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, retryAfterSeconds: 0 };
  }
  cur.count += 1;
  const allowed = cur.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - cur.count),
    resetAt: cur.resetAt,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
  };
}

@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  // ⚠️ `import type` KULLANILMAZ (dekoratör metadata'sı `Object` yazar, Nest çözemez).
  constructor(private readonly settings: SettingsService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<{
      method?: string; url?: string; headers?: Record<string, unknown>;
      ip?: string; socket?: { remoteAddress?: string };
    }>();

    if (String(req.method ?? 'GET').toUpperCase() !== 'POST') return true;

    // Fastify'da `url` sorgu dizesini de taşır; yalnız yol kısmına bakıyoruz.
    const path = String(req.url ?? '').split('?')[0] ?? '';
    const rule = LIMITED.find((r) => r.path === path);
    if (!rule) return true;

    /**
     * ⚠️ Limitler **genel katmandan** (dünya 0) okunuyor: bu uçlar kimliksiz, dolayısıyla
     * hangi dünyaya ait oldukları bilinmiyor. Dünya bazlı bir hız sınırı zaten anlamsız
     * olurdu — sınırın konusu sunucunun kendisi.
     */
    const cfg = this.settings.group(0, 'ratelimit');
    if (cfg['enabled'] === false) return true;

    const windowMs = Math.max(1, Number(cfg['windowSeconds'] ?? 60)) * 1000;
    /** ⚠️ Yedek değerler şema varsayılanlarının aynısı olmalı; ayrışırsa panel yalan söyler. */
    const FALLBACK: Record<string, number> = { simulate: 30, auth: 10, support: 5 };
    const limit = Math.max(1, Number(cfg[rule.bucket] ?? FALLBACK[rule.bucket] ?? 10));

    const r = hit(`${rule.bucket}:${clientIp(req)}`, limit, windowMs, Date.now());
    if (r.allowed) return true;

    /**
     * ⚠️ 429 + `Retry-After`: istemcinin ne zaman tekrar deneyeceğini bilmesi gerekiyor.
     * Mesaj Türkçe ve `ErrorBox` aynen basıyor.
     */
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'rate_limited',
        message: `Çok fazla istek gönderildi. ${r.retryAfterSeconds} saniye sonra tekrar dene.`,
        retryAfter: r.retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
