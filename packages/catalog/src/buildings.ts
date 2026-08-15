import type { BuildingDef } from './types.ts';

/**
 * Yapılar ve taban maliyetleri (SİSTEM PLANI §13.9).
 * Orijinal sunucu ölü olduğu için yapı/teknik TABAN maliyetleri elimizde YOK — `k.java` yalnız
 * formülleri taşıyor, tabanlar `init.do` ile sunucudan geliyordu (`e.java:380-393`, `int[45]`).
 * Yani bu sayılar **bizim tasarım alanımız**; formüller ve büyüme oranları Java'nın.
 *
 * ⭐ **`baseGold`/`baseFood` = oyuncunun ÖDEDİĞİ İLK yükseltmenin fiyatı** (kullanıcı, 2026-07-28).
 * `STARTING_BUILDINGS`'te olan yapılar (Kale · Çiftlik · Maden) oyuna **seviye 1**
 * başladığı için onlarda bu, **1→2** yükseltmesinin fiyatıdır; diğerlerinde (Baraka dâhil,
 * 2026-08-09'dan beri) seviye 1'in.
 * Ölçekleme `buildingCost()` içinde tek yerde yapılıyor.
 *
 * ⭐⭐ Seviye tavanı **40 — Teleport hariç, o 20'de kaldı** (kullanıcı, 2026-08-12 · eski
 * oyuncu bildirimi). Öncesinde yalnız Çiftlik/Maden 40, diğerleri 20 idi; oyunu oynamış bir
 * oyuncu barakasının 20'den yüksek olduğunu net hatırlıyor. Tekniklerde tavan yok.
 * Teleport'un istisna olma gerekçesi kendi satırında (sayı taşması).
 *
 * ⚠️ Kale bütçesi (§13.11.1): Σ(bina seviyeleri) ≤ Kale × 10 — Kale kendisi ve Sur/Büyü Kalkanı
 * hariç. Tavan yükselince bu kural **kendiliğinden ölçekleniyor** ve hâlâ bağlayıcı değil:
 * bütçeyi tüketen sekiz yapı tavanda 7×40 + Teleport 20 = **300**, Kale 40'ın bütçesi ise
 * **400**. Yani her şeyi tavana çıkarmak mümkün; kural yalnız SIRAYI zorluyor (Kale'yi önden
 * yükseltmek gerekiyor).
 *
 * ⚠️⚠️ **Baraka 27'den sonra Cüce, 30'dan sonra Elf hızlanmıyor** — `trainingTimeSeconds`
 * `1,2^seviye` ile bölüyor ama üretim süresi hem kuyrukta (`queue.service.ts` `scaled`) hem
 * ekranda (`city.controller.ts` `dur`) **1 saniyede tabanlı**. Tavan 20 iken bu tabana hiç
 * ulaşılamıyordu (Cüce sv20 = 3,55 sn); 40'a çıkınca ilk kez ulaşılıyor. Yüksek seviyeler yine
 * de ölü değil: Baraka aynı anda verilebilecek **emir sayısını** ve sefer limitini de belirliyor.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ 2026-08-10 — TABANLAR ~5-6 KAT YÜKSELTİLDİ. Ölçüm ve iki bağımsız çapa.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * Kullanıcı: *"maliyetler ve süreler yeterince iyi değil, kolay kaçıyor."* Ölçtüm — tek şehirli,
 * yağmasız, hiç durmayan bir oyuncu eski sayılarla **ilk SAATTE Çiftlik/Maden 13**'e, **üç ayda
 * HER ŞEYE 20 + Çiftlik/Maden 40**'a ulaşıyordu. Yeni sayılarla iki yıl sonra bile hiçbir yapı
 * 20 değil.
 *
 * ⭐ **ÇAPA 1 — iki hatıra birbirini doğruluyor.** Kullanıcı iki taban hatırlıyordu: Mimar Okulu
 * sv1 = **1000/1000** ve Teleport sv1 = **500.000/500.000**. Teleport'un ön koşulu Mimar Okulu 12
 * ve `1,8` oranıyla Mimar Okulu 12 = **1.285.368**, Teleport 1 = **1.000.000** → *"Mimar Okulu'nu
 * 12'ye çıkarabilen oyuncu Teleport 1'i tam o sırada karşılayabilir."* Eski 180/120 tabanıyla
 * Mimar Okulu 12 yalnız 192.805 ederdi ve Teleport onun 5,2 katı olurdu. İki bağımsız hatıranın
 * tek ölçekte buluşması, eski tabanların ~6 kat düşük olduğunun kanıtı.
 *
 * ⭐ **ÇAPA 2 — Çiftlik/Maden 20 ≈ Kale 10.** İki orta-oyun kilometre taşı aynı fiyata gelmeli ki
 * *"ekonomiyi büyütmek"* ile *"kaleyi ilerletmek"* gerçek bir tercih olsun. Eskiden Çiftlik 20 =
 * 11.869, Kale 10 = 38.570 (oran **0,31** — ekonomi tercih değil, otomatikti). Şimdi 168.595 ↔
 * 176.320 (oran **0,96**). Kale'nin tabanını bu çapa belirledi.
 *
 * ⚠️ **KALE, BÜYÜK BİNALARIN EN UCUZU — bilerek.** Fiyat = stratejik değer / zorunluluk. Kale
 * oyunun en zorunlu kapısı (her yapının her seviyesi ona bağlı) ve tek başına hiçbir şey
 * üretmiyor, yalnız tavan açıyor. Zorunlu bir kapı süreklidir → vergi gibi ucuz olmalı; opsiyonel
 * güç sıçraması (Tapınak, Teleport) tercihtir → pahalı. Aynı sebeple savaşta 3. sırada olan
 * Akademi, 8. sıradaki Tapınak'tan ucuz.
 */
