/**
 * ⭐⭐ MOCK RAPOR ÜRETİCİ — oyuncuya görünen HER rapor türünü GERÇEK yoldan üretir.
 *
 * Kullanıcı isteği (2026-08-20): *"Veri tabanındaki gerçek oyuncu kayıtları ile, oluşabilecek
 * her türlü raporu oluştur. Mock orduları savaştır, casus kuşlar gönder... olabilecek en
 * ayrıntılı şekilde. Sur yıkılması olsun, kahraman çıkması olsun."*
 *
 * ─ ⚠️⚠️ NEDEN RAPOR SATIRLARI ELLE YAZILMIYOR ────────────────────────────────────────────
 * Bu betik `messages`/`battles` satırlarını **uydurmuyor**. Yaptığı şey gerçek `missions`
 * satırları yazıp vadesini geriye çekmek; raporu worker'ın kendi handler'ı üretiyor. Elle
 * yazılmış bir gövde, kodun hiç üretmediği bir şekil olurdu ve raporu inceleyen kişi sahte
 * veriye bakardı — bulduğu kusur da gerçek olmazdı.
 *
 * ⚠️ **Doğrulayıcı (MissionService) bilerek atlanıyor**, çözümleyici (handler) atlanmıyor.
 * Kapılar (günlük saldırı limiti, barakadan yürüyüş sınırı, acemi koruması) oyuncu adaletiyle
 * ilgili; raporun ŞEKLİNİ belirleyen handler. Kapıları tek tek gevşetmek hem ayar kirletirdi
 * hem de bu betiğin işi değil.
 *
 * ─ Kullanım ──────────────────────────────────────────────────────────────────────────────
 *   node --env-file=.env apps/api/scripts/seed-reports.mjs          (üret)
 *   node --env-file=.env apps/api/scripts/seed-reports.mjs --temizle (yalnız sil)
 *
 * ⚠️ API/worker **AYAKTA OLMALI** (`ROLE=all`): raporu o çözüyor. Worker kapalıysa görevler
 * `scheduled`ta bekler ve betik zaman aşımına uğrar.
 *
 * ⛔ ÜRETİMDE ÇALIŞTIRILMAZ — gerçek oyuncuların ordusunu ve kasasını değiştirir.
 */
import postgres from 'postgres';

