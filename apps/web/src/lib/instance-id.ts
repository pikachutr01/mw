/**
 * ⭐⭐ ÖRNEK (INSTANCE) KİMLİĞİ — tek cihaz kuralının web ayağı.
 *
 * `presence.service.ts` başlığındaki sözleşme: örnek kimliği **uygulamanın aynı anda çalışan
 * bir kopyası**dır. Web'de kopya = sekme. Flutter'da kopya = kurulum ve orada kimlik kalıcı
 * depoda tutuluyor; gerekçesi o dosyada zaten yazılı:
 *
 * > *"Her açılışta yeni kimlik üretilseydi, önceki kimliğin sahipliği `claimGraceSeconds`
 * > boyunca taze kaldığı için oyuncu kendi hesabına ~90 saniye giremezdi — üstelik hatanın
 * > sebebi ekranda «hesabın başka bir cihazda açık» diye görünürdü."*
 *
 * ⚠️⚠️ **BU UYARI WEB İÇİN YAZILMAMIŞTI VE WEB'İ TAM OLARAK BÖYLE VURDU** (2026-08-16).
 * Kimlik `sessionStorage`taydı; `sessionStorage` sekme kapanınca **silinir**. Yani:
 *
 *   • **PWA**'yı kapatıp açmak = yeni kimlik. PWA'nın sekmesi yok, her açılış yeni bir kopya
 *     sayılıyordu.
 *   • Sekmeyi kapatıp yenisini açmak = yeni kimlik.
 *
 * Yeni kimlik, biraz önce ölen kendi kopyasıyla yarışmak zorunda kalıyordu. Ölen kopyanın
 * sahipliği hemen düşmüyor: soketin öldüğünü sunucu ancak Engine.IO ping zaman aşımıyla
 * (~45 sn) anlıyor, ardından `release` 20 saniyelik bir pay daha bırakıyor. Toplamda
 * **bir dakikaya varan** bir pencerede oyuncu kendi hesabına giremiyor ve ekranda
 * «Hesabın başka bir yerde açık» yazıyordu. Canlıda 12 farklı oyuncuda, bir günde 773 kez.
 *
 * ─ ⭐ ÇÖZÜM: «tek canlı kopya» sorusunu TARAYICIYA sordurmak ─────────────────────────────
 *
 * Kimliği kalıcı depoya taşımak tek başına YANLIŞ olurdu: o zaman aynı tarayıcının iki sekmesi
 * aynı kimliği taşır ve "aynı cihazda ikinci sekme" kuralı tamamen düşerdi. Gereken ayrım
 * şu: *"benden başka canlı bir kopya var mı?"*
 *
 * ⚠️ **Bu soruyu kalp atışıyla (heartbeat) sormak yanlış cevap verir.** Arka plandaki sekmeyi
 * tarayıcı donduruyor (Chrome gizli sekmede zamanlayıcıları kısıyor, birkaç dakika sonra
 * tamamen donduruyor). Donmuş sekme atış yollayamaz, yeni sekme onu "ölmüş" sanıp kimliğini
 * devralır ve **iki sekme aynı kimlikle** oynar: kuralın kendisi sessizce delinir.
 *
 * ⭐ Doğru ilkel **Web Locks**: `navigator.locks` kilidi sekme kapanınca ya da çökünce
 * tarayıcı tarafından bırakılır, sekme yalnızca ARKA PLANA düştüğünde bırakılmaz. Aradığımız
 * ayrımın birebir kendisi ve tahmin içermiyor.
 *
 *   • kilidi alabildik  → başka canlı kopya YOK → kalıcı kimliği geri kuşan (PWA yeniden açıldı)
 *   • kilit alınamadı   → canlı bir kopya VAR  → yeni kimlik üret (gerçekten ikinci sekme)
 *
 * ⚠️ Sayfa yenilemesi (F5) bu yolun hiç uğramadığı durum: `sessionStorage` yenilemede yaşar,
 * kimlik oradan gelir ve kilit hiç sorgulanmaz. Sunucudaki `claim` kuralı 2 ("sahip zaten
 * biziz") anında geçirir.
 *
 * ⚠️ `deviceId` ile karıştırılmamalı: o kalıcı ve çoklu hesap analizi için. Bu kimlik
 * doğrulamada ASLA kullanılmaz — istemci üretir, taklit edilebilir.
 */

/** Sekme başına kimlik (F5 korur, sekme kapanınca silinir). */
export const TAB_KEY = 'mw-instance-id';
/** Bu tarayıcı profilinin EN SON kullandığı kimlik — yeniden açılışta geri kuşanılır. */
export const LAST_KEY = 'mw-instance-last';
/** Web Locks adı. Tek kilit yeter: soru "başka canlı kopya var mı", kimin olduğu değil. */
export const LOCK_NAME = 'mw-single-copy';

/**
 * ⭐ KARAR — saf fonksiyon, depodan ve tarayıcıdan bağımsız.
 *
 * Üç girdinin üç sonucu var ve üçü de sınanıyor; bu mantık bir kancanın içine gömülseydi
 * yanlış cevabın bedeli sessiz olurdu (`world-coords.ts`, `city-screens.ts` ile aynı gerekçe).
 */