export const BUILDINGS: readonly BuildingDef[] = [
  b('castle', 'Kale', 900, 700, 40, false, false),
  b('barracks', 'Baraka', 500, 350, 40, false, true),
  /**
   * ⭐ EKONOMİ YAPILARI — kullanıcı kararı (2026-07-27): ürettiği kaynaktan AĞIR yer.
   * Maden altın üretir → altın ağırlıklı (12/9); Çiftlik yemek üretir → yemek ağırlıklı (9/12).
   * Bu sayılar **1→2 yükseltmesinin** fiyatı (ikisi de seviye 1 başlıyor).
   *
   * ⚠️ **2026-08-10: 3/4 ve 4/3 idi, ×3 yapıldı** (3:4 asimetrisi korunarak). Kullanıcı:
   * *"seviye 20'de bile hâlâ ucuz maliyet ve süreye tekabül ediyor … eskiden madeni bu seviyeye
   * çıkarmak bu kadar kolay değildi."* Ölçüm doğruladı: temponun asıl belirleyicisi bina fiyatı
   * DEĞİL, bu iki yapının ucuzluğuydu — bina tabanlarını 6 katına çıkarıp bunlara dokunmayınca
   * oyuncu yine bir yılda her şeyi bitiriyordu. Gerekçe ÇAPA 2 (yukarıda).
   *
   * ⚠️ **Bedeli açıkça:** taban ×3, kâr eşiğini ~5 seviye aşağı çekiyor (≈sv29 → ≈sv24), çünkü
   * maliyet `1,45`, üretim `1,16` büyüyor ve taban çarpanı eşiği `log3 / log(1,45/1,16) ≈ 4,9`
   * seviye kaydırıyor. Kabul edilen bir bedel: geç oyunda kaynağın yağmadan gelmesi zaten
   * belgelenmiş tasarım niyeti (§13.9), ve kâr etmeyen seviyeler **puan** satın alıyor
   * (puan = harcanan/1000) — yani ölü içerik değil, geç oyunun asıl kaynak gideri.
   */
  b('farm', 'Çiftlik', 9, 12, 40, true, true),
  b('mine', 'Maden', 12, 9, 40, true, true),
  /**
   * ⭐⭐ **AKADEMİ KALE İLE EŞİTLENDİ: 1400/1000 → 900/700** (2026-08-14).
   *
   * Yukarıdaki *"kapı ucuz, lüks pahalı"* ilkesi Kale'yi büyük binaların en ucuzu yapıyor:
   * tek başına hiçbir şey üretmez, yalnız tavan açar, ama o tavan olmadan hiçbir yatırım
   * büyümez. **Akademi tam olarak aynı tanıma giriyor** — her teknik, dolayısıyla her savaşçı
   * ve her savunma birimi oradan geçiyor — ama Kale'den PAHALI fiyatlanmıştı. Eşitlemek ilkeyi
   * uyguluyor, değiştirmiyor.
   *
   * ⚠️ Ölçülen etki: Akademi 1→3 zinciri **14.496 → 9.664** kaynak. Erken oyunun asıl bütçe
   * yakıcısı buydu — Çiftlik/Maden değil (Çiftlik 8 + Maden 8 topu topu 3.690 = 3 puan).
   * Yük Arabası kapısı (Kale 2 → Akademi 3 → Baraka 3 → Haritacılık 1) 22 puandan ~17'ye iner.
   *
   * ⚠️ Hiçbir çapayı bozmuyor: ÇAPA 1 Mimar Okulu ↔ Teleport, ÇAPA 2 Çiftlik/Maden ↔ Kale.
   * Akademi ikisinde de yok, o yüzden serbestçe oynatılabilen tek büyük bina.
   */
  b('academy', 'Akademi', 500, 400, 40, false, true),
  // ⭐ ÇAPA 1 (yukarıda) — kullanıcı hatırası, tüm ölçeği bu sayı belirliyor.
  b('architect_school', 'Mimar Okulu', 1000, 1000, 40, false, true),
  b('cave', 'Mağara', 900, 600, 40, false, true),
  b('temple', 'Tapınak', 2000, 1500, 40, false, true),
  /**
   * Teleport sv1 = 500.000/500.000 (kullanıcı hatırası, §13.11.4) → taban doğrudan bu.
   *
   * ⚠️⚠️ **TAVAN 20'DE KALDI — tek istisna** (kullanıcı, 2026-08-12). Diğer yapılar 40'a
   * çıkarken Teleport dışarıda bırakıldı ve bunun ölçülmüş bir gerekçesi var: tabanı diğer
   * yapıların ~250 katı, `1,8^(sv−1)` eğrisiyle birleşince sv40 maliyeti **9,03×10¹⁵** oluyor
   * ve `Number.MAX_SAFE_INTEGER`'ı (9,007×10¹⁵) **aşıyor** — yani fiyat artık tam sayı olarak
   * temsil edilemiyordu. 20'de kalınca en pahalı tavan maliyeti 3,16×10¹⁰'a iniyor, sınırın
   * beş kat altında.
   */
  b('teleport', 'Teleport', 500_000, 500_000, 20, false, true),
] as const;

