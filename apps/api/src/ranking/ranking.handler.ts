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
import { lastSnapshotAt, previousSnapshotAt, scheduleSnapshot, takeSnapshot } from './ranking.service.ts';

/**
 * Görev transaction'ının içinden oyun saati. `GameClockService.dbGameNow` ile aynı ifade
 * ama `Tx` üzerinde çalışıyor — servis `Db` istiyor ve görev bağlamında elimizde `Tx` var.
 */
async function gameNowOf(tx: Tx, worldId: number): Promise<Date> {
  const [row] = await tx.execute<Record<string, unknown>>(sql`
    SELECT (COALESCE(paused_at, now()) - (clock_offset_ms * interval '1 millisecond')) AS at
      FROM worlds WHERE id = ${worldId}
  `);
  if (!row) throw new Error(`Dünya bulunamadı: ${worldId}`);
  return toDate(row['at']);
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
       * ⚠️ Zincir yine de sürdürülüyor — `ctx.at` ile DEĞİL, gerçek oyun saatiyle. Erken
       * çalışan görevi sessizce düşürseydik bir sonraki görüntü hiç yazılmaz ve sıralama
       * worker yeniden başlayana kadar (`ensureRankingSchedule`) donardı: küçük bir hatayı
       * büyük bir hataya çevirmek olurdu.
       */
      await scheduleSnapshot(ctx.tx, ctx.worldId, gameNow);
      await ctx.audit({
        action: 'ranking.snapshot.skipped',
        after: { dueAt: ctx.at.toISOString(), gameNow: gameNow.toISOString(), reason: 'future_due' },
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
