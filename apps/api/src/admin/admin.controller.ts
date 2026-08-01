/**
 * ⭐ ADMİN — Faz 0: oturum künyesi + adım yükseltme.
 *
 * Panelin ilk açılışta sorduğu tek soru: *"ben kimim, neye yetkim var, yükseltmem taze mi"*.
 * Sonraki fazların ekranları bu controller'a eklenecek.
 *
 * ⚠️ Rota `/api/v1/admin/*`. Panel ayrı bir alt alanda (`yonetim.…`) yaşıyor ama API aynı
 * kökende: ayrı bir API süreci açmak ikinci bir dağıtım hedefi demekti ve kazancı yoktu —
 * yetki sınırı süreçte değil `AdminGuard`ta.
 */
import {
  BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req, UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  BUILDINGS, BUILDING_ORDER, LEVEL_BASED, TECHS, TECH_ORDER, UNITS,
  DEFENSE_ORDER, WARRIOR_ORDER, orderBy,
} from '@mobiwar/catalog';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import { PasswordService } from '../auth/password.service.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { BULK_OPS } from './admin.bulk.controller.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';

const stepUpBody = z.object({ password: z.string().min(1).max(200) });

/** Yükseltmenin ömrü. Kısa tutuldu: panel açık unutulan bir sekmede sınırsız yetki kalmasın. */
export const STEP_UP_MINUTES = 15;

