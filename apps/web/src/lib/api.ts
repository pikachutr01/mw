/**
 * API istemcisi.
 *
 * ⭐ **Refresh TEK KULLANIMLIK ve DÖNDÜRMELİ** (sunucu kuralı): her yenilemede yeni bir refresh
 * gelir ve eskisi iptal olur. Bu yüzden iki eşzamanlı 401 iki ayrı yenileme başlatırsa **ikincisi
 * iptal edilmiş token'ı kullanır ve oturumu düşürür**. Çözüm: uçuşta tek yenileme sözü tutulur
 * (`refreshing`), diğer istekler onu bekler.
 *
 * ⭐ **YENİLEME ARTIK 401'İ BEKLEMİYOR** (2026-08-03, kullanıcı: *"ben konsolu açtığımda orada
 * kırmızı hata uyarıları görmek hiç hoşuma gitmiyor"*). Eskiden tek tetikleyici 401'di: jeton
 * her dolduğunda uçuştaki bütün yoklama istekleri önce **başarısız oluyor**, sonra yenilenip
 * tekrarlanıyordu. Sonuç doğruydu ama tarayıcı başarısız isteği JS'ten bağımsız olarak konsola
 * kırmızı yazar — yani o gürültü kod tarafından SUSTURULAMAZ. Tek çözüm süresi dolmuş jetonu
 * hiç göndermemek: `api()` istekten önce ömrün son %10'una girilmişse yenilemeyi bekliyor.
 * 401 yolu yine duruyor ama artık yalnız bir emniyet ağı (saat kayması, sunucuda iptal).
 */
import { setConflict } from './session-conflict.ts';

export interface Session {
  accessToken: string;
  refreshToken: string;
  playerId: number;
  worldId: number;
  username: string;
  /**
   * Yenilemenin başlaması gereken an — **yerel saat** (epoch ms).
   *
   * ⚠️ Sunucunun ISO damgası SAKLANMIYOR, bilerek. Tarayıcı saati sunucununkinden dakikalarca
   * sapabiliyor; mutlak bir sunucu damgasını `Date.now()` ile karşılaştırmak, saati ileri olan
   * makinede her istekte yenileme, geri olanda hiç yenileme yapmak demekti. Burada yalnız
   * sunucunun kendi içindeki FARK kullanılıyor (`accessExpiresAt − serverNow`) ve yanıtın
   * geldiği andaki yerel saate ekleniyor → saat sapması denklemden tamamen çıkıyor.
   *
   * ⚠️ İsteğe bağlı: 2026-08-03 öncesinde kaydedilmiş oturumlarda YOK. O durumda proaktif
   * yenileme devre dışı kalır ve eski 401 yolu çalışır — kimse çıkışa zorlanmaz.
   */
  refreshAt?: number;
}

/** Ömrün son %10'una girince yenile; en az 30 sn, en çok 10 dk önceden. */
function refreshDeadline(r: AuthResponse): number | undefined {
  const lifetimeMs = Date.parse(r.accessExpiresAt) - Date.parse(r.serverNow);
  if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) return undefined;
  const lead = Math.min(Math.max(lifetimeMs * 0.1, 30_000), 600_000);
  return Date.now() + (lifetimeMs - lead);
}

/** Sunucunun `/auth/*` yanıt gövdesi (bkz. `auth.controller.ts`). */
interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  player: { id: number; username: string; worldId: number };
  serverNow: string;
}

function toSession(r: AuthResponse): Session {
  return {
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
    playerId: r.player.id,
    worldId: r.player.worldId,
    username: r.player.username,
    refreshAt: refreshDeadline(r),
  };
}

const STORAGE_KEY = 'mw-session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null): void {
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
}

/** Cihaz kimliği — çoklu hesap sinyali (§9.1). Kalıcı; oturumla birlikte silinmez. */
function deviceId(): string {
  let id = localStorage.getItem('mw-device-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('mw-device-id', id);
  }
  return id;
}

