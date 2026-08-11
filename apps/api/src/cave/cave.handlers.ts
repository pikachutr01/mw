/**
 * ⭐ MAĞARA GÖREVLERİ (§13.20)
 *
 * Üç tip, üçü de aynı çatıda (§1) ve `ctx.at` "şimdi"dir:
 *   `cave_store`    → süre doldu, işaretli askerler mağaraya **anlık** girer
 *   `cave_withdraw` → süre doldu, işaretli askerler mağaradan **anlık** iner
 *   `cave_return`   → mağara yıkıldı, içeridekiler şehre kaçıyor (tek görünen hareket)
 *
 * ⚠️ İlk ikisi Ordular ekranında **GÖRÜNMEZ** (§13.20.5): ortada hareket eden ordu yok, yalnız
 * şehrin içinde işleyen bir sayaç var. Yalnız `cave_return` bir "gelen destek" olarak görünür.
 */
import { sql } from 'drizzle-orm';
import { caveArea, caveTransferSeconds } from '@mobilwar/catalog';
import type { HandlerContext, MissionHandler, Tx } from '../missions/handler-registry.ts';
import { routeOf } from '../missions/report-route.ts';
import {
  addCaveUnits, addCityUnits, drainCave, heroIdArray, moveHeroesToCave, moveHeroesToCity,
  payloadHeroIds, readCaveHeroes, takeUnits,
} from './cave.service.ts';

/** Görevin taşıdığı birlikler. */
async function loadUnits(tx: Tx, missionId: number): Promise<Record<string, number>> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT unit_type, count FROM mission_units WHERE mission_id = ${missionId}
  `);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r['unit_type'])] = Number(r['count']);
  return out;
}

/**
 * Görevin taşıdığı kahramanlar. ⚠️ `mission_heroes`'ta DEĞİL `payload.heroIds`te dururlar —
 * gerekçesi `cave.service.ts` `schedule()` yorumunda.
 */
async function loadHeroIds(tx: Tx, missionId: number): Promise<number[]> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT payload FROM missions WHERE id = ${missionId}
  `);
  return payloadHeroIds(rows[0]?.['payload']);
}

/**
 * Süre doldu → askerler mağaraya girer.
 *
 * ⭐ Adet **burada yeniden ölçülür**: süre boyunca askerler şehirdeydi ve savaşta ölmüş
 * olabilirler. `takeUnits` var olandan fazlasını almaz — clamp olmadan ölmüş asker mağarada
 * yeniden doğardı.
 */
const storeHandler: MissionHandler = async (ctx) => {
  const cityId = ctx.mission.targetCityId;
  if (cityId == null) throw new Error('cave_store: hedef şehir yok');
  await ctx.lockCity(cityId);

  const ordered = await loadUnits(ctx.tx, ctx.mission.id);
  const moved = await takeUnits(ctx.tx, 'units', cityId, ordered);
  await addCaveUnits(ctx.tx, cityId, moved);

  /**
   * ⭐ Kahraman da aynı clamp'ten geçer: yalnız **hâlâ canlı ve bu şehirde** olan girer.
   * Kullanıcı kuralı (2026-08-11): *"Kahraman da savaş sonunda ölmezse mağaraya girer."*
   */
  const orderedHeroes = await loadHeroIds(ctx.tx, ctx.mission.id);
  const movedHeroes = await moveHeroesToCave(ctx.tx, cityId, orderedHeroes);

  await ctx.emit('city:changed', {
    cityId, playerId: ctx.mission.ownerPlayerId, reason: 'cave_store',
  });
  await ctx.audit({
    action: 'cave.stored', entity: 'city', entityId: cityId,
    playerId: ctx.mission.ownerPlayerId,
    after: { ordered, moved, orderedHeroes, movedHeroes },
  });
};

