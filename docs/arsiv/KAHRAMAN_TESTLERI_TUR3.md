# KAHRAMAN — TUR 3: yetenek teriminin ŞEKLİ

Üretim: 2026-07-29

## Tur 2 ne kanıtladı, ne bıraktı

Tur 2'de **yetenek puanı 0 olan 12 satırın 12'si de birebir tuttu** — yani taban statlar
(hp/magicHp 1200, pAtk/pDef 240, mAtk 300, mDef 4000), seviye terimi `(sv+1)×taban×1,07^sv`,
faz eşlemesi, `Alan = mDef×0,005` ve durum formülü `durum -= 100×net/mDef` hepsi DOĞRU.

Yanlış olan tek şey **yetenek terimi**. Ölçümü tersine çevirdiğimde (sv15, fizSald):

| fizSald | gerçek savunan kaybı | gereken hp | yetenek terimi ÷ taban | binary formülü (1,06^n) |
|---|---|---|---|---|
| 0 | 1.822 | 53.949 | 0,81 | 1,00 |
| 6 | 2.195 | 87.857 | **29,07** | 1,42 |
| 12 | 2.606 | 124.009 | **59,20** | 2,01 |
| 24 | 3.503 | 200.316 | **122,79** | 4,05 |

Yani gerçek terim **yaklaşık `5 × taban × yetenek`** (lineer): 6→30, 12→60, 24→120 tahminleri
ölçümle %3 içinde. Binary'nin `taban × 1,06^yetenek` terimi ise 25 kat küçük.

**Bu set iki soruyu ayırıyor:**
1. Terim seviyeden BAĞIMSIZ mı (`5 × taban × yetenek`) yoksa seviye terimiyle mi ölçekleniyor
   (`(sv+1) × taban × 1,07^sv × k × yetenek`)? → **L grubu**. İkisi sv5'te 5 kat ayrışıyor.
2. Şekil tam olarak lineer mi, hafif üssel mi? → **P grubu** (ince tarama).

Ayrıca **fizSav'ın hangi kanaldan çalıştığı çözülemedi:** Tur 2 S grubu fizSav'ın savunanın
`P` paydasını büyüttüğünü söylüyor (gereken katkı 783 → 3.875 → 8.763), ama asm'de `mDef`'in
yetenek terimi YOK ve `Alan = mDef×0,005`. → **V grubu** bunu ayırıyor.

Aksi belirtilmedikçe: **teknikler 0, gece kapalı, Sur/Kalkan yok, Tapınak 20 (iki taraf),
kahraman sayısı 1 (kahramanın bulunduğu tarafta).**

## L) ⭐ SEVİYE × YETENEK — terim seviyeyle ölçekleniyor mu?

fizSald **12'de sabit**, yalnız seviye değişiyor. Her satırın yanında kahramansız ve aynı seviyede puansız karşılaştırma da var (Tur 2 K grubundan biliniyor). Eğer yetenek katkısı sv5'te sv15'tekiyle **aynı mutlak büyüklükteyse** terim seviyeden bağımsızdır.

Saldıran: **2000 Cüce, 1200 Elf, 500 Süvari, 200 Şaman** · Savunan: **2600 Cüce, 1400 Elf, 600 Süvari, 200 Şaman** · Kahraman **SALDIRANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| L1 | sv 5 · puan YOK | 5 · Savunan | 2494–2499 / 1345–1349 | %100,0 |2493-2498 / 1343-1348 |%100,0 (Xp:646-648, çıkma ihtimali:%3,22-%3,23) |
| L2 | sv 5 · fizSald 12 | 5 · Savunan | 2489–2496 / 1358–1362 | %100,0 |2080-2085 / 2077-2082 |%100,0 (Xp:1247-1252, çıkma ihtimali:%6,23-%6,25) |
| L3 | sv 10 · puan YOK | 5 · Savunan | 2425–2432 / 1516–1521 | %100,0 |2423-2427 / 1515-1519 |%100,0 (Xp:767-769, çıkma ihtimali:%3,83-%3,84) |
| L4 | sv 10 · fizSald 12 | 5 · Savunan | 2422–2426 / 1530–1534 | %100,0 |2016-2023 / 2255-2259 |%100,0 (Xp:1200-1206, çıkma ihtimali:%1,34-%1,35) (saldıran kazanır)|
| L5 | sv 15 · puan YOK | 5 · Savunan | 2313–2318 / 1821–1828 | %100,0 |2310-2315 / 1820-1824 |%100,0 (Xp:1014-1017, çıkma ihtimali:%5,7-%5,8) |
| L6 | sv 15 · fizSald 12 | 5 · Savunan | 2309–2315 / 1834–1839 | %100,0 |1908-1912 / 2603-2610 |%100,0 (Xp:1038-1041, çıkma ihtimali:%1,16-%1,17) (saldıran kazanır) |
| L7 | sv 20 · puan YOK | 5 · Saldıran | 1950–1955 / 2873–2880 | %100,0 |1948-1952 / 2873-2880 |%100,0 (Xp:1010-1014, çıkma ihtimali:%1,13) (saldıran kazanır) |
| L8 | sv 20 · fizSald 12 | 5 · Saldıran | 1945–1951 / 2888–2894 | %100,0 |1555-1558 / 3756-3763 |%100,0 (Xp:693-695, çıkma ihtimali:%0,77-%0,78) (saldıran kazanır)| 