/**
 * ⭐ ÖRNEK (INSTANCE) KİMLİĞİ — tek cihaz kuralının SEKME düzeyindeki ayracı.
 *
 * ⚠️ `sessionStorage`, `localStorage` DEĞİL — fark kuralın tamamı:
 *   • `localStorage` sekmeler arasında PAYLAŞILIR → iki sekme aynı kimliği taşır, ayırt
 *     edilemezler ve "aynı cihazda ikinci sekme" kuralı hiç çalışmaz.
 *   • `sessionStorage` sekme başına ayrı → yeni sekme yeni kimlik, sayfa yenileme aynı kimlik
 *     (istenen davranış: F5 seni kendi hesabından atmamalı).
 *
 * ⚠️ Bu kimlik `deviceId` ile karıştırılmamalı: o KALICI ve çoklu hesap analizi için, bu ise
 * geçici ve yalnız "hangi kopya" sorusunu yanıtlıyor. Sunucu ikisini de kimlik doğrulamada
 * kullanmaz.
 */
function instanceId(): string {
  let id = sessionStorage.getItem('mw-instance-id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('mw-instance-id', id);
  }
  return id;
}

export { instanceId };

/**
 * Saat dilimi + dil (§9.1.2'nin ⭐ tek yıldızlı, yani ZAYIF sinyali).
 *
 * ⚠️ Tek başına hiçbir şey söylemez — bir ülkedeki herkes aynı saat dilimindedir ve VPN onu
 * değiştirir. Değeri yalnız DİĞER sinyallerle birlikte: aynı cihazı paylaşan iki hesaptan
 * birinin saat dilimi tutmuyorsa "gerçekten iki farklı insan" ihtimali yükselir.
 *
 * ⚠️ Bir kez hesaplanıp saklanıyor: `resolvedOptions()` her istekte çağrılacak kadar ucuz
 * değil ve değer sekmenin ömrü boyunca değişmiyor. Eski tarayıcıda `timeZone` boş dönebilir,
 * o yüzden `?? ''` — boş başlık sunucuda `null`a düşüyor (`device-context.ts`).
 */
const clientHints: Record<string, string> = ((): Record<string, string> => {
  try {
    return {
      'x-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
      'x-locale': navigator.language ?? '',
    };
  } catch {
    return {};
  }
})();

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Sunucunun alan hatası kodu (`attack_limit`, `insufficient_resources`…). */
    readonly code: string | null,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

let session: Session | null = loadSession();
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(s: Session | null) => void>();

export function getSession(): Session | null {
  return session;
}

export function setSession(s: Session | null): void {
  session = s;
  saveSession(s);
  /**
   * ⚠️ Oturum bitince tek cihaz kapısı da kapanır. Kapanmasaydı çıkış yapan oyuncu giriş
   * ekranının ÜSTÜNDE asılı kalan bir modalla baş başa kalırdı ve modalın kendi yoklaması
   * kimliksiz istek atıp «Yetki başlığı yok» hatası yazardı (ölçümde birebir bu görüldü).
   */
  if (!s) setConflict(null);
  for (const fn of listeners) fn(s);
}

export function onSessionChange(fn: (s: Session | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * ⭐ SEKMELER ARASI SENKRON (2026-08-03).
 *
 * Yenileme jetonu tek kullanımlık: A sekmesi yenileyince B sekmesinin BELLEĞİNDEKİ jeton
 * iptal olmuş olur. B bunu bilmediği için ilk 401'inde o ölü jetonla yenilemeye kalkıyor,
 * sunucu reddediyor ve **B sekmesi kendiliğinden çıkış yapıyordu**. `localStorage` yazımı
 * zaten diğer sekmelere `storage` olayı olarak düşüyordu; kimse dinlemiyordu.
 *
 * ⚠️ `setSession` DEĞİL doğrudan alan ataması: `setSession` tekrar `localStorage`a yazar ve
 * sekmeler birbirini sonsuz tetikler.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = loadSession();
    if (next?.accessToken === session?.accessToken) return;
    session = next;
    for (const fn of listeners) fn(next);
  });
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/**
 * ⭐ Zod doğrulama hatasından okunabilir cümle çıkarır.
 *
 * Şema hataları gövdeye `flatten()` biçiminde iniyor:
 * `{ formErrors: [], fieldErrors: { username: ["Kullanıcı adı 3-15 karakter olmalı…"] } }`
 * — yani mesaj ORADA, ama `message` alanı olmadığı için eski kod onu hiç görmüyor ve
 * ekrana «İstek başarısız (400)» yazıyordu. Oyuncu neyi yanlış yazdığını öğrenemiyordu;
 * kayıt formunda tam olarak bu yaşandı (2026-08-02).
 *
 * Birden fazla alan hatalıysa hepsi tek satırda birleştirilir: form alan alan hata
 * göstermiyor, kullanıcının eksiği tek bakışta görünmeli.
 */
function zodMessage(b: Record<string, unknown>): string | null {
  const fieldErrors = b['fieldErrors'];
  const formErrors = b['formErrors'];
  const parts: string[] = [];

  if (fieldErrors && typeof fieldErrors === 'object') {
    for (const list of Object.values(fieldErrors as Record<string, unknown>)) {
      if (Array.isArray(list)) parts.push(...list.filter((m): m is string => typeof m === 'string'));
    }
  }
  if (Array.isArray(formErrors)) {
    parts.push(...formErrors.filter((m): m is string => typeof m === 'string'));
  }
  // Aynı kural birden çok alandan gelebilir (min/max/regex hepsi aynı cümleyi taşıyor).
  return parts.length > 0 ? [...new Set(parts)].join(' ') : null;
}

/** Sunucu hata gövdesinden okunabilir mesaj ve kod çıkarır. */
function errorOf(status: number, body: unknown): ApiError {
  const b = (body ?? {}) as Record<string, unknown>;
  const inner = (b['message'] ?? b) as Record<string, unknown>;
  const code = typeof inner === 'object' && inner ? (inner['code'] as string | undefined) : undefined;
  const message =
    (typeof inner === 'object' && inner && typeof inner['message'] === 'string' ? inner['message'] : null)
    ?? (typeof b['message'] === 'string' ? b['message'] : null)
    ?? zodMessage(b)
    // Nest bazı yollarda gövdeyi `{ message: {...} }` içine sarıyor; oraya da bak.
    ?? (typeof inner === 'object' && inner ? zodMessage(inner) : null)
    ?? `İstek başarısız (${status})`;
  return new ApiError(status, code ?? null, message, body);
}

/**
 * Başarısız bir yenilemeden sonraki kısa sessizlik. Proaktif yenileme her istekten önce
 * bakıyor; bu olmasaydı API kapalıyken saniyede onlarca yenileme denemesi giderdi.
 */
let refreshBlockedUntil = 0;

async function refresh(): Promise<boolean> {
  if (!session?.refreshToken) return false;
  if (Date.now() < refreshBlockedUntil) return false;
  // Uçuşta yenileme varsa ONU bekle — ikinci yenileme iptal edilmiş token'la oturumu düşürürdü.
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        /**
         * ⚠️ Cihaz künyesi BURADA da gönderiliyor. Yenileme, oyuncu bir kez giriş yaptıktan
         * sonra cihaz sinyalinin yazıldığı **en sık** yol (`auth.service` üçünde de
         * `devices.record` çağırıyor); künyeyi yalnız girişe koysaydık aylarca açık kalan bir
         * oturumun künyesi ilk günden kalma olurdu.
         */
        headers: {
          'content-type': 'application/json',
          'x-device-id': deviceId(),
          /**
           * ⚠️ Örnek kimliği de gönderiliyor (2026-08-12). Bugün etkisi YOK — `/auth/**`
           * tek cihaz kuralından muaf (`auth.guard.ts` `PRESENCE_EXEMPT`). Yine de
           * eklendi: başlığı atlayan bir istek sunucuda `s:<sessionId>`ye düşüyor ve
           * muafiyet listesi bir gün daraltılırsa yenileme, oyuncuyu **kendi sekmesinden
           * farklı bir örnek** gibi gösterip sahipliği kendi kendine çalardı. Asimetriyi
           * bulunduğu yerde kapatmak, o günü beklemekten ucuz.
           */
          'x-client-instance': instanceId(),
          'x-platform': 'web',
          ...clientHints,
        },
        body: JSON.stringify({ refreshToken: session!.refreshToken }),
      });
      /**
       * ⚠️ OTURUM YALNIZ **GERÇEK REDDE** DÜŞER (401/403). Eskiden her `!res.ok` oturumu
       * siliyordu — yani API yeniden başlarken gelen bir 502/503, oyuncuyu jetonu hâlâ
       * geçerliyken giriş ekranına atıyordu. Geçici arıza kimlik doğrulama kararı değildir.
       */
      if (res.status === 401 || res.status === 403) {
        setSession(null);
        return false;
      }
      if (!res.ok) {
        refreshBlockedUntil = Date.now() + 10_000;
        return false;
      }
      const body = (await parse(res)) as AuthResponse | null;
      if (!body?.accessToken || !body?.refreshToken) {
        setSession(null);
        return false;
      }
      setSession(toSession(body));
      return true;
    } catch {
      // Ağ hatası — jeton hakkında hiçbir şey söylemez, oturum korunur.
      refreshBlockedUntil = Date.now() + 10_000;
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Yukarı akış geçici olarak yokken gelen durumlar — bir kez sessizce tekrarlanır. */
const RETRY_STATUS = new Set([502, 503, 504]);

/**
 * ⭐ KISA DEVRE. API kapalıyken (dev'de her yeniden derleme, üretimde dağıtım) aynı anda
 * uçuşta olan yoklama isteklerinin HEPSİ ayrı ayrı hata alıyordu — beş uç, beş kırmızı satır.
 * Biri 503 görünce kısa bir süre diğerlerini bekletmek, o beşi **bire** indiriyor.
 *
 * ⚠️ Tarayıcı, durumu ne olursa olsun başarısız her isteği konsola kendisi yazar ve bu
 * JS'ten susturulamaz. Yani buradaki hedef hatayı gizlemek değil, aynı olayın beş kez
 * raporlanmasını engellemek.
 */
let apiDownUntil = 0;
const DOWN_PAUSE_MS = 800;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  body?: unknown;
  /** Yenileme denemesini kapatır (yenilemenin kendisi ve giriş için). */
  noRetry?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const send = async (): Promise<Response> =>
    fetch(path.startsWith('/') ? path : `/api/v1/${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        // ⚠️ `content-type` YALNIZ gövde varken gönderilir. Gövdesiz bir DELETE/POST'ta bu başlığı
        //    bırakmak Fastify'ı *"Body cannot be empty when content-type is set to
        //    'application/json'"* hatasına düşürüyordu (yapı yükseltme iptali böyle patlıyordu):
        //    başlık "gövde geliyor" diye söz verir, gövde gelmez, ayrıştırıcı 400 döner.
        ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
        'x-device-id': deviceId(),
        'x-client-instance': instanceId(),
        'x-platform': 'web',
        ...clientHints,
        ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    });

  /**
   * ⭐ ÖNCE yenile, SONRA gönder. Gerekçe dosyanın başında: 401 alıp düzeltmek doğru sonucu
   * verir ama tarayıcı konsolunu kırmızıya boyar ve bu susturulamaz.
   */
  if (!opts.noRetry && session?.refreshAt != null && Date.now() >= session.refreshAt) {
    await refresh();
  }

  // Başka bir istek az önce «API kapalı» gördüyse boşuna gidip ikinci bir hata üretme.
  const wait = apiDownUntil - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  let res = await send();

  if (res.status === 401 && !opts.noRetry && session) {
    // Emniyet ağı: sunucuda iptal, saat sapması, ya da `refreshAt` taşımayan eski oturum.
    if (await refresh()) res = await send();
  } else if (RETRY_STATUS.has(res.status)) {
    /**
     * ⚠️ API yeniden başlarken (dev'de her derlemede, üretimde dağıtımda) yukarı akış birkaç
     * saniye kapalı kalıyor. Vite proxy'si ve nginx bunu 502/503/504 olarak döndürüyor.
     * TEK bir sessiz tekrar o pencereyi kapatıyor; daha fazlası gerçek bir arızayı gizlerdi.
     */
    apiDownUntil = Date.now() + DOWN_PAUSE_MS;
    await new Promise((r) => setTimeout(r, DOWN_PAUSE_MS));
    res = await send();
    if (!RETRY_STATUS.has(res.status)) apiDownUntil = 0;   // ayağa kalktı, freni bırak
  }

  const body = await parse(res);

  /**
   * ⭐ TEK CİHAZ KURALI — hesap başka bir yerde açık (409 `session_conflict`).
   * Durum global tutuluyor ki `SessionConflictGate` hangi ekranda olursak olalım tam ekran
   * modalı açsın. Hata yine de fırlatılıyor: çağıran sorgu "başarısız" saymalı, boş veriyle
   * ekran çizmemeli.
   */
  if (res.status === 409) {
    /**
     * ⚠️ Gövde DÜZ: `{ code, message, holder }`. `message.code` diye aramak ilk yazımdaki
     * hataydı — modal açılıyordu ama sahibin platformu ve son hareketi hep boş kalıyordu,
     * yani metin "telefonunda açık" diyemiyordu. Nest'in bazı yolları gövdeyi `message`in
     * içine sarıyor (`errorOf` bu yüzden iki yere birden bakıyor), o yüzden ikisi de kontrol
     * ediliyor.
     */
    const b = (body ?? {}) as Record<string, unknown>;
    const flat = (b['code'] === 'session_conflict' ? b : b['message']) as
      { code?: string; holder?: ConflictHolder } | undefined;
    if (flat?.code === 'session_conflict') {
      setConflict({
        platform: flat.holder?.platform ?? null,
        seenAt: flat.holder?.seenAt ?? null,
        kind: 'blocked',
      });
    }
  }

  if (!res.ok) throw errorOf(res.status, body);
  return body as T;
}

interface ConflictHolder { platform?: string | null; seenAt?: string | null }

/**
 * ⭐ Giriş KULLANICI ADIYLA (kullanıcı kararı): oyuncunun ezberlediği ad e-posta değil.
 *
 * ⚠️ `worldId` **zorunlu** (2026-08-03). Önceden `= 1` varsayılanıydı ve `AuthModal` onu hiç
 * geçmiyordu — yani "dünya başına tekil kullanıcı adı" kuralı vardı ama dünyayı kimse
 * seçmiyordu. Varsayılanı kaldırmak, ikinci dünya açıldığı gün herkesi sessizce birinci
 * dünyaya yönlendiren hatayı derleme zamanında yakalar.
 */
export async function login(username: string, password: string, worldId: number): Promise<Session> {
  const r = await api<AuthResponse>('/api/v1/auth/login', {
    method: 'POST', body: { username, password, worldId }, noRetry: true,
  });
  const s = toSession(r);
  setSession(s);
  return s;
}

export async function register(
  email: string, password: string, username: string, worldId: number,
): Promise<Session> {
  const r = await api<AuthResponse>('/api/v1/auth/register', {
    method: 'POST', body: { email, password, username, worldId }, noRetry: true,
  });
  const s = toSession(r);
  setSession(s);
  return s;
}

export async function logout(): Promise<void> {
  try {
    // Uç AuthGuard'lı: gövde değil access token'la çalışır, oturumu sunucuda iptal eder.
    await api('/api/v1/auth/logout', { method: 'POST', body: {} });
  } catch {
    // Sunucuya ulaşılamasa bile yerel oturum düşer — kullanıcı "çıktım" der, çıkmış olur.
  } finally {
    setSession(null);
  }
}