export function decideInstanceId(o: {
  /** `sessionStorage`taki kimlik — varsa bu sekme zaten yaşıyor demektir (F5). */
  tabId: string | null;
  /** Bu profilin en son kullandığı kimlik. */
  lastId: string | null;
  /** Web Locks: başka canlı kopya YOK mu? */
  soleCopy: boolean;
  /** Yeni kimlik gerekirse kullanılacak değer. */
  newId: string;
}): string {
  // 1. Sayfa yenilemesi: kimliği DEĞİŞTİRME. Yenileme oyuncuyu hesabından atmamalı.
  if (o.tabId) return o.tabId;
  // 2. Tek canlı kopya biziz: en son kimliği geri kuşan → sunucu "sahip zaten biziz" der.
  if (o.soleCopy && o.lastId) return o.lastId;
  // 3. Başka kopya çalışıyor (ya da hiç geçmiş yok): gerçekten yeni bir kopyayız.
  return o.newId;
}

/**
 * Kilidi **ömür boyu** tutar ve "alabildik mi" sorusunu yanıtlar.
 *
 * ⚠️ Kilit BIRAKILMIYOR — `navigator.locks.request`in geri çağrısı hiç bitmeyen bir söz
 * döndürüyor. Bilerek: kilidin anlamı "bu kopya yaşıyor" ve o, sekme kapanana kadar doğru.
 * Tarayıcı sekme kapanınca/çökünce kilidi kendisi bırakır — bizim temizlememiz gerekmiyor
 * ve `beforeunload` gibi güvenilmez kancalara bel bağlamıyoruz.
 *
 * ⚠️ `ifAvailable: true`: kilit doluysa **beklemeden** `null` ile dönüyor. Beklemek, ikinci
 * sekmenin açılışta donması demek olurdu.
 *
 * ⚠️ Web Locks yoksa (çok eski tarayıcı) `false` dönüyoruz: davranış eski hâline, yani her
 * açılışta yeni kimliğe düşer. Tahmin yürütmektense bilinen davranışa düşmek doğrusu —
 * yanlış `true` iki sekmeye aynı kimliği verir ve kuralı deler.
 */
export async function acquireSoleCopyLock(
  locks: LockManager | undefined = globalThis.navigator?.locks,
): Promise<boolean> {
  if (!locks?.request) return false;
  return new Promise<boolean>((resolve) => {
    void locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, (lock) => {
      resolve(lock != null);
      // Kilidi aldıysak sonsuza dek tut; alamadıysak hemen bırak (zaten elimizde değil).
      return lock == null ? Promise.resolve() : new Promise<never>(() => { /* hiç bitmez */ });
    }).catch(() => resolve(false));
  });
}

/**
 * Kimliği çözer ve iki depoya da yazar. Uygulama açılışında **bir kez** çağrılır
 * (`main.tsx`), ilk istek çıkmadan önce.
 */
export async function resolveInstanceId(): Promise<string> {
  const tabId = safeGet(sessionStorage, TAB_KEY);
  const lastId = safeGet(localStorage, LAST_KEY);
  const soleCopy = tabId ? false : await acquireSoleCopyLock();

  const id = decideInstanceId({ tabId, lastId, soleCopy, newId: crypto.randomUUID() });

  safeSet(sessionStorage, TAB_KEY, id);
  /**
   * ⚠️ `LAST_KEY` **her zaman** güncelleniyor, yalnız yeni kimlik üretince değil. İkinci
   * sekme açan oyuncu birincisini kapatırsa, geri kuşanılacak kimlik en son yaşayan
   * olmalı — yoksa çoktan ölmüş bir kimliği kuşanır ve hiçbir şey kazanmayız.
   */
  safeSet(localStorage, LAST_KEY, id);
  return id;
}

/**
 * Senkron yedek — `resolveInstanceId` henüz koşmadan bir istek çıkarsa.
 *
 * ⚠️ Kilit sormuyor (senkron olmak zorunda) ama `sessionStorage`ı kullanıyor, yani en azından
 * aynı sekme içinde kararlı. Normal akışta hiç çağrılmaz; açılış sırası bozulursa kimliğin
 * her istekte değişmesini önleyen emniyet kemeri.
 */
export function fallbackInstanceId(): string {
  const existing = safeGet(sessionStorage, TAB_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  safeSet(sessionStorage, TAB_KEY, id);
  safeSet(localStorage, LAST_KEY, id);
  return id;
}

/* ⚠️ Depo erişimi sarmalanıyor: gizli sekmede ve üçüncü taraf çerezleri kapalıyken
 * `localStorage` okuması İSTİSNA ATIYOR. Kimlik yüzünden uygulamanın hiç açılmaması,
 * çözmeye çalıştığımız hatadan çok daha kötü olurdu. */
function safeGet(store: Storage, key: string): string | null {
  try { return store.getItem(key); } catch { return null; }
}
function safeSet(store: Storage, key: string, value: string): void {
  try { store.setItem(key, value); } catch { /* depo yok: kimlik yalnız bellekte kalır */ }
}
