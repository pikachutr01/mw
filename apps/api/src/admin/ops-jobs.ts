/**
 * ⭐ TEMİZLİK GÖREVLERİ (§admin Faz 8) — hangi tablodan, hangi satır, NEDEN silinebilir.
 *
 * ⚠️ **ZAMAN KOLONU TUZAĞI.** Bu projede iki farklı zaman var: `messages.at`, `battles.at`,
 * `ranking_runs.taken_at` **OYUN saatinde**dir; bakımda donar, `worlds.clock_offset_ms` ile
 * gerçek saatten kayar. Saklama süresi ise bir DEPOLAMA kuralıdır ve gerçek zamanla ölçülür.
 * Bu yüzden her görev `created_at` benzeri **gerçek zaman** kolonuna bakar. `at` kullansaydık
 * uzun bir bakımdan sonra "60 günlük" eşiği aslında 62 gün öncesini keserdi — sessiz ve
 * fark edilmesi zor bir sapma.
 *
 * ⚠️ **NE SİLİNMEZ:** `audit_log` (yönetimin kendi kaydı — silinebilseydi denetim anlamsız
 * olurdu) · `battles` (savaş yeniden oynatılabilir kalmalı, §5) · teslim EDİLMEMİŞ `outbox`
 * satırı (ne kadar eski olursa olsun; bekleyen bir bildirimi kaybetmek temizliğin
 * üretebileceği en kötü sonuç) · `rankings` (üzerine yazılan tablo, aşağıda).
 */
import { sql, type SQL } from 'drizzle-orm';

/** Panelden düzenlenen saklama süreleri (`ops` ayar grubu). */
export interface OpsRetention {
  messagesReadDays: number;
  messagesAnyDays: number;
  chatDays: number;
  outboxDays: number;
  emailTokenDays: number;
  pushDeadDays: number;
  pushFailThreshold: number;
  rankingRunDays: number;
  sessionDays: number;
  cleanupBatch: number;
  staleHeartbeatS: number;
}

export interface CleanupJob {
  id: string;
  label: string;
  table: string;
  /** Gerçek zaman kolonu — "kalan en eski satır" bununla raporlanır. */
  timeColumn: string;
  /** Bu görevin sildiği satırın ne olduğu ve neden güvenli olduğu. */
  description: string;
  /** ⭐ Bilerek DIŞARIDA bırakılan satırlar. Panelde ayrı bir satır olarak gösterilir. */
  keeps: string;
  /** Kullandığı ayar anahtarları — panel «bu görevi ayarla» bağlantısını bundan üretir. */
  settings: readonly string[];
  where(r: OpsRetention): SQL;
}

/** `now() - <n> gün`. Aralık parametreleştirilemediği için çarpım kullanılıyor. */
function daysAgo(n: number): SQL {
  return sql`now() - (${n} * interval '1 day')`;
}

