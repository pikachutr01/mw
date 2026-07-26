import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.ts';
import { SimulateController } from './simulate/simulate.controller.ts';

/**
 * Faz 0 iskeleti. Faz 1'de eklenecekler: WorldModule (oyun saati + bakım modu),
 * MissionModule (görev kuyruğu), OutboxModule. Faz 2'de AuthModule/CityModule,
 * Faz 2 sonunda ChatModule (izole gateway, §13.12.3).
 */
@Module({
  controllers: [HealthController, SimulateController],
})
export class AppModule {}
