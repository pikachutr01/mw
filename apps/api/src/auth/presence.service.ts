/**
 * ⭐ TEK CİHAZ KURALI (kullanıcı, 2026-08-03).
 *
 * *"Bir hesabın aynı anda sadece bir cihazda açık olabilmesi… İkinci bir cihazda bir hesap
 * açılırsa oynamasını engelleyelim… Aynı şekilde bir cihazda başka bir sekmede bile açarsa
 * onu da engelleyelim."*
 *
 * ─ Neden `sessions` yetmedi ───────────────────────────────────────────────────────────────
 * Aynı tarayıcının iki sekmesi aynı `localStorage`ı ve dolayısıyla **aynı oturum satırını**
 * paylaşır. `sessions` sekmeleri ayırt edemez. Bu yüzden istemci `sessionStorage`ta bir
 * `instanceId` üretiyor (yeni sekme = yeni kimlik, sayfa yenileme = aynı kimlik) ve
 * `X-Client-Instance` başlığıyla gönderiyor.
 *
 * ⚠️ `instanceId` kimlik doğrulamasında ASLA kullanılmaz — istemci üretiyor, taklit edilebilir.
 * Kimlik hâlâ imzalı jetonda; bu yalnız "aynı hesabın hangi kopyası" ayrımı.
 *
 * ─ ⭐⭐ `instanceId` SÖZLEŞMESİ: «çalışan tek kopya» ────────────────────────────────────────
 * Tanım platformdan bağımsız: **uygulamanın aynı anda çalışan bir kopyası ne ise o.**
 * Uygulaması platforma göre değişiyor ve yanlış seçim oyuncuyu KENDİ hesabından kilitler:
 *
 * | istemci | kopya nedir | nerede saklanır | yaşam süresi |
 * | :-- | :-- | :-- | :-- |
 * | Web / PWA | **canlı sekme** | `sessionStorage` + kalıcı yedek, ayrımı **Web Locks** yapar | sekme kapanana kadar (F5 ve yeniden açılış korur) |
 * | Flutter (Android/iOS) | **kurulum** | kalıcı depo (`shared_preferences` vb.) | uygulama silinene kadar |
 *
 * ⚠️⚠️ **KİMLİK HER AÇILIŞTA YENİDEN ÜRETİLMEZ.** Uygulamalar sürekli öldürülüp yeniden
 * açılır (arka plan, bellek baskısı, kullanıcı kaydırması). Her açılışta yeni kimlik
 * üretilseydi, önceki kimliğin sahipliği `claimGraceSeconds` (90 sn) boyunca taze kaldığı
 * için oyuncu **kendi hesabına ~90 saniye giremezdi** — üstelik hatanın sebebi ekranda
 * "hesabın başka bir cihazda açık" diye görünürdü. Aynı kimlikle dönen kopya `claim`in
 * 2. kuralına ("sahip zaten biziz") takılır ve anında geçer.
 *
 * ⚠️⚠️ **BU UYARI ÖNCE YALNIZ MOBİL İÇİN YAZILDI VE WEB TAM ONA DÜŞTÜ** (2026-08-16).
 * Web kimliği yalnız `sessionStorage`taydı; orası sekme/PWA kapanınca silinir, yani her
 * açılış yeni bir kopya sayılıyordu. Canlıda bir günde **773 adet 409, 12 farklı oyuncu**.
 * Web artık kalıcı bir yedek tutuyor ve "başka canlı kopya var mı" sorusunu **Web Locks**'a
 * soruyor: kilit alınabiliyorsa eski kimliği geri kuşanıyor, alınamıyorsa gerçekten ikinci
 * sekmedir ve yeni kimlik üretiyor. Tamamı `apps/web/src/lib/instance-id.ts`te.
 *
 * ⚠️ Mobilde sekme kavramı olmadığı için `instanceId`in `deviceId` ile aynı değer olması
 * tamamen doğrudur; ikisini ayrı tutmak yalnız web'de anlamlı.
 *
 * ⚠️ Başlığı hiç göndermeyen istemci `s:<sessionId>`ye düşer (`auth.guard.ts` `instanceOf`) —
 * yani tek kopya gibi davranır. Kuralı atlatmaz ama sekmeleri ayırt edilemez.
 *
 * ─ Neden bellek değil veritabanı ──────────────────────────────────────────────────────────
 * `RealtimeGateway`in `online` haritası yalnız kendi sürecinin soketlerini biliyor. Bugün tek
 * süreç var (`ROLE=all`) ama kilidi belleğe koymak, ikinci bir API süreci açıldığı gün kuralın
 * **sessizce** delinmesi demekti.
 *
 * ─ Devralma (kullanıcı kararı) ────────────────────────────────────────────────────────────
 * Kesin engelleme yerine "Bu cihazda devam et": tek anda tek oyun kuralı korunuyor ama
 * tarayıcısı çöken / telefonunu kaybeden oyuncu kendi hesabından kilitli kalmıyor.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { liveBool, liveNumber } from '../settings/live.ts';

export interface PresenceHolder {
  instanceId: string;
  platform: string | null;
  /** Sahibin son ses verdiği an (ISO) — modalda "3 dakika önce" diye gösteriliyor. */
  seenAt: string;
}

