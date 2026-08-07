/**
 * ⭐ İTTİFAK SOHBETİ — grup sohbeti çekirdeği (§13.15c, kullanıcı tarifi 2026-08-07).
 *
 * WhatsApp grup sohbeti mantığı: ittifağın TEK kanalı, tüm üyeler yazar, `@` ile bahsetme,
 * lider/konsey susturması. `chat_channels.kind = 'alliance'` doğduğu günden beri şemadaydı
 * ama hiç kullanılmamıştı; burası onu dolduruyor.
 *
 * ## DÖRT DEĞİŞMEZ
 *
 * 1. **KATILIMCI SATIRI YOK.** Üyelik `players.alliance_id`'de yaşıyor ve onu yazan DÖRT kod
 *    yolu var. `chat_participants`e ittifak satırı yazmak beşinci bir senkron borcu olurdu.
 *    Erişim sorgu anında `players.alliance_id = chat_channels.alliance_id` ile türetilir.
 *    Yan fayda: ayrılan üyenin mesajları kendiliğinden sohbette kalır (`sender_id`'de FK yok).
 *
 * 2. **KANAL KİMLİĞİ İSTEKTEN GELMEZ.** Hiçbir uç `channelId` almıyor; sunucu onu oyuncunun
 *    kendi `alliance_id`'sinden çözüyor. "Başka ittifağın kanalına yaz" saldırısı şema
 *    düzeyinde imkânsız (DM'deki *"`worldId` daima token'dan"* kuralının ikizi).
 *
 * 3. **KOVA KANAL BAŞINA.** DM kovası oyuncunun tüm kanallarını sayıyor; burası yalnız bu
 *    kanalı. Ortak olsaydı hareketli bir ittifak sohbeti oyuncunun DM hakkını yerdi.
 *
 * 4. **YAZAMAYAN OKUYABİLİR.** Susturulmuş, yeni katılmış, sohbet yasaklı ya da e-postasını
 *    doğrulamamış üye geçmişi görür. Aksi hâlde ceza "sohbetten silinmek" olurdu.
 */
import { sql } from 'drizzle-orm';
import { assertCanModerate, AllianceError, ROLE } from '../alliance/alliance.service.ts';
import { toDate, type Db } from '../db/client.ts';
import { allianceChatLimits } from './alliance-chat.limits.ts';
import {
  assertFlowOk, assertNotBanned, assertVerifiedToChat, findRetry, insertMessage,
  ChatError, type Tx,
} from './chat.guards.ts';
import { mentionRecipients, resolveMentions, type Mention } from './mentions.ts';

export interface AllianceChatMessageRow {
  id: number;
  senderId: number | null;
  senderName: string | null;
  body: string;
  mentions: Mention[];
  createdAt: string;
}

export interface AllianceRosterRow {
  playerId: number;
  username: string;
  role: number;
  /** Aktif susturma var mı; `mutedUntil` null + `muted` true → KALICI. */
  muted: boolean;
  mutedUntil: string | null;
}

/** Yazma hakkının reddedilme sebebi — istemci şeridi buna göre yazıyor. */
export type WriteBlockReason =
  | 'disabled' | 'unverified' | 'banned' | 'muted' | 'too_new' | null;

export interface AllianceChatOpen {
  channelId: number;
  allianceId: number;
  myRole: number;
  canWrite: boolean;
  reason: WriteBlockReason;
  /** Yasağın bitiş anı (kalıcı susturmada ve süresiz yasakta null). */
  blockedUntil: string | null;
  /** İnsana okunur açıklama — sunucu üretir ki metin tek yerde kalsın. */
  blockedText: string | null;
  members: AllianceRosterRow[];
  /** `rosterMax` aşıldı mı — istemci "@ önerileri kısaldı" ipucunu buna göre gösterir. */
  truncated: boolean;
}

export class AllianceChatService {
  constructor(private readonly db: Db) {}

  /* ── Kanal çözümü ─────────────────────────────────────────────────────────── */

