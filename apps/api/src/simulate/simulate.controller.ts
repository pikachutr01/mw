import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { simulateRequest } from '@mobilwar/contracts';
import { simulate, type SimulateInput, type SimulateResult } from '@mobilwar/engine';
import type { AuthedRequest } from '../auth/auth.guard.ts';
import { OptionalAuthGuard } from '../auth/optional-auth.guard.ts';
import { SettingsService } from '../settings/settings.service.ts';

/**
 * Dahili savaş simülatörü (§0.0): gerçek savaşlarla AYNI motoru çağırır.
 * Kimlik gerektirmeyen tek oyun ucu — kaynak harcamaz, durumu değiştirmez.
 * `repeat` ile "aynı savaşı N kez çevir, dağılımı gör" doğal olarak gelir.
 *
 * ⭐ Faz 4'ten beri **dünyanın etkin motor ayarlarıyla** koşuyor. Aksi hâlde panelden bir
 * sabit değiştirildiğinde simülatör ile gerçek savaş farklı sonuç verir ve simülatör
 * güvenilmez hâle gelirdi — oysa denge ayarının tek pratik ölçüm aracı o.
 */
/**
 * ⚠️ `OptionalAuthGuard` — `AuthGuard` DEĞİL. Uç kimliksiz kalmaya devam ediyor (§0.0), ama
 * token varsa dünya bağlamı doluyor. Bu guard olmadan `req.player` hiç dolmuyordu ve
 * `worldId` daima 0 kalıyordu: dünya bazlı denge ayarı simülatöre HİÇ ulaşmıyordu.
 */
@Controller('api/v1/simulate')
@UseGuards(OptionalAuthGuard)
export class SimulateController {
  constructor(private readonly settings: SettingsService) {}

  @Post()
  run(@Body() body: unknown, @Req() req: AuthedRequest): { results: SimulateResult[] } {
    const parsed = simulateRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const input = parsed.data;

    /**
     * ⚠️ Uç **kimliksiz** olduğu için dünya çoğu zaman bilinmez; o durumda genel katman
     * (dünya 0) kullanılıyor. Dünyayı istek GÖVDESİNDEN okumak yanlış olurdu: dışarıdan
     * başka bir dünyanın denge ayarlarını seçmeye izin vermek demekti (§13.12.1b gerekçesi).
     */
    const cfg = this.settings.combat(req.player?.worldId ?? 0);

    const baseSeed = String(input.seed ?? `sim-${Date.now()}-${Math.trunc(Math.random() * 1e9)}`);
    const results: SimulateResult[] = [];
    for (let i = 0; i < input.repeat; i++) {
      const seed = input.repeat === 1 ? baseSeed : `${baseSeed}:${i}`;
      results.push(simulate(toSimulateInput(input, seed), cfg));
    }
    return { results };
  }
}

/** İstek gövdesi → motor girdisi. Admin önizlemesi de aynı dönüşümü kullanır. */
export function toSimulateInput(
  input: ReturnType<typeof simulateRequest.parse>, seed: string,
): SimulateInput {
  return {
    attacker: input.attacker,
    defender: input.defender,
    night: input.night,
    nightVisionAttacker: input.nightVisionAttacker,
    nightVisionDefender: input.nightVisionDefender,
    seed,
  };
}
