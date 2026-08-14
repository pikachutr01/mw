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
  bigint, bigserial, boolean, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey,
  smallint, text, timestamp, uniqueIndex, uuid, type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const worlds = pgTable('worlds', {
  id: smallint('id').primaryKey(),
  name: text('name').notNull(),
  state: text('state').notNull().default('running'), // running | maintenance | archived
  /**
   * ⛔⛔ **EMEKLİ — 0043'ten (tek zaman çizgisi) beri DAİMA 0. Hiçbir kod onu okumuyor.**
   *
   * Eski model: `gameNow = (paused_at ?? now()) − clock_offset_ms`, yani dünyanın toplam
   * duraklama süresi burada birikiyordu ve veritabanındaki her damga "hangi saatte yazıldı?"
   * sorusunu sordurmuş oluyordu. O soru ~10 yerde yanlış cevaplandı, ikisi canlıya çıktı.
   * Yeni model: `gameNow == now() == UTC`; bakımdan çıkarken bekleyen vadeler duraklama süresi
   * kadar ileri kaydırılıyor (`world/time-registry.ts` · `world/time-shift.ts`).
   *
   * ⚠️ Sütun **bilerek DÜŞÜRÜLMEDİ** (expand-contract): `surum-yayinla.sh` sırası
   * *göç → symlink → reload*, yani göç koşarken ESKİ kod hâlâ çalışıyor ve bu sütunu okuyor.
   * Ayrıca sağlık kontrolü düşüp koda geri dönülürse eski kod `now() − 0` ile **doğru** çalışır.
   * `DROP COLUMN` bir SONRAKİ dağıtımın işi — bu dağıtımda yapmak geri dönüş yolunu keserdi.
   */
  clockOffsetMs: bigint('clock_offset_ms', { mode: 'number' }).notNull().default(0),
  /** Bakım başlangıcı (gerçek zaman). NULL = dünya çalışıyor. */
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  /**
   * Perdede oyuncuya AYNEN gösterilecek metin. NULL ise istemci genel bir cümle yazar —
   * metnin yokluğu bakımı gizlememeli.
   */
  maintenanceNotice: text('maintenance_notice'),
  /**
   * ⚠️ Tahmini bitiş GERÇEK ZAMANDA: bakımda oyun saati donuyor, bunu oyun saatinde
   * tutsaydık perdedeki geri sayım hiç ilerlemezdi.
   */
  maintenanceEta: timestamp('maintenance_eta', { withTimezone: true }),
  maintenanceBy: bigint('maintenance_by', { mode: 'number' }),
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
  /**
   * ⭐ Hesabını silen oyunculara verilen anonim adın sayacı (`hükümdar1`, `hükümdar2`…).
   * DÜNYA BAŞINA: kullanıcı adı tekilliği `(world_id, username)` üzerinde, sayılar küçük kalır.
   * ⚠️ `SELECT … FOR UPDATE` ile kilitlenip artırılır — iki eşzamanlı silme aynı adı üretemez.
   */
  deletedPlayerSeq: integer('deleted_player_seq').notNull().default(0),
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
  /**
   * ⭐ BİLDİRİM TERCİHLERİ (§7.2) — `{ attack: false, production: false }` gibi.
   *
   * **Eksik anahtar = kategori varsayılanı** (`NOTIFY_DEFAULTS`), `false` = kapalı. Bu yüzden
   * boş `{}` "hepsi varsayılan" demektir ve yeni bir kategori eklendiğinde eski satırlara
   * dokunmak gerekmez — kolon eklemek yerine jsonb seçilmesinin tek sebebi bu.
   *
   * Tema/dil gibi HESAP düzeyinde: abonelik tarayıcıya ait, tarayıcı hesaba.
   */
  notifyPrefs: jsonb('notify_prefs').notNull().default({}),
  /**
   * ⭐ YETKİ — `player | moderator | admin` (§admin paneli Faz 0).
   *
   * HESAP düzeyinde çünkü yetki dünyalardan bağımsız: bir admin her dünyayı yönetir. Oyuncu
   * içi roller (ittifak lideri/konsey) ayrı yerde (`players.alliance_role`).
   *
   * ⚠️ Bu değer **access token'a gömülmez**; `AdminGuard` her istekte buradan okur. Token'a
   * gömseydik rol geri alındığında 15 dakika (token ömrü) boyunca geçerli kalırdı.
   */
  role: text('role').notNull().default('player'),
  /**
   * ⭐ Nokta ve `+etiket` temizlenmiş POSTA KUTUSU kimliği (2026-08-04).
   * `ahmet+1@gmail.com`, `ahmet+2@gmail.com` ve `ah.met@gmail.com` aynı kutudur; üçü de
   * doğrulama postasını alır ve bugüne kadar üçü de ayrı hesap sayılıyordu.
   * ⚠️ BENZERSİZ DEĞİL: aynı kutudan ikinci hesap tek başına suç değil (aile, iş hesabı).
   * Kolonun işi yakalamak değil GÖRÜNÜR KILMAK.
   */
  emailNormalized: text('email_normalized'),
  /** Hesabın DOĞDUĞU andaki IP. `player_ips`ten ayrı: orası oyuncu (dünya) düzeyinde. */
  signupIp: text('signup_ip'),
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
  /**
   * ⭐ TATİL MODU (0035). Üç kolon birlikte okunur:
   *   `vacationUntil`   → planlanmış **otomatik çıkış** anı. ⚠️ **`NULL` ⇔ tatilde DEĞİL** —
   *                       kanonik yüklem budur, `> now()` DEĞİL (gerekçe: göç dosyası §2,
   *                       worker gecikirse 30 günlük kaynağın bankalanmasını engelliyor).
   *   `vacationSince`   → giriş anı; 48 saatlik alt sınır buradan sayılır.
   *   `vacationEndedAt` → son çıkış; 3 günlük yeniden giriş beklemesi buradan.
   * DB CHECK'i `since` ile `until`ı çift olmaya zorluyor (`players_vacation_pair`).
   */
  vacationUntil: timestamp('vacation_until', { withTimezone: true }),
  vacationSince: timestamp('vacation_since', { withTimezone: true }),
  vacationEndedAt: timestamp('vacation_ended_at', { withTimezone: true }),
  /**
   * ⭐ Bu tatili bitirecek `vacation_end` görevinin kimliği (0043).
   *
   * ⚠️ Handler eskiden "bu görev BU tatile mi ait?" sorusunu `payload.since` ile
   * `vacation_since`i ISO dize olarak karşılaştırarak cevaplıyordu. Tek zaman çizgisinde
   * `vacation_since` bakımda kaydırılıyor, JSONB'deki kopya kaydırılmıyor → eşitlik tutmaz,
   * handler sessizce no-op'a düşer ve oyuncu **sonsuza kadar tatilde kalır**. Kimlik
   * kaymaya duyarsız; `endVacation()` diğer tatil alanlarıyla birlikte temizliyor.
   */
  vacationMissionId: bigint('vacation_mission_id', { mode: 'number' }),
  /** İttifak üyeliği (§13.15b). FK döngüsel olduğu için tembel referans (alliances aşağıda). */
  allianceId: bigint('alliance_id', { mode: 'number' })
    .references((): AnyPgColumn => alliances.id, { onDelete: 'set null' }),
  /**
   * ⭐ İTTİFAK ROLÜ — orijinal istemcinin `q` alanı (`k.java`): **1 Asker · 2 Konsey Üyesi ·
   * 3 Lider**, ittifaksızken NULL. `alliance_members` ara tablosu yerine kolon: oyuncu aynı anda
   * tek ittifakta olabilir, her sorguda JOIN taşımak gereksiz.
   */
  allianceRole: smallint('alliance_role'),
  /**
   * ⭐ İTTİFAĞA KATILMA ANI — ittifak sohbetindeki acemi kısıtının ölçütü (§13.15c).
   *
   * ⚠️ `created_at` bu iş için KULLANILAMAZ: o DÜNYAYA katılma anı. Aylardır oynayan bir
   * oyuncu yeni bir ittifağa girip anında bağırabilirdi — kısıt tam da bunu engelliyor.
   *
   * ⚠️ Ayrılma/atılma/dağıtmada **NULL'a çekilir**: geri katılan süreyi YENİDEN bekler.
   * Aksi hâlde "çık-gir" kısıtın kaçış yolu olurdu. Bunu yazan DÖRT kod yolu var
   * (`applyMembership`, `decide()`, `disbandInner`, `detachForPurge`) — biri unutulursa
   * servis fail-closed davranıp o oyuncuyu yazdırmaz, yani hata sessiz kalmaz.
   */
  allianceJoinedAt: timestamp('alliance_joined_at', { withTimezone: true }),
  /**
   * ⭐ SIRALAMA MUAFİYETİ (kullanıcı, 2026-08-03) — yönetici/servis hesaplarını vitrinden gizler.
   *
   * ⚠️ İki ayrı bayrak, bilerek: "listede görünmesin ama ittifakının puanına katkısı sayılsın"
   * gerçek bir durum (ittifakında oynayan bir yönetici). Tek bayrak bunu imkânsız kılardı.
   *
   * ⚠️ **Kahraman sıralaması ikisinden de etkilenmez** (kullanıcı şartı) — o liste `heroes`
   * tablosundan geliyor ve sahibinin bayrağına bakmıyor.
   */
  rankingExcluded: boolean('ranking_excluded').notNull().default(false),
  allianceScoreExcluded: boolean('alliance_score_excluded').notNull().default(false),
  /**
   * ⭐ ASKERÎ ÜNVAN (kullanıcı, 2026-08-03) — bir savaşta öldürülen ordunun kaynak bedeli
   * eşiği geçince kazanılan **süreli** rozet. Formül ve eşikler `@mobilwar/catalog` · `merit.ts`.
   *
   * ⚠️ Süresi dolanı temizleyen bir görev YOK: okuma anında `merit_expires_at > gameNow`
   * süzülüyor (§3 "tembel" kararı). Yani bu sütunlar geçmiş değerler taşıyabilir — okuyan
   * her sorgu süzmek ZORUNDA, yoksa süresi bitmiş ünvan ekranda kalır.
   *
   * ⚠️ Zamanlar OYUN saatinde: bakımda duran dünyada ünvan süresi de durmalı.
   *
   * ⚠️ Görünürlük sorguda: yalnız ittifak listesi ve oyuncunun kendisi. Dünya/Sıralama/Arama
   * ekranlarına sızarsa "bu oyuncu yeni büyük savaş verdi" istihbaratı bedavaya dağıtılır.
   */
  meritTier: smallint('merit_tier'),
  meritScore: bigint('merit_score', { mode: 'number' }),
  meritBattleId: bigint('merit_battle_id', { mode: 'number' }),
  meritGrantedAt: timestamp('merit_granted_at', { withTimezone: true }),
  meritExpiresAt: timestamp('merit_expires_at', { withTimezone: true }),
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  /**
   * ⭐ HESABINI SİLDİ (2026-08-01). Satır **kalıyor** ve 2026-08-13'ten beri satırın etrafındaki
   * her şey de kalıyor: şehirler, oyuncu adı, puan, sıralamalar, ittifak rütbesi. Silinen
   * yalnız hesap tarafı (`accounts.email`, parola, oturum, jeton, push).
   *
   * ⚠️ Bu kolon bir **iç işaret**: oyun sorgularının hiçbiri okumuyor — okusaydı zaten
   * kullanıcının şartını çiğnerdi (*"diğer oyuncular bu hesabın silindiğini anlayamasın"*).
   * İki okuyucusu var: giriş kapısı (`auth.service` → `login`) ve yönetici paneli.
   * ⚠️ `purge-player` de bunu yazıyor ama oradaki anlamı farklı — orada şehirler gerçekten yok.
   */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('players_world_username').on(t.worldId, t.username),
  uniqueIndex('players_world_account').on(t.worldId, t.accountId),
  index('players_world_score').on(t.worldId, t.score),
  // "Bu ittifakın üyeleri" sorgusu (üye listesi, puan toplamı, sıralama) tam bu indeksle çalışır.
  index('players_alliance').on(t.worldId, t.allianceId),
  /**
   * ⭐ OYUNCU ARAMASI (§13.18). Yukarıdaki `players_world_username` büyük/küçük harfe
   * DUYARLI, bu yüzden `lower(username) LIKE 'ay%'` sorgusunda **hiç kullanılamıyor** —
   * arama index'siz tam tablo taraması olurdu.
   *
   * `text_pattern_ops` şart: varsayılan collation'da `LIKE 'önek%'` btree indeksini
   * kullanamaz (sıralama kuralları eşleşmez). Bu operatör sınıfı bayt sırası kullanır ve
   * önek aramasını indeksli hâle getirir. İnfix (`%q%`) hâlâ tarama ister — onun için
   * `pg_trgm` + GIN gerekir, beta için gereksiz.
   */
  index('players_world_username_lower')
    .on(t.worldId, sql`lower(${t.username}) text_pattern_ops`),
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
   * bitene kadar YENİ savunma birimi emri verilemez (§13.21.2). ⚠️ Süren emirler etkilenmez
   * (kullanıcı, 2026-08-11) — bu ikisi 2026-08-11'e kadar aynı şeydi.
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
  /**
   * ⭐ ZİNCİR KİMLİĞİ (§admin Faz 3) — ilk girişte üretilir, her `refresh()`te **taşınır**.
   *
   * ⚠️ Bir CİHAZ = bir zincir, bir SATIR = bir token nesli. Dönmeli refresh her yenilemede
   * yeni satır açtığı için satır kimliği cihazı temsil edemez: oyuncunun telefonu listede 15
   * dakikada bir yeni bir satır gibi görünürdü ve "bu cihazı çıkar" dediği satır zaten ölü
   * olurdu. Liste zincir başına tek satır gösterir, iptal tüm zinciri kapatır.
   */
  chainId: uuid('chain_id').notNull(),
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
  /**
   * ⭐ ADIM YÜKSELTME (§admin Faz 0) — yıkıcı admin işlemlerinde parola yeniden sorulur ve
   * yükseltme bu ana kadar geçerli sayılır.
   *
   * Neden TOKEN'da değil OTURUMDA: access token durumsuz ve imzalı; içine yazılan yükseltme
   * geri alınamazdı. Burada durunca "yükseltmeyi iptal et" tek UPDATE.
   */
  elevatedUntil: timestamp('elevated_until', { withTimezone: true }),
}, (t) => [
  index('sessions_account').on(t.accountId, t.createdAt),
  index('sessions_device').on(t.deviceId),
  index('sessions_ip').on(t.ip),
]);

