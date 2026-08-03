/**
 * ⭐ ADMİN YETKİSİ — iki kademeli.
 *
 *   `AdminGuard`        → panel açılır (okuma serbest). `accounts.role` ∈ {moderator, admin}.
 *   `AdminStepUpGuard`  → yıkıcı işlem (silme · sabit kaydetme · ham düzenleme).
 *                          `sessions.elevated_until > now()` şart.
 *
 * ⚠️ **ROL TOKEN'DAN OKUNMAZ, HER İSTEKTE DB'DEN GELİR.** Rolü jetona gömseydik yetkiyi geri
 * aldığımızda jetonun ömrü boyunca geçerli kalırdı — 2026-08-03'te o ömür 12 saate çıktığı
 * için bu kural artık çok daha kritik: "adminliği aldım" dedikten sonra yarım gün hâlâ admin
 * olurdu. Bedeli `accounts_staff` kısmi indeksi üzerinden tek satır okuması.
 *
 * ⚠️ Bu guard'lar `AuthGuard`ın YERİNE değil ARDINDAN çalışır: `req.player` dolu olmalı.
 * Controller'da sıra `@UseGuards(AuthGuard, AdminGuard)` — Nest soldan sağa uygular.
 */
import {
  ForbiddenException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
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

    // ⚠️ `AuthGuard` ile aynı gerekçe: geçici DB hatası 500 değil 503 olmalı, yoksa panel
    //    «yetkin yok» sanıp seni giriş ekranına atar. Bkz. `auth.guard.ts`.
    let row: Record<string, unknown> | undefined;
    try {
      [row] = await this.db.execute<Record<string, unknown>>(sql`
        SELECT a.role, s.elevated_until
          FROM accounts a
          JOIN sessions s ON s.id = ${player.sessionId}::uuid
         WHERE a.id = ${player.accountId}
      `);
    } catch (err) {
      throw new ServiceUnavailableException(
        `Yetki doğrulanamadı (geçici): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
