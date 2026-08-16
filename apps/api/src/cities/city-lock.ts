/**
 * ⭐⭐ ŞEHİR KİLİDİ — `pg_advisory_xact_lock(cityId)`, transaction ömürlü.
 *
 * Görev handler'ları bu kilidi 2026-07'den beri alıyor (`scheduler.service.ts` → `ctx.lockCity`):
 * *"Aynı şehre aynı anda düşen görevler seri hâle gelir."* **HTTP tarafı ise almıyordu** ve
 * kilit ancak iki tarafta da alınırsa bir şey ifade eder.
 *
 * ⚠️⚠️ **NEDEN GEREKLİ — kullanıcının sorduğu senaryonun ta kendisi** (2026-08-16):
 * *"Tam saldırı alındığı sırada ordu seçme ekranından görev veriliyorsa ve saldırı sonucu bu
 * seçilen ordulardan yeteri kadar kalmadıysa sunucu bu işlemi reddetmeli."*
 *
 * Reddetme kısmı zaten çalışıyordu (`reserveUnits` koşullu tek UPDATE), ama **savaşın kendi
 * yazması** korumasızdı. Savaş handler'ı hayatta kalanları MUTLAK yazıyor
 * (`applySurvivors` → `SET count = <kalan>`) ve o sayıyı transaction'ın BAŞINDA okuduğu
 * anlık görüntüden alıyor. Araya sızan bir sefer emri şunu üretiyordu:
 *
 * ```
 * T_savaş : lockCity → oku (100 Cüce) → simüle et …………………… SET count = 40
 * T_emir  :                    UPDATE units count = count-30 ✔ (100→70)
 * ```
 *
 * Sonuç: 30 Cüce hem yola çıktı hem savaşta savaştı hem de şehirde sağ kaldı — **30 asker
 * yoktan var oldu.** Emir reddedilmiyordu çünkü o an gerçekten 100 asker vardı; hata
 * reddetmede değil, savaşın okuma ile yazma arasındaki pencereyi kilitsiz bırakmasındaydı.
 *
 * Bu kilit pencereyi kapatıyor: emir ya savaştan ÖNCE (100 üzerinden, meşru) ya da SONRA
 * (40 üzerinden, yetmiyorsa reddedilir) işliyor. Arada bir "aynı anda" kalmıyor.
 *
 * ⚠️ İkinci savunma hattı olarak `applySurvivors` da mutlak yazmaktan **fark yazmaya** geçti:
 * kilit alınamayan bir yol (ör. ekran okumasının tembel üretim yazması) kalırsa bile adet
 * korunur. İki düzeltme birbirinin yerine geçmiyor, üst üste biniyor.
 *
 * ⚠️ **KİLİT SIRASI**: birden çok şehir kilitlenecekse **daima artan kimlik sırasıyla**
 * (`lockCities`). Teleport iki şehre birden dokunuyor ve ters yönde iki teleport aynı anda
 * verilirse sabit sıra olmadan kilitlenme (deadlock) doğar.
 *
 * ⚠️ `pg_advisory_xact_lock`un tek `bigint` uzayı, yerleşim kilidinin `(int,int)` uzayından
 * ayrıdır ve çakışmaz (`world/placement-lock.ts`). Sıra kuralı orada da yazılı:
 * **önce `lockPlacement`, sonra `lockCity`.**
 */
import { sql } from 'drizzle-orm';

/** Tek sorgu koşturabilen her şey — `Db` de `Tx` de olur (`CityService.Runner` ile aynı şekil). */
interface Runner {
  execute<T>(query: unknown): Promise<T[]>;
}

/**
 * Şehri bu transaction boyunca kilitler. Aynı şehre düşen ikinci yazar, biz commit edene
 * kadar bekler.
 *
 * ⚠️ **Transaction İÇİNDE çağrılmalı.** `pg_advisory_xact_lock` transaction bitince
 * kendiliğinden bırakılır; transaction dışında çağrılırsa kilit anında serbest kalır ve
 * hiçbir işe yaramaz. Çağıranların hepsi `db.transaction(...)` gövdesinde.
 */
export async function lockCity(runner: Runner, cityId: number): Promise<void> {
  await runner.execute(sql`SELECT pg_advisory_xact_lock(${cityId}::bigint)`);
}

/**
 * Birden çok şehri **artan kimlik sırasıyla** kilitler — sıra kilitlenmeyi (deadlock) önler.
 *
 * ⚠️ Sıralamayı çağırana bırakmıyoruz. Bugün tek çağıran teleport ama kuralın çağrı yerinde
 * yaşaması, ikinci çağıranın onu sessizce unutması demekti; burada durunca unutulamaz.
 * Yinelenen kimlikler eleniyor: aynı kilidi iki kez almak zararsız ama gereksiz.
 */
export async function lockCities(runner: Runner, cityIds: number[]): Promise<void> {
  const ordered = [...new Set(cityIds)].sort((a, b) => a - b);
  for (const id of ordered) await lockCity(runner, id);
}
