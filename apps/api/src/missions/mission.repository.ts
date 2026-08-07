/**
 * ⭐ GÖREV KUYRUĞU DEPOSU (SİSTEM PLANI §1)
 *
 * Üç garanti buradan gelir:
 *  1. **Kaçırılan görev yok** — worker saatlerce kapalı kalsa bile açılınca birikmişleri
 *     `execute_at` sırasıyla işler (catch-up).
 *  2. **Çift çalışma yok** — `FOR UPDATE SKIP LOCKED` + `status` geçişi aynı transaction'da.
 *  3. **Sıra kesin** — `ORDER BY execute_at, id`; eşitlikte önce oluşturulan kazanır.
 */
import { sql } from 'drizzle-orm';
import { toDate, toDateOrNull, type Db } from '../db/client.ts';

export interface MissionRow {
  id: number;
  worldId: number;
  type: string;
  status: string;
  ownerPlayerId: number | null;
  originCityId: number | null;
  targetCityId: number | null;
  executeAt: Date;
  attempts: number;
  payload: Record<string, unknown>;
}

/** `db.execute` generic'i `Record<string, unknown>` ister; ham satır tipi ayrı tutuluyor. */
interface MissionRowRaw extends Record<string, unknown> {
  id: number | string;
  worldId: number;
  type: string;
  status: string;
  ownerPlayerId: number | null;
  originCityId: number | null;
  targetCityId: number | null;
  executeAt: string;
  attempts: number;
  payload: Record<string, unknown>;
}

export interface ClaimOptions {
  worldId: number;
  limit: number;
  /** Worker kimliği (bayat kilidi tanımak ve loglamak için). */
  workerId: string;
}

/**
 * ⭐⭐ OYUN SAATİNİN TEK OTORİTESİ VERİTABANIDIR — uygulama süreci DEĞİL (2026-08-03).
 *
 * ⚠️ **CANLIDA YAŞANDI.** Vade karşılaştırması `execute_at <= ${gameNow}` biçimindeydi ve
 * `gameNow` Node'un `new Date()`'inden geliyordu. 3 Ağustos 08:12'de tek bir turda **vadesi
 * 16:00 olan** `ranking_snapshot` ile **vadesi 14 sn sonra** olan bir `defense_finish` birlikte
 * alındı; öncesi ve sonrası kusursuzdu, `clock_offset_ms` 0, dünya çalışıyordu. Yani sürecin
 * saati bir an için ileri okudu ve **7 saat 47 dakika erken** bir sıralama anlık görüntüsü
 * alındı (geri alınamaz: `prev_rank` kaydı kayar, o dönemin "değişim" sütunu kaybolur).
 *
 * Kök nedeni kanıtlayamadım (tek seferlik konak saati sıçraması en olası açıklama), ama
 * **hata sınıfı** kapatılabilir: kıyaslamanın iki tarafı da aynı saatten gelsin. `execute_at`
 * zaten veritabanında; `now()` de öyle olsun. Böylece süreç saati ne okursa okusun vade
 * kayamaz — ve çok süreçli dağıtımda süreçler arası kayma sorunu da doğmaz.
 *
 * ⭐⭐ **0043'TEN SONRA İFADE SADELEŞTİ: `COALESCE(w.paused_at, now())`.**
 *
 * `clock_offset_ms` çıkarması kalktı çünkü tek zaman çizgisinde oyun saati = gerçek saat
 * (`world/game-clock.service.ts`). Kural DEĞİŞMEDİ, yalnız formül kısaldı: kıyaslamanın iki
 * tarafı da hâlâ veritabanının saatinden geliyor ve yukarıdaki hata sınıfı hâlâ kapalı.
 *
 * ⚠️ `COALESCE(paused_at, …)` KORUNUYOR: bakımda saat DONAR. Scheduler bakımda zaten erken
 * dönüyor ve `claimDue` ayrıca `w.paused_at IS NULL` arıyor, ama `dueStats` bakım sırasında da
 * çağrılabiliyor — çıplak `now()` yazsaydık bakım boyunca gecikme sonsuza büyür ve panel
 * bakımdaki her dünyayı "arızalı" gösterirdi.
 */
const GAME_NOW_SQL = sql`COALESCE(w.paused_at, now())`;

export class MissionRepository {
  constructor(private readonly db: Db) {}

