/**
 * ⭐ ÇOKLU HESAP — DAVRANIŞ SİNYALLERİ (§9.1.2 B1·B2·B6·B7, kullanıcı isteğinin son parçası).
 *
 * Bu dosyanın iki derdi var ve ikincisi daha önemli:
 *   1. Sinyal gerçekten yakalıyor mu?
 *   2. **Masum oyuncuyu yakalamıyor mu?** Davranış sinyalleri teknik izlerden güçlü ama aynı
 *      sebeple daha tehlikeli: "kaynak gönderdi" ile "besliyor" arasındaki fark niyet, ve
 *      niyet ölçülemez. Her sinyalin bir de masum karşı-örneği test ediliyor.
 *
 * ⚠️ §9.1.1: çıktı hiçbir koşulda ceza değil. Testler skoru ölçüyor, "banlandı mı"yı değil.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BehaviourService, behaviourConfig } from '../src/abuse/behaviour.service.ts';
import { AbuseScanService } from '../src/abuse/scan.service.ts';
import { setLiveSettings } from '../src/settings/live.ts';
import type { DbHandle } from '../src/db/client.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let svc: BehaviourService;

const FROM = new Date('2026-06-01T00:00:00Z');
const TO = new Date('2026-07-01T00:00:00Z');
const AT = '2026-06-15T12:00:00Z';

beforeAll(async () => {
  h = await setupTestDb();
  svc = new BehaviourService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

/**
 * ⚠️ **DÜNYA SATIRLARI KOŞULAR ARASINDA YENİDEN KULLANILIYOR.** `freshWorldId()` her koşuda
 * 100'den başlıyor ve `createWorld` mevcut satırı güncelliyor — yani önceki `pnpm test`
 * koşusundan kalan görevler, savaşlar ve sinyaller aynı dünyada duruyor.
 *
 * İlk yazımda temizlik yoktu ve testler **ikinci koşuda** düştü: B2 altı savaş bekliyordu, on
 * iki buldu. Ölçüm doğruydu, ortam kirliydi. Tablolar teste girmeden boşaltılıyor.
 */
beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await h.db.execute(sql`DELETE FROM battles WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM missions WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM abuse_signals WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM abuse_scan_runs WHERE world_id = ${worldId}`);
  await h.db.execute(sql`
    DELETE FROM chat_channels WHERE world_id = ${worldId}
  `);
  await h.db.execute(sql`DELETE FROM cities WHERE world_id = ${worldId}`);
  await h.db.execute(sql`DELETE FROM players WHERE world_id = ${worldId}`);
  // ⚠️ `outbox`ta dünya kolonu YOK — yükün içindeki alandan eleniyor.
  await h.db.execute(sql`
    DELETE FROM outbox
     WHERE topic = 'admin:abuse_report' AND (payload->>'worldId')::int = ${worldId}
  `);
});

afterEach(() => { setLiveSettings({}); });

/** Oyuncu + başkenti. Nakliyenin hedefi ŞEHİR, sahibi o şehrin oyuncusu. */
async function player(name: string, k: number): Promise<{ id: number; cityId: number }> {
  const id = await createPlayer(h, worldId, `${name}_${randomUUID().slice(0, 4)}`);
  const [c] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO cities (world_id, player_id, name, k, d, s, is_capital, gold, food, resources_at)
    VALUES (${worldId}, ${id}, ${name}, ${k}, 1, 1, true, 0, 0, now())
    RETURNING id
  `);
  return { id, cityId: Number(c!['id']) };
}

const transport = async (
  from: { id: number; cityId: number }, to: { id: number; cityId: number },
  gold: number, at = AT,
): Promise<void> => {
  await h.db.execute(sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id,
                          target_city_id, execute_at, payload)
    VALUES (${worldId}, 'transport', 'done', ${from.id}, ${from.cityId}, ${to.cityId},
            ${at}::timestamptz, ${JSON.stringify({ cargo: { gold, food: 0 } })}::jsonb)
  `);
};

const battle = async (
  atk: { id: number; cityId: number }, def: { id: number; cityId: number },
  winner: 'attacker' | 'defender', defUnits: Record<string, number>, at = AT,
): Promise<void> => {
  await h.db.execute(sql`
    INSERT INTO battles (world_id, attacker_player_id, defender_player_id,
                         attacker_city_id, defender_city_id, at, winner, rng_seed,
                         engine_version, catalog_hash, input, result)
    VALUES (${worldId}, ${atk.id}, ${def.id}, ${atk.cityId}, ${def.cityId},
            ${at}::timestamptz, ${winner}, 1, 'test', 'test',
            ${JSON.stringify({ defender: { counts: defUnits } })}::jsonb, '{}'::jsonb)
  `);
};