/**
 * ⭐ TEK CİHAZ KURALI (kullanıcı, 2026-08-03) — hesap başına **tek satır**: şu an nerede açık.
 *
 * ⚠️ Anahtar `sessions.id` DEĞİL `instance_id`. Aynı tarayıcının iki sekmesi aynı
 * `localStorage`ı ve dolayısıyla aynı oturum satırını paylaşır; `sessions` sekmeleri ayırt
 * edemez. `instance_id` **web'de `sessionStorage`**ta üretilir → yeni sekme yeni kimlik, sayfa
 * yenileme aynı kimlik. Mobilde (Flutter) sekme kavramı yok, orada **kalıcı** bir kimlik
 * kullanılır — tam sözleşme `presence.service.ts` başlığında. Kimlik doğrulamada ASLA
 * kullanılmaz (taklit edilebilir); yalnız "bu istek sahibinden mi geliyor" karşılaştırması için.
 *
 * ⚠️ Zorlama tek koşula bağlı: `session.singleDevice` (varsayılan AÇIK, panelden kapatılabilir).
 *
 * ⚠️⚠️ **Buradaki eski not YANLIŞTI** ve kuralın hiç çalışmadığının fark edilmesini geciktirdi:
 * *"Tablo her ortamda yazılır — kural kapalıyken bile kim nerede bilgisi doğru kalsın"* diyordu.
 * Oysa her iki yazma yolu da (`auth.guard.ts`, `realtime.gateway.ts`) bayrağın ARKASINDAYDI →
 * kural kapalıyken tablo **tamamen boş** kalıyordu. Nitekim 2026-08-12'de canlıda ölçüldü:
 * sıfır satır. Yani "açıldığı gün boş bir tabloya bakılmasın" tam olarak gerçekleşen şeydi.
 * Bugün de tablo yalnız kural AÇIKKEN yazılıyor; fark, kuralın artık varsayılan olarak açık olması.
 */
