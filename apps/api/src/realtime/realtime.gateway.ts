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
 * Bu gateway şu an istemciden HİÇBİR olay kabul etmiyor.
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
}

/** Oda adları tek yerde — elle string birleştirmek yalıtım hatasının en kolay yolu. */
const room = {
  player: (worldId: number, playerId: number): string => `w${worldId}:p${playerId}`,
  world: (worldId: number): string => `w${worldId}:world`,
  alliance: (worldId: number, allianceId: number): string => `w${worldId}:a${allianceId}`,
};

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

    socket.on('disconnect', () => this.markOnline(p, -1));
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
   * Olayı odalara dağıtır.
   *
   * ⚠️ `worldId` YOKSA hiçbir şey gönderilmez. Oda adı dünya kimliğinden kuruluyor; onsuz
   * "oyuncunun bütün dünyalarına gönder" demek zorunda kalırdık ve bu, dünya yalıtımını
   * (§13.12.1b) sessizce delerdi. Olayı düşürmek doğrusu: outbox zaten kalıcı kaydı tutuyor.
   */
  private dispatch(event: RealtimeEvent): void {
    if (!this.io || event.worldId == null) return;
    const body = { topic: event.topic, ref: event.ref ?? {} };

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
