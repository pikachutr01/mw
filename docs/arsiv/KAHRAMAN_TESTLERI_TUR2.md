# KAHRAMAN — TUR 2 ÖLÇÜM SETİ (binary modeli doğrulama)

Üretim: 2026-07-29 · motor: kahraman modeli **binary formülüne çevrildi**

## Neden yeni bir set?

Eski `KAHRAMAN_TESTLERI.md` setinin tamamı **simetrik** kurulmuştu: iki tarafta da aynı ordu,
tek fark kahraman. O bıçak-sırtı senaryoda motorun genel hatası (referans savaşta hâlâ ~%12)
devasa büyüyor ve kahramanın kendi etkisinden ayırt edilemiyor. Bu set **asimetrik ve
doygun olmayan** savaşlar kullanıyor — hiçbir satırda ordu tamamen silinmiyor.

Aksi belirtilmedikçe: **tüm teknikler 0, gece kapalı, Sur/Kalkan yok, Tapınak 20,
mevcut kahraman sayısı 1.** Her satırı birkaç kez çalıştır, aralık ver.

> ⚠️ **Kahramanın DURUM %'sini yazmayı unutma** (Kahramanlar panelindeki sağ sütun).
> Ölürse "%0" ya da öldü yaz.

## Binary'den çıkan model (test edilen iddia)

```
Kahraman = stat tablosu SATIR 12 (FUN_0041440c). 21 satır = 12 savaşçı + KAHRAMAN + 8 yapı.
Tabanlar: hp 1200 · magicHp 1200 · pAtk 240 · pDef 240 · mAtk 300 · mDef 4000

  stat = round((sv+1) × taban × 1,07^sv  +  taban × 1,06^yetenek)      [FUN_0040d884]
  mDef = round((sv+1) × 4000 × 1,06^sv)        ← yetenek terimi YOK
  Alan = round(mDef × 0,005)
  fizSald→hp · fizSav→pAtk VE pDef · büyüSald→magicHp · büyüSav→mAtk

Savaştaki rolü (FUN_0040e0c4, argüman eşlemesi 0x40f8bf):
  faz 1 (menzilli) → HİÇ KATKI YOK
  faz 2 (yakın)    → hp katkısı        (tip filtresi YOK)
  faz 3 (BÜYÜ)     → magicHp katkısı   ← "büyü ziyan" iddiasını çürüten dal
  savunmada normal birim: P'ye Alan, mitigasyon faz statı, durum -= 100×net/mDef
```

⭐ **Eski D3/D4 testi büyüyü GÖREMEZDİ:** o ordunun faz-3 havuzu sıfırdı ve savunanda
300 Şaman × 300 = 90.000 çıkarma vardı; kahramanın katkısı 28.115 → havuz −61.885 → faz hiç
çalışmadı. Bu setin M grubu tam da bunu düzeltiyor.

## K) SEVİYE — yetenek puanı yok

Yalnız seviye değişiyor. Model seviye terimini `(sv+1) × 1200 × 1,07^sv` diyor; bu grup onu sınar. K1 kahramansız taban — kahramanın toplam katkısını ölçmek için.

Saldıran: **2000 Cüce, 1200 Elf, 500 Süvari, 200 Şaman** · Savunan: **2600 Cüce, 1400 Elf, 600 Süvari, 200 Şaman** · Kahraman **SALDIRANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| K1 | KAHRAMANSIZ taban — KAHRAMAN YOK | 5 · Savunan | 2543–2548 / 1223–1226 | — |2540-2547 / 1221-1226 | - (Xp: 565-567, çıkma ihtimali: %2,82-%2,83)|
| K2 | Seviye 5 — sv 5 · puan yok | 5 · Savunan | 2494–2499 / 1346–1349 | %100,0 |2492-2496 / 1344-1349 | %100,0 (Xp: 645-648, çıkma ihtimali: %3,22-%3,23)|
| K3 | Seviye 10 — sv 10 · puan yok | 5 · Savunan | 2425–2430 / 1518–1522 | %100,0 |2423-2429 / 1515-1520| %100,0 (Xp: 766-769, çıkma ihtimali: %3,83-%3,85)|
| K4 | Seviye 15 — sv 15 · puan yok | 5 · Savunan | 2313–2318 / 1822–1827 | %100,0 |2310-2318 / 1820-1825| %100,0 (Xp: 1014-1017, çıkma ihtimali: %5,6-%5,8)|
| K5 | Seviye 20 — sv 20 · puan yok | 5 · Saldıran | 1950–1956 / 2875–2882 | %100,0 |1948-1953 / 2873-2878 |%100,0 (Xp: 1009-1013, çıkma ihtimali: %1,13-%1,14) |