export interface ClaimInput {
  accountId: number;
  sessionId: string;
  instanceId: string;
  worldId: number;
  platform?: string | null;
  /** `true` → sahibi kim olursa olsun devral (kullanıcı düğmeye bastı). */
  force?: boolean;
}

export type ClaimResult =
  | { ok: true; tookOver: boolean; previous: PresenceHolder | null }
  | { ok: false; holder: PresenceHolder };

/**
 * ⭐⭐ ZORLAMA KAPISI — **tek koşul: panel anahtarı** (kullanıcı, 2026-08-12).
 *
 * ⚠️⚠️ **BU KAPI, KURALIN DOKUZ AY BOYUNCA HİÇ ÇALIŞMAMASININ SEBEBİYDİ.** Eski hâli:
 *
 * ```
 * if (process.env['SINGLE_SESSION_FORCE'] === '1') return true;
 * if (process.env['NODE_ENV'] !== 'production') return false;   // ← dev'de KOŞULSUZ ölüm
 * return liveBool('session', 'singleDevice', false);            // ← prod varsayılanı KAPALI
 * ```
 *
 * Üç kilit üst üste binmişti ve üçüncüsü hiç açılmadı. Ama asıl kusur mekanizmada değil,
 * **kilitlerin birbirini kilitlemesinde**: kural *"canlıda gözle doğrulanmadan açılmamalı"*
 * diyordu, dev'de ise **hiçbir koşulda** koşamıyordu. Yani doğrulanabileceği tek yer üretimdi
 * ve kimse doğrulanmamış bir kuralı üretimde açmaya cesaret edemedi. Kısır döngü.
 * 2026-08-12 ölçümü bunu kanıtladı: canlıda `settings` tablosunda tek bir `session.*` satırı
 * yok ve `account_presence` **sıfır satır** — kural üretimde de hiç koşmamış.
 *
 * ⭐ Çözüm ortam kontrolünü **kaldırmak**: kural artık her yerde aynı anahtara bakıyor, yani
 * dev'de de koşuyor ve gözle doğrulanabiliyor. Varsayılan **AÇIK** — veri bütünlüğünü koruyan
 * bir kuralın varsayılanının kapalı olması, tam olarak buraya nasıl gelindiğinin hikâyesi.
 *
 * ⚠️ `SINGLE_SESSION_OFF=1` acil durum vanası: kural canlıda beklenmedik biçimde oyuncuları
 * kilitlerse, panele erişmeden (ya da panel de kilitliyse) süreç yeniden başlatılarak
 * kapatılabilir. Eski `SINGLE_SESSION_FORCE`ın amacı kalmadı — dev artık anahtara uyuyor.
 */
