/**
 * ⭐ IP → ASN / ÜLKE ZENGİNLEŞTİRME (§9.1.2)
 *
 * `player_ips.asn` kolonu 0002'den beri duruyordu ve **hiç doldurulmuyordu**. Bu servis onu
 * dolduruyor — ve bunu yaparken oyuncu IP'sini sunucudan hiç çıkarmıyor.
 *
 * ─ NEDEN YEREL TABLO, İSTEK BAŞINA API DEĞİL ──────────────────────────────────────────────
 * Asıl gerekçe fiyat değil **gizlilik**: bir geolocation servisi çağırmak, her oyuncunun
 * IP'sini üçüncü bir tarafa göndermek demekti. §9.1.5 oyunculara birbirinin IP'sini
 * göstermeyi yasaklarken aynı veriyi bir satıcıya akıtmak daha büyük bir ihlal olurdu.
 * İkincil kazanç: sıfır gecikme (giriş akışında koşuyor), sıfır kota, çevrimdışı çalışma.
 *
 * ─ KAYNAK: iptoasn.com ────────────────────────────────────────────────────────────────────
 * Public Domain (PDDL v1.0) · saatlik güncelleniyor · hesap/anahtar yok · düz TSV ·
 * ülke sütununu da taşıyor. Elenenler: MaxMind GeoLite2 (hesap + lisans anahtarı + imzalı
 * EULA), IPinfo (2025'te 1.000 istek/gün + kredi kartı), ip-api.com (ücretsiz katman
 * **ticari kullanıma kapalı**), DB-IP Lite (CC-BY atıf + yalnız aylık), O-X-L geoip-asn
 * (iyi ama MMDB okuyucu bağımlılığı + indirme kotası).
 *
 * ⭐ Düz TSV olmasının somut kazancı: **yeni bir npm bağımlılığı yok.** `.mmdb` okuyucu
 * eklemek, tedarik zincirine tek bir kolon için bir paket daha sokmak olurdu.
 */
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { ipToNumber } from './ip-number.ts';

export const IPTOASN_URL = 'https://iptoasn.com/data/ip2asn-combined.tsv.gz';

export interface AsnInfo {
  asn: number;
  name: string | null;
  country: string | null;
}

export interface AsnStatus {
  rows: number;
  refreshedAt: string;
  source: string;
  ageHours: number;
}

/**
 * ⚠️ **BU BİR TAHMİN, KANIT DEĞİL.** AS adından ağ türü çıkarmak sezgisel bir eşleşme; liste
 * eksik ve adlar değişebilir. Bu yüzden çıktısı **hiçbir skora girmiyor** — yalnız yöneticinin
 * gördüğü satıra bir not düşüyor.
 *
 * ⭐ Yine de değerli: veri merkezi IP'si, çoklu hesap açanın kaçış yolu olan VPN/proxy
 * kullanımının en görünür izi. "Aynı IP" sinyali masum olabilir; "aynı VERİ MERKEZİ IP'si"
 * masum açıklaması çok daha zayıf bir olaydır ve yöneticinin bunu bilmesi gerekir.
 */
const HOSTING_HINT =
  /\b(OVH|HETZNER|DIGITALOCEAN|LINODE|VULTR|CHOOPA|M247|CONTABO|LEASEWEB|SCALEWAY|ONLINE[- ]?SAS|AMAZON|AWS|GOOGLE[- ]?CLOUD|MICROSOFT|AZURE|ORACLE[- ]?CLOUD|ALIBABA|TENCENT|CLOUDFLARE|DATACAMP|CDN77|PACKETHUB|G[- ]?CORE|HOSTING|SERVERS?|DATACENTER|DATA[- ]?CENTER|VPN|PROXY)\b/i;

export function hostingHint(asnName: string | null | undefined): boolean {
  return asnName != null && HOSTING_HINT.test(asnName);
}

export class AsnService {
  constructor(private readonly db: Db) {}

