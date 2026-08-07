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
import {
  DEFAULT_CATALOG_CONFIG, HERO_SPEED, maxCities, teleportCooldownSeconds, UNITS_BY_ID,
  type CatalogConfig,
} from '@mobilwar/catalog';
import {
  armySpeed, distance, route, travelSeconds, type MapConfig, DEFAULT_MAP_CONFIG,
} from '@mobilwar/engine';
import { isVerified, UNVERIFIED_MESSAGE, unverifiedLimits } from '../auth/unverified.ts';
import { CityService } from '../cities/city.service.ts';
import { toDate, type Db } from '../db/client.ts';
import { liveNumber } from '../settings/live.ts';
import { WORLD_SHAPE } from '../world/world-shape.ts';
import { hasCargo, normalizeCargo, readResources, type Cargo } from './cargo.ts';
import type { Tx } from './handler-registry.ts';

/** `route()` çıktısı — mesafe + geçiş bayrakları birlikte taşınır. */
type RouteLeg = ReturnType<typeof route>;

/** Hedefi olan sefer tipleri — hedef kuralları (koruma/tatil/ceza) bunlara uygulanır. */
export type MissionKind = 'attack' | 'transport' | 'support' | 'spy' | 'found_city';

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
  /** ⭐ **GÖNDEREN** tatil modunda — `target_vacation`ın aynası (§tatil modu). */
  | 'on_vacation'
  /** ⭐ Hedef oyuncu cezalı ve cezası «saldırıya kapalı» (§oyuncu cezası). */
  | 'target_banned'
  /**
   * ⭐ **10 KAT KURALI** (kullanıcı, 2026-08-06): iki taraf arasındaki puan farkı çok büyük.
   * Çift yönlü — hem güçlünün zayıfı ezmesini hem zayıfın devi taciz etmesini kapatır.
   */
  | 'score_gap'
  | 'march_limit'
  | 'hero_unavailable'
  | 'world_mismatch'
  /* ── diğer görev tipleri ── */
  | 'slot_occupied'
  | 'slot_not_empty'
  | 'not_own_city'
  | 'same_city'
  | 'insufficient_resources'
  | 'carry_capacity'
  | 'no_cargo'
  | 'spy_needs_birds'
  | 'city_limit'
  /** Hedef koordinat haritanın dışında (`WORLD_SHAPE`) — yalnız şehir kurmada denetleniyor. */
  | 'out_of_world'
  | 'teleport_missing'
  | 'teleport_cooldown'
  /** §verify — e-postası doğrulanmamış hesap bu seferi yapamaz (403). */
  | 'email_unverified';

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

/**
 * ⚠️ `name` yalnız BİLDİRİM metni için okunuyor (2026-08-07): bildirim gövdesi
 * *"Çığlıktepe (1:45:7)"* diyor, çıplak koordinat değil. Kalkış anındaki adı outbox
 * yüküne yazmak, raporlardaki `route`un donmasıyla aynı ilke — şehir sonradan
 * yeniden adlandırılırsa bildirim yine olayın olduğu andaki adı gösterir.
 */
interface OriginRow {
  worldId: number;
  playerId: number;
  k: number;
  d: number;
  s: number;
  name: string;
}

interface TargetRow {
  id: number;
  playerId: number;
  k: number;
  d: number;
  s: number;
  name: string;
}

/** Sefere çıkan her görevin ortak sonucu. */
export interface MarchResult {
  missionId: number;
  originCityId: number;
  targetCityId: number | null;
  target: { k: number; d: number; s: number };
  units: Record<string, number>;
  heroIds: number[];
  speed: number;
  distance: number;
  travelSeconds: number;
  executeAt: Date;
}

export class MissionService {
  constructor(
    private readonly db: Db,
    private readonly cities: CityService,
    private readonly rules: AttackRules = DEFAULT_ATTACK_RULES,
    /**
     * ⭐ Harita/sefer ayarları **dünya başına** çözülür (`CaveService`/`QueueService` deseni).
     * Verilmezse motor varsayılanı — testler bu yüzden onu geçmeden çalışmaya devam ediyor.
     *
     * ⚠️ Sabit bir `MapConfig` almıyoruz: panelden yapılan değişiklik süreç yeniden başlayana
     * kadar görünmez kalırdı. Sürüm 2026-08-03'e kadar bu parametre vardı ve üretimde HİÇ
     * doldurulmuyordu — kanca duruyor ama kabloya bağlı değildi.
     */
    private readonly mapFor?: (worldId: number) => MapConfig,
    /**
     * ⭐ Katalog ayarları — şimdilik yalnız **teleport bekleme süresi** için gerekiyor
     * (`teleport.baseHours` / `levelStep`, 2026-08-03). Aynı dünya-başına-çözücü deseni.
     */
    private readonly catFor?: (worldId: number) => CatalogConfig,
  ) {}

  /** Bu dünyanın harita ayarı; çözücü yoksa motor varsayılanı. */
  private map(worldId: number): MapConfig {
    return this.mapFor?.(worldId) ?? DEFAULT_MAP_CONFIG;
  }

  /** Bu dünyanın katalog ayarı; çözücü yoksa katalog varsayılanı. */
  private cat(worldId: number): CatalogConfig {
    return this.catFor?.(worldId) ?? DEFAULT_CATALOG_CONFIG;
  }

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

    /**
     * Ordunun hızı = EN YAVAŞ ÜYE. Kahraman orduyu hızlandırmaz ama **yavaşlatabilir**
     * (2026-08-03) — gerekçe `travel.ts` `armySpeed`te.
     * ⚠️ Bu yüzden `heroIds` hız hesabından ÖNCE çözülüyor; sıra ters olsaydı kahraman
     * sayısı henüz bilinmezdi.
     */
    const heroIds = [...new Set(opts.heroIds ?? [])];
    const speed = armySpeed(units, heroIds.length);
    if (speed == null) throw new MissionError('unit_cannot_march', 'Bu ordu sefere çıkamaz.');

