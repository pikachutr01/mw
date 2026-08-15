/**
 * ⭐ DENGE TEZGÂHI UCU — `/denge` ekranının beslendiği tek kaynak.
 *
 * Ekran hesabı tarayıcıda yapıyor ama sabitleri BURADAN alıyor. Dolayısıyla bu dosyanın sorusu
 * tek: **uç dünyanın ETKİN sabitlerini mi döndürüyor, yoksa sessizce varsayılana mı düşüyor?**
 * İkincisi olsaydı yönetici paneli bir fiyat söyler, tezgâh başka bir fiyat gösterirdi — ve bu,
 * `catalog-settings.test.ts`in *"ayar servise ULAŞIYOR mu"* bloğunun kapattığı arıza sınıfının
 * aynısı (`AuthService` ve `createWorker` kendi katalogsuz `CityService`lerini kurup sessizce
 * varsayılanla koşuyorlardı).
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG_CONFIG } from '@mobilwar/catalog';
import { DEFAULT_COMBAT_CONFIG } from '@mobilwar/engine';
import { BalanceController } from '../src/balance/balance.controller.ts';
import type { AuthedRequest } from '../src/auth/auth.guard.ts';
import type { DbHandle } from '../src/db/client.ts';
import { SettingsService } from '../src/settings/settings.service.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let svc: SettingsService;
let ctl: BalanceController;
let worldId: number;

beforeAll(async () => { h = await setupTestDb(); }, 60_000);
afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  /** ⚠️ Dünya 0 katmanı TÜM dünyaları etkiliyor → önceki koşuların artığı testi kirletir. */
  await h.db.execute(sql`DELETE FROM settings`);
  await h.db.execute(sql`DELETE FROM settings_revisions`);
  svc = new SettingsService(h.db);
  await svc.load();
  ctl = new BalanceController(h.db, svc);
});

/** `worldId` YALNIZ token'dan okunuyor — istekten dünya geçirmek §13.12.1b ihlali olurdu. */
const asReq = (): AuthedRequest =>
  ({ player: { playerId: 1, worldId } }) as unknown as AuthedRequest;

describe('denge ucu', () => {
  /**
   * ⭐ Dokunulmamış dünyada varsayılan nesnenin **KİMLİĞİ** dönmeli (`toBe`, `toEqual` değil):
   * `mergeCatalogConfig(undefined)` sözleşmesi bu ve kimlik testi, "varsayılandan yeniden
   * kurulmuş" bir kopyayla gerçek varsayılan arasında sessiz bir kayma doğmasını engelliyor.
   */
  it('ayar yokken motorun varsayılanlarını AYNEN döndürür', async () => {
    const out = await ctl.balance(asReq());
    expect(out['catalog']).toBe(DEFAULT_CATALOG_CONFIG);
    expect(out['combat']).toBe(DEFAULT_COMBAT_CONFIG);
    expect(out['resourcePerPoint']).toBe(1000);
    expect(out['minSeconds']).toBe(1);
    expect(out['revisionId']).toBeNull();
  });

  it('dünya hız çarpanları varsayılanda 1', async () => {
    const out = await ctl.balance(asReq());
    expect(out['speed']).toEqual({ resource: 1, travel: 1, training: 1, construction: 1 });
  });

  /** ⭐⭐ Ucun varlık sebebi: panelden değişen fiyat tezgâha ULAŞMALI. */
  it('katalog override\'ı ULAŞIYOR', async () => {
    await svc.update({ worldId, patch: { 'economy.techCostMultiplier': 0.5 }, actorId: null });
    const out = await ctl.balance(asReq());
    const cfg = out['catalog'] as typeof DEFAULT_CATALOG_CONFIG;
    expect(cfg.economy.techCostMultiplier).toBe(0.5);
    // Dokunulmayan komşu alanlar varsayılanda kalmalı.
    expect(cfg.economy.buildingCostRate).toBe(DEFAULT_CATALOG_CONFIG.economy.buildingCostRate);
  });

  it('savaş ayarı da ULAŞIYOR (kahraman puanı ekranda buradan yazılıyor)', async () => {
    await svc.update({ worldId, patch: { 'hero.pointsPerLevel': 5 }, actorId: null });
    const out = await ctl.balance(asReq());
    expect((out['combat'] as typeof DEFAULT_COMBAT_CONFIG).hero.pointsPerLevel).toBe(5);
  });

  it('puan böleni ULAŞIYOR', async () => {
    await svc.update({ worldId, patch: { 'scoring.resourcePerPoint': 500 }, actorId: null });
    expect((await ctl.balance(asReq()))['resourcePerPoint']).toBe(500);
  });

  /**
   * ⚠️ Hız çarpanları `CatalogConfig`te DEĞİL, `worlds` satırında ve ayrı bir uçtan
   * düzenleniyor (`PUT /admin/worlds/:id/multipliers`) — o yol `mw_settings` bildirimini hiç
   * tetiklemiyor. İki kaynağı birleştiren tek yer bu uç; birleşmezse ekrandaki süre kuyruğun
   * gerçekten uyguladığı süreden sapar.
   */
  it('dünya hız çarpanı ULAŞIYOR', async () => {
    await h.db.execute(sql`
      UPDATE worlds SET construction_multiplier = 4, training_multiplier = 2 WHERE id = ${worldId}
    `);
    const out = await ctl.balance(asReq());
    expect(out['speed']).toMatchObject({ construction: 4, training: 2 });
  });

  it('override DÜNYA BAZLI — komşu dünya etkilenmez', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    await svc.update({ worldId, patch: { 'scoring.resourcePerPoint': 250 }, actorId: null });

    const mine = await ctl.balance(asReq());
    const theirs = await ctl.balance(
      ({ player: { playerId: 2, worldId: other } }) as unknown as AuthedRequest,
    );
    expect(mine['resourcePerPoint']).toBe(250);
    expect(theirs['resourcePerPoint']).toBe(1000);
  });

  it('ayar kaydedilince revizyon kimliği doluyor', async () => {
    const before = await ctl.balance(asReq());
    expect(before['revisionId']).toBeNull();

    const rev = await svc.update({ worldId, patch: { 'combat.nightBase': 0.5 }, actorId: null });
    expect((await ctl.balance(asReq()))['revisionId']).toBe(rev.revisionId);
  });

  /** Denge sürümü rozeti: override sonrası özet DEĞİŞMELİ, yoksa ekran "aynı denge" der. */
  it('katalog özeti override sonrası değişiyor', async () => {
    const before = String((await ctl.balance(asReq()))['catalogHash']);
    await svc.update({ worldId, patch: { 'economy.buildingCostMultiplier': 2 }, actorId: null });
    expect(String((await ctl.balance(asReq()))['catalogHash'])).not.toBe(before);
  });
});
