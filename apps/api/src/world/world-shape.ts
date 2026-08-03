/**
 * ⭐ DÜNYA BOYUTLARI — **tek kaynak**.
 *
 * Oyunun kendi dokümanından (`teknik_ve_yapi_dokumantasyonu.md`): *"Bir dünyada 10 kıta, bir
 * kıtada 500 diyar ve bir diyarda da 10 şehir bulunmaktadır."* → dünya başına 50.000 şehir
 * yeri. Koordinatlar **1-indeksli** (1:45:10 = 1. kıta, 45. diyar, 10. şehir).
 *
 * ⚠️ Bu sabit 2026-08-03'e kadar **İKİ dosyada kopyaydı** (`auth/auth.service.ts` ve
 * `world/world.controller.ts`) — biri değişirse diğeri sessizce eski kalırdı ve iki taraf
 * farklı bir dünya haritası varsayardı. Yerleşim algoritması (§13.6) her ikisini de
 * kullandığı için tekilleştirildi.
 *
 * ⚠️ Ayara BAĞLANMADI, bilerek. Dünya boyutu bir denge düğmesi değil bir **şema kararı**:
 * dolu bir dünyada kıta sayısını değiştirmek var olan koordinatları anlamsız kılar (1:501:3
 * gibi satırlar ortada kalır) ve `cities_world_coords` benzersizliği bunu yakalamaz. Yeni
 * boyut isteniyorsa yeni dünya açılır.
 */
export const WORLD_SHAPE = {
  continents: 10,
  districtsPerContinent: 500,
  citiesPerDistrict: 10,
  oneIndexed: true,
} as const;

/** Global diyar sırası: `g = (kıta−1)×diyarSayısı + diyar` → 1..5000 (§13.6.1). */
export const districtIndex = (k: number, d: number): number =>
  (k - 1) * WORLD_SHAPE.districtsPerContinent + d;

/** `districtIndex`in tersi. */
export function districtAt(g: number): { k: number; d: number } {
  const per = WORLD_SHAPE.districtsPerContinent;
  return { k: Math.floor((g - 1) / per) + 1, d: ((g - 1) % per) + 1 };
}

/** Dünyadaki toplam diyar sayısı (10 × 500 = 5.000). */
export const TOTAL_DISTRICTS = WORLD_SHAPE.continents * WORLD_SHAPE.districtsPerContinent;