## F) fizSald — yakın faz havuzu

⭐ Modelin **en zayıf** noktası. Binary formülü yetenek terimini `1200 × 1,06^n` diyor, yani 45 puan bile kahramanın gücünü ancak %28 artırıyor. Eski (simetrik) ölçüm ise puan başına ~%35 lineer artış istiyordu. Bu grup ikisini kesin ayırır.

Saldıran: **2000 Cüce, 1200 Elf, 500 Süvari, 200 Şaman** · Savunan: **2600 Cüce, 1400 Elf, 600 Süvari, 200 Şaman** · Kahraman **SALDIRANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| F1 | fizSald 0 — sv 15 · puan yok | 5 · Savunan | 2312–2318 / 1822–1827 | %100,0 |2310-2318 / 1820-1825| %100,0 (Xp: 1014-1017, çıkma ihtimali: %5,6-%5,8)|
| F2 | fizSald 6 — sv 15 · FSl 6 | 5 · Savunan | 2311–2317 / 1826–1832 | %100,0 |2112-2118 / 2192-2198 |%100,0 (Xp: 1287-1292, çıkma ihtimali: %1,44-%1,45) (Not: saldıran kazanır) |
| F3 | fizSald 12 — sv 15 · FSl 12 | 5 · Savunan | 2310–2315 / 1834–1840 | %100,0 |1908-1913 / 2603-2610 |%100,0 (Xp: 1036-1043, çıkma ihtimali: %1,16-%1,17) (Not: saldıran kazanır)  |
| F4 | fizSald 24 — sv 15 · FSl 24 | 5 · Savunan | 2301–2308 / 1860–1867 | %100,0 |1528-1532 / 3500-3507 |%100,0 (Xp: 699-703, çıkma ihtimali: %0,78-%0,79) (Not: saldıran kazanır)  |
| F5 | fizSald 45 — sv 15 · FSl 45 | 5 · Savunan | 2265–2271 / 1990–1996 | %100,0 |929-931 / 4800 |%100,0 (Xp: 357-358, çıkma ihtimali: %0,0) (Not: saldıran kazanır)  |

## M) ⭐ BÜYÜ — büyü ağırlıklı ordu (asıl test)

Saldıran Ejderha ağırlıklı → faz-3 havuzu GERÇEKTEN dolu. Savunanda yalnız 60 Şaman → çıkarma küçük, faz 3 çalışıyor. Model büyüSald 0→40'ta savunan kaybının artmasını bekliyor. Artmıyorsa büyü gerçekten etkisiz; ölçüdeki artış modelinkinden büyükse yetenek terimi güçlü.

Saldıran: **35 Ejderha, 600 Cüce** · Savunan: **40 Ejderha, 800 Cüce, 60 Şaman** · Kahraman **SALDIRANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| M1 | KAHRAMANSIZ taban — KAHRAMAN YOK | 5 · Savunan | 635 / 230–231 | — |635 / 228-229 | - (Xp: 205-206, çıkma ihtimali: %0,0)|
| M2 | büyüSald 0 — sv 15 · puan yok | 5 · Saldıran | 466–467 / 721–723 | %100,0 |464-466 / 721-722 |%100,0 (Xp: 735-738, çıkma ihtimali: %0,82-%0,83) |
| M3 | büyüSald 10 — sv 15 · BSl 10 | 5 · Saldıran | 464–465 / 728–730 | %100,0 |429-430 / 805-807 |%100,0 (Xp: 630-633, çıkma ihtimali: %0,70-%0,71) |
| M4 | büyüSald 20 — sv 15 · BSl 20 | 5 · Saldıran | 458–460 / 741–743 | %100,0 |390-395 / 889 |%100,0 (Xp: 542-544, çıkma ihtimali: %0,60-%0,61) |
| M5 | büyüSald 40 — sv 15 · BSl 40 | 5 · Saldıran | 436–438 / 804–805 | %100,0 |327 / 900 |%100,0 (Xp: 425-426, çıkma ihtimali: %0,0) |

