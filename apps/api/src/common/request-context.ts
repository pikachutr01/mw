/**
 * ⭐⭐ İSTEK BAĞLAMI (Faz 3) — `traceId`'nin çağrı yığınından geçmeden taşınması.
 *
 * ⚠️ Var olma sebebi ölçüldü: `http-exception.filter.ts` her 5xx'te bir `traceId` ÜRETİYOR ama
 * o kimlik hiçbir yere yazılmıyordu. Oyuncu ekran görüntüsüyle *"12:37'de hata aldım"* dediğinde
 * log dosyasındaki 500 satırı bulunabiliyor, ama o isteğin veritabanında NE YAPTIĞI (hangi
 * `audit_log` satırlarını yazdığı) bulunamıyordu. İki kayıt arasında bağ yoktu.
 *
 * ⚠️ **`AsyncLocalStorage`, parametre geçirmek yerine.** Alternatif, `traceId`'yi controller'dan
 * servise, servisten depoya elden ele taşımaktı: 21 `audit_log` yazım noktasının ve aralarındaki
 * her imzanın değişmesi demek. Birini unutmak sessiz bir boşluk üretirdi ve unutulduğu ancak
 * gerçek bir arızada, ihtiyaç duyulduğu anda anlaşılırdı.
 *
 * ⚠️ Node'un `AsyncLocalStorage`ı `await` sınırları boyunca korunur; Fastify'ın `onRequest`
 * kancasında açılan bağlam, o isteğin tüm zincirinde görünür. Worker döngüsünde bağlam YOKTUR
 * ve olmamalı — orada iz kimliği görevin kendisidir (`mission:<id>`), istek değil.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  /** İsteği tanımlayan kısa kimlik. Ters vekilden gelmişse o, yoksa üretilir. */
  traceId: string;
  method?: string;
  url?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * İz kimliğini üretir ya da ters vekilden devralır.
 *
 * ⭐ `x-request-id` DEVRALINIYOR: nginx ve Cloudflare bu başlığı zaten üretiyor. Kendi
 * kimliğimizi dayatsaydık, oyuncunun tarayıcı ağ sekmesinde gördüğü kimlik ile bizim
 * loglarımızdaki kimlik farklı olurdu — yani izleme zinciri tam da dışarıya bakan uçta kopardı.
 */
export function newTraceId(headerValue?: unknown): string {
  const raw = typeof headerValue === 'string' ? headerValue.trim() : '';
  // ⚠️ Dışarıdan gelen değer BUDANIYOR ve süzülüyor: log satırına ve `audit_log`a yazılıyor,
  // yani sınırsız/serbest içerik kabul etmek bir enjeksiyon yüzeyidir.
  if (raw !== '' && /^[\w.:-]{1,64}$/.test(raw)) return raw;
  return randomUUID().slice(0, 8);
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/** İstek dışında (worker döngüsü, açılış) `null` döner — çağıran bunu beklemeli. */
export function currentTraceId(): string | null {
  return storage.getStore()?.traceId ?? null;
}
