/**
 * ⭐ SAVAŞ DIŞI GÖREV ÇÖZÜMLERİ — nakliye · destek · casusluk · şehir kurma.
 *
 * Sözleşme saldırıyla aynı (§1): **`ctx.at` "şimdi"dir** (`now()` DEĞİL) ve her görev **tek
 * transaction**tadır — teslimat, rapor ve dönüş görevi ya hep birlikte yazılır ya hiç yazılmaz.
 *
 * Kaynak: oyunun kendi dokümanı (`teknik_ve_yapi_dokumantasyonu.md` → NAKLİYE · DESTEK ·
 * CASUSLUK · ŞEHİR KURMA başlıkları).
 */
import { sql } from 'drizzle-orm';
import {
  BUILDINGS_BY_ID, clampName, maxCities, spyEffectiveDiff, spyInterception, spyLevelFor,
  UNITS_BY_ID, type SpyLevel,
} from '@mobiwar/catalog';
import type { CityService } from '../cities/city.service.ts';
import type { HandlerContext, MissionHandler, Tx } from './handler-registry.ts';

/* ═══ NAKLİYE ══════════════════════════════════════════════════════════════ */

/**
 * Kaynağı hedefe teslim eder, ordu **boş döner** (kullanıcı kuralı).
 *
 * ⚠️ Kaynak yola çıkarken kaynak şehirden düşmüştü; hedef şehir bu arada yok olduysa mal
 * **yok olmaz**, dönüş yüküne konur ve orduyla birlikte eve geri gelir.
 */
export function createTransportHandler(cities: CityService): MissionHandler {
  return async (ctx) => {
    const targetCityId = ctx.mission.targetCityId;
    const originCityId = ctx.mission.originCityId;
    if (originCityId == null) throw new Error('transport: kaynak şehir yok');

    const cargo = readResources(ctx.mission.payload['cargo']);
    const units = await loadMissionUnits(ctx.tx, ctx.mission.id);

    const target = targetCityId == null ? null : await loadCityOwner(ctx.tx, targetCityId);
    if (!target) {
      // Hedef şehir yok olmuş → mal geri döner (yolda kaybolmaz).
      await scheduleReturn(ctx, { homeCityId: originCityId, units, cargo, returnOf: 'transport' });
      return;
    }

    await ctx.lockCity(targetCityId!);
    if (cargo.gold > 0 || cargo.food > 0) {
      await cities.add(targetCityId!, cargo, ctx.at, ctx.tx as never);
    }

    await writeMessage(ctx, {
      playerId: target.playerId,
      kind: 'transport_report',
      side: 'receiver',
      subject: 'Nakliye ulaştı',
      body: { cityId: targetCityId, cargo, from: ctx.mission.originCityId, at: ctx.at.toISOString() },
    });
    /* ⭐ GÖNDEREN DE RAPOR ALIR (kullanıcı, 2026-07-30 — "Giden Nakliye Raporu"): eskiden
     * gönderen malın teslim edildiğini ancak ordusu dönünce dolaylı anlıyordu. Kendi kendine
     * nakliyede (iki şehir de aynı oyuncunun) çift rapor yazılmaz — tek satır yeter. */
    const senderPlayerId = ctx.mission.ownerPlayerId;
    if (senderPlayerId != null && senderPlayerId !== target.playerId) {
      await writeMessage(ctx, {
        playerId: senderPlayerId,
        kind: 'transport_report',
        side: 'sender',
        subject: `Nakliyen ulaştı · ${target.name}`,
        body: {
          targetCityId, targetCityName: target.name, targetPlayer: target.username,
          cargo, at: ctx.at.toISOString(),
        },
      });
    }
    await ctx.emit('city:changed', { cityId: targetCityId, playerId: target.playerId, reason: 'transport' });

    // Ordu boş döner; birlikler varışta kaynak şehre eklenir.
    await scheduleReturn(ctx, {
      homeCityId: originCityId, units, cargo: { gold: 0, food: 0 }, returnOf: 'transport',
    });

    await ctx.audit({
      action: 'mission.transport.delivered', entity: 'city', entityId: targetCityId!,
      after: { cargo, units },
    });
  };
}

