import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminController } from './admin/admin.controller.ts';
import { AdminGuard, AdminStepUpGuard } from './admin/admin.guard.ts';
import { AdminActionsController } from './admin/admin.actions.controller.ts';
import { AdminBulkController } from './admin/admin.bulk.controller.ts';
import { AdminDbController } from './admin/admin.db.controller.ts';
import { AdminModerationController } from './admin/admin.moderation.controller.ts';
import { AdminOpsController } from './admin/admin.ops.controller.ts';
import { AdminPlayersController } from './admin/admin.players.controller.ts';
import { AdminWorldController } from './admin/admin.world.controller.ts';
import { SettingsService } from './settings/settings.service.ts';
import { AllianceController } from './alliance/alliance.controller.ts';
import { AuthController } from './auth/auth.controller.ts';
import { AuthGuard } from './auth/auth.guard.ts';
import { PublicRateLimitGuard } from './auth/rate-limit.ts';
import { OptionalAuthGuard } from './auth/optional-auth.guard.ts';
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
import { VacationController } from './vacation/vacation.controller.ts';
import { VacationService } from './vacation/vacation.service.ts';
import { QueueService } from './queues/queue.service.ts';
import { SimulateController } from './simulate/simulate.controller.ts';
import { GameClockService } from './world/game-clock.service.ts';
import { MaintenanceInterceptor } from './world/maintenance.interceptor.ts';
import { WorldStateService } from './world/world-state.service.ts';
import { WorldController } from './world/world.controller.ts';
import { WorldsPublicController } from './world/worlds-public.controller.ts';

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
    MissionController, BattleController, WorldController, WorldsPublicController, CommandController,
    NotifyController,
    VacationController,
    // ⭐ Admin uçları aynı süreçte, ayrı guard'ın arkasında (§admin Faz 0).
    AdminController, AdminWorldController, AdminModerationController,
    AdminActionsController, AdminDbController, AdminOpsController, AdminPlayersController,
    AdminBulkController,
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
    /**
     * ⭐ Katalog sabitleri panelden (§admin Faz 5): servisler `settings.catalog(worldId)`i
     * FONKSİYON olarak alıyor — panelden kaydedilen fiyat/süre bir sonraki istekte geçerli
     * olsun diye. Fonksiyon verilmezse formüller varsayılanı kullanır ve davranış değişmez.
     */
    {
      provide: CityService,
      useFactory: (db: Db, s: SettingsService) => new CityService(db, (w) => s.catalog(w)),
      inject: [DB, SettingsService],
    },
    /**
     * ⚠️ `VacationService` uygulamanın **CityService örneğini** alıyor (yeni bir tane kurmuyor):
     * tatile girerken kaynak son kez materyalize ediliyor ve o hesap panelden değiştirilebilen
     * katalog sabitlerine bağlı. Kendi örneğini kursaydı varsayılan üretim hızlarını kullanır,
     * hızlandırılmış bir dünyada kaynağı sessizce yanlış yazardı.
     */
    {
      provide: VacationService,
      useFactory: (db: Db, c: CityService) => new VacationService(db, c),
      inject: [DB, CityService],
    },
    {
      provide: CaveService,
      useFactory: (db: Db, s: SettingsService) => new CaveService(db, (w) => s.catalog(w)),
      inject: [DB, SettingsService],
    },
    {
      provide: MissionService,
      // Nakliye/destek kaynağı şehirden düşerken tembel birikim uygulanmalı → CityService şart.
      useFactory: (db: Db, cities: CityService) => new MissionService(db, cities),
      inject: [DB, CityService],
    },
    {
      provide: QueueService,
      useFactory: (db: Db, cities: CityService, s: SettingsService) =>
        new QueueService(db, cities, (w) => s.catalog(w)),
      inject: [DB, CityService, SettingsService],
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
    /**
     * ⭐ HIZ SINIRI — GLOBAL guard, ama **yalnız kimliksiz uçlarda** iş yapıyor
     * (`rate-limit.ts` içindeki dar liste). Guard olması burada DOĞRU: `AuthGuard`tan önce
     * koşması gerekiyor — sayaç, kimlik doğrulaması denenmeden önce işlemeli ki parola
     * deneme saldırısı argon2 doğrulamasını hiç tetiklemesin.
     */
    { provide: APP_GUARD, useClass: PublicRateLimitGuard },
    AuthGuard,
    OptionalAuthGuard,
    AdminGuard,
    AdminStepUpGuard,
  ],
})
export class AppModule {}
