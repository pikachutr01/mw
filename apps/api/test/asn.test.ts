/**
 * ⭐ IP → ASN / ÜLKE ZENGİNLEŞTİRME (§9.1.2, kullanıcı isteği 2026-08-04).
 *
 * İki ayrı risk test ediliyor:
 *
 * 1. **Sayıya çevirme.** Burada bir hata SESSİZDİR: yanlış sayı, yanlış aralığa denk gelir ve
 *    oyuncuya olmadığı bir ağ atanır. `Number` kullanılsaydı IPv6'nın 128 biti 53 bitte taşar
 *    ve iki farklı adres aynı sayıya çökerdi — bu yüzden `bigint` ve bu yüzden sınır testleri.
 *
 * 2. **Aralık araması.** `range_start <= x ORDER BY range_start DESC LIMIT 1` deseni, aralıklar
 *    arası BOŞLUKLARDA yanlış cevap verebilir: en yakın alttaki aralık bulunur ama IP onun
 *    içinde değildir. `range_end` kontrolü tam olarak bunu kapatıyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AsnService, hostingHint } from '../src/abuse/asn.service.ts';
import { ipToNumber, numberToIp } from '../src/abuse/ip-number.ts';
import { extractDeviceContext } from '../src/abuse/device-context.ts';
import type { DbHandle } from '../src/db/client.ts';
import { setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let svc: AsnService;

beforeAll(async () => {
  h = await setupTestDb();
  svc = new AsnService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  await h.db.execute(sql`DELETE FROM ip_asn_ranges`);
  await h.db.execute(sql`DELETE FROM ip_asn_meta`);
});

const range = async (
  family: number, from: string, to: string, asn: number, country: string, desc: string,
): Promise<void> => {
  await h.db.execute(sql`
    INSERT INTO ip_asn_ranges (family, range_start, range_end, asn, country, description)
    VALUES (${family}, ${ipToNumber(from)!.value.toString()}::numeric,
            ${ipToNumber(to)!.value.toString()}::numeric, ${asn}, ${country}, ${desc})
  `);
};

describe('IP → sayı', () => {
  it('IPv4 sınır değerleri', () => {
    expect(ipToNumber('0.0.0.0')?.value).toBe(0n);
    expect(ipToNumber('255.255.255.255')?.value).toBe(4_294_967_295n);
    expect(ipToNumber('1.0.0.0')?.value).toBe(16_777_216n);
    expect(ipToNumber('192.168.1.1')?.value).toBe(3_232_235_777n);
  });

  /** ⚠️ 128 bit: `Number` ile bu değer 53 bitte taşar ve komşu adreslerden ayırt edilemezdi. */
  it('IPv6 128 biti KAYIPSIZ taşır', () => {
    const max = ipToNumber('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff');
    expect(max?.value).toBe(2n ** 128n - 1n);
    // Yalnız son bit farkı: `Number` olsaydı ikisi de aynı değere çökerdi.
    const a = ipToNumber('2a02:ff0:1234:5678:9abc:def0:1234:5678')!.value;
    const b = ipToNumber('2a02:ff0:1234:5678:9abc:def0:1234:5679')!.value;
    expect(b - a).toBe(1n);
  });

  it('`::` kısaltması ve IPv4-eşlenmiş biçimler', () => {
    expect(ipToNumber('::1')?.value).toBe(1n);
    expect(ipToNumber('2001:db8::')?.family).toBe(6);
    // ⚠️ `::ffff:` öneki temizlenip IPv4 olarak ele alınıyor — aralık tablosu v4 ailesinde.
    expect(ipToNumber('::ffff:85.104.12.7')).toEqual(ipToNumber('85.104.12.7'));
    // Kapsam eki (`%eth0`) atılır.
    expect(ipToNumber('fe80::1%eth0')?.family).toBe(6);
  });

  it('bozuk girdi HATA FIRLATMAZ, null döner', () => {
    // ⚠️ Bu yol giriş akışında koşuyor: bozuk bir X-Forwarded-For yüzünden oyuncunun girişi
    // düşmemeli.
    for (const bad of ['', '1.2.3', '1.2.3.4.5', '256.0.0.1', 'abc', '1::2::3', null, undefined]) {
      expect(ipToNumber(bad)).toBeNull();
    }
  });

  it('gidiş-dönüş', () => {
    for (const ip of ['8.8.8.8', '0.0.0.0', '255.255.255.255']) {
      expect(numberToIp(ipToNumber(ip)!)).toBe(ip);
    }
  });
});