/* ═══ DESTEK ═══════════════════════════════════════════════════════════════ */

/**
 * **TEK YÖNLÜ** (doküman): *"askerleriniz artık gönderdiğiniz şehrin barakasına, kahramanlar ise
 * o şehrin tapınağına yerleşir."* → dönüş görevi YOK. Kaynak da varsa hedefin kasasına eklenir.
 */
export function createSupportHandler(cities: CityService): MissionHandler {
  return async (ctx) => {
    const targetCityId = ctx.mission.targetCityId;
    const originCityId = ctx.mission.originCityId;
    if (originCityId == null) throw new Error('support: kaynak şehir yok');

    const cargo = readResources(ctx.mission.payload['cargo']);
    const units = await loadMissionUnits(ctx.tx, ctx.mission.id);

    const target = targetCityId == null ? null : await loadCityOwner(ctx.tx, targetCityId);
    if (!target) {
      // Hedef şehir yok olmuş → destek tek yönlü olsa da ordu ortada kalamaz, eve döner.
      await scheduleReturn(ctx, { homeCityId: originCityId, units, cargo, returnOf: 'support' });
      return;
    }

    await ctx.lockCity(targetCityId!);
    for (const [type, count] of Object.entries(units)) {
      if (count <= 0) continue;
      await ctx.tx.execute(sql`
        INSERT INTO units (city_id, type, count) VALUES (${targetCityId}, ${type}, ${count})
        ON CONFLICT (city_id, type) DO UPDATE SET count = units.count + ${count}
      `);
    }
    // Kahramanlar hedef şehrin tapınağına yerleşir.
    await ctx.tx.execute(sql`
      UPDATE heroes SET city_id = ${targetCityId}
       WHERE id IN (SELECT hero_id FROM mission_heroes WHERE mission_id = ${ctx.mission.id})
    `);
    await ctx.tx.execute(sql`DELETE FROM mission_heroes WHERE mission_id = ${ctx.mission.id}`);

    if (cargo.gold > 0 || cargo.food > 0) {
      await cities.add(targetCityId!, cargo, ctx.at, ctx.tx as never);
    }

    await writeMessage(ctx, {
      playerId: target.playerId,
      kind: 'support_report',
      side: 'receiver',
      subject: 'Destek ulaştı',
      body: { cityId: targetCityId, units, cargo, at: ctx.at.toISOString() },
    });
    await ctx.emit('city:changed', { cityId: targetCityId, playerId: target.playerId, reason: 'support' });

    await ctx.audit({
      action: 'mission.support.arrived', entity: 'city', entityId: targetCityId!,
      after: { units, cargo },
    });
  };
}

/* ═══ CASUSLUK ═════════════════════════════════════════════════════════════ */

/**
 * ⭐ CASUSLUK — KESİŞİM MODELİ (kullanıcı tasarımı, 2026-07-30 · kalibrasyon: spy-balance.mjs).
 *
 * Bilgi kademesi doküman-birebir: `fark = benimCasusluk + log2(GÖNDERİLEN kuş) − rakipCasusluk`.
 * Kuş kaybı/engellenmesi katalogdaki `spyInterception`dan:
 *   • **Kule + Elf VURUR** (doküman) — kapasiteleri sayıya ve casusluk seviye farkına bağlı,
 *   • **rakip Casus Kuşlar ENGELLER** (vurmaz): eşit seviyede kuşa kuş — kimse bilgi alamaz
 *     ama kimse ölmez,
 *   • her iki kapasite de `2^(seviyeFarkı)` ile ölçeklenir → en büyük çarpan seviye farkı.
 *
 * **Raporlama (kullanıcı kararı):** iki rapor da casusluğun ÇÖZÜLDÜĞÜ anda yazılır — kuşların
 * eve dönüşü beklenmez. Savunan HER casuslukta "Casusluk Önleme Raporu" alır: kaç kuş geldi,
 * kaçı vuruldu/engellendi, hangi bilgi sızdı. Gönderen de aynı anda kendi raporunu alır.
 *
 * ⚠️ **Tüm kuşlar ölürse dönüş görevi** oluşmaz — ordu yok olmuştur (saldırıdaki "tam kayıpta
 * dönüş yok" kuralının ikizi). Engellenen kuşlar ölmez, eve döner.
 */
