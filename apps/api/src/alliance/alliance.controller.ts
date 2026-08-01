/**
 * ⭐ İTTİFAK UÇLARI (§13.15b). Ekran karşılığı: Komuta Merkezi → İttifak (orijinal ekran 17).
 *
 * Kurallar `AllianceService`te; burada yalnız kimlik doğrulama, girdi doğrulama (zod) ve
 * hata → HTTP çevirisi var. Çevrimiçi rozetleri aynı süreçteki gateway'den okunur
 * (`gateway-registry`) — kullanıcı kuralı: online durumu YALNIZ ittifak üyeleri arasında
 * görünür, bu uçtan başka hiçbir yer oyuncu çevrimiçiliği sızdırmaz.
 */
import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject,
  NotFoundException, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { UNVERIFIED_CODE } from '../auth/unverified.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { getGateway } from '../realtime/gateway-registry.ts';
import { AllianceError, AllianceService, ROLE } from './alliance.service.ts';

/** Üye listesi sayfa boyu — orijinal web ekranıyla aynı (ARAYÜZ C: "sayfa başına 20"). */
const PAGE_SIZE = 20;

const nameRequest = z.object({ name: z.string().trim().min(1).max(40) });
const textRequest = z.object({ text: z.string().max(2000) });

function toHttp(err: unknown): Error {
  if (!(err instanceof AllianceError)) return err as Error;
  const body = { code: err.code, message: err.message };
  if (err.code === 'not_found') return new NotFoundException(body);
  // §verify de aynı aile: istek kusursuz, hesabın yetkisi yetmiyor → 403.
  if (err.code === 'forbidden' || err.code === 'hierarchy' || err.code === UNVERIFIED_CODE) {
    return new ForbiddenException(body);
  }
  if (err.code === 'already_pending' || err.code === 'name_taken'
    || err.code === 'target_has_alliance' || err.code === 'not_pending') {
    return new ConflictException(body);
  }
  return new BadRequestException(body);
}

@Controller('api/v1')
@UseGuards(AuthGuard)
export class AllianceController {
  private readonly service: AllianceService;

  constructor(@Inject(DB) private readonly db: Db) {
    this.service = new AllianceService(db);
  }

  /* ── Benim ittifağım ──────────────────────────────────────────────────────── */