describe('ASN araması', () => {
  it('aralık içindeki IP bulunur', async () => {
    await range(4, '85.104.0.0', '85.104.255.255', 9121, 'TR', 'TTNET');
    const info = await svc.lookup('85.104.12.7');
    expect(info).toEqual({ asn: 9121, name: 'TTNET', country: 'TR' });
  });

  it('sınırlar DAHİL', async () => {
    await range(4, '85.104.0.0', '85.104.255.255', 9121, 'TR', 'TTNET');
    expect((await svc.lookup('85.104.0.0'))?.asn).toBe(9121);
    expect((await svc.lookup('85.104.255.255'))?.asn).toBe(9121);
  });

  /**
   * ⭐ ASIL TUZAK. `range_start <= x` tek başına, aralıklar arası boşluktaki bir IP için
   * "en yakın alttaki" aralığı döndürürdü — yani oyuncuya ait olmadığı bir ağ atanırdı.
   */
  it('aralıklar arası BOŞLUKTAKİ IP eşleşmez', async () => {
    await range(4, '85.104.0.0', '85.104.255.255', 9121, 'TR', 'TTNET');
    await range(4, '95.0.0.0', '95.0.255.255', 47331, 'TR', 'TURKTELECOM');
    // 90.x, iki aralığın ARASINDA: alttaki aralık 85.104.x ama IP onun içinde değil.
    expect(await svc.lookup('90.1.2.3')).toBeNull();
  });

  it('v4 ve v6 aileleri birbirine karışmaz', async () => {
    await range(4, '0.0.0.0', '255.255.255.255', 1, 'US', 'HEPSI-V4');
    await range(6, '2a02::', '2a02:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 20940, 'DE', 'AKAMAI');
    expect((await svc.lookup('8.8.8.8'))?.asn).toBe(1);
    expect((await svc.lookup('2a02:1::5'))?.asn).toBe(20940);
  });

  /** ⚠️ iptoasn duyurulmamış aralıkları ASN 0 ile listeliyor; "AS0'dan giriyor" demek yanlış. */
  it('ASN 0 (duyurulmamış) ad üretmez ama ülkeyi korur', async () => {
    await range(4, '10.0.0.0', '10.255.255.255', 0, 'TR', 'Not routed');
    const info = await svc.lookup('10.1.2.3');
    expect(info?.asn).toBe(0);
    expect(info?.name).toBeNull();
  });

  it('tablo boşken arama null döner (yükleme öncesi hâli)', async () => {
    expect(await svc.lookup('8.8.8.8')).toBeNull();
  });

  it('ayrıştırılamayan IP için sorgu bile atılmaz', async () => {
    expect(await svc.lookup('bozuk-adres')).toBeNull();
    expect(await svc.lookup(null)).toBeNull();
  });
});

describe('veri kümesi yükleme', () => {
  /** Gerçek iptoasn biçimi: `başlangıç \t bitiş \t ASN \t ülke \t açıklama`, gzip'li. */
  const fixture = async (): Promise<NodeJS.ReadableStream> => {
    const { gzipSync } = await import('node:zlib');
    const { Readable } = await import('node:stream');
    const tsv = [
      '1.0.0.0\t1.0.0.255\t13335\tUS\tCLOUDFLARENET',
      '85.104.0.0\t85.104.255.255\t9121\tTR\tTTNET',
      '2a02:ff0::\t2a02:ff0:ffff:ffff:ffff:ffff:ffff:ffff\t34984\tTR\tTELLCOM',
      '192.0.0.0\t192.0.0.255\t0\tNone\tNot routed',
      'BOZUK SATIR',
      '',
    ].join('\n');
    return Readable.from([gzipSync(Buffer.from(tsv, 'utf8'))]);
  };

  it('TSV yüklenir, bozuk satır ATLANIR, künye yazılır', async () => {
    const n = await svc.refresh({ url: 'test://fixture', stream: await fixture() });
    // ⚠️ Bozuk satır tüm tazelemeyi düşürmüyor: 500 binlik bir veri kümesinde tek bir hatalı
    // satır yüzünden hiç güncelleme yapmamak yanlış takas olurdu.
    expect(n).toBe(4);

    expect((await svc.lookup('1.0.0.5'))?.asn).toBe(13335);
    expect((await svc.lookup('2a02:ff0::1'))?.asn).toBe(34984);

    const st = await svc.status();
    expect(st?.rows).toBe(4);
    expect(st?.source).toBe('test://fixture');
    expect(st?.ageHours).toBe(0);
  });

  /** ⚠️ iptoasn bilinmeyen ülkeyi `None` yazıyor — dize olarak saklamak «None ülkesi» uydururdu. */
  it('`None` ülke ve «Not routed» açıklaması null’a çevrilir', async () => {
    await svc.refresh({ url: 'test://fixture', stream: await fixture() });
    const info = await svc.lookup('192.0.0.1');
    expect(info?.country).toBeNull();
    expect(info?.name).toBeNull();
  });

  it('boş veri kümesi tabloyu BOZMAZ', async () => {
    await svc.refresh({ url: 'test://fixture', stream: await fixture() });
    const { gzipSync } = await import('node:zlib');
    const { Readable } = await import('node:stream');
    await expect(svc.refresh({
      stream: Readable.from([gzipSync(Buffer.from('', 'utf8'))]),
    })).rejects.toThrow();
    // ⚠️ Eski veri yerinde: yarım/boş bir yükleme "bu IP hiçbir ağa ait değil" gibi sessiz ve
    // yanlış bir sonuç üretirdi.
    expect((await svc.lookup('85.104.1.1'))?.asn).toBe(9121);
  });
});

describe('geriye dönük doldurma', () => {
  it('künyesiz eski IP kayıtları tamamlanır', async () => {
    await svc.refresh({ url: 'test://fixture', stream: await (async () => {
      const { gzipSync } = await import('node:zlib');
      const { Readable } = await import('node:stream');
      return Readable.from([gzipSync(Buffer.from(
        '85.104.0.0\t85.104.255.255\t9121\tTR\tTTNET', 'utf8'))]);
    })() });

    // ⚠️ E-posta benzersiz: sabit bir adres ikinci koşuda `accounts_email_unique`e çarpıyordu.
    const [acc] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO accounts (email, password_hash)
      VALUES (${`bf-${randomUUID().slice(0, 8)}@t.local`}, 'x') RETURNING id
    `);
    const [w] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM worlds ORDER BY id LIMIT 1
    `);
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      INSERT INTO players (world_id, account_id, username, score)
      VALUES (${Number(w!['id'])}, ${Number(acc!['id'])}, ${`bf_${Date.now()}`}, 0) RETURNING id
    `);
    await h.db.execute(sql`
      INSERT INTO player_ips (player_id, ip, ip_block_24)
      VALUES (${Number(p!['id'])}, '85.104.9.9', '85.104.9.0/24')
    `);

    const res = await svc.backfill();
    expect(res.matched).toBeGreaterThanOrEqual(1);

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT asn, asn_name, country FROM player_ips WHERE player_id = ${Number(p!['id'])}
    `);
    expect(row).toMatchObject({ asn: '9121', asn_name: 'TTNET', country: 'TR' });
  });
});

