/**
 * `ranking_snapshot` görevi — sıralamayı dondurur ve **bir sonrakini kendisi yazar**.
 *
 * Zincirin ayrı bir zamanlayıcıya değil görev kuyruğuna asılmasının sebebi §1'deki sözleşme:
 * `ctx.at` oyun saatinde görevin VADESİDİR. Worker 40 dakika kapalı kalıp sonra açılırsa anlık
 * görüntü yine **08:00 damgasıyla** yazılır, "worker'ın uyandığı an" damgasıyla değil — yoksa
 * sıralama saatleri her kesintiden sonra biraz daha kayardı.
 */
import { sql } from 'drizzle-orm';
import { toDate, type Db } from '../db/client.ts';
import type { MissionHandler, Tx } from '../missions/handler-registry.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import {
  hasPendingSnapshot, lastSnapshotAt, previousSnapshotAt, requeueSnapshot, scheduleSnapshot,
  takeSnapshot,
} from './ranking.service.ts';

/**
 * Görev transaction'ının içinden oyun saati. `GameClockService.read()` ile aynı ifade ama `Tx`
 * üzerinde çalışıyor — servis `Db` istiyor, görev bağlamında elimizde `Tx` var.
 *
 * ⚠️ 0043'ten sonra formül `COALESCE(paused_at, now())`e indi (tek zaman çizgisi). `paused_at`
 * kelepçesi KORUNUYOR: bakımda saat donmazsa ileri-vade emniyeti (`:62` civarı) yanlış karar verir.
 */
async function gameNowOf(tx: Tx, worldId: number): Promise<Date> {
  const [row] = await tx.execute<Record<string, unknown>>(sql`
    SELECT COALESCE(paused_at, now()) AS at FROM worlds WHERE id = ${worldId}
  `);
  if (!row) throw new Error(`Dünya bulunamadı: ${worldId}`);
  return toDate(row['at']);
}

/**
 * Saatin iki ucunu birden okur: veritabanı ve süreç.
 *
 * ⚠️ Yalnız teşhis için. `claimDue` vadeyi SQL'de kıyaslıyor (`mission.repository.ts:69`),
 * yani bir görevin erken alınabilmesi için ya `now()` ya `clock_offset_ms` ya da `paused_at`
 * beklenmedik bir değer taşımalı. Hangisi olduğunu ancak üçünü de aynı anda kaydedince
 * öğrenebiliriz — 2026-08-03 ve 2026-08-05 olaylarında elimizde bu veri yoktu.
 */
async function clockDiagnostics(tx: Tx, worldId: number): Promise<Record<string, unknown>> {
  const [row] = await tx.execute<Record<string, unknown>>(sql`
    SELECT now() AS db_now, paused_at, clock_offset_ms FROM worlds WHERE id = ${worldId}
  `);
  return {
    dbNow: row?.['db_now'] == null ? null : toDate(row['db_now']).toISOString(),
    processNow: new Date().toISOString(),
    pausedAt: row?.['paused_at'] == null ? null : toDate(row['paused_at']).toISOString(),
    clockOffsetMs: row?.['clock_offset_ms'] == null ? null : Number(row['clock_offset_ms']),
  };
}

/**
 * ⭐ İLERİ VADE EMNİYETİ — anlık görüntü GERİ ALINAMAZ bir yazmadır.
 *
 * Her koşum `prev_rank`i kaydırır; yanlış anda alınan bir görüntü o dönemin "değişim (▲2)"
 * sütununu sonsuza dek yok eder. 2026-08-03'te canlıda tam bu oldu: vadesi 16:00 olan görev
 * 08:12'de çalıştı ve 16:00 damgasıyla yazdı. Asıl neden kapatıldı (`GAME_NOW_SQL`), bu ikinci
 * kapı ise ucuz: hangi yoldan gelirse gelsin, gelecekteki bir vade **uygulanmaz**.
 *
 * ⚠️ Tolerans geriye değil İLERİYE bakıyor. Geç kalmak normaldir ve zararsızdır (worker kapalı
 * kalmış olabilir — `ctx.at` yine doğru damgayı taşır); erken çalışmak ise her zaman hatadır.
 */
const MAX_ILERI_VADE_MS = 3_600_000;

