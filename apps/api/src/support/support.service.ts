/**
 * ⭐⭐ DESTEK / İLETİŞİM SERVİSİ (kullanıcı, 2026-08-14).
 *
 * Oyunun bugüne kadarki tek destek kanalı bir e-posta adresiydi; yani yardım isteme yolu oyunun
 * dışındaydı ve iz bırakmıyordu. Burası o kanalın oyun içi karşılığı.
 *
 * ── DEĞİŞMEZLER ────────────────────────────────────────────────────────────────────────────
 *
 * 1. **Hesap ilişkisi YALNIZ oturumdan kurulur, asla istek yükünden.** Verilen e-postaya bakıp
 *    hesap eşleştirmek iki kapıyı birden açardı: "bu adres kayıtlı mı" varlık sızıntısı ve
 *    başkası adına talep açıp yöneticiye o hesapta işlem yaptırma. Aynı kural `worldId` için de
 *    geçerli (`chat.ts` · dünya yalıtımı).
 * 2. **Yöneticiye mail YALNIZ ilk açılışta** (kullanıcı kararı). Tek-seferlik garanti
 *    `ops-monitor.ts:244` deseniyle: koşullu `UPDATE … RETURNING` ile **önce hakkı al**, maili
 *    sonra yaz. Ters sıra çift posta üretir.
 * 3. **Talebi yalnız yönetici açıp kapatır.** Kapalı talebe oyuncu yazamaz; yeni talep açar.
 * 4. **Doğrulanmamış hesap kısıtından MUAF.** `unverified.ts` kısıtları üç servis boğazında
 *    duruyor ve burası onları hiç çağırmıyor — ⚠️ bu **yapısal** bir muafiyet, unutulmuş değil:
 *    "doğrulama maili gelmedi" tam da destek yazma sebebi. Sohbetin «mesaj yazma yasak» kuralı
 *    buraya kopyalanmamalı.
 * 5. **Mail gönderimi outbox üzerinden** (`mail:send`, payload TAM olarak `{to,subject,html,text}`)
 *    ve talebi yaratan mutasyonla **aynı transaction'da** → "talep açıldı ama haber gitmedi" yok.
 */
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  SUPPORT_CATEGORY_LABEL,
  type SupportCategory, type SupportErrorCode, type SupportMessage,
  type SupportTicketSummary,
} from '@mobilwar/contracts';
import type { Db } from '../db/client.ts';
import { toDate, toDateOrNull } from '../db/client.ts';
import { MAIL } from '../mail/mail.limits.ts';
import {
  supportPendingDigest, supportTicketOpened, supportTicketReceived, supportTicketReplied,
} from '../mail/templates.ts';
import { supportLimits } from './support.limits.ts';
import { deleteAttachment } from './storage.ts';
import { log } from '../common/logger.ts';

const SUP_LOG = log('support');

/** ⚠️ Oyuncuya gösterilen yönetici adı — personel kimliği asla sızmaz. */
export const ADMIN_DISPLAY_NAME = 'Yönetim';

export class SupportError extends Error {
  constructor(readonly code: SupportErrorCode, readonly status = 400) {
    super(code);
    this.name = 'SupportError';
  }
}

/** ⚠️ Yetkisiz erişimde 403 DEĞİL **404**: "bu talep var ama senin değil" bilgisi sızmasın. */
const notFound = (): SupportError => new SupportError('invalid_request', 404);

export interface ActorAuthed {
  kind: 'user';
  accountId: number;
  playerId: number;
  worldId: number;
  username: string;
  email: string;
  emailVerified: boolean;
}
export interface ActorAnon { kind: 'anon'; ip: string }
export type Actor = ActorAuthed | ActorAnon;

const hashToken = (t: string): string => createHash('sha256').update(t).digest('hex');

export class SupportService {
  constructor(private readonly db: Db) {}

  /* ── Okuma ──────────────────────────────────────────────────────────────── */

