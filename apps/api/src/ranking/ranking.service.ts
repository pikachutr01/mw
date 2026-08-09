/**
 * ⭐ SIRALAMA ANLIK GÖRÜNTÜSÜ (Komuta Merkezi → Sıralamalar)
 *
 * Oyun sırayı **canlı hesaplamaz**, günde üç kez dondurur: **00:00 · 08:00 · 16:00** (oyun saati).
 * Bu bir performans hilesi değil, oyunun kendi ritmi: oyuncu sırasının saniye saniye oynamasını
 * değil, "bu sabahki listede kaçıncıydım, şimdi kaçıncıyım" karşılaştırmasını görür.
 *
 * ⚠️ **Değişim (▲2) TÜRETİLEMEZ.** Önceki sıra kaydedilmezse geriye dönük hesaplanamaz — bu
 * yüzden `rankings` satırı hem `rank` hem `prev_rank` taşır ve her anlık görüntüde eskisi
 * `prev_rank`'e kaydırılır. Anlık görüntü kaçırılırsa o dönemin değişimi sonsuza dek kaybolur.
 *
 * Zamanlama görevin kendisindedir (`ranking_snapshot`): her çalışma bir sonrakini yazar. Ayrı bir
 * cron yok — dünya bakımdayken oyun saati durduğu için sıralama takvimi de doğal olarak kayar,
 * gerçek saate bağlı bir cron ise bakımda tetiklenip yanlış ana damga atardı.
 */
import { sql } from 'drizzle-orm';
import { zonedDayStart } from '@mobilwar/contracts';
import type { Db } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';

type Runner = Db | Tx;

/**
 * Anlık görüntü saatleri — **oyunun saat diliminde** (Türkiye). Doküman/ekran: günde 3 kez.
 *
 * ⚠️ **UTC'DEN TSİ'YE TAŞINDI** (kullanıcı, 2026-08-04, ikinci bildirim). Eskiden gün sınırı
 * `Date.UTC(...)` ile hesaplanıyordu, yani yuvalar 00/08/16 **UTC**'ye oturuyordu ve Türkiye'de
 * **03:00 / 11:00 / 19:00** anlamına geliyordu. Ekrandaki "günde üç kez, 00/08/16" vaadi ile
 * oyuncunun saatinin tutmamasının sebebi buydu.
 */
export const SNAPSHOT_HOURS = [0, 8, 16] as const;

export type RankingKind = 'player' | 'alliance' | 'hero';

/** `from`'dan SONRAKİ ilk anlık görüntü anı. Tam saat üstünde ise bir sonrakini verir. */
export function nextSnapshotAt(from: Date): Date {
  const midnight = zonedDayStart(from).getTime();
  for (const h of SNAPSHOT_HOURS) {
    const t = midnight + h * 3_600_000;
    if (t > from.getTime()) return new Date(t);
  }
  // Ertesi günün ilk yuvası — gün uzunluğunu 24 saat VARSAYMADAN, gün başlangıcını tekrar sorarak.
  return zonedDayStart(new Date(midnight + 36 * 3_600_000));
}

/** `at`'ten önceki (veya tam ona denk gelen) en son anlık görüntü anı. */
export function previousSnapshotAt(at: Date): Date {
  const midnight = zonedDayStart(at).getTime();
  let best = zonedDayStart(new Date(midnight - 12 * 3_600_000)).getTime()
    + SNAPSHOT_HOURS[SNAPSHOT_HOURS.length - 1]! * 3_600_000;   // dünün son yuvası
  for (const h of SNAPSHOT_HOURS) {
    const t = midnight + h * 3_600_000;
    if (t <= at.getTime()) best = t;
  }
  return new Date(best);
}

/**
 * Bir dünyanın sıralamasını `at` anına dondurur.
 *
 * Sıra hesabı ve önceki sıranın kaydırılması **tek `INSERT … ON CONFLICT`** ile yapılıyor:
 * `DO UPDATE SET prev_rank = rankings.rank` ifadesindeki `rankings.rank` satırın ESKİ değeridir,
 * yani okuma ile yazma arasında hiçbir aralık kalmıyor. İki adıma bölseydik araya giren ikinci
 * bir anlık görüntü "önceki sıra"yı kendi yazdığı değerle ezerdi.
 *
 * @returns kaç satır sıralandığı
 */
