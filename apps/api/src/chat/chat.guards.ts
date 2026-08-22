/**
 * ⭐ SOHBET MUHAFIZLARI — DM ile İTTİFAK SOHBETİNİN PAYLAŞTIĞI kurallar (§13.12, §13.15c).
 *
 * `ChatService.send()` doğduğunda tek sohbet türü vardı ve bütün adımlar tek metodun içindeydi.
 * İttifak sohbeti gelince adımların çoğunun **DM'e özgü olmadığı** görüldü: sohbet yasağı,
 * e-posta doğrulaması, idempotency, kova ve mükerrer kontrolü her sohbet türü için aynı.
 * Burası o ortak katman; iki servis de buradan geçer.
 *
 * ⚠️ **ADIM SIRASI KURALLARI BU DOSYADA DEĞİL, ÇAĞIRANDA.** Kontrollerin hangi sırayla
 * koşacağı bir hatadan öğrenilmiş bilgidir (bkz. `chat.service.ts` `send()` yorumları) ve
 * sıra sohbet türüne göre değişebiliyor. Buradaki fonksiyonlar tek tek "hayır" diyebilen
 * bağımsız kapılar; sırayı kuran çağıran servistir.
 *
 * ⚠️ Bu dosya bir REFACTOR ürünü: davranış **birebir** korunmalı. Kabul ölçütü
 * `apps/api/test/chat.test.ts`in tek satır değişmeden yeşil kalması.
 */
import { formatGameTime } from '@mobilwar/contracts';
import { sql } from 'drizzle-orm';
import {
  isVerified, UNVERIFIED_CODE, UNVERIFIED_MESSAGE, unverifiedLimits,
} from '../auth/unverified.ts';
import type { Db } from '../db/client.ts';
import { chatLimits } from './chat.limits.ts';
import { termsAccepted } from './chat.terms.ts';

export type Tx = Pick<Db, 'execute'>;

export class ChatError extends Error {
  constructor(readonly code: string, message: string, readonly retryAfterSeconds?: number) {
    super(message);
  }
}

/* ── Sohbet yasağı (küresel, yöneticiden) ─────────────────────────────────── */

/**
 * ⭐⭐ YASAĞIN KAPSAMI (`chat_bans.scope`) — 2026-08-10'da **okunmaya başladı**.
 *
 * `'all'`    → her yerde yazamaz (özel mesaj · ittifak sohbeti · genel sohbet).
 * `'global'` → **YALNIZ genel sohbette** yazamaz; özel mesajı ve ittifak sohbeti açık kalır.
 *
 * ⚠️ Kolon şemada doğduğu günden beri vardı ama `assertNotBanned` ona **hiç bakmıyordu**:
 * hangi kapsamla yazılırsa yazılsın yasak her kanalı kapatıyordu. Şemadaki yorum bunu zaten
 * geçici sayıyordu (*"`all` = özel mesaj + (ileride) genel sohbet"*). Genel sohbetin kendi
 * susturması gelince kolonun anlam kazanması ZORUNLU oldu — aksi hâlde "sohbette sustur"
 * demek, oyuncunun bütün özel yazışmalarını da kesmek olurdu.
 *
 * ⚠️ Panelin varsayılanı `'all'` olduğu için **mevcut yasaklar aynen çalışmaya devam eder**;
 * değişen tek şey, bugüne kadar hiç yazılmamış olan `'global'` kapsamının artık dar olması.
 */
export type BanScope = 'global' | 'other';

/**
 * ⭐ Oyuncunun `where` kapsamında AKTİF sohbet yasağı (yoksa `null`).
 *
 * ⚠️ `until IS NULL` = **süresiz** yasak, `until > now()` süreli. Süresi geçmiş satır
 * SİLİNMEZ — moderasyon geçmişi kalıcı olmalı; yalnız etkisiz sayılır.
 * ⚠️ `where` verilmezse **hepsi** sayılır: panel «bu oyuncunun yasağı var mı» diye sorarken
 * kapsam ayrımı yapmıyor, orada tek bir satır göstermek yeterli.
 */
