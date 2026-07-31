/**
 * ⭐ WEBSOCKET GATEWAY (socket.io) — SİSTEM PLANI §7, §13.12.3
 *
 * Üç iş yapar:
 *   1. **Oyun olaylarını anında iletir** (Ordular ekranı, mesaj rozeti) — `RealtimeBus`'tan gelir.
 *   2. **Çevrimiçi durumu** tutar — ⚠️ yalnız İTTİFAK ÜYELERİ arasında görünür (kullanıcı kuralı:
 *      "başka hiçbir yerden hiçbir oyuncunun online durumu kontrol edilemez").
 *   3. Genel Sohbet'in taşıyıcısı olacak (§13.12) — odalar hazır.
 *
 * ⚠️ **DÜNYA YALITIMI (§13.12.1b) — pazarlıksız.** `worldId` el sıkışma yükünden ASLA okunmaz,
 * **imzalı access token'dan** gelir; oda adları `w{worldId}:` ile başlar. Böylece "başka dünyanın
 * odasına yaz" saldırısı soket katmanına hiç ulaşamaz.
 *
 * ⚠️ **İstemci→sunucu tek istisna sohbettir** (§13.12.3): oyun durumu WS üzerinden DEĞİŞTİRİLEMEZ.
 * 2026-07-31'de kabul edilen ÜÇ olay bu kuralı bozmuyor — hiçbiri kalıcı durum yazmaz:
 *   `chat:open` / `chat:close` → yalnız oda katılımı · `chat:typing` → yalnız yayın.
 * Mesaj GÖNDERME ve okundu işaretleme REST'te kaldı (token tazeliği + bu değişmez).
 */
import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { TokenService } from '../auth/token.service.ts';
import type { RealtimeBus, RealtimeEvent } from './realtime.bus.ts';

interface SocketPlayer {
  playerId: number;
  worldId: number;
  accountId: number;
  allianceId: number | null;
  /**
   * ⭐ Oturum kimliği soket üstünde TAŞINIR (§admin Faz 3): oyuncu başka bir cihazdan
   * "bu cihazı çıkar" dediğinde iptal edilen oturumun soketini bulup düşürebilmek için.
   * Sokete yalnız `playerId` yazsaydık aynı oyuncunun TÜM sekmelerini düşürmek zorunda
   * kalırdık — oysa iptal edilen tek bir cihazdır.
   */
  sessionId: string;
}

/** Oda adları tek yerde — elle string birleştirmek yalıtım hatasının en kolay yolu. */
const room = {
  player: (worldId: number, playerId: number): string => `w${worldId}:p${playerId}`,
  world: (worldId: number): string => `w${worldId}:world`,
  alliance: (worldId: number, allianceId: number): string => `w${worldId}:a${allianceId}`,
  /**
   * ⭐ Sohbet odası — YALNIZ "yazıyor…" için (2026-07-31). Mesajın kendisi bu odadan GEÇMEZ;
   * o, iki tarafın KİŞİSEL odasına gider ki pencere kapalıyken de rozet düşsün.
   */
  chat: (worldId: number, channelId: number): string => `w${worldId}:chat:${channelId}`,
};

/**
 * Soket başına olay kovası — kötü niyetli bir istemci `chat:open` yağmuruyla adapter'ı
 * hırpalamasın. Aşan olay SESSİZCE yutulur (hata döndürmek saldırganı bilgilendirir).
 */
class EventGate {
  private hits: number[] = [];
  allow(limit = 20, windowMs = 10_000): boolean {
    const now = Date.now();
    this.hits = this.hits.filter((t) => now - t < windowMs);
    if (this.hits.length >= limit) return false;
    this.hits.push(now);
    return true;
  }
}

export class RealtimeGateway {
  private io: Server | null = null;
  /** playerId → açık soket sayısı (aynı oyuncu iki sekmede olabilir). */
  private readonly online = new Map<number, number>();

  constructor(
    private readonly db: Db,
    private readonly tokens: TokenService,
    private readonly bus: RealtimeBus,
  ) {}

