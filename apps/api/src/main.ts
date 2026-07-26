import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.ts';

/**
 * Küçük sunucu profili (§4.0): ROLE=all iken api + worker AYNI süreçte çalışır.
 * Worker döngüsü Faz 1'de eklenecek; şimdilik yalnız HTTP.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.enableShutdownHooks();

  const port = Number(process.env['PORT'] ?? 3002);
  await app.listen({ port, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`[mobiwar] api hazır → http://localhost:${port}/healthz  (ROLE=${process.env['ROLE'] ?? 'all'})`);
}

void bootstrap();
