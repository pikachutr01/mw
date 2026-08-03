/**
 * ⭐ ÇOKLU HESAP — BAĞLANTI ANALİZİ (§9.1, A katmanı: teknik sinyaller)
 *
 * `DeviceSignalService` üç yıldır *"yalnız kaydeder, karar vermez"* diyordu ve gerçekten öyleydi:
 * `playersSharingDevice`/`playersSharingIpBlock` yazılmıştı ama **hiçbir çağıranı yoktu**. Veri
 * birikiyor, kimse bakmıyordu. Bu servis o veriyi okunabilir hâle getiriyor.
 *
 * ─ DEĞİŞMEZ İLKE (§9.1.1) ─────────────────────────────────────────────────────────────────
 * **Buradan çıkan hiçbir sayı ceza vermez.** Çıktı skorlu bir rapor; kararı insan verir. Sebep
 * teknik değil ahlaki: her izin masum açıklaması var (aynı evdeki kardeşler, okul/ofis ağı,
 * operatör NAT'ı, paylaşılan tablet) ve haksız banın bedeli — oyuncu kaybı + itibar — yanlış
 * pozitifi tolere edilemez kılıyor. Bu yüzden her sinyal, yanındaki **masum açıklamasıyla**
 * birlikte taşınıyor (`INNOCENT_EXPLANATION`) ve panel onu ekranda gösteriyor.
 *
 * ─ ÜÇ KURAL, ÜÇÜ DE SESSİZ HATA KAYNAĞI OLURDU ────────────────────────────────────────────
 *
 * 1. **YALNIZ AYNI DÜNYA.** Farklı dünyalardaki iki hesap birbirini besleyemez: ekonomileri,
 *    haritaları ve sıralamaları ayrı. §9.1'in tarif ettiği tehdit (kendi kendini besleme,
 *    sahte savaş, puan üretimi) dünya içinde gerçekleşir. Dünyalar arası çiftleri raporlamak
 *    gürültüden başka bir şey üretmezdi.
 *
 *    ⭐ Bu kural aynı zamanda EN BÜYÜK yanlış pozitifi kapatıyor: `player_devices` `player_id`
 *    ile anahtarlı ve tek bir hesabın iki dünyadaki iki oyuncusu doğal olarak aynı cihazı
 *    paylaşır. Dünya kısıtı olmasaydı her çoklu-dünya oyuncusu kendini en yüksek skorla
 *    çoklu hesap olarak ihbar ederdi.
 *
 * 2. **AYNI HESABIN OYUNCULARI ELENİR** (`pa.account_id <> pb.account_id`).
 *    ⚠️ Bu kontrol BUGÜN gereksiz: `players_world_account` benzersiz indeksi bir hesabın bir
 *    dünyada birden fazla oyuncusu olmasını zaten imkânsız kılıyor, yani dünya kısıtı varken
 *    hiçbir satırı elemiyor. Yine de duruyor — çünkü yukarıdaki kural bir gün gevşetilirse
 *    (ör. "dünyalar arası da bak") koruma kendiliğinden devrede olsun, o günü hatırlayacak
 *    birine bel bağlamayalım.
 *
 * 3. **BÜYÜK GRUPLAR TAMAMEN YOK SAYILIR** (`abuse.maxGroupSize`). Bir cihazı/IP'yi 40 kişi
 *    paylaşıyorsa orası internet kafe ya da operatör NAT'ıdır ve oradaki iki hesabın aynı
 *    kişiye ait olma ihtimali normalden YÜKSEK DEĞİLDİR — sinyalin bilgi değeri sıfır.
 *    Üstüne, n oyuncu n×(n−1)/2 çift üretiyor: 200 kişilik bir okul ağı tek başına 19.900
 *    satır demek ve rapor okunamaz hâle gelirdi.
 *
 * ─ «SIRA SIRA OTURUM» NEDEN AYRI DURUYOR ──────────────────────────────────────────────────
 * B3 sinyali (§9.1.2) yalnız BAŞKA bir sinyali olan çiftler için hesaplanıyor. İki sebep:
 *   • **Anlam**: "hiç aynı anda çevrimiçi olmadılar" tek başına hiçbir şey söylemez — sabah
 *     oynayanla gece oynayan iki yabancı da hiç örtüşmez. Sinyal ancak ortada zaten bir bağ
 *     varken "aynı kişi hesap değiştiriyor"a işaret eder.
 *   • **Maliyet**: aksi hâlde dünyadaki HER oyuncu çifti için oturum aralıkları kesiştirmek
 *     gerekirdi.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { liveNumber } from '../settings/live.ts';

export type SignalKind =
  | 'sameDevice' | 'sameIp' | 'sameIpBlock' | 'registrationCohort' | 'sessionHandoff';

export interface AbuseConfig {
  reportThreshold: number;
  weights: Record<SignalKind, number>;
  cohortMinutes: number;
  handoffMinutes: number;
  maxGroupSize: number;
  lookbackDays: number;
}

export function abuseConfig(): AbuseConfig {
  return {
    reportThreshold: liveNumber('abuse', 'reportThreshold', 60),
    weights: {
      sameDevice: liveNumber('abuse', 'weightSameDevice', 40),
      sameIp: liveNumber('abuse', 'weightSameIp', 20),
      sameIpBlock: liveNumber('abuse', 'weightSameIpBlock', 8),
      registrationCohort: liveNumber('abuse', 'weightRegistrationCohort', 12),
      sessionHandoff: liveNumber('abuse', 'weightSessionHandoff', 15),
    },
    cohortMinutes: liveNumber('abuse', 'cohortMinutes', 120),
    handoffMinutes: liveNumber('abuse', 'handoffMinutes', 20),
    maxGroupSize: liveNumber('abuse', 'maxGroupSize', 8),
    lookbackDays: liveNumber('abuse', 'lookbackDays', 90),
  };
}

/**
 * ⭐ Her sinyalin **masum açıklaması** — §9.1.4'ün açık şartı: *"her biri için «masum açıklama»
 * notu"*. Panelde sinyalin yanında görünüyor.
 *
 * ⚠️ Bunlar süs değil. Yönetici listeyi hızlı okur ve yüksek skor "suçlu" gibi hissettirir;
 * masum açıklamanın aynı satırda durması, kararın ancak DAVRANIŞA bakarak verilebileceğini
 * her seferinde hatırlatıyor.
 */