export function createSpyHandler(): MissionHandler {
  return async (ctx) => {
    const targetCityId = ctx.mission.targetCityId;
    const originCityId = ctx.mission.originCityId;
    const spyPlayerId = ctx.mission.ownerPlayerId;
    if (originCityId == null || spyPlayerId == null) throw new Error('spy: eksik görev alanları');

    const units = await loadMissionUnits(ctx.tx, ctx.mission.id);
    const birds = units['spy_bird'] ?? 0;

    const target = targetCityId == null ? null : await loadCityOwner(ctx.tx, targetCityId);
    if (!target || birds <= 0) {
      await scheduleReturn(ctx, {
        homeCityId: originCityId, units, cargo: { gold: 0, food: 0 }, returnOf: 'spy',
      });
      return;
    }
    await ctx.lockCity(targetCityId!);

    const mine = await techLevel(ctx.tx, spyPlayerId, 'espionage');
    const theirs = await techLevel(ctx.tx, target.playerId, 'espionage');
    const diff = spyEffectiveDiff(mine, birds, theirs);
    const level = spyLevelFor(diff);

    // ── Kesişim: savunanın kulesi/elfi VURUR, kuşları ENGELLER ────────────────
    const defense = await ctx.tx.execute<Record<string, unknown>>(sql`
      SELECT
        (SELECT COALESCE(count,0) FROM units    WHERE city_id = ${targetCityId} AND type = 'elf')          AS elf,
        (SELECT COALESCE(count,0) FROM units    WHERE city_id = ${targetCityId} AND type = 'spy_bird')     AS birds,
        (SELECT COALESCE(count,0) FROM defenses WHERE city_id = ${targetCityId} AND type = 'archer_tower') AS tower
    `);
    const hit = spyInterception({
      birds,
      myEspionage: mine,
      theirEspionage: theirs,
      towers: Number(defense[0]?.['tower'] ?? 0),
      elves: Number(defense[0]?.['elf'] ?? 0),
      defenderBirds: Number(defense[0]?.['birds'] ?? 0),
    });
    const gotIntel = hit.infoBirds >= 1;

    // ── Gönderenin raporu — çözüm ANINDA (kuşlar daha yolda) ──────────────────
    const intel = gotIntel ? await gatherIntel(ctx.tx, targetCityId!, target.playerId, level) : null;
    await writeMessage(ctx, {
      playerId: spyPlayerId, kind: 'spy_report', side: 'spy',
      subject: gotIntel
        ? `Casusluk raporu · ${target.name}`
        : (hit.survivors <= 0 ? 'Casus kuşların vuruldu' : 'Casusluk engellendi'),
      body: {
        targetCityId, targetCityName: target.name, targetPlayer: target.username,
        birdsSent: birds, birdsLost: hit.killed, birdsBlocked: hit.blocked,
        level: gotIntel ? level : null, diff: Math.round(diff * 100) / 100,
        intel, at: ctx.at.toISOString(),
      },
    });

    /* ── ⭐ CASUSLUK ÖNLEME RAPORU — savunan HER casuslukta alır (kullanıcı, 2026-07-30).
     * Eski kural yalnız kuş vurulduysa haber veriyordu; artık sessiz casusluk YOK: kaç kuş
     * geldi, kaçı vuruldu/engellendi ve hangi bilginin sızdığı savunana da yazılır. */
    await writeMessage(ctx, {
      playerId: target.playerId, kind: 'spy_report', side: 'target',
      subject: 'Casusluk Önleme Raporu',
      body: {
        cityId: targetCityId,
        birdsSent: birds, birdsShot: hit.killed, birdsBlocked: hit.blocked,
        /** Rakibin aldığı bilgi kademesi — sızma yoksa null. */
        leakedLevel: gotIntel ? level : null,
        at: ctx.at.toISOString(),
      },
    });

    // ── Dönüş: engellenenler dahil sağ kalanlar; hepsi öldüyse dönüş yok ─────
    if (hit.survivors > 0) {
      await scheduleReturn(ctx, {
        homeCityId: originCityId,
        units: { spy_bird: hit.survivors },
        cargo: { gold: 0, food: 0 },
        returnOf: 'spy',
      });
    }
    await ctx.audit({
      action: 'mission.spy.resolved', entity: 'city', entityId: targetCityId!,
      after: { birds, killed: hit.killed, blocked: hit.blocked, level: gotIntel ? level : null, diff },
    });
  };
}