  /**
   * Oyuncunun ittifak kanalını bulur, yoksa **tembel** yaratır.
   *
   * ⚠️ `worldId` JWT'den geliyor ve `players` satırının `world_id`si de sorguda — iki katmanlı
   * dünya yalıtımı. Aynı adlı bir ittifak başka dünyada varsa oraya hiç ulaşılamaz.
   */
  private async channelFor(tx: Tx, worldId: number, playerId: number): Promise<{
    channelId: number; allianceId: number; role: number; joinedAt: Date | null;
  }> {
    const [me] = await tx.execute<Record<string, unknown>>(sql`
      SELECT alliance_id, alliance_role, alliance_joined_at
        FROM players WHERE id = ${playerId} AND world_id = ${worldId}
    `);
    const allianceId = me?.['alliance_id'] == null ? null : Number(me['alliance_id']);
    if (allianceId == null) {
      throw new ChatError('not_alliance_member', 'Bir ittifakta değilsin.');
    }

    /**
     * ⚠️ **KISMÎ unique indeks için `ON CONFLICT`e `WHERE` yazmak ZORUNLU.** İndeks
     * `WHERE alliance_id IS NOT NULL` ile kısıtlı; `WHERE`siz bir `ON CONFLICT` Postgres'e
     * hangi kısıtı kastettiğimizi söyleyemez ve *"there is no unique or exclusion constraint
     * matching"* hatası verir.
     */
    const created = await tx.execute<Record<string, unknown>>(sql`
      INSERT INTO chat_channels (world_id, kind, alliance_id)
      VALUES (${worldId}, 'alliance', ${allianceId})
      ON CONFLICT (world_id, alliance_id) WHERE alliance_id IS NOT NULL DO NOTHING
      RETURNING id
    `);
    let channelId: number;
    if (created[0]) {
      channelId = Number(created[0]['id']);
    } else {
      // Yarış: iki üye aynı anda açtı → indeks birini reddetti, var olanı okuyoruz.
      const [again] = await tx.execute<Record<string, unknown>>(sql`
        SELECT id FROM chat_channels
         WHERE world_id = ${worldId} AND alliance_id = ${allianceId} AND kind = 'alliance'
      `);
      channelId = Number(again!['id']);
    }

    return {
      channelId,
      allianceId,
      role: me?.['alliance_role'] == null ? ROLE.MEMBER : Number(me['alliance_role']),
      joinedAt: me?.['alliance_joined_at'] == null ? null : toDate(me['alliance_joined_at']),
    };
  }

  /* ── Susturma durumu ──────────────────────────────────────────────────────── */

  /**
   * Aktif susturma (yoksa `null`). `until IS NULL` → **KALICI**.
   *
   * ⚠️ `chat_bans.activeBan` ile aynı desen: süresi geçmiş satır SİLİNMEZ, yalnız etkisiz
   * sayılır. Sıralama kalıcıyı öne alıyor — iki satır bir arada olamaz (unique indeks) ama
   * sorgu yine de belirleyici olmalı.
   */
  private async activeMute(tx: Tx, allianceId: number, playerId: number): Promise<{
    until: Date | null; reason: string | null;
  } | null> {
    const [row] = await tx.execute<Record<string, unknown>>(sql`
      SELECT until, reason FROM alliance_chat_mutes
       WHERE alliance_id = ${allianceId} AND player_id = ${playerId}
         AND revoked_at IS NULL AND (until IS NULL OR until > now())
       ORDER BY until IS NULL DESC, until DESC
       LIMIT 1
    `);
    if (!row) return null;
    return {
      until: row['until'] == null ? null : toDate(row['until']),
      reason: row['reason'] == null ? null : String(row['reason']),
    };
  }

  /** Susturma metni — hem hata mesajı hem açılış paketindeki şerit aynı cümleyi kullansın. */
  private muteText(until: Date | null, reason: string | null): string {
    const when = until
      ? `${until.toLocaleString('tr-TR')} tarihine kadar`
      : 'süresiz olarak';
    return `İttifak sohbetinde ${when} susturuldun.${reason ? ` Sebep: ${reason}` : ''}`;
  }

  /* ── Yazma hakkı ──────────────────────────────────────────────────────────── */

