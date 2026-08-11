/**
 * ⭐ MAĞARA (SİSTEM PLANI §13.20)
 *
 * Doküman: *"Mağara şehrin içinde yer alan ve gizli bir geçitle ulaşılabilen oldukça güvenli bir
 * yapıdır. Surlarınız yıkılıp kaleniz düşse bile mağaradaki askerlerinize hiçbir şey olmaz…
 * mağaradaki askerler savaşa katılmazlar. Ayrıca düşmanlarınızın casus kuşları mağaradaki
 * askerleri göremezler."*
 *
 * ### ⚠️ MODEL DEĞİŞTİ (kullanıcı kararı 2026-07-28, ikinci tur)
 * Önceki tasarımda askerler **emir anında** barakadan düşüyordu ve işlem iptal edilemiyordu.
 * Yeni tasarım tam tersi:
 *
 *  • **Emir yalnız bir zamanlayıcıdır.** Doldurma süresi boyunca askerler ŞEHİRDE kalır, gelen
 *    saldırılara **katılır**; süre dolduğunda mağaraya ANLIK geçerler. Boşaltmada da aynısı:
 *    süre boyunca mağarada dururlar, sonunda anlık şehre inerler.
 *  • **İptal serbest ve ANLIKTIR.** Geçen/kalan süreye göre hiçbir hesap yapılmaz, çünkü
 *    taşınan bir şey yok — iptal yalnız zamanlayıcıyı siler.
 *
 * Bu iki kural birlikte eski istismarı da kapatıyor: "saldırıyı gör, sakla, iptal et" artık
 * bir kazanç sağlamıyor, çünkü **saklanmak süre dolana kadar zaten başlamıyor.**
 *
 * ### Bundan doğan tek zor kural
 * Askerler süre boyunca şehirde olduğu için **savaşta ölebilirler.** O yüzden mağaraya giriş
 * anında adet **yeniden ölçülür**: `giren = min(emredilen, barakadaki)`. Bu clamp olmadan
 * ölmüş askerler mağarada yeniden doğardı — sessiz ve fark edilmesi çok zor bir hata.
 *
 * ### ⭐⭐ KAHRAMAN DA SAKLANIR (2026-08-11) — orijinalde de vardı
 * `docs/JAVA_ROENTGEN.md` §6.1: istemcinin kahraman durum tablosunda **üç mağara durumu**
 * duruyor (`k.a[234..236]` = Mağarada · Mağaradan Çıkıyor · Mağaraya Giriyor) ve mağara
 * ekranının "tümünü seç" işlevi (`i.java:844-852`) kahramanları **durum koduyla** eliyor:
 * doldururken yalnız `u == 2` (**Şehirde**), boşaltırken yalnız `u == 3` (**Mağarada**).
 * Yani orijinalde de ölü/diriltilen/seferdeki kahraman mağaraya konamıyordu.
 *
 * ⭐ **Yeni tablo YOK.** Kahramanın mağarada olması `heroes.status = 'in_cave'` ile tutuluyor.
 * Kazancı büyük: `status = 'alive'` filtresi kodun BEŞ ayrı yerinde zaten duruyor
 * (savunma ordusu, casus `heroCount`, sefere çıkarma, teleport, diriltme) — hepsi mağaradaki
 * kahramanı **kendiliğinden** dışarıda bırakıyor. Ayrı bir `in_cave` bayrağı seçilseydi bu beş
 * yerin her biri elle güncellenmeliydi ve biri unutulsa sessiz sızıntı olurdu.
 *
 * ⚠️ Kahramanın alanı **5** (ölçülmüş, `HERO_AREA`) — Cüce'den bile küçük.
 */
import { sql } from 'drizzle-orm';
import { UNITS_BY_ID, caveArea, caveCapacity, caveTransferSeconds } from '@mobilwar/catalog';
import { DEFAULT_CATALOG_CONFIG, type CatalogConfig } from '@mobilwar/catalog';
import { toDate, type Db } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';

type Runner = Db | Tx;

