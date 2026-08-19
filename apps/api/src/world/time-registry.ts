/**
 * ⭐⭐ VADE KAYIT DEFTERİ — bakımdan çıkarken hangi zaman sütunları kaydırılacak.
 *
 * **Tek zaman çizgisi mimarisinin kalbi (2026-08-07).** Artık `gameNow == now() == UTC`;
 * dünyanın duraklama süresi bir `clock_offset_ms` sütununda BİRİKMİYOR, bunun yerine bakım
 * bitince **bekleyen her vade duraklama süresi kadar ileri kaydırılıyor**. Böylece veritabanındaki
 * hiçbir damga "hangi saatte yazılmıştı?" sorusunu sordurmuyor — hepsi gerçek zamanda.
 *
 * ⚠️⚠️ **BU DOSYA EKSİK KALIRSA HATA SESSİZDİR.** Kaydırılmayan bir sütun, bakım süresi kadar
 * geçmişte kalır ve onu okuyan kural yanlış davranır — ama hiçbir yerde hata çıkmaz. Aylar sonra
 * "şu bakımdan sonra bozuldu" diye fark edilir. Bu yüzden `time-registry.test.ts` bekçisi
 * `information_schema`'yı tarar ve **her `timestamptz` sütununun ya burada ya
 * `NON_TIMELINE_COLUMNS`'ta olmasını** şart koşar. Yeni bir sütun ekleyen geliştirici karar
 * vermeyi unutamaz: test kırılır.
 *
 * ⚠️ Deseni `admin/ops-jobs.ts` (`CLEANUP_JOBS`) ve `admin/db-registry.ts`ten alıyor — ikisi de
 * "elle yazılmış tablo/kolon adı + şemayla karşılaştıran test" kalıbını zaten kullanıyor ve
 * Faz 7'de o kalıp dört yanlış kolon adını yakalamıştı.
 */
import { sql, type SQL } from 'drizzle-orm';

/**
 * ⚠️ Sınıflandırma "gelecek mi geçmiş mi" DEĞİL. Doğru soru şu:
 * **canlı bir kural bu değeri şimdiki zamanla karşılaştırıyor mu?**
 *
 * `cities.resources_at` geçmiş bir damgadır ama kaynak birikimi ondan sayılıyor — kaydırılmazsa
 * oyunculara duraklama süresi kadar **bedava kaynak** verilir. `battles.at` de geçmiştir ama
 * yalnız gösterilir ve sıralanır — kaydırılırsa tarih çarpıtılır. İkisi zıt yönde.
 */
export type TimeShiftClass =
  /** Gelecekteki bir an: yürütmeyi sürüklüyor (görev vadesi, kuyruk bitişi, koruma sonu). */
  | 'deadline'
  /** Geçmişteki bir çıpa: üzerinden süre sayılıyor (birikim başlangıcı, üretim başlangıcı). */
  | 'anchor';

export interface TimeShiftEntry {
  table: string;
  column: string;
  class: TimeShiftClass;
  /** Bu sütunu ŞİMDİKİ ZAMANLA karşılaştıran canlı kural — kaydırmanın gerekçesi. */
  reason: string;
  /**
   * Hangi satırlar kayacak. `ref` = **donmuş oyun saati** (`worlds.paused_at`).
   *
   * ⚠️ `ref` kullan, `now()` KULLANMA. Duraklama sırasında `now()` çoktan ilerlemiştir; onunla
   * süzmek `[paused_at, now())` aralığındaki vadeleri dışarıda bırakır ve o görevler devam
   * edildiği anda **topluca ateşlenir**.
   * ⚠️ Dünya kapsamı (`world_id = ...`) BURAYA YAZILMAZ — çağıran ekliyor (`time-shift.ts`),
   * böylece unutulması mümkün değil.
   */
  where(ref: SQL): SQL;
}