export const INNOCENT_EXPLANATION: Record<SignalKind, string> = {
  sameDevice: 'Aynı evdeki kardeşler, paylaşılan tablet, ödünç verilen telefon. '
    + 'Cihaz kimliği tarayıcı deposu temizlenince de sıfırlanır — yani KAÇINILMASI kolay, '
    + 'yanlışlıkla oluşması da kolay.',
  sameIp: 'Aynı ev, aynı ofis, aynı yurt odası. Mobil operatörlerde binlerce abone tek '
    + 'IP\'nin arkasında olabilir (CGNAT).',
  sameIpBlock: 'Aynı aboneliğin dinamik IP\'si, aynı mahalledeki iki abone ya da aynı '
    + 'operatör havuzu. Tam IP eşleşmesinden belirgin şekilde zayıf.',
  registrationCohort: 'Oyuna birlikte başlayan iki arkadaş ya da kardeş tam olarak böyle '
    + 'görünür: aynı ağdan, dakikalar arayla kayıt.',
  sessionHandoff: 'Tek bilgisayarı sırayla kullanan iki kişi (ev, ofis) aynı deseni üretir. '
    + 'Ayrıca oturum kaydı yalnız GİRİŞ/YENİLEME anını bilir, oyuncunun ekran başında geçirdiği '
    + 'gerçek süreyi değil.',
};

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  sameDevice: 'Aynı cihaz',
  sameIp: 'Aynı IP',
  sameIpBlock: 'Aynı IP öbeği',
  registrationCohort: 'Kayıt kohortu',
  sessionHandoff: 'Sıra sıra oturum',
};

