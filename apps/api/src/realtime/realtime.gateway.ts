/**
 * ⭐ WEBSOCKET GATEWAY (socket.io) — SİSTEM PLANI §7, §13.12.3
 *
 * Üç iş yapar:
 *   1. **Oyun olaylarını anında iletir** (Ordular ekranı, mesaj rozeti) — `RealtimeBus`'tan gelir.
 *   2. **Çevrimiçi durumu** tutar — ⚠️ yalnız İTTİFAK ÜYELERİ arasında görünür (kullanıcı kuralı:
 *      "başka hiçbir yerden hiçbir oyuncunun online durumu kontrol edilemez").
 *   3. **Sohbet odalarını** taşır — DM, ittifak ve (2026-08-10'dan beri) Genel Sohbet.
 *
 * ⚠️ **DÜNYA YALITIMI (§13.12.1b) — pazarlıksız.** `worldId` el sıkışma yükünden ASLA okunmaz,
 * **imzalı access token'dan** gelir; oda adları `w{worldId}:` ile başlar. Böylece "başka dünyanın
 * odasına yaz" saldırısı soket katmanına hiç ulaşamaz.
 *
 * ⚠️ **İstemci→sunucu tek istisna sohbettir** (§13.12.3): oyun durumu WS üzerinden DEĞİŞTİRİLEMEZ.
 * 2026-07-31'de kabul edilen ÜÇ olay bu kuralı bozmuyor — hiçbiri kalıcı durum yazmaz:
 *   `chat:open` / `chat:close` → yalnız oda katılımı · `chat:typing` → yalnız yayın.
 * Mesaj GÖNDERME ve okundu işaretleme REST'te kaldı (token tazeliği + bu değişmez).
 * ⚠️ İttifak (`alliance:chat:*`) ve genel sohbet (`global:chat:*`) çiftleri aynı sözleşmeye
 * uyuyor; her birinin **ayrı bir `socket.data` slotu** var çünkü üç pencere aynı anda açık
 * olabilir ve tek slot birini diğerinin odasından atardı.
 */
import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { TokenService } from '../auth/token.service.ts';
import type { PresenceService } from '../auth/presence.service.ts';
import { claimGraceSeconds, singleDeviceEnforced } from '../auth/presence.service.ts';
import { globalChatLimits } from '../chat/global-chat.limits.ts';
import type { RealtimeBus, RealtimeEvent } from './realtime.bus.ts';