/** Süre doldu → askerler mağaradan şehre iner. */
const withdrawHandler: MissionHandler = async (ctx) => {
  const cityId = ctx.mission.targetCityId;
  if (cityId == null) throw new Error('cave_withdraw: hedef şehir yok');
  await ctx.lockCity(cityId);

  const ordered = await loadUnits(ctx.tx, ctx.mission.id);
  const moved = await takeUnits(ctx.tx, 'cave_units', cityId, ordered);
  await addCityUnits(ctx.tx, cityId, moved);

  const orderedHeroes = await loadHeroIds(ctx.tx, ctx.mission.id);
  const movedHeroes = await moveHeroesToCity(ctx.tx, cityId, orderedHeroes);

  await ctx.emit('city:changed', {
    cityId, playerId: ctx.mission.ownerPlayerId, reason: 'cave_withdraw',
  });
  await ctx.audit({
    action: 'cave.withdrawn', entity: 'city', entityId: cityId,
    playerId: ctx.mission.ownerPlayerId,
    after: { ordered, moved, orderedHeroes, movedHeroes },
  });
};

/** Yıkılan mağaradan kaçan birlikler şehre vardı. */
const returnHandler: MissionHandler = async (ctx) => {
  const cityId = ctx.mission.targetCityId;
  if (cityId == null) throw new Error('cave_return: hedef şehir yok');
  await ctx.lockCity(cityId);

  const units = await loadUnits(ctx.tx, ctx.mission.id);
  await addCityUnits(ctx.tx, cityId, units);

  /**
   * ⭐ Kaçan kahraman **yol boyunca `in_cave` kaldı** — bu bir hile değil, tam da istenen:
   * o durum "savaşa katılmaz, casus göremez" demek ve doküman kaçış için de aynısını söylüyor
   * (*"mağaralar yıkıldıktan sonra ordu savaşa yine katılmaz ve şehre kaçar"*). Şehre varınca
   * yeniden `alive` olur.
   */
  await moveHeroesToCity(ctx.tx, cityId, await loadHeroIds(ctx.tx, ctx.mission.id));

  await ctx.emit('city:changed', {
    cityId, playerId: ctx.mission.ownerPlayerId, reason: 'cave_collapsed_return',
  });
  /**
   * ⭐ BİLDİRİM (kullanıcı 2026-08-07): buraya kadar dönüş yalnız ekranı tazeliyordu, ordu
   * sessizce garnizona ekleniyordu. Kendi ordunun NORMAL dönüşünde bildirim yok — oyuncu onu
   * zaten bekliyor — ama bu seferi oyuncu başlatmadı, mağarasını yıkan saldırı başlattı.
   *
   * ⚠️ `city:changed` bildirim üretmiyor (yüksek hacimli, `notify.catalog.ts` varsayılan
   * dalı); haber ayrı bir konu üzerinden gidiyor. `routeOf` burada kaynak = hedef = aynı
   * şehir olduğu için tek satır okur.
   */
  const route = await routeOf(ctx);
  await ctx.emit('cave:returned', {
    playerId: ctx.mission.ownerPlayerId, cityId, city: route?.target ?? null,
  });
  await ctx.audit({
    action: 'cave.returned', entity: 'city', entityId: cityId,
    playerId: ctx.mission.ownerPlayerId, after: { units },
  });
};

/* ═══ Savaşın mağaraya dokunduğu iki yer ════════════════════════════════════ */

/**
 * ⭐ MAĞARA YIKILDI — içeridekiler şehre kaçar, süren emir iptal edilir.
 *
 * Doküman: *"Mağaralar yıkıldıktan sonra ordu savaşa yine katılmaz ve şehre kaçar. Bu nedenle
 * mağara yıkılsa bile ordunuzun şehre dönmesi mağara boşaltma süresi kadar olur."*
 *
 * Yeni modelde bu **tek bir hesaba** indi (kullanıcı kararı 2026-07-28):
 *  • Süren **doldurma** emri iptal edilir ve BAŞKA HİÇBİR ŞEY yapılmaz — askerler zaten
 *    şehirdeydi, savaşa da katıldılar.
 *  • Süren **boşaltma** emri iptal edilir; o askerler hâlâ mağaranın içindedir, dolayısıyla
 *    aşağıdaki kaçışa **doğal olarak dahil** olurlar. Kalan süre hesabı YOK.
 *  • Mağaranın tamamı boşaltılır ve **sıfırdan** `caveTransferSeconds(toplamAlan, seviye)`
 *    kadar sonra şehre varacak TEK bir kaçış görevi yazılır.
 *
 * @returns kaçan birlikler (rapor için)
 */