  @Get('alliance')
  async mine(@Req() req: AuthedRequest, @Query('page') pageRaw?: string): Promise<Record<string, unknown>> {
    const player = req.player!;
    const my = await this.service.myMembership(player.playerId);

    if (my.allianceId == null) {
      /* Üye değil: kurma şartı + bekleyen başvurularım (ekran "Başvuruldu" rozetini çizer). */
      const pending = await this.db.execute<Record<string, unknown>>(sql`
        SELECT alliance_id FROM alliance_invites
         WHERE player_id = ${player.playerId} AND kind = 'application' AND status = 'pending'
      `);
      return {
        alliance: null,
        canFound: await this.service.canFound(player.playerId),
        pendingApplications: pending.map((p) => Number(p['alliance_id'])),
      };
    }

    const [a] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.id, a.name, a.text, a.leader_id, p.username AS leader_name,
             r.rank, r.prev_rank,
             (SELECT COUNT(*)::int FROM players m WHERE m.alliance_id = a.id) AS member_count,
             (SELECT COALESCE(SUM(m.score), 0) FROM players m WHERE m.alliance_id = a.id) AS score
        FROM alliances a
        JOIN players p ON p.id = a.leader_id
        LEFT JOIN rankings r ON r.world_id = a.world_id AND r.kind = 'alliance' AND r.subject_id = a.id
       WHERE a.id = ${my.allianceId}
    `);
    if (!a) return { alliance: null, canFound: await this.service.canFound(player.playerId), pendingApplications: [] };

    const page = Math.max(0, Number(pageRaw ?? 0) | 0);
    const memberCount = Number(a['member_count']);
    /* Sıralama: rütbe (Lider üstte) → puan. Dünya sırası oyuncu sıralamasından (son snapshot). */
    const members = await this.db.execute<Record<string, unknown>>(sql`
      SELECT m.id, m.username, m.score, m.alliance_role,
             r.rank AS world_rank
        FROM players m
        LEFT JOIN rankings r ON r.world_id = m.world_id AND r.kind = 'player' AND r.subject_id = m.id
       WHERE m.alliance_id = ${my.allianceId}
       ORDER BY m.alliance_role DESC, m.score DESC, m.id
       LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}
    `);

    const gw = getGateway();
    const rank = a['rank'] == null ? null : Number(a['rank']);
    const prevRank = a['prev_rank'] == null ? null : Number(a['prev_rank']);
    return {
      alliance: {
        id: Number(a['id']),
        name: String(a['name']),
        text: String(a['text']),
        leader: String(a['leader_name']),
        myRole: my.role,
        score: Number(a['score']),
        rank,
        rankChange: rank != null && prevRank != null ? prevRank - rank : null,
        memberCount,
        page,
        pages: Math.max(1, Math.ceil(memberCount / PAGE_SIZE)),
        members: members.map((m) => ({
          playerId: Number(m['id']),
          username: String(m['username']),
          score: Number(m['score']),
          role: Number(m['alliance_role'] ?? ROLE.MEMBER),
          worldRank: m['world_rank'] == null ? null : Number(m['world_rank']),
          /* ⭐ Çevrimiçilik yalnız buradan sızar — istek sahibi bu ittifakın üyesi. */
          online: gw?.isOnline(Number(m['id'])) ?? false,
        })),
      },
      serverNow: new Date().toISOString(),
    };
  }

  /* ── İttifak arama/listesi (başvuru akışı) ───────────────────────────────── */

  @Get('alliances')
  async list(@Req() req: AuthedRequest, @Query('query') query?: string): Promise<Record<string, unknown>> {
    const player = req.player!;
    const q = (query ?? '').trim();
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.id, a.name,
             (SELECT COUNT(*)::int FROM players m WHERE m.alliance_id = a.id) AS member_count,
             (SELECT COALESCE(SUM(m.score), 0) FROM players m WHERE m.alliance_id = a.id) AS score,
             r.rank
        FROM alliances a
        LEFT JOIN rankings r ON r.world_id = a.world_id AND r.kind = 'alliance' AND r.subject_id = a.id
       WHERE a.world_id = ${player.worldId}
         AND (${q} = '' OR lower(a.name) LIKE '%' || lower(${q}) || '%')
       ORDER BY COALESCE(r.rank, 999999), score DESC
       LIMIT 25
    `);
    return {
      alliances: rows.map((r) => ({
        id: Number(r['id']),
        name: String(r['name']),
        memberCount: Number(r['member_count']),
        score: Number(r['score']),
        rank: r['rank'] == null ? null : Number(r['rank']),
      })),
    };
  }

  /* ── Kurma / yaşam döngüsü ────────────────────────────────────────────────── */

  @Post('alliance')
  async found(@Req() req: AuthedRequest, @Body() body: unknown): Promise<Record<string, unknown>> {
    const parsed = nameRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException('İttifak adı gerekli.');
    try {
      const p = req.player!;
      const out = await this.service.found({ worldId: p.worldId, playerId: p.playerId, name: parsed.data.name });
      this.syncRooms([p.playerId]);
      return out;
    } catch (err) { throw toHttp(err); }
  }

  @Post('alliance/leave')
  async leave(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    try {
      const p = req.player!;
      const out = await this.service.leave({ worldId: p.worldId, playerId: p.playerId });
      this.syncRooms([p.playerId]);
      return out;
    } catch (err) { throw toHttp(err); }
  }

  @Post('alliance/disband')
  async disband(@Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    try {
      const p = req.player!;
      const my = await this.service.myMembership(p.playerId);
      const memberIds = my.allianceId == null ? [] : (await this.db.execute<Record<string, unknown>>(sql`
        SELECT id FROM players WHERE alliance_id = ${my.allianceId}
      `)).map((m) => Number(m['id']));
      await this.service.disband({ worldId: p.worldId, playerId: p.playerId });
      this.syncRooms(memberIds);
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  @Post('alliance/rename')
  async rename(@Req() req: AuthedRequest, @Body() body: unknown): Promise<Record<string, unknown>> {
    const parsed = nameRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException('İttifak adı gerekli.');
    try {
      const p = req.player!;
      await this.service.rename({ worldId: p.worldId, playerId: p.playerId, name: parsed.data.name });
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  @Post('alliance/text')
  async setText(@Req() req: AuthedRequest, @Body() body: unknown): Promise<Record<string, unknown>> {
    const parsed = textRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz metin.');
    try {
      const p = req.player!;
      await this.service.setText({ worldId: p.worldId, playerId: p.playerId, text: parsed.data.text });
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  @Post('alliance/message')
  async broadcast(@Req() req: AuthedRequest, @Body() body: unknown): Promise<Record<string, unknown>> {
    const parsed = textRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz mesaj.');
    try {
      const p = req.player!;
      const sent = await this.service.broadcast({ worldId: p.worldId, playerId: p.playerId, text: parsed.data.text });
      return { sent };
    } catch (err) { throw toHttp(err); }
  }

  /* ── Üye işlemleri ────────────────────────────────────────────────────────── */

  @Post('alliance/members/:playerId/kick')
  async kick(@Req() req: AuthedRequest, @Param('playerId') target: string): Promise<Record<string, unknown>> {
    try {
      const p = req.player!;
      await this.service.kick({ worldId: p.worldId, playerId: p.playerId, targetId: Number(target) });
      this.syncRooms([Number(target)]);
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  @Post('alliance/members/:playerId/promote')
  async promote(@Req() req: AuthedRequest, @Param('playerId') target: string): Promise<Record<string, unknown>> {
    try {
      const p = req.player!;
      await this.service.setCouncil({ worldId: p.worldId, playerId: p.playerId, targetId: Number(target), council: true });
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  @Post('alliance/members/:playerId/demote')
  async demote(@Req() req: AuthedRequest, @Param('playerId') target: string): Promise<Record<string, unknown>> {
    try {
      const p = req.player!;
      await this.service.setCouncil({ worldId: p.worldId, playerId: p.playerId, targetId: Number(target), council: false });
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  @Post('alliance/members/:playerId/transfer')
  async transfer(@Req() req: AuthedRequest, @Param('playerId') target: string): Promise<Record<string, unknown>> {
    try {
      const p = req.player!;
      await this.service.transfer({ worldId: p.worldId, playerId: p.playerId, targetId: Number(target) });
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  /* ── Davet + başvuru ──────────────────────────────────────────────────────── */

  @Post('alliance/invites')
  async invite(@Req() req: AuthedRequest, @Body() body: unknown): Promise<Record<string, unknown>> {
    const parsed = z.object({ playerId: z.number().int().positive() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Oyuncu gerekli.');
    try {
      const p = req.player!;
      const inviteId = await this.service.invite({
        worldId: p.worldId, playerId: p.playerId, targetId: parsed.data.playerId,
      });
      return { inviteId };
    } catch (err) { throw toHttp(err); }
  }

  @Post('alliance/applications')
  async apply(@Req() req: AuthedRequest, @Body() body: unknown): Promise<Record<string, unknown>> {
    const parsed = z.object({ allianceId: z.number().int().positive() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('İttifak gerekli.');
    try {
      const p = req.player!;
      const applicationId = await this.service.apply({
        worldId: p.worldId, playerId: p.playerId, allianceId: parsed.data.allianceId,
      });
      return { applicationId };
    } catch (err) { throw toHttp(err); }
  }

  @Post('alliance/invites/:id/accept')
  async accept(@Req() req: AuthedRequest, @Param('id') id: string): Promise<Record<string, unknown>> {
    return this.decide(req, id, true);
  }

  @Post('alliance/invites/:id/reject')
  async reject(@Req() req: AuthedRequest, @Param('id') id: string): Promise<Record<string, unknown>> {
    return this.decide(req, id, false);
  }

  private async decide(req: AuthedRequest, id: string, accept: boolean): Promise<Record<string, unknown>> {
    try {
      const p = req.player!;
      // Kabulde üyelik değişen oyuncu davet edilen (invite) ya da başvuran (application) —
      // her iki durumda da o oyuncunun soket odaları tazelenmeli; kimliği servis biliyor.
      const [inv] = await this.db.execute<Record<string, unknown>>(sql`
        SELECT player_id FROM alliance_invites WHERE id = ${Number(id)}
      `);
      await this.service.decide({
        worldId: p.worldId, playerId: p.playerId, inviteId: Number(id), accept,
      });
      if (accept && inv) this.syncRooms([Number(inv['player_id'])]);
      return { ok: true };
    } catch (err) { throw toHttp(err); }
  }

  /* ── Gateway oda senkronu ─────────────────────────────────────────────────── */

  /**
   * Üyelik değişen oyuncuların açık soketlerini yeni ittifak odasına taşır (atılan anında
   * düşer). Gateway yoksa (test/worker) sessiz no-op; DB'den taze `alliance_id` okunur.
   */
  private syncRooms(playerIds: number[]): void {
    const gw = getGateway();
    if (!gw || playerIds.length === 0) return;
    void (async () => {
      for (const pid of playerIds) {
        const [r] = await this.db.execute<Record<string, unknown>>(sql`
          SELECT alliance_id FROM players WHERE id = ${pid}
        `);
        if (r) gw.setMembership(pid, r['alliance_id'] == null ? null : Number(r['alliance_id']));
      }
    })();
  }
}
