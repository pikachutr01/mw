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
import { HERO_NAMES, NAME_MAX, NAME_MIN, clampName, pickHeroName } from '@mobilwar/catalog';
import type { AuthedRequest } from '../src/auth/auth.guard.ts';
import { BattleController } from '../src/battles/battle.controller.ts';
import { CaveService } from '../src/cave/cave.service.ts';
import { CityController } from '../src/cities/city.controller.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { QueueService } from '../src/queues/queue.service.ts';
import { SettingsService } from '../src/settings/settings.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let ctl: CityController;
let svc: CityService;
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
  svc = new CityService(h.db);
  /**
   * ⚠️ `SettingsService` de geçiliyor (§admin Faz 5): controller ekrandaki fiyat/süreleri
   * dünyanın etkin katalog sabitlerinden hesaplıyor. Hiç ayar kaydedilmemişse servis
   * varsayılan config'i döndürür ve bu testlerin gördüğü değerler değişmez.
   */
  ctl = new CityController(
    svc, new QueueService(h.db, svc), new CaveService(h.db),
    new GameClockService(h.db), new SettingsService(h.db), h.db,
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

  /**
   * ⚠️ Ad **tam sınırda** olmalı ki iddia gerçekten sınavı yapsın. Sınır 2026-08-01'de 10'dan
   * **15**'e çıktı (hesap silmenin ürettiği `hükümdarN` adları için) ve bu test sabit bir
   * dizeye bağlıydı; artık uzunluk `NAME_MAX`ten TÜRETİLİYOR, bir daha bayatlamaz.
   */
  it(`⭐ Türkçe karakter serbest — tam sınırda ${NAME_MAX} karakter kabul edilir`, async () => {
    const name = 'Çığlıktepeşğüö'.slice(0, NAME_MAX).padEnd(NAME_MAX, 'ı');
    expect(name.length).toBe(NAME_MAX);
    await ctl.rename(String(myCity), { name }, asReq(me));
    expect(await nameOfCity(myCity)).toBe(name);
  });

  it(`${NAME_MIN} karakterden kısa ad reddedilir`, async () => {
    await expect(ctl.rename(String(myCity), { name: 'ab' }, asReq(me))).rejects.toThrow();
    expect(await nameOfCity(myCity)).toBe('sehirli');
  });

  it(`${NAME_MAX} karakterden uzun ad reddedilir`, async () => {
    // ⚠️ Sınırın BİR ÜSTÜ — sabit bir dize yazmak sınır değişince testi sessizce anlamsızlaştırırdı.
    const tooLong = 'A'.repeat(NAME_MAX + 1);
    await expect(ctl.rename(String(myCity), { name: tooLong }, asReq(me))).rejects.toThrow();
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
 * ⭐ ŞEHİR TERK ETME (`g.java` case 63 → `a[4]`, ekran 61).
 *
 * Şartlar `teknik_ve_yapi_dokumantasyonu.md:648` ve `:939`'dan; mağara ve kahraman
 * engelleri kullanıcı kararı (dokümanda yok, ikisi de sonradan gelen mekanik).
 */
describe('şehir terk etme — engeller', () => {
  let colony: number;

  beforeEach(async () => {
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital)
      VALUES (${worldId}, ${me}, 'Koloni 2', 1, 1, 5, false) RETURNING id
    `);
    colony = Number(row!['id']);
  });

  const blockers = (): Promise<string[]> => svc.abandonBlockers(colony);

  it('temiz koloni terk edilebilir', async () => {
    expect(await blockers()).toEqual([]);
  });

  it('başkent terk edilemez', async () => {
    expect(await svc.abandonBlockers(myCity)).toContain('Başkent terk edilemez.');
  });

  it('barakada savaşçı varsa engellenir', async () => {
    await h.db.execute(sql`INSERT INTO units (city_id, type, count) VALUES (${colony}, 'dwarf', 120)`);
    expect(await blockers()).toContain('Barakada 120 savaşçı var.');
  });

  /**
   * ⭐ ÇIKMAZIN KENDİSİ (kullanıcı, 2026-08-03): *"Casus kuşları destek olarak
   * gönderemezsek şehri terk edemeyiz."*
   *
   * Casus Kuş da barakada duruyor ve terk engelini tetikliyor; kuş 2026-08-03'e kadar
   * yalnız casusluğa katılabildiği için şehirden ÇIKARILAMIYORDU → kuşu olan bir şehir
   * hiçbir şekilde terk edilemiyordu. Bu test o kapanı çıpalıyor: engel gerçek, çıkış yolu
   * artık destek görevi (bkz. `missions.test.ts` → «Casus Kuş DESTEKLE taşınabilir»).
   */
  it('⭐ barakadaki Casus Kuş da terk engeli sayılır (çıkış yolu: destek görevi)', async () => {
    await h.db.execute(sql`INSERT INTO units (city_id, type, count) VALUES (${colony}, 'spy_bird', 7)`);
    expect(await blockers()).toContain('Barakada 7 savaşçı var.');
  });

  /** ⚠️ Dokümanda YOK: `cave_units` cascade ile sessizce silinirdi (kullanıcı kararı). */
  it('⭐ mağarada savaşçı varsa engellenir', async () => {
    await h.db.execute(sql`INSERT INTO cave_units (city_id, type, count) VALUES (${colony}, 'elf', 300)`);
    expect(await blockers()).toContain('Mağarada 300 savaşçı var.');
  });

  /** ⚠️ Dokümanda YOK: `heroes.city_id` SET NULL → kahraman sahipsiz kalırdı. */
  it('⭐ şehirde kahraman varsa engellenir', async () => {
    await h.db.execute(sql`
      INSERT INTO heroes (world_id, player_id, city_id, name, status)
      VALUES (${worldId}, ${me}, ${colony}, 'Bamsı', 'idle')
    `);
    expect(await blockers()).toContain('Bu şehirde kahraman var.');
  });

  it('açık kuyruk varsa engellenir', async () => {
    await h.db.execute(sql`
      INSERT INTO queues (world_id, city_id, player_id, category, item_type, target_level,
                          started_at, finish_at)
      VALUES (${worldId}, ${colony}, ${me}, 'building', 'mine', 3, now(), now() + interval '1 hour')
    `);
    expect(await blockers()).toContain('Şehirde süren üretim veya ilerletme var.');
  });

  it('şehre gelen ordu varsa engellenir', async () => {
    await h.db.execute(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, target_city_id, execute_at)
      VALUES (${worldId}, 'attack', 'scheduled', ${me}, ${colony}, now() + interval '1 hour')
    `);
    expect(await blockers()).toContain('Şehre gelen ya da şehirden giden ordu var.');
  });

  it('şehirden giden ordu varsa engellenir', async () => {
    await h.db.execute(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, execute_at)
      VALUES (${worldId}, 'transport', 'scheduled', ${me}, ${colony}, now() + interval '1 hour')
    `);
    expect(await blockers()).toContain('Şehre gelen ya da şehirden giden ordu var.');
  });

  /** Bitmiş görev engel DEĞİL — yoksa şehir bir kez saldırı aldıktan sonra hiç terk edilemezdi. */
  it('bitmiş görev engel değildir', async () => {
    await h.db.execute(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, target_city_id, execute_at)
      VALUES (${worldId}, 'attack', 'done', ${me}, ${colony}, now() - interval '1 hour')
    `);
    expect(await blockers()).toEqual([]);
  });

  it('engeller BİRİKİR (oyuncu tek tek sürprizle karşılaşmasın)', async () => {
    await h.db.execute(sql`INSERT INTO units (city_id, type, count) VALUES (${colony}, 'dwarf', 5)`);
    await h.db.execute(sql`INSERT INTO cave_units (city_id, type, count) VALUES (${colony}, 'elf', 7)`);
    expect(await blockers()).toHaveLength(2);
  });

  it('engel varken terk REDDEDİLİR ve şehir yerinde kalır', async () => {
    await h.db.execute(sql`INSERT INTO units (city_id, type, count) VALUES (${colony}, 'dwarf', 5)`);
    await expect(ctl.abandon(String(colony), asReq(me))).rejects.toThrow();
    const rows = await h.db.execute(sql`SELECT 1 FROM cities WHERE id = ${colony}`);
    expect(rows).toHaveLength(1);
  });

  it('başkasının şehri terk edilemez', async () => {
    const [him] = await withCity('komsu', 9);
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital)
      VALUES (${worldId}, ${him}, 'Onun', 1, 1, 8, false) RETURNING id
    `);
    await expect(ctl.abandon(String(row!['id']), asReq(me))).rejects.toThrow();
  });
});

describe('şehir terk etme — silme', () => {
  let colony: number;

  beforeEach(async () => {
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital, gold, food)
      VALUES (${worldId}, ${me}, 'Koloni 2', 1, 1, 5, false, 9000, 9000) RETURNING id
    `);
    colony = Number(row!['id']);
    await h.db.execute(sql`
      INSERT INTO buildings (city_id, type, level) VALUES (${colony}, 'mine', 5), (${colony}, 'farm', 3)
    `);
    await h.db.execute(sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${colony}, 'ballista', 40)
    `);
  });

  it('⭐ şehir ve bağlı satırlar (cascade) gider, koordinat boşalır', async () => {
    await ctl.abandon(String(colony), asReq(me));

    for (const table of ['cities', 'buildings', 'defenses'] as const) {
      const key = table === 'cities' ? 'id' : 'city_id';
      const rows = await h.db.execute(sql`
        SELECT 1 FROM ${sql.raw(table)} WHERE ${sql.raw(key)} = ${colony}
      `);
      expect(rows, table).toHaveLength(0);
    }
    // Koordinat serbest: aynı yere yeni şehir kurulabiliyor (cities_world_coords boşaldı).
    await h.db.execute(sql`
      INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital)
      VALUES (${worldId}, ${me}, 'Yeni', 1, 1, 5, false)
    `);
  });

  /**
   * Doküman: *"yapı ve savunma üniteleri sayesinde kazanılmış puanlarınız varsa bunları da
   * kaybedersiniz"*. ⚠️ Puan SİLMEDEN ÖNCE hesaplanmalı — cascade sonrası soracak yer kalmaz.
   */
  it('⭐ yapı + savunma puanı düşer, gösterilen puan tabandan türetilir', async () => {
    const start = 5_000_000;
    await h.db.execute(sql`
      UPDATE players SET score_base = ${start}, score = ${start / 1000} WHERE id = ${me}
    `);
    const res = await ctl.abandon(String(colony), asReq(me));

    const lost = Number(res['scoreBaseLost']);
    expect(lost).toBeGreaterThan(0);
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT score_base, score FROM players WHERE id = ${me}
    `);
    expect(Number(p!['score_base'])).toBe(start - lost);
    expect(Number(p!['score'])).toBe(Math.floor((start - lost) / 1000));
  });

  /**
   * ⚠️ Taban sıfırın ALTINA inmez (`addScoreBase` → `GREATEST(0, …)`). Bu testin ilk hâli
   * 500.000'lik bir tabanla kurulmuştu ve düşen değer 1,4 milyon çıkınca kırıldı — yani
   * kırılma kuralı doğruladı: şehrin katkısı oyuncunun tabanından büyük olabiliyor
   * (savunma birimleri pahalı). Oyuncu eksi puanla görünmemeli.
   */
  it('taban sıfırın altına inmez', async () => {
    await h.db.execute(sql`UPDATE players SET score_base = 1000, score = 1 WHERE id = ${me}`);
    await ctl.abandon(String(colony), asReq(me));
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT score_base, score FROM players WHERE id = ${me}
    `);
    expect(Number(p!['score_base'])).toBe(0);
    expect(Number(p!['score'])).toBe(0);
  });

  it('outbox `city:abandoned` + audit satırı yazılır', async () => {
    await ctl.abandon(String(colony), asReq(me));
    const ob = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox WHERE world_id = ${worldId} AND topic = 'city:abandoned'
    `);
    expect(ob).toHaveLength(1);
    expect(Number((ob[0]!['payload'] as Record<string, unknown>)['cityId'])).toBe(colony);

    const audit = await h.db.execute(sql`
      SELECT 1 FROM audit_log WHERE action = 'city.abandoned' AND entity_id = ${colony}
    `);
    expect(audit).toHaveLength(1);
  });
});