export type CaveErrorCode =
  | 'city_not_found'
  | 'not_owner'
  | 'no_cave'
  | 'cave_repairing'
  | 'cave_busy'
  | 'no_job'
  | 'invalid_units'
  | 'not_enough_units'
  | 'capacity_exceeded'
  /** Seçilen kahraman bu işlemi yapamaz (ölü · seferde · zaten mağarada · başkasının). */
  | 'hero_unavailable'
  /** §tatil modu — tatildeyken mağara doldurulup boşaltılamaz. */
  | 'on_vacation';

export class CaveError extends Error {
  constructor(readonly code: CaveErrorCode, message: string, readonly details?: unknown) {
    super(message);
  }
}

/** Mağarada saklanan bir kahraman (ekranda ad + seviye yeter). */
export interface CaveHero {
  id: number;
  name: string;
  level: number;
}

/** Mağaranın oyuncuya gösterilen tam durumu. */
export interface CaveState {
  level: number;
  capacity: number;
  usedArea: number;
  freeArea: number;
  units: Record<string, number>;
  /** ⭐ Mağarada saklanan kahramanlar (`heroes.status = 'in_cave'`). */
  heroes: CaveHero[];
  /** Onarım bitişi (oyun saati) — NULL ise mağara sağlam. */
  repairUntil: Date | null;
  repairing: boolean;
  /** Süren doldurma/boşaltma emri. ⭐ İPTAL EDİLEBİLİR. */
  job: {
    missionId: number;
    direction: 'store' | 'withdraw';
    units: Record<string, number>;
    /** ⭐ Emirdeki kahramanlar — REZERVEDİR, başka göreve gönderilemezler. */
    heroIds: number[];
    area: number;
    startedAt: Date;
    finishAt: Date;
  } | null;
}

export const CAVE_JOB_TYPES = ['cave_store', 'cave_withdraw'] as const;

export class CaveService {
  constructor(
    private readonly db: Db,
    /**
     * ⭐ Dünya bazlı katalog sabitleri (§admin Faz 5). Verilmezse formüller kendi
     * varsayılanlarını kullanır ve davranış **DEĞİŞMEZ** — testler bu yüzden onu geçmeden
     * çalışmaya devam ediyor. Nesne değil FONKSİYON: panelden kaydedilen bir sabit bir
     * sonraki istekte güncel olsun, süreç ömrü boyunca donmasın.
     */
    private readonly catalogFor?: (worldId: number) => CatalogConfig,
  ) {}

  /** Bu dünyanın etkin katalog sabitleri (yoksa varsayılan). */
  private cat(worldId: number): CatalogConfig {
    return this.catalogFor?.(worldId) ?? DEFAULT_CATALOG_CONFIG;
  }


  /* ── Okuma ────────────────────────────────────────────────────────────────── */

  async state(cityId: number, gameNow: Date, runner: Runner = this.db): Promise<CaveState> {
    const cityRows = await runner.execute<Record<string, unknown>>(sql`
      SELECT c.cave_repair_until,
             COALESCE((SELECT level FROM buildings b WHERE b.city_id = c.id AND b.type = 'cave'), 0) AS level
        FROM cities c WHERE c.id = ${cityId}
    `);
    const row = cityRows[0];
    if (!row) throw new CaveError('city_not_found', 'Şehir bulunamadı.');

    const level = Number(row['level'] ?? 0);
    const repairUntilRaw = row['cave_repair_until'];
    const repairUntil = repairUntilRaw == null ? null : toDate(repairUntilRaw);
    const repairing = repairUntil != null && repairUntil > gameNow;

    const units = await readCounts(runner, 'cave_units', cityId);
    const heroes = await readCaveHeroes(runner, cityId);
    const capacity = caveCapacity(level);
    /** ⚠️ Kahramanlar da yer kaplıyor — `unitsArea` değil `caveArea`. */
    const usedArea = caveArea(units, heroes.length);

    const jobRows = await runner.execute<Record<string, unknown>>(sql`
      SELECT m.id, m.type, m.created_at, m.execute_at, m.payload,
             COALESCE(json_object_agg(mu.unit_type, mu.count)
                      FILTER (WHERE mu.unit_type IS NOT NULL), '{}'::json) AS units
        FROM missions m
        LEFT JOIN mission_units mu ON mu.mission_id = m.id
       WHERE m.target_city_id = ${cityId}
         AND m.type IN ('cave_store', 'cave_withdraw')
         AND m.status IN ('scheduled', 'running')
       GROUP BY m.id
       ORDER BY m.execute_at LIMIT 1
    `);
    const j = jobRows[0];
    const jobUnits = (j?.['units'] ?? {}) as Record<string, number>;
    const jobHeroes = payloadHeroIds(j?.['payload']);

    return {
      level,
      capacity,
      usedArea,
      freeArea: Math.max(0, capacity - usedArea),
      units,
      heroes,
      repairUntil: repairing ? repairUntil : null,
      repairing,
      job: j
        ? {
          missionId: Number(j['id']),
          direction: String(j['type']) === 'cave_store' ? 'store' : 'withdraw',
          units: jobUnits,
          heroIds: jobHeroes,
          area: caveArea(jobUnits, jobHeroes.length),
          startedAt: toDate(j['created_at']),
          finishAt: toDate(j['execute_at']),
        }
        : null,
    };
  }