export async function activeBan(
  tx: Tx, worldId: number, playerId: number, where?: BanScope,
): Promise<{ scope: string; until: Date | null; reason: string | null } | null> {
  /* `'other'` (DM/ittifak) YALNIZ `all` kapsamından etkilenir; genel sohbeti ikisi de kapatır. */
  const scopeFilter = where === 'other' ? sql`AND scope = 'all'` : sql``;
  const [row] = await tx.execute<Record<string, unknown>>(sql`
    SELECT scope, until, reason FROM chat_bans
     WHERE world_id = ${worldId} AND player_id = ${playerId}
       AND (until IS NULL OR until > now())
       ${scopeFilter}
     ORDER BY until IS NULL DESC, until DESC
     LIMIT 1
  `);
  if (!row) return null;
  return {
    scope: String(row['scope']),
    until: row['until'] == null ? null : new Date(String(row['until'])),
    reason: row['reason'] == null ? null : String(row['reason']),
  };
}

/**
 * Yasaklıysa fırlatır. ⚠️ Mesaj **gönderilemez** (kullanıcı kararı) ama oyuncu **okumaya
 * devam eder**: kendisine yazılanı görebilmeli, yoksa ceza "sohbetten silinmek" olurdu.
 * Aynı kural üç sohbet türünde de geçerli.
 *
 * @param where Hangi kanal soruyor — kapsam ayrımının tamamı bu parametrede (bkz. `BanScope`).
 */
export async function assertNotBanned(
  tx: Tx, worldId: number, playerId: number, where: BanScope,
): Promise<void> {
  const ban = await activeBan(tx, worldId, playerId, where);
  if (!ban) return;
  /**
   * ⚠️ `toLocaleString('tr-TR')` DEĞİL — o, biçimi Türkçe yapar ama **saat dilimini SÜRECİN
   * `TZ`'sine bırakır** ve sunucu UTC'de koşuyor. Oyuncu «19:51'e kadar» görürken yönetim
   * paneli aynı anı «22:51» gösteriyordu: 3 saatlik, açıklaması olmayan bir çelişki.
   * `formatGameTime` zaman dilimini açıkça `Europe/Istanbul` veriyor (`packages/contracts`).
   */
  const until = ban.until
    ? `${formatGameTime(ban.until)} tarihine kadar`
    : 'süresiz olarak';
  const reason = ban.reason ? ` Sebep: ${ban.reason}` : '';
  /**
   * ⚠️ Metin kapsamı SÖYLÜYOR. Dar kapsamlı bir yasakta "Sohbet yasağın var" demek yanlış
   * bilgi olurdu: oyuncu özel mesajlarının da kesildiğini sanıp denemeyi bırakırdı.
   */
  const what = ban.scope === 'global' ? 'Genel sohbet yasağın' : 'Sohbet yasağın';
  throw new ChatError(
    'chat_banned',
    `${what} var — ${until} mesaj gönderemezsin.${reason}`,
    ban.until ? Math.max(1, Math.ceil((ban.until.getTime() - Date.now()) / 1000)) : undefined,
  );
}

/** §verify — DOĞRULANMAMIŞ hesap mesaj YAZAMAZ (okumak serbest). */
export async function assertVerifiedToChat(tx: Tx, playerId: number): Promise<void> {
  if (!unverifiedLimits().enabled) return;
  if (await isVerified(tx as never, playerId)) return;
  throw new ChatError(UNVERIFIED_CODE, UNVERIFIED_MESSAGE.chat);
}

/* ── Idempotency ──────────────────────────────────────────────────────────── */

export interface StoredMessage {
  id: number;
  body: string;
  createdAt: Date;
}

/**
 * ⭐ YENİDEN DENEME mi? — `client_msg_id` zaten yazılmışsa bu bir AĞ TEKRARIDIR.
 *
 * ⚠️ Çağıran bunu **her şeyden önce** sormalı ve satır bulunursa hiçbir limite bakmadan
 * döndürmeli: aksi hâlde bağlantısı kopan istemci aynı mesajı yeniden yolladığında
 * "aynı mesajı az önce gönderdin" reddi alır ve mesaj GÖNDERİLMİŞ olmasına rağmen
 * kaybolmuş görünür. (`chat.test.ts` bu hatayı bir kez yakaladı.)
 */
export async function findRetry(
  tx: Tx, channelId: number, clientMsgId: string,
): Promise<StoredMessage | null> {
  const [row] = await tx.execute<Record<string, unknown>>(sql`
    SELECT id, created_at, body FROM chat_messages
     WHERE channel_id = ${channelId} AND client_msg_id = ${clientMsgId}::uuid
  `);
  if (!row) return null;
  return {
    id: Number(row['id']),
    body: String(row['body']),
    createdAt: new Date(String(row['created_at'])),
  };
}