    return this.db.transaction(async (tx) => {
      const t = tx as unknown as Tx;

      const origin = await this.loadOrigin(t, opts.originCityId, opts.playerId, opts.worldId);
      const target = await this.loadTarget(t, opts.worldId, opts.target);

      if (target.playerId === opts.playerId) {
        throw new MissionError('self_attack', 'Kendi şehrinize saldıramazsınız.');
      }

      await this.assertNotOnVacation(t, opts.playerId);
      await this.assertVerified(t, opts.playerId, 'attack');
      await this.assertTargetAllowed(t, target.playerId, 'attack', opts.at);
      await this.assertAttackLimit(t, opts.playerId, target.id, opts.at);
      /**
       * ⭐ 10 KAT KURALI — **yalnız `sendAttack` gövdesinde.**
       *
       * ⚠️ Casusluk · nakliye · destek · şehir kurma ortak `march()` üzerinden gidiyor ve bu
       * kodu HİÇ GÖRMÜYOR. Yani "casusluk serbest kalsın" şartı için ayrı bir istisna yazmaya
       * gerek yok; kuralı buraya koymak onu kendiliğinden sağlıyor. Ortak yola koysaydık
       * istisnayı elle işlemek gerekir ve bir görev tipi eklendiğinde unutulurdu.
       */
      await this.assertScoreRatio(t, opts.playerId, target.playerId);
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

      const map = this.map(opts.worldId);
      const leg = route(origin, target, map);
      const D = leg.distance;
      const seconds = travelSeconds({ ...leg, speed, cartography, speedMultiplier }, map);
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
                  ...this.heroTravel(heroIds, leg, cartography, speedMultiplier, map),
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

      /**
       * ⭐ Hedef oyuncu GÖRÜR: varış saati + kaynak şehir + **birleşim** (kullanıcı 2026-07-31;
       * eskiden birim dökümü bilerek dışarıda bırakılıyordu).
       * ⚠️ WS olayının kendisi bunu TAŞIMAZ (`realtime.bus.ts` yalnız kimlik yayar; büyük
       * yük NOTIFY sınırına takılıp olayı sessizce düşürürdü) — istemci listeyi tazeler.
       *
       * ⚠️ `units` · `heroCount` · `arrivesAt` artık BİLDİRİM METNİNDE KULLANILMIYOR
       * (kullanıcı 2026-08-07: *"bildirimler detay içermesin"*). Yükte duruyorlar çünkü
       * Ordular ekranı ve gelecekteki tüketiciler için kayıt değeri var; katalogun onları
       * okumaması yeter. Alan SİLİNMEZ — outbox satırını daraltmak sessiz bir kırılma riski.
       */
      await t.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${opts.worldId}, 'city:incoming_attack',
                ${JSON.stringify({
                  missionId,
                  defenderPlayerId: target.playerId,
                  targetCityId: target.id,
                  originCoordinates: { k: origin.k, d: origin.d, s: origin.s },
                  /** ⭐ Bildirim gövdesi: savunanın HANGİ şehrine geliyor (ad + koordinat). */
                  targetCity: { k: target.k, d: target.d, s: target.s, name: target.name },
                  arrivesAt: executeAt.toISOString(),
                  units,
                  heroCount: heroIds.length,
                })}::jsonb)
      `);

      // ⭐ Gönderenin Ordular rozeti de anında güncellensin (bkz. `march` içindeki ikizi).
      await t.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${opts.worldId}, 'mission:sent',
                ${JSON.stringify({
                  missionId,
                  ownerPlayerId: opts.playerId,
                  targetPlayerId: target.playerId,
                  originCityId: opts.originCityId,
                  targetCityId: target.id,
                  type: 'attack',
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

  /* ═══ DİĞER GÖREV TİPLERİ (doküman: DÜNYA · NAKLİYE · DESTEK · CASUSLUK · ŞEHİR KURMA) ═══ */

  /**
   * ⭐ NAKLİYE — *"Altın ve/veya yemek transferi"*.
   *
   * Hedef **herhangi bir şehir** olabilir (kendi şehrin ya da başka oyuncunun). Kaynak **yola
   * çıkarken** düşer; hedefe varınca teslim edilir, ordu **boş döner** (§duzenleme_onerileri).
   *
   * ⚠️ Taşınabilecek miktarın tavanı ordunun **taşıma kapasitesi**dir (`carry`). Bu yüzden nakliye
   * gerçek bir lojistik kararıdır: Yük Arabası 5.000 taşır, Cüce 10.
   */
  async sendTransport(opts: SendOpts & { cargo: { gold: number; food: number } }): Promise<MarchResult> {
    const cargo = normalizeCargo(opts.cargo);
    if (cargo.gold + cargo.food <= 0) {
      throw new MissionError('no_cargo', 'Nakliyede en az bir kaynak göndermelisiniz.');
    }
    return this.march({
      ...opts,
      type: 'transport',
      payloadExtra: { cargo },
      before: async (t, ctx) => {
        this.assertCarryCapacity(ctx.units, cargo);
        // Kaynak yola çıkarken düşer; yoldaki mal kimsenin değildir (saldırı ganimetiyle aynı ilke).
        await this.cities.materialize(opts.originCityId, opts.at, t as never);
        const ok = await this.cities.trySpend(opts.originCityId, cargo, opts.at, t as never);
        if (!ok) {
          throw new MissionError('insufficient_resources', 'Şehrin kaynağı nakliye için yetmiyor.');
        }
      },
    });
  }

  /**
   * ⭐ DESTEK — *"Askerlerinizi bir şehirden diğerine taşımak"*.
   *
   * **TEK YÖNLÜ**: varışta savaşçılar hedef şehrin barakasına, kahramanlar o şehrin tapınağına
   * yerleşir; dönüş görevi YOKTUR. Doküman: *"Destek görevinde orduyla birlikte kaynak da
   * gönderebilirsiniz."* → isteğe bağlı kargo taşınır ve hedefin kasasına eklenir.
   *
   * ⚠️ Yalnız **kendi şehirlerine** (kullanıcı kararı): müttefike destek ittifak fazında gelecek.
   */
  async sendSupport(opts: SendOpts & { cargo?: { gold: number; food: number } }): Promise<MarchResult> {
    const cargo = normalizeCargo(opts.cargo ?? { gold: 0, food: 0 });
    return this.march({
      ...opts,
      type: 'support',
      requireOwnTarget: true,
      /**
       * ⭐ CASUS KUŞ DESTEKLE TAŞINABİLİR (kullanıcı, 2026-08-03).
       *
       * ⚠️ Bu bir denge kararı değil, bir ÇIKMAZIN çözümü: şehir terk etmek barakanın
       * TAMAMEN boş olmasını istiyor (`city.service.ts` `abandonBlockers`) ama kuş yalnız
       * casusluğa katılabildiği için şehirden hiç çıkarılamıyordu → kuşu olan şehir
       * **terk edilemiyordu**.
       * ⚠️ Savaş dengesi etkilenmiyor: destek kendi şehrine gider, kuşun savaş statı yok ve
       * saldırıya/nakliyeye hâlâ katılamıyor.
       * ⚠️ Ordu hızı yine en yavaş birimden: kuş (6000) hızı YÜKSELTMEZ.
       */
      allowSpyBird: true,
      payloadExtra: { cargo },
      before: async (t, ctx) => {
        if (cargo.gold + cargo.food > 0) {
          this.assertCarryCapacity(ctx.units, cargo);
          await this.cities.materialize(opts.originCityId, opts.at, t as never);
          const ok = await this.cities.trySpend(opts.originCityId, cargo, opts.at, t as never);
          if (!ok) {
            throw new MissionError('insufficient_resources', 'Şehrin kaynağı destek için yetmiyor.');
          }
        }
      },
    });
  }

  /**
   * ⭐ CASUSLUK — yalnız **Casus Kuş** gider.
   *
   * Doküman: *"Şehrinize ait barakadaki casus kuşlardan istediğiniz sayıda seçerek"*. Kuş sayısı
   * bilgi kademesini logaritmik büyütür (`8 kuş = +3 seviye`), bu yüzden başka birim karışamaz —
   * karışsaydı ordu hızı da düşerdi (kuş 6000, Cüce 100).
   */
  async sendSpy(opts: SendOpts): Promise<MarchResult> {
    const birds = opts.units['spy_bird'] ?? 0;
    const others = Object.keys(opts.units).filter((id) => id !== 'spy_bird' && opts.units[id]! > 0);
    if (birds <= 0 || others.length > 0) {
      throw new MissionError('spy_needs_birds', 'Casusluk görevine yalnız Casus Kuş gönderilir.');
    }
    return this.march({ ...opts, type: 'spy', forbidOwnTarget: true, allowSpyBird: true });
  }

  /**
   * ⭐ ŞEHİR KURMA — hedef **BOŞ şehir** olmalı.
   *
   * Doküman: *"Sömürgecilik tekniğinin her üç kademesinde yeni bir şehir kurulabilir. Bir oyuncu
   * en fazla 5 şehre sahip olabilir."* · *"Ordunuz şehir kurmaya giderken seçtiğiniz yere başka
   * bir oyuncu tarafından şehir kurulabilir. Bu durumda ordunuz şehir kuramadan geri dönecektir."*
   *
   * ⚠️ Şehir yeri **kalkışta** boş olsa bile varışta dolu olabilir — asıl kontrol handler'da, varış
   * anında yapılır. Buradaki kontrol yalnız oyuncuyu boşuna göndermemek için.
   */
  async sendFoundCity(opts: SendOpts & { cargo?: Cargo }): Promise<MarchResult> {
    const cargo = normalizeCargo(opts.cargo ?? { gold: 0, food: 0 });
    /**
     * ⚠️ Harita sınırı kontrolü EN BAŞTA, transaction açılmadan: en ucuz ret önce.
     * Gerekçesi `assertWithinWorld` başlığında.
     */
    assertWithinWorld(opts.target);
    return this.march({
      ...opts,
      type: 'found_city',
      targetMustBeEmpty: true,
      /**
       * ⭐ CASUS KUŞ ŞEHİR KURABİLİR ve TEK BAŞINA gidebilir (kullanıcı, 2026-08-07).
       *
       * ⚠️ Bunun dengeye etkisi büyük ve **bilerek kabul edildi**: kuşun hızı 6000, en hızlı
       * savaşçı 160 ve süre hızla ters orantılı (`travel.ts` `×100/hız`) → tek kuş komşu
       * diyara ~40 saniyede varır, normal ordu ~40 dakikada. Yani kuş, kolonileşmenin
       * zamanlama maliyetini pratikte sıfırlıyor. Hız kırpma seçeneği kullanıcıya sunuldu ve
       * REDDEDİLDİ; `travel.ts`'e bu yüzden hiç dokunulmadı.
       * ⚠️ Kuşun `carry` değeri 0 → tek kuş kaynak taşıyamaz (kapasite kapısı zaten söyler).
       */
      allowSpyBird: true,
      /**
       * ⭐ KAHRAMAN TEK BAŞINA ŞEHİR KURABİLİR (kullanıcı, 2026-08-07). Yeni şehir garnizonsuz
       * doğar — savunmasız ama kurulur; kahraman varışta tapınağa yerleşir.
       */
      allowEmptyArmy: true,
      /**
       * ⚠️ `cargo` boş olsa bile payload'a YAZILIR (`sendSupport` ile aynı desen): varış
       * handler'ı ve iptal yolu alanı koşulsuz okuyor, `undefined` ile `{0,0}` ayrımı
       * yapmak zorunda kalmasınlar.
       */
      payloadExtra: { cargo },
      before: async (t, ctx) => {
        const rows = await t.execute<Record<string, unknown>>(sql`
          SELECT
            (SELECT COUNT(*)::int FROM cities WHERE player_id = ${opts.playerId}) AS owned,
            (SELECT COALESCE(level, 0) FROM techs
              WHERE player_id = ${opts.playerId} AND type = 'colonization') AS colonization,
            (SELECT COUNT(*)::int FROM missions
              WHERE owner_player_id = ${opts.playerId} AND type = 'found_city'
                AND status IN ('scheduled', 'running')) AS pending
        `);
        const owned = Number(rows[0]?.['owned'] ?? 0);
        const pending = Number(rows[0]?.['pending'] ?? 0);
        const colonization = Number(rows[0]?.['colonization'] ?? 0);
        const limit = maxCities(colonization);
        // Yoldaki şehir kurma görevleri de sayılır; yoksa oyuncu aynı anda beş görev yollayıp
        // limiti delerdi ("henüz kurulmadı" boşluğu — saldırı limitindeki tuzağın ikizi).
        if (owned + pending >= limit) {
          throw new MissionError(
            'city_limit',
            `En fazla ${limit} şehre sahip olabilirsiniz (Sömürgecilik ${colonization}). `
            + 'Sömürgecilik tekniğinin her üç kademesi bir şehir daha açar.',
            { owned, pending, limit, colonization },
          );
        }

        /**
         * ⭐ KURULUŞ KARGOSU (kullanıcı, 2026-08-07) — `sendTransport`/`sendSupport` deseni.
         *
         * ⚠️ **2026-08-07'ye kadar bu blok HİÇ YOKTU ve kargo sessizce yutuluyordu:**
         * controller `cargo`yu hesaplıyor ama `sendFoundCity`ye geçirmiyordu, imzada alan da
         * yoktu. Zod isteği kabul ettiği için oyuncu hata bile almıyordu. En sinsi tarafı,
         * Yük Arabası'nın (taşıma 5000) kuruluş listesinde seçilebilir olmasıydı: oyuncu
         * "kapasitesi var, demek ki taşıyacak" diye ekliyor, hiçbir şey taşınmıyor ve
         * hiçbir uyarı da çıkmıyordu.
         *
         * ⚠️ `assertCarryCapacity` YALNIZ kargo varken çağrılıyor — yoksa yalnız-kahraman
         * seferi (kapasite 0) sebepsizce reddedilirdi.
         * ⚠️ Kaynak yola çıkarken düşer; yoldaki mal kimsenin değildir (nakliyeyle aynı ilke).
         * Varışta yeni şehrin kesesine yazılır, kuruluş başarısız olursa orduyla geri döner.
         */
        if (hasCargo(cargo)) {
          this.assertCarryCapacity(ctx.units, cargo);
          await this.cities.materialize(opts.originCityId, opts.at, t as never);
          const ok = await this.cities.trySpend(opts.originCityId, cargo, opts.at, t as never);
          if (!ok) {
            throw new MissionError(
              'insufficient_resources', 'Şehrin kaynağı şehir kurma seferi için yetmiyor.',
            );
          }
        }
      },
    });
  }

  /**
   * ⭐ TELEPORT — **anlıktır**, görev satırı yoktur.
   *
   * Doküman: *"Kendi şehirleriniz arasında ordularınızın büyülü bir transferini sağlar. Bu işlem
   * anlık olarak gerçekleşir. Kaynaklarınızı teleport ile gönderemezsiniz. Teleport yapmak için
   * her iki şehrinizde de Teleport binası en az 1. seviyede olmalıdır."*
   *
   * Kullanımdan sonra **kaynak şehrin** Teleport binası bekleme süresine girer
   * (`teleportCooldownSeconds`, seviye başına %2 kısalır).
   */
  async teleport(opts: {
    originCityId: number;
    playerId: number;
    worldId: number;
    target: { k: number; d: number; s: number };
    units: Record<string, number>;
    heroIds?: number[];
    at: Date;
  }): Promise<{ targetCityId: number; units: Record<string, number>; heroIds: number[]; readyAt: Date }> {
    const units = normalizeUnits(opts.units);
    if (Object.keys(units).length === 0) {
      throw new MissionError('no_units', 'Teleport ile en az bir savaşçı taşımalısınız.');
    }
    const heroIds = [...new Set(opts.heroIds ?? [])];

    return this.db.transaction(async (tx) => {
      const t = tx as unknown as Tx;
      await this.loadOrigin(t, opts.originCityId, opts.playerId, opts.worldId);
      const target = await this.loadTarget(t, opts.worldId, opts.target);
      if (target.playerId !== opts.playerId) {
        throw new MissionError('not_own_city', 'Teleport yalnız kendi şehirleriniz arasında yapılır.');
      }
      if (target.id === opts.originCityId) {
        throw new MissionError('same_city', 'Kaynak ve hedef aynı şehir.');
      }

      // İKİ şehirde de Teleport ≥ 1 (doküman).
      const lv = await t.execute<Record<string, unknown>>(sql`
        SELECT
          (SELECT COALESCE(level,0) FROM buildings WHERE city_id = ${opts.originCityId} AND type = 'teleport') AS a,
          (SELECT COALESCE(level,0) FROM buildings WHERE city_id = ${target.id} AND type = 'teleport') AS b,
          (SELECT teleport_ready_at FROM cities WHERE id = ${opts.originCityId}) AS ready
      `);
      const fromLevel = Number(lv[0]?.['a'] ?? 0);
      const toLevel = Number(lv[0]?.['b'] ?? 0);
      if (fromLevel < 1 || toLevel < 1) {
        throw new MissionError(
          'teleport_missing',
          'Teleport için HER İKİ şehirde de Teleport binası en az 1. seviye olmalı.',
          { from: fromLevel, to: toLevel },
        );
      }
      const readyRaw = lv[0]?.['ready'];
      const ready = readyRaw == null ? null : toDate(readyRaw);
      if (ready && ready > opts.at) {
        throw new MissionError('teleport_cooldown', 'Teleport binası henüz hazır değil.', {
          readyAt: ready.toISOString(),
        });
      }

      // Birlikler kaynaktan düşer, hedefe ANINDA eklenir — arada "yolda" durumu yok.
      await this.reserveUnits(t, opts.originCityId, units);
      for (const [type, count] of Object.entries(units)) {
        await t.execute(sql`
          INSERT INTO units (city_id, type, count) VALUES (${target.id}, ${type}, ${count})
          ON CONFLICT (city_id, type) DO UPDATE SET count = units.count + ${count}
        `);
      }
      for (const heroId of heroIds) {
        const moved = await t.execute<Record<string, unknown>>(sql`
          UPDATE heroes SET city_id = ${target.id}
           WHERE id = ${heroId} AND player_id = ${opts.playerId} AND world_id = ${opts.worldId}
             AND city_id = ${opts.originCityId}
             AND status = 'alive'
          RETURNING id
        `);
        if (moved.length === 0) {
          throw new MissionError('hero_unavailable', 'Kahraman teleport edilemez (ölü veya başka şehirde).');
        }
      }

      const cooldown = teleportCooldownSeconds(fromLevel, this.cat(opts.worldId));
      const readyAt = new Date(opts.at.getTime() + cooldown * 1000);
      await t.execute(sql`
        UPDATE cities SET teleport_ready_at = ${readyAt.toISOString()}::timestamptz
         WHERE id = ${opts.originCityId}
      `);

      await t.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after, trace_id)
        VALUES (${opts.worldId}, ${opts.playerId}, 'mission.teleport', 'city', ${target.id},
                ${JSON.stringify({ from: opts.originCityId, units, heroIds, readyAt: readyAt.toISOString() })}::jsonb,
                ${`teleport:${opts.originCityId}:${opts.at.getTime()}`})
      `);
      await t.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${opts.worldId}, 'city:changed',
                ${JSON.stringify({ cityId: target.id, playerId: opts.playerId, reason: 'teleport' })}::jsonb)
      `);

      return { targetCityId: target.id, units, heroIds, readyAt };
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
               target_k, target_d, target_s, execute_at, created_at, payload
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
      /**
       * ⭐ İPTALDE KARGO GERİ GELİR (kullanıcı, 2026-08-07).
       *
       * ⚠️ Burada eskiden sabit `{gold:0, food:0}` vardı ve kalkışta şehirden DÜŞEN kaynak
       * iptalde **yok oluyordu** — `transport`, `support` ve (kargo eklendikten sonra)
       * `found_city` üçünde de. İptal bir zaman cezası olmalı, kaynak imha makinesi değil.
       *
       * ⚠️ `attack`/`spy` payload'ında `cargo` alanı YOK → `{0,0}` döner, davranışları
       * bit-bit aynı kalır.
       * ⚠️ Çift sayım yok: iptal edilen görev `canceled` oluyor ve handler'ı HİÇ çalışmıyor,
       * yani kargo hedefe/yeni şehre de yazılmıyor. Tek kredilendiren dönüş bacağı.
       */
      const canceledCargo = readResources(payload['cargo']);
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
                  loot: canceledCargo,
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
      } else if (type === 'found_city' && m['target_k'] != null) {
        /* ⭐ Şehir kurma yarışı: koordinata arada şehir kurulduysa sahibi bu görevi "gelen
         * saldırı" olarak görüyordu — iptali de anında görmeli (yoksa satır 60 sn bayat kalır). */
        const c = await t.execute<Record<string, unknown>>(sql`
          SELECT player_id FROM cities
           WHERE world_id = ${opts.worldId} AND k = ${Number(m['target_k'])}
             AND d = ${Number(m['target_d'])} AND s = ${Number(m['target_s'])}
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

  /* ── Ortak sefer akışı ────────────────────────────────────────────────────── */

  /**
   * Saldırı DIŞINDAKİ tüm seferlerin ortak gövdesi: doğrula → birlikleri düş → görevi yaz.
   *
   * Saldırı bilerek ayrı duruyor: onun kendine özgü kuralları (24s/3 limiti, acemi koruması
   * düşürme, savunma bildirimi) var ve bunları bayraklarla buraya taşımak iki akışı da
   * okunmaz hâle getirirdi. Ortak olan her şey (`loadOrigin`, `assertMarchLimit`, `reserveUnits`,
   * `reserveHeroes`, sefer süresi) yine paylaşılıyor.
   */
  private async march(o: SendOpts & {
    type: 'transport' | 'support' | 'spy' | 'found_city';
    /** Hedef benim şehrim OLMALI (destek). */
    requireOwnTarget?: boolean;
    /** Hedef benim şehrim OLAMAZ (casusluk). */
    forbidOwnTarget?: boolean;
    /** Hedef BOŞ şehir olmalı (şehir kurma). */
    targetMustBeEmpty?: boolean;
    /**
     * Casus Kuş'a izin ver — casusluk, **destek** (2026-08-03; gerekçe `sendSupport`ta) ve
     * **şehir kurma** (2026-08-07, kullanıcı kararı; gerekçe `sendFoundCity`ta).
     */
    allowSpyBird?: boolean;
    /**
     * ⭐ Ordu BOŞ olabilir — yalnız kahraman(lar) gidebilir (şehir kurma, kullanıcı 2026-08-07).
     * ⚠️ Kahramansız boş ordu yine reddedilir: bayrak "birlik şart değil" der, "kimse gitmesin
     *    de olur" demez.
     */
    allowEmptyArmy?: boolean;
    payloadExtra?: Record<string, unknown>;
    before?: (t: Tx, ctx: { units: Record<string, number> }) => Promise<void>;
  }): Promise<MarchResult> {
    const units = normalizeUnits(o.units);
    /**
     * ⚠️ `heroIds` artık boşluk kontrolünden de ÖNCE okunuyor: ordunun boş olup olamayacağı
     * kararı kahraman sayısına bağlı (aşağı). Hız hesabı için de zaten gerekiyordu.
     */
    const heroIds = [...new Set(o.heroIds ?? [])];
    if (Object.keys(units).length === 0) {
      if (!o.allowEmptyArmy) {
        throw new MissionError('no_units', 'Göreve en az bir birim göndermelisiniz.');
      }
      if (heroIds.length === 0) {
        throw new MissionError(
          'no_units', 'Sefere en az bir birim ya da bir kahraman göndermelisiniz.',
        );
      }
    }
    for (const id of Object.keys(units)) {
      const def = UNITS_BY_ID[id];
      if (!def) throw new MissionError('unknown_unit', `Bilinmeyen birim: ${id}`);
      if (def.kind !== 'warrior') {
        throw new MissionError('unit_cannot_march', `${def.name.tr} sefere çıkamaz (savunma birimi).`);
      }
      if (id === 'spy_bird' && !o.allowSpyBird) {
        // ⚠️ Metin 2026-08-03'te güncellendi: destek de artık kuş taşıyor, eski cümle
        //    ("yalnız casusluk görevine katılır") oyuncuya yanlış kural öğretiyordu.
        throw new MissionError(
          'unit_cannot_march', 'Casus Kuş yalnız casusluk ve destek görevine katılır.',
        );
      }
    }
    /**
     * ⚠️ Kahraman sayısı hesaba GİRİYOR: kahraman orduyu yavaşlatabilir (bkz. `sendAttack`).
     * Boş orduda `armySpeed({}, 1)` `HERO_SPEED`i (200) döndürüyor — yalnız-kahraman seferi
     * bu sayede kendiliğinden doğru hızda yürüyor, ayrı bir dala gerek yok.
     */
    const speed = armySpeed(units, heroIds.length);
    if (speed == null) throw new MissionError('unit_cannot_march', 'Bu ordu sefere çıkamaz.');

    return this.db.transaction(async (tx) => {
      const t = tx as unknown as Tx;
      const origin = await this.loadOrigin(t, o.originCityId, o.playerId, o.worldId);

      let targetId: number | null = null;
      let targetPlayerId: number | null = null;
      /** Bildirim gövdesi için hedefin adı + koordinatı; boş koordinata kuruluşta `null`. */
      let targetPlace: { k: number; d: number; s: number; name: string } | null = null;
      if (o.targetMustBeEmpty) {
        const occupied = await t.execute<Record<string, unknown>>(sql`
          SELECT id FROM cities
           WHERE world_id = ${o.worldId} AND k = ${o.target.k} AND d = ${o.target.d} AND s = ${o.target.s}
        `);
        if (occupied.length > 0) {
          throw new MissionError('slot_occupied', 'Bu koordinatta zaten bir şehir var.');
        }
      } else {
        const target = await this.loadTarget(t, o.worldId, o.target);
        targetId = target.id;
        targetPlayerId = target.playerId;
        targetPlace = { k: target.k, d: target.d, s: target.s, name: target.name };
        if (target.id === o.originCityId) {
          throw new MissionError('same_city', 'Kaynak ve hedef aynı şehir.');
        }
        if (o.requireOwnTarget && target.playerId !== o.playerId) {
          throw new MissionError('not_own_city', 'Bu görev yalnız kendi şehirlerinize yapılabilir.');
        }
        if (o.forbidOwnTarget && target.playerId === o.playerId) {
          throw new MissionError('self_attack', 'Kendi şehrinize bu görevi gönderemezsiniz.');
        }
        /**
         * ⚠️ Artık TÜM tiplerde çağrılıyor (eskiden yalnız `spy`): ceza kuralları nakliye ve
         * desteği de bağlıyor. Koruma/tatil ayrımı fonksiyonun İÇİNDE — çağıran tarafta
         * kalsaydı yeni bir görev tipi eklendiğinde kuralı taşımayı unutmak kolay olurdu.
         *
         * ⚠️ Kendi şehrine gönderimde atlanıyor: cezalı oyuncu zaten giriş yapamaz, yani
         * kendi seferini başlatamaz; gereksiz bir sorgu olurdu.
         */
        if (target.playerId !== o.playerId) {
          await this.assertTargetAllowed(t, target.playerId, o.type, o.at);
        }
      }

      await this.assertNotOnVacation(t, o.playerId);
      await this.assertVerified(t, o.playerId, o.type);
      await this.assertMarchLimit(t, o.originCityId, o.playerId);
      await o.before?.(t, { units });
      await this.reserveUnits(t, o.originCityId, units);

      const cartography = await this.cartographyLevel(t, o.playerId);
      const speedMultiplier = await this.speedMultiplier(t, o.worldId);
      const map = this.map(o.worldId);
      const leg = route(origin, o.target, map);
      const D = leg.distance;
      /**
       * ⚠️ Görev tipine göre AYRI bir taban YOK (2026-08-03). Casus seferi de bu satırdan geçer
       * ve farkını yalnız Casus Kuş'un hızından (6000) alır — süre baştan sona hıza orantılı.
       * Eskiden `spy: true` ile ayrı bir taban (120 sn) veriliyordu ve o, katalogdaki hız
       * sütununu anlamsızlaştırıyordu (kullanıcı kararıyla kaldırıldı).
       */
      const seconds = travelSeconds({ ...leg, speed, cartography, speedMultiplier }, map);
      const executeAt = new Date(o.at.getTime() + seconds * 1000);

      const rows = await t.execute<Record<string, unknown>>(sql`
        INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                              target_k, target_d, target_s, execute_at, payload, idempotency_key)
        VALUES (${o.worldId}, ${o.type}, 'scheduled', ${o.playerId},
                ${o.originCityId}, ${targetId},
                ${o.target.k}, ${o.target.d}, ${o.target.s},
                ${executeAt.toISOString()}::timestamptz,
                ${JSON.stringify({
                  ...(o.payloadExtra ?? {}),
                  distance: D, speed, travelSeconds: seconds, cartography,
                  ...this.heroTravel(heroIds, leg, cartography, speedMultiplier, map),
                  departedAt: o.at.toISOString(),
                })}::jsonb,
                ${o.idempotencyKey ?? null})
        RETURNING id
      `);
      const missionId = Number(rows[0]!['id']);

      for (const [type, count] of Object.entries(units)) {
        await t.execute(sql`
          INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${missionId}, ${type}, ${count})
        `);
      }
      if (heroIds.length > 0) await this.reserveHeroes(t, missionId, heroIds, o, origin);

      await t.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after, trace_id)
        VALUES (${o.worldId}, ${o.playerId}, ${`mission.${o.type}.sent`}, 'mission', ${missionId},
                ${JSON.stringify({
                  units, heroIds, target: o.target, targetCityId: targetId,
                  executeAt: executeAt.toISOString(), ...(o.payloadExtra ?? {}),
                })}::jsonb,
                ${`mission:${missionId}`})
      `);

      /**
       * ⭐ GÖNDERENE de haber ver (kullanıcı, 2026-08-02): görev verilir verilmez sol menüdeki
       * (ve mobilde alt bardaki) **Ordular rozeti** belirsin.
       *
       * ⚠️ Buraya kadar yalnız SAVUNANA olay yazılıyordu (`city:incoming_*`). Gönderenin
       * ekranı, isteği yapan mutation'ın sorguyu tazelemesine bağlıydı — yani rozet YALNIZ
       * görevi veren sekmede güncelleniyordu. Oyuncunun ikinci bir sekmesi ya da telefonu
       * açıksa orada 60 sn'lik emniyet yoklamasına kadar hiçbir şey değişmiyordu.
       *
       * Nakliye, destek ve şehir kurmanın hiçbir olayı yoktu; bu satır dördünü birden kapatıyor.
       */
      await t.execute(sql`
        INSERT INTO outbox (world_id, topic, payload)
        VALUES (${o.worldId}, 'mission:sent',
                ${JSON.stringify({
                  missionId,
                  ownerPlayerId: o.playerId,
                  /**
                   * ⚠️ ALICI da yazılıyor (2026-08-03): gelen nakliye/destek/şehir kurma
                   * savunan tarafta HİÇ olay üretmiyordu — `city:incoming_*` yalnız saldırı
                   * ve casuslukta var. Alıcının Ordular satırı 60 sn'lik yoklamayı bekliyordu.
                   */
                  targetPlayerId,
                  originCityId: o.originCityId,
                  targetCityId: targetId,
                  type: o.type,
                  /**
                   * ⭐ Bildirim gövdesi için kaynak şehir (kullanıcı 2026-08-07): başka bir
                   * oyuncuya nakliye yola çıkınca ALICI kalkışta haber alıyor ve gövdede
                   * "nereden" yazıyor. Katalog tek metin kaynağı olduğu için adı buradan
                   * almak zorunda — `mission:sent` yükünde şehir kimliğinden başka bir şey yoktu.
                   */
                  originCity: { k: origin.k, d: origin.d, s: origin.s, name: origin.name },
                })}::jsonb)
      `);

      // ⭐ CASUSLUK GİDİŞİ HEDEFTE GÖRÜNÜR (kullanıcı, §13.11.6): kırmızı kuş simgesi. Kaç kuş
      //    geldiği de GÖRÜNÜR (kullanıcı 2026-07-31; eskiden gizliydi) — savunan kuş sayısını
      //    varıştan önce bilir ve karşı kuş üretip üretmeyeceğine karar verebilir.
      // ⚠️ `birds` ve `arrivesAt` ekranda kalıyor ama BİLDİRİM METNİNDE artık yok
      //    (2026-08-07) — gerekçe `sendAttack`taki ikizinde.
      if (o.type === 'spy' && targetPlayerId != null && targetId != null) {
        await t.execute(sql`
          INSERT INTO outbox (world_id, topic, payload)
          VALUES (${o.worldId}, 'city:incoming_spy',
                  ${JSON.stringify({
                    missionId, defenderPlayerId: targetPlayerId, targetCityId: targetId,
                    originCoordinates: { k: origin.k, d: origin.d, s: origin.s },
                    targetCity: targetPlace,
                    arrivesAt: executeAt.toISOString(),
                    birds: units['spy_bird'] ?? 0,
                  })}::jsonb)
        `);
      }

      return {
        missionId,
        originCityId: o.originCityId,
        targetCityId: targetId,
        target: o.target,
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
   * Taşınan kaynak ordunun taşıma kapasitesini aşamaz.
   * Doküman kapasiteleri: Yük Arabası 5.000 · Ogre 500 · Ejderha 300 · Cüce 10 …
   */
  private assertCarryCapacity(units: Record<string, number>, cargo: { gold: number; food: number }): void {
    let capacity = 0;
    for (const [id, n] of Object.entries(units)) capacity += (UNITS_BY_ID[id]?.carry ?? 0) * n;
    const total = cargo.gold + cargo.food;
    if (total > capacity) {
      /**
       * ⚠️ Kapasite SIFIR ayrı bir cümleyi hak ediyor: *"Ordunun taşıma kapasitesi 0"* oyuncuya
       * hiçbir şey öğretmiyor ve ordu hiç yokken (yalnız kahraman gönderirken) tuhaf duruyor.
       * Sebep her iki hâlde de aynı: seçilen birimlerin `carry` değeri yok.
       * ⚠️ Hata KODU `carry_capacity` olarak KALIYOR — istemci koda bakıyor, metne değil.
       */
      throw new MissionError(
        'carry_capacity',
        capacity === 0
          ? 'Bu orduda kaynak taşıyabilecek birim yok. Kaynak göndermek için Yük Arabası gibi '
            + 'taşıma kapasitesi olan bir birim ekleyin.'
          : `Ordunun taşıma kapasitesi ${capacity}; ${total} kaynak taşıyamaz.`,
        { capacity, requested: total },
      );
    }
  }

  /* ── Doğrulamalar ─────────────────────────────────────────────────────────── */

  private async loadOrigin(tx: Tx, cityId: number, playerId: number, worldId: number): Promise<OriginRow> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT world_id, player_id, k, d, s, name FROM cities WHERE id = ${cityId}
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
      k: Number(c['k']), d: Number(c['d']), s: Number(c['s']), name: String(c['name']),
    };
  }

  private async loadTarget(tx: Tx, worldId: number, at: { k: number; d: number; s: number }): Promise<TargetRow> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT id, player_id, k, d, s, name FROM cities
       WHERE world_id = ${worldId} AND k = ${at.k} AND d = ${at.d} AND s = ${at.s}
    `);
    const c = rows[0];
    if (!c) throw new MissionError('target_not_found', 'Bu koordinatta şehir yok.');
    return {
      id: Number(c['id']), playerId: Number(c['player_id']),
      k: Number(c['k']), d: Number(c['d']), s: Number(c['s']), name: String(c['name']),
    };
  }

  /**
   * ⭐ HEDEF KURALLARI — acemi koruması, tatil modu ve **oyuncu cezası** tek yerde.
   *
   * Üçü de aynı satırdan okunuyor çünkü aralarında öncelik var ve o önceliği iki ayrı
   * fonksiyona bölseydik sıralamayı çağıran tarafa bırakmış olurduk.
   *
   * ── CEZA ────────────────────────────────────────────────────────────────────────
   * Cezalı oyuncu oyuna giremez, yani şehirlerini savunamaz. Şehirlerine ne olacağı
   * cezanın kipine bağlı:
   *
   *   `open`   — şehirler **saldırıya açık**. Kalıcı cezada doğru olan bu: hesap geri
   *              gelmeyecek, şehirleri dünyanın kaynağı olur.
   *              ⚠️ Açık ceza **korumayı ve tatil modunu EZER**: yönetici "saldırıya açık"
   *              dedikten sonra saldırıların acemi korumasına çarpması, verilen kararın
   *              sessizce uygulanmaması olurdu.
   *
   *   `closed` — şehirler **korunur**; oyuncu döndüğünde imparatorluğunu bulur.
   *              Yalnız **casusluk** serbest (dünya kör kalmasın). Saldırı ve nakliye
   *              kapalı: nakliye açık olsaydı cezalının dokunulmaz şehri güvenli bir kasa
   *              olurdu. ⚠️ Destek bugün zaten yalnız KENDİ şehirlerine gidiyor
   *              (`requireOwnTarget`), yani orada kural no-op; guard tip-bağımsız yazıldı ki
   *              müttefik desteği geldiğinde ayrıca eklemek gerekmesin.
   */
  private async assertTargetAllowed(
    tx: Tx, defenderPlayerId: number, type: MissionKind, at: Date,
  ): Promise<void> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT protected_until, vacation_until, banned_at, ban_until, ban_mode
        FROM players WHERE id = ${defenderPlayerId}
    `);
    const p = rows[0];
    if (!p) throw new MissionError('target_not_found', 'Hedef oyuncu bulunamadı.');

    /**
     * ⚠️ Ceza GERÇEK zamanla kıyaslanır (`new Date()`), oyun saatiyle değil: ceza bir
     * moderasyon kararı, oyun mekaniği değil. Bakımda oyun saati donuyor ve cezalar da
     * donsaydı "3 gün ceza" bakım süresince uzardı.
     */
    const banUntil = p['ban_until'] == null ? null : toDate(p['ban_until']);
    const banActive = p['banned_at'] != null && (banUntil == null || banUntil > new Date());

    if (banActive) {
      /**
       * Süresiz ceza daima açıktır (şema CHECK'i de bunu zorluyor) → `banUntil == null`
       * dalı burada zaten `open` olarak dönüyor ve aşağıda `banUntil` dolu olmak zorunda.
       */
      const mode = banUntil == null ? 'open' : String(p['ban_mode'] ?? 'open');
      if (mode === 'open') return;                       // koruma/tatil EZİLİR
      if (type === 'spy') return;                        // kapalıda yalnız casusluk
      throw new MissionError(
        'target_banned',
        'Hedef oyuncu cezalı ve şehirleri korumada — yalnız casus gönderilebilir.',
        { until: banUntil?.toISOString() ?? null },
      );
    }

    /** Koruma ve tatil YALNIZ düşmanca görevlerde geçerli — nakliye bir saldırı değil. */
    if (type !== 'attack' && type !== 'spy') return;

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
   * ⭐⭐ 10 KAT KURALI (kullanıcı, 2026-08-06).
   *
   * *"Bir oyuncu … kendisinden 10 kat düşük veya 10 kat yüksek puanlı bir oyuncuya saldırı
   * gerçekleştiremez. Casusluk gönderebilir. Tam 10 kat olunca bu kural devreye girer."*
   *
   * ⚠️⚠️ **PUAN `players.score`TAN DEĞİL, SON SIRALAMADA DONMUŞ değerden okunuyor** — bu
   * kullanıcının açık şartı: *"iki tarafın da sıralamaya henüz yansımamış gerçek puanından
   * değil"*. Sebebi oynanabilirlik: anlık puan her harcamada oynuyor, oyuncu kime
   * saldırabileceğini ancak deneyerek öğrenirdi. Dondurulmuş puan 8 saat boyunca sabit ve
   * ekranda görünen değerle **aynı** — kural tahmin edilebilir oluyor.
   *
   * ⚠️ **0 puan 1 gibi işleniyor.** Oran hesabı sıfıra bölünemez ve kullanıcının örneği bunu
   * gerektiriyor: *"0 puanlı bir oyuncu da 10 puanlı bir oyuncuya saldıramasın, 9 puanlı
   * birine saldırabilsin"* → 10/1 = 10 (engel), 9/1 = 9 (serbest). Kelepçe 0'ı 1 yapınca
   * örnek birebir tutuyor.
   *
   * ⚠️ Sıralama satırı **olmayan** oyuncu 0 sayılır. Kullanıcının gerekçesi: yeni oyuncu zaten
   * acemi koruması altında ve koruma bitmeden bir sonraki anlık görüntüde 0 puanla listeye
   * giriyor. ⚠️ Yan etki: `ranking_excluded` bir oyuncunun da satırı silinir, yani panelden
   * sıralamadan muaf tutulan güçlü bir hesap da 0 görünür ve bu kural onu korur/kısıtlar.
   *
   * ⚠️ Karşılaştırma `>=`: kullanıcı *"tam 10 kat olunca bu kural devreye girer"* dedi.
   * 20 → 200 ENGELLİ, 20 → 199 serbest.
   */
  private async assertScoreRatio(tx: Tx, attackerId: number, defenderId: number): Promise<void> {
    const limit = liveNumber('combat', 'attackScoreRatio', 10);
    if (limit <= 0) return;                       // 0/negatif = kural kapalı

    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT subject_id, score FROM rankings
       WHERE kind = 'player' AND subject_id IN (${attackerId}, ${defenderId})
    `);
    const frozen = new Map<number, number>();
    for (const r of rows) frozen.set(Number(r['subject_id']), Number(r['score']));

    // ⚠️ `?? 0` sonra `max(…, 1)`: satırı olmayan da sıfır puanlı da aynı tabana oturuyor.
    const a = Math.max(1, frozen.get(attackerId) ?? 0);
    const d = Math.max(1, frozen.get(defenderId) ?? 0);
    const ratio = Math.max(a, d) / Math.min(a, d);
    if (ratio >= limit) {
      throw new MissionError(
        'score_gap',
        `Kendinden ${limit} kat güçlü veya ${limit} kat zayıf birine saldıramazsın.`,
        { attackerScore: frozen.get(attackerId) ?? 0, defenderScore: frozen.get(defenderId) ?? 0, limit },
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
           AND status = 'alive'
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

  /**
   * ⭐ §verify — DOĞRULANMAMIŞ hesabın yapamayacağı sefer tipleri.
   *
   * | yasak | serbest | neden |
   * | :-- | :-- | :-- |
   * | `attack` · `transport` · `found_city` | `spy` · `support` | kullanıcı kararı |
   *
   * ⚠️ **Destek serbest ama tehlikesiz**: `sendSupport` zaten `requireOwnTarget` ile yalnız
   * oyuncunun KENDİ şehirlerine izin veriyor (`mission.service.ts:305-323`), yani sahte hesap
   * ordusunu ana hesaba aktaramaz. Oyunda başka bir oyuncuya destek diye bir mekanik yok.
   *
   * ⚠️ **Teleport'a kapı gerekmiyor**: ön-şartı Kale 12 + Mimar Okulu 12, doğrulanmamış hesapta
   * yapı tavanı 3 → erişilemez. Boş bir kapı koymak, kapının neden var olduğunu unutturur.
   */
  private async assertVerified(tx: Tx, playerId: number, type: MissionKind): Promise<void> {
    const message = type === 'attack' ? UNVERIFIED_MESSAGE.attack
      : type === 'transport' ? UNVERIFIED_MESSAGE.transport
        : type === 'found_city' ? UNVERIFIED_MESSAGE.foundCity : null;
    if (message == null) return;                          // spy · support serbest
    if (!unverifiedLimits().enabled) return;              // anahtar kapalı → sorgu bile açma
    if (await isVerified(tx as never, playerId)) return;
    throw new MissionError('email_unverified', message);
  }

  /**
   * ⭐ TATİLDEKİ OYUNCU HİÇBİR SEFER GÖNDEREMEZ (2026-08-02).
   *
   * ⚠️ **Nakliye de kapalı.** `0030_player_ban.sql:11` cezalı için aynı deliği kapatırken
   * *"nakliye açık olsaydı dokunulmaz şehir güvenli bir kasa olurdu"* diyor; tatilde durum daha
   * kötü, çünkü donmuş oyuncu yatırılanı geri gönderemez — kaynak orada kilitlenip kalırdı.
   *
   * ⚠️ Casusluk da kapalı: tatil bir kaçış değil, oyundan çekilme. Dünyayı izlemeye devam
   * etmek isteyen tatile girmez.
   */
  private async assertNotOnVacation(tx: Tx, playerId: number): Promise<void> {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT 1 FROM players WHERE id = ${playerId} AND vacation_until IS NOT NULL
    `);
    if (rows.length > 0) {
      throw new MissionError(
        'on_vacation',
        'Tatil modundayken ordu gönderemezsin. Önce tatil modundan çık.',
      );
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

  /**
   * ⭐ KAHRAMANIN TEK BAŞINA DÖNÜŞ SÜRESİ — **kalkışta** hesaplanıp yüke yazılır.
   *
   * Ordunun tamamı ölürse kahraman yine de eve döner (§13.11.4d, 2026-08-01) ve o dönüşü
   * artık ordu değil **kendi hızı** belirler (`HERO_SPEED`; kahraman orduyu hızlandırmaz ama
   * yalnız kaldığında kendi hızıyla yürür — `units.ts:54-56`).
   *
   * ⚠️ **Neden dönüşte değil kalkışta?** Savaş çözülürken hesaplasaydık mesafeyi, Haritacılık'ı
   * ve dünya çarpanını yeniden sorgulamak gerekirdi; üçü de o arada değişmiş olabilir ve
   * oyuncuya kalkışta gösterilen süre ile gerçekleşen süre sessizce ayrışırdı. Yükte duran
   * sayı, `travelSeconds` ile aynı anda, aynı girdilerden üretiliyor.
   *
   * ⚠️ Yalnız kahraman taşıyan görevlerde yazılır — yoksa her göreve ölü bir alan eklerdi.
   * Yolda olan ESKİ görevlerde alan yok; handler'lar `?? travelSeconds`e düşüyor.
   */
  private heroTravel(
    heroIds: number[], leg: RouteLeg, cartography: number, speedMultiplier: number, map: MapConfig,
  ): Record<string, number> {
    if (heroIds.length === 0) return {};
    return {
      heroTravelSeconds: travelSeconds(
        { ...leg, speed: HERO_SPEED, cartography, speedMultiplier }, map,
      ),
    };
  }
}

/** Sefere çıkan her görevin ortak girdisi. */
export interface SendOpts {
  originCityId: number;
  playerId: number;
  worldId: number;
  target: { k: number; d: number; s: number };
  units: Record<string, number>;
  heroIds?: number[];
  /** OYUN saatinde "şimdi" (yola çıkış anı). */
  at: Date;
  idempotencyKey?: string;
}

/**
 * ⭐ HARİTA DIŞI KOORDİNAT KAPISI (2026-08-07).
 *
 * ⚠️ Sözleşme yalnız `min(1)`e bakıyordu ve `WORLD_SHAPE` sefer yolunda **hiç okunmuyordu**:
 * `1:9999:3` gibi bir hedefe gerçek bir şehir kurulabiliyordu. `route()` böyle bir mesafeyi
 * sessizce hesaplıyor (süre 24 saat tavanına yapışıyor) ve görev tamamlanıyordu.
 * `cities_world_coords` benzersizliği de bunu yakalamaz — o "aynı yere iki şehir"i engeller,
 * "olmayan yere şehir"i değil.
 *
 * ⚠️ **YALNIZ ŞEHİR KURMADA çağrılıyor.** Diğer görev tiplerinde hedefin bir `cities` satırı
 * olması zaten geçerliliğin kanıtı; buraya genel bir kapı koysaydık, geçmişte hatalı
 * yerleştirilmiş bir şehir bir anda **hedeflenemez** hâle gelirdi.
 */
function assertWithinWorld(c: { k: number; d: number; s: number }): void {
  const inRange = (v: number, max: number): boolean =>
    Number.isInteger(v) && v >= 1 && v <= max;
  const ok = inRange(c.k, WORLD_SHAPE.continents)
    && inRange(c.d, WORLD_SHAPE.districtsPerContinent)
    && inRange(c.s, WORLD_SHAPE.citiesPerDistrict);
  if (!ok) {
    throw new MissionError(
      'out_of_world',
      `Bu koordinat haritada yok. Geçerli aralık 1:1:1 – ${WORLD_SHAPE.continents}:`
      + `${WORLD_SHAPE.districtsPerContinent}:${WORLD_SHAPE.citiesPerDistrict}.`,
      { target: c },
    );
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