  /* ── Doldurma ─────────────────────────────────────────────────────────────── */

  /**
   * Savaşçıları mağaraya girmek üzere **işaretler**.
   *
   * ⚠️ Birlikler **şehirden ÇIKMAZ**: süre boyunca barakada dururlar, savaşa katılırlar,
   * hatta sefere de gönderilebilirler. Emir yalnız "süre dolunca şu adetler mağaraya girsin"
   * der; asıl taşıma `cave_store` handler'ındadır ve orada adet yeniden ölçülür.
   */
  async store(opts: {
    cityId: number; playerId: number; units: Record<string, number>;
    heroIds?: number[]; at: Date;
  }): Promise<{ missionId: number; seconds: number; area: number }> {
    return this.db.transaction(async (tx) => {
      const st = await this.assertUsable(tx as never, opts.cityId, opts.playerId, opts.at);
      const wanted = sanitize(opts.units);
      const heroIds = sanitizeHeroIds(opts.heroIds);
      if (Object.keys(wanted).length === 0 && heroIds.length === 0) {
        throw new CaveError('invalid_units', 'Mağaraya gönderilecek savaşçı ya da kahraman seçilmedi.');
      }

      const area = caveArea(wanted, heroIds.length);
      if (st.usedArea + area > st.capacity) {
        throw new CaveError(
          'capacity_exceeded',
          `Mağara kapasitesi yetmiyor: ${st.usedArea + area}/${st.capacity} alan.`,
          { need: area, used: st.usedArea, capacity: st.capacity },
        );
      }

      /**
       * Emir anında **yalnız DOĞRULAMA** yapılır, düşüm değil: olmayan askeri işaretlemenin
       * anlamı yok. Süre içinde ölürlerse varışta zaten clamp'lenecek.
       */
      const have = await readCounts(tx as never, 'units', opts.cityId);
      for (const [type, n] of Object.entries(wanted)) {
        if ((have[type] ?? 0) < n) {
          throw new CaveError(
            'not_enough_units',
            `${nameOf(type)} için yeterli asker yok (${n} istendi, ${have[type] ?? 0} var).`,
            { type, count: n, have: have[type] ?? 0 },
          );
        }
      }

      /**
       * ⭐ Kahraman kapısı — Java'nın kuralının birebiri (`i.java:846`, `u == 2` "Şehirde").
       * `status = 'alive' AND city_id = <şehir>` ikisi birlikte tam olarak «şehirde» demek:
       * seferdeki kahramanın `city_id`si NULL, ölünün/diriltilenin `status`ü farklı.
       * ⚠️ Yalnız `status='alive'` demek YETMEZ — seferdeki kahraman da `alive`.
       */
      await assertHeroesAre(tx as never, {
        heroIds, cityId: opts.cityId, playerId: opts.playerId, want: 'alive',
      });

      const seconds = caveTransferSeconds(area, st.level);
      const missionId = await this.schedule(tx as never, {
        cityId: opts.cityId, playerId: opts.playerId, type: 'cave_store',
        units: wanted, heroIds, at: opts.at, seconds, area,
      });
      return { missionId, seconds, area };
    });
  }