export const accountPresence = pgTable('account_presence', {
  accountId: bigint('account_id', { mode: 'number' }).primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  instanceId: text('instance_id').notNull(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  worldId: smallint('world_id'),
  platform: text('platform'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  /** Sahibin son ses verdiği an — GERÇEK saat. Zaman aşımı buradan ölçülür. */
  seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('account_presence_seen').on(t.seenAt),
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
  /**
   * ⭐ Mobil künye (2026-08-04). Başlıklar `device-context.ts`te ZATEN ayrıştırılıyordu ve
   * `sessions`a yazılıyordu; oraya yazmak yetmiyor çünkü `sessions` 90 günde budanıyor.
   * Kalıcı korelasyon değeri sayaç tablosunda durmalı. Flutter geldiğinde şema değişmeyecek.
   */
  osVersion: text('os_version'),
  deviceModel: text('device_model'),
  appVersion: text('app_version'),
  timezone: text('timezone'),
  locale: text('locale'),
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
  /**
   * ⚠️ Bu kolon 0002'den beri vardı ve **hiç doldurulmuyordu**. 2026-08-04'te `AsnService`
   * (iptoasn.com anlık görüntüsü) devreye girdi.
   */
  asn: text('asn'),
  /** AS adı — "mobil operatör NAT'ı mı" sorusunun TAHMİN değil KANIT hâli. */
  asnName: text('asn_name'),
  /** ISO 3166-1 alpha-2. Öncelik Cloudflare `CF-IPCountry`, yoksa iptoasn ülke sütunu. */
  country: text('country'),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  hits: integer('hits').notNull().default(1),
}, (t) => [
  uniqueIndex('player_ips_pk').on(t.playerId, t.ip),
  index('player_ips_by_block').on(t.ipBlock24),
  /**
   * ⚠️ `player_ips_pk`in öneki `player_id`, yani "bu TAM IP'yi kim kullandı" sorgusuna
   * uymuyordu. Tam IP eşleşmesi /24'ten çok daha güçlü bir sinyal; sorgusu da olmalı.
   */
  index('player_ips_by_ip').on(t.ip),
]);

/**
 * ⭐ IP → ASN ARALIK TABLOSU — iptoasn.com anlık görüntüsü (Public Domain, saatlik).
 *
 * ⚠️ **İstek başına API yerine yerel tablo, çünkü GİZLİLİK.** Bir geolocation servisi
 * çağırmak her oyuncunun IP'sini üçüncü tarafa göndermek demekti; §9.1.5 oyunculara
 * birbirinin IP'sini göstermeyi yasaklarken onu bir satıcıya akıtmak daha büyük ihlal olurdu.
 *
 * ⚠️ `numeric(39,0)`: aralıklar CIDR sınırlarına oturmuyor (`inet` + `<<=` veriyi bozardı) ve
 * IPv6 128 bit — `bigint` bile taşar.
 */
export const ipAsnRanges = pgTable('ip_asn_ranges', {
  family: smallint('family').notNull(),
  rangeStart: numeric('range_start', { precision: 39, scale: 0 }).notNull(),
  rangeEnd: numeric('range_end', { precision: 39, scale: 0 }).notNull(),
  /**
   * 0 = kayıtsız/duyurulmamış aralık; iptoasn bunları da listeliyor.
   * ⚠️ `bigint`, `integer` DEĞİL: AS numaraları 32 bit **işaretsiz** (RFC 6793) ve Postgres
   * `integer` işaretli — gerçek veri kümesindeki AS4230120000 taşırıyordu.
   */
  asn: bigint('asn', { mode: 'number' }).notNull(),
  country: text('country'),
  description: text('description'),
}, (t) => [index('ip_asn_ranges_lookup').on(t.family, t.rangeStart)]);

/**
 * ⭐ Tek kullanımlık e-posta alanları — CC0 liste anlık görüntüsü (§9.1.7).
 * ⚠️ 110.000+ alanlık toplu listeler yerine ~8.200 alanlık KÜRATÖRLÜ liste seçildi: bu oyunda
 * yanlış pozitifin bedeli asimetrik — engellenen gerçek oyuncu geri gelmez.
 */
export const disposableDomains = pgTable('disposable_domains', {
  domain: text('domain').primaryKey(),
});

export const disposableMeta = pgTable('disposable_meta', {
  id: smallint('id').primaryKey().default(1),
  source: text('source').notNull(),
  rows: integer('rows').notNull().default(0),
  refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tek satırlık tazelik künyesi — "bu veri ne kadar eski" panelde görünüyor. */
export const ipAsnMeta = pgTable('ip_asn_meta', {
  id: smallint('id').primaryKey().default(1),
  source: text('source').notNull(),
  rows: integer('rows').notNull().default(0),
  refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
});

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

/**
 * Analizörün ürettiği şüphe sinyalleri.
 *
 * ⚠️ Çift **SIRALI** tutulur (`subject_player_id < related_player_id`): (A,B) ile (B,A) aynı
 * ilişkidir ve iki satır olarak dururlarsa skor iki kez sayılır. Kural `link.service.ts`te ve
 * `abuse_signals_unique_open` kısmi indeksinde yaşıyor.
 */
export const abuseSignals = pgTable('abuse_signals', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id'),
  /** sameDevice · sameIp · sameIpBlock · registrationCohort · sessionHandoff (§9.1.2) */
  kind: text('kind').notNull(),
  subjectPlayerId: bigint('subject_player_id', { mode: 'number' }),
  relatedPlayerId: bigint('related_player_id', { mode: 'number' }),
  score: integer('score').notNull(),
  evidence: jsonb('evidence').notNull().default({}),
  windowFrom: timestamp('window_from', { withTimezone: true }),
  windowTo: timestamp('window_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  /** Yöneticinin kararı: 'innocent' | 'watch' | 'warned' | 'banned'. Sistem ASLA yazmaz. */
  resolution: text('resolution'),
  resolvedBy: bigint('resolved_by', { mode: 'number' }),
  note: text('note'),
}, (t) => [
  index('abuse_signals_pair').on(t.subjectPlayerId, t.relatedPlayerId),
  index('abuse_signals_open').on(t.createdAt).where(sql`${t.resolvedAt} IS NULL`),
  index('abuse_signals_score').on(t.score).where(sql`${t.resolvedAt} IS NULL`),
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
  /** ⚠️ ÜZERİNE YAZILIR — hata geçmişi için `mission_errors` (0044). */
  lastError: text('last_error'),
  /** Çift-tıklama koruması: aynı anahtarla ikinci görev yazılamaz. */
  idempotencyKey: text('idempotency_key'),
  payload: jsonb('payload').notNull().default({}),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  /**
   * ⭐ ZAMAN KÜNYESİ (0044) — iki farklı arıza tek sayıya sıkışmıştı.
   *
   * `lagMs` KUYRUKTA bekleme (`claimed_at − execute_at`), `durationMs` HANDLER süresi
   * (`finished_at − claimed_at`). Birincisi altyapı arızası, ikincisi performans sorunu;
   * `finished_at − execute_at` farkı ikisini toplayıp ayırt edilemez kılıyordu.
   */
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  lagMs: bigint('lag_ms', { mode: 'number' }),
  durationMs: integer('duration_ms'),
  /** ⚠️ `locked_by` bitişte NULL'lanıyor; "kim işledi" sorusu ancak bununla cevaplanır. */
  completedBy: text('completed_by'),
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

/**
 * ⭐ GÖREV HATA GEÇMİŞİ (0044) — **ekleme-yalnız**, hiçbir kod yolu UPDATE etmiyor.
 *
 * ⚠️ Var olma sebebi: `missions.last_error` her denemede üzerine yazılıyor. Beş kez denenip ölen
 * bir görevde elde yalnız SONUNCU hata kalıyor — oysa tanı için gereken genelde İLKİdir;
 * sonrakiler çoğu zaman birincinin yan etkisidir (yarım kalan durum, kilit, tükenmiş kaynak).
 *
 * ⚠️ `outcome` (`retry` | `dead`) burada tutuluyor çünkü satırın kendisi ölümün tek kaydı
 * olabilir: `markFailed` görevi `failed`e çevirdiğinde `attempts` artık artmıyor ve dışarıdan
 * "kaçıncı denemede öldü" görünmüyor.
 */
export const missionErrors = pgTable('mission_errors', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  missionId: bigint('mission_id', { mode: 'number' }).notNull()
    .references(() => missions.id, { onDelete: 'cascade' }),
  worldId: smallint('world_id').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  attempt: smallint('attempt').notNull().default(0),
  missionType: text('mission_type'),
  error: text('error').notNull(),
  /** retry | dead */
  outcome: text('outcome').notNull(),
  workerId: text('worker_id'),
}, (t) => [
  index('mission_errors_mission').on(t.missionId, t.id),
  index('mission_errors_world_at').on(t.worldId, t.at),
]);

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
   *   `dead`      — savaşta öldü. `cityId` doluysa evdedir ve ÜCRET ödenip diriltilebilir;
   *                  NULL ise hâlâ dönüş yolundadır (ekranda «Yok Edildi · dönüyor»)
   *   `reviving`  — diriltme başladı, `reviveUntil`da canlanır ("Diriltiliyor" · iptal edilebilir)
   *   `in_cave`   — ⭐ MAĞARADA saklanıyor (2026-08-11). Savaşa katılmaz, casus göremez, sefere
   *                  çıkamaz — üçü de `status = 'alive'` süzgecinden **kendiliğinden** düşüyor.
   *                  Orijinalde de vardı (`JAVA_ROENTGEN.md` §6.2, `k.a[234]`).
   *
   * ⚠️ «Mağaraya Giriyor» / «Mağaradan Çıkıyor» (orijinal `k.a[235..236]`) **kolon DEĞİL**:
   * süren mağara görevinin yönünden ve `payload.heroIds`inden türetiliyor (§13.20.6). Kalıcı
   * durum tek: kahraman ya şehirde ya mağarada.
   *
   * ⚠️ **`destroyed` EMEKLİ** (kullanıcı, 2026-08-01 · `0033_hero_no_destroy.sql`). Ordunun
   * tamamı ölse bile kahraman silinmiyor; kendi hızıyla yalnız dönüyor. Eski satırlar
   * migration'da `dead`e çevrildi, `destroyed_at` kolonu düşürüldü.
   */
  status: text('status').notNull().default('alive'),
  /** `reviving` iken diriltmenin biteceği an (OYUN saati). */
  reviveUntil: timestamp('revive_until', { withTimezone: true }),
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

/**
 * ⭐ DÖNGÜ NABZI (§admin Faz 8) — scheduler ve outbox dispatcher'ın "yaşıyorum" imzası.
 *
 * ⚠️ Canlılık gözlemlenebilir durumdan TÜRETİLEMİYOR: kuyruklar boşken "gecikme yok" ile
 * "döngü öldü, iş de gelmedi" aynı görünür. Ayrımı yalnız döngünün kendi yazdığı satır verir.
 * Yazım görev transaction'ının dışında ve kısıtlanmış (5 sn) — izleme, izlediği sistemden
 * daha fazla yazma üretmemeli.
 */
export const workerHeartbeats = pgTable('worker_heartbeats', {
  /** scheduler | dispatcher — aynı süreçte koşsalar da AYRI satır: biri takılıp diğeri koşabilir. */
  kind: text('kind').notNull(),
  workerId: text('worker_id').notNull(),
  worldId: smallint('world_id'),
  pid: integer('pid'),
  role: text('role'),
  /** `at − started_at` = kesintisiz çalışma süresi. Crash-loop yalnız BU alanla görülür. */
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  ticks: bigint('ticks', { mode: 'number' }).notNull().default(0),
  /** Son turun özeti (claimed/done/lagMs · dispatched/failed/skipped) — panelde "ne yapıyor". */
  detail: jsonb('detail').notNull().default({}),
}, (t) => [primaryKey({ columns: [t.kind, t.workerId] })]);

/**
 * ⭐⭐ KUYRUK SAĞLIĞININ ZAMAN SERİSİ (0044) — nabzın yapamadığı tek şey.
 *
 * ⚠️ `worker_heartbeats` **UPSERT**lenir: son turun özeti dışında hiçbir geçmiş taşımaz. 06.08
 * olayında bunun bedeli ödendi — kuyruk 9,5 saat tıkandı, `lagMs` o süre boyunca hesaplandı ve
 * her hesaplama bir öncekinin üzerine yazıldı. Olay bittiğinde geriye **hiçbir kanıt kalmadı**;
 * tanı ancak `missions` satırlarından, elle, olaydan sonra çıkarılabildi.
 *
 * Bu tablo aynı sayıları **saklıyor**. Nabız "şu an yaşıyor mu", bu "dün gece ne oldu" sorusunun
 * cevabı; ikisi ayrı tablo çünkü ayrı yazma desenleri var (biri üzerine yazan, biri ekleme-yalnız)
 * ve karıştırmak birinin maliyetini diğerine yüklerdi.
 *
 * ⚠️ Seyreltme ZORUNLU (`SchedulerService`, dakikada bir): saniyede bir yazsaydık izleme kaydı
 * izlediği sistemden 60 kat fazla yazma üretirdi — `Heartbeat`in 1. kuralının aynısı.
 */
export const schedulerSamples = pgTable('scheduler_samples', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  workerId: text('worker_id'),
  lagMs: bigint('lag_ms', { mode: 'number' }).notNull().default(0),
  dueCount: integer('due_count').notNull().default(0),
  claimed: integer('claimed').notNull().default(0),
  /** ⭐ `min(due, batchSize) − claimed`. 06.08 olayının tek doğrudan göstergesi. */
  skippedLocked: integer('skipped_locked').notNull().default(0),
  stuck: integer('stuck').notNull().default(0),
  scheduled: integer('scheduled').notNull().default(0),
  running: integer('running').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  reaped: integer('reaped').notNull().default(0),
  dead: integer('dead').notNull().default(0),
  oldestLockedAgeMs: bigint('oldest_locked_age_ms', { mode: 'number' }),
  /** ⚠️ Terk edilmiş transaction — 06.08 olayının KÖK NEDENİ tam olarak buydu. */
  poolIdleInTx: integer('pool_idle_in_tx'),
  oldestTxS: integer('oldest_tx_s'),
  outboxPending: integer('outbox_pending'),
  outboxDead: integer('outbox_dead'),
  /** Bakımda kuyruk ilerlemez ama bu ARIZA DEĞİL — grafikte ayırt edilebilsin. */
  paused: boolean('paused').notNull().default(false),
}, (t) => [index('scheduler_samples_world_at').on(t.worldId, t.at)]);

/**
 * ⭐⭐ OPERASYON OLAYLARI (0044) — eşik aşımının AÇILIP KAPANAN kaydı.
 *
 * Bugüne kadar tek alarm kanalı *yöneticinin paneli elle açması*ydı (`Health.tsx`, 10 sn'de bir,
 * yalnız ekran açıkken). 06.08'de kimse bakmadığı için arıza 9,5 saat sürdü.
 *
 * ⚠️⚠️ **Her turda satır açan bir tasarım denenmedi çünkü sonucu belliydi:** saniyede bir koşan
 * bir döngüde 9,5 saatlik bir arıza 34.000 satır ve 34.000 e-posta üretirdi. Alarm sisteminin
 * kendisi arızadan büyük bir olaya dönüşür, gerçek uyarı gürültüde kaybolurdu. Bu yüzden olay
 * **bir kez** açılır, kapanana kadar yalnız `peak`/`samples` güncellenir.
 *
 * ⚠️ Tekillik uygulama katmanında değil **kısmî unique indekste** (`ops_events_open`): iki worker
 * aynı anda eşiği görürse ikincisinin INSERT'ü çakışır ve sessizce düşer. `time_shifts` ile aynı
 * felsefe — "iki kez çağrılmasın" kontrolü tek başına asla yeterli değil.
 */
export const opsEvents = pgTable('ops_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** NULL = dünyadan bağımsız (outbox küresel bir kuyruk). İndekste `COALESCE(-1)`. */
  worldId: smallint('world_id'),
  /** queue_lag · queue_stuck · mission_dead · outbox_dead · worker_stale · idle_in_tx */
  kind: text('kind').notNull(),
  /** warn | crit — yalnız `crit` e-posta üretir (`ops.alertSeverity`). */
  severity: text('severity').notNull().default('warn'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  value: doublePrecision('value'),
  /** Olay boyunca görülen EN KÖTÜ değer — "ne kadar kötüleşti" sorusunun cevabı. */
  peak: doublePrecision('peak'),
  threshold: doublePrecision('threshold'),
  /** Kaç kez ölçüldü: bir kerelik sıçrama ile kalıcı arıza ayrımı. */
  samples: integer('samples').notNull().default(1),
  detail: jsonb('detail').notNull().default({}),
  /** Alarm gönderim izi. NULL = gönderilmedi (severity `warn`di ya da e-posta kapalı). */
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  outboxId: bigint('outbox_id', { mode: 'number' }),
}, (t) => [
  /**
   * ⭐ (dünya, tür) başına EN FAZLA BİR açık olay — alarmın tekrarlamamasının yapısal garantisi.
   * ⚠️ `COALESCE(world_id, -1)`: NULL'lar birbiriyle çakışmaz, o yüzden dünyadan bağımsız
   * olaylar (outbox) kural dışına düşerdi.
   */
  uniqueIndex('ops_events_open').on(sql`(COALESCE(${t.worldId}, -1))`, t.kind)
    .where(sql`${t.resolvedAt} IS NULL`),
  index('ops_events_world_at').on(t.worldId, t.openedAt),
]);

/**
 * ⭐⭐ ZAMAN KAYDIRMA DEFTERİ (0043, tek zaman çizgisi).
 *
 * Bakımdan çıkarken bekleyen vadeler duraklama süresi kadar ileri kaydırılıyor
 * (`world/time-shift.ts` · kapsam `world/time-registry.ts`). Her kaydırma buraya bir satır
 * bırakır — hem denetim izi hem **idempotans anahtarı**.
 *
 * ⚠️ `audit_log` yerine ayrı tablo, çünkü kaydırmanın tekilliği tipli bir `UNIQUE` kısıtına
 * yaslanmak zorunda (`time_shifts_world_pause`): kaydırma çok ifadeli, uygulama katmanındaki
 * "iki kez çağrılmasın" kontrolü tek başına yetmez. `audit_log` ise serbest biçimli ve
 * ekleme-yalnız. Bakım ayrıca oraya da `admin.world.resume` satırı yazmaya devam ediyor —
 * biri yönetim izi, diğeri veri dönüşümü defteri.
 *
 * ⚠️ `rowsByTable` boş bırakılmaz: bir tablonun sayısının aniden 0'a düşmesi, kayıt defterindeki
 * yüklemin bozulduğunun tek göstergesi. İki bakımı yan yana koyup bakmak yeter.
 */
export const timeShifts = pgTable('time_shifts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull().references(() => worlds.id),
  /** `migration` (0043) · `maintenance` (normal bakım çıkışı) · `manual` (elle telafi). */
  kind: text('kind').notNull(),
  /** Duraklamanın başı. Göçte NULL — kısmî tekillik indeksi bu yüzden `WHERE ... IS NOT NULL`. */
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  resumedAt: timestamp('resumed_at', { withTimezone: true }).notNull().defaultNow(),
  shiftMs: bigint('shift_ms', { mode: 'number' }).notNull(),
  /** Bariyerde görülen `running` görev sayısı — 0 olmalı. */
  drainRunning: integer('drain_running'),
  /** `heartbeat` (nabız duraklamayı onayladı) · `forced` · `migration`. */
  drainProof: text('drain_proof'),
  forced: boolean('forced').notNull().default(false),
  actorId: bigint('actor_id', { mode: 'number' }),
  rowsByTable: jsonb('rows_by_table').notNull().default({}),
  /** Kaydırma anındaki kayıt defterinin parmak izi — "o gün hangi sütunlar kayıyordu". */
  registryHash: text('registry_hash'),
  outcome: text('outcome').notNull().default('applied'),
}, (t) => [
  uniqueIndex('time_shifts_world_pause').on(t.worldId, t.pausedAt)
    .where(sql`${t.pausedAt} IS NOT NULL`),
  index('time_shifts_world_at').on(t.worldId, t.resumedAt),
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
  /**
   * ⭐ 0044 — panelin en çok sorduğu iki soru indekssizdi ve TAM TABLO TARAMASI yapıyordu:
   * *"son 1 saatte bu dünyada ne oldu"* ve *"bu işlem türü ne zaman koştu"*. Tablo
   * ekleme-yalnız ve bilerek hiç temizlenmiyor (denetim kaydı silinemez) → tarama maliyeti
   * zamanla yalnızca artıyordu.
   */
  index('audit_world_at').on(t.worldId, t.at),
  index('audit_action_at').on(t.action, t.at),
]);

/* ═══ SOHBET (§13.12) ═══════════════════════════════════════════════════════
 * DÜNYA YALITIMI: her kanal world_id taşır; dm_key PLAYER id'lerinden üretilir (account'tan ASLA)
 * → aynı hesabın iki dünyadaki oyuncusu birbirine mesaj atamaz.
 */
export const chatChannels = pgTable('chat_channels', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull().references(() => worlds.id),
  kind: text('kind').notNull(), // global | alliance | dm
  /**
   * ⭐⭐ CASCADE = «İTTİFAK DAĞITILIRSA SOHBET MESAJLARI KALICI SİLİNİR» ŞARTININ TAMAMI.
   *
   * Zincir: `alliances` DELETE → bu satır DELETE → `chat_messages` DELETE (o FK'de de cascade).
   *
   * ⚠️ `disbandInner()` içinde ELLE silme YOK ve olmamalı: unutulabilen bir adım, dağıtılmış
   * ittifağın sohbetini sunucuda bırakırdı. Kural veritabanında duruyor.
   */
  allianceId: bigint('alliance_id', { mode: 'number' })
    .references((): AnyPgColumn => alliances.id, { onDelete: 'cascade' }),
  dmKey: text('dm_key'), // least(a,b):greatest(a,b)
  slowModeS: smallint('slow_mode_s').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('chat_channels_world_dm').on(t.worldId, t.dmKey),
  index('chat_channels_world_kind').on(t.worldId, t.kind),
  /** Bir ittifağın TEK kanalı olur. Kısmî: DM satırlarında `alliance_id` NULL, onlar muaf. */
  uniqueIndex('chat_channels_world_alliance').on(t.worldId, t.allianceId)
    .where(sql`${t.allianceId} IS NOT NULL`),
  /**
   * ⭐ Bir dünyanın TEK genel kanalı olur (§13.12, göç 0046).
   *
   * ⚠️ `chat_channels_world_dm` bunu engellemiyor: genel kanalda `dm_key` NULL ve Postgres
   * tekil indekslerde NULL'ları birbirinden FARKLI sayar.
   * ⚠️ Servis `ON CONFLICT (world_id) WHERE kind = 'global'` yazmak zorunda — kısmî indekse
   * `WHERE`siz `ON CONFLICT` "no unique or exclusion constraint matching" verir.
   */
  uniqueIndex('chat_channels_world_global').on(t.worldId)
    .where(sql`${t.kind} = 'global'`),
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
  /**
   * ⚠️ **İTTİFAK SOHBETİNDE KULLANILMIYOR** — orası `alliance_chat_mutes`. Sebep: burada
   * NULL = «susturulmamış» (varsayılan), yani **KALICI susturma temsil edilemez**. Ayrı
   * tabloda satırın VARLIĞI susturmadır, `until IS NULL` ise kalıcı — belirsizlik yok.
   * Ayrıca kim/neden/ne zaman denetim izi bir kolona sığmazdı.
   */
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
  /**
   * ⭐ ÇÖZÜLMÜŞ MENTION ARALIKLARI: `[{id, at, len}]` — `at` gövdedeki başlangıç, `len` `@`
   * DÂHİL uzunluk. DM kanallarında daima boş. **İstemci parse etmez, yalnız diler.**
   *
   * ⚠️ Neden ham `@ad` yetmez: kullanıcı adında BOŞLUK serbest (`name-rules.ts`) →
   * `"@Eru Ilúvatar merhaba"` metninde adın nerede bittiği metinden çözülemez.
   * ⚠️ Neden yalnız `[playerId]` yetmez: ad DEĞİŞİRSE eski mesajdaki metin eski adı gösterir,
   * id'den çözülen yeni adla eşleşmez → kalın yazılacak aralık bulunamazdı.
   */
  mentions: jsonb('mentions').notNull().default(sql`'[]'::jsonb`),
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
 * ⭐ İTTİFAK SOHBETİ SUSTURMALARI (§13.15c) — `chatBans`ın İTTİFAK ÖLÇEĞİNDEKİ ikizi.
 *
 * Farkı yetkide: küresel sohbet yasağını YÖNETİCİ verir, bunu **ittifak yönetimi** (Lider +
 * Konsey) verir ve yalnız o ittifağın sohbetinde geçerlidir.
 *
 * ⚠️ **Satırın VARLIĞI susturmadır**, `until IS NULL` ise KALICI. `chat_participants.muted_until`
 * kullanılamazdı: orada NULL «susturulmamış» demek olurdu ve kalıcı susturma temsil edilemezdi.
 *
 * ⚠️ **Kaldırma = DELETE DEĞİL, `revoked_at` işaretlemesi.** Moderasyon geçmişi kalıcı olmalı
 * (`chat_bans`'ın "süresi geçmiş satır SİLİNMEZ" kuralıyla aynı gerekçe): *"lider beni haksız
 * yere susturdu"* tartışmasının tek nesnel kaydı bu satır.
 *
 * ⚠️ Susturma **ittifağa** bağlı: üye ayrılıp geri katılırsa ceza DEVAM EDER (kaçış yolu yok),
 * ama BAŞKA bir ittifağa katılırsa orada susturulmamıştır — ceza o topluluğa aitti.
 */
export const allianceChatMutes = pgTable('alliance_chat_mutes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  worldId: smallint('world_id').notNull(),
  allianceId: bigint('alliance_id', { mode: 'number' }).notNull()
    .references(() => alliances.id, { onDelete: 'cascade' }),
  playerId: bigint('player_id', { mode: 'number' }).notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  /** NULL = KALICI (lider/konsey kaldırana kadar). Dolu = o ana kadar. */
  until: timestamp('until', { withTimezone: true }),
  reason: text('reason'),
  createdBy: bigint('created_by', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: bigint('revoked_by', { mode: 'number' }),
}, (t) => [
  /**
   * ⚠️ Aynı oyuncuya ikinci bir AKTİF satır olamaz. Koşul `revoked_at IS NULL` — SÜRESİ
   * GEÇMİŞ ama iptal edilmemiş satır da kısıtın İÇİNDE. Bu yüzden servis, yeniden
   * susturmadan önce süresi geçmiş satırı da iptale çekmek ZORUNDA.
   */
  uniqueIndex('alliance_chat_mutes_one_active').on(t.allianceId, t.playerId)
    .where(sql`${t.revokedAt} IS NULL`),
]);

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

/**
 * ⭐ E-POSTA JETONLARI (§9.2) — doğrulama ve şifre sıfırlama.
 *
 * `sessions.refresh_hash` deseninin aynısı: jeton `randomBytes(32).base64url`, DB'ye **yalnız
 * sha256** yazılır. Veritabanı sızsa bile jetonlar kullanılamaz.
 *
 * ⚠️ `email` kolonu KASITLI denormalize: jeton üretildiği andaki adresi saklar. Kullanıcı
 * adresini değiştirirse eski sıfırlama bağlantısı **kendiliğinden ölür** — aksi hâlde ele
 * geçirilmiş eski bir posta kutusu, adres değiştirildikten sonra bile hesabı geri alabilirdi.
 *
 * `used_at` tek kullanımlığı sağlar; süresi dolan satırlar sorguda elenir (temizlik işi ayrı).
 */
export const emailTokens = pgTable('email_tokens', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  /** verify | reset */
  purpose: text('purpose').notNull(),
  tokenHash: text('token_hash').notNull(),
  email: text('email').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Hız sınırı IP başına da sayılabilsin (§9.2) — otomatik cezaya BAĞLANMAZ. */
  createdIp: text('created_ip'),
}, (t) => [
  uniqueIndex('email_tokens_hash').on(t.tokenHash),
  index('email_tokens_account_purpose').on(t.accountId, t.purpose, t.createdAt),
]);

/**
 * ⭐ WEB PUSH ABONELİĞİ (§7.2) — bir satır = bir TARAYICI (ya da kurulu PWA).
 *
 * **Neden `account_id`, `player_id` değil:** abonelik tarayıcıya aittir, tarayıcı da hesaba.
 * Aynı hesap iki dünyada oynuyorsa ikisinin bildirimi de aynı tarayıcıya düşmeli. Hedefleme
 * yine oyuncu düzeyinde yapılır; `player → account → subscriptions` ile çözülür.
 *
 * `endpoint` push servisinin (FCM/Mozilla/Apple) ürettiği URL'dir ve **küresel benzersizdir** —
 * unique kısıt bu yüzden ona konuyor: aynı tarayıcı ikinci kez abone olursa satır güncellenir,
 * çoğalmaz.
 *
 * ⚠️ `fail_count`/`failed_at` olmadan bu tablo **çöple dolar**: kullanıcı izni geri aldığında
 * push servisi 404/410 döner ve abonelik sonsuza kadar denenmeye devam ederdi.
 */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  /** Tarayıcının ürettiği ECDH açık anahtarı + auth secret (yük şifrelemesi için). */
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  /** `x-device-id` başlığıyla eşleşir (`sessions.device_id` emsali) — çıkışta temizlenebilsin. */
  deviceId: text('device_id'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  failCount: smallint('fail_count').notNull().default(0),
  failedAt: timestamp('failed_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('push_subscriptions_endpoint').on(t.endpoint),
  index('push_subscriptions_account').on(t.accountId),
]);

/**
 * ⭐ DESTEK TALEBİ (0047, kullanıcı 2026-08-14) — oyuncu ile yönetim arasındaki yazışma.
 *
 * ⚠️ **Anonim ve kayıtlı talep AYNI tabloda** (`accountId` nullable). İki ayrı tablo, admin
 * kuyruğunu · sayaçları · mail akışını · durum makinesini ikişer kez yazdırırdı; tek fark bir
 * nullable FK.
 *
 * ⚠️ **CASCADE bilerek YOK** (`chat_reports` deseni): destek kaydı hesabın ömründen uzun
 * yaşamalı. Kimlik alanları bu yüzden DENORMALİZE. Hesap silme zaten bir UPDATE
 * (anonimleştirme), DELETE değil — PII temizliğini `account-delete.service.ts` açıkça yapıyor.
 *
 * ⚠️ **Okunmamış sayacı iki tarafta ASİMETRİK, bilerek**: oyuncu *"bana cevap geldi mi"* sorar
 * (mesaj bazlı → `supportMessages.readAt`), yönetici *"hangi talep BİZDE bekliyor"* sorar
 * (talep bazlı → `lastSender`). Tek mekanizmaya zorlamak ya admin kuyruğunu mesaj tablosuna
 * JOIN'e çevirirdi ya da oyuncuya kendi mesajıyla yanan bir rozet verirdi.
 */
export const supportTickets = pgTable('support_tickets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** NULL = anonim (hesabı yok, dolayısıyla dünyası da yok). `outbox.world_id` ile aynı karar. */
  worldId: smallint('world_id').references(() => worlds.id),
  accountId: bigint('account_id', { mode: 'number' }).references(() => accounts.id),
  /** FK YOK, denormalize — oyun içi bildirimin hedefi. Oyuncu gitse de talep durur. */
  playerId: bigint('player_id', { mode: 'number' }),
  /**
   * ⭐ Yanıtın gideceği adres, DAİMA dolu. Kayıtlı kullanıcıda hesaptan kopyalanır;
   * doğrulanmamış hesapta kullanıcı değiştirebilir (kullanıcı şartı).
   */
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  subject: text('subject').notNull(),
  /** bug | account | suggestion | report | other */
  category: text('category').notNull(),
  /** open | closed — ⭐ talebi YALNIZ yönetici açıp kapatır (kullanıcı şartı). */
  status: text('status').notNull().default('open'),
  /**
   * ⭐ user | admin — "yanıt bekliyor" TÜREV DEĞİL, KOLON. Admin rozeti aşağıdaki kısmî
   * indeksten okunuyor; duruma `answered` eklemek aynı gerçeği iki yere yazmak olurdu.
   */
  lastSender: text('last_sender').notNull().default('user'),
  /**
   * ⚠️ Yöneticiye mail YALNIZ ilk açılışta. Tek-seferlik garanti `ops-monitor.ts` deseniyle:
   * koşullu `UPDATE … WHERE admin_notified_at IS NULL RETURNING` — **hakkı önce al, maili
   * sonra yaz**. Ters sıra çift posta üretir.
   */
  adminNotifiedAt: timestamp('admin_notified_at', { withTimezone: true }),
  /**
   * ⭐ Anonim kullanıcının kendi talebine dönüş yolu. Jeton `randomBytes(32).base64url`,
   * DB'ye **yalnız sha256** (`sessions.refresh_hash` · `email_tokens` deseni).
   */
  publicTokenHash: text('public_token_hash'),
  publicTokenExpiresAt: timestamp('public_token_expires_at', { withTimezone: true }),
  createdIp: text('created_ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: bigint('closed_by', { mode: 'number' }),
}, (t) => [
  /** Yöneticinin TEK sorgusu: "bizde bekleyen kaç talep var" (sekme rozeti). */
  index('support_tickets_pending').on(t.updatedAt)
    .where(sql`${t.status} = 'open' AND ${t.lastSender} = 'user'`),
  index('support_tickets_account').on(t.accountId, t.id),
  uniqueIndex('support_tickets_token').on(t.publicTokenHash)
    .where(sql`${t.publicTokenHash} IS NOT NULL`),
]);

/**
 * ⭐ YÜKLENEN RESİM (0047). Projedeki **ilk** kullanıcı içeriği deposu.
 *
 * ⚠️ `ticketId` NULLABLE ve satır MESAJDAN ÖNCE yazılıyor: yükleme iki adımlı (önce dosya,
 * sonra onu referanslayan mesaj). Boşta kalanlar yetim süpürücüsünün tanımı.
 *
 * ⚠️ Yazma sırası: `<key>.tmp` → `fsync` → `rename()` (atomik) → **sonra** bu satır. Ters sıra
 * "DB'de satır var, dosya yok" verirdi; bu sıra en kötü ihtimalle süpürücünün toplayacağı bir
 * yetim dosya bırakır.
 */
export const supportAttachments = pgTable('support_attachments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ticketId: bigint('ticket_id', { mode: 'number' })
    .references(() => supportTickets.id, { onDelete: 'cascade' }),
  /**
   * ⚠️ Diskteki GÖRELİ yol (`2026/08/a3/<32 hex>.<uzt>`). Mutlak yol yalnız bundan türetiliyor
   * ve birleştirmeden önce katı bir regex'ten geçiyor — yol kaçışının tek kapısı orası
   * (`admin.db.controller.ts` tabloyu elle düzenlemeye izin veriyor, kolon bozulabilir).
   * Ad 128 bit rastgele: nginx bir gün dizini açsa bile numaralandırma imkânsız.
   */
  storageKey: text('storage_key').notNull(),
  /**
   * ⚠️ **SNIFF EDİLMİŞ** tür (magic byte), istemcinin `content-type`'ı DEĞİL. Servis ederken
   * `Content-Type` buradan yazılıyor. SVG bilerek yasak: betik çalıştırır.
   */
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  /** Sıkıştırma bombasına karşı tek savunma (yeniden kodlamıyoruz) — başlıktan okunuyor. */
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  uploadedByAccountId: bigint('uploaded_by_account_id', { mode: 'number' }),
  uploadedIp: text('uploaded_ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('support_attachments_storage_key').on(t.storageKey),
  index('support_attachments_orphan').on(t.createdAt).where(sql`${t.ticketId} IS NULL`),
]);

/**
 * Destek yazışmasının tek mesajı.
 *
 * ⚠️ CASCADE burada **İSTENİYOR** (`supportTickets`in aksine): mesajın talepten bağımsız bir
 * anlamı yok, saklama birimi talebin kendisi.
 */
export const supportMessages = pgTable('support_messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ticketId: bigint('ticket_id', { mode: 'number' }).notNull()
    .references(() => supportTickets.id, { onDelete: 'cascade' }),
  /**
   * ⭐ user | admin — **ROL, kimlik değil.** Oyuncuya gösterilen ad yönetici tarafında daima
   * «Yönetim»; personel kimliği sızmamalı. Gerçek yazar yalnız `authorAccountId`de, denetim
   * için.
   */
  sender: text('sender').notNull(),
  authorAccountId: bigint('author_account_id', { mode: 'number' }),
  /** DÜZ METİN (contracts kuralı: HTML/markdown yok → XSS yüzeyi sıfır). */
  body: text('body').notNull(),
  /** 0..1 ek — "bir mesaja bir resim" kuralını uygulama değil ŞEMA koruyor. */
  attachmentId: bigint('attachment_id', { mode: 'number' })
    .references(() => supportAttachments.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Yalnız `sender = 'admin'` satırlarında anlamlı; oyuncunun okunmamış rozeti bundan. */
  readAt: timestamp('read_at', { withTimezone: true }),
}, (t) => [
  index('support_messages_ticket').on(t.ticketId, t.id),
  index('support_messages_unread').on(t.ticketId)
    .where(sql`${t.readAt} IS NULL AND ${t.sender} = 'admin'`),
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
