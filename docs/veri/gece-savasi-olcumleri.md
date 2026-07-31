# GECE SAVAŞI ÖLÇÜMLERİ — binary simülatör karşılaştırması

> **Amaç:** gece savaşındaki artık over-kill'i sayısallaştırmak. Mekanizma 2026-07-31'de
> Ghidra ile **yapısal olarak** çözüldü (aşağıda); geriye kalan soru "büyüklük doğru mu".
>
> **Nasıl doldurulur:** her satırı binary simülatörde AYNI girdilerle koş, `ORİJİNAL` sütunlarını
> yaz. Motor sütunları bu dosya yazılırken üretildi (`mw/packages/engine`, sürüm 1.1.0).
> ⚠️ Motor sütunlarını yeniden üretmek için: `node scratchpad/gece_olcum.mjs`

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
| A0 | GÜNDÜZ | defender | 2500 | 1070 | 5 | | | | |
| A1 | 0 / 0 | defender | 1903 | 805 | 5 | | | | |
| A2 | 5 / 0 | defender | 1802 | 1177 | 5 | | | | |
| A3 | 0 / 5 | defender | 2500 | 656 | 5 | | | | |
| A4 | 10 / 10 | defender | 2500 | 1025 | 5 | | | | |
| A5 | 20 / 20 | defender | 2500 | 1046 | 5 | | | | |

⚠️ A2 dikkat çekici: saldıranın gece görüşü 5 olunca **savunanın kaybı 805 → 1177'ye ÇIKIYOR**
(gündüzkü 1070'in de üstünde). Çünkü GG yalnız o tarafın Can'ını korur, o da saldırı havuzunu
(Σ Can×adet) büyütür. Orijinal bu davranışı doğruluyorsa mekanizma tamam; doğrulamıyorsa
çarpan **havuza değil yalnız dayanıklılığa** uygulanıyor demektir — o da bambaşka bir model.

**Ne arıyoruz:** A0 ile A1 arasındaki oran. Motor gündüz→gece savunan kaybını 1070→805
(**%25 azalma**) diyor. Orijinal daha az azaltıyorsa motor gece "fazla koruyor"; daha çok
azaltıyorsa **over-kill** hâlâ var demektir.

---

## B GRUBU — BÜYÜ CANI İZOLASYONU (kaos)

Kaos'un Büyü Canı 220.000 — geceden etkilenen ikinci stat tam olarak bu. Eğer orijinalde
gece kaos'u etkilemiyorsa, ikinci çarpım Büyü Canı DEĞİLDİR ve okuma yanlıştır.

**6 Kaos (saldıran) vs 200.000 Cüce (savunan), teknik 0, GG 0/0.**

| # | | Motor defK | Motor tur | ORİJİNAL defK | ORİJİNAL tur |
| :-- | :-- | --: | --: | --: | --: |
| B1 | GÜNDÜZ | 7785 | 3 | | |
| B2 | GECE | 2783 | 3 | | |

**Ne arıyoruz:** B2/B1 oranı. Motor 0,357 diyor. Orijinalde oran **1,0'a yakınsa** gece Büyü
Canı'na dokunmuyor demektir → `applyNight`ten `magicHp` çıkar. 0,49 (=0,7²) civarıysa büyü
hasarı çarpanın KARESİNİ yiyor demektir (hem havuz hem mitigasyon).

---

## C GRUBU — YAPILI SAVUNMA (3. döngü)

Binary savunanın yapılarını da gece çarpanıyla azaltıyor (`FUN_00413120`). Bu grup onu ölçer.

**2000 Elf (saldıran, teknik 10) vs 500 Cüce + 200 Okçu Kulesi + 100 Mangonel Kulesi (teknik 10).**

| # | | Motor atkK | Motor defK | Motor kalan okçu | Motor kalan mangonel | ORİJİNAL atkK | ORİJİNAL defK | ORİJİNAL okçu | ORİJİNAL mangonel |
| :-- | :-- | --: | --: | --: | --: | --: | --: | --: | --: |
| C1 | GÜNDÜZ | 830 | 500 | 120 | 60 | | | | |
| C2 | GECE | 659 | 391 | 126 | 65 | | | | |

⚠️ Onarım kurası rastgele (%50-70) → kalan yapı sayıları savaştan savaşa oynar. Orijinali
**üç kez** koş, üçünü de yaz; karşılaştırmayı kayıp sütunlarından yap.

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

**Ne arıyoruz:** D2'de orijinalin taşıdığı ganimet D1'in **%70'i mi, aynısı mı**. Aynıysa bu
turun düzeltmesi doğru. %70'iyse taşıma da çarpılıyor demektir ve düzeltme geri alınır —
ama o zaman modifier'da ÜÇÜNCÜ bir oku-çarp-yaz çifti olması gerekirdi, disassembly'de yok.

---

---

## E. İKİ MOTOR AYNI MI? — ölçüldü (2026-07-31)

`scratchpad/engine_diff.mjs` sekiz senaryoyu keşif motoru (`mobiwar-engine.js`) ve üretim
motoruyla (`@mobiwar/engine`) aynı anda koşuyor. **6/8 birebir aynı**; gece senaryolarının
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
