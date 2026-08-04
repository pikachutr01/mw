/**
 * ⭐ KAYIT RİSKİ — tek kullanımlık e-posta, posta kutusu tekrarı, bot hızı (§9.1.7)
 *
 * Kullanıcının iki notu: *"temp mail gibi servislerden alınan garip e postalar ile e posta
 * doğrulama aşaması geçilebilir. Bunların tespitini yapıp banlayabilecek bir admin bölümü"* ve
 * *"bot hesap oluşturmayı tespit edip engelleme"*.
 *
 * ─ İKİ TEHDİT, İKİ FARKLI CEVAP ───────────────────────────────────────────────────────────
 * ⚠️ **Tek kullanımlık e-posta → TESPİT, engelleme değil (varsayılan).** Kullanıcının kendi
 * cümlesi "tespitini yapıp BANLAYABİLECEK bir admin bölümü": karar insanın. Ayrıca yanlış
 * pozitifin bedeli asimetrik — engellenen gerçek bir oyuncu geri gelmez ve neden giremediğini
 * öğrenemez. Panelden açılabilen bir sert engel var (`abuse.blockDisposableEmail`).
 * ⚠️ **Bot hızı → DOĞRUDAN ENGELLEME.** Orada bekleyecek bir insan yok; saniyede hesap açan
 * bir betiği "yönetici baksın" diye geçirmek, korumayı hiç yazmamakla aynı şey.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';
import { liveBool, liveNumber } from '../settings/live.ts';
import { isLocalAddress } from './ip-number.ts';

export const DISPOSABLE_LIST_URL =
  'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';

type Runner = Db | Tx;

/**
 * ⭐ Nokta ve `+etiket` temizleyen sağlayıcılar. Gmail her ikisini de yok sayar; çoğu modern
 * sağlayıcı yalnız `+etiket`i.
 *
 * ⚠️ Nokta temizliği YALNIZ bu listede: genel bir kural yapmak yanlış olurdu, çünkü birçok
 * sağlayıcıda `a.b@` ile `ab@` **farklı kişilerdir**. Yanlış birleştirme, iki yabancıyı aynı
 * posta kutusunda gösterip yöneticiyi hatalı karara sürüklerdi.
 */
const DOT_INSENSITIVE = new Set([
  'gmail.com', 'googlemail.com',
]);

export interface NormalizedEmail {
  /** Küçük harfli tam adres — depolanan `accounts.email` ile aynı biçim. */
  email: string;
  /** Posta KUTUSU kimliği: nokta/etiket temizlenmiş. */
  normalized: string;
  domain: string;
}

/**
 * E-postayı posta kutusu kimliğine indirger.
 *
 * ⚠️ Bu fonksiyon **kimlik doğrulamada kullanılmaz** ve kullanılmamalı: giriş hâlâ tam adresle
 * yapılıyor. Yalnız "kaç hesap aynı kutuya bakıyor" sorusunu yanıtlıyor. Doğrulamaya
 * karıştırsaydık `a.b@gmail.com` ile kaydolan biri `ab@gmail.com` ile de girebilirdi ve bu,
 * çözdüğümüzden daha büyük bir sürpriz olurdu.
 */
export function normalizeEmail(raw: string): NormalizedEmail | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return null;

  // `+etiket` her yerde atılıyor: bu, sağlayıcıların neredeyse tamamında aynı kutuya düşüyor.
  let box = local.split('+')[0] ?? local;
  if (DOT_INSENSITIVE.has(domain)) box = box.replaceAll('.', '');
  // ⚠️ Etiket temizliği yerel kısmı boşaltabiliyor (`+etiket@x.com`); o hâlde tam adresi koru.
  if (box === '') box = local;

  const canonicalDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  return { email, normalized: `${box}@${canonicalDomain}`, domain };
}