/* ── Kova + mükerrer ──────────────────────────────────────────────────────── */

export interface FlowLimits {
  /** `perSeconds` içinde en fazla `burst` mesaj. */
  burst: number;
  perSeconds: number;
  /** Aynı metnin tekrar gönderilemeyeceği süre. 0 → kontrol kapalı. */
  duplicateSeconds: number;
  /** İki mesaj arasındaki asgarî süre. 0 → kapalı. Yalnız ittifak sohbetinde kullanılıyor. */
  slowModeSeconds?: number;
}

/**
 * Kova · mükerrer mesaj · yavaş mod — **tek sorguda**.
 *
 * ⚠️⚠️ **`scope` NEDEN VAR — İKİ KOVA BİRBİRİNİ YEMEMELİ.**
 *
 * DM kovası `sender_id` üzerinden oyuncunun **bütün DM kanallarını** sayar (`'dm'`), ittifak
 * kovası ise yalnız o kanalı (`'channel'`). Ortak olsalardı iki yönlü bir sızıntı olurdu:
 * hareketli bir ittifak sohbeti oyuncunun özel mesaj hakkını yerdi **ve** bir DM spamcısı
 * ittifakta yazarak kotasını temizlerdi.
 *
 * ⚠️ `'dm'` kapsamının `kind = 'dm'` süzgeci ŞART. Bir süre süzgeçsizdi (`sender_id` + zaman)
 * ve ittifak sohbetine yazılan her mesaj DM kovasını da dolduruyordu — yalıtım tek yönlü
 * kalmıştı. `alliance-chat.test.ts`teki "kova KANAL BAŞINA" testi bunu yakaladı.
 *
 * ⚠️ `body` **kırpılmış** gelmeli — mükerrer karşılaştırması DB'ye yazılan dizeyle aynı
 * olmalı, yoksa "aynı mesaj" hiç yakalanmaz.
 */
export async function assertFlowOk(tx: Tx, o: {
  playerId: number;
  channelId: number;
  body: string;
  scope: 'dm' | 'channel';
  limits: FlowLimits;
}): Promise<void> {
  const { limits } = o;
  /**
   * Kova kapsamı. `'channel'` tek kanalı sayar; `'dm'` oyuncunun TÜM DM kanallarını sayar
   * ama ittifak/genel kanallarını **saymaz** (yukarıdaki iki yönlü yalıtım).
   */
  const bucketScope = o.scope === 'channel'
    ? sql`AND channel_id = ${o.channelId}`
    : sql`AND EXISTS (SELECT 1 FROM chat_channels c
                       WHERE c.id = chat_messages.channel_id AND c.kind = 'dm')`;

  const [row] = await tx.execute<Record<string, unknown>>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM chat_messages
        WHERE sender_id = ${o.playerId} ${bucketScope}
          AND created_at > now() - (${limits.perSeconds} || ' seconds')::interval) AS recent,
      (SELECT COUNT(*)::int FROM chat_messages
        WHERE sender_id = ${o.playerId} AND channel_id = ${o.channelId} AND body = ${o.body}
          AND created_at > now() - (${limits.duplicateSeconds} || ' seconds')::interval) AS dup,
      (SELECT EXTRACT(EPOCH FROM (now() - MAX(created_at)))::int FROM chat_messages
        WHERE sender_id = ${o.playerId} AND channel_id = ${o.channelId}) AS since_last
  `);

  if (Number(row?.['recent'] ?? 0) >= limits.burst) {
    throw new ChatError('rate_limited', 'Çok hızlı yazıyorsun, biraz bekle.', limits.perSeconds);
  }
  if (limits.duplicateSeconds > 0 && Number(row?.['dup'] ?? 0) > 0) {
    throw new ChatError('duplicate_message', 'Aynı mesajı az önce gönderdin.', limits.duplicateSeconds);
  }

  /**
   * ⭐ YAVAŞ MOD — kovadan farkı: kova ANİ patlamayı, bu SÜREKLİ akışı frenler.
   * ⚠️ `since_last` NULL ise (ilk mesaj) kontrol atlanır; `Number(null)` 0 verir ve ilk
   * mesajı reddederdi, o yüzden açıkça null kontrolü yapılıyor.
   */
  const slow = limits.slowModeSeconds ?? 0;
  const sinceLast = row?.['since_last'];
  if (slow > 0 && sinceLast != null && Number(sinceLast) < slow) {
    const wait = slow - Number(sinceLast);
    throw new ChatError('slow_mode', `Yavaş mod açık — ${wait} saniye sonra tekrar yazabilirsin.`, wait);
  }
}

/* ── Yazma ────────────────────────────────────────────────────────────────── */

/**
 * Mesaj satırını yazar. `client_msg_id` idempotency: yeniden denemede çift satır oluşmaz;
 * çakışırsa var olan satır okunup döndürülür (yarış koruması).
 */
export async function insertMessage(tx: Tx, o: {
  channelId: number; worldId: number; senderId: number; body: string; clientMsgId: string;
  mentions?: unknown;
}): Promise<StoredMessage> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    INSERT INTO chat_messages (channel_id, world_id, sender_id, body, client_msg_id, mentions)
    VALUES (${o.channelId}, ${o.worldId}, ${o.senderId}, ${o.body}, ${o.clientMsgId}::uuid,
            ${JSON.stringify(o.mentions ?? [])}::jsonb)
    ON CONFLICT (channel_id, client_msg_id) DO NOTHING
    RETURNING id, created_at
  `);
  let row = rows[0];
  if (!row) {
    const [again] = await tx.execute<Record<string, unknown>>(sql`
      SELECT id, created_at FROM chat_messages
       WHERE channel_id = ${o.channelId} AND client_msg_id = ${o.clientMsgId}::uuid
    `);
    row = again;
  }
  return {
    id: Number(row!['id']),
    body: o.body,
    createdAt: new Date(String(row!['created_at'])),
  };
}