  /**
   * Yazma hakkını **sırayla** kontrol eder ve ilk engeli döndürür (fırlatmaz).
   *
   * ⚠️ **SIRA KRİTİK** ve `ChatService.send()`ten öğrenilmiş:
   *   1 özellik kapalı · 2 doğrulanmamış · 3 sohbet yasağı · 4 susturma · 5 acemi kısıtı.
   *
   * ⚠️ **4 → 5 sırası bilinçli**: hem susturulmuş hem yeni olan üyeye "2 saat bekle" demek
   * yanlış bilgi olurdu — 2 saat dolduğunda da yazamayacak.
   */
  private async writeBlock(tx: Tx, o: {
    worldId: number; playerId: number; allianceId: number; joinedAt: Date | null;
  }): Promise<{ reason: WriteBlockReason; until: Date | null; text: string; retryAfter?: number } | null> {
    const limits = allianceChatLimits();

    if (!limits.enabled) {
      return { reason: 'disabled', until: null, text: 'İttifak sohbeti şu an kapalı.' };
    }

    try {
      await assertVerifiedToChat(tx, o.playerId);
    } catch (err) {
      return {
        reason: 'unverified', until: null,
        text: (err as Error).message,
      };
    }

    try {
      await assertNotBanned(tx, o.worldId, o.playerId);
    } catch (err) {
      const e = err as ChatError;
      return { reason: 'banned', until: null, text: e.message, retryAfter: e.retryAfterSeconds };
    }

    const mute = await this.activeMute(tx, o.allianceId, o.playerId);
    if (mute) {
      return {
        reason: 'muted',
        until: mute.until,
        text: this.muteText(mute.until, mute.reason),
        retryAfter: mute.until
          ? Math.max(1, Math.ceil((mute.until.getTime() - Date.now()) / 1000))
          : undefined,
      };
    }

    /**
     * ⭐ ACEMİ KISITI — «ittifağa katılalı `newMemberHours` olmayan yazamaz» (kullanıcı şartı).
     *
     * ⚠️ **`joinedAt == null` → REDDET (fail-closed).** Göç mevcut üyelerin hepsini doldurdu,
     * yani NULL yalnız "üyeliği yazan bir kod yolu kolonu unuttu" demek olabilir. Fail-open
     * seçseydik kısıt sessizce delinirdi; böyle seçince hata anında ve gürültülü görünür.
     */
    if (limits.newMemberHours > 0) {
      if (o.joinedAt == null) {
        return {
          reason: 'too_new', until: null,
          text: 'İttifak üyeliğin henüz işlenmedi; birazdan yazabilirsin.',
        };
      }
      const readyAt = new Date(o.joinedAt.getTime() + limits.newMemberHours * 3_600_000);
      if (readyAt.getTime() > Date.now()) {
        const leftMin = Math.max(1, Math.ceil((readyAt.getTime() - Date.now()) / 60_000));
        return {
          reason: 'too_new',
          until: readyAt,
          text: leftMin >= 60
            ? `İttifak sohbetinde yazabilmen için ${Math.ceil(leftMin / 60)} saat daha beklemelisin.`
            : `İttifak sohbetinde yazabilmen için ${leftMin} dakika daha beklemelisin.`,
          retryAfter: Math.ceil((readyAt.getTime() - Date.now()) / 1000),
        };
      }
    }

    return null;
  }

  /** Engel varsa `ChatError` fırlatır — `send()` yolunun kapısı. */
  private async assertCanWrite(tx: Tx, o: {
    worldId: number; playerId: number; allianceId: number; joinedAt: Date | null;
  }): Promise<void> {
    const block = await this.writeBlock(tx, o);
    if (!block) return;
    const code = {
      disabled: 'alliance_chat_disabled',
      unverified: 'email_unverified',
      banned: 'chat_banned',
      muted: 'alliance_muted',
      too_new: 'alliance_new_member_restricted',
    }[block.reason!];
    throw new ChatError(code, block.text, block.retryAfter);
  }

  /* ── Açılış paketi ────────────────────────────────────────────────────────── */

