/**
 * ⭐ GENEL SOHBET — dünyanın TEK açık odası (§13.12, kullanıcı tarifi 2026-08-10).
 *
 * *"Tüm oyunculara açık bir sohbet alanı… oyunun gerçek üretime çıktığı aşamada tamamen iptal
 * edilecek, sadece erken aşamada oyuncuların hatalar ve öneriler hakkında tartıştığı bir yer."*
 *
 * Sohbet çekirdeğinin **üçüncü** tüketicisi: `chat.guards.ts` (idempotency · kova · mükerrer ·
 * yasak · doğrulama), `mentions.ts` ve outbox zinciri aynen kullanılıyor. Yapı
 * `AllianceChatService`in ikizi; **dört yerde bilerek ayrılıyor**:
 *
 * 1. **KANAL KİMLİĞİ OYUNCUDAN DEĞİL, DÜNYADAN ÇÖZÜLÜYOR.** İttifakta `players.alliance_id`
 *    gerekiyordu; burada üyelik "bu dünyada oyuncu olmak"tan ibaret. Katılımcı satırı da yok.
 *
 * 2. **KAPALIYKEN OKUMA DA DURUYOR.** İttifak sohbetinde `enabled = false` yalnız yazmayı
 *    kesiyor, geçmiş açık kalıyor. Burada özellik **tamamen** kapanıyor — kullanıcı şartı
 *    *"tamamen devre dışı olacak"*. Bu yüzden `assertEnabled()` `open`/`history`/`send`/
 *    `suggest`/`deleteMessage`in hepsinin ilk satırı.
 *
 * 3. **ROSTER YOK → MENTION TERSTEN ÇÖZÜLÜYOR** (`mentionCandidateNames`, §2.4). Öneri de
 *    istemcide süzülemiyor, ayrı bir arama ucundan geliyor.
 *
 * 4. **ENGELLEME BURADA İŞ GÖRÜYOR.** DM'de engel "yazamaz" demekti; açık odada kimseyi
 *    susturamaz, dolayısıyla anlamı **"onu görmem"** oluyor ve geçmiş sorgusunda süzülüyor.
 *
 * ⚠️ Susturma `alliance_chat_mutes` gibi yeni bir tabloya DEĞİL, var olan `chat_bans`e
 * `scope = 'global'` ile yazılıyor: zaten yönetici tarafından verilen, süreli/süresiz,
 * gerekçeli ve panelde geçmişi görünen bir ceza tablosu. Beşinci bir yasak kavramı icat etmek
 * moderasyon tarihini ikiye bölerdi.
 */
import { sql } from 'drizzle-orm';
import { prefixPattern } from '../common/like.ts';
import { toDate, type Db } from '../db/client.ts';
import {
  assertFlowOk, assertNotBanned, assertVerifiedToChat, findRetry, insertMessage,
  ChatError, type Tx,
} from './chat.guards.ts';
import { globalChatLimits } from './global-chat.limits.ts';
import {
  mentionCandidateNames, mentionRecipients, resolveMentions, type Mention,
} from './mentions.ts';

export interface GlobalChatMessageRow {
  id: number;
  senderId: number | null;
  senderName: string | null;
  body: string;
  mentions: Mention[];
  createdAt: string;
}

/** Yazma hakkının reddedilme sebebi — istemci şeridi buna göre yazıyor. */
export type GlobalWriteBlockReason = 'disabled' | 'unverified' | 'banned' | 'too_new' | null;

export interface GlobalChatOpen {
  channelId: number;
  canWrite: boolean;
  reason: GlobalWriteBlockReason;
  /** Yasağın bitiş anı (süresiz yasakta null). */
  blockedUntil: string | null;
  /** İnsana okunur açıklama — sunucu üretir ki metin tek yerde kalsın. */
  blockedText: string | null;
  /** ⭐ Yönetici mi — ⋮ menüsünü ÇİZMEK için (yetki kapısı değil, bkz. `open()`). */
  isStaff: boolean;
}

export class GlobalChatService {
  constructor(private readonly db: Db) {}

  /* ── Açık mı ──────────────────────────────────────────────────────────────── */

