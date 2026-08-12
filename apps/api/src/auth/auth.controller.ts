import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, HttpException,
  ForbiddenException, HttpStatus, Inject, Param, Post, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { loginRequest, registerRequest } from '@mobilwar/contracts';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { extractDeviceContext } from '../abuse/device-context.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { EmailError, EmailTokenService } from '../mail/email-token.service.ts';
import { getGateway } from '../realtime/gateway-registry.ts';
import { AccountDeleteError, AccountDeleteService } from './account-delete.service.ts';
import { AuthError, AuthService, type AuthResult } from './auth.service.ts';
import { AuthGuard, platformOf, type AuthedRequest } from './auth.guard.ts';
import { PresenceService } from './presence.service.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * İptal edilen oturumların açık soketlerini de kapatır.
 *
 * ⚠️ Gateway kaydı `ROLE=worker` profilinde boştur ve **bu sorun değil**: HTTP tarafı zaten
 * anında ölüyor (`AuthGuard` her istekte `revoked_at`e bakar). Soket kapatma "hemen" için,
 * "doğruluk" için değil — bu yüzden `?.` ile sessizce geçilebilir.
 */
function dropSockets(sessionIds: readonly string[]): number {
  return getGateway()?.revokeSessions(sessionIds) ?? 0;
}

/**
 * ⚠️ `worldId` artık **sözleşmenin kendisinde** (`packages/contracts/src/auth.ts`) ve
 * varsayılanı YOK (2026-08-03). Buradaki `.extend({ … .default(1) })` yaması kaldırıldı:
 * alanın sessizce 1'e düşmesi, ikinci bir dünya açıldığı gün herkesi birinci dünyaya
 * kaydeden bir hataya dönerdi. İstemci artık formdaki seçimi gönderiyor.
 */
const registerBody = registerRequest;
const loginBody = loginRequest;
const refreshBody = z.object({ refreshToken: z.string().min(10) });
const tokenBody = z.object({ token: z.string().min(10).max(200) });
const resetBody = tokenBody.extend({ password: z.string().min(8).max(200) });
const forgotBody = z.object({ email: z.string().email().max(320) });
const changeBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});
/**
 * ⚠️ Adres değiştirmek de **mevcut parola** ister. Şifre değiştirmekle aynı güvenlik sınıfı:
 * saldırgan adresi kendine çekip sonra "şifremi unuttum" ile hesabı tamamen alabilirdi.
 */
const changeEmailBody = z.object({
  newEmail: z.string().email().max(320),
  currentPassword: z.string().min(1).max(200),
});

/**
 * İstemciye dönen gövde.
 *
 * ⚠️ Buradaki yorum 2026-08-03'e kadar *"web'de httpOnly çereze de yazılır"* diyordu ve bu
 * **doğru değildi**: tüm `apps/api/src` içinde tek bir `setCookie` yok, jetonlar istemcide
 * `localStorage`ta duruyor. Yanlış yorum, çereze güvenen bir düzeltme yazmayı davet ediyordu.
 *
 * ⭐ `accessExpiresAt` süs değil: istemci ömrün son %10'una girince jetonu **kendiliğinden**
 * yeniliyor (`apps/web/src/lib/api.ts`). Bu alanı kaldırmak proaktif yenilemeyi öldürür ve
 * 401 gürültüsünü geri getirir.
 */
interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  player: { id: number; username: string; worldId: number };
  serverNow: string;
}

@Controller('api/v1/auth')
export class AuthController {
  private readonly emails: EmailTokenService;
  private readonly deletes: AccountDeleteService;

  constructor(
    private readonly auth: AuthService,
    private readonly presence: PresenceService,
    @Inject(DB) private readonly db: Db,
  ) {
    this.emails = new EmailTokenService(db);
    this.deletes = new AccountDeleteService(db);
  }

  @Post('register')
  async register(@Body() body: unknown, @Req() req: AuthedRequest): Promise<AuthResponse> {
    const parsed = registerBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.run(() => this.auth.register(parsed.data, extractDeviceContext(req)));
  }

  @Post('login')
  async login(@Body() body: unknown, @Req() req: AuthedRequest): Promise<AuthResponse> {
    const parsed = loginBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.run(() => this.auth.login(parsed.data, extractDeviceContext(req)));
  }