/** Kademeye göre TOPLANAN bilgi. Her kademe bir öncekinin üstüne ekler (doküman). */
async function gatherIntel(
  tx: Tx, cityId: number, playerId: number, level: SpyLevel,
): Promise<Record<string, unknown>> {
  const order: SpyLevel[] = ['resources', 'economy', 'armyTotals', 'armyTypes', 'armyCounts', 'full'];
  const at = order.indexOf(level);
  const out: Record<string, unknown> = {};

  const res = await tx.execute<Record<string, unknown>>(sql`
    SELECT gold, food FROM cities WHERE id = ${cityId}
  `);
  out['resources'] = {
    gold: Math.floor(Number(res[0]?.['gold'] ?? 0)),
    food: Math.floor(Number(res[0]?.['food'] ?? 0)),
  };

  const buildings = await tx.execute<Record<string, unknown>>(sql`
    SELECT type, level FROM buildings WHERE city_id = ${cityId}
  `);
  const levels: Record<string, number> = {};
  for (const b of buildings) levels[String(b['type'])] = Number(b['level']);

  if (at >= 1) out['economy'] = { mine: levels['mine'] ?? 0, farm: levels['farm'] ?? 0 };

  if (at >= 2) {
    const [warriors, defenses] = await Promise.all([
      tx.execute<Record<string, unknown>>(sql`SELECT type, count FROM units WHERE city_id = ${cityId}`),
      tx.execute<Record<string, unknown>>(sql`SELECT type, count FROM defenses WHERE city_id = ${cityId}`),
    ]);
    const w = countsOf(warriors);
    const d = countsOf(defenses);
    // Sur/Büyü Kalkanı ADET değil SEVİYE taşır → "toplam savunma ünitesi"ne girmezler.
    const dUnits = Object.fromEntries(Object.entries(d).filter(([id]) => !isLevelBased(id)));

    out['totals'] = {
      warriors: sum(Object.values(w)),
      defenses: sum(Object.values(dUnits)),
    };
    if (at >= 3) {
      out['warriorTypes'] = Object.keys(w).filter((id) => (w[id] ?? 0) > 0);
      out['defenseTypes'] = Object.keys(dUnits).filter((id) => (dUnits[id] ?? 0) > 0);
    }
    if (at >= 4) {
      out['warriors'] = w;
      out['defenses'] = dUnits;
    }
  }

  if (at >= 5) {
    const techs = await tx.execute<Record<string, unknown>>(sql`
      SELECT type, level FROM techs WHERE player_id = ${playerId}
    `);
    const defLevels = await tx.execute<Record<string, unknown>>(sql`
      SELECT type, count FROM defenses WHERE city_id = ${cityId} AND type IN ('wall', 'magic_shield')
    `);
    const dl = countsOf(defLevels);
    out['techs'] = countsOf(techs, 'level');
    out['structures'] = {
      castle: levels['castle'] ?? 0,
      wall: dl['wall'] ?? 0,
      magic_shield: dl['magic_shield'] ?? 0,
      /**
       * ⭐ MAĞARA SEVİYESİ (kullanıcı, 2026-08-02) — yalnız SEVİYE.
       *
       * ⚠️ Mağaranın **İÇİNDEKİ askerler verilmez**: onlar ayrı bir tabloda (`cave_units`)
       * ve mağaranın bütün varlık sebebi orduyu casustan da saldırıdan da gizlemek. Seviye
       * ise düşmanın "bu şehir ne kadar asker saklayabilir" sorusuna cevap veriyor — casusun
       * en üst kademesinde bilinmesi makul, saklananın kendisi değil.
       *
       * Ek sorgu yok: `levels` yukarıda (`:263`) zaten tüm `buildings` satırlarını okuyor ve
       * mağara orada sıradan bir bina satırı (`cave.service.ts` de aynı yerden okuyor).
       */
      cave: levels['cave'] ?? 0,
    };
  }
  return out;
}