## P) YETENEK ŞEKLİ — ince tarama (sv 15)

Küçük puanlarda lineer ile üssel ayrışır: lineer 1→2'de iki katına çıkar, `1,06^n` ise yalnız %6 artar. Doygunluk yok (savunan 4.800, en yüksek satır bile altında kalmalı).

Saldıran: **2000 Cüce, 1200 Elf, 500 Süvari, 200 Şaman** · Savunan: **2600 Cüce, 1400 Elf, 600 Süvari, 200 Şaman** · Kahraman **SALDIRANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| P1 | fizSald 0 | 5 · Savunan | 2313–2318 / 1822–1827 | %100,0 |2532-2535 / 1247-1251 |%100,0 (Xp:581-584, çıkma ihtimali:%2,90-%2,91) |
| P2 | fizSald 1 | 5 · Savunan | 2312–2318 / 1823–1827 | %100,0 |2499-2504 / 1303-1307 |%100,0 (Xp:617-619, çıkma ihtimali:%3,8-%3,9) |
| P3 | fizSald 2 | 5 · Savunan | 2311–2318 / 1823–1829 | %100,0 |2463-2469 / 1360-1364 |%100,0 (Xp:655-658, çıkma ihtimali:%3,27-%3,28) |
| P4 | fizSald 3 | 5 · Savunan | 2311–2317 / 1824–1829 | %100,0 |2429-2433 / 1419-1422 |%100,0 (Xp:694-697, çıkma ihtimali:%3,47-%3,48) |
| P5 | fizSald 4 | 5 · Savunan | 2311–2317 / 1825–1830 | %100,0 |2393-2398 / 1476-1480 |%100,0 (Xp:735-738, çıkma ihtimali:%3,67-%3,69) |
| P6 | fizSald 6 | 5 · Savunan | 2311–2317 / 1827–1832 | %100,0 |2325-2329 / 1595-1598 |%100,0 (Xp:823-826, çıkma ihtimali:%4,12-%4,13) |
| P7 | fizSald 9 | 5 · Savunan | 2311–2317 / 1831–1836 | %100,0 |2222-2226 / 1784-1786 |%100,0 (Xp:973-977, çıkma ihtimali:%4,86-%4,88) |

## V) fizSav — hangi kanaldan çalışıyor?

Kahraman SAVUNANDA ve hasar ALMIYOR (durum %100). Yine de fizSav savunanın kaybını düşürüyor → tek açıklama `P` paydasının büyümesi. Bu grup ince tarama yapıyor; V1-V2 küçük puanlarda etkinin lineer mi başladığını gösterir.

Saldıran: **3000 Cüce, 1600 Elf, 700 Süvari, 200 Şaman** · Savunan: **2000 Cüce, 1200 Elf, 500 Süvari, 200 Şaman** · Kahraman **SAVUNANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| V1 | fizSav 0 | 5 · Saldıran | 1496–1502 / 3123–3130 | %100,0 |931-936 / 3383-3389 |%100,0 (Xp:378-380, çıkma ihtimali:%0,0) |
| V2 | fizSav 3 | 5 · Saldıran | 1496–1502 / 3123–3130 | %100,0 |951-956 / 3325-3330 |%100,0 (Xp:390-391, çıkma ihtimali:%0,0) |
| V3 | fizSav 6 | 5 · Saldıran | 1496–1500 / 3124–3131 | %100,0 |965-969 / 3277-3287 |%100,0 (Xp:397-399, çıkma ihtimali:%0,0) |
| V4 | fizSav 12 | 5 · Saldıran | 1496–1502 / 3122–3130 | %100,0 |991-994 / 3187-3195 |%100,0 (Xp:412-414, çıkma ihtimali:%0,0) |
| V5 | fizSav 20 | 5 · Saldıran | 1496–1501 / 3123–3130 | %100,0 |1022-1026 / 3074-3081 |%100,0 (Xp:433-434, çıkma ihtimali:%0,0) |
| V6 | fizSav 45 | 5 · Saldıran | 1496–1502 / 3123–3130 | %100,0 |1117-1121 / 2724-2730 |%100,0 (Xp:498-500, çıkma ihtimali:%0,0) |

