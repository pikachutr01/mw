import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminController } from './admin/admin.controller.ts';
import { AdminGuard, AdminStepUpGuard } from './admin/admin.guard.ts';
import { AdminWorldController } from './admin/admin.world.controller.ts';
import { SettingsService } from './settings/settings.service.ts';
import { AllianceController } from './alliance/alliance.controller.ts';
import { AuthController } from './auth/auth.controller.ts';
import { AuthGuard } from './auth/auth.guard.ts';
import { AuthService } from './auth/auth.service.ts';
import { TokenService } from './auth/token.service.ts';
import { BattleController } from './battles/battle.controller.ts';
import { ChatController } from './chat/chat.controller.ts';
import { CityController } from './cities/city.controller.ts';
import { HeroController } from './heroes/hero.controller.ts';
import { CityService } from './cities/city.service.ts';
import { CaveService } from './cave/cave.service.ts';
import { CommandController } from './command/command.controller.ts';
import { createDb, type Db } from './db/client.ts';
import { DB } from './db/tokens.ts';
import { HealthController } from './health/health.controller.ts';
import { MissionController } from './missions/mission.controller.ts';
import { MissionService } from './missions/mission.service.ts';
import { NotifyController } from './notify/notify.controller.ts';
import { QueueService } from './queues/queue.service.ts';
import { SimulateController } from './simulate/simulate.controller.ts';
import { GameClockService } from './world/game-clock.service.ts';
import { MaintenanceInterceptor } from './world/maintenance.interceptor.ts';
import { WorldStateService } from './world/world-state.service.ts';
import { WorldController } from './world/world.controller.ts';

export { DB } from './db/tokens.ts';

/**
 * Faz 2 modülü. Bağımlılıklar elle kurulmuş fabrikalarla veriliyor — servislerin hiçbiri Nest'e
 * bağımlı değil (saf sınıflar), böylece testlerde Nest'i ayağa kaldırmadan doğrudan kullanılıyor.
 *
 * Faz 2'nin kalanı: Genel Sohbet (WS) ve web ekranları. **Özel mesajlaşma (DM) 2026-07-31'de
 * girdi** (`ChatController`); genel/ittifak kanalları aynı `chat_*` altyapısını kullanacak.
 */
@Module({
  controllers: [
    HealthController, SimulateController, AuthController, CityController,
    AllianceController, ChatController,
    HeroController,
    MissionController, BattleController, WorldController, CommandController,
    NotifyController,
    // ⭐ Admin uçları aynı süreçte, ayrı guard'ın arkasında (§admin Faz 0).
    AdminController, AdminWorldController,
  ],
  providers: [
    {
      provide: DB,
      useFactory: (): Db => {
        const url = process.env['DATABASE_URL'];
        if (!url) throw new Error('DATABASE_URL tanımsız.');
        return createDb(url).db;
      },
    },
    {
      provide: TokenService,
      useFactory: (): TokenService => new TokenService({
        accessSecret: process.env['JWT_ACCESS_SECRET'] ?? '',
        accessTtlSeconds: Number(process.env['ACCESS_TOKEN_TTL_SECONDS'] ?? 900),
      }),
    },
    { provide: GameClockService, useFactory: (db: Db) => new GameClockService(db), inject: [DB] },
    { provide: CityService, useFactory: (db: Db) => new CityService(db), inject: [DB] },
    { provide: CaveService, useFactory: (db: Db) => new CaveService(db), inject: [DB] },
    {
      provide: MissionService,
      // Nakliye/destek kaynağı şehirden düşerken tembel birikim uygulanmalı → CityService şart.
      useFactory: (db: Db, cities: CityService) => new MissionService(db, cities),
      inject: [DB, CityService],
    },
    {
      provide: QueueService,
      useFactory: (db: Db, cities: CityService) => new QueueService(db, cities),
      inject: [DB, CityService],
    },
    {
      provide: AuthService,
      useFactory: (db: Db, tokens: TokenService, clock: GameClockService) =>
        new AuthService(db, tokens, clock),
      inject: [DB, TokenService, GameClockService],
    },
    /**
     * ⭐ AYAR SERVİSİ — bellek-içi anlık görüntü. `main.ts` açılışta `start()` çağırıp ham
     * bağlantıyı veriyor (LISTEN için); burada yalnız DI kaydı var.
     *
     * ⚠️ Nest'in kendi örneği ile `main.ts`teki örnek AYRI olabilir (`ROLE=worker` profilinde
     * Nest hiç kalkmaz). İkisi de aynı DB'den okuyup aynı kanalı dinlediği için sorun değil:
     * anlık görüntü paylaşılan durum değil, **türetilmiş** durum.
     */
    { provide: SettingsService, useFactory: (db: Db) => new SettingsService(db), inject: [DB] },
    /**
     * ⭐ DÜNYA DURUMU — bakım kilidinin bellek-içi kaynağı. `SettingsService` ile aynı gerekçe
     * ve aynı uyarı: `main.ts` kendi örneğini `LISTEN` bağlantısıyla kuruyor, buradaki Nest
     * örneği ayrı olabilir. İkisi de aynı satırdan türetiliyor, paylaşılan durum yok.
     */
    { provide: WorldStateService, useFactory: (db: Db) => new WorldStateService(db), inject: [DB] },
    /**
     * ⭐ BAKIM KİLİDİ — GLOBAL. Interceptor seçilmesinin gerekçesi dosyanın başında; özeti:
     * global guard'lar `AuthGuard`tan ÖNCE koşuyor, interceptor'lar SONRA → kimlik hazır.
     */
    { provide: APP_INTERCEPTOR, useClass: MaintenanceInterceptor },
    AuthGuard,
    AdminGuard,
    AdminStepUpGuard,
  ],
})
export class AppModule {}
