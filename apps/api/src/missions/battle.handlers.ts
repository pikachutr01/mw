/**
 * ⭐ SAVAŞ ÇÖZÜMÜ ve DÖNÜŞ BACAĞI (SİSTEM PLANI §13.10, §13.11.7, §13.11.10)
 *
 * `attack` handler'ı motoru gerçek şehirlere bağlayan yerdir. Sözleşme (§1) burada da geçerli:
 * **`ctx.at` "şimdi"dir** (`now()` DEĞİL) ve **her şey tek transaction'dadır** — savaş, kayıplar,
 * ganimet, dönüş görevi ve iki tarafın raporu ya hep birlikte yazılır ya hiç yazılmaz.
 *
 * Zamanlama kuralları (§13.10.2):
 *   • Savaş anı = `mission.execute_at`. Görev 800 ms geç işlense bile savunanın kaynağı ve
 *     ordusu **varış anındaki** hâliyle okunur; zincir kaymaz.
 *   • Dönüş görevi `execute_at = savaş anı + gidiş süresi` (aynı süre, doküman kuralı).
 *   • Ganimet savunandan **savaş anında** düşülür, saldırana **dönüş anında** eklenir.
 */
import { sql } from 'drizzle-orm';
import { routeOf } from './report-route.ts';
import {
  LEVEL_BASED, UNITS_BY_ID, cancelRefund, caveRepairSeconds, dwarvesToBreakCave, heroReviveSeconds,
  heroLevelForXp,
  wallCurrentIntegrity,
  wallRepairSeconds,
  pickHeroName,
} from '@mobilwar/catalog';
import {
  calculateLoot, createRng, DEFAULT_COMBAT_CONFIG, DEFAULT_LOOT_CONFIG, simulate,
  type LootResult, type SimulateInput, type SimulateResult,
} from '@mobilwar/engine';
import { NIGHT_FROM_HOUR, NIGHT_TO_HOUR, zonedHour } from '@mobilwar/contracts';
import { reconcileCaveStore, scheduleCaveEscape, type CaveStoreReconcile } from '../cave/cave.handlers.ts';
import { toDate } from '../db/client.ts';
import type { CityService } from '../cities/city.service.ts';
import { applyMerit, sameAlliance } from '../merit/merit.service.ts';
import { debitLosses, debitRefund } from '../scoring/score.service.ts';
import type { HandlerContext, MissionHandler, Tx } from './handler-registry.ts';

/**
 * Gece savaşı penceresi — oyunun KENDİ dokümanından:
 * *"Saat 00:00'dan sabah 08:00'a kadar olan zaman gece olarak nitelendirilir."*
 * Oyun saatine göre değerlendirilir (bakımda saat donduğu için pencere de kaymaz).
 *
 * ⚠️ **SAATLER ARTIK TÜRKİYE SAATİNDE OKUNUYOR** (kullanıcı, 2026-08-04). Eskiden
 * `getUTCHours()` ile ölçülüyordu, yani pencere Türkiye'de **03:00-11:00**'e denk geliyordu:
 * oyuncular sabah 10'da "gece" cezası yiyor, gerçek gece yarısında yemiyordu. Dokümandaki
 * cümle "saat 00:00'dan 08:00'a" diyor ve o cümleyi okuyan Türkiye'deki oyuncu için artık
 * gerçekten öyle.
 *
 * ⚠️ Bu bir DENGE değişikliğidir: aynı sefer, aynı saatte gönderildiğinde artık farklı
 * sonuçlanabilir. Bilerek yapıldı — kuralın yazdığı saatle oyuncunun saatinin uyuşmaması
 * dengeden önce bir doğruluk sorunuydu.
 */
/**
 * ⚠️ Sabitler `@mobilwar/contracts`ten: üst şeritteki **gece rozeti** de aynı pencereyi
 * okuyor. İki kopya olsaydı rozet ile kural ayrışabilir ve oyuncuya yanlış söyleyebilirdi.
 */
export const NIGHT_WINDOW = { fromHour: NIGHT_FROM_HOUR, toHour: NIGHT_TO_HOUR } as const;

export function isNightBattle(at: Date, window = NIGHT_WINDOW): boolean {
  const h = zonedHour(at);
  return h >= window.fromHour && h < window.toHour;
}

interface SideState {
  playerId: number;
  units: Record<string, number>;
  /** Savunanın savaşa GİRERKENKİ sur bütünlüğü (0-1). Onarım sürüyorsa 1'den küçüktür. */
  wallIntegrity?: number;
  techs: Record<string, number>;
  heroes: {
    id: number; name: string; level: number; xp: number;
    fAtk: number; fDef: number; mAtk: number; mDef: number;
  }[];
  /** Çıkma ihtimali için: oyuncunun TÜM şehirlerinin tapınak toplamı. */
  temple: number;
  /** Diriltme süresi için: bu savaşın geçtiği şehrin kendi tapınağı. */
  homeTemple?: number;
}

/* ═══ SALDIRI ═══════════════════════════════════════════════════════════════ */

