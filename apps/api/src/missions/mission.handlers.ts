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
import { hasCargo, readResources, type Cargo } from './cargo.ts';
import { routeOf } from './report-route.ts';
import {
  BUILDINGS_BY_ID, clampName, colonyName, maxCities, spyEffectiveDiff, spyLosses, spyLevelFor,
  UNITS_BY_ID, type SpyLevel,
} from '@mobilwar/catalog';
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
    /**
     * Kahramanlar hedef şehrin tapınağına yerleşir.
     * ⚠️ Adları **taşınmadan ÖNCE** okunuyor: `mission_heroes` hemen ardından siliniyor ve
     * rapor gövdesi ondan sonra yazılıyor. Kullanıcı 2026-08-03'te tam bu eksiği bildirdi —
     * *"destek raporunda Birlikler altında sadece 9 casus kuş yazıyor, kahramana dair bilgi yok"*.
     */
    const heroNames = await loadMissionHeroNames(ctx.tx, ctx.mission.id);

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
      body: { cityId: targetCityId, units, cargo, heroes: heroNames, at: ctx.at.toISOString() },
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
 * ⭐⭐ CASUSLUK — TEK AŞAMA (kullanıcı tasarımı, 2026-08-09 SADELEŞTİRMESİ).
 *
 * ⚠️ **Eski «kesişim» modeli (2026-07-30 – 08-09) KALDIRILDI.** Orada iki hesap vardı: bir
 * ENGEL duvarı (rakip kuş sayısı × `2^fark`, doğrusal aşılması gereken) ve ayrıca bilgi
 * kademesi (`log2(kuş)`, logaritmik). Duvar aşılmadan kademe hiç kullanılmıyordu ve oyuncu
 * ikisini ayırt edemiyordu — `docs/CASUSLUK_SISTEMI.md`deki vakada bir oyuncu 8 denemede
 * 7.339 kuşu, duvarın %5,7'sinde kaldığını hiç öğrenemeden harcadı. Kullanıcı: *"Duvarı aşma
 * algoritması olmasın… daha çok tek aşamada işi bitirelim."*
 *
 * Bugünkü akış üç satır:
 *   1. `spyEffectiveDiff` → **kademe** (doküman-birebir; `log2(kuş)` bonusu artık tavanlı).
 *   2. `spyLosses`        → **kaç kuş öldü**. Bilgiyi ENGELLEMEZ, yalnız vergilendirir.
 *   3. Sağ dönen ≥ 1 ise bilgi gelir.
 *
 * ⚠️ **Savunma artık bilgiyi engellemiyor** ve bu bilinçli: kullanıcı *"yeterli kuş gönderilip
 * casusluk seviyesi farkı kapatılırsa gerekli bilgiler alınır"* dedi. Savunmanın karşılığı üç
 * yerde duruyor: kuş kaybı · alçak seviyeli casusun zaten düşük kalan kademesi · kuşlar
 * yoldayken savunanın aldığı `city:incoming_spy` ön uyarısı.
 *
 * **Raporlama (kullanıcı kararı):** iki rapor da casusluğun ÇÖZÜLDÜĞÜ anda yazılır — kuşların
 * eve dönüşü beklenmez. Savunan HER casuslukta "Casusluk Önleme Raporu" alır: kaç kuş geldi,
 * kaçı vuruldu, hangi bilgi sızdı. Gönderen de aynı anda kendi raporunu alır.
 *
 * ⚠️ **Tüm kuşlar ölürse dönüş görevi** oluşmaz — ordu yok olmuştur (saldırıdaki "tam kayıpta
 * dönüş yok" kuralının ikizi). Pratikte nadir: `spy.lossMax < 1` olduğu için yeterince büyük
 * bir akından daima bir kısmı döner (`config.ts` → `SpyConfig.lossMax` gerekçesi).
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

    /**
     * ── Kayıp: savunmanın anti-hava ağırlığı × casusluk farkı ─────────────────
     *
     * ⚠️ Bu hesap bilgiyi **ENGELLEMEZ**, yalnız kuş öldürür (2026-08-09 sadeleştirmesi).
     * Tek geçit şartı `survivors >= 1`; kademe zaten yukarıdaki `diff`ten çıktı.
     */
    const defense = await ctx.tx.execute<Record<string, unknown>>(sql`
      SELECT
        (SELECT COALESCE(count,0) FROM units    WHERE city_id = ${targetCityId} AND type = 'elf')          AS elf,
        (SELECT COALESCE(count,0) FROM units    WHERE city_id = ${targetCityId} AND type = 'spy_bird')     AS birds,
        (SELECT COALESCE(count,0) FROM defenses WHERE city_id = ${targetCityId} AND type = 'archer_tower') AS tower
    `);
    const hit = spyLosses({
      birds,
      effectiveDiff: diff,
      towers: Number(defense[0]?.['tower'] ?? 0),
      elves: Number(defense[0]?.['elf'] ?? 0),
      defenderBirds: Number(defense[0]?.['birds'] ?? 0),
    });
    const gotIntel = hit.survivors >= 1;

    // ── Gönderenin raporu — çözüm ANINDA (kuşlar daha yolda) ──────────────────
    const intel = gotIntel ? await gatherIntel(ctx.tx, targetCityId!, target.playerId, level) : null;
    await writeMessage(ctx, {
      playerId: spyPlayerId, kind: 'spy_report', side: 'spy',
      /**
       * ⭐ BAŞLIKTA RAKİBİN ADI (kullanıcı, 2026-08-08). Gövdede `route.target.owner` zaten
       * vardı (`report-route.ts`) ama posta LİSTESİNDE yalnız başlık görünüyor — oyuncunun
       * "bu rapor kiminle ilgili" sorusunu raporu açmadan cevaplaması gerekiyor.
       * ⚠️ Şehir adı KALDIRILMADI, kullanıcı adı ONA EKLENDİ: şehir adı oyuncunun kendi
       * kullandığı işaret (aynı oyuncunun beş şehri olabilir), kullanıcı adı ise kimliği.
       */
      /**
       * ⚠️ «Casusluk engellendi» başlığı KALKTI: engelleme diye bir sonuç artık yok. Bilgi
       * gelmemesinin tek sebebi kalabilir — kuşların tamamının vurulmuş olması.
       */
      subject: gotIntel
        ? `Casusluk raporu · ${target.name} (${target.username})`
        : `Casus kuşların vuruldu · ${target.username}`,
      /**
       * ⛔ `diff` GÖVDEDEN ÇIKTI (kullanıcı, 2026-08-09). Oyuncu kendi casusluk seviyesini ve
       * gönderdiği kuş sayısını bildiği için `diff = benim + log2(kuş) − rakip` denkleminden
       * **rakibin seviyesini birebir çözebiliyordu** — kullanıcı tam bu sızıntı yüzünden
       * "bir üst kademe için N kuş" ipucunu da reddetti. Ekranda hiç yazmıyordu ama gövde
       * JSON'unda duruyordu. Denge çalışmaları için `mission.spy.resolved` denetim kaydında
       * duruyor; orayı yalnız yönetici görüyor.
       */
      body: {
        targetCityId, targetCityName: target.name, targetPlayer: target.username,
        birdsSent: birds, birdsLost: hit.killed, birdsReturned: hit.survivors,
        level: gotIntel ? level : null,
        intel, at: ctx.at.toISOString(),
      },
    });

    /* ── ⭐ CASUSLUK ÖNLEME RAPORU — savunan HER casuslukta alır (kullanıcı, 2026-07-30).
     * Eski kural yalnız kuş vurulduysa haber veriyordu; artık sessiz casusluk YOK: kaç kuş
     * geldi, kaçı vuruldu ve hangi bilginin sızdığı savunana da yazılır. */
    /**
     * ⭐ Casusluk yapanın adı — ÖNLEME raporunda bugüne kadar hiç yoktu (kullanıcı, 2026-08-08).
     *
     * ⚠️ Bilgi zaten sızıyordu: `routeOf` her rapor gövdesine `route.origin.owner`ı yazıyor,
     * yani savunan raporu AÇINCA kimin casusluk yaptığını görebiliyordu. Eksik olan yalnız
     * posta listesindeki başlıktı — "kim" sorusu raporu açmadan cevaplanamıyordu. Yani bu
     * ek bir istihbarat sızıntısı DEĞİL, var olanın görünür hâle gelmesi.
     */
    const spyName = await usernameOf(ctx.tx, spyPlayerId);

    await writeMessage(ctx, {
      playerId: target.playerId, kind: 'spy_report', side: 'target',
      subject: `Casusluk Önleme Raporu · ${spyName}`,
      body: {
        cityId: targetCityId,
        /** Casusluğu yapan — gövdede de dursun ki ekran başlığı ayrıştırmak zorunda kalmasın. */
        spyPlayer: spyName,
        birdsSent: birds, birdsShot: hit.killed,
        /** Rakibin aldığı bilgi kademesi — sızma yoksa null. */
        leakedLevel: gotIntel ? level : null,
        at: ctx.at.toISOString(),
      },
    });

    // ── Dönüş: sağ kalanlar; hepsi öldüyse dönüş görevi YOK (ordu yok olmuştur) ──
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
      after: { birds, killed: hit.killed, lossRate: hit.lossRate, level: gotIntel ? level : null, diff },
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

  /**
   * ⭐ KAHRAMAN İSTİHBARATI (kullanıcı, 2026-08-07) — iki kademeye yayılıyor:
   *   • `armyTypes` (fark 2) → yalnız **kaç kahraman** var.
   *   • `armyCounts` (fark 3) → her kahramanın **adı, seviyesi ve dört yetenek puanı**.
   *
   * ⚠️ Gizlilik çizgisi bilerek aşılıyor, gerekçesi kullanıcının: kahraman **adı, seviyesi ve
   * XP'si zaten herkese açık** (`command.controller.ts` → `GET /rankings?kind=hero`). Yetenek
   * puanları ise bugün hiçbir yerde görünmüyor; bu yüzden üst kademenin ödülü oluyorlar.
   * Ayrıca sıralama günde üç kez yenileniyor (8 saate kadar bayat), casusluk ise CANLI —
   * kademenin gerçek değeri bu.
   *
   * ⚠️ **Yalnız `alive`** (kullanıcı kararı): ölü ya da diriltilen kahraman savaşa katılamaz,
   * saymak "bu şehir beni ne karşılar" sorusuna yanlış cevap verirdi. Rapor doğrudan
   * simülatöre aktarılabildiği için yanlış sayı yanlış savaşa dönüşürdü.
   *
   * ⚠️ **Seferdeki kahraman kendiliğinden gizli**: görevdeyken `heroes.city_id` NULL
   * (`schema.ts`), yani bu sorgu onu hiç görmez. Mağaranın orduyu gizlemesiyle aynı sonuç,
   * ayrıca kod yazmaya gerek yok.
   *
   * ⚠️ Tek sorgu iki kademeyi besliyor; `heroes_city` indeksi zaten var.
   * ⚠️ `heroCount` **0 olsa da yazılır**: "kahraman yok" da bir istihbarat ve ekran
   * `undefined` (bilmiyoruz) ile `0` (yok) ayrımını çiziyor.
   */
  if (at >= 3) {
    const hs = await tx.execute<Record<string, unknown>>(sql`
      SELECT name, level, f_atk, f_def, m_atk, m_def
        FROM heroes
       WHERE city_id = ${cityId} AND status = 'alive'
       ORDER BY level DESC, id
    `);
    out['heroCount'] = hs.length;
    if (at >= 4) {
      out['heroes'] = hs.map((h: Record<string, unknown>) => ({
        name: String(h['name']),
        level: Number(h['level']),
        skills: {
          fAtk: Number(h['f_atk']), fDef: Number(h['f_def']),
          mAtk: Number(h['m_atk']), mDef: Number(h['m_def']),
        },
      }));
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
      /**
       * ⭐ TELEPORT SEVİYESİ (kullanıcı, 2026-08-07) — en üst kademenin son parçası.
       *
       * Teleport rakibin ordunu bir anda başka bir kıtaya taşıyabilmesi demek; "bu oyuncu
       * bana ne kadar hızlı ulaşır" sorusunun cevabı ve casusun en pahalı kademesinde
       * bilinmesi makul. Ön şartı Kale 12 + Mimar Okulu 12 + Büyücülük 12 olduğu için
       * oyuncuların ezici çoğunluğunda 0 — ekran o durumda satırı hiç yazmıyor.
       *
       * Ek sorgu yok: mağarayla aynı `levels` kaydından okunuyor.
       */
      teleport: levels['teleport'] ?? 0,
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

    /**
     * ⭐⭐ YERLEŞİM KİLİDİ — **kontrolden ÖNCE** (2026-08-07).
     *
     * ⚠️ Bu handler 2026-08-07'ye kadar kilitsizdi: «burada şehir var mı» diye bakıp sonra
     * `INSERT` ediyordu ve arada bir oku-yaz penceresi vardı. Aynı koordinata eşzamanlı iki
     * varışta (ya da bir varış + bir kayıt yerleşimi) `cities_world_coords` benzersizliği
     * ihlal ediliyor, görev `failed` olup 5 denemede `dead`e düşüyordu — o noktada birlikler
     * şehirden çoktan düşmüş ve dönüş görevi hiç yazılmamış oluyordu, yani **ordu kalıcı
     * kaybolurdu**. Kargo eklendikten sonra aynı yoldan kaynak da kaybolacaktı.
     *
     * ⚠️ Kayıt yerleşimiyle **aynı** kilit (`world/placement-lock.ts`) → iki yol seri hâle
     * geliyor. Kilit sırası kuralı: yerleşim önce, şehir sonra.
     */
    await ctx.lockPlacement();

    const units = await loadMissionUnits(ctx.tx, ctx.mission.id);
    const cargo = readResources(ctx.mission.payload['cargo']);
    /**
     * ⚠️ Kahraman adları `mission_heroes` BOŞALMADAN önce okunuyor — hem başarı yolu (satırı
     * siler) hem `scheduleReturn` (satırı dönüş görevine taşır) tabloyu boşaltıyor.
     */
    const heroNames = await loadMissionHeroNames(ctx.tx, ctx.mission.id);

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
        playerId, kind: 'found_city_report', side: 'owner', outcome: 'fail',
        subject: taken ? 'Şehir kurulamadı — yer dolu' : 'Şehir kurulamadı — şehir limiti',
        body: {
          coordinates: coords,
          reason: taken ? 'slot_taken' : 'city_limit',
          /* ⚠️ `units`/`heroes`/`cargo` eskiden BAŞARISIZLIK raporunda hiç yoktu: oyuncu
             ordusunun geri döndüğünü biliyor ama HANGİ ordu olduğunu göremiyordu. */
          units, heroes: heroNames, cargo,
          at: ctx.at.toISOString(),
        },
      });
      /**
       * ⭐ KARGO ORDUYLA GERİ DÖNER — `scheduleReturn` onu dönüş görevinin `loot`u olarak
       * yazıyor, `createReturnHandler` da varışta `cities.add` ile kasaya ekliyor.
       * ⚠️ Eskiden burada sabit `{gold:0, food:0}` vardı; kargo eklenince o sabit taşınan
       * kaynağı sessizce **yok ederdi**.
       */
      await scheduleReturn(ctx, {
        homeCityId: originCityId, units, cargo, returnOf: 'found_city', fromCoords: coords,
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
      /**
       * ⭐ TAŞINAN KAYNAK YENİ ŞEHRİN KESESİ OLUR (kullanıcı, 2026-08-07).
       *
       * ⚠️⚠️ Bu satırdan SONRA `cities.add(cityId, cargo)` **YAZMA** — `create` keseyi zaten
       * bu değerle dolduruyor; ikisi birlikte kargoyu **ikiye katlar** ve bedava kaynak basma
       * açığı olur. `missions.test.ts`teki "kargo yeni şehrin kesesine yazılır" testi tam da
       * bu sayıyı kilitliyor.
       * ⚠️ Kargo boşken `{0,0}` ve bu zaten `COLONY_STARTING_RESOURCES` ile birebir aynı →
       * koşulsuz geçmek güvenli, `if` sarmalayıcısına gerek yok.
       * ⚠️ "Kur → keseyi al → terk et" açığı DOĞMUYOR: kaynak oyuncunun kendi şehrinden
       * düşülmüş, şehir terk edilirse yok oluyor → net kayıp.
       */
      startingResources: cargo,
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
      playerId, kind: 'found_city_report', side: 'owner', outcome: 'ok',
      subject: `Yeni şehir kuruldu: ${name}`,
      /* ⚠️ `heroes` ve `cargo` eskiden yazılmıyordu; istemci ikisini de çizmeye hazırdı
         (`Messages.tsx` `PlainBody`) ama alanlar hep boş geliyordu. */
      body: { cityId, name, coordinates: coords, units, heroes: heroNames, cargo, at: ctx.at.toISOString() },
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
/**
 * ⭐ Yeni şehrin adı: **kullanıcı adı + sıra** (kullanıcı, 2026-08-09) — «abdullah 2».
 *
 * ⚠️ **Dayanak BAŞKENT ADI değil, KULLANICI ADI.** Kullanıcının cümlesi birebir: *"Şehrin
 * kurulduğu şehrin adı değil, kullanıcı adı."* 2026-08-03 ile 08-09 arasında başkentin adı
 * kullanılıyordu ve başkent yeniden adlandırılabildiği için üretilen adlar zamanla birbirini
 * tutmuyordu; kullanıcı adı ise değiştirilemez.
 *
 * ⚠️ Sıra = mevcut şehir sayısı + 1, yani BAŞKENT 1 sayılıyor: ilk koloni «… 2» oluyor.
 * Başkentin kendi adı sayısızdır (kayıtta doğrudan kullanıcı adı veriliyor), yani dizi
 * «abdullah · abdullah 2 · abdullah 3…» şeklinde okunuyor.
 *
 * ⚠️ Kırpma `colonyName` içinde: 15 karakteri aşarsa kullanıcı adı SONDAN kırpılır.
 */
async function nextColonyName(tx: Tx, playerId: number): Promise<string> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT (SELECT COUNT(*)::int FROM cities WHERE player_id = ${playerId}) AS n,
           (SELECT username FROM players WHERE id = ${playerId}) AS owner
  `);
  const index = Number(rows[0]?.['n'] ?? 1) + 1;
  const owner = rows[0]?.['owner'];
  /* ⚠️ `players` satırı olmadan buraya gelinemez (görev sahibi o), ama ad üretmek zorunda
     olduğumuz için yine de bir düşüş yolu duruyor. */
  return owner == null
    ? clampName(`Koloni ${index}`)
    : colonyName(String(owner), index);
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
  cargo: Cargo;
  returnOf: string;
  /**
   * ⚠️ Dönüşün NEREDEN geldiği — yalnız şehir kurma dönüşünde gerekiyor. `origin_city_id`
   * kolonu `cities.id`'ye FK ve kuruluş başarısız olduğunda o koordinatta şehir YOK, yani
   * kaynak oraya yazılamıyor. Koordinat bu yüzden payload'a düşüyor; Ordular listesi JOIN
   * boş dönünce oradan okuyor (`mission.controller.ts` `origin`).
   */
  fromCoords?: { k: number; d: number; s: number };
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
              ...(o.fromCoords ? { originCoords: o.fromCoords } : {}),
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

/**
 * Sefere katılan kahramanların adları.
 *
 * ⚠️ **`mission_heroes` boşaltılmadan ÖNCE** çağrılmalı: hem varış (kahramanı şehre yazıp
 * satırı siliyor) hem `scheduleReturn` (satırı dönüş görevine taşıyor) tabloyu boşaltıyor ve
 * rapor gövdesi ikisinden de SONRA yazılıyor. Kullanıcı 2026-08-03'te destek raporunda tam
 * bu eksiği bildirmişti; şehir kurma raporunda da aynı boşluk vardı.
 */
async function loadMissionHeroNames(tx: Tx, missionId: number): Promise<string[]> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT h.name FROM mission_heroes mh JOIN heroes h ON h.id = mh.hero_id
     WHERE mh.mission_id = ${missionId}
     ORDER BY h.level DESC, h.name
  `);
  return rows.map((r: Record<string, unknown>) => String(r['name']));
}

/**
 * Tek oyuncunun kullanıcı adı. ⚠️ `loadCityOwner`ın şehir üzerinden gitmeyen hâli: casusluğu
 * YAPAN taraf için elimizde yalnız `playerId` var (kaynak şehir görev satırında ama raporun
 * başlığı şehri değil kişiyi soruyor).
 */
async function usernameOf(tx: Tx, playerId: number): Promise<string> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT username FROM players WHERE id = ${playerId}
  `);
  return rows[0] ? String(rows[0]['username']) : '—';
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
  /**
   * ⭐ Aynı `kind`+`side` çiftinin İKİ farklı sonucu olabildiği tek yer: şehir kurma
   * hem başarıyla hem "yer dolu / limit" ile biter ve bildirim başlığı farklı olmalı
   * ("Yeni şehir kuruldu" ↔ "Şehir kurulamadı"). Ayırt edici kimlik `subject` OLAMAZ:
   * metin katalogun tekelinde, handler'lar bildirim dizesi üretmez.
   */
  outcome?: 'ok' | 'fail';
}): Promise<void> {
  /**
   * ⭐ GÜZERGÂH HER RAPORDA (kullanıcı, 2026-08-02): kaynak → hedef koordinatı gövdeye
   * yazılıyor ve ekranda tıklanabilir oluyor. Handler'lara tek tek eklenseydi biri mutlaka
   * unutulurdu (nakliyenin GÖNDEREN kopyası tam da öyle bir yerdi) — bu yüzden burada,
   * tüm raporların geçtiği tek kapıda.
   */
  const route = await routeOf(ctx);
  const body = route ? { ...o.body, route } : o.body;

  await ctx.tx.execute(sql`
    INSERT INTO messages (world_id, player_id, kind, side, battle_id, mission_id, subject, body, at)
    VALUES (${ctx.worldId}, ${o.playerId}, ${o.kind}, ${o.side}, NULL, ${ctx.mission.id},
            ${o.subject}, ${JSON.stringify(body)}::jsonb, ${ctx.at.toISOString()}::timestamptz)
  `);
  /**
   * ⭐ `side` · `route` · `outcome` yüke 2026-08-07'de eklendi (kullanıcı: bildirimler
   * "hangi şehir, hangi koordinat" desin). Öncesinde yük yalnız `{playerId, kind}` idi ve
   * katalog bu yüzden nakliyenin GÖNDEREN ile ALICI kopyasına aynı metni yazıyordu —
   * ikisi de "Nakliye raporu · Rapor mesaj kutunda." görüyordu.
   *
   * ⚠️ `route` zaten yukarıda hesaplanmış durumda (rapor gövdesine yazılıyor); ek sorgu yok.
   */
  await ctx.emit('message:written', {
    playerId: o.playerId, kind: o.kind, side: o.side, route: route ?? null,
    ...(o.outcome ? { outcome: o.outcome } : {}),
  });
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
