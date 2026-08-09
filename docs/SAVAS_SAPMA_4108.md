# Motor ↔ binary simülatör sapması — canlı savaş 4108

**Tarih:** 2026-08-09 · **Kaynak:** canlı sunucu (31.210.36.185), görev **4108**
`ahmetbatar` (şehir 27, 1:3:8) → `Eru Ilúvatar` (şehir 1, **1:1:1**), varış 11:55:33 UTC.
**Karşılaştırılan:** `packages/engine` v1.1.0 (katalog `2ec624e6`) ↔ Mobiwar Simulator **v0.5.5**.

Kardeş belge: [`SAVAS_BINARY_KONTROL.md`](SAVAS_BINARY_KONTROL.md) — orada tekil mekanikler
(kuş/sur/kalkan/tuzak) sınanmıştı ve kök neden bulunup düzeltilmişti. Bu belge **çok birimli,
gerçek ölçekli** bir savaşta kalan sapmayı konu alıyor.

---

## 1. Girdiler — canlı veritabanından

Hepsi `missions` / `mission_units` / `mission_heroes` / `units` / `defenses` / `techs` /
`buildings` / `cities` tablolarından okundu.

| | Saldıran (ahmetbatar) | Savunan (Eru Ilúvatar) |
|---|---|---|
| Cüce | 7160 | 10028 |
| Elf | 6494 | 9000 |
| Süvari | 5314 | 8000 |
| Pegasus | 5532 | 7500 |
| Ejderha | 2162 | 3000 |
| Mancınık | 2306 | 3500 |
| Ogre | 1730 | 2500 |
| Şaman | 5311 | 6000 |
| Casus Kuş | 0 | 3516 |
| Yük Arabası | 5781 | 5000 |
| Gnom | 4000 | 4000 |
| Kaos | 774 | 1000 |
| **Teknikler** | Okçuluk 18 · Demircilik 18 · Büyücülük 20 · Zırh 16 · Kimya 17 · Taş Ustalığı 16 · İçgüdü 15 · Tılsım 17 · **Gece Görüşü 14** · Casusluk 18 · Haritacılık 20 · Sömürgecilik 14 | Demircilik 2 · Casusluk 2 (gerisi 0) |
| Kahraman | 5 adet, hepsi **seviye 0**, tüm yetenekler 0 | yok |
| Savunma yapısı | — | **Sur 2** (başka hiçbir şey yok) |
| Tapınak | **31** (oyuncunun 5 şehrinin toplamı) | 0 |
| Sur bütünlüğü | — | **%100** (`wall_integrity` 0 ama onarım 07.08'de bitmiş → `wallCurrentIntegrity` 1 döndürüyor) |
| Gece savaşı | hayır (14:55 TRT, gece penceresi 00:00-08:00) | |

### 1.1 Ekran görüntüsündeki hatalı girişler

İki alan canlı veriyle uyuşmuyor:

| Alan | Ekranda | Gerçek | Etkisi |
|---|---|---|---|
| **Gece Görüşü (saldıran)** | 0 | **14** | **YOK** — savaş gündüz, Gece Görüşü yalnız gece çarpanına giriyor |
| **Tapınak** | 0 | **31** | **YOK** — Tapınak yalnız kahraman çıkma ihtimaline giriyor, XP 500 kapısı geçilse de sonuç değişmiyor |

Bunu tahmin etmedim, **ölçtüm**: her iki alanı ekrandaki değere çekip motoru tekrar koşturdum,
çıktı **bit-bit aynı** kaldı (`saldıran 29448 · savunan 60055 · xp 1090641`). Yani ekran
görüntüsündeki veri girişi bu savaş için **sonuca etkisiz**; aşağıdaki sapmaların hiçbirini
hatalı giriş açıklamıyor.

> ⚠️ Yine de düzeltmekte fayda var: başka bir senaryoyu (özellikle **gece savaşı**) ölçerken
> Gece Görüşü 0 girmek sonucu gerçekten kaydırır.

Ekrandaki *"Taş Ustalığı: -"* (saldıran) doğru — o teknik yalnız savunma yapılarını ölçekliyor.

---

## 2. Sonuçların karşılaştırması

| | Binary v0.5.5 | Motor v1.1.0 | Sapma |
|---|---|---|---|
| Kazanan | saldıran | saldıran | ✅ |
| Tur | 5 | 5 | ✅ |
| **Saldıran kayıp** | 27.065 | **29.448** | **+%8,8** |
| **Savunan kayıp** | 60.433 | **60.055** | −%0,6 |
| **Enkaz altın** | 992.468.124 | **1.058.715.270** | +%6,7 |
| **Enkaz yemek** | 958.301.979 | **1.023.401.070** | +%6,8 |
| **Deneyim (XP)** | 834.221 | **1.090.641** | **+%30,7** |
| Kahraman çıkma | %0,0 | %0,0 | ✅ |

### Birim birim

| Birim | Giren (S) | Binary kalan | Motor kalan | Fark | Giren (D) | Binary kalan | Motor kalan | Fark |
|---|---|---|---|---|---|---|---|---|
| Cüce | 7160 | 1811 | 1372 | **−439** | 10028 | 0 | 0 | — |
| Elf | 6494 | 1599 | 1160 | **−439** | 9000 | 0 | 0 | — |
| Süvari | 5314 | 753 | 498 | −255 | 8000 | 0 | 0 | — |
| Pegasus | 5532 | 1114 | 798 | −316 | 7500 | 0 | 0 | — |
| Ejderha | 2162 | 459 | 327 | −132 | 3000 | 0 | 0 | — |
| Mancınık | 2306 | 489 | 262 | −227 | 3500 | 0 | 0 | — |
| Ogre | 1730 | 366 | 266 | −100 | 2500 | 0 | 0 | — |
| Şaman | 5311 | 2785 | 2414 | −371 | 6000 | 0 | 0 | — |
| Kaos | 774 | 342 | 238 | −104 | 1000 | 0 | 0 | — |
| Gnom | 4000 | 4000 | 4000 | ✅ | 4000 | 0 | 0 | — |
| Yük Arabası | 5781 | 5781 | 5781 | ✅ | 5000 | 1533 | 1755 | **+222** |
| Casus Kuş | 0 | 0 | 0 | ✅ | 3516 | 1078 | 1234 | **+156** |

Savunanın **bütün savaşçıları iki tarafta da tamamen yok oluyor** — sapma yalnız (a) saldıranın
hayatta kalanlarında ve (b) savunanın savaş-dışı birimlerinde (yük/kuş).

### Bu rastgelelik DEĞİL

Motoru **400 farklı tohumla** koşturdum:

| | en az | %5 | orta | %95 | en çok |
|---|---|---|---|---|---|
| Saldıran kayıp | 29.411 | 29.435 | 29.475 | 29.515 | 29.537 |
| Savunan kayıp | 60.048 | 60.050 | 60.053 | 60.057 | 60.059 |
| XP | 1.088.221 | 1.089.719 | 1.092.361 | 1.094.841 | 1.096.311 |

Tüm dağılımın genişliği **±%0,2**. Binary'nin 27.065'i motorun **en iyi tohumunun bile %8,0
altında**. Sapma sistematik.

---

## 3. Sapmanın ayrıştırılması — asıl bulgu

### 3.1 Enkaz formülü BİREBİR DOĞRU

Binary'nin **kendi kalan sayılarını** motorun enkaz formülüne verdim:

| | altın | yemek |
|---|---|---|
| Motor formülü, binary'nin kalanlarıyla | 992.468.**145** | 958.302.**000** |
| Binary'nin raporladığı | 992.468.**124** | 958.301.**979** |
| Fark | **21** (%0,000002) | **21** |

21 birimlik fark yuvarlama artığı. **Enkaz formülü (`dead × ref × 0,3`, savunma yapıları hariç,
Ogre'ye 1,15^kahramanSeviyesi) doğrulanmıştır.** Enkazdaki %6,7'lik sapma tamamen savaş
sonucunun sonucudur, ayrı bir hata değildir.

### 3.2 XP ve kayıp-oranı formülleri de doğru

İkisi de `lossMag` üzerinden çalışıyor ve `lossMag` ekranda görünmüyor — ama **iki bağımsız
gözlemden geri çözülebiliyor**:

* yük arabası oranı → `frac = dLM / (dLM + aLM)`
* deneyim → `XP = (aLM + dLM) × (aLM / dLM) × 0,001`

| | frac | aLM/dLM | **dLM** (saldıran→savunan) | **aLM** (savunan→saldıran) |
|---|---|---|---|---|
| Binary | 0,6934 | 0,44217 | **1.308.207.523** | 578.448.841 |
| Motor | 0,6490 | 0,54083 | **1.308.772.307** | 707.826.009 |
| Oran | | | **1,0004** | **1,2237** |

`dLM` iki bağımsız yoldan **%0,04 içinde** aynı çıkıyor. Bu tesadüf değil: hem `frac` formülü
hem `XP` formülü binary'yle aynı olmasaydı bu tutarlılık ortaya çıkmazdı. Yani:

> ✅ **Enkaz formülü · XP formülü · kayıp-oranı (frac) formülü · saldıranın savunana verdiği
> toplam hasar — dördü de doğru.**

### 3.3 Geriye kalan TEK kök sapma

| | Binary | Motor | |
|---|---|---|---|
| Savunanın saldırana verdiği hasar (`aLM`) | 578.448.841 | 707.826.009 | motor **+%22,4** |
| Bu hasarın birim başına ölümcüllüğü (ölüm/hasar) | 4,679 ×10⁻⁵ | 4,161 ×10⁻⁵ | binary **+%12,5** |
| Net saldıran ölüsü | 27.065 | 29.448 | motor **+%8,8** |

İki etki **birbirini kısmen götürüyor** (1,2237 × 0,8893 = 1,088 ✓). Yani ortada tek bir
"katsayı hatası" yok, **iki ayrı ayar** var:

1. Motorda savunan, saldırana **%22 fazla hasar** veriyor.
2. Motorda o hasar **%12,5 daha az ölümcül** (birim başına bölücü — `applyLoss`'taki `mDef` —
   binary'dekinden büyük görünüyor).

### 3.4 Tek bir `counterK` bunu ÇÖZMÜYOR

`counterK` (savunan→saldıran kalibrasyonu, bugün **1,0**) taraması:

| counterK | saldıran kayıp | savunan kayıp | XP | yük arabası kalan |
|---|---|---|---|---|
| **1,00** (bugün) | 29.448 | 60.055 | 1.090.641 | 1755 |
| 0,95 | 27.402 | 60.232 | 963.573 | 1651 |
| 0,90 | 25.485 | 60.399 | 855.931 | 1553 |
| 0,85 | 23.677 | 60.542 | 771.556 | 1469 |
| **HEDEF (binary)** | **27.065** | **60.433** | **834.221** | **1533** |

Dört göstergenin işaret ettiği K değerleri:

| Gösterge | Gerekli K |
|---|---|
| Saldıran kayıp | **0,941** |
| Savunan kayıp | 0,888 |
| XP | 0,887 |
| Yük arabası oranı | 0,888 |

Üç gösterge **0,888**'de birleşiyor, saldıranın kendi ölü sayısı **0,941** istiyor. Tek bir
çarpan ikisini birden sağlayamaz — bu, §3.3'teki iki ayrı etkinin sayısal ispatı.

> ⛔ **`counterK`'yı 0,89'a çekerek "düzeltmeyin".** XP, enkaz ve yük arabası oranı tutar ama
> saldıran kaybı bu sefer **%6 eksik** kalır. Doğru düzeltme, hasar dağıtımındaki bölücüyü
> (birim başına `mDef`) binary'yle eşlemek; onu ölçmeden katsayı oynatmak hatayı taşımaktan
> ibarettir.

---

## 4. Binary simülatörde koşulacak senaryolar

Amaç: §3.3'teki iki etkiyi **ayrı ayrı** ölçmek. Aşağıdaki tablonun "Motor" sütunları
`packages/engine` v1.1.0 çıktısıdır; aynı girdileri binary'ye girip **Kalan Asker** sütunlarını
ve Sonuç kutusunu yanına yaz.

### Ortak kurallar (hepsinde)

* Kahraman **Adet 0** (iki tarafta da) · **Gece Savaşı mı? KAPALI**
* Tapınak 0 · Gece Görüşü 0 · **belirtilmeyen bütün teknikler 0** (iki tarafta da)
* Savunma bölümünün tamamı 0 (E grubu hariç)
* Tabloda geçmeyen birim = 0

> ℹ️ Binary'nin kendi rastgeleliği var. **%1'in altındaki farkları sapma sayma**; motorun
> tohum dağılımı da ±%0,2. Binary'de her senaryoyu **3 kez** koşup aralığı not et.

### A · Saf takas oranı (Cüce)

| # | Saldıran | Savunan | Motor: kazanan/tur | Motor: S kalan | Motor: D kalan | Motor XP | Motor enkaz altın |
|---|---|---|---|---|---|---|---|
| A1 | Cüce 1000 | Cüce 1000 | saldıran / 5 | **373** | **372** | 228 | 75.300 |
| A2 | Cüce 1200 | Cüce 1000 | saldıran / 5 | **673** | **147** | 155 | 82.800 |
| A3 | Cüce 1500 | Cüce 1000 | saldıran / 5 | **1122** | **0** | 95 | 82.680 |
| A4 | Cüce 2000 | Cüce 1000 | saldıran / 4 | **1728** | **0** | 63 | 76.320 |

**A2 en değerli satır** — iki taraf da kanıyor, sapma en okunur burada.

### B · Aynı şekil, farklı `mDef` — §3.3'ün 2. etkisini yalıtır

| # | Saldıran | Savunan | Motor: kazanan/tur | Motor: S kalan | Motor: D kalan | Motor XP |
|---|---|---|---|---|---|---|
| B1 | Süvari 1000 (mDef 845) | Süvari 1000 | saldıran / 5 | **325** | **324** | 1.139 |
| B2 | Süvari 1200 | Süvari 1000 | saldıran / 5 | **631** | **84** | 779 |
| B3 | Ejderha 1200 (mDef 13.000) | Ejderha 1000 | saldıran / 5 | **715** | **0** | 9.368 |
| B4 | Şaman 1200 (mDef 750) | Şaman 1000 | **savunan** / 5 | **1200** (kayıpsız) | **1000** (kayıpsız) | 0 |

⚠️ **B4 bir "negatif kontrol"**: motorda Şaman-Şaman savaşında **hiç kimse ölmüyor**. Binary de
öyle diyorsa Şaman'ın vuruş yolu doğru; demiyorsa sapmanın bir parçası oradadır.

A2 ↔ B2 ↔ B3 karşılaştırması doğrudan "hasar başına ölüm" bölücüsünü verir: aynı 1,2× oranda
farklı `mDef`li birimlerin hayatta kalma yüzdeleri.

### C · Teknik merdiveni — yalnız SALDIRANDA

| # | Saldıran | Savunan | Motor: kazanan/tur | Motor: S kalan | Motor: D kalan | Motor XP |
|---|---|---|---|---|---|---|
| C1 | Cüce 1200, teknik yok | Cüce 1000 | saldıran / 5 | **673** | **147** | 155 |
| C2 | Cüce 1200, **Zırh 10** | Cüce 1000 | saldıran / 5 | **771** | **113** | 116 |
| C3 | Cüce 1200, **Zırh 20** | Cüce 1000 | saldıran / 5 | **874** | **78** | 80 |
| C4 | Cüce 1200, **Demircilik 10** | Cüce 1000 | saldıran / 5 | **826** | **0** | 94 |
| C5 | Cüce 1200, **Demircilik 20** | Cüce 1000 | saldıran / 4 | **891** | **0** | 74 |
| C6 | Cüce 1200, **Tılsım 20** | Cüce 1000 | saldıran / 5 | **673** | **147** | 155 |

⚠️ **C6 ikinci negatif kontrol**: motorda Tılsım'ın bu savaşa **hiç etkisi yok** (C1 ile birebir
aynı). Binary'de fark çıkarsa Tılsım'ın uygulanma yeri yanlış demektir.

Gerçek savaşta saldıranın Zırh 16 / Demircilik 18 taşıdığı düşünülürse, C merdiveninde çıkacak
bir eğim farkı §3.3'ün 1. etkisini tek başına açıklayabilir.

### D · Teknik SAVUNANDA — karşı yönün ölçeklenmesi

| # | Saldıran | Savunan | Motor: kazanan/tur | Motor: S kalan | Motor: D kalan | Motor XP |
|---|---|---|---|---|---|---|
| D1 | Cüce 1200 | Cüce 1000, **Zırh 10** | saldıran / 5 | **646** | **217** | 172 |
| D2 | Cüce 1200 | Cüce 1000, **Demircilik 10** | **savunan** / 5 | **289** | **297** | 227 |

### E · Sur

| # | Saldıran | Savunan | Motor: kazanan/tur | Motor: S kalan | Motor: D kalan | Motor: sur |
|---|---|---|---|---|---|---|
| E1 | Cüce 1500 | Cüce 1000 + **Sur 2** | saldıran / 5 | **1089** | **0** | %0,0 |
| E2 | Cüce 1500 | Cüce 1000 + **Sur 5** | saldıran / 5 | **952** | **163** | %0,0 |

### F · Kayıp-oranı (frac) sondası

| # | Saldıran | Savunan | Motor: kazanan/tur | Motor: S kalan | Motor: D kalan |
|---|---|---|---|---|---|
| F1 | Cüce 1500 | Cüce 1000 + Yük Arabası 1000 + Casus Kuş 1000 | saldıran / 5 | **1122** | Cüce **0** · Yük **274** · Kuş **274** |
| F2 | Cüce 1200 | Cüce 1000 + Yük Arabası 1000 + Casus Kuş 1000 | saldıran / 5 | **673** | Cüce **147** · Yük **382** · Kuş **382** |

§3.2'de frac formülünün doğru olduğu dolaylı olarak gösterildi; F **doğrudan** ölçüyor.

### G · Gerçek savaşın 1/10 ölçeği

Saldıran: Cüce 716 · Elf 649 · Süvari 531 · Pegasus 553 · Ejderha 216 · Mancınık 231 ·
Ogre 173 · Şaman 531 · Yük Arabası 578 · Gnom 400 · Kaos 77 — **teknik yok**
Savunan: Cüce 1003 · Elf 900 · Süvari 800 · Pegasus 750 · Ejderha 300 · Mancınık 350 ·
Ogre 250 · Şaman 600 · Casus Kuş 352 · Yük Arabası 500 · Gnom 400 · Kaos 100 · **Sur 2**

Motor: **savunan kazanır / 5 tur** — saldıranın bütün savaşçıları ölüyor
(Yük Arabası 578→188, Gnom 400→400), savunanda Cüce 1003→496 · Elf 900→436 · Süvari 800→305 ·
Pegasus 750→330 · Ejderha 300→135 · Mancınık 350→160 · Ogre 250→114 · Şaman 600→425 ·
Casus Kuş 352→352 · Yük Arabası 500→500 · Gnom 400→0 · Kaos 100→65. XP 71.814,
enkaz 78.020.895 altın.

⚠️ Ölçek küçülünce **kazanan değişiyor** (gerçek savaşta saldıran kazanıyordu). Bu tek başına
bir hata değil — savaş doğrusal ölçeklenmiyor — ama binary'de de kazananın değişmesi bekleniyor.
Değişmiyorsa ölçek davranışı da ayrışıyor demektir ve bu, aradığımız bölücü farkının güçlü bir
işareti olur.

---

## 5. Sonuçlar nasıl kaydedilecek

Her senaryo için binary'nin **Kalan Asker** sütunlarını ve Sonuç kutusundaki dört satırı
(kayıplar · tur · enkaz · XP) bu belgeye ekle. Öncelik sırası:

1. **A2** — tek satırla sapmanın var olup olmadığını söyler
2. **B2 + B3** — bölücü (`mDef`) hipotezini doğrular ya da çürütür
3. **C2/C3** — teknik ölçeklemesinin eğimini verir
4. **B4 + C6** — negatif kontroller; bunlarda fark çıkarsa arama alanı tamamen değişir

Bu dördü elde olduğunda motordaki düzeltme **ölçüye dayalı** yapılabilir; `counterK` gibi bir
katsayıyı el yordamıyla oynatmaya gerek kalmaz.

---

## Ek · Üretim komutları

Senaryo tablosunu yeniden üretmek için (motor sürümü değişirse):

```
cd mw/apps/api && node scripts/sapma/senaryolar.mjs
```

| Betik | Ne yapar |
|---|---|
| `scripts/sapma/sim4108.mjs` | Canlı savaşı motorla çözer (girdiler gömülü) |
| `scripts/sapma/seedspread.mjs` | 400 tohumla dağılımı ölçer — "bu rastgelelik mi?" sorusunu kapatır |
| `scripts/sapma/decomp.mjs` | `frac` + XP'den `aLM`/`dLM`'i geri çözer (§3.2-3.3) |
| `scripts/sapma/sweep.mjs` | `counterK` taraması + girdi duyarlılığı (§1.1, §3.4) |
| `scripts/sapma/senaryolar.mjs` | §4 tablosunu üretir |