function b(
  id: BuildingDef['id'], tr: string, baseGold: number, baseFood: number,
  maxLevel: number, economyCostCurve: boolean, consumesCastleBudget: boolean,
): BuildingDef {
  return { id, name: { tr }, baseGold, baseFood, maxLevel, economyCostCurve, consumesCastleBudget };
}

export const BUILDINGS_BY_ID: Readonly<Record<string, BuildingDef>> = Object.fromEntries(
  BUILDINGS.map((x) => [x.id, x]),
);

/**
 * Yeni şehrin başlangıç yapı seviyeleri (§13.11.1) — **başkent ve koloni için AYNI**.
 *
 * ⚠️⚠️ **BARAKA GERİ GELDİ: 1** (kullanıcı, 2026-08-12). 2026-08-09'da listeden çıkarılmıştı
 * (*"diğer tüm yapıların seviyesi 0 … Baraka da 0 başlar"*); karar geri alındı ve baraka yine
 * seviye 1 doğuyor. Canlıdaki 29 şehrin barakası aynı turda 0'dan 1'e çekildi.
 *
 * ⚠️ **Fiyat kendiliğinden kayar, ayrıca elle düzeltilmez.** `baseGold`/`baseFood` "oyuncunun
 * ödediği İLK yükseltmenin fiyatı" demek (`buildingCost` → `firstPaid`). Baraka listeye
 * girdiği için ilk ödenen seviye 2 oldu ve taban oraya oturdu:
 *   • sv1 → oyuncunun hiç ödemediği seviye (Kale/Çiftlik/Maden gibi),
 *   • sv2 → **700/500** (baraka 0'dan başlarken 1.260/900 idi).
 * Yani baraka yalnız bedavaya gelmiyor, ikinci seviyesi de ucuzluyor. Bu bilinçli: taban
 * sayısının anlamı "ilk ödenen seviye" ve o seviye değişti.
 *
 * ⚠️ **Sefer limiti**: `assertMarchLimit` hâlâ `Math.max(1, barakaSeviyesi)` kullanıyor.
 * Artık gereksiz görünüyor ama DURUYOR: barakası yıkılan/eksik bir şehrin oyuncuyu
 * kilitlememesi bu tek satıra bağlı ve varsayımı koda gömmek yerine korumak ucuz.
 */