  /* ── Boşaltma ─────────────────────────────────────────────────────────────── */

  /**
   * Mağaradaki savaşçıları çıkmak üzere **işaretler**.
   *
   * ⚠️ Birlikler mağaradan ÇIKMAZ: süre boyunca içeride kalırlar (yani hâlâ korunuyorlar,
   * hâlâ savaşa katılmıyorlar). Süre dolunca anlık olarak barakaya inerler.
   */
  async withdraw(opts: {
    cityId: number; playerId: number; units: Record<string, number>;
    heroIds?: number[]; at: Date;
  }): Promise<{ missionId: number; seconds: number; area: number }> {
    return this.db.transaction(async (tx) => {
      const st = await this.assertUsable(tx as never, opts.cityId, opts.playerId, opts.at);
      const wanted = sanitize(opts.units);
      const heroIds = sanitizeHeroIds(opts.heroIds);
      if (Object.keys(wanted).length === 0 && heroIds.length === 0) {
        throw new CaveError('invalid_units', 'Mağaradan çıkarılacak savaşçı ya da kahraman seçilmedi.');
      }

      for (const [type, n] of Object.entries(wanted)) {
        if ((st.units[type] ?? 0) < n) {
          throw new CaveError(
            'not_enough_units',
            `Mağarada yeterli ${nameOf(type)} yok (${n} istendi, ${st.units[type] ?? 0} var).`,
            { type, count: n, have: st.units[type] ?? 0 },
          );
        }
      }

      /** ⭐ Java'nın boşaltma kuralı (`i.java:850`, `u == 3` "Mağarada"). */
      await assertHeroesAre(tx as never, {
        heroIds, cityId: opts.cityId, playerId: opts.playerId, want: 'in_cave',
      });

      const area = caveArea(wanted, heroIds.length);
      const seconds = caveTransferSeconds(area, st.level);
      const missionId = await this.schedule(tx as never, {
        cityId: opts.cityId, playerId: opts.playerId, type: 'cave_withdraw',
        units: wanted, heroIds, at: opts.at, seconds, area,
      });
      return { missionId, seconds, area };
    });
  }

  /* ── İptal ────────────────────────────────────────────────────────────────── */

  /**
   * ⭐ Süren emri iptal eder — **anlık ve yan etkisiz**.
   *
   * Geçen ya da kalan süreye göre hiçbir hesap YAPILMAZ (kullanıcı kararı): ortada taşınan
   * bir şey yok, yalnız bir zamanlayıcı var. Doldurma iptal edilirse askerler zaten şehirde
   * kalmaya devam eder; boşaltma iptal edilirse zaten mağarada duruyorlardır.
   */
  async cancel(opts: { cityId: number; playerId: number }): Promise<{ direction: 'store' | 'withdraw' }> {
    return this.db.transaction(async (tx) => {
      const owner = await tx.execute<Record<string, unknown>>(sql`
        SELECT player_id FROM cities WHERE id = ${opts.cityId} FOR UPDATE
      `);
      if (owner.length === 0) throw new CaveError('city_not_found', 'Şehir bulunamadı.');
      if (Number(owner[0]!['player_id']) !== opts.playerId) {
        throw new CaveError('not_owner', 'Bu şehir sizin değil.');
      }

      const rows = await tx.execute<Record<string, unknown>>(sql`
        UPDATE missions SET status = 'canceled', finished_at = now()
         WHERE target_city_id = ${opts.cityId}
           AND type IN ('cave_store', 'cave_withdraw')
           AND status = 'scheduled'
        RETURNING type
      `);
      if (rows.length === 0) {
        // `running` ise worker o an uyguluyordur; iptal artık geç kalmıştır.
        throw new CaveError('no_job', 'İptal edilecek bir mağara işlemi yok.');
      }
      return { direction: String(rows[0]!['type']) === 'cave_store' ? 'store' : 'withdraw' };
    });
  }

  /* ── Ortak ────────────────────────────────────────────────────────────────── */

