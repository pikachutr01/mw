/**
 * ⭐ VERİ TABANI TARAYICI POLİTİKASI (admin Faz 7).
 *
 * ⚠️ **Genel amaçlı "SQL çalıştır" kutusu YOK** (planın 5. kısıtı). Her tablo burada adıyla
 * kayıtlı; kayıtta olmayan tablo tarayıcıda **görünmez bile**. Bu bir liste değil bir
 * **beyaz liste**: yarın eklenen bir tablo kendiliğinden düzenlenebilir hâle gelmesin.
 *
 * Üç politika var:
 *   `readonly` — okunur, hiçbir kolonu düzenlenemez
 *   `edit`     — YALNIZ `editable` listesindeki kolonlar (ham kipte)
 *   `action`   — okunur; değişiklik yalnız küratörlü aksiyondan (`admin.actions.controller`)
 */

export interface TableSpec {
  /** Tablo adı — SQL'e **yalnız buradan** giriyor (istemciden gelen ad asla). */
  name: string;
  label: string;
  /** Varsayılan sıralama kolonu (DESC). */
  orderBy: string;
  /** Görüntülenecek kolonlar. Boşsa `SELECT *`. */
  columns?: readonly string[];
  policy: 'readonly' | 'edit' | 'action';
  /** `edit` politikasında düzenlenebilen kolonlar. */
  editable?: readonly string[];
  /** Satır filtrelemede kullanılabilen kolonlar (tam eşleşme). */
  filters?: readonly string[];
  /** ⚠️ Ekranda kırmızı uyarı olarak gösterilir — türev/çıpalı alan tuzakları. */
  warning?: string;
}

/**
 * ⛔ **ASLA YAZILAMAZ** — ham kipte bile. Üçü de EKLEME-YALNIZ sözleşmeye sahip:
 * `audit_log` ve `battles` geçmişin kendisi, `outbox` teslim garantisinin defteri.
 * Düzenlenebilir olsalardı "ne olduğu" sorusunun cevabı güvenilmez olurdu.
 */
const APPEND_ONLY = 'Bu tablo EKLEME-YALNIZ: geçmiş kaydı, düzenlenemez.';

