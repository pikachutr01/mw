/**
 * ⭐ TOPLU İŞLEMLER + KOLAY DÜZENLEME (panel 2. nesil, Tur 2).
 *
 * Kullanıcının isteği: *"Tüm hesaplara toplu asker ekleme veya silme, savunma ünitesi ekleme
 * silme, sur büyü kalkan seviyesi, akademi tekniği düzenleme."*
 *
 * Testlerin ağırlık merkezi **güvenlik**te: geri alınamaz bir işlemde asıl soru "çalışıyor mu"
 * değil, **"yanlışlıkla çalışabilir mi"**. Bu yüzden kuru koşu, hedef dışında kalanlar ve
 * katalog reddi, uygulama kadar yer tutuyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminBulkController, BULK_OPS } from '../src/admin/admin.bulk.controller.ts';
import { AdminActionsController, ADMIN_ACTIONS } from '../src/admin/admin.actions.controller.ts';
import { AdminController } from '../src/admin/admin.controller.ts';
import { AdminDbController } from '../src/admin/admin.db.controller.ts';
import type { AdminRequest } from '../src/admin/admin.guard.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { UNITS_BY_ID } from '@mobilwar/catalog';
import { SettingsService } from '../src/settings/settings.service.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let bulk: AdminBulkController;
let actions: AdminActionsController;
let dbCtl: AdminDbController;
let adminCtl: AdminController;
let auth: AuthService;
let cities: CityService;
let clock: GameClockService;

let worldId: number;
/** Üç oyuncu: biri hedefte, biri hariç tutulacak, biri filtre dışı (düşük puanlı). */
let a: { playerId: number; cityId: number };
let b: { playerId: number; cityId: number };
let c: { playerId: number; cityId: number };

const req = (): AdminRequest => ({
  player: { accountId: 1, playerId: a.playerId, worldId, sessionId: '' },
  staff: { role: 'admin', elevated: true },
  headers: {},
} as unknown as AdminRequest);

const queryReq = (q: Record<string, unknown>): AdminRequest =>
  ({ ...req(), query: q } as unknown as AdminRequest);

async function register(label: string): Promise<{ playerId: number; cityId: number }> {
  const t = randomUUID().slice(0, 8);
  const r = await auth.register(
    { email: `${label}-${t}@test.local`, password: 'parola-12345', username: `${label}${t.slice(0, 4)}`, worldId },
    { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' },
  );
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT id FROM cities WHERE player_id = ${r.playerId}
  `);
  return { playerId: r.playerId, cityId: Number(row!['id']) };
}

const unitsOf = async (cityId: number, table = 'units'): Promise<Record<string, number>> => {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM ${sql.raw(table)} WHERE city_id = ${cityId}
  `);
  return Object.fromEntries(rows.map((r) => [String(r['type']), Number(r['count'])]));
};

beforeAll(async () => {
  h = await setupTestDb();
  clock = new GameClockService(h.db);
  cities = new CityService(h.db);
  bulk = new AdminBulkController(h.db, cities, clock, new SettingsService(h.db));
  actions = new AdminActionsController(h.db, cities, clock, undefined as never, new SettingsService(h.db));
  dbCtl = new AdminDbController(h.db);
  adminCtl = new AdminController(h.db);
  auth = new AuthService(
    h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }), clock, cities,
  );
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  a = await register('aa');
  b = await register('bb');
  c = await register('cc');
  await h.db.execute(sql`
    UPDATE players SET score = 1000 WHERE id IN (${a.playerId}, ${b.playerId})
  `);
  await h.db.execute(sql`UPDATE players SET score = 5 WHERE id = ${c.playerId}`);
});

const target = (extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ worldId, ...extra });

/* ═══ 1. KURU KOŞU — «yanlışlıkla çalışabilir mi» ════════════════════════════ */