export function createAttackHandler(cities: CityService): MissionHandler {
  return async (ctx) => {
    const targetCityId = ctx.mission.targetCityId;
    const originCityId = ctx.mission.originCityId;
    const attackerPlayerId = ctx.mission.ownerPlayerId;
    if (targetCityId == null || originCityId == null || attackerPlayerId == null) {
      throw new Error('attack: eksik görev alanları (hedef/kaynak şehir veya oyuncu)');
    }

    // Aynı şehre düşen görevler seri hâle gelir → iki saldırı aynı savunmayı iki kez okuyamaz.
    await ctx.lockCity(targetCityId);

    // ⭐ Savunanın kaynağı SAVAŞ ANINA kadar biriktirilir; ganimet bu tutardan hesaplanır.
    await cities.materialize(targetCityId, ctx.at, ctx.tx as never);

    const defenderCity = await loadCityOwner(ctx.tx, targetCityId);
    if (!defenderCity) {
      // Şehir savaş varmadan yok olmuş (terk/fetih). Ordu boş yere gitmiş sayılır: geri döner.
      await scheduleReturn(ctx, {
        originCityId, battleId: null,
        units: await loadMissionUnits(ctx.tx, ctx.mission.id),
        loot: null,
      });
      return;
    }

    const attacker = await loadAttackerState(ctx, attackerPlayerId);
    const defender = await loadDefenderState(ctx.tx, targetCityId, defenderCity.playerId, ctx.at);

    const night = isNightBattle(ctx.at);
    const input: SimulateInput = {
      attacker: {
        counts: attacker.units,
        tech: attacker.techs,
        heroes: attacker.heroes.map(toHeroInput),
        temple: attacker.temple,
        heroCount: attacker.heroes.length,
      },
      defender: {
        counts: defender.units,
        wallIntegrity: defender.wallIntegrity,
        tech: defender.techs,
        heroes: defender.heroes.map(toHeroInput),
        temple: defender.temple,
        heroCount: defender.heroes.length,
      },
      night,
      nightVisionAttacker: attacker.techs['night_vision'] ?? 0,
      nightVisionDefender: defender.techs['night_vision'] ?? 0,
      // ⭐ Determinizm (§5): seed görevin kimliğidir → savaş her yeniden oynatmada aynı biter.
      seed: `mission:${ctx.mission.id}`,
    };

    /**
     * ⭐ DÜNYA BAZLI MOTOR AYARLARI (§admin Faz 4). `ctx.engine?.combat` verilmezse
     * `simulate` motorun `DEFAULT_COMBAT_CONFIG`ini AYNEN kullanır → hiçbir ayar
     * değiştirilmemiş dünyada sonuç bit-bit eskisiyle aynı kalır.
     */
    const result = simulate(input, ctx.engine?.combat);

    // Savaş öncesi savunmasız mıydı? (`loot.condition = "undefendedBefore"` seçeneği için.)
    const defendedBefore = Object.entries(defender.units)
      .some(([id, n]) => n > 0 && !LEVEL_BASED.has(id));

    const cityResources = await readCityResources(ctx.tx, targetCityId);
    const loot = calculateLoot({
      winner: result.winner,
      debris: result.debris,
      cityResources,
      carryCapacity: result.attackerCarryCapacity,
      defendedBefore,
      seed: `mission:${ctx.mission.id}`,
    }, ctx.engine?.loot
      ? { ...DEFAULT_LOOT_CONFIG, ...ctx.engine.loot }
      : DEFAULT_LOOT_CONFIG);

    const battleId = await writeBattle(ctx, {
      missionId: ctx.mission.id,
      attackerPlayerId,
      defenderPlayerId: defenderCity.playerId,
      attackerCityId: originCityId,
      defenderCityId: targetCityId,
      night,
      input,
      result,
      loot,
    });

    // ── Kayıpları uygula ──────────────────────────────────────────────────────
    await applySurvivors(ctx.tx, targetCityId, result.defender.counts, defender.units);

    /**
     * ⭐ PUAN KAYBI (doküman GENEL DURUM: *"Ordularınızın savaştaki kayıpları … puan
     * kaybetmenize neden olur"*). Motorun `lost` alanı TOPLAM adettir; puan bedeli birim
     * türüne göre değiştiği için kayıp **tür tür** çıkarılır (öncesi − sonrası).
     *
     * ⚠️ Savunanın tabanla geri gelen birimleri `counts` içinde zaten duruyor → onlar
     * kaybedilmiş sayılmaz ve puan götürmez; bu, savunma tabanının (§13.11.10) puan
     * tarafındaki doğal karşılığı.
     */
    const attackerLosses = perTypeLosses(attacker.units, result.attacker.counts);
    const defenderLosses = perTypeLosses(defender.units, result.defender.counts);
    await debitLosses(ctx.tx, attackerPlayerId, attackerLosses);
    await debitLosses(ctx.tx, defenderCity.playerId, defenderLosses);

    /**
     * ⭐ ASKERÎ ÜNVAN — aynı kayıp tablosunun ikinci okuyucusu.
     *
     * Puan kaybı "kendi ordumun bedeli", ünvan ise "düşmanın ordusunun bedeli": aynı iki
     * `Record` ters çaprazlanıyor. Bu yüzden burada, `debitLosses`ın hemen yanında —
     * kayıpları ikinci kez hesaplamak için başka bir yere koymak gerekirdi.
     */
    await grantMerits(ctx, {
      battleId,
      attackerPlayerId,
      defenderPlayerId: defenderCity.playerId,
      attackerLosses,
      defenderLosses,
    });

    // ⭐ Yağma savunandan SAVAŞ ANINDA düşülür (§13.10.4): yoldaki mal kimsenin değildir,
    //    savunan geri alamaz, saldıran ancak dönüşte alır.
    if (loot.fromPlunder.gold > 0 || loot.fromPlunder.food > 0) {
      await cities.trySpend(targetCityId, loot.fromPlunder, ctx.at, ctx.tx as never);
    }
    // Taşınamayan enkaz yok olmaz → savunanın şehrine eklenir.
    if (loot.leftoverDebrisToDefender.gold > 0 || loot.leftoverDebrisToDefender.food > 0) {
      await cities.add(targetCityId, loot.leftoverDebrisToDefender, ctx.at, ctx.tx as never);
    }

    /**
     * ⭐ MAĞARA (§13.20.3) — **kayıplar uygulandıktan SONRA** bakılır ve sıra önemlidir:
     *  1. `resolveCaveBreak` mağara yıkıldı mı diye bakar; yıkıldıysa süren emirleri iptal eder.
     *  2. Yıkılmadıysa bekleyen doldurma emri hayatta kalanlarla uzlaştırılır — o askerler
     *     savaşa KATILDILAR (yeni model), ölmüş olabilirler.
     * Ters sırada yapsaydık yıkılan mağarada iptal edilmiş bir emri boşuna uzlaştırırdık.
     */
    const cave = await resolveCaveBreak(ctx, {
      cityId: targetCityId,
      defenderPlayerId: defenderCity.playerId,
      survivingDwarves: Math.max(0, Math.trunc(result.attacker.counts['dwarf'] ?? 0)),
      blacksmithing: attacker.techs['blacksmithing'] ?? 0,
    });
    /**
     * ⭐ Mağara sonucu **savaş kaydına da** yazılır (rapor modalı `battles.result`'tan okuyor).
     * Satır yukarıda yazıldığı için birleştiriyoruz; `writeBattle`'ı aşağı taşımak savaş
     * kaydının sırasını değiştirirdi ve determinizm künyesinin (§5) yerini oynatırdı.
     *
     * ⚠️ İki tarafın gördüğü ayrı: `escaped` (mağaradan kimin kaçtığı) buradaki ORTAK bloğa
     * girmez — savunana özel veriler aşağıda `result.defenderPrivate` altına yazılır ve rapor
     * ucu saldıran tarafta o anahtarı komple siler.
     */
    await ctx.tx.execute(sql`
      UPDATE battles SET result = result || ${JSON.stringify({
      cave: {
        present: cave.present, broken: cave.broken, level: cave.level,
        required: cave.required, survivingDwarves: cave.survivingDwarves, reason: cave.reason,
      },
    })}::jsonb
       WHERE id = ${battleId}
    `);

    const caveOrder = cave.broken ? null : await reconcileCaveStore(ctx, targetCityId);
    if (caveOrder?.canceled) {
      /**
       * Hepsi öldü → oyuncuya savaş raporundan **AYRI** bir mesaj (kullanıcı isteği).
       * Rapor "savaşta ne oldu"yu anlatır; bu mesaj "planın ne oldu"yu.
       */
      await writeMessage(ctx, {
        playerId: defenderCity.playerId,
        kind: 'system',
        side: 'owner',
        battleId: null,
        subject: 'Mağaraya giriş iptal edildi',
        body: {
          cityId: targetCityId,
          reason: 'all_units_lost',
          ordered: caveOrder.ordered,
          at: ctx.at.toISOString(),
        },
      });
    }

    /**
     * ⭐ SUR ONARIMI (§13.21.2) — doküman: *"Savaşlarda yıkılan sur savaş sonrasında belirli bir
     * süre içinde yeniden onarılır."* Süre hem kalan bütünlüğe hem seviyeye bağlı.
     *
     * ⚠️ Sur SAĞLAM çıktıysa satıra dokunulmaz; aksi hâlde her savaş boş bir onarım kaydı yazardı.
     */
    const wallLevel = Math.max(0, Math.trunc(defender.units['wall'] ?? 0));
    const integrityAfter = result.defender.wallIntegrity;
    let wallDestroyed = false;
    let wallProduction: {
      canceled: { type: string; left: number }[];
      refunded: { gold: number; food: number };
    } = { canceled: [], refunded: { gold: 0, food: 0 } };
    if (wallLevel > 0 && integrityAfter != null && integrityAfter < 1) {
      /* Onarım süresi HER SEFERİNDE yeni hasara göre baştan hesaplanır: sur %40'tayken ikinci
       * saldırıda %0'a inerse tam yıkılma süresinin tamamını yeniden bekler. */
      const seconds = wallRepairSeconds(wallLevel, integrityAfter);
      const until = new Date(ctx.at.getTime() + seconds * 1000);
      await ctx.tx.execute(sql`
        UPDATE cities
           SET wall_integrity = ${integrityAfter}::numeric,
               wall_repair_from = ${ctx.at.toISOString()}::timestamptz,
               wall_repair_until = ${until.toISOString()}::timestamptz
         WHERE id = ${targetCityId}
      `);

      /**
       * ⭐ SUR TAM YIKILDI (§13.21.2, kullanıcı kararları 2026-07-29/30).
       *
       * Savunma birimleri surda yaşar; sur çökünce üretimlerinin de anlamı kalmaz:
       *   • süren ve kuyrukta bekleyen **savunma birimi** emirleri anında iptal edilir
       *     (o ana kadar üretilmiş olanlar şehirde KALIR — `materialize` iptalden önce koşar),
       *   • kalan birimlerin bedeli "1 ünite eksik" kuralıyla İADE edilir — ganimet
       *     hesabından SONRA kasaya girer, bir sonraki saldırının havuzuna kalır,
       *   • onarım bitene kadar yeni savunma birimi üretilemez (`queue.service`).
       * Sur/Büyü Kalkanı yükseltmeleri (seviye taşıyan şerit) etkilenmez.
       */
      wallDestroyed = integrityAfter <= 0;
      if (wallDestroyed) {
        wallProduction = await cancelDefenseBand(ctx, targetCityId, defenderCity.playerId);
        /* Kalıcı rapor `battles.result`'tan türetilir (`buildBattleReport`); iptal/iade bilgisi
         * savaş yazıldıktan SONRA oluştuğu için satıra burada işlenir. Rapor bunu yalnız
         * savunan tarafına not eder. */
        if (wallProduction.canceled.length > 0) {
          await ctx.tx.execute(sql`
            UPDATE battles
               SET result = result || ${JSON.stringify({ wallProduction })}::jsonb
             WHERE id = ${battleId}
          `);
        }
      }
    }

    /* ── KAHRAMANLAR ────────────────────────────────────────────────────────────
     * ⭐ 2026-08-01'den beri sağ kalan savaşçı sayısı kahramanın kaderini ETKİLEMEZ: ölen
     * kahraman her hâlükârda geri döner (yok olma kaldırıldı). Sayı yalnız **dönüş bacağının
     * kurulup kurulmayacağını** ve ganimetin taşınıp taşınmayacağını belirliyor.  */
    const attackerSurvivorCount = Object.values(warriorsOnly(result.attacker.counts))
      .reduce((a, b) => a + b, 0);
    const attackerWon = result.winner === 'attacker';

    /* ⭐ Tecrübe TEK havuzdan iki tarafa: kazanan 2/3, kaybeden 1/3. Payını kullanamayan
     * tarafın (kahramanı yok ya da hepsi öldü) payı ziyan olur, karşıya geçmez. */
    const { winner: winShare, loser: loseShare } = DEFAULT_COMBAT_CONFIG.heroXpShare;
    const defenderHeroes = await settleHeroes(ctx, {
      before: defender.heroes,
      after: result.defender.heroes,
      homeTemple: defender.homeTemple ?? defender.temple,
      homeCityId: targetCityId,
      xpShare: result.xp * (attackerWon ? loseShare : winShare),
    });
    const attackerHeroes = await settleHeroes(ctx, {
      before: attacker.heroes,
      after: result.attacker.heroes,
      homeTemple: attacker.homeTemple ?? 0,
      homeCityId: originCityId,
      xpShare: result.xp * (attackerWon ? winShare : loseShare),
    });

    /* ⭐ YENİ KAHRAMAN — yalnız kazanan tarafta, kendi şehrinde. */
    const capturedHero = await maybeCaptureHero(ctx, {
      playerId: attackerWon ? attackerPlayerId : defenderCity.playerId,
      worldId: ctx.worldId,
      cityId: attackerWon ? originCityId : targetCityId,
      chance: result.captureChance,
    });

    /**
     * ⭐ RAPOR ZENGİNLEŞTİRME (kullanıcı 2026-07-30): rapor modalı `battles.result`'tan
     * türediği için kahraman kimlikleri, sur seviyesi, koordinatlar ve mağara dökümü satıra
     * işlenir. Savunana özel veriler `defenderPrivate` altında toplanır — rapor ucu saldıran
     * tarafta bu anahtarı komple SİLER (tek filtre noktası; alan alan maskeleme unutulamaz).
     * Kahraman eşleşmesi savaşı çözen AYNI dizilerle yapılır (yeniden SELECT sıra bozar).
     */
    /**
     * ⚠️ `destroyed` alanı 2026-08-01'de **yazılmayı bıraktı** (yok olma kalktı). Eski satırlarda
     * duruyor ve rapor onu okumuyor: ölen kahraman `alive:false` ile zaten belli, iki taraf da
     * aynı «Yok Edildi» etiketine düşüyor (kullanıcı kararı: tek etiket).
     */
    const heroLines = (
      before: { id: number; name: string; level: number }[],
      after: { alive: boolean }[],
      settled: { gained: { id: number; xp: number }[] },
    ): Record<string, unknown>[] => before.map((h, i) => ({
      id: h.id,
      name: h.name,
      level: h.level,                                  // savaşa girdiği seviye
      alive: after[i]?.alive !== false,
      xpGained: settled.gained.find((g) => g.id === h.id)?.xp ?? 0,
    }));
    /**
     * ⚠️ Savaş raporu güzergâhı `routeOf`tan GEÇMİYOR: o, mesaj gövdesine yazıyor, bu ise
     * `battles.result`e. İki yol da aynı alanları taşımak zorunda — `name` (2026-08-04) ve
     * `owner` (2026-08-07) buraya da eklendi, yoksa saldırı raporu tek başına adsız kalırdı.
     */
    const coordRows = await ctx.tx.execute<Record<string, unknown>>(sql`
      SELECT c.id, c.k, c.d, c.s, c.name, p.username
        FROM cities c JOIN players p ON p.id = c.player_id
       WHERE c.id IN (${originCityId}, ${targetCityId})
    `);
    const coordOf = (cid: number): Record<string, unknown> | null => {
      const r = coordRows.find((x: Record<string, unknown>) => Number(x['id']) === cid);
      return r
        ? {
          k: Number(r['k']), d: Number(r['d']), s: Number(r['s']),
          name: String(r['name']), owner: String(r['username']),
        }
        : null;
    };
    await ctx.tx.execute(sql`
      UPDATE battles SET result = result || ${JSON.stringify({
      heroesDetail: {
        attacker: heroLines(attacker.heroes, result.attacker.heroes, attackerHeroes),
        defender: heroLines(defender.heroes, result.defender.heroes, defenderHeroes),
        captured: capturedHero == null
          ? null : { name: capturedHero, side: attackerWon ? 'attacker' : 'defender' },
      },
      wall: { level: wallLevel, destroyed: wallDestroyed },
      coords: { origin: coordOf(originCityId), target: coordOf(targetCityId) },
      defenderPrivate: {
        cave: { escaped: cave.escaped, repairUntil: cave.repairUntil },
      },
    })}::jsonb
       WHERE id = ${battleId}
    `);

    // ── Dönüş bacağı (§13.10.3) ───────────────────────────────────────────────
    // ⭐ Hayatta kalan birlik YOKSA ganimet de yoktur (§13.11.7) ve rapor "ordudan kimse
    //    dönmedi" der — ama **kahraman varsa dönüş görevi yine kurulur** (2026-08-01):
    //    kahraman ölü ya da sağ, yalnız başına kendi hızıyla eve yürür.
    // ⚠️ `carriedIds` ölüleri DE içerir; ikisi de aynı satırla taşınır.
    const survivors = warriorsOnly(result.attacker.counts);
    const anySurvivor = attackerSurvivorCount > 0;
    const heroesComingHome = attackerHeroes.carriedIds.length > 0;
    if (anySurvivor || heroesComingHome) {
      await scheduleReturn(ctx, {
        originCityId, battleId, units: survivors, loot, heroOnly: !anySurvivor,
      });
    }

    await writeBattleReports(ctx, {
      battleId,
      attackerPlayerId,
      defenderPlayerId: defenderCity.playerId,
      targetCityId,
      originCityId,
      diedHeroes: [...attackerHeroes.died, ...defenderHeroes.died],
      capturedHero,
      heroXp: { attacker: attackerHeroes.gained, defender: defenderHeroes.gained },
      wallDestroyed,
      wallProduction,
      result,
      loot,
      night,
      returning: anySurvivor,
      cave,
      caveOrder,
    });

    await ctx.audit({
      action: 'battle.resolved',
      entity: 'battle',
      entityId: battleId,
      playerId: attackerPlayerId,
      after: {
        winner: result.winner, turns: result.turns,
        attackerLost: result.attacker.lost, defenderLost: result.defender.lost,
        loot: loot.taken,
      },
    });
  };
}

