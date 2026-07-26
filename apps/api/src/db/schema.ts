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
  bigint, bigserial, boolean, index, integer, jsonb, pgTable, smallint, text, timestamp,
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
  // Kaynaklar numeric değil çift-hassasiyet DEĞİL: tembel birikim kayıpsız olsun diye text-numeric
  // yerine bigint+kesir tutmuyoruz; drizzle numeric mode'u Faz 1'de `resources_at` çıpasıyla gelir.
  gold: bigint('gold', { mode: 'number' }).notNull().default(0),
  food: bigint('food', { mode: 'number' }).notNull().default(0),
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