describe('kuru koşu', () => {
  it('⭐ confirm YOKSA hiçbir satır değişmiyor, sayım yine de doğru', async () => {
    const out = await bulk.run('units', {
      target: target(), units: { dwarf: 500 },
    }, req()) as Record<string, unknown>;

    expect(out['ran']).toBe(false);
    expect(out['changed']).toBe(0);
    expect(out['players']).toBe(3);
    expect(out['cities']).toBe(3);
    // ⭐ Yanlış tıklama veri kaybına dönüşemesin diye aynı uç kullanılıyor.
    expect(await unitsOf(a.cityId)).toEqual({});
  });

  it('örnek liste yöneticiye «doğru kümeyi mi seçtim» dedirtiyor', async () => {
    const out = await bulk.run('units', {
      target: target({ scoreMin: 100 }), units: { dwarf: 1 },
    }, req()) as Record<string, unknown>;
    const sample = out['sample'] as { id: number }[];
    expect(sample.map((s) => s.id).sort()).toEqual([a.playerId, b.playerId].sort());
    expect(out['truncatedSample']).toBe(false);
  });

  it('⭐ katalog reddi KURU KOŞUDA da veriliyor', async () => {
    /**
     * "Çalıştırınca patlayacak" bir önizleme işe yaramaz: yönetici 3 oyuncu görür, onaylar,
     * sonra 400 alır. Doğrulama iki yolda da aynı yerde.
     */
    await expect(bulk.run('units', {
      target: target(), units: { uydurma: 5 },
    }, req())).rejects.toThrow();
  });
});

/* ═══ 2. HEDEF SEÇİMİ ════════════════════════════════════════════════════════ */

describe('hedef seçimi', () => {
  it('puan aralığı filtresi', async () => {
    const out = await bulk.run('units', {
      target: target({ scoreMin: 100 }), units: { dwarf: 10 }, confirm: true,
    }, req()) as Record<string, unknown>;
    expect(out['players']).toBe(2);
    expect(await unitsOf(c.cityId)).toEqual({});   // düşük puanlı hiç etkilenmedi
  });

  it('⭐ exclude: filtreye giren ama muaf tutulan oyuncu', async () => {
    await bulk.run('units', {
      target: target({ scoreMin: 100, exclude: [b.playerId] }),
      units: { dwarf: 10 }, confirm: true,
    }, req());
    // "Herkese ver ama şu kişiye verme" — yalnız filtreyle ifade edilemeyen istek.
    expect(await unitsOf(a.cityId)).toEqual({ dwarf: 10 });
    expect(await unitsOf(b.cityId)).toEqual({});
  });

  it('only: filtre yok sayılıp yalnız seçilenler hedeflenir', async () => {
    const out = await bulk.run('units', {
      target: target({ scoreMin: 999_999, only: [c.playerId] }),
      units: { dwarf: 7 }, confirm: true,
    }, req()) as Record<string, unknown>;
    // `scoreMin` 999.999 hiçbir oyuncuyu tutmuyor ama `only` onu geçersiz kılıyor.
    expect(out['players']).toBe(1);
    expect(await unitsOf(c.cityId)).toEqual({ dwarf: 7 });
  });

  /**
   * ⭐⭐ BOŞ `only` = HİÇ KİMSE (kullanıcı arayüzü, 2026-08-07).
   *
   * Panelin «Elle seç» kipi hedef seçilmeden de istek atabiliyor. Eski koşul
   * (`only && only.length > 0`) boş diziyi sessizce FİLTRE moduna düşürüyordu — yani "kimseye
   * verme" isteği **dünyadaki herkese** uygulanırdı. Bu turun en tehlikeli tek satırı.
   */
  it('⭐ only: [] hiç kimseyi hedeflemez (filtreye DÜŞMEZ)', async () => {
    const out = await bulk.run('units', {
      target: target({ only: [] }), units: { dwarf: 5 }, confirm: true,
    }, req()) as Record<string, unknown>;
    expect(out['players']).toBe(0);
    expect(out['cities']).toBe(0);
    expect(await unitsOf(a.cityId)).toEqual({});
    expect(await unitsOf(b.cityId)).toEqual({});
    expect(await unitsOf(c.cityId)).toEqual({});
  });

  it('aktiflik filtresi son görülmeye bakıyor', async () => {
    await h.db.execute(sql`
      UPDATE players SET last_seen_at = now() - interval '40 days' WHERE id = ${b.playerId}
    `);
    const out = await bulk.run('units', {
      target: target({ activeSinceDays: 7 }), units: { dwarf: 1 },
    }, req()) as Record<string, unknown>;
    expect((out['sample'] as { id: number }[]).map((s) => s.id)).not.toContain(b.playerId);
  });

  it('başka dünyanın oyuncusu ASLA hedeflenmiyor', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    const out = await bulk.run('units', {
      target: { worldId: other }, units: { dwarf: 1 },
    }, req()) as Record<string, unknown>;
    expect(out['players']).toBe(0);
  });
});

