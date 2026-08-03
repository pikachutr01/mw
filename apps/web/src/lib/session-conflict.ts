/**
 * ⭐ TEK CİHAZ KURALI — istemci durumu (kullanıcı, 2026-08-03).
 *
 * *"Bir hesabın aynı anda sadece bir cihazda açık olabilmesi… İkinci bir cihazda bir hesap
 * açılırsa oynamasını engelleyelim, tam ekran modal gösterilebilir."*
 *
 * Çakışma İKİ yoldan öğreniliyor ve ikisi de gerekli:
 *   • **HTTP 409 `session_conflict`** — ikinci sekme/cihaz açıldığında ilk istek bunu alır.
 *   • **`session:takeover` soket olayı** — devralınan ESKİ cihaza gelir; onun istekleri
 *     zaten geçmişti, olay olmasa ekranı donmuş gibi kalırdı.
 *
 * ⚠️ Durum React dışında (`useSyncExternalStore` ile okunuyor): çakışmayı ilk fark eden yer
 * `api.ts` — yani bir React bileşeni değil. Durumu context'e koysaydık `api.ts`in bir
 * bileşene ulaşması gerekirdi ve o bağımlılık yönü tersti.
 */
import { useSyncExternalStore } from 'react';

export interface ConflictInfo {
  /** Sahibin platformu (`web` | `android` | `ios`) — bilinmiyorsa `null`. */
  platform: string | null;
  /** Sahibin son ses verdiği an (ISO) — modalda "2 dk önce" diye gösteriliyor. */
  seenAt: string | null;
  /** `takeover` → bizi düşürdüler; `blocked` → biz giremedik. Metin buna göre değişiyor. */
  kind: 'takeover' | 'blocked';
}

let current: ConflictInfo | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function setConflict(info: ConflictInfo | null): void {
  // Aynı durumu tekrar yazmak gereksiz render tetikler; çakışma her istekte 409 alabilir.
  if (current?.kind === info?.kind && current?.seenAt === info?.seenAt) return;
  current = info;
  emit();
}

export function getConflict(): ConflictInfo | null {
  return current;
}

export function useSessionConflict(): ConflictInfo | null {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    getConflict,
    () => null,
  );
}
