/**
 * ⭐ E-POSTA DOĞRULAMA ve ŞİFRE SIFIRLAMA (§9.2).
 *
 * `AuthService`ten AYRI bir sınıf: kayıt/giriş akışı zaten uzun ve bu iş onun değişmezlerine
 * (tek transaction'da hesap+oyuncu+başkent) dokunmuyor. Ortak olan tek şey `PasswordService`.
 *
 * ⭐ **Kullanıcı kararı: doğrulama YUMUŞAK.** Doğrulanmamış hesap oyuna girer, üstte bir şerit
 * uyarır. Doğrulama yalnız **şifre sıfırlama** için şart — ve bu şartın sebebi güvenlik:
 * doğrulanmamış bir adrese sıfırlama bağlantısı göndermek, yanlış yazılmış (ya da başkasına
 * ait) bir posta kutusuna hesabın anahtarını teslim etmek olurdu.
 *
 * ⚠️ **Sayım sızdırmaz.** `forgot-password` var olmayan adreste de BAŞARILI döner
 * (`auth.service.ts`teki sahte-hash zaman eşitlemesiyle aynı felsefe): 404 dönseydi uç, geçerli
 * e-posta adreslerini doğrulayan bir sorgulama aracına dönerdi.
 */
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';

import type { Db } from '../db/client.ts';
import { PasswordService } from '../auth/password.service.ts';
import { MAIL, mailLimits } from './mail.limits.ts';
import {
  deleteAccount, emailChanged, passwordChanged, resetPassword, verifyEmail, type Template,
} from './templates.ts';
import { log } from '../common/logger.ts';

const MAIL_LOG = log('mail');

export type MailErrorCode =
  | 'invalid_token'          // jeton yok / süresi dolmuş / kullanılmış
  | 'already_verified'
  | 'cooldown'               // çok sık istendi
  | 'quota'                  // günlük tavan
  | 'invalid_credentials'    // mevcut parola yanlış (şifre / adres değiştirme)
  | 'weak_password'
  | 'not_verified'           // doğrulanmamış adrese sıfırlama gönderilmez
  /* ── adres değiştirme (2026-08-01) ── */
  | 'same_email'             // yeni adres mevcut adresle aynı
  | 'email_taken';           // adres başka bir hesapta

export class EmailError extends Error {
  constructor(
    readonly code: MailErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'EmailError';
  }
}

/**
 * ⚠️ `email_tokens.purpose` düz `text` ve CHECK'i YOK → yeni amaç eklemek migration istemiyor.
 * `delete` 2026-08-01'de eklendi (hesap silme, §9.2c).
 */
type Purpose = 'verify' | 'reset' | 'delete';

/**
 * Amaca göre TTL, URL yolu ve şablon. Tek tabloda toplandı: üç ayrı üçlü dallanma
 * (`ttlSeconds` · `path` · `tpl`) dördüncü amaç eklenirken birinin unutulmasına açıktı.
 */