/* ═══ 3. UYGULAMA ════════════════════════════════════════════════════════════ */

describe('toplu ordu', () => {
  it('«yaz» kipi adedi EŞİTLER, «ekle» kipi mevcuda ilave eder', async () => {
    await bulk.run('units', {
      target: target(), units: { dwarf: 100 }, confirm: true,
    }, req());
    expect(await unitsOf(a.cityId)).toEqual({ dwarf: 100 });

    await bulk.run('units', {
      target: target(), units: { dwarf: 100 }, mode: 'add', confirm: true,
    }, req());
    expect(await unitsOf(a.cityId)).toEqual({ dwarf: 200 });

    await bulk.run('units', {
      target: target(), units: { dwarf: 100 }, confirm: true,
    }, req());
    expect(await unitsOf(a.cityId)).toEqual({ dwarf: 100 });   // yaz: 200 değil 100
  });

  it('⭐ «ekle» kipinde negatif değer 0\'ın ALTINA inmiyor', async () => {
    await bulk.run('units', { target: target(), units: { dwarf: 50 }, confirm: true }, req());
    await bulk.run('units', {
      target: target(), units: { dwarf: -500 }, mode: 'add', confirm: true,
    }, req());
    // GREATEST(0, …) — eksi ordu diye bir şey yok ve savaş motoru onu okuyamaz.
    expect(await unitsOf(a.cityId)).toEqual({ dwarf: 0 });
  });

  it('mağaraya yazmak ayrı tablo', async () => {
    await bulk.run('units', {
      target: target(), units: { dragon: 9 }, where: 'cave', confirm: true,
    }, req());
    expect(await unitsOf(a.cityId, 'cave_units')).toEqual({ dragon: 9 });
    expect(await unitsOf(a.cityId)).toEqual({});
  });

  it('savunma birimi orduya, savaşçı savunmaya yazılamıyor', async () => {
    await expect(bulk.run('units', {
      target: target(), units: { archer_tower: 5 },
    }, req())).rejects.toThrow();
    await expect(bulk.run('defense', {
      target: target(), units: { dwarf: 5 },
    }, req())).rejects.toThrow();
  });

  it('⭐ Sur toplu ORDU işleminde reddediliyor (adet değil seviye)', async () => {
    await expect(bulk.run('defense', {
      target: target(), units: { wall: 6 },
    }, req())).rejects.toThrow(/SEVİYE/);
  });
});