  @Post('refresh')
  async refresh(@Body() body: unknown, @Req() req: AuthedRequest): Promise<AuthResponse> {
    const parsed = refreshBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.run(() => this.auth.refresh(parsed.data.refreshToken, extractDeviceContext(req)));
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@Req() req: AuthedRequest): Promise<{ ok: true }> {
    const p = req.player!;
    // Sahipliği HEMEN bırak (yumuşak değil): çıkış yapan oyuncu kendi hesabına anında
    // dönebilmeli. Yumuşak bırakma sayfa yenilemesi içindir, çıkış için değil.
    await this.presence.releaseNow(p.accountId, p.instanceId).catch(() => { /* önemsiz */ });
    await this.auth.logout(p.sessionId);
    return { ok: true };
  }

  /**
   * ⭐ TEK CİHAZ KURALI — «Bu cihazda devam et» (kullanıcı kararı, 2026-08-03).
   *
   * Kullanıcı kesin engelleme yerine devralmayı seçti: tek anda tek oyun kuralı korunuyor ama
   * tarayıcısı çöken ya da telefonunu kaybeden oyuncu kendi hesabından kilitli kalmıyor.
   *
   * ⚠️ Bu uç `PRESENCE_EXEMPT` listesinde (`/api/v1/auth/**`) — olmasaydı **kilidi açan
   * düğmenin kendisi 409 alırdı** ve modalda çıkış yapmaktan başka seçenek kalmazdı.
   *
   * ⚠️ `force` olmadan da çağrılabilir: istemci modalı kapatmadan önce "sahiplik boşalmış mı"
   * diye yokluyor. Çöken bir sekmenin sahipliği zaman aşımıyla düştüğünde oyuncu düğmeye
   * basmadan geri girebilsin.
   */
  @Post('session/claim')
  @UseGuards(AuthGuard)
  async claimSession(
    @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const p = req.player!;
    const force = (body as { force?: unknown } | null)?.force === true;
    const res = await this.presence.claim({
      accountId: p.accountId, sessionId: p.sessionId, instanceId: p.instanceId,
      worldId: p.worldId, platform: platformOf(req.headers), force,
    });

    if (!res.ok) {
      return { ok: false, holder: { platform: res.holder.platform, seenAt: res.holder.seenAt } };
    }
    // Devraldıysak eski örneğin soketini düşür ki o da modalını açsın.
    if (res.previous) getGateway()?.kickInstance(p.accountId, res.previous.instanceId);
    return { ok: true, tookOver: res.tookOver };
  }

  /* ── Aktif cihazlar (§admin Faz 3) ─────────────────────────────────────────── */

  /**
   * ⭐ OYUNCUNUN KENDİ CİHAZ LİSTESİ — zincir başına tek satır.
   *
   * ⚠️ Liste `sessions.chain_id` üzerinden gruplanır. Satır kimliğiyle gruplasaydık dönmeli
   * refresh yüzünden aynı telefon 15 dakikada bir yeni satır olarak görünürdü ve oyuncunun
   * "çıkar" dediği satır zaten ölü olurdu (bkz. `0028_session_chains.sql`).
   */
  @Get('sessions')
  @UseGuards(AuthGuard)
  async sessions(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const p = req.player!;
    return {
      items: await this.auth.listSessions(p.accountId, p.sessionId),
      serverNow: new Date().toISOString(),
    };
  }

  /**
   * Bir cihazı çıkar. ⚠️ Kendi cihazını da çıkarabilir (istemci bunu "çıkış" gibi ele alır) —
   * engellemek yapay bir kural olurdu: uzaktaki cihazı düşürebilen kişi zaten oturumun sahibi.
   */
  @Delete('sessions/:chainId')
  @UseGuards(AuthGuard)
  async revokeSession(
    @Param('chainId') chainId: string, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    if (!UUID_RE.test(chainId)) throw new BadRequestException('Geçersiz cihaz kimliği.');
    const p = req.player!;
    const ids = await this.auth.revokeChain(p.accountId, chainId);
    return { ok: true, revoked: ids.length, sockets: dropSockets(ids), self: ids.includes(p.sessionId) };
  }

