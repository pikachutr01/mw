/**
 * ⭐ TEMİZLİK GÖREVLERİ (§admin Faz 8) — hangi tablodan, hangi satır, NEDEN silinebilir.
 *
 * ⚠️ **ZAMAN KOLONU TUZAĞI — 0043'ten sonra da geçerli.** `messages.at`, `battles.at`,
 * `ranking_runs.taken_at` bir OYUN OLAYININ anıdır; saklama süresi ise bir DEPOLAMA kuralıdır.
 * Bu yüzden her görev `created_at` benzeri **gerçek zaman** kolonuna bakar.
 *
 * ⭐ Tek zaman çizgisinden (0043) önce fark daha da büyüktü: oyun saati `clock_offset_ms` kadar
 * geride yürüyordu ve `at` kullanan bir eşik uzun bir bakımdan sonra "60 günlük" yerine 62 gün
 * öncesini keserdi. O sapma artık YOK — ama ayrım hâlâ duruyor, çünkü bakımdan çıkışta oyun
 * damgaları ileri kaydırılırken (`world/time-registry.ts`) saklama damgaları kaydırılmıyor.
 * Yani "hangi kolona bakıyorum" sorusu hâlâ doğru cevaplanmak zorunda.
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
  /** Çoklu hesap izlerinin (`player_devices`, `player_ips`) saklama süresi — §9.1.2: 90 gün. */
  deviceSignalDays: number;
  cleanupBatch: number;
  staleHeartbeatS: number;
  /** ⭐ Faz 3 — kuyruk ölçüm örnekleri (`scheduler_samples`, dakikada 1 satır/dünya). */
  schedulerSampleDays: number;
  /** ⭐ Faz 3 — TAMAMLANMIŞ görevler. Oyunun en çok satır üreten tablosu. */
  missionDoneDays: number;
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
  /**
   * ⭐ ÇOKLU HESAP İZLERİ (2026-08-04). §9.1.2 *"topladığımız veri … **90 gün** saklanır,
   * gizlilik metninde açıkça yazılır"* diyordu ama **hiçbir iş bu iki tabloya dokunmuyordu**
   * — taahhüt yazılıydı, uygulaması yoktu. `sessions` temizliği bunları kapsamıyor: sayaç
   * tabloları bilerek `sessions`tan bağımsız yaşıyor (budamadan sonra öbek bilgisi kalsın diye).
   *
   * ⚠️ Ölçüt `last_seen`, `first_seen` DEĞİL: hâlâ kullanılan bir cihazın kaydı, ilk görüldüğü
   * gün eskidiği için silinmemeli — silseydik aktif oyuncunun cihazı her 90 günde bir "yeni
   * cihaz" olarak yeniden doğar ve korelasyon tarihi sürekli sıfırlanırdı.
   */
  {
    id: 'player_ips',
    label: 'Eski IP izleri',
    table: 'player_ips',
    timeColumn: 'last_seen',
    description: 'Çoklu hesap analizinin ham IP kayıtları. Gizlilik taahhüdü: 90 gün.',
    keeps: 'Son kullanımı pencerenin içinde olan kayıtlar — aktif oyuncunun IP\'si silinmez.',
    settings: ['ops.deviceSignalDays'],
    where: (r) => sql`last_seen < ${daysAgo(r.deviceSignalDays)}`,
  },
  {
    id: 'player_devices',
    label: 'Eski cihaz izleri',
    table: 'player_devices',
    timeColumn: 'last_seen',
    description: 'Çoklu hesap analizinin ham cihaz kayıtları. ⚠️ Silinen satır geri gelmez '
      +'ve onunla birlikte "bu iki hesap aynı cihazdan mı giriyordu" sorusunun cevabı da gider.',
    keeps: 'Son kullanımı pencerenin içinde olan kayıtlar.',
    settings: ['ops.deviceSignalDays'],
    where: (r) => sql`last_seen < ${daysAgo(r.deviceSignalDays)}`,
  },
  /**
   * ⭐⭐ BİTMİŞ GÖREVLER (Faz 3) — **plan bunu "hiç görevi yok" diye işaretlemişti** ve haklıydı:
   * oyunun en çok satır üreten tablosuna (her sefer, her yükseltme, her üretim bir satır) hiçbir
   * temizlik dokunmuyordu. Faz 3'ün ölçüm sorguları (`ops-monitor.ts`) bu tabloyu tarıyor, yani
   * büyümesi artık yalnız disk değil **izlemenin maliyeti** demek.
   *
   * ⚠️ Yalnız `done` siliniyor. Üç şey bilerek dışarıda:
   *   • `failed` — her biri çözülmemiş bir arıza kanıtı; silmek arızayı görünmez yapardı.
   *   • `canceled` — oyuncunun "ben bunu iptal etmiştim" itirazının tek dayanağı.
   *   • `scheduled`/`running` — yoldaki ordu. (Söylemeye gerek yok gibi duruyor; tam da bu
   *     yüzden yüklem `status = 'done'` ile AÇIKÇA sınırlanıyor, `finished_at IS NOT NULL` ile
   *     değil — ölü bir görevin de `finished_at`i dolu.)
   *
   * ⚠️ `mission_units` / `mission_heroes` / `mission_errors` FK'leri CASCADE → beraber gider.
   * `battles.mission_id` ise `ON DELETE SET NULL`: savaş kaydı KALIR (§5 yeniden oynatılabilirlik),
   * yalnız görevle bağı kopar.
   */
  {
    id: 'missions',
    label: 'Tamamlanmış görevler',
    table: 'missions',
    timeColumn: 'finished_at',
    description: 'Bitmiş sefer/yükseltme/üretim görevleri. Oyunun en hızlı satır üreteni; '
      + 'oyun durumu artık bu satırlarda değil, şehir ve ordu tablolarında.',
    keeps: '⚠️ ÖLÜ (`failed`) ve İPTAL EDİLMİŞ görevler — yaşı ne olursa olsun. Biri arıza '
      + 'kanıtı, diğeri oyuncunun itiraz hakkı. Yoldaki ordular da elbette dokunulmaz.',
    settings: ['ops.missionDoneDays'],
    where: (r) => sql`status = 'done' AND finished_at < ${daysAgo(r.missionDoneDays)}`,
  },
  /**
   * ⭐ KUYRUK ÖLÇÜMLERİ (Faz 3). Dakikada 1 satır/dünya = yılda ~525 bin satır (~60 MB).
   * ⚠️ `ops_events` ve `mission_errors` bilerek BURADA YOK: ikisi de seyrek yazılıyor (yalnız
   * arıza anında) ve ikisi de tam olarak "geçmişe dönük hata ayıklama" için var — büyüme riski
   * yokken silmenin tek etkisi kanıt kaybı olurdu.
   */
  {
    id: 'scheduler_samples',
    label: 'Kuyruk sağlığı ölçümleri',
    table: 'scheduler_samples',
    timeColumn: 'at',
    description: 'Scheduler\'ın dakikada bir yazdığı kuyruk sağlığı örnekleri (gecikme, '
      + 'atlanan satır, havuz durumu). Panelin geçmiş grafiği bunları okuyor.',
    keeps: 'Saklama penceresi içindeki örnekler. ⚠️ Kısaltmak geçmişe dönük teşhis yeteneğini '
      + 'kısaltır — 06.08.2026 olayında elde hiç geçmiş olmaması tanıyı saatlerce geciktirmişti.',
    settings: ['ops.schedulerSampleDays'],
    where: (r) => sql`at < ${daysAgo(r.schedulerSampleDays)}`,
  },
] as const;

export const JOBS_BY_ID: Readonly<Record<string, CleanupJob>> = Object.freeze(
  Object.fromEntries(CLEANUP_JOBS.map((j) => [j.id, j])),
);