export function singleDeviceEnforced(): boolean {
  if (process.env['SINGLE_SESSION_OFF'] === '1') return false;
  return liveBool('session', 'singleDevice', true);
}

/** Sahiplik bu süre boyunca ses vermezse serbest kalır. */
export function claimGraceSeconds(): number {
  return liveNumber('session', 'claimGraceSeconds', 90);
}

/**
 * Soket koptuktan sonra sahipliğin geçerli kalacağı süre (bkz. `release`).
 * Sayfa yenilemesini kapsayacak kadar uzun, kapanan tarayıcıyı bekletmeyecek kadar kısa.
 */
const RELEASE_GRACE_SECONDS = 20;

/**
 * ⭐⭐ İPTAL EDİLMİŞ OTURUMUN SAHİPLİĞİNİ DÜŞÜR (2026-08-12).
 *
 * ⚠️ **Kuralı açarken bulunan gerçek boşluk.** `account_presence.session_id` `sessions(id)`e
 * `ON DELETE CASCADE` bağlı, ama oturum iptali satırı SİLMİYOR — yalnız `revoked_at` yazıyor.
 * Yani sahiplik iptalden sonra `claimGraceSeconds` (90 sn) boyunca asılı kalıyordu ve tam da
 * en kötü anda:
 *   • "Diğer tüm cihazlardan çık" diyen oyuncu, kendi cihazından 90 saniye giremiyordu;
 *   • hesabı ele geçirilen oyuncu parolayı değiştirip saldırganı atıyor, ama sahiplik
 *     saldırganın örneğinde kaldığı için **kendi hesabına giremiyordu.**
 *
 * ⚠️ Ölçüt "şu oturumlar iptal edildi" değil **"sahipliği tutan oturum hâlâ geçerli mi"** —
 * çağıranın hangi kimlikleri düşürdüğünü bilmesine gerek yok, dört iptal yolu (çıkış · zincir ·
 * diğerleri · hepsi) tek bir ifadeyle kapanıyor.
 */
export async function releaseRevokedPresence(db: Db, accountId: number): Promise<void> {
  await db.execute(sql`
    DELETE FROM account_presence ap
     WHERE ap.account_id = ${accountId}
       AND NOT EXISTS (
         SELECT 1 FROM sessions s
          WHERE s.id = ap.session_id AND s.revoked_at IS NULL AND s.expires_at > now()
       )
  `);
}

const rowToHolder = (r: Record<string, unknown>): PresenceHolder => ({
  instanceId: String(r['instance_id']),
  platform: r['platform'] == null ? null : String(r['platform']),
  seenAt: new Date(String(r['seen_at'])).toISOString(),
});

export class PresenceService {
  constructor(private readonly db: Db) {}