  /**
   * ⚠️ Kapalıysa **hiçbir şey** yapılmıyor — okuma dâhil (yukarıdaki 2. ayrım).
   * ⚠️ Susturma uçları bunu ÇAĞIRMIYOR: `chat_bans` üç sohbet türünün ortak ceza tablosu ve
   * genel sohbet kapatıldı diye erişilemez olmamalı.
   */
  private assertEnabled(): void {
    if (!globalChatLimits().enabled) {
      throw new ChatError('global_disabled', 'Genel sohbet şu an kapalı.');
    }
  }

  /* ── Kanal çözümü ─────────────────────────────────────────────────────────── */

  /**
   * Dünyanın genel kanalını bulur, yoksa **tembel** yaratır.
   *
   * ⚠️ **KISMÎ unique indeks için `ON CONFLICT`e `WHERE` yazmak ZORUNLU.** İndeks
   * `WHERE kind = 'global'` ile kısıtlı; `WHERE`siz bir `ON CONFLICT` Postgres'e hangi kısıtı
   * kastettiğimizi söyleyemez ve *"there is no unique or exclusion constraint matching"*
   * hatası verir (aynı tuzak `alliance-chat.service.ts`te de yazılı).
   *
   * ⚠️ `playerId` PARAMETRE DEĞİL: kanal kimliği hiçbir istekten gelmiyor ve oyuncuya da
   * bağlı değil. "Başka dünyanın kanalına yaz" saldırısı şema düzeyinde imkânsız (§13.12.1b).
   */
  private async channelFor(tx: Tx, worldId: number): Promise<number> {
    const created = await tx.execute<Record<string, unknown>>(sql`
      INSERT INTO chat_channels (world_id, kind)
      VALUES (${worldId}, 'global')
      ON CONFLICT (world_id) WHERE kind = 'global' DO NOTHING
      RETURNING id
    `);
    if (created[0]) return Number(created[0]['id']);

    // Yarış: iki oyuncu aynı anda bağlandı → indeks birini reddetti, var olanı okuyoruz.
    const [again] = await tx.execute<Record<string, unknown>>(sql`
      SELECT id FROM chat_channels WHERE world_id = ${worldId} AND kind = 'global'
    `);
    return Number(again!['id']);
  }

  /* ── Yazma hakkı ──────────────────────────────────────────────────────────── */

  /**
   * Yazma hakkını **sırayla** kontrol eder ve ilk engeli döndürür (fırlatmaz).
   *
   * ⚠️ **SIRA KRİTİK**, `AllianceChatService.writeBlock`tan öğrenilmiş:
   *   1 özellik kapalı · 2 doğrulanmamış · 3 sohbet yasağı · 4 acemi kısıtı.
   *
   * ⚠️ **3 → 4 sırası bilinçli**: hem yasaklı hem yeni olan oyuncuya "10 dakika bekle" demek
   * yanlış bilgi olurdu — 10 dakika dolduğunda da yazamayacak.
   *
   * ⚠️ **Yazamayan OKUR** (özellik kapalı olma hâli hariç): ceza "sohbetten silinmek" olmamalı.
   */
  private async writeBlock(tx: Tx, o: { worldId: number; playerId: number }): Promise<{
    reason: GlobalWriteBlockReason; until: Date | null; text: string; retryAfter?: number;
  } | null> {
    const limits = globalChatLimits();

    if (!limits.enabled) {
      return { reason: 'disabled', until: null, text: 'Genel sohbet şu an kapalı.' };
    }

    try {
      await assertVerifiedToChat(tx, o.playerId);
    } catch (err) {
      return { reason: 'unverified', until: null, text: (err as Error).message };
    }

    try {
      /* ⚠️ Kapsam `'global'`: `scope = 'all'` yasağı da buraya düşer, `scope = 'global'` YALNIZ
         buraya düşer — özel mesajı kesmez (`chat.guards.ts` → `BanScope`). */
      await assertNotBanned(tx, o.worldId, o.playerId, 'global');
    } catch (err) {
      const e = err as ChatError;
      return { reason: 'banned', until: null, text: e.message, retryAfter: e.retryAfterSeconds };
    }

    /**
     * ⭐ ACEMİ KISITI — varsayılan **0**, yani normalde hiç çalışmaz (kullanıcı şartı:
     * *"oyuna ilk kayıt olan birisi bile burada sohbet edebilir"*). Anahtar yine de duruyor:
     * kayıt→spam botu görülürse tek sayıyla kapatılabilsin.
     *
     * ⚠️ Ölçüt `players.created_at` — o DÜNYAYA katılma anı, hesap yaşı değil (sohbet
     * dünya-kapsamlı, §13.12.1b).
     */
    if (limits.minPlayerAgeMinutes > 0) {
      const [r] = await tx.execute<Record<string, unknown>>(sql`
        SELECT EXTRACT(EPOCH FROM (now() - created_at))::int AS age_s
          FROM players WHERE id = ${o.playerId} AND world_id = ${o.worldId}
      `);
      const ageS = Number(r?.['age_s'] ?? 0);
      const needS = limits.minPlayerAgeMinutes * 60;
      if (ageS < needS) {
        const leftMin = Math.max(1, Math.ceil((needS - ageS) / 60));
        return {
          reason: 'too_new',
          until: new Date(Date.now() + (needS - ageS) * 1000),
          text: `Genel sohbete yazabilmen için ${leftMin} dakika daha beklemelisin.`,
          retryAfter: needS - ageS,
        };
      }
    }

    return null;
  }