export async function scheduleCaveEscape(ctx: HandlerContext, o: {
  cityId: number;
  playerId: number | null;
  caveLevel: number;
}): Promise<Record<string, number>> {
  // Süren emirler iptal: `cave_store` yaşasaydı sonradan çalışıp askerleri yıkılmış mağaraya koyardı.
  await ctx.tx.execute(sql`
    UPDATE missions SET status = 'canceled', finished_at = now()
     WHERE target_city_id = ${o.cityId}
       AND type IN ('cave_store', 'cave_withdraw')
       AND status IN ('scheduled', 'running')
  `);

  const inside = await drainCave(ctx.tx, o.cityId);
  /**
   * ⚠️ Kahramanlar `drainCave`e girmez (ayrı tablo değil, `heroes.status`). Kaçış görevine
   * kimliklerini yazıp durumlarını **`in_cave` bırakıyoruz** — varışta `cave_return` indiriyor.
   * ⚠️ Alan hesabına da katılmaları şart: mağarada YALNIZ kahraman varsa `unitsArea` 0 döner ve
   * aşağıdaki `area <= 0` dalı kaçış görevini hiç yazmazdı — kahraman yıkık mağarada asılı
   * kalırdı.
   */
  const insideHeroes = (await readCaveHeroes(ctx.tx, o.cityId)).map((h) => h.id);
  const area = caveArea(inside, insideHeroes.length);
  if (area <= 0) return {};

  /**
   * ⭐ Kaçış dönüşü SEFER sayılır (kullanıcı kararı 2026-07-30): dünya sefer hızı çarpanı
   * uygulanır. Normal doldur/boşalt şehir içi iştir, çarpansız kalır.
   */
  const mult = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT speed_multiplier FROM worlds WHERE id = ${ctx.worldId}
  `);
  const speedMultiplier = Math.max(1, Number(mult[0]?.['speed_multiplier'] ?? 1));
  const seconds = Math.max(1, Math.ceil(caveTransferSeconds(area, o.caveLevel) / speedMultiplier));
  const executeAt = new Date(ctx.at.getTime() + Math.max(1, seconds) * 1000);
  const rows = await ctx.tx.execute<Record<string, unknown>>(sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                          execute_at, payload, idempotency_key)
    VALUES (${ctx.worldId}, 'cave_return', 'scheduled', ${o.playerId}, ${o.cityId}, ${o.cityId},
            ${executeAt.toISOString()}::timestamptz,
            ${JSON.stringify({ seconds, area, heroIds: insideHeroes })}::jsonb,
            ${`cave_return:${ctx.mission.id}`})
    RETURNING id
  `);
  const missionId = Number(rows[0]!['id']);
  for (const [type, count] of Object.entries(inside)) {
    if (!(count > 0)) continue;
    await ctx.tx.execute(sql`
      INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${missionId}, ${type}, ${count})
    `);
  }
  return inside;
}

export interface CaveStoreReconcile {
  /** Savaştan önce mağaraya girmek üzere işaretli olan adetler. */
  ordered: Record<string, number>;
  /** Savaştan sonra gerçekten girebilecek adetler. */
  remaining: Record<string, number>;
  /** Savaştan önce işaretli kahramanlar. */
  orderedHeroes: number[];
  /** Savaştan sağ çıkıp mağaraya girebilecek kahramanlar. */
  remainingHeroes: number[];
  /** Emirde kimse kalmadı → iptal edildi. */
  canceled: boolean;
}

/**
 * ⭐ SAVAŞ SONRASI: bekleyen doldurma emrini hayatta kalanlarla uzlaştırır (kullanıcı kuralı).
 *
 * Yeni modelde mağaraya girmeyi bekleyen askerler savaşa **katılıyor**, yani ölebiliyorlar.
 * Kullanıcının örneği: 30 Cüce + 20 Elf emredilmişken savaşta 15 Cüce ve 16 Elf ölürse,
 * kalan 15 Cüce ve 4 Elf işlemi tamamlar.
 *
 * İki sonuç:
 *  • **Bir kısmı öldü** → emir küçültülür ve süresi AYNEN devam eder. Süreyi yeniden hesaplamak
 *    "az asker kaldı, daha çabuk girsinler" demek olurdu; oysa sayaç saldırıdan önce başlamıştı.
 *  • **Hepsi öldü** → emir iptal edilir ve oyuncuya savaş raporundan AYRI bir mesaj gider
 *    (kullanıcı isteği): rapor "savaşta ne oldu"yu, bu mesaj "planın ne oldu"yu anlatır.
 *
 * ⚠️ Bu uzlaştırma olmasa bile `cave_store` handler'ındaki clamp orduyu çoğaltmaz; buradaki
 * asıl kazanım oyuncunun **ekranda doğru adedi görmesi** ve iptalin haber verilmesi.
 */
