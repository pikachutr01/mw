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

/**
 * ⭐ `name` — koordinatın YANINDA şehir adı (kullanıcı, 2026-08-04).
 *
 * ⚠️ Dondurmanın gerekçesi burada koordinattan **daha güçlü**: koordinat zaten hiç değişmez,
 * ad ise oyuncu tarafından her an değiştirilebilir. Kullanıcının cümlesi de bunu söylüyor —
 * *"o andaki şehir adı"*. Okuma anında `cities`ten çekseydik, üç ay önceki bir saldırı raporu
 * bugünkü adı gösterir ve oyuncunun hafızasıyla çelişirdi.
 *
 * ⚠️ Eski raporlarda bu alan YOK (`undefined`) — gösterim yalnız koordinatı yazar. Geriye
 * dönük doldurmak zaten imkânsız: o anki adı hiçbir yerde saklamıyorduk.
 */
/**
 * ⭐ `owner` — koordinatın yanında **oyuncunun kullanıcı adı** (kullanıcı, 2026-08-07).
 *
 * Ekranda artık şehir adı değil bu yazıyor. Gerekçe kullanıcının: raporu okuyan kişi
 * "hangi şehir" değil **"kim"** sorusunun cevabını arıyor; şehir adları da kolayca
 * değiştirilebildiği için kimliği taşımıyorlar.
 *
 * ⚠️ `name` alanı KALDIRILMADI: eski raporlarda yalnız o var ve ekran `owner` yoksa ona
 * düşüyor. Silmek, bugüne kadar yazılmış her raporun güzergâhını adsız bırakırdı.
 * ⚠️ İkisi de olayın anına DONMUŞ (dosya başındaki gerekçe): kullanıcı adı da değiştirilebilir
 * ve okuma anında çözülseydi üç ay önceki bir rapor bugünkü adı gösterirdi.
 */
export interface Coord { k: number; d: number; s: number; name?: string; owner?: string }
export interface ReportRoute { origin: Coord | null; target: Coord | null }

/**
 * `ctx.mission`in kaynak ve hedef şehrinin koordinatını ve adını okur.
 *
 * ⭐ Hedefin ŞEHRİ olmayan görevlerde (boş koordinata şehir kurma) koordinat **görev
 * satırından** okunur ve `name`siz döner: orası kimseye ait olmadığı için yazılacak bir ad
 * yok, ama koordinat yazılabilir ve yazılmalı.
 *
 * ⚠️ Eskiden bu durumda `target` komple `null` dönüyordu ve şehir kurma raporunda güzergâh
 * *"1:2:1 Çığlıktepe → —"* diye görünüyordu: oyuncu şehri NEREYE kurduğunu güzergâh
 * satırından okuyamıyordu.
 */
export async function routeOf(ctx: HandlerContext): Promise<ReportRoute | null> {
  const originId = ctx.mission.originCityId;
  const targetId = ctx.mission.targetCityId;

  /**
   * Hedef bir şehir değilse koordinatı görev satırından al. `MissionRow` bu kolonları
   * taşımıyor (yalnız şehir kimliklerini taşıyor), o yüzden ayrı okunuyor — yalnız hedef
   * şehri OLMAYAN görevlerde çalışan, görev başına tek satırlık bir sorgu.
   */
  let coordTarget: Coord | null = null;
  if (targetId == null) {
    const [row] = await ctx.tx.execute<Record<string, unknown>>(sql`
      SELECT target_k, target_d, target_s FROM missions WHERE id = ${ctx.mission.id}
    `);
    if (row && row['target_k'] != null) {
      coordTarget = {
        k: Number(row['target_k']), d: Number(row['target_d']), s: Number(row['target_s']),
      };
    }
  }

  // ⚠️ Sayıya çevrilmiş id'ler doğrudan gömülüyor: `IN` listesi parametrelenemiyor ve
  // ikisi de `bigint` kolonundan geldiği için dize enjeksiyonu mümkün değil.
  const ids = [originId, targetId].filter((x): x is number => typeof x === 'number');
  if (ids.length === 0) return coordTarget ? { origin: null, target: coordTarget } : null;

  // ⚠️ `players` JOIN'i yalnız kullanıcı adı için — şehrin sahibi olmayan bir satır yok
  //    (`cities.player_id` NOT NULL), o yüzden INNER JOIN güvenli.
  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT c.id, c.k, c.d, c.s, c.name, p.username
      FROM cities c JOIN players p ON p.id = c.player_id
     WHERE c.id IN ${sql.raw(`(${ids.map(Number).join(',')})`)}
  `);

  const byId = new Map<number, Coord>();
  for (const r of rows) {
    byId.set(Number(r['id']), {
      k: Number(r['k']), d: Number(r['d']), s: Number(r['s']),
      name: String(r['name']), owner: String(r['username']),
    });
  }

  const origin = originId != null ? (byId.get(originId) ?? null) : null;
  /** Şehir varsa adıyla, yoksa (boş koordinat) yukarıda görev satırından okunan adsız koordinat. */
  const target = targetId != null ? (byId.get(targetId) ?? null) : coordTarget;
  if (!origin && !target) return null;
  return { origin, target };
}