  /** Engel varsa `ChatError` fırlatır — `send()` yolunun kapısı. */
  private async assertCanWrite(tx: Tx, o: { worldId: number; playerId: number }): Promise<void> {
    const block = await this.writeBlock(tx, o);
    if (!block) return;
    const code = {
      disabled: 'global_disabled',
      unverified: 'email_unverified',
      banned: 'chat_banned',
      too_new: 'global_account_too_new',
    }[block.reason!];
    throw new ChatError(code, block.text, block.retryAfter);
  }

  /* ── Açılış paketi ────────────────────────────────────────────────────────── */

  /**
   * Sohbete BAĞLANIRKEN tek çağrıda gereken her şey: kanal kimliği + yazma hakkı + yönetici mi.
   *
   * ⚠️ **Üye listesi YOK** (ittifak paketinin aksine): aday kümesi dünyanın tamamı. Çevrimiçi
   * noktaları da yok — onun yerine odadaki **sayı** WS'ten geliyor (`global:chat:presence`),
   * çünkü açık odada kimin bağlı olduğu bir gizlilik meselesi ("başka hiçbir yerden hiçbir
   * oyuncunun online durumu kontrol edilemez" kuralı).
   *
   * ⚠️ `isStaff` bir **yetki kapısı değil, görsel ipucu**: oyun istemcisi bugün yönetici olup
   * olmadığını hiç bilmiyor ve ⋮ menüsünü çizebilmek için bilmesi gerekiyor. Asıl kapı
   * uçlardaki `AdminGuard`; bu alan istemcide değiştirilse bile hiçbir işlem açılmaz.
   */
  async open(o: { worldId: number; playerId: number }): Promise<GlobalChatOpen> {
    this.assertEnabled();
    return this.db.transaction(async (txn) => {
      const tx = txn as unknown as Tx;
      const channelId = await this.channelFor(tx, o.worldId);
      const block = await this.writeBlock(tx, o);

      const [me] = await tx.execute<Record<string, unknown>>(sql`
        SELECT a.role FROM players p JOIN accounts a ON a.id = p.account_id
         WHERE p.id = ${o.playerId} AND p.world_id = ${o.worldId}
      `);
      const role = String(me?.['role'] ?? 'player');

      return {
        channelId,
        canWrite: block == null,
        reason: block?.reason ?? null,
        blockedUntil: block?.until?.toISOString() ?? null,
        blockedText: block?.text ?? null,
        isStaff: role === 'moderator' || role === 'admin',
      };
    });
  }

  /* ── Geçmiş ───────────────────────────────────────────────────────────────── */