  /** Bir hesabın talep listesi — **gövdesiz** (liste/gövde ayrımı). */
  async listForAccount(accountId: number): Promise<SupportTicketSummary[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT t.id, t.subject, t.category, t.status, t.last_sender, t.created_at, t.updated_at,
             (SELECT COUNT(*) FROM support_messages m
               WHERE m.ticket_id = t.id AND m.sender = 'admin' AND m.read_at IS NULL)::int
               AS unread
        FROM support_tickets t
       WHERE t.account_id = ${accountId}
       ORDER BY t.updated_at DESC
       LIMIT 200
    `);
    return rows.map(toSummary);
  }

  /**
   * Anonim takip jetonundan talep kimliği.
   *
   * ⚠️ Hash **Node tarafında** hesaplanıp eşitlikle aranıyor; SQL içinde `digest()` çağırmak
   * `pgcrypto` uzantısına bağımlılık yaratırdı (kurulu olmayabilir) ve ham jetonu sorgu
   * günlüklerine düşürürdü.
   * ⚠️ Süresi dolmuş jeton **404** — "vardı ama bitti" ile "hiç yoktu" ayrımı sızmamalı.
   */
  async ticketIdForToken(token: string): Promise<number> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id FROM support_tickets
       WHERE public_token_hash = ${hashToken(token)}
         AND public_token_expires_at > now()
    `);
    const r = rows[0];
    if (!r) throw notFound();
    return Number(r['id']);
  }

  /** Oyuncunun okunmamış yönetici mesajı sayısı — sol menü rozeti. */
  async unreadForAccount(accountId: number): Promise<number> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM support_messages m
        JOIN support_tickets t ON t.id = m.ticket_id
       WHERE t.account_id = ${accountId} AND m.sender = 'admin' AND m.read_at IS NULL
    `);
    return Number(rows[0]?.['n'] ?? 0);
  }

  /**
   * Yazışmayı döndürür ve **yönetici mesajlarını okundu işaretler**.
   * `staff` true ise sahiplik aranmaz (yönetici her talebi görebilir).
   */
  async thread(
    ticketId: number, by: { accountId?: number; token?: string; staff?: boolean },
  ): Promise<{ ticket: SupportTicketSummary; messages: SupportMessage[]; canReply: boolean }> {
    const t = await this.requireTicket(ticketId, by);
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT m.id, m.sender, m.body, m.created_at, m.attachment_id, a.mime AS attachment_mime
        FROM support_messages m
        LEFT JOIN support_attachments a ON a.id = m.attachment_id
       WHERE m.ticket_id = ${ticketId}
       ORDER BY m.id
    `);

    if (!by.staff) {
      await this.db.execute(sql`
        UPDATE support_messages SET read_at = now()
         WHERE ticket_id = ${ticketId} AND sender = 'admin' AND read_at IS NULL
      `);
    }

    /**
     * ⚠️ Yanıt **sözleşmeye daraltılıyor** (`supportTicketSummary`), `requireTicket`in tamamı
     * dökülmüyor. İlk yazımda `{...t}` yayılıyordu ve `email`, `accountId`, `worldId`,
     * `playerId` istemciye sızıyordu — bugün zararsız (hepsi talebin sahibine ait) ama
     * `requireTicket`e yarın eklenecek herhangi bir alan sessizce dışarı çıkardı. Alan listesi
     * açık yazılınca bu sınıf sızıntı yapısal olarak kapanıyor.
     */
    const ticket: SupportTicketSummary = {
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      lastSender: t.lastSender,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      unreadCount: by.staff ? t.unreadCount : 0,
    };

    return {
      ticket,
      messages: rows.map((r) => ({
        id: Number(r['id']),
        sender: String(r['sender']) as 'user' | 'admin',
        authorName: r['sender'] === 'admin' ? ADMIN_DISPLAY_NAME : t.displayName,
        body: String(r['body']),
        attachmentId: r['attachment_id'] == null ? null : Number(r['attachment_id']),
        attachmentMime: r['attachment_mime'] == null ? null : String(r['attachment_mime']),
        createdAt: toDate(r['created_at']).toISOString(),
      })),
      // ⭐ Kapalı talebe YALNIZ yönetici dokunur (kullanıcı şartı).
      canReply: by.staff === true || t.status === 'open',
    };
  }

  /* ── Yazma ──────────────────────────────────────────────────────────────── */

  /**
   * Talep açar; aynı transaction'da ilk mesajı, yöneticiye haber mailini ve (varsa) kullanıcıya
   * "alındı" mailini yazar.
   */
  async create(actor: Actor, input: {
    subject: string; category: SupportCategory; body: string;
    email?: string; attachmentId?: number; website?: string;
  }): Promise<{ ticketId: number; publicToken: string | null }> {
    // ⚠️ BAL KÜPÜ: gerçek kullanıcı bu alanı asla görmez, dolayısıyla asla dolduramaz.
    if (input.website != null && input.website.trim() !== '') {
      throw new SupportError('rejected', 400);
    }

    const lim = supportLimits();
    const authed = actor.kind === 'user' ? actor : null;

    /**
     * ⚠️ E-posta seçimi kullanıcının şartını birebir uyguluyor:
     *  · doğrulanmış hesap  → alan hiç gösterilmez, adres HESAPTAN alınır (istemci gönderse de
     *    yok sayılır — doğrulanmış bir adresi istekle değiştirmek hesap devralma yüzeyi olurdu)
     *  · doğrulanmamış hesap → ön-dolu ama DEĞİŞTİRİLEBİLİR ("kontrol edin" uyarısıyla)
     *  · anonim             → zorunlu
     */
    const email = authed
      ? (authed.emailVerified ? authed.email : (input.email?.trim() || authed.email))
      : input.email?.trim();
    if (!email) throw new SupportError('invalid_request', 400);

    if (authed) {
      const open = await this.db.execute<Record<string, unknown>>(sql`
        SELECT COUNT(*)::int AS n FROM support_tickets
         WHERE account_id = ${authed.accountId} AND status = 'open'
      `);
      if (Number(open[0]?.['n'] ?? 0) >= lim.maxOpenPerAccount) {
        throw new SupportError('too_many_open', 429);
      }
    } else if (actor.kind === 'anon') {
      const recent = await this.db.execute<Record<string, unknown>>(sql`
        SELECT COUNT(*)::int AS n FROM support_tickets
         WHERE account_id IS NULL AND created_ip = ${actor.ip}
           AND created_at > now() - interval '1 hour'
      `);
      if (Number(recent[0]?.['n'] ?? 0) >= lim.anonPerIpPerHour) {
        throw new SupportError('rejected', 429);
      }
    }

    /**
     * ⭐ Anonim takip jetonu — `sessions.refresh_hash` deseni: ham jeton yalnız mailde,
     * veritabanında **sha256**. Kayıtlı kullanıcıya gerek yok (oturumuyla giriyor).
     */
    const publicToken = authed ? null : randomBytes(32).toString('base64url');

    const ticketId = await this.db.transaction(async (tx) => {
      const ins = await tx.execute<Record<string, unknown>>(sql`
        INSERT INTO support_tickets
          (world_id, account_id, player_id, email, display_name, subject, category,
           created_ip, public_token_hash, public_token_expires_at)
        VALUES (${authed?.worldId ?? null}, ${authed?.accountId ?? null},
                ${authed?.playerId ?? null}, ${email},
                ${authed?.username ?? 'Ziyaretçi'}, ${input.subject}, ${input.category},
                ${actor.kind === 'anon' ? actor.ip : null},
                ${publicToken ? hashToken(publicToken) : null},
                ${publicToken
                  ? sql`now() + (${lim.publicTokenDays} * interval '1 day')`
                  : null})
        RETURNING id
      `);
      const id = Number(ins[0]!['id']);

      await this.insertMessage(tx as never, {
        ticketId: id, sender: 'user', body: input.body,
        attachmentId: input.attachmentId ?? null,
        authorAccountId: authed?.accountId ?? null,
      });

      // ⚠️ İlk mesajın eki henüz "yetim"; talebe bağlanması burada olur.
      if (input.attachmentId != null) {
        await tx.execute(sql`
          UPDATE support_attachments SET ticket_id = ${id} WHERE id = ${input.attachmentId}
        `);
      }

      /**
       * ⚠️ ops-monitor deseni: bildirim hakkını ÖNCE al. Burada yeni satır olduğu için koşul
       * kesin doğru, ama desen bilerek korunuyor — yarın "yeniden bildir" gerekirse aynı
       * ifade çift postayı yapısal olarak engelleyecek.
       */
      const claim = await tx.execute<Record<string, unknown>>(sql`
        UPDATE support_tickets SET admin_notified_at = now()
         WHERE id = ${id} AND admin_notified_at IS NULL
        RETURNING id
      `);
      if (claim.length > 0 && MAIL.alertTo) {
        const tpl = supportTicketOpened({
          ticketId: id,
          subject: input.subject,
          category: SUPPORT_CATEGORY_LABEL[input.category],
          body: input.body,
          who: authed ? `${authed.username} <${email}>` : `<${email}>`,
          anonymous: !authed,
          adminUrl: `${MAIL.adminOrigin}/destek?t=${id}`,
        });
        await queueMail(tx as never, MAIL.alertTo, tpl);
      }

      const tpl = supportTicketReceived({
        ticketId: id,
        subject: input.subject,
        url: publicToken
          ? `${MAIL.appOrigin}/destek/t/${publicToken}`
          : `${MAIL.appOrigin}/destek?t=${id}`,
      });
      await queueMail(tx as never, email, tpl);

      await emitChanged(tx as never, id, authed?.worldId ?? null, authed?.playerId ?? null);
      return id;
    });

    return { ticketId, publicToken };
  }

  /** Oyuncu (ya da anonim jeton sahibi) yanıtı. */
  async replyAsUser(
    ticketId: number, by: { accountId?: number; token?: string },
    input: { body: string; attachmentId?: number },
  ): Promise<void> {
    const t = await this.requireTicket(ticketId, by);
    if (t.status !== 'open') throw new SupportError('ticket_closed', 403);
    await this.assertMessageBudget(ticketId);

    await this.db.transaction(async (tx) => {
      await this.insertMessage(tx as never, {
        ticketId, sender: 'user', body: input.body,
        attachmentId: input.attachmentId ?? null,
        authorAccountId: by.accountId ?? null,
      });
      if (input.attachmentId != null) {
        await tx.execute(sql`
          UPDATE support_attachments SET ticket_id = ${ticketId} WHERE id = ${input.attachmentId}
        `);
      }
      await tx.execute(sql`
        UPDATE support_tickets SET last_sender = 'user', updated_at = now() WHERE id = ${ticketId}
      `);
      await emitChanged(tx as never, ticketId, t.worldId, t.playerId);
    });
  }

  /**
   * Yönetici yanıtı — kullanıcıya **her seferinde** mail gider (kullanıcı şartı).
   * Oyun içi bildirim `support:changed` olayından türüyor (`notify.catalog.ts`).
   */
  async replyAsAdmin(
    ticketId: number, adminAccountId: number,
    input: { body: string; attachmentId?: number },
  ): Promise<void> {
    const t = await this.requireTicket(ticketId, { staff: true });
    await this.assertMessageBudget(ticketId);

    await this.db.transaction(async (tx) => {
      await this.insertMessage(tx as never, {
        ticketId, sender: 'admin', body: input.body,
        attachmentId: input.attachmentId ?? null,
        authorAccountId: adminAccountId,
      });
      if (input.attachmentId != null) {
        await tx.execute(sql`
          UPDATE support_attachments SET ticket_id = ${ticketId} WHERE id = ${input.attachmentId}
        `);
      }
      await tx.execute(sql`
        UPDATE support_tickets SET last_sender = 'admin', updated_at = now()
         WHERE id = ${ticketId}
      `);

      const tpl = supportTicketReplied({
        ticketId, subject: t.subject, body: input.body,
        url: t.accountId == null
          ? `${MAIL.appOrigin}/destek`   // anonim: jeton bizde yok (yalnız hash) → giriş sayfası
          : `${MAIL.appOrigin}/destek?t=${ticketId}`,
      });
      await queueMail(tx as never, t.email, tpl);
      await emitChanged(tx as never, ticketId, t.worldId, t.playerId, 'admin');
    });
  }

  /** Aç/kapat — **yalnız yönetici** (kullanıcı şartı). */
  async setStatus(
    ticketId: number, status: 'open' | 'closed', adminPlayerId: number,
  ): Promise<void> {
    const t = await this.requireTicket(ticketId, { staff: true });
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE support_tickets
           SET status = ${status}, updated_at = now(),
               closed_at = ${status === 'closed' ? sql`now()` : null},
               closed_by = ${status === 'closed' ? adminPlayerId : null}
         WHERE id = ${ticketId}
      `);
      await emitChanged(tx as never, ticketId, t.worldId, t.playerId);
    });
  }

  /* ── Yönetici kuyruğu ───────────────────────────────────────────────────── */

  async adminList(q: {
    status?: 'open' | 'closed'; category?: SupportCategory; search?: string;
    page?: number; limit?: number;
  }): Promise<{ rows: (SupportTicketSummary & { email: string; displayName: string })[]; total: number }> {
    const limit = Math.min(100, Math.max(1, q.limit ?? 25));
    const offset = Math.max(0, q.page ?? 0) * limit;
    const conds = [sql`TRUE`];
    if (q.status) conds.push(sql`t.status = ${q.status}`);
    if (q.category) conds.push(sql`t.category = ${q.category}`);
    if (q.search) {
      const like = `%${q.search}%`;
      conds.push(sql`(t.subject ILIKE ${like} OR t.display_name ILIKE ${like} OR t.email ILIKE ${like})`);
    }
    const where = sql.join(conds, sql` AND `);

    const [rows, count] = await Promise.all([
      this.db.execute<Record<string, unknown>>(sql`
        SELECT t.id, t.subject, t.category, t.status, t.last_sender, t.created_at, t.updated_at,
               t.email, t.display_name, t.account_id, 0 AS unread
          FROM support_tickets t WHERE ${where}
         ORDER BY (t.status = 'open' AND t.last_sender = 'user') DESC, t.updated_at DESC
         LIMIT ${limit} OFFSET ${offset}
      `),
      this.db.execute<Record<string, unknown>>(sql`
        SELECT COUNT(*)::int AS n FROM support_tickets t WHERE ${where}
      `),
    ]);

    return {
      rows: rows.map((r) => ({
        ...toSummary(r),
        email: String(r['email']),
        displayName: String(r['display_name']),
      })),
      total: Number(count[0]?.['n'] ?? 0),
    };
  }

  /** Sekme rozeti: bizde bekleyen talep sayısı (kısmî indeksten). */
  async pendingCount(): Promise<number> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM support_tickets
       WHERE status = 'open' AND last_sender = 'user'
    `);
    return Number(rows[0]?.['n'] ?? 0);
  }

  /* ── İç yardımcılar ─────────────────────────────────────────────────────── */

  private async insertMessage(tx: Db, o: {
    ticketId: number; sender: 'user' | 'admin'; body: string;
    attachmentId: number | null; authorAccountId: number | null;
  }): Promise<void> {
    await tx.execute(sql`
      INSERT INTO support_messages (ticket_id, sender, author_account_id, body, attachment_id)
      VALUES (${o.ticketId}, ${o.sender}, ${o.authorAccountId}, ${o.body}, ${o.attachmentId})
    `);
  }

  private async assertMessageBudget(ticketId: number): Promise<void> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM support_messages WHERE ticket_id = ${ticketId}
    `);
    if (Number(rows[0]?.['n'] ?? 0) >= supportLimits().maxMessagesPerTicket) {
      throw new SupportError('rejected', 429);
    }
  }

  /**
   * Talebi getirir ve **yetkiyi doğrular**. Üç kapı: hesap sahipliği · anonim jeton · personel.
   * ⚠️ Hiçbiri tutmazsa **404** — "var ama senin değil" bilgisi bile sızmamalı.
   */
  private async requireTicket(
    ticketId: number, by: { accountId?: number; token?: string; staff?: boolean },
  ): Promise<SupportTicketSummary & {
    email: string; displayName: string; accountId: number | null;
    worldId: number | null; playerId: number | null;
  }> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT t.id, t.subject, t.category, t.status, t.last_sender, t.created_at, t.updated_at,
             t.email, t.display_name, t.account_id, t.world_id, t.player_id,
             t.public_token_hash, t.public_token_expires_at,
             (SELECT COUNT(*) FROM support_messages m
               WHERE m.ticket_id = t.id AND m.sender = 'admin' AND m.read_at IS NULL)::int
               AS unread
        FROM support_tickets t WHERE t.id = ${ticketId}
    `);
    const r = rows[0];
    if (!r) throw notFound();

    const accountId = r['account_id'] == null ? null : Number(r['account_id']);
    let ok = by.staff === true;
    if (!ok && by.accountId != null && accountId != null) ok = accountId === by.accountId;
    if (!ok && by.token) {
      const exp = toDateOrNull(r['public_token_expires_at']);
      ok = r['public_token_hash'] === hashToken(by.token)
        && exp != null && exp.getTime() > Date.now();
    }
    if (!ok) throw notFound();

    return {
      ...toSummary(r),
      email: String(r['email']),
      displayName: String(r['display_name']),
      accountId,
      worldId: r['world_id'] == null ? null : Number(r['world_id']),
      playerId: r['player_id'] == null ? null : Number(r['player_id']),
    };
  }
}

