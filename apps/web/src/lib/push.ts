/**
 * ⭐ WEB PUSH ABONELİĞİ — tarayıcı tarafı (§7.2).
 *
 * ⚠️ **İZİN ASLA KENDİLİĞİNDEN İSTENMEZ.** Sayfa açılışında `Notification.requestPermission()`
 * çağırmak iki şeyi birden bozar: Chrome/Firefox bunu kötüye kullanım sayıp sonraki istekleri
 * bastırıyor, ve oyuncu ne olduğunu anlamadan "Engelle" derse karar KALICI olur (uygulamadan
 * geri alınamaz, tarayıcı ayarlarından silinmesi gerekir). Bu yüzden izin yalnız oyuncunun
 * açıkça bastığı bir düğmeden istenir.
 *
 * ⚠️ Push **güvenli bağlam** ister: HTTPS ya da `localhost`. Geliştirmede `localhost:5173`
 * sorunsuz çalışır.
 *
 * ⚠️ iOS/Safari'de push YALNIZ site "Ana Ekrana Ekle" ile kurulduktan sonra çalışır
 * (`navigator.standalone`). Kurulmamış Safari'de `PushManager` hiç tanımlı değildir ve burası
 * `unsupported` döner — kullanıcıya yanlış bir söz verilmez.
 */
import { api } from './api.ts';

export type PushState =
  | 'unsupported'   // tarayıcı desteklemiyor (ya da güvensiz bağlam / kurulmamış iOS Safari)
  | 'disabled'      // sunucuda VAPID anahtarı yok → push kapalı
  | 'denied'        // oyuncu izni reddetmiş (yalnız tarayıcı ayarlarından geri alınır)
  | 'default'       // henüz sorulmamış
  | 'subscribed';   // izin verildi ve abonelik sunucuda kayıtlı

export interface PushStatus {
  state: PushState;
  /** Sunucuda kategori tercihleri. */
  prefs: Record<string, boolean>;
}

const supported = (): boolean =>
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window;

/** VAPID açık anahtarı base64url → tarayıcının beklediği `Uint8Array`. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Service worker kaydını garanti eder.
 *
 * ⚠️ `main.tsx` SW'yi yalnız ÜRETİMDE kaydediyor (dev'de HMR ile çakışma geçmişi var). Push
 * için SW şart olduğundan burada **talep üzerine** kaydediliyor: geliştirmede de bildirim
 * denenebilir ama SW yalnız oyuncu bildirimi açtığında devreye girer, varsayılan dev akışı
 * bozulmaz. `register` idempotent — zaten kayıtlıysa var olanı döner.
 */
async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export async function getPushStatus(): Promise<PushStatus> {
  /* Sunucuya ulaşılamadığında da anahtarlar makul görünsün — varsayılanlar sunucuyla aynı
     (`notify.limits.ts` `NOTIFY_DEFAULTS`). ⚠️ `mention` 2026-08-07'ye kadar burada EKSİKTİ:
     sunucuda eklenmiş ama bu yedek güncellenmemişti. Sonucu görünmezdi (panel `!== false`
     baktığı için `undefined` yine işaretli çiziliyordu), yine de iki listenin ayrışması
     yorumu yalana çevirmişti. */
  const empty: Record<string, boolean> = {
    attack: true, dm: true, report: true, production: true, mention: true,
  };
  if (!supported()) return { state: 'unsupported', prefs: empty };

  let prefs = empty;
  let enabled = false;
  try {
    const res = await api<{ prefs: Record<string, boolean>; enabled: boolean }>('/api/v1/push/prefs');
    prefs = res.prefs;
    enabled = res.enabled;
  } catch {
    return { state: 'disabled', prefs: empty };
  }
  if (!enabled) return { state: 'disabled', prefs };
  if (Notification.permission === 'denied') return { state: 'denied', prefs };
  if (Notification.permission !== 'granted') return { state: 'default', prefs };

  // İzin verilmiş ama abonelik düşmüş olabilir (tarayıcı temizliği, anahtar değişimi).
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return { state: sub ? 'subscribed' : 'default', prefs };
}

/** Oyuncunun açık isteğiyle çağrılır. İzin verilmezse `false` döner, hata atmaz. */
export async function subscribeToPush(): Promise<boolean> {
  if (!supported()) return false;

  const { publicKey } = await api<{ publicKey: string | null }>('/api/v1/push/vapid-key');
  if (!publicKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await registration();
  /*
   * Var olan abonelik BAŞKA bir VAPID anahtarına aitse (anahtar döndüyse) yeniden abone olmak
   * `InvalidStateError` atar → önce eskisini bırakmak gerekir. Bu, anahtar rotasyonundan sonra
   * "izin verili ama bildirim gelmiyor" hâlinin tek sebebidir.
   */
  const current = await reg.pushManager.getSubscription();
  if (current) await current.unsubscribe().catch(() => undefined);

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  await api('/api/v1/push/subscriptions', { method: 'POST', body: sub.toJSON() });
  return true;
}

/** Aboneliği hem tarayıcıdan hem sunucudan siler. İzin geri alınmaz (o tarayıcının işi). */
export async function unsubscribeFromPush(): Promise<void> {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api('/api/v1/push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } });
  await sub.unsubscribe().catch(() => undefined);
}

export async function setPushPrefs(
  patch: Record<string, boolean>,
): Promise<Record<string, boolean>> {
  const res = await api<{ prefs: Record<string, boolean> }>('/api/v1/push/prefs', {
    method: 'PATCH', body: patch,
  });
  return res.prefs;
}
