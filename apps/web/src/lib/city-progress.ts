/**
 * ⭐ ŞEHİR EKRANININ İSTEMCİDE TÜRETİLEN İKİ SAYACI — üretim bandı ve kaynak sayacı.
 *
 * ⚠️ İkisi de **ekranlardan çıkarıldı** (2026-08-15): `unitProgress` `City.tsx`ten,
 * `extrapolateResources` `Shell.tsx`ten. Sebep mobil: Flutter aynı hesabı yapmak zorunda ve
 * bir JSX bileşeninin içine gömülü bir fonksiyon ne paylaşılabiliyor ne test edilebiliyor.
 * ⭐ Çıkarma ayrıca ikisini de ilk kez test edilebilir yaptı — bugüne kadar bu hesapların
 * hiç testi yoktu, oysa ikisi de **canlıda hata üretmişti** (aşağıda).
 *
 * ⭐⭐ Davranış `packages/contracts/fixtures/city-progress-vectors.json` ile kilitli; Dart
 * karşılığı (`apps/mobile/lib/core/city_progress.dart`) **aynı dosyayı** okuyor. İki istemcinin
 * bu sayaçlarda ayrışması, aynı şehri iki cihazdan açan oyuncuya iki farklı asker sayısı
 * göstermek olurdu.
 *
 * ⚠️⚠️ İkisinin de ÇIPASI önemli ve **birbirinden farklı**; çağıranların dikkat etmesi gereken
 * asıl şey bu (her fonksiyonun başında yazılı).
 */

/** `queries.ts` · `QueueRow`un bu hesaba giren alanları — tamamı gerekmiyor. */
export interface ProgressInput {
  startedAt: string;
  count: number | null;
  perUnitSeconds?: number | null;
}

export interface UnitProgress {
  /** Şimdiye kadar üretilmiş adet. */
  produced: number;
  /** Kalan sipariş. */
  remaining: number;
  /** Sıradaki tek askerin penceresi (ms). */
  unitStart: number;
  unitEnd: number;
  /** Siparişin tamamı bitti (sunucudaki bitiş görevi birazdan satırı kapatacak). */
  finished: boolean;
}

/**
 * ⭐ ÜRETİM BANDININ İSTEMCİDE TÜRETİLMESİ (2026-07-28, kullanıcının bildirdiği hata)
 *
 * **Hata neydi:** bir askerin üretimi bitince çubuk %100'de donuyor, geri sayım "birazdan"da
 * kalıyor ve **bir sonraki sunucu okumasına kadar** yenilenmiyordu. Yoklama 5 sn'den 60 sn'ye
 * indirildiği için bu kusur bir anlık takılmadan **bir dakikalık donmaya** dönüştü.
 *
 * **Neden WS ile çözülmedi:** üretim **tembeldir** (tick YOK). Sunucu bir askerin üretildiğini
 * ancak şehir okunduğunda "fark eder"; asker başına olay yayınlayabilmesi için her aktif kuyruğa
 * bir zamanlayıcı koymak, yani mimarinin temel kararını geri almak gerekirdi.
 *
 * **Neden asker başına fetch de değil:** 9 sn'lik Cüce siparişinde dakikada ~7 istek, yüksek
 * Baraka'da 1 sn'lik birimde **dakikada 60 istek** ederdi.
 *
 * **Çözüm — sıfır maliyet:** bant **tamamen deterministik**. `startedAt` ve `perUnitSeconds`
 * biliniyorsa k'ıncı asker `startedAt + k × perUnit` anında biter. İstemci sunucunun kullandığı
 * FORMÜLÜN AYNISINI çalıştırıyor; hiçbir istek atmadan, saniyesi saniyesine.
 *
 * ⚠️ `q.done`/`q.remaining` **kullanılmıyor**: onlar sunucunun son okuma anındaki hâli, yani
 * tanımı gereği bayat. Çıpa `startedAt` — o hiç bayatlamaz.
 *
 * ⚠️⚠️ **ÇIPA `gameNow()` OLMAK ZORUNDA.** Burada bir ara `serverNow()` kullanıldı ve canlıda
 * görünen bir hataydı: `startedAt` oyun saatinde tutuluyor, üretilen adet `(now − start) /
 * perUnit` ile sayılıyor. Gerçek saatle okununca her sayaç dünyanın toplam duraklama süresi
 * kadar ileri gidiyordu (canlıda ~196 sn) → `perUnitSeconds` bundan küçük olan birimlerde bant
 * **kalıcı olarak "sipariş tamamlandı"** gösteriyordu.
 */
export function unitProgress(q: ProgressInput, now: number): UnitProgress | null {
  const perMs = (q.perUnitSeconds ?? 0) * 1000;
  const count = q.count ?? 0;
  if (perMs <= 0 || count <= 0) return null;
  const start = Date.parse(q.startedAt);
  if (!Number.isFinite(start)) return null;
  const produced = Math.min(count, Math.max(0, Math.floor((now - start) / perMs)));
  const unitStart = start + produced * perMs;
  return {
    produced,
    remaining: count - produced,
    unitStart,
    unitEnd: unitStart + perMs,
    finished: produced >= count,
  };
}

export interface ResourceInput {
  gold: number;
  food: number;
  goldPerHour: number;
  foodPerHour: number;
  /** Sunucunun bu değerleri okuduğu an (yanıttaki `serverNow`). */
  serverNow: string;
}

/**
 * ⭐ KAYNAK SAYACI — yoklamayla değil, üretim hızıyla **ekstrapolasyonla** akar.
 *
 * Sunucu kaynağı tembel biriktiriyor (§3, tick YOK); istemci aradaki saniyeleri saniyede bir
 * çiziyor. Otorite yine sunucu: çıpa WS olaylarında ve emniyet ağı yoklamasında tazeleniyor.
 *
 * ⚠️ Tatil modunda sunucu `goldPerHour`/`foodPerHour` alanlarını **0** döndürüyor, yani sayaç
 * kendiliğinden duruyor — burada ayrıca bir tatil kontrolü YOK ve olmamalı.
 *
 * ⚠️⚠️ **ÇIPA `serverNow()`** — `unitProgress`in TERSİ, ve bu ayrım bilinçli olarak korunuyor:
 * `serverNow` alanı yanıtın gerçek okunma anı, `startedAt` gibi oyun saatinde bir damga değil.
 *
 * ⚠️ Bilinen küçük tutarsızlık: dünya BAKIMDA iken oyun saati donuyor ama bu sayaç gerçek
 * saatle akmaya devam ediyor, sonraki okumada geri sıçrıyor. Web'de de aynen böyle davranıyor
 * ve **bilerek aynı bırakıldı** — iki istemcinin ayrışması, tek bir ekranın bakım sırasında
 * birkaç dakika şişkin görünmesinden daha pahalı. Düzeltilecekse İKİ tarafta birden.
 *
 * ⚠️ `Math.max(0, …)`: cihaz saati sunucunun gerisindeyse geçen süre negatif çıkar ve sayaç
 * **geriye** akardı.
 */
export function extrapolateResources(
  r: ResourceInput,
  now: number,
): { gold: number; food: number } {
  const anchor = Date.parse(r.serverNow);
  const elapsedH = Number.isFinite(anchor) ? Math.max(0, (now - anchor) / 3_600_000) : 0;
  return {
    gold: r.gold + r.goldPerHour * elapsedH,
    food: r.food + r.foodPerHour * elapsedH,
  };
}