/* ── Modül seviyesi yardımcılar ─────────────────────────────────────────────── */

function toSummary(r: Record<string, unknown>): SupportTicketSummary & { displayName: string } {
  return {
    id: Number(r['id']),
    subject: String(r['subject']),
    category: String(r['category']) as SupportCategory,
    status: String(r['status']) as 'open' | 'closed',
    lastSender: String(r['last_sender']) as 'user' | 'admin',
    createdAt: toDate(r['created_at']).toISOString(),
    updatedAt: toDate(r['updated_at']).toISOString(),
    unreadCount: Number(r['unread'] ?? 0),
    displayName: r['display_name'] == null ? '' : String(r['display_name']),
  };
}

/**
 * ⚠️ Payload sözleşmesi **TAM OLARAK** `{to, subject, html, text}` — worker'ın sink'i
 * (`worker.ts`) başka alan okumaz. `world_id` NULL: posta dünya-üstü.
 */
async function queueMail(
  tx: Db, to: string, tpl: { subject: string; html: string; text: string },
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO outbox (world_id, topic, payload)
    VALUES (NULL, 'mail:send', ${JSON.stringify({
    to, subject: tpl.subject, html: tpl.html, text: tpl.text,
  })}::jsonb)
  `);
}

/**
 * ⚠️ **Yeni outbox konusu eklemek yetmez**: `eventForOutbox` ve `notificationForOutbox`'a case
 * eklenmezse satır sessizce "teslim edildi" olur ve hiçbir şey üretmez (`worker.ts`teki
 * `admin:abuse_report` arızasının aynısı).
 */
async function emitChanged(
  tx: Db, ticketId: number, worldId: number | null, playerId: number | null,
  by: 'user' | 'admin' = 'user',
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO outbox (world_id, topic, payload)
    VALUES (${worldId}, 'support:changed',
            ${JSON.stringify({ ticketId, playerId, by })}::jsonb)
  `);
}