  /**
   * Sheet açılırken tek çağrıda gereken her şey: kanal kimliği, yazma hakkı ve **üye listesi**.
   *
   * ⚠️ Roster hem **çevrimiçi noktalarını** hem **@ önerilerini** besliyor. Ayrı bir "üye ara"
   * ucu YAZILMADI: liste zaten burada geliyor, ikinci bir uç aynı veriyi ikinci kez taşırdı.
   * `online` alanı **controller'da** dolduruluyor — servis gateway bilmemeli.
   */
  async open(o: { worldId: number; playerId: number }): Promise<AllianceChatOpen> {
    const limits = allianceChatLimits();
    return this.db.transaction(async (txn) => {
      const tx = txn as unknown as Tx;
      const ch = await this.channelFor(tx, o.worldId, o.playerId);
      const block = await this.writeBlock(tx, {
        worldId: o.worldId, playerId: o.playerId, allianceId: ch.allianceId, joinedAt: ch.joinedAt,
      });

      /**
       * Üye listesi + herkesin susturma durumu tek sorguda.
       * ⚠️ `LEFT JOIN LATERAL`: her üye için EN FAZLA bir aktif susturma satırı var (kısmî
       * unique indeks) ama süresi geçmişleri de eleyebilmek için koşul burada tekrarlanıyor.
       */
      const rows = await tx.execute<Record<string, unknown>>(sql`
        SELECT p.id, p.username, p.alliance_role, m.until AS muted_until,
               (m.player_id IS NOT NULL) AS muted
          FROM players p
          LEFT JOIN LATERAL (
            SELECT player_id, until FROM alliance_chat_mutes
             WHERE alliance_id = ${ch.allianceId} AND player_id = p.id
               AND revoked_at IS NULL AND (until IS NULL OR until > now())
             LIMIT 1
          ) m ON TRUE
         WHERE p.alliance_id = ${ch.allianceId}
         ORDER BY p.alliance_role DESC, p.score DESC, p.id
         LIMIT ${limits.rosterMax + 1}
      `);

      const truncated = rows.length > limits.rosterMax;
      const members: AllianceRosterRow[] = rows.slice(0, limits.rosterMax).map((r) => ({
        playerId: Number(r['id']),
        username: String(r['username']),
        role: r['alliance_role'] == null ? ROLE.MEMBER : Number(r['alliance_role']),
        muted: r['muted'] === true,
        mutedUntil: r['muted_until'] == null ? null : toDate(r['muted_until']).toISOString(),
      }));

      return {
        channelId: ch.channelId,
        allianceId: ch.allianceId,
        myRole: ch.role,
        canWrite: block == null,
        reason: block?.reason ?? null,
        blockedUntil: block?.until?.toISOString() ?? null,
        blockedText: block?.text ?? null,
        members,
        truncated,
      };
    });
  }

  /* ── Geçmiş ───────────────────────────────────────────────────────────────── */

