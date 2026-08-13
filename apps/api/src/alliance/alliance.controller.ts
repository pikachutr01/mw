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
import {
  isVerified, UNVERIFIED_CODE, UNVERIFIED_MESSAGE, unverifiedLimits,
} from '../auth/unverified.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { getGateway } from '../realtime/gateway-registry.ts';
import { GameClockService } from '../world/game-clock.service.ts';
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
  /** Ünvan süresi OYUN saatinde ölçülüyor → burada da oyun saati gerekiyor. */
  private readonly clock: GameClockService;

  constructor(@Inject(DB) private readonly db: Db) {
    this.service = new AllianceService(db);
    this.clock = new GameClockService(db);
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

    /**
     * ⚠️⚠️ **TOPLAM PUAN SÜZGECİ, SIRALAMAYLA AYNI OLMAK ZORUNDA** (2026-08-13'te düzeltildi).
     *
     * Bu üç ekran (panel · arama listesi · herkese açık künye) toplamı `players.score`tan
     * kendisi hesaplıyor; ittifak SIRALAMASI ise anlık görüntüde
     * `banned_at IS NULL AND alliance_score_excluded = false` süzüyor
     * (`ranking/ranking.service.ts` → `takeSnapshot`). Süzgeç burada YOKTU: yönetici bir hesabı
     * panelden ittifak puanından muaf tuttuğunda ekran bir sayı, sıralama başka bir sayı
     * gösteriyordu — hangisinin doğru olduğunu söylemenin de yolu yoktu.
     *
     * ⚠️ İfade `ranking.service.ts`teki **birebir aynısı**; iki yerde iki farklı biçimde
     * yazılırsa biri kaçınılmaz olarak bayatlar. ⚠️ Aşağıdaki ÜYE listesindeki tekil `m.score`
     * süzülmüyor ve süzülmemeli: o "bu üyenin puanı", takım toplamı değil.
     */
    const [a] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.id, a.name, a.text, a.leader_id, p.username AS leader_name,
             r.rank, r.prev_rank,
             (SELECT COUNT(*)::int FROM players m WHERE m.alliance_id = a.id) AS member_count,
             (SELECT COALESCE(SUM(m.score), 0) FROM players m
               WHERE m.alliance_id = a.id
                 AND m.banned_at IS NULL AND m.alliance_score_excluded = false) AS score
        FROM alliances a
        JOIN players p ON p.id = a.leader_id
        LEFT JOIN rankings r ON r.world_id = a.world_id AND r.kind = 'alliance' AND r.subject_id = a.id
       WHERE a.id = ${my.allianceId}
    `);
    if (!a) return { alliance: null, canFound: await this.service.canFound(player.playerId), pendingApplications: [] };

    const page = Math.max(0, Number(pageRaw ?? 0) | 0);
    const memberCount = Number(a['member_count']);
    /* Sıralama: rütbe (Lider üstte) → puan. Dünya sırası oyuncu sıralamasından (son snapshot). */
    const gameNow = await this.clock.gameNow(player.worldId);
    const members = await this.db.execute<Record<string, unknown>>(sql`
      SELECT m.id, m.username, m.score, m.alliance_role,
             (m.vacation_until IS NOT NULL) AS on_vacation,
             r.rank AS world_rank,
             -- ⭐ Askerî ünvan YALNIZ BURADA görünür (§ünvanlar). Süresi geçmiş satır tabloda
             -- kalıyor (temizleyen görev yok, bilerek) → burada süzülmek ZORUNDA.
             CASE WHEN m.merit_expires_at > ${gameNow.toISOString()}::timestamptz
                  THEN m.merit_tier END AS merit_tier,
             CASE WHEN m.merit_expires_at > ${gameNow.toISOString()}::timestamptz
                  THEN m.merit_expires_at END AS merit_expires_at
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
          /**
           * ⭐ §tatil modu — ekranda çevrimiçi/çevrimdışı YERİNE mavi «Tatilde» yazılıyor
           * (kullanıcı şartı).
           * ⚠️ `online` ile BİRLEŞTİRİLMEDİ, iki bağımsız alan kaldı: tatildeki oyuncu
           * teknik olarak bağlı olabilir (oyuna girip durumuna bakıyordur). Üçlü bir enum'a
           * sıkıştırsaydık "tatilde ve çevrimiçi" hâli temsil edilemez olurdu; hangisinin
           * gösterileceği sunucunun değil ekranın kararı.
           */
          onVacation: m['on_vacation'] === true,
          /**
           * ⭐ ASKERÎ ÜNVAN — **yalnız ittifak içinde** (kullanıcı şartı).
           *
           * ⚠️ Dünya, Sıralama, Arama ve savaş raporu uçlarına EKLENMEMELİ. Kullanıcının
           * gerekçesi stratejik: *"Bunu gören düşmanlar yakın zamanda büyük bir savaştan
           * çıktığını anlar ve sistematik olarak saldırı yaparlar."* Rozet bir başarı
           * göstergesi ama aynı zamanda "ordusu yeni kırıldı" istihbaratı.
           */
          meritTier: m['merit_tier'] == null ? null : Number(m['merit_tier']),
          meritExpiresAt: m['merit_expires_at'] == null
            ? null : toDate(m['merit_expires_at']).toISOString(),
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
             -- Süzgeç, /alliance ucundaki notun aynısı: toplam ittifak SIRALAMASIYLA eşit olmalı.
             (SELECT COALESCE(SUM(m.score), 0) FROM players m
               WHERE m.alliance_id = a.id
                 AND m.banned_at IS NULL AND m.alliance_score_excluded = false) AS score,
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

  /**
   * ⭐⭐ HERKESE AÇIK İTTİFAK KÜNYESİ (kullanıcı, 2026-08-09).
   *
   * *"Sıralamalar sayfasından veya arama sonucundan ittifakların üzerine tıklayınca açılan
   * modalde ittifak metni, lideri, kaç üyesi olduğu gibi detayları göstersin… başka bir
   * ittifağa üye olsak bile diğer ittifakların metinlerini görebilelim."*
   *
   * ⚠️⚠️ **İTTİFAK METNİ ARTIK HERKESE AÇIK — bilinçli bir gizlilik kararı.** Bugüne kadar
   * yalnız üyeler görüyordu. Metin bir tanıtım/duyuru alanı (*"scr_web06 üst kutusu"*), sır
   * değil; kapalı olması yeni oyuncunun hangi ittifağa başvuracağına karar vermesini
   * imkânsız kılıyordu. Yazan kişi de artık bunu bilerek yazsın diye `ModalNote` metni
   * güncellendi.
   *
   * ⚠️ **ÜYE LİSTESİ BURADAN SIZMAZ.** `mine` ucu üyeleri, çevrimiçilik durumunu ve askerî
   * ünvanları döndürüyor; üçü de **ittifak içi** bilgi (§ünvanlar: *"bunu gören düşmanlar
   * ordusunun yeni kırıldığını anlar"*). Bu uç yalnız TOPLAMLARI verir: kaç üye, kaç puan,
   * kaçıncı sıra, lider kim. Lider adı zaten sıralama ekranında görünüyor.
   */
  @Get('alliances/:id')
  async profile(@Req() req: AuthedRequest, @Param('id') idRaw: string): Promise<Record<string, unknown>> {
    const player = req.player!;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Geçersiz ittifak.');

    const [a] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT a.id, a.name, a.text, a.created_at, p.username AS leader_name,
             r.rank, r.prev_rank,
             (SELECT COUNT(*)::int FROM players m WHERE m.alliance_id = a.id) AS member_count,
             -- Süzgeç, /alliance ucundaki notun aynısı: toplam ittifak SIRALAMASIYLA eşit olmalı.
             (SELECT COALESCE(SUM(m.score), 0) FROM players m
               WHERE m.alliance_id = a.id
                 AND m.banned_at IS NULL AND m.alliance_score_excluded = false) AS score
        FROM alliances a
        JOIN players p ON p.id = a.leader_id
        LEFT JOIN rankings r ON r.world_id = a.world_id AND r.kind = 'alliance' AND r.subject_id = a.id
       WHERE a.id = ${id} AND a.world_id = ${player.worldId}
    `);
    if (!a) throw new NotFoundException('İttifak bulunamadı.');

    /**
     * ⭐ Başvuru düğmesinin görünürlüğü SUNUCUDAN geliyor, istemci karar vermiyor: kural
     * (`alliance.service.apply`) zaten burada yaşıyor ve iki yerde tutmak kaçınılmaz olarak
     * kayardı. `canApply` false ise `applyBlockedReason` niçinini söylüyor.
     */
    const my = await this.service.myMembership(player.playerId);
    const [pending] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM alliance_invites
       WHERE player_id = ${player.playerId} AND alliance_id = ${id}
         AND kind = 'application' AND status = 'pending'
    `);
    const alreadyApplied = pending != null;
    const isMine = my.allianceId === id;
    /**
     * ⭐ §verify — doğrulanmamış hesap başvuramaz, DÜĞMEYİ DE GÖRMEZ (kullanıcı, 2026-08-09).
     *
     * ⚠️ `apply()`teki kapı tek başına yeterdi ama yanlış anı seçerdi: oyuncu «Başvur»a basar,
     * bekler, sonra hatayı okurdu. Sebebi TIKLAMADAN ÖNCE söylemek bu ekranın zaten var olan
     * sözleşmesi ("sebep yazılıyor, düğme sessizce gizlenmiyor" — `AllianceModal.tsx`).
     *
     * ⚠️ Bu satır kapının YERİNE geçmiyor, önüne geçiyor: karar yine `apply()`te veriliyor.
     * Görünürlük istemciye bilgi verir; kuralı uygulayan yer sunucudaki kapıdır.
     */
    const verified = !unverifiedLimits().enabled || await isVerified(this.db as never, player.playerId);

    const rank = a['rank'] == null ? null : Number(a['rank']);
    const prevRank = a['prev_rank'] == null ? null : Number(a['prev_rank']);
    return {
      id: Number(a['id']),
      name: String(a['name']),
      text: String(a['text'] ?? ''),
      leader: String(a['leader_name']),
      memberCount: Number(a['member_count']),
      score: Number(a['score']),
      rank,
      rankChange: rank != null && prevRank != null ? prevRank - rank : null,
      foundedAt: toDate(a['created_at']).toISOString(),
      isMine,
      alreadyApplied,
      canApply: !isMine && my.allianceId == null && !alreadyApplied && verified,
      applyBlockedReason: isMine ? 'Zaten bu ittifaktasın.'
        : my.allianceId != null ? 'Başvurmak için önce mevcut ittifağından ayrılmalısın.'
          : alreadyApplied ? 'Başvurun zaten bekliyor.'
            : !verified ? UNVERIFIED_MESSAGE.alliance
              : null,
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