export interface PairSignal {
  kind: SignalKind;
  score: number;
  evidence: Record<string, unknown>;
}

export interface LinkedPair {
  worldId: number;
  a: { id: number; username: string; accountId: number };
  b: { id: number; username: string; accountId: number };
  score: number;
  signals: PairSignal[];
}

/** Ham satır → `{a, b}` anahtarı. Çift daima küçük id önce (şema yorumundaki sıralama kuralı). */
const keyOf = (a: number, b: number): string => `${a}:${b}`;

/**
 * Yerel/özel ağ adresi mi? IP zinciri teşhisinin **sebep** ayrımı için.
 *
 * ⚠️ Bu bir güvenlik kontrolü DEĞİL — yalnız yönetici mesajının doğru cümleyi kurması için.
 * Geliştirmede herkes `127.0.0.1`den gelir ve bu bozuk bir zincir değil, sadece localhost'tur;
 * canlıda ise tek bir GENEL IP'de toplanmak gerçek bir arıza işaretidir.
 */
function isLocalAddress(ip: string | null): boolean {
  if (!ip) return false;
  const v = ip.replace(/^::ffff:/, '').split('%')[0] ?? ip;
  if (v === '::1' || v === '0.0.0.0' || v === '::') return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(v)) return true;              // ULA + link-local (IPv6)
  const o = v.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n))) return false;
  return o[0] === 127 || o[0] === 10
    || (o[0] === 192 && o[1] === 168)
    || (o[0] === 172 && o[1]! >= 16 && o[1]! <= 31)
    || (o[0] === 169 && o[1] === 254);
}

export class LinkService {
  constructor(private readonly db: Db) {}

  /**
   * Bir dünyadaki şüpheli oyuncu çiftlerini skorlayıp döndürür.
   *
   * ⚠️ Hiçbir şey YAZMAZ. `abuse_signals` satırları Tur 8'in tarama görevinin işi; burada
   * canlı hesap yapılıyor ki panel her açıldığında güncel veriyi görsün ve ayar değiştirince
   * etkisi ANINDA gözlensin (ağırlıkları körlemesine ayarlamak istenmiyor).
   */
  async pairs(worldId: number, opts: { minScore?: number; limit?: number } = {}): Promise<LinkedPair[]> {
    const cfg = abuseConfig();
    const minScore = opts.minScore ?? cfg.reportThreshold;
    const limit = opts.limit ?? 200;

    const found = new Map<string, PairSignal[]>();
    const add = (a: number, b: number, s: PairSignal): void => {
      const list = found.get(keyOf(a, b));
      if (list) list.push(s); else found.set(keyOf(a, b), [s]);
    };

    for (const row of await this.sharedDevices(worldId, cfg)) {
      add(row.a, row.b, {
        kind: 'sameDevice', score: cfg.weights.sameDevice,
        evidence: { cihazSayısı: row.shared, örnek: row.sample.slice(0, 8), platform: row.platform },
      });
    }

    const exactIp = new Set<string>();
    for (const row of await this.sharedIps(worldId, cfg)) {
      exactIp.add(keyOf(row.a, row.b));
      add(row.a, row.b, {
        kind: 'sameIp', score: cfg.weights.sameIp,
        evidence: { ipSayısı: row.shared, örnek: row.sample },
      });
    }

    /**
     * ⚠️ Öbek puanı tam IP puanının ÜSTÜNE EKLENMEZ. Aynı IP'yi paylaşan çift zaten aynı
     * öbeği de paylaşıyor; ikisini birden saymak tek bir gerçeği iki kanıt gibi göstererek
     * çifti hak etmediği bir skora çıkarırdı.
     */
    for (const row of await this.sharedIpBlocks(worldId, cfg)) {
      if (exactIp.has(keyOf(row.a, row.b))) continue;
      add(row.a, row.b, {
        kind: 'sameIpBlock', score: cfg.weights.sameIpBlock,
        evidence: { öbekSayısı: row.shared, örnek: row.sample },
      });
    }

    for (const row of await this.registrationCohort(worldId, cfg)) {
      add(row.a, row.b, {
        kind: 'registrationCohort', score: cfg.weights.registrationCohort,
        evidence: { aradakiDakika: Math.round(row.gapSeconds / 60), öbek: row.block },
      });
    }

    // ⚠️ Devralma YALNIZ zaten bir bağı olan çiftler için — gerekçe dosya başlığında.
    const candidates = [...found.keys()].map((k) => {
      const [a, b] = k.split(':');
      return { a: Number(a), b: Number(b) };
    });
    for (const row of await this.sessionHandoff(candidates, cfg)) {
      add(row.a, row.b, {
        kind: 'sessionHandoff', score: cfg.weights.sessionHandoff,
        evidence: { enKısaAralıkDakika: Math.round(row.gapSeconds / 60), hiçÖrtüşmedi: true },
      });
    }

    const scored = [...found.entries()]
      .map(([k, signals]) => {
        const [a, b] = k.split(':');
        return {
          a: Number(a), b: Number(b), signals,
          score: signals.reduce((t, s) => t + s.score, 0),
        };
      })
      .filter((p) => p.score >= minScore)
      .sort((x, y) => y.score - x.score)
      .slice(0, limit);

    return this.withNames(worldId, scored);
  }