  /**
   * Keyset sayfalama — `before` = ekrandaki EN ESKİ mesajın id'si. En yeni ÖNCE döner.
   *
   * ⚠️ **ENGELLENENİN MESAJI HİÇ GELMEZ** (kullanıcı şartı: *"bir kişi engellenirse onun tüm
   * mesajları artık ona gözükmez"*). Süzgeç **tek yönlü**: ben onu görmem, o beni görür.
   * Açık bir odada karşılıklı görünmezlik istenmedi ve istenseydi de bir tarafın verdiği kararla
   * diğerinin ekranını değiştirmek olurdu.
   *
   * ⭐ **Canlı yol da bedavaya süzülüyor:** WS olayı gövde taşımıyor (kural: haber taşır, veri
   * değil), istemci bu sorguyu tazeliyor. Yani engellinin mesajı ekrana hiçbir yoldan ulaşmıyor
   * ve soket katmanına alıcı-başına süzgeç yazmak gerekmiyor.
   *
   * ⚠️ Gönderen adı `LEFT JOIN`le: oyuncu dünyadan kaldırılmış olabilir → `senderName` null,
   * ekran «kaldırılmış oyuncu» yazar (ham `id` ASLA görünmez, §13.14).
   */
  async history(o: {
    worldId: number; playerId: number; before?: number | null; limit?: number;
  }): Promise<{ channelId: number; items: GlobalChatMessageRow[]; hasMore: boolean }> {
    this.assertEnabled();
    const limits = globalChatLimits();
    const take = Math.min(100, Math.max(1, o.limit ?? limits.pageSize));
    const channelId = await this.channelFor(this.db as unknown as Tx, o.worldId);

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT m.id, m.sender_id, s.username AS sender_name, m.body, m.mentions, m.created_at
        FROM chat_messages m
        LEFT JOIN players s ON s.id = m.sender_id
       WHERE m.channel_id = ${channelId}
         AND (${o.before ?? null}::bigint IS NULL OR m.id < ${o.before ?? null}::bigint)
         AND m.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM player_blocks b
            WHERE b.player_id = ${o.playerId} AND b.blocked_player_id = m.sender_id
         )
       ORDER BY m.id DESC
       LIMIT ${take + 1}
    `);

    const hasMore = rows.length > take;
    return {
      channelId,
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
  }): Promise<GlobalChatMessageRow> {
    this.assertEnabled();
    const limits = globalChatLimits();
    const body = o.body.trim();
    if (body.length === 0) throw new ChatError('too_long', 'Mesaj boş olamaz.');
    if (body.length > limits.bodyMax) {
      throw new ChatError('too_long', `Mesaj en fazla ${limits.bodyMax} karakter.`);
    }

    return this.db.transaction(async (txn) => {
      const tx = txn as unknown as Tx;
      const channelId = await this.channelFor(tx, o.worldId);

      /**
       * 0) YENİDEN DENEME mi? — `client_msg_id` zaten yazılmışsa bu bir ağ tekrarıdır ve
       * **hiçbir limite bakılmadan** var olan satır döner. Bu kontrol her şeyden ÖNCE olmak
       * zorunda: aksi hâlde bağlantısı kopan istemcinin tekrarı "aynı mesajı az önce
       * gönderdin" reddi alır ve mesaj yazılmış olmasına rağmen kaybolmuş görünür.
       */
      const retry = await findRetry(tx, channelId, o.clientMsgId);
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

      /* 1-4) Yazma hakkı — sıra `writeBlock` başlığında. */
      await this.assertCanWrite(tx, o);

      /* 5) Kova + mükerrer + yavaş mod — ⚠️ kapsam `'channel'`: yalnız genel kanal sayılır,
       *    oyuncunun DM kotasına dokunmaz (ve tersi). Gerekçe `chat.guards.ts`te. */
      await assertFlowOk(tx, {
        playerId: o.playerId, channelId, body, scope: 'channel',
        limits: {
          burst: limits.burst,
          perSeconds: limits.perSeconds,
          duplicateSeconds: limits.duplicateSeconds,
          slowModeSeconds: limits.slowModeSeconds,
        },
      });

      /**
       * 6) MENTION ÇÖZÜMÜ — **roster yok, tersten çözülüyor** (`mentionCandidateNames`).
       * Metinden olası ad dizeleri üretilip tek sorguda "bunlardan hangisi gerçek oyuncu"
       * diye soruluyor; sonuç değiştirilmemiş `resolveMentions`a besleniyor.
       *
       * ⚠️ `resolveMentions` **kırpılmış** gövdeyi alıyor — DB'ye yazılan dizeyle aynı olmak
       * zorunda, yoksa tüm indeksler kayar.
       */
      const names = mentionCandidateNames(body, limits.maxMentions);
      /**
       * ⚠️ Liste **jsonb olarak** gidiyor, `= ANY($1::text[])` olarak DEĞİL: drizzle'ın `sql`
       * şablonu bir JS dizisini değer LİSTESİNE (record) açıyor ve Postgres *"cannot cast type
       * record to text[]"* ile patlıyor. `jsonb_array_elements_text` tek parametre gönderir ve
       * `players_world_username` tekil indeksi yine kullanılabilir kalır.
       */
      const found = names.length === 0 ? [] : await tx.execute<Record<string, unknown>>(sql`
        SELECT id, username FROM players
         WHERE world_id = ${o.worldId}
           AND username IN (SELECT jsonb_array_elements_text(${JSON.stringify(names)}::jsonb))
      `);
      const mentions = resolveMentions(
        body,
        found.map((r) => ({ playerId: Number(r['id']), username: String(r['username']) })),
        limits.maxMentions,
      );

      const [me] = await tx.execute<Record<string, unknown>>(sql`
        SELECT username FROM players WHERE id = ${o.playerId}
      `);
      const senderName = me?.['username'] == null ? null : String(me['username']);

      /* 7) YAZ */
      const written = await insertMessage(tx, {
        channelId, worldId: o.worldId, senderId: o.playerId,
        body, clientMsgId: o.clientMsgId, mentions,
      });

      /**
       * 8) BİLDİRİM ALICILARI — gönderen düşürülür (`mentionRecipients`), **ardından
       * GÖNDERENİ ENGELLEYENLER de düşürülür.**
       *
       * ⚠️ Bu ikinci süzgeç olmadan engelleme sızıntılı olurdu: mesajı geçmişte GÖREMEYEN
       * oyuncu, o mesajın bildirimini alır ve tıklayınca ortada bir şey bulamazdı. Engel
       * "onu görmem" demek; bildirim de bir görünürlük biçimi.
       */
      let recipients = mentionRecipients(mentions, o.playerId);
      if (recipients.length > 0) {
        /* ⚠️ Liste jsonb olarak gidiyor — yukarıdaki `record to text[]` tuzağının ikizi. */
        const blockers = await tx.execute<Record<string, unknown>>(sql`
          SELECT player_id FROM player_blocks
           WHERE blocked_player_id = ${o.playerId}
             AND player_id IN (
               SELECT (jsonb_array_elements_text(${JSON.stringify(recipients)}::jsonb))::bigint
             )
        `);
        const blocked = new Set(blockers.map((r) => Number(r['player_id'])));
        recipients = recipients.filter((id) => !blocked.has(id));
      }

      /**
       * 9) OUTBOX — tek satır iki işi birden besliyor:
       *    • WS: `eventForOutbox` bunu **kanal odasına** yönlendiriyor (bağlı olmayana hiçbir
       *      şey gitmez — kullanıcı şartı "bağlantıyı kopardığında sohbet çevrimdışı").
       *    • Bildirim: `notificationForOutbox` yalnız `mentions` listesindekilere yazıyor.
       *
       * ⚠️ Yük **aralıkları değil id'leri** taşır: NOTIFY bayt sınırı ve "olay veri değil haber
       * taşır" kuralı. Aralıklar DB'de; istemci geçmişi tazeleyince alıyor.
       */
      await tx.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${o.worldId}, 'chat:global', ${JSON.stringify({
        channelId,
        messageId: written.id,
        senderId: o.playerId,
        senderName,
        mentions: recipients,
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

  /* ── `@` önerisi (debounce'lu arama ucu) ──────────────────────────────────── */

  /**
   * Önek araması — istemci yazarken 250 ms debounce ile çağırıyor.
   *
   * ⚠️ **Neden bir uç var:** ittifak sohbetinde öneri listesi açılış paketinden geliyordu
   * (≤300 üye). Burada aday kümesi dünyanın tamamı; önceden indirilemez.
   *
   * ⚠️ `prefixPattern` (`common/like.ts`) `players_world_username_lower` indeksini kullanılabilir
   * kılıyor — deseni SQL içinde birleştirmek onu sessizce devre dışı bırakır.
   * ⚠️ En az 2 karakter: tek harfle dünyanın yarısını taramanın kimseye faydası yok.
   */
  async suggest(o: { worldId: number; playerId: number; q: string }): Promise<
    Array<{ playerId: number; username: string }>
  > {
    this.assertEnabled();
    const q = o.q.trim();
    if (q.length < 2) return [];
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, username FROM players
       WHERE world_id = ${o.worldId} AND lower(username) LIKE ${prefixPattern(q)}
       ORDER BY username
       LIMIT ${globalChatLimits().suggestLimit}
    `);
    return rows.map((r) => ({ playerId: Number(r['id']), username: String(r['username']) }));
  }

  /* ── Yönetici işlemleri ───────────────────────────────────────────────────── */

  /**
   * Oyuncuyu genel sohbette susturur — kayıt `chat_bans`e `scope = 'global'` ile düşer.
   *
   * ⚠️ **Yetki kontrolü BURADA DEĞİL, `AdminGuard`ta**: rol hesap düzeyinde ve her istekte
   * DB'den okunuyor (`admin.guard.ts`). Servise ikinci bir rol kontrolü koymak, iki yerde
   * yaşayan bir yetki kuralı demekti.
   *
   * ⚠️ `minutes === null` → **KALICI**. Sözleşmede alan zorunlu ve nullable: en yıkıcı seçenek
   * kazayla (alanı unutarak) değil, açıkça seçilmeli.
   */
  async mute(o: {
    worldId: number; adminId: number; targetId: number;
    minutes: number | null; reason?: string | null;
  }): Promise<void> {
    const [t] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM players WHERE id = ${o.targetId} AND world_id = ${o.worldId}
    `);
    if (!t) throw new ChatError('wrong_world', 'Oyuncu bulunamadı.');
    if (o.targetId === o.adminId) throw new ChatError('mute_self', 'Kendini susturamazsın.');

    await this.db.execute(sql`
      INSERT INTO chat_bans (world_id, player_id, scope, until, reason, created_by)
      VALUES (${o.worldId}, ${o.targetId}, 'global',
              ${o.minutes == null ? null : sql`now() + (${o.minutes} || ' minutes')::interval`},
              ${o.reason?.trim() || null}, ${o.adminId})
    `);
  }

  /**
   * Susturmayı kaldırır.
   *
   * ⚠️ Satır **SİLİNMEZ**, `until` şimdiye çekilir (`admin.moderation.controller` ile aynı
   * desen): moderasyon geçmişi kalıcı olmalı, *"bu oyuncu daha önce susturulmuş muydu"*
   * sorusu cevapsız kalmamalı.
   * ⚠️ Yalnız `scope = 'global'` satırlara dokunuyor: sohbetin içinden verilen bir kararın,
   * panelden verilmiş genel bir yasağı kaldırması sürpriz olurdu.
   */
  async unmute(o: { worldId: number; targetId: number }): Promise<void> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE chat_bans SET until = now()
       WHERE world_id = ${o.worldId} AND player_id = ${o.targetId} AND scope = 'global'
         AND (until IS NULL OR until > now())
      RETURNING id
    `);
    if (rows.length === 0) throw new ChatError('not_muted', 'Bu oyuncu zaten susturulmuş değil.');
  }

  /**
   * Mesajı sohbetten kaldırır (yönetici).
   *
   * ⚠️ Satır **SİLİNMEZ**, `deleted_at`/`deleted_by` işaretlenir — `chat_reports.body_snapshot`
   * ile aynı gerekçe: bir tartışmada ya da hukuki gereklilikte kanıt kalmalı. Geçmiş sorgusu
   * `deleted_at IS NULL` süzgecini zaten taşıyordu, yani ekranda anında kayboluyor.
   *
   * ⚠️ Susturma **sonraki** mesajları durdurur; asılı kalmış bir küfür/reklam ancak bununla
   * kalkar. İkisi ayrı yetenek ve ikisi de gerekli.
   */
  async deleteMessage(o: { worldId: number; adminId: number; messageId: number }): Promise<void> {
    this.assertEnabled();
    const channelId = await this.channelFor(this.db as unknown as Tx, o.worldId);
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE chat_messages SET deleted_at = now(), deleted_by = ${o.adminId}
       WHERE id = ${o.messageId} AND channel_id = ${channelId} AND deleted_at IS NULL
      RETURNING id
    `);
    if (rows.length === 0) throw new ChatError('conversation_not_found', 'Mesaj bulunamadı.');

    await this.db.execute(sql`
      INSERT INTO outbox (world_id, topic, payload)
      VALUES (${o.worldId}, 'chat:global:deleted',
              ${JSON.stringify({ channelId, messageId: o.messageId })}::jsonb)
    `);
  }
}