export const DB_TABLES: readonly TableSpec[] = [
  /* ── Oyuncu ve dünya ─────────────────────────────────────────────────────── */
  {
    name: 'players', label: 'Oyuncular', orderBy: 'id', policy: 'edit',
    columns: ['id', 'world_id', 'account_id', 'username', 'score', 'score_base', 'alliance_id',
      'protected_until', 'vacation_until', 'banned_at', 'ban_until', 'ban_mode', 'last_seen_at'],
    /**
     * ⚠️ `score` ve `score_base` **düzenlenebilir DEĞİL**: `score` türev
     * (`floor(score_base/1000)`) ve elle yazılan değer ilk `addScoreBase` çağrısında geri
     * hesaplanıp silinir. Doğrusu «Puanı yeniden hesapla» aksiyonu.
     */
    editable: ['protected_until', 'vacation_until', 'alliance_id'],
    filters: ['world_id', 'username', 'alliance_id'],
    warning: '⚠️ `score` TÜREVDİR (floor(score_base/1000)) — elle yazılırsa ilk puan '
      + 'hareketinde silinir. Ceza alanları için Moderasyon ekranını kullan.',
  },
  {
    name: 'accounts', label: 'Hesaplar', orderBy: 'id', policy: 'readonly',
    columns: ['id', 'email', 'role', 'email_verified_at', 'locked_until', 'failed_logins',
      'created_at'],
    filters: ['email', 'role'],
    warning: '⛔ Salt-okunur: parola özeti ve rol buradan değiştirilmez. Rol ataması '
      + 'bilerek panelde yok (ilk adminin kendini yaratması gerekirdi).',
  },
  {
    name: 'cities', label: 'Şehirler', orderBy: 'id', policy: 'action',
    columns: ['id', 'world_id', 'player_id', 'name', 'k', 'd', 's', 'is_capital',
      'gold', 'food', 'resources_at', 'wall_integrity', 'wall_repair_until'],
    filters: ['world_id', 'player_id', 'name'],
    /** ⭐ Kısıt 4 — panelin en önemli uyarısı. */
    warning: '⛔ `gold`/`food` ELLE YAZILAMAZ. Kaynak tembel birikimle tutuluyor: gerçek '
      + 'değer = gold + (şimdi − resources_at) × üretim. Elle yazarsan bir sonraki okumada '
      + 'üstüne birikim eklenir ve yazdığın sayı tutmaz. «Kaynak ver/al» aksiyonunu kullan. '
      + 'Aynı sınıftan: `wall_integrity` ↔ `wall_repair_from/until` üçlüsü tutarlı olmalı.',
  },
  {
    name: 'buildings', label: 'Yapılar', orderBy: 'city_id', policy: 'action',
    columns: ['city_id', 'type', 'level'],
    filters: ['city_id', 'type'],
    warning: 'Değişiklik için «Yapı seviyesi ata» aksiyonunu kullan — puan türevi ayrıca '
      + 'yeniden hesaplanmalı.',
  },
  {
    name: 'units', label: 'Ordular', orderBy: 'city_id', policy: 'action',
    columns: ['city_id', 'type', 'count'],
    filters: ['city_id', 'type'],
    warning: 'Değişiklik için «Şehre ordu koy» aksiyonunu kullan (birim kimliği katalogdan '
      + 'doğrulanır — uydurma tip savaş motorunca tanınmaz).',
  },
  {
    name: 'cave_units', label: 'Mağaradaki ordular', orderBy: 'city_id', policy: 'action',
    columns: ['city_id', 'type', 'count'], filters: ['city_id', 'type'],
  },
  {
    name: 'defenses', label: 'Savunma yapıları', orderBy: 'city_id', policy: 'action',
    columns: ['city_id', 'type', 'count'], filters: ['city_id', 'type'],
  },
  {
    name: 'techs', label: 'Teknikler', orderBy: 'player_id', policy: 'action',
    columns: ['player_id', 'type', 'level'], filters: ['player_id', 'type'],
  },
  {
    name: 'heroes', label: 'Kahramanlar', orderBy: 'id', policy: 'edit',
    columns: ['id', 'world_id', 'player_id', 'city_id', 'name', 'level', 'xp', 'status',
      'revive_until'],
    editable: ['level', 'xp', 'status', 'city_id'],
    filters: ['world_id', 'player_id', 'city_id', 'status'],
    warning: '⚠️ `level` ile `xp` birbirine bağlı (`heroLevelForXp`): yalnız seviyeyi '
      + 'değiştirirsen bir sonraki tecrübe kazanımında seviye geri hesaplanabilir. '
      + '⚠️ Geçerli `status` değerleri: `alive` · `dead` · `reviving`. `dead` bir kahraman '
      + 'ancak `city_id` doluyken diriltilebilir; NULL ise oyuncuya «dönüyor» görünür.',
  },

  /* ── Kuyruk ve görevler ──────────────────────────────────────────────────── */
  {
    name: 'queues', label: 'Kuyruklar', orderBy: 'id', policy: 'action',
    columns: ['id', 'world_id', 'city_id', 'player_id', 'category', 'item_type', 'target_level',
      'count', 'done', 'started_at', 'finish_at', 'spent_gold', 'spent_food', 'mission_id',
      'canceled_at', 'completed_at'],
    filters: ['world_id', 'city_id', 'player_id', 'category'],
    warning: '⚠️ Kuyruk satırı ile `missions` satırı ÇİFTTİR. Yalnız kuyruğu kapatırsan '
      + 'bitiş görevi ayakta kalır ve olmayan bir kuyruğu tamamlamaya çalışır. '
      + '«Kuyruğu iptal et» aksiyonu ikisini birlikte kapatır.',
  },
  {
    name: 'missions', label: 'Görevler', orderBy: 'id', policy: 'action',
    columns: ['id', 'world_id', 'type', 'status', 'owner_player_id', 'origin_city_id',
      'target_city_id', 'execute_at', 'attempts', 'last_error', 'finished_at'],
    filters: ['world_id', 'type', 'status', 'owner_player_id'],
    warning: '⚠️ `execute_at` OYUN saatinde. Elle öne çekmek görevi hemen çalıştırır; '
      + 'bakımdayken saat donduğu için hiç çalışmaz.',
  },

  /* ── Sosyal ──────────────────────────────────────────────────────────────── */
  {
    name: 'alliances', label: 'İttifaklar', orderBy: 'id', policy: 'edit',
    /** ⚠️ Şemada `tag`/`description` YOK; ittifak metni tek kolonda (`text`). */
    columns: ['id', 'world_id', 'name', 'leader_id', 'text', 'created_at'],
    editable: ['name', 'text'],
    filters: ['world_id', 'name'],
  },
  {
    name: 'messages', label: 'Posta kutusu', orderBy: 'id', policy: 'readonly',
    columns: ['id', 'world_id', 'player_id', 'kind', 'side', 'subject', 'read_at', 'created_at'],
    filters: ['world_id', 'player_id', 'kind'],
  },
  {
    name: 'chat_messages', label: 'Sohbet mesajları', orderBy: 'id', policy: 'readonly',
    columns: ['id', 'channel_id', 'sender_id', 'body', 'created_at'],
    filters: ['channel_id', 'sender_id'],
    warning: 'Salt-okunur: moderasyon kararları Moderasyon ekranından verilir.',
  },
  {
    name: 'chat_reports', label: 'Şikayetler', orderBy: 'id', policy: 'readonly',
    columns: ['id', 'world_id', 'reporter_id', 'reported_player_id', 'reason', 'status',
      'body_snapshot', 'created_at'],
    filters: ['world_id', 'status', 'reported_player_id'],
  },
  {
    name: 'chat_bans', label: 'Sohbet yasakları', orderBy: 'id', policy: 'readonly',
    columns: ['id', 'world_id', 'player_id', 'scope', 'until', 'reason', 'created_by',
      'created_at'],
    filters: ['world_id', 'player_id'],
  },

  /* ── Altyapı ─────────────────────────────────────────────────────────────── */
  {
    name: 'sessions', label: 'Oturumlar', orderBy: 'created_at', policy: 'readonly',
    columns: ['id', 'chain_id', 'account_id', 'platform', 'device_model', 'ip', 'created_at',
      'last_seen_at', 'expires_at', 'revoked_at'],
    filters: ['account_id', 'platform'],
    warning: 'Oturum düşürmek için Oturumlar ekranını kullan — orası soketi de kapatır.',
  },
  {
    name: 'outbox', label: 'Outbox', orderBy: 'id', policy: 'readonly',
    columns: ['id', 'world_id', 'topic', 'attempts', 'last_error', 'created_at', 'dispatched_at'],
    filters: ['world_id', 'topic'],
    warning: `⛔ ${APPEND_ONLY} Teslim garantisinin defteri (§1).`,
  },
  {
    name: 'audit_log', label: 'Denetim kaydı', orderBy: 'id', policy: 'readonly',
    /** ⚠️ Zaman kolonu `at` — `created_at` DEĞİL (test yakaladı). */
    columns: ['id', 'world_id', 'player_id', 'action', 'entity', 'entity_id', 'before', 'after',
      'trace_id', 'at'],
    filters: ['world_id', 'player_id', 'action', 'entity'],
    warning: `⛔ ${APPEND_ONLY}`,
  },
  {
    name: 'battles', label: 'Savaşlar', orderBy: 'id', policy: 'readonly',
    columns: ['id', 'world_id', 'attacker_player_id', 'defender_player_id', 'at', 'winner',
      'night', 'engine_version', 'catalog_hash', 'settings_revision_id'],
    filters: ['world_id', 'attacker_player_id', 'defender_player_id'],
    warning: `⛔ ${APPEND_ONLY} Savaşın yeniden oynatılabilirliği buna dayanıyor.`,
  },
  {
    name: 'settings', label: 'Ayarlar (ham)', orderBy: 'key', policy: 'readonly',
    columns: ['world_id', 'key', 'value', 'updated_at', 'updated_by'],
    filters: ['world_id', 'key'],
    warning: 'Ayarlar ekranından düzenle — orası doğrulama yapar ve tüm süreçlere duyurur.',
  },
  {
    name: 'player_devices', label: 'Oyuncu cihazları', orderBy: 'last_seen', policy: 'readonly',
    columns: ['player_id', 'device_id', 'platform', 'first_seen', 'last_seen'],
    filters: ['player_id', 'device_id'],
  },
  {
    name: 'player_ips', label: 'Oyuncu IP\'leri', orderBy: 'last_seen', policy: 'readonly',
    columns: ['player_id', 'ip', 'first_seen', 'last_seen'],
    filters: ['player_id', 'ip'],
  },
  {
    name: 'abuse_signals', label: 'Kötüye kullanım sinyalleri', orderBy: 'id', policy: 'readonly',
    columns: ['id', 'world_id', 'kind', 'subject_player_id', 'score', 'created_at',
      'resolved_at'],
    filters: ['world_id', 'kind'],
    warning: '⚠️ Sinyal KARAR DEĞİL kayıt (§9.1.1). Otomatik ceza yok.',
  },
] as const;

export const TABLES_BY_NAME: Readonly<Record<string, TableSpec>> = Object.freeze(
  Object.fromEntries(DB_TABLES.map((t) => [t.name, t])),
);