  /**
   * Sahipliği al. Üç durumda başarılı olur:
   *   1. sahip yok,
   *   2. sahip zaten biziz (aynı `instanceId`),
   *   3. sahibin `seen_at`i zaman aşımına uğramış **ya da** `force` verilmiş.
   *
   * ⚠️ TEK SORGU, tek atomik `INSERT … ON CONFLICT … DO UPDATE … WHERE`. İki adımlı
   * (önce SELECT sonra UPDATE) yazsaydık iki cihaz aynı anda "sahip yok" görüp ikisi de
   * sahiplenirdi — tam da engellemeye çalıştığımız durum.
   *
   * ⚠️ `RETURNING`in ÖNCEKİ satırı vermesi için `account_presence AS ap` kendi eski hâliyle
   * okunuyor: Postgres'te `ON CONFLICT DO UPDATE` içinde eski satır `account_presence.<sütun>`
   * ile erişilebilir, `excluded.<sütun>` ise yeni değerdir.
   *
   * ⚠️⚠️ **`platform` `COALESCE` ile yazılıyor** (2026-08-16). `NULL` burada "platform yok"
   * değil **"bilmiyorum"** demek ve bilmeyen bir çağıranın bileni ezmesi için sebep yok.
   * Ezdiği de ölçüldü: soket el sıkışması bu metodu platformsuz çağırıyordu ve girişten
   * saniyeler sonra `AuthGuard`ın yazdığı `web` değerini siliyordu. Canlıda 25 sahiplik
   * satırının 10'u platformsuzdu; çakışma modalı bu yüzden **nerede açık olduğunu hiç
   * söyleyemiyor**, yalnız «başka bir yerde açık» diyordu.
   *
   * ⚠️ Asıl düzeltme soket tarafında (platform artık el sıkışmada gidiyor); buradaki
   * `COALESCE` ikinci hat, yarın platformu bilmeyen üçüncü bir çağıran eklenirse aynı hata
   * sessizce geri gelmesin diye.
   * ⚠️ Örnek DEĞİŞTİĞİNDE de korunuyor ve bu doğru: yeni sahip platformunu bildiriyorsa
   * zaten yazılır, bildirmiyorsa elimizdeki tek bilgi eskisidir.
   */
  async claim(input: ClaimInput, attempt = 0): Promise<ClaimResult> {
    const grace = claimGraceSeconds();
    /**
     * Önceki sahip YALNIZ bildirim için okunuyor — karara girmiyor, o aşağıdaki tek atomik
     * ifadede veriliyor. Yarış olsa bile en kötü ihtimalle "kimi düşürdüğümüzü" yanlış
     * biliriz; kilidin doğruluğu etkilenmez.
     */
    const before = await this.holder(input.accountId);
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      INSERT INTO account_presence (account_id, instance_id, session_id, world_id, platform)
      VALUES (
        ${input.accountId}, ${input.instanceId}, ${input.sessionId}::uuid,
        ${input.worldId}, ${input.platform ?? null}
      )
      ON CONFLICT (account_id) DO UPDATE
         SET instance_id = excluded.instance_id,
             session_id  = excluded.session_id,
             world_id    = excluded.world_id,
             -- ⚠️⚠️ COALESCE, düz excluded.platform DEĞİL (2026-08-16). Gerekçe aşağıda,
             --    metodun yorumunda: NULL burada "bilmiyorum" demek, "yok" değil.
             -- ⚠️⚠️ COALESCE, düz excluded.platform DEĞİL (2026-08-16). Gerekçe metodun
             --    yorumunda: NULL burada "bilmiyorum" demek, "yok" değil.
             platform    = COALESCE(excluded.platform, account_presence.platform),
             claimed_at  = CASE WHEN account_presence.instance_id = excluded.instance_id
                                THEN account_presence.claimed_at ELSE now() END,
             seen_at     = now()
       WHERE account_presence.instance_id = excluded.instance_id
          OR account_presence.seen_at < now() - (${grace} * interval '1 second')
          OR ${input.force ?? false}
      RETURNING instance_id, platform, seen_at
    `);

    if (rows.length > 0) {
      const displaced = before && before.instanceId !== input.instanceId ? before : null;
      return { ok: true, tookOver: displaced != null, previous: displaced };
    }

    const holder = await this.holder(input.accountId);
    /**
     * `WHERE` tutmadı ama sorgular arasında sahiplik serbest kalmış olabilir → bir kez daha
     * dene. ⚠️ Sayaç ŞART: `holder()` ile `INSERT`in zaman aşımı kıyası aynı saniyede farklı
     * sonuç verirse sınırsız özyineleme olurdu — kilit kodunun en sinsi hata biçimi.
     */
    if (!holder && attempt < 2) return this.claim({ ...input, force: false }, attempt + 1);
    if (!holder) return { ok: true, tookOver: false, previous: null };
    return { ok: false, holder };
  }

  /** Sahiplik kimde? (Zaman aşımına uğramışsa `null` — kimse sahip değil demektir.) */
  async holder(accountId: number): Promise<PresenceHolder | null> {
    const grace = claimGraceSeconds();
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT instance_id, platform, seen_at FROM account_presence
       WHERE account_id = ${accountId}
         AND seen_at >= now() - (${grace} * interval '1 second')
    `);
    return rows[0] ? rowToHolder(rows[0]) : null;
  }

  /**
   * "Hâlâ buradayım." Yalnız sahibin satırına dokunur.
   *
   * ⚠️⚠️ **Çağıranı `RealtimeGateway`in sahiplik nabzı** (2026-08-16). Buradaki yorum uzun
   * süre *"çağrı sıklığı `AuthGuard` tarafından kısılıyor"* diyordu ve bu **doğru değildi**:
   * guard `claim` çağırıyor, `touch`u değil. Fonksiyonun HİÇBİR çağıranı yoktu ve yokluğu
   * gerçek bir açık bırakıyordu — soketi bağlı ama HTTP'de sessiz bir oyuncu 90 saniye sonra
   * sahipsiz görünüyordu. Gerekçenin tamamı `realtime.gateway.ts` → `startPresenceHeartbeat`.
   *
   * ⚠️ Sahip DEĞİLSEK hiçbir satır etkilenmez (`WHERE instance_id = …`) — devralınmış bir
   * örneğin nabzı yeni sahibin damgasını diriltemez.
   */
  async touch(accountId: number, instanceId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE account_presence SET seen_at = now()
       WHERE account_id = ${accountId} AND instance_id = ${instanceId}
    `);
  }

  /**
   * ⭐ YUMUŞAK BIRAKMA — soket koptu, ama bu bir SAYFA YENİLEMESİ de olabilir.
   *
   * ⚠️ İlk yazımda satır DOĞRUDAN SİLİNİYORDU ve ölçüm bunu yakaladı: oyuncu «Bu cihazda
   * devam et» deyip sayfa yenilenince soketi kopuyor, kopuş sahipliği siliyor ve **çakışma
   * modalında 10 saniyede bir yoklayan rakip sekme** onu anında kapıyordu. Yani devralma
   * geri tepiyordu — kullanıcı düğmeye basıyor, oyun öteki sekmeye geri dönüyordu.
   *
   * Doğrusu: satırı silmek yerine son görülme damgasını geriye çekmek. Sahiplik kısa bir süre
   * (~20 sn) daha GEÇERLİ kalıyor:
   *   • sayfa yenilemesi 1-2 saniyede tamamlanır ve AYNI örnek sahipliği geri alır → rakip
   *     araya giremez,
   *   • tarayıcı gerçekten kapandıysa 20 saniyede serbest kalır (tam zaman aşımını,
   *     `claimGraceSeconds`i beklemeye gerek kalmaz).
   *
   * ⚠️ Yalnız KENDİ satırına dokunur: devralınmışsa yeni sahibin satırı korunur.
   */
  async release(accountId: number, instanceId: string): Promise<void> {
    const grace = claimGraceSeconds();
    // ⚠️ Çıkarma JS'te: `(${a} - ${b})` iki tipsiz parametre demek ve Postgres
    //    «operator is not unique: unknown - unknown» diyerek reddediyor.
    const back = Math.max(0, grace - Math.min(RELEASE_GRACE_SECONDS, grace));
    await this.db.execute(sql`
      UPDATE account_presence
         SET seen_at = LEAST(seen_at, now() - (${back} * interval '1 second'))
       WHERE account_id = ${accountId} AND instance_id = ${instanceId}
    `);
  }

  /**
   * Sahipliği HEMEN bırak — çıkış yapıldı.
   * Yumuşak bırakmanın aksine burada tereddüt yok: oturum bitti, geri dönmeyecek.
   */
  async releaseNow(accountId: number, instanceId: string): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM account_presence
       WHERE account_id = ${accountId} AND instance_id = ${instanceId}
    `);
  }
}
