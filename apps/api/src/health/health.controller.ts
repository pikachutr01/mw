import { Controller, Get } from '@nestjs/common';
import { ENGINE_VERSION } from '@mobiwar/engine';
import { catalogHash, CATALOG_VERSION } from '@mobiwar/catalog';

@Controller()
export class HealthController {
  /**
   * Canlılık ucu. Motor sürümü ve katalog hash'i de döner: dağıtımdan sonra "hangi denge yayında"
   * sorusu tek istekle cevaplanır (§8 gözlemlenebilirlik).
   */
  @Get('healthz')
  health(): Record<string, unknown> {
    return {
      status: 'ok',
      serverNow: new Date().toISOString(),
      role: process.env['ROLE'] ?? 'all',
      engineVersion: ENGINE_VERSION,
      catalogVersion: CATALOG_VERSION,
      catalogHash: catalogHash(),
    };
  }
}
