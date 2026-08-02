/**
 * ⭐ AÇIK DÜNYA LİSTESİ — giriş ve kayıt formundaki dünya seçici (kullanıcı, 2026-08-03).
 *
 * ⚠️ **Guard YOK, bilerek.** Oyuncu henüz giriş yapmadan bu listeyi görmek zorunda: hangi
 * dünyaya kayıt olacağını ya da hangisine gireceğini seçiyor. Projede kalıp zaten "guard
 * opt-in"dir — `AuthGuard` hiçbir zaman global değil, her controller onu kendisi yazar
 * (`health.controller.ts` de aynı sebeple guard'sız).
 *
 * ⚠️ Dönen bilgi kasıtlı olarak **fakir**: yalnız `id` ve `name`. Oyuncu sayısı, şehir sayısı
 * ya da bakım metni gibi alanlar burada YOK — kimlik doğrulamadan önce dünyanın içi hakkında
 * bilgi vermenin bir gerekçesi yok, üstelik bu uç herkese açık.
 *
 * ⚠️ DB'ye inmiyor: `WorldStateService` durumları zaten bellekte tutuyor ve `LISTEN` ile
 * güncel kalıyor. Herkese açık bir ucun sorgu üretmemesi, hız sınırı olmadığı için ayrıca
 * önemli (`rate-limit.ts` yalnız POST'ları sınırlıyor).
 */
import { Controller, Get } from '@nestjs/common';
import { WorldStateService } from './world-state.service.ts';

@Controller('api/v1/worlds')
export class WorldsPublicController {
  constructor(private readonly worlds: WorldStateService) {}

  @Get()
  list(): { worlds: Array<{ id: number; name: string }> } {
    return { worlds: this.worlds.listOpen() };
  }
}