/* ── Sohbet kuralı onayı (H1, 2026-08-22) ─────────────────────────────────── */

/**
 * ⭐⭐ KURAL ONAYI KAPISI — onaylamayan **yazamaz**, okumaya dokunulmaz.
 *
 * ⚠️⚠️ **YALNIZ YAZMA kapatılıyor, OKUMA değil.** Tasarım notunda bir ara *"alıcı onaylamadan
 * mesajı göremez"* de yazıyordu; uygularken vazgeçildi ve gerekçesi şu: okumayı kapatmak,
 * birine ulaşmaya çalışan oyuncunun mesajını rehin alır ve kötü niyetli birinin karşısındakine
 * zorla bir onay penceresi açtırmasına yol açardı. Kullanıcının istediği de *"ilk mesajdan
 * ÖNCE onay"*, yani gönderme tarafı. §verify kapısı da (doğrulanmamış hesap yazamaz, okur)
 * tam olarak bu ayrımı kuruyor.
 *
 * ⚠️ Kapı `chat.termsRequired` KAPALIYKEN hiç çalışmıyor: onayı bilmeyen eski bir istemci
 * anlamadığı bir hatayla karşılaşmasın (gerekçe `chat.limits.ts`te).
 */
export async function assertChatTermsAccepted(
  tx: Tx,
  o: { playerId: number; channelId?: number },
): Promise<void> {
  if (!chatLimits().termsRequired) return;

  /* ⚠️ İki AYRI kapsam, iki ayrı satır:
       • `channelId` VARSA özel mesaj → onay o yazışmaya ait (`chat_participants`).
       • yoksa ittifak sohbeti → onay oyun başına (`players`). */
  const [row] = o.channelId == null
    ? await tx.execute<Record<string, unknown>>(sql`
        SELECT chat_terms_version AS v FROM players WHERE id = ${o.playerId}
      `)
    : await tx.execute<Record<string, unknown>>(sql`
        SELECT terms_version AS v FROM chat_participants
         WHERE channel_id = ${o.channelId} AND player_id = ${o.playerId}
      `);

  /* ⚠️ Satır YOKSA da onaysız sayılıyor: katılımcı satırı kanal açılırken yaratılıyor ve
     olmaması normal bir durum değil, ama burada iyimser davranmak kapıyı delerdi. */
  if (termsAccepted(row?.['v'] == null ? 0 : Number(row['v']))) return;

  throw new ChatError(
    CHAT_TERMS_CODE,
    'Yazmadan önce sohbet kurallarını onaylaman gerekiyor.',
  );
}

/** İstemcinin tanıdığı kod — kural penceresini bu kodda açıyor. */
export const CHAT_TERMS_CODE = 'terms_required';