/**
 * ⭐ Saldırı limiti penceresi için kaydırılacak TAMAMLANMIŞ saldırıların yaşı.
 *
 * `assertAttackLimit` (`mission.service.ts`) *"24 saatte 3 saldırı"* kuralını `status <> 'canceled'`
 * olan **tüm** saldırıların `execute_at`'ine bakarak uyguluyor — yani biten saldırılar da canlı bir
 * kuralı besliyor. Kaydırmazsak uzun bir bakımdan sonra bekleme süresi kendiliğinden dolmuş görünür.
 *
 * ⚠️ Bu değer `attackWindowHours` ayarından (varsayılan 24) **BÜYÜK olmak zorunda**; bekçi testi
 * bunu kilitliyor. Derin geçmişi bilerek kaydırmıyoruz: `battles.at` kaydırılmadığı için tüm
 * geçmişi kaydırmak ikisini kalıcı olarak ayrıştırırdı.
 */
export const ATTACK_WINDOW_SHIFT_HOURS = 48;

export const TIME_SHIFT_REGISTRY: readonly TimeShiftEntry[] = [
  /* ── Görev kuyruğu ─────────────────────────────────────────────────────────── */
  {
    table: 'missions',
    column: 'execute_at',
    class: 'deadline',
    reason: 'claimDue vadeyi now() ile kıyaslıyor; assertAttackLimit biten saldırıları da sayıyor',
    /**
     * ⚠️ Bekleyenler **ve** son `ATTACK_WINDOW_SHIFT_HOURS` saatteki biten saldırılar TEK
     * girişte, `OR` ile. İki ayrı giriş yazılsaydı kesişen satırlar **iki kez** kayardı —
     * bekçi testi bu yüzden `(tablo, sütun)` çiftinin tekilliğini şart koşuyor.
     */
    where: (ref) => sql`(
      status IN ('scheduled', 'running')
      OR (type = 'attack' AND status <> 'canceled'
          AND execute_at > ${ref} - (${ATTACK_WINDOW_SHIFT_HOURS} * interval '1 hour'))
    )`,
  },

  /* ── Üretim kuyruğu ────────────────────────────────────────────────────────── */
  {
    table: 'queues',
    column: 'finish_at',
    class: 'deadline',
    reason: 'ekrandaki geri sayım ve bant zinciri (queue.handlers.ts) bunu okuyor',
    where: () => sql`completed_at IS NULL AND canceled_at IS NULL`,
  },
  {
    table: 'queues',
    column: 'started_at',
    class: 'anchor',
    /**
     * ⚠️ Savaşçı bandı üretileni `(now − started_at) / perUnitSeconds` ile sayıyor
     * (`unit-queue.ts`). Kaydırılmazsa bakım süresi kadar **bedava asker** üretilir.
     */
    reason: 'materializeUnitQueues üretilen adedi bu çıpadan sayıyor',
    where: () => sql`completed_at IS NULL AND canceled_at IS NULL`,
  },

  /* ── Şehir ─────────────────────────────────────────────────────────────────── */
  {
    table: 'cities',
    column: 'resources_at',
    class: 'anchor',
    /**
     * ⚠️ Koşulsuz: **her** şehir kaymalı. Tembel birikim `(now − resources_at)` ile hesaplanıyor
     * (`city.service.ts`); tek bir şehir atlanırsa o oyuncuya bakım süresi kadar bedava
     * altın/yemek gider ve kimse fark etmez.
     */
    reason: 'tembel kaynak birikiminin çıpası (city.service.ts)',
    where: () => sql`TRUE`,
  },
  {
    table: 'cities',
    column: 'teleport_ready_at',
    class: 'deadline',
    reason: 'teleport bekleme süresi (mission.service.ts)',
    // ⚠️ `> ref`: süresi çoktan dolmuş bir teleport kaydırılırsa YENİDEN kilitlenirdi.
    where: (ref) => sql`teleport_ready_at IS NOT NULL AND teleport_ready_at > ${ref}`,
  },
  {
    table: 'cities',
    column: 'cave_repair_until',
    class: 'deadline',
    reason: 'mağara onarımı bitene kadar asker giriş/çıkışı kapalı (cave.service.ts)',
    where: (ref) => sql`cave_repair_until IS NOT NULL AND cave_repair_until > ${ref}`,
  },
  {
    table: 'cities',
    column: 'wall_repair_until',
    class: 'deadline',
    reason: 'sur onarımı bitişi; savunma yükseltmesini de kilitliyor (city.controller.ts)',
    where: (ref) => sql`wall_repair_until IS NOT NULL AND wall_repair_until > ${ref}`,
  },
  {
    table: 'cities',
    column: 'wall_repair_from',
    class: 'anchor',
    /**
     * ⚠️ `wall_repair_until` ile **AYNI yüklem** — ikisi bir çift. `wallCurrentIntegrity`
     * bütünlüğü `(now − from) / (until − from)` oranından türetiyor; biri kayıp diğeri kalırsa
     * oran bozulur ve ekranda *"saldırı gelirse bu oranla savaşır"* yazan sayı yanlış çıkar.
     */
    reason: 'sur bütünlüğü oranının alt ucu (wallCurrentIntegrity)',
    where: (ref) => sql`wall_repair_until IS NOT NULL AND wall_repair_until > ${ref}`,
  },

  /* ── Oyuncu ────────────────────────────────────────────────────────────────── */
  {
    table: 'players',
    column: 'protected_until',
    class: 'deadline',
    reason: 'acemi koruması — saldırı hedeflemesini kapatıyor (mission.service.ts)',
    where: (ref) => sql`protected_until IS NOT NULL AND protected_until > ${ref}`,
  },
  {
    table: 'players',
    column: 'vacation_until',
    class: 'deadline',
    /**
     * ⚠️ Yüklem `> ref` DEĞİL, `IS NOT NULL`: tatil modunun kanonik göstergesi bu çift
     * (`players_vacation_pair` CHECK'i `vacation_since` ile NULL'luğunun eşit olmasını
     * zorluyor). Süresi geçmiş ama henüz `vacation_end` görevi koşmamış bir satır da tatilde
     * SAYILIYOR; onu dışarıda bırakmak iki sütunu ayrıştırırdı.
     */
    reason: 'tatil modu bitişi ve otomatik çıkış görevi (vacation.service.ts)',
    where: () => sql`vacation_until IS NOT NULL`,
  },
  {
    table: 'players',
    column: 'vacation_since',
    class: 'anchor',
    // ⚠️ `vacation_until` ile aynı yüklem — CHECK kısıtı ikisini çift tutuyor.
    reason: 'tatilden çıkış için 48 saat alt sınırı (vacation.service.ts)',
    where: () => sql`vacation_until IS NOT NULL`,
  },
  {
    table: 'players',
    column: 'vacation_ended_at',
    class: 'anchor',
    reason: 'tatile yeniden girmeden önceki bekleme süresi (vacation.service.ts)',
    where: (ref) => sql`vacation_ended_at IS NOT NULL AND vacation_ended_at > ${ref} - interval '30 days'`,
  },
  {
    table: 'players',
    column: 'merit_expires_at',
    class: 'deadline',
    reason: 'askerî ünvanın sönme anı; okuma anında süzülüyor (command.controller.ts)',
    where: (ref) => sql`merit_expires_at IS NOT NULL AND merit_expires_at > ${ref}`,
  },
  {
    table: 'players',
    column: 'merit_granted_at',
    class: 'anchor',
    // ⚠️ `merit_expires_at` ile çift: tek başına kayarsa rozetin "kalan süre"si yalan söyler.
    reason: 'ünvan rozetinin kalan süre hesabı (MeritBadge)',
    where: (ref) => sql`merit_expires_at IS NOT NULL AND merit_expires_at > ${ref}`,
  },

  /* ── Kahraman ──────────────────────────────────────────────────────────────── */
  {
    table: 'heroes',
    column: 'revive_until',
    class: 'deadline',
    reason: 'diriltme bitişi (hero.controller.ts)',
    where: () => sql`status = 'reviving' AND revive_until IS NOT NULL`,
  },
] as const;