export async function takeSnapshot(runner: Runner, worldId: number, at: Date): Promise<number> {
  const ts = at.toISOString();

  /**
   * Silinmiş/yasaklı/**muaf** özneler listede kalmasın (sıra numaraları da onlarsız dizilir).
   *
   * ⚠️ `ranking_excluded` burada da olmak ZORUNDA: yalnız aşağıdaki INSERT'e koysaydık,
   * muafiyet açılmadan ÖNCE yazılmış satır tabloda kalır ve oyuncu listede görünmeye devam
   * ederdi (`ON CONFLICT` yalnız var olanı günceller, silmez).
   */
  await runner.execute(sql`
    DELETE FROM rankings r
     WHERE r.world_id = ${worldId} AND r.kind = 'player'
       AND NOT EXISTS (
         SELECT 1 FROM players p
          WHERE p.id = r.subject_id AND p.banned_at IS NULL AND p.ranking_excluded = false
       )
  `);
  /**
   * ⚠️ Kahraman tarafında da aynı tuzak: eski satır `ON CONFLICT` ile GÜNCELLENİR, silinmez.
   * Sahibi hesabını yeni silmiş bir kahraman hâlâ var olduğu için `NOT EXISTS (heroes)` onu
   * bulamaz ve satır tabloda kalırdı — aşağıdaki INSERT'e süzgeç koymak tek başına yetmiyor.
   * (Oyuncu tarafındaki `ranking_excluded` notunun birebir aynısı; 2026-08-09'da burada da
   * gerekli oldu.)
   */
  await runner.execute(sql`
    DELETE FROM rankings r
     WHERE r.world_id = ${worldId} AND r.kind = 'hero'
       AND NOT EXISTS (
         SELECT 1 FROM heroes h JOIN players p ON p.id = h.player_id
          WHERE h.id = r.subject_id AND p.deleted_at IS NULL
       )
  `);
  // Dağıtılan ittifaklar sıralamadan düşer (kayıt silindiği için EXISTS bulamaz).
  await runner.execute(sql`
    DELETE FROM rankings r
     WHERE r.world_id = ${worldId} AND r.kind = 'alliance'
       AND NOT EXISTS (SELECT 1 FROM alliances a WHERE a.id = r.subject_id)
  `);

  const players = await runner.execute<Record<string, unknown>>(sql`
    WITH ordered AS (
      SELECT id, score, RANK() OVER (ORDER BY score DESC, id ASC) AS rank
        FROM players
       WHERE world_id = ${worldId} AND banned_at IS NULL
         -- ⭐ Muaf oyuncu listeye hiç girmez; sıra numaraları onsuz dizilir (§0036).
         AND ranking_excluded = false
    )
    INSERT INTO rankings (world_id, kind, subject_id, rank, prev_rank, score, taken_at)
    SELECT ${worldId}, 'player', o.id, o.rank, NULL, o.score, ${ts}::timestamptz FROM ordered o
    ON CONFLICT (world_id, kind, subject_id) DO UPDATE
      SET prev_rank = rankings.rank,
          rank = EXCLUDED.rank,
          score = EXCLUDED.score,
          taken_at = EXCLUDED.taken_at
    RETURNING subject_id
  `);

  /**
   * ⭐ Kahraman sıralaması **seviye, sonra tecrübe**. Tek sayıya katlanıyor
   * (`seviye × 1e9 + tecrübe`) çünkü `rankings.score` tek sütun; 1e9 tavanı 80. seviyede bile
   * tecrübenin seviyeyi taşırmasını engelliyor (§13.11.4b tablosu bu büyüklüğe uzak).
   *
   * ⭐ **SİLİNMİŞ HESABIN KAHRAMANI LİSTEDE YOK** (kullanıcı, 2026-08-09: *"sıralamalarda
   * gözükmesini istemiyorum"*). Kahraman satırı sahibinin adını da yazıyor
   * (`command.controller` → `p.username AS owner`), yani süzgeç olmadan silinmiş hesap
   * kahraman sekmesinden vitrine geri sızıyordu — oyuncu ve ittifak sekmelerinden düşmüş olsa bile.
   *
   * ⚠️ Süzgeç `deleted_at`, **`ranking_excluded` DEĞİL** ve bu ayrım bilinçli: muafiyet
   * bayrağının kahraman sıralamasını ETKİLEMEMESİ kullanıcının 2026-08-03'teki açık şartı
   * (yönetici/servis hesabı vitrinden gizlenir ama kahramanı listede kalır). İki soru ayrı:
   * "gizlensin mi" ile "bu hesap artık yok mu". Silinen hesapta ikincisi geçerli.
   *
   * ⚠️ `deleted_at`i `purge-player` de yazıyor; oradaki kahramanlar zaten siliniyor, yani bu
   * süzgeç orada bir şey değiştirmiyor — yalnız iki akış da aynı yönde davranmış oluyor.
   */
  const heroes = await runner.execute<Record<string, unknown>>(sql`
    WITH ordered AS (
      SELECT h.id,
             (h.level::bigint * 1000000000 + LEAST(h.xp, 999999999)) AS score,
             RANK() OVER (ORDER BY h.level DESC, h.xp DESC, h.id ASC) AS rank
        FROM heroes h JOIN players p ON p.id = h.player_id
       WHERE h.world_id = ${worldId} AND p.deleted_at IS NULL
    )
    INSERT INTO rankings (world_id, kind, subject_id, rank, prev_rank, score, taken_at)
    SELECT ${worldId}, 'hero', o.id, o.rank, NULL, o.score, ${ts}::timestamptz FROM ordered o
    ON CONFLICT (world_id, kind, subject_id) DO UPDATE
      SET prev_rank = rankings.rank,
          rank = EXCLUDED.rank,
          score = EXCLUDED.score,
          taken_at = EXCLUDED.taken_at
    RETURNING subject_id
  `);

  /**
   * ⭐ İTTİFAK SIRALAMASI (§13.15b, 2026-07-30) — puan = üyelerin puan TOPLAMI (kullanıcı
   * kuralı). Yasaklı oyuncular oyuncu sıralamasından düştüğü gibi toplamdan da düşer.
   * Üyesiz ittifak kalamaz (dağıtma siliyor) ama LEFT JOIN yine de 0 toplamla dayanıklı.
   *
   * ⚠️ Süzgeçte `alliance_score_excluded` var, `ranking_excluded` YOK — ikisi ayrı sorulara
   * cevap veriyor (§0036). Oyuncu sıralamasından gizlenen bir yönetici, ittifakında gerçekten
   * oynuyorsa puanı takımının toplamına katılmaya devam edebilmeli; ikisini birden istemek
   * ayrı bir seçim.
   */
  const alliances = await runner.execute<Record<string, unknown>>(sql`
    WITH totals AS (
      SELECT a.id, COALESCE(
               SUM(p.score) FILTER (
                 WHERE p.banned_at IS NULL AND p.alliance_score_excluded = false
               ), 0) AS score
        FROM alliances a
        LEFT JOIN players p ON p.alliance_id = a.id
       WHERE a.world_id = ${worldId}
       GROUP BY a.id
    ), ordered AS (
      SELECT id, score, RANK() OVER (ORDER BY score DESC, id ASC) AS rank FROM totals
    )
    INSERT INTO rankings (world_id, kind, subject_id, rank, prev_rank, score, taken_at)
    SELECT ${worldId}, 'alliance', o.id, o.rank, NULL, o.score, ${ts}::timestamptz FROM ordered o
    ON CONFLICT (world_id, kind, subject_id) DO UPDATE
      SET prev_rank = rankings.rank,
          rank = EXCLUDED.rank,
          score = EXCLUDED.score,
          taken_at = EXCLUDED.taken_at
    RETURNING subject_id
  `);

  const entries = players.length + heroes.length + alliances.length;
  await runner.execute(sql`
    INSERT INTO ranking_runs (world_id, taken_at, entries)
    VALUES (${worldId}, ${ts}::timestamptz, ${entries})
    ON CONFLICT (world_id, taken_at) DO UPDATE SET entries = EXCLUDED.entries
  `);
  return entries;
}