const kinds = (list: { kind: string }[]): string[] => list.map((s) => s.kind);

describe('B1 — tek yönlü kaynak akışı', () => {
  it('tek yönlü büyük akış yakalanır', async () => {
    const a = await player('veren', 1);
    const b = await player('alan', 2);
    await transport(a, b, 200_000);

    const found = await svc.scan(worldId, FROM, TO);
    const flow = found.find((s) => s.kind === 'oneWayResourceFlow');
    expect(flow).toBeDefined();
    expect(flow!.score).toBe(behaviourConfig().weights.oneWayResourceFlow);
    expect(flow!.evidence['gidenKaynak']).toBe(200_000);
    expect(flow!.evidence['dönenKaynak']).toBe(0);
  });

  /** ⚠️ Karşılıklı ticaret besleme DEĞİL — oranı geçen bir dönüş sinyali düşürmeli. */
  it('karşılıklı akış sinyal ÜRETMEZ', async () => {
    const a = await player('tacir1', 1);
    const b = await player('tacir2', 2);
    await transport(a, b, 200_000);
    await transport(b, a, 150_000);

    expect(kinds(await svc.scan(worldId, FROM, TO))).not.toContain('oneWayResourceFlow');
  });

  /** ⚠️ Yalnız orana baksaydık 100 altınlık tek bir hediye de "tek yönlü akış" olurdu. */
  it('küçük hediye eşiği geçmez', async () => {
    const a = await player('comert', 1);
    const b = await player('acemi', 2);
    await transport(a, b, 500);

    expect(kinds(await svc.scan(worldId, FROM, TO))).not.toContain('oneWayResourceFlow');
  });

  /** ⚠️ Yoldaki ya da iptal edilmiş sefer kaynak TAŞIMADI; saymak yanlış olurdu. */
  it('tamamlanmamış nakliye sayılmaz', async () => {
    const a = await player('yolda1', 1);
    const b = await player('yolda2', 2);
    await h.db.execute(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id,
                            target_city_id, execute_at, payload)
      VALUES (${worldId}, 'transport', 'scheduled', ${a.id}, ${a.cityId}, ${b.cityId},
              ${AT}::timestamptz, ${JSON.stringify({ cargo: { gold: 999_999, food: 0 } })}::jsonb)
    `);
    expect(kinds(await svc.scan(worldId, FROM, TO))).not.toContain('oneWayResourceFlow');
  });

  it('pencere dışındaki nakliye sayılmaz', async () => {
    const a = await player('eski1', 1);
    const b = await player('eski2', 2);
    await transport(a, b, 500_000, '2026-01-01T00:00:00Z');
    expect(kinds(await svc.scan(worldId, FROM, TO))).not.toContain('oneWayResourceFlow');
  });
});

describe('B2 — kârsız saldırı çiftliği', () => {
  it('tekrarlayan ve hep aynı tarafın kazandığı savaşlar yakalanır', async () => {
    const atk = await player('ciftci', 1);
    const def = await player('kurban', 2);
    for (let i = 0; i < 6; i += 1) await battle(atk, def, 'attacker', { guard: 5 });

    const farm = (await svc.scan(worldId, FROM, TO)).find((s) => s.kind === 'attackFarm');
    expect(farm).toBeDefined();
    expect(farm!.evidence['savaşSayısı']).toBe(6);
    expect(farm!.evidence['hepKazanan']).toBe(atk.id);
  });

  /** ⚠️ Tek bir savaş hiçbir şey söylemez; sinyal TEKRAR üzerine kurulu. */
  it('tek savaş sinyal üretmez', async () => {
    const atk = await player('komsu1', 1);
    const def = await player('komsu2', 2);
    await battle(atk, def, 'attacker', { guard: 5 });
    expect(kinds(await svc.scan(worldId, FROM, TO))).not.toContain('attackFarm');
  });

  /** ⚠️ Gerçek bir savaşta iki taraf da kazanır — çekişme çiftlik değildir. */
  it('iki tarafın da kazandığı çekişme sinyal üretmez', async () => {
    const x = await player('rakip1', 1);
    const y = await player('rakip2', 2);
    for (let i = 0; i < 4; i += 1) await battle(x, y, 'attacker', { guard: 50 });
    for (let i = 0; i < 4; i += 1) await battle(y, x, 'attacker', { guard: 50 });
    expect(kinds(await svc.scan(worldId, FROM, TO))).not.toContain('attackFarm');
  });
});

describe('B6 — savunma tutarsızlığı', () => {
  /**
   * ⭐ SİNYALİN ÖZÜ KARŞILAŞTIRMA. Savunan, ortağına karşı boş; başkasına karşı dolu.
   * Birine karşı savunup diğerine karşı savunmamak bir TERCİHTİR, kaynak yokluğu değil.
   */
  it('ortağına karşı boş, başkasına karşı dolu savunan yakalanır', async () => {
    const partner = await player('ortak', 1);
    const stranger = await player('yabanci', 2);
    const def = await player('savunan', 3);

    for (let i = 0; i < 3; i += 1) await battle(partner, def, 'attacker', {});
    for (let i = 0; i < 3; i += 1) await battle(stranger, def, 'defender', { guard: 400 });

    const sig = (await svc.scan(worldId, FROM, TO)).find((s) => s.kind === 'defenseInconsistency');
    expect(sig).toBeDefined();
    expect(sig!.evidence['savunan']).toBe(def.id);
    expect([sig!.a, sig!.b]).toContain(partner.id);
  });

  /**
   * ⭐ EN ÖNEMLİ YANLIŞ POZİTİF SAVUNMASI. Herkese karşı savunmasız olan oyuncu ZAYIFTIR,
   * suçlu değil — ve oyunun en masum kesimi tam olarak orası. Karşılaştırma bunu eliyor.
   */
  it('HERKESE karşı savunmasız olan zayıf oyuncu yakalanmaz', async () => {
    const one = await player('saldiran1', 1);
    const two = await player('saldiran2', 2);
    const weak = await player('zayif', 3);

    for (let i = 0; i < 3; i += 1) await battle(one, weak, 'attacker', {});
    for (let i = 0; i < 3; i += 1) await battle(two, weak, 'attacker', {});

    expect(kinds(await svc.scan(worldId, FROM, TO))).not.toContain('defenseInconsistency');
  });

  /** ⚠️ Kıyas edecek başka saldırgan yoksa sinyal üretilemez — bilinmezliği suç sayma. */
  it('kıyaslanacak başka saldırgan yoksa sinyal yok', async () => {
    const atk = await player('tek', 1);
    const def = await player('hedef', 2);
    for (let i = 0; i < 4; i += 1) await battle(atk, def, 'attacker', {});
    expect(kinds(await svc.scan(worldId, FROM, TO))).not.toContain('defenseInconsistency');
  });
});

describe('B7 — sessiz ortaklar', () => {
  it('yoğun akış + hiç mesaj yoksa sinyal', async () => {
    const a = await player('sessiz1', 1);
    const b = await player('sessiz2', 2);
    await transport(a, b, 300_000);

    const sig = (await svc.scan(worldId, FROM, TO)).find((s) => s.kind === 'silentPartners');
    expect(sig).toBeDefined();
    expect(sig!.evidence['oyunİçiMesaj']).toBe(0);
  });

  /** ⚠️ Yazışan iki oyuncu "sessiz ortak" değildir. İÇERİK okunmuyor, yalnız var/yok. */
  it('aralarında mesaj varsa sinyal yok', async () => {
    const a = await player('konusan1', 1);
    const b = await player('konusan2', 2);
    await transport(a, b, 300_000);

    const key = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
    const [ch] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO chat_channels (world_id, kind, dm_key) VALUES (${worldId}, 'dm', ${key})
      RETURNING id
    `);
    await h.db.execute(sql`
      INSERT INTO chat_messages (channel_id, world_id, sender_id, body, created_at)
      VALUES (${Number(ch!['id'])}, ${worldId}, ${a.id}, 'selam', ${AT}::timestamptz)
    `);

    expect(kinds(await svc.scan(worldId, FROM, TO))).not.toContain('silentPartners');
  });
});

