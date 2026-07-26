/**
 * Access token doğrulaması + **dünya bağlamının sabitlenmesi**.
 *
 * ⚠️ Dünya kimliği (`worldId`) **istek yükünden ASLA okunmaz** — imzalı token'dan gelir.
 * Bu, §13.12.1b dünya yalıtımının üçüncü katmanı: "başka dünyanın kanalına yaz" saldırısı
 * şema/sorgu/soket katmanlarına hiç ulaşamaz.
 */
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { TokenService } from './token.service.ts';
import { DB } from '../db/tokens.ts';

export interface RequestPlayer {
  accountId: number;
  playerId: number;
  worldId: number;
  sessionId: string;
}

/** Fastify isteğine eklenen alan. Controller'lar bunu okur. */
export interface AuthedRequest {
  player?: RequestPlayer;
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class AuthGuard implements CanActivate {
  // ⚠️ `import type` KULLANILMAZ: dekoratör metadata'sı tipi `Object` olarak yazar ve Nest
  // bağımlılığı çözemez. Sembol belirteçli sağlayıcılar ayrıca @Inject ister.
  constructor(
    private readonly tokens: TokenService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw?.startsWith('Bearer ')) throw new UnauthorizedException('Yetki başlığı yok.');

    let claims;
    try {
      claims = await this.tokens.verifyAccess(raw.slice(7));
    } catch {
      throw new UnauthorizedException('Token geçersiz veya süresi dolmuş.');
    }

    // Oturum iptal edilmiş olabilir (çıkış / parola değişimi / şüpheli erişim). Access token
    // durumsuz olduğu için bu kontrol şart — yoksa iptal 15 dk boyunca işlemezdi.
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM sessions
       WHERE id = ${claims.sid}::uuid AND revoked_at IS NULL AND expires_at > now()
    `);
    if (rows.length === 0) throw new UnauthorizedException('Oturum kapatılmış.');

    req.player = {
      accountId: Number(claims.sub),
      playerId: claims.pid,
      worldId: claims.wid,
      sessionId: claims.sid,
    };
    return true;
  }
}