/* ═══ ŞEHİR KURMA ══════════════════════════════════════════════════════════ */

/**
 * ⚠️ Şehir yerinin boşluğu **VARIŞ ANINDA** kontrol edilir. Doküman: *"Ordunuz şehir kurmaya giderken,
 * seçtiğiniz yere başka bir oyuncu tarafından şehir kurulabilir. Bu durumda ordunuz şehir
 * kuramadan geri dönecektir."* Şehir sayısı limiti de burada YENİDEN bakılır: iki görev aynı
 * anda varırsa ilki limiti doldurmuş olabilir.
 */
export function createFoundCityHandler(cities: CityService): MissionHandler {
  return async (ctx) => {
    const originCityId = ctx.mission.originCityId;
    const playerId = ctx.mission.ownerPlayerId;
    if (originCityId == null || playerId == null) throw new Error('found_city: eksik görev alanları');

    // Hedef BOŞ şehir olduğu için `target_city_id` yok; koordinat görev satırında duruyor.
    const coords = await loadTargetCoords(ctx.tx, ctx.mission.id);
    if (!coords) throw new Error('found_city: hedef koordinat yok');
    const units = await loadMissionUnits(ctx.tx, ctx.mission.id);

    const check = await ctx.tx.execute<Record<string, unknown>>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM cities
          WHERE world_id = ${ctx.worldId} AND k = ${coords.k} AND d = ${coords.d} AND s = ${coords.s}) AS taken,
        (SELECT COUNT(*)::int FROM cities WHERE player_id = ${playerId}) AS owned,
        (SELECT COALESCE(level,0) FROM techs WHERE player_id = ${playerId} AND type = 'colonization') AS colonization
    `);
    const taken = Number(check[0]?.['taken'] ?? 0) > 0;
    const owned = Number(check[0]?.['owned'] ?? 0);
    const limit = maxCities(Number(check[0]?.['colonization'] ?? 0));

    if (taken || owned >= limit) {
      await writeMessage(ctx, {
        playerId, kind: 'found_city_report', side: 'owner',
        subject: taken ? 'Şehir kurulamadı — yer dolu' : 'Şehir kurulamadı — şehir limiti',
        body: { coordinates: coords, reason: taken ? 'slot_taken' : 'city_limit', at: ctx.at.toISOString() },
      });
      await scheduleReturn(ctx, {
        homeCityId: originCityId, units, cargo: { gold: 0, food: 0 }, returnOf: 'found_city',
      });
      return;
    }

    const name = await nextColonyName(ctx.tx, playerId);
    const cityId = await cities.create({
      worldId: ctx.worldId,
      playerId,
      name,
      k: coords.k, d: coords.d, s: coords.s,
      isCapital: false,
      at: ctx.at,
    }, ctx.tx as never);

    // Şehri kuran ordu yeni şehrin garnizonu olur (dönüş görevi YOK).
    for (const [type, count] of Object.entries(units)) {
      if (count <= 0) continue;
      await ctx.tx.execute(sql`
        INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
        ON CONFLICT (city_id, type) DO UPDATE SET count = units.count + ${count}
      `);
    }
    await ctx.tx.execute(sql`
      UPDATE heroes SET city_id = ${cityId}
       WHERE id IN (SELECT hero_id FROM mission_heroes WHERE mission_id = ${ctx.mission.id})
    `);
    await ctx.tx.execute(sql`DELETE FROM mission_heroes WHERE mission_id = ${ctx.mission.id}`);

    await writeMessage(ctx, {
      playerId, kind: 'found_city_report', side: 'owner',
      subject: `Yeni şehir kuruldu: ${name}`,
      body: { cityId, name, coordinates: coords, units, at: ctx.at.toISOString() },
    });
    await ctx.emit('city:founded', { cityId, playerId, coordinates: coords });
    await ctx.audit({
      action: 'mission.found_city.created', entity: 'city', entityId: cityId,
      playerId, after: { name, coordinates: coords, units },
    });
  };
}

/**
 * Koloni adı: "Koloni N". Ekranda İngilizce id görünmez (§13.14).
 *
 * ⚠️ Eskiden `"<oyuncu> kolonisi N"` üretiyordu (ör. "abdullah kolonisi 2" = 19 karakter) ve
 * 2026-07-31'de konan **3-10 karakter** sınırını daha ilk kolonide çiğniyordu — üstelik
 * oyuncu o adı sonradan düzenleyemezdi, çünkü yeni ad kuralı 10'u geçen hiçbir şeyi kabul
 * etmiyor. Kural koyup üreteci unutmak, kuralı kâğıt üstünde bırakmak olurdu.
 * "Koloni 100"e kadar (10 karakter) sığar; şehir üst sınırı bunun çok altında.
 */
async function nextColonyName(tx: Tx, playerId: number): Promise<string> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT (SELECT COUNT(*)::int FROM cities WHERE player_id = ${playerId}) AS n
      FROM players WHERE id = ${playerId}
  `);
  return clampName(`Koloni ${Number(rows[0]?.['n'] ?? 1)}`);
}

