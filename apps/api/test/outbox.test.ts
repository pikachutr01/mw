/**
 * ⭐ OUTBOX testleri: "savaş oldu ama rapor gitmedi" durumunun imkânsızlığı.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/db/client.ts';
import { echoHandler } from '../src/missions/echo.handler.ts';
import { HandlerRegistry } from '../src/missions/handler-registry.ts';
import { SchedulerService } from '../src/missions/scheduler.service.ts';
import { OutboxDispatcher, type OutboxRow } from '../src/outbox/outbox.dispatcher.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { clearOutbox, createWorld, enqueue, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let clock: GameClockService;
let registry: HandlerRegistry;

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  registry = new HandlerRegistry().register('echo', echoHandler);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await clearOutbox(h);
});

function scheduler(): SchedulerService {
  return new SchedulerService(h.db, clock, registry, { worldId, retryBackoffMs: 0 });
}

async function produceOne(label = 'x'): Promise<void> {
  await enqueue(h, { worldId, executeAt: new Date(Date.now() - 1000), label });
  await scheduler().tick();
}

describe('outbox teslimi', () => {
  it('kayıtlı kanala teslim edilir ve işaretlenir', async () => {
    await produceOne('teslim');
    const seen: OutboxRow[] = [];
    const d = new OutboxDispatcher(h.db).on('echo:done', async (row) => { seen.push(row); });

    const r = await d.tick();

    expect(r.dispatched).toBe(1);
    expect(seen[0]?.payload['label']).toBe('teslim');
    expect(await d.pendingCount()).toBe(0);
  });

  it('kanal kayıtlı değilse satır BEKLER, kaybolmaz', async () => {
    await produceOne();
    const d = new OutboxDispatcher(h.db);   // hiç kanal yok

    const r = await d.tick();

    expect(r.dispatched).toBe(0);
    expect(r.skipped).toBe(1);
    expect(await d.pendingCount()).toBe(1);
  });

  it('teslim hatası satırı tüketmez, denemeyi artırır', async () => {
    await produceOne();
    const d = new OutboxDispatcher(h.db, { maxAttempts: 3 })
      .on('echo:done', async () => { throw new Error('WS kapalı'); });

    const first = await d.tick();
    expect(first.failed).toBe(1);
    expect(await d.pendingCount()).toBe(1);

    const rows = await h.db.execute<{ attempts: number; last_error: string }>(sql`
      SELECT attempts, last_error FROM outbox WHERE world_id = ${worldId}
    `);
    expect(Number(rows[0]!.attempts)).toBe(1);
    expect(rows[0]!.last_error).toMatch(/WS kapalı/);
  });

  it('deneme hakkı tükenen satır ölü mektuba düşer ve tekrar denenmez', async () => {
    await produceOne();
    const d = new OutboxDispatcher(h.db, { maxAttempts: 2 })
      .on('echo:done', async () => { throw new Error('kalıcı hata'); });

    await d.tick();
    await d.tick();
    const third = await d.tick();

    expect(third.failed).toBe(0);            // artık alınmıyor
    expect(await d.deadLetterCount()).toBe(1);
  });

  it('`*` kanalı tüm konuları yakalar', async () => {
    await produceOne();
    const topics: string[] = [];
    const d = new OutboxDispatcher(h.db).on('*', async (row) => { topics.push(row.topic); });

    await d.tick();

    expect(topics).toEqual(['echo:done']);
  });

  it('teslim SIRASI id sırasıdır (olaylar oluştukları sırada gider)', async () => {
    for (const label of ['bir', 'iki', 'uc']) {
      await enqueue(h, { worldId, executeAt: new Date(Date.now() - 5000), label });
    }
    await scheduler().tick();

    const order: string[] = [];
    const d = new OutboxDispatcher(h.db).on('*', async (row) => {
      order.push(String(row.payload['label']));
    });
    await d.tick();

    expect(order).toEqual(['bir', 'iki', 'uc']);
  });
});
