/**
 * ⭐ §9.1.6 KABUL KRİTERİ: çoklu hesap sinyal TOPLAMA katmanı çalışıyor mu?
 *
 * Analiz henüz yok (Faz 4) — bu testler yalnız **verinin biriktiğini** kanıtlar. Kritik olan bu:
 * tespit mantığı sonradan yazılabilir, veri sonradan toplanamaz.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { extractDeviceContext } from '../src/abuse/device-context.ts';
import { DeviceSignalService, detectPlatform, ipBlock } from '../src/abuse/device-signal.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let svc: DeviceSignalService;

const DEV_A = '11111111-2222-3333-4444-555555555555';
const DEV_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeAll(async () => {
  h = await setupTestDb();
  svc = new DeviceSignalService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

/** İki oyuncu yaratır (aynı dünyada, FARKLI hesaplarla — tam olarak çoklu hesap senaryosu). */
async function twoPlayers(): Promise<[number, number]> {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  return [await createPlayer(h, worldId, 'bir'), await createPlayer(h, worldId, 'iki')];
}

beforeEach(async () => {
  await h.db.execute(sql`DELETE FROM player_devices`);
  await h.db.execute(sql`DELETE FROM player_ips`);
});

describe('IP öbekleme', () => {
  it('IPv4 /24 öbeği', () => {
    expect(ipBlock('85.104.12.7')).toBe('85.104.12.0/24');
    expect(ipBlock('::ffff:85.104.12.7')).toBe('85.104.12.0/24');
  });

  it('IPv6 /48 site öneki', () => {
    expect(ipBlock('2a02:ff0:1234:5678::1')).toBe('2a02:ff0:1234::/48');
  });

  it('geçersiz girdi null döner', () => {
    expect(ipBlock(null)).toBeNull();
    expect(ipBlock('abc')).toBeNull();
  });
});

describe('platform ayrımı (web ve mobil farklı sinyal taşır)', () => {
  it('mobil platformu AÇIKÇA bildirir (UA taklit edilebildiği için tahmine güvenilmez)', () => {
    expect(detectPlatform(null, 'android')).toBe('android');
    expect(detectPlatform('Mozilla/5.0 …', 'ios')).toBe('ios');
  });

  it('web UA’dan anlaşılır', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('web');
  });

  it('UA da bildirim de yoksa unknown', () => {
    expect(detectPlatform(null)).toBe('unknown');
  });
});

describe('başlık çıkarımı', () => {
  it('web isteği: device_id + UA', () => {
    const ctx = extractDeviceContext({
      headers: { 'x-device-id': DEV_A.toUpperCase(), 'user-agent': 'Mozilla/5.0' },
      ip: '85.104.12.7',
    });
    expect(ctx.deviceId).toBe(DEV_A);       // küçük harfe normalize
    expect(ctx.platform).toBe('web');
    expect(ctx.userAgent).toBe('Mozilla/5.0');
  });

  it('mobil isteği: UA yok, platform/model var', () => {
    const ctx = extractDeviceContext({
      headers: {
        'x-device-id': DEV_B, 'x-platform': 'android',
        'x-os-version': '14', 'x-device-model': 'Pixel 8', 'x-app-version': '1.0.3',
      },
      ip: '10.0.0.5',
    });
    expect(ctx.platform).toBe('android');
    expect(ctx.userAgent).toBeNull();
    expect(ctx.deviceModel).toBe('Pixel 8');
  });

  it('ters vekil arkasında gerçek IP X-Forwarded-For’un İLK öğesidir', () => {
    const ctx = extractDeviceContext({
      headers: { 'x-forwarded-for': '85.104.12.7, 10.0.0.1, 172.16.0.1' },
      ip: '10.0.0.1',
    });
    expect(ctx.ip).toBe('85.104.12.7');
  });

  it('uydurma device_id REDDEDİLİR (tablo kirlenmesin)', () => {
    expect(extractDeviceContext({ headers: { 'x-device-id': 'ben-bir-cihazim' } }).deviceId).toBeNull();
    expect(extractDeviceContext({ headers: { 'x-device-id': 'x'.repeat(5000) } }).deviceId).toBeNull();
  });
});

describe('⭐ kabul kriteri: sinyaller birikiyor', () => {
  it('aynı cihazdan iki hesaba girilirse AYNI device_id iki player_id ile görünür', async () => {
    const [p1, p2] = await twoPlayers();
    const web = { deviceId: DEV_A, ip: '85.104.12.7', userAgent: 'Mozilla/5.0', platform: 'web' as const };

    await svc.record(p1, web);
    await svc.record(p2, web);

    const paylasan = await svc.playersSharingDevice(DEV_A);
    expect(paylasan).toEqual([p1, p2].sort((a, b) => a - b));
  });

  it('aynı /24 öbeğinden gelen hesaplar eşleşir (ama bu ZAYIF sinyal — NAT olabilir)', async () => {
    const [p1, p2] = await twoPlayers();
    await svc.record(p1, { deviceId: DEV_A, ip: '85.104.12.7', userAgent: null, platform: 'web' });
    await svc.record(p2, { deviceId: DEV_B, ip: '85.104.12.200', userAgent: null, platform: 'android' });

    const paylasan = await svc.playersSharingIpBlock('85.104.12.0/24');
    expect(paylasan).toEqual([p1, p2].sort((a, b) => a - b));
  });

  it('tekrar girişler satır ÇOĞALTMAZ, sayaç artırır', async () => {
    const [p1] = await twoPlayers();
    const ctx = { deviceId: DEV_A, ip: '85.104.12.7', userAgent: null, platform: 'web' as const };
    await svc.record(p1, ctx);
    await svc.record(p1, ctx);
    await svc.record(p1, ctx);

    const rows = await h.db.execute<{ hits: number } & Record<string, unknown>>(sql`
      SELECT hits FROM player_devices WHERE player_id = ${p1} AND device_id = ${DEV_A}
    `);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.hits)).toBe(3);
  });

  it('device_id yoksa IP yine kaydedilir (kısmi sinyal de değerlidir)', async () => {
    const [p1] = await twoPlayers();
    await svc.record(p1, { deviceId: null, ip: '85.104.12.7', userAgent: null, platform: 'unknown' });

    const dev = await h.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM player_devices WHERE player_id = ${p1}
    `);
    const ips = await h.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM player_ips WHERE player_id = ${p1}
    `);
    expect(dev).toHaveLength(0);
    expect(ips).toHaveLength(1);
  });

  it('analiz tabloları hazır ama BOŞ (Faz 4’e kadar hiçbir karar üretilmez)', async () => {
    const signals = await h.db.execute<{ n: number } & Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM abuse_signals
    `);
    const runs = await h.db.execute<{ n: number } & Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM abuse_scan_runs
    `);
    expect(Number(signals[0]!.n)).toBe(0);
    expect(Number(runs[0]!.n)).toBe(0);
  });
});