interface SocketPlayer {
  playerId: number;
  worldId: number;
  accountId: number;
  allianceId: number | null;
  /**
   * ⭐ Genel sohbetin «kim yazıyor» şeridi için (2026-08-10). El sıkışmada ZATEN atılan
   * sorguya bir kolon eklendi; alternatif her tuş vuruşunda ad çözmekti.
   *
   * ⚠️ Ad soket ömrü boyunca donuk — ama kullanıcı adı **değiştirilemez** (`name-rules.ts`),
   * yani `allianceId`nin aksine bayatlayamaz.
   */
  username: string;
  /**
   * ⭐ Oturum kimliği soket üstünde TAŞINIR (§admin Faz 3): oyuncu başka bir cihazdan
   * "bu cihazı çıkar" dediğinde iptal edilen oturumun soketini bulup düşürebilmek için.
   * Sokete yalnız `playerId` yazsaydık aynı oyuncunun TÜM sekmelerini düşürmek zorunda
   * kalırdık — oysa iptal edilen tek bir cihazdır.
   */
  sessionId: string;
  /**
   * ⭐ Tek cihaz kuralının sekme düzeyindeki ayracı. `sessionId` YETMEZ: aynı tarayıcının iki
   * sekmesi aynı oturumu paylaşır, ayırt edilemezler.
   */
  instanceId: string;
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
    private readonly presence: PresenceService,
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
          SELECT alliance_id, username FROM players WHERE id = ${claims.pid}
        `);
        const rawInstance = String(socket.handshake.auth?.['instanceId'] ?? '').trim();
        const player: SocketPlayer = {
          playerId: claims.pid,
          worldId: claims.wid,
          accountId: Number(claims.sub),
          allianceId: pRows[0]?.['alliance_id'] == null ? null : Number(pRows[0]['alliance_id']),
          username: String(pRows[0]?.['username'] ?? ''),
          sessionId: claims.sid,
          instanceId: rawInstance && rawInstance.length <= 64 ? rawInstance : `s:${claims.sid}`,
        };

        /**
         * ⭐ TEK CİHAZ KURALI — sahipliğin ASIL sahibi burası (kullanıcı, 2026-08-03).
         *
         * Neden HTTP değil soket: soket koptuğu an sahiplik BIRAKILIYOR. Yalnız HTTP'ye
         * dayansaydık tarayıcısını kapatan oyuncunun sahipliği zaman aşımı dolana kadar
         * (90 sn) asılı kalırdı ve kendi hesabına dönemezdi.
         *
         * ⚠️ Reddetme sebebi istemciye AÇIK gönderiliyor (`session_conflict`): socket.io'nun
         * genel `unauthorized` hatasıyla karışsaydı istemci "jetonum bozuk" sanıp sonsuz
         * yeniden bağlanma döngüsüne girerdi — oysa yapması gereken modalı açmak.
         */
        /**
         * ⚠️⚠️ **`platform` GEÇİLMEK ZORUNDA** (2026-08-16). Bu satır yokken soket, girişten
         * hemen sonra sahipliği alıyor ve `claim` platformu `excluded.platform` ile, yani
         * **NULL** ile eziyordu — `AuthGuard`ın az önce yazdığı `'web'` siliniyordu. Sonuç
         * çakışma modalının metninde görülüyordu: *"Bu hesap zaten açık"*, nerede olduğu
         * asla yazmıyordu. Canlı ölçüm: 25 sahiplik satırının 10'unda platform boş.
         * ⚠️ El sıkışma yükünden okunuyor, HTTP başlığından değil: soketin başlığı yok.
         */
        const rawPlatform = String(socket.handshake.auth?.['platform'] ?? '').trim();
        const platform = rawPlatform === 'web' || rawPlatform === 'android' || rawPlatform === 'ios'
          ? rawPlatform
          : null;

        if (singleDeviceEnforced()) {
          const res = await this.presence.claim({
            accountId: player.accountId,
            sessionId: player.sessionId,
            instanceId: player.instanceId,
            worldId: player.worldId,
            platform,
          });
          if (!res.ok) { next(new Error('session_conflict')); return; }
          if (res.previous) this.kickInstance(player.accountId, res.previous.instanceId);
        }

        (socket.data as { player?: SocketPlayer }).player = player;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });

    io.on('connection', (socket) => this.onConnect(socket));

    /* ⭐ Sahiplik nabzı — bağlı soketin damgasını taze tutar. Gerekçe metodun yorumunda. */
    this.startPresenceHeartbeat();

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

    /* ── İTTİFAK SOHBETİ (§13.15c) — AYRI olay çifti, AYRI slot ────────────────
     *
     * ⚠️ `chat:open`/`chat:close` YENİDEN KULLANILAMAZDI: `socket.data.chatChannelId` TEK
     * değer tutuyor ve `onChatOpen` önce eski kanaldan çıkıyor. DM penceresi ve ittifak
     * sheet'i aynı anda açık olabilir — ortak slot biri diğerini odadan atardı. Ayrıca
     * yetki sorgusu da farklı: ittifakta katılımcı satırı yok, üyelik `players`tan geliyor. */
    socket.on('alliance:chat:open', (raw: unknown, ack?: (r: unknown) => void) => {
      void this.onAllianceChatOpen(socket, p, gate, raw, ack);
    });
    socket.on('alliance:chat:close', () => this.leaveAllianceChat(socket, p));

    /* ── GENEL SOHBET (§13.12) — ÜÇÜNCÜ olay çifti, ÜÇÜNCÜ slot ────────────────
     *
     * ⚠️ İlk iki çift YENİDEN KULLANILAMAZ: her slot TEK değer tutuyor ve açılışta önce eski
     * kanaldan çıkılıyor. Oyuncu aynı anda bir DM penceresi, ittifak sheet'i ve genel sohbet
     * kartı açık tutabilir — ortak slot ikisini birbirinin odasından atardı. */
    socket.on('global:chat:open', (raw: unknown, ack?: (r: unknown) => void) => {
      void this.onGlobalChatOpen(socket, p, gate, raw, ack);
    });
    socket.on('global:chat:close', () => {
      const open = socket.data.globalChatChannelId as number | undefined;
      this.leaveGlobalChat(socket, p);
      if (open) this.emitGlobalPresence(p.worldId, open);
    });
    /**
     * «Yazıyor…» — odadaki HERKESE gider (DM'de yalnız karşı tarafa gidiyordu).
     *
     * ⚠️ Ad **soketten** okunuyor: genel sohbette roster yok, istemci id'yi ada çeviremezdi.
     * ⚠️ `typingEnabled` kapalıysa olay sessizce yutulur — kullanıcı şartı *"gerçekten ek yük
     * getirmeyecekse yapalım"*ın kill-switch'i. Yayının kendisi DB'ye hiç inmiyor.
     */
    socket.on('global:chat:typing', () => {
      if (!gate.allow()) return;
      if (!globalChatLimits().typingEnabled) return;
      const channelId = socket.data.globalChatChannelId as number | undefined;
      if (!channelId) return;
      socket.to(room.chat(p.worldId, channelId))
        .emit('global:chat:typing', { playerId: p.playerId, username: p.username });
    });

    socket.on('chat:typing', (raw: unknown) => {
      if (!gate.allow()) return;
      const channelId = Number((raw as { channelId?: unknown })?.channelId ?? 0);
      // Yalnız AÇIK olduğu kanala yazıyor bildirimi gönderebilir (oda dışına sızmaz).
      if (!Number.isInteger(channelId) || socket.data.chatChannelId !== channelId) return;
      socket.to(room.chat(p.worldId, channelId)).emit('chat:typing', { channelId, playerId: p.playerId });
    });

    /**
     * ⚠️ **`disconnecting`, `disconnect` DEĞİL.** socket.io `disconnect` anında soketi bütün
     * odalardan çıkarmış oluyor; sayacı orada hesaplasaydık kopan kişi hâlâ sayılırdı ve
     * "3 kişi bağlı" yazısı biri çıktıktan sonra da 3 kalırdı. `disconnecting` odalar hâlâ
     * doluyken çalışıyor, o yüzden sayıyı **bu soketi düşerek** hesaplıyoruz.
     */
    socket.on('disconnecting', () => {
      const open = socket.data.globalChatChannelId as number | undefined;
      if (open) this.emitGlobalPresence(p.worldId, open, socket.id);
    });

    socket.on('disconnect', () => {
      this.markOnline(p, -1);
      /**
       * ⭐ Sahipliği BIRAK — ama yalnız bu hesabın bu örneğine ait BAŞKA soket kalmadıysa.
       * Aynı sekme kısa bir ağ kesintisinde yeniden bağlanırken iki soket bir an üst üste
       * binebiliyor; koşulsuz silmek yeni soketin az önce aldığı sahipliği düşürürdü.
       * ⚠️ `release` KENDİ örneğinden başkasına dokunmuyor: devralınmışsa yeni sahibin satırı
       * korunur.
       */
      if (!this.hasOtherSocket(p, socket.id)) {
        void this.presence.release(p.accountId, p.instanceId).catch(() => { /* önemsiz */ });
      }
    });
  }

  /** Bu hesabın bu örneğine ait, verilen soketten BAŞKA açık soket var mı? */
  private hasOtherSocket(p: SocketPlayer, exceptId: string): boolean {
    if (!this.io) return false;
    for (const [id, s] of this.io.of('/').sockets) {
      if (id === exceptId) continue;
      const q = (s.data as { player?: SocketPlayer }).player;
      if (q && q.accountId === p.accountId && q.instanceId === p.instanceId) return true;
    }
    return false;
  }

  /**
   * ⭐ DEVRALINDI — eski örneğin soketlerini düşür.
   *
   * ⚠️ Önce **olay**, sonra `disconnect` (`revokeSessions` ile aynı gerekçe): istemci kopmayı
   * ağ arızasından ayırabilsin ve yeniden bağlanmaya çalışmak yerine modalını açsın.
   */
  kickInstance(accountId: number, instanceId: string): number {
    if (!this.io) return 0;
    let closed = 0;
    for (const [, socket] of this.io.of('/').sockets) {
      const q = (socket.data as { player?: SocketPlayer }).player;
      if (!q || q.accountId !== accountId || q.instanceId !== instanceId) continue;
      socket.emit('session:takeover', { reason: 'takeover' });
      socket.disconnect(true);
      closed++;
    }
    return closed;
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
   * İttifak sohbeti sheet'i açıldı: kanal odasına katıl (§13.15c).
   *
   * ⚠️ **Mesajın kendisi bu odadan akıyor** — DM'in aksine. DM'de mesaj iki tarafın kişisel
   * odasına gider ki pencere kapalıyken de rozet düşsün; ittifak sohbetinde rozet YOK
   * (kullanıcı kararı: kapalıyken tam sessizlik), dolayısıyla oda dışına çıkacak bir şey de yok.
   *
   * ⚠️ Yetki HER açılışta yeniden doğrulanır: soket ömrü uzun, üyelik değişir. Katılımcı
   * satırına değil `players.alliance_id`ye bakıyor — ittifak kanalının tek doğruluk kaynağı o.
   */
  private async onAllianceChatOpen(
    socket: Socket, p: SocketPlayer, gate: EventGate, raw: unknown, ack?: (r: unknown) => void,
  ): Promise<void> {
    if (!gate.allow()) return;
    const channelId = Number((raw as { channelId?: unknown })?.channelId ?? 0);
    if (!Number.isInteger(channelId) || channelId <= 0) { ack?.({ ok: false }); return; }

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM chat_channels c
        JOIN players pl ON pl.alliance_id = c.alliance_id
       WHERE c.id = ${channelId} AND c.world_id = ${p.worldId} AND c.kind = 'alliance'
         AND pl.id = ${p.playerId}
    `);
    if (rows.length === 0) { ack?.({ ok: false }); return; }

    this.leaveAllianceChat(socket, p);
    await socket.join(room.chat(p.worldId, channelId));
    socket.data.allianceChatChannelId = channelId;
    ack?.({ ok: true });
  }

  /** ⚠️ DM slotuna DOKUNMAZ — iki sohbet aynı anda açık kalabilmeli. */
  private leaveAllianceChat(socket: Socket, p: SocketPlayer): void {
    const open = socket.data.allianceChatChannelId as number | undefined;
    if (open) void socket.leave(room.chat(p.worldId, open));
    socket.data.allianceChatChannelId = undefined;
  }

  /**
   * Genel sohbete BAĞLANILDI: kanal odasına katıl (§13.12).
   *
   * ⚠️ **Üyelik sorgusu YOK** — ittifak/DM'in aksine. Genel kanalda "üye olmak" o dünyada
   * oyuncu olmak demek ve `worldId` zaten imzalı jetondan geliyor. Doğrulanan tek şey kanalın
   * gerçekten **bu dünyanın genel kanalı** olduğu: aksi hâlde istemci uydurduğu bir id ile
   * başka bir ittifağın odasına girebilirdi.
   *
   * ⚠️ **`enabled` HER AÇILIŞTA yeniden bakılıyor.** Panelden kapatıldığı anda ekranda açık
   * kalmış istemciler var; onlar yeniden bağlanınca odaya dönmemeli, yoksa özellik "kapalı"
   * görünürken bir avuç istemci arasında çalışmaya devam ederdi.
   */
  private async onGlobalChatOpen(
    socket: Socket, p: SocketPlayer, gate: EventGate, raw: unknown, ack?: (r: unknown) => void,
  ): Promise<void> {
    if (!gate.allow()) return;
    if (!globalChatLimits().enabled) { ack?.({ ok: false }); return; }
    const channelId = Number((raw as { channelId?: unknown })?.channelId ?? 0);
    if (!Number.isInteger(channelId) || channelId <= 0) { ack?.({ ok: false }); return; }

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM chat_channels
       WHERE id = ${channelId} AND world_id = ${p.worldId} AND kind = 'global'
    `);
    if (rows.length === 0) { ack?.({ ok: false }); return; }

    this.leaveGlobalChat(socket, p);
    await socket.join(room.chat(p.worldId, channelId));
    socket.data.globalChatChannelId = channelId;
    ack?.({ ok: true });
    this.emitGlobalPresence(p.worldId, channelId);
  }

  /** ⚠️ DM ve ittifak slotlarına DOKUNMAZ — üçü aynı anda açık kalabilmeli. */
  private leaveGlobalChat(socket: Socket, p: SocketPlayer): void {
    const open = socket.data.globalChatChannelId as number | undefined;
    if (open) void socket.leave(room.chat(p.worldId, open));
    socket.data.globalChatChannelId = undefined;
  }

  /**
   * ⭐ «Şu an kaç kişi bağlı» — odadaki **tekil oyuncu** sayısı, odaya yayınlanır.
   *
   * ⚠️ Soket değil OYUNCU sayılıyor: aynı kişinin iki sekmesi "2 kişi" demek olurdu.
   * ⚠️ Yalnız katılma/ayrılma anında hesaplanıyor — mesaj başına değil. Maliyet
   * `O(odadaki soket)` ve seyrek.
   * ⚠️ **Süreç-yerel** (`onlinePlayerIds` ile aynı sınır): çok süreçli dağıtımda her süreç
   * yalnız kendi soketlerini görür. Tek süreçli profilde (§4.0 `ROLE=all`) doğru.
   *
   * @param exceptSocketId `disconnecting` sırasında kopan soket — henüz odada, sayılmamalı.
   */
  private emitGlobalPresence(worldId: number, channelId: number, exceptSocketId?: string): void {
    if (!this.io) return;
    const name = room.chat(worldId, channelId);
    const ids = this.io.of('/').adapter.rooms.get(name);
    const players = new Set<number>();
    for (const id of ids ?? []) {
      if (id === exceptSocketId) continue;
      const q = (this.io.of('/').sockets.get(id)?.data as { player?: SocketPlayer } | undefined)
        ?.player;
      if (q) players.add(q.playerId);
    }
    this.io.to(name).emit('global:chat:presence', { count: players.size });
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
   * ⭐ ŞU AN BAĞLI OLAN HERKES (§panel 2. nesil) — yönetim panelinin "çevrimiçi oyuncular"
   * listesi bunu okuyor.
   *
   * ⚠️ `isOnline`'ı liste için oyuncu oyuncu çağırmak da mümkündü; tek çağrıda dönmesinin
   * sebebi performans değil **tutarlılık**: 50 ayrı çağrı arasında biri bağlanıp kopabilir ve
   * liste kendi içinde çelişkili çıkardı.
   *
   * ⚠️ Bilgi SÜREÇ-YEREL: yalnız bu sürecin soketlerini bilir. `ROLE=worker` profilinde
   * `getGateway()` daima `null` → çağıran taraf "boş liste" ile "bilinmiyor"u ayırmak zorunda
   * (panel bunu `onlineKnown` bayrağıyla yapıyor).
   */
  onlinePlayerIds(): number[] {
    return [...this.online.keys()];
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

      /**
       * ⚠️⚠️ **GİZLİLİK KAPISI (§13.15c).** Atılan/ayrılan üyenin İTTİFAK SOHBETİ odası da
       * kapatılmalı. Yalnız ittifak odasından düşürmek YETMİYOR: sheet'i açık kalan eski üye,
       * REST'ten mesaj okuyamasa bile "şu an konuşuluyor" olayını almaya devam ederdi ve her
       * olayda bir tazeleme isteği atıp 403 alırdı — yani ittifağın hâlâ yazıştığını görürdü.
       *
       * ⚠️ Yeni ittifağa geçişte de çalışıyor (koşul `oldAlliance !== allianceId`): eski
       * kanalın odasında kalmak yeni ittifaka geçmiş bir üyeye eskisini dinletirdi.
       */
      this.leaveAllianceChat(socket, p);

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

    /**
     * ⭐⭐ SOHBET KANALI ODASI — **BU DAL EN ÖNDE VE `return` İLE BİTMEK ZORUNDA.**
     *
     * İttifak sohbeti olayları `playerIds: []` ile geliyor (bilerek: alıcı listesi oda
     * üyeliğinden çıkıyor). Aşağıdaki `if (event.playerIds.length === 0)` dalı ise **DÜNYA
     * GENELİ** yayın yapıyor. Bu dal düşerse ya da `return`ü kaybederse ittifağın özel
     * sohbeti tüm dünyaya yayınlanır — tasarımın tek gerçek felaket riski.
     *
     * ⚠️ Odaya YALNIZ sheet açıkken katılınıyor (`alliance:chat:open`), yani kapalı olan
     * üyeye hiçbir şey gitmiyor. "Kapalıyken tam sessizlik" şartı bir bayrağa değil oda
     * üyeliğine dayanıyor.
     */
    if (event.chatChannelId != null) {
      this.io.to(room.chat(event.worldId, event.chatChannelId)).emit(event.topic, body);
      return;
    }

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

  /**
   * ⭐⭐ SAHİPLİK NABZI — bağlı her soketin sahiplik damgasını taze tutar (2026-08-16).
   *
   * ⚠️⚠️ **Bu olmadan bağlı bir istemci sahipliğini SESSİZCE kaybediyordu.** Sahiplik
   * `account_presence.seen_at` üzerinden yaşıyor ve o damgayı yenileyen tek yer `AuthGuard`dı:
   * yani **yalnız HTTP isteği atınca**. Soket sahipliği bir kez alıyor ve bir daha ona hiç
   * dokunmuyordu.
   *
   * Rakamlar çelişiyordu: sahiplik `claimGraceSeconds` = **90 sn**'de düşüyor, ama soketi
   * SAĞLAM olan bir web istemcisinin emniyet ağı yoklaması **5 dakikada bir** dönüyor
   * (`queries.ts` → `WS_IDLE_MS`). Yani ekranda oturan, soketi bağlı, gayet canlı bir oyuncu
   * 90 saniye sonra "sahipsiz" görünüyordu. Kimse gelmezse fark edilmiyor (bir sonraki isteği
   * sahipliği geri alıyor); ama araya bir kopya girerse **oynayan oyuncu kapıyı yiyordu.**
   *
   * ⚠️ Cihazda ölçüldü (kullanıcı fark etti: *"devralmaya rağmen sağ üstteki nokta kırmızı"*):
   * telefon devraldı, soketi ölü kaldı, 90 saniye sonra sahiplik düştü ve karşıdaki tarayıcı
   * sekmesi oyunu geri aldı. İki uçlu bir ping pong.
   *
   * ⚠️ Aralık `claimGraceSeconds`in YARISINDAN küçük olmalı: tek bir turun kaçması (yeniden
   * dağıtım, kısa donma) sahipliği düşürmemeli. 90 sn'ye karşı 30 sn üç kat pay bırakıyor.
   * ⚠️ `PresenceService.touch` bu güne kadar **hiçbir yerden çağrılmıyordu**; yorumu
   * *"çağrı sıklığı AuthGuard tarafından kısılıyor"* diyordu ve bu doğru değildi (guard
   * `claim` çağırıyor). Fonksiyon nihayet sahibini buldu.
   * ⚠️ Aynı hesap+örneğe ait birden çok soket olabilir (kısa kesintide üst üste binerler);
   * anahtar kümesiyle tekilleştiriliyor, yoksa aynı satıra tur başına birkaç UPDATE giderdi.
   */
  private startPresenceHeartbeat(): void {
    const everyMs = Math.max(5_000, Math.floor(claimGraceSeconds() * 1000 / 3));
    this.heartbeat = setInterval(() => {
      if (!this.io || !singleDeviceEnforced()) return;
      const seen = new Set<string>();
      for (const [, socket] of this.io.of('/').sockets) {
        const p = (socket.data as { player?: SocketPlayer }).player;
        if (!p) continue;
        const key = `${p.accountId}:${p.instanceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        void this.presence.touch(p.accountId, p.instanceId).catch(() => { /* önemsiz */ });
      }
    }, everyMs);
    // ⚠️ `unref`: nabız süreç kapanışını geciktirmemeli (test koşuları asılı kalırdı).
    this.heartbeat.unref?.();
  }

  private heartbeat: ReturnType<typeof setInterval> | null = null;

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    await this.bus.stop();
    await new Promise<void>((resolve) => {
      if (!this.io) return resolve();
      this.io.close(() => resolve());
    });
    this.io = null;
  }
}