/* ═══ DÖNÜŞ ════════════════════════════════════════════════════════════════ */

export function createReturnHandler(cities: CityService): MissionHandler {
  return async (ctx) => {
    const cityId = ctx.mission.targetCityId ?? ctx.mission.originCityId;
    if (cityId == null) throw new Error('return: dönülecek şehir yok');
    await ctx.lockCity(cityId);

    const units = await loadMissionUnits(ctx.tx, ctx.mission.id);
    for (const [type, count] of Object.entries(units)) {
      if (count <= 0) continue;
      await ctx.tx.execute(sql`
        INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
        ON CONFLICT (city_id, type) DO UPDATE SET count = units.count + ${count}
      `);
    }

    // Kahramanlar şehre geri konur (ölenler savaş anında zaten ayrılmıştı).
    await ctx.tx.execute(sql`
      UPDATE heroes SET city_id = ${cityId}
       WHERE id IN (SELECT hero_id FROM mission_heroes WHERE mission_id = ${ctx.mission.id})
    `);
    await ctx.tx.execute(sql`DELETE FROM mission_heroes WHERE mission_id = ${ctx.mission.id}`);

    // ⭐ Ganimet VARIŞTA kasaya eklenir (§13.10.3).
    const loot = readLootPayload(ctx.mission.payload);
    if (loot.gold > 0 || loot.food > 0) {
      await cities.add(cityId, loot, ctx.at, ctx.tx as never);
    }

    const playerId = ctx.mission.ownerPlayerId;
    if (playerId != null) {
      /* ⭐ DÖNÜŞ RAPORU YAZILMAZ (kullanıcı kararı, 2026-07-30): posta kutusunu dört özdeş
       * "Ordu geri döndü" satırıyla doldurmak yerine dönüş yalnız BİLDİRİM üretir —
       * `mission:completed` (scheduler) Ordular listesini anında düşürür; ileride web push /
       * FCM aynı olaydan beslenir. Eski `return_report` kayıtları arşivde durur, istemci
       * onları soluk "Ordu Döndü" olarak çizmeye devam eder. */
      await ctx.emit('city:army_returned', {
        cityId, playerId, units, loot, at: ctx.at.toISOString(),
      });
      /* Dönüş şehre BİRLİK + GANİMET yazar; `city:army_returned` yalnız `missions:changed`a
       * eşlendiği için `['city']` tazelenmiyordu — asker/kaynak sayıları 60 sn bayat kalıyordu. */
      await ctx.emit('city:changed', { cityId, playerId, reason: 'army_returned' });
    }

    await ctx.audit({
      action: 'mission.return.arrived', entity: 'city', entityId: cityId,
      after: { units, loot },
    });
  };
}