const PURPOSE = {
  verify: {
    path: 'verify-email',
    ttl: (): number => mailLimits().verifyTtlHours * 3600,
    tpl: verifyEmail,
  },
  reset: {
    path: 'reset-password',
    ttl: (): number => mailLimits().resetTtlMinutes * 60,
    tpl: resetPassword,
  },
  /**
   * ⭐ **12 saat** (kullanıcı şartı) — doğrulamadan kısa, sıfırlamadan uzun. Silme geri
   * alınamaz, o yüzden pencere dar; ama oyuncunun "bunu gerçekten istiyor muyum" diye
   * düşünmesi için sıfırlamanın 60 dakikasından bol.
   */
  delete: {
    path: 'hesap-sil',
    ttl: (): number => 12 * 3600,
    tpl: deleteAccount,
  },
} as const;

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export class EmailTokenService {
  private readonly passwords = new PasswordService();

  constructor(private readonly db: Db) {}

  /* ── Jeton üretimi ────────────────────────────────────────────────────────── */

  /**
   * Jeton üretir, outbox'a `mail:send` satırı yazar. **Tek transaction**: jeton yazılıp mail
   * satırı yazılamazsa kullanıcı sonsuza kadar bekleyen bir jetonla kalırdı.
   */
  private async issue(o: {
    accountId: number; email: string; username: string; purpose: Purpose; ip?: string | null;
  }): Promise<{ token: string }> {
    const token = randomBytes(32).toString('base64url');
    const spec = PURPOSE[o.purpose];
    const ttlSeconds = spec.ttl();
    const url = `${MAIL.appOrigin}/${spec.path}?token=${token}`;
    const tpl = spec.tpl({ username: o.username, url });

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO email_tokens (account_id, purpose, token_hash, email, expires_at, created_ip)
        VALUES (${o.accountId}, ${o.purpose}, ${hashToken(token)}, ${o.email},
                now() + (${ttlSeconds} || ' seconds')::interval, ${o.ip ?? null})
      `);
      /* ⚠️ `world_id` NULL: posta dünya-üstüdür (hesap düzeyi). Gateway `worldId` yoksa olayı
         düşürür — istediğimiz de bu, mailin WS karşılığı yok. */
      await tx.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (NULL, 'mail:send', ${JSON.stringify({
        to: o.email, subject: tpl.subject, html: tpl.html, text: tpl.text,
      })}::jsonb)
      `);
    });

    return { token };
  }

  /**
   * Hız sınırı — yeni bağımlılık yok, `chat.service.ts` gibi **DB sayımlı**.
   * Hesap başına cooldown + günlük tavan, ayrıca IP başına günlük tavan (farklı hesaplara
   * dağıtılan posta kutusu bombardımanı).
   *
   * ⚠️ **Cooldown AMAÇ BAŞINA sayılır** (`purpose`), hesap başına değil. Ortak sayılınca canlı
   * denemede şu çıktı: kayıt olan oyuncu 60 sn içinde "şifremi unuttum" derse, kayıt sırasında
   * giden DOĞRULAMA maili cooldown'u doldurduğu için sıfırlama maili **sessizce** hiç
   * gönderilmiyordu (sayım sızdırmama kuralı gereği hata da dönmüyor). Amaç başına ayırmak
   * bombardıman korumasını bozmuyor: günlük tavan zaten hesap geneli.
   *
   * ⚠️ **`skipCooldown` — adres değiştirmenin yarasıydı** (2026-08-01 testinde bulundu).
   * Cooldown "aynı maili tekrar isteme" freni; adres değiştirmek ise **başka bir eylem** ve
   * yan ürünü olarak bir doğrulama maili üretiyor. Fren orada da işleyince şu oluyordu:
   * e-postasını yanlış yazıp hemen düzeltmek isteyen oyuncu, kayıt mailinin 60 saniyesine
   * takılıyor ve **adres değişimi hiç gerçekleşmiyordu** — yani hatalı adresle kalıyordu.
   * Günlük tavanlar (hesap + IP) yerinde kalıyor, bombardıman koruması bozulmuyor.
   */
  private async assertQuota(
    accountId: number, purpose: Purpose, ip?: string | null,
    opts: { skipCooldown?: boolean } = {},
  ): Promise<void> {
    const [r] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM email_tokens
          WHERE account_id = ${accountId} AND purpose = ${purpose}
            AND created_at > now() - (${mailLimits().resendCooldownSeconds} || ' seconds')::interval) AS recent,
        (SELECT COUNT(*)::int FROM email_tokens
          WHERE account_id = ${accountId} AND created_at > now() - interval '1 day') AS daily,
        (SELECT COUNT(*)::int FROM email_tokens
          WHERE created_ip IS NOT NULL AND created_ip = ${ip ?? null}
            AND created_at > now() - interval '1 day') AS ip_daily
    `);
    if (!opts.skipCooldown && Number(r?.['recent'] ?? 0) > 0) {
      throw new EmailError(
        'cooldown', 'Az önce gönderdik. Gelen kutunu kontrol et.', mailLimits().resendCooldownSeconds,
      );
    }
    if (Number(r?.['daily'] ?? 0) >= mailLimits().dailyPerAccount) {
      throw new EmailError('quota', 'Bugünlük e-posta sınırına ulaşıldı, yarın tekrar dene.');
    }
    if (ip && Number(r?.['ip_daily'] ?? 0) >= mailLimits().dailyPerIp) {
      throw new EmailError('quota', 'Bugünlük e-posta sınırına ulaşıldı, yarın tekrar dene.');
    }
  }

  /* ── Doğrulama ────────────────────────────────────────────────────────────── */

  /**
   * Kayıt sırasında çağrılır. **Hata FIRLATMAZ**: doğrulama maili gönderilemedi diye kayıt
   * geri alınmamalı — oyuncu hesabına girebilmeli, "tekrar gönder" düğmesi zaten var.
   */
  async sendVerificationOnRegister(o: {
    accountId: number; email: string; username: string; ip?: string | null;
  }): Promise<void> {
    try {
      await this.issue({ ...o, purpose: 'verify' });
    } catch (err) {
      MAIL_LOG.error({ err }, 'kayıt doğrulama e-postası kuyruğa alınamadı');
    }
  }

  /** "Tekrar gönder" — oturum açmış kullanıcı. Zaten doğrulanmışsa açıkça söylenir. */
  async resendVerification(accountId: number, ip?: string | null): Promise<void> {
    const [acc] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.id, a.email, a.email_verified_at,
             (SELECT p.username FROM players p WHERE p.account_id = a.id ORDER BY p.id LIMIT 1) AS username
        FROM accounts a WHERE a.id = ${accountId}
    `);
    if (!acc) throw new EmailError('invalid_token', 'Hesap bulunamadı.');
    if (acc['email_verified_at'] != null) {
      throw new EmailError('already_verified', 'E-posta adresin zaten doğrulanmış.');
    }
    await this.assertQuota(accountId, 'verify', ip);
    await this.issue({
      accountId,
      email: String(acc['email']),
      username: String(acc['username'] ?? 'oyuncu'),
      purpose: 'verify',
      ip,
    });
  }

  /* ── Hesap silme jetonu (kullanıcı, 2026-08-01) ───────────────────────────── */

  /**
   * ⭐ Silme bağlantısı ister. **DOĞRULANMIŞ e-posta şart** (kullanıcı kuralı):
   * doğrulanmamış (yanlış yazılmış ya da başkasına ait) bir adrese hesabı yok etme yetkisi
   * göndermek, sıfırlama bağlantısı göndermekten daha tehlikeli olurdu.
   *
   * ⚠️ Burada sayım sızdırma kaygısı YOK (`forgot-password`tan farkı bu): istek oturum
   * açmış kullanıcıdan geliyor, hesabın var olduğu zaten biliniyor. Bu yüzden hata AÇIKÇA
   * dönüyor — oyuncu neden olmadığını bilmeli.
   */
  async requestDeletion(accountId: number, ip?: string | null): Promise<void> {
    const [acc] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.email, a.email_verified_at,
             (SELECT p.username FROM players p WHERE p.account_id = a.id ORDER BY p.id LIMIT 1) AS username
        FROM accounts a WHERE a.id = ${accountId}
    `);
    if (!acc) throw new EmailError('invalid_token', 'Hesap bulunamadı.');
    if (acc['email_verified_at'] == null) {
      throw new EmailError('not_verified',
        'Hesabını silmek için önce e-posta adresini doğrulaman gerekiyor.');
    }
    await this.assertQuota(accountId, 'delete', ip);
    await this.issue({
      accountId,
      email: String(acc['email']),
      username: String(acc['username'] ?? 'oyuncu'),
      purpose: 'delete',
      ip,
    });
  }

  /**
   * Silme jetonunu **okur ama TÜKETMEZ** — onay ekranı özeti için.
   * ⚠️ Tüketmek burada yanlış olurdu: oyuncu sayfayı açıp vazgeçerse jeton yanmamalı.
   */
  async peekDeletion(token: string): Promise<{ accountId: number }> {
    if (!token || token.length > 200) throw new EmailError('invalid_token', 'Bağlantı geçersiz.');
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT t.account_id
        FROM email_tokens t JOIN accounts a ON a.id = t.account_id
       WHERE t.token_hash = ${hashToken(token)} AND t.purpose = 'delete'
         AND t.used_at IS NULL AND t.expires_at > now() AND t.email = a.email
    `);
    if (!row) throw new EmailError('invalid_token', 'Bağlantı geçersiz ya da süresi dolmuş.');
    return { accountId: Number(row['account_id']) };
  }

  /** Silme jetonunu tüketir (onay anında). Tek kullanımlık garantisi `consume()`ta. */
  async consumeDeletion(token: string): Promise<{ accountId: number }> {
    const row = await this.consume(token, 'delete');
    return { accountId: row.accountId };
  }

  /* ── E-posta ADRESİ değiştirme (kullanıcı, 2026-08-01) ────────────────────── */

  /**
   * ⭐ ADRESİ DEĞİŞTİR — yeni adrese doğrulama, eskiye bilgi maili.
   *
   * Akış (kullanıcının tarifi birebir): adres **hemen** değişir, hesap **doğrulanmamışa
   * düşer**, yeni adrese doğrulama bağlantısı gider. Doğrulanmamış hâlin kısıtları (§9.2b)
   * anında yürürlüğe girer ama **hiçbir şey geri alınmaz** — sınırlar «≥» ile kurulduğu için
   * seviye 6 akademisi olan oyuncu akademiyi kaybetmez, yalnız 7'ye çıkamaz.
   *
   * ⚠️ **Mevcut parola şart.** Yoksa ele geçirilmiş bir oturum hesabı sessizce taşır: saldırgan
   * adresi kendine çeker, sonra "şifremi unuttum" ile hesabı tamamen alır. Bu uç, parola
   * değiştirmekle aynı güvenlik sınıfında.
   *
   * ⭐ Bedava gelen davranış: bekleyen `reset` jetonları kendiliğinden ölür — `consume()`
   * jetondaki adresi hesabın GÜNCEL adresiyle karşılaştırıyor.
   *
   * ⚠️ Adres **aynıysa** hata: "değiştirdim" deyip hiçbir şey olmaması, üstelik hesabın
   * doğrulanmamışa düşmesi en kötü sonuç olurdu.
   */
  async changeEmail(o: {
    accountId: number; newEmail: string; currentPassword: string; ip?: string | null;
  }): Promise<{ email: string }> {
    const next = o.newEmail.trim().toLowerCase();

    const [acc] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.password_hash, a.email,
             (SELECT p.username FROM players p WHERE p.account_id = a.id ORDER BY p.id LIMIT 1) AS username
        FROM accounts a WHERE a.id = ${o.accountId}
    `);
    if (!acc) throw new EmailError('invalid_credentials', 'Mevcut parola yanlış.');
    const ok = await this.passwords.verify(String(acc['password_hash']), o.currentPassword);
    if (!ok) throw new EmailError('invalid_credentials', 'Mevcut parola yanlış.');

    const current = String(acc['email']);
    if (next === current) {
      throw new EmailError('same_email', 'Bu adres zaten hesabına kayıtlı.');
    }
    const [taken] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM accounts WHERE email = ${next} AND id <> ${o.accountId}
    `);
    if (taken) throw new EmailError('email_taken', 'Bu e-posta başka bir hesapta kayıtlı.');

    /**
     * ⚠️ `skipCooldown`: kayıt maili 60 saniyelik freni doldurmuş olabilir ve o fren burada
     * adres değişimini **tamamen iptal ederdi** — oyuncu yanlış yazdığı adresle kalırdı.
     * Günlük tavanlar yerinde.
     */
    await this.assertQuota(o.accountId, 'verify', o.ip, { skipCooldown: true });

    /**
     * ⚠️ Adres değişimi ve doğrulamanın düşmesi **tek UPDATE**: ikisi ayrılırsa arada kalan
     * bir hata "yeni adres yazıldı ama hesap hâlâ doğrulanmış" durumunu bırakırdı — yani
     * doğrulanmamış bir adres doğrulanmış sayılırdı.
     */
    await this.db.execute(sql`
      UPDATE accounts SET email = ${next}, email_verified_at = NULL WHERE id = ${o.accountId}
    `);

    const username = String(acc['username'] ?? 'oyuncu');
    await this.issue({
      accountId: o.accountId, email: next, username, purpose: 'verify', ip: o.ip,
    });
    // ⭐ ESKİ adrese haber — sahibinin fark etmesi için tek şans (parola değişimiyle aynı ilke).
    await this.notify(current, emailChanged({ username, newEmail: next }));

    return { email: next };
  }

  /**
   * Jetonu tüketir ve adresi doğrular.
   *
   * ⚠️ `email` KARŞILAŞTIRILIR: jeton üretildikten sonra adres değiştiyse jeton geçersizdir.
   */
  async verify(token: string): Promise<{ email: string }> {
    const row = await this.consume(token, 'verify');
    await this.db.execute(sql`
      UPDATE accounts SET email_verified_at = now() WHERE id = ${row.accountId}
    `);
    return { email: row.email };
  }

  /* ── Şifre sıfırlama ──────────────────────────────────────────────────────── */

  /**
   * ⚠️ **DAİMA sessizce başarılı.** Adres kayıtlı değilse, doğrulanmamışsa ya da kota
   * dolduysa bile hata dönmez — aksi hâlde bu uç, "bu e-posta bu oyunda kayıtlı mı" sorusunu
   * cevaplayan bir araca dönerdi. Gerçek sonuç yalnız posta kutusunda görülür.
   */
  async requestReset(email: string, ip?: string | null): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const [acc] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.id, a.email, a.email_verified_at,
             (SELECT p.username FROM players p WHERE p.account_id = a.id ORDER BY p.id LIMIT 1) AS username
        FROM accounts a WHERE a.email = ${normalized}
    `);
    if (!acc) return;
    /* Doğrulanmamış adrese sıfırlama YOK: yanlış yazılmış bir adrese hesabın anahtarını
       göndermek, doğrulamanın var olma sebebini ortadan kaldırırdı. Sessizce durulur. */
    if (acc['email_verified_at'] == null) return;

    try {
      await this.assertQuota(Number(acc['id']), 'reset', ip);
    } catch {
      return;   // kota bilgisi de sızdırılmaz
    }
    await this.issue({
      accountId: Number(acc['id']),
      email: String(acc['email']),
      username: String(acc['username'] ?? 'oyuncu'),
      purpose: 'reset',
      ip,
    });
  }

  /**
   * Jetonu tüketir, parolayı değiştirir ve **tüm oturumları düşürür**.
   *
   * Oturumları düşürmek şart: hesabı ele geçiren biri parolayı değiştirse bile eski oturum
   * açık kalırsa gerçek sahibi hesabını geri alamaz. Bunun tersi de doğru — bu yüzden
   * `AuthService.revokeAll` bugüne kadar yazılmış ama HİÇ çağrılmamıştı; yeri burası.
   */
  async resetPassword(o: { token: string; password: string; revokeAll: (accountId: number) => Promise<number> }): Promise<void> {
    if (o.password.length < 8) throw new EmailError('weak_password', 'Parola en az 8 karakter olmalı.');
    const row = await this.consume(o.token, 'reset');
    const hash = await this.passwords.hash(o.password);
    await this.db.execute(sql`
      UPDATE accounts SET password_hash = ${hash}, failed_logins = 0, locked_until = NULL
       WHERE id = ${row.accountId}
    `);
    await o.revokeAll(row.accountId);
  }

  /**
   * Oturum açmışken parola değiştirme. Mevcut parola doğrulanır.
   *
   * ⭐ **AKTİF OTURUM AYAKTA KALIR** (kullanıcı, 2026-08-01): yalnız DİĞER cihazlar düşer.
   * Eskiden `revokeAll` çağrılıyordu ve oyuncu kendi şifresini değiştirdiği için oyundan
   * atılıyordu — istemci de bunu bilip sayfayı zorla yeniden yüklüyordu. Sıfırlamada
   * (`resetPassword`) hepsini düşürmek DOĞRU, çünkü orada niyet "hesabı geri al"; burada
   * niyet "rutin bakım". `revokeOtherChains` bugüne kadar yazılmış ama hiç çağrılmamıştı.
   *
   * ⭐ Değişiklik **e-postayla bildirilir**: şifreyi değiştiren kişi hesabın sahibi olmayabilir.
   * Bildirim, sahibinin fark etmesi için tek şans. Mail transaction'ın DIŞINDA ve hata
   * fırlatmaz — posta gitmedi diye şifre değişimi geri alınmaz.
   */
  async changePassword(o: {
    accountId: number; current: string; next: string;
    /** Bu oturumu BIRAKIP diğer zincirleri düşürür (`AuthService.revokeOtherChains`). */
    revokeOthers: (accountId: number) => Promise<number>;
  }): Promise<void> {
    if (o.next.length < 8) throw new EmailError('weak_password', 'Yeni parola en az 8 karakter olmalı.');
    const [acc] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.password_hash, a.email,
             (SELECT p.username FROM players p WHERE p.account_id = a.id ORDER BY p.id LIMIT 1) AS username,
             (SELECT w.name FROM players p JOIN worlds w ON w.id = p.world_id
               WHERE p.account_id = a.id ORDER BY p.id LIMIT 1) AS world_name
        FROM accounts a WHERE a.id = ${o.accountId}
    `);
    if (!acc) throw new EmailError('invalid_credentials', 'Mevcut parola yanlış.');
    const ok = await this.passwords.verify(String(acc['password_hash']), o.current);
    if (!ok) throw new EmailError('invalid_credentials', 'Mevcut parola yanlış.');

    const hash = await this.passwords.hash(o.next);
    await this.db.execute(sql`UPDATE accounts SET password_hash = ${hash} WHERE id = ${o.accountId}`);
    await o.revokeOthers(o.accountId);

    await this.notify(String(acc['email']), passwordChanged({
      username: String(acc['username'] ?? 'oyuncu'),
      worldName: String(acc['world_name'] ?? 'MobilWar'),
    }));
  }

  /**
   * Jetonsuz bilgilendirme maili — doğrudan outbox'a.
   *
   * ⚠️ **Hata YUTULUR.** `issue()`ten farkı bu: orada mail akışın parçası (jeton gitmezse
   * kullanıcı hiçbir şey yapamaz), burada yalnız haber. Posta kuyruğu tıkalıysa şifre
   * değişimini geri almak, çözdüğünden büyük bir sorun yaratırdı.
   */
  private async notify(to: string, tpl: Template): Promise<void> {
    try {
      await this.db.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (NULL, 'mail:send', ${JSON.stringify({
        to, subject: tpl.subject, html: tpl.html, text: tpl.text,
      })}::jsonb)
      `);
    } catch (err) {
      MAIL_LOG.warn({ err }, 'bilgilendirme maili yazılamadı');
    }
  }

  /* ── Ortak ────────────────────────────────────────────────────────────────── */

  /**
   * Jetonu **tek kullanımlık** olarak tüketir.
   *
   * ⚠️ Tüketim tek `UPDATE ... WHERE used_at IS NULL ... RETURNING` ile: iki eşzamanlı istek
   * gelirse yalnız biri satır döndürür. Önce SELECT sonra UPDATE yapılsaydı yarış koşulunda
   * jeton iki kez kullanılabilirdi.
   *
   * ⚠️ `email` hâlâ hesabın adresiyle aynı mı diye bakılır: adres değiştiyse jeton ölür.
   */
  private async consume(token: string, purpose: Purpose): Promise<{ accountId: number; email: string }> {
    if (!token || token.length > 200) throw new EmailError('invalid_token', 'Bağlantı geçersiz.');
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE email_tokens t SET used_at = now()
       WHERE t.token_hash = ${hashToken(token)}
         AND t.purpose = ${purpose}
         AND t.used_at IS NULL
         AND t.expires_at > now()
         AND t.email = (SELECT a.email FROM accounts a WHERE a.id = t.account_id)
      RETURNING t.account_id, t.email
    `);
    if (!row) {
      throw new EmailError('invalid_token', 'Bağlantı geçersiz ya da süresi dolmuş. Yeniden iste.');
    }
    return { accountId: Number(row['account_id']), email: String(row['email']) };
  }
}