  async attach(httpServer: HttpServer): Promise<void> {
    const io = new Server(httpServer, {
      path: '/ws',
      // Aynı köken (dev'de Vite proxy, üretimde nginx) → CORS gerekmiyor.
      cors: { origin: false },
      // İstemci yeniden bağlanırken kısa kesintide oturumu koruyabilsin.
      connectionStateRecovery: { maxDisconnectionDuration: 60_000 },
    });
    this.io = io;

    // ⭐ Kimlik doğrulama EL SIKIŞMADA: doğrulanmamış soket hiçbir odaya giremez.
    io.use(async (socket, next) => {
      try {
        const raw = String(socket.handshake.auth?.['token'] ?? '');
        if (!raw) throw new Error('token yok');
        const claims = await this.tokens.verifyAccess(raw);

        // Access token durumsuzdur → oturum iptali ayrıca kontrol edilir (guard ile aynı kural).
        const rows = await this.db.execute<Record<string, unknown>>(sql`
          SELECT 1 FROM sessions
           WHERE id = ${claims.sid}::uuid AND revoked_at IS NULL AND expires_at > now()
        `);
        if (rows.length === 0) throw new Error('oturum kapalı');

        const pRows = await this.db.execute<Record<string, unknown>>(sql`
          SELECT alliance_id FROM players WHERE id = ${claims.pid}
        `);
        const player: SocketPlayer = {
          playerId: claims.pid,
          worldId: claims.wid,
          accountId: Number(claims.sub),
          allianceId: pRows[0]?.['alliance_id'] == null ? null : Number(pRows[0]['alliance_id']),
          sessionId: claims.sid,
        };
        (socket.data as { player?: SocketPlayer }).player = player;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });

    io.on('connection', (socket) => this.onConnect(socket));

    // Veri yolundan gelen her olay ilgili odalara dağıtılır.
    await this.bus.subscribe((event) => this.dispatch(event));
  }

  private onConnect(socket: Socket): void {
    const p = (socket.data as { player?: SocketPlayer }).player;
    if (!p) { socket.disconnect(true); return; }

    void socket.join(room.player(p.worldId, p.playerId));
    void socket.join(room.world(p.worldId));
    if (p.allianceId != null) void socket.join(room.alliance(p.worldId, p.allianceId));

    this.markOnline(p, +1);
    socket.emit('ready', { playerId: p.playerId, worldId: p.worldId });

    /* ── SOHBET (§13.12.3) — üçü de yalnız oda/yayın işi, kalıcı durum yazmaz ───────── */
    const gate = new EventGate();
    socket.on('chat:open', (raw: unknown, ack?: (r: unknown) => void) => {
      void this.onChatOpen(socket, p, gate, raw, ack);
    });
    socket.on('chat:close', () => this.leaveChat(socket, p));
    socket.on('chat:typing', (raw: unknown) => {
      if (!gate.allow()) return;
      const channelId = Number((raw as { channelId?: unknown })?.channelId ?? 0);
      // Yalnız AÇIK olduğu kanala yazıyor bildirimi gönderebilir (oda dışına sızmaz).
      if (!Number.isInteger(channelId) || socket.data.chatChannelId !== channelId) return;
      socket.to(room.chat(p.worldId, channelId)).emit('chat:typing', { channelId, playerId: p.playerId });
    });

    socket.on('disconnect', () => this.markOnline(p, -1));
  }

  /**
   * Sohbet penceresi açıldı: kanal odasına katıl.
   *
   * ⚠️ Yetki HER açılışta yeniden doğrulanır (§13.12.3) — soket ömrü uzun, üyelik değişebilir.
   * ⚠️ Önce ESKİ kanaldan çıkılır: kullanıcı kuralı "aynı anda yalnız tek kişiyle sohbet",
   *    sunucu da bunu zorlar (istemciye güvenilmez).
   */
  private async onChatOpen(
    socket: Socket, p: SocketPlayer, gate: EventGate, raw: unknown, ack?: (r: unknown) => void,
  ): Promise<void> {
    if (!gate.allow()) return;
    const channelId = Number((raw as { channelId?: unknown })?.channelId ?? 0);
    if (!Number.isInteger(channelId) || channelId <= 0) { ack?.({ ok: false }); return; }

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM chat_participants pt JOIN chat_channels c ON c.id = pt.channel_id
       WHERE pt.channel_id = ${channelId} AND pt.player_id = ${p.playerId} AND c.world_id = ${p.worldId}
    `);
    if (rows.length === 0) { ack?.({ ok: false }); return; }

    this.leaveChat(socket, p);
    await socket.join(room.chat(p.worldId, channelId));
    socket.data.chatChannelId = channelId;
    ack?.({ ok: true });
  }

  private leaveChat(socket: Socket, p: SocketPlayer): void {
    const open = socket.data.chatChannelId as number | undefined;
    if (open) void socket.leave(room.chat(p.worldId, open));
    socket.data.chatChannelId = undefined;
  }

  /**
   * Çevrimiçi sayacı. Aynı oyuncunun iki sekmesi varsa biri kapanınca "çevrimdışı" DENMEZ —
   * sayaç sıfıra inince denir.
   *
   * ⚠️ Duyuru YALNIZ ittifak odasına gider. İttifakı yoksa hiç kimseye gitmez: oyuncunun çevrimiçi
   * olduğu bilgisi ittifak dışına sızmaz (kullanıcı kuralı).
   */
  private markOnline(p: SocketPlayer, delta: number): void {
    const before = this.online.get(p.playerId) ?? 0;
    const after = Math.max(0, before + delta);
    if (after === 0) this.online.delete(p.playerId);
    else this.online.set(p.playerId, after);

    const changed = (before > 0) !== (after > 0);
    if (!changed || p.allianceId == null) return;

    this.io?.to(room.alliance(p.worldId, p.allianceId)).emit('presence:update', {
      playerId: p.playerId,
      online: after > 0,
    });
  }

  /** Bir oyuncu şu an bağlı mı? (İttifak ekranı bunu sorar.) */
  isOnline(playerId: number): boolean {
    return (this.online.get(playerId) ?? 0) > 0;
  }

  /**
   * ⭐ ÜYELİK DEĞİŞTİ → soket odaları senkronu (§13.12 kuralı: *"ittifaktan atılan oyuncunun
   * açık soketi anında düşer"*). El sıkışmada okunan `allianceId` soket ömrü boyunca donuktu;
   * bu metot kick/ayrıl/katıl/dağıt anında ittifak controller'ından çağrılır:
   *   • eski ittifak odasından `leave` + oradakilere "çevrimdışı" presence'ı (üye artık listede
   *     görünmeyecek ama açık kalmış istemciler eski listeyi tazeleyene kadar yeşil görmesin),
   *   • yeni odaya `join` + oradakilere "çevrimiçi" presence'ı.
   */
  setMembership(playerId: number, allianceId: number | null): void {
    if (!this.io) return;
    for (const [, socket] of this.io.of('/').sockets) {
      const p = (socket.data as { player?: SocketPlayer }).player;
      if (!p || p.playerId !== playerId) continue;
      const oldAlliance = p.allianceId;
      if (oldAlliance === allianceId) continue;

      if (oldAlliance != null) {
        void socket.leave(room.alliance(p.worldId, oldAlliance));
        this.io.to(room.alliance(p.worldId, oldAlliance))
          .emit('presence:update', { playerId, online: false });
      }
      p.allianceId = allianceId;
      if (allianceId != null) {
        void socket.join(room.alliance(p.worldId, allianceId));
        this.io.to(room.alliance(p.worldId, allianceId))
          .emit('presence:update', { playerId, online: true });
      }
    }
  }

  /**
   * ⭐ OTURUM İPTAL EDİLDİ (§admin Faz 3) — o oturuma ait açık soketleri **anında** düşürür.
   *
   * ⚠️ Bugüne kadar iptal edilen bir oturumun soketi ancak token yenilenirken (15 dakikaya
   * kadar) fark ediyordu. HTTP tarafı zaten anında ölüyordu (`AuthGuard` her istekte
   * `revoked_at`e bakıyor) ama soket açık kaldığı için oyuncu olayları almaya devam ediyordu —
   * "telefonumu çıkardım ama hâlâ bildirim geliyor" tam olarak bu.
   *
   * ⚠️ Önce **olay**, sonra `disconnect`: istemci kopmayı ağ arızasından ayırabilsin ve yeniden
   * bağlanmayı denemek yerine giriş ekranına dönsün. Sırayı ters kursaydık istemci sonsuz
   * yeniden bağlanma döngüsüne girerdi.
   */
  revokeSessions(sessionIds: readonly string[]): number {
    if (!this.io || sessionIds.length === 0) return 0;
    const targets = new Set(sessionIds);
    let closed = 0;
    for (const [, socket] of this.io.of('/').sockets) {
      const p = (socket.data as { player?: SocketPlayer }).player;
      if (!p || !targets.has(p.sessionId)) continue;
      socket.emit('session:revoked', { reason: 'revoked' });
      socket.disconnect(true);
      closed++;
    }
    return closed;
  }

  /**
   * Olayı odalara dağıtır.
   *
   * ⚠️ `worldId` YOKSA hiçbir şey gönderilmez. Oda adı dünya kimliğinden kuruluyor; onsuz
   * "oyuncunun bütün dünyalarına gönder" demek zorunda kalırdık ve bu, dünya yalıtımını
   * (§13.12.1b) sessizce delerdi. Olayı düşürmek doğrusu: outbox zaten kalıcı kaydı tutuyor.
   */
  private dispatch(event: RealtimeEvent): void {
    if (!this.io || event.worldId == null) return;
    const body = { topic: event.topic, ref: event.ref ?? {} };

    // ⭐ İttifak odası: üyeler tek yayında; playerIds ayrıca bireysel gider (oda dışı kalanlar).
    if (event.allianceId != null) {
      this.io.to(room.alliance(event.worldId, event.allianceId)).emit(event.topic, body);
      for (const playerId of event.playerIds) {
        this.io.to(room.player(event.worldId, playerId)).emit(event.topic, body);
      }
      return;
    }

    if (event.playerIds.length === 0) {
      this.io.to(room.world(event.worldId)).emit(event.topic, body);
      return;
    }
    for (const playerId of event.playerIds) {
      this.io.to(room.player(event.worldId, playerId)).emit(event.topic, body);
    }
  }

  async close(): Promise<void> {
    await this.bus.stop();
    await new Promise<void>((resolve) => {
      if (!this.io) return resolve();
      this.io.close(() => resolve());
    });
    this.io = null;
  }
}
