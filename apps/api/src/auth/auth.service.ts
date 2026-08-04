/**
 * Kayıt / giriş / yenileme / çıkış (SİSTEM PLANI §9 + §9.1.2 sinyal toplama).
 *
 * Kayıt akışı TEK transaction: hesap + oyuncu + başkent + başlangıç yapıları + kese.
 * Yarım kalmış oyuncu (hesabı var, şehri yok) oluşamaz.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { DELETED_NAME_RE } from '@mobilwar/catalog';
import { EmailRiskService, normalizeEmail } from '../abuse/email-risk.service.ts';
import { DeviceSignalService, type DeviceContext } from '../abuse/device-signal.service.ts';
import { CityService } from '../cities/city.service.ts';
import { toDate, type Db } from '../db/client.ts';
import { EmailTokenService } from '../mail/email-token.service.ts';
import type { GameClockService } from '../world/game-clock.service.ts';
import { PlacementService } from '../world/placement.service.ts';
import { PasswordService } from './password.service.ts';
import { hashRefreshToken, type TokenPair, type TokenService } from './token.service.ts';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string) {
    super(message);
  }
}

export type AuthErrorCode =
  | 'email_taken'
  | 'username_taken'
  | 'invalid_credentials'
  | 'account_locked'
  | 'banned'
  | 'invalid_refresh'
  /**
   * ⭐ Kayıt kötüye kullanımı (2026-08-04). İkisi de 400 döner: bunlar kimlik hatası değil,
   * isteğin kendisiyle ilgili. `signup_flood` BOT koruması ve doğrudan engelliyor;
   * `disposable_email` yalnız ayar açıkken engelliyor, varsayılanda TESPİT edip geçiyor.
   */
  | 'signup_flood'
  | 'disposable_email'
  | 'world_not_found';

/** "Aktif Cihazlar" listesinin bir satırı — zincir başına tek. */
export interface SessionSummary {
  chainId: string;
  platform: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  ip: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  firstSeenAt: string;
  expiresAt: string;
  /** Bu satır, isteği yapan oturumun kendisi mi? */
  current: boolean;
}

export interface AuthResult extends TokenPair {
  accountId: number;
  playerId: number;
  worldId: number;
  username: string;
  sessionId: string;
}

/**
 * Yerleşim kilidinin ad alanı (`pg_advisory_xact_lock(klass, worldId)`).
 * ⚠️ Sabit bir sayı: aynı dünyaya iki kayıt aynı anda gelirse ikisi de aynı kilidi ister.
 */
const PLACEMENT_LOCK = 4713;

/** Yanlış parola denemesi bu sayıyı aşarsa hesap kısa süre kilitlenir (kaba kuvvet freni). */
const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;

export class AuthService {
  private readonly passwords = new PasswordService();
  private readonly devices: DeviceSignalService;
  private readonly cities: CityService;
  private readonly emailTokens: EmailTokenService;
  private readonly placement: PlacementService;

  constructor(
    private readonly db: Db,
    private readonly tokens: TokenService,
    private readonly clock: GameClockService,
  ) {
    this.devices = new DeviceSignalService(db);
    this.cities = new CityService(db);
    this.emailTokens = new EmailTokenService(db);
    this.placement = new PlacementService(db);
  }

  async register(input: {
    email: string;
    password: string;
    username: string;
    worldId: number;
  }, ctx: DeviceContext): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    /**
     * ⚠️ DÜNYA ÖNCE DOĞRULANIR (2026-08-03). Öncesinde doğrudan `clock.gameNow(worldId)`
     * çağrılıyordu ve olmayan bir dünyada `GameClockService.read()` **düz `Error`** fırlatıyordu
     * (`game-clock.service.ts`) — `run()`'daki `catch` onu `AuthError` sanmadığı için istemciye
     * **500** dönüyordu. Dünya seçimi forma gelince bu yol artık gerçekten tetiklenebilir.
     *
     * `archived`/`maintenance` dünyaya kayıt da engelleniyor: arşivlenmişte oyun bitmiş,
     * bakımdakinde ilk yazma zaten 503 alacak.
     *
     * ⚠️ Bellek-içi `WorldStateService` yerine doğrudan sorgu: `AuthService`in DI zincirinde
     * o servis yok ve kayıt seyrek bir işlem — tek `SELECT` için bağımlılık eklemeye değmez.
     */
    const [world] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT state FROM worlds WHERE id = ${input.worldId}
    `);
    if (!world || String(world['state']) !== 'running') {
      throw new AuthError('world_not_found', 'Seçilen dünya kayda kapalı.');
    }
    /**
     * ⭐ KAYIT RİSKİ (§9.1.7) — parola karması gibi PAHALI bir işten ÖNCE ölçülüyor: bot
     * seli argon2id'yi boşuna çalıştırmamalı, o iş tek başına sunucuyu meşgul edebiliyor.
     *
     * ⚠️ Ölçüm başarısız olursa kayıt SÜRÜYOR. Risk sinyali uğruna gerçek bir oyuncunun
     * kaydını kaybetmek kabul edilemez bir takas; sinyal eksik kalır, oyuncu içeri girer.
     */
    try {
      const risk = await new EmailRiskService(this.db).assess(email, ctx.ip);
      /**
       * ⚠️ **TEST KOŞUCUSU SEL SINIRINDAN MUAF.** Test paketi yirmi dosyada, tek bir sahte
       * IP'den (`85.104.12.7`) yüzlerce hesap açıyor — yani korumanın durdurmak için var
       * olduğu desenin ta kendisi. Muafiyet olmasaydı 239 test, ölçtükleri şeyle hiç
       * ilgisi olmayan bir sebeple düşerdi.
       *
       * ⚠️ Muaf olan yalnız BU BAĞLANTI; kuralın kendisi `email-risk.test.ts`te `assess()`
       * üzerinden tam olarak sınanıyor (sınır, pencere, başka ağın etkilememesi). Yani
       * "testte kapalı" olan şey mantık değil, mantığın kayıt akışına bağlanması.
       * ⚠️ Geliştirme ortamı muaf DEĞİL: orada elle denenebilmeli.
       */
      if (risk.block === 'signup_flood' && process.env['NODE_ENV'] !== 'test') {
        throw new AuthError('signup_flood',
          'Bu ağdan kısa sürede çok fazla hesap açıldı. Biraz sonra tekrar dene.');
      }
      if (risk.block === 'disposable_email') {
        throw new AuthError('disposable_email',
          'Geçici e-posta servisleri kabul edilmiyor. Kalıcı bir adresle kaydol.');
      }
    } catch (err) {
      if (err instanceof AuthError) throw err;
      // eslint-disable-next-line no-console
      console.error('[auth] kayit riski olculemedi, kayit surduruluyor:', err);
    }

    const gameNow = await this.clock.gameNow(input.worldId);
    const passwordHash = await this.passwords.hash(input.password);

    const result = await this.db.transaction(async (tx) => {
      const dup = await tx.execute<Record<string, unknown>>(sql`
        SELECT 1 FROM accounts WHERE email = ${email}
      `);
      if (dup.length > 0) throw new AuthError('email_taken', 'Bu e-posta zaten kayıtlı.');

      /**
       * ⭐ `hükümdarN` REZERVE (2026-08-01). Hesap silme bu deseni üretiyor
       * (`deletedName`); gerçek bir oyuncu "hükümdar1" alırsa sonraki silme aynı adı üretmek
       * isteyip `players_world_username` tekilliğine çarpar ve **silme başarısız olur**.
       * Kapıyı burada tutmak, silme anında ad üretimini karmaşıklaştırmaktan basit.
       */
      if (DELETED_NAME_RE.test(input.username)) {
        throw new AuthError('username_taken', 'Bu kullanıcı adı kullanılamaz.');
      }

      const nameDup = await tx.execute<Record<string, unknown>>(sql`
        SELECT 1 FROM players WHERE world_id = ${input.worldId} AND lower(username) = ${input.username.toLowerCase()}
      `);
      if (nameDup.length > 0) throw new AuthError('username_taken', 'Bu kullanıcı adı alınmış.');

      /**
       * ⭐ POSTA KUTUSU KİMLİĞİ ve KAYIT IP'si (2026-08-04). İkisi de kayıt anında yazılıyor
       * çünkü sonradan üretilemezler: IP zaten geçmiştir, e-posta ise değiştirilebiliyor.
       * ⚠️ `email_normalized` benzersiz DEĞİL: aynı kutudan ikinci hesap tek başına suç değil.
       */
      const acc = await tx.execute<{ id: number } & Record<string, unknown>>(sql`
        INSERT INTO accounts (email, password_hash, email_normalized, signup_ip)
        VALUES (${email}, ${passwordHash}, ${normalizeEmail(email)?.normalized ?? null},
                ${ctx.ip})
        RETURNING id
      `);
      const accountId = Number(acc[0]!.id);

      const ply = await tx.execute<{ id: number } & Record<string, unknown>>(sql`
        INSERT INTO players (world_id, account_id, username, protected_until)
        VALUES (${input.worldId}, ${accountId}, ${input.username},
                ${gameNow.toISOString()}::timestamptz + interval '72 hours')
        RETURNING id
      `);
      const playerId = Number(ply[0]!.id);

      /**
       * ⭐ BAŞKENT — yerleşim algoritması §13.6 (`PlacementService`, 2026-08-03).
       *
       * ⚠️ **YARIŞ ÖNCE KİLİTLENİR, SONRA SEÇİLİR.** `pickCapital` "boş" gördüğü bir yeri
       * seçtikten sonra, aynı milisaniyede kaydolan başka bir oyuncu orayı kapabilir; o
       * durumda `cities_world_coords` benzersizlik ihlali ham Postgres hatası olarak çıkar ve
       * istemciye **500** gider (`auth.controller.ts`in `catch`i yalnız `AuthError` eşliyor).
       *
       * ⚠️ Çözüm "hata yakala, tekrar dene" DEĞİL: Postgres başarısız bir ifadeden sonra
       * transaction'ı iptal eder, sonraki her sorgu «current transaction is aborted» der.
       * Yeniden denemek savepoint gerektirirdi ve `cities.create` kendi savepoint'ini açmıyor.
       *
       * Dünya başına **advisory kilit** hem daha basit hem daha dürüst: yerleşim yalnız
       * kayıtta çalışan, dünya başına saniyede bir bile olmayan bir işlem — sıraya sokmanın
       * ölçülebilir maliyeti yok. Kilit transaction bitince kendiliğinden bırakılıyor.
       */
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${PLACEMENT_LOCK}, ${input.worldId})`);
      const slot = await this.placement.pickCapital(input.worldId, accountId, tx as never);
      await this.cities.create({
        worldId: input.worldId,
        playerId,
        // Başkentin adı = oyuncu adı. Eski " şehri" eki kaldırıldı (kullanıcı): dünya
        // tablosunda sütun zaten "Şehir" başlığını taşıyor, ek gereksiz tekrardı.
        name: input.username,
        k: slot.k, d: slot.d, s: slot.s,
        isCapital: true,
        at: gameNow,
      }, tx as never);

      return { accountId, playerId };
    });

    /**
     * ⭐ Doğrulama e-postası (§9.2) — kayıt transaction'ının DIŞINDA ve **hata fırlatmadan**.
     * Kullanıcı kararı doğrulamanın YUMUŞAK olması: posta gitmese bile oyuncu oyununa girer,
     * üstteki şerit uyarır, "tekrar gönder" düğmesi var. Mail yüzünden kayıt geri alınmaz.
     */
    await this.emailTokens.sendVerificationOnRegister({
      accountId: result.accountId, email, username: input.username, ip: ctx.ip,
    });

    return this.issueSession(result.accountId, result.playerId, input.worldId, input.username, ctx);
  }

  /**
   * ⭐ Giriş **KULLANICI ADIYLA** (kullanıcı kararı 2026-07-28). Kullanıcı adı dünya başına
   * tekil olduğu için arama `players`'tan başlıyor ve hesaba oradan gidiyor.
   */
  async login(input: { username: string; password: string; worldId: number }, ctx: DeviceContext): Promise<AuthResult> {
    const username = input.username.trim();
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.id AS account_id, a.password_hash, a.locked_until, a.failed_logins,
             p.id AS player_id, p.username, p.banned_at, p.ban_until, p.ban_reason
        FROM players p
        JOIN accounts a ON a.id = p.account_id
       WHERE p.world_id = ${input.worldId} AND lower(p.username) = ${username.toLowerCase()}
    `);
    const row = rows[0];

    // Kullanıcı yoksa da parola doğrulaması kadar zaman harca (kullanıcı-var-mı sızıntısını kapatır).
    if (!row) {
      await this.passwords.verify('$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', input.password);
      throw new AuthError('invalid_credentials', 'Kullanıcı adı veya parola hatalı.');
    }

    const lockedUntil = row['locked_until'] ? toDate(row['locked_until']) : null;
    if (lockedUntil && lockedUntil > new Date()) {
      throw new AuthError('account_locked', 'Çok fazla hatalı deneme — hesap geçici olarak kilitli.');
    }
    /**
     * ⭐ CEZA SÜRELİ OLABİLİR (§oyuncu cezası). Eskiden `banned_at` dolu olduğu sürece giriş
     * sonsuza kadar kapalıydı ve "3 gün ceza" verilemiyordu; süre dolunca kendiliğinden
     * açılması gerekiyor.
     *
     * ⚠️ Süre GERÇEK zamanla kıyaslanıyor, oyun saatiyle değil: ceza bir moderasyon kararı,
     * oyun mekaniği değil. Bakımda oyun saati donuyor; ceza da donsaydı "3 gün" bakım
     * süresince uzardı.
     *
     * ⚠️ Süresi geçmiş satır TEMİZLENMİYOR — moderasyon geçmişi kalıcı olmalı; `chat_bans`
     * ile aynı sözleşme. Yalnız etkisiz sayılıyor.
     */
    const banUntil = row['ban_until'] ? toDate(row['ban_until']) : null;
    if (row['banned_at'] && (banUntil == null || banUntil > new Date())) {
      const until = banUntil ? ` (${banUntil.toLocaleString('tr-TR')} tarihine kadar)` : '';
      const why = row['ban_reason'] ? ` Sebep: ${String(row['ban_reason'])}` : '';
      throw new AuthError('banned', `Bu hesap cezalı${until}.${why}`);
    }

    const accountId = Number(row['account_id']);
    const ok = await this.passwords.verify(String(row['password_hash']), input.password);
    if (!ok) {
      await this.db.execute(sql`
        UPDATE accounts
           SET failed_logins = failed_logins + 1,
               locked_until = CASE WHEN failed_logins + 1 >= ${MAX_FAILED_LOGINS}
                                   THEN now() + (${LOCK_MINUTES}::int * interval '1 minute')
                                   ELSE locked_until END
         WHERE id = ${accountId}
      `);
      throw new AuthError('invalid_credentials', 'Kullanıcı adı veya parola hatalı.');
    }

    await this.db.execute(sql`
      UPDATE accounts SET failed_logins = 0, locked_until = NULL WHERE id = ${accountId}
    `);

    if (row['player_id'] == null) {
      // Kullanıcı adıyla arandığı için buraya normalde düşülmez; savunma amaçlı duruyor.
      throw new AuthError('world_not_found', 'Bu hesabın seçilen dünyada oyuncusu yok.');
    }

    return this.issueSession(
      accountId, Number(row['player_id']), input.worldId, String(row['username']), ctx,
    );
  }

  /**
   * Refresh **döndürmeli ve tek kullanımlık**: eski token aynı transaction'da iptal edilir.
   * Çalınan token en fazla bir kez kullanılabilir; kullanıldığı anda gerçek kullanıcının oturumu
   * düşer → hırsızlık fark edilir.
   */
  async refresh(refreshToken: string, ctx: DeviceContext): Promise<AuthResult> {
    const hash = hashRefreshToken(refreshToken);
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT s.id, s.account_id, s.expires_at, s.revoked_at, s.chain_id,
             p.id AS player_id, p.world_id, p.username
        FROM sessions s
        JOIN players p ON p.account_id = s.account_id
       WHERE s.refresh_hash = ${hash}
       LIMIT 1
    `);
    const s = rows[0];
    if (!s || s['revoked_at'] || toDate(s['expires_at']) < new Date()) {
      throw new AuthError('invalid_refresh', 'Oturum geçersiz veya süresi dolmuş.');
    }

    await this.db.execute(sql`
      UPDATE sessions SET revoked_at = now() WHERE id = ${String(s['id'])}::uuid
    `);

    return this.issueSession(
      Number(s['account_id']), Number(s['player_id']), Number(s['world_id']),
      String(s['username']), ctx,
      /**
       * ⭐ Zincir TAŞINIR — yenileme yeni bir cihaz değil, aynı cihazın yeni token neslidir.
       * Bunu geçirmeseydik `issueSession` yeni bir zincir açar ve "Aktif Cihazlar" listesi
       * 15 dakikada bir yeni satırla dolardı.
       */
      String(s['chain_id']),
    );
  }

  /**
   * Çıkış. ⚠️ **Zincirin tamamı** kapatılır, yalnız bu satır değil: aynı cihazın elinde kalmış
   * eski bir refresh token'ı çıkıştan sonra oturumu diriltememeli.
   */
  async logout(sessionId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE sessions SET revoked_at = now()
       WHERE chain_id = (SELECT chain_id FROM sessions WHERE id = ${sessionId}::uuid)
         AND revoked_at IS NULL
    `);
  }

  /* ── Oturum ve cihaz listesi (§admin Faz 3) ─────────────────────────────────── */

  /**
   * Hesabın aktif cihazları — **zincir başına tek satır**.
   *
   * ⚠️ Zincirin EN SON satırı temsil eder (`DISTINCT ON … ORDER BY created_at DESC`): cihaz
   * modeli/uygulama sürümü zaman içinde değişebilir ve oyuncu güncel olanı görmeli. Zincirin
   * başlangıcı ayrı bir alan (`firstSeenAt`) olarak veriliyor — "bu cihaz ne zamandan beri
   * bağlı" sorusunun cevabı orada.
   */
  async listSessions(accountId: number, currentSessionId: string): Promise<SessionSummary[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT DISTINCT ON (s.chain_id)
             s.chain_id, s.id, s.platform, s.device_model, s.os_version, s.app_version,
             s.ip, s.ua, s.last_seen_at, s.expires_at,
             (SELECT MIN(created_at) FROM sessions f WHERE f.chain_id = s.chain_id) AS first_seen,
             (SELECT bool_or(f.id = ${currentSessionId}::uuid) FROM sessions f
               WHERE f.chain_id = s.chain_id) AS is_current
        FROM sessions s
       WHERE s.account_id = ${accountId} AND s.revoked_at IS NULL AND s.expires_at > now()
       ORDER BY s.chain_id, s.created_at DESC
    `);
    return rows
      .map((r) => ({
        chainId: String(r['chain_id']),
        platform: r['platform'] == null ? null : String(r['platform']),
        deviceModel: r['device_model'] == null ? null : String(r['device_model']),
        osVersion: r['os_version'] == null ? null : String(r['os_version']),
        appVersion: r['app_version'] == null ? null : String(r['app_version']),
        ip: r['ip'] == null ? null : String(r['ip']),
        userAgent: r['ua'] == null ? null : String(r['ua']),
        lastSeenAt: toDate(r['last_seen_at']).toISOString(),
        firstSeenAt: toDate(r['first_seen']).toISOString(),
        expiresAt: toDate(r['expires_at']).toISOString(),
        current: r['is_current'] === true,
      }))
      // ⚠️ Sıralama JS'te: `DISTINCT ON` kendi ORDER BY'ını dayatıyor (chain_id önce olmak
      // zorunda), oysa oyuncu listeyi "en son görülen üstte" bekliyor.
      .sort((a, b) => (a.current === b.current
        ? b.lastSeenAt.localeCompare(a.lastSeenAt)
        : (a.current ? -1 : 1)));
  }

  /**
   * Bir cihazı (zinciri) düşürür. Düşen oturumların kimlikleri DÖNER — çağıran onları soket
   * katmanına verip açık bağlantıları da anında kapatabilsin.
   *
   * ⚠️ `account_id` koşulu pazarlıksız: zincir kimliği tahmin edilemez ama sahiplik kontrolü
   * tahmin edilemezliğe bırakılmaz.
   */
  async revokeChain(accountId: number, chainId: string): Promise<string[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE sessions SET revoked_at = now()
       WHERE account_id = ${accountId} AND chain_id = ${chainId}::uuid AND revoked_at IS NULL
      RETURNING id
    `);
    return rows.map((r) => String(r['id']));
  }

  /** "Diğer tüm cihazlardan çık" — bu zincir hariç hepsi. */
  async revokeOtherChains(accountId: number, currentSessionId: string): Promise<string[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE sessions SET revoked_at = now()
       WHERE account_id = ${accountId} AND revoked_at IS NULL
         AND chain_id <> (SELECT chain_id FROM sessions WHERE id = ${currentSessionId}::uuid)
      RETURNING id
    `);
    return rows.map((r) => String(r['id']));
  }

  /** Bir hesabın tüm oturumlarını düşür (parola değişimi / şüpheli erişim / admin). */
  async revokeAll(accountId: number): Promise<number> {
    return (await this.revokeAllIds(accountId)).length;
  }

  /** `revokeAll`ın soket katmanına verilebilen hâli. */
  async revokeAllIds(accountId: number): Promise<string[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE sessions SET revoked_at = now()
       WHERE account_id = ${accountId} AND revoked_at IS NULL
      RETURNING id
    `);
    return rows.map((r) => String(r['id']));
  }

  /**
   * Oturum yaz + token çifti üret + **çoklu hesap sinyallerini kaydet** (§9.1.2).
   * Sinyal kaydı burada olmalı: her giriş ve her yenilemede cihaz/IP izi tazelenir.
   */
  private async issueSession(
    accountId: number, playerId: number, worldId: number, username: string, ctx: DeviceContext,
    /** Verilirse zincir DEVAM EDER (yenileme); verilmezse yeni bir cihaz zinciri açılır. */
    chainId?: string,
  ): Promise<AuthResult> {
    const sessionId = randomUUID();
    const chain = chainId ?? randomUUID();
    const refresh = this.tokens.newRefreshToken();
    const access = await this.tokens.signAccess({
      sub: String(accountId), pid: playerId, wid: worldId, sid: sessionId,
    });

    await this.db.execute(sql`
      INSERT INTO sessions (id, chain_id, account_id, refresh_hash, ip, ua, device_id, platform,
                            os_version, device_model, app_version, timezone, locale, expires_at)
      VALUES (${sessionId}::uuid, ${chain}::uuid, ${accountId}, ${refresh.hash}, ${ctx.ip},
              ${ctx.userAgent}, ${ctx.deviceId}, ${ctx.platform}, ${ctx.osVersion ?? null},
              ${ctx.deviceModel ?? null}, ${ctx.appVersion ?? null}, ${ctx.timezone ?? null},
              ${ctx.locale ?? null}, ${refresh.expiresAt.toISOString()}::timestamptz)
    `);
    await this.db.execute(sql`UPDATE players SET last_seen_at = now() WHERE id = ${playerId}`);

    // ⭐ Sinyal toplama — karar DEĞİL, yalnız kayıt (§9.1.1).
    await this.devices.record(playerId, ctx);

    return {
      accountId, playerId, worldId, username, sessionId,
      accessToken: access.token,
      accessExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

}
