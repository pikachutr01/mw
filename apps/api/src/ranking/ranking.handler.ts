/**
 * `ranking_snapshot` görevi — sıralamayı dondurur ve **bir sonrakini kendisi yazar**.
 *
 * Zincirin ayrı bir zamanlayıcıya değil görev kuyruğuna asılmasının sebebi §1'deki sözleşme:
 * `ctx.at` oyun saatinde görevin VADESİDİR. Worker 40 dakika kapalı kalıp sonra açılırsa anlık
 * görüntü yine **08:00 damgasıyla** yazılır, "worker'ın uyandığı an" damgasıyla değil — yoksa
 * sıralama saatleri her kesintiden sonra biraz daha kayardı.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { MissionHandler } from '../missions/handler-registry.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { lastSnapshotAt, previousSnapshotAt, scheduleSnapshot, takeSnapshot } from './ranking.service.ts';

export function createRankingSnapshotHandler(): MissionHandler {
  return async (ctx) => {
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