  /**
   * Keyset sayfalama — `before` = ekrandaki EN ESKİ mesajın id'si. En yeni ÖNCE döner.
   *
   * ⚠️ Gönderen adı `LEFT JOIN`le geliyor: oyuncu dünyadan kaldırılmış olabilir ve satır
   * kalmasına rağmen adı çözülemeyebilir → `senderName` null. Ekran onu «kaldırılmış oyuncu»
   * diye yazıyor; ham `id` **asla** görünmüyor (§13.14).
   * ⚠️ `cleared_before_message_id` YOK: ittifak sohbetinde "yalnız bende sil" diye bir şey yok
   * (grup sohbeti ortak kayıt), o yüzden katılımcı satırına da gerek kalmıyor.
   */
  async history(o: {
    worldId: number; playerId: number; before?: number | null; limit?: number;
  }): Promise<{ channelId: number; items: AllianceChatMessageRow[]; hasMore: boolean }> {
    const limits = allianceChatLimits();
    const take = Math.min(100, Math.max(1, o.limit ?? limits.pageSize));
    const ch = await this.channelFor(this.db as unknown as Tx, o.worldId, o.playerId);

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT m.id, m.sender_id, s.username AS sender_name, m.body, m.mentions, m.created_at
        FROM chat_messages m
        LEFT JOIN players s ON s.id = m.sender_id
       WHERE m.channel_id = ${ch.channelId}
         AND (${o.before ?? null}::bigint IS NULL OR m.id < ${o.before ?? null}::bigint)
         AND m.deleted_at IS NULL
       ORDER BY m.id DESC
       LIMIT ${take + 1}
    `);

    const hasMore = rows.length > take;
    return {
      channelId: ch.channelId,
      hasMore,
      items: rows.slice(0, take).map((r) => ({
        id: Number(r['id']),
        senderId: r['sender_id'] == null ? null : Number(r['sender_id']),
        senderName: r['sender_name'] == null ? null : String(r['sender_name']),
        body: String(r['body']),
        mentions: Array.isArray(r['mentions']) ? (r['mentions'] as Mention[]) : [],
        createdAt: toDate(r['created_at']).toISOString(),
      })),
    };
  }

  /* ── Gönderme ─────────────────────────────────────────────────────────────── */

  async send(o: {
    worldId: number; playerId: number; body: string; clientMsgId: string;
  }): Promise<AllianceChatMessageRow> {
    const limits = allianceChatLimits();
    const body = o.body.trim();
    if (body.length === 0) throw new ChatError('too_long', 'Mesaj boş olamaz.');
    if (body.length > limits.bodyMax) {
      throw new ChatError('too_long', `Mesaj en fazla ${limits.bodyMax} karakter.`);
    }

    return this.db.transaction(async (txn) => {
      const tx = txn as unknown as Tx;
      const ch = await this.channelFor(tx, o.worldId, o.playerId);

      /**
       * 0) YENİDEN DENEME mi? — `client_msg_id` zaten yazılmışsa bu bir ağ tekrarıdır ve
       * **hiçbir limite bakılmadan** var olan satır döner.
       *
       * ⚠️ Bu kontrol her şeyden ÖNCE olmak zorunda: aksi hâlde bağlantısı kopan istemci aynı
       * mesajı yeniden yolladığında "aynı mesajı az önce gönderdin" reddi alır ve mesaj
       * gönderilmiş olmasına rağmen kaybolmuş görünür (`chat.test.ts` bunu bir kez yakaladı).
       */
      const retry = await findRetry(tx, ch.channelId, o.clientMsgId);
      if (retry) {
        const [who] = await tx.execute<Record<string, unknown>>(sql`
          SELECT username FROM players WHERE id = ${o.playerId}
        `);
        return {
          id: retry.id,
          senderId: o.playerId,
          senderName: who?.['username'] == null ? null : String(who['username']),
          body: retry.body,
          mentions: [],
          createdAt: retry.createdAt.toISOString(),
        };
      }

      /* 1-5) Yazma hakkı — sıra `assertCanWrite` başlığında. */
      await this.assertCanWrite(tx, {
        worldId: o.worldId, playerId: o.playerId, allianceId: ch.allianceId, joinedAt: ch.joinedAt,
      });

      /* 6) Kova + mükerrer + yavaş mod — ⚠️ kapsam `'channel'` (değişmez 3). */
      await assertFlowOk(tx, {
        playerId: o.playerId, channelId: ch.channelId, body, scope: 'channel',
        limits: {
          burst: limits.burst,
          perSeconds: limits.perSeconds,
          duplicateSeconds: limits.duplicateSeconds,
          slowModeSeconds: limits.slowModeSeconds,
        },
      });

      /**
       * 7) MENTION ÇÖZÜMÜ — üye listesi üzerinden.
       * ⚠️ `rosterMax` ile sınırlı: listenin dışında kalan bir üyeye yapılan bahsetme
       * çözülmez. Varsayılan 300 bu yüzden cömert seçildi.
       * ⚠️ `resolveMentions` **kırpılmış** gövdeyi alıyor — DB'ye yazılan dizeyle aynı olmak
       * zorunda, yoksa tüm indeksler kayar.
       */
      const roster = await tx.execute<Record<string, unknown>>(sql`
        SELECT id, username FROM players
         WHERE alliance_id = ${ch.allianceId}
         ORDER BY alliance_role DESC, score DESC, id
         LIMIT ${limits.rosterMax}
      `);
      const mentions = resolveMentions(
        body,
        roster.map((r) => ({ playerId: Number(r['id']), username: String(r['username']) })),
        limits.maxMentions,
      );

      const me = roster.find((r) => Number(r['id']) === o.playerId);
      const senderName = me == null ? null : String(me['username']);

      /* 8) YAZ */
      const written = await insertMessage(tx, {
        channelId: ch.channelId, worldId: o.worldId, senderId: o.playerId,
        body, clientMsgId: o.clientMsgId, mentions,
      });

      /**
       * 9) OUTBOX — tek satır iki işi birden besliyor:
       *    • WS: `eventForOutbox` bunu **kanal odasına** yönlendiriyor (sheet'i kapalı olana
       *      hiçbir şey gitmez — kullanıcı şartı "kapalıyken tam sessizlik").
       *    • Bildirim: `notificationForOutbox` yalnız `mentions` listesindekilere yazıyor.
       *
       * ⚠️ Yük **aralıkları değil id'leri** taşır: NOTIFY bayt sınırı ve "olay veri değil haber
       * taşır" kuralı. Aralıklar DB'de, istemci geçmişi tazeleyince alıyor.
       * ⚠️ Gönderen mention listesinden **burada** düşürülür (`mentionRecipients`), katalogda
       * değil: katalog saf bir eşleyici kalmalı.
       */
      await tx.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${o.worldId}, 'chat:alliance', ${JSON.stringify({
        channelId: ch.channelId,
        allianceId: ch.allianceId,
        messageId: written.id,
        senderId: o.playerId,
        senderName,
        mentions: mentionRecipients(mentions, o.playerId),
      })}::jsonb)
      `);

