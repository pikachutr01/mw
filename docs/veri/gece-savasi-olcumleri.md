# GECE SAVAŞI ÖLÇÜMLERİ — binary simülatör karşılaştırması

> **Amaç:** gece savaşındaki artık over-kill'i sayısallaştırmak. Mekanizma 2026-07-31'de
> Ghidra ile **yapısal olarak** çözüldü (aşağıda); geriye kalan soru "büyüklük doğru mu".
>
> **Motor sütunlarını yeniden üretmek için:** `node scratchpad/gece_olcum.mjs`

> ✅ **DEVAMI KOŞULDU (2026-08-11): `docs/GECE_GORUS_TESTLERI.md` — 9 grup, 60+ hücre, 9/9 tuttu.**
> Sonuç: gece görüşü **tamamen ofansif** (kendi seviyen yalnız düşmanın kaybını belirler),
> eğri **logaritmik değil**, motorda eksik bir gece kanalı **yok**. ⭐ Yan ürün: çarpanın yedi
> değeri de ölçümden **geri çözüldü** — taban `0,7` artık disassembly okuması değil, ölçülmüş
> bir sayı (0,6976 – 0,7022).
>
> ⭐ **DEVAMI VAR (2026-08-11): `docs/GECE_GORUS_TESTLERI.md`.** Bu dosyanın altı hücresi de
> **5 turluk** savaşlardı ve 5 turluk savaşta geri besleme her kanalı birbirine karıştırır — yani
> buradaki ölçüm *"gece görüşü savunmaya da mı işliyor"* sorusunu **soramadı**. Yeni set o soruyu
> **2 turluk savaşlarla** izole ediyor (tur 2'den sonra tur yoksa geri besleme de yok) ve eğrinin
> şeklini parametreden bağımsız bir **oran testiyle** sınıyor.

---

## ⭐ SONUÇ (2026-07-31, kullanıcı ölçümü tamamlandı)

| grup | ne ölçüldü | sonuç |
| :-- | :-- | :-- |
| **A** | gece görüşü taraması, 6 hücre | ✅ **Motorun 6 değeri de orijinalin aralığının İÇİNDE.** Gece over-kill'i **YOK** — "%15 artık" iddiası kesin olarak çürüdü. |
| **B** | kaos ile Büyü Canı izolasyonu | ✅ Motor 7785/2783, orijinal 7760-7793 / 2771-2789. Oran 0,357 doğrulandı → gece **Büyü Canı'nı da azaltıyor**. Ghidra okuması (stat+0x08) ölçümle teyitli. |
| **C** | yapılı savunma, 3. döngü | ⚠️ **Kayıplar birebir** (atkK 830 vs 829-831 · defK 500 vs 500 · gece 659 vs 658-661, 391 vs 390-391) ama **kalan yapı sayıları %30 düşüktü** → sebep savaşta değil **ONARIM ORANINDA** çıktı (aşağıya bak). |
| **D** | taşıma kapasitesi | ⛔ Simülatör kapasite bilgisi vermiyor; **gece ve gündüz ganimet aynı** gözlendi. Kullanıcı kararı: **gece taşımayı değiştirmez** — disassembly'de de üçüncü bir çarpım yok. Kapandı. |

### ⭐⭐ C grubundan çıkan asıl bulgu: ONARIM ORANI %50-70 DEĞİL, ~%76-81

Oyunun kendi metni *"zarar gören savunma üniteleri %50-70 arası oranda yenilenir"* diyor.
Ölçüm bunu **çürütüyor**. Dört bağımsız seriden geri çözülen oran:

| seri | orijinal (3 koşu) | ima edilen onarım oranı |
| :-- | :-- | :-- |
| gündüz okçu kulesi (200) | 152-161 | 0,755 – 0,801 |
| gündüz mangonel kulesi (100) | 76-81 | 0,750 – 0,802 |
| gece okçu kulesi (200) | 156-163 | 0,763 – 0,801 |
| gece mangonel kulesi (100) | 79-83 | 0,761 – 0,807 |

⚠️ Bu bir "yakın değil" durumu değil, **kesin dışlama**: motorun eski aralığı en yüksek
değerinde (0,70) 200 kuleden **140** kalan üretebiliyor; orijinalin en düşük ölçümü **152**.
Yani eski aralık orijinali ÜRETEMEZ.

⭐ Motorun v0.6 öncesi kalibrasyonu **sabit %78**'di ve ölçümün tam ortasına düşüyor — o gün
"doküman oranına dönelim" diye yapılan değişiklik bir **regresyondu**. Yeni aralık
**0,76 – 0,81** (`CombatConfig.repair`, iki motorda da). Kullanıcı kuralı gereği ölçüm esas
alındı, sayı ayarlanabilir sabitte duruyor ve çelişki burada bildiriliyor.

---

## 0. Mekanizma — BİNARY'DEN KESİN (2026-07-31, Ghidra)

Bu bölüm tahmin değil; disassembly'den satır satır okundu. Ölçümler bunu **çürütmek** için var,
doğrulamak için değil — çürütürse mekanizma yeniden okunur.

```
FUN_0040dcb4  savaş koordinatörü
  └─ FUN_0040d608        gece bayrağı: savas+0x74 != 0 ?
       ├─ FUN_004111d4   SALDIRAN — 2 döngü (birincil + ikincil savaşçılar)
       │    └─ FUN_00412624(birim, çarpan)
       └─ FUN_00411a80   SAVUNAN — 3 döngü (birincil + ikincil + SAVUNMA YAPILARI)
            ├─ FUN_00412624(birim, çarpan)        ← savaşçılar
            └─ FUN_00413120(yapı,  çarpan)        ← yapılar; 412624 ile BAYT BAYT AYNI
```

`FUN_00412624` disassembly'si (0x00412624-0x00412672) **yalnız iki oku-çarp-yaz çifti**:

| adım | getter | okunan | setter |
| :-- | :-- | :-- | :-- |
| 1 | `FUN_00412b5c` → `FLD [p+0x00]` | **Can (HP)** | `FUN_00412b68` |
| 2 | `FUN_00412b9c` → `FLD [p+0x08]` | **Büyü Canı (MagicHP)** | `FUN_00412ba8` |

Stat bloğu 6 double, 8 bayt adımlı — sonuncusu bağımsızca doğrulandı
(`FUN_00412b3c` = `FLD [p+0x28]`, dağıtıcı indeksi 6 = Büyü Savunması):

```
+0x00 Can · +0x08 BüyüCan · +0x10 FizSald · +0x18 FizSav · +0x20 BüyüSald · +0x28 BüyüSav
```

**Çarpan** (saldıran `0x00411280`.. / savunan `0x00411b74`.., sabitler 3.0 · 1.0 · 0.3 · 0.7):

```
çarpan = (1 − 3 / (GeceGörüşü + 3)) × 0.3 + 0.7
```

| GG | 0 | 1 | 2 | 3 | 5 | 10 | 15 | 20 |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| çarpan | 0,7000 | 0,7750 | 0,8200 | 0,8500 | 0,8875 | 0,9308 | 0,9500 | 0,9609 |

### Bu turda düzeltilen iki sapma

1. ⭐ **Taşıma kapasitesi çarpılıyordu, binary çarpmıyor.** Kaynağı eski çözümleme raporunun
   *"HP ve Taşıma Kapasitesi"* ifadesiydi; modifier'ın ikinci alanı Taşıma değil **Büyü Canı**.
   Taşıma o stat bloğunda bile yok. Etkisi: gece saldırısında ganimet kapasitesi boşuna
   ~%30 (GG0) kısılıyordu. **Savaş sonucuna etkisi YOK**, ganimete vardı.
2. **Yük Arabası kapasitesi** keşif motorunda 3000, TS kataloğunda 5000'di. Oyunun kendi
   dokümanı (`referans/teknik_ve_yapi_dokumantasyonu.md:634`) **5000** diyor → JS düzeltildi.

⚠️ **Sur ve Büyü Kalkanı geceden ETKİLENMEZ**: binary'de ayrı alanlar (`ordu+0x10` / `ordu+0x98`),
üçüncü döngünün taradığı yapı listesinde değiller.

---

## A GRUBU — SAF ORDU, GECE GÖRÜŞÜ TARAMASI

En temiz izolasyon: tek tip birim, yapı yok, kahraman yok, teknik 0. Yalnız GG değişiyor.
**2500 Cüce (saldıran) vs 3500 Cüce (savunan).**

| # | GG (sal/sav) | Motor kazanan | Motor atkK | Motor defK | Motor tur | ORİJİNAL kazanan | ORİJİNAL atkK | ORİJİNAL defK | ORİJİNAL tur |
| :-- | :-- | :-- | --: | --: | --: | :-- | --: | --: | --: |
| A0 | GÜNDÜZ | defender | 2500 | 1070 | 5 |defender |2500 |1068-1072 |5 |
| A1 | 0 / 0 | defender | 1903 | 805 | 5 |defender |1901-1903 |802-806 |5 |
| A2 | 5 / 0 | defender | 1802 | 1177 | 5 |defender |1799-1704 |1175-1178 |5 |
| A3 | 0 / 5 | defender | 2500 | 656 | 5 |defender |2500 |654-657 |5 |
| A4 | 10 / 10 | defender | 2500 | 1025 | 5 |defender |2500 |1021-1025 |5 |
| A5 | 20 / 20 | defender | 2500 | 1046 | 5 |defender |2500 |1042-1047 |5 |

⚠️ A2 dikkat çekici: saldıranın gece görüşü 5 olunca **savunanın kaybı 805 → 1177'ye ÇIKIYOR**
(gündüzkü 1070'in de üstünde). Çünkü GG yalnız o tarafın Can'ını korur, o da saldırı havuzunu
(Σ Can×adet) büyütür. Orijinal bu davranışı doğruluyorsa mekanizma tamam; doğrulamıyorsa
çarpan **havuza değil yalnız dayanıklılığa** uygulanıyor demektir — o da bambaşka bir model.

✅ **SONUÇ: altı hücrenin altısı da orijinalin aralığının içinde.** A2'nin ters yönlü davranışı
(GG 5 → savunan kaybı 805'ten 1177'ye ÇIKIYOR) orijinalde de aynen var (1175-1178) — yani
çarpan gerçekten **saldırı havuzuna** uygulanıyor, yalnız dayanıklılığa değil. Gece over-kill'i
yok. (A2'nin atkK sütununda "1799-1704" yazılmış; 1704 açık bir yazım hatası, 1804 olmalı —
motorun 1802'si aralığın içinde.)

---

## B GRUBU — BÜYÜ CANI İZOLASYONU (kaos)

Kaos'un Büyü Canı 220.000 — geceden etkilenen ikinci stat tam olarak bu. Eğer orijinalde
gece kaos'u etkilemiyorsa, ikinci çarpım Büyü Canı DEĞİLDİR ve okuma yanlıştır.

**6 Kaos (saldıran) vs 200.000 Cüce (savunan), teknik 0, GG 0/0.**

| # | | Motor defK | Motor tur | ORİJİNAL defK | ORİJİNAL tur |
| :-- | :-- | --: | --: | --: | --: |
| B1 | GÜNDÜZ | 7785 | 3 |7760-7793 |3 |
| B2 | GECE | 2783 | 3 |2771-2789 |3 |

✅ **SONUÇ: ikisi de aralığın içinde.** Oran 0,357 doğrulandı — 1,0 olsaydı gece Büyü Canı'na
dokunmuyor olurdu, 0,49 olsaydı çarpanın karesi devredeydi. Ghidra'nın "ikinci çarpım
stat+0x08 = Büyü Canı" okuması **ölçümle bağımsızca teyitli**. 2026-07-22'de eğri uydurmasıyla
eklenen `magicHp` çarpımı doğruymuş.

---

## C GRUBU — YAPILI SAVUNMA (3. döngü)

Binary savunanın yapılarını da gece çarpanıyla azaltıyor (`FUN_00413120`). Bu grup onu ölçer.

**2000 Elf (saldıran, teknik 10) vs 500 Cüce + 200 Okçu Kulesi + 100 Mangonel Kulesi (teknik 10).**

| # | | Motor atkK | Motor defK | Motor kalan okçu | Motor kalan mangonel | ORİJİNAL atkK | ORİJİNAL defK | ORİJİNAL okçu | ORİJİNAL mangonel |
| :-- | :-- | --: | --: | --: | --: | --: | --: | --: | --: |
| C1 | GÜNDÜZ | 830 | 500 | 120 | 60 | 829-831|500 |152-161 arası |76-81 arası |
| C2 | GECE | 659 | 391 | 126 | 65 |658-661 |390-391 |156-163 arası |79-83 arası |

✅ **Kayıplar birebir** — yani gece'nin savunma yapılarına etkisi (3. döngü) doğru modellenmiş.
⚠️ **Kalan yapı sayıları %30 düşüktü** ve sebep savaşta değil onarımda çıktı: motor yapıların
hepsini kaybediyor (onarım 0'a sabitlenince kalan 4 = savunma tabanı), sonra onarım geri
getiriyor. Yani fark tamamen onarım oranından geliyordu → yukarıdaki **%76-81** bulgusu.
Motor sütunları o düzeltmeden ÖNCEki değerlerdir (onarım 0,60'a sabitlenmiş koşum).

---

## D GRUBU — TAŞIMA KAPASİTESİ (bu turun düzeltmesi)

Savunması olmayan bir hedefe saldır; saldıran hiç kayıp vermez, kalan yük arabası sayısı
gece ve gündüz aynı olmalı. Sonra **taşınan ganimeti** karşılaştır.

**500 Cüce + 100 Yük Arabası (saldıran) vs 1 Cüce (savunan), hedef şehirde bol kaynak.**

| # | | Motor kalan yük | Motor kapasite | ORİJİNAL kalan yük | ORİJİNAL taşınan altın+yemek |
| :-- | :-- | --: | --: | --: | --: |
| D1 | GÜNDÜZ | 100 | 505.000 | | |
| D2 | GECE (GG 0) | 100 | 505.000 | | |

(505.000 = 100 yük × 5.000 + 500 cüce × 10. Düzeltme öncesi gece 353.500 çıkıyordu.)

⛔ **ÖLÇÜLEMEDİ — kapandı.** Simülatör taşıma kapasitesini hiç göstermiyor. Kullanıcının
gözlemi: gece ve gündüz **oluşan ganimet aynı** (500 Cüce + 100 Yük vs 1 Cüce → 59 Altın,
134 Yemek enkaz, iki durumda da). Karar: **gece taşıma kapasitesini değiştirmez.** Bu, tek
başına kesin kanıt değil (enkaz kapasiteden bağımsız hesaplanıyor) ama disassembly ile aynı
yönü gösteriyor: modifier'da ÜÇÜNCÜ bir oku-çarp-yaz çifti yok. İki bağımsız işaret aynı
yerde buluşuyor → madde kapandı.

---

---

## E. İKİ MOTOR AYNI MI? — ölçüldü (2026-07-31)

`scratchpad/engine_diff.mjs` sekiz senaryoyu keşif motoru (`mobiwar-engine.js`) ve üretim
motoruyla (`@mobilwar/engine`) aynı anda koşuyor. **6/8 birebir aynı**; gece senaryolarının
tamamı (N1-N4, N6) aynı. Kalan iki fark:

| fark | büyüklük | teşhis |
| :-- | :-- | :-- |
| **N5** yapılı savunmada savunan kalanı | 384 vs 380 (Δ4) | **Raporlama farkı.** Keşif motoru `sur`u "kalan birim" toplamına katıyor (seviye 5 → +5), üretim motoru katmıyor. Sur adet değil SEVİYE taşır → üretim motoru doğru. `sur:5` tek başına koşulduğunda fark tam olarak 5 çıkıyor. |
| **G2** yüksek teknikli karışık orduda savunan kalanı | 61 vs 54 (Δ7, ~%0,5) | Karışık ordularda kuyruk farkı. Tek tip orduda (G1, N1-N3) fark YOK; yalnız süvari de aynı. İki farklı tür aynı havuzu paylaşınca yuvarlama/sıra farkı doğuyor. **Açık kalem.** |

⚠️ **Harness tuzağı** (bu turda düşülüp çıkıldı): iki motor farklı kimlik uzayı kullanıyor —
keşif Türkçe (`cuce`, `sur`, `tasusta`), üretim İngilizce (`dwarf`, `wall`, `masonry`).
En tehlikelisi: **`mangonel` ikisinde de var ama başka birimi gösteriyor** (keşifte Mangonel
KULESİ, üretimde kuşatma savaşçısı). Eşleme tablosu `engine_diff.mjs`'te; eksik anahtar
sessizce düşmüyor, **hata fırlatıyor**.

### Tek gerçek stat sapması

21 birimin 11 alanı (Can · BüyüCan · Taşıma · FizSald · FizSav · BüyüSald · BüyüSav · altın ·
yemek · alan · tip) karşılaştırıldı: **tek fark Yük Arabası kapasitesiydi** (3000 vs 5000).
Doküman 5000 diyor → keşif motoru düzeltildi.

---

## Notlar

- Tüm koşumlarda kahraman yok, tapınak 0, sur/kalkan yok (C grubu hariç).
- `atkK`/`defK` = "X ünite kaybetti" satırındaki sayı (savunma YAPILARI bu toplama girmez,
  ölen kahraman girer).
- Motor sütunları jitter kapalıyken üretildi (`±%0,1` rastgele oynama etkisiz).