/**
 * ⭐ MESAJ / RAPOR SİLME (`slMsj.do` + "Hepsini Seç").
 *
 * Tek uç hem tek satırı hem toplu seçimi karşılıyor; kritik nokta **sahiplik**: silme
 * geri alınamaz, bu yüzden başkasının satırına dokunmadığı ve dokunmadığını da SIZDIRMADIĞI
 * (yanıt yalnız sayı) ölçülüyor.
 */
describe('mesaj / rapor silme', () => {
  let mails: BattleController;

  const write = async (playerId: number, kind: string, subject: string): Promise<number> => {
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO messages (world_id, player_id, kind, subject, at)
      VALUES (${worldId}, ${playerId}, ${kind}, ${subject}, now()) RETURNING id
    `);
    return Number(row!['id']);
  };

  const countFor = async (playerId: number): Promise<number> => {
    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM messages WHERE player_id = ${playerId}
    `);
    return Number(r!['n']);
  };

  beforeEach(() => { mails = new BattleController(h.db); });

  it('tek satır silinir', async () => {
    const id = await write(me, 'battle_report', 'Savaş');
    const res = await mails.deleteMessages({ ids: [id] }, asReq(me));
    expect(res['deleted']).toBe(1);
    expect(await countFor(me)).toBe(0);
  });

  it('toplu silme — birden çok satır tek istekte', async () => {
    const ids = [
      await write(me, 'battle_report', 'A'),
      await write(me, 'spy_report', 'B'),
      await write(me, 'system', 'C'),
    ];
    const res = await mails.deleteMessages({ ids }, asReq(me));
    expect(res['deleted']).toBe(3);
    expect(await countFor(me)).toBe(0);
  });

  /** ⚠️ Sahiplik WHERE'de: başkasının satırı silinmez ve "vardı" bilgisi de sızmaz. */
  it('⭐ başkasının satırı silinmez, sayı da sızdırmaz', async () => {
    const [other] = await withCity('komsu', 4);
    const mine = await write(me, 'battle_report', 'Benim');
    const his = await write(other, 'battle_report', 'Onun');

    const res = await mails.deleteMessages({ ids: [mine, his] }, asReq(me));
    expect(res['deleted']).toBe(1);            // yalnız kendi satırı sayıldı
    expect(await countFor(other)).toBe(1);     // onunki yerinde
  });

  it('başka DÜNYANIN satırı silinmez', async () => {
    const id = await write(me, 'battle_report', 'Benim');
    await expect(mails.deleteMessages({ ids: [id] }, asReq(me, worldId + 500)))
      .resolves.toMatchObject({ deleted: 0 });
    expect(await countFor(me)).toBe(1);
  });

  it('boş dizi ve 200 üstü istek reddedilir', async () => {
    await expect(mails.deleteMessages({ ids: [] }, asReq(me))).rejects.toThrow();
    const many = Array.from({ length: 201 }, (_, i) => i + 1);
    await expect(mails.deleteMessages({ ids: many }, asReq(me))).rejects.toThrow();
  });

  /**
   * ⭐ Posta kutusu satırı silinir ama SAVAŞ durur — karşı taraf kendi raporunu görmeye
   * devam etmeli, üstelik `battles` bir denetim kaydı.
   */
  it('⭐ rapor silinince savaş kaydı DURUR', async () => {
    const [b] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO battles (world_id, attacker_player_id, defender_player_id, at, winner,
                           night, rng_seed, engine_version, catalog_hash, input, result)
      VALUES (${worldId}, ${me}, ${me}, now(), 'attacker', false, 1, 'test', 'test',
              '{}'::jsonb, '{}'::jsonb)
      RETURNING id
    `);
    const battleId = Number(b!['id']);
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO messages (world_id, player_id, kind, subject, battle_id, at)
      VALUES (${worldId}, ${me}, 'battle_report', 'Savaş', ${battleId}, now()) RETURNING id
    `);

    await mails.deleteMessages({ ids: [Number(row!['id'])] }, asReq(me));
    const left = await h.db.execute(sql`SELECT 1 FROM battles WHERE id = ${battleId}`);
    expect(left).toHaveLength(1);
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
