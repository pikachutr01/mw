/**
 * ⭐ OYUNCU ve MODERASYON (admin Faz 6).
 *
 * Üç iş: **oyuncu künyesi** (destek sorusu), **şikayet kuyruğu** (`chat_reports` bugüne kadar
 * yalnız biriktiriliyordu), **sohbet yasağı** (`chat_bans` bugüne kadar tamamen ölüydü).
 *
 * ⚠️ §9.1.1 değişmezi burada da geçerli: **otomatik ceza YOK.** `abuse_signals` yalnız
 * gösterilir; hiçbir sayı kendiliğinden ban üretmez. Ceza her zaman bir insanın kararıdır ve
 * `audit_log`a kim verdiğiyle yazılır.
 */
import {
  BadRequestException, Body, Controller, Get, HttpCode, Inject, NotFoundException, Param,
  Post, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import { AuthService } from '../auth/auth.service.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { getGateway } from '../realtime/gateway-registry.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';
import { currentTraceId } from '../common/request-context.ts';

/**
 * ⚠️ `days` yoksa ban **SÜRESİZ**. Varsayılanı süreli yapmadık: süresiz ban bilinçli bir karar
 * olmalı, "gün girmeyi unuttum" ile oluşmamalı — bu yüzden panel de onu ayrı bir seçenek
 * olarak soruyor.
 */
const banBody = z.object({
  days: z.number().int().min(1).max(3650).optional(),
  reason: z.string().trim().min(3).max(500),
  /** `all` = özel mesaj + (ileride) genel sohbet. Şimdilik tek kapsam var. */
  scope: z.enum(['all', 'global']).default('all'),
});

/**
 * ⚠️ Değerler `chat_reports.status`un şemadaki sözlüğünden BİREBİR: `reviewed | actioned |
 * dismissed`. Kendi kelimelerimi uydursaydım (`acknowledge` gibi) tabloya şemanın tanımadığı
 * bir durum yazılırdı ve `chat_reports_open` indeksi ile filtreler sessizce kayardı.
 */
/**
 * ⭐ OYUNCU CEZASI. ⚠️ `days` yoksa ceza **SÜRESİZ** ve kip zorunlu olarak `open` olur —
 * kalıcı yasakta hesap geri gelmeyecek, şehirlerini korumanın bir anlamı yok (şema CHECK'i
 * de bunu zorluyor, yalnız burada değil).
 */
const playerBanBody = z.object({
  days: z.number().int().min(1).max(3650).optional(),
  mode: z.enum(['open', 'closed']).default('open'),
  reason: z.string().trim().min(3).max(500),
}).refine((o) => o.mode === 'open' || o.days != null,
  { message: 'Süresiz ceza saldırıya kapalı olamaz.', path: ['mode'] });

const resolveBody = z.object({
  action: z.enum(['reviewed', 'actioned', 'dismissed']),
  note: z.string().trim().max(500).optional(),
});

@Controller('api/v1/admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminModerationController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly auth: AuthService,
  ) {}

  /* ── Oyuncu künyesi ───────────────────────────────────────────────────────── */

  /**
   * Bir oyuncunun tam künyesi: hesap, şehirler, cihaz sinyalleri, şikayetler, yasak durumu.
   *
   * ⚠️ Tek uçta toplanıyor çünkü destek sorusu tek: *"bu oyuncuda ne oluyor?"* Beş ayrı uca
   * bölseydik panel beş istek atar ve ekranın yarısı yüklenirken diğer yarısı beklerdi.
   */
  @Get('players/:playerId')
  async dossier(@Param('playerId') playerId: string): Promise<Record<string, unknown>> {
    const id = Number(playerId);
    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT p.id, p.username, p.world_id, p.score, p.created_at, p.last_seen_at,
             p.banned_at, p.ban_until, p.ban_mode, p.ban_reason,
             p.protected_until, p.vacation_until, p.alliance_id,
             a.id AS account_id, a.email, a.role, a.email_verified_at, a.locked_until,
             a.failed_logins, a.created_at AS account_created_at,
             al.name AS alliance_name
        FROM players p
        JOIN accounts a ON a.id = p.account_id
        LEFT JOIN alliances al ON al.id = p.alliance_id
       WHERE p.id = ${id}
    `);
    if (!p) throw new NotFoundException('Oyuncu bulunamadı.');

    const cities = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, name, k, d, s, is_capital FROM cities WHERE player_id = ${id} ORDER BY id
    `);
    const ban = await this.currentBan(id);
    const reports = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*) FILTER (WHERE reported_player_id = ${id})::int AS against,
             COUNT(*) FILTER (WHERE reporter_id = ${id})::int       AS filed
        FROM chat_reports
    `);
    /**
     * ⚠️ Cihaz/IP sinyalleri **karar değil kayıt** (§9.1.1). Aynı cihazdan iki hesaba girmek
     * tek başına suç değil (ev, iş, internet kafe); panel sayıyı gösterir, yorumu insana bırakır.
     */
    const devices = await this.db.execute<Record<string, unknown>>(sql`
      SELECT d.device_id, d.platform, d.first_seen, d.last_seen,
             (SELECT COUNT(DISTINCT player_id)::int FROM player_devices x
               WHERE x.device_id = d.device_id) AS shared_with
        FROM player_devices d WHERE d.player_id = ${id}
       ORDER BY d.last_seen DESC LIMIT 20
    `);
    const ips = await this.db.execute<Record<string, unknown>>(sql`
      SELECT i.ip, i.first_seen, i.last_seen,
             (SELECT COUNT(DISTINCT player_id)::int FROM player_ips x WHERE x.ip = i.ip) AS shared_with
        FROM player_ips i WHERE i.player_id = ${id}
       ORDER BY i.last_seen DESC LIMIT 20
    `);

    return {
      player: {
        id, username: String(p['username']), worldId: Number(p['world_id']),
        score: Number(p['score']),
        createdAt: toDate(p['created_at']).toISOString(),
        lastSeenAt: p['last_seen_at'] == null ? null : toDate(p['last_seen_at']).toISOString(),
        bannedAt: p['banned_at'] == null ? null : toDate(p['banned_at']).toISOString(),
        alliance: p['alliance_name'] == null ? null : String(p['alliance_name']),
        /**
         * ⚠️ Bu ikisi SQL'de baştan beri çekiliyordu ama JSON'a hiç konmamıştı — yani acemi
         * koruması ve tatil modu, veri elde olduğu hâlde panelde görünmüyordu. Destek
         * sorusunun ("neden bu oyuncuya saldıramıyorum") cevabı tam olarak bu iki alan.
         */
        protectedUntil: p['protected_until'] == null
          ? null : toDate(p['protected_until']).toISOString(),
        vacationUntil: p['vacation_until'] == null
          ? null : toDate(p['vacation_until']).toISOString(),
      },
      /**
       * ⚠️ `active` SUNUCUDA hesaplanıyor: süresi geçmiş bir ceza satırı duruyor olabilir ve
       * "cezalı mı" kararı tek yerden verilmeli, istemci tarih karşılaştırmasın.
       */
      ban: p['banned_at'] == null ? null : {
        until: p['ban_until'] == null ? null : toDate(p['ban_until']).toISOString(),
        mode: p['ban_mode'] == null ? 'open' : String(p['ban_mode']),
        reason: p['ban_reason'] == null ? null : String(p['ban_reason']),
        active: p['ban_until'] == null || toDate(p['ban_until']) > new Date(),
      },
      account: {
        id: Number(p['account_id']), email: String(p['email']), role: String(p['role']),
        emailVerified: p['email_verified_at'] != null,
        lockedUntil: p['locked_until'] == null ? null : toDate(p['locked_until']).toISOString(),
        failedLogins: Number(p['failed_logins'] ?? 0),
        createdAt: toDate(p['account_created_at']).toISOString(),
      },
      cities: cities.map((c) => ({
        id: Number(c['id']), name: String(c['name']),
        coordinates: `${Number(c['k'])}:${Number(c['d'])}:${Number(c['s'])}`,
        isCapital: c['is_capital'] === true,
      })),
      chatBan: ban,
      reports: {
        against: Number(reports[0]?.['against'] ?? 0),
        filed: Number(reports[0]?.['filed'] ?? 0),
      },
      devices: devices.map((d) => ({
        deviceId: String(d['device_id']),
        platform: d['platform'] == null ? null : String(d['platform']),
        firstSeen: toDate(d['first_seen']).toISOString(),
        lastSeen: toDate(d['last_seen']).toISOString(),
        sharedWith: Number(d['shared_with']),
      })),
      ips: ips.map((i) => ({
        ip: String(i['ip']),
        firstSeen: toDate(i['first_seen']).toISOString(),
        lastSeen: toDate(i['last_seen']).toISOString(),
        sharedWith: Number(i['shared_with']),
      })),
    };
  }

  /* ── Sohbet yasağı ────────────────────────────────────────────────────────── */

  /**
   * ⭐ SOHBET YASAĞI VER. `chat_bans` bugüne kadar yazılabilen ama **hiç okunmayan** bir
   * tabloydu; Faz 6'da `chat.service` onu okumaya başladı.
   *
   * ⚠️ Yasaklı oyuncu **okumaya devam eder**, yalnız yazamaz (kullanıcı kararı). Okumayı da
   * kapatsaydık ceza "sohbetten silinmek" olurdu ve oyuncu kendisine ne yazıldığını göremezdi.
   */
  @Post('players/:playerId/chat-ban')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async ban(
    @Param('playerId') playerId: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = banBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const id = Number(playerId);

    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id, username FROM players WHERE id = ${id}
    `);
    if (!p) throw new NotFoundException('Oyuncu bulunamadı.');
    const worldId = Number(p['world_id']);

    const until = parsed.data.days == null
      ? null : new Date(Date.now() + parsed.data.days * 86_400_000);

    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      INSERT INTO chat_bans (world_id, player_id, scope, until, reason, created_by)
      VALUES (${worldId}, ${id}, ${parsed.data.scope},
              ${until?.toISOString() ?? null}::timestamptz,
              ${parsed.data.reason}, ${req.player!.playerId})
      RETURNING id
    `);
    await this.audit(worldId, req.player!.playerId, 'admin.chat.ban', id, {
      banId: Number(row!['id']), until: until?.toISOString() ?? null,
      reason: parsed.data.reason, scope: parsed.data.scope,
    });
    return { ok: true, banId: Number(row!['id']), until: until?.toISOString() ?? null };
  }

  /**
   * Yasağı kaldır.
   *
   * ⚠️ Satır **SİLİNMEZ**, `until` geçmişe çekilir: moderasyon geçmişi kalıcı olmalı. Silseydik
   * "bu oyuncu daha önce ban yemiş miydi" sorusu cevapsız kalırdı ve tekrarlayan davranışı
   * görmek imkânsızlaşırdı.
   */
  @Post('players/:playerId/chat-unban')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async unban(
    @Param('playerId') playerId: string, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const id = Number(playerId);
    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id FROM players WHERE id = ${id}
    `);
    if (!p) throw new NotFoundException('Oyuncu bulunamadı.');

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE chat_bans SET until = now()
       WHERE player_id = ${id} AND (until IS NULL OR until > now())
      RETURNING id
    `);
    await this.audit(Number(p['world_id']), req.player!.playerId, 'admin.chat.unban', id, {
      lifted: rows.length,
    });
    return { ok: true, lifted: rows.length };
  }

  /** Bir oyuncunun yasak geçmişi — aktif olan en üstte. */
  @Get('players/:playerId/chat-bans')
  async banHistory(@Param('playerId') playerId: string): Promise<Record<string, unknown>> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT b.id, b.scope, b.until, b.reason, b.created_at, p.username AS by_username
        FROM chat_bans b
        LEFT JOIN players p ON p.id = b.created_by
       WHERE b.player_id = ${Number(playerId)}
       ORDER BY b.created_at DESC LIMIT 50
    `);
    return {
      items: rows.map((r) => ({
        id: Number(r['id']),
        scope: String(r['scope']),
        until: r['until'] == null ? null : toDate(r['until']).toISOString(),
        active: r['until'] == null || toDate(r['until']) > new Date(),
        reason: r['reason'] == null ? null : String(r['reason']),
        createdAt: toDate(r['created_at']).toISOString(),
        by: r['by_username'] == null ? null : String(r['by_username']),
      })),
    };
  }

  /* ── Oyuncu cezası (saldırıya açık/kapalı) ────────────────────────────────── */

  /**
   * ⭐ OYUNCU CEZASI — oyuncu oyuna giremez; şehirlerine ne olacağı **kipe** bağlı.
   *
   *   `open`   — şehirleri **saldırıya açık** kalır. Kalıcı cezada tek doğru seçenek: hesap
   *              geri gelmeyecek, şehirleri dünyanın kaynağı olur. Bu kip acemi korumasını
   *              ve tatil modunu da **ezer** — "saldırıya açık" dedikten sonra saldırıların
   *              korumaya çarpması, verilen kararın sessizce uygulanmaması olurdu.
   *   `closed` — şehirleri **korunur**; oyuncu döndüğünde imparatorluğunu bulur. Yalnız
   *              casusluk serbest, nakliye kapalı: açık olsaydı cezalının dokunulmaz şehri
   *              güvenli bir kasa olurdu. (Destek zaten yalnız kendi şehirlerine gidiyor.)
   *
   * ⚠️ Ceza verilince **tüm oturumlar düşürülür ve soketler kapanır**: oyuncu "girişim hâlâ
   * açık" diye oynamaya devam edememeli. Aksi hâlde ceza ancak token süresi (15 dk) dolunca
   * işlerdi.
   */
  @Post('players/:playerId/ban')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async banPlayer(
    @Param('playerId') playerId: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = playerBanBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const id = Number(playerId);

    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id, account_id, username FROM players WHERE id = ${id}
    `);
    if (!p) throw new NotFoundException('Oyuncu bulunamadı.');
    // ⛔ Kendini cezalandırma: paneli kilitleyip kendini dışarıda bırakmanın en kolay yolu.
    if (id === req.player!.playerId) {
      throw new BadRequestException('Kendine ceza veremezsin.');
    }

    const until = parsed.data.days == null
      ? null : new Date(Date.now() + parsed.data.days * 86_400_000);
    const mode = until == null ? 'open' : parsed.data.mode;

    await this.db.execute(sql`
      UPDATE players
         SET banned_at = now(), ban_until = ${until?.toISOString() ?? null}::timestamptz,
             ban_mode = ${mode}, ban_reason = ${parsed.data.reason},
             banned_by = ${req.player!.playerId}
       WHERE id = ${id}
    `);

    const sessions = await this.auth.revokeAllIds(Number(p['account_id']));
    const sockets = getGateway()?.revokeSessions(sessions) ?? 0;

    await this.audit(Number(p['world_id']), req.player!.playerId, 'admin.player.ban', id, {
      until: until?.toISOString() ?? null, mode, reason: parsed.data.reason,
      sessions: sessions.length, sockets,
    });
    return {
      ok: true, until: until?.toISOString() ?? null, mode,
      revokedSessions: sessions.length, closedSockets: sockets,
    };
  }

  /**
   * Cezayı kaldır.
   *
   * ⚠️ `ban_reason` ve `banned_by` **silinmez**, yalnız `banned_at`/`ban_until` temizlenir:
   * "bu oyuncu daha önce ceza almış mıydı" sorusu cevaplanabilir kalsın (`chat_bans` ile
   * aynı sözleşme). Cezanın kendisi `audit_log`ta zaten kim verdiğiyle duruyor.
   */
  @Post('players/:playerId/unban')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async unbanPlayer(
    @Param('playerId') playerId: string, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const id = Number(playerId);
    const [p] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT world_id FROM players WHERE id = ${id}
    `);
    if (!p) throw new NotFoundException('Oyuncu bulunamadı.');

    await this.db.execute(sql`
      UPDATE players SET banned_at = NULL, ban_until = NULL, ban_mode = NULL WHERE id = ${id}
    `);
    await this.audit(Number(p['world_id']), req.player!.playerId, 'admin.player.unban', id, {});
    return { ok: true };
  }

  /* ── Şikayet kuyruğu ──────────────────────────────────────────────────────── */

  /**
   * ⭐ ŞİKAYET KUYRUĞU — `chat_reports` bugüne kadar yalnız biriktiriliyordu, hiç okunmuyordu.
   *
   * ⚠️ Gövde kopyası şikayet ANINDA alınmıştı (`body_snapshot`): mesaj silinse bile kanıt
   * duruyor. Panel canlı mesajı değil o kopyayı gösterir — aksi hâlde şikayet edilen kişi
   * mesajı silerek kanıtı yok edebilirdi.
   */
  @Get('reports')
  async reports(@Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const q = (req as unknown as { query?: Record<string, unknown> }).query ?? {};
    const onlyOpen = String(q['status'] ?? 'open') === 'open';
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT r.id, r.world_id, r.reason, r.note, r.body_snapshot, r.created_at,
             r.reported_player_id, r.status, r.reviewed_at, r.resolution,
             rep.username AS reporter, tgt.username AS reported,
             (SELECT COUNT(*)::int FROM chat_reports x
               WHERE x.reported_player_id = r.reported_player_id) AS total_against,
             EXISTS (SELECT 1 FROM chat_bans b
                      WHERE b.player_id = r.reported_player_id
                        AND (b.until IS NULL OR b.until > now())) AS currently_banned
        FROM chat_reports r
        LEFT JOIN players rep ON rep.id = r.reporter_id
        LEFT JOIN players tgt ON tgt.id = r.reported_player_id
       WHERE (${onlyOpen}::boolean IS FALSE OR r.status = 'open')
       ORDER BY r.created_at DESC LIMIT 100
    `);
    return {
      items: rows.map((r) => ({
        id: Number(r['id']),
        worldId: Number(r['world_id']),
        reason: String(r['reason']),
        note: r['note'] == null ? null : String(r['note']),
        body: r['body_snapshot'] == null ? null : String(r['body_snapshot']),
        reporter: r['reporter'] == null ? null : String(r['reporter']),
        reported: r['reported'] == null ? null : String(r['reported']),
        reportedPlayerId: Number(r['reported_player_id']),
        totalAgainst: Number(r['total_against']),
        currentlyBanned: r['currently_banned'] === true,
        status: String(r['status']),
        reviewedAt: r['reviewed_at'] == null ? null : toDate(r['reviewed_at']).toISOString(),
        resolution: r['resolution'] == null ? null : String(r['resolution']),
        createdAt: toDate(r['created_at']).toISOString(),
      })),
    };
  }

  /**
   * Şikayeti kapat. ⚠️ Kapatmak **ceza vermek değildir**: `dismissed` = haksız/önemsiz,
   * `reviewed` = bakıldı, `actioned` = işlem yapıldı. Ceza AYRI bir işlem (`chat-ban`) ve ayrı
   * bir audit satırı — ikisini birleştirseydik "şikayeti kapattım" ile "ban verdim" aynı kayda
   * düşer ve geçmişte hangisinin olduğu ayırt edilemezdi.
   */
  @Post('reports/:id/resolve')
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async resolve(
    @Param('id') id: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const parsed = resolveBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE chat_reports
         SET status = ${parsed.data.action}, reviewed_at = now(),
             reviewed_by = ${req.player!.playerId}, resolution = ${parsed.data.note ?? null}
       WHERE id = ${Number(id)} AND status = 'open'
      RETURNING world_id, reported_player_id
    `);
    if (rows.length === 0) throw new NotFoundException('Şikayet bulunamadı veya zaten kapalı.');

    await this.audit(
      Number(rows[0]!['world_id']), req.player!.playerId, 'admin.report.resolve',
      Number(rows[0]!['reported_player_id']),
      { reportId: Number(id), action: parsed.data.action, note: parsed.data.note ?? null },
    );
    return { ok: true };
  }

  /* ── Yardımcılar ──────────────────────────────────────────────────────────── */

  private async currentBan(playerId: number): Promise<Record<string, unknown> | null> {
    const [row] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, scope, until, reason, created_at FROM chat_bans
       WHERE player_id = ${playerId} AND (until IS NULL OR until > now())
       ORDER BY until IS NULL DESC, until DESC LIMIT 1
    `);
    if (!row) return null;
    return {
      id: Number(row['id']),
      scope: String(row['scope']),
      until: row['until'] == null ? null : toDate(row['until']).toISOString(),
      reason: row['reason'] == null ? null : String(row['reason']),
      createdAt: toDate(row['created_at']).toISOString(),
    };
  }

  private async audit(
    worldId: number, actorPlayerId: number, action: string, targetId: number,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after, trace_id)
      VALUES (${worldId}, ${actorPlayerId}, ${action}, 'player', ${targetId},
              ${JSON.stringify(payload)}::jsonb, ${currentTraceId()})
    `);
  }
}
