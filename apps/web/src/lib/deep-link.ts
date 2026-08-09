/**
 * ⭐ DERİN BAĞLANTI MANDALI — bir adres parametresini **tam olarak bir kez** tüketmek.
 *
 * Bildirim kataloğu iki adreste sorgu parametresi taşıyor: `/messages?dm=<id>` (DM bildirimi)
 * ve `/command/alliance?chat=1` (bahsedilme). İkisinde de ekran, parametreyi görünce bir iş
 * yapıp parametreyi adresten siliyor — "silinmesi" o işin bir daha yapılmamasının tek güvencesiydi.
 *
 * ⚠️⚠️ **O GÜVENCE YANLIŞTI ve canlıda oyuncuyu vurdu** (kullanıcı, 2026-08-09): DM bildirimine
 * tıklayınca `chat/conversations` ucuna onlarca POST gidiyor, ardından React
 * *"Maximum update depth exceeded"* atıp ekranı bozuyordu. Sebep zincirin tamamı:
 *
 *  1. `react-router` v7'de `BrowserRouter` konum güncellemesini **`startTransition` içinde**
 *     yapıyor (`useTransitions` verilmedikçe varsayılan bu). Yani `setSearchParams(...)` ile
 *     silinen `?dm=` **düşük öncelikli** bir güncelleme; hemen commit edilmiyor.
 *  2. `useMutation` her çağrıda **yeni bir sonuç nesnesi** döndürüyor (`{...result, mutate}`)
 *     ve `result` bir `useSyncExternalStore` değeri → mutasyonun her durum geçişi **senkron**
 *     bir yeniden çizim tetikliyor.
 *  3. `openChat` bu nesneye bağlıydı (`useCallback(..., [open])`) → kimliği her geçişte değişti
 *     → onu bağımlılık listesinde tutan efekt yeniden koştu → yeni bir POST → yeni bir geçiş…
 *
 * Yani efekt **kendi eylemiyle kendi bağımlılığını değiştiriyordu** ve yüksek öncelikli bu
 * kısır döngü, adresi temizleyecek düşük öncelikli geçişi sürekli önlüyordu (starvation).
 *
 * ⭐ Bu yüzden mandal **adres temizliğine değil, bir `ref`e** dayanıyor: hangi değerin işlendiği
 * render'lardan bağımsız olarak hatırlanır, dolayısıyla efekt kaç kez koşarsa koşsun iş bir kez
 * yapılır. Adres temizliği yine yapılıyor ama artık yalnız **görüntü/geri tuşu** için: sayfa
 * yenilenince ya da geri gelinince bildirim kendini tekrar açmasın.
 *
 * ⚠️ Karar burada **saf bir fonksiyonda** yaşıyor çünkü projede tarayıcı testi altyapısı yok
 * (`jsdom`/`testing-library` bağımlılığı yok, testler düğüm ortamında koşuyor). `tipReduce`
 * (`Tooltip.tsx`) ve `placePopover` (`Popover.tsx`) ile aynı gerekçe: bileşenin içinde kalsaydı
 * ancak elle tıklayarak denenebilirdi.
 */

/** `deepLinkAction`ın döndürdüğü karar. `handled` mandalın YENİ değeri — çağıran ref'e yazar. */
export interface DeepLinkStep {
  /** Bu koşuda iş yapılmalı mı? */
  act: boolean;
  /** Mandalın bu koşudan sonraki değeri. */
  handled: string | null;
}

/**
 * @param value  Adresteki parametre (`?dm=57` → `'57'`). Yoksa `null`.
 * @param ready  İş için gereken veri geldi mi (DM'de sohbet listesi). `false` ise beklenir —
 *               mandal **kapatılmaz**, yoksa veri gelmeden parametre yanar.
 * @param handled Mandalın şu anki değeri (`ref.current`).
 */
export function deepLinkAction(
  value: string | null, ready: boolean, handled: string | null,
): DeepLinkStep {
  /**
   * ⭐ Parametre gidince mandal SIFIRLANIR. Aynı oyuncudan ikinci bir DM bildirimi geldiğinde
   * adres yeniden `?dm=57` olur; mandal `'57'`de takılı kalsaydı ikinci bildirim ölü tıklama
   * olurdu. Adres bir kez temizlendikten sonra eski değer kendiliğinden geri gelemez, bu yüzden
   * sıfırlamak döngüyü geri açmıyor.
   */
  if (value == null || value === '') return { act: false, handled: null };
  if (!ready) return { act: false, handled };
  if (handled === value) return { act: false, handled };
  return { act: true, handled: value };
}
