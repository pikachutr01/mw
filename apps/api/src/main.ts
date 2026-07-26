import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.ts';
import { createDb } from './db/client.ts';
import { createWorker, type Worker } from './worker/worker.ts';

/**
 * Küçük sunucu profili (§4.0): `ROLE=all` iken api + worker AYNI süreçte çalışır.
 * `ROLE=api` yalnız HTTP, `ROLE=worker` yalnız görev döngüsü.
 */
async function bootstrap(): Promise<void> {
  const role = process.env['ROLE'] ?? 'all';
  const runApi = role === 'all' || role === 'api';
  const runWorker = role === 'all' || role === 'worker';

  let worker: Worker | null = null;
  let closeDb: (() => Promise<void>) | null = null;

  if (runWorker) {
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('DATABASE_URL tanımsız — worker veritabanı olmadan çalışamaz.');
    const handle = createDb(url);
    closeDb = handle.close;
    worker = createWorker(handle.db, {
      worldId: Number(process.env['WORLD_ID'] ?? 1),
      workerId: `worker-${process.pid}`,
      pollIntervalMs: Number(process.env['POLL_INTERVAL_MS'] ?? 1000),
    });
    worker.start();
    // eslint-disable-next-line no-console
    console.log(`[mobiwar] worker çalışıyor (dünya ${process.env['WORLD_ID'] ?? 1})`);
  }

  if (runApi) {
    const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
    app.enableShutdownHooks();
    const port = Number(process.env['PORT'] ?? 3002);
    await app.listen({ port, host: '0.0.0.0' });
    // eslint-disable-next-line no-console
    console.log(`[mobiwar] api hazır → http://localhost:${port}/healthz  (ROLE=${role})`);
  }

  // Graceful shutdown: çalışan görev turu bitene kadar bekle → yarım iş kalmaz.
  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`[mobiwar] ${signal} alındı, kapatılıyor…`);
    await worker?.stop();
    await closeDb?.();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