## VL) fizSav × SEVİYE

fizSav **12'de sabit**, seviye değişiyor. L grubunun fizSav ikizi — aynı soruyu savunma kanadı için sorar.

Saldıran: **3000 Cüce, 1600 Elf, 700 Süvari, 200 Şaman** · Savunan: **2000 Cüce, 1200 Elf, 500 Süvari, 200 Şaman** · Kahraman **SAVUNANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| VL1 | sv 5 · puan YOK | 5 · Saldıran | 1029–1035 / 3335–3343 | %100,0 |1029-1031 / 3336-3340 |%100,0 (Xp:427-428, çıkma ihtimali:%0,0) |
| VL2 | sv 5 · fizSav 12 | 5 · Saldıran | 1029–1035 / 3337–3344 | %100,0 |1085-1090 / 3143-3150 |%100,0 (Xp:463-465, çıkma ihtimali:%0,0) |
| VL3 | sv 15 · puan YOK | 5 · Saldıran | 1496–1500 / 3123–3129 | %100,0 |1496-1500 / 3122-3127 |%100,0 (Xp:694-696, çıkma ihtimali:%3,47) |
| VL4 | sv 15 · fizSav 12 | 5 · Saldıran | 1496–1500 / 3122–3130 | %100,0 |1552-1555 / 2938-2944 |%100,0 (Xp:743-747, çıkma ihtimali:%3,71-%3,73) |
| VL5 | sv 25 · puan YOK | 5 · Savunan | 4512–4523 / 2010–2016 | %100,0 |4512-4521 / 2007-2013 |%100,0 (Xp:898-899, çıkma ihtimali:%1,0-%1,1) |
| VL6 | sv 25 · fizSav 12 | 5 · Savunan | 4514–4522 / 2010–2014 | %100,0 |4576-4583 / 1856-1861 |%100,0 (Xp:814-817, çıkma ihtimali:%0,91-%0,92) |

## W) fizSav HASAR ALIRKEN — mitigasyon kanalı

Burada kahraman gerçekten hasar alıyor (durum düşüyor). fizSav hem `P`'yi hem kendi mitigasyonunu etkiliyorsa **durum %** de belirgin yükselmeli. V grubuyla birlikte iki kanalı ayırır. **Durum % şart.**

Saldıran: **1500 Cüce** · Savunan: **300 Cüce** · Kahraman **SAVUNANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| W1 | fizSav 0 | 5 · Savunan | 1500 / 300 | %79,1–79,2 |37-38 / 301 |%0,0 (Xp:7, çıkma ihtimali:%0,0) (4 tur, saldıran kazandı) |
| W2 | fizSav 6 | 5 · Savunan | 1500 / 300 | %79,2–79,3 |37-38 / 301 |%0,0 (Xp:7, çıkma ihtimali:%0,0) (4 tur, saldıran kazandı)|
| W3 | fizSav 12 | 5 · Savunan | 1500 / 300 | %79,4–79,5 |37-38 / 301 |%0,0 (Xp:7, çıkma ihtimali:%0,0) (4 tur, saldıran kazandı)|
| W4 | fizSav 24 | 5 · Savunan | 1500 / 300 | %80,0–80,1 |37-38 / 301 |%0,0 (Xp:7, çıkma ihtimali:%0,0) (4 tur, saldıran kazandı)|
| W5 | fizSav 45 | 5 · Savunan | 1500 / 300 | %83,0–83,2 |37-38 / 301 |%0,0 (Xp:7, çıkma ihtimali:%0,0) (4 tur, saldıran kazandı)|

> ⚠️ Motor tahminleri **bilerek yanlış** — yetenek terimi hâlâ binary'nin zayıf `1,06^n`
> formülünde. Buradaki iş motoru doğrulamak değil, gerçek eğriyi ölçmek.

## Bir de şunu kontrol eder misin

Tur 2'de **K4 / F1** satırının çıkma ihtimalini **%5,6–%5,8** yazmışsın. O satırın XP'si
1014-1017 ve kazanan savunan (kahramanı yok, K=0). Binary formülü `Tapınak×10 − K×155` bu
değerlerle **%5,07** veriyor. Aynı formül diğer **27 satırın 27'sinde de birebir tutuyor**
(K=1 olanlar dahil: %1,137↔%1,14 · %1,450↔%1,45 · %0,828↔%0,82). Yalnız bu satır sapıyor —
bir daha koşup çıkma ihtimalini teyit eder misin? Formülü değiştirecek bir şey değil, sadece
27/28'i 28/28 yapmak için.