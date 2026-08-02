/**
 * API istemcisi.
 *
 * ⭐ **Refresh TEK KULLANIMLIK ve DÖNDÜRMELİ** (sunucu kuralı): her yenilemede yeni bir refresh
 * gelir ve eskisi iptal olur. Bu yüzden iki eşzamanlı 401 iki ayrı yenileme başlatırsa **ikincisi
 * iptal edilmiş token'ı kullanır ve oturumu düşürür**. Çözüm: uçuşta tek yenileme sözü tutulur
 * (`refreshing`), diğer istekler onu bekler.
 */
export interface Session {
  accessToken: string;
  refreshToken: string;
  playerId: number;
  worldId: number;
  username: string;
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
  for (const fn of listeners) fn(s);
}

export function onSessionChange(fn: (s: Session | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
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

async function refresh(): Promise<boolean> {
  if (!session?.refreshToken) return false;
  // Uçuşta yenileme varsa ONU bekle — ikinci yenileme iptal edilmiş token'la oturumu düşürürdü.
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-device-id': deviceId() },
        body: JSON.stringify({ refreshToken: session!.refreshToken }),
      });
      if (!res.ok) {
        setSession(null);
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
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

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
        'x-platform': 'web',
        ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    });

  let res = await send();
  if (res.status === 401 && !opts.noRetry && session) {
    if (await refresh()) res = await send();
  }

  const body = await parse(res);
  if (!res.ok) throw errorOf(res.status, body);
  return body as T;
}

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