  private async assertUsable(
    tx: Db, cityId: number, playerId: number, at: Date,
  ): Promise<CaveState> {
    const owner = await tx.execute<Record<string, unknown>>(sql`
      SELECT c.player_id, (p.vacation_until IS NOT NULL) AS on_vacation
        FROM cities c JOIN players p ON p.id = c.player_id
       WHERE c.id = ${cityId} FOR UPDATE OF c
    `);
    if (owner.length === 0) throw new CaveError('city_not_found', 'Şehir bulunamadı.');
    if (Number(owner[0]!['player_id']) !== playerId) {
      throw new CaveError('not_owner', 'Bu şehir sizin değil.');
    }
    /**
     * ⭐ §tatil modu. Mağara emri bir görev (`cave_store`/`cave_withdraw`) yazıyor; tatilde
     * görev yazılmamalı, yoksa donmuş oyuncunun sayacı işlemeye devam eder.
     * ⚠️ `FOR UPDATE OF c`: kilit yalnız şehir satırında kalmalı. `players`ı da kilitlemek
     * mağara emriyle tatile giriş arasında gereksiz bir çekişme yaratırdı.
     */
    if (owner[0]!['on_vacation'] === true) {
      throw new CaveError('on_vacation', 'Tatil modundayken mağara kullanılamaz.');
    }

    const st = await this.state(cityId, at, tx as never);
    if (st.level <= 0) throw new CaveError('no_cave', 'Bu şehirde mağara yok.');
    if (st.repairing) {
      throw new CaveError('cave_repairing', 'Mağara onarılıyor; şu anda kullanılamaz.', {
        repairUntil: st.repairUntil?.toISOString(),
      });
    }
    if (st.job) {
      throw new CaveError('cave_busy', 'Mağarada zaten bir işlem sürüyor.', {
        finishAt: st.job.finishAt.toISOString(),
      });
    }
    return st;
  }

  /**
   * Emri yazar.
   *
   * ⚠️ `origin_city_id` = `target_city_id` = **aynı şehir**, ama bu görev **Ordular ekranında
   * GÖRÜNMEZ** (§13.20.5, kullanıcı kararı): ortada hareket eden bir ordu yok, yalnız şehrin
   * içinde işleyen bir sayaç var. Ordular ekranında yalnız *yıkılan mağaradan kaçış*
   * (`cave_return`) görünür.
   *
   * ⚠️ **Tekillik anahtarı BİLEREK NULL.** Bir ara "tip:şehir:an" yazıyordu ve gerçek bir hata
   * üretiyordu: emir artık **iptal edilebilir** olduğu için oyuncu aynı saniye içinde aynı emri
   * yeniden verdiğinde iptal edilmiş satırın anahtarına çarpıyordu. Çift-tıklama koruması zaten
   * daha güçlü bir yerden geliyor: `assertUsable` şehir satırını `FOR UPDATE` kilitliyor, ikinci
   * istek `cave_busy` ile dönüyor. (Postgres'te NULL'lar tekil indekste çakışmaz.)
   */
  private async schedule(tx: Db, o: {
    cityId: number; playerId: number; type: 'cave_store' | 'cave_withdraw';
    units: Record<string, number>; heroIds: number[]; at: Date; seconds: number; area: number;
  }): Promise<number> {
    const executeAt = new Date(o.at.getTime() + Math.max(1, o.seconds) * 1000);
    /**
     * ⚠️ Kahramanlar `mission_heroes`'a **YAZILMAZ**, `payload.heroIds`e yazılır. Sebep:
     * `mission_heroes` bu kod tabanında "kahraman şehirden ÇIKTI" demek — `hero.controller.ts`
     * ekranı ondan `on_mission` üretiyor, `battle.handlers` ordu yüklerken oradan okuyor.
     * Oysa mağara emri sırasında kahraman hâlâ şehirdedir ve savunmaya katılır. `mission_heroes`
     * kullanmak kahramanı ekranda "Görevde" gösterip savaş kodunu da yanıltırdı.
     */
    const rows = await tx.execute<Record<string, unknown>>(sql`
      INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                            execute_at, payload, idempotency_key)
      SELECT c.world_id, ${o.type}, 'scheduled', ${o.playerId}, c.id, c.id,
             ${executeAt.toISOString()}::timestamptz,
             ${JSON.stringify({ area: o.area, seconds: o.seconds, heroIds: o.heroIds })}::jsonb,
             NULL
        FROM cities c WHERE c.id = ${o.cityId}
      RETURNING id
    `);
    const missionId = Number(rows[0]!['id']);
    for (const [type, count] of Object.entries(o.units)) {
      await tx.execute(sql`
        INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${missionId}, ${type}, ${count})
      `);
    }
    return missionId;
  }
}

