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

/**
 * ⭐⭐ ÇAKIŞMA SAYACI — "bu cevap, elimdeki çakışmadan ÖNCE mi yola çıktı?" sorusunun cevabı.
 *
 * ⚠️ `api.ts` artık sahiplik kuralına tabi bir ucun 200'ünü görünce kapıyı kendiliğinden
 * kapatıyor. Bu, uçuştaki bir istekle `session:takeover` olayının **çaprazlaşabileceği**
 * anlamına geliyor: istek guard'dan geçtikten sonra, cevabı bize dönerken devralınmış
 * olabiliriz. Cevabın 200 olması o ANDA sahip olduğumuzu kanıtlar, ŞU AN sahip olduğumuzu
 * değil. Sayaç olmadan kapı bir an kapanıp bir sonraki 409'da yeniden açılırdı — kısa ama
 * gerçek bir titreme.
 *
 * Sayaç her `setConflict` çağrısında artıyor; çağıran isteği yollamadan önce sayacı okuyor ve
 * cevabı gelince değişip değişmediğine bakıyor. Zaman damgası DEĞİL: aynı milisaniyede iki
 * olay olabilir ve saat geriye de gidebilir.
 */
let epoch = 0;

export const conflictEpoch = (): number => epoch;

function emit(): void {
  for (const fn of listeners) fn();
}

export function setConflict(info: ConflictInfo | null): void {
  // Aynı durumu tekrar yazmak gereksiz render tetikler; çakışma her istekte 409 alabilir.
  if (current?.kind === info?.kind && current?.seenAt === info?.seenAt) return;
  current = info;
  epoch += 1;
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
