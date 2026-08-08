/**
 * ⭐ CANLI AYAR KÖPRÜSÜ — modül seviyesindeki limit sabitleriyle `SettingsService` arasında.
 *
 * Sorun şuydu: `CHAT_LIMITS`, `NOTIFY_LIMITS`, `MAIL_LIMITS` modül yüklenirken `process.env`den
 * okunan **donmuş** nesnelerdi ve 23 yerde tüketiliyorlardı. Panelden düzenlenebilmeleri için
 * ya 23 çağrı noktasına `worldId` geçirmek ya da nesneleri canlı hâle getirmek gerekiyordu.
 *
 * Seçilen yol: **tek bir yerde tutulan etkin görüntü**, tüketiciler onu fonksiyonla okur
 * (`chatLimits().burst`). Gizli `get` erişimcileri değil AÇIK fonksiyon: `const` görünen bir
 * nesnenin altından değerin değişmesi, bu kod tabanının tam da uyardığı sınıfta bir sürpriz
 * olurdu.
 *
 * ⚠️ **KAPSAM: kurulum geneli (dünya 0).** İşletim limitleri bugün dünya bilmeyen yerlerde de
 * okunuyor (`mail/templates.ts`, `mail.service.ts` — orada `worldId` hiç yok). Dünya bazlı
 * geçersiz kılma **saklanıyor ve panelde görünüyor** ama tüketim dünya 0 katmanından. Gerçek
 * dünya bazlı limit gerektiğinde çağrı noktalarına `worldId` geçirilecek; depolama değişmez.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ 2026-08-08 — YUKARIDAKİ KAPSAM KARARI SESSİZ BİR ARIZAYA DÖNÜŞTÜ
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * Kullanıcı: *"Savaş Motoru altından saldırı puan farkı sınırını 0 yapmama rağmen modal
 * üzerinden engellenmeye devam ediyorum."* Yerelde ölçüldü, kayıt **gerçekten yazılmıştı**:
 *
 *     world_id | key                     | value
 *            1 | combat.attackScoreRatio | 0
 *
 * Ama `liveNumber` **dünya 0** görüntüsünden okuyor, orada satır yok, koda gömülü 10'a düşüyor.
 *
 * ⚠️⚠️ **Asıl mesele, iki ayrı doğru kararın çarpışması.** Kapsamın dünya 0 olması bilinçliydi
 * (yukarıdaki gerekçe hâlâ geçerli). Panelin `worldId: 1`'e sabit yazması da bilinçliydi
 * (`apps/admin/src/App.tsx`: *"oyun tarafı dünya seçicisi kazandı, panel …"*). İkisi ayrı ayrı
 * savunulabilir; **birlikte** ise panelin yazdığı katmanı hiçbir tüketicinin okumadığı anlamına
 * geliyordu — yani bu köprüden okunan HER ayar panelden sessizce değiştirilemez durumdaydı.
 * Ne bir hata mesajı ne de bir uyarı: panel *"kaydedildi, tüm süreçlerde hemen etkin"* diyordu.
 *
 * Çare kapsamı değiştirmek DEĞİL, **dünyayı bilen çağrı noktalarına yolu açmak**: `liveNumberFor`
 * dünya katmanını okur, bulamazsa dünya 0'a, o da yoksa çağıranın varsayılanına düşer. Dünyayı
 * bilmeyen çağrı noktaları (posta şablonları) eskisi gibi `liveNumber` kullanmaya devam eder.
 */
import type { SettingValue } from '@mobilwar/settings';

type Group = Readonly<Record<string, SettingValue>>;

/**
 * Etkin görüntü. `SettingsService.load()` her tazelemede bunu değiştirir.
 * Başlangıç değeri boş: servis kalkmadan okunursa tüketici kendi varsayılanına düşer.
 */
let active: Readonly<Record<string, Group>> = Object.freeze({});

export function setLiveSettings(groups: Readonly<Record<string, Group>>): void {
  active = groups;
}

/**
 * Bir grubun sayısal alanını okur; ayar yoksa çağıranın varsayılanına düşer.
 * ⚠️ Sessiz düşüş bilinçli: servis henüz yüklenmemişken (açılışın ilk milisaniyeleri, testler)
 * limit okuması patlamamalı.
 */
export function liveNumber(group: string, key: string, fallback: number): number {
  const v = active[group]?.[key];
  return typeof v === 'number' ? v : fallback;
}

/** `liveNumber`ın boolean kardeşi — aynı sessiz düşüş sözleşmesi. */
export function liveBool(group: string, key: string, fallback: boolean): boolean {
  const v = active[group]?.[key];
  return typeof v === 'boolean' ? v : fallback;
}

/* ── Dünya bazlı okuma (2026-08-08) ──────────────────────────────────────────── */

/**
 * `worldId` → o dünyanın etkin görüntüsü. `SettingsService` kaydeder.
 *
 * ⚠️ Anlık görüntü KOPYALANMIYOR, **çözücü** tutuluyor: `SettingsService.snapshot()` zaten
 * tembel ve önbellekli, ayrıca ayar değişince kendini temizliyor. Burada bir kopya tutsaydık
 * her `load()`ta tazelemeyi hatırlamamız gerekirdi — ve tam olarak o unutma, bu dosyanın
 * baştaki hatasının kardeşi olurdu.
 */
let resolver: ((worldId: number) => Readonly<Record<string, Group>>) | null = null;

export function setLiveSettingsResolver(
  fn: ((worldId: number) => Readonly<Record<string, Group>>) | null,
): void {
  resolver = fn;
}

/**
 * ⭐ Dünya katmanını da gören sayısal okuma. Düşüş sırası:
 * **dünya katmanı → dünya 0 (kurulum geneli) → çağıranın varsayılanı.**
 *
 * ⚠️ Çözücü yokken `liveNumber`a düşmek ŞART: testlerin çoğu yalnız `setLiveSettings({…})`
 * çağırıyor ve `SettingsService` hiç kurulmuyor. Düşmeseydi o testler sessizce varsayılanla
 * koşar, ölçtüklerini sandıkları ayarı hiç ölçmezlerdi.
 */
export function liveNumberFor(
  worldId: number, group: string, key: string, fallback: number,
): number {
  const v = resolver?.(worldId)?.[group]?.[key];
  return typeof v === 'number' ? v : liveNumber(group, key, fallback);
}

/** `liveNumberFor`ın boolean kardeşi. */
export function liveBoolFor(
  worldId: number, group: string, key: string, fallback: boolean,
): boolean {
  const v = resolver?.(worldId)?.[group]?.[key];
  return typeof v === 'boolean' ? v : liveBool(group, key, fallback);
}
