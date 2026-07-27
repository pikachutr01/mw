/**
 * ⭐ SALDIRI GÖREVİ (SİSTEM PLANI §13.5, §13.10, §13.11.7)
 *
 * Akış TEK transaction:
 *   doğrula (sahiplik · birim · 24s/3 limiti · acemi koruması · tatil · Baraka) →
 *   birlikleri şehirden DÜŞ (rezerve et) → `missions` + `mission_units` + `mission_heroes` yaz
 *
 * ⚠️ **Birlikler görev yazılırken şehirden düşer.** Ordu yoldayken şehirde DEĞİLDİR: kimse onu
 * ikinci bir saldırıya gönderemez, savunmada da sayılmaz. "Dodge" hamlesi (orduyu saldırı gelmeden
 * yola çıkarmak) tam olarak bu yüzden çalışır (§13.10.2).
 *
 * ⚠️ **Varış anı `execute_at` OYUN saatindedir** → bakımda geri sayım durur, varış otomatik ötelenir.
 */
import { sql } from 'drizzle-orm';
import { UNITS_BY_ID } from '@mobiwar/catalog';
import { armySpeed, distance, travelSeconds, type MapConfig, DEFAULT_MAP_CONFIG } from '@mobiwar/engine';
import { toDate, type Db } from '../db/client.ts';
import type { Tx } from './handler-registry.ts';

/** İptal edilebilen görev tipleri. `return` bilerek YOK — ordu zaten eve geliyor. */
export const CANCELABLE_TYPES: readonly string[] = [
  'attack', 'transport', 'support', 'spy', 'found_city',
];

export type MissionErrorCode =
  | 'city_not_found'
  | 'mission_not_found'
  | 'not_cancelable'
  | 'not_owner'
  | 'target_not_found'
  | 'self_attack'
  | 'no_units'
  | 'unknown_unit'
  | 'unit_cannot_march'
  | 'insufficient_units'
  | 'attack_limit'
  | 'target_protected'
  | 'target_vacation'
  | 'march_limit'
  | 'hero_unavailable'
  | 'world_mismatch';

export class MissionError extends Error {
  constructor(readonly code: MissionErrorCode, message: string, readonly details?: unknown) {
    super(message);
  }
}

export interface AttackRules {
  /** Bir saldıran → hedef şehir çifti için 24 saatte en fazla kaç saldırı (§13.5.4). */
  dailyAttackLimit: number;
  /** Limit penceresi (saat). */
  attackWindowHours: number;
  /** Eşzamanlı sefer sayısını sınırlayan yapı. */
  marchLimitSource: string;
  /** Sefere çıkamayan birimler (casus kuş yalnız casusluk görevine gider). */
  attackForbiddenUnits: readonly string[];
}

export const DEFAULT_ATTACK_RULES: AttackRules = {
  dailyAttackLimit: 3,
  attackWindowHours: 24,
  marchLimitSource: 'barracks',
  attackForbiddenUnits: ['spy_bird'],
};

export interface AttackMission {
  missionId: number;
  originCityId: number;
  targetCityId: number;
  units: Record<string, number>;
  heroIds: number[];
  /** Ordunun hızı (en yavaş birim). */
  speed: number;
  distance: number;
  travelSeconds: number;
  /** OYUN saatinde varış anı. */
  executeAt: Date;
}

interface OriginRow {
  worldId: number;
  playerId: number;
  k: number;
  d: number;
  s: number;
}

interface TargetRow {
  id: number;
  playerId: number;
  k: number;
  d: number;
  s: number;
}

export class MissionService {
  constructor(
    private readonly db: Db,
    private readonly rules: AttackRules = DEFAULT_ATTACK_RULES,
    private readonly map: MapConfig = DEFAULT_MAP_CONFIG,
  ) {}

