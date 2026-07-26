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
  uniqueIndex, uuid,
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
  speedMultiplier: integer('speed_multiplier').notNull().default(1),
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
  score: bigint('score', { mode: 'number' }).notNull().default(0),
  isPremium: boolean('is_premium').notNull().default(false),
  protectedUntil: timestamp('protected_until', { withTimezone: true }),
  vacationUntil: timestamp('vacation_until', { withTimezone: true }),
  allianceId: bigint('alliance_id', { mode: 'number' }),
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('players_world_username').on(t.worldId, t.username),
  uniqueIndex('players_world_account').on(t.worldId, t.accountId),
  index('players_world_score').on(t.worldId, t.score),
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
]);

export const missionUnits = pgTable('mission_units', {
  missionId: bigint('mission_id', { mode: 'number' }).notNull()
    .references(() => missions.id, { onDelete: 'cascade' }),
  unitType: text('unit_type').notNull(),
  count: integer('count').notNull(),
}, (t) => [uniqueIndex('mission_units_pk').on(t.missionId, t.unitType)]);

/* ═══ KAHRAMAN (§13.11.4b/c) ════════════════════════════════════════════════
 * Kahraman ADET değil VARLIK: her biri kendi seviyesi, tecrübesi ve yetenek dağılımıyla
 * ayrı satırdır. Öldüğünde silinmez — `dead_until` ile Tapınak'ta diriltme sürecine girer
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
  /** Öldüyse dirilene kadar (OYUN saati). NULL = yaşıyor. */
  deadUntil: timestamp('dead_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('heroes_player').on(t.playerId),
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
  /** battle_report | return_report | system */
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
  mutedUntil: timestamp('muted_until', { withTimezone: true }),
  notify: boolean('notify').notNull().default(true),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('chat_participants_pk').on(t.channelId, t.playerId)]);

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

export const playersRelations = relations(players, ({ one, many }) => ({
  account: one(accounts, { fields: [players.accountId], references: [accounts.id] }),
  world: one(worlds, { fields: [players.worldId], references: [worlds.id] }),
  cities: many(cities),
}));

export const citiesRelations = relations(cities, ({ one, many }) => ({
  player: one(players, { fields: [cities.playerId], references: [players.id] }),
  buildings: many(buildings),
}));