## MK) BÜYÜ — kontrol: savunanda ÇOK Şaman (eski körlük)

M ile aynı ordu ama savunanda 900 Şaman. Model faz-3 havuzunun negatife düşüp büyünün tamamen etkisiz kalmasını bekliyor — yani büyüSald 0 ile 40 **aynı** çıkmalı. Çıkarsa eski D3/D4 null sonucunun sebebi kesin olarak doğrulanmış olur.

Saldıran: **35 Ejderha, 600 Cüce** · Savunan: **40 Ejderha, 800 Cüce, 900 Şaman** · Kahraman **SALDIRANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| MK1 | büyüSald 0 — sv 15 · puan yok | 5 · Savunan | 635 / 0 | %3,1–3,3 |635 / 0 |%3,10-%3,8 (Xp: 0, çıkma ihtimali: %0,0) |
| MK2 | büyüSald 40 — sv 15 · BSl 40 | 5 · Savunan | 635 / 0 | %3,0–3,4 |635 / 15 |%4,11-%4,52 (Xp: 4, çıkma ihtimali: %00) |

## S) SAVUNANDA kahraman — fizSav

⚠️ Model bu grupta fizSav'ı **tamamen etkisiz** gösteriyor: fizSav kahramanın kendi mitigasyonunu büyütür, ama kahraman zaten hasar almıyor (net ≤ 0). Ölçümde fark çıkarsa fizSav başka bir yere de giriyor demektir. Eski D2 ölçümü fark GÖSTERMİŞTİ.

Saldıran: **3000 Cüce, 1600 Elf, 700 Süvari, 200 Şaman** · Savunan: **2000 Cüce, 1200 Elf, 500 Süvari, 200 Şaman** · Kahraman **SAVUNANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| S1 | KAHRAMANSIZ taban — KAHRAMAN YOK | 5 · Saldıran | 913–916 / 3393–3402 | — |911-915 / 3392-3401 |- (Xp: 367-369, çıkma ihtimali: %0,0) |
| S2 | fizSav 0 — sv 15 · puan yok | 5 · Saldıran | 1496–1500 / 3123–3130 | %100,0 |1494-1499 / 3121-3129 |%100,0 (Xp: 694-697, çıkma ihtimali: %3,47-%3,48) |
| S3 | fizSav 20 — sv 15 · FSv 20 | 5 · Saldıran | 1496–1502 / 3121–3130 | %100,0 |1581-1586 / 2830-2837 |%100,0 (Xp: 773-776, çıkma ihtimali: %3,86-%3,87) |
| S4 | fizSav 45 — sv 15 · FSv 45 | 5 · Saldıran | 1496–1500 / 3124–3130 | %100,0 |1679-1684 / 2490-2497 |%100,0 (Xp: 877-882, çıkma ihtimali: %4,38-%4,39) |

## B) SAVUNANDA kahraman — büyüSav, büyü saldırısına karşı

büyüSav kahramanın mAtk'ini (büyü savunması) büyütür. Saldıran Ejderha ağırlıklı olduğu için kahramana büyü hasarı geliyor; büyüSav durumunun daha az düşmesini sağlamalı.

Saldıran: **30 Ejderha, 1500 Cüce** · Savunan: **1200 Cüce, 600 Elf, 60 Şaman** · Kahraman **SAVUNANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| B1 | kahraman TEK BAŞINA (kıyas) — KAHRAMAN YOK | 4 · Saldıran | 150 / 1860 | — |148-149 / 1860 |- (Xp: 75-76, çıkma ihtimali: %0,0) |
| B2 | büyüSav 0 — sv 15 · puan yok | 5 · Saldıran | 846–848 / 1860 | %73,5–73,8 |846-847 / 1860 |%73,41-%73,82 (Xp: 695-698, çıkma ihtimali: %3,47-%3,49) |
| B3 | büyüSav 20 — sv 15 · BSv 20 | 5 · Saldıran | 846–848 / 1860 | %73,9–74,4 |877-880 / 1857 |%90-%90,9 (Xp: 757-759, çıkma ihtimali: %3,78-%3,79) |
| B4 | büyüSav 45 — sv 15 · BSv 45 | 5 · Saldıran | 846–848 / 1860 | %76,0–76,4 |926-929 / 1784-1788 |%100,0 (Xp: 733-734, çıkma ihtimali: %0,82) (Not: savunan kazanır)|