/* ═══ Yardımcılar ═══════════════════════════════════════════════════════════ */

function toHeroInput(h: { level: number; fAtk: number; fDef: number; mAtk: number; mDef: number }): {
  level: number; fAtk: number; fDef: number; mAtk: number; mDef: number;
} {
  return { level: h.level, fAtk: h.fAtk, fDef: h.fDef, mAtk: h.mAtk, mDef: h.mDef };
}

async function loadCityOwner(tx: Tx, cityId: number): Promise<{ playerId: number } | null> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT player_id FROM cities WHERE id = ${cityId}
  `);
  return rows[0] ? { playerId: Number(rows[0]['player_id']) } : null;
}

async function loadMissionUnits(tx: Tx, missionId: number): Promise<Record<string, number>> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT unit_type, count FROM mission_units WHERE mission_id = ${missionId}
  `);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['unit_type'])] = Number(r['count']);
  return out;
}

async function loadTechs(tx: Tx, playerId: number): Promise<Record<string, number>> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT type, level FROM techs WHERE player_id = ${playerId}
  `);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['type'])] = Number(r['level']);
  return out;
}

/**
 * ⭐ KAHRAMAN ÇIKMA İHTİMALİNDEKİ "Tapınak" = oyuncunun **TÜM ŞEHİRLERİNDEKİ** tapınak
 * seviyelerinin TOPLAMI — tek şehrin tapınağı değil (kullanıcı, oyunun kendi davranışı).
 * Şehir sayısı arttıkça toplam da arttığı için bu, `Tapınak×10 − Kahraman×155` formülündeki
 * çıkarmalı cezayı doğal biçimde aşılabilir kılıyor (tek şehirle 2. kahraman imkânsız olurdu).
 *
 * ⚠️ Dokümanın *"her şehirdeki tapınak kendi şehrine etki eder"* cümlesi DİRİLTME SÜRESİ için
 * geçerli; oradaki hesap tek şehrin tapınağıyla yapılır (bkz. `settleHeroes`).
 */
async function loadTempleSum(tx: Tx, playerId: number): Promise<number> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT COALESCE(SUM(b.level), 0) AS total
      FROM buildings b JOIN cities c ON c.id = b.city_id
     WHERE c.player_id = ${playerId} AND b.type = 'temple'
  `);
  return Number(rows[0]?.['total'] ?? 0);
}

/** Tek şehrin tapınağı — diriltme süresi bunu kullanır. */
async function loadTemple(tx: Tx, cityId: number): Promise<number> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT level FROM buildings WHERE city_id = ${cityId} AND type = 'temple'
  `);
  return Number(rows[0]?.['level'] ?? 0);
}

/** Saldıran ordu görevin kendisinden okunur — şehirden değil (birlikler yola çıkarken düşmüştü). */
async function loadAttackerState(ctx: HandlerContext, playerId: number): Promise<SideState> {
  const heroRows = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT h.id, h.name, h.level, h.xp, h.f_atk, h.f_def, h.m_atk, h.m_def
      FROM mission_heroes mh JOIN heroes h ON h.id = mh.hero_id
     WHERE mh.mission_id = ${ctx.mission.id}
  `);
  return {
    playerId,
    units: await loadMissionUnits(ctx.tx, ctx.mission.id),
    techs: await loadTechs(ctx.tx, playerId),
    heroes: heroRows.map(toHeroRow),
    temple: await loadTempleSum(ctx.tx, playerId),          // çıkma ihtimali: TÜM şehirlerin toplamı
    homeTemple: ctx.mission.originCityId == null ? 0 : await loadTemple(ctx.tx, ctx.mission.originCityId),
  };
}

/**
 * Savunanın SAVAŞ ANINDAKİ durumu: barakadaki savaşçılar + surdaki savunma birimleri +
 * Sur/Büyü Kalkanı SEVİYELERİ (bunlar adet değil seviye taşır, §13.11.1b) + oyuncu teknikleri.
 */
async function loadDefenderState(
  tx: Tx, cityId: number, playerId: number, at: Date,
): Promise<SideState> {
  const [unitRows, defRows, heroRows] = await Promise.all([
    tx.execute<Record<string, unknown>>(sql`SELECT type, count FROM units WHERE city_id = ${cityId}`),
    tx.execute<Record<string, unknown>>(sql`SELECT type, count FROM defenses WHERE city_id = ${cityId}`),
    tx.execute<Record<string, unknown>>(sql`
      SELECT id, name, level, xp, f_atk, f_def, m_atk, m_def FROM heroes
       WHERE city_id = ${cityId} AND status = 'alive'
    `),
  ]);

  const units: Record<string, number> = {};
  for (const r of [...unitRows, ...defRows]) {
    const count = Number(r['count']);
    if (count > 0) units[String(r['type'])] = count;
  }

  /**
   * ⭐ Sur onarımdaysa savaşa HASARLI girer (§13.21.2). Onarım bittiyse (`wall_repair_until`
   * geçmişte) bütünlük 1 sayılır — ayrı bir "onarım bitti" görevi yazmaya gerek yok, tembel
   * kaynak birikimindeki desenin aynısı.
   */
  const wallRows = await tx.execute<Record<string, unknown>>(sql`
    SELECT wall_integrity, wall_repair_from, wall_repair_until FROM cities WHERE id = ${cityId}
  `);
  const repairUntil = wallRows[0]?.['wall_repair_until'] == null
    ? null : toDate(wallRows[0]!['wall_repair_until']);
  const repairFrom = wallRows[0]?.['wall_repair_from'] == null
    ? null : toDate(wallRows[0]!['wall_repair_from']);
  const wallIntegrity = wallCurrentIntegrity(
    Number(wallRows[0]?.['wall_integrity'] ?? 1), repairFrom, repairUntil, at,
  );

  return {
    playerId,
    units,
    wallIntegrity,
    techs: await loadTechs(tx, playerId),
    heroes: heroRows.map(toHeroRow),
    temple: await loadTempleSum(tx, playerId),   // çıkma ihtimali: TÜM şehirlerin toplamı
    homeTemple: await loadTemple(tx, cityId),    // diriltme süresi: bu şehrin tapınağı
  };
}

function toHeroRow(r: Record<string, unknown>): SideState['heroes'][number] {
  return {
    id: Number(r['id']),
    name: String(r['name'] ?? ''),
    level: Number(r['level']),
    xp: Number(r['xp'] ?? 0),
    fAtk: Number(r['f_atk']),
    fDef: Number(r['f_def']),
    mAtk: Number(r['m_atk']),
    mDef: Number(r['m_def']),
  };
}

