/**
 * JWT access + **döndürmeli (rotating) refresh** (SİSTEM PLANI §9).
 *
 * Tasarım:
 *  - **Access token durumsuz** → imzası doğrulanabildiği sürece kim olduğunu söyler.
 *  - **Refresh token uzun ömürlü ama TEK KULLANIMLIK.** Her yenilemede yenisi verilir, eskisi
 *    geçersizleşir. Böylece çalınan bir refresh token en fazla bir kez kullanılabilir ve
 *    kullanıldığı anda gerçek kullanıcının oturumu düşer → hırsızlık **fark edilir**.
 *  - Refresh token'ın kendisi DB'de **saklanmaz**; yalnız SHA-256 özeti (`sessions.refresh_hash`).
 *    Veritabanı sızsa bile token'lar kullanılamaz.
 *  - `worldId` access token'a gömülür → sohbet/oyun sorgularında dünya kimliği yükten DEĞİL
 *    imzalı token'dan okunur (§13.12.1b dünya yalıtımı).
 */
import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { liveNumber } from '../settings/live.ts';

export interface AccessClaims {
  /** account id */
  sub: string;
  /** player id (dünya bağlamı içindeki kimlik) */
  pid: number;
  /** world id — dünya yalıtımının imzalı kaynağı */
  wid: number;
  /** session id (iptal kontrolü için) */
  sid: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export interface TokenServiceOptions {
  accessSecret: string;
  accessTtlSeconds?: number;
  refreshTtlSeconds?: number;
}

/** Refresh token DB'de düz metin DURMAZ — yalnız bu özet saklanır. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class TokenService {
  private readonly key: Uint8Array;
  /** Testlerin sabitlemesi için; üretimde `null` → ömür panelden okunur. */
  private readonly accessTtlFixed: number | null;
  private readonly refreshTtlFixed: number | null;

  constructor(opts: TokenServiceOptions) {
    if (!opts.accessSecret || opts.accessSecret.length < 16) {
      throw new Error('JWT_ACCESS_SECRET en az 16 karakter olmalı.');
    }
    this.key = new TextEncoder().encode(opts.accessSecret);
    this.accessTtlFixed = opts.accessTtlSeconds ?? null;
    this.refreshTtlFixed = opts.refreshTtlSeconds ?? null;
  }

  /**
   * ⭐ Ömürler ALAN DEĞİL erişimci: panelden değiştirilen değer süreç yeniden başlamadan
   * geçerli olsun (`CityService`/`MissionService`'teki dünya başına çözücü deseninin
   * kurulum-geneli kardeşi — `settings/live.ts` kapsam notuna bakın).
   *
   * ⚠️ Kurucuda dondurulsaydı ömür yalnız yeniden başlatmayla değişirdi ve panelde
   * görünen sayı ile gerçekte verilen jeton **sessizce** ayrışırdı.
   */
  get accessTtl(): number {
    return this.accessTtlFixed ?? Math.round(liveNumber('session', 'accessTtlHours', 12) * 3600);
  }

  get refreshTtl(): number {
    return this.refreshTtlFixed ?? Math.round(liveNumber('session', 'refreshTtlDays', 90) * 86_400);
  }

  async signAccess(claims: AccessClaims, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(now.getTime() + this.accessTtl * 1000);
    const token = await new SignJWT({ pid: claims.pid, wid: claims.wid, sid: claims.sid })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
    if (!payload.sub || typeof payload['pid'] !== 'number' || typeof payload['wid'] !== 'number') {
      throw new Error('Token içeriği eksik.');
    }
    /**
     * ⚠️ `sid` DE doğrulanır. Eskiden `String(payload['sid'] ?? '')` yazıyordu: `sid` taşımayan
     * bir jeton sessizce boş dizeye düşüyor, `AuthGuard` onu `''::uuid` diye sorguya koyuyor ve
     * Postgres «invalid input syntax for type uuid» diyordu. Sonuç 401 değil **500** oluyordu —
     * yani bozuk jeton, sunucu hatası gibi görünüyordu.
     */
    const sid = payload['sid'];
    if (typeof sid !== 'string' || sid === '') throw new Error('Token oturum kimliği taşımıyor.');

    return { sub: payload.sub, pid: payload['pid'], wid: payload['wid'], sid };
  }

  /** Refresh token rastgele 32 bayt — JWT değil, çünkü içeriğine gerek yok, yalnız eşleşmesi lazım. */
  newRefreshToken(now = new Date()): { token: string; hash: string; expiresAt: Date } {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      hash: hashRefreshToken(token),
      expiresAt: new Date(now.getTime() + this.refreshTtl * 1000),
    };
  }
}
