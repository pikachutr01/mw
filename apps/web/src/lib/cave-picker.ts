/**
 * ⭐ MAĞARA MODALINDA SEÇİLEBİLİR KAHRAMANLAR (§13.20.6).
 *
 * Kural Java'nın kendi kuralı (`docs/JAVA_ROENTGEN.md` §6.2, `i.java:844-852`): mağara ekranı
 * kahramanları **durum koduyla** eler — doldururken yalnız «Şehirde», boşaltırken yalnız
 * «Mağarada» olanlar seçilebilir.
 *
 * ⚠️ **NEDEN AYRI DOSYA.** 2026-08-11'de canlı bir çökme oldu: «Mağara Boşalt» sekmesine
 * basınca `heroPool.length` üzerinde `Cannot read properties of undefined`. Sebep, listenin
 * sunucudan gelen `cave.heroes` alanına **doğrudan** bağlanmasıydı; alan o an yanıtta yoktu
 * (API henüz eski sürümü koşuyordu). Ders: **istemci, kendi üretmediği bir dizinin var
 * olduğunu varsayamaz.** Yuvarlanan bir dağıtımda ya da TanStack Query'nin önbelleğinde
 * duran eski bir `city` yanıtında aynı boşluk yeniden oluşur. Kural artık burada, saf ve
 * sınanabilir; ekran yalnız çağırıyor.
 */

/** Modalda bir satır olarak çizilebilen kahraman. */
export interface PickableHero {
  id: number;
  name: string;
  level: number;
}

/** Tapınak listesinden gelen kahraman — durumu da taşır. */
export interface HeroWithState extends PickableHero {
  state: string;
}

/**
 * Sekmeye göre seçilebilir kahramanlar.
 *
 * @param tab        `store` = mağaraya sok · `withdraw` = mağaradan çıkar
 * @param cityHeroes tapınak sorgusundan gelen liste (doldurma kaynağı)
 * @param caveHeroes mağara durumundan gelen liste (boşaltma kaynağı)
 *
 * ⭐ `store` süzgeci **`in_city`** — yani `on_mission`, `dead`, `returning`, `reviving`,
 * `in_cave` ve `entering_cave` hepsi düşer. Sonuncusu önemli: mağara emrinde zaten söz
 * verilmiş kahraman ikinci kez seçilemesin (rezervasyon kuralı, §13.20.2c). Ayrı bir süzgeç
 * yazmaya gerek yok — durum adı kuralı taşıyor.
 */
export function caveHeroPool(
  tab: 'store' | 'withdraw',
  cityHeroes: readonly HeroWithState[] | undefined | null,
  caveHeroes: readonly PickableHero[] | undefined | null,
): PickableHero[] {
  if (tab === 'withdraw') return [...(caveHeroes ?? [])];
  return (cityHeroes ?? [])
    .filter((h) => h.state === 'in_city')
    .map((h) => ({ id: h.id, name: h.name, level: h.level }));
}

/**
 * Seçimi havuzla uzlaştırır: havuzda olmayan kimlik düşer.
 *
 * ⚠️ Sekme değişince seçim temizleniyor ama bu yetmez — arka planda tazelenen sorgu
 * kahramanı listeden düşürebilir (sefere çıktı, öldü, mağaraya girdi). O anda gönderilirse
 * sunucu `hero_unavailable` derdi; süzgeç bunu daha ekranda önlüyor.
 */
export function keepPickedHeroes(
  picked: readonly number[], pool: readonly PickableHero[],
): number[] {
  return picked.filter((id) => pool.some((h) => h.id === id));
}