export const STARTING_BUILDINGS: Readonly<Record<string, number>> = {
  castle: 1,
  barracks: 1,
  farm: 1,
  mine: 1,
};

/**
 * Başlangıç kaynağı (§13.11.1a, kullanıcı kararı 2026-07-26).
 * YALNIZ başkent alır; kurulan koloni sıfırla doğar (kur-al-terk et sömürüsünü kapatır).
 *
 * ⚠️⚠️ **2026-08-14: 1000/1000 → 5000/5000** (oyuncu bildirimi: *"para erken bitiyor ve oyunda
 * yapacak bir şey kalmıyor"*). 2026-08-10'da 4000→1000 indirilmişti; gerekçe *"ilk günde kârlı
 * getiri sayılabilecek kadar çiftlik maden kolayca yükseltilememeli"* idi.
 *
 * ⭐ **O gerekçe artık kesede DEĞİL, iki başka yerde karşılanıyor — kese ÜÇÜNCÜ ve gereksiz
 * frendi.** Kalan iki fren:
 *   1. Çiftlik/Maden tabanının ×3 olması (aynı kese eskiden 13 seviye satın alıyordu),
 *   2. ⭐ asıl olan: **Kale bütçesi parayı değil SEVİYEYİ sınırlıyor.** Kale 1'in bütçesi
 *      10 seviye ve başlangıçta Baraka 1 + Çiftlik 1 + Maden 1 = **3** dolu → oyuncu Kale 2'ye
 *      kadar 7 seviyeden fazlasını **cebinde ne olursa olsun** satın alamaz.
 * Yani kesenin tek gerçek etkisi ilk askere kadarki ölü beklemeydi ve o bekleme ölçüldü:
 * **≈2 gün.** İlk Cüce'nin yolu (Kale 2 → Akademi 1 → Demircilik 1 → 1 Cüce) ≈ 5.200 altın +
 * 4.800 yemek; yeni kese bunun çoğunu karşılıyor, gerisini üretim tamamlıyor.
 *
 * ⚠️ **ALT SINIRI BİR YAPI KURALI KOYUYOR, TERCİH DEĞİL — 1000'in altına inilmemeli.** Kese
 * Kale 2'yi (1.600) karşılamıyorsa oyunun **hiçbir şey sunmadığı** bir ölü bekleme doğuyor:
 *
 *     kese  500/500 → 10,9 saat ölü bekleme
 *     kese  750/750 →  6,5 saat
 *     kese 1000/1000 →  2,0 saat
 *     kese 5000/5000 →  0 saat   ← seçilen
 *
 * ⚠️ **Eski notta «Çiftlik 5 + Maden 5 = tam 10» yazıyordu; BAYATTI.** Baraka 2026-08-12'de
 * seviye 1'e döndü ve bütçe tüketiyor → Kale 1'de Çiftlik+Maden birlikte en fazla **9** seviye
 * (ör. Çiftlik 5 + Maden 4). `catalog-settings.test.ts` bu bağı bekçi olarak tutuyor.
 */
export const STARTING_RESOURCES = { gold: 5000, food: 5000 } as const;
export const COLONY_STARTING_RESOURCES = { gold: 0, food: 0 } as const;