  /**
   * Vadesi gelmiş görevleri KİLİTLEYİP `running` yapar.
   *
   * `SKIP LOCKED` sayesinde N worker aynı anda çalışabilir: biri bir satırı kilitlemişse
   * diğeri onu atlar, beklemez. Alt sorgu `FOR UPDATE` ile satırları tutar, dış `UPDATE`
   * aynı transaction'da durumu değiştirir → iki worker aynı görevi ALAMAZ.
   *
   * ⚠️ `FOR UPDATE` yalnız `missions` satırlarını kilitler (`OF m`): `worlds` JOIN'i sırf
   * oyun saatini okumak için var ve dünya satırını kilitlemek tüm kuyruğu tek satıra seri
   * hâle getirirdi.
   *
   * ⭐⭐ **`w.paused_at IS NULL` YÜKLEMİ — bakım kararı da veriye yapıştırıldı (2026-08-07).**
   *
   * Bakım kontrolü `scheduler.service.ts`'te de var ama orası `clock.read()` ile **ayrı bir
   * sorguda, ayrı bir anda** bakıyor: `read()` ile `claimDue()` arasında `pause()` commit ederse
   * tur devam eder ve görev alır. Bugün bu zararsız (vadesi gerçekten gelmiş bir görev), ama
   * bakımdan çıkışta vadeler toplu kaydırılmaya başlayınca **kaydırma öncesi/sonrası karışımı**
   * üretirdi — geri alınamaz bir hata sınıfı.
   *
   * Yüklem SQL'e konunca ara durum kalmıyor: `claimDue` ya `paused_at`'in dolu olduğu anı görür
   * (alt sorgu sıfır satır, hiçbir satıra kilit bile denemez) ya da boşaldığı anı görür. Bu,
   * 2026-08-03'te oyun saati için öğrenilen dersin aynısı: **kıyaslama verinin yanında yapılır.**
   * Uygulama katmanındaki kontrol ucuz bir erken çıkış olarak kalıyor — ama doğruluk artık ondan
   * gelmiyor.
   */
  async claimDue(opts: ClaimOptions): Promise<MissionRow[]> {
    const rows = await this.db.execute<MissionRowRaw>(sql`
      UPDATE missions m
         SET status = 'running',
             locked_by = ${opts.workerId},
             locked_at = now(),
             attempts = m.attempts + 1
       WHERE m.id IN (
             SELECT m2.id FROM missions m2
               JOIN worlds w ON w.id = m2.world_id
              WHERE m2.world_id = ${opts.worldId}
                AND w.paused_at IS NULL
                AND m2.status = 'scheduled'
                AND m2.execute_at <= ${GAME_NOW_SQL}
              ORDER BY m2.execute_at, m2.id
                FOR UPDATE OF m2 SKIP LOCKED
              LIMIT ${opts.limit}
       )
      RETURNING m.id, m.world_id AS "worldId", m.type, m.status,
                m.owner_player_id AS "ownerPlayerId", m.origin_city_id AS "originCityId",
                m.target_city_id AS "targetCityId", m.execute_at AS "executeAt",
                m.attempts, m.payload
    `);
    // Ham SQL zaman alanlarını dize döndürür → sınırda Date'e çevir (bkz. client.ts/toDate).
    const parsed: MissionRow[] = rows.map((r) => ({
      id: Number(r.id),
      worldId: Number(r.worldId),
      type: r.type,
      status: r.status,
      ownerPlayerId: r.ownerPlayerId == null ? null : Number(r.ownerPlayerId),
      originCityId: r.originCityId == null ? null : Number(r.originCityId),
      targetCityId: r.targetCityId == null ? null : Number(r.targetCityId),
      executeAt: toDate(r.executeAt),
      attempts: Number(r.attempts),
      payload: r.payload ?? {},
    }));
    // execute_at sırası RETURNING'de garanti değil → handler'a vermeden önce yeniden sırala.
    return parsed.sort((a, b) =>
      a.executeAt.getTime() - b.executeAt.getTime() || a.id - b.id);
  }

  /**
   * ⭐ CRASH KURTARMA: worker görevi `running` yapıp öldüyse satır sonsuza kadar öyle kalırdı.
   * `staleAfterMs`'ten eski kilitleri `scheduled`'a döndürür → sonraki tur yeniden dener.
   * Çıkış kriterinin ("worker'ı savaşın ortasında öldür") çalışmasını sağlayan parça budur.
   */
  async reapStale(worldId: number, staleAfterMs: number): Promise<number> {
    const rows = await this.db.execute<{ id: number } & Record<string, unknown>>(sql`
      UPDATE missions
         SET status = 'scheduled', locked_by = NULL, locked_at = NULL,
             last_error = COALESCE(last_error, 'bayat kilit kurtarildi (worker crash)')
       WHERE world_id = ${worldId}
         AND status = 'running'
         AND locked_at < now() - (${staleAfterMs}::bigint * interval '1 millisecond')
      RETURNING id
    `);
    return rows.length;
  }

  async markDone(missionId: number): Promise<void> {
    await this.db.execute(sql`
      UPDATE missions SET status = 'done', finished_at = now(), locked_by = NULL, locked_at = NULL
       WHERE id = ${missionId}
    `);
  }