/* ── Yardımcılar ───────────────────────────────────────────────────────────── */

/**
 * Yalnız savaşçılar; savunma birimi ve bilinmeyen id sessizce elenir.
 * ⭐ **Casus Kuş dahildir** (kullanıcı, 2026-07-28): katalogda `kind: 'warrior'` ve alanı 1 —
 * saklanması hem mümkün hem mantıklı, casusluk kapasitesi de korunmaya değer bir varlık.
 */
function sanitize(units: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, raw] of Object.entries(units ?? {})) {
    const n = Math.trunc(Number(raw) || 0);
    if (n <= 0) continue;
    if (UNITS_BY_ID[id]?.kind !== 'warrior') continue;
    out[id] = n;
  }
  return out;
}

/** Tekrarsız, pozitif tam sayı kahraman kimlikleri. */
function sanitizeHeroIds(ids: readonly number[] | undefined): number[] {
  const out = new Set<number>();
  for (const raw of ids ?? []) {
    const n = Math.trunc(Number(raw) || 0);
    if (n > 0) out.add(n);
  }
  return [...out];
}

/** Görevin `payload.heroIds` alanı — eski (kahramansız) satırlarda yok, boş dizi döner. */
export function payloadHeroIds(payload: unknown): number[] {
  const raw = (payload as { heroIds?: unknown } | null | undefined)?.heroIds;
  return Array.isArray(raw) ? sanitizeHeroIds(raw as number[]) : [];
}

/**
 * `id = ANY(...)` için kimlik dizisi.
 *
 * ⚠️ **`sql.raw` bilerek** — postgres.js sürücüsü bağlanan JS sayı dizisini `bigint[]`e
 * çeviremiyor ve *"The 'string' argument must be of type string…"* ile patlıyor. Kod tabanının
 * geri kalanı da bu kalıbı kullanıyor (`admin.world.controller.ts:780`).
 * ⚠️ Enjeksiyon riski YOK: buraya yalnız {@link sanitizeHeroIds}'den geçmiş **pozitif tam
 * sayılar** giriyor. Kalıbı kopyalarken bu şart da kopyalanmalı.
 */
export function heroIdArray(ids: readonly number[]): ReturnType<typeof sql.raw> {
  return sql.raw(`ARRAY[${sanitizeHeroIds([...ids]).join(',')}]::bigint[]`);
}

function nameOf(id: string): string {
  return UNITS_BY_ID[id]?.name.tr ?? id;
}

/** Mağarada saklanan kahramanlar — ayrı tablo yok, durum kolonu taşıyor. */
export async function readCaveHeroes(runner: Runner, cityId: number): Promise<CaveHero[]> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT id, name, level FROM heroes
     WHERE city_id = ${cityId} AND status = 'in_cave'
     ORDER BY level DESC, id
  `);
  return rows.map((r: Record<string, unknown>) => ({
    id: Number(r['id']), name: String(r['name']), level: Number(r['level']),
  }));
}

/**
 * ⭐ Seçilen kahramanların HEPSİ istenen durumda ve bu şehirde mi?
 *
 * `want='alive'` → doldurmanın kapısı: kahraman **şehirde** olmalı (Java `u == 2`).
 * `want='in_cave'` → boşaltmanın kapısı: kahraman **mağarada** olmalı (Java `u == 3`).
 *
 * ⚠️ Sayı karşılaştırması bilerek: hangi kimliğin elendiğini tek tek aramak yerine "kaç tanesi
 * geçerli" sorulur; biri bile düşerse tüm emir reddedilir. Yarım kabul edilen bir emir
 * oyuncunun ekranda gördüğüyle çelişirdi.
 */
async function assertHeroesAre(runner: Runner, o: {
  heroIds: number[]; cityId: number; playerId: number; want: 'alive' | 'in_cave';
}): Promise<void> {
  if (o.heroIds.length === 0) return;
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT id FROM heroes
     WHERE id = ANY(${heroIdArray(o.heroIds)})
       AND player_id = ${o.playerId}
       AND city_id = ${o.cityId}
       AND status = ${o.want}
     FOR UPDATE
  `);
  if (rows.length !== o.heroIds.length) {
    throw new CaveError(
      'hero_unavailable',
      o.want === 'alive'
        ? 'Seçilen kahraman mağaraya giremez — yalnız bu şehirde bulunan, canlı kahramanlar saklanabilir.'
        : 'Seçilen kahraman mağarada değil.',
      { heroIds: o.heroIds, want: o.want },
    );
  }
}