export const CLEANUP_JOBS: readonly CleanupJob[] = [
  {
    id: 'messages',
    label: 'Eski postalar',
    table: 'messages',
    timeColumn: 'created_at',
    description: 'Savaş/casus/nakliye raporları. Okunmuş olanlar saklama süresini geçince, '
      + 'okunmamışlar yalnız sert tavanı geçince silinir.',
    keeps: '⭐ OKUNMAMIŞ postalar tavana kadar korunur — oyuncunun hiç görmediği bir savaş '
      + 'raporunu silmek veriyi değil, oyuncunun ne olduğunu öğrenme hakkını siler.',
    settings: ['ops.messagesReadDays', 'ops.messagesAnyDays'],
    where: (r) => sql`
      (read_at IS NOT NULL AND created_at < ${daysAgo(r.messagesReadDays)})
      OR created_at < ${daysAgo(r.messagesAnyDays)}
    `,
  },
  {
    id: 'chat',
    label: 'Eski sohbet mesajları',
    table: 'chat_messages',
    timeColumn: 'created_at',
    description: 'Sohbet akıştır, arşiv değil; en hızlı büyüyen tablolardan biri.',
    keeps: 'Sabitlenmiş (`is_pinned`) mesajlar — ittifak kuralları genelde orada durur.',
    settings: ['ops.chatDays'],
    where: (r) => sql`is_pinned = false AND created_at < ${daysAgo(r.chatDays)}`,
  },
  {
    id: 'outbox',
    label: 'Teslim edilmiş outbox satırları',
    table: 'outbox',
    timeColumn: 'created_at',
    description: 'Dispatcher tarafından teslim edilmiş satırlar. Görevini yapmış, kimse okumuyor.',
    keeps: '⚠️ Teslim EDİLMEMİŞ satırlar — yaşı ne olursa olsun. Ölü mektup kuyruğundaki bir '
      + 'satır bir arıza kanıtıdır; silmek arızayı görünmez yapar.',
    settings: ['ops.outboxDays'],
    where: (r) => sql`dispatched_at IS NOT NULL AND dispatched_at < ${daysAgo(r.outboxDays)}`,
  },
  {
    id: 'email_tokens',
    label: 'Kullanılmış / süresi geçmiş e-posta jetonları',
    table: 'email_tokens',
    timeColumn: 'created_at',
    description: 'Doğrulama ve şifre sıfırlama bağlantıları. Jeton zaten işlevsiz.',
    keeps: 'Hâlâ geçerli ve kullanılmamış jetonlar.',
    settings: ['ops.emailTokenDays'],
    where: (r) => sql`
      expires_at < ${daysAgo(r.emailTokenDays)}
      OR (used_at IS NOT NULL AND used_at < ${daysAgo(r.emailTokenDays)})
    `,
  },
  {
    id: 'push',
    label: 'Ölü push abonelikleri',
    table: 'push_subscriptions',
    timeColumn: 'created_at',
    description: 'Üst üste başarısız olmuş abonelikler — tarayıcı izni geri almış demektir.',
    keeps: 'Hiç hata almamış ya da eşiğin altında kalan abonelikler.',
    settings: ['ops.pushDeadDays', 'ops.pushFailThreshold'],
    where: (r) => sql`
      fail_count >= ${r.pushFailThreshold}
      AND failed_at IS NOT NULL AND failed_at < ${daysAgo(r.pushDeadDays)}
    `,
  },
  {
    id: 'ranking_runs',
    label: 'Eski sıralama koşuları',
    table: 'ranking_runs',
    timeColumn: 'created_at',
    description: '⚠️ Plan bu görevi "eski `rankings`" diye tarif ediyordu; ölçünce yanlış '
      + 'olduğu görüldü. `rankings` her anlık görüntüde ÜZERİNE YAZILIYOR '
      + '(unique world+kind+subject) → boyutu oyuncu sayısıyla sınırlı, büyümüyor. Biriken '
      + 'tablo koşu GEÇMİŞİ olan `ranking_runs` (günde 3 satır/dünya).',
    keeps: '`rankings` tablosuna hiç dokunulmuyor — sıralama ekranı onu okuyor.',
    settings: ['ops.rankingRunDays'],
    where: (r) => sql`created_at < ${daysAgo(r.rankingRunDays)}`,
  },
  {
    id: 'sessions',
    label: 'Ölü oturumlar',
    table: 'sessions',
    timeColumn: 'created_at',
    description: 'İptal edilmiş ya da süresi geçmiş oturum satırları. Dönmeli refresh her '
      + 'yenilemede yeni satır açtığı için bu tablo en hızlı büyüyendir.',
    keeps: '⚠️ Canlı zincirler: aktif satırın `expires_at`i gelecekte ve `revoked_at`i boştur, '
      + 'iki koşula da girmez. Oyuncu temizlikten sonra oturumundan DÜŞMEZ.',
    settings: ['ops.sessionDays'],
    where: (r) => sql`
      (revoked_at IS NOT NULL AND revoked_at < ${daysAgo(r.sessionDays)})
      OR expires_at < ${daysAgo(r.sessionDays)}
    `,
  },
] as const;

export const JOBS_BY_ID: Readonly<Record<string, CleanupJob>> = Object.freeze(
  Object.fromEntries(CLEANUP_JOBS.map((j) => [j.id, j])),
);