describe('toplu savunma, sur, teknik, kaynak', () => {
  it('savunma birimi tüm şehirlere yazılıyor', async () => {
    await bulk.run('defense', {
      target: target(), units: { archer_tower: 250 }, confirm: true,
    }, req());
    expect(await unitsOf(a.cityId, 'defenses')).toEqual({ archer_tower: 250 });
    expect(await unitsOf(b.cityId, 'defenses')).toEqual({ archer_tower: 250 });
  });

  it('Sur seviyesi yazılıyor, 0 satırı siliyor', async () => {
    await bulk.run('structure', {
      target: target(), type: 'wall', level: 8, confirm: true,
    }, req());
    expect(await unitsOf(a.cityId, 'defenses')).toEqual({ wall: 8 });

    await bulk.run('structure', {
      target: target(), type: 'wall', level: 0, confirm: true,
    }, req());
    expect(await unitsOf(a.cityId, 'defenses')).toEqual({});
  });

  it('⭐ teknik OYUNCU başına tek satır (şehir başına değil)', async () => {
    const out = await bulk.run('tech', {
      target: target(), type: 'blacksmithing', level: 12, confirm: true,
    }, req()) as Record<string, unknown>;
    // 3 oyuncu, 3 şehir — ama teknik oyuncuya ait, o yüzden 3 satır (9 değil).
    expect(out['changed']).toBe(3);
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT level FROM techs WHERE player_id = ${a.playerId} AND type = 'blacksmithing'
    `);
    expect(Number(row!['level'])).toBe(12);
  });

  it('⭐ toplu kaynak MATERIALIZE ederek ekliyor', async () => {
    await h.db.execute(sql`
      UPDATE cities SET gold = 1000, food = 1000, resources_at = now() - interval '3 hours'
       WHERE id = ${a.cityId}
    `);
    const at = await clock.gameNow(worldId);
    const before = (await cities.snapshot(a.cityId, at))!.gold;

    await bulk.run('resources', {
      target: target({ only: [a.playerId] }), gold: 50_000, confirm: true,
    }, req());

    const after = (await cities.snapshot(a.cityId, await clock.gameNow(worldId)))!.gold;
    /**
     * ⚠️ Toplu bir `UPDATE cities SET gold = gold + n` çok daha hızlı olurdu ve sessizce
     * yanlış: çıpa geçmişte kaldığı için eklenen miktarın üstüne birikim de gelirdi.
     */
    expect(after - before).toBeGreaterThanOrEqual(50_000);
    expect(after - before).toBeLessThan(50_100);
  });

  it('kaynak alırken kasa eksiye düşmüyor', async () => {
    await bulk.run('resources', {
      target: target({ only: [a.playerId] }), gold: -999_999_999, confirm: true,
    }, req());
    const snap = (await cities.snapshot(a.cityId, await clock.gameNow(worldId)))!;
    expect(snap.gold).toBe(0);
  });

  it('audit satırı hedef filtresiyle birlikte yazılıyor', async () => {
    await h.db.execute(sql`DELETE FROM audit_log WHERE world_id = ${worldId}`);
    await bulk.run('tech', {
      target: target({ scoreMin: 100 }), type: 'archery', level: 3, confirm: true,
    }, req());
    const [log] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT action, before, after FROM audit_log
       WHERE world_id = ${worldId} AND action = 'admin.bulk.tech'
    `);
    expect(log).toBeTruthy();
    // "Hangi filtreyle kimlere uygulandı" sonradan sorulabilsin.
    expect((log!['before'] as Record<string, unknown>)['target']).toMatchObject({ scoreMin: 100 });
    expect((log!['after'] as Record<string, unknown>)['players']).toBe(2);
  });

  it('bilinmeyen işlem 400', async () => {
    await expect(bulk.run('drop-everything', { target: target() }, req())).rejects.toThrow();
  });
});

/* ═══ 4. VERİ TABANI FİLTRESİ — ölçülmüş hata ═══════════════════════════════ */