  /**
   * Hata: deneme hakkı varsa geri kuyruğa (üstel backoff ile), yoksa `failed` (dead letter).
   * Backoff OYUN saatinde değil execute_at üzerinden verilir; böylece sıra bozulmaz.
   */
  async markFailed(missionId: number, error: string, maxAttempts: number, backoffMs: number): Promise<'retry' | 'dead'> {
    const rows = await this.db.execute<{ status: string } & Record<string, unknown>>(sql`
      UPDATE missions
         SET status = CASE WHEN attempts >= ${maxAttempts} THEN 'failed' ELSE 'scheduled' END,
             execute_at = CASE WHEN attempts >= ${maxAttempts} THEN execute_at
                               ELSE execute_at + (${backoffMs}::bigint * interval '1 millisecond') END,
             last_error = ${error.slice(0, 2000)},
             locked_by = NULL, locked_at = NULL,
             finished_at = CASE WHEN attempts >= ${maxAttempts} THEN now() ELSE NULL END
       WHERE id = ${missionId}
      RETURNING status
    `);
    return rows[0]?.status === 'failed' ? 'dead' : 'retry';
  }

  /** Bir sonraki görevin oyun-saati vadesi (scheduler'ın ne kadar uyuyacağını bilmesi için). */
  async nextDueAt(worldId: number): Promise<Date | null> {
    const rows = await this.db.execute<{ execute_at: string } & Record<string, unknown>>(sql`
      SELECT execute_at FROM missions
       WHERE world_id = ${worldId} AND status = 'scheduled'
       ORDER BY execute_at, id LIMIT 1
    `);
    return toDateOrNull(rows[0]?.execute_at);
  }

  /**
   * ⭐ VADESİ GELMİŞ İŞİN KÜNYESİ — tek sorgu, üç sayı (2026-08-07'de `lagMs`ten büyüdü).
   *
   *   `lagMs`  — SLO metriği: en eski bekleyen görevin gecikmesi (§8, p95 < 2 sn hedefi)
   *   `due`    — vadesi gelmiş **ve** alınabilir durumdaki görev sayısı
   *   `stuck`  — bunlardan `stuckAfterMs`ten uzun süredir bekleyenler
   *
   * ⚠️⚠️ **`due` NEDEN VAR — 2026-08-06 olayının kör noktası tam olarak buydu.**
   *
   * O gün 24 görev saatlerce kuyrukta bekledi ve **hiçbir gösterge bunu söylemedi**. Sebep:
   * `claimDue`'daki `SKIP LOCKED`, terk edilmiş bir transaction'ın tuttuğu satırları sessizce
   * atlıyordu. Scheduler ölmemişti — daha YENİ görevler zamanında koşarken daha ESKİLERİ
   * bekliyordu. Ama tur sonucunda yalnız `claimed` vardı ve `claimed = 0`, "iş yoktu" ile
   * "iş vardı ama alamadım"ı **ayırt edemiyordu**.
   *
   * `due` ile `claimed` arasındaki fark o ayrımı veriyor: `skippedLocked = min(due, limit) − claimed`
   * (`scheduler.service.ts`). Sıfırdan büyükse birileri satırlarımızı tutuyor demektir.
   *
   * ⚠️ Bu sorgu `claimDue` ile **aynı yüklemleri** kullanmak zorunda (`paused_at`, `status`,
   * `execute_at`) — yoksa fark anlamını yitirir ve sahte alarm üretir.
   */
  async dueStats(worldId: number, stuckAfterMs: number): Promise<{ lagMs: number; due: number; stuck: number }> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (${GAME_NOW_SQL} - m.execute_at)) * 1000), 0)::bigint AS lag,
             COUNT(*)::int AS due,
             COUNT(*) FILTER (
               WHERE m.execute_at <= ${GAME_NOW_SQL} - (${stuckAfterMs}::bigint * interval '1 millisecond')
             )::int AS stuck
        FROM missions m JOIN worlds w ON w.id = m.world_id
       WHERE m.world_id = ${worldId} AND w.paused_at IS NULL AND m.status = 'scheduled'
         AND m.execute_at <= ${GAME_NOW_SQL}
    `);
    const r = rows[0];
    return {
      lagMs: Number(r?.['lag'] ?? 0),
      due: Number(r?.['due'] ?? 0),
      stuck: Number(r?.['stuck'] ?? 0),
    };
  }

  /** Geriye dönük uyumluluk — yalnız gecikmeyi isteyen çağıranlar için. */
  async lagMs(worldId: number): Promise<number> {
    return (await this.dueStats(worldId, 0)).lagMs;
  }

  async countByStatus(worldId: number): Promise<Record<string, number>> {
    const rows = await this.db.execute<{ status: string; n: number } & Record<string, unknown>>(sql`
      SELECT status, COUNT(*)::int AS n FROM missions WHERE world_id = ${worldId} GROUP BY status
    `);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  }
}
