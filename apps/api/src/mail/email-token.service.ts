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
import { resetPassword, verifyEmail } from './templates.ts';

export type MailErrorCode =
  | 'invalid_token'          // jeton yok / süresi dolmuş / kullanılmış
  | 'already_verified'
  | 'cooldown'               // çok sık istendi
  | 'quota'                  // günlük tavan
  | 'invalid_credentials'    // mevcut parola yanlış (şifre değiştirme)
  | 'weak_password'
  | 'not_verified';          // doğrulanmamış adrese sıfırlama gönderilmez

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

type Purpose = 'verify' | 'reset';

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
    const ttlSeconds = o.purpose === 'verify'
      ? mailLimits().verifyTtlHours * 3600
      : mailLimits().resetTtlMinutes * 60;

    const path = o.purpose === 'verify' ? 'verify-email' : 'reset-password';
    const url = `${MAIL.appOrigin}/${path}?token=${token}`;
    const tpl = o.purpose === 'verify'
      ? verifyEmail({ username: o.username, url })
      : resetPassword({ username: o.username, url });

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
   */
  private async assertQuota(
    accountId: number, purpose: Purpose, ip?: string | null,
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
    if (Number(r?.['recent'] ?? 0) > 0) {
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
      // eslint-disable-next-line no-console
      console.error('[mail] kayıt doğrulama e-postası kuyruğa alınamadı:', err);
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

  /** Oturum açmışken parola değiştirme. Mevcut parola doğrulanır, sonra tüm oturumlar düşer. */
  async changePassword(o: {
    accountId: number; current: string; next: string;
    revokeAll: (accountId: number) => Promise<number>;
  }): Promise<void> {
    if (o.next.length < 8) throw new EmailError('weak_password', 'Yeni parola en az 8 karakter olmalı.');
    const [acc] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT password_hash FROM accounts WHERE id = ${o.accountId}
    `);
    if (!acc) throw new EmailError('invalid_credentials', 'Mevcut parola yanlış.');
    const ok = await this.passwords.verify(String(acc['password_hash']), o.current);
    if (!ok) throw new EmailError('invalid_credentials', 'Mevcut parola yanlış.');

    const hash = await this.passwords.hash(o.next);
    await this.db.execute(sql`UPDATE accounts SET password_hash = ${hash} WHERE id = ${o.accountId}`);
    await o.revokeAll(o.accountId);
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