async function readCityResources(tx: Tx, cityId: number): Promise<{ gold: number; food: number }> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT gold, food FROM cities WHERE id = ${cityId}
  `);
  return { gold: Number(rows[0]?.['gold'] ?? 0), food: Number(rows[0]?.['food'] ?? 0) };
}

/** Savaşçılar `units`, savunma birimleri `defenses` tablosuna yazılır. Sur/Kalkan SEVİYE → dokunulmaz. */
async function applySurvivors(
  tx: Tx, cityId: number, after: Record<string, number>, before: Record<string, number>,
): Promise<void> {
  for (const id of Object.keys(before)) {
    if (LEVEL_BASED.has(id)) continue;          // Sur / Büyü Kalkanı / Tapınak: seviye düşmez
    const def = UNITS_BY_ID[id];
    if (!def) continue;
    const left = Math.max(0, Math.trunc(after[id] ?? 0));
    const table = def.kind === 'defense' ? 'defenses' : 'units';
    await tx.execute(sql`
      UPDATE ${sql.raw(table)} SET count = ${left} WHERE city_id = ${cityId} AND type = ${id}
    `);
  }
}

/* ═══ MAĞARA YIKILMASI (§13.20.3) ═══════════════════════════════════════════ */

export interface CaveBreakResult {
  /** Savunanda gerçekten bir mağara var mıydı (sv ≥ 1)? */
  present: boolean;
  level: number;
  /** Bu seviyeyi yıkmak için gereken cüce (saldıranın Demircilik'i düşülmüş). */
  required: number;
  /** Saldırıdan sağ çıkan cüce sayısı. */
  survivingDwarves: number;
  broken: boolean;
  /** Yıkılmadıysa sebebi: `not_enough_dwarves` · `already_repairing` · `no_cave`. */
  reason: string | null;
  /** Yıkıldıysa mağaradan kaçan birlikler. */
  escaped: Record<string, number>;
  repairUntil: string | null;
}

/**
 * ⭐ Mağara yıkılır mı?
 *
 * Ölçüt **hayatta kalan cüce sayısıdır**, saldırıya çıkan değil. Gerekçe iki taraflı:
 * (1) doküman kazanma şartından söz etmiyor, yalnız *"cüceler yeterince fazla sayıda
 * olduklarında"* diyor; (2) eşikler zaten büyük (sv 1 → 100, sv 10 → 3.844), o kadar cüceyle
 * savaştan sağ çıkmak fiilen üstünlük demek. Böylece "kaybeden saldırı mağarayı yıkamaz"
 * kuralını ayrıca yazmaya gerek kalmıyor — motorun sonucu bunu kendiliğinden sağlıyor.
 *
 * Kullanıcının koyduğu üç kapı burada:
 *  • **Seviye 0 mağara yıkılmaz** (henüz üretilmemiş).
 *  • **Onarımdaki mağara yeniden yıkılmaz**, süresi de baştan başlamaz.
 *  • **Boş mağara da yıkılır** — içeride asker olması şart değil.
 */
/**
 * ⭐ SUR TAM YIKILDI → savunma bandı boşaltılır (kullanıcı kararı, 2026-07-29).
 *
 * Çağrılmadan önce şehir **materialize** edilir: o ana kadar üretilmiş savunma birimleri şehre
 * yazılmış olur ve iptalden ETKİLENMEZ — kullanıcının şartı buydu ("o zamana kadar geçen sürede
 * üretilenler zaten üretilmiştir").
 *
 * ⚠️ **İade YOK.** İptal oyuncunun tercihi değil, savaşın sonucu; yarım kalan birimlerin taşı
 * toprağı surla birlikte gitti. Bunun yerine oyuncuya ayrı bir mesaj düşüyor ki kaynağın nereye
 * gittiği görünmez olmasın.
 *
 * Yalnız **birim bandı** temizlenir (`target_level IS NULL`); Sur/Büyü Kalkanı yükseltmeleri
 * seviye taşıyan ayrı şerittedir ve dokunulmaz.
 */
async function cancelDefenseBand(
  ctx: HandlerContext, cityId: number, playerId: number,
): Promise<{ canceled: { type: string; left: number }[]; refunded: { gold: number; food: number } }> {
  const open = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT id, mission_id, item_type, count, done, spent_gold, spent_food FROM queues
     WHERE city_id = ${cityId} AND category = 'defense' AND target_level IS NULL
       AND completed_at IS NULL AND canceled_at IS NULL
     ORDER BY position
  `);
  if (open.length === 0) return { canceled: [], refunded: { gold: 0, food: 0 } };

  const canceled: { type: string; left: number }[] = [];
  const refunded = { gold: 0, food: 0 };
  for (const q of open) {
    const count = Math.max(1, Number(q['count'] ?? 1));
    const left = Math.max(0, count - Number(q['done'] ?? 0));
    canceled.push({ type: String(q['item_type']), left });
    await ctx.tx.execute(sql`
      UPDATE queues SET canceled_at = ${ctx.at.toISOString()}::timestamptz WHERE id = ${q['id']}
    `);
    if (q['mission_id'] != null) {
      await ctx.tx.execute(sql`
        UPDATE missions SET status = 'canceled', finished_at = now()
         WHERE id = ${q['mission_id']} AND status IN ('scheduled', 'running')
      `);
    }

    /* ⭐ İADE (kullanıcı kararı, 2026-07-30) — normal iptal mantığının birebir aynısı:
     * her emirden ÜRETİLMEMİŞ birimlerin bedeli, **1 ünite eksik** iade edilir (oyunun kendi
     * dokümanı: "her iptal işlemi için 1 ünitenin ücreti eksik iade edilir"). Üretilmişlerin
     * (done) harcaması şehirde birim olarak duruyor, onlar iade dışı — `queue.service.cancel`
     * ile aynı efektif-harcama hesabı. */
    if (left > 0) {
      const spent = { gold: Number(q['spent_gold']), food: Number(q['spent_food']) };
      const effective = {
        gold: (spent.gold / count) * left,
        food: (spent.food / count) * left,
      };
      const r = cancelRefund({ rule: 'minusOneUnit', spent: effective, count: left });
      refunded.gold += r.gold;
      refunded.food += r.food;
    }
  }
  /* İade savaş SONRASI kasaya girer: bu savaşın ganimet havuzu çoktan hesaplandı, yani rakip
   * bu parayı bu saldırıda alamaz — ama bir SONRAKİ saldırı onu kasada bulur (kullanıcı kararı).
   * Doğrudan UPDATE yeterli: şehir bu transaction'da savaş başında `materialize` edildi
   * (`cities.add`in yaptığı da bundan ibaret). Skor normal iptaldeki gibi geri alınır. */
  if (refunded.gold > 0 || refunded.food > 0) {
    await ctx.tx.execute(sql`
      UPDATE cities SET gold = gold + ${refunded.gold}::numeric, food = food + ${refunded.food}::numeric
       WHERE id = ${cityId}
    `);
    await debitRefund(ctx.tx as never, playerId, refunded);
  }
  return { canceled, refunded };
}

