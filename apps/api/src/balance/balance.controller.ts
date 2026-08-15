/**
 * ⭐ DENGE TEZGÂHI UCU — dünyanın ETKİN denge sabitlerinin tek paketi.
 *
 * `/denge` ekranı oyunun süreyle işleyen her mekaniğini (yapı · teknik · asker · savunma ·
 * kahraman · mağara · teleport · sur) kaydırıcılarla oynatıp maliyet/süre/puan hesaplatıyor.
 * Bu uç ona **sabitleri** verir; hesabın kendisi tarayıcıda, `@mobilwar/catalog`un aynı
 * fonksiyonlarıyla yapılır.
 *
 * ⚠️⚠️ **"İstemci maliyeti kendi hesaplamaz" kuralıyla çelişmiyor** (`city.controller.ts` ·
 * katalog ucunun başlığı). O kuralın düşmanı formülün YENİDEN YAZILMASI ve sabitin koda
 * gömülmesidir — çünkü o zaman panelden yapılan override'ı ekran görmez. Burada ikisi de yok:
 * tek formül kaynağı (`@mobilwar/catalog`), tek sabit kaynağı (bu uç). Emsali de var: yönetici
 * panelinin *eğitim süresi × Baraka* tablosu aynı şekilde sunucudan `CatalogConfig` alıp tabloyu
 * kendisi hesaplıyor (`admin.world.controller.ts` · `catalog-config`), gerekçe birebir aynı:
 * kaydırıcı sürüklenirken her tuş vuruşunda HTTP gidiş-dönüşü olamaz. 9 yapı + 12 teknik +
 * 20 birim kaydırıcısı için sunucuya gitmek kullanılamaz bir sayfa üretirdi.
 *
 * ⚠️ **`worldId` YALNIZ token'dan.** İstek gövdesinden dünya okumak §13.12.1b ihlali olurdu —
 * `simulate.controller.ts` aynı kararı aynı gerekçeyle veriyor.
 *
 * ⚠️ **Sorgu maliyeti ~0**: `settings.catalog()` ve `combatConfig()` memoize'li (`load()` ile
 * temizleniyor). Tek gerçek okuma dünya hız çarpanları — onlar `CatalogConfig`te DEĞİL, `worlds`
 * satırında ve ayrı bir uçtan düzenleniyor (`PUT /admin/worlds/:id/multipliers`), o yol
 * `mw_settings` bildirimini hiç tetiklemiyor. İki kaynağı birleştiren tek yer burası.
 */
import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { resourcePerPoint } from '../scoring/score.service.ts';
import { SettingsService } from '../settings/settings.service.ts';

@Controller('api/v1/balance')
@UseGuards(AuthGuard)
export class BalanceController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  async balance(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const worldId = req.player!.worldId;

    const [w] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT resource_multiplier, speed_multiplier, training_multiplier, construction_multiplier
        FROM worlds WHERE id = ${worldId}
    `);

    return {
      catalog: this.settings.catalog(worldId),
      combat: this.settings.combatConfig(worldId),
      /** Adlandırma `city.service.snapshot().speed` ile birebir — iki yerde farklı olsaydı karışırdı. */
      speed: {
        resource: Number(w?.['resource_multiplier'] ?? 1),
        travel: Number(w?.['speed_multiplier'] ?? 1),
        training: Number(w?.['training_multiplier'] ?? 1),
        construction: Number(w?.['construction_multiplier'] ?? 1),
      },
      /** Puan böleni: katalog paketi dünya bilmediği için oraya parametre olarak geçilecek. */
      resourcePerPoint: resourcePerPoint(worldId),
      /**
       * ⚠️ Süre tabanı SUNUCUDAN bildiriliyor, istemcide sabit yazılmıyor: kuyruk da ekran da
       * süreyi 1 sn'nin altına indirmiyor (`scaledSeconds`) ve tezgâh aynı tabanı kullanmalı.
       */
      minSeconds: 1,
      /** «Denge sürümü» rozeti + değişim tespiti: ikisi de ekranda gösteriliyor. */
      catalogHash: this.settings.catalogHash(worldId),
      revisionId: this.settings.revisionId(worldId),
    };
  }
}