  /* ── Sinyal sorguları ─────────────────────────────────────────────────────
   *
   * ⚠️ Dördü de aynı iskeleti paylaşıyor: (1) pencereyle sınırla, (2) grubu büyüklüğüne göre
   * ele, (3) `y.player_id > x.player_id` ile çifti TEK YÖNDE üret, (4) aynı hesabı ve farklı
   * dünyayı dışla. Ortak bir yardımcıya indirmedim: her sorgunun kanıt alanı farklı ve
   * "genel" bir kurucu, okuyanın SQL'i kafasında canlandırmasını zorlaştırırdı.
   */

  private async sharedDevices(worldId: number, cfg: AbuseConfig): Promise<
    { a: number; b: number; shared: number; sample: string; platform: string | null }[]
  > {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH dev AS (
        SELECT d.device_id, d.player_id, d.platform
          FROM player_devices d
          JOIN players p ON p.id = d.player_id
         WHERE p.world_id = ${worldId}
           AND d.last_seen >= now() - (${cfg.lookbackDays} * interval '1 day')
      ),
      grp AS (
        SELECT device_id FROM dev
         GROUP BY device_id
        HAVING COUNT(DISTINCT player_id) BETWEEN 2 AND ${cfg.maxGroupSize}
      )
      SELECT x.player_id AS a, y.player_id AS b,
             COUNT(DISTINCT x.device_id)::int AS shared,
             MIN(x.device_id) AS sample,
             MIN(x.platform)  AS platform
        FROM dev x
        JOIN dev y ON y.device_id = x.device_id AND y.player_id > x.player_id
        JOIN grp g ON g.device_id = x.device_id
        JOIN players pa ON pa.id = x.player_id
        JOIN players pb ON pb.id = y.player_id
       WHERE pa.account_id <> pb.account_id
       GROUP BY x.player_id, y.player_id
    `);
    return rows.map((r) => ({
      a: Number(r['a']), b: Number(r['b']), shared: Number(r['shared']),
      sample: String(r['sample']),
      platform: r['platform'] == null ? null : String(r['platform']),
    }));
  }

  private async sharedIps(worldId: number, cfg: AbuseConfig): Promise<
    { a: number; b: number; shared: number; sample: string }[]
  > {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH ips AS (
        SELECT i.ip, i.player_id
          FROM player_ips i
          JOIN players p ON p.id = i.player_id
         WHERE p.world_id = ${worldId}
           AND i.last_seen >= now() - (${cfg.lookbackDays} * interval '1 day')
      ),
      grp AS (
        SELECT ip FROM ips
         GROUP BY ip
        HAVING COUNT(DISTINCT player_id) BETWEEN 2 AND ${cfg.maxGroupSize}
      )
      SELECT x.player_id AS a, y.player_id AS b,
             COUNT(DISTINCT x.ip)::int AS shared, MIN(x.ip) AS sample
        FROM ips x
        JOIN ips y ON y.ip = x.ip AND y.player_id > x.player_id
        JOIN grp g ON g.ip = x.ip
        JOIN players pa ON pa.id = x.player_id
        JOIN players pb ON pb.id = y.player_id
       WHERE pa.account_id <> pb.account_id
       GROUP BY x.player_id, y.player_id
    `);
    return rows.map((r) => ({
      a: Number(r['a']), b: Number(r['b']),
      shared: Number(r['shared']), sample: String(r['sample']),
    }));
  }

  private async sharedIpBlocks(worldId: number, cfg: AbuseConfig): Promise<
    { a: number; b: number; shared: number; sample: string }[]
  > {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH blocks AS (
        SELECT i.ip_block_24 AS blk, i.player_id
          FROM player_ips i
          JOIN players p ON p.id = i.player_id
         WHERE p.world_id = ${worldId}
           AND i.ip_block_24 IS NOT NULL
           AND i.last_seen >= now() - (${cfg.lookbackDays} * interval '1 day')
      ),
      grp AS (
        SELECT blk FROM blocks
         GROUP BY blk
        HAVING COUNT(DISTINCT player_id) BETWEEN 2 AND ${cfg.maxGroupSize}
      )
      SELECT x.player_id AS a, y.player_id AS b,
             COUNT(DISTINCT x.blk)::int AS shared, MIN(x.blk) AS sample
        FROM blocks x
        JOIN blocks y ON y.blk = x.blk AND y.player_id > x.player_id
        JOIN grp g ON g.blk = x.blk
        JOIN players pa ON pa.id = x.player_id
        JOIN players pb ON pb.id = y.player_id
       WHERE pa.account_id <> pb.account_id
       GROUP BY x.player_id, y.player_id
    `);
    return rows.map((r) => ({
      a: Number(r['a']), b: Number(r['b']),
      shared: Number(r['shared']), sample: String(r['sample']),
    }));
  }

  /**
   * B5 — kayıt kohortu. **Aynı IP öbeği** + **kayıtları birbirine yakın**.
   *
   * ⚠️ Kayıt anındaki IP'yi ayrı saklamıyoruz; ölçüt "oyuncunun bilinen öbeklerinden birini
   * paylaşıyorlar" + "kayıt zamanları pencerede". Daha zayıf ama dürüst bir yaklaşım:
   * `player_ips.first_seen`i kayıt IP'si saymak, hesabını açtıktan bir hafta sonra evden
   * ilk kez giren oyuncuda yanlış olurdu.
   */
  private async registrationCohort(worldId: number, cfg: AbuseConfig): Promise<
    { a: number; b: number; gapSeconds: number; block: string }[]
  > {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH blocks AS (
        SELECT i.ip_block_24 AS blk, i.player_id
          FROM player_ips i
          JOIN players p ON p.id = i.player_id
         WHERE p.world_id = ${worldId}
           AND i.ip_block_24 IS NOT NULL
           AND i.last_seen >= now() - (${cfg.lookbackDays} * interval '1 day')
      ),
      grp AS (
        SELECT blk FROM blocks
         GROUP BY blk
        HAVING COUNT(DISTINCT player_id) BETWEEN 2 AND ${cfg.maxGroupSize}
      )
      SELECT x.player_id AS a, y.player_id AS b,
             MIN(ABS(EXTRACT(EPOCH FROM (pb.created_at - pa.created_at))))::int AS gap_seconds,
             MIN(x.blk) AS blk
        FROM blocks x
        JOIN blocks y ON y.blk = x.blk AND y.player_id > x.player_id
        JOIN grp g ON g.blk = x.blk
        JOIN players pa ON pa.id = x.player_id
        JOIN players pb ON pb.id = y.player_id
       WHERE pa.account_id <> pb.account_id
         AND ABS(EXTRACT(EPOCH FROM (pb.created_at - pa.created_at)))
             <= ${cfg.cohortMinutes * 60}
       GROUP BY x.player_id, y.player_id
    `);
    return rows.map((r) => ({
      a: Number(r['a']), b: Number(r['b']),
      gapSeconds: Number(r['gap_seconds']), block: String(r['blk']),
    }));
  }

  /**
   * B3 — «hiç aynı anda çevrimiçi değil ama sırayla devralıyor».
   *
   * Oturum aralığı = `sessions.created_at` … `last_seen_at`. Sinyal İKİ koşulu birden ister:
   *   • hiçbir aralık çifti ÖRTÜŞMÜYOR, **ve**
   *   • bir aralığın bitişiyle diğerinin başlangıcı arasında `handoffMinutes`ten kısa boşluk var.
   *
   * ⚠️ Yalnız örtüşmemeye bakmak yanlış olurdu: sabah oynayanla gece oynayan iki YABANCI da
   * hiç örtüşmez. Deseni anlamlı kılan devralmanın kendisi.
   *
   * ⚠️ Aralıklar HESAP düzeyinde (`sessions.account_id`); oyuncuya `players` üzerinden
   * bağlanıyor. Oturum dünya bilmiyor — bir hesapla iki dünyaya girmek tek oturumdur.
   */
  private async sessionHandoff(
    pairs: { a: number; b: number }[], cfg: AbuseConfig,
  ): Promise<{ a: number; b: number; gapSeconds: number }[]> {
    if (pairs.length === 0) return [];
    const values = sql.join(
      pairs.map((p) => sql`(${p.a}::bigint, ${p.b}::bigint)`),
      sql`, `,
    );
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH cand(a, b) AS (VALUES ${values}),
      spans AS (
        SELECT p.id AS player_id,
               s.created_at AS t0,
               GREATEST(s.last_seen_at, s.created_at) AS t1
          FROM sessions s
          JOIN players p ON p.account_id = s.account_id
         WHERE s.created_at >= now() - (${cfg.lookbackDays} * interval '1 day')
      )
      SELECT c.a, c.b,
             BOOL_OR(tstzrange(x.t0, x.t1, '[]') && tstzrange(y.t0, y.t1, '[]')) AS overlapped,
             MIN(LEAST(
               CASE WHEN y.t0 >= x.t1 THEN EXTRACT(EPOCH FROM (y.t0 - x.t1)) END,
               CASE WHEN x.t0 >= y.t1 THEN EXTRACT(EPOCH FROM (x.t0 - y.t1)) END
             ))::int AS gap_seconds
        FROM cand c
        JOIN spans x ON x.player_id = c.a
        JOIN spans y ON y.player_id = c.b
       GROUP BY c.a, c.b
    `);
    return rows
      .filter((r) => r['overlapped'] !== true
        && r['gap_seconds'] != null
        && Number(r['gap_seconds']) <= cfg.handoffMinutes * 60)
      .map((r) => ({
        a: Number(r['a']), b: Number(r['b']), gapSeconds: Number(r['gap_seconds']),
      }));
  }

  /* ── Sunum ────────────────────────────────────────────────────────────────── */

  private async withNames(
    worldId: number,
    scored: { a: number; b: number; score: number; signals: PairSignal[] }[],
  ): Promise<LinkedPair[]> {
    if (scored.length === 0) return [];
    const ids = [...new Set(scored.flatMap((p) => [p.a, p.b]))];
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, username, account_id FROM players
       WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    `);
    const by = new Map(rows.map((r) => [Number(r['id']), {
      id: Number(r['id']), username: String(r['username']), accountId: Number(r['account_id']),
    }]));
    const unknown = (id: number): { id: number; username: string; accountId: number } =>
      ({ id, username: `#${id}`, accountId: 0 });
    return scored.map((p) => ({
      worldId,
      a: by.get(p.a) ?? unknown(p.a),
      b: by.get(p.b) ?? unknown(p.b),
      score: p.score,
      signals: p.signals,
    }));
  }

  /**
   * ⭐ GERÇEK IP ZİNCİRİ TEŞHİSİ — planın *"VPS'te teyit edilecek"* maddesinin kalıcı hâli.
   *
   * Sorun: Cloudflare arkasında `ops/nginx/cloudflare-realip.conf` sunucuda yüklü DEĞİLSE
   * `player_ips` **her oyuncu için Cloudflare edge IP'sini** kaydeder ve bu ekranın IP
   * sinyalleri sessizce değersizleşir. Tehlikeli olan şey sessizliği: tablo dolu görünür,
   * sorgular çalışır, sonuçlar anlamsızdır.
   *
   * ⚠️ Cloudflare IP aralıklarının kopyasını buraya GÖMMEDİM. İkinci bir liste tutmak, o liste
   * bayatladığı gün "zincir bozuk" diye yanlış alarm üretirdi. Bunun yerine bozukluğun
   * KENDİSİ ölçülüyor: zincir kopuksa herkes tek IP'de görünür. Liste gerektirmiyor, bayatlamıyor.
   */
  async ipChainHealth(worldId: number): Promise<{
    players: number; distinctIps: number; topIp: string | null; topIpPlayers: number;
    suspect: boolean; topIpLocal: boolean;
  }> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      WITH ips AS (
        SELECT i.ip, i.player_id
          FROM player_ips i
          JOIN players p ON p.id = i.player_id
         WHERE p.world_id = ${worldId}
      ),
      top AS (
        SELECT ip, COUNT(DISTINCT player_id)::int AS n
          FROM ips GROUP BY ip ORDER BY n DESC LIMIT 1
      )
      SELECT (SELECT COUNT(DISTINCT player_id)::int FROM ips) AS players,
             (SELECT COUNT(DISTINCT ip)::int FROM ips)        AS distinct_ips,
             (SELECT ip FROM top)                             AS top_ip,
             COALESCE((SELECT n FROM top), 0)                 AS top_n
    `);
    const players = Number(row?.['players'] ?? 0);
    const topIpPlayers = Number(row?.['top_n'] ?? 0);
    const topIp = row?.['top_ip'] == null ? null : String(row['top_ip']);
    return {
      players,
      distinctIps: Number(row?.['distinct_ips'] ?? 0),
      topIp,
      topIpPlayers,
      /**
       * ⚠️ Eşik oyuncu sayısına bağlı: 3 oyunculu bir test dünyasında herkesin aynı IP'de
       * olması gayet normal (aynı ev, aynı geliştirici). Şüphe ancak yeterince oyuncu varken
       * ve çoğunluk tek IP'deyken anlamlı.
       */
      suspect: players >= 8 && topIpPlayers / players >= 0.6,
      /**
       * ⭐ SEBEBİ AYIRT ET. İlk yazımda panel her toplanmada *"Cloudflare kenar sunucusu"*
       * diyordu ve geliştirmede bu **yanlıştı**: orada herkes `127.0.0.1`den geliyor, ortada
       * bozuk bir zincir yok. Yanlış teşhis, gerçek teşhisin de ciddiye alınmamasına yol açar.
       */
      topIpLocal: isLocalAddress(topIp),
    };
  }
}