/**
 * ⭐⭐ REZERVASYON (kullanıcı kararı 2026-08-11) — mağara emrindeki asker/kahraman **başka
 * göreve gidemez**.
 *
 * ⚠️ **KURAL DEĞİŞTİ.** 2026-07-28 modeli "emir yalnız bir zamanlayıcıdır, askerler süre boyunca
 * şehirde durur ve **sefere de gönderilebilir**" diyordu. Kullanıcının örneği bu boşluğu
 * gösterdi: şehirde 50 Cüce varken 30'u mağaraya işaretliyse, 40 Cüceyle sefere çıkmak
 * **kabul edilmemeli** — mağara emrinin dışında yalnız 20 Cüce serbesttir. 10 Cüce ile çıkmak
 * hâlâ serbest.
 *
 * ⭐ Değişmeyen kısım: askerler **hâlâ şehirdedir**, gelen saldırıya **katılır** ve ölebilirler.
 * Rezervasyon bir kilit değil, yalnız "aynı askeri iki işe birden söz verme" kuralıdır. Savaşta
 * ölürlerse emir küçülür (`reconcileCaveStore`), İPTAL OLMAZ.
 *
 * @returns tür → mağaraya söz verilmiş adet (emir yoksa boş nesne)
 */
export async function caveReservedUnits(
  runner: Runner, cityId: number,
): Promise<Record<string, number>> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT mu.unit_type, mu.count
      FROM missions m JOIN mission_units mu ON mu.mission_id = m.id
     WHERE m.target_city_id = ${cityId}
       AND m.type = 'cave_store'
       AND m.status IN ('scheduled', 'running')
  `);
  const out: Record<string, number> = {};
  for (const r of rows) {
    const type = String(r['unit_type']);
    out[type] = (out[type] ?? 0) + Number(r['count']);
  }
  return out;
}

/** Mağaraya girmek üzere rezerve edilmiş kahramanlar (bkz. {@link caveReservedUnits}). */
export async function caveReservedHeroes(
  runner: Runner, cityId: number,
): Promise<Set<number>> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT payload FROM missions
     WHERE target_city_id = ${cityId}
       AND type = 'cave_store'
       AND status IN ('scheduled', 'running')
  `);
  const out = new Set<number>();
  for (const r of rows) for (const id of payloadHeroIds(r['payload'])) out.add(id);
  return out;
}

/** `units` ya da `cave_units` tablosundan adetleri okur. */
export async function readCounts(
  runner: Runner, table: 'units' | 'cave_units', cityId: number,
): Promise<Record<string, number>> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM ${sql.raw(table)} WHERE city_id = ${cityId} AND count > 0
  `);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['type'])] = Number(r['count']);
  return out;
}

/** Mağaraya birim ekler. */
export async function addCaveUnits(
  runner: Runner, cityId: number, units: Record<string, number>,
): Promise<void> {
  for (const [type, count] of Object.entries(units)) {
    if (!(count > 0)) continue;
    await runner.execute(sql`
      INSERT INTO cave_units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
      ON CONFLICT (city_id, type) DO UPDATE SET count = cave_units.count + ${count}
    `);
  }
}

/** Şehrin barakasına birim ekler. */
export async function addCityUnits(
  runner: Runner, cityId: number, units: Record<string, number>,
): Promise<void> {
  for (const [type, count] of Object.entries(units)) {
    if (!(count > 0)) continue;
    await runner.execute(sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
      ON CONFLICT (city_id, type) DO UPDATE SET count = units.count + ${count}
    `);
  }
}