      return {
        id: written.id,
        senderId: o.playerId,
        senderName,
        body,
        mentions,
        createdAt: written.createdAt.toISOString(),
      };
    });
  }

  /* ── Susturma (§13.15b yetki matrisi) ─────────────────────────────────────── */

  /**
   * Üyeyi susturur. `minutes === null` → **KALICI** (lider/konsey kaldırana kadar).
   *
   * ⚠️ Yetki matrisi «At» ile AYNI (`assertCanModerate`): Konsey yalnız Asker'i, Lider herkesi
   * (kendisi ve lider hariç). Matris tek yerde yaşıyor ki biri güncellenip diğeri unutulmasın.
   */
  async mute(o: {
    worldId: number; playerId: number; targetId: number;
    minutes: number | null; reason?: string | null;
  }): Promise<void> {
    await this.db.transaction(async (txn) => {
      const tx = txn as unknown as Tx;
      const me = await this.lockMember(tx, o.playerId);
      if (me.role < ROLE.COUNCIL) {
        throw new ChatError('forbidden', 'Bu işlem için Konsey ya da Lider olmalısın.');
      }
      const target = await this.lockMember(tx, o.targetId);
      // ⚠️ `AllianceError` → `ChatError` çevirisi: uç `toHttp`tan geçiyor, kod korunuyor.
      try {
        assertCanModerate(me, target, 'mute');
      } catch (err) {
        const e = err as AllianceError;
        throw new ChatError(e.code === 'hierarchy' ? 'mute_hierarchy' : e.code, e.message);
      }

      /**
       * ⚠️ Önce TÜM iptal edilmemiş satırlar kapatılır — **süresi geçmişler DÂHİL.**
       * `alliance_chat_mutes_one_active` kısmî indeksinin koşulu `revoked_at IS NULL`, yani
       * süresi dolmuş ama iptal edilmemiş bir satır hâlâ kısıtın içinde. Bu adım olmadan
       * ikinci susturma unique ihlaliyle patlardı.
       */
      await tx.execute(sql`
        UPDATE alliance_chat_mutes SET revoked_at = now(), revoked_by = ${o.playerId}
         WHERE alliance_id = ${me.allianceId} AND player_id = ${o.targetId} AND revoked_at IS NULL
      `);
      await tx.execute(sql`
        INSERT INTO alliance_chat_mutes (world_id, alliance_id, player_id, until, reason, created_by)
        VALUES (${o.worldId}, ${me.allianceId}, ${o.targetId},
                ${o.minutes == null ? null : sql`now() + (${o.minutes} || ' minutes')::interval`},
                ${o.reason?.trim() || null}, ${o.playerId})
      `);

      await this.notifyTarget(tx, {
        worldId: o.worldId, allianceId: me.allianceId!, targetId: o.targetId,
        subject: 'İttifak sohbetinde susturuldun',
        text: o.minutes == null
          ? `${me.username} seni ittifak sohbetinde süresiz olarak susturdu. Sohbeti okumaya devam edebilirsin.`
          : `${me.username} seni ittifak sohbetinde ${o.minutes} dakika susturdu. Sohbeti okumaya devam edebilirsin.`,
        reason: 'muted',
      });
    });
  }

  /** Susturmayı kaldırır. ⚠️ Satır SİLİNMEZ, `revoked_at` işaretlenir — denetim izi kalıcı. */
  async unmute(o: { worldId: number; playerId: number; targetId: number }): Promise<void> {
    await this.db.transaction(async (txn) => {
      const tx = txn as unknown as Tx;
      const me = await this.lockMember(tx, o.playerId);
      if (me.role < ROLE.COUNCIL) {
        throw new ChatError('forbidden', 'Bu işlem için Konsey ya da Lider olmalısın.');
      }
      const target = await this.lockMember(tx, o.targetId);
      try {
        assertCanModerate(me, target, 'mute');
      } catch (err) {
        const e = err as AllianceError;
        throw new ChatError(e.code === 'hierarchy' ? 'mute_hierarchy' : e.code, e.message);
      }

      const revoked = await tx.execute<Record<string, unknown>>(sql`
        UPDATE alliance_chat_mutes SET revoked_at = now(), revoked_by = ${o.playerId}
         WHERE alliance_id = ${me.allianceId} AND player_id = ${o.targetId}
           AND revoked_at IS NULL AND (until IS NULL OR until > now())
        RETURNING id
      `);
      if (revoked.length === 0) {
        throw new ChatError('not_muted', 'Bu üye zaten susturulmuş değil.');
      }

      await this.notifyTarget(tx, {
        worldId: o.worldId, allianceId: me.allianceId!, targetId: o.targetId,
        subject: 'İttifak sohbetinde susturman kaldırıldı',
        text: `${me.username} ittifak sohbetindeki susturmanı kaldırdı. Yeniden yazabilirsin.`,
        reason: 'unmuted',
      });
    });
  }

  /* ── Yardımcılar ──────────────────────────────────────────────────────────── */

  /**
   * Üye künyesi, satır kilitli (`FOR UPDATE`) — `AllianceService.lockPlayer` deseninin ikizi.
   * ⚠️ Kilit şart: susturma kararı verilirken hedefin rolü değişiyor olabilir.
   */
  private async lockMember(tx: Tx, playerId: number): Promise<{
    playerId: number; allianceId: number | null; role: number; username: string;
  }> {
    const [r] = await tx.execute<Record<string, unknown>>(sql`
      SELECT id, username, alliance_id, alliance_role FROM players
       WHERE id = ${playerId} FOR UPDATE
    `);
    if (!r) throw new ChatError('not_alliance_member', 'Oyuncu bulunamadı.');
    return {
      playerId,
      username: String(r['username']),
      allianceId: r['alliance_id'] == null ? null : Number(r['alliance_id']),
      role: r['alliance_role'] == null ? 0 : Number(r['alliance_role']),
    };
  }

  /**
   * Hedefe posta + ittifak görünümü tazeleme.
   *
   * ⚠️ **Yeni bir outbox konusu icat EDİLMİYOR.** `alliance:changed` zaten hem ittifak odasına
   * hem etkilenen oyuncuya gidiyor ve istemcide ittifak sorgularını tazeliyor. Yeni bir konu,
   * `eventForOutbox` + `INVALIDATES` ikilisini bir kez daha senkronlama borcu demekti.
   */
  private async notifyTarget(tx: Tx, o: {
    worldId: number; allianceId: number; targetId: number;
    subject: string; text: string; reason: string;
  }): Promise<void> {
    await tx.execute(sql`
      INSERT INTO messages (world_id, player_id, kind, side, subject, body, at)
      VALUES (${o.worldId}, ${o.targetId}, 'system', 'owner', ${o.subject},
              ${JSON.stringify({ allianceId: o.allianceId, reason: o.reason, text: o.text })}::jsonb, now())
    `);
    await tx.execute(sql`
      INSERT INTO outbox (world_id, topic, payload)
      VALUES (${o.worldId}, 'message:written',
              ${JSON.stringify({ playerId: o.targetId, kind: 'system' })}::jsonb)
    `);
    await tx.execute(sql`
      INSERT INTO outbox (world_id, topic, payload)
      VALUES (${o.worldId}, 'alliance:changed',
              ${JSON.stringify({ allianceId: o.allianceId, playerIds: [o.targetId] })}::jsonb)
    `);
  }
}
