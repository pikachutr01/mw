/**
 * ⭐⭐ DÜNYA SAYFASININ KOORDİNAT ÖNCELİĞİ — ve «Kendi diyarıma dön» düğmesinin kararı.
 *
 * ⚠️⚠️ **CANLI HATA (kullanıcı, 2026-08-16).** Düğme yalnız `setSel(null)` yapıyordu ve derin
 * bağlantıyla açılmış sayfada YANLIŞ yere gidiyordu: öncelik zinciri `sel → adres → ev` diye
 * ilerliyor, yani seçim boşalınca sıra **eve değil adrese** düşüyordu. Casusluk raporundan
 * Dünya'ya geçen oyuncu düğmeye basınca kendi diyarına değil raporun diyarına dönüyordu.
 *
 * Doğru davranış iki parçalı ve ikisi de gerekli: seçimi bırak **ve** adresi temizle.
 *
 * ⚠️ Karar burada **saf bir fonksiyonda** yaşıyor çünkü projede tarayıcı testi altyapısı yok
 * (`jsdom`/`testing-library` bağımlılığı yok). `deepLinkAction` (`deep-link.ts`), `tipReduce`
 * (`Tooltip.tsx`) ve `placePopover` (`Popover.tsx`) ile aynı gerekçe: bileşenin içinde
 * kalsaydı ancak elle tıklayarak denenebilirdi — nitekim bu hata tam da öyle kaçmıştı.
 */

export interface Coords {
  k: number;
  d: number;
}

/**
 * Ekranda gösterilecek diyar.
 *
 * Öncelik: **elle seçim → adres → aktif şehir → 1:1**.
 *
 * ⚠️ Adres, evin ÖNÜNDE olmak zorunda: derin bağlantıyla («Dünyada Bul», casusluk raporu,
 * paylaşılan adres) gelen oyuncu ilk açılışta hedefi görmeli, kendi diyarını değil.
 * Hatanın kaynağı bu sıra DEĞİLDİ — sıra doğru; eksik olan, düğmenin adresi de bırakmasıydı.
 */
export function visibleCoords(
  sel: Coords | null, fromUrl: Coords | null, home: Coords | null,
): Coords {
  return {
    k: sel?.k ?? fromUrl?.k ?? home?.k ?? 1,
    d: sel?.d ?? fromUrl?.d ?? home?.d ?? 1,
  };
}

/** «Kendi diyarıma dön» düğmesine basılınca ne olmalı. */
export interface HomeAction {
  /**
   * Yeni seçim — daima `null`.
   *
   * ⚠️ Eve ait koordinatı `sel`e YAZMIYORUZ, bilerek: `sel = null` "sabitlemeyi bırak, aktif
   * şehri izle" demek. Oyuncu sonradan şehir değiştirirse görünüm onu takip etmeli; eve ait
   * koordinatı sabitleseydik takip ölürdü ve adres çubuğu da eski koordinatta kalırdı.
   */
  sel: null;
  /** Adresteki `/world/:k/:d` temizlenmeli mi (`/world`e gidilsin mi)? */
  clearUrl: boolean;
}

export function homeAction(fromUrl: Coords | null): HomeAction {
  return { sel: null, clearUrl: fromUrl != null };
}
