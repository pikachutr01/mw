import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { simulateRequest } from '@mobiwar/contracts';
import { simulate, type SimulateResult } from '@mobiwar/engine';

/**
 * Dahili savaş simülatörü (§0.0): gerçek savaşlarla AYNI motoru çağırır.
 * Kimlik gerektirmeyen tek oyun ucu — kaynak harcamaz, durumu değiştirmez.
 * `repeat` ile "aynı savaşı N kez çevir, dağılımı gör" doğal olarak gelir.
 */
@Controller('api/v1/simulate')
export class SimulateController {
  @Post()
  run(@Body() body: unknown): { results: SimulateResult[] } {
    const parsed = simulateRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const input = parsed.data;

    const baseSeed = input.seed ?? `sim-${Date.now()}-${Math.trunc(Math.random() * 1e9)}`;
    const results: SimulateResult[] = [];
    for (let i = 0; i < input.repeat; i++) {
      results.push(simulate({
        attacker: input.attacker,
        defender: input.defender,
        night: input.night,
        nightVisionAttacker: input.nightVisionAttacker,
        nightVisionDefender: input.nightVisionDefender,
        seed: input.repeat === 1 ? baseSeed : `${baseSeed}:${i}`,
      }));
    }
    return { results };
  }
}