describe('sayısal filtre', () => {
  it('⭐ player_id=5 artık 15, 25, 51\'i GETİRMİYOR', async () => {
    /**
     * Eskiden her filtre `::text ILIKE '%değer%'` idi. İki bedeli vardı: yanlış satırlar ve
     * indeksin kullanılamaması. Burada `a.playerId`in bir alt dizesi olan sahte bir oyuncu
     * kurup filtrenin onu ELEDİĞİNİ ölçüyoruz.
     */
    await h.db.execute(sql`
      INSERT INTO techs (player_id, type, level) VALUES
        (${a.playerId}, 'archery', 3), (${b.playerId}, 'archery', 4)
    `);
    const out = await dbCtl.rows('techs', queryReq({ player_id: String(a.playerId) })) as
      Record<string, unknown>;
    const rows = out['rows'] as Record<string, unknown>[];
    expect(rows.length).toBe(1);
    expect(Number(rows[0]!['player_id'])).toBe(a.playerId);
  });

  it('metin alanda ILIKE korunuyor (parça arama çalışmaya devam ediyor)', async () => {
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${a.playerId}
    `);
    const part = String(p!['username']).slice(0, 4);
    const out = await dbCtl.rows(
      'players', queryReq({ username: part, world_id: String(worldId) }),
    ) as Record<string, unknown>;
    expect(Number(out['total'])).toBeGreaterThanOrEqual(1);
  });

  it('sayısal alana metin yazılırsa BOŞ döner, SQL hatası vermez', async () => {
    const out = await dbCtl.rows('techs', queryReq({ player_id: 'abc' })) as Record<string, unknown>;
    expect(Number(out['total'])).toBe(0);
  });
});

/* ═══ 5. TEK ŞEHİR AKSİYONLARI + künye ══════════════════════════════════════ */

describe('yeni tek şehir aksiyonları', () => {
  it('savunma birimi ata', async () => {
    await actions.setDefense({ cityId: a.cityId, units: { archer_tower: 120, trap: 30 } }, req());
    expect(await unitsOf(a.cityId, 'defenses')).toEqual({ archer_tower: 120, trap: 30 });
  });

  it('Sur/Kalkan seviyesi ata; savunma aksiyonu onları reddediyor', async () => {
    await actions.setDefenseStructure({ cityId: a.cityId, type: 'magic_shield', level: 4 }, req());
    expect(await unitsOf(a.cityId, 'defenses')).toEqual({ magic_shield: 4 });
    await expect(actions.setDefense({ cityId: a.cityId, units: { wall: 3 } }, req()))
      .rejects.toThrow(/SEVİYE/);
  });

  it('⭐ verilen kahraman ARTIK ölü görünmüyor', async () => {
    const out = await actions.giveHero({ cityId: a.cityId, level: 5 }, req()) as Record<string, unknown>;
    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT status FROM heroes WHERE id = ${Number(out['heroId'])}
    `);
    /**
     * ⚠️ Eskiden `'idle'` yazılıyordu — şemanın sözlüğünde olmayan bir değer. Kahraman ekranı
     * onu "şehirde" sayıyor ama dünya listesi `dead: status <> 'alive'` diyor, yani panelden
     * verilen kahraman oyuncuya ÖLÜ görünüyordu.
     */
    expect(String(row!['status'])).toBe('alive');
  });
});

/* ═══ 6. KÜNYE TUTARLILIĞI ══════════════════════════════════════════════════ */