/**
 * ⭐ "Bu bir vade DEĞİL" listesi — bekçi testinin ikinci yarısı.
 *
 * Buradaki her sütun **bilinçli olarak kaydırılmıyor**. Üç gerekçe ailesi var:
 *
 *  1. **Geçmiş olay damgası** — yalnız gösteriliyor/sıralanıyor. Kaydırmak tarihi çarpıtır.
 *  2. **Gerçek zamanda tanımlı kural** — moderasyon cezaları, oturum süreleri, istismar
 *     taraması, saklama süreleri. Bunlar oyun dünyasının değil **gerçek dünyanın** kuralları:
 *     bir ceza bakım yapıldı diye uzamamalı (`ops-jobs.ts:4-10` aynı ayrımı anlatıyor).
 *  3. **Altyapı alanı** — nabız, ayar sürümleri, `worlds.paused_at`'in kendisi.
 *
 * ⚠️ Yeni bir sütun buraya eklerken **hangi aileye girdiğini** düşün. Şüphedeysen sor:
 * *"bunu şimdiki zamanla karşılaştıran bir kural var mı?"* Varsa buraya değil, yukarıya.
 */
export const NON_TIMELINE_COLUMNS: readonly string[] = [
  // 1 — Geçmiş oyun olayları
  'battles.at', 'battles.created_at',
  /* ⚠️ `favorited_at` `read_at` ile AYNI aile: ikisi de yalnız "işaretli mi" sorusuna cevap
     veren geçmiş damgaları. Hiçbir kural onları şimdiki zamanla karşılaştırmıyor — favori
     süzgeci `IS NOT NULL` bakıyor, okundu rozeti de öyle. Kaydırmak tarihi çarpıtmak olurdu. */
  'messages.at', 'messages.read_at', 'messages.favorited_at', 'messages.created_at',
  'rankings.taken_at', 'ranking_runs.taken_at', 'ranking_runs.created_at',
  'audit_log.at',
  'echo_effects.saw_at', 'echo_effects.applied_at',

  // 1 — Görev/kuyruk künyesi (gerçek zaman: "ne zaman işlendi", "ne zaman iptal edildi")
  'missions.created_at', 'missions.locked_at', 'missions.finished_at',
  'queues.canceled_at', 'queues.completed_at',
  'outbox.created_at', 'outbox.dispatched_at',
  'worker_heartbeats.started_at', 'worker_heartbeats.at',

  /**
   * 3 — Gözlemlenebilirlik (0044). ⚠️ Hepsi **gerçek zamanda** ve bu bilinçli: bunlar oyun
   * olayı değil ALTYAPI ölçümü. Bakımda oyun saati donsa bile *"worker 3 dakikadır nabız
   * atmıyor"* gerçek bir arızadır; kaydırsaydık arıza penceresi bakım süresi kadar gizlenirdi.
   * `missions.claimed_at` de öyle: görevin VADESİ oyun kuralıdır (kayar), ama ALINDIĞI an
   * bir ölçümdür ve `missions.locked_at` ile aynı aileye girer.
   */
  'scheduler_samples.at',
  'mission_errors.at',
  'missions.claimed_at',
  'ops_events.opened_at', 'ops_events.resolved_at', 'ops_events.notified_at',

  // 2 — Kimlik ve oturum (güvenlik: gerçek zamanda tanımlı)
  'accounts.created_at', 'accounts.email_verified_at', 'accounts.locked_until',
  'sessions.created_at', 'sessions.last_seen_at', 'sessions.expires_at',
  'sessions.revoked_at', 'sessions.elevated_until',
  'account_presence.claimed_at', 'account_presence.seen_at',
  'email_tokens.expires_at', 'email_tokens.used_at', 'email_tokens.created_at',
  'push_subscriptions.created_at', 'push_subscriptions.last_used_at', 'push_subscriptions.failed_at',

  /**
   * 2 — DESTEK / İLETİŞİM (0047). ⚠️ Hepsi **gerçek zamanda** ve bu bilinçli bir karar,
   * unutulmuş bir sınıflandırma değil: destek bir oyun mekaniği değil, oyunun **dışına açılan
   * kanal**. Bakımda oyun saati donuyor ama destek yazışması donmamalı — nitekim aynı gerekçe
   * `MaintenanceInterceptor` muafiyetinde ve `MAINTENANCE_PASSTHROUGH_TOPICS`te de yazılı:
   * oyuncu tam da oyuna GİREMEDİĞİ anda buraya yazar.
   *
   * ⚠️ `public_token_expires_at` şimdiki zamanla KARŞILAŞTIRILIYOR (`ticketIdForToken`) ama
   * yine de burada: emsali `email_tokens.expires_at` — jeton ömrü bir güvenlik penceresidir,
   * oyun vadesi değil. Bakım yüzünden uzasaydı, kaybedilmiş bir posta kutusunun elindeki
   * bağlantı da o kadar uzun yaşardı.
   * ⚠️ `support_attachments.created_at` de öyle: yetim süpürme bir SAKLAMA kuralı
   * (`ops-jobs.ts` ayrımının aynısı), oyun kuralı değil.
   */
  'support_tickets.created_at', 'support_tickets.updated_at', 'support_tickets.closed_at',
  'support_tickets.admin_notified_at', 'support_tickets.public_token_expires_at',
  'support_messages.created_at', 'support_messages.read_at',
  'support_attachments.created_at',

  /**
   * 2 — DEĞİŞİKLİK GÜNLÜĞÜ (0048). ⚠️ **Gerçek zamanda** — destekle aynı aile ve aynı gerekçe:
   * günlük bir oyun mekaniği değil, oyunun **hakkında** konuşan bir kanal. Madde "16 Ağustos'ta
   * yayınlandı" der; bakım o tarihi kaydırsaydı takvim yalan söylerdi.
   *
   * ⚠️ `published_at` şimdiki zamanla KARŞILAŞTIRILIYOR (`published_at <= now()`, ileri tarihli
   * madde henüz görünmez) ama yine de burada: emsali `support_tickets.public_token_expires_at`.
   * Kıyaslanıyor olması tek başına yetmiyor — soru "canlı bir OYUN kuralı mı okuyor" ve cevap
   * hayır. Bakım yüzünden yayın tarihinin ötelenmesi, duyuruyu gerçekte olmadığı bir güne
   * taşımak olurdu.
   */
  'changelog_entries.published_at', 'changelog_entries.created_at',
  'changelog_entries.updated_at',

  // 2 — Moderasyon (ceza bakım yapıldı diye uzamaz)
  'chat_bans.until', 'chat_bans.created_at',
  'alliance_chat_mutes.until', 'alliance_chat_mutes.created_at', 'alliance_chat_mutes.revoked_at',
  'chat_participants.muted_until', 'chat_participants.joined_at',
  'chat_reports.created_at', 'chat_reports.reviewed_at',
  'players.banned_at', 'players.ban_until', 'players.deleted_at',

  // 2 — İstismar taraması (penceresi açıkça gerçek zamanda — scan.handler.ts)
  'abuse_signals.window_from', 'abuse_signals.window_to',
  'abuse_signals.created_at', 'abuse_signals.resolved_at',
  'abuse_scan_runs.window_from', 'abuse_scan_runs.window_to',
  'abuse_scan_runs.started_at', 'abuse_scan_runs.finished_at', 'abuse_scan_runs.emailed_at',

  // 3 — Sosyal künye
  'players.created_at', 'players.last_seen_at', 'players.alliance_joined_at',
  'alliances.created_at',
  'alliance_invites.created_at', 'alliance_invites.decided_at',
  'cities.created_at', 'heroes.created_at',
  'player_blocks.created_at',
  'chat_channels.created_at', 'chat_messages.created_at', 'chat_messages.deleted_at',

  // 3 — Altyapı
  'player_devices.first_seen', 'player_devices.last_seen',
  'player_ips.first_seen', 'player_ips.last_seen',
  'disposable_meta.refreshed_at', 'ip_asn_meta.refreshed_at',
  'settings.updated_at', 'settings_revisions.created_at',
  'worlds.started_at', 'worlds.paused_at', 'worlds.maintenance_eta',

  // 3 — Kaydırmanın kendi defteri (bkz. `time_shifts` tablosu)
  'time_shifts.paused_at', 'time_shifts.resumed_at',
];
