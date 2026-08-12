/**
 * ⭐ E-POSTA KATMANI (§9.2) — doğrulama + şifre sıfırlama.
 *
 * Ölçülen davranışlar: kayıt bir `mail:send` outbox satırı yazar · jeton DB'ye **hash'li**
 * gider · süresi dolmuş / kullanılmış / yanlış amaçlı jeton reddedilir · jeton **tek
 * kullanımlık** · sıfırlama parolayı değiştirir ve **tüm oturumları düşürür** ·
 * `forgot-password` var olmayan adreste de SESSİZCE başarılı (sayım sızdırmaz) ·
 * doğrulanmamış adrese sıfırlama gönderilmez · cooldown + günlük kota ·
 * adres değişince eski jeton ölür · `Idempotency-Key` = outbox satır id'si.
 *
 * ⚠️ Gönderici `vi.mock` ile DEĞİL, bellek-içi implementasyonla taklit ediliyor.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthController } from '../src/auth/auth.controller.ts';
import type { DbHandle } from '../src/db/client.ts';
import { EmailError, EmailTokenService } from '../src/mail/email-token.service.ts';
import { mailLimits } from '../src/mail/mail.limits.ts';
import type { MailMessage, MailSender } from '../src/mail/mail.service.ts';
import { OutboxDispatcher } from '../src/outbox/outbox.dispatcher.ts';
import { clearOutbox, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let svc: EmailTokenService;
let worldId: number;

class FakeSender implements MailSender {
  readonly sent: MailMessage[] = [];
  async send(msg: MailMessage): Promise<{ id: string }> {
    this.sent.push(msg);
    return { id: `fake-${this.sent.length}` };
  }
}

/** Hesap + oyuncu yaratır; e-posta ve kullanıcı adı rastgele (tekillik kısıtı). */
async function makeAccount(o: { verified?: boolean } = {}): Promise<{
  accountId: number; playerId: number; email: string; username: string;
}> {
  const token = randomUUID().slice(0, 8);
  const email = `mail-${token}@test.local`;
  const username = `mail${token}`;
  const [acc] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO accounts (email, password_hash, email_verified_at)
    VALUES (${email}, 'test-hash', ${o.verified ? sql`now()` : null})
    RETURNING id
  `);
  const accountId = Number(acc!['id']);
  const [ply] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO players (world_id, account_id, username)
    VALUES (${worldId}, ${accountId}, ${username}) RETURNING id
  `);
  return { accountId, playerId: Number(ply!['id']), email, username };
}

/** Son yazılan mail satırının gövdesindeki doğrulama/sıfırlama bağlantısının jetonu. */
async function lastToken(): Promise<string> {
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT payload FROM outbox WHERE topic = 'mail:send' ORDER BY id DESC LIMIT 1
  `);
  const text = String((row!['payload'] as Record<string, unknown>)['text']);
  return /token=([A-Za-z0-9_-]+)/.exec(text)![1]!;
}

async function mailRowCount(): Promise<number> {
  const [r] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT COUNT(*)::int AS n FROM outbox WHERE topic = 'mail:send'
  `);
  return Number(r!['n']);
}

/** Testlerde `revokeAll` yerine geçen sayaç. */
const revoked: number[] = [];
const revokeAll = async (accountId: number): Promise<number> => {
  revoked.push(accountId);
  return 1;
};