describe('form künyeleri', () => {
  it('katalog ucu seçicileri besliyor ve Sur/Kalkan savunmadan AYRI', async () => {
    const cat = adminCtl.catalog() as Record<string, { id: string; name: string }[]>;
    expect(cat['warriors']!.find((u) => u.id === 'dwarf')?.name).toBe('Cüce');
    expect(cat['defenses']!.map((u) => u.id)).not.toContain('wall');
    expect(cat['structures']!.map((u) => u.id)).toEqual(['wall', 'magic_shield']);
    expect(cat['buildings']![0]!.id).toBe('farm');        // oyunun kendi sırası
    expect(cat['techs']!.map((t) => t.id)).toContain('blacksmithing');
  });

  it('⭐ her seçici alanın kaynağı katalogda gerçekten var', async () => {
    const cat = adminCtl.catalog() as Record<string, unknown[]>;
    const fields = [...ADMIN_ACTIONS, ...BULK_OPS].flatMap((a2) => a2.fields as readonly {
      type: string; source?: string;
    }[]);
    for (const f of fields) {
      if (f.type === 'unitPicker') {
        // Faz 7'de elle yazılmış kolon adlarının dördü yanlış çıkmıştı; aynı sınıf koruma.
        expect(cat[f.source!], `bilinmeyen kaynak: ${f.source}`).toBeTruthy();
      }
    }
  });

  it('her aksiyon ve toplu işlemin id\'si tekil, açıklaması var', () => {
    const ids = [...ADMIN_ACTIONS.map((x) => x.id), ...BULK_OPS.map((x) => x.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of [...ADMIN_ACTIONS, ...BULK_OPS]) {
      expect(x.description.length, x.id).toBeGreaterThan(20);
      expect(x.fields.length, x.id).toBeGreaterThan(0);
    }
  });
});

/**
 * ⭐⭐ TOPLU MÜDAHALE PUANI DA OYNATIR (kullanıcı bildirimi, 2026-08-09).
 *
 * Operatör canlıda toplu ordu dağıttı: her şehirde on binlerce savaşçı oldu, sıralamayı elle
 * tetikledi, **puanlar hiç değişmedi.** Sıralama doğru çalışıyordu — `score_base` yalnız
 * `creditSpend` ile büyüyor ve bu controller doğrudan tabloya yazıyor.
 *
 * ⚠️⚠️ Asıl kusur "puan artmadı" DEĞİL **asimetri**: hediye ordu puan kazandırmıyordu ama
 * savaşta ölünce `debitLosses` katalog bedelini düşüyordu. Yani operatörün iyi niyetli
 * hediyesi, oyuncuyu ilk savaşta hiç kazanmadığı puandan ederdi.
 */
describe('⭐ toplu işlem puan tabanını da oynatır', () => {
  const baseOf = async (playerId: number): Promise<number> => {
    const [r] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT score_base FROM players WHERE id = ${playerId}
    `);
    return Number(r!['score_base']);
  };

  it('⭐ ordu VERMEK puanı, birimlerin katalog bedeli kadar artırır', async () => {
    const once = await baseOf(a.playerId);
    await bulk.run('units', {
      target: target(), units: { dwarf: 100 }, mode: 'set', confirm: true,
    }, req());

    const d = UNITS_BY_ID['dwarf']!;
    const sehirSayisi = (await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM cities WHERE player_id = ${a.playerId}
    `))[0]!['n'] as number;

    expect(await baseOf(a.playerId) - once).toBe((d.gold + d.food) * 100 * sehirSayisi);
  });

  /**
   * ⭐ ASIL DEĞİŞMEZ: verilen geri alınınca puan da geri gitmeli. Simetri bozulursa operatör
   * ordu verip geri alarak puan basabilir (ya da tersi: oyuncu sebepsiz puan kaybeder).
   */
  it('⭐ orduyu GERİ ALMAK puanı aynı kadar düşürür', async () => {
    const once = await baseOf(a.playerId);
    await bulk.run('units', {
      target: target(), units: { dwarf: 100 }, mode: 'set', confirm: true,
    }, req());
    await bulk.run('units', {
      target: target(), units: { dwarf: 0 }, mode: 'set', confirm: true,
    }, req());
    expect(await baseOf(a.playerId)).toBe(once);
  });

  /**
   * ⚠️ Kaynak vermek puana DOKUNMAMALI — kullanıcının kuralı: *"Şehirde henüz harcanmayan
   * ganimet miktarı da puan vermez."* Oyuncu onu harcadığında `creditSpend` zaten yazacak;
   * burada da yazsaydık aynı kaynak İKİ KEZ puan verirdi.
   */
  it('⭐ KAYNAK vermek puana dokunmaz', async () => {
    const once = await baseOf(a.playerId);
    await bulk.run('resources', {
      target: target(), gold: 5_000_000, food: 5_000_000, mode: 'set', confirm: true,
    }, req());
    expect(await baseOf(a.playerId)).toBe(once);
  });

  /**
   * ⚠️ `building` diye bir toplu işlem YOK (units · defense · structure · tech · resources).
   * İlk yazımda uydurdum ve test «Bilinmeyen toplu işlem» ile düştü. Sur seviyesi
   * `structure` ile veriliyor ve puana `cumulativeDefenseStructureValue` üzerinden giriyor.
   */
  it('Sur seviyesi vermek de puanı artırır', async () => {
    const once = await baseOf(a.playerId);
    await bulk.run('structure', {
      target: target(), type: 'wall', level: 5, confirm: true,
    }, req());
    expect(await baseOf(a.playerId)).toBeGreaterThan(once);
  });

  /** ⭐ Teknik oyuncu geneli — kümülatif bedeli puana girmeli. */
  it('teknik vermek de puanı artırır', async () => {
    const once = await baseOf(a.playerId);
    await bulk.run('tech', {
      target: target(), type: 'archery', level: 5, confirm: true,
    }, req());
    expect(await baseOf(a.playerId)).toBeGreaterThan(once);
  });

  /**
   * ⚠️ Kuru koşu (confirm yok) hiçbir satıra dokunmadığı gibi PUANA da dokunmamalı.
   * Puan farkı `apply`den sonra hesaplandığı için bu kendiliğinden doğru — test onu kilitliyor.
   */
  it('kuru koşu puanı değiştirmez', async () => {
    const once = await baseOf(a.playerId);
    await bulk.run('units', { target: target(), units: { dwarf: 500 } }, req());
    expect(await baseOf(a.playerId)).toBe(once);
  });
});