  /**
   * Tek IP araması. Bulunamazsa `null` — çağıran sessizce geçer.
   *
   * ⚠️ Sorgu deseni indeksle birebir uyumlu: `range_start <= x` üzerinde AZALAN tarama, İLK
   * satırda durup `range_end`i kontrol ediyor. `BETWEEN` yazsaydık planlayıcı iki taraflı bir
   * aralık taraması yapar ve büyük bloklarda binlerce satır okurdu.
   */
  async lookup(ip: string | null): Promise<AsnInfo | null> {
    const n = ipToNumber(ip);
    if (!n) return null;
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT asn, country, description, range_end
        FROM ip_asn_ranges
       WHERE family = ${n.family}
         AND range_start <= ${n.value.toString()}::numeric
       ORDER BY range_start DESC
       LIMIT 1
    `);
    if (!row) return null;
    /**
     * ⚠️ `range_end` kontrolü SQL'de DEĞİL burada. Sebep: indeks `range_start`i sıralıyor ve
     * "en büyük başlangıç ≤ IP" tek adaydır — aralıklar çakışmadığı için başka bir satır zaten
     * eşleşemez. `range_end`i WHERE'e koysaydık ilk aday elenince planlayıcı geriye doğru
     * taramaya devam eder, aralıklar arası boşluklarda binlerce satır okurdu.
     * Aday aralığın dışındaysa "bu IP hiçbir AS'e ait değil" demektir.
     */
    if (BigInt(String(row['range_end'])) < n.value) return null;
    const asn = Number(row['asn']);
    // ⚠️ ASN 0 = iptoasn'ın "duyurulmamış aralık" işareti. Sayı olarak saklamak yanıltıcı
    // olurdu ("AS0'dan giriyor"); yok sayılıyor ama ülke bilgisi yine de değerli.
    return {
      asn,
      name: asn === 0 || row['description'] == null ? null : String(row['description']),
      country: row['country'] == null || row['country'] === '' ? null : String(row['country']),
    };
  }

  async status(): Promise<AsnStatus | null> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT source, rows, refreshed_at FROM ip_asn_meta WHERE id = 1
    `);
    if (!row) return null;
    const at = new Date(String(row['refreshed_at']));
    return {
      rows: Number(row['rows']),
      refreshedAt: at.toISOString(),
      source: String(row['source']),
      ageHours: Math.max(0, Math.round((Date.now() - at.getTime()) / 3_600_000)),
    };
  }

  /**
   * ⭐ ARALIK TABLOSUNU YENİDEN YÜKLE.
   *
   * ⚠️ **`TRUNCATE` DEĞİL `DELETE`.** `TRUNCATE` ACCESS EXCLUSIVE kilidi alır ve yükleme
   * boyunca (yüz binlerce satır) `lookup()` çağrılarını — yani GİRİŞ AKIŞINI — bloklardı.
   * `DELETE` yalnız satır kilidi alır; MVCC sayesinde okuyucular commit'e kadar ESKİ veriyi
   * görmeye devam eder. Tazeleme, oyuncuların girişini hiç etkilemiyor.
   *
   * ⚠️ Hepsi TEK transaction: yarım yüklenmiş bir tabloya düşmek, "bu IP hiçbir AS'e ait
   * değil" gibi sessiz ve yanlış bir sonuç üretirdi.
   */
  async refresh(opts: { url?: string; stream?: NodeJS.ReadableStream } = {}): Promise<number> {
    const source = opts.url ?? IPTOASN_URL;
    const input = opts.stream ?? await this.download(source);
    const rows = await this.parse(input);
    if (rows.length === 0) throw new Error('ASN veri kümesi boş geldi; tablo değiştirilmedi.');

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM ip_asn_ranges`);
      /**
       * ⭐ TOPLU EKLEME **JSONB ÜZERİNDEN** — ölçüldü: 712.483 satır için
       * çok satırlı `VALUES` ile **40,6 sn**, buradaki desenle **3,3 sn** (12 kat).
       *
       * ⚠️ Fark parametre sayısından geliyor. `VALUES (…),(…)` her hücreyi ayrı bir bağlama
       * parametresi yapıyor; Postgres'in tavanı 65.534 olduğu için parça başına ~10.000 satır
       * sığıyor ve 70+ gidiş-dönüş, milyonlarca parametre bağlaması gerekiyordu.
       * Burada parça başına **tek bir parametre** var: JSON metni. Ayrıştırmayı Postgres
       * yapıyor.
       *
       * ⚠️ Elle dizi/CSV literali kurmayı BİLEREK seçmedim: AS adları tırnak, virgül ve ters
       * bölü içerebiliyor ve kaçış kurallarını elle yazmak enjeksiyon yüzeyi açardı.
       * `JSON.stringify` bunu doğru yapıyor, `jsonb` de doğru okuyor.
       *
       * ⚠️ 40 saniye yalnız yavaş değil, RİSKLİYDİ: bu yükleme yönetim panelinden HTTP
       * isteğiyle tetikleniyor ve nginx'in varsayılan `proxy_read_timeout` değeri 60 sn.
       */
      const CHUNK = 50_000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const payload = JSON.stringify(rows.slice(i, i + CHUNK)
          .map((r) => [r.family, r.start, r.end, r.asn, r.country, r.description]));
        await tx.execute(sql`
          INSERT INTO ip_asn_ranges (family, range_start, range_end, asn, country, description)
          SELECT (e->>0)::smallint, (e->>1)::numeric, (e->>2)::numeric,
                 (e->>3)::bigint, e->>4, e->>5
            FROM jsonb_array_elements(${payload}::jsonb) AS e
        `);
      }
      await tx.execute(sql`
        INSERT INTO ip_asn_meta (id, source, rows, refreshed_at)
        VALUES (1, ${source}, ${rows.length}, now())
        ON CONFLICT (id) DO UPDATE
          SET source = EXCLUDED.source, rows = EXCLUDED.rows, refreshed_at = EXCLUDED.refreshed_at
      `);
    });
    return rows.length;
  }

  /**
   * Zaten kayıtlı IP'leri geriye dönük zenginleştirir — tablo ilk kez yüklendiğinde eski
   * satırlar da künye kazansın.
   *
   * ⚠️ Yalnız künyesi EKSİK satırlar taranıyor (`asn IS NULL`): tekrar tekrar çalıştırmak
   * güvenli ve ikinci koşu neredeyse bedava.
   */
  async backfill(limit = 5000): Promise<{ scanned: number; matched: number }> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT DISTINCT ip FROM player_ips WHERE asn IS NULL LIMIT ${limit}
    `);
    let matched = 0;
    for (const r of rows) {
      const ip = String(r['ip']);
      const info = await this.lookup(ip);
      if (!info) continue;
      matched += 1;
      await this.db.execute(sql`
        UPDATE player_ips
           SET asn = ${String(info.asn)}, asn_name = ${info.name},
               country = COALESCE(country, ${info.country})
         WHERE ip = ${ip}
      `);
    }
    return { scanned: rows.length, matched };
  }

  /* ── Yardımcılar ──────────────────────────────────────────────────────────── */

  private async download(url: string): Promise<NodeJS.ReadableStream> {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`ASN veri kümesi indirilemedi (${res.status}).`);
    }
    return Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  }

  /**
   * TSV ayrıştırma: `başlangıç \t bitiş \t ASN \t ülke \t açıklama`.
   *
   * ⚠️ Aile, aralığın KENDİSİNDEN çıkarılıyor (birleşik dosya v4 ve v6'yı bir arada veriyor).
   * ⚠️ Ayrıştırılamayan satır sessizce atlanıyor: 500 binlik bir veri kümesinde tek bozuk
   * satır yüzünden tüm tazelemeyi düşürmek yanlış takas olurdu.
   */
  private async parse(input: NodeJS.ReadableStream): Promise<{
    family: number; start: string; end: string; asn: number;
    country: string | null; description: string | null;
  }[]> {
    const out: {
      family: number; start: string; end: string; asn: number;
      country: string | null; description: string | null;
    }[] = [];
    const lines = createInterface({ input: input.pipe(createGunzip()), crlfDelay: Infinity });
    for await (const line of lines) {
      if (line === '') continue;
      const [from, to, asnRaw, countryRaw, ...rest] = line.split('\t');
      const a = ipToNumber(from);
      const b = ipToNumber(to);
      if (!a || !b || a.family !== b.family) continue;
      const asn = Number(asnRaw);
      if (!Number.isInteger(asn)) continue;
      const description = rest.join('\t').trim();
      out.push({
        family: a.family,
        start: a.value.toString(),
        end: b.value.toString(),
        asn,
        // ⚠️ iptoasn bilinmeyen ülkeyi `None` yazıyor — dize olarak saklamak "None ülkesi"
        // diye bir şey uydururdu.
        country: countryRaw == null || countryRaw === '' || countryRaw === 'None'
          ? null : countryRaw,
        description: description === '' || description === 'Not routed' ? null : description,
      });
    }
    return out;
  }
}
