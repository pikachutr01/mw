import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller.ts';
import { AuthGuard } from './auth/auth.guard.ts';
import { AuthService } from './auth/auth.service.ts';
import { TokenService } from './auth/token.service.ts';
import { BattleController } from './battles/battle.controller.ts';
import { CityController } from './cities/city.controller.ts';
import { CityService } from './cities/city.service.ts';
import { CaveService } from './cave/cave.service.ts';
import { CommandController } from './command/command.controller.ts';
import { createDb, type Db } from './db/client.ts';
import { DB } from './db/tokens.ts';
import { HealthController } from './health/health.controller.ts';
import { MissionController } from './missions/mission.controller.ts';
import { MissionService } from './missions/mission.service.ts';
import { QueueService } from './queues/queue.service.ts';
import { SimulateController } from './simulate/simulate.controller.ts';
import { GameClockService } from './world/game-clock.service.ts';
import { WorldController } from './world/world.controller.ts';

export { DB } from './db/tokens.ts';

/**
 * Faz 2 modülü. Bağımlılıklar elle kurulmuş fabrikalarla veriliyor — servislerin hiçbiri Nest'e
 * bağımlı değil (saf sınıflar), böylece testlerde Nest'i ayağa kaldırmadan doğrudan kullanılıyor.
 *
 * Faz 2'nin kalanı: Genel Sohbet (WS) ve web ekranları.
 */
@Module({
  controllers: [
    HealthController, SimulateController, AuthController, CityController,
    MissionController, BattleController, WorldController, CommandController,
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
    AuthGuard,
  ],
})
export class AppModule {}