/** Son anlık görüntünün zamanı (hiç alınmadıysa `null`). */
export async function lastSnapshotAt(runner: Runner, worldId: number): Promise<Date | null> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT MAX(taken_at) AS taken_at FROM ranking_runs WHERE world_id = ${worldId}
  `);
  const v = rows[0]?.['taken_at'];
  return v == null ? null : new Date(String(v));
}

/**
 * Bir sonraki `ranking_snapshot` görevini yazar (varsa dokunmaz).
 *
 * Tekillik anahtarı **anlık görüntü anıdır** (`ranking:<iso>`) → worker kaç kez yeniden başlarsa
 * başlasın aynı ana ikinci bir görev yazılamaz.
 *
 * ⚠️⚠️ **`gameNow` YERİNE `ctx.at` GEÇMEK ZİNCİRİ ÖLDÜRÜR — canlıda yaşandı (2026-08-05).**
 * Çağıran, elindeki görevin VADESİNDEN önceki bir an verirse `nextSnapshotAt` **o görevin
 * kendi yuvasını** döndürür, anahtar çakışır, `DO NOTHING` çalışır ve **hiç yeni görev
 * yazılmaz**. Bu fonksiyon "bundan sonrasını kur" demektir; parametre her zaman zincirin
 * ilerlemesini istediğin ANDAN sonrası olmalı. Aynı yuvayı yeniden denemek için
 * `requeueSnapshot` var.
 */
export async function scheduleSnapshot(
  runner: Runner, worldId: number, gameNow: Date,
): Promise<Date> {
  const at = nextSnapshotAt(gameNow);
  await runner.execute(sql`
    INSERT INTO missions (world_id, type, status, execute_at, payload, idempotency_key)
    VALUES (${worldId}, 'ranking_snapshot', 'scheduled', ${at.toISOString()}::timestamptz,
            '{}'::jsonb, ${`ranking:${at.toISOString()}`})
    ON CONFLICT (world_id, idempotency_key) DO NOTHING
  `);
  return at;
}

/** Aynı yuvayı yeniden denemenin üst sınırı — sonsuz döngüye karşı. */
export const MAX_SNAPSHOT_RETRY = 3;

/**
 * ⭐ AYNI YUVAYI YENİDEN KUYRUĞA AL (2026-08-05).
 *
 * İleri-vade emniyeti bir görevi atladığında o dönemin görüntüsü **kaybolmamalı**: görev
 * vadesi değişmeden geri konuyor, yalnız tekillik anahtarına deneme eki geliyor
 * (`ranking:<iso>#retry1`). Böylece 16:00'ın görüntüsü yine 16:00 damgasıyla alınır.
 *
 * ⚠️ Anahtara ek koymak ŞART: eski anahtar atlanan görevin üzerinde duruyor ve `DO NOTHING`
 * yeni satırı sessizce yutardı — zincirin ölme sebebi tam olarak buydu.
 *
 * @returns yeni satır yazıldıysa `true`; deneme hakkı bittiyse `false`
 */
