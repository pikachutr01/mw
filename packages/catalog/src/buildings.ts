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
  b('barracks', 'Baraka', 700, 500, 40, false, true),
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
  b('academy', 'Akademi', 1400, 1000, 40, false, true),
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
 * ⚠️ **Baraka 2026-08-09'da listeden ÇIKARILDI** (kullanıcı): *"çiftlik ve maden seviyesi 1,
 * kale seviyesi 1, diğer tüm yapıların seviyesi 0 … Baraka da 0 başlar."* Öncesinde `barracks: 1`
 * yazıyordu, yani hem yeni kayıtta hem yeni kurulan şehirde baraka bedava geliyordu.
 *
 * ⚠️ İki yan etkisi var ve ikisi de kuralın doğal sonucu, ayrıca ele alınmadı:
 *   • **Fiyat**: `baseGold/baseFood` "oyuncunun ödediği İLK yükseltmenin fiyatı" demek
 *     (`buildingCost`). Baraka artık 0'dan başladığı için taban **seviye 1'e** oturdu: sv1 =
 *     120/80 (yeni, eskiden bedavaydı), sv2 = 216/144 (eskiden 120/80). Sayılara dokunulmadı.
 *   • **Sefer limiti**: `assertMarchLimit` `Math.max(1, barakaSeviyesi)` kullanıyor, yani
 *     barakasız şehir bile 1 sefer çıkarabiliyor — yeni oyuncu kilitlenmiyor.
 */
export const STARTING_BUILDINGS: Readonly<Record<string, number>> = {
  castle: 1,
  farm: 1,
  mine: 1,
};

/**
 * Başlangıç kaynağı (§13.11.1a, kullanıcı kararı 2026-07-26).
 * YALNIZ başkent alır; kurulan koloni sıfırla doğar (kur-al-terk et sömürüsünü kapatır).
 *
 * ⚠️ **2026-08-10: 4000/4000 → 1000/1000.** Kullanıcı: *"ilk günde kârlı getiri sayılabilecek
 * kadar çiftlik maden kolayca yükseltilememeli."*
 *
 * ⚠️⚠️ **ALT SINIRI BİR YAPI KURALI KOYUYOR, TERCİH DEĞİL — 1000'in altına inilmemeli.**
 * Kale 1'in bütçesi 10 seviye ve Çiftlik/Maden zaten 1'den başlıyor → oyuncunun Kale 2'ye kadar
 * yapabileceği TEK şey Çiftlik 5 + Maden 5 (kümülatif **630**). Ondan sonrası kapalı: Akademi
 * Kale 2 ister, Baraka'ya bütçe yok, savaşçı üretimi Akademi→Demircilik ister. Yani kese Kale 2'yi
 * (1.600) karşılamıyorsa oyunun **hiçbir şey sunmadığı** bir ölü bekleme doğuyor. Ölçüldü:
 *
 *     kese  500/500 → 10,9 saat ölü bekleme
 *     kese  750/750 →  6,5 saat
 *     kese 1000/1000 →  2,0 saat   ← seçilen
 *     kese 1500/1500 →  0 saat
 *
 * Hedef zaten Çiftlik/Maden tabanının ×3 olmasıyla sağlanıyor: aynı kese eskiden 13 seviye satın
 * alırken şimdi 5 satın alıyor. `catalog-settings.test.ts` bu ölü durağı bekçi olarak tutuyor.
 */
export const STARTING_RESOURCES = { gold: 1000, food: 1000 } as const;
export const COLONY_STARTING_RESOURCES = { gold: 0, food: 0 } as const;