@Controller('api/v1/admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  private readonly passwords = new PasswordService();

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Panelin açılış çağrısı: kim, hangi rol, yükseltme taze mi. */
  @Get('me')
  async me(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.email, p.username, s.elevated_until
        FROM accounts a
        JOIN players p ON p.id = ${player.playerId}
        LEFT JOIN sessions s ON s.id = ${player.sessionId}::uuid
       WHERE a.id = ${player.accountId}
    `);
    return {
      accountId: player.accountId,
      username: String(row?.['username'] ?? ''),
      email: String(row?.['email'] ?? ''),
      role: req.staff!.role,
      elevated: req.staff!.elevated,
      /**
       * ⭐ Yükseltmenin BİTİŞ ANI (panel 2. nesil). Veri baştan beri `sessions.elevated_until`
       * kolonunda duruyordu ama yalnız `step-up` yanıtında dönüyordu; panel sayfa yenilendikten
       * sonra kalan süreyi bilemiyor, 15 dakika sessizce doluyor ve yönetici bunu ancak bir
       * 403 alınca fark ediyordu.
       */
      elevatedUntil: req.staff!.elevated && row?.['elevated_until'] != null
        ? new Date(String(row['elevated_until'])).toISOString()
        : null,
      stepUpMinutes: STEP_UP_MINUTES,
    };
  }

  /**
   * ⭐ KATALOG KÜNYESİ (panel 2. nesil) — birim/yapı/teknik seçicilerinin kaynağı.
   *
   * Kullanıcının şikâyeti buydu: *"askerleri json formatında bir de İngilizce adları ile
   * yazarak yapmam gerekiyor."* Panel artık `{"dwarf": 500}` yazdırmıyor, **Cüce** yazan bir
   * satır gösteriyor.
   *
   * ⚠️ Liste **sunucudan** geliyor, panelde sabit yazılmıyor: katalogda bir birim eklendiğinde
   * iki yer güncellenmek zorunda kalır ve biri unutulunca seçici eksik kalırdı. Sıra da oyunun
   * kendi ekranlarındaki sıra (`display-order.ts`) — yönetici ile oyuncu aynı düzeni görsün.
   *
   * ⚠️ Yükseltme İSTEMİYOR (`AdminStepUpGuard` yok): bu salt-okunur sabit veri ve panel açılışta
   * çekiyor. Yükseltmenin arkasına koysaydık form alanları parola girilene kadar boş kalırdı.
   */
  @Get('catalog')
  catalog(): Record<string, unknown> {
    return {
      /** Barakada üretilenler — `give-units` seçicisi. */
      warriors: orderBy(UNITS.filter((u) => u.kind === 'warrior'), WARRIOR_ORDER)
        .map((u) => ({ id: u.id, name: u.name.tr, gold: u.gold, food: u.food, area: u.area })),
      /**
       * ⚠️ Savunma listesi Sur/Kalkan'ı DIŞLIYOR: onlar `defenses` tablosunda adet değil
       * **seviye** taşır (`LEVEL_BASED`) ve ayrı bir aksiyonla düzenlenir. Aynı seçicide
       * dursalardı "6 adet sur" yazılabilirdi.
       */
      defenses: orderBy(UNITS.filter((u) => u.kind === 'defense' && !LEVEL_BASED.has(u.id)),
        DEFENSE_ORDER)
        .map((u) => ({ id: u.id, name: u.name.tr, gold: u.gold, food: u.food, area: u.area })),
      structures: UNITS.filter((u) => LEVEL_BASED.has(u.id) && u.id !== 'temple')
        .map((u) => ({ id: u.id, name: u.name.tr })),
      buildings: orderBy(BUILDINGS, BUILDING_ORDER)
        .map((b) => ({ id: b.id, name: b.name.tr, maxLevel: b.maxLevel })),
      techs: orderBy(TECHS, TECH_ORDER).map((t) => ({ id: t.id, name: t.name.tr })),
    };
  }

  /**
   * Toplu işlem künyesi — panel formu bundan üretiyor.
   *
   * ⚠️ `AdminBulkController` sınıf seviyesinde `AdminStepUpGuard` taşıyor (yıkıcı uçlar orada).
   * Künyeyi de oraya koysaydık form alanları **parola girilene kadar boş** kalırdı; okuma
   * yükseltme istemez, yazma ister.
   */
  @Get('bulk-ops')
  bulkOps(): Record<string, unknown> {
    return { ops: BULK_OPS };
  }

  /**
   * ⭐ ADIM YÜKSELTME — parolayı yeniden sorar, oturuma 15 dakikalık pencere yazar.
   *
   * ⚠️ Yanlış parolada **bilerek sayaç artırılmıyor** (`accounts.failed_logins`). O sayaç giriş
   * ucunun kaba kuvvet kilididir; buradaki kullanıcı zaten kimliğini kanıtlamış bir admin ve
   * yanlış yazması kendi hesabını kilitlememeli. Kaba kuvvet riski yok: saldırganın buraya
   * gelmesi için geçerli bir admin oturumu ele geçirmiş olması gerekir — o noktada zaten
   * kaybedilmiş bir savaş.
   */
  @Post('step-up')
  @HttpCode(200)
  async stepUp(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const parsed = stepUpBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Parola gerekli.');
    const player = req.player!;

    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT password_hash FROM accounts WHERE id = ${player.accountId}
    `);
    const ok = row
      ? await this.passwords.verify(String(row['password_hash']), parsed.data.password)
      : false;
    if (!ok) throw new UnauthorizedException('Parola yanlış.');

    const until = new Date(Date.now() + STEP_UP_MINUTES * 60_000);
    await this.db.execute(sql`
      UPDATE sessions SET elevated_until = ${until.toISOString()}::timestamptz
       WHERE id = ${player.sessionId}::uuid
    `);
    return { elevated: true, elevatedUntil: until.toISOString() };
  }

  /** Yükseltmeyi elle bırak (panelden çıkarken). Yıkıcı değil → step-up guard'ı yok. */
  @Post('step-down')
  @HttpCode(204)
  async stepDown(@Req() req: AdminRequest): Promise<void> {
    await this.db.execute(sql`
      UPDATE sessions SET elevated_until = NULL WHERE id = ${req.player!.sessionId}::uuid
    `);
  }

  /**
   * Yükseltme kapısının gerçekten kapalı olduğunu ölçmek için bir prob ucu (Faz 0 doğrulaması).
   * Sonraki fazlarda gerçek yıkıcı uçlar aynı guard'ı kullanacak.
   */
  @Post('echo-elevated')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  echoElevated(): Record<string, unknown> {
    return { ok: true };
  }
}
