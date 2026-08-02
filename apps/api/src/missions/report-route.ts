/**
 * ⭐ RAPOR GÜZERGÂHI — her rapora "hangi şehirden hangi şehre" bilgisini ekler.
 *
 * Kullanıcı 2026-08-02'de saldırı, casusluk, nakliye ve destek raporlarının HEPSİNDE kaynak
 * ve hedef koordinatının görünmesini ve **tıklanınca Dünya'da açılmasını** istedi. Savaş
 * raporunda bu bilgi zaten vardı (`battles` kaydından geliyor); diğer raporlarda hiç yoktu.
 *
 * ⚠️ Rapor gövdesine YAZILIYOR, istekte hesaplanmıyor: mesaj kalıcı bir kayıt ve şehir sonradan
 * terk edilebilir, adı değişebilir, sahibi değişebilir. Raporun anlattığı olay ise o ANA aitti —
 * koordinatı olayla birlikte dondurmak tek doğru davranış.
 *
 * ⚠️ Tek sorgu, iki şehir. Rapor yazımı seyrek bir iş (görev başına birkaç satır), bu yüzden
 * ek sorgu ölçülebilir bir maliyet değil; buna karşılık kapsamı TÜM rapor tiplerini kapsıyor
 * çünkü `writeMessage`'ın içinden çağrılıyor — handler'lara tek tek eklenseydi biri kaçınılmaz
 * olarak unutulurdu (nakliyenin gönderen kopyası tam da böyle bir yerdi).
 */
import { sql } from 'drizzle-orm';
import type { HandlerContext } from './handler-registry.ts';

export interface Coord { k: number; d: number; s: number }
export interface ReportRoute { origin: Coord | null; target: Coord | null }

/**
 * `ctx.mission`in kaynak ve hedef şehir koordinatlarını okur.
 *
 * Hedefi olmayan görevler (boş koordinata şehir kurma) için `target` null döner — çağıran
 * tarafta bu normal, gösterim degrade eder.
 */
export async function routeOf(ctx: HandlerContext): Promise<ReportRoute | null> {
  const originId = ctx.mission.originCityId;
  const targetId = ctx.mission.targetCityId;

  // ⚠️ Sayıya çevrilmiş id'ler doğrudan gömülüyor: `IN` listesi parametrelenemiyor ve
  // ikisi de `bigint` kolonundan geldiği için dize enjeksiyonu mümkün değil.
  const ids = [originId, targetId].filter((x): x is number => typeof x === 'number');
  if (ids.length === 0) return null;

  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT id, k, d, s FROM cities WHERE id IN ${sql.raw(`(${ids.map(Number).join(',')})`)}
  `);

  const byId = new Map<number, Coord>();
  for (const r of rows) {
    byId.set(Number(r['id']), { k: Number(r['k']), d: Number(r['d']), s: Number(r['s']) });
  }

  /**
   * ⚠️ Hedefi şehir OLMAYAN görevlerde (boş koordinata şehir kurma) `target` null kalır —
   * `MissionRow` hedef koordinatı taşımıyor, yalnız şehir kimliklerini taşıyor. Gösterim
   * bunu degrade ediyor: tek yön yazılır.
   */
  const origin = originId != null ? (byId.get(originId) ?? null) : null;
  const target = targetId != null ? (byId.get(targetId) ?? null) : null;
  if (!origin && !target) return null;
  return { origin, target };
}
