/**
 * ⭐ İTTİFAK ÇEKİRDEĞİ (§13.15 / §13.15b).
 *
 * Roller orijinal istemcinin `q` alanı (`k.java`): **1 Asker · 2 Konsey Üyesi · 3 Lider**.
 * Yetki matrisi (kullanıcı kararları, 2026-07-30 — istemcideki "at yalnız lider" kapısından
 * BİLİNÇLİ sapma; kullanıcı ve oyunun dokümanı konseye de atma yetkisi veriyor):
 *
 *   • Davet gönder + davet/başvuru kabul-red ... Konsey + Lider
 *   • İttifaktan At ........................... Konsey (yalnız Asker'i) · Lider (herkesi)
 *   • Metin düzenle · İttifağa Mesaj .......... Konsey + Lider
 *   • Konseye Al/Çıkar · Devir · Ad · Dağıt ... yalnız Lider
 *   • Ayrıl ................................... herkes; LİDER yalnız tek üyeyse (o zaman
 *     ittifak dağılır), değilse önce Liderlik Devri (kullanıcı kararı)
 *
 * Üyelik çoğunlukla tek yardımcıdan geçer (`applyMembership`): players güncellenir,
 * `alliance:changed` outbox'ı yazılır, gateway'in soket odaları senkronlanır (atılan üye ittifak
 * odasından ANINDA düşer — çevrimiçi bilgisi yalnız üyeler arasında görünür kuralının güvencesi).
 *
 * ⚠️ **TEK İSTİSNA `decide()`**: davet/başvuru kabulü, yarış koruması için kendi koşullu
 * `UPDATE players SET alliance_id … WHERE alliance_id IS NULL` sorgusunu yazıyor ve
 * `applyMembership`ten GEÇMİYOR. Bu satır uzun süre "üyelik tek yerden geçer" diyordu ve
 * yanlıştı; katılıma bir kural eklerken (§verify) iki yere birden eklemek gerekiyor.
 */
import { sql } from 'drizzle-orm';
import {
  isVerified, UNVERIFIED_CODE, UNVERIFIED_MESSAGE, unverifiedLimits,
} from '../auth/unverified.ts';
import type { Db } from '../db/client.ts';

/** Transaction tutamacı — `db.transaction` callback'inin tipi (handler-registry'deki Tx ikizi). */
type Tx = Pick<Db, 'execute'>;

/** Kurma şartı (§13.15): herhangi bir şehirde Kale ≥ 5. Liste veri olarak büyüyecek. */
export const ALLIANCE_RULES = {
  minCastleLevel: 5,
  nameMin: 3,
  nameMax: 10,
  textMax: 500,
  /** Ayrılma sonrası yeniden katılma bekleme süresi (saat) — topluluk fikri, şimdilik kapalı. */
  cooldownHoursAfterLeave: 0,
} as const;

export const ROLE = { MEMBER: 1, COUNCIL: 2, LEADER: 3 } as const;

export class AllianceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export interface MemberRow {
  playerId: number;
  username: string;
  score: number;
  role: number;
  worldRank: number | null;
}

/** `assertCanModerate`in ihtiyacı olan asgarî künye — iki servis de bunu kendi sorgusundan üretir. */
export interface ModerationSubject {
  playerId: number;
  allianceId: number | null;
  role: number;
}

/**
 * ⭐ ÜYE ÜZERİNDE MODERASYON YETKİSİ — «At» ve «Sustur» **AYNI** matrise bakar (kullanıcı kararı).
 *
 * | Yapan | Hedef Asker | Hedef Konsey | Hedef Lider | Kendisi |
 * |---|---|---|---|---|
 * | Asker  | ✗ | ✗ | ✗ | ✗ |
 * | Konsey | ✓ | ✗ | ✗ | ✗ |
 * | Lider  | ✓ | ✓ | ✗ | ✗ |
 *
 * ⚠️ **SAF fonksiyon, DB'ye gitmiyor** — `AllianceChatService`in `AllianceService`e bağımlı
 * olmaması için. İki taraf da kilitli satırlarını kendi okur, yalnız kararı buraya sorar.
 *
 * ⚠️ Matris iki yerde ayrı yazılsaydı biri güncellenip diğeri unutulurdu; tek yerde olması
 * "atabildiğim üyeyi susturabilirim de" beklentisini yapısal olarak garanti ediyor.
 */
export function assertCanModerate(
  me: ModerationSubject, target: ModerationSubject, verb: 'kick' | 'mute',
): void {
  const noun = verb === 'kick' ? 'atabilir' : 'susturabilir';
  if (target.allianceId !== me.allianceId) {
    throw new AllianceError('not_same_alliance', 'Oyuncu ittifağında değil.');
  }
  if (target.playerId === me.playerId) {
    throw new AllianceError(
      verb === 'kick' ? 'cannot_kick_self' : 'mute_self',
      verb === 'kick'
        ? 'Kendini atamazsın — İttifaktan Ayrıl kullan.'
        : 'Kendini susturamazsın.',
    );
  }
  if (me.role !== ROLE.LEADER && target.role >= ROLE.COUNCIL) {
    throw new AllianceError('hierarchy', `Konsey yalnız Asker rütbesindeki üyeleri ${noun}.`);
  }
  if (target.role === ROLE.LEADER) {
    throw new AllianceError('hierarchy', verb === 'kick' ? 'Lider atılamaz.' : 'Lider susturulamaz.');
  }
}

export class AllianceService {
  constructor(private readonly db: Db) { }

  /* ── Okumalar ─────────────────────────────────────────────────────────────── */