  async sendAttack(opts: {
    originCityId: number;
    playerId: number;
    worldId: number;
    target: { k: number; d: number; s: number };
    units: Record<string, number>;
    heroIds?: number[];
    /** OYUN saatinde "şimdi" (yola çıkış anı). */
    at: Date;
    /** Çift-tıklama koruması. */
    idempotencyKey?: string;
  }): Promise<AttackMission> {
    const units = normalizeUnits(opts.units);
    if (Object.keys(units).length === 0) {
      throw new MissionError('no_units', 'Saldırıya en az bir savaşçı göndermelisiniz.');
    }
    for (const id of Object.keys(units)) {
      const def = UNITS_BY_ID[id];
      if (!def) throw new MissionError('unknown_unit', `Bilinmeyen birim: ${id}`);
      if (def.kind !== 'warrior') {
        throw new MissionError('unit_cannot_march', `${def.name.tr} sefere çıkamaz (savunma birimi).`);
      }
      if (this.rules.attackForbiddenUnits.includes(id)) {
        throw new MissionError('unit_cannot_march', `${def.name.tr} saldırı görevine katılamaz.`);
      }
    }

    // Ordunun hızı = EN YAVAŞ birim. Kahraman bu hesaba GİRMEZ (§13.5.5).
    const speed = armySpeed(units);
    if (speed == null) throw new MissionError('unit_cannot_march', 'Bu ordu sefere çıkamaz.');

    const heroIds = [...new Set(opts.heroIds ?? [])];

    return this.db.transaction(async (tx) => {
      const t = tx as unknown as Tx;

      const origin = await this.loadOrigin(t, opts.originCityId, opts.playerId, opts.worldId);
      const target = await this.loadTarget(t, opts.worldId, opts.target);

      if (target.playerId === opts.playerId) {
        throw new MissionError('self_attack', 'Kendi şehrinize saldıramazsınız.');
      }

      await this.assertTargetAttackable(t, target.playerId, opts.at);
      await this.assertAttackLimit(t, opts.playerId, target.id, opts.at);
      await this.assertMarchLimit(t, opts.originCityId, opts.playerId);

      // ⭐ Saldıran kendi acemi korumasını ANINDA kaybeder (§13.5.4). Saldırı yazılmadan önce
      // düşürülür: "korumalıyken vur, korumalı kal" boşluğu hiç oluşmaz.
      await t.execute(sql`
        UPDATE players SET protected_until = NULL
         WHERE id = ${opts.playerId} AND protected_until IS NOT NULL
      `);

      await this.reserveUnits(t, opts.originCityId, units);
      const cartography = await this.cartographyLevel(t, opts.playerId);
      const speedMultiplier = await this.speedMultiplier(t, opts.worldId);

      const D = distance(origin, target, this.map);
      const seconds = travelSeconds({ distance: D, speed, cartography, speedMultiplier }, this.map);
      const executeAt = new Date(opts.at.getTime() + seconds * 1000);

      const rows = await t.execute<Record<string, unknown>>(sql`
        INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                              target_k, target_d, target_s, execute_at, payload, idempotency_key)
        VALUES (${opts.worldId}, 'attack', 'scheduled', ${opts.playerId},
                ${opts.originCityId}, ${target.id},
                ${target.k}, ${target.d}, ${target.s},
                ${executeAt.toISOString()}::timestamptz,
                ${JSON.stringify({
                  distance: D, speed, travelSeconds: seconds, cartography,
                  departedAt: opts.at.toISOString(),
                })}::jsonb,
                ${opts.idempotencyKey ?? null})
        RETURNING id
      `);
      const missionId = Number(rows[0]!['id']);

      for (const [type, count] of Object.entries(units)) {
        await t.execute(sql`
          INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${missionId}, ${type}, ${count})
        `);
      }
      if (heroIds.length > 0) await this.reserveHeroes(t, missionId, heroIds, opts, origin);

      await t.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after, trace_id)
        VALUES (${opts.worldId}, ${opts.playerId}, 'mission.attack.sent', 'mission', ${missionId},
                ${JSON.stringify({ units, heroIds, targetCityId: target.id, executeAt: executeAt.toISOString() })}::jsonb,
                ${`mission:${missionId}`})
      `);

      // ⭐ Hedef oyuncu GÖRÜR: varış saati + kaynak şehir. Birleşim GİZLİ (§13.10.1) — bu yüzden
      // bildirimde birim dökümü YOK; öğrenmek için casusluk gerekir.
      await t.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${opts.worldId}, 'city:incoming_attack',
                ${JSON.stringify({
                  missionId,
                  defenderPlayerId: target.playerId,
                  targetCityId: target.id,
                  originCoordinates: { k: origin.k, d: origin.d, s: origin.s },
                  arrivesAt: executeAt.toISOString(),
                })}::jsonb)
      `);

      return {
        missionId,
        originCityId: opts.originCityId,
        targetCityId: target.id,
        units,
        heroIds,
        speed,
        distance: D,
        travelSeconds: seconds,
        executeAt,
      };
    });
  }

  /**
   * ⭐ GÖREV İPTALİ (kullanıcı isteği, 2026-07-27).
   *
   * Ordu yoldayken geri çağrılabilir. **Dönüş süresi = GİDİLEN yol kadar**: yolun yarısındaysa
   * yarı sürede döner. Bu, iptali bedava bir "geri al" düğmesi olmaktan çıkarır — orduyu
   * göndermek gerçek bir zaman taahhüdüdür ve iptal o taahhüdün yarısını yine ödetir.
   *
   * ⚠️ **Dönüş bacağı iptal EDİLEMEZ**: ordu zaten eve geliyor, iptalin bir anlamı yok.
   * ⚠️ Görev vadesi gelmiş ve worker onu almışsa (`running`) iptal edilemez — savaş çözülüyordur.
   *    Bu yüzden koşul `status = 'scheduled'` ve satır `FOR UPDATE` ile kilitleniyor: worker'ın
   *    aynı anda görevi alması ile iptal yarışırsa **biri kaybeder ve durum tutarlı kalır**.
   */
  async cancelMission(opts: {
    missionId: number;
    playerId: number;
    worldId: number;
    /** OYUN saatinde "şimdi". */
    at: Date;
  }): Promise<{ returnMissionId: number; returnSeconds: number; executeAt: Date }> {
    return this.db.transaction(async (tx) => {
      const t = tx as unknown as Tx;

      const rows = await t.execute<Record<string, unknown>>(sql`
        SELECT id, world_id, type, status, owner_player_id, origin_city_id, target_city_id,
               execute_at, created_at, payload
          FROM missions
         WHERE id = ${opts.missionId}
         FOR UPDATE
      `);
      const m = rows[0];
      if (!m) throw new MissionError('mission_not_found', 'Görev bulunamadı.');
      if (Number(m['owner_player_id']) !== opts.playerId
        || Number(m['world_id']) !== opts.worldId) {
        throw new MissionError('not_owner', 'Bu görev sizin değil.');
      }
      const type = String(m['type']);
      if (type === 'return') {
        throw new MissionError('not_cancelable', 'Dönen ordu iptal edilemez, zaten geliyor.');
      }
      if (!CANCELABLE_TYPES.includes(type)) {
        throw new MissionError('not_cancelable', 'Bu görev tipi iptal edilemez.');
      }
      if (String(m['status']) !== 'scheduled') {
        throw new MissionError('not_cancelable', 'Görev şu anda işleniyor, artık iptal edilemez.');
      }

      const payload = (m['payload'] ?? {}) as Record<string, unknown>;
      const travelSeconds = Math.max(1, Number(payload['travelSeconds'] ?? 0));
      const departedAt = payload['departedAt'] != null
        ? toDate(payload['departedAt'])
        : toDate(m['created_at']);

      // Gidilen yol = geçen süre; dönüş de o kadar sürer. Toplam yol süresini aşamaz.
      const elapsed = Math.round((opts.at.getTime() - departedAt.getTime()) / 1000);
      const returnSeconds = Math.max(1, Math.min(travelSeconds, elapsed));
      const executeAt = new Date(opts.at.getTime() + returnSeconds * 1000);

      await t.execute(sql`
        UPDATE missions SET status = 'canceled', finished_at = now() WHERE id = ${opts.missionId}
      `);

      const originCityId = Number(m['origin_city_id']);
      const targetCityId = m['target_city_id'] == null ? null : Number(m['target_city_id']);

      const ret = await t.execute<Record<string, unknown>>(sql`
        INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                              execute_at, payload, idempotency_key)
        VALUES (${opts.worldId}, 'return', 'scheduled', ${opts.playerId},
                ${targetCityId}, ${originCityId},
                ${executeAt.toISOString()}::timestamptz,
                ${JSON.stringify({
                  loot: { gold: 0, food: 0 },
                  travelSeconds: returnSeconds,
                  fromMissionId: opts.missionId,
                  // ⭐ Dönüşün ASLI: simge ve rapor metni buna bakar (casusluk dönüşü kuş simgesi
                  //    göstermeli, kılıç değil).
                  returnOf: type,
                  canceled: true,
                })}::jsonb,
                ${`return:${opts.missionId}`})
        RETURNING id
      `);
      const returnMissionId = Number(ret[0]!['id']);

      // Birlikler ve kahramanlar dönüş görevine taşınır (yeniden yazılmaz — aynı satırlar).
      await t.execute(sql`
        UPDATE mission_units SET mission_id = ${returnMissionId} WHERE mission_id = ${opts.missionId}
      `);
      await t.execute(sql`
        UPDATE mission_heroes SET mission_id = ${returnMissionId} WHERE mission_id = ${opts.missionId}
      `);

      // Hedef şehrin sahibi kim? İptal ona da bildirilmeli ki "gelen ordu" ekranından DÜŞSÜN.
      let targetPlayerId: number | null = null;
      if (targetCityId != null) {
        const c = await t.execute<Record<string, unknown>>(sql`
          SELECT player_id FROM cities WHERE id = ${targetCityId}
        `);
        targetPlayerId = c[0] == null ? null : Number(c[0]['player_id']);
      }

      await t.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${opts.worldId}, 'mission:canceled',
                ${JSON.stringify({
                  missionId: opts.missionId,
                  returnMissionId,
                  type,
                  ownerPlayerId: opts.playerId,
                  targetPlayerId,
                  targetCityId,
                  originCityId,
                })}::jsonb)
      `);

      await t.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after, trace_id)
        VALUES (${opts.worldId}, ${opts.playerId}, 'mission.canceled', 'mission', ${opts.missionId},
                ${JSON.stringify({ type, returnSeconds, returnMissionId })}::jsonb,
                ${`mission:${opts.missionId}`})
      `);

      return { returnMissionId, returnSeconds, executeAt };
    });
  }

  /* ── Doğrulamalar ─────────────────────────────────────────────────────────── */

  private async loadOrigin(tx: Tx, cityId: number, playerId: number, worldId: number): Promise<OriginRow> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT world_id, player_id, k, d, s FROM cities WHERE id = ${cityId}
    `);
    const c = rows[0];
    if (!c) throw new MissionError('city_not_found', 'Şehir bulunamadı.');
    if (Number(c['player_id']) !== playerId) throw new MissionError('not_owner', 'Bu şehir sizin değil.');
    // Dünya kimliği imzalı token'dan gelir; eşleşmiyorsa istek başka dünyaya sızmaya çalışıyordur.
    if (Number(c['world_id']) !== worldId) {
      throw new MissionError('world_mismatch', 'Şehir bu dünyaya ait değil.');
    }
    return {
      worldId, playerId,
      k: Number(c['k']), d: Number(c['d']), s: Number(c['s']),
    };
  }

  private async loadTarget(tx: Tx, worldId: number, at: { k: number; d: number; s: number }): Promise<TargetRow> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT id, player_id, k, d, s FROM cities
       WHERE world_id = ${worldId} AND k = ${at.k} AND d = ${at.d} AND s = ${at.s}
    `);
    const c = rows[0];
    if (!c) throw new MissionError('target_not_found', 'Bu koordinatta şehir yok.');
    return {
      id: Number(c['id']), playerId: Number(c['player_id']),
      k: Number(c['k']), d: Number(c['d']), s: Number(c['s']),
    };
  }

  /** Acemi koruması ve tatil modu — ikisi de OYUN saatiyle kıyaslanır. */
  private async assertTargetAttackable(tx: Tx, defenderPlayerId: number, at: Date): Promise<void> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT protected_until, vacation_until FROM players WHERE id = ${defenderPlayerId}
    `);
    const p = rows[0];
    if (!p) throw new MissionError('target_not_found', 'Hedef oyuncu bulunamadı.');

    const protectedUntil = p['protected_until'] == null ? null : toDate(p['protected_until']);
    if (protectedUntil && protectedUntil > at) {
      throw new MissionError(
        'target_protected',
        'Hedef oyuncu başlangıç koruması altında.',
        { until: protectedUntil.toISOString() },
      );
    }
    const vacationUntil = p['vacation_until'] == null ? null : toDate(p['vacation_until']);
    if (vacationUntil && vacationUntil > at) {
      throw new MissionError(
        'target_vacation',
        'Hedef oyuncu tatil modunda.',
        { until: vacationUntil.toISOString() },
      );
    }
  }

  /**
   * ⭐ 24 SAATTE 3 SALDIRI — **saldıran-hedef çifti başına** (anti-farm standardı).
   *
   * Pencereye hem son 24 saatte VARMIŞ hem de hâlâ YOLDA olan saldırılar girer; yoksa oyuncu
   * dördüncü orduyu yola çıkarıp "henüz varmadı" diyerek limiti delerdi.
   */
  private async assertAttackLimit(tx: Tx, attackerPlayerId: number, targetCityId: number, at: Date): Promise<void> {
    const since = new Date(at.getTime() - this.rules.attackWindowHours * 3600_000);
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM missions
       WHERE type = 'attack'
         AND owner_player_id = ${attackerPlayerId}
         AND target_city_id = ${targetCityId}
         AND status <> 'canceled'
         AND execute_at > ${since.toISOString()}::timestamptz
    `);
    const n = Number(rows[0]?.['n'] ?? 0);
    if (n >= this.rules.dailyAttackLimit) {
      throw new MissionError(
        'attack_limit',
        `Bu şehre ${this.rules.attackWindowHours} saatte en fazla ${this.rules.dailyAttackLimit} saldırı yapabilirsiniz.`,
        { used: n, limit: this.rules.dailyAttackLimit },
      );
    }
  }

  /**
   * Baraka seviyesi, şehirden aynı anda kaç sefer çıkabileceğini sınırlar.
   *
   * ⚠️ **Sayım ORDUNUN EVİNE göre yapılır, `origin_city_id`'ye göre DEĞİL.** Dönüş bacağında
   * `origin_city_id` **karşı tarafın şehri**dir (ordu oradan dönüyor); naif sayım iki hata
   * üretiyordu: (1) benim dönen ordum kendi limitime yazılmıyordu, (2) daha kötüsü **savunanın**
   * limitini işgal ediyordu — saldırıya uğrayan oyuncu, saldıranın ordusu dönerken kendi
   * ordusunu gönderemiyordu.
   */
  private async assertMarchLimit(tx: Tx, originCityId: number, playerId: number): Promise<void> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT
        (SELECT COALESCE(level, 0) FROM buildings
          WHERE city_id = ${originCityId} AND type = ${this.rules.marchLimitSource}) AS lvl,
        (SELECT COUNT(*)::int FROM missions
          WHERE owner_player_id = ${playerId}
            AND status IN ('scheduled', 'running')
            AND type IN ('attack', 'return', 'transport', 'support', 'spy', 'found_city')
            AND (
              (type <> 'return' AND origin_city_id = ${originCityId})
              OR (type = 'return' AND target_city_id = ${originCityId})
            )) AS n
    `);
    const level = Number(rows[0]?.['lvl'] ?? 0);
    const open = Number(rows[0]?.['n'] ?? 0);
    if (open >= Math.max(1, level)) {
      throw new MissionError(
        'march_limit',
        `Bu şehirden aynı anda en fazla ${Math.max(1, level)} sefer çıkabilir. Baraka'yı yükseltin.`,
        { open, limit: Math.max(1, level) },
      );
    }
  }

  /**
   * Birlikleri şehirden düşer. Koşullu tek UPDATE → iki eşzamanlı sefer aynı orduyu gönderemez
   * (satır kilidi Postgres tarafında, `count >= n` koşulu ikinci isteği boş döndürür).
   */
  private async reserveUnits(tx: Tx, cityId: number, units: Record<string, number>): Promise<void> {
    for (const [type, count] of Object.entries(units)) {
      const rows = await tx.execute<Record<string, unknown>>(sql`
        UPDATE units SET count = count - ${count}
         WHERE city_id = ${cityId} AND type = ${type} AND count >= ${count}
        RETURNING count
      `);
      if (rows.length === 0) {
        throw new MissionError(
          'insufficient_units',
          `Şehirde yeterli ${UNITS_BY_ID[type]?.name.tr ?? type} yok.`,
          { type, requested: count },
        );
      }
    }
  }

  /**
   * Kahramanları sefere bağlar: şehirden çıkarılır (`city_id = NULL`) ve `mission_heroes`'a yazılır.
   * `mission_heroes_hero` tekil indeksi sayesinde bir kahraman iki sefere aynı anda giremez —
   * kural sorguda değil ŞEMADA duruyor.
   */
  private async reserveHeroes(
    tx: Tx, missionId: number, heroIds: number[],
    opts: { playerId: number; worldId: number; at: Date }, _origin: OriginRow,
  ): Promise<void> {
    for (const heroId of heroIds) {
      const rows = await tx.execute<Record<string, unknown>>(sql`
        UPDATE heroes SET city_id = NULL
         WHERE id = ${heroId}
           AND player_id = ${opts.playerId}
           AND world_id = ${opts.worldId}
           AND city_id IS NOT NULL
           AND (dead_until IS NULL OR dead_until <= ${opts.at.toISOString()}::timestamptz)
        RETURNING id
      `);
      if (rows.length === 0) {
        throw new MissionError('hero_unavailable', 'Kahraman şu anda sefere çıkamaz (ölü veya görevde).');
      }
      await tx.execute(sql`
        INSERT INTO mission_heroes (mission_id, hero_id) VALUES (${missionId}, ${heroId})
      `);
    }
  }

  private async cartographyLevel(tx: Tx, playerId: number): Promise<number> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT level FROM techs WHERE player_id = ${playerId} AND type = 'cartography'
    `);
    return Number(rows[0]?.['level'] ?? 0);
  }

  private async speedMultiplier(tx: Tx, worldId: number): Promise<number> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT speed_multiplier FROM worlds WHERE id = ${worldId}
    `);
    return Number(rows[0]?.['speed_multiplier'] ?? 1) || 1;
  }
}

/** Adedi 0 veya negatif olan girdileri atar, tam sayıya indirir. */
function normalizeUnits(units: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(units)) {
    const count = Math.trunc(Number(n));
    if (Number.isFinite(count) && count > 0) out[id] = count;
  }
  return out;
}