/**
 * ⭐ Adetleri tablodan düşer ama **VAR OLANDAN FAZLASINI ALMAZ** ve gerçekten aldığını döndürür.
 *
 * Mağara modelinin kilit taşı bu: emir verildiğinde asker taşınmıyor, süre boyunca savaşta
 * ölebiliyor. Varışta `min(emredilen, mevcut)` alınmazsa **ölmüş asker mağarada yeniden doğardı**
 * — sessiz ve fark edilmesi çok zor bir hata. Satır kilidi (`FOR UPDATE`) aynı askeri iki işin
 * birden taşımasını da engelliyor.
 */
export async function takeUnits(
  runner: Runner, table: 'units' | 'cave_units', cityId: number, units: Record<string, number>,
): Promise<Record<string, number>> {
  const taken: Record<string, number> = {};
  for (const [type, want] of Object.entries(units)) {
    if (!(want > 0)) continue;
    const cur = await runner.execute<Record<string, unknown>>(sql`
      SELECT count FROM ${sql.raw(table)}
       WHERE city_id = ${cityId} AND type = ${type} FOR UPDATE
    `);
    const have = cur.length === 0 ? 0 : Number(cur[0]!['count']);
    const moved = Math.min(have, want);
    if (moved <= 0) continue;
    await runner.execute(sql`
      UPDATE ${sql.raw(table)} SET count = count - ${moved}
       WHERE city_id = ${cityId} AND type = ${type}
    `);
    taken[type] = moved;
  }
  return taken;
}

/**
 * ⭐ Kahramanları mağaraya sokar — ve **var olandan fazlasını almaz**, tıpkı `takeUnits` gibi.
 *
 * Emir verildiğinde kahraman şehirde kalıyor ve savaşa katılıyor; varış anında ölmüş ya da
 * (savunma amaçlı bir istisnayla) şehirden çıkmış olabilir. `WHERE status='alive' AND city_id`
 * şartı olmadan **ölü kahraman mağarada dirilirdi**.
 *
 * @returns gerçekten mağaraya giren kahraman kimlikleri
 */
export async function moveHeroesToCave(
  runner: Runner, cityId: number, heroIds: readonly number[],
): Promise<number[]> {
  if (heroIds.length === 0) return [];
  const rows = await runner.execute<Record<string, unknown>>(sql`
    UPDATE heroes SET status = 'in_cave'
     WHERE id = ANY(${heroIdArray(heroIds)})
       AND city_id = ${cityId}
       AND status = 'alive'
    RETURNING id
  `);
  return rows.map((r: Record<string, unknown>) => Number(r['id']));
}

/**
 * Kahramanları mağaradan şehre indirir. Hem normal boşaltmada hem **yıkılan mağaradan kaçış**
 * vardığında kullanılır — ikisinin de sonucu aynı: kahraman yeniden `alive` ve şehirde.
 */
export async function moveHeroesToCity(
  runner: Runner, cityId: number, heroIds: readonly number[],
): Promise<number[]> {
  if (heroIds.length === 0) return [];
  const rows = await runner.execute<Record<string, unknown>>(sql`
    UPDATE heroes SET status = 'alive'
     WHERE id = ANY(${heroIdArray(heroIds)})
       AND city_id = ${cityId}
       AND status = 'in_cave'
    RETURNING id
  `);
  return rows.map((r: Record<string, unknown>) => Number(r['id']));
}

/** Mağarayı tamamen boşaltır ve içindekileri döndürür (yıkılma anında kullanılır). */
export async function drainCave(
  runner: Runner, cityId: number,
): Promise<Record<string, number>> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    DELETE FROM cave_units WHERE city_id = ${cityId} AND count > 0
    RETURNING type, count
  `);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['type'])] = Number(r['count']);
  return out;
}