## X) DURUM ve ÖLÜM — ezici baskı altında

⭐ Kahramanın durumu nasıl düşüyor? Model: `durum -= 100 × net/mDef`, 0'da ölüm. Savunan gitgide büyüyor, saldırandaki kahraman eziliyor. **Her satırda DURUM % şart.**

Saldıran: **300 Cüce** · Kahraman **SALDIRANDA**

| # | Kahraman | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | MOTOR: durum% | GERÇEK: sald / sav | GERÇEK: durum% |
|---|---|---|---|---|---|---|
| X1 | savunan 3000 Cüce · sv 15 · puan yok | 3 · Savunan | 300 / 733–735 | %83,1 |301 / 1639-1641 |%0,0 (Xp: 726-727, çıkma ihtimali: %3,62-%3,64) (Not: 5 tur) (Ayrıca saldıran 301 kaybetti çıkıyor, demek ki simülatör kahramnı da hesaba katıyor) |
| X2 | savunan 5000 Cüce · sv 15 · puan yok | 3 · Savunan | 300 / 541–543 | %65,4–65,5 |301 / 819-820 |%0,0 (Xp: 255-256, çıkma ihtimali: %0,0) (Not: 4 tur) |
| X3 | savunan 8000 Cüce · sv 15 · puan yok | 3 · Savunan | 300 / 252–254 | %38,8–39,0 |301 / 379-381 |%0,0 (Xp: 92, çıkma ihtimali: %0,0) (Not: 4 tur) |
| X4 | savunan 12000 Cüce · sv 15 · puan yok | 3 · Savunan | 300 / 68–69 | %3,4–3,6 |301 / 103-104 |%0,0 (Xp: 20, çıkma ihtimali: %0,0) (Not: 4 tur) |

## Sapma olursa ne anlama gelir

| Gözlem | Sonuç |
|---|---|
| **M** grubunda büyüSald savunan kaybını artırıyor | ✅ Büyü ÇALIŞIYOR. "Büyü ziyan" iddiası kesin ölmüş olur; arayüzde büyü yeteneği normal bir seçenek. |
| **M** grubunda hiç fark yok ama **MK** de aynı | Büyü gerçekten etkisiz — ama o zaman `magicHp 1200` tabanı nereye gidiyor, ayrıca aranmalı. |
| **MK** düz, **M** artıyor | ✅ Eski D3/D4 null sonucunun sebebi kesin: Şaman çıkarması faz-3 havuzunu yutuyormuş. |
| **F** grubunda 45 puan modelin verdiğinden ÇOK fazla etki yapıyor | Yetenek terimi `taban × 1,06^n` değil; muhtemelen lineer/daha güçlü. Ölçüm eğrisinden yeniden türetilecek. |
| **F** grubunda 45 puan ~%9 civarı etki yapıyor | ✅ Binary formülü aynen doğru; eski simetrik ölçümlerin aşırı duyarlılığı yanıltmış. |
| **S** grubunda fizSav fark yaratıyor | fizSav yalnız kahramanın kendi mitigasyonu değil; P'ye ya da orduya da giriyor. |
| **S** grubunda fizSav hiç fark yaratmıyor | ✅ Model doğru; fizSav ancak kahraman hasar aldığında işe yarar (X grubuna bak). |
| **X** grubunda durum% motorunkinden hızlı/yavaş düşüyor | `durum -= 100 × net/mDef` ölçeği yanlış; X eğrisinden kalibre edilecek. |
| **K** grubunda seviye etkisi tutuyor ama F tutmuyor | Seviye terimi doğru, yetenek terimi yanlış — ikisi ayrı ayrı düzeltilebilir. |

## Ek: ölçüm sırasında not edilecek iki şey

1. **XP:** sonuç metnindeki *"Kahramanlar için oluşan deneyim puanı"*. Kaybeden tarafta da
   sıfırdan farklı çıkıyor mu? (Senin kuralın "yalnız kazanan alır" — simülatör bunu
   gösteriyorsa doğrulamış oluruz.)
2. **Kahraman çıkma ihtimali:** yüzde değeri. K grubunda ordu boyu sabit, yalnız kahraman
   değişiyor → ihtimalin kahraman sayısıyla nasıl düştüğünü de görürüz.