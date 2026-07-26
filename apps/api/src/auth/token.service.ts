/**
 * JWT access + **döndürmeli (rotating) refresh** (SİSTEM PLANI §9).
 *
 * Tasarım:
 *  - **Access token kısa ömürlü (15 dk)** ve durumsuz → her istekte DB'ye gitmeye gerek yok.
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
  readonly accessTtl: number;
  readonly refreshTtl: number;

  constructor(opts: TokenServiceOptions) {
    if (!opts.accessSecret || opts.accessSecret.length < 16) {
      throw new Error('JWT_ACCESS_SECRET en az 16 karakter olmalı.');
    }
    this.key = new TextEncoder().encode(opts.accessSecret);
    this.accessTtl = opts.accessTtlSeconds ?? 15 * 60;          // 15 dk
    this.refreshTtl = opts.refreshTtlSeconds ?? 30 * 24 * 3600; // 30 gün
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
    return {
      sub: payload.sub,
      pid: payload['pid'],
      wid: payload['wid'],
      sid: String(payload['sid'] ?? ''),
    };
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