if (process.env['NODE_ENV'] === 'production') {
  console.error('⛔ seed-reports.mjs üretimde çalıştırılamaz: gerçek şehirleri değiştirir.');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL tanımsız — `node --env-file=../../.env` ile koştur.');

const sql = postgres(url, { max: 1 });
const WORLD = 1;

/** ⚠️ Ürettiğimiz her satır bu önekle işaretli — temizlik YALNIZ bunlara dokunuyor. */
const MOCK = 'mock-rapor';

/**
 * Betiğin yarattığı fikstür kahramanları.
 * ⚠️ Katalogdaki kahraman adlarıyla ÇAKIŞMAMALI: temizlik adı ölçüt aldığı için çakışan bir ad,
 * savaştan çıkmış gerçek bir kahramanı da silerdi. Tolkien adları bilerek seçildi —
 * `hero-names.ts` Türkçe adlar taşıyor.
 */
const FIKSTUR_KAHRAMANLAR = ['Boromir', 'Grishnak', 'Faramir'];

const log = (...a) => console.log(...a);

/**
 * ⚠️ Kimlikler **çalışma anında kullanıcı adından çözülüyor**, betiğe gömülmüyor.
 * Sabit id yazmak bu betiği tek bir veritabanı anlık görüntüsüne bağlardı; sıfırlanmış ya da
 * başka bir makinedeki veritabanında sessizce yanlış şehre saldırırdı.
 */
async function sehirler(kullaniciAdi) {
  const rows = await sql`
    SELECT c.id, c.name, c.k, c.d, c.s, c.is_capital, p.id AS player_id
      FROM cities c JOIN players p ON p.id = c.player_id
     WHERE p.username = ${kullaniciAdi} AND p.deleted_at IS NULL
     ORDER BY c.is_capital DESC, c.id
  `;
  if (rows.length === 0) throw new Error(`Oyuncu/şehir bulunamadı: ${kullaniciAdi}`);
  return rows.map((r) => ({
    id: Number(r.id), name: r.name, k: r.k, d: r.d, s: r.s,
    capital: r.is_capital, player: Number(r.player_id),
  }));
}

/** Sahne kurulumunda doldurulur. */
const S = {};

/* ─────────────────────────────────────────────────────────────────────────────────────────
   YARDIMCILAR
   ───────────────────────────────────────────────────────────────────────────────────── */

/** Şehirdeki birimleri **tam olarak** verilen tabloya eşitler (eksik tür sıfırlanmaz, yazılır). */
async function birimVer(cityId, tablo) {
  for (const [type, count] of Object.entries(tablo)) {
    await sql`
      INSERT INTO units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
      ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
    `;
  }
}

async function savunmaVer(cityId, tablo) {
  for (const [type, count] of Object.entries(tablo)) {
    await sql`
      INSERT INTO defenses (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
      ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
    `;
  }
}

async function binaVer(cityId, tablo) {
  for (const [type, level] of Object.entries(tablo)) {
    await sql`
      INSERT INTO buildings (city_id, type, level) VALUES (${cityId}, ${type}, ${level})
      ON CONFLICT (city_id, type) DO UPDATE SET level = ${level}
    `;
  }
}

async function magaraVer(cityId, tablo) {
  for (const [type, count] of Object.entries(tablo)) {
    await sql`
      INSERT INTO cave_units (city_id, type, count) VALUES (${cityId}, ${type}, ${count})
      ON CONFLICT (city_id, type) DO UPDATE SET count = ${count}
    `;
  }
}

/**
 * Kasayı doldurur.
 * ⚠️ `resources_at` de **şimdiye** çekiliyor: çıpa geride kalırsa `materialize` savaş anında
 * aradaki üretimi bir anda bankalar ve kasadaki sayı istediğimizden bambaşka çıkar.
 */
async function kasaVer(cityId, gold, food) {
  await sql`
    UPDATE cities SET gold = ${gold}, food = ${food}, resources_at = now() WHERE id = ${cityId}
  `;
}

/**
 * ⭐⭐ SUR ve MAĞARA ONARIM KİLİDİNİ AÇAR — savunacak her şehirde ŞART.
 *
 * ⚠️ İlk koşuda mağara **hiçbir savaşta kırılmadı** ve sebebi sahnede değil geçmişteydi:
 * `result.cave.reason === 'already_repairing'`. Mağara bir kez kırılınca `cave_repair_until`
 * doluyor ve o pencere boyunca **bir daha kırılamıyor**; şehirlerde önceki denemelerden kalma
 * damgalar vardı. Aynısı sur için de geçerli (`wall_repair_until` + yıpranmış `wall_integrity`):
 * yarı yıkık bir sur "yıkıldı" olayını üretmez, çünkü zaten yıkıktır.
 *
 * ⭐ `wall_integrity` bir **oran** (1 = sapasağlam), adet değil.
 */
async function onarimSifirla(cityId) {
  await sql`
    UPDATE cities
       SET wall_integrity = 1, wall_repair_from = NULL, wall_repair_until = NULL,
           cave_repair_until = NULL
     WHERE id = ${cityId}
  `;
}

/** Kahraman yaratır (varsa günceller) ve kimliğini döndürür. */
async function kahramanVer(playerId, cityId, o) {
  const [v] = await sql`
    INSERT INTO heroes (world_id, player_id, city_id, name, level, xp, f_atk, f_def, m_atk, m_def, status)
    VALUES (${WORLD}, ${playerId}, ${cityId}, ${o.name}, ${o.level ?? 5}, ${o.xp ?? 50000},
            ${o.fAtk ?? 400}, ${o.fDef ?? 300}, ${o.mAtk ?? 350}, ${o.mDef ?? 250}, 'alive')
    RETURNING id
  `;
  return Number(v.id);
}

/**
 * Görev satırı yazar ve kimliğini döndürür.
 *
 * ⚠️ `execute_at` **geçmişte**: worker `claimDue` ile vadesi gelmiş görevleri alıyor. Savaş
 * anı da bu damga (`ctx.at`), yani gece savaşını buradan ayarlıyoruz.
 */
async function gorev(o) {
  const [v] = await sql`
    INSERT INTO missions (world_id, type, status, owner_player_id, origin_city_id, target_city_id,
                          target_k, target_d, target_s, execute_at, payload, idempotency_key)
    VALUES (${WORLD}, ${o.type}, 'scheduled', ${o.owner}, ${o.origin ?? null}, ${o.target ?? null},
            ${o.k ?? null}, ${o.d ?? null}, ${o.s ?? null},
            ${o.at.toISOString()}::timestamptz,
            ${sql.json(o.payload ?? {})},
            ${`${MOCK}:${o.key}`})
    RETURNING id
  `;
  const id = Number(v.id);
  for (const [type, count] of Object.entries(o.units ?? {})) {
    if (count > 0) await sql`INSERT INTO mission_units (mission_id, unit_type, count) VALUES (${id}, ${type}, ${count})`;
  }
  for (const heroId of o.heroes ?? []) {
    await sql`INSERT INTO mission_heroes (mission_id, hero_id) VALUES (${id}, ${heroId})`;
    await sql`UPDATE heroes SET city_id = NULL WHERE id = ${heroId}`;
  }
  return id;
}

/** Saatler önce / gün önce bir zaman damgası (raporlar listede yayılsın diye). */
const saatOnce = (h) => new Date(Date.now() - h * 3600_000);

/**
 * Gece penceresine düşen bir geçmiş damga (TRT 00:00-08:00).
 * ⚠️ Kural Türkiye saatine göre (`zonedHour`), UTC'ye göre DEĞİL — bu yüzden damga
 * `Europe/Istanbul` üzerinden kuruluyor, ham UTC saati yazmak yanlış pencereyi vururdu.
 */
function geceDamgasi() {
  const simdi = new Date();
  const trt = new Date(simdi.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const fark = simdi.getTime() - trt.getTime();
  // TRT'ye göre BUGÜN 03:00; ileride kalırsa bir gün geriye al.
  const gece = new Date(trt);
  gece.setHours(3, 0, 0, 0);
  let damga = new Date(gece.getTime() + fark);
  if (damga.getTime() > simdi.getTime() - 60_000) damga = new Date(damga.getTime() - 86_400_000);
  return damga;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
   TEMİZLİK — yalnız bu betiğin ürettikleri
   ───────────────────────────────────────────────────────────────────────────────────── */
async function temizle() {
  const gorevler = await sql`
    SELECT id FROM missions WHERE world_id = ${WORLD} AND idempotency_key LIKE ${MOCK + ':%'}
  `;
  const idler = gorevler.map((r) => Number(r.id));

  /**
   * ⭐⭐ KAHRAMANLAR DA TEMİZLENİYOR — atlanınca senaryo SESSİZCE ölüyor.
   *
   * ⚠️ İlk koşularda "yeni kahraman çıkması" hiç gerçekleşmedi ve sebebi savaşta değildi:
   * betik her koşuda yeni bir fikstür kahramanı (Boromir) yaratıyordu, üç koşu sonra wstest'in
   * `status <> 'destroyed'` kahraman sayısı **5'e** dayandı ve `maybeCaptureHero`nun tavan
   * kapısı çıkışı engelledi. ⚠️ O sayım ÖLÜ kahramanları da içeriyor — "nasılsa öldü" diye
   * saymamak tam da bu tuzağa götürür.
   *
   * Silinecek küme İKİ ölçütün birleşimi:
   *   (a) **fikstür adları** — `kurulum()` görevlerden ÖNCE koşuyor, yani fikstür kahramanın
   *       `created_at`i mock görevlerin hepsinden eskidir ve zaman filtresi onu KAÇIRIR.
   *       İlk yazımda yalnız zaman filtresi vardı ve üç koşu boyunca hiç kahraman silinmedi.
   *   (b) **görev zamanından sonra yaratılanlar** — savaştan çıkan kahramanın adı katalogdan
   *       geliyor, önceden bilinemez; onu ancak zaman yakalıyor.
   * Her ikisi de yalnız bu senaryoya katılan oyuncularla sınırlı; eski kahramanlara dokunulmuyor.
   *
   * ⚠️⚠️ Aşağıdaki SQL yorumları `--` ile yazıldı, blok yorumla DEĞİL: bu bir `sql` şablon
   * değişmezi ve yorum içindeki bir **ters tırnak** şablonu ortasından kapatıyor
   * (`SyntaxError: Unexpected identifier`). Depo tuzak tablosunda kayıtlı, yine de düşüldü.
   */
  if (idler.length > 0) {
    const silinen = await sql`
      DELETE FROM heroes h
       WHERE h.world_id = ${WORLD}
         AND (
           -- (a) fikstürler: adları bize ait, her koşuda yeniden yaratılıyorlar.
           h.name = ANY(${FIKSTUR_KAHRAMANLAR})
           -- (b) savaştan çıkan kahramanlar: adları katalogdan, önceden bilinemez.
           OR h.created_at >= (SELECT min(created_at) FROM missions WHERE id = ANY(${idler}))
         )
         AND h.player_id IN (
           SELECT owner_player_id FROM missions WHERE id = ANY(${idler}) AND owner_player_id IS NOT NULL
           UNION
           SELECT c.player_id FROM cities c
            WHERE c.id IN (SELECT target_city_id FROM missions WHERE id = ANY(${idler}) AND target_city_id IS NOT NULL)
         )
      RETURNING h.id
    `;
    if (silinen.length > 0) log(`   ↳ ${silinen.length} mock kahraman silindi`);
  }

  if (idler.length > 0) {
    /* ⚠️ Sıra: mesaj → savaş → görev. `messages.battle_id` savaşa, `battles.mission_id`
       göreve bağlı; ters sırada FK düşer. Dönüş görevleri de bizim ürettiklerimizin
       çocuğu, onları `fromMissionId` üzerinden yakalıyoruz. */
    await sql`DELETE FROM messages WHERE mission_id = ANY(${idler})`;
    await sql`DELETE FROM messages WHERE battle_id IN (SELECT id FROM battles WHERE mission_id = ANY(${idler}))`;
    await sql`DELETE FROM battles WHERE mission_id = ANY(${idler})`;
    await sql`DELETE FROM missions WHERE (payload->>'fromMissionId')::bigint = ANY(${idler})`;
    await sql`DELETE FROM missions WHERE id = ANY(${idler})`;
  }
  /* ⚠️ Önce DAVET satırları, sonra mesajlar: mesaj gövdesindeki `inviteId` silinecek satırın
     tek izi. Ters sırada davetler yetim kalır ve bir sonraki koşuda `alliance_invites_pending`
     benzersizliği ihlal edilirdi. */
  await sql`
    DELETE FROM alliance_invites
     WHERE id IN (
       SELECT (body->>'inviteId')::bigint FROM messages
        WHERE world_id = ${WORLD} AND body->>'mockRapor' = 'evet' AND body ? 'inviteId'
     )
  `;
  const d = await sql`
    DELETE FROM messages WHERE world_id = ${WORLD} AND body->>'mockRapor' = 'evet' RETURNING id
  `;
  log(`🧹 temizlik: ${idler.length} görev, ${d.length} elle yazılmış mesaj silindi.`);
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
   FAZ 1 — SAHNE KURULUMU
   ───────────────────────────────────────────────────────────────────────────────────── */
async function kurulum() {
  log('\n① Sahne kuruluyor…');

  const ws = await sehirler('wstest');
  S.wsPlayer = ws[0].player;

  /**
   * ⚠️⚠️ Şehir seçimi **birebir ad** ile — `includes('kol')` denendi ve `Karakol`u yakaladı,
   * yani "düşecek şehir" ile "kale" AYNI şehir oldu; iki senaryo birden sessizce yanlış hedefe
   * gitti. Eşleşme bulunamazsa **patlıyoruz**: yanlış şehri yağmalamaktansa betiğin durması
   * iyidir.
   */
  const tam = (ad) => {
    const bulunan = ws.filter((c) => c.name === ad);
    if (bulunan.length !== 1) {
      throw new Error(`wstest şehri belirsiz: "${ad}" → ${bulunan.length} eşleşme. Mevcut: ${ws.map((c) => c.name).join(' · ')}`);
    }
    return bulunan[0];
  };
  S.baskent = ws.find((c) => c.capital) ?? ws[0];
  S.karakol = tam('Karakol');
  S.kol = tam('wstest kol');

  [S.alfa] = await sehirler('alfa9lth');   // 1:3:3 — ezici zaferin hedefi
  [S.beta] = await sehirler('betatuk4');   // Karakol'a saldıracak
  [S.hi8] = await sehirler('alfa0hi8');    // wstest'i casusluyacak (yakalanacak)
  [S.uh4c] = await sehirler('alfauh4c');   // wstest kol'u düşürecek
  [S.gorsel] = await sehirler('gorsel');   // nakliye alıcısı
  [S.itfuye] = await sehirler('itfuye');   // wstest'in yenileceği kale

  /* ── wstest saldırı üssü: başkent ──────────────────────────────────────────────────────
     ⚠️ Tapınak 10: yeni kahraman çıkma ihtimali
        `(Tapınak×10 − Kahraman×155) × min(1, XP×0,000025)`.
     Tapınak 10 ve savaşa kahraman SOKMAZSAK ihtimal 100 → çıkış garanti. "Kahraman çıkması"
     senaryosunun tek deterministik yolu bu; rulo `capture:{görev}:{oyuncu}`dan türüyor. */
  /* ⚠️ Kadro kasıtlı olarak BOL: aynı üsten beş sefer çıkıyor (ezici zafer · gece · kahramanlı ·
     yenilgi · kanlı zafer) ve kanlı zafer tek başına on binlerce birim yutuyor. */
  await birimVer(S.baskent.id, {
    dwarf: 100000, elf: 70000, cavalry: 30000, pegasus: 10000, dragon: 4000,
    mangonel: 5000, ogre: 4000, shaman: 12000, gnome: 6000, chaos: 300,
    cargo_wagon: 1000, spy_bird: 10000,
  });
  await binaVer(S.baskent.id, { castle: 20, barracks: 20 });
  await kasaVer(S.baskent.id, 9_000_000, 9_000_000);

  /* ── wstest savunma şehri: Karakol — savunma raporu burada okunacak ────────────────────
     Her savunma türü + Sur + Büyü Kalkanı + mağara: raporun savunma bölümü dolu çıksın.
     ⚠️ Okçu Kulesi ve Elf aynı zamanda CASUSLUK ÖNLEMEnin girdisi (anti-hava) — casus
     yakalama senaryosu da bu şehirde geçiyor. */
  await birimVer(S.karakol.id, {
    dwarf: 4000, elf: 3000, cavalry: 800, pegasus: 300, dragon: 60,
    mangonel: 200, ogre: 120, shaman: 400, gnome: 300, chaos: 8,
    cargo_wagon: 60, spy_bird: 3000,
  });
  await savunmaVer(S.karakol.id, {
    archer_tower: 120, trap: 300, oil_cauldron: 60, mangonel_tower: 45,
    guard: 200, ballista: 30, wall: 9, magic_shield: 6,
  });
  await binaVer(S.karakol.id, { temple: 6, castle: 20, cave: 8 });
  await magaraVer(S.karakol.id, { dwarf: 2000, elf: 1500, cavalry: 200 });
  await kasaVer(S.karakol.id, 5_000_000, 5_000_000);

  /* ── wstest kol — burası DÜŞECEK: savunma kaybı + ganimetin gidişi görünsün ─────────── */
  await birimVer(S.kol.id, {
    dwarf: 300, elf: 200, cavalry: 40, shaman: 30, gnome: 20, spy_bird: 200,
    pegasus: 0, dragon: 0, mangonel: 0, ogre: 0, chaos: 0, cargo_wagon: 0,
  });
  await savunmaVer(S.kol.id, {
    archer_tower: 8, trap: 20, wall: 2,
    magic_shield: 0, guard: 0, ballista: 0, oil_cauldron: 0, mangonel_tower: 0,
  });
  await kasaVer(S.kol.id, 3_500_000, 4_200_000);

  /* ── alfa9lth — ezici zafer + sur yıkımı + mağara kırma sahnesi ────────────────────── */
  await birimVer(S.alfa.id, {
    dwarf: 5000, elf: 750, cavalry: 4500, spy_bird: 1000, shaman: 200, gnome: 150,
    pegasus: 80, dragon: 6, mangonel: 40, ogre: 25, chaos: 0, cargo_wagon: 0,
  });
  await savunmaVer(S.alfa.id, {
    archer_tower: 60, trap: 180, oil_cauldron: 30, mangonel_tower: 20,
    guard: 90, ballista: 12, wall: 7, magic_shield: 4,
  });
  await binaVer(S.alfa.id, { temple: 4, castle: 15, cave: 6 });
  await magaraVer(S.alfa.id, { dwarf: 900, elf: 600 });
  await kasaVer(S.alfa.id, 8_000_000, 9_500_000);

  /* ── itfuye — wstest'in YENİLECEĞİ kale. Küçük bir ordu buraya çarpıp yok olacak. ──── */
  await birimVer(S.itfuye.id, {
    dwarf: 9000, elf: 7000, cavalry: 2500, pegasus: 800, dragon: 250,
    ogre: 300, shaman: 900, gnome: 400, mangonel: 300, chaos: 20,
  });
  await savunmaVer(S.itfuye.id, {
    archer_tower: 200, trap: 500, oil_cauldron: 120, mangonel_tower: 80,
    guard: 400, ballista: 60, wall: 12, magic_shield: 8,
  });
  await kasaVer(S.itfuye.id, 2_000_000, 2_000_000);

  /* ── Saldıracak rakiplerin orduları ────────────────────────────────────────────────── */
  await birimVer(S.beta.id, { dwarf: 3000, elf: 1500, cavalry: 500, shaman: 200, cargo_wagon: 20 });
  await kasaVer(S.beta.id, 900_000, 900_000);

  await birimVer(S.uh4c.id, {
    dwarf: 6000, elf: 4000, cavalry: 1500, pegasus: 400, dragon: 120,
    ogre: 200, shaman: 600, mangonel: 250, cargo_wagon: 150,
  });
  await kasaVer(S.uh4c.id, 1_200_000, 1_200_000);

  /* ⚠️ Casus kuşları GÖNDERENİN şehrinde olmalı: `spy` handler'ı görev birimlerini okuyor
     ama kuşlar kalkışta kaynak şehirden düşülmüş sayılıyor; kaynağı da hazırlıyoruz. */
  await birimVer(S.hi8.id, { spy_bird: 2500, dwarf: 400, elf: 200 });
  await kasaVer(S.hi8.id, 800_000, 800_000);
  await kasaVer(S.gorsel.id, 1_000_000, 1_000_000);

  /* ── Kahramanlar ──────────────────────────────────────────────────────────────────────
     ⚠️ wstest'in KAHRAMANLI saldırısı ayrı bir senaryo; başkentteki ezici zaferde kahraman
     YOK (yukarıdaki 100'lük ihtimal kapısı bozulmasın diye). */
  S.heroWs = await kahramanVer(S.wsPlayer, S.baskent.id, {
    name: 'Boromir', level: 7, xp: 120000, fAtk: 900, fDef: 700, mAtk: 500, mDef: 400,
  });
  S.heroAlfa = await kahramanVer(S.alfa.player, S.alfa.id, {
    name: 'Grishnak', level: 4, xp: 30000, fAtk: 380, fDef: 320, mAtk: 300, mDef: 260,
  });
  /**
   * ⭐⭐ DESTEĞE **MEVCUT** BİR KAHRAMAN KOŞULUYOR, YENİSİ YARATILMIYOR — kahraman tavanı yüzünden.
   *
   * ⚠️ Aynı kahramanı iki göreve koşamayız (saldırıdaki sefere çıkıyor, `city_id`si boşalıyor),
   * ama İKİNCİ bir fikstür yaratmak da olmuyor: `maybeCaptureHero`nun tavanı `maxHeroes = 5` ve
   * sayım `status <> 'destroyed'`, yani ÖLÜ kahramanları da içeriyor. wstest'in zaten 3 kahramanı
   * var (biri ölü); iki fikstürle sayı tam 5'e dayanıyor ve **kanlı zaferdeki %100 ihtimal
   * sessizce iptal oluyordu** — üç koşu boyunca "kahraman çıkmadı" bunun yüzündendi, savaşın
   * bir kusuru değil.
   *
   * ⭐ Mevcut bir kahramanı kullanmak hem yuvayı boşaltıyor hem de destek raporunun kahraman
   * satırını yine dolduruyor.
   */
  const [mevcut] = await sql`
    SELECT id FROM heroes
     WHERE player_id = ${S.wsPlayer} AND status = 'alive' AND city_id IS NOT NULL
       AND name <> ALL(${FIKSTUR_KAHRAMANLAR})
     ORDER BY id LIMIT 1
  `;
  S.heroDestek = mevcut ? Number(mevcut.id) : null;

  const [sayi] = await sql`
    SELECT count(*)::int AS n FROM heroes WHERE player_id = ${S.wsPlayer} AND status <> 'destroyed'
  `;
  if (Number(sayi.n) >= 5) {
    log(`   ⚠️ wstest'in ${sayi.n} kahramanı var (tavan 5) — kanlı zaferde YENİ KAHRAMAN ÇIKMAZ.`);
  }

  /* ── KANLI ZAFER sahnesi: yeni kahraman ancak buradan çıkar ───────────────────────────
     ⚠️⚠️ İlk koşuda kahraman ÇIKMADI ve sebebi sahnenin küçüklüğü değildi, **kuralın yönüydü**:
        `xp = (aLM + dLM) × (kazananınKaybı / kaybedeninKaybı) × 0,001`
     Kazananın kendi kaybı BÖLÜNEN, yani ezici zafer (saldıran neredeyse hiç kaybetmez) en AZ
     XP'yi üretiyor — ilk savaşta xp **18** çıktı, kapı ise `xpGate: 499`.
     ⭐ Bu yüzden ayrı bir sahne: iki taraf da devasa ve neredeyse eşit, saldıran KIL PAYI
     kazanıyor → aLM ≈ dLM → xp binlerle ölçülüyor.
     ⚠️ İhtimalin tabanı `Tapınak×10` ve tapınak wstest'in TÜM şehirlerinin toplamı (savaş 41'de
     21 okundu). Hepsini 20'ye çekince taban 100×10 = 1000 oluyor ve kapı erişilebilir hâle
     geliyor; tek şehri yükseltmek yetmezdi. */
  for (const c of ws) await binaVer(c.id, { temple: 20 });

  [S.kanli] = await sehirler('beta9lth');
  await birimVer(S.kanli.id, {
    dwarf: 40000, elf: 30000, cavalry: 12000, pegasus: 4000, dragon: 1500,
    ogre: 2000, shaman: 5000, gnome: 3000, mangonel: 2500, chaos: 150,
  });
  await savunmaVer(S.kanli.id, {
    archer_tower: 400, trap: 900, oil_cauldron: 250, mangonel_tower: 150,
    guard: 600, ballista: 120, wall: 10, magic_shield: 7,
  });
  await binaVer(S.kanli.id, { temple: 5, castle: 20, cave: 7 });
  await magaraVer(S.kanli.id, { dwarf: 3000, elf: 2000 });
  await kasaVer(S.kanli.id, 12_000_000, 12_000_000);

  /* ⚠️ Savunacak HER şehrin onarım kilidi açılıyor — gerekçe `onarimSifirla`da. */
  for (const c of [S.karakol, S.kol, S.alfa, S.itfuye, S.kanli]) await onarimSifirla(c.id);

  log(`   ✓ wstest: ${S.baskent.name} (üs) · ${S.karakol.name} (kale) · ${S.kol.name} (düşecek)`);
  log(`   ✓ rakipler: alfa9lth · betatuk4 · alfauh4c · alfa0hi8 · itfuye · gorsel`);
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
   FAZ 2 — GÖREVLERİ YAZ

   ⚠️ Her senaryo AYRI bir görev; hepsi geçmiş vadeli. Rapor listesi zamana göre sıralandığı
   için damgalar bilerek yayıldı (2 saat önce … 3 gün önce), yoksa hepsi aynı dakikaya
   yığılır ve listenin gruplaması sınanamazdı.
   ───────────────────────────────────────────────────────────────────────────────────── */
async function gorevleriYaz() {
  log('\n② Görevler yazılıyor…');
  const y = [];
  const yol = (saat, mesafe = 2) => ({ travelSeconds: saat * 3600, distance: mesafe, speed: 100, cartography: 9 });

  /* ① SALDIRI — EZİCİ ZAFER. Sur yıkılır · mağara kırılır · ganimet kapasiteyi aşar ·
        tapınak 10 + kahramansız → YENİ KAHRAMAN ÇIKAR. */
  y.push(await gorev({
    type: 'attack', key: 'saldiri-ezici-zafer', owner: S.wsPlayer,
    origin: S.baskent.id, target: S.alfa.id, k: S.alfa.k, d: S.alfa.d, s: S.alfa.s,
    at: saatOnce(2),
    units: { dwarf: 9000, elf: 6000, cavalry: 2400, pegasus: 900, dragon: 320, mangonel: 450, ogre: 400, shaman: 1100, gnome: 600, chaos: 40, cargo_wagon: 40 },
    payload: yol(1.5),
  }));

  /* ② SALDIRI — GECE SAVAŞI. Gece cezası ve rozet raporda görünsün. */
  y.push(await gorev({
    type: 'attack', key: 'saldiri-gece', owner: S.wsPlayer,
    origin: S.baskent.id, target: S.alfa.id, k: S.alfa.k, d: S.alfa.d, s: S.alfa.s,
    at: geceDamgasi(),
    units: { dwarf: 1500, elf: 1100, cavalry: 350, shaman: 250, gnome: 120, cargo_wagon: 20 },
    payload: yol(1.5),
  }));

  /* ③ SALDIRI — KAHRAMANLI. Kahraman XP kazanır; rapor kahraman satırını dolu gösterir. */
  y.push(await gorev({
    type: 'attack', key: 'saldiri-kahramanli', owner: S.wsPlayer,
    origin: S.baskent.id, target: S.alfa.id, k: S.alfa.k, d: S.alfa.d, s: S.alfa.s,
    at: saatOnce(20),
    units: { dwarf: 2000, elf: 1500, cavalry: 600, dragon: 40, shaman: 300, cargo_wagon: 30 },
    heroes: [S.heroWs],
    payload: { ...yol(1.5), heroTravelSeconds: 5400 },
  }));

  /* ④ SALDIRI — YENİLGİ. Küçük ordu, 12. seviye surlu kaleye çarpar; taşınan ganimet null. */
  y.push(await gorev({
    type: 'attack', key: 'saldiri-yenilgi', owner: S.wsPlayer,
    origin: S.baskent.id, target: S.itfuye.id, k: S.itfuye.k, d: S.itfuye.d, s: S.itfuye.s,
    at: saatOnce(30),
    units: { dwarf: 400, elf: 250, cavalry: 60, shaman: 40 },
    payload: yol(3, 5),
  }));

  /* ④b SALDIRI — KANLI ZAFER → YENİ KAHRAMAN. İki devasa ordu, kıl payı zafer; XP kapısı
        (`xpGate: 499`) ancak böyle aşılıyor. Gerekçe `kurulum`daki sahne notunda. */
  y.push(await gorev({
    type: 'attack', key: 'saldiri-kanli-zafer', owner: S.wsPlayer,
    origin: S.baskent.id, target: S.kanli.id, k: S.kanli.k, d: S.kanli.d, s: S.kanli.s,
    at: saatOnce(3),
    units: { dwarf: 42000, elf: 32000, cavalry: 13000, pegasus: 4200, dragon: 1600, ogre: 2100, shaman: 5200, gnome: 3200, mangonel: 2600, chaos: 160, cargo_wagon: 300 },
    payload: yol(2, 2),
  }));

  /* ⑤ SAVUNMA — wstest KAZANIR. Tuzak salvosu, kuleler, sur; savunma raporu dolu. */
  y.push(await gorev({
    type: 'attack', key: 'savunma-kazandi', owner: S.beta.player,
    origin: S.beta.id, target: S.karakol.id, k: S.karakol.k, d: S.karakol.d, s: S.karakol.s,
    at: saatOnce(8),
    units: { dwarf: 3000, elf: 1500, cavalry: 500, shaman: 200, cargo_wagon: 20 },
    payload: yol(2, 3),
  }));

  /* ⑥ SAVUNMA — wstest KAYBEDER. Kol düşer, kasa yağmalanır; kaybeden gözüyle ganimet. */
  y.push(await gorev({
    type: 'attack', key: 'savunma-kaybetti', owner: S.uh4c.player,
    origin: S.uh4c.id, target: S.kol.id, k: S.kol.k, d: S.kol.d, s: S.kol.s,
    at: saatOnce(14),
    units: { dwarf: 6000, elf: 4000, cavalry: 1500, pegasus: 400, dragon: 120, ogre: 200, shaman: 600, mangonel: 250, cargo_wagon: 150 },
    payload: yol(2, 4),
  }));

  /* ⑦ CASUSLUK — başarılı, geniş istihbarat (hedefin anti-havası zayıf). */
  y.push(await gorev({
    type: 'spy', key: 'casus-basarili', owner: S.wsPlayer,
    origin: S.karakol.id, target: S.alfa.id, k: S.alfa.k, d: S.alfa.d, s: S.alfa.s,
    at: saatOnce(4),
    units: { spy_bird: 1800 },
    payload: yol(0.2, 2),
  }));

  /* ⑧ CASUSLUK — az kuşla, ağır kayıp: raporun "yeterli bilgi yok" tarafı görünsün. */
  y.push(await gorev({
    type: 'spy', key: 'casus-agir-kayip', owner: S.wsPlayer,
    origin: S.karakol.id, target: S.itfuye.id, k: S.itfuye.k, d: S.itfuye.d, s: S.itfuye.s,
    at: saatOnce(26),
    units: { spy_bird: 60 },
    payload: yol(0.4, 5),
  }));

  /* ⑨ CASUSLUK ÖNLEME — alfa0hi8 wstest'i casuslar, Karakol'un kuleleri/elfleri yakalar.
        ⚠️ Rapor SAVUNANA (`side: 'target'`) yazılıyor; wstest'in göreceği rapor bu. */
  y.push(await gorev({
    type: 'spy', key: 'casus-onleme', owner: S.hi8.player,
    origin: S.hi8.id, target: S.karakol.id, k: S.karakol.k, d: S.karakol.d, s: S.karakol.s,
    at: saatOnce(10),
    units: { spy_bird: 2200 },
    payload: yol(0.3, 3),
  }));

  /* ⑩ NAKLİYE — başka oyuncuya. İKİ rapor doğar: gönderen (wstest) + alıcı (gorsel). */
  y.push(await gorev({
    type: 'transport', key: 'nakliye-baska-oyuncu', owner: S.wsPlayer,
    origin: S.baskent.id, target: S.gorsel.id, k: S.gorsel.k, d: S.gorsel.d, s: S.gorsel.s,
    at: saatOnce(16),
    units: { cargo_wagon: 60, dwarf: 200 },
    payload: { ...yol(2, 2), cargo: { gold: 250_000, food: 180_000 } },
  }));

  /* ⑪ NAKLİYE — kendi şehrine. ⚠️ TEK rapor yazılır (çift satır yazılmaması kuralı). */
  y.push(await gorev({
    type: 'transport', key: 'nakliye-kendi', owner: S.wsPlayer,
    origin: S.baskent.id, target: S.karakol.id, k: S.karakol.k, d: S.karakol.d, s: S.karakol.s,
    at: saatOnce(18),
    units: { cargo_wagon: 40 },
    payload: { ...yol(1, 2), cargo: { gold: 400_000, food: 400_000 } },
  }));

  /* ⑫ DESTEK — wstest KENDİ şehirleri arasında (başkent → Karakol), kargo + kahraman ile.
   *
   * ⚠️⚠️ İLK KURGU YANLIŞTI ve kullanıcı yakaladı: alfa9lth'in wstest'e destek yollaması
   * yazılmıştı. **Destek yalnız kendi şehirlerine gider** — `MissionService.sendSupport`
   * `requireOwnTarget: true` diyor ve yorumu açık: *"müttefike destek ittifak fazında gelecek"*.
   * Doğrulayıcıyı atladığımız için handler bunu seve seve işledi ve oyunun ASLA üretemeyeceği
   * bir rapor doğdu.
   * ⭐ Bu betiğin tek gerçek riski budur: kapıları atlamak "imkânsız rapor" üretebilir. Yeni
   * senaryo eklerken `mission.service.ts`teki bayrağa BAK (`requireOwnTarget` /
   * `forbidOwnTarget` / `attackForbiddenUnits`), yoksa incelenen rapor yalan olur.
   *
   * ⚠️ Kahraman bilerek var: destek raporunda kahraman satırı 2026-08-03'te eksikti ve
   * kullanıcı bildirmişti; o yol da sınansın diye. */
  y.push(await gorev({
    type: 'support', key: 'destek-kendi-sehrine', owner: S.wsPlayer,
    origin: S.baskent.id, target: S.karakol.id, k: S.karakol.k, d: S.karakol.d, s: S.karakol.s,
    at: saatOnce(12),
    units: { dwarf: 500, elf: 300, cavalry: 100, spy_bird: 250 },
    heroes: S.heroDestek ? [S.heroDestek] : [],
    payload: { ...yol(1.5, 2), cargo: { gold: 120_000, food: 90_000 } },
  }));

  log(`   ✓ ${y.length} görev yazıldı`);
  return y;
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
   FAZ 3 — WORKER'I BEKLE
   ───────────────────────────────────────────────────────────────────────────────────── */
async function bekle(saniye = 90) {
  log('\n③ Worker bekleniyor…');
  const bitis = Date.now() + saniye * 1000;
  for (;;) {
    const [v] = await sql`
      SELECT count(*)::int AS n FROM missions
       WHERE world_id = ${WORLD} AND idempotency_key LIKE ${MOCK + ':%'} AND status IN ('scheduled','running')
    `;
    if (Number(v.n) === 0) return true;
    if (Date.now() > bitis) {
      log(`   ⚠️ ${v.n} görev hâlâ bekliyor — worker ayakta mı? (ROLE=all)`);
      return false;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
   FAZ 4 — ŞEHİR KURMA (üç varyant, İKİ dalgada)

   ⚠️⚠️ İki dalga ŞART ve sırası anlamlı: başarısızlık varyantlarından biri (`city_limit`)
   wstest'in şehir tavanında OLMASINI gerektiriyor, başarı varyantı ise tavanın altında
   olmasını. Tek dalgada yazılsalardı ikisi aynı durumu görür ve biri sessizce yanlış
   sonucu üretirdi.
   ───────────────────────────────────────────────────────────────────────────────────── */
async function sehirKurmaDalgasi() {
  log('\n④ Şehir kurma dalgası…');
  const yol = (saat, mesafe = 3) => ({ travelSeconds: saat * 3600, distance: mesafe, speed: 100, cartography: 9 });
  const ordu = { dwarf: 400, elf: 200, cavalry: 60, cargo_wagon: 20 };

  /* ①  BAŞARISIZ — YER DOLU. Hedef: alfa9lth'in şehrinin koordinatı (dolu olduğu kesin). */
  await gorev({
    type: 'found_city', key: 'sehir-kurma-yer-dolu', owner: S.wsPlayer,
    origin: S.baskent.id, target: null, k: S.alfa.k, d: S.alfa.d, s: S.alfa.s,
    at: saatOnce(34),
    units: ordu,
    payload: { ...yol(2), cargo: { gold: 60_000, food: 40_000 } },
  });

  /* ②  BAŞARISIZ — ŞEHİR LİMİTİ. Hedef BOŞ ama wstest tavanda (5/5). */
  const bos1 = await bosKoordinat();
  await gorev({
    type: 'found_city', key: 'sehir-kurma-limit', owner: S.wsPlayer,
    origin: S.baskent.id, target: null, k: bos1.k, d: bos1.d, s: bos1.s,
    at: saatOnce(32),
    units: ordu,
    payload: { ...yol(2), cargo: { gold: 60_000, food: 40_000 } },
  });

  await bekle();

  /* ③  Yuva açılıyor — kullanıcı izniyle wstest'in bir şehri kaldırılıyor. */
  const ws = await sehirler('wstest');
  const kurban = ws.filter((c) => !c.capital).sort((a, b) => b.id - a.id)[0];
  if (!kurban) {
    log('   ⚠️ kaldırılacak (başkent olmayan) şehir yok — başarılı kurma atlanıyor.');
    return;
  }
  const kaldirilan = await sehirKaldir(kurban.id);
  log(`   ↳ şehir kaldırıldı: ${kaldirilan}`);

  /* ④  BAŞARILI — artık tavanın altında ve hedef boş. */
  const bos2 = await bosKoordinat();
  await gorev({
    type: 'found_city', key: 'sehir-kurma-basarili', owner: S.wsPlayer,
    origin: S.baskent.id, target: null, k: bos2.k, d: bos2.d, s: bos2.s,
    at: saatOnce(1),
    units: ordu,
    payload: { ...yol(2), cargo: { gold: 150_000, food: 120_000 } },
  });
  await bekle();
  log(`   ✓ yer dolu · şehir limiti · başarılı kurma (${bos2.k}:${bos2.d}:${bos2.s})`);
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
   FAZ 5 — GÖREVLE ÜRETİLEMEYENLER

   ⚠️ Buradakiler `missions` üzerinden doğmuyor: biri **emekli** (dönüş artık rapor üretmiyor,
   2026-07-30), diğerleri ittifak/yönetim servislerinden geliyor. Yine de İKİ İSTEMCİ DE onları
   çiziyor (`kReportType`), yani inceleme kapsamına giriyorlar.
   ⚠️ Gövde şekilleri **kaynak koddan birebir** alındı (`alliance.service.ts` · `Messages.tsx`);
   uydurulmuş bir alan, olmayan bir kusuru varmış gibi gösterirdi.
   ───────────────────────────────────────────────────────────────────────────────────── */
async function elleYazilanlar() {
  log('\n⑤ Görevle üretilemeyen kayıtlar…');

  const mesaj = async (o) => {
    await sql`
      INSERT INTO messages (world_id, player_id, kind, side, subject, body, at)
      VALUES (${WORLD}, ${o.playerId}, ${o.kind}, ${o.side ?? null}, ${o.subject},
              ${sql.json({ ...o.body, mockRapor: 'evet' })}, ${o.at.toISOString()}::timestamptz)
    `;
  };

  /* ① SİSTEM DUYURUSU — yöneticiden. Gövde `{ text }` (`notice()` ile birebir). */
  await mesaj({
    playerId: S.wsPlayer, kind: 'system', subject: 'Bakım duyurusu',
    at: saatOnce(5),
    body: {
      text: 'Sunucu bakımı 03:00 ile 04:00 arasında yapılacak. Bu sürede seferler duraklatılır '
        + 've bekleyen vadeler duraklama süresi kadar ileri kaydırılır; hiçbir görev kaybolmaz.',
    },
  });

  /* ② ORDU DÖNDÜ — **emekli** tür. Dönüş 2026-07-30'dan beri rapor değil bildirim üretiyor,
        ama o tarihten önceki kayıtlar posta kutusunda duruyor ve iki istemci de çiziyor.
        ⚠️ Damga bilerek ESKİ: bu kayıt sınıfı yeni üretilemez, listede de öyle görünmeli. */
  await mesaj({
    playerId: S.wsPlayer, kind: 'return_report', side: 'owner', subject: 'Ordu döndü',
    at: saatOnce(24 * 21),
    body: {
      units: { dwarf: 1825, elf: 1244, cavalry: 469, shaman: 293, cargo_wagon: 30 },
      loot: { gold: 223_819, food: 223_819 },
      coordinates: { k: 1, d: 3, s: 3 },
    },
  });

  /* ③ İTTİFAK DAVETİ — **gerçek** `alliance_invites` satırıyla.
        ⚠️ Uydurma bir `inviteId` yazmak deponun bilinen tuzağını üretirdi: düğmeli ama ÖLÜ
        satır ("Bu istek zaten sonuçlanmış."). Gerçek satırla düğme gerçek kod yolunu çalıştırır. */
  const [digerIttifak] = await sql`
    SELECT a.id, a.name, (SELECT p.id FROM players p WHERE p.alliance_id = a.id ORDER BY p.alliance_role DESC LIMIT 1) AS lider,
           (SELECT p.username FROM players p WHERE p.alliance_id = a.id ORDER BY p.alliance_role DESC LIMIT 1) AS lider_ad
      FROM alliances a
     WHERE a.id <> (SELECT alliance_id FROM players WHERE id = ${S.wsPlayer})
     ORDER BY a.id LIMIT 1
  `;
  if (digerIttifak) {
    await sql`DELETE FROM alliance_invites WHERE alliance_id = ${digerIttifak.id} AND player_id = ${S.wsPlayer} AND kind = 'invite' AND status = 'pending'`;
    const [dv] = await sql`
      INSERT INTO alliance_invites (world_id, alliance_id, player_id, kind, created_by, status)
      VALUES (${WORLD}, ${digerIttifak.id}, ${S.wsPlayer}, 'invite', ${digerIttifak.lider}, 'pending')
      RETURNING id
    `;
    await mesaj({
      playerId: S.wsPlayer, kind: 'alliance_invite', side: 'owner', subject: 'İttifak Daveti',
      at: saatOnce(7),
      body: {
        inviteId: Number(dv.id), allianceId: Number(digerIttifak.id),
        allianceName: String(digerIttifak.name), by: String(digerIttifak.lider_ad),
      },
    });
  }

  /* ④ İTTİFAK BAŞVURUSU — ittifaksız gerçek bir oyuncu wstest'in ittifağına başvuruyor.
        wstest lider olduğu için başvuru onun kutusuna düşer (gerçek akışın aynısı). */
  const [benimIttifak] = await sql`
    SELECT a.id, a.name FROM alliances a
     WHERE a.id = (SELECT alliance_id FROM players WHERE id = ${S.wsPlayer})
  `;
  const [aday] = await sql`
    SELECT id, username FROM players
     WHERE world_id = ${WORLD} AND alliance_id IS NULL AND deleted_at IS NULL AND banned_at IS NULL
     ORDER BY score DESC NULLS LAST LIMIT 1
  `;
  if (benimIttifak && aday) {
    await sql`DELETE FROM alliance_invites WHERE alliance_id = ${benimIttifak.id} AND player_id = ${aday.id} AND kind = 'application' AND status = 'pending'`;
    const [bv] = await sql`
      INSERT INTO alliance_invites (world_id, alliance_id, player_id, kind, created_by, status)
      VALUES (${WORLD}, ${benimIttifak.id}, ${aday.id}, 'application', ${aday.id}, 'pending')
      RETURNING id
    `;
    await mesaj({
      playerId: S.wsPlayer, kind: 'alliance_application', side: 'owner', subject: 'İttifak Başvurusu',
      at: saatOnce(9),
      body: {
        inviteId: Number(bv.id), allianceId: Number(benimIttifak.id),
        allianceName: String(benimIttifak.name), by: String(aday.username), byPlayerId: Number(aday.id),
      },
    });
  }

  /* ⑤ İTTİFAK MESAJI — toplu duyuru. Gövde `{ from, text }`. */
  await mesaj({
    playerId: S.wsPlayer, kind: 'alliance_message', side: 'owner', subject: 'İttifak Mesajı',
    at: saatOnce(11),
    body: {
      from: 'itflider',
      text: 'Bu gece 1:3 diyarına toplu sefer var. Ordularınızı Karakol\'da toplayın, '
        + 'gece penceresinde saldırmayacağız; gece cezası yüzünden sabah 08:00 sonrası çıkıyoruz.',
    },
  });

  log('   ✓ sistem duyurusu · ordu döndü (emekli tür) · ittifak daveti/başvurusu/mesajı');
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
   ANA AKIŞ
   ───────────────────────────────────────────────────────────────────────────────────── */
/**
 * Diyar/yuva ızgarasında BOŞ bir koordinat bulur.
 *
 * ⚠️⚠️ Takma adlar (`gd`/`gs`) şart: korelasyonlu alt sorguda çıplak `s` yazılırsa dış
 * fonksiyona değil **`cities.s` sütununa** çözülür, koşul `c.s = c.s` olur ve o diyarda tek bir
 * şehir varsa sorgu "boş yer yok" der. Depo tuzak tablosunda kayıtlı; bu betiği yazarken yine
 * düşüldü ve 480 yuvanın hepsi dolu göründü.
 */
async function bosKoordinat() {
  const [v] = await sql`
    SELECT gd AS d, gs AS s
      FROM generate_series(1, 30) gd CROSS JOIN generate_series(1, 10) gs
     WHERE NOT EXISTS (
       SELECT 1 FROM cities c WHERE c.world_id = ${WORLD} AND c.k = 1 AND c.d = gd AND c.s = gs
     )
     ORDER BY gd, gs LIMIT 1
  `;
  if (!v) throw new Error('Haritada boş koordinat kalmamış — şehir kurma senaryosu kurulamıyor.');
  return { k: 1, d: Number(v.d), s: Number(v.s) };
}

/**
 * ⭐ ŞEHİR KALDIRMA — başarılı şehir kurma senaryosunun ÖN KOŞULU.
 *
 * Kullanıcı izni (2026-08-20): *"wstest'in bir şehrini kaldırıp gerçek bir yeni şehir kurma
 * senaryosu hazırlayabilirsin."*
 *
 * ⚠️ Gerekçe kuralda: `maxCities(colonization)` = `1 + floor(sv/3)`, wstest'in Sömürgeciliği 12
 * → tavan **5** ve tam 5 şehri var. Yer boş olsa bile kurma `city_limit` ile düşerdi; başarı
 * yolunu görebilmek için bir yuva açılması gerekiyor.
 *
 * ⚠️ Ham `DELETE`: `units`/`buildings`/`defenses`/`cave_units` CASCADE ile gidiyor, kahraman
 * `city_id`si SET NULL oluyor. Terk akışının (`abandonBlockers`) kuralları burada BİLEREK
 * atlanıyor — amaç terk özelliğini sınamak değil, kurma raporunu üretmek.
 */
async function sehirKaldir(cityId) {
  const [v] = await sql`DELETE FROM cities WHERE id = ${cityId} RETURNING name, k, d, s`;
  return v ? `${v.name} (${v.k}:${v.d}:${v.s})` : null;
}

async function main() {
  const yalnizTemizle = process.argv.includes('--temizle');
  await temizle();
  if (yalnizTemizle) return;
  await kurulum();
  await gorevleriYaz();
  await bekle();
  await sehirKurmaDalgasi();
  await elleYazilanlar();

  const olusan = await sql`
    SELECT m.kind, m.side, count(*)::int AS n
      FROM messages m
     WHERE m.player_id = ${S.wsPlayer} AND m.created_at > now() - interval '10 minutes'
     GROUP BY m.kind, m.side ORDER BY m.kind, m.side
  `;
  log('\n④ wstest posta kutusunda oluşanlar:');
  for (const r of olusan) log(`   • ${r.kind}${r.side ? ' / ' + r.side : ''} — ${r.n}`);

  const olu = await sql`
    SELECT id, type, last_error FROM missions
     WHERE idempotency_key LIKE ${MOCK + ':%'} AND status = 'dead'
  `;
  for (const r of olu) log(`   ⛔ ÖLÜ GÖREV ${r.id} (${r.type}): ${r.last_error}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
