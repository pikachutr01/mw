/**
 * Panelin API istemcisi.
 *
 * ⚠️ `apps/web/src/lib/api.ts`'in KOPYASI DEĞİL, sadeleştirilmiş kardeşi. Oyun istemcisi
 * proaktif yenileme, sekmeler arası senkron, cihaz kimliği ve 5xx tekrarı gibi işleri de
 * taşıyor; panelin hiçbirine ihtiyacı yok — **tek uçuş yenileme** ortak olan tek parça ve o da
 * mecburen (yenileme jetonu tek kullanımlık). Ortak sözleşme `@mobilwar/contracts`'ta.
 *
 * ⚠️ Panel oturumu oyun oturumundan **ayrı anahtarda** (`mw-admin-session`) tutulur. Aynı
 * anahtarı paylaşsalardı panelden çıkış oyundan da atardı — ve daha kötüsü, oyun sekmesindeki
 * bir yenileme panelin token'ını sessizce döndürürdü.
 */
export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  username: string;
  worldId: number;
}

const STORAGE_KEY = 'mw-admin-session';

let session: AdminSession | null = load();
const listeners = new Set<(s: AdminSession | null) => void>();

function load(): AdminSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch {
    return null;
  }
}

export const getSession = (): AdminSession | null => session;

export function setSession(s: AdminSession | null): void {
  session = s;
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
  for (const fn of listeners) fn(s);
}

export function onSessionChange(fn: (s: AdminSession | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export class AdminApiError extends Error {
  constructor(readonly status: number, readonly code: string | null, message: string) {
    super(message);
  }
}

/** ⭐ Sunucunun "parolanı yeniden gir" kodu — panel bunu görünce yükseltme diyaloğunu açar. */
export const STEP_UP_CODE = 'step_up_required';

interface Options {
  method?: string;
  body?: unknown;
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
 * ⭐ 401'DE SESSİZ YENİLEME (2026-08-03). Eskiden yoktu ve gerekçesi *"panelde 401 oturumun
 * düştü demektir"* diye yazılıydı — ama pratikte 401'in sebebi oturumun düşmesi değil, access
 * jetonunun 15 dakikada dolmasıydı. Panel bir ayarı kaydedip çay içmeye gidince dönüşte giriş
 * ekranı buluyordu (kullanıcı: *"bu kadar kısa sürede oturumun düşmesi benim sinirimi bozuyor"*).
 *
 * Yenileme jetonu tek kullanımlık olduğu için oyundaki **tek uçuş** kuralı burada da şart:
 * iki eşzamanlı 401 iki yenileme başlatırsa ikincisi iptal edilmiş jetonu kullanır ve oturumu
 * gerçekten düşürür. Depolama anahtarı ayrı kalıyor (dosya başındaki gerekçe).
 */
let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  if (!session?.refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: session!.refreshToken }),
      });
      if (!res.ok) {
        // Yalnız gerçek redde oturum düşer; 502/503 API'nin yeniden başlaması olabilir.
        if (res.status === 401 || res.status === 403) setSession(null);
        return false;
      }
      const b = (await parse(res)) as { accessToken?: string; refreshToken?: string } | null;
      if (!b?.accessToken || !b?.refreshToken) { setSession(null); return false; }
      setSession({ ...session!, accessToken: b.accessToken, refreshToken: b.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const send = (): Promise<Response> => fetch(path, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
    },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });

  let res = await send();
  // ⚠️ Giriş isteğinin kendisi 401 alırsa yenileme denenmez — ortada oturum yok.
  if (res.status === 401 && session && !path.endsWith('/auth/login')) {
    if (await refresh()) res = await send();
  }

  const body = await parse(res);
  if (res.ok) return body as T;

  if (res.status === 401) setSession(null);

  const b = (body ?? {}) as Record<string, unknown>;
  const inner = (b['message'] ?? b) as Record<string, unknown>;
  const code = typeof inner === 'object' && inner ? (inner['code'] as string | null) ?? null : null;
  const message = (typeof inner === 'object' && inner && typeof inner['message'] === 'string'
    ? inner['message']
    : null) ?? (typeof b['message'] === 'string' ? b['message'] : null) ?? `Hata ${res.status}`;
  throw new AdminApiError(res.status, code, message);
}

/**
 * Panel girişi — oyunun `/auth/login` ucunu kullanır; yetki kontrolü `/admin/me`de.
 *
 * ⚠️ Alan **`username`**, `email` DEĞİL. İlk sürümde forma e-posta koymuştum ve uç 400
 * döndürüyordu: `loginRequest` (`packages/contracts/src/auth.ts`) `username` bekliyor ve
 * üstelik uzunluk sınırı var — bir e-posta adresi doğrulamayı iki ayrı sebeple geçemiyordu.
 * (Sınır 2026-08-01'de 10'dan **15**'e çıktı; formdaki değer artık `USERNAME_MAX`ten geliyor,
 * elle yazılmıyor.)
 * Oyunun kimlik alanı kullanıcı adıdır; e-posta yalnız doğrulama ve şifre sıfırlama için var.
 */
export async function login(o: {
  username: string; password: string; worldId: number;
}): Promise<AdminSession> {
  const r = await api<{
    accessToken: string; refreshToken: string;
    player: { username: string; worldId: number };
  }>('/api/v1/auth/login', { method: 'POST', body: o });
  const s: AdminSession = {
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
    username: r.player.username,
    worldId: r.player.worldId,
  };
  setSession(s);
  return s;
}