describe('Cloudflare ülke başlığı', () => {
  it('CF-IPCountry okunur ve büyük harfe normalize edilir', () => {
    const ctx = extractDeviceContext({ headers: { 'cf-ipcountry': 'tr' }, ip: '1.2.3.4' });
    expect(ctx.country).toBe('TR');
  });

  /** ⚠️ `XX` = bilinmiyor, `T1` = Tor çıkışı. Ülke kodu gibi saklamak sahte bir ülke uydururdu. */
  it('XX ve T1 ülke sayılmaz', () => {
    for (const v of ['XX', 'T1', '', 'TURKIYE']) {
      expect(extractDeviceContext({ headers: { 'cf-ipcountry': v } }).country).toBeNull();
    }
  });

  it('başlık yoksa null — akış bozulmaz', () => {
    expect(extractDeviceContext({ headers: {}, ip: '1.2.3.4' }).country).toBeNull();
  });
});

describe('veri merkezi ipucu', () => {
  /**
   * ⚠️ Bu bir TAHMİN, kanıt değil — ve bilerek hiçbir skora girmiyor, yalnız yöneticinin
   * gördüğü satıra not düşüyor. Yine de değerli: veri merkezi IP'si, çoklu hesap açanın
   * kaçış yolu olan VPN kullanımının en görünür izi.
   */
  it('bilinen barındırma sağlayıcıları işaretlenir', () => {
    for (const n of ['OVH SAS', 'Hetzner Online GmbH', 'DIGITALOCEAN-ASN', 'M247 Europe']) {
      expect(hostingHint(n)).toBe(true);
    }
  });

  it('operatör ve ev interneti işaretlenmez', () => {
    for (const n of ['TTNET', 'TURKCELL-AS', 'Vodafone Net', 'Superonline', null]) {
      expect(hostingHint(n)).toBe(false);
    }
  });
});