/**
 * ⭐ GÜNLÜK ÖZET — yöneticinin oyuncu yanıtları için mail almamasının telafisi.
 *
 * ⚠️ Günde en fazla bir kez: `notified_at` yerine **son özetten beri değişmiş** talepler
 * sayılıyor ve `settings` tablosuna değil `ops_events`e de yazılmıyor — sayaç, çağıranın
 * (görevin) kendi zamanlamasında. Görev günde bir koşuyor, o yüzden ek bir kilit gerekmiyor.
 *
 * @returns gönderildiyse bekleyen talep sayısı, gönderilmediyse 0
 */
export async function sendPendingDigest(db: Db, olderThanHours = 24): Promise<number> {
  if (!MAIL.alertTo) return 0;
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT COUNT(*)::int AS n,
           COALESCE(EXTRACT(EPOCH FROM (now() - MIN(updated_at))) / 3600, 0)::int AS oldest_hours
      FROM support_tickets
     WHERE status = 'open' AND last_sender = 'user'
       AND updated_at < now() - (${olderThanHours} * interval '1 hour')
  `);
  const n = Number(rows[0]?.['n'] ?? 0);
  if (n === 0) return 0;

  const tpl = supportPendingDigest({
    count: n,
    oldestHours: Number(rows[0]?.['oldest_hours'] ?? 0),
    adminUrl: `${MAIL.adminOrigin}/destek`,
  });
  await queueMail(db, MAIL.alertTo, tpl);
  return n;
}

/**
 * ⭐ YETİM EK SÜPÜRÜCÜSÜ — yüklenip hiçbir mesaja iliştirilmemiş dosyalar.
 *
 * ⚠️ Sıra: **önce dosya, sonra satır**. Ters sıra ulaşılamaz çöp bırakır (satır gidince
 * `storage_key` de gider ve dosyayı bir daha kimse bulamaz). `ENOENT` tolere ediliyor —
 * temizlik idempotent olmalı.
 */
export async function sweepOrphanAttachments(db: Db, hours: number): Promise<number> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT id, storage_key FROM support_attachments
     WHERE ticket_id IS NULL AND created_at < now() - (${hours} * interval '1 hour')
     LIMIT 500
  `);
  let n = 0;
  for (const r of rows) {
    try {
      await deleteAttachment(String(r['storage_key']));
      await db.execute(sql`DELETE FROM support_attachments WHERE id = ${Number(r['id'])}`);
      n++;
    } catch (err) {
      SUP_LOG.warn({ err, id: r['id'] }, 'yetim ek silinemedi');
    }
  }
  return n;
}
