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

export class AllianceService {
  constructor(private readonly db: Db) {}

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
      UPDATE players SET alliance_id = NULL, alliance_role = NULL
       WHERE alliance_id = ${allianceId} RETURNING id
    `);
    await tx.execute(sql`
      UPDATE alliance_invites SET status = 'canceled', decided_at = now()
       WHERE alliance_id = ${allianceId} AND status = 'pending'
    `);
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
      if (target.allianceId !== me.allianceId) throw new AllianceError('not_same_alliance', 'Oyuncu ittifağında değil.');
      if (o.targetId === o.playerId) throw new AllianceError('cannot_kick_self', 'Kendini atamazsın — İttifaktan Ayrıl kullan.');
      if (me.role !== ROLE.LEADER && target.role >= ROLE.COUNCIL) {
        throw new AllianceError('hierarchy', 'Konsey yalnız Asker rütbesindeki üyeleri atabilir.');
      }
      if (target.role === ROLE.LEADER) throw new AllianceError('hierarchy', 'Lider atılamaz.');

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
        UPDATE players SET alliance_id = ${allianceId}, alliance_role = ${ROLE.MEMBER}
         WHERE id = ${subjectId} AND alliance_id IS NULL RETURNING id
      `);
      if (joined.length === 0) {
        await tx.execute(sql`
          UPDATE alliance_invites SET status = 'canceled', decided_at = now(), decided_by = ${o.playerId}
           WHERE id = ${o.inviteId}
        `);
        throw new AllianceError('target_has_alliance', 'Oyuncu bu arada başka bir ittifağa katılmış.');
      }
      await tx.execute(sql`
        UPDATE alliance_invites SET status = 'accepted', decided_at = now(), decided_by = ${o.playerId}
         WHERE id = ${o.inviteId}
      `);
      // Diğer tüm bekleyen davet/başvuruları düşür — oyuncu artık bir ittifakta.
      await tx.execute(sql`
        UPDATE alliance_invites SET status = 'canceled', decided_at = now()
         WHERE player_id = ${subjectId} AND status = 'pending'
      `);
      if (kind === 'application') {
        await this.notice(tx as never, {
          worldId: o.worldId, playerId: subjectId,
          subject: 'İttifak başvurun kabul edildi',
          text: `${allianceName} ittifağına katıldın. Rütben Asker olarak başlıyor.`,
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
    await tx.execute(sql`
      UPDATE players SET alliance_id = ${o.allianceId},
             alliance_role = ${o.allianceId == null ? null : o.role}
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
