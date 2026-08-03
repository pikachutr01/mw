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
 * ⭐ ZORLAMA KAPISI — kullanıcının açık şartı:
 * *"Altyapı hazır olsun ama çalıştığını onayladıktan sonra sadece prod ortamında aktif olsun."*
 *
 * İki koşul birden: panel anahtarı AÇIK **ve** üretim ortamı. Böylece
 *   • geliştirmede (ben tarayıcıdan bakarken kullanıcı da kendi tarayıcısında açıkken)
 *     kural asla devreye girmez,
 *   • canlıda da panelden açılana kadar sessiz kalır.
 *
 * `SINGLE_SESSION_FORCE=1` yalnız dev'de kuralı SINAMAK için; üretimde okunmaz çünkü orada
 * zaten `NODE_ENV === 'production'`.
 */
export function singleDeviceEnforced(): boolean {
  if (process.env['SINGLE_SESSION_FORCE'] === '1') return true;
  if (process.env['NODE_ENV'] !== 'production') return false;
  return liveBool('session', 'singleDevice', false);
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
             platform    = excluded.platform,
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
   * ⚠️ Çağrı sıklığı `AuthGuard` tarafından kısılıyor (örnek başına 30 sn'de bir): her istekte
   * bir UPDATE, oyunun en sıcak yoluna gereksiz bir yazma koyardı.
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