export interface SignupRisk {
  /** Aynı posta kutusuna bakan MEVCUT hesap sayısı (bu kayıt hariç). */
  sameMailbox: number;
  disposable: boolean;
  /** Son pencerede aynı /24'ten açılan hesap sayısı. */
  recentFromBlock: number;
  /** Kayıt reddedilmeli mi ve neden. */
  block: null | 'disposable_email' | 'signup_flood';
}

export class EmailRiskService {
  constructor(private readonly db: Runner) {}

  /** Alan tek kullanımlık listesinde mi? Liste yüklenmemişse `false` — kayıt akışı durmaz. */
  async isDisposable(domain: string): Promise<boolean> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM disposable_domains WHERE domain = ${domain} LIMIT 1
    `);
    return rows.length > 0;
  }

  /**
   * Kayıt anındaki risk değerlendirmesi.
   *
   * ⚠️ Hiçbir sorgu hatası kaydı DÜŞÜRMEZ (çağıran `try` ile sarıyor): risk ölçümü uğruna
   * gerçek bir oyuncunun kaydını kaybetmek kabul edilemez bir takas.
   */
  async assess(email: string, ip: string | null): Promise<SignupRisk> {
    const n = normalizeEmail(email);
    const risk: SignupRisk = {
      sameMailbox: 0, disposable: false, recentFromBlock: 0, block: null,
    };
    if (!n) return risk;

    const [same] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM accounts WHERE email_normalized = ${n.normalized}
    `);
    risk.sameMailbox = Number(same?.['n'] ?? 0);
    risk.disposable = await this.isDisposable(n.domain);

    /**
     * ⚠️ Öbek karşılaştırması **önek eşlemesiyle** (`10.0.0.%`), SQL'de `/24` kurup
     * karşılaştırmakla değil. İlk yazımda `split_part` zinciriyle her satırda öbek üretiyordum;
     * hem okunması zordu hem de her satırda dört fonksiyon çağırıyordu. Öneki JS'te bir kez
     * hesaplamak aynı sonucu veriyor ve sorgu tek bir `LIKE`a iniyor.
     * ⚠️ IPv6 kapsam dışı: kayıt trafiğinde nadir ve önek uzunluğu farklı — yanlış bir önekle
     * sessizce başka aboneleri aynı öbeğe koymaktansa sinyali hiç üretmemek doğru.
     *
     * ⚠️ **YEREL/ÖZEL ADRESLER MUAF.** İki sebep: (1) geliştirmede herkes `127.0.0.1`den
     * gelir ve sınır ilk beş kayıttan sonra tüm ortamı kilitlerdi; (2) canlıda özel bir adres
     * görüyorsak ters vekil zinciri bozuk demektir — o hâlde IP zaten kimseyi temsil etmiyor
     * ve ona dayanarak kayıt reddetmek, bozuk bir sinyalle gerçek oyuncuları dışarıda
     * bırakmak olurdu.
     */
    const prefix = ip != null && !ip.includes(':') && !isLocalAddress(ip)
      ? ip.split('.').slice(0, 3).join('.') : null;
    if (prefix != null && prefix.split('.').length === 3) {
      const minutes = liveNumber('abuse', 'signupWindowMinutes', 60);
      const [recent] = await this.db.execute<Record<string, unknown>>(sql`
        SELECT COUNT(*)::int AS n FROM accounts
         WHERE signup_ip IS NOT NULL
           AND created_at >= now() - (${minutes} * interval '1 minute')
           AND signup_ip LIKE ${`${prefix}.%`}
      `);
      risk.recentFromBlock = Number(recent?.['n'] ?? 0);
    }

    /**
     * ⚠️ BOT SINIRI ENGELLİYOR. Aynı /24'ten kısa sürede N hesap açmak bir insanın yapacağı
     * şey değil; orada karar verecek bir yönetici beklemek korumayı yazmamakla aynı.
     * ⚠️ Sınır cömert tutuldu: aynı ev, okul ya da mobil operatör NAT'ı ardışık birkaç kayıt
     * üretebilir. Amaç insanı değil BETİĞİ durdurmak.
     */
    const maxPerBlock = liveNumber('abuse', 'signupMaxPerBlock', 5);
    if (risk.recentFromBlock >= maxPerBlock) risk.block = 'signup_flood';
    else if (risk.disposable && liveBool('abuse', 'blockDisposableEmail', false)) {
      risk.block = 'disposable_email';
    }
    return risk;
  }

  /* ── Liste yönetimi ───────────────────────────────────────────────────────── */

  async status(): Promise<{ rows: number; refreshedAt: string; ageHours: number } | null> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT rows, refreshed_at FROM disposable_meta WHERE id = 1
    `);
    if (!row) return null;
    const at = new Date(String(row['refreshed_at']));
    return {
      rows: Number(row['rows']),
      refreshedAt: at.toISOString(),
      ageHours: Math.max(0, Math.round((Date.now() - at.getTime()) / 3_600_000)),
    };
  }

  /**
   * Listeyi yeniden yükler.
   *
   * ⚠️ `TRUNCATE` değil `DELETE`, tek transaction — `asn.service.ts`teki gerekçenin aynısı:
   * `TRUNCATE` ACCESS EXCLUSIVE alıp yükleme boyunca **kayıt akışını** bloklardı.
   * ⚠️ Boş liste tabloyu bozmuyor: yarım yüklenmiş bir tablo "hiçbir alan tek kullanımlık
   * değil" gibi sessiz ve yanlış bir sonuç üretirdi.
   */
  async refresh(opts: { url?: string; text?: string } = {}): Promise<number> {
    const source = opts.url ?? DISPOSABLE_LIST_URL;
    const body = opts.text ?? await this.download(source);
    const domains = [...new Set(
      body.split('\n')
        .map((l) => l.trim().toLowerCase())
        // ⚠️ Yorum ve boş satırlar listede var; alan gibi saklamak sorguyu kirletirdi.
        .filter((l) => l !== '' && !l.startsWith('#') && l.includes('.')),
    )];
    if (domains.length === 0) throw new Error('Alan listesi boş geldi; tablo değiştirilmedi.');

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM disposable_domains`);
      const CHUNK = 20_000;
      for (let i = 0; i < domains.length; i += CHUNK) {
        // ⚠️ jsonb üzerinden toplu ekleme — parametre sınırı ve gidiş-dönüş gerekçesi
        // `asn.service.ts`te ölçülerek yazılı (40,6 sn → 3,3 sn).
        const payload = JSON.stringify(domains.slice(i, i + CHUNK));
        await tx.execute(sql`
          INSERT INTO disposable_domains (domain)
          SELECT value FROM jsonb_array_elements_text(${payload}::jsonb)
          ON CONFLICT (domain) DO NOTHING
        `);
      }
      await tx.execute(sql`
        INSERT INTO disposable_meta (id, source, rows, refreshed_at)
        VALUES (1, ${source}, ${domains.length}, now())
        ON CONFLICT (id) DO UPDATE
          SET source = EXCLUDED.source, rows = EXCLUDED.rows, refreshed_at = EXCLUDED.refreshed_at
      `);
    });
    return domains.length;
  }

  /**
   * Mevcut hesapların posta kutusu kimliğini geriye dönük doldurur.
   * ⚠️ Yalnız boş olanlar taranıyor; tekrar çalıştırmak güvenli.
   */
  async backfill(limit = 20_000): Promise<number> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, email FROM accounts WHERE email_normalized IS NULL LIMIT ${limit}
    `);
    let done = 0;
    for (const r of rows) {
      const n = normalizeEmail(String(r['email']));
      if (!n) continue;
      await this.db.execute(sql`
        UPDATE accounts SET email_normalized = ${n.normalized} WHERE id = ${Number(r['id'])}
      `);
      done += 1;
    }
    return done;
  }

  private async download(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Alan listesi indirilemedi (${res.status}).`);
    return res.text();
  }
}