export function createRankingSnapshotHandler(): MissionHandler {
  return async (ctx) => {
    const gameNow = await gameNowOf(ctx.tx, ctx.worldId);
    if (ctx.at.getTime() - gameNow.getTime() > MAX_ILERI_VADE_MS) {
      // eslint-disable-next-line no-console
      console.error(
        `[ranking] görev vadesi gelecekte (${ctx.at.toISOString()} > ${gameNow.toISOString()}) — atlandı`,
      );

      /**
       * ⚠️⚠️ **ZİNCİRİN ÖLDÜĞÜ YER BURASIYDI (canlı, 2026-08-05).** Eski kod
       * `scheduleSnapshot(ctx.tx, worldId, gameNow)` çağırıyordu. `gameNow` bu dalda TANIMI
       * GEREĞİ `ctx.at`ten küçük — zaten o yüzden buradayız. `nextSnapshotAt(gameNow)` bu
       * durumda **atlanan görevin kendi yuvasını** döndürüyor, tekillik anahtarı çakışıyor,
       * `ON CONFLICT DO NOTHING` yeni satırı yutuyor ve **zincir sessizce ölüyor**.
       * Canlıda 5 Ağustos 06:42'de tam bu oldu ve sıralama 15 saat dondu.
       *
       * ⭐ Doğrusu: aynı yuvayı **vadesi değişmeden** geri koymak. Böylece 16:00'ın görüntüsü
       * kaybolmuyor, 16:00 damgasıyla alınıyor. İleri sarmıyoruz çünkü sorun görevin kendisi
       * değil, **erken çalıştırılmış olması**.
       */
      const attempt = Number(
        (ctx.mission.payload as Record<string, unknown> | null)?.['attempt'] ?? 0,
      ) + 1;
      const requeued = await requeueSnapshot(ctx.tx, ctx.worldId, ctx.at, attempt);
      /**
       * Deneme hakkı biterse (aynı görev üst üste erken tetikleniyorsa) yuvayı bırakıp
       * ilerliyoruz — ama `ctx.at`ten sonrasına, `gameNow`dan değil. ⚠️ Bu ayrım kritik:
       * `gameNow` yine aynı anahtarı üretir ve zincir yine ölürdü.
       */
      if (!requeued) await scheduleSnapshot(ctx.tx, ctx.worldId, ctx.at);

      /**
       * ⚠️ Denetim kaydına SAATİN HER İKİ UCU da yazılıyor. Erken tetiklenmenin kök nedeni
       * hâlâ bilinmiyor (`mission.repository.ts:47-68`de aynı sınıf hata 2026-08-03'te de
       * yaşandı) ve `claimDue` kıyaslaması SQL'de olduğu için kod yolundan İMKÂNSIZ görünüyor.
       * Bir daha olursa sebebi tek satırdan okumak için ham girdiler burada duruyor.
       */
      const clock = await clockDiagnostics(ctx.tx, ctx.worldId);
      await ctx.audit({
        action: 'ranking.snapshot.skipped',
        after: {
          dueAt: ctx.at.toISOString(),
          gameNow: gameNow.toISOString(),
          reason: 'future_due',
          attempt,
          requeued,
          clock,
        },
      });
      return;
    }

    const entries = await takeSnapshot(ctx.tx, ctx.worldId, ctx.at);
    const next = await scheduleSnapshot(ctx.tx, ctx.worldId, ctx.at);

    await ctx.emit('ranking:updated', {
      worldId: ctx.worldId,
      takenAt: ctx.at.toISOString(),
      nextAt: next.toISOString(),
      entries,
    });
    await ctx.audit({
      action: 'ranking.snapshot',
      after: { takenAt: ctx.at.toISOString(), nextAt: next.toISOString(), entries },
    });
  };
}

/**
 * Worker açılışında zinciri garanti eder.
 *
 * İki şey yapar ve ikisi de tekrar çalıştırılmaya dayanıklıdır:
 *  1. Dünyanın **hiç** anlık görüntüsü yoksa geçmiş en yakın saate (00/08/16) bir tane alır —
 *     aksi hâlde yeni kurulan bir dünyada Sıralamalar ekranı 8 saate kadar bomboş kalırdı.
 *  2. Bir sonraki anlık görüntü görevini yazar (tekillik anahtarı sayesinde kopyalanmaz).
 */
export async function ensureRankingSchedule(db: Db, worldId: number): Promise<void> {
  const exists = await db.execute<Record<string, unknown>>(sql`
    SELECT 1 FROM worlds WHERE id = ${worldId}
  `);
  if (exists.length === 0) return;                 // dünya henüz kurulmamış

  const gameNow = await new GameClockService(db).gameNow(worldId);
  if (await lastSnapshotAt(db, worldId) == null) {
    await takeSnapshot(db, worldId, previousSnapshotAt(gameNow));
  }
  await scheduleSnapshot(db, worldId, gameNow);
}

/**
 * ⭐ ZİNCİR BEKÇİSİ (2026-08-05) — zincir koparsa **kendi kendine** kurar.
 *
 * ⚠️ Neden gerekli: `ensureRankingSchedule` yalnız worker AÇILIŞINDA koşuyordu. Zincir çalışma
 * sırasında koptuğunda (canlıda oldu) sistem bunu hiçbir yerden fark etmiyor ve bir sonraki
 * yeniden başlatmaya kadar sıralama donuyordu — 15 saat sürdü ve o dönemin üç yuvası kalıcı
 * olarak kayboldu.
 *
 * ⚠️ Ucuz olmak zorunda: scheduler turu saniyede bir koşuyor. Bu yüzden hem `minIntervalMs`
 * ile seyreltiliyor hem de sorgu tek satırlık bir `LIMIT 1` varlık kontrolü.
 *
 * ⚠️ Yazma tarafı zaten korumalı: tekillik anahtarı ikinci bir görev yazılmasını engelliyor,
 * yani bekçi yanlış zamanda koşsa bile kopya üretemez.
 */
export function createRankingWatchdog(db: Db, minIntervalMs = 900_000): (worldId: number) => Promise<void> {
  let lastCheck = 0;
  return async (worldId: number): Promise<void> => {
    const now = Date.now();
    if (now - lastCheck < minIntervalMs) return;
    lastCheck = now;
    if (await hasPendingSnapshot(db, worldId)) return;
    // eslint-disable-next-line no-console
    console.error('[ranking] bekleyen anlık görüntü görevi yok — zincir yeniden kuruluyor');
    await ensureRankingSchedule(db, worldId);
  };
}
