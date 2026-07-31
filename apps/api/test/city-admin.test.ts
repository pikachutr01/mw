/**
 * ⭐ ŞEHİR YÖNETİMİ — Seçenekler menüsünün maddeleri (`g.java` case 63).
 *
 * Bu turda ölçülen: **şehir adı değiştirme** ve onunla gelen 3-10 karakter kuralı.
 * Kural yalnız formda değil ad ÜRETEÇLERİNDE de geçerli olmak zorunda; bu yüzden koloni
 * adı ve kahraman ad havuzu da burada sınanıyor — kuralı koyup üreteci unutmak, kuralı
 * kâğıt üstünde bırakırdı (nitekim `"<oyuncu> kolonisi N"` tam olarak öyleydi).
 *
 * Controller HTTP olmadan çağrılıyor (`search.test.ts` deseni): kurallar controller'da.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HERO_NAMES, NAME_MAX, NAME_MIN, clampName, pickHeroName } from '@mobiwar/catalog';
import type { AuthedRequest } from '../src/auth/auth.guard.ts';
import { CaveService } from '../src/cave/cave.service.ts';
import { CityController } from '../src/cities/city.controller.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { QueueService } from '../src/queues/queue.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let ctl: CityController;
let worldId: number;
let me: number;
let myCity: number;

const asReq = (playerId: number, wid = worldId): AuthedRequest => ({
  player: { accountId: 0, playerId, worldId: wid, sessionId: '' },
} as unknown as AuthedRequest);

async function withCity(label: string, s: number, capital = true): Promise<[number, number]> {
  const playerId = await createPlayer(h, worldId, label);
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital)
    VALUES (${worldId}, ${playerId}, ${label}, 1, 1, ${s}, ${capital})
    RETURNING id
  `);
  return [playerId, Number(row!['id'])];
}

const nameOfCity = async (id: number): Promise<string> => {
  const [r] = await h.db.execute<Record<string, unknown>>(sql`SELECT name FROM cities WHERE id = ${id}`);
  return String(r!['name']);
};

beforeAll(async () => {
  h = await setupTestDb();
  const cities = new CityService(h.db);
  ctl = new CityController(
    cities, new QueueService(h.db, cities), new CaveService(h.db),
    new GameClockService(h.db), h.db,
  );
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  [me, myCity] = await withCity('sehirli', 1);
});

describe('şehir adı değiştirme', () => {
  it('geçerli ad kaydedilir', async () => {
    const res = await ctl.rename(String(myCity), { name: 'Kara Ova' }, asReq(me));
    expect(res['name']).toBe('Kara Ova');
    expect(await nameOfCity(myCity)).toBe('Kara Ova');
  });

  it('⭐ Türkçe karakter serbest — tam sınırda 10 karakter kabul edilir', async () => {
    await ctl.rename(String(myCity), { name: 'Çığlıktepe' }, asReq(me));
    expect(await nameOfCity(myCity)).toBe('Çığlıktepe');
    expect('Çığlıktepe'.length).toBe(NAME_MAX);
  });

  it(`${NAME_MIN} karakterden kısa ad reddedilir`, async () => {
    await expect(ctl.rename(String(myCity), { name: 'ab' }, asReq(me))).rejects.toThrow();
    expect(await nameOfCity(myCity)).toBe('sehirli');
  });

  it(`${NAME_MAX} karakterden uzun ad reddedilir`, async () => {
    await expect(ctl.rename(String(myCity), { name: 'Kayseri Ovası' }, asReq(me))).rejects.toThrow();
  });

  it('noktalama reddedilir (ad tablo başlığında ve rapor metninde geçiyor)', async () => {
    await expect(ctl.rename(String(myCity), { name: 'Ova|1' }, asReq(me))).rejects.toThrow();
  });

  /**
   * ⚠️ Sıra tuzağı: normalleştirme ÖNCE, ölçüm SONRA. Tersi olsaydı `"  Ova  "` yedi karakter
   * sayılır, kırpıldıktan sonra üçe düşerdi — kabul edip başka bir ad yazmış olurduk.
   */
  it('baş/son boşluk kırpılır, içerideki çoklu boşluk teke iner', async () => {
    await ctl.rename(String(myCity), { name: '  Kara   Ova  ' }, asReq(me));
    expect(await nameOfCity(myCity)).toBe('Kara Ova');
  });

  it('boşlukla dolu ad reddedilir (kırpınca boş kalıyor)', async () => {
    await expect(ctl.rename(String(myCity), { name: '     ' }, asReq(me))).rejects.toThrow();
  });

  it('başkasının şehri adlandırılamaz', async () => {
    const [, hisCity] = await withCity('komsu', 2);
    await expect(ctl.rename(String(hisCity), { name: 'Benim' }, asReq(me))).rejects.toThrow();
    expect(await nameOfCity(hisCity)).toBe('komsu');
  });

  /** Ad değişimi + olay TEK transaction'da (§1) — biri yazılıp diğeri düşemez. */
  it('⭐ `city:renamed` outbox satırı yazılır (şerit ve dünya listesi tazelensin)', async () => {
    await ctl.rename(String(myCity), { name: 'Yeni Ad' }, asReq(me));
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox WHERE world_id = ${worldId} AND topic = 'city:renamed'
    `);
    expect(rows).toHaveLength(1);
    expect((rows[0]!['payload'] as Record<string, unknown>)['name']).toBe('Yeni Ad');
    expect(Number((rows[0]!['payload'] as Record<string, unknown>)['cityId'])).toBe(myCity);
  });
});

/**
 * ⭐ ÜRETİLEN ADLAR DA KURALA UYMAK ZORUNDA.
 *
 * Bu blok olmadan kural ilk kolonide çiğnenirdi: eski üreteç `"abdullah kolonisi 2"`
 * (19 karakter) yazıyordu ve oyuncu o adı DÜZELTEMEZDİ bile — form 10'u geçen hiçbir şeyi
 * kabul etmiyor.
 */
describe('ad üreteçleri sınıra uyar', () => {
  it('kahraman ad havuzundaki her ad sınıra sığar', () => {
    const uzun = HERO_NAMES.filter((n) => n.length > NAME_MAX || n.length < NAME_MIN);
    expect(uzun).toEqual([]);
  });

  it('havuz tükendiğinde eklenen sıra numarası sınırı AŞMAZ', () => {
    // Havuzun tamamı + ilk 40 kopya kullanılmış say → üreteç kırpmak zorunda kalır.
    const taken = [...HERO_NAMES];
    for (let i = 0; i < 40; i++) {
      const name = pickHeroName(() => 0.999, taken);
      expect(name.length).toBeLessThanOrEqual(NAME_MAX);
      expect(taken).not.toContain(name);
      taken.push(name);
    }
  });

  it('koloni adı kalıbı ("Koloni N") sınıra sığar', () => {
    for (const n of [1, 9, 10, 99, 100]) {
      const name = clampName(`Koloni ${n}`);
      expect(name.length).toBeLessThanOrEqual(NAME_MAX);
      expect(name.length).toBeGreaterThanOrEqual(NAME_MIN);
    }
  });
});
