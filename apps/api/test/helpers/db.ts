/**
 * Test veritabanı yardımcıları. GERÇEK Postgres kullanıyoruz — `SKIP LOCKED`, advisory lock ve
 * transaction davranışı taklit edilemez; Faz 1'in tüm garantileri tam olarak bunlara dayanıyor.
 *
 * ⭐ Test DB'si ayrıdır ve **worker başına birer tane** (`mobilwar_test_1`, `_2`, …); her dosya
 * ayrıca kendi dünyasını yaratır. İkisi birlikte dosyaların paralel koşmasını mümkün kılıyor
 * (2026-08-07; ayrıntılı gerekçe `TEST_DB` sabitinin başında).
 */
import { randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { createDb, toDate, type DbHandle } from '../../src/db/client.ts';
import { GameClockService } from '../../src/world/game-clock.service.ts';
import { ECHO_TABLE_DDL } from '../../src/missions/echo.handler.ts';

const ADMIN_URL = process.env['DATABASE_URL']
  ?? 'postgresql://mobilwar:mobilwar@localhost:5432/mobilwar';

/**
 * ⭐⭐ WORKER BAŞINA AYRI VERİTABANI (2026-08-07) — PARALELLİĞİN ANAHTARI.
 *
 * Suite 2026-08-07'ye kadar `fileParallelism: false` ile SERİ koşuyordu (410 sn). Tek bir
 * paylaşılan `mobilwar_test` veritabanıyla paralellik mümkün değildi ve engel üç katmanlıydı:
 *
 *   1. **Dünya kimliği çakışması.** `freshWorldId()` her worker'da 100'den başlıyor; iki
 *      worker aynı anda 100'ü yaratır ve `createWorld`un `ON CONFLICT DO UPDATE`i
 *      birbirinin dünyasını sıfırlardı.
 *   2. **Dünya-kapsamsız `DELETE`ler.** Sekiz dosyada 16 tane var (`DELETE FROM settings`,
 *      `player_devices`, `ip_asn_ranges`…). Bu tablolarda dünya kolonu yok; bir worker'ın
 *      temizliği diğerinin az önce yazdığını siler.
 *   3. **Migration yarışı.** `migrated` bayrağı MODÜL düzeyinde, yani worker BAŞINA. Ortak
 *      veritabanında her worker aynı şemayı kurmaya çalışırdı.
 *
 * Veritabanını worker'a bağlamak üçünü de aynı anda çözüyor — her worker kendi dünyalarına,
 * kendi ayar tablosuna ve kendi şemasına sahip. ⚠️ Alternatif "çakışan dosyaları seri bırak"
 * yaklaşımı bunun yerine 8 dosyayı sürekli sıraya sokardı ve yeni bir global `DELETE`
 * eklendiğinde SESSİZCE bozulurdu; burada izolasyon yapısal.
 */
const WORKER_ID = process.env['VITEST_WORKER_ID'] ?? '1';
const TEST_DB = `mobilwar_test_${WORKER_ID}`;
const TEST_URL = ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${TEST_DB}$1`);

/**
 * ⭐ Bu worker'ın test veritabanı bağlantı dizesi.
 *
 * ⚠️ İkinci bir bağlantı açan testler bunu KULLANMALI, adresi elle yazmamalı.
 * `realtime.test.ts` elle `/mobilwar_test` yazıyordu ve worker başına veritabanına geçince
 * sessizce kırıldı: LISTEN/NOTIFY **veritabanı başına** çalışır, yayıncı ile dinleyici ayrı
 * veritabanlarına düşünce olay hiç gelmedi (2026-08-07'de bu iki test kırmızı yanarak
 * yakalandı — hatanın kendisi de zaten bunun kanıtı).
 */
export function testDbUrl(): string {
  return TEST_URL;
}

let migrated = false;

/**
 * Test veritabanını (yoksa) yaratır ve migration'ları bir kez uygular.
 *
 * ⚠️ `CREATE DATABASE` yeniden denemeli: tüm worker'lar ilk koşuda aynı anda veritabanı
 * yaratıyor ve Postgres şablon veritabanını kilitliyor ("source database template1 is being
 * accessed by other users"). Yalnız İLK koşuda görülür — sonrakilerde veritabanları hazır.
 */
export async function setupTestDb(): Promise<DbHandle> {
  if (!migrated) {
    const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
    try {
      const exists = await admin`SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}`;
      if (exists.length === 0) {
        for (let attempt = 0; ; attempt++) {
          try {
            await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
            break;
          } catch (err) {
            // 42P04 = zaten var (başka bir yarış kazandı) → sorun değil, devam.
            if (String(err).includes('already exists')) break;
            if (attempt >= 10) throw err;
            await new Promise((r) => setTimeout(r, 300 + attempt * 200));
          }
        }
      }
    } finally {
      await admin.end({ timeout: 5 });
    }

    const h = createDb(TEST_URL, { max: 1 });
    await migrate(h.db, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
    await h.db.execute(ECHO_TABLE_DDL);
    await h.close();
    migrated = true;
  }
  /**
   * ⚠️ Havuz 8'den 5'e indirildi: `max_connections = 100` ve 6 worker × 5 = 30, üstüne
   * geliştirme sunucusunun kendi havuzu. Testler zaten sıralı `await` kullanıyor, 5 bol.
   */
  return createDb(TEST_URL, { max: 5 });
}

/**
 * ⭐ **GÖREVİ VADESİNE GETİREN ZAMAN DAMGASI — VERİTABANININ oyun saatinden.**
 *
 * Kural tek cümle: *karşılaştırmanın iki tarafı da aynı saatten okunur.* `claimDue`
 * `execute_at`i veritabanının oyun saatiyle kıyaslıyor (`mission.repository.ts` ·
 * `GAME_NOW_SQL`), o yüzden vade damgası da oradan gelmeli.
 *
 * ⚠️ **İKİ KEZ YANLIŞ YAZILDI, ikisi de sessizce kırıldı:**
 *   1. `now() - interval '1 second'` (2026-08-02) — Postgres'in saati; zamanlayıcı o zaman
 *      Node'un saatine bakıyordu. Docker VM'i uyku sonrası 1 sn'den fazla ileri kayınca vade
 *      Node'a göre GELECEKTE kalıyor, `tick()` hiçbir şey yapmıyordu. `expect(r.dead).toBe(0)`
 *      sıfır görevde de geçtiği için hata görünmüyor, savaş hiç olmuyor, sonraki okumalar
 *      `rows[0]` undefined ile patlıyordu (17 kırılma, 2 sn'lik yapay sapmayla yeniden üretildi).
 *   2. `clock.gameNow(worldId)` (Node) — 1. kusurun aynası. 2026-08-03'te vade karşılaştırması
 *      SQL'e taşınınca bu sefer bu taraf yanlış saate bağlanmış oldu.
 *
 * Artık iki taraf da Postgres'ten geliyor ve VM saat kayması bu testleri hiç etkilemiyor.
 *
 * ⭐ **0043'te bu tuzak yapısal olarak kapandı:** `dbGameNow()` ayrı bir metot olmaktan çıktı,
 * çünkü `gameNow()` ARTIK ZATEN veritabanının saatinden okuyor (`game-clock.service.ts`).
 * Yani "yanlış saatten okuma" seçeneği kodda kalmadı — yukarıdaki iki kırılmanın da kaynağı
 * olan seçim noktası yok edildi.
 */
export async function dueAt(
  clock: GameClockService, worldId: number, msAgo = 1000,
): Promise<string> {
  const gameNow = await clock.gameNow(worldId);
  return new Date(gameNow.getTime() - msAgo).toISOString();
}

/** Her testin kendi dünya kimliği → testler birbirinin satırlarını görmez. */
let nextWorldId = 100;
export function freshWorldId(): number {
  return nextWorldId++;
}

export async function createWorld(h: DbHandle, worldId: number): Promise<void> {
  await h.db.execute(sql`
    INSERT INTO worlds (id, name, state, clock_offset_ms)
    VALUES (${worldId}, ${'test-' + worldId}, 'running', 0)
    ON CONFLICT (id) DO UPDATE SET state = 'running', clock_offset_ms = 0, paused_at = NULL,
      deleted_player_seq = 0, placement_band = 1,
      speed_multiplier = 1, resource_multiplier = 1,
      training_multiplier = 1, construction_multiplier = 1
  `);
  /* ⚠️ Yukarıdaki SIFIRLAMA şart: dünya kimlikleri her koşuda 100'den başladığı için satır
   * yeniden kullanılıyor ve sayaç önceki koşudan devrederse hesap silme testi ikinci
   * koşuda "hükümdar1" yerine "hükümdar2" görür.
   *
   * ⚠️⚠️ **ÇARPANLAR 2026-08-09'da eklendi — aynı tuzağın İKİNCİ kurbanı.** `queues.test.ts`
   * bir testte `training_multiplier = 3` yazıyor ve satır öyle kalıyordu; sonraki koşuda aynı
   * kimliği alan BAŞKA bir test üretim sürelerini 3'e bölünmüş buluyordu. Hata testin kendi
   * dosyasında değil, sırf **test sırası kaydığı için** ortaya çıkıyor — yani sinsi ve
   * tekrarlanabilirliği düşük. Sayaç için yazılan bu sıfırlama listesi, satırın yeniden
   * kullanıldığı HER kolonu kapsamak zorunda.
   *
   * ⚠️⚠️ **`placement_band` 2026-08-16'da eklendi — aynı tuzağın ÜÇÜNCÜ kurbanı.** Yerleşim
   * su seviyesi tanımı gereği yalnız İLERİ gidiyor; sıfırlanmayınca bir sonraki koşuda o
   * dünya kimliğini alan test "boş dünya" sanıp diyar 1-5 beklerken 47. diyarı buluyordu.
   * Arıza ilk koşuda değil İKİNCİ koşuda çıktı — listenin neden var olduğunun canlı kanıtı.
   * ⚠️ Not: bu yorum SQL'in İÇİNDE değil — orada ters tırnak kullanmak şablon dizesini
   * kapatıyor ve dosya derlenmiyor (tam bu şekilde yaşandı). */
  await h.db.execute(sql`DELETE FROM missions WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM outbox WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM audit_log WHERE world_id = ${worldId}`);
  /* ⚠️ Dünya kimlikleri her koşuda 100'den başlıyor, yani satırlar YENİDEN KULLANILIYOR.
     Kaydırma defteri temizlenmezse önceki koşudan kalan satırlar "kaç kez kaydırıldı"
     sayan testleri kırar (ikinci koşuda 2 görünür). */
  await h.db.execute(sql`DELETE FROM time_shifts WHERE world_id = ${worldId}`);
  /* Aynı gerekçe (Faz 3): `ops_events`in kısmî tekillik indeksi "(dünya, tür) başına bir AÇIK
     olay" diyor — önceki koşudan kalan açık bir satır, yeni koşunun ilk aşımını "zaten açık"
     sayar ve olay açılışını ölçen test sessizce yanlış sonuç verir. */
  await h.db.execute(sql`DELETE FROM ops_events WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM scheduler_samples WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM echo_effects WHERE world_id = ${worldId}`);
  // Dünya kimlikleri her koşuda 100'den başlıyor → önceki koşunun oyuncuları temizlenmeli,
  // yoksa username/email tekilliği ikinci koşuda çakışır. (cities → players sırası önemli.)
  await h.db.execute(sql`DELETE FROM cities WHERE world_id = ${worldId}`);
  // İttifaklar oyunculardan ÖNCE: `alliances.leader_id` FK'sı oyuncu silinmesini engelliyor
  // (players.alliance_id ise SET NULL ile kendiliğinden boşalır, sıra sorunu yaratmaz).
  await h.db.execute(sql`DELETE FROM alliances WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM players WHERE world_id = ${worldId}`);
  // Sıralama anlık görüntüleri de dünya-kapsamlı: kalırsa bir sonraki koşuda ÖNCEKİ koşunun
  // sırası "prev_rank" olarak görünür ve değişim testleri sessizce yanlış sonuç verir.
  await h.db.execute(sql`DELETE FROM rankings WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM ranking_runs WHERE world_id = ${worldId}`);
  /* Sohbet kanalları da dünya-kapsamlı; `players` silinince katılımcılar CASCADE ile gider ama
   * KANAL satırı kalır ve "bu dünyada kaç DM kanalı var" sayan testler önceki koşuyu görür. */
  await h.db.execute(sql`DELETE FROM chat_reports WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM chat_channels WHERE world_id = ${worldId}`);
}

/**
 * Test oyuncusu yaratır. E-posta/kullanıcı adı **rastgele** — testler aynı DB'de tekrar tekrar
 * koştuğu için sabit değerler tekillik kısıtına çarpardı.
 *
 * ⭐ **E-posta VARSAYILAN OLARAK DOĞRULANMIŞ** (2026-08-01). Doğrulanmamış hesap artık gerçek
 * kısıtlara tabi (§verify: saldırı/nakliye yok, yapı ve teknik en fazla 3, en çok 200 savaşçı)
 * ve testlerin ezici çoğunluğu o kısıtları değil başka bir şeyi ölçüyor. Varsayılanı
 * doğrulanmamış bırakmak, ilgisiz onlarca testin sessizce "kısıt duvarına" çarpması demekti.
 * Kısıtları ölçen test `verified: false` geçer — açıkça ve okunur biçimde.
 */
export async function createPlayer(
  h: DbHandle, worldId: number, label: string, opts: { verified?: boolean } = {},
): Promise<number> {
  const token = randomUUID().slice(0, 8);
  const acc = await h.db.execute<{ id: number } & Record<string, unknown>>(sql`
    INSERT INTO accounts (email, password_hash, email_verified_at)
    VALUES (${`${label}-${token}@test.local`}, 'test-hash',
            ${opts.verified === false ? null : sql`now()`})
    RETURNING id
  `);
  const p = await h.db.execute<{ id: number } & Record<string, unknown>>(sql`
    INSERT INTO players (world_id, account_id, username)
    VALUES (${worldId}, ${Number(acc[0]!.id)}, ${`${label}-${token}`})
    RETURNING id
  `);
  return Number(p[0]!.id);
}

/**
 * ⭐ Bir oyuncunun e-postasını DOĞRULANMIŞ işaretler.
 *
 * ⚠️ **`auth.register()` ile kurulan testler için şart.** Gerçek kayıt akışı hesabı bilerek
 * doğrulanmamış bırakıyor (doğrulama maili outbox'a düşüyor, oyuncu bağlantıya tıklayana kadar
 * öyle kalıyor) — yani `register` çağıran her test, §verify kısıtlarının tam ortasına doğuyor.
 * Kısıtları ÖLÇMEYEN testler bu satırı çağırıp normal bir oyuncuya dönüşür; ölçenler çağırmaz.
 */
export async function verifyEmail(h: DbHandle, playerId: number): Promise<void> {
  await h.db.execute(sql`
    UPDATE accounts SET email_verified_at = now()
     WHERE id = (SELECT account_id FROM players WHERE id = ${playerId})
  `);
}

/**
 * Outbox dispatcher bilerek DÜNYA-KAPSAMLI DEĞİL (dünya-üstü olaylar da var, `world_id` NULL).
 * Bu yüzden dispatcher testleri tabloyu tamamen temizler; yoksa başka testlerin bekleyen
 * satırlarını da teslim edip sayımları bozar.
 */
export async function clearOutbox(h: DbHandle): Promise<void> {
  await h.db.execute(sql`DELETE FROM outbox`);
}

export interface EnqueueOptions {
  worldId: number;
  executeAt: Date;
  type?: string;
  label?: string;
  targetCityId?: number;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

export async function enqueue(h: DbHandle, o: EnqueueOptions): Promise<number> {
  const payload = { label: o.label ?? null, ...(o.payload ?? {}) };
  const rows = await h.db.execute<{ id: number }>(sql`
    INSERT INTO missions (world_id, type, status, execute_at, target_city_id, payload, idempotency_key)
    VALUES (${o.worldId}, ${o.type ?? 'echo'}, 'scheduled', ${o.executeAt.toISOString()}::timestamptz,
            ${o.targetCityId ?? null}, ${JSON.stringify(payload)}::jsonb, ${o.idempotencyKey ?? null})
    RETURNING id
  `);
  return Number(rows[0]!.id);
}

export async function echoEffects(h: DbHandle, worldId: number): Promise<
  { missionId: number; label: string | null; sawAt: Date; seq: number }[]
> {
  const rows = await h.db.execute<{ mission_id: number; label: string | null; saw_at: string; seq: number }>(sql`
    SELECT mission_id, label, saw_at, seq FROM echo_effects
     WHERE world_id = ${worldId} ORDER BY seq
  `);
  return rows.map((r) => ({
    missionId: Number(r.mission_id), label: r.label, sawAt: toDate(r.saw_at), seq: Number(r.seq),
  }));
}

export async function missionRow(h: DbHandle, id: number): Promise<{
  status: string; attempts: number; lastError: string | null; executeAt: Date;
}> {
  const rows = await h.db.execute<{ status: string; attempts: number; last_error: string | null; execute_at: string }>(sql`
    SELECT status, attempts, last_error, execute_at FROM missions WHERE id = ${id}
  `);
  const r = rows[0]!;
  return { status: r.status, attempts: Number(r.attempts), lastError: r.last_error, executeAt: toDate(r.execute_at) };
}