async function resolveCaveBreak(ctx: HandlerContext, o: {
  cityId: number;
  defenderPlayerId: number;
  survivingDwarves: number;
  blacksmithing: number;
}): Promise<CaveBreakResult> {
  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT c.cave_repair_until,
           COALESCE((SELECT level FROM buildings b WHERE b.city_id = c.id AND b.type = 'cave'), 0) AS level
      FROM cities c WHERE c.id = ${o.cityId}
  `);
  const level = Number(rows[0]?.['level'] ?? 0);
  const repairUntil = rows[0]?.['cave_repair_until'] == null
    ? null : toDate(rows[0]!['cave_repair_until']);

  const base: CaveBreakResult = {
    present: level > 0,
    level,
    required: level > 0 ? dwarvesToBreakCave(level, o.blacksmithing) : 0,
    survivingDwarves: o.survivingDwarves,
    broken: false,
    reason: null,
    escaped: {},
    repairUntil: null,
  };

  if (level <= 0) return { ...base, reason: 'no_cave' };
  if (repairUntil != null && repairUntil > ctx.at) {
    // Onarımdaki mağara zaten yıkık; ikinci bir yıkım süreyi UZATMAZ.
    return { ...base, reason: 'already_repairing', repairUntil: repairUntil.toISOString() };
  }
  if (o.survivingDwarves < base.required) return { ...base, reason: 'not_enough_dwarves' };

  const until = new Date(ctx.at.getTime() + caveRepairSeconds(level) * 1000);
  await ctx.tx.execute(sql`
    UPDATE cities SET cave_repair_until = ${until.toISOString()}::timestamptz WHERE id = ${o.cityId}
  `);

  // Süren emirleri iptal eder, mağarayı boşaltır ve TEK kaçış görevini yazar.
  const inside = await scheduleCaveEscape(ctx, {
    cityId: o.cityId, playerId: o.defenderPlayerId, caveLevel: level,
  });

  await ctx.audit({
    action: 'cave.broken', entity: 'city', entityId: o.cityId,
    playerId: o.defenderPlayerId,
    after: { level, required: base.required, dwarves: o.survivingDwarves, escaped: inside },
  });

  return { ...base, broken: true, escaped: inside, repairUntil: until.toISOString() };
}

/**
 * ⭐ ASKERÎ ÜNVAN DAĞITIMI — iki tarafa da, kim kazandığına BAKMADAN.
 *
 * Kullanıcı kuralı: *"hem savunan hem saldıran için geçerli… Savaşı kaybetse bile verilsin."*
 * Ölçü sonucu değil, düşmana verilen zararı görüyor — bu yüzden saldırana **savunanın**
 * kayıpları, savunana **saldıranın** kayıpları veriliyor.
 *
 * ⚠️ Destek bugün yalnız **kendi şehirlerine** gidiyor (`mission.service.ts`), yani savunan
 * taraf tek oyuncu ve pay bölüşümü gerekmiyor. Müttefike destek eklenirse burası
 * "kim ne kadar ordu koydu" oranına göre bölünmek zorunda kalacak.
 *
 * ⚠️ Aynı ittifaktakiler arası savaş SAYILMAZ — anlaşmalı rozet dağıtımını kapatır.
 *
 * ⚠️ Hata YUTULMUYOR: ünvan savaşla aynı transaction'da. Bir sorun çıkarsa savaşın tamamı
 * geri alınıp yeniden denenir; "savaş oldu ama rozet yarım yazıldı" hâli oluşamaz.
 */
async function grantMerits(ctx: HandlerContext, o: {
  battleId: number;
  attackerPlayerId: number;
  defenderPlayerId: number;
  attackerLosses: Record<string, number>;
  defenderLosses: Record<string, number>;
}): Promise<void> {
  if (await sameAlliance(ctx.tx, o.attackerPlayerId, o.defenderPlayerId)) return;

  const taraflar: { playerId: number; enemyLosses: Record<string, number>; side: 'attacker' | 'defender' }[] = [
    { playerId: o.attackerPlayerId, enemyLosses: o.defenderLosses, side: 'attacker' },
    { playerId: o.defenderPlayerId, enemyLosses: o.attackerLosses, side: 'defender' },
  ];

  for (const t of taraflar) {
    const grant = await applyMerit({
      tx: ctx.tx,
      playerId: t.playerId,
      battleId: o.battleId,
      enemyLosses: t.enemyLosses,
      at: ctx.at,
      merit: ctx.engine?.merit,
    });
    if (!grant) continue;

    await ctx.emit('merit:granted', {
      worldId: ctx.worldId,
      playerId: grant.playerId,
      tier: grant.tier,
      name: grant.name,
      killScore: grant.killScore,
      expiresAt: grant.expiresAt.toISOString(),
      promoted: grant.promoted,
      battleId: o.battleId,
      side: t.side,
    });
    await ctx.audit({
      action: 'merit.granted', entity: 'player', entityId: grant.playerId,
      playerId: grant.playerId,
      after: {
        tier: grant.tier, name: grant.name, killScore: grant.killScore,
        expiresAt: grant.expiresAt.toISOString(), promoted: grant.promoted, battleId: o.battleId,
      },
    });
  }
}

/** Savaş öncesi/sonrası adetlerden tür tür kayıp. Artı yönde değişim (taban onarımı) sayılmaz. */
function perTypeLosses(
  before: Record<string, number>, after: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(before)) {
    const lost = Math.trunc(n) - Math.max(0, Math.trunc(after[id] ?? 0));
    if (lost > 0) out[id] = lost;
  }
  return out;
}

function warriorsOnly(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(counts)) {
    if (UNITS_BY_ID[id]?.kind !== 'warrior') continue;
    const count = Math.max(0, Math.trunc(n));
    if (count > 0) out[id] = count;
  }
  return out;
}

/**
 * ⭐ KAHRAMAN SONUÇLARI — ölüm ve tecrübe (kullanıcı kararları, 2026-07-29 / 2026-08-01).
 *
 * **Ölüm:** kahraman YALNIZ durumu %0'a inince ölür (olasılık yok). Ölen kahraman silinmez;
 * seviyesi ve yetenekleri korunur, ücretli diriltmeyi bekler (`status = 'dead'`).
 *
 * ⭐ **YOK OLMA KALKTI (kullanıcı, 2026-08-01).** Eskiden ordunun tamamı ölürse kahraman
 * `destroyed` yazılıp **1 saat sonra tamamen siliniyordu** — oyuncunun kalıcı olarak bir
 * varlığı kaybettiği tek yer burasıydı. Artık tek senaryo var: kahraman ölür, `mission_heroes`
 * satırı KALIR ve dönüş görevine biner. Taşıyacak birlik kalmadıysa **kendi hızıyla** yalnız
 * döner (`payload.heroTravelSeconds`, çağıran taraf uygular). Şehre varınca Dirilt açılır;
 * savunanın kendi şehrinde ölen kahraman zaten evdedir, anında diriltilebilir.
 *
 * ⚠️ Bu sadeleşme **`survivingUnits` parametresini gereksiz kıldı** ve yanında bir hatayı da
 * kapattı: kahraman SAĞ kalıp bütün savaşçılar ölürse eski kod dönüş görevi kurmuyordu ve
 * kahraman `city_id = NULL` + yetim `mission_heroes` satırıyla kalıyordu — `mission_heroes_hero`
 * tekil indeksi yüzünden bir daha HİÇ sefere çıkamıyordu.
 *
 * **Tecrübe (kullanıcı kararı, 2026-07-29):** savaş tek bir XP havuzu üretir ve **iki taraf da**
 * ondan öğrenir — kazanan **2/3**, kaybeden **1/3**. Her taraf kendi payını yalnız **sağ çıkan**
 * kahramanları arasında böler; ölen kahraman payını alamaz, kahramanı olmayan (ya da hepsi ölen)
 * tarafın payı ziyan olur — karşı tarafa GEÇMEZ. Taraf içi dağıtım seviyeyle TERS orantılı
 * (`1/(seviye+1)`): tek kahraman payın tamamını alır, iki kahramandan düşük seviyeli daha
 * çoğunu alır — yeni kahraman hızlı yetişsin diye.
 *
 * @returns şehre/dönüşe katılacak kahramanların id'leri (ölüler DAHİL — hepsi dönüyor)
 */
async function settleHeroes(ctx: HandlerContext, o: {
  before: SideState['heroes'];
  after: { level: number; durum: number; alive: boolean }[];
  /** Diriltme süresi ŞEHRİN kendi tapınağına bağlıdır (doküman) — toplam değil. */
  homeTemple: number;
  homeCityId: number | null;
  /** Bu tarafa DÜŞEN tecrübe (havuzun 2/3'ü ya da 1/3'ü) — taraf içinde bölünecek. */
  xpShare: number;
}): Promise<{
  carriedIds: number[];
  died: { id: number; name: string; level: number }[];
  gained: { id: number; name: string; xp: number }[];
}> {
  const carriedIds: number[] = [];
  const died: { id: number; name: string; level: number }[] = [];
  const survivors: SideState['heroes'] = [];

  for (let i = 0; i < o.before.length; i++) {
    const hero = o.before[i]!;
    // Motor kahramanları girdi sırasıyla döndürür; eşleşme indeks üzerinden.
    const alive = o.after[i]?.alive !== false;
    if (alive) {
      survivors.push(hero);
      carriedIds.push(hero.id);
      continue;
    }

    // ── ÖLÜ olarak geri taşınır ──────────────────────────────────────────────
    // Savunanda dönüş yolu yok → doğrudan şehirde ölü. Saldıranda dönüş görevi taşır;
    // `mission_heroes` kaydı KALIR ki dönüşte doğru şehre yerleşsin.
    await ctx.tx.execute(sql`
      UPDATE heroes SET status = 'dead', revive_until = NULL
       WHERE id = ${hero.id}
    `);
    died.push({ id: hero.id, name: hero.name, level: hero.level });
    carriedIds.push(hero.id);
  }

  // ── TECRÜBE: bu tarafın payı, SAĞ kalan kahramanlar arasında seviyeyle TERS orantılı ──
  const gained: { id: number; name: string; xp: number }[] = [];
  if (o.xpShare > 0 && survivors.length > 0) {
    /* Ağırlık = 1/(seviye+1): seviye 0 → 1,00 · seviye 5 → 0,167 · seviye 15 → 0,0625.
     * Tek kahraman varsa payın TAMAMINI alır (ağırlık kendi toplamına eşit). */
    const weights = survivors.map((h) => 1 / (Math.max(0, h.level) + 1));
    const total = weights.reduce((a, b) => a + b, 0);
    /* Yuvarlama artığı SON kahramana yazılır ki dağıtılan toplam payı birebir tutsun —
     * aksi hâlde üç kahramanlı savaşlarda 1-2 XP sessizce kaybolurdu. */
    let left = Math.round(o.xpShare);
    for (let i = 0; i < survivors.length; i++) {
      const hero = survivors[i]!;
      const share = i === survivors.length - 1
        ? left
        : Math.min(left, Math.round(o.xpShare * (weights[i]! / total)));
      left -= share;
      if (share <= 0) continue;
      /**
       * ⭐ SEVİYE **KENDİLİĞİNDEN** YÜKSELİR (kullanıcı kararı, 2026-07-29).
       * XP savaş anında yazılır ve seviye aynı anda güncellenir; ordu daha dönüş yolundayken
       * oyuncu tapınakta yeni seviyeyi görür. Tek savaşta birkaç eşik birden aşılabilir —
       * `heroLevelForXp` hepsini birden verir, oyuncunun düğmeye basması gerekmez.
       * Oyuncuya kalan tek iş, seviye başına gelen 3 puanı dağıtmak.
       */
      const newXp = hero.xp + share;
      await ctx.tx.execute(sql`
        UPDATE heroes SET xp = ${newXp}, level = ${heroLevelForXp(newXp)} WHERE id = ${hero.id}
      `);
      gained.push({ id: hero.id, name: hero.name, xp: share });
    }
  }

  return { carriedIds, died, gained };
}

/**
 * ⭐ YENİ KAHRAMAN ÇIKMASI — yalnız KAZANAN tarafta, `captureChance` ile.
 *
 * İhtimal `(ToplamTapınak×10 − Kahraman×155) × min(1, XP×0,000025)`; XP > 499 kapısı ve
 * en fazla 5 kahraman kuralı motorda. Yeni kahraman **seviye 0, 0 XP, puansız** çıkar ve
 * kazanan tarafın o savaştaki şehrine yerleşir (saldıran kazandıysa çıkış şehri).
 *
 * @returns çıkan kahramanın adı (çıkmadıysa null) — savaş raporuna yazılır
 */
async function maybeCaptureHero(ctx: HandlerContext, o: {
  playerId: number;
  worldId: number;
  cityId: number | null;
  chance: number;
}): Promise<string | null> {
  if (o.cityId == null || o.chance <= 0) return null;
  /* Determinizm (§5): rulo görevin kimliğinden türer → savaş yeniden oynatılınca aynı sonuç. */
  const rng = createRng(`capture:${ctx.mission.id}:${o.playerId}`);
  if (rng.next() * 100 >= o.chance) return null;

  const [existing] = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT COUNT(*)::int AS n FROM heroes
     WHERE player_id = ${o.playerId} AND status <> 'destroyed'
  `);
  if (Number(existing?.['n'] ?? 0) >= DEFAULT_COMBAT_CONFIG.capture.maxHeroes) return null;

  const takenRows = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT name FROM heroes WHERE player_id = ${o.playerId} AND status <> 'destroyed'
  `);
  const taken = takenRows.map((r: Record<string, unknown>) => String(r['name']));
  const name = pickHeroName(() => rng.next(), taken);
  await ctx.tx.execute(sql`
    INSERT INTO heroes (world_id, player_id, city_id, name, level, xp, status)
    VALUES (${o.worldId}, ${o.playerId}, ${o.cityId}, ${name}, 0, 0, 'alive')
  `);
  return name;
}

async function writeBattle(ctx: HandlerContext, o: {
  missionId: number;
  attackerPlayerId: number;
  defenderPlayerId: number;
  attackerCityId: number;
  defenderCityId: number;
  night: boolean;
  input: SimulateInput;
  result: SimulateResult;
  loot: LootResult;
}): Promise<number> {
  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    INSERT INTO battles (world_id, mission_id, attacker_player_id, defender_player_id,
                         attacker_city_id, defender_city_id, at, winner, night,
                         rng_seed, engine_version, catalog_hash, settings_revision_id,
                         input, result)
    VALUES (${ctx.worldId}, ${o.missionId}, ${o.attackerPlayerId}, ${o.defenderPlayerId},
            ${o.attackerCityId}, ${o.defenderCityId}, ${ctx.at.toISOString()}::timestamptz,
            ${o.result.winner}, ${o.night},
            ${o.result.seed}, ${o.result.engineVersion}, ${o.result.catalogHash},
            ${ctx.engine?.settingsRevisionId ?? null},
            ${JSON.stringify(o.input)}::jsonb,
            ${JSON.stringify({ ...o.result, loot: o.loot })}::jsonb)
    RETURNING id
  `);
  return Number(rows[0]!['id']);
}