/* ═══ Ortak yardımcılar ════════════════════════════════════════════════════ */

/**
 * Dönüş bacağı. `returnOf` dönüşün ASLINI taşır → arayüz doğru simgeyi seçer (nakliye dönüşü
 * kılıç değil araba gösterir) ve rapor metni doğru olur.
 *
 * ⭐ Birlik kalmayıp yalnız kahraman dönüyorsa süre **kahramanın kendi hızıyla** kalkışta
 * hesaplanan `payload.heroTravelSeconds`tir (`battle.handlers.ts`teki kardeşiyle aynı kural).
 * Yolda olan eski görevlerde alan yok → `travelSeconds`e düşüyoruz.
 */
async function scheduleReturn(ctx: HandlerContext, o: {
  homeCityId: number;
  units: Record<string, number>;
  cargo: { gold: number; food: number };
  returnOf: string;
}): Promise<number | null> {
  const anyUnit = Object.values(o.units).some((n) => n > 0);
  const heroes = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT hero_id FROM mission_heroes WHERE mission_id = ${ctx.mission.id}
  `);
  // Ne birlik ne kahraman kaldıysa dönecek bir şey yok (§13.11.7).
  if (!anyUnit && heroes.length === 0) return null;

  const armyTravel = Number(ctx.mission.payload['travelSeconds'] ?? 0);
  const travel = Math.max(1, anyUnit
    ? armyTravel
    : Number(ctx.mission.payload['heroTravelSeconds'] ?? armyTravel));
  const executeAt = new Date(ctx.at.getTime() + travel * 1000);

  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                          execute_at, payload, idempotency_key)
    VALUES (${ctx.worldId}, 'return', 'scheduled', ${ctx.mission.ownerPlayerId},
            ${ctx.mission.targetCityId}, ${o.homeCityId},
            ${executeAt.toISOString()}::timestamptz,
            ${JSON.stringify({
              loot: o.cargo, travelSeconds: travel,
              fromMissionId: ctx.mission.id, returnOf: o.returnOf,
            })}::jsonb,
            ${`return:${ctx.mission.id}`})
    RETURNING id
  `);
  const returnMissionId = Number(rows[0]!['id']);

  for (const [type, count] of Object.entries(o.units)) {
    if (count <= 0) continue;
    await ctx.tx.execute(sql`
      INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${returnMissionId}, ${type}, ${count})
    `);
  }
  await ctx.tx.execute(sql`
    UPDATE mission_heroes SET mission_id = ${returnMissionId} WHERE mission_id = ${ctx.mission.id}
  `);
  return returnMissionId;
}

