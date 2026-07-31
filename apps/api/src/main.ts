import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Server as HttpServer } from 'node:http';
import { AppModule } from './app.module.ts';
import { TokenService } from './auth/token.service.ts';
import { createDb } from './db/client.ts';
import { mailEnabled } from './mail/mail.limits.ts';
import { defaultMailSender } from './mail/mail.service.ts';
import { pushEnabled } from './notify/notify.limits.ts';
import { NotifyService, defaultPushSender } from './notify/notify.service.ts';
import { RealtimeBus } from './realtime/realtime.bus.ts';
import { SettingsService } from './settings/settings.service.ts';
import { RealtimeGateway } from './realtime/realtime.gateway.ts';
import { getGateway, setGateway } from './realtime/gateway-registry.ts';
import { createWorker, type Worker } from './worker/worker.ts';

/**
 * Küçük sunucu profili (§4.0): `ROLE=all` iken api + worker AYNI süreçte çalışır.
 * `ROLE=api` yalnız HTTP + WS, `ROLE=worker` yalnız görev döngüsü.
 *
 * ⭐ Gerçek zamanlı yol **Postgres LISTEN/NOTIFY** üzerinden gider → roller ayrı süreçlere
 * bölündüğünde de kod değişmeden çalışır (worker NOTIFY eder, api LISTEN eder). Redis zorunlu
 * değil; küçük sunucu profilinde ikinci bir altyapı bağımlılığı istemiyoruz.
 */
async function bootstrap(): Promise<void> {
  const role = process.env['ROLE'] ?? 'all';
  const runApi = role === 'all' || role === 'api';
  const runWorker = role === 'all' || role === 'worker';

  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL tanımsız.');

  let worker: Worker | null = null;
  let gateway: RealtimeGateway | null = null;
  const handle = createDb(url);
  const bus = new RealtimeBus(handle.sql);

  /**
   * ⭐ AYARLAR — açılışta bir kez yüklenir, sonra **bellekten** okunur (§admin Faz 1).
   * Ham bağlantı `LISTEN mw_settings` için veriliyor: panelden bir değer kaydedilince tüm
   * süreçler milisaniyeler içinde tazeleniyor, yeniden başlatma gerekmiyor.
   *
   * ⚠️ Hem `ROLE=api` hem `ROLE=worker` profilinde çalışır ve **her ikisinde de gerekli**:
   * limitleri worker da okuyor (bildirim birleştirme, posta kotaları).
   */
  const settings = new SettingsService(handle.db, handle.sql);
  await settings.start();

  if (runWorker) {
    /**
     * ⭐ BİLDİRİM KATMANI (§7.2). Çevrimiçilik `getGateway()` üzerinden **teslim anında**
     * okunur — worker gateway'den önce kurulduğu için referans değil, fonksiyon geçiliyor.
     *
     * ⚠️ `ROLE=worker` ayrımında `getGateway()` daima `null`'dır (kayıt yalnız API sürecinde
     * doldurulur) → herkes çevrimdışı sayılır ve WS açıkken de push gider. Dağıtım profilimiz
     * `ROLE=all`; aşağıdaki uyarı bu tuzağı sessiz bırakmamak için.
     */
    if (role === 'worker' && pushEnabled()) {
      // eslint-disable-next-line no-console
      console.warn(
        '[mobiwar] UYARI: ROLE=worker ile push açık. Bu süreç oyuncuların çevrimiçi olup '
        + 'olmadığını GÖREMEZ (gateway kaydı yalnız API sürecinde dolu) → WS bağlıyken de push '
        + 'gider. Tek süreçli profil için ROLE=all kullan.',
      );
    }
    const notifier = new NotifyService(handle.db, {
      bus,
      isOnline: (playerId) => getGateway()?.isOnline(playerId) ?? false,
      sender: defaultPushSender(),
    });

    worker = createWorker(handle.db, {
      worldId: Number(process.env['WORLD_ID'] ?? 1),
      workerId: `worker-${process.pid}`,
      pollIntervalMs: Number(process.env['POLL_INTERVAL_MS'] ?? 1000),
      bus,
      notifier,
      // Anahtar yoksa `LogSender`: mail gövdesi konsola basılır, akış yine uçtan uca denenir.
      mail: defaultMailSender(),
    });
    worker.start();
    // eslint-disable-next-line no-console
    console.log(
      `[mobiwar] worker çalışıyor (dünya ${process.env['WORLD_ID'] ?? 1}) · `
      + `push ${pushEnabled() ? 'AÇIK' : 'kapalı (VAPID anahtarı yok)'} · `
      + `posta ${mailEnabled() ? 'Resend' : 'konsol (RESEND_API_KEY yok)'}`,
    );
  }

  if (runApi) {
    const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
    app.enableShutdownHooks();
    const port = Number(process.env['PORT'] ?? 3002);
    await app.listen({ port, host: '0.0.0.0' });

    // Soket sunucusu Fastify'ın HTTP sunucusuna takılır → tek port, tek köken, CORS yok.
    gateway = new RealtimeGateway(handle.db, app.get(TokenService), bus);
    await gateway.attach(app.getHttpServer() as HttpServer);
    // İttifak uçları çevrimiçi rozeti + oda senkronu için aynı instance'a buradan ulaşır.
    setGateway(gateway);

    // eslint-disable-next-line no-console
    console.log(`[mobiwar] api hazır → http://localhost:${port}/healthz  ·  ws /ws  (ROLE=${role})`);
  }

  // Graceful shutdown: çalışan görev turu bitene kadar bekle → yarım iş kalmaz.
  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`[mobiwar] ${signal} alındı, kapatılıyor…`);
    await settings.stop();
    await gateway?.close();
    await worker?.stop();
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
