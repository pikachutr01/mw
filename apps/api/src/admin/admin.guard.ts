/**
 * ⭐ ADMİN YETKİSİ — iki kademeli.
 *
 *   `AdminGuard`        → panel açılır (okuma serbest). `accounts.role` ∈ {moderator, admin}.
 *   `AdminStepUpGuard`  → yıkıcı işlem (silme · sabit kaydetme · ham düzenleme).
 *                          `sessions.elevated_until > now()` şart.
 *
 * ⚠️ **ROL TOKEN'DAN OKUNMAZ, HER İSTEKTE DB'DEN GELİR.** Access token 15 dakika yaşıyor;
 * rolü içine gömseydik yetkiyi geri aldığımızda 15 dakika boyunca geçerli kalırdı — yani
 * "adminliği aldım" dedikten sonra çeyrek saat hâlâ admin olurdu. Bedeli `accounts_staff`
 * kısmi indeksi üzerinden tek satır okuması.
 *
 * ⚠️ Bu guard'lar `AuthGuard`ın YERİNE değil ARDINDAN çalışır: `req.player` dolu olmalı.
 * Controller'da sıra `@UseGuards(AuthGuard, AdminGuard)` — Nest soldan sağa uygular.
 */
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { AuthedRequest } from '../auth/auth.guard.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';

export type StaffRole = 'moderator' | 'admin';

/** `AdminGuard`ın isteğe eklediği alan — controller'lar rolü buradan okur. */
export interface AdminRequest extends AuthedRequest {
  staff?: { role: StaffRole; elevated: boolean };
}

@Injectable()
export class AdminGuard implements CanActivate {
  // ⚠️ `import type` KULLANILMAZ (dekoratör metadata'sı `Object` yazar, Nest çözemez).
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const player = req.player;
    if (!player) throw new UnauthorizedException('Oturum yok.');

    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.role, s.elevated_until
        FROM accounts a
        JOIN sessions s ON s.id = ${player.sessionId}::uuid
       WHERE a.id = ${player.accountId}
    `);
    const role = String(row?.['role'] ?? 'player');
    /**
     * ⚠️ Yetkisiz istekte 404 DEĞİL 403 dönülüyor. Panel zaten ayrı bir alt alanda ve varlığı
     * gizli değil; 404 ile "yok" demek yalnız hata ayıklamayı zorlaştırırdı.
     */
    if (role !== 'moderator' && role !== 'admin') {
      throw new ForbiddenException('Bu alan için yetkin yok.');
    }

    const until = row?.['elevated_until'];
    req.staff = {
      role,
      elevated: until != null && new Date(String(until)).getTime() > Date.now(),
    };
    return true;
  }
}

/**
 * Yıkıcı işlem kapısı. `AdminGuard`tan SONRA çalışır ve onun yazdığı `req.staff`ı okur.
 *
 * ⚠️ `moderator` da yükseltilebilir — kademe yetkiyi değil **tazeliği** ölçüyor: "parolayı
 * son 15 dakika içinde yeniden girdi mi". Hangi işlemin kime açık olduğu ayrı bir sorudur ve
 * controller'da karara bağlanır.
 */
@Injectable()
export class AdminStepUpGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    if (!req.staff) throw new ForbiddenException('Yetki bağlamı yok.');
    if (!req.staff.elevated) {
      // Kod istemciye AYNEN gider: panel bunu görünce parola diyaloğunu açar (§13.14).
      throw new ForbiddenException({
        code: 'step_up_required',
        message: 'Bu işlem için parolanı yeniden girmen gerekiyor.',
      });
    }
    return true;
  }
}