async function loadMissionUnits(tx: Tx, missionId: number): Promise<Record<string, number>> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT unit_type, count FROM mission_units WHERE mission_id = ${missionId}
  `);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['unit_type'])] = Number(r['count']);
  return out;
}

async function loadCityOwner(
  tx: Tx, cityId: number,
): Promise<{ playerId: number; name: string; username: string } | null> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT c.player_id, c.name, p.username FROM cities c
      JOIN players p ON p.id = c.player_id
     WHERE c.id = ${cityId}
  `);
  const r = rows[0];
  return r
    ? { playerId: Number(r['player_id']), name: String(r['name']), username: String(r['username']) }
    : null;
}

/** Boş şehre giden görevlerde hedef koordinat `missions` satırındadır (şehir id'si yoktur). */
async function loadTargetCoords(
  tx: Tx, missionId: number,
): Promise<{ k: number; d: number; s: number } | null> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT target_k, target_d, target_s FROM missions WHERE id = ${missionId}
  `);
  const r = rows[0];
  if (!r || r['target_k'] == null) return null;
  return { k: Number(r['target_k']), d: Number(r['target_d']), s: Number(r['target_s']) };
}

async function techLevel(tx: Tx, playerId: number, type: string): Promise<number> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT level FROM techs WHERE player_id = ${playerId} AND type = ${type}
  `);
  return Number(rows[0]?.['level'] ?? 0);
}

/**
 * ⭐ Mesaj yazımı ve **haberi** aynı yerde. Bildirimi çağıranlara bıraksaydık yeni bir rapor türü
 * eklendiğinde biri unutulur ve okunmamış rozeti ancak bir sonraki yoklamada güncellenirdi —
 * yoklamayı emniyet ağına indirdikten sonra bu "sessiz eksik" dakikalarca sürerdi.
 */
async function writeMessage(ctx: HandlerContext, o: {
  playerId: number; kind: string; side: string; subject: string; body: Record<string, unknown>;
}): Promise<void> {
  await ctx.tx.execute(sql`
    INSERT INTO messages (world_id, player_id, kind, side, battle_id, mission_id, subject, body, at)
    VALUES (${ctx.worldId}, ${o.playerId}, ${o.kind}, ${o.side}, NULL, ${ctx.mission.id},
            ${o.subject}, ${JSON.stringify(o.body)}::jsonb, ${ctx.at.toISOString()}::timestamptz)
  `);
  await ctx.emit('message:written', { playerId: o.playerId, kind: o.kind });
}

function readResources(v: unknown): { gold: number; food: number } {
  if (!v || typeof v !== 'object') return { gold: 0, food: 0 };
  const r = v as Record<string, unknown>;
  return { gold: Math.max(0, Number(r['gold'] ?? 0)), food: Math.max(0, Number(r['food'] ?? 0)) };
}

function countsOf(rows: Record<string, unknown>[], field = 'count'): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const n = Number(r[field] ?? 0);
    if (n > 0) out[String(r['type'])] = n;
  }
  return out;
}

function isLevelBased(id: string): boolean {
  return id === 'wall' || id === 'magic_shield' || id === 'temple';
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Katalogdaki adları raporlarda kullanmak için (İngilizce id ekranda görünmez, §13.14). */
export function unitNameTr(id: string): string {
  return UNITS_BY_ID[id]?.name.tr ?? BUILDINGS_BY_ID[id]?.name.tr ?? id;
}

/** Worker'a kaydedilecek tipler. */
export function missionHandlers(cities: CityService): Record<string, MissionHandler> {
  return {
    transport: createTransportHandler(cities),
    support: createSupportHandler(cities),
    spy: createSpyHandler(),
    found_city: createFoundCityHandler(cities),
  };
}
