/**
 * IP adresi → sayı. ASN aralık aramasının temeli (§9.1.2).
 *
 * ⚠️ **Neden `inet` değil `numeric`?** Postgres'in `inet` tipi aralık KARŞILAŞTIRMASI için
 * kullanılabilir ama iptoasn veri kümesi CIDR değil **açık aralık** veriyor
 * (`1.0.0.0  1.0.0.255  13335  US  CLOUDFLARENET`) ve bu aralıklar CIDR sınırlarına
 * oturmuyor. `inet`e çevirip `<<=` ile aramak, veriyi olduğu gibi taşımamak demekti.
 * Sayısal aralık hem birebir aslına sadık hem de tek bir btree indeksiyle aranabiliyor.
 *
 * ⚠️ IPv6 128 bit — `Number` 53 bitte taşar. Bu yüzden `bigint` ve sınırda `numeric`.
 * `Number` kullansaydık iki farklı IPv6 adresi aynı sayıya çökebilirdi ve arama sessizce
 * yanlış ASN'i bulurdu.
 */

export interface IpNumber {
  /** 4 veya 6 — aralık tablosu iki aileyi ayrı tutuyor. */
  family: 4 | 6;
  value: bigint;
}

const V4_MAX = 0xff_ff_ff_ffn;

/** `::ffff:1.2.3.4` gibi eşlenmiş adresler ve `%eth0` gibi kapsam ekleri temizlenir. */
function clean(ip: string): string {
  return (ip.trim().replace(/^::ffff:/i, '').split('%')[0] ?? '').trim();
}

function parseV4(s: string): bigint | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let out = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = (out << 8n) | BigInt(n);
  }
  return out;
}

/**
 * IPv6 ayrıştırma — `::` kısaltmasını da kabul eder.
 * ⚠️ Son grup noktalı IPv4 olabilir (`::ffff:192.0.2.1` biçiminin genel hâli); o durumda
 * 32 bitlik değer iki gruba açılıyor.
 */
function parseV6(s: string): bigint | null {
  if (s.split('::').length > 2) return null;
  const [head = '', tail = ''] = s.includes('::') ? s.split('::') : [s, ''];
  const toGroups = (part: string): string[] | null => {
    if (part === '') return [];
    const g = part.split(':');
    const last = g[g.length - 1]!;
    if (last.includes('.')) {
      const v4 = parseV4(last);
      if (v4 == null) return null;
      g.pop();
      g.push(((v4 >> 16n) & 0xffffn).toString(16), (v4 & 0xffffn).toString(16));
    }
    return g;
  };
  const a = toGroups(head);
  const b = s.includes('::') ? toGroups(tail) : [];
  if (a == null || b == null) return null;

  const missing = 8 - a.length - b.length;
  if (!s.includes('::') ? missing !== 0 : missing < 0) return null;
  const groups = [...a, ...Array<string>(s.includes('::') ? missing : 0).fill('0'), ...b];
  if (groups.length !== 8) return null;

  let out = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    out = (out << 16n) | BigInt(parseInt(g, 16));
  }
  return out;
}

/**
 * Metinden sayıya. Ayrıştırılamayan adres için `null` — çağıran sessizce zenginleştirmeyi
 * atlar. ⚠️ Hata FIRLATMIYOR: bu yol giriş akışında koşuyor ve bozuk bir `X-Forwarded-For`
 * yüzünden oyuncunun girişi başarısız olmamalı.
 */
export function ipToNumber(ip: string | null | undefined): IpNumber | null {
  if (!ip) return null;
  const s = clean(ip);
  if (s === '') return null;
  if (s.includes(':')) {
    const v = parseV6(s);
    return v == null ? null : { family: 6, value: v };
  }
  const v = parseV4(s);
  return v == null || v > V4_MAX ? null : { family: 4, value: v };
}

/** Sayıdan metne — yalnız testler ve tanılama için. */
export function numberToIp(n: IpNumber): string {
  if (n.family === 4) {
    return [24n, 16n, 8n, 0n].map((sh) => Number((n.value >> sh) & 0xffn)).join('.');
  }
  const groups: string[] = [];
  for (let i = 7n; i >= 0n; i -= 1n) {
    groups.push(((n.value >> (i * 16n)) & 0xffffn).toString(16));
  }
  return groups.join(':');
}