beforeAll(async () => {
  h = await setupTestDb();
  svc = new EmailTokenService(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await clearOutbox(h);
  revoked.length = 0;
});

/* ── Doğrulama ────────────────────────────────────────────────────────────────── */

describe('e-posta doğrulama', () => {
  it('kayıtta mail satırı yazılır ve jeton DB\'de HASH\'li durur', async () => {
    const a = await makeAccount();
    await svc.sendVerificationOnRegister({ accountId: a.accountId, email: a.email, username: a.username });

    expect(await mailRowCount()).toBe(1);
    const token = await lastToken();
    expect(token.length).toBeGreaterThan(20);

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT token_hash, purpose, email FROM email_tokens WHERE account_id = ${a.accountId}
    `);
    expect(row!['purpose']).toBe('verify');
    expect(row!['email']).toBe(a.email);
    // Düz jeton ASLA saklanmaz — sadece sha256 (64 onaltılık karakter).
    expect(String(row!['token_hash'])).toMatch(/^[0-9a-f]{64}$/);
    expect(String(row!['token_hash'])).not.toBe(token);
  });

  it('jeton doğrulanır ve email_verified_at yazılır', async () => {
    const a = await makeAccount();
    await svc.sendVerificationOnRegister({ accountId: a.accountId, email: a.email, username: a.username });
    await svc.verify(await lastToken());

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT email_verified_at FROM accounts WHERE id = ${a.accountId}
    `);
    expect(row!['email_verified_at']).not.toBeNull();
  });

  it('jeton TEK KULLANIMLIK', async () => {
    const a = await makeAccount();
    await svc.sendVerificationOnRegister({ accountId: a.accountId, email: a.email, username: a.username });
    const token = await lastToken();
    await svc.verify(token);
    await expect(svc.verify(token)).rejects.toThrow(EmailError);
  });

  it('süresi dolmuş jeton reddedilir', async () => {
    const a = await makeAccount();
    await svc.sendVerificationOnRegister({ accountId: a.accountId, email: a.email, username: a.username });
    const token = await lastToken();
    await h.db.execute(sql`
      UPDATE email_tokens SET expires_at = now() - interval '1 minute' WHERE account_id = ${a.accountId}
    `);
    await expect(svc.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('⭐ adres DEĞİŞİRSE eski jeton ölür', async () => {
    const a = await makeAccount();
    await svc.sendVerificationOnRegister({ accountId: a.accountId, email: a.email, username: a.username });
    const token = await lastToken();
    await h.db.execute(sql`
      UPDATE accounts SET email = ${`yeni-${a.email}`} WHERE id = ${a.accountId}
    `);
    await expect(svc.verify(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('sıfırlama jetonu doğrulama ucunda KULLANILAMAZ (amaç ayrımı)', async () => {
    const a = await makeAccount({ verified: true });
    await svc.requestReset(a.email);
    await expect(svc.verify(await lastToken())).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('zaten doğrulanmış hesap tekrar gönderim isteyemez', async () => {
    const a = await makeAccount({ verified: true });
    await expect(svc.resendVerification(a.accountId)).rejects.toMatchObject({ code: 'already_verified' });
  });

  it('cooldown: arka arkaya iki istek ikincisinde reddedilir', async () => {
    const a = await makeAccount();
    await svc.resendVerification(a.accountId);
    await expect(svc.resendVerification(a.accountId)).rejects.toMatchObject({ code: 'cooldown' });
  });

  it('günlük kota dolunca reddedilir', async () => {
    const a = await makeAccount();
    // Kotayı doldur; cooldown'a takılmamak için satırlar geçmişe alınır.
    for (let i = 0; i < mailLimits().dailyPerAccount; i += 1) {
      await h.db.execute(sql`
        INSERT INTO email_tokens (account_id, purpose, token_hash, email, expires_at, created_at)
        VALUES (${a.accountId}, 'verify', ${randomUUID()}, ${a.email},
                now() + interval '1 day', now() - interval '2 hours')
      `);
    }
    await expect(svc.resendVerification(a.accountId)).rejects.toMatchObject({ code: 'quota' });
  });
});

/* ── Şifre sıfırlama ──────────────────────────────────────────────────────────── */

describe('şifre sıfırlama', () => {
  it('⚠️ var olmayan adreste SESSİZCE başarılı (sayım sızdırmaz) ve mail YAZILMAZ', async () => {
    await expect(svc.requestReset('yok-boyle-biri@test.local')).resolves.toBeUndefined();
    expect(await mailRowCount()).toBe(0);
  });

  it('⚠️ DOĞRULANMAMIŞ adrese sıfırlama gönderilmez (yine sessizce)', async () => {
    const a = await makeAccount({ verified: false });
    await svc.requestReset(a.email);
    expect(await mailRowCount()).toBe(0);
  });

  /**
   * ⭐ REGRESYON (canlı denemede bulundu): cooldown AMAÇ BAŞINA sayılmalı. Ortak sayılınca
   * kayıt olur olmaz "şifremi unuttum" diyen oyuncuya, kayıt maili cooldown'u doldurduğu için
   * sıfırlama maili SESSİZCE hiç gitmiyordu (sayım sızdırmama kuralı hatayı da yutuyor).
   */
  it('⭐ kayıt maili taze olsa bile sıfırlama maili GÖNDERİLİR (cooldown amaç başına)', async () => {
    const a = await makeAccount({ verified: true });
    await svc.sendVerificationOnRegister({ accountId: a.accountId, email: a.email, username: a.username });
    expect(await mailRowCount()).toBe(1);           // doğrulama maili az önce gitti

    await svc.requestReset(a.email);
    expect(await mailRowCount()).toBe(2);           // ← sıfırlama yine de gider
  });

  it('doğrulanmış adrese gönderilir; parola değişir ve TÜM OTURUMLAR düşer', async () => {
    const a = await makeAccount({ verified: true });
    const [before] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT password_hash FROM accounts WHERE id = ${a.accountId}
    `);

    await svc.requestReset(a.email);
    expect(await mailRowCount()).toBe(1);
    await svc.resetPassword({ token: await lastToken(), password: 'yeni-parola-123', revokeAll });

    const [after] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT password_hash, failed_logins, locked_until FROM accounts WHERE id = ${a.accountId}
    `);
    expect(after!['password_hash']).not.toBe(before!['password_hash']);
    expect(String(after!['password_hash'])).toMatch(/^\$argon2id\$/);
    // Kilit de açılır: parolayı sıfırlayan kişi kendi kilidini beklemek zorunda kalmamalı.
    expect(Number(after!['failed_logins'])).toBe(0);
    expect(after!['locked_until']).toBeNull();
    expect(revoked).toEqual([a.accountId]);
  });

  it('kısa parola reddedilir ve jeton HARCANMAZ', async () => {
    const a = await makeAccount({ verified: true });
    await svc.requestReset(a.email);
    const token = await lastToken();

    await expect(svc.resetPassword({ token, password: 'kisa', revokeAll }))
      .rejects.toMatchObject({ code: 'weak_password' });
    // Jeton hâlâ geçerli: kullanıcı ikinci denemede daha uzun parola yazabilmeli.
    await expect(svc.resetPassword({ token, password: 'yeterince-uzun', revokeAll }))
      .resolves.toBeUndefined();
  });

  it('sıfırlama jetonu da tek kullanımlık', async () => {
    const a = await makeAccount({ verified: true });
    await svc.requestReset(a.email);
    const token = await lastToken();
    await svc.resetPassword({ token, password: 'birinci-parola', revokeAll });
    await expect(svc.resetPassword({ token, password: 'ikinci-parola', revokeAll }))
      .rejects.toMatchObject({ code: 'invalid_token' });
  });
});

/* ── Parola değiştirme ────────────────────────────────────────────────────────── */

describe('parola değiştirme', () => {
  /**
   * ⚠️ **`revokeAll` → `revokeOthers`** (2026-08-01, kullanıcı kararı). Parola değiştirmek
   * artık AKTİF oturumu düşürmüyor, yalnız diğer cihazları — oyuncuyu kendi şifresini
   * değiştirdiği için oyundan atmak gereksiz bir cezaydı. Sıfırlamada (`resetPassword`)
   * hepsini düşürmek DOĞRU ve orada değişmedi: orada niyet "hesabı geri al".
   */
  it('yanlış mevcut parola reddedilir, doğru parola DİĞER oturumları düşürür', async () => {
    const a = await makeAccount({ verified: true });
    await svc.requestReset(a.email);
    await svc.resetPassword({ token: await lastToken(), password: 'ilk-parolam', revokeAll });
    revoked.length = 0;

    await expect(svc.changePassword({
      accountId: a.accountId, current: 'yanlis-parola', next: 'yeni-parolam',
      revokeOthers: revokeAll,
    })).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(revoked).toEqual([]);

    await svc.changePassword({
      accountId: a.accountId, current: 'ilk-parolam', next: 'yeni-parolam',
      revokeOthers: revokeAll,
    });
    expect(revoked).toEqual([a.accountId]);
  });
});

/* ── Teslim (outbox sink) ─────────────────────────────────────────────────────── */

describe('mail:send teslimi', () => {
  it('sink maili gönderir ve Idempotency-Key = outbox satır id\'si olur', async () => {
    const a = await makeAccount();
    await svc.sendVerificationOnRegister({ accountId: a.accountId, email: a.email, username: a.username });

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM outbox WHERE topic = 'mail:send' ORDER BY id DESC LIMIT 1
    `);
    const outboxId = Number(row!['id']);

    const sender = new FakeSender();
    const d = new OutboxDispatcher(h.db).on('mail:send', async (r) => {
      const p = r.payload as Record<string, unknown>;
      await sender.send({
        to: String(p['to']), subject: String(p['subject']),
        html: String(p['html']), text: String(p['text']),
        idempotencyKey: `outbox-${r.id}`,
      });
    });
    const res = await d.tick();

    expect(res.dispatched).toBe(1);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.to).toBe(a.email);
    expect(sender.sent[0]!.subject).toContain('doğrula');
    // ⭐ Yeniden denemede Resend aynı anahtarı görüp ikinci maili göndermez.
    expect(sender.sent[0]!.idempotencyKey).toBe(`outbox-${outboxId}`);
    // Düz metin karşılığı da dolu olmalı (yalnız-HTML mail spam puanı yükseltir).
    expect(sender.sent[0]!.text.length).toBeGreaterThan(50);
  });

  it('gönderim hatası satırı DÜŞÜRMEZ, yeniden denenir', async () => {
    const a = await makeAccount();
    await svc.sendVerificationOnRegister({ accountId: a.accountId, email: a.email, username: a.username });

    const d = new OutboxDispatcher(h.db).on('mail:send', async () => {
      throw new Error('Resend 503');
    });
    const res = await d.tick();
    expect(res.failed).toBe(1);

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT attempts, dispatched_at, last_error FROM outbox WHERE topic = 'mail:send'
       ORDER BY id DESC LIMIT 1
    `);
    expect(Number(row!['attempts'])).toBe(1);
    expect(row!['dispatched_at']).toBeNull();     // ← şifre sıfırlama maili kaybolmaz
    expect(String(row!['last_error'])).toContain('503');
  });
});

/* ── Uçların kendisi ──────────────────────────────────────────────────────────── */

/**
 * ⭐ DENETLEYİCİ KATMANI (2026-08-06). Yukarıdaki her şey servisi DOĞRUDAN çağırıyor; iki
 * ucun kendisi — zod ayrıştırma, sessiz 204 sözleşmesi ve `revokeAll`ın gerçekten bağlanmış
 * olması — hiç koşulmuyordu.
 *
 * ⚠️ Nest'i ayağa kaldırmıyoruz: projede HTTP seviyesinde test altyapısı yok ve iki vaka için
 * kurmak orantısız. Denetleyici sınıfı doğrudan kuruluyor — `admin-actions.test.ts` ile aynı
 * desen. Kapsanmayan tek şey Nest'in yönlendirme/guard katmanı; hız sınırı zaten
 * `rate-limit.test.ts`te ayrı ölçülüyor.
 */
describe('şifre sıfırlama uçları', () => {
  let ctl: AuthController;
  const revokedByController: number[] = [];

  beforeEach(() => {
    revokedByController.length = 0;
    const auth = {
      revokeAllIds: async (id: number): Promise<string[]> => {
        revokedByController.push(id);
        return ['oturum-1', 'oturum-2'];
      },
    };
    ctl = new AuthController(
      auth as never, {} as never, h.db as never,
    );
  });

  const ipReq = { headers: {}, socket: { remoteAddress: '1.2.3.4' } } as never;

  it('⭐ `forgot-password` var olmayan adreste de SESSİZCE geçer (sayım sızdırmaz)', async () => {
    await expect(ctl.forgotPassword({ email: 'yok@test.local' }, ipReq)).resolves.toBeUndefined();
    // ⚠️ Kritik: hiç mail yazılmamalı — "sessizce başarılı" gerçekten sessiz olmalı.
    expect(await mailRowCount()).toBe(0);
  });

  it('⭐ biçimi bozuk gövde bile SIZDIRMAZ (hata değil, sessiz dönüş)', async () => {
    await expect(ctl.forgotPassword({ email: 'eposta-degil' }, ipReq)).resolves.toBeUndefined();
    await expect(ctl.forgotPassword({}, ipReq)).resolves.toBeUndefined();
    expect(await mailRowCount()).toBe(0);
  });

  it('doğrulanmış adreste uç gerçekten mail yazar', async () => {
    const acc = await makeAccount({ verified: true });
    await ctl.forgotPassword({ email: acc.email }, ipReq);
    expect(await mailRowCount()).toBe(1);
  });

  it('⭐ `reset-password` parolayı değiştirir ve OTURUMLARI DÜŞÜRÜR', async () => {
    const acc = await makeAccount({ verified: true });
    await ctl.forgotPassword({ email: acc.email }, ipReq);
    const token = await lastToken();

    await expect(ctl.resetPassword({ token, password: 'yepyeni-parola' }))
      .resolves.toBeUndefined();               // 204: gövde YOK

    // ⭐ Asıl ölçüm: denetleyicinin `revokeAll` bağlantısı gerçekten koşuyor mu.
    expect(revokedByController).toEqual([acc.accountId]);
    const [a] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT password_hash FROM accounts WHERE id = ${acc.accountId}
    `);
    expect(String(a!['password_hash'])).not.toBe('test-hash');
  });

  it('geçersiz jeton 400 döner ve oturum DÜŞÜRMEZ', async () => {
    await expect(ctl.resetPassword({ token: 'uydurma-jeton-123', password: 'yeterince-uzun' }))
      .rejects.toThrow();
    expect(revokedByController).toEqual([]);
  });

  it('biçimi bozuk gövde 400 (zod) — burada sessizlik YOK, jeton sızdırılacak bilgi değil', async () => {
    await expect(ctl.resetPassword({ token: 'kisa', password: 'yeterince-uzun' })).rejects.toThrow();
    await expect(ctl.resetPassword({ token: 'a'.repeat(40), password: 'kisa' })).rejects.toThrow();
  });

  /**
   * ⭐⭐ OTURUMSUZ SİLME İSTEĞİ UCU (kullanıcı, 2026-08-12) — `/hesap-sil` sayfasının formu.
   *
   * ⚠️ Denetleyiciyi doğrudan kuruyoruz, yani **`AuthGuard` bu testte hiç koşmuyor**. Bu bir
   * kapsam boşluğu değil, tam da ölçmek istediğimiz şeyin bir parçası: kardeş uç
   * (`requestDeletion`) `@UseGuards(AuthGuard)` taşıyor ve `req.player!.accountId` okuyor —
   * yani oturumsuz çağrıldığında ÇÖKERDİ. Buradaki çağrının sorunsuz geçmesi, yeni ucun
   * gerçekten oturumdan bağımsız olduğunun kanıtı.
   */
  it('⭐⭐ oturumsuz silme isteği: oturum YOKken çalışır ve gerçekten mail yazar', async () => {
    const acc = await makeAccount({ verified: true });
    // ⚠️ `req.player` YOK — oturumlu kardeş uç burada `undefined` okuyup çökerdi.
    await expect(ctl.requestDeletionByEmail({ email: acc.email }, ipReq)).resolves.toBeUndefined();
    expect(await mailRowCount()).toBe(1);
    // Bağlantı silme sayfasına gitmeli; jeton `delete` amaçlı olmalı.
    const token = await lastToken();
    await expect(svc.peekDeletion(token)).resolves.toMatchObject({ accountId: acc.accountId });
  });

  it('⭐ var olmayan adres: 204 ve HİÇ mail yok (sayım sızdırmaz)', async () => {
    await expect(ctl.requestDeletionByEmail({ email: 'yok@test.local' }, ipReq))
      .resolves.toBeUndefined();
    expect(await mailRowCount()).toBe(0);
  });

  it('⭐ doğrulanmamış hesap da SESSİZ — hata değil, 204', async () => {
    const acc = await makeAccount({ verified: false });
    await expect(ctl.requestDeletionByEmail({ email: acc.email }, ipReq))
      .resolves.toBeUndefined();
    expect(await mailRowCount()).toBe(0);
  });

  it('biçimi bozuk gövde bile SIZDIRMAZ (zod hatası → sessiz dönüş)', async () => {
    await expect(ctl.requestDeletionByEmail({ email: 'eposta-degil' }, ipReq))
      .resolves.toBeUndefined();
    await expect(ctl.requestDeletionByEmail({}, ipReq)).resolves.toBeUndefined();
    expect(await mailRowCount()).toBe(0);
  });

  /** ⚠️ İstek ucu hesabı SİLMEZ — yıkıcı adım hâlâ jetonlu `delete-account`ta. */
  it('⚠️ istek ucu hesabı silmez, yalnız posta yollar', async () => {
    const acc = await makeAccount({ verified: true });
    await ctl.requestDeletionByEmail({ email: acc.email }, ipReq);
    const [p] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT deleted_at FROM players WHERE id = ${acc.playerId}
    `);
    expect(p!['deleted_at']).toBeNull();
  });
});
