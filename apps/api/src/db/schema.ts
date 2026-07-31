/**
 * Drizzle şeması — Faz 0 çekirdeği.
 * Tam DDL `MOBIWAR_TEKNIK_KURULUM.md` §1.2'de; buradaki tablolar Faz 0 iskeleti için gerekli
 * olanlardır. Görev kuyruğu (`missions`, `outbox`) Faz 1'de, savaş/rapor Faz 2'de eklenir.
 *
 * ⚠️ İKİ KATMANLI KİMLİK (§13.12.1b): `accounts` dünyalar ÜSTÜdür (e-posta, parola, tema),
 * `players` dünya BAŞINAdır. Dünya-kapsamlı her tabloda `world_id` vardır.
 */
import { relations, sql } from 'drizzle-orm';
import {
  bigint, bigserial, boolean, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp,
  uniqueIndex, uuid, type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const worlds = pgTable('worlds', {
  id: smallint('id').primaryKey(),
  name: text('name').notNull(),
  state: text('state').notNull().default('running'), // running | maintenance | archived
  /**
   * ⭐ OYUN SAATİ (§2): game_now() = now() − clock_offset_ms.
   * clock_offset_ms = dünyanın TOPLAM duraklama süresi. Bakımda geçen süre oyun saatine
   * yansımaz → bakım sırasında hiçbir geri sayım ilerlemez, savaşlar kaymaz.
   */
  clockOffsetMs: bigint('clock_offset_ms', { mode: 'number' }).notNull().default(0),
  /** Bakım başlangıcı (gerçek zaman). NULL = dünya çalışıyor. */
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  /**
   * ⭐ DÜNYA HIZ ÇARPANLARI — oyunun temposunu tek yerden ayarlar (§13.7).
   * `speed_multiplier`: sefer sürelerini böler (mesafe hızı; mağara-kaçış dönüşü dahil).
   * `resource_multiplier`: Çiftlik/Maden üretimini çarpar.
   * `training_multiplier`: Baraka + Savunma BİRİM üretim sürelerini böler.
   * `construction_multiplier`: bina + Sur/Büyü Kalkanı seviyesi + Akademi tekniği sürelerini böler.
   * Onarımlar (Sur/Mağara) çarpan DIŞIDIR (kullanıcı kararı 2026-07-30).
   * Hepsi 1 = klasik hız. **İleride admin panelinden yönetilecek.**
   */
  speedMultiplier: integer('speed_multiplier').notNull().default(1),
  resourceMultiplier: integer('resource_multiplier').notNull().default(1),
  trainingMultiplier: integer('training_multiplier').notNull().default(1),
  constructionMultiplier: integer('construction_multiplier').notNull().default(1),
  catalogHash: text('catalog_hash'),
  config: jsonb('config').notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Dünyalardan BAĞIMSIZ kimlik: bir hesap birden çok dünyada oynayabilir. */
export const accounts = pgTable('accounts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull().unique(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  passwordHash: text('password_hash').notNull(), // argon2id
  // Tema/dil tercihi HESAP düzeyinde → web ve Flutter aynı tercihi görür (§13.13.4)
  uiTheme: text('ui_theme').notNull().default('system'), // system | light | dark
  uiLocale: text('ui_locale').notNull().default('tr'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  failedLogins: smallint('failed_logins').notNull().default(0),
});

export const players = pgTable('players', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull().references(() => worlds.id),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references(() => accounts.id),
  username: text('username').notNull(), // değiştirilemez
  /**
   * ⭐ PUAN — oyunun KENDİ dokümanından (GENEL DURUM): *"Puanlama, harcadığınız kaynak miktarına
   * göre yapılır. Harcanmış her 1000 birim kaynağa karşılık 1 puan alırsınız. Ordularınızın
   * savaştaki kayıpları ise aynı oranda puan kaybetmenize neden olur."*
   *
   * `score` gösterilen tam sayı, `scoreBase` ise onu üreten **net harcanan kaynak** (altın+yemek).
   * İkisi birlikte tutuluyor çünkü tek başına `score` KAYIPLI olurdu: 900 birimlik bir harcama
   * 0 puan yazar, ikincisi de 0 yazar — oyuncu 1.800 birim harcayıp 1 puan alamazdı. Kesirli
   * tabanı saklayıp `score = floor(base/1000)` türetmek bu sızıntıyı kapatır (kaynak birikimindeki
   * `numeric(20,6)` kararının aynısı).
   */
  score: bigint('score', { mode: 'number' }).notNull().default(0),
  scoreBase: numeric('score_base', { precision: 24, scale: 6 }).notNull().default('0'),
  isPremium: boolean('is_premium').notNull().default(false),
  protectedUntil: timestamp('protected_until', { withTimezone: true }),
  vacationUntil: timestamp('vacation_until', { withTimezone: true }),
  /** İttifak üyeliği (§13.15b). FK döngüsel olduğu için tembel referans (alliances aşağıda). */
  allianceId: bigint('alliance_id', { mode: 'number' })
    .references((): AnyPgColumn => alliances.id, { onDelete: 'set null' }),
  /**
   * ⭐ İTTİFAK ROLÜ — orijinal istemcinin `q` alanı (`k.java`): **1 Asker · 2 Konsey Üyesi ·
   * 3 Lider**, ittifaksızken NULL. `alliance_members` ara tablosu yerine kolon: oyuncu aynı anda
   * tek ittifakta olabilir, her sorguda JOIN taşımak gereksiz.
   */
  allianceRole: smallint('alliance_role'),
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('players_world_username').on(t.worldId, t.username),
  uniqueIndex('players_world_account').on(t.worldId, t.accountId),
  index('players_world_score').on(t.worldId, t.score),
  // "Bu ittifakın üyeleri" sorgusu (üye listesi, puan toplamı, sıralama) tam bu indeksle çalışır.
  index('players_alliance').on(t.worldId, t.allianceId),
]);

/* ═══ İTTİFAK (§13.15b) ══════════════════════════════════════════════════════ */

/**
 * ⭐ İTTİFAK — kurma şartı Kale ≥ 5 (§13.15, config), ad 3-10 karakter ve dünya içinde
 * benzersiz (büyük/küçük duyarsız), üye sayısı SINIRSIZ (doküman). Üyelik `players.allianceId`
 * + `players.allianceRole`'de yaşar; bu tablo yalnız kimlik + metin + lider tutar.
 */
export const alliances = pgTable('alliances', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull().references(() => worlds.id),
  name: text('name').notNull(),
  leaderId: bigint('leader_id', { mode: 'number' }).notNull().references(() => players.id),
  /** İttifak metni (≤500, orijinal `itMtn/itMtd.do`) — tüm üyeler görür, Konsey+Lider düzenler. */
  text: text('text').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Benzersizlik büyük/küçük duyarsız: "RUN.dll" varken "run.DLL" kurulamaz.
  uniqueIndex('alliances_world_name').on(t.worldId, sql`lower(${t.name})`),
]);

/**
 * ⭐ DAVET + BAŞVURU durum makinesi. Mesaj kutusuna düşen satırlar yalnız BİLDİRİMDİR
 * (`messages.kind = alliance_invite | alliance_application`); kabul/red bu tabloda işlenir —
 * `messages` salt-okunur akıştır, durum taşımaz (savaş raporunun `battles`+`messages`
 * ikilisiyle aynı desen).
 *
 * `kind`: `invite` = yönetim oyuncuyu çağırdı · `application` = oyuncu ittifağa başvurdu.
 * Aynı ikili için aynı türde tek `pending` satır olabilir (kısmî unique indeks).
 */
export const allianceInvites = pgTable('alliance_invites', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull(),
  allianceId: bigint('alliance_id', { mode: 'number' }).notNull()
    .references(() => alliances.id, { onDelete: 'cascade' }),
  playerId: bigint('player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),                       // invite | application
  /** Daveti gönderen / başvuran oyuncu (bilgi amaçlı; davet eden ittifaktan ayrılmış olabilir). */
  createdBy: bigint('created_by', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('pending'), // pending | accepted | rejected | canceled
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decidedBy: bigint('decided_by', { mode: 'number' }),
}, (t) => [
  uniqueIndex('alliance_invites_pending').on(t.allianceId, t.playerId, t.kind)
    .where(sql`${t.status} = 'pending'`),
  index('alliance_invites_player').on(t.playerId),
]);

export const cities = pgTable('cities', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull().references(() => worlds.id),
  playerId: bigint('player_id', { mode: 'number' }).notNull().references(() => players.id),
  name: text('name').notNull(),
  k: integer('k').notNull(),
  d: integer('d').notNull(),
  s: integer('s').notNull(),
  isCapital: boolean('is_capital').notNull().default(false),
  /**
   * ⭐ TEMBEL BİRİKİM (§3): tick YOK. Kaynak, `resources_at` çıpasından itibaren geçen OYUN
   * süresiyle okuma/mutasyon anında hesaplanır.
   * **numeric(20,6)** — kesirli kısım saklanıyor ki birikim KAYIPSIZ olsun: saatte 11 kaynak
   * üreten bir şehir 10 saniyede 0,0305 üretir; bunu tam sayıya yuvarlarsak her okumada sıfırlanır
   * ve oyuncu asla kaynak biriktiremez. Ayrıca float değil numeric → yuvarlama hatası yok.
   */
  gold: numeric('gold', { precision: 20, scale: 6 }).notNull().default('0'),
  food: numeric('food', { precision: 20, scale: 6 }).notNull().default('0'),
  resourcesAt: timestamp('resources_at', { withTimezone: true }).notNull().defaultNow(),
  /**
   * ⭐ Teleport binası ne zaman tekrar hazır (OYUN saatinde). Doküman: *"Bu işlemden sonra
   * teleport binası tekrar hazır hale gelinceye kadar kullanılamaz."*
   * NULL = hiç kullanılmamış / hazır. Bekleme süresi `teleportCooldownSeconds(seviye)`.
   */
  teleportReadyAt: timestamp('teleport_ready_at', { withTimezone: true }),
  /**
   * ⭐ MAĞARA ONARIMI (§13.20.4). Yıkılan mağara bu ana kadar **kullanılamaz**: içine ordu
   * sokulamaz, boşaltılamaz, seviyesi ilerletilemez ve **yeniden yıkılamaz**. NULL = sağlam.
   * OYUN saatinde (bakımda onarım da durur).
   */
  caveRepairUntil: timestamp('cave_repair_until', { withTimezone: true }),
  /**
   * ⭐ SUR BÜTÜNLÜĞÜ ve ONARIMI (§13.21.2). Doküman: *"Savaşlarda yıkılan sur savaş sonrasında
   * belirli bir süre içinde yeniden onarılır."*
   *
   * Üç alan birlikte anlam taşır:
   *  • `wallIntegrity` — onarım BAŞLARKENki oran (savaş sonrası kalan, 0-1). Onarım ilerledikçe
   *    DEĞİŞMEZ; o an geçerli bütünlük `wallCurrentIntegrity()` ile hesaplanır.
   *  • `wallRepairFrom` / `wallRepairUntil` — onarımın başı ve sonu. ⭐ Onarım sürerken gelen
   *    saldırıyı sur, **o ana kadar onarılmış yüzdeyle** karşılar (kullanıcı, 2026-07-29);
   *    bunun için başlangıç anı da gerekli — yalnız bitiş tutulsaydı onarımda geçen saatler
   *    hiçbir işe yaramazdı.
   *
   * ⭐ `wallIntegrity = 0` **ve** onarım sürüyorsa sur TAM YIKILMIŞ demektir: o şehirde onarım
   * bitene kadar savunma birimi üretilemez (§13.21.2).
   */
  wallIntegrity: numeric('wall_integrity', { precision: 6, scale: 4 }).notNull().default('1'),
  wallRepairFrom: timestamp('wall_repair_from', { withTimezone: true }),
  wallRepairUntil: timestamp('wall_repair_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('cities_world_coords').on(t.worldId, t.k, t.d, t.s),
  index('cities_player').on(t.playerId),
]);

export const buildings = pgTable('buildings', {
  cityId: bigint('city_id', { mode: 'number' }).notNull().references(() => cities.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  level: smallint('level').notNull().default(0),
}, (t) => [uniqueIndex('buildings_pk').on(t.cityId, t.type)]);

/** Barakadaki hazır savaşçılar. */
export const units = pgTable('units', {
  cityId: bigint('city_id', { mode: 'number' }).notNull()
    .references(() => cities.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [uniqueIndex('units_pk').on(t.cityId, t.type)]);

/**
 * ⭐ MAĞARADAKİ SAVAŞÇILAR (§13.20) — `units` tablosundan **AYRI**.
 *
 * Ayrı tablo olması bir tercih değil, kuralın kendisi: doküman *"mağaradaki askerler savaşa
 * katılmazlar"* ve *"casus kuşları mağaradaki askerleri göremezler"* diyor. Aynı tabloda
 * tutup bir bayrakla ayırsaydık savaş, casusluk, sefer ve ekran sorgularının HEPSİNE
 * "ve mağarada değil" koşulu eklemek gerekirdi; biri unutulduğunda hata **sessiz** olurdu
 * (saklanan ordu savaşa girer). Ayrı tablo bu unutmayı imkânsız kılıyor.
 *
 * ⚠️ Puan bu birimleri KAYBETMEZ: kaynak harcanmıştı, birim hâlâ duruyor (§13.17.1).
 */
export const caveUnits = pgTable('cave_units', {
  cityId: bigint('city_id', { mode: 'number' }).notNull()
    .references(() => cities.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [uniqueIndex('cave_units_pk').on(t.cityId, t.type)]);

/** Surdaki savunma birimleri. Sur ve Büyü Kalkanı adet DEĞİL seviye taşır (§13.11.1b). */
export const defenses = pgTable('defenses', {
  cityId: bigint('city_id', { mode: 'number' }).notNull()
    .references(() => cities.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  count: integer('count').notNull().default(0),
}, (t) => [uniqueIndex('defenses_pk').on(t.cityId, t.type)]);

/** Teknikler oyuncu-GENEL (araştırma şehir bazlı ama seviye oyuncuda, §13.11.5). */
export const techs = pgTable('techs', {
  playerId: bigint('player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  level: smallint('level').notNull().default(0),
}, (t) => [uniqueIndex('techs_pk').on(t.playerId, t.type)]);

/**
 * ⭐ ÜRETİM/İLERLETME KUYRUĞU (§13.9 kategorileri: building · unit · defense · tech · hero_revive)
 *
 * Kuyruk satırı **oyuncunun ekranda gördüğü geri sayımdır**; bitişi ise `missions` tablosundaki
 * bir görev uygular. İkisi aynı transaction'da yazılır → "kuyruk bitti ama bina gelmedi" olamaz.
 * `finish_at` OYUN saatinde (bakımda geri sayım durur).
 */
export const queues = pgTable('queues', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull(),
  cityId: bigint('city_id', { mode: 'number' }).notNull()
    .references(() => cities.id, { onDelete: 'cascade' }),
  playerId: bigint('player_id', { mode: 'number' }).notNull(),
  /** building | unit | defense | tech */
  category: text('category').notNull(),
  itemType: text('item_type').notNull(),
  /** Yapı/teknikte hedef seviye; birimde adet. */
  targetLevel: smallint('target_level'),
  count: integer('count'),
  /**
   * ⭐ SAVAŞÇI ÜRETİMİ TEKER TEKER (kullanıcı kararı 2026-07-28).
   * `done` = şimdiye kadar üretilip şehre eklenen adet · `perUnitSeconds` = bir birimin süresi.
   * Üretim **tembel** ilerler (kaynak birikimiyle aynı desen): şehir her okunduğunda
   * `materializeUnitQueues` geçen süreye düşen birimleri ekler. Böylece oyuncu çevrimdışıyken
   * şehrine saldırı gelirse o ana kadar üretilmiş askerler savaşta GERÇEKTEN vardır.
   */
  done: integer('done').notNull().default(0),
  perUnitSeconds: numeric('per_unit_seconds', { precision: 14, scale: 3 }),
  /**
   * Kuyruktaki sıra: **1 = üretimi süren**, 2+ bekleyenler. Bekleyenler kendi aralarında
   * yer değiştirebilir; süren emir yerinden oynatılamaz.
   */
  position: smallint('position').notNull().default(1),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishAt: timestamp('finish_at', { withTimezone: true }).notNull(),
  spentGold: numeric('spent_gold', { precision: 20, scale: 6 }).notNull().default('0'),
  spentFood: numeric('spent_food', { precision: 20, scale: 6 }).notNull().default('0'),
  /** Bitişi uygulayacak görev (aynı transaction'da yazılır). */
  missionId: bigint('mission_id', { mode: 'number' }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [
  index('queues_city_open').on(t.cityId, t.finishAt)
    .where(sql`${t.completedAt} IS NULL AND ${t.canceledAt} IS NULL`),
  index('queues_player').on(t.playerId, t.finishAt),
]);

/* ═══ OTURUM ve ÇOKLU HESAP SİNYALLERİ (§9.1) ═══════════════════════════════
 * ⏰ Tespit MANTIĞI sonradan yazılabilir, VERİ sonradan toplanamaz. Bu yüzden toplama katmanı
 * Faz 2'de kuruluyor, analiz Faz 4'te (eşikler gerçek oyuncu davranışı görülmeden tahmindir).
 * ⚠️ Bu veri ASLA otomatik cezaya bağlanmaz — yalnız skorlu rapor üretir, kararı yönetici verir.
 */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  refreshHash: text('refresh_hash').notNull(),
  ip: text('ip'),
  /** Web'de User-Agent; mobilde YOK (orada platform/os/model kullanılır). */
  ua: text('ua'),
  /** İstemcide üretilip kalıcı saklanan UUID (`X-Device-Id`). En güçlü teknik iz. */
  deviceId: text('device_id'),
  /** 'web' | 'android' | 'ios' — web ve mobil sinyalleri farklı olduğu için ayrı tutulur. */
  platform: text('platform'),
  osVersion: text('os_version'),
  deviceModel: text('device_model'),
  appVersion: text('app_version'),
  timezone: text('timezone'),
  locale: text('locale'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  index('sessions_account').on(t.accountId, t.createdAt),
  index('sessions_device').on(t.deviceId),
  index('sessions_ip').on(t.ip),
]);

/**
 * Oyuncu × cihaz sayaç tablosu. `sessions` 90 günde budanır ama öbek bilgisi burada kalır
 * (satır sayısı oyuncu×cihaz ile sınırlı → sınırsız büyümez).
 * ⭐ Kabul kriteri: aynı tarayıcıdan iki hesaba girilirse aynı `device_id` iki `player_id` ile görünür.
 */
export const playerDevices = pgTable('player_devices', {
  playerId: bigint('player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull(),
  platform: text('platform'),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  hits: integer('hits').notNull().default(1),
}, (t) => [
  uniqueIndex('player_devices_pk').on(t.playerId, t.deviceId),
  // Analizin ana sorgusu: "bu cihazı kaç oyuncu kullandı?"
  index('player_devices_by_device').on(t.deviceId),
]);

export const playerIps = pgTable('player_ips', {
  playerId: bigint('player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  ip: text('ip').notNull(),
  /** /24 öbeği — mobil operatör NAT'ında tek IP yetmez, öbek daha anlamlı. */
  ipBlock24: text('ip_block_24'),
  asn: text('asn'),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  hits: integer('hits').notNull().default(1),
}, (t) => [
  uniqueIndex('player_ips_pk').on(t.playerId, t.ip),
  index('player_ips_by_block').on(t.ipBlock24),
]);

/**
 * ⭐ OYUNCU ENGELLEME — orijinalde VAR ve bizde eksikti.
 * Kanıt: `g.java` menüsünde "Oyuncuyu Blokla" / "Bloklamayı Kaldır", sunucu ucu `msBlk.do`.
 * Engellenen oyuncu **DM başlatamaz** ve mesajı görünmez (§13.12). Sohbet planındaki
 * `muted_until` bildirim susturmasıydı; bu ise gerçek engelleme listesi — ayrı şey.
 */
export const playerBlocks = pgTable('player_blocks', {
  worldId: smallint('world_id').notNull(),
  /** Engelleyen. */
  playerId: bigint('player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  /** Engellenen. */
  blockedPlayerId: bigint('blocked_player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('player_blocks_pk').on(t.playerId, t.blockedPlayerId),
  index('player_blocks_target').on(t.blockedPlayerId),
]);

/** Analizörün (Faz 4) ürettiği şüphe sinyalleri. Faz 2'de tablo boş durur. */
export const abuseSignals = pgTable('abuse_signals', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id'),
  /** sameDeviceId · oneWayResourceFlow · profitlessAttackFarm · … (§9.1.2) */
  kind: text('kind').notNull(),
  subjectPlayerId: bigint('subject_player_id', { mode: 'number' }),
  relatedPlayerId: bigint('related_player_id', { mode: 'number' }),
  score: integer('score').notNull(),
  evidence: jsonb('evidence').notNull().default({}),
  windowFrom: timestamp('window_from', { withTimezone: true }),
  windowTo: timestamp('window_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  /** Yöneticinin kararı: 'innocent' | 'warned' | 'banned' | 'watch' */
  resolution: text('resolution'),
}, (t) => [
  index('abuse_signals_pair').on(t.subjectPlayerId, t.relatedPlayerId),
  index('abuse_signals_open').on(t.createdAt).where(sql`${t.resolvedAt} IS NULL`),
]);

/**
 * Artımlı tarama çıpası: `window_from` = son BAŞARILI taramanın `window_to`'su.
 * Böylece "son kontrolden sonraki işlemler" tam olarak bir kez incelenir; worker kapalı
 * kalsa bile pencere kaymaz (§9.1.3).
 */
export const abuseScanRuns = pgTable('abuse_scan_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id'),
  windowFrom: timestamp('window_from', { withTimezone: true }).notNull(),
  windowTo: timestamp('window_to', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  signalsFound: integer('signals_found').notNull().default(0),
  playersFlagged: integer('players_flagged').notNull().default(0),
  emailedAt: timestamp('emailed_at', { withTimezone: true }),
}, (t) => [index('abuse_scan_runs_window').on(t.worldId, t.windowTo)]);

/* ═══ GÖREV KUYRUĞU (§1 — sistemin belkemiği) ═══════════════════════════════
 * Görev = oyuncunun "Ordular" ekranında GÖRDÜĞÜ oyun varlığı. Bu yüzden Redis'te değil
 * Postgres'te: kuyruk ile ordu aynı transaction'da değişir, split-brain imkânsız.
 */
export const missions = pgTable('missions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull().references(() => worlds.id),
  type: text('type').notNull(),
  /** scheduled → running → done | failed | canceled */
  status: text('status').notNull().default('scheduled'),
  ownerPlayerId: bigint('owner_player_id', { mode: 'number' }),
  originCityId: bigint('origin_city_id', { mode: 'number' }),
  targetCityId: bigint('target_city_id', { mode: 'number' }),
  targetK: integer('target_k'),
  targetD: integer('target_d'),
  targetS: integer('target_s'),
  /** ⭐ OYUN SAATİNDE. Handler bunu "şimdi" kabul eder, `now()`'ı DEĞİL (§13.10.2 kural 3). */
  executeAt: timestamp('execute_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Hangi worker aldı (crash sonrası bayat kilidi tanımak için). */
  lockedBy: text('locked_by'),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  attempts: smallint('attempts').notNull().default(0),
  lastError: text('last_error'),
  /** Çift-tıklama koruması: aynı anahtarla ikinci görev yazılamaz. */
  idempotencyKey: text('idempotency_key'),
  payload: jsonb('payload').notNull().default({}),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => [
  // Kuyruğun performans temeli: tamamlanmış milyonlarca görev indekste yer kaplamaz.
  index('missions_due').on(t.executeAt, t.id).where(sql`${t.status} = 'scheduled'`),
  index('missions_stale').on(t.lockedAt).where(sql`${t.status} = 'running'`),
  index('missions_target_city').on(t.targetCityId, t.executeAt),
  index('missions_owner').on(t.ownerPlayerId, t.executeAt),
  uniqueIndex('missions_idempotency').on(t.worldId, t.idempotencyKey),
  /* ⭐ Şehir kurma yarışı (2026-07-30): koordinatına şehir kurulan oyuncu yoldaki found_city
   * görevlerini KOORDİNATTAN yakalar — kısmî indeks açık kuruluş seferleriyle sınırlı, boşa yakın. */
  index('missions_found_city_coords').on(t.worldId, t.targetK, t.targetD, t.targetS)
    .where(sql`${t.type} = 'found_city' AND ${t.status} IN ('scheduled', 'running') AND ${t.targetCityId} IS NULL`),
]);

export const missionUnits = pgTable('mission_units', {
  missionId: bigint('mission_id', { mode: 'number' }).notNull()
    .references(() => missions.id, { onDelete: 'cascade' }),
  unitType: text('unit_type').notNull(),
  count: integer('count').notNull(),
}, (t) => [uniqueIndex('mission_units_pk').on(t.missionId, t.unitType)]);

/* ═══ KAHRAMAN (§13.11.4b/c) ════════════════════════════════════════════════
 * Kahraman ADET değil VARLIK: her biri kendi seviyesi, tecrübesi ve yetenek dağılımıyla
 * ayrı satırdır. Öldüğünde silinmez — `status` ile Tapınak'ta diriltme sürecine girer
 * (§13.11.7), yani seviye ve yetenekleri korunur.
 */
export const heroes = pgTable('heroes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull().references(() => worlds.id),
  playerId: bigint('player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  /** Kahramanın durduğu şehir. Seferdeyken NULL (görevde `mission_heroes` tutar). */
  cityId: bigint('city_id', { mode: 'number' }).references(() => cities.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  /**
   * ⭐ Kahramanlar **seviye 0** olarak çıkar (ekran görüntüsüyle doğrulandı: `scr_itv03`,
   * "nart - Seviye 0"). İlk seviye için 500 tecrübe gerekir (`heroXpForLevel(1)`), ekranda
   * `396 / 500` — formül birebir tutuyor.
   */
  level: smallint('level').notNull().default(0),
  xp: bigint('xp', { mode: 'number' }).notNull().default(0),
  /** Yetenek puanları — seviye başına 3 dağıtılır (§13.11.4c). */
  fAtk: integer('f_atk').notNull().default(0),
  fDef: integer('f_def').notNull().default(0),
  mAtk: integer('m_atk').notNull().default(0),
  mDef: integer('m_def').notNull().default(0),
  /**
   * ⭐ KAHRAMAN DURUMU (istemcinin kendi sözlüğü, `g.java`/`k.java`):
   *   `alive`     — şehirde ya da görevde, savaşa katılabilir
   *   `dead`      — savaşta öldü, şehre döndü; oyuncu ÜCRET ödeyip diriltmeli
   *   `reviving`  — diriltme başladı, `reviveUntil`da canlanır ("Diriltiliyor" · iptal edilebilir)
   *   `destroyed` — ordunun tamamıyla birlikte yok oldu; geri getirecek kimse kalmadı.
   *                  `destroyedAt`+1 saat boyunca tapınakta "Yok Edildi" görünür, sonra silinir.
   */
  status: text('status').notNull().default('alive'),
  /** `reviving` iken diriltmenin biteceği an (OYUN saati). */
  reviveUntil: timestamp('revive_until', { withTimezone: true }),
  /** `destroyed` olduğu an — tapınakta 1 saat gösterilip sonra kayıt silinir. */
  destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('heroes_player').on(t.playerId),
  index('heroes_status').on(t.status),
  index('heroes_city').on(t.cityId),
]);

/** Sefere katılan kahramanlar. Kahraman orduyu HIZLANDIRMAZ (§13.5.5) → süre hesabına girmez. */
export const missionHeroes = pgTable('mission_heroes', {
  missionId: bigint('mission_id', { mode: 'number' }).notNull()
    .references(() => missions.id, { onDelete: 'cascade' }),
  heroId: bigint('hero_id', { mode: 'number' }).notNull()
    .references(() => heroes.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('mission_heroes_pk').on(t.missionId, t.heroId),
  // ⭐ Bir kahraman aynı anda YALNIZ BİR seferde olabilir; kısıtı sorgu değil indeks korur.
  uniqueIndex('mission_heroes_hero').on(t.heroId),
]);

/* ═══ SIRALAMA (Komuta Merkezi → Sıralamalar) ═══════════════════════════════
 * ⭐ SIRA CANLI HESAPLANMAZ. Oyun sırayı günde **3 kez** (00:00 · 08:00 · 16:00 oyun saati)
 * dondurur; ekranda görünen "7/68 ▲2" ifadesindeki **değişim** ancak bir ÖNCEKİ donmuş sıra
 * saklanırsa hesaplanabilir. Bu yüzden tablo hem `rank` hem `prev_rank` taşır — türetilemez,
 * geçmiş veridir: anlık görüntü alınmadan kaydedilmezse bir daha geri getirilemez.
 *
 * `kind` çoklu sıralamayı tek tabloda tutar (`player` · `alliance` · `hero`) — üçü de aynı
 * "sırala, öncekini kaydır" işleminden geçtiği için ayrı tablo aynı kodu üç kez yazdırırdı.
 * `subject_id` bu yüzden FK DEĞİL: işaret ettiği tablo `kind`'a göre değişir.
 */
export const rankings = pgTable('rankings', {
  worldId: smallint('world_id').notNull(),
  /** player | alliance | hero */
  kind: text('kind').notNull(),
  subjectId: bigint('subject_id', { mode: 'number' }).notNull(),
  rank: integer('rank').notNull(),
  /** Bir önceki anlık görüntüdeki sıra. NULL = listeye ilk kez girdi. */
  prevRank: integer('prev_rank'),
  /** Sıralamayı belirleyen sayı: oyuncuda puan, kahramanda seviye×1e9+tecrübe. */
  score: bigint('score', { mode: 'number' }).notNull().default(0),
  takenAt: timestamp('taken_at', { withTimezone: true }).notNull(),
}, (t) => [
  uniqueIndex('rankings_pk').on(t.worldId, t.kind, t.subjectId),
  index('rankings_order').on(t.worldId, t.kind, t.rank),
]);

/** Anlık görüntünün ne zaman alındığı — ekranda "son güncelleme" ve "sıradaki" bundan yazılır. */
export const rankingRuns = pgTable('ranking_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull(),
  /** OYUN saatinde — bakımda duran saat sıralama takvimini de kaydırır. */
  takenAt: timestamp('taken_at', { withTimezone: true }).notNull(),
  entries: integer('entries').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('ranking_runs_world_taken').on(t.worldId, t.takenAt)]);

/* ═══ SAVAŞ KAYDI (§5 determinizm + §13.10) ═════════════════════════════════
 * ⭐ Savaş **yeniden oynatılabilir** olmak zorundadır: `rng_seed` + `engine_version` +
 * `catalog_hash` + `input` birlikte saklanır. "O savaş neden böyle bitti" sorusuna kanıtla
 * cevap verilir; motor sürümü değişse bile eski savaşın hangi dengeyle çözüldüğü bellidir.
 */
export const battles = pgTable('battles', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull().references(() => worlds.id),
  /** Savaşı doğuran saldırı görevi (tekil → aynı görev iki savaş üretemez). */
  missionId: bigint('mission_id', { mode: 'number' }).references(() => missions.id, { onDelete: 'set null' }),
  attackerPlayerId: bigint('attacker_player_id', { mode: 'number' }),
  defenderPlayerId: bigint('defender_player_id', { mode: 'number' }),
  attackerCityId: bigint('attacker_city_id', { mode: 'number' }),
  defenderCityId: bigint('defender_city_id', { mode: 'number' }),
  /** Savaş anı — OYUN saatinde (`mission.execute_at`), `now()` değil (§13.10.2 kural 3). */
  at: timestamp('at', { withTimezone: true }).notNull(),
  winner: text('winner').notNull(), // attacker | defender | draw
  night: boolean('night').notNull().default(false),
  rngSeed: bigint('rng_seed', { mode: 'number' }).notNull(),
  engineVersion: text('engine_version').notNull(),
  catalogHash: text('catalog_hash').notNull(),
  /** Motora verilen TAM girdi (yeniden oynatma için yeterli). */
  input: jsonb('input').notNull(),
  /** Motor çıktısı + ganimet dökümü. Rapor ekranı bunu okur. */
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('battles_mission').on(t.missionId),
  index('battles_defender').on(t.defenderPlayerId, t.at),
  index('battles_attacker').on(t.attackerPlayerId, t.at),
]);

/**
 * Oyuncu posta kutusu — savaş raporu, dönüş raporu, sistem duyurusu.
 * Sohbetten AYRIDIR: sohbet anlık ve kanal bazlı, bu kalıcı ve oyuncu bazlı.
 * `body` yapısal (jsonb) tutulur → rapor metni sunumda üretilir, dilden bağımsız kalır.
 */
export const messages = pgTable('messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull().references(() => worlds.id),
  playerId: bigint('player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  /** battle_report · spy_report · transport_report · support_report · found_city_report · system (return_report yalnız eski kayıtlarda — dönüş artık rapor üretmez, 2026-07-30) */
  kind: text('kind').notNull(),
  /** Oyuncunun bu raporda hangi tarafta olduğu: attacker | defender | owner */
  side: text('side'),
  battleId: bigint('battle_id', { mode: 'number' }).references(() => battles.id, { onDelete: 'cascade' }),
  missionId: bigint('mission_id', { mode: 'number' }),
  subject: text('subject').notNull(),
  body: jsonb('body').notNull().default({}),
  /** OYUN saatinde — rapor "ne zaman oldu" der, "ne zaman yazıldı" demez. */
  at: timestamp('at', { withTimezone: true }).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('messages_player').on(t.playerId, t.id),
  index('messages_unread').on(t.playerId).where(sql`${t.readAt} IS NULL`),
]);

/**
 * ⭐ TRANSACTIONAL OUTBOX (§1): bildirim satırı, onu doğuran oyun mutasyonuyla AYNI
 * transaction'da yazılır → "savaş oldu ama rapor gitmedi" durumu imkânsız.
 */
export const outbox = pgTable('outbox', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id'),
  topic: text('topic').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  attempts: smallint('attempts').notNull().default(0),
  lastError: text('last_error'),
}, (t) => [
  index('outbox_pending').on(t.id).where(sql`${t.dispatchedAt} IS NULL`),
]);

/** Kaynak/asker değiştiren HER işlem before/after ile buraya yazılır (§8). */
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id'),
  playerId: bigint('player_id', { mode: 'number' }),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: bigint('entity_id', { mode: 'number' }),
  before: jsonb('before'),
  after: jsonb('after'),
  traceId: text('trace_id'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('audit_player').on(t.playerId, t.at),
  index('audit_entity').on(t.entity, t.entityId, t.at),
]);

/* ═══ SOHBET (§13.12) ═══════════════════════════════════════════════════════
 * DÜNYA YALITIMI: her kanal world_id taşır; dm_key PLAYER id'lerinden üretilir (account'tan ASLA)
 * → aynı hesabın iki dünyadaki oyuncusu birbirine mesaj atamaz.
 */
export const chatChannels = pgTable('chat_channels', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull().references(() => worlds.id),
  kind: text('kind').notNull(), // global | alliance | dm
  allianceId: bigint('alliance_id', { mode: 'number' }), // FK Faz 4'te
  dmKey: text('dm_key'), // least(a,b):greatest(a,b)
  slowModeS: smallint('slow_mode_s').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('chat_channels_world_dm').on(t.worldId, t.dmKey),
  index('chat_channels_world_kind').on(t.worldId, t.kind),
]);

export const chatParticipants = pgTable('chat_participants', {
  channelId: bigint('channel_id', { mode: 'number' }).notNull()
    .references(() => chatChannels.id, { onDelete: 'cascade' }),
  playerId: bigint('player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  // Okunmamış sayısı buradan türetilir: COUNT(id > lastReadMessageId)
  lastReadMessageId: bigint('last_read_message_id', { mode: 'number' }).notNull().default(0),
  /**
   * ⭐ TEK TARAFLI SOHBET SİLME (kullanıcı, 2026-07-31): "sohbeti sil" bu çıpayı son mesajın
   * id'sine zıplatır; o oyuncunun geçmiş sorgusu `id > cleared_before_message_id` ile filtreler.
   *
   * Neden `deleted_at` DEĞİL: kullanıcının istediği "sonra gelen yeni mesajla sohbet yeniden
   * görünür ama eskiler gelmez" davranışı bu tek kolondan bedava çıkıyor. `deleted_at` olsaydı
   * her yeni mesaj yolunda onu NULL'a çekmeyi hatırlamak gerekirdi — unutulacak bir adım.
   * "İki taraf da silerse veri sunucuda kalır, yalnız bağ kopar" da kendiliğinden sağlanır:
   * `chat_messages` satırlarına hiç dokunulmaz, iki tarafın da görünür penceresi boşalır.
   */
  clearedBeforeMessageId: bigint('cleared_before_message_id', { mode: 'number' }).notNull().default(0),
  mutedUntil: timestamp('muted_until', { withTimezone: true }),
  notify: boolean('notify').notNull().default(true),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('chat_participants_pk').on(t.channelId, t.playerId),
  /** "Sohbetlerim" listesi: oyuncunun kanalları tek indeks taramasıyla gelir. */
  index('chat_participants_player').on(t.playerId),
]);

export const chatMessages = pgTable('chat_messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  channelId: bigint('channel_id', { mode: 'number' }).notNull()
    .references(() => chatChannels.id, { onDelete: 'cascade' }),
  worldId: smallint('world_id').notNull(),
  senderId: bigint('sender_id', { mode: 'number' }), // null = sistem duyurusu
  body: text('body').notNull(), // düz metin, ≤500 karakter (sunucu doğrular)
  clientMsgId: uuid('client_msg_id'), // idempotency
  isPinned: boolean('is_pinned').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: bigint('deleted_by', { mode: 'number' }),
}, (t) => [
  index('chat_messages_channel_id_desc').on(t.channelId, t.id),
  uniqueIndex('chat_messages_client_msg').on(t.channelId, t.clientMsgId),
]);

export const chatBans = pgTable('chat_bans', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull(),
  playerId: bigint('player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(), // global | all
  until: timestamp('until', { withTimezone: true }),
  reason: text('reason'),
  createdBy: bigint('created_by', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('chat_bans_player').on(t.playerId, t.until)]);

/**
 * ⭐ ŞİKAYET KAYDI (§13.12.4) — yalnız KAYIT üretir, otomatik ceza YOK (§9.1.1 değişmezi).
 * Moderasyon paneli sonraki tur; kullanıcı: *"ileride bir anlaşmazlık durumunda veya hukuki
 * olarak yöneticinin işine yarayabilir"*.
 *
 * ⚠️ FK'lerde CASCADE **bilerek yok** (yalnız `reporter_id` hariç): şikayet kaydı şikayet
 * ettiği mesajdan, kanaldan ve hatta hedef oyuncudan **uzun yaşamalı**. Bu yüzden hedef
 * oyuncu ve gövde DENORMALİZE tutulur.
 */
export const chatReports = pgTable('chat_reports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull(),
  channelId: bigint('channel_id', { mode: 'number' }).notNull(),
  /** null = tüm sohbet/oyuncu şikayeti; dolu = tek mesaj şikayeti. */
  messageId: bigint('message_id', { mode: 'number' }),
  reporterId: bigint('reporter_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  /** Denormalize: mesaj/kanal silinse de kimin şikayet edildiği kalır. */
  reportedPlayerId: bigint('reported_player_id', { mode: 'number' }).notNull(),
  /** spam | abuse | scam | cheating | other */
  reason: text('reason').notNull(),
  note: text('note'),
  /** ⭐ Şikayet ANINDAKİ gövde kopyası — retention silse de kanıt durur. */
  bodySnapshot: text('body_snapshot'),
  status: text('status').notNull().default('open'), // open | reviewed | actioned | dismissed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: bigint('reviewed_by', { mode: 'number' }),
  resolution: text('resolution'),
}, (t) => [
  index('chat_reports_open').on(t.status, t.createdAt),
  index('chat_reports_target').on(t.reportedPlayerId),
  /** Aynı oyuncu aynı mesajı iki kez şikayet edemez (oyuncu şikayeti tekrarlanabilir). */
  uniqueIndex('chat_reports_once').on(t.reporterId, t.messageId)
    .where(sql`${t.messageId} IS NOT NULL`),
]);

export const playersRelations = relations(players, ({ one, many }) => ({
  account: one(accounts, { fields: [players.accountId], references: [accounts.id] }),
  world: one(worlds, { fields: [players.worldId], references: [worlds.id] }),
  cities: many(cities),
}));

export const citiesRelations = relations(cities, ({ one, many }) => ({
  player: one(players, { fields: [cities.playerId], references: [players.id] }),
  buildings: many(buildings),
}));