export async function reconcileCaveStore(
  ctx: HandlerContext, cityId: number,
): Promise<CaveStoreReconcile | null> {
  const jobs = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT id FROM missions
     WHERE target_city_id = ${cityId} AND type = 'cave_store' AND status = 'scheduled'
     FOR UPDATE
  `);
  const job = jobs[0];
  if (!job) return null;

  const missionId = Number(job['id']);
  const ordered = await loadUnits(ctx.tx, missionId);
  const orderedHeroes = await loadHeroIds(ctx.tx, missionId);

  // Savaştan SONRAKİ şehir mevcudu — `applySurvivors` çoktan yazdı.
  const alive = await ctx.tx.execute<Record<string, unknown>>(sql`
    SELECT type, count FROM units WHERE city_id = ${cityId}
  `);
  const have: Record<string, number> = {};
  for (const r of alive) have[String(r['type'])] = Number(r['count']);

  const remaining: Record<string, number> = {};
  for (const [type, n] of Object.entries(ordered)) {
    const left = Math.min(n, have[type] ?? 0);
    if (left > 0) remaining[type] = left;
  }

  /**
   * ⭐ Kahraman "sağ mı" ölçümü askerinkiyle aynı ilkeden: savaştan sonra hâlâ `alive` ve bu
   * şehirdeyse emirde kalır. `settleHeroes` ölenleri çoktan `dead` yaptı.
   */
  const remainingHeroes = orderedHeroes.length === 0 ? [] : (
    await ctx.tx.execute<Record<string, unknown>>(sql`
      SELECT id FROM heroes
       WHERE id = ANY(${heroIdArray(orderedHeroes)})
         AND city_id = ${cityId} AND status = 'alive'
    `)
  ).map((r: Record<string, unknown>) => Number(r['id']));

  /**
   * ⚠️ İptal şartı **ikisine birden** bakar. Yalnız askerlere baksaydı, tek kahramanı sağ kalan
   * bir emir "kimse kalmadı" diye iptal edilir ve kahraman mağaraya hiç giremezdi.
   */
  if (Object.keys(remaining).length === 0 && remainingHeroes.length === 0) {
    await ctx.tx.execute(sql`
      UPDATE missions SET status = 'canceled', finished_at = now() WHERE id = ${missionId}
    `);
    return { ordered, remaining, orderedHeroes, remainingHeroes, canceled: true };
  }

  if (remainingHeroes.length !== orderedHeroes.length) {
    await ctx.tx.execute(sql`
      UPDATE missions
         SET payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{heroIds}',
                                 ${JSON.stringify(remainingHeroes)}::jsonb)
       WHERE id = ${missionId}
    `);
  }

  // Emri küçült: silinen tür satırları da temizlenir.
  for (const type of Object.keys(ordered)) {
    const left = remaining[type] ?? 0;
    if (left > 0) {
      await ctx.tx.execute(sql`
        UPDATE mission_units SET count = ${left}
         WHERE mission_id = ${missionId} AND unit_type = ${type}
      `);
    } else {
      await ctx.tx.execute(sql`
        DELETE FROM mission_units WHERE mission_id = ${missionId} AND unit_type = ${type}
      `);
    }
  }
  return { ordered, remaining, orderedHeroes, remainingHeroes, canceled: false };
}

/** Worker'a kaydedilecek tipler. */
export const CAVE_HANDLERS: Record<string, MissionHandler> = {
  cave_store: storeHandler,
  cave_withdraw: withdrawHandler,
  cave_return: returnHandler,
};