  async myMembership(playerId: number): Promise<{ allianceId: number | null; role: number }> {
    const [r] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT alliance_id, alliance_role FROM players WHERE id = ${playerId}
    `);
    return {
      allianceId: r?.['alliance_id'] == null ? null : Number(r['alliance_id']),
      role: r?.['alliance_role'] == null ? 0 : Number(r['alliance_role']),
    };
  }

  /** Kurma şartı denetimi — arayüz "Kale 5 gerekli (şu an N)" mesajını bundan üretir. */
  async canFound(playerId: number): Promise<{ ok: boolean; need: number; current: number }> {
    const [r] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COALESCE(MAX(b.level), 0) AS castle
        FROM buildings b JOIN cities c ON c.id = b.city_id
       WHERE c.player_id = ${playerId} AND b.type = 'castle'
    `);
    const current = Number(r?.['castle'] ?? 0);
    return { ok: current >= ALLIANCE_RULES.minCastleLevel, need: ALLIANCE_RULES.minCastleLevel, current };
  }

  /* ── Kurma / dağıtma / ayrılma ────────────────────────────────────────────── */

  async found(o: { worldId: number; playerId: number; name: string }): Promise<{ id: number; name: string }> {
    const name = o.name.trim();
    if (name.length < ALLIANCE_RULES.nameMin || name.length > ALLIANCE_RULES.nameMax) {
      throw new AllianceError('bad_name', `İttifak adı ${ALLIANCE_RULES.nameMin}-${ALLIANCE_RULES.nameMax} karakter olmalı.`);
    }
    const gate = await this.canFound(o.playerId);
    if (!gate.ok) {
      throw new AllianceError('castle_required',
        `İttifak kurmak için Kale ${gate.need} gerekli (şu an ${gate.current}).`);
    }

    return this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      if (me.allianceId != null) throw new AllianceError('already_member', 'Zaten bir ittifaktasın.');

      let created: Record<string, unknown> | undefined;
      try {
        [created] = await tx.execute<Record<string, unknown>>(sql`
          INSERT INTO alliances (world_id, name, leader_id) VALUES (${o.worldId}, ${name}, ${o.playerId})
          RETURNING id, name
        `);
      } catch (err) {
        if (String(err).includes('alliances_world_name')) {
          throw new AllianceError('name_taken', 'Bu isimde bir ittifak zaten var.');
        }
        throw err;
      }
      const allianceId = Number(created!['id']);
      await this.applyMembership(tx as never, {
        worldId: o.worldId, playerId: o.playerId, allianceId, role: ROLE.LEADER,
      });
      return { id: allianceId, name };
    });
  }

  /**
   * Ayrıl. ⭐ Lider yalnız TEK üyeyse ayrılabilir — o zaman ittifak kendiliğinden dağılır;
   * başka üye varsa önce Liderlik Devri (kullanıcı kararı: lidersiz ittifak kalamaz).
   */
  async leave(o: { worldId: number; playerId: number }): Promise<{ disbanded: boolean }> {
    return this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      if (me.allianceId == null) throw new AllianceError('not_member', 'Bir ittifakta değilsin.');

      if (me.role === ROLE.LEADER) {
        const [cnt] = await tx.execute<Record<string, unknown>>(sql`
          SELECT COUNT(*)::int AS n FROM players WHERE alliance_id = ${me.allianceId}
        `);
        if (Number(cnt!['n']) > 1) {
          throw new AllianceError('leader_must_transfer',
            'Lider ittifaktan ayrılamaz — önce Liderlik Devri yapmalısın.');
        }
        await this.disbandInner(tx as never, o.worldId, me.allianceId, o.playerId);
        return { disbanded: true };
      }

      /**
       * ⭐ Ayrılma bildirimi (kullanıcı, 2026-08-06): yönetim üye kaybını fark etmeliydi.
       * ⚠️ Yönetim listesi `applyMembership`ten SONRA okunuyor — ayrılan oyuncunun
       * `alliance_id`si o noktada zaten NULL, yani Konsey üyesi ayrılsa bile kendine mesaj
       * yazmıyor. Ayrı bir "kendini süz" koşuluna gerek kalmadan doğru oluyor.
       */
      const allianceId = me.allianceId;
      await this.applyMembership(tx as never, {
        worldId: o.worldId, playerId: o.playerId, allianceId: null, role: 0,
        noticeAllianceId: allianceId,
      });
      for (const managerId of await this.managerIds(tx as never, allianceId)) {
        await this.notice(tx as never, {
          worldId: o.worldId, playerId: managerId,
          subject: 'Bir üye ittifaktan ayrıldı',
          text: `${me.username} ittifaktan kendi isteğiyle ayrıldı.`,
          extra: { allianceId, playerId: o.playerId, reason: 'left' },
        });
      }
      return { disbanded: false };
    });
  }

  async disband(o: { worldId: number; playerId: number }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      this.require(me, ROLE.LEADER);
      await this.disbandInner(tx as never, o.worldId, me.allianceId!, o.playerId);
    });
  }

  private async disbandInner(
    tx: Tx, worldId: number, allianceId: number, actorId: number,
  ): Promise<void> {
    /**
     * ⭐ AD, SİLMEDEN ÖNCE OKUNUR. Bildirim `alliances` satırı DELETE edildikten sonra
     * yazılıyor; id'den ad çözmenin yolu o noktada kalmıyor. Mesajda "ittifakın dağıtıldı"
     * demek yetmez — oyuncu hangi ittifaktan bahsedildiğini bilmeli.
     */
    const [row] = await tx.execute<Record<string, unknown>>(sql`
      SELECT name FROM alliances WHERE id = ${allianceId}
    `);
    const name = String(row?.['name'] ?? '');

    // Üyeler tek UPDATE ile boşa düşer; bekleyen davet/başvurular iptal olur; kayıt silinir
    // (invites CASCADE ama durumu netlemek için önce iptale çekiyoruz — denetim izi kalsın diye
    // silinen ittifakla birlikte gitmeleri sorun değil).
    const members = await tx.execute<Record<string, unknown>>(sql`
      UPDATE players SET alliance_id = NULL, alliance_role = NULL, alliance_joined_at = NULL
       WHERE alliance_id = ${allianceId} RETURNING id
    `);
    await tx.execute(sql`
      UPDATE alliance_invites SET status = 'canceled', decided_at = now()
       WHERE alliance_id = ${allianceId} AND status = 'pending'
    `);
    /**
     * ⭐⭐ BU SATIR SOHBETİ DE SİLİYOR — ve bu KASITLI (§13.15c, kullanıcı şartı:
     * *"İttifak dağıtılırsa ittifak sohbeti mesajları da kalıcı olarak silinir"*).
     *
     * Zincir: `alliances` DELETE → `chat_channels` (alliance_id FK, cascade) →
     * `chat_messages` (channel_id FK, cascade) + `alliance_chat_mutes` (cascade).
     *
     * ⚠️ **Buraya elle `DELETE FROM chat_messages` YAZMA.** Kural veritabanında duruyor;
     * ikinci bir kopyası bir gün güncellenmeyi unutulan bir adım olurdu. Sohbetin gerçekten
     * gittiğini `alliance-chat.test.ts` doğruluyor.
     * ⚠️ `chat_reports` KALIR (FK'siz + `body_snapshot` taşıyor) — doğrusu bu: şikayet kaydı
     * şikayet ettiği kanaldan uzun yaşamalı.
     */
    await tx.execute(sql`DELETE FROM alliances WHERE id = ${allianceId}`);

    /**
     * ⭐ Dağıtma bildirimi (kullanıcı, 2026-08-06) — üye ittifağını habersiz kaybediyordu.
     * ⚠️ **Dağıtanın kendisine yazılmaz.** `leave()` son üye liderle buraya düştüğünde tek
     * "üye" zaten o kişidir; ona "ittifakın dağıtıldı" demek kendi tıkladığı düğmeyi haber
     * vermek olurdu. Süzgeç iki çağrı yerini de tek kuralla doğru yapıyor.
     */
    for (const m of members) {
      const memberId = Number(m['id']);
      if (memberId === actorId) continue;
      await this.notice(tx, {
        worldId, playerId: memberId,
        subject: 'İttifak dağıtıldı',
        text: `${name} ittifağı lideri tarafından dağıtıldı. Artık bir ittifakta değilsin.`,
        extra: { allianceId, allianceName: name, reason: 'disbanded' },
      });
    }
    await this.emitChanged(tx, worldId, allianceId, members.map((m) => Number(m['id'])));
  }

  /* ── Yönetim ──────────────────────────────────────────────────────────────── */

  async rename(o: { worldId: number; playerId: number; name: string }): Promise<void> {
    const name = o.name.trim();
    if (name.length < ALLIANCE_RULES.nameMin || name.length > ALLIANCE_RULES.nameMax) {
      throw new AllianceError('bad_name', `İttifak adı ${ALLIANCE_RULES.nameMin}-${ALLIANCE_RULES.nameMax} karakter olmalı.`);
    }
    await this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      this.require(me, ROLE.LEADER);
      // ⚠️ Eski ad UPDATE'ten ÖNCE okunur; mesaj "X artık Y" diyebilsin diye.
      const [before] = await tx.execute<Record<string, unknown>>(sql`
        SELECT name FROM alliances WHERE id = ${me.allianceId}
      `);
      const oldName = String(before?.['name'] ?? '');
      try {
        await tx.execute(sql`UPDATE alliances SET name = ${name} WHERE id = ${me.allianceId}`);
      } catch (err) {
        if (String(err).includes('alliances_world_name')) {
          throw new AllianceError('name_taken', 'Bu isimde bir ittifak zaten var.');
        }
        throw err;
      }
      // Ad değişimi bildirimi (kullanıcı, 2026-08-06). Adı DEĞİŞTİREN lidere yazılmaz.
      if (oldName !== name) {
        const members = await tx.execute<Record<string, unknown>>(sql`
          SELECT id FROM players WHERE alliance_id = ${me.allianceId} AND id <> ${o.playerId}
        `);
        for (const m of members) {
          await this.notice(tx as never, {
            worldId: o.worldId, playerId: Number(m['id']),
            subject: 'İttifak adı değişti',
            text: `İttifağının adı "${oldName}" iken "${name}" olarak değiştirildi.`,
            extra: { allianceId: me.allianceId, oldName, newName: name, reason: 'renamed' },
          });
        }
      }
      await this.emitChanged(tx as never, o.worldId, me.allianceId!);
    });
  }

  /** İttifak metni — Konsey + Lider düzenler (kullanıcı: "admin ve yöneticiler"). */
  async setText(o: { worldId: number; playerId: number; text: string }): Promise<void> {
    if (o.text.length > ALLIANCE_RULES.textMax) {
      throw new AllianceError('text_too_long', `İttifak metni en fazla ${ALLIANCE_RULES.textMax} karakter.`);
    }
    await this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      this.require(me, ROLE.COUNCIL);
      await tx.execute(sql`UPDATE alliances SET text = ${o.text} WHERE id = ${me.allianceId}`);
      await this.emitChanged(tx as never, o.worldId, me.allianceId!);
    });
  }

  /* ── Üye işlemleri ────────────────────────────────────────────────────────── */

  /**
   * İttifaktan At — hiyerarşi: Konsey yalnız Asker'i, Lider herkesi (kendisi hariç) atabilir.
   */
  async kick(o: { worldId: number; playerId: number; targetId: number }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      this.require(me, ROLE.COUNCIL);
      const target = await this.lockPlayer(tx as never, o.targetId);
      assertCanModerate(me, target, 'kick');

      await this.applyMembership(tx as never, {
        worldId: o.worldId, playerId: o.targetId, allianceId: null, role: 0,
        noticeAllianceId: me.allianceId!,
      });
      await this.notice(tx as never, {
        worldId: o.worldId, playerId: o.targetId,
        subject: 'İttifaktan çıkarıldın',
        text: `${me.username} seni ittifaktan çıkardı. Artık bir ittifakta değilsin.`,
        extra: { allianceId: me.allianceId, reason: 'kicked' },
      });
    });
  }

  /** Konseye Al / Konseyden Çıkar — yalnız Lider. */
  async setCouncil(o: { worldId: number; playerId: number; targetId: number; council: boolean }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      this.require(me, ROLE.LEADER);
      const target = await this.lockPlayer(tx as never, o.targetId);
      if (target.allianceId !== me.allianceId) throw new AllianceError('not_same_alliance', 'Oyuncu ittifağında değil.');
      if (target.role === ROLE.LEADER) throw new AllianceError('hierarchy', 'Liderin rütbesi buradan değişmez.');
      const role = o.council ? ROLE.COUNCIL : ROLE.MEMBER;
      if (target.role === role) return;
      await tx.execute(sql`UPDATE players SET alliance_role = ${role} WHERE id = ${o.targetId}`);
      /**
       * ⭐ Rütbe bildirimi (kullanıcı, 2026-08-06). Üye yetkisinin değiştiğini hiçbir yerden
       * öğrenemiyordu. ⚠️ `target.role === role` erken dönüşü YUKARIDA: rütbe gerçekten
       * değişmediyse buraya hiç gelinmiyor, yani "değişti" diyen boş mesaj doğmuyor.
       */
      await this.notice(tx as never, {
        worldId: o.worldId, playerId: o.targetId,
        subject: o.council ? 'Konseye alındın' : 'Konseyden çıkarıldın',
        text: o.council
          ? 'İttifak liderin seni Konsey üyeliğine yükseltti. Artık davet gönderebilir, başvuruları sonuçlandırabilir ve ittifak metnini düzenleyebilirsin.'
          : 'İttifak liderin seni Konsey üyeliğinden çıkardı. Rütben Asker olarak güncellendi.',
        extra: { allianceId: me.allianceId, role, reason: o.council ? 'promoted' : 'demoted' },
      });
      await this.emitChanged(tx as never, o.worldId, me.allianceId!, [o.targetId]);
    });
  }

  /** Liderlik Devri — eski lider Konsey'e düşer (orijinal istemci `q=2` davranışı). */
  async transfer(o: { worldId: number; playerId: number; targetId: number }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      this.require(me, ROLE.LEADER);
      const target = await this.lockPlayer(tx as never, o.targetId);
      if (target.allianceId !== me.allianceId) throw new AllianceError('not_same_alliance', 'Oyuncu ittifağında değil.');
      if (o.targetId === o.playerId) throw new AllianceError('cannot_transfer_self', 'Liderlik zaten sende.');

      await tx.execute(sql`UPDATE players SET alliance_role = ${ROLE.LEADER} WHERE id = ${o.targetId}`);
      await tx.execute(sql`UPDATE players SET alliance_role = ${ROLE.COUNCIL} WHERE id = ${o.playerId}`);
      await tx.execute(sql`UPDATE alliances SET leader_id = ${o.targetId} WHERE id = ${me.allianceId}`);
      await this.notice(tx as never, {
        worldId: o.worldId, playerId: o.targetId,
        subject: 'İttifak liderliği sana devredildi',
        text: `${me.username} ittifak liderliğini sana devretti. Eski lider Konsey üyesi olarak devam ediyor.`,
        extra: { allianceId: me.allianceId, reason: 'transferred' },
      });
      await this.emitChanged(tx as never, o.worldId, me.allianceId!, [o.playerId, o.targetId]);
    });
  }

  /* ── Davet + başvuru ──────────────────────────────────────────────────────── */

  /** Davet gönder — Konsey + Lider; hedef zaten bir ittifaktaysa reddedilir. */
  async invite(o: { worldId: number; playerId: number; targetId: number }): Promise<number> {
    return this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      this.require(me, ROLE.COUNCIL);
      const target = await this.lockPlayer(tx as never, o.targetId);
      if (target.worldId !== o.worldId) throw new AllianceError('not_found', 'Oyuncu bu dünyada değil.');
      if (target.allianceId != null) throw new AllianceError('target_has_alliance', 'Oyuncu zaten bir ittifakta.');

      const [a] = await tx.execute<Record<string, unknown>>(sql`
        SELECT name FROM alliances WHERE id = ${me.allianceId}
      `);
      let row: Record<string, unknown> | undefined;
      try {
        [row] = await tx.execute<Record<string, unknown>>(sql`
          INSERT INTO alliance_invites (world_id, alliance_id, player_id, kind, created_by)
          VALUES (${o.worldId}, ${me.allianceId}, ${o.targetId}, 'invite', ${o.playerId})
          RETURNING id
        `);
      } catch (err) {
        if (String(err).includes('alliance_invites_pending')) {
          throw new AllianceError('already_pending', 'Bu oyuncuya bekleyen bir davet zaten var.');
        }
        throw err;
      }
      const inviteId = Number(row!['id']);
      // Doküman: davet MESAJ KUTUSUNA düşer; oyuncu oradan Kabul/Red eder.
      await this.writeMessage(tx as never, {
        worldId: o.worldId, playerId: o.targetId, kind: 'alliance_invite',
        subject: 'İttifak Daveti',
        body: {
          inviteId, allianceId: me.allianceId, allianceName: String(a?.['name'] ?? ''),
          by: me.username,
        },
      });
      return inviteId;
    });
  }

  /** Başvuru gönder — üye olmayan herkes; lider ve TÜM konsey üyelerinin kutusuna düşer. */
  async apply(o: { worldId: number; playerId: number; allianceId: number }): Promise<number> {
    return this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      if (me.allianceId != null) throw new AllianceError('already_member', 'Zaten bir ittifaktasın.');
      /**
       * ⭐ §verify — DOĞRULAMA KAPISI BAŞVURU ANINDA (kullanıcı, 2026-08-09).
       *
       * ⚠️ Eskiden yalnız `decide()`te bakılıyordu ve sonuç şuydu: doğrulanmamış oyuncu
       * başvuruyu **gönderebiliyor**, başvuru lider ve tüm konsey üyelerinin kutusuna
       * düşüyor, lider «Kabul»e bastığında hata **LİDERE** çıkıyordu. Yani kısıtı, onu
       * kaldıramayacak olan kişi okuyordu; başvuran ise neden alınmadığını hiç öğrenmiyordu.
       * Kapı artık burada: başvuru hiç oluşmuyor ve uyarıyı **başvuran** görüyor.
       *
       * ⚠️ `decide()`teki kontrol KALDIRILMADI, ikisi birden duruyor. Sebep bu dosyaya özgü
       * değil: doğrulama **sonradan kaybedilebiliyor** — e-posta adresini değiştirmek
       * `email_verified_at`i NULL'a çekiyor (`email-token.service.ts`). Başvuru ile karar
       * arasında geçen sürede tam olarak bu olabilir.
       *
       * ⚠️ `invite()`e AYNI kapı KONULMADI ve bu bilinçli: orada doğrulanmamış olan taraf
       * daveti ALAN kişi olurdu, kapı da onun hesap durumunu **davet edene** söylerdi.
       * Doğrulanmamış hesaplar büyük ölçüde taze/çoklu hesaplar olduğu için bu, "kim
       * doğrulamamış" diye tarama yapmaya yarayan bir sızıntı olurdu. Davet yolunda uyarı
       * zaten doğru kişiye gidiyor: davet edilen «Kabul»e bastığında metni O okuyor.
       */
      await this.assertVerifiedToJoin(tx as never, o.playerId);
      const [a] = await tx.execute<Record<string, unknown>>(sql`
        SELECT id, name FROM alliances WHERE id = ${o.allianceId} AND world_id = ${o.worldId}
      `);
      if (!a) throw new AllianceError('not_found', 'İttifak bulunamadı.');

      let row: Record<string, unknown> | undefined;
      try {
        [row] = await tx.execute<Record<string, unknown>>(sql`
          INSERT INTO alliance_invites (world_id, alliance_id, player_id, kind, created_by)
          VALUES (${o.worldId}, ${o.allianceId}, ${o.playerId}, 'application', ${o.playerId})
          RETURNING id
        `);
      } catch (err) {
        if (String(err).includes('alliance_invites_pending')) {
          throw new AllianceError('already_pending', 'Bu ittifağa bekleyen bir başvurun zaten var.');
        }
        throw err;
      }
      const applicationId = Number(row!['id']);

      const managers = await tx.execute<Record<string, unknown>>(sql`
        SELECT id FROM players WHERE alliance_id = ${o.allianceId} AND alliance_role >= ${ROLE.COUNCIL}
      `);
      for (const m of managers) {
        await this.writeMessage(tx as never, {
          worldId: o.worldId, playerId: Number(m['id']), kind: 'alliance_application',
          subject: 'İttifak Başvurusu',
          body: {
            inviteId: applicationId, allianceId: o.allianceId,
            allianceName: String(a['name']), by: me.username, byPlayerId: o.playerId,
          },
        });
      }
      return applicationId;
    });
  }

  /**
   * Kabul/Red — `invite`ta karar DAVET EDİLEN oyuncunun, `application`da o ittifağın
   * Konsey+Lider'inin (kullanıcı kararı). Kabulde üyelik yarış-korumalı tek UPDATE ile yazılır
   * ve oyuncunun DİĞER bekleyen davet/başvuruları iptal edilir.
   */
  async decide(o: { worldId: number; playerId: number; inviteId: number; accept: boolean }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [inv] = await tx.execute<Record<string, unknown>>(sql`
        SELECT id, alliance_id, player_id, kind, status FROM alliance_invites
         WHERE id = ${o.inviteId} AND world_id = ${o.worldId} FOR UPDATE
      `);
      if (!inv) throw new AllianceError('not_found', 'Davet bulunamadı.');
      if (String(inv['status']) !== 'pending') throw new AllianceError('not_pending', 'Bu istek zaten sonuçlanmış.');
      const kind = String(inv['kind']);
      const allianceId = Number(inv['alliance_id']);
      const subjectId = Number(inv['player_id']);

      if (kind === 'invite') {
        if (subjectId !== o.playerId) throw new AllianceError('forbidden', 'Bu davet sana gönderilmemiş.');
      } else {
        const me = await this.lockPlayer(tx as never, o.playerId);
        if (me.allianceId !== allianceId || me.role < ROLE.COUNCIL) {
          throw new AllianceError('forbidden', 'Başvuruları yalnız o ittifağın yönetimi sonuçlandırabilir.');
        }
      }

      /**
       * İttifak adı ve karara konu oyuncunun adı — bildirim metinleri ikisini de kullanıyor.
       * ⚠️ `invite` yolunda `lockPlayer` HİÇ çağrılmıyor (karar veren zaten davet edilenin
       * kendisi), o yüzden kullanıcı adı buradan okunuyor; iki dalın da tek kaynağı bu.
       */
      const [meta] = await tx.execute<Record<string, unknown>>(sql`
        SELECT a.name AS alliance_name, p.username AS subject_name
          FROM alliances a, players p
         WHERE a.id = ${allianceId} AND p.id = ${subjectId}
      `);
      const allianceName = String(meta?.['alliance_name'] ?? '');
      const subjectName = String(meta?.['subject_name'] ?? '');

      if (!o.accept) {
        await tx.execute(sql`
          UPDATE alliance_invites SET status = 'rejected', decided_at = now(), decided_by = ${o.playerId}
           WHERE id = ${o.inviteId}
        `);
        // ⭐ İstek sonuçlandı → kutulardaki düğmeli satır ARTIK ÖLÜ; siliniyor (bkz. yardımcı).
        await this.dropInviteMessages(tx as never, o.worldId, [o.inviteId]);
        // Başvurana sonucu söyle (doküman: "kabul edilmez ise yine cevap olarak ret mesajı gelecektir").
        if (kind === 'application') {
          await this.notice(tx as never, {
            worldId: o.worldId, playerId: subjectId,
            subject: 'İttifak başvurun reddedildi',
            text: `${allianceName} ittifağına yaptığın başvuru reddedildi.`,
            extra: { allianceId, reason: 'application_rejected' },
          });
        } else {
          /**
           * ⭐ DAVET REDDİ artık YÖNETİME bildiriliyor (kullanıcı, 2026-08-06). Eskiden bu dal
           * tamamen sessizdi: daveti gönderen konsey üyesi cevabı hiç öğrenemiyor, bekleyen
           * davet listeden düşünce "gitti mi, reddedildi mi" ayırt edilemiyordu.
           */
          for (const managerId of await this.managerIds(tx as never, allianceId)) {
            await this.notice(tx as never, {
              worldId: o.worldId, playerId: managerId,
              subject: 'İttifak daveti reddedildi',
              text: `${subjectName} gönderdiğiniz ittifak davetini reddetti.`,
              extra: { allianceId, playerId: subjectId, reason: 'invite_rejected' },
            });
          }
        }
        return;
      }

      /**
       * ⭐ §verify — kontrol **KATILANA** (`subjectId`) ait, onaylayana değil. Konsey üyesi
       * doğrulanmış olsa bile başvuran doğrulanmamışsa katılım gerçekleşmez.
       */
      await this.assertVerifiedToJoin(tx as never, subjectId);

      // ── KABUL ── üyelik yarış koruması: oyuncu hâlâ ittifaksızsa tek UPDATE tutturur.
      const joined = await tx.execute<Record<string, unknown>>(sql`
        UPDATE players SET alliance_id = ${allianceId}, alliance_role = ${ROLE.MEMBER},
               alliance_joined_at = now()
         WHERE id = ${subjectId} AND alliance_id IS NULL RETURNING id
      `);
      if (joined.length === 0) {
        await tx.execute(sql`
          UPDATE alliance_invites SET status = 'canceled', decided_at = now(), decided_by = ${o.playerId}
           WHERE id = ${o.inviteId}
        `);
        /**
         * ⚠️ Bu dal **hata fırlatıyor ama transaction'ı geri almıyor**: `AllianceError` çağırana
         * gidiyor, `UPDATE … 'canceled'` ise kalıcı — yani mesajın da gitmesi gerekiyor, aksi
         * hâlde ölü satırın en can sıkıcı türü kalırdı (basınca hep aynı hatayı veren düğme).
         */
        await this.dropInviteMessages(tx as never, o.worldId, [o.inviteId]);
        throw new AllianceError('target_has_alliance', 'Oyuncu bu arada başka bir ittifağa katılmış.');
      }
      await tx.execute(sql`
        UPDATE alliance_invites SET status = 'accepted', decided_at = now(), decided_by = ${o.playerId}
         WHERE id = ${o.inviteId}
      `);
      /**
       * Diğer tüm bekleyen davet/başvuruları düşür — oyuncu artık bir ittifakta.
       *
       * ⭐ `RETURNING id` 2026-08-09'da eklendi: iptal edilen her isteğin mesajı da siliniyor.
       * ⚠️ Bunlar **başka ittifakların** kutularındaki satırlar: oyuncu üç ittifağa başvurmuşsa
       * diğer ikisinin yönetimi, artık sonuçlanamayacak bir başvuruya bakmaya devam ediyordu.
       * Sildiğimiz satır sayısı görünmez ama semptom aynı: «Bu istek zaten sonuçlanmış.»
       */
      const canceled = await tx.execute<Record<string, unknown>>(sql`
        UPDATE alliance_invites SET status = 'canceled', decided_at = now()
         WHERE player_id = ${subjectId} AND status = 'pending' RETURNING id
      `);
      await this.dropInviteMessages(tx as never, o.worldId,
        [o.inviteId, ...canceled.map((r) => Number(r['id']))]);
      if (kind === 'application') {
        await this.notice(tx as never, {
          worldId: o.worldId, playerId: subjectId,
          subject: 'İttifak başvurun kabul edildi',
          text: `${allianceName} ittifağına katıldın.`,
          extra: { allianceId, reason: 'application_accepted' },
        });
      } else {
        /**
         * ⭐ DAVET KABULÜ de yönetime bildiriliyor. ⚠️ Katılana yazılmıyor: kabul düğmesine
         * basan zaten o — kendi eylemini haber vermek gürültü olurdu (dağıtma/ayrılma/ad
         * değişiminde uyguladığım "eylemi yapana yazma" kuralının aynısı).
         * ⚠️ Yeni üye `MEMBER` rolüyle giriyor, `managerIds` (rol ≥ Konsey) onu kapsamıyor.
         */
        for (const managerId of await this.managerIds(tx as never, allianceId)) {
          await this.notice(tx as never, {
            worldId: o.worldId, playerId: managerId,
            subject: 'İttifak daveti kabul edildi',
            text: `${subjectName} ittifak davetini kabul etti ve ittifağa katıldı.`,
            extra: { allianceId, playerId: subjectId, reason: 'invite_accepted' },
          });
        }
      }
      await this.emitChanged(tx as never, o.worldId, allianceId, [subjectId]);
    });
  }

  /**
   * ⭐ YÖNETİCİ MÜDAHALESİ — oyuncu dünyadan kaldırılırken ittifak bağını koparır
   * (`admin.actions.controller.ts` → `purge-player`, 2026-08-06).
   *
   * ⚠️ **LİDERSE İTTİFAK DAĞITILIR.** Alternatif "lideri sessizce çıkar" olurdu ve ittifağı
   * ONARILAMAZ hâle getirirdi: davet · at · ad · dağıt aksiyonlarının HEPSİ `require(LEADER)`
   * kapısının arkasında; kaldırılan lider de kalıcı cezalı olduğu için bir daha giriş yapıp
   * devredemez. Yani ittifak sonsuza kadar dondururdu. Dağıtma acı ama dürüst — üyeler
   * §13.15b.1 bildirimiyle haberdar oluyor.
   *
   * ⚠️ Çağıranın transaction'ını alıyor: ittifak dağıtılıp asıl kaldırma sonra patlarsa
   * masum bir ittifak boşuna dağılmış olurdu.
   */
  async detachForPurge(tx: Tx, worldId: number, playerId: number): Promise<{
    disbanded: boolean; allianceId: number | null;
  }> {
    const [p] = await tx.execute<Record<string, unknown>>(sql`
      SELECT username, alliance_id, alliance_role FROM players WHERE id = ${playerId}
    `);
    const allianceId = p?.['alliance_id'] == null ? null : Number(p['alliance_id']);
    if (allianceId == null) return { disbanded: false, allianceId: null };

    if (Number(p!['alliance_role'] ?? 0) === ROLE.LEADER) {
      await this.disbandInner(tx, worldId, allianceId, playerId);
      return { disbanded: true, allianceId };
    }

    await tx.execute(sql`
      UPDATE players SET alliance_id = NULL, alliance_role = NULL, alliance_joined_at = NULL
       WHERE id = ${playerId}
    `);
    // Yönetim bilgilendirilir — ayrılmayla aynı adres, farklı sebep.
    for (const managerId of await this.managerIds(tx, allianceId)) {
      await this.notice(tx, {
        worldId, playerId: managerId,
        subject: 'Bir üye dünyadan kaldırıldı',
        text: `${String(p!['username'])} yönetici kararıyla dünyadan kaldırıldı ve ittifaktan çıktı.`,
        extra: { allianceId, playerId, reason: 'purged' },
      });
    }
    await this.emitChanged(tx, worldId, allianceId, [playerId]);
    return { disbanded: false, allianceId };
  }

  /* ── Ortak yardımcılar ────────────────────────────────────────────────────── */

  private async lockPlayer(tx: Tx, playerId: number): Promise<{
    playerId: number; worldId: number; username: string; allianceId: number | null; role: number;
  }> {
    const [r] = await tx.execute<Record<string, unknown>>(sql`
      SELECT id, world_id, username, alliance_id, alliance_role FROM players
       WHERE id = ${playerId} FOR UPDATE
    `);
    if (!r) throw new AllianceError('not_found', 'Oyuncu bulunamadı.');
    return {
      playerId,
      worldId: Number(r['world_id']),
      username: String(r['username']),
      allianceId: r['alliance_id'] == null ? null : Number(r['alliance_id']),
      role: r['alliance_role'] == null ? 0 : Number(r['alliance_role']),
    };
  }

  private require(me: { allianceId: number | null; role: number }, minRole: number): void {
    if (me.allianceId == null) throw new AllianceError('not_member', 'Bir ittifakta değilsin.');
    if (me.role < minRole) throw new AllianceError('forbidden', 'Bu işlem için yetkin yok.');
  }

  /**
   * Üyelik değişimi: players + `alliance:changed` outbox'ı. `noticeAllianceId` ayrılan/atılan
   * üye için ESKİ ittifağın odasına haber vermeye yarar (yeni allianceId null olunca oda
   * bilgisi kaybolurdu). Gateway oda senkronu controller katmanında (aynı süreçteki instance).
   */
  /** §verify — "bu oyuncu bir ittifağa girebilir mi" tek kural, iki çağrı noktası. */
  private async assertVerifiedToJoin(tx: Tx, playerId: number): Promise<void> {
    if (!unverifiedLimits().enabled) return;
    if (await isVerified(tx as never, playerId)) return;
    throw new AllianceError(UNVERIFIED_CODE, UNVERIFIED_MESSAGE.alliance);
  }

  private async applyMembership(tx: Tx, o: {
    worldId: number; playerId: number; allianceId: number | null; role: number;
    noticeAllianceId?: number;
  }): Promise<void> {
    /**
     * ⭐ §verify — DOĞRULANMAMIŞ hesap ittifağa giremez (kullanıcı şartı).
     *
     * ⚠️ Ayrılma/atılma (`allianceId == null`) hiç kontrol edilmez: kısıt bir kapı, hapis değil.
     *
     * ⚠️ **Bu tek başına YETMEZ** — dosyanın başlığındaki *"üyelik tek yardımcıdan geçer"*
     * cümlesi BAYAT: `decide()` yarış koruması eklenirken kendi `UPDATE players SET
     * alliance_id`ini yazdı ve buradan geçmiyor. Bu yüzden kontrol iki yerde ve ikisi de
     * `assertVerifiedToJoin`i çağırıyor. (İlk yazımda yalnız burası vardı ve testin
     * "başvuru onaylanınca da katılamaz" maddesi boşluğu yakaladı.)
     */
    if (o.allianceId != null) await this.assertVerifiedToJoin(tx, o.playerId);
    /**
     * ⚠️ `alliance_joined_at` — ittifak sohbetindeki acemi kısıtının ölçütü (§13.15c).
     * Katılırken damgalanır, AYRILIRKEN NULL'a çekilir: geri katılan süreyi yeniden bekler,
     * yoksa "çık-gir" kısıtın kaçış yolu olurdu.
     * ⚠️ Bu, kolonu yazan DÖRT noktadan biri — `decide()` buradan GEÇMİYOR, kendi UPDATE'ini
     * yazıyor ve orada da ayrıca damgalanmak zorunda.
     */
    await tx.execute(sql`
      UPDATE players SET alliance_id = ${o.allianceId},
             alliance_role = ${o.allianceId == null ? null : o.role},
             alliance_joined_at = ${o.allianceId == null ? null : sql`now()`}
       WHERE id = ${o.playerId}
    `);
    await this.emitChanged(tx, o.worldId, o.allianceId ?? o.noticeAllianceId ?? null, [o.playerId]);
  }

  /** `alliance:changed` — ittifak odası + etkilenen oyuncular görünümlerini tazeler. */
  private async emitChanged(
    tx: Tx, worldId: number, allianceId: number | null, playerIds: number[] = [],
  ): Promise<void> {
    await tx.execute(sql`
      INSERT INTO outbox (world_id, topic, payload)
      VALUES (${worldId}, 'alliance:changed',
              ${JSON.stringify({ allianceId, playerIds })}::jsonb)
    `);
  }

  /** Posta satırı + rozet haberi (mission bağlamı dışındaki `writeMessage` ikizi). */
  /**
   * ⭐ SONUÇLANMIŞ DAVET/BAŞVURU MESAJLARINI SİL (kullanıcı, 2026-08-09).
   *
   * *"İttifak liderinin sonuçlandırdığı başvuru raporları raporlardan hepten silinsin.
   * Mesajlarda kalmaya devam ediyor, yeniden açıp Kabul veya Red tıklandığında «Bu istek zaten
   * sonuçlanmış.» uyarısı geliyor."*
   *
   * Başvuru mesajı lider VE her konsey üyesine ayrı satır olarak yazılıyor; karar tek kişiden
   * geliyor. Karardan sonra geriye kalan satırların hepsi, üstündeki iki düğme yalnız hata
   * üreten ölü satırlar oluyordu.
   *
   * ─ Kararlar ────────────────────────────────────────────────────────────────────────────
   * ⚠️ **Silme, "sonuçlandı" diye güncelleme DEĞİL** — kullanıcı şartı ("hepten silinsin").
   * Sonucu zaten ayrı bir bildirim satırı anlatıyor (`notice`), yani bilgi kaybolmuyor;
   * güncelleme yapılsaydı kutuda aynı olayı anlatan İKİ satır kalırdı.
   *
   * ⚠️ **Alıcı listesi burada YENİDEN KURULMUYOR.** `DELETE … RETURNING player_id` kimin
   * kutusundan satır düştüğünü bize kendisi söylüyor. Alıcıları ikinci kez hesaplasaydım
   * (lider + konsey) o kural iki yere yazılmış olurdu ve biri değişince temizlik **sessizce**
   * eksik kalırdı — bu projede tam olarak böyle üç hata çıktı.
   *
   * ⚠️ Olay `message:removed`, `message:written` DEĞİL. İkisi de istemcide `messages:changed`e
   * çevriliyor ama `message:written` ayrıca **bildirim/push üretiyor** (`notify.catalog.ts`,
   * `REPORT_TEXT`te iki `kind` de kayıtlı): silinen mesaj için "yeni mesajın var" bildirimi
   * gönderirdi. Ayrı konu, `notify.catalog`un `default` dalına düşüp sessiz kalıyor.
   *
   * ⚠️ `(body->>'inviteId')::bigint` ifadesi `0045` göçündeki kısmi indeksle BİREBİR aynı
   * yazılmalı; değişirse indeks sessizce kullanılmaz olur (sonuç doğru kalır, tarama uzar).
   */
  private async dropInviteMessages(tx: Tx, worldId: number, inviteIds: number[]): Promise<void> {
    /* ⚠️ `sql.raw` kullanıldığı için süzgeç güvenlik sınırı: yalnız pozitif TAM SAYI geçer
       (`Number.isFinite` yetmezdi — 1.5 süzgeci geçip `::bigint[]` dökümünde patlardı). */
    const ids = [...new Set(inviteIds.filter((n) => Number.isInteger(n) && n > 0))];
    if (ids.length === 0) return;

    const gone = await tx.execute<Record<string, unknown>>(sql`
      DELETE FROM messages
       WHERE world_id = ${worldId}
         AND kind IN ('alliance_invite', 'alliance_application')
         AND (body ->> 'inviteId')::bigint = ANY(${sql.raw(`ARRAY[${ids.join(',')}]::bigint[]`)})
      RETURNING player_id
    `);

    // Aynı oyuncuya birden fazla satır düşmüş olabilir; olay oyuncu başına bir kez gider.
    for (const playerId of new Set(gone.map((r) => Number(r['player_id'])))) {
      await tx.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${worldId}, 'message:removed', ${JSON.stringify({ playerId })}::jsonb)
      `);
    }
  }

  private async writeMessage(tx: Tx, o: {
    worldId: number; playerId: number; kind: string; subject: string; body: Record<string, unknown>;
  }): Promise<void> {
    await tx.execute(sql`
      INSERT INTO messages (world_id, player_id, kind, side, subject, body, at)
      VALUES (${o.worldId}, ${o.playerId}, ${o.kind}, 'owner', ${o.subject},
              ${JSON.stringify(o.body)}::jsonb, now())
    `);
    await tx.execute(sql`
      INSERT INTO outbox (world_id, topic, payload)
      VALUES (${o.worldId}, 'message:written',
              ${JSON.stringify({ playerId: o.playerId, kind: o.kind })}::jsonb)
    `);
  }

  /**
   * ⭐ İTTİFAK SİSTEM BİLDİRİMİ — `text` ZORUNLU (2026-08-06).
   *
   * ⚠️ Buradaki tek kritik nokta `text`: `Messages.tsx`teki sistem gövdesi `kind`e değil
   * **`body.text`e** bakıyor (bilerek — `kind='system'` mağara iptali gibi metinsiz satırlarda
   * da kullanılıyor). Metinsiz yazılan ittifak bildirimleri ekranda **BOŞ KUTU** olarak
   * çiziliyordu; oyuncu yalnız başlığı görüyordu. Bu yardımcıdan geçen her satır metnini
   * taşır, yani o hata bir daha doğamaz.
   *
   * ⚠️ Yapısal alanlar (`allianceId`, `reason`) KORUNUYOR: ekran metni kullanıyor ama
   * `audit`/ileride filtreleme için makine-okunur alanlar da lazım.
   */
  private async notice(tx: Tx, o: {
    worldId: number; playerId: number; subject: string; text: string;
    extra?: Record<string, unknown>;
  }): Promise<void> {
    await this.writeMessage(tx, {
      worldId: o.worldId, playerId: o.playerId, kind: 'system',
      subject: o.subject, body: { ...o.extra, text: o.text },
    });
  }

  /** Bir ittifağın yönetimi (Lider + Konsey) — üyelik olaylarının bildirim adresi. */
  private async managerIds(tx: Tx, allianceId: number): Promise<number[]> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT id FROM players
       WHERE alliance_id = ${allianceId} AND alliance_role >= ${ROLE.COUNCIL}
    `);
    return rows.map((r) => Number(r['id']));
  }

  /** İttifağa Mesaj — tüm üyelerin kutusuna (orijinal `itMsj.do`, t=7). Konsey + Lider. */
  async broadcast(o: { worldId: number; playerId: number; text: string }): Promise<number> {
    if (o.text.trim().length === 0) throw new AllianceError('empty', 'Mesaj boş olamaz.');
    if (o.text.length > 500) throw new AllianceError('text_too_long', 'Mesaj en fazla 500 karakter.');
    return this.db.transaction(async (tx) => {
      const me = await this.lockPlayer(tx as never, o.playerId);
      this.require(me, ROLE.COUNCIL);
      const members = await tx.execute<Record<string, unknown>>(sql`
        SELECT id FROM players WHERE alliance_id = ${me.allianceId}
      `);
      for (const m of members) {
        await this.writeMessage(tx as never, {
          worldId: o.worldId, playerId: Number(m['id']), kind: 'alliance_message',
          subject: 'İttifak Mesajı',
          body: { from: me.username, text: o.text },
        });
      }
      return members.length;
    });
  }
}