describe('tarama görevi — artımlı pencere', () => {
  /**
   * ⭐ Pencere `now()`den geriye sabit bir aralık DEĞİL. Öyle olsaydı worker bir gün kapalı
   * kaldığında o günün verisi hiç taranmadan geçerdi — ve eksik bir tarama "temiz" ile aynı
   * görünürdü.
   */
  it('ikinci koşu birincinin bittiği yerden devam eder', async () => {
    const scan = new AbuseScanService(h.db);
    const first = await scan.run(worldId, new Date('2026-06-10T00:00:00Z'));
    const second = await scan.run(worldId, new Date('2026-06-20T00:00:00Z'));
    expect(second.from.toISOString()).toBe(first.to.toISOString());
  });

  it('sinyaller kalıcı yazılıyor ve İKİNCİ koşu kopya üretmiyor', async () => {
    const a = await player('veren', 1);
    const b = await player('alan', 2);
    await transport(a, b, 400_000);

    const scan = new AbuseScanService(h.db);
    await scan.run(worldId, TO);
    // Aynı veriyi kapsayan ikinci koşu: satır GÜNCELLENMELİ, yenisi açılmamalı.
    await h.db.execute(sql`DELETE FROM abuse_scan_runs WHERE world_id = ${worldId}`);
    await scan.run(worldId, TO);

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM abuse_signals
       WHERE world_id = ${worldId} AND kind = 'oneWayResourceFlow'
    `);
    expect(Number(row!['n'])).toBe(1);

    /**
     * ⭐ §9.1.1: taramanın yazdığı satırlar **açık** doğar — skorlu bir gözlem, bir karar
     * değil. Tersi olsaydı sistem kendi kendine karar vermiş olur ve ilke kâğıt üstünde kalırdı.
     */
    const [open] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM abuse_signals
       WHERE world_id = ${worldId} AND (resolution IS NOT NULL OR resolved_at IS NOT NULL)
    `);
    expect(Number(open!['n'])).toBe(0);
  });

  /**
   * ⚠️ Yöneticinin "masum" kararı, bir sonraki taramanın onu yeniden açmasıyla kaybolmamalı.
   * Karara bağlanmış satıra DOKUNULMUYOR; yeni bir açık satır ise doğal olarak açılabilir.
   */
  it('karara bağlanmış satır taramayla geri açılmaz', async () => {
    const a = await player('veren', 1);
    const b = await player('alan', 2);
    await transport(a, b, 400_000);

    const scan = new AbuseScanService(h.db);
    await scan.run(worldId, TO);
    /**
     * ⚠️ Kaç satır olduğunu SAYIYORUZ, sabit yazmıyoruz: 400.000'lik tek yönlü bir nakliye
     * hem B1 (tek yönlü akış) hem B7 (sessiz ortaklar) üretiyor. Sabit "1" yazmıştım ve test
     * haklı olarak düştü — ölçüm doğruydu, beklenti yanlıştı.
     */
    const [before] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM abuse_signals WHERE world_id = ${worldId}
    `);
    await h.db.execute(sql`
      UPDATE abuse_signals SET resolved_at = now(), resolution = 'innocent'
       WHERE world_id = ${worldId}
    `);

    await h.db.execute(sql`DELETE FROM abuse_scan_runs WHERE world_id = ${worldId}`);
    await scan.run(worldId, TO);

    const [resolved] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM abuse_signals
       WHERE world_id = ${worldId} AND resolved_at IS NOT NULL AND resolution = 'innocent'
    `);
    // Kararlar yerinde duruyor — tarama hiçbirini geri açmadı.
    expect(Number(resolved!['n'])).toBe(Number(before!['n']));
  });

  /** ⚠️ Haftalık "hiçbir şey bulunamadı" postası okunmayan bir bildirime dönüşür. */
  it('eşiği geçen çift yoksa rapor postası GÖNDERİLMEZ', async () => {
    const scan = new AbuseScanService(h.db);
    const result = await scan.run(worldId, TO);
    expect(await scan.report(worldId, result)).toBe(false);

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM outbox
       WHERE topic = 'admin:abuse_report' AND (payload->>'worldId')::int = ${worldId}
    `);
    expect(Number(row!['n'])).toBe(0);
  });

  /** ⭐ §9.1.4: rapor MASUM AÇIKLAMALARI da taşıyor — okuyan kişi panelin başında olmayabilir. */
  it('eşik aşılınca rapor postası masum açıklamalarla birlikte düşer', async () => {
    const a = await player('veren', 1);
    const b = await player('alan', 2);
    await transport(a, b, 400_000);
    for (let i = 0; i < 6; i += 1) await battle(a, b, 'attacker', { guard: 3 });

    const scan = new AbuseScanService(h.db);
    const result = await scan.run(worldId, TO);
    expect(await scan.report(worldId, result)).toBe(true);

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT payload FROM outbox
       WHERE topic = 'admin:abuse_report' AND (payload->>'worldId')::int = ${worldId}
       ORDER BY id DESC LIMIT 1
    `);
    const payload = row!['payload'] as Record<string, unknown>;
    expect((payload['pairs'] as unknown[]).length).toBeGreaterThan(0);
    expect(Object.keys(payload['innocentNotes'] as object).length).toBeGreaterThan(0);
    expect(String(payload['reminder'])).toContain('suçlama listesi değildir');
  });
});