/**
 * Dönüş görevi + taşınan birlikler + ganimet. Kahramanlar aynı satırla yeni göreve taşınır.
 *
 * ⭐ `heroOnly` = ordudan kimse kalmadı, yalnız kahraman dönüyor. O zaman süre **kahramanın
 * kendi hızıyla** kalkışta hesaplanan `payload.heroTravelSeconds` olur — ordu hızıyla değil
 * (ölen ordu artık yavaşlatmıyor). Yolda olan ESKİ görevlerde bu alan yok; `travelSeconds`e
 * düşüyoruz, yani en kötü ihtimalde eski davranış.
 */
async function scheduleReturn(ctx: HandlerContext, o: {
  originCityId: number;
  battleId: number | null;
  units: Record<string, number>;
  loot: LootResult | null;
  heroOnly?: boolean;
}): Promise<number> {
  const armyTravel = Number(ctx.mission.payload['travelSeconds'] ?? 0);
  const travel = o.heroOnly
    ? Number(ctx.mission.payload['heroTravelSeconds'] ?? armyTravel)
    : armyTravel;
  const executeAt = new Date(ctx.at.getTime() + Math.max(1, travel) * 1000);
  const taken = o.loot?.taken ?? { gold: 0, food: 0 };

  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                          execute_at, payload, idempotency_key)
    VALUES (${ctx.worldId}, 'return', 'scheduled', ${ctx.mission.ownerPlayerId},
            ${ctx.mission.targetCityId}, ${o.originCityId},
            ${executeAt.toISOString()}::timestamptz,
            ${JSON.stringify({
              battleId: o.battleId,
              loot: taken,
              travelSeconds: travel,
              fromMissionId: ctx.mission.id,
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

async function writeBattleReports(ctx: HandlerContext, o: {
  battleId: number;
  attackerPlayerId: number;
  defenderPlayerId: number;
  targetCityId: number;
  originCityId: number;
  result: SimulateResult;
  loot: LootResult;
  night: boolean;
  returning: boolean;
  cave: CaveBreakResult;
  /** Bekleyen mağara emrinin savaştan sonraki hâli (yalnız savunanı ilgilendirir). */
  caveOrder: CaveStoreReconcile | null;
  /** ⭐ Bu savaşta ÖLEN kahramanlar — rapora özel not (hepsi eve döner ve diriltilebilir). */
  diedHeroes?: { id: number; name: string; level: number }[];
  /** ⭐ Savaştan çıkan yeni kahramanın adı (çıkmadıysa null). */
  capturedHero?: string | null;
  /** ⭐ Hangi kahramanın ne kadar tecrübe aldığı — iki taraf için ayrı. */
  heroXp?: {
    attacker: { id: number; name: string; xp: number }[];
    defender: { id: number; name: string; xp: number }[];
  };
  /** ⭐ Sur TAMAMEN yıkıldı mı (bütünlük %0)? */
  wallDestroyed?: boolean;
  /** Sur yıkıldığı için iptal edilen savunma üretimi + iadesi — YALNIZ savunan görür. */
  wallProduction?: {
    canceled: { type: string; left: number }[];
    refunded: { gold: number; food: number };
  };
}): Promise<void> {
  const won = o.result.winner === 'attacker';

  /**
   * ⭐ RAPOR BAŞLIĞINDA RAKİBİN ADI (kullanıcı, 2026-08-08).
   *
   * ⚠️ Bilgi zaten raporun İÇİNDEydi (`coords.origin.owner` / `coords.target.owner`,
   * 2026-08-07). Eksik olan posta LİSTESİydi: orada yalnız başlık görünüyor ve
   * *"Saldırın püskürtüldü"* satırı kime karşı olduğunu söylemiyordu — oyuncu üst üste
   * saldırdığında raporları birbirinden ayıramıyordu.
   *
   * ⚠️ Tek sorgu, iki oyuncu. Savaş seyrek bir olay; `report-route.ts`teki aynı gerekçe.
   */
  const nameRows = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT id, username FROM players WHERE id IN (${o.attackerPlayerId}, ${o.defenderPlayerId})
  `);
  const playerName = (pid: number): string =>
    String(nameRows.find((r: Record<string, unknown>) => Number(r['id']) === pid)?.['username'] ?? '—');
  const attackerName = playerName(o.attackerPlayerId);
  const defenderName = playerName(o.defenderPlayerId);

  const base = {
    battleId: o.battleId,
    winner: o.result.winner,
    turns: o.result.turns,
    night: o.night,
    at: ctx.at.toISOString(),
    /**
     * ⭐ KAHRAMAN NOTLARI — iki taraf da görür (kimin kahramanının düştüğü herkesi ilgilendirir).
     * `died`: bu savaşta ölen kahramanlar. Hepsi eve döner ve Tapınak'ta diriltilebilir
     * (2026-08-01'den beri yok olma yok); raporda etiketleri «Yok Edildi».
     * `capturedHero`: savaştan çıkan yeni kahramanın adı.
     */
    heroes: {
      died: o.diedHeroes ?? [],
      captured: o.capturedHero ?? null,
      /** Savaşın ürettiği TOPLAM tecrübe havuzu — kazanan 2/3'ünü, kaybeden 1/3'ünü alır. */
      xp: o.result.xp,
      /** Havuzdan fiilen kimin ne kazandığı (ölen kahraman listede olmaz). */
      gained: o.heroXp ?? { attacker: [], defender: [] },
    },
    /**
     * ⭐ SUR — tam yıkım iki tarafa da görünür (saldıran için savaşın en somut kazanımı).
     * İptal edilen üretim + iade ise YALNIZ savunanın gövdesinde (`wallProduction`, aşağıda):
     * rakibin ne üretmekte olduğu casusluk gerektiren bir bilgidir (kullanıcı kararı 2026-07-30).
     */
    wall: { destroyed: o.wallDestroyed ?? false },
  };

  await writeMessage(ctx, {
    playerId: o.attackerPlayerId,
    kind: 'battle_report',
    side: 'attacker',
    battleId: o.battleId,
    subject: `${won ? 'Saldırın başarılı' : 'Saldırın püskürtüldü'} · ${defenderName}`,
    body: {
      ...base,
      /** Rakibin adı gövdede de dursun — ekran başlığı ayrıştırmak zorunda kalmasın. */
      opponent: defenderName,
      targetCityId: o.targetCityId,
      lost: o.result.attacker.lost,
      survivors: o.result.attacker.counts,
      loot: o.loot.taken,
      lootBreakdown: o.loot,
      armyReturning: o.returning,
      /**
       * ⭐ Saldırana yalnız SONUÇ söylenir, mağaranın içi DEĞİL. Kaç asker kaçtığını görmek
       * casusluğun bile veremediği bir bilgiyi bedava vermek olurdu (doküman: *"casus kuşları
       * mağaradaki askerleri göremezler"*). Kaç cüce gerektiği söyleniyor ki oyuncu bir dahaki
       * sefere kaç cüceyle geleceğini bilsin.
       */
      cave: { present: o.cave.present, broken: o.cave.broken, required: o.cave.required,
        survivingDwarves: o.cave.survivingDwarves, reason: o.cave.reason },
    },
  });

  await writeMessage(ctx, {
    playerId: o.defenderPlayerId,
    kind: 'battle_report',
    side: 'defender',
    battleId: o.battleId,
    subject: `${won ? 'Şehrin yağmalandı' : 'Saldırıyı püskürttün'} · ${attackerName}`,
    body: {
      ...base,
      opponent: attackerName,
      cityId: o.targetCityId,
      lost: o.result.defender.lost,
      survivors: o.result.defender.counts,
      // ⭐ Savunma tabanı raporda ayrıca gösterilir (§13.11.10): "okçu kulesi 4 … korundu".
      defenseFloorRestored: o.result.defender.floorRestored,
      wallIntegrity: o.result.defender.wallIntegrity,
      /** ⭐ Sur yıkılınca iptal edilen üretim + "1 ünite eksik" iadesi — yalnız savunan görür. */
      wallProduction: o.wallProduction ?? { canceled: [], refunded: { gold: 0, food: 0 } },
      lost_resources: o.loot.fromPlunder,
      debrisRecovered: o.loot.leftoverDebrisToDefender,
      // Savunan KENDİ mağarasının tam dökümünü görür: kimin kaçtığı, onarımın ne zaman biteceği.
      cave: o.cave,
      // Bekleyen doldurma emri savaştan etkilendiyse raporda da görünür.
      caveOrder: o.caveOrder,
    },
  });

  // Bildirim (push/WS) outbox üzerinden — savaşla AYNI transaction'da (§1).
  /**
   * ⭐ `route` 2026-08-07'de eklendi (kullanıcı): saldıranın bildirimi HANGİ şehre vurduğunu,
   * savunanınki saldırının NEREDEN geldiğini yazıyor. Öncesinde iki taraf da yalnız
   * "Rapor mesaj kutunda." görüyordu.
   *
   * ⚠️ Savaş yolunda `loadCityOwner` yalnız `player_id` okuyor — ad ve koordinat bu akışta
   * hiçbir yerde yüklü değil. `routeOf` ise `writeMessage`in içinde zaten çalışıyor;
   * burada ikinci kez çağrılıyor (görev başına tek satırlık sorgu, `report-route.ts`
   * dosya başındaki maliyet notuyla aynı gerekçe).
   */
  await ctx.emit('battle:resolved', {
    battleId: o.battleId,
    attackerPlayerId: o.attackerPlayerId,
    defenderPlayerId: o.defenderPlayerId,
    winner: o.result.winner,
    cityId: o.targetCityId,
    route: (await routeOf(ctx)) ?? null,
    at: ctx.at.toISOString(),
  });
}

async function writeMessage(ctx: HandlerContext, o: {
  playerId: number;
  kind: string;
  side: string;
  battleId: number | null;
  subject: string;
  body: Record<string, unknown>;
}): Promise<void> {
  // ⭐ Güzergâh her raporda — bkz. `mission.handlers.ts` içindeki ikizi ve `report-route.ts`.
  const route = await routeOf(ctx);
  const body = route ? { ...o.body, route } : o.body;

  await ctx.tx.execute(sql`
    INSERT INTO messages (world_id, player_id, kind, side, battle_id, mission_id, subject, body, at)
    VALUES (${ctx.worldId}, ${o.playerId}, ${o.kind}, ${o.side}, ${o.battleId}, ${ctx.mission.id},
            ${o.subject}, ${JSON.stringify(body)}::jsonb, ${ctx.at.toISOString()}::timestamptz)
  `);
  // Mesaj yazımı ve haberi aynı yerde — bkz. `mission.handlers.ts` içindeki ikizi.
  // ⚠️ `side`/`route` burada METİN ÜRETMİYOR (katalog `battle_report`u atlıyor; savaşın
  //    bildirimi `battle:resolved`tan geliyor) ama iki `writeMessage` birbirinin AYNASI
  //    kalmalı: ayrışırlarsa yeni bir rapor tipi hangi ikize eklendiğine göre farklı
  //    davranır ve fark ancak canlıda görülür.
  await ctx.emit('message:written', {
    playerId: o.playerId, kind: o.kind, side: o.side, route: route ?? null,
  });
}

function readLootPayload(payload: Record<string, unknown>): { gold: number; food: number } {
  const loot = payload['loot'];
  if (!loot || typeof loot !== 'object') return { gold: 0, food: 0 };
  const l = loot as Record<string, unknown>;
  return { gold: Math.max(0, Number(l['gold'] ?? 0)), food: Math.max(0, Number(l['food'] ?? 0)) };
}

/** Worker'a kaydedilecek tipler. */
export function battleHandlers(cities: CityService): Record<string, MissionHandler> {
  return {
    attack: createAttackHandler(cities),
    return: createReturnHandler(cities),
  };
}