export async function requeueSnapshot(
  runner: Runner, worldId: number, dueAt: Date, attempt: number,
): Promise<boolean> {
  if (attempt > MAX_SNAPSHOT_RETRY) return false;
  const iso = dueAt.toISOString();
  await runner.execute(sql`
    INSERT INTO missions (world_id, type, status, execute_at, payload, idempotency_key)
    VALUES (${worldId}, 'ranking_snapshot', 'scheduled', ${iso}::timestamptz,
            ${JSON.stringify({ retryOf: iso, attempt })}::jsonb,
            ${`ranking:${iso}#retry${attempt}`})
    ON CONFLICT (world_id, idempotency_key) DO NOTHING
  `);
  return true;
}

/**
 * ⭐ ZİNCİR BEKÇİSİ (2026-08-05) — "bu dünyada bekleyen anlık görüntü görevi var mı?"
 *
 * ⚠️ Bu sorunun sorulması gerektiğini canlı öğretti: zincir koptuğunda sistem bunu **hiçbir
 * yerden** fark etmiyordu. `ensureRankingSchedule` yalnız worker açılışında koşuyor, yani
 * kopma bir sonraki yeniden başlatmaya kadar sürüyor — canlıda 15 saat sürdü.
 */
export async function hasPendingSnapshot(runner: Runner, worldId: number): Promise<boolean> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT 1 FROM missions
     WHERE world_id = ${worldId} AND type = 'ranking_snapshot' AND status = 'scheduled'
     LIMIT 1
  `);
  return rows.length > 0;
}