  /** "Diğer tüm cihazlardan çık" — parola değişmeden yapılabilen en hızlı toparlanma. */
  @Post('sessions/revoke-others')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async revokeOthers(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const p = req.player!;
    const ids = await this.auth.revokeOtherChains(p.accountId, p.sessionId);
    return { ok: true, revoked: ids.length, sockets: dropSockets(ids) };
  }

  /* ── E-posta doğrulama ve şifre (§9.2) ─────────────────────────────────────── */

  /** Hesap durumu — doğrulama şeridi ve Seçenekler paneli bunu okur. */
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT email, email_verified_at FROM accounts WHERE id = ${req.player!.accountId}
    `);
    return {
      email: row?.['email'] == null ? null : String(row['email']),
      emailVerified: row?.['email_verified_at'] != null,
    };
  }

  /** Doğrulama e-postasını tekrar gönder (60 sn cooldown + günlük tavan). */
  @Post('verify-email/resend')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async resendVerification(@Req() req: AuthedRequest): Promise<void> {
    await this.mail(() => this.emails.resendVerification(
      req.player!.accountId, extractDeviceContext(req).ip,
    ));
  }

  /** Bağlantıdaki jetonu tüketir. Oturum GEREKMEZ: mail başka cihazda açılmış olabilir. */
  @Post('verify-email')
  async verifyEmail(@Body() body: unknown): Promise<{ email: string }> {
    const parsed = tokenBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_token' });
    return this.mail(() => this.emails.verify(parsed.data.token));
  }

  /**
   * ⚠️ **DAİMA 204** — adres kayıtlı olsa da olmasa da, kota dolsa da. Bu uç aksi hâlde
   * "bu e-posta bu oyunda kayıtlı mı" sorusunu cevaplayan bir sorgulama aracına dönerdi
   * (`auth.service.ts`teki sahte-hash zaman eşitlemesiyle aynı gerekçe).
   */
  @Post('forgot-password')
  @HttpCode(204)
  async forgotPassword(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = forgotBody.safeParse(body);
    if (!parsed.success) return;          // biçim hatası bile sızdırılmaz
    await this.emails.requestReset(parsed.data.email, extractDeviceContext(req).ip);
  }

  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() body: unknown): Promise<void> {
    const parsed = resetBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_token' });
    await this.mail(() => this.emails.resetPassword({
      token: parsed.data.token,
      password: parsed.data.password,
      /**
       * ⭐ Parola değişimi tüm oturumları düşürür — ve artık **açık soketleri de** kapatır
       * (§admin Faz 3). Eskiden yalnız DB satırları iptal ediliyordu; soket ancak token
       * yenilenirken (15 dakikaya kadar) fark ediyordu. Parola değiştirmenin amacı tam olarak
       * "davetsiz misafiri şimdi at" olduğu için o gecikme kabul edilemez.
       */
      revokeAll: async (id) => {
        const ids = await this.auth.revokeAllIds(id);
        dropSockets(ids);
        return ids.length;
      },
    }));
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async changePassword(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = changeBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'weak_password' });
    await this.mail(() => this.emails.changePassword({
      accountId: req.player!.accountId,
      current: parsed.data.currentPassword,
      next: parsed.data.newPassword,
      /**
       * ⭐ **DİĞER** cihazlar düşer, bu oturum kalır (kullanıcı, 2026-08-01). Eskiden
       * `revokeAllIds` çağrılıyordu ve oyuncu kendi şifresini değiştirdiği için oyundan
       * atılıyordu; istemci de bunu bilip sayfayı zorla yeniden yüklüyordu.
       *
       * ⚠️ Soketler de kapanır (§admin Faz 3). Yalnız DB satırını iptal etmek yetmiyordu:
       * açık soket, token yenilenene kadar (15 dakikaya kadar) fark etmiyordu. Şifre
       * değiştirmenin amacı "davetsiz misafiri ŞİMDİ at" olduğu için o gecikme kabul edilemez.
       */
      revokeOthers: async (id) => {
        const ids = await this.auth.revokeOtherChains(id, req.player!.sessionId);
        dropSockets(ids);
        return ids.length;
      },
    }));
  }

  /* ── E-posta ADRESİ değiştirme (kullanıcı, 2026-08-01) ─────────────────────── */

  /**
   * ⭐ Adres değişir, hesap **doğrulanmamışa düşer**, yeni adrese doğrulama gider.
   * Doğrulanmamış hâlin kısıtları (§9.2b) anında yürürlüğe girer — ama hiçbir seviye geri
   * alınmaz (sınırlar «≥»).
   */
  @Post('change-email')
  @UseGuards(AuthGuard)
  async changeEmail(@Body() body: unknown, @Req() req: AuthedRequest): Promise<{ email: string }> {
    const parsed = changeEmailBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_email' });
    return this.mail(() => this.emails.changeEmail({
      accountId: req.player!.accountId,
      newEmail: parsed.data.newEmail,
      currentPassword: parsed.data.currentPassword,
      ip: extractDeviceContext(req).ip,
    }));
  }

  /* ── Hesap silme (kullanıcı, 2026-08-01 · §9.2c) ───────────────────────────── */

  /** Silme bağlantısı iste. ⚠️ Doğrulanmış e-posta ŞART. */
  @Post('delete-account/request')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async requestDeletion(@Req() req: AuthedRequest): Promise<void> {
    await this.mail(() => this.emails.requestDeletion(
      req.player!.accountId, extractDeviceContext(req).ip,
    ));
  }

  /**
   * ⭐⭐ **OTURUMSUZ silme isteği** (kullanıcı, 2026-08-12) — `/hesap-sil` sayfasındaki form.
   *
   * Üstteki uç oyun içi düğmenin yolu ve oturum ister; bu ise oyuna hiç giremeyen oyuncunun
   * (parolasını unutmuş, cihazını değiştirmiş, uygulamayı silmiş) tek kapısı. Böylece
   * `/hesap-sil` tek başına **hem isteği başlatan hem onayı alan** bir sayfa oluyor —
   * mağaza incelemelerinin aradığı «giriş yapmadan silme talebi» şartı da bu ucla karşılanıyor.
   *
   * ⚠️ **DAİMA 204** — `forgot-password` ile birebir aynı gerekçe: adres kayıtlı olmasa da,
   * doğrulanmamış olsa da, kota dolmuş olsa da. Aksi hâlde uç "bu e-posta bu oyunda kayıtlı mı"
   * sorusunu cevaplardı ve bu, silme bağlamında sıfırlamadan daha kötü olurdu.
   *
   * ⚠️ Bu uç **hesabı silmez**, yalnız posta yollar. Yıkıcı adım hâlâ jetonlu `delete-account`
   * ve engel kontrolü orada tekrar koşuyor.
   */
  @Post('delete-account/request-by-email')
  @HttpCode(204)
  async requestDeletionByEmail(@Body() body: unknown, @Req() req: AuthedRequest): Promise<void> {
    const parsed = forgotBody.safeParse(body);
    if (!parsed.success) return;          // biçim hatası bile sızdırılmaz
    await this.emails.requestDeletionByEmail(parsed.data.email, extractDeviceContext(req).ip);
  }

  /**
   * ⭐ ONAY EKRANININ ÖZETİ — **oturum GEREKTİRMEZ** (Google Play'in istediği herkese açık
   * sayfa; bağlantı çoğu zaman telefonun posta uygulamasından, oturumsuz bir tarayıcıda açılır).
   *
   * ⚠️ Jeton **tüketilmez**: oyuncu sayfayı açıp vazgeçerse bağlantı yanmamalı.
   */
  @Post('delete-account/preview')
  async previewDeletion(@Body() body: unknown): Promise<Record<string, unknown>> {
    const parsed = tokenBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_token' });
    const { accountId } = await this.mail(() => this.emails.peekDeletion(parsed.data.token));
    const player = await this.playerOf(accountId);
    return { ...(await this.deletes.preview(player.playerId)) };
  }

  /**
   * ⭐ SİLMEYİ UYGULA — jeton burada tüketilir ve engeller **yeniden** bakılır.
   *
   * ⚠️ Engelleri önizlemedeki cevaba güvenerek atlamak, bağlantının 12 saatlik ömrü boyunca
   * oyuncunun ordu yollamış olabileceğini yok saymak olurdu.
   */
  @Post('delete-account')
  async deleteAccount(@Body() body: unknown): Promise<Record<string, unknown>> {
    const parsed = tokenBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_token' });

    // ⚠️ Önce KİM olduğunu bul (tüketmeden), sonra engellere bak, en son jetonu tüket.
    const peek = await this.mail(() => this.emails.peekDeletion(parsed.data.token));
    const player = await this.playerOf(peek.accountId);
    const pre = await this.deletes.preview(player.playerId);
    if (pre.blockers.length > 0) {
      throw new ConflictException({ code: 'blocked', blockers: pre.blockers });
    }

    await this.mail(() => this.emails.consumeDeletion(parsed.data.token));
    const result = await this.deletes.execute({
      accountId: peek.accountId,
      playerId: player.playerId,
      worldId: player.worldId,
      revokeAll: async (id) => {
        const ids = await this.auth.revokeAllIds(id);
        dropSockets(ids);
        return ids;
      },
    });
    return { ok: true, ...result };
  }

  /** Hesabın (tek) oyuncusu. ⚠️ Hesap ↔ dünya bugün birebir; kayıt aynı e-postayı reddediyor. */
  private async playerOf(accountId: number): Promise<{ playerId: number; worldId: number }> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, world_id FROM players WHERE account_id = ${accountId} ORDER BY id LIMIT 1
    `);
    if (!row) throw new BadRequestException({ code: 'invalid_token' });
    return { playerId: Number(row['id']), worldId: Number(row['world_id']) };
  }

  /** `EmailError` → HTTP. `cooldown`/`quota` 429, `not_verified` 403, gerisi 400. */
  private async mail<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      /**
       * ⚠️ `AccountDeleteService` kendi hatasını fırlatıyor ve **yarış koşulunda** buraya
       * düşebilir: önizleme temiz dönmüşken, `execute()` içindeki ikinci kontrol arada
       * çıkmış bir ordu hareketini yakalayabilir. 409 = "istek doğru ama şu an mümkün değil".
       */
      if (err instanceof AccountDeleteError) {
        throw new ConflictException({ code: err.code, message: err.message });
      }
      if (!(err instanceof EmailError)) throw err;
      const payload = {
        code: err.code, message: err.message, retryAfterSeconds: err.retryAfterSeconds,
      };
      if (err.code === 'cooldown' || err.code === 'quota') {
        throw new HttpException(payload, HttpStatus.TOO_MANY_REQUESTS);
      }
      /* ⚠️ Doğrulanmamış hesabın silme isteği "isteğin bozuk" değil "yetkin yok" → 403. */
      if (err.code === 'not_verified') throw new ForbiddenException(payload);
      throw new BadRequestException(payload);
    }
  }

  /** Hata kodlarını HTTP durumlarına çevirir; iç mesajlar dışarı sızmaz. */
  private async run(fn: () => Promise<AuthResult>): Promise<AuthResponse> {
    try {
      const r = await fn();
      return {
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        accessExpiresAt: r.accessExpiresAt.toISOString(),
        refreshExpiresAt: r.refreshExpiresAt.toISOString(),
        player: { id: r.playerId, username: r.username, worldId: r.worldId },
        // İstemci LOKAL saate güvenmez; geri sayımları bu offset'ten çizer (§7).
        serverNow: new Date().toISOString(),
      };
    } catch (err) {
      if (err instanceof AuthError) {
        if (err.code === 'email_taken' || err.code === 'username_taken') {
          throw new ConflictException({ code: err.code, message: err.message });
        }
        /**
         * ⚠️ `world_not_found` bir kimlik hatası DEĞİL, istek hatası: 401 döndürmek istemciyi
         * "parolan yanlış" demeye iterdi. Dünya seçimi forma gelince (2026-08-03) bu ayrım
         * gerçekten görünür oldu.
         */
        /**
         * ⚠️ Kayıt kötüye kullanımı kodları da 400: `signup_flood` ve `disposable_email`
         * kimlik hatası değil, isteğin kendisiyle ilgili. 401 dönseydi istemci "parolan
         * yanlış" der ve oyuncu neyle karşılaştığını anlamazdı.
         */
        if (err.code === 'world_not_found' || err.code === 'signup_flood'
          || err.code === 'disposable_email') {
          throw new BadRequestException({ code: err.code, message: err.message });
        }
        throw new UnauthorizedException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }
}
