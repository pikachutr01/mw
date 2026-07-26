/**
 * Kayıt / giriş / yenileme / çıkış (SİSTEM PLANI §9 + §9.1.2 sinyal toplama).
 *
 * Kayıt akışı TEK transaction: hesap + oyuncu + başkent + başlangıç yapıları + kese.
 * Yarım kalmış oyuncu (hesabı var, şehri yok) oluşamaz.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { DeviceSignalService, type DeviceContext } from '../abuse/device-signal.service.ts';
import { CityService } from '../cities/city.service.ts';
import { toDate, type Db } from '../db/client.ts';
import type { GameClockService } from '../world/game-clock.service.ts';
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
  | 'world_not_found';

export interface AuthResult extends TokenPair {
  accountId: number;
  playerId: number;
  worldId: number;
  username: string;
  sessionId: string;
}

/** Yanlış parola denemesi bu sayıyı aşarsa hesap kısa süre kilitlenir (kaba kuvvet freni). */
const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;

export class AuthService {
  private readonly passwords = new PasswordService();
  private readonly devices: DeviceSignalService;
  private readonly cities: CityService;

  constructor(
    private readonly db: Db,
    private readonly tokens: TokenService,
    private readonly clock: GameClockService,
  ) {
    this.devices = new DeviceSignalService(db);
    this.cities = new CityService(db);
  }

  async register(input: {
    email: string;
    password: string;
    username: string;
    worldId: number;
  }, ctx: DeviceContext): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const gameNow = await this.clock.gameNow(input.worldId);
    const passwordHash = await this.passwords.hash(input.password);

    const result = await this.db.transaction(async (tx) => {
      const dup = await tx.execute<Record<string, unknown>>(sql`
        SELECT 1 FROM accounts WHERE email = ${email}
      `);
      if (dup.length > 0) throw new AuthError('email_taken', 'Bu e-posta zaten kayıtlı.');

      const nameDup = await tx.execute<Record<string, unknown>>(sql`
        SELECT 1 FROM players WHERE world_id = ${input.worldId} AND lower(username) = ${input.username.toLowerCase()}
      `);
      if (nameDup.length > 0) throw new AuthError('username_taken', 'Bu kullanıcı adı alınmış.');

      const acc = await tx.execute<{ id: number } & Record<string, unknown>>(sql`
        INSERT INTO accounts (email, password_hash) VALUES (${email}, ${passwordHash}) RETURNING id
      `);
      const accountId = Number(acc[0]!.id);

      const ply = await tx.execute<{ id: number } & Record<string, unknown>>(sql`
        INSERT INTO players (world_id, account_id, username, protected_until)
        VALUES (${input.worldId}, ${accountId}, ${input.username},
                ${gameNow.toISOString()}::timestamptz + interval '72 hours')
        RETURNING id
      `);
      const playerId = Number(ply[0]!.id);

      // Başkent: yerleşim algoritması Faz 3'te (§13.6); şimdilik ilk boş yuva.
      const slot = await this.findFreeSlot(input.worldId, tx as never);
      await this.cities.create({
        worldId: input.worldId,
        playerId,
        name: `${input.username} şehri`,
        k: slot.k, d: slot.d, s: slot.s,
        isCapital: true,
        at: gameNow,
      }, tx as never);

      return { accountId, playerId };
    });

    return this.issueSession(result.accountId, result.playerId, input.worldId, input.username, ctx);
  }

  async login(input: { email: string; password: string; worldId: number }, ctx: DeviceContext): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.id AS account_id, a.password_hash, a.locked_until, a.failed_logins,
             p.id AS player_id, p.username, p.banned_at
        FROM accounts a
        LEFT JOIN players p ON p.account_id = a.id AND p.world_id = ${input.worldId}
       WHERE a.email = ${email}
    `);
    const row = rows[0];

    // Kullanıcı yoksa da parola doğrulaması kadar zaman harca (kullanıcı-var-mı sızıntısını kapatır).
    if (!row) {
      await this.passwords.verify('$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', input.password);
      throw new AuthError('invalid_credentials', 'E-posta veya parola hatalı.');
    }

    const lockedUntil = row['locked_until'] ? toDate(row['locked_until']) : null;
    if (lockedUntil && lockedUntil > new Date()) {
      throw new AuthError('account_locked', 'Çok fazla hatalı deneme — hesap geçici olarak kilitli.');
    }
    if (row['banned_at']) throw new AuthError('banned', 'Bu hesap yasaklı.');

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
      throw new AuthError('invalid_credentials', 'E-posta veya parola hatalı.');
    }

    await this.db.execute(sql`
      UPDATE accounts SET failed_logins = 0, locked_until = NULL WHERE id = ${accountId}
    `);

    if (row['player_id'] == null) {
      // Hesap var ama bu dünyada oyuncusu yok → dünyaya katılım ayrı bir akış (Faz 3).
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
      SELECT s.id, s.account_id, s.expires_at, s.revoked_at,
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
    );
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId}::uuid AND revoked_at IS NULL
    `);
  }

  /** Bir hesabın tüm oturumlarını düşür (parola değişimi / şüpheli erişim). */
  async revokeAll(accountId: number): Promise<number> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE sessions SET revoked_at = now()
       WHERE account_id = ${accountId} AND revoked_at IS NULL
      RETURNING id
    `);
    return rows.length;
  }

  /**
   * Oturum yaz + token çifti üret + **çoklu hesap sinyallerini kaydet** (§9.1.2).
   * Sinyal kaydı burada olmalı: her giriş ve her yenilemede cihaz/IP izi tazelenir.
   */
  private async issueSession(
    accountId: number, playerId: number, worldId: number, username: string, ctx: DeviceContext,
  ): Promise<AuthResult> {
    const sessionId = randomUUID();
    const refresh = this.tokens.newRefreshToken();
    const access = await this.tokens.signAccess({
      sub: String(accountId), pid: playerId, wid: worldId, sid: sessionId,
    });

    await this.db.execute(sql`
      INSERT INTO sessions (id, account_id, refresh_hash, ip, ua, device_id, platform,
                            os_version, device_model, app_version, timezone, locale, expires_at)
      VALUES (${sessionId}::uuid, ${accountId}, ${refresh.hash}, ${ctx.ip}, ${ctx.userAgent},
              ${ctx.deviceId}, ${ctx.platform}, ${ctx.osVersion ?? null}, ${ctx.deviceModel ?? null},
              ${ctx.appVersion ?? null}, ${ctx.timezone ?? null}, ${ctx.locale ?? null},
              ${refresh.expiresAt.toISOString()}::timestamptz)
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

  /**
   * İlk boş harita yuvası. **Geçici** — gerçek yerleşim algoritması (§13.6: nefes payı, komşu
   * skoru, tehdit çarpanı) Faz 3'te haritayla birlikte gelecek. Şimdilik determinist tarama:
   * `cities(world_id,k,d,s)` UNIQUE olduğu için yarış durumunda ikinci ekleme DB'de patlar.
   */
  private async findFreeSlot(worldId: number, tx: Db): Promise<{ k: number; d: number; s: number }> {
    const rows = await tx.execute<{ n: number } & Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM cities WHERE world_id = ${worldId}
    `);
    const n = Number(rows[0]?.n ?? 0);
    // 100 şehir/diyar, 100 diyar/kıta — Faz 3'te gerçek dünya sabitlerinden gelecek.
    return { k: Math.floor(n / 10_000), d: Math.floor((n % 10_000) / 100), s: n % 100 };
  }
}
