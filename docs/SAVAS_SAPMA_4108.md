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

Amaç: §3.3'teki iki etkiyi **ayrı ayrı** ölçmek.

> ### 📝 Nasıl doldurulur
>
> Her tabloda **⬜ ile başlayan sütunlar boştur — onları sen dolduracaksın.** Yanlarındaki
> sütun motorun aynı senaryodaki çıktısıdır; doğrudan yan yana karşılaştırılabilsinler diye
> bitişik duruyorlar.
>
> Binary'nin kendi rastgeleliği var, bu yüzden **her senaryoyu 3 kez koş**. Sayılar
> oynuyorsa hücreye aralık yaz (`1809-1815`), oynamıyorsa tek sayı yeter.
> **%1'in altındaki farkları sapma sayma** — motorun tohum dağılımı da ±%0,2.
>
> Kazanan/tur hücresine `saldıran / 5` biçiminde yaz. Kayıp ve XP değerleri binary'nin
> **Sonuç** kutusundan, kalan sayıları **Kalan Asker** sütunundan okunur.

### Ortak kurallar (bütün senaryolarda)

* Kahraman **Adet 0** (iki tarafta da) · **Gece Savaşı mı? KAPALI**
* Tapınak 0 · Gece Görüşü 0 · **belirtilmeyen bütün teknikler 0** (iki tarafta da)
* Savunma bölümünün tamamı 0 (E grubu hariç)
* Tabloda geçmeyen birim = 0

---

### A · Saf takas oranı (Cüce)

| # | Saldıran | Savunan | Kazanan/tur | ⬜ BINARY kazanan/tur | S kalan | ⬜ BINARY S kalan | D kalan | ⬜ BINARY D kalan | XP | ⬜ BINARY XP | Enkaz altın | ⬜ BINARY enkaz altın |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A2** ⭐ | Cüce 1200 | Cüce 1000 | saldıran / 5 |saldıran / 5  | **673** |672-674  | **147** |147-149  | 155 |155  | 82.800 |82.738  |
| A1 | Cüce 1000 | Cüce 1000 | saldıran / 5 |bazen saldıran bazen savunan/ 5  | **373** |373-374  | **372** |373-374  | 228 |228  | 75.300 |75.178  |
| A3 | Cüce 1500 | Cüce 1000 | saldıran / 5 | saldıran / 5  | **1122** |1121-1123  | **0** |0  | 95 |94-95  | 82.680 |82.678  |
| A4 | Cüce 2000 | Cüce 1000 | saldıran / 4 |saldıran / 4  | **1728** |1728-1729  | **0** |0  | 63 | 62-63 | 76.320 |76.318  |

⭐ **A2 en değerli satır** — iki taraf da kanıyor, sapma en okunur burada. Önce bunu koş.

---

### B · Aynı şekil, farklı `mDef` — §3.3'ün 2. etkisini (ölümcüllük bölücüsü) yalıtır

| # | Saldıran | Savunan | Kazanan/tur | ⬜ BINARY kazanan/tur | S kalan | ⬜ BINARY S kalan | D kalan | ⬜ BINARY D kalan | XP | ⬜ BINARY XP | Enkaz altın | ⬜ BINARY enkaz altın |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **B2** ⭐ | Süvari 1200 | Süvari 1000 | saldıran / 5 |saldıran / 5  | **631** |630-632  | **84** |84-86  | 779 |778-782  | 534.600 |533.878  |
| **B3** ⭐ | Ejderha 1200 | Ejderha 1000 | saldıran / 5 |saldıran / 5  | **715** |714-715  | **0** | 0 | 9.368 |9363-9403  | 20.047.500 |20.047.498  |
| B1 | Süvari 1000 | Süvari 1000 | saldıran / 5 |bazen saldıran bazen savunan / 5  | **325** |325-327  | **324** |325-327  | 1.139 |1138-1140  | 486.360 |485.278  |
| **B4** ⚠️ | Şaman 1200 | Şaman 1000 | **savunan** / 5 |savunan / 5  | **1200** (kayıpsız) |1200  | **1000** (kayıpsız) |1000  | 0 |0  | 0 |0  |

`mDef` değerleri: Cüce **182** · Şaman **750** · Süvari **845** · Ejderha **13.000**.
A2 ↔ B2 ↔ B3 üçlüsü aynı 1,2× oranda dört kat büyüyen bir bölücüyü tarıyor; hayatta kalma
yüzdelerinin nasıl değiştiği doğrudan "hasar başına ölüm" ilişkisini verir.

⚠️ **B4 = NEGATİF KONTROL.** Motorda Şaman-Şaman savaşında **hiç kimse ölmüyor**. Binary de
"iki taraf da 0 kaybetti" diyorsa Şaman'ın vuruş yolu doğru; **kayıp veriyorsa** sapmanın bir
parçası orada ve arama alanı değişir.

---

### C · Teknik merdiveni — yalnız SALDIRANDA (savunanın teknikleri 0)

| # | Saldıran | Savunan | Kazanan/tur | ⬜ BINARY kazanan/tur | S kalan | ⬜ BINARY S kalan | D kalan | ⬜ BINARY D kalan | XP | ⬜ BINARY XP | Enkaz altın | ⬜ BINARY enkaz altın |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | Cüce 1200, teknik yok | Cüce 1000 | saldıran / 5 |saldıran / 5  | **673** |672-674  | **147** |147-149  | 155 |155  | 82.800 |82.678  |
| **C2** ⭐ | Cüce 1200, **Zırh 10** | Cüce 1000 | saldıran / 5 |saldıran / 5  | **771** |770-772  | **113** |113-115  | 116 |115-116  | 78.960 |78.838  |
| **C3** ⭐ | Cüce 1200, **Zırh 20** | Cüce 1000 | saldıran / 5 |saldıran / 5  | **874** |874-876  | **78** |78-80  | 80 |79-80  | 74.880 |74.758  |
| C4 | Cüce 1200, **Demircilik 10** | Cüce 1000 | saldıran / 5 |saldıran / 5  | **826** |825-826  | **0** |0  | 94 |93  | 82.440 |82.438  |
| C5 | Cüce 1200, **Demircilik 20** | Cüce 1000 | saldıran / 4 |saldıran / 4  | **891** |890-891  | **0** |0  | 74 |73  | 78.540 | 78.538 |
| **C6** ⚠️ | Cüce 1200, **Tılsım 20** | Cüce 1000 | saldıran / 5 | saldıran / 5 | **673** |672-674  | **147** |147-149  | 155 |155  | 82.800 |82.738  |

C1 tam olarak A2'nin aynısıdır — merdivenin sıfır basamağı olarak burada da duruyor.

⚠️ **C6 = İKİNCİ NEGATİF KONTROL.** Motorda Tılsım'ın bu savaşa **hiç etkisi yok**: C6 satırı
C1 ile bit-bit aynı. Binary'de C6 ≠ C1 çıkarsa Tılsım'ın uygulanma yeri yanlış demektir.

Gerçek savaşta saldıran Zırh 16 / Demircilik 18 taşıyordu; C merdivenindeki bir eğim farkı
§3.3'ün 1. etkisini (savunanın verdiği %22 fazla hasar) tek başına açıklayabilir.

---

### D · Teknik SAVUNANDA — karşı yönün ölçeklenmesi

| # | Saldıran | Savunan | Kazanan/tur | ⬜ BINARY kazanan/tur | S kalan | ⬜ BINARY S kalan | D kalan | ⬜ BINARY D kalan | XP | ⬜ BINARY XP | Enkaz altın | ⬜ BINARY enkaz altın |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D1 | Cüce 1200 | Cüce 1000, **Zırh 10** | saldıran / 5 |saldıran / 5  | **646** |645-647  | **217** |217-219  | 172 |172  | 80.220 |80.158  |
| D2 | Cüce 1200 | Cüce 1000, **Demircilik 10** | **savunan** / 5 |savunan / 5  | **289** |288-290  | **297** |297-299  | 227 |226-229  | 96.840 |96.718  |

D2'de kazanan taraf değişiyor — binary'de değişmiyorsa bu tek başına güçlü bir işaret.

---

### E · Sur

| # | Saldıran | Savunan | Kazanan/tur | ⬜ BINARY kazanan/tur | S kalan | ⬜ BINARY S kalan | D kalan | ⬜ BINARY D kalan | Sur % | ⬜ BINARY sur % | XP | ⬜ BINARY XP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | Cüce 1500 | Cüce 1000 + **Sur 2** | saldıran / 5 |saldıran / 5  | **1089** |1088-1090  | **0** |0  | %0,0 |%0,0  | 105 |105  |
| E2 | Cüce 1500 | Cüce 1000 + **Sur 5** | saldıran / 5 |saldıran / 5  | **952** |951-953  | **163** |163-165  | %0,0 |%0,0  | 165 |164-165  |

Kıyas için sursuz hâli **A3**'tür (aynı 1500 vs 1000): motorda S kalan 1122. Sur 2 onu 1089'a,
Sur 5 ise 952'ye düşürüyor.

---

### F · Kayıp-oranı (frac) sondası — yük arabası + casus kuş

| # | Saldıran | Savunan | Kazanan/tur | ⬜ BINARY kazanan/tur | S kalan | ⬜ BINARY S kalan | D Cüce | ⬜ BINARY D Cüce | D Yük | ⬜ BINARY D Yük | D Kuş | ⬜ BINARY D Kuş |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Cüce 1500 | Cüce 1000 + Yük 1000 + Kuş 1000 | saldıran / 5 |saldıran / 5  | **1122** |1122-1123  | **0** |0  | **274** |274-275  | **274** |274-275  |
| F2 | Cüce 1200 | Cüce 1000 + Yük 1000 + Kuş 1000 | saldıran / 5 |saldıran / 5  | **673** |672-674  | **147** |147-149  | **382** |382-383  | **382** |382-383  |

§3.2'de frac formülünün doğruluğu **dolaylı** olarak gösterildi (XP ile çapraz kontrol);
F onu **doğrudan** ölçüyor. Motorda yük ile kuş **aynı** oranı alıyor — binary'de ikisi
ayrışıyorsa bu ayrı bir bulgudur.

---

### G · Gerçek savaşın 1/10 ölçeği

**Saldıran** (teknik yok): Cüce 716 · Elf 649 · Süvari 531 · Pegasus 553 · Ejderha 216 ·
Mancınık 231 · Ogre 173 · Şaman 531 · Yük Arabası 578 · Gnom 400 · Kaos 77
**Savunan** (teknik yok): Cüce 1003 · Elf 900 · Süvari 800 · Pegasus 750 · Ejderha 300 ·
Mancınık 350 · Ogre 250 · Şaman 600 · Casus Kuş 352 · Yük Arabası 500 · Gnom 400 · Kaos 100 ·
**Sur 2**

| Birim | Giren (S) | S kalan · motor | ⬜ BINARY S kalan | Giren (D) | D kalan · motor | ⬜ BINARY D kalan |
|---|---|---|---|---|---|---|
| Cüce | 716 | **0** | 0 | 1003 | **496** | 496-497 |
| Elf | 649 | **0** |0  | 900 | **436** | 437-438 |
| Süvari | 531 | **0** |0  | 800 | **305** |306-307  |
| Pegasus | 553 | **0** | 0 | 750 | **330** |331-332  |
| Ejderha | 216 | **0** |  0| 300 | **135** |136  |
| Mancınık | 231 | **0** |0  | 350 | **160** |160-161  |
| Ogre | 173 | **0** |  | 250 | **114** |114  |
| Şaman | 531 | **0** | 0 | 600 | **425** |  |
| Casus Kuş | 0 | 0 | 0 | 352 | **352** |352  |
| Yük Arabası | 578 | **188** |189  | 500 | **500** |500  |
| Gnom | 400 | **400** |400  | 400 | **0** |  0|
| Kaos | 77 | **0** | 0 | 100 | **65** | 65 |

| Sonuç | motor | ⬜ BINARY |
|---|---|---|
| Kazanan | **savunan** | savunan |
| Tur | 5 | 5 |
| Saldıran kayıp | 4.067 |4066  |
| Savunan kayıp | 2.987 | 2977-2982 |
| XP | 71.814 |  |
| Enkaz altın | 78.020.895 |78.000.760  |
| Enkaz yemek | 75.256.140 |75.244.690  |
| Sur % | %0,0 |  |

⚠️ Ölçek küçülünce **kazanan değişiyor** (gerçek savaşta saldıran kazanıyordu). Bu tek başına
bir hata değil — savaş doğrusal ölçeklenmiyor — ama binary'de de değişmesi bekleniyor.
Değişmiyorsa ölçek davranışı da ayrışıyor demektir ve bu, aradığımız bölücü farkının güçlü bir
işareti olur.

---

## 5. Öncelik ve sonrası

Hepsini birden koşmana gerek yok. Sıra:

| Sıra | Senaryo | Ne söyler | ⬜ Koşuldu mu |
|---|---|---|---|
| 1 | **A2** | Sapma tek birimli sade bir savaşta da var mı? | koşuldu|
| 2 | **B2 + B3** | Sapma `mDef` büyüdükçe değişiyor mu? (bölücü hipotezi) |koşuldu |
| 3 | **C2 + C3** | Teknik ölçeklemesinin eğimi tutuyor mu? |koşuldu |
| 4 | **B4 + C6** | Negatif kontroller — burada fark çıkarsa arama alanı tamamen değişir |koşuldu |

Bu dördü elde olduğunda motordaki düzeltme **ölçüye dayalı** yapılabilir; `counterK` gibi bir
katsayıyı el yordamıyla oynatmaya gerek kalmaz (§3.4'teki tuzağa da düşülmez).

> ✅ **Bu tur tamamlandı — 21/21 tuttu.** Sonuç ve kapsam analizi için §6-§8'e bak.

---

## 6. 1. turun sonucu — 21/21 TUTTU

Kullanıcı 2026-08-09'da §4'teki bütün senaryoları binary'de koştu. **Hiçbirinde sapma yok**;
farkların tamamı %0,2'nin altında ve binary'nin kendi tur-içi rastgeleliğiyle açıklanıyor
(A1 ve B1'de kazanan bile koşudan koşuya değişiyor — motor da o iki savaşı kıl payı çözüyor).

Bu, tek başına büyük bir sonuç: **motorun çekirdeği doğru.** Takas oranı, `mDef` bölücüsü,
tur sayısı, sur, kayıp-oranı, enkaz, XP — hepsi binary'yle örtüşüyor. Üstelik **G** (12 birim
tipi + Sur 2 + Kaos + Casus Kuş, gerçek savaşın 1/10'u) da tuttu: saldıran kaybı 4.067 ↔ 4.066.

Ama gerçek savaşta sapma duruyor. Yani **senaryolar bir kör nokta bırakmış.** Aşağısı onun
tespiti.

---

## 7. Neden yetersiz kaldı — kapsam analizi

### 7.1 Saldıranın kaybının %90'ını TEK bir birim taşıyor: Kaos

`lossMag`i birim birim yeniden kurdum (ölü × `mDef`) ve §3.2'de `frac`+XP'den geri çözülen
değerle karşılaştırdım:

| Birim | mDef | BINARY payı | MOTOR payı | BINARY % | MOTOR % |
|---|---|---|---|---|---|
| **Kaos** | 1.200.000 | 518.400.000 | 643.200.000 | **%89,7** | **%90,9** |
| Ejderha | 13.000 | 22.139.000 | 23.855.000 | %3,8 | %3,4 |
| Ogre | 12.000 | 16.368.000 | 17.568.000 | %2,8 | %2,5 |
| Mancınık | 4.160 | 7.558.720 | 8.503.040 | %1,3 | %1,2 |
| Pegasus | 1.300 | 5.743.400 | 6.154.200 | %1,0 | %0,9 |
| Süvari | 845 | 3.854.045 | 4.069.520 | %0,7 | %0,6 |
| Şaman | 750 | 1.894.500 | 2.172.750 | %0,3 | %0,3 |
| Elf | 234 | 1.145.430 | 1.248.156 | %0,2 | %0,2 |
| Cüce | 182 | 973.518 | 1.053.416 | %0,2 | %0,1 |
| **Toplam** | | **578.076.613** | **707.824.082** | | |
| §3.2'den geri çözülen | | 578.448.841 | 707.826.009 | | |
| Fark | | **%0,06** | **%0,0003** | | |

İki bağımsız yoldan hesaplanan `lossMag` %0,06 içinde örtüşüyor — model doğru. Ve tablo şunu
söylüyor: **savaşın kaderini Kaos yazıyor.** Diğer sekiz birimin toplamı %10 bile etmiyor.

**Kaos 1. turda hiç izole edilmedi.** Tek göründüğü yer G'ydi — orada da **77 adet** ve
**hiç teknik yok**.

### 7.2 Kaos'a dokunan tek iki teknik, hiç sınanmayan iki teknik

Katalog (`packages/catalog/src/techs.ts`) teknikleri şöyle dağıtıyor:

| Teknik | Etkilediği stat | Etkilediği savaşçılar |
|---|---|---|
| Okçuluk | atk (→Can) | Elf · Pegasus |
| Demircilik | atk | Cüce · Süvari · **Ogre** · Gnom |
| Kimya | atk | Mancınık |
| **İçgüdü** | atk | Ejderha · **Ogre** · **KAOS** |
| **Büyücülük** | matk (→Büyü Canı) | Şaman · Pegasus · Ejderha · **KAOS** |
| Zırh | pmit | Kaos HARİÇ tüm savaşçılar |
| Tılsım | mmit | Kaos ve Mancınık HARİÇ |

**Kaos'a dokunan tek iki teknik İçgüdü ve Büyücülük.** Zırh ve Tılsım Kaos'a hiç değmiyor.

Gerçek savaşta saldıranın **Büyücülük 20** ve **İçgüdü 15**'i var. 1. turda ikisi de
**hiç sınanmadı**.

### 7.3 Sınanan üç teknik, kaldıracı en düşük üç teknikti

Gerçek savaşta tekniği tek tek sıfırlayıp saldıranın kaybındaki değişimi ölçtüm:

| Teknik | 0'lanınca saldıran kaybı | Kaldıraç | 1. turda sınandı mı? |
|---|---|---|---|
| **Büyücülük 20** | 40.240 | **+10.792** | ✘ **hiç** |
| **İçgüdü 15** | 32.755 | **+3.307** | ✘ **hiç** |
| Tılsım 17 | 30.418 | +970 | ⚠️ C6 — aşağıya bak |
| Zırh 16 | 30.265 | +817 | ✔ C2/C3 |
| Demircilik 18 | 29.578 | +130 | ✔ C4/C5 |
| Okçuluk 18 | 29.448 | 0 | ✘ hiç |
| Kimya 17 | 29.448 | 0 | ✘ hiç |

⚠️ **C6 bir "boş test"ti.** Tılsım'ı **Cüce** üzerinde sınadım ve motorda etkisi tam olarak
sıfırdı (C6 = C1). Yani C6 **başarısız olamazdı** — Tılsım'ın doğru uygulanıp uygulanmadığı
hakkında hiçbir şey söylemiyor. Aynı sorun B4/I1'de de var: Şaman-Şaman savaşında Büyücülük
verilse bile kimse ölmüyor, yani o da Büyücülük'ü sınayamıyor.

Sonuç: **1. tur, en yüksek kaldıraçlı iki tekniği atlayıp en düşük kaldıraçlı üçünü sınadı** —
ve bunları **Cüce** üzerinde sınadı, oysa Cüce savaşın %0,1'ini taşıyor.

### 7.4 G neden tuttu?

G'nin **hiç tekniği yoktu**. Yani Kaos'un **ham** statlarını sınadı — onlar doğru. Kaos'un
**teknikle ölçeklenmiş** hâlini hiç sınamadı. Sapma tam olarak orada yaşıyor gibi görünüyor.

Bunun büyüklüğü de ölçülebiliyor: saldıranın tekniklerini komple kaldırınca motorda kayıp
29.448 → **40.674** oluyor. Yani **teknikler savaşın %28'ini belirliyor** ve bu %28'lik
yüzeyin tamamı 1. turda sınanmadan kaldı.

### 7.5 Elenen şüpheliler

| Şüpheli | Durum |
|---|---|
| Kahraman (5 adet, sv 0) | ✅ **elendi** — motorda kaldırınca kayıp 29.448 → 29.449 (1 birim) |
| Sur | ✅ elendi — E1/E2 tuttu |
| Casus Kuş / Yük Arabası oranı | ✅ elendi — F1/F2 tuttu |
| Enkaz · XP · `frac` formülleri | ✅ elendi — §3.1/§3.2 + A-G |
| Ham `mDef` bölücüsü | ✅ elendi — B2/B3 tuttu (Süvari 845, Ejderha 13.000) |
| Çok tipli ordu | ✅ elendi — G tuttu |
| Ölçek (×10) | ⚠️ hâlâ açık ama zayıf — G ile gerçek arasında teknik farkı da var |
| **Büyücülük / İçgüdü ölçeklemesi** | ⛔ **ana şüpheli** |
| **Kaos'un teknikle ölçeklenmesi** | ⛔ **ana şüpheli** |
| Ogre'nin çift tekniği (topla/çarp) | ⛔ ikincil şüpheli — oyundaki tek çift-teknik birimi |

### 7.6 Yön tutarlı mı? Evet

Motor saldıranı **fazla** öldürüyor. Eğer binary'nin Büyücülük/İçgüdü ölçeklemesi motorunkinden
**güçlüyse**, binary'de saldıran daha az ölür — gözlenen yön tam olarak bu.

Doğrulama sondası: motorda Büyücülük'ü yükseltince binary'nin sayılarına yaklaşılıyor.

| Büyücülük | Saldıran kayıp | Kaos kalan | XP |
|---|---|---|---|
| **20** (gerçek) | 29.448 | 238 | 1.090.641 |
| 24 | 27.262 | 294 | 944.477 |
| 28 | 25.600 | 329 | 857.506 |
| 30 | 24.742 | **346** | **815.198** |
| **HEDEF (binary)** | **27.065** | **342** | **834.221** |

Kaos'un kalanı ve XP **Büyücülük ≈ 30**'da oturuyor (motorun oranı %5/seviye → %7,5/seviye
gibi davranıyor), ama saldıranın toplam kaybı orada %9 eksik kalıyor. Yani **tek bir oran
düzeltmesi de yetmiyor** — tıpkı §3.4'teki `counterK` gibi. Bu yüzden aşağıdaki senaryolar
Büyücülük'ü **izole** ölçüyor; oranı savaşın içinden tahmin etmeye çalışmıyoruz.

---

## 8. 2. tur senaryoları

Yine **⬜ sütunları boş** — binary sonuçlarını oraya yaz. Ortak kurallar §4'tekiyle aynı
(kahraman 0, gece kapalı, belirtilmeyen teknikler 0, savunma yapısı yok).

### Öncelik

| Sıra | Senaryo | Neden |
|---|---|---|
| **1** | **M1** | G'ye **yalnız Büyücülük 20** ekler. G tuttuğu için, M1 sapıyorsa sebep tek bir değişkende sabitlenmiş olur. |
| **2** | **H1 → H2** | Kaos'u izole eder: önce tekniksiz (taban), sonra Büyücülük 20 ile. Sapma H1'de mi H2'de mi doğuyor? |
| **3** | **K4** | Ogre'nin iki tekniği aynı stata biniyor — motor **topluyor**. Binary çarpıyorsa burada patlar. |
| **4** | H3 · J1 · J2 | İçgüdü'yü Kaos ve Ejderha üzerinde ayrı ayrı ölçer. |

### H · KAOS izole — savaşın %90'ını taşıyan birim

| # | Saldıran | Saldıran teknik | Savunan | Kazanan/tur | ⬜ BINARY | S kalan | ⬜ BINARY | D kalan | ⬜ BINARY | XP | ⬜ BINARY | Enkaz altın | ⬜ BINARY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **H1** ⭐ | Kaos 1200 | yok | Kaos 1000 | saldıran / 5 |saldıran / 5   | **636** |635-637  | **0** |0  | 1.059.335 |1.057.543-1.061.821  | 938.400.000 |938.999.998  |
| **H2** ⭐ | Kaos 1200 | **Büyücülük 20** | Kaos 1000 | saldıran / **3** |saldıran / 3  | **870** | 869-871 | **0** |0  | 527.426 |526.421-528.695  | 798.000.000 |797.999.998  |
| H3 | Kaos 1200 | **İçgüdü 15** | Kaos 1000 | saldıran / 4 |saldıran / 4  | **708** |707-709  | **0** | 0 | 881.850 |880.291-883.520  | 895.200.000 |895.799.998  |
| H4 | Kaos 1200 | Büyücülük 20 + İçgüdü 15 | Kaos 1000 | saldıran / 3 | saldıran / 3 | **870** |869-871  | **0** |0  | 527.426 |527.227-528.477  | 798.000.000 |797.999.998  |

⚠️ Motorda **H4 = H2**: Büyücülük varken İçgüdü'nün hiç etkisi kalmıyor (savaş büyü fazında
bitiyor). Binary'de H4 ≠ H2 çıkarsa bu tek başına önemli bir bulgudur.

### J · EJDERHA — B3 tekniksizdi, teknikle tekrar

| # | Saldıran | Saldıran teknik | Savunan | Kazanan/tur | ⬜ BINARY | S kalan | ⬜ BINARY | D kalan | ⬜ BINARY | XP | ⬜ BINARY |
|---|---|---|---|---|---|---|---|---|---|---|---|
| J1 | Ejderha 1200 | **Büyücülük 20** | Ejderha 1000 | saldıran / **3** | saldıran / 3 | **872** |  872-873| **0** | 0 | 5.671 |  5657-5672|
| J2 | Ejderha 1200 | **İçgüdü 15** | Ejderha 1000 | saldıran / 4 | saldıran / 4 | **829** | 829-830 | **0** | 0 | 6.613 | 6600-6623 |

(Kıyas: B3 tekniksiz → S kalan **715**, 5 tur.)

### K · OGRE — oyundaki TEK çift-teknik birimi (Demircilik + İçgüdü, ikisi de `atk`)

| # | Saldıran | Saldıran teknik | Savunan | Kazanan/tur | ⬜ BINARY | S kalan | ⬜ BINARY | D kalan | ⬜ BINARY | XP | ⬜ BINARY |
|---|---|---|---|---|---|---|---|---|---|---|---|
| K1 | Ogre 1200 | yok | Ogre 1000 | saldıran / 5 | saldıran / 5 | **809** | 809-811 | **361** | 359-361 | 7.554 |7530-7565 |
| K2 | Ogre 1200 | **Demircilik 18** | Ogre 1000 | saldıran / 5 | saldıran / 5 | **961** | 809-811 | **0** | 359-361 | 3.557 | 7526-7562 |
| K3 | Ogre 1200 | **İçgüdü 15** | Ogre 1000 | saldıran / 5 | saldıran / 5 | **950** | 950-951 | **0** | 0 | 3.758 | 3752-3762 |
| **K4** ⭐ | Ogre 1200 | **Demircilik 18 + İçgüdü 15** | Ogre 1000 | saldıran / **4** | saldıran / 5 | **1017** | 950-951 | **0** | 0 | 2.597 | 3750-3767 |

⭐ **K4 = TOPLAMA/ÇARPMA AYIRICISI.** Motor bonusları **topluyor**: `1 + 18×0,05 + 15×0,05 =
2,65`. Binary çarpıyorsa `1,90 × 1,75 = 3,325` olur ve K4'te Ogre çok daha az ölür (K2/K3'ten
beklenenden fazla iyi). K1-K2-K3 tutup **yalnız K4 sapıyorsa** cevap kesindir.

### L · Hiç sınanmamış iki teknik (gerçek savaşta kaldıraçları sıfır ama tamlık için)

| # | Saldıran | Saldıran teknik | Savunan | Kazanan/tur | ⬜ BINARY | S kalan | ⬜ BINARY | D kalan | ⬜ BINARY |
|---|---|---|---|---|---|---|---|---|---|
| L1 | Pegasus 1200 | **Okçuluk 18** | Pegasus 1000 | saldıran / 3 | saldıran / 3 | **810** | 810-811 | **0** | 0 |
| L2 | Mancınık 1200 | **Kimya 17** | Mancınık 1000 | saldıran / 3 | saldıran / 3 | **853** | 852-854 | **0** |  0|

### M · G'ye tek tek değişken ekleme — sapmanın doğduğu adımı bulur

Ordular **G ile birebir aynı** (§4/G'deki listeler); değişen yalnız teknikler.

| # | Eklenen | Kazanan/tur | ⬜ BINARY | S kayıp | ⬜ BINARY | D kayıp | ⬜ BINARY | XP | ⬜ BINARY | Enkaz altın | ⬜ BINARY |
|---|---|---|---|---|---|---|---|---|---|---|---|
| G (kıyas) | — | savunan / 5 | ✅ tuttu | 4.067 | ✅ 4.066 | 2.987 | ✅ 2977-2982 | 71.814 | — | 78.020.895 | ✅ 78.000.760 |
| **M1** ⭐ | **yalnız Büyücülük 20** | **saldıran** / 5 | saldıran / 5 | **3.404** | 3397-3403 | **5.671** | 5666-5673 | 146.548 | 145.932-146.379 | 103.548.165 | 102.931.584 |
| M2 | Büyücülük 20 + İçgüdü 15 | saldıran / 5 | saldıran / 5 | **3.152** | 3144-3150 | **6.000** | 5998-6000 | 114.188 | 113.795-114.098 | 107.053.515 | 107.046.804 |
| M3 | saldıranın TÜM teknikleri | saldıran / 5 | saldıran / 5 | **2.985** | 2728-2735 | **6.003** | 6041 | 110.975 | 84.296-84.573 | 106.176.465 | 99.152.274 |
| M4 | M3 + savunana Demircilik 2 | saldıran / 5 | saldıran / 5 | **2.987** | 2728-2736 | **6.003** | 6041-6042 | 111.207 | 84.259-84.570 | 106.178.265 | 99.159.429 |
| M5 | M4 + 5 kahraman (sv 0) | saldıran / 5 |saldıran / 5  | **2.987** | 2728-2736 | **6.003** | 6041-6042 | 111.099 | 84.204-84.599 | 106.178.265 | 99.159.429 |

⭐ **M1 tek başına en değerli satır.** G ile M1 arasındaki **tek fark Büyücülük 20**; G tuttuğu
için M1 sapıyorsa sebep tek bir değişkene indirgenmiş olur. Üstelik M1'de kazanan da değişiyor
(savunan → saldıran), yani sapma varsa göze çarpar.

M3 → M4 → M5 adımları savunanın tekniğini ve kahramanları da kapsıyor; motorda üçü de neredeyse
hiçbir şeyi değiştirmiyor (2.985 → 2.987 → 2.987), yani bunlarda binary'de büyük bir fark
çıkarsa o da yeni bilgidir.

### M6 · TAM ÖLÇEK (isteğe bağlı, ölçek şüphesini kapatır)

M5'in bütün sayılarını **×10** yap (yani gerçek savaşın kendisi: §1'deki tablo). Motor:
saldıran kayıp **29.448** · savunan kayıp **60.055** · XP **1.090.641** · enkaz
**1.058.715.270** altın. Binary'nin ekran görüntüsündeki değerler zaten elimizde
(27.065 / 60.433 / 834.221 / 992.468.124), yani bu satırı tekrar koşmana gerek yok —
M5 ile M6 arasındaki sapma oranı farklıysa **ölçek** de bir etken demektir.


---

## 9. 2. turun sonucu ve 3. tur

### 9.1 BULUNAN VE DUZELTILEN HATA — Ogre, Demircilik'ten etkilenmemeli

Kullanicinin olcumu (her biri 3 kosu):

| # | Saldiran teknik | Motor (eski) | **Binary** |
|---|---|---|---|
| K1 | yok | 809 / 361 - xp 7.554 | 809-811 / 359-361 - xp 7530-7565 |
| K2 | Demircilik 18 | **961 / 0** - xp 3.557 | **809-811 / 359-361** - xp 7526-7562 |
| K3 | Icgudu 15 | 950 / 0 - xp 3.758 | 950-951 / 0 - xp 3752-3762 |
| K4 | Demircilik 18 + Icgudu 15 | **1017 / 0** - xp 2.597 | **950-951 / 0** - xp 3750-3767 |

Binary'de **K2 = K1** ve **K4 = K3**: Demircilik Ogre'ye hic dokunmuyor.

**Ghidra bunu dogruladi.** `FUN_0041279c` bir birim id'sini **tek bir `atk` teknik grubuna**
esliyor ve dort uygulayici (`FUN_004116b8`/`00411744`/`0041185c`/`00411938`) bu gruba gore
suzuyor:

| Grup | Birim id'leri | Teknik | Motorun listesiyle |
|---|---|---|---|
| 0 | 1, 3 = Elf, Pegasus | Okculuk | tamam, birebir |
| 1 | 0, 2, 7, 8, 9, 10, 12 = Cuce, Suvari, Saman, Kus, Yuk, Gnom... | Demircilik | Ogre YOK, Saman VAR |
| 4 | 5 = Mancinik | Kimya | tamam, birebir |
| 7 | 4, **6**, 11 = Ejderha, **Ogre**, Kaos | Icgudu | tamam, birebir |

Uc grubun motorla birebir tutmasi, id eslemesinin dogru oldugunun bagimsiz kaniti.

**Bunun ikinci bir sonucu var:** ayni stata iki teknik binmesi diye bir sey **hic yok**.
`TECH_BY_UNIT` yorumundaki *"bonuslar toplanir"* kuralinin tek ornegi Ogre'ydi ve o ornek
yanlismis. Bolum 8'deki "toplama mi carpma mi" sorusu boylece **konusuz kaldi**.

**Duzeltme:** `techs.ts` -> Demircilik'in listesinden `ogre` cikarildi. K serisi artik binary ile
birebir tutuyor. Katalog ozeti **`2ec624e6` -> `a61b1491`** oldu; eski savaslar eski ozetle
duruyor ve oyle kalmali.

### 9.2 Saman denendi, olculemez cikti

Ghidra Saman'i (id 7) Demircilik grubunda gosteriyor. Motora ekledim: gercek savasta kayip
29.448 -> **29.450**. Sebep: motorda Saman `hp` uzerinden hasar vermiyor, **kalkan** gibi
davraniyor (`shieldCal`), dolayisiyla `atk` olceklemesi ona hic dokunmuyor. Olculemeyen bir
farki katalog kutugune yazmamak icin **eklenmedi**; Saman'in hasar verdigi bir kurulum
bulunursa tekrar bakilmali.

### 9.3 M3 ekran goruntusunde Sur 2 girilmemis — ama sapmayi aciklamiyor

Ekte gonderilen M3 goruntusunde **Sur: 0**; M serisi G'nin ordusunu miras aldigi icin orada
**Sur 2** olmaliydi. Kontrol ettim: motorda sursuz kosu S kaybini 2.985 -> **2.983** yapiyor,
yani binde birlik bir fark. Sapma gercek, giris hatasindan degil.

### 9.4 Kalan sapma nerede?

| Adim | Eklenen | Motor | Binary | Durum |
|---|---|---|---|---|
| G | — | 4.067 | 4.066 | tamam |
| M1 | Buyuculuk 20 | 3.404 | 3397-3403 | tamam |
| M2 | + Icgudu 15 | 3.152 | 3144-3150 | tamam |
| **M3** | **+ Okculuk - Zirh - Demircilik - Kimya - Tilsim** | **2.985** | **2728-2735** | **SAPMA %8,5** |

Sapma **M2 -> M3** adiminda doguyor. O adimda eklenen bes teknikten:

| Teknik | Nerede sinandi | Yeterli mi? |
|---|---|---|
| Okculuk 18 | L1 (Pegasus) tamam | Elf'te sinanmadi |
| Kimya 17 | L2 (Mancinik) tamam | Mancinik tek birim, yeterli |
| Demircilik 18 | C4/C5 (Cuce) - K2 (Ogre) -> **duzeltildi** | Suvari/Gnom sinanmadi |
| **Zirh 16** | C2/C3 (**yalniz Cuce**) | **diger 8 birimde sinanmadi** |
| **Tilsim 17** | C6 (**bos test**) | **hicbir yerde sinanmadi** |

Ana suheli **Zirh ve Tilsim**, ozellikle **Kaos uzerinde**: motor ikisini de Kaos'a
uygulamiyor, Ghidra'da ise bu iki uygulayicinin (`FUN_004117d0`, `FUN_00411988`) **grup
suzgeci yok**. Suzme carpan aramasinda olabilir, dolayisiyla Ghidra bu soruyu bu derinlikte
kapatmiyor — olcum gerekiyor. Kaos savasin %90'ini tasidigi icin buradaki kucuk bir fark
gozlenen %8,5'i tek basina uretebilir.

### 9.5 3. tur senaryolari

Ortak kurallar bolum 4'tekiyle ayni. **N ve P gruplari kucuk ve hizli** — hepsi tek birim tipi.

### N · Zırh ve Tılsım Kaos'a değiyor mu? (saldıran Kaos 1200 · savunan Kaos 1000)

| # | Saldıran teknik | Kazanan/tur | ⬜ BINARY | S kalan | ⬜ BINARY | D kalan | ⬜ BINARY | XP | ⬜ BINARY |
|---|---|---|---|---|---|---|---|---|---|
| N1 | yok (= H1 kıyas) | saldıran / 5 | saldıran / 5 | **635** | 635-637 | **0** | 0 | 1.060.052 | 1.059.087-1.061.271 |
| N2 | **Zırh 20** | saldıran / 5 | saldıran / 5 | **635** | 720-722 | **0** | 0 | 1.060.052 | 849.979-853.391 |
| N3 | **Tılsım 20** | saldıran / 5 | saldıran / 5 | **635** | 740-741 | **0** | 0 | 1.060.052 | 804.438-806.937 |
| N4 | Zırh 20 + Tılsım 20 | saldıran / 5 | saldıran / 5 | **635** | 824-826 | **0** | 0 | 1.060.052 | 618.080-621.012 |
| N5 | SAVUNANDA Zırh 20 | saldıran / 5 | saldıran / 5 | **635** | 602-603 | **0** | 0 | 1.060.052 | 1.145.570-1.149.725 |

### P · Zırh/Tılsım diğer birimlerde (Cüce dışı — C2/C3/C6 yalnız Cüce'yi sınamıştı)

| # | Saldıran | Saldıran teknik | Kazanan/tur | ⬜ BINARY | S kalan | ⬜ BINARY | D kalan | ⬜ BINARY | XP | ⬜ BINARY |
|---|---|---|---|---|---|---|---|---|---|---|
| P1a | Süvari 1200 vs Süvari 1000 | **Zırh 20** | saldıran / 5 | saldıran / 5 | **799** | 798-800 | **22** | 21-23 | 478 | 477-478 |
| P1b | Süvari 1200 vs Süvari 1000 | **Tılsım 20** | saldıran / 5 | saldıran / 5 | **631** |630-632  | **85** | 84-86 | 780 | 778-781 |
| P2a | Ejderha 1200 vs Ejderha 1000 | **Zırh 20** | saldıran / 5 | saldıran / 5 | **867** | 866-868 | **0** | 0 | 5.771 | 5764-5785 |
| P2b | Ejderha 1200 vs Ejderha 1000 | **Tılsım 20** | saldıran / 5 | saldıran / 5 | **859** | 880-881 | **0** | 0 | 5.952 | 5478-5503 |
| P3a | Ogre 1200 vs Ogre 1000 | **Zırh 20** | saldıran / 5 | saldıran / 5 | **1065** | 1065-1066 | **294** | 294-295 | 1.932 | 1928-1942 |
| P3b | Ogre 1200 vs Ogre 1000 | **Tılsım 20** | saldıran / 5 | saldıran / 5 | **810** | 809-810 | **360** | 360-361 | 7.542 | 7530-7556 |
| P4a | Mancınık 1200 vs Mancınık 1000 | **Zırh 20** | saldıran / 5 | saldıran / 5 | **836** | 836-837 | **0** | 0 | 2.065 | 2057-2072 |
| P4b | Mancınık 1200 vs Mancınık 1000 | **Tılsım 20** | saldıran / 5 | saldraın / 5 | **639** | 639-640 | **0** | 0 | 3.641 | 3633-3648 |

**N1-N5 hepsi motorda AYNI sonucu veriyor (635)** — motor Zirh ve Tilsim'i Kaos'a hic
uygulamiyor. Binary'de bunlardan herhangi biri farkli cikarsa **kok neden bulunmus olur.**

**P serisi** Zirh ve Tilsim'i Cuce disindaki birimlerde siniyor. C2/C3 yalniz Cuce'yi
kapsiyordu ve Tilsim'in Cuce'ye etkisi sifir oldugu icin C6 hicbir sey olcmemisti.

### Oncelik

| Sira | Senaryo | Neden |
|---|---|---|
| **1** | **N2 - N3** | Zirh/Tilsim Kaos'a degiyor mu? Tek soru, iki kosu. Sapmanin %90'i burada. |
| **2** | **P3b - P1b** | Tilsim'in Ogre ve Suvari'deki etkisi — Tilsim hic sinanmadi. |
| **3** | P2a-P4b | Zirh/Tilsim'in kalan birimleri. |

---

## 10. SONUC — uc duzeltme, sapma %8,8'den %0,7'ye

### 10.1 3. turun bulgulari

Kullanicinin N serisi kok nedeni tek atista buldu:

| # | Saldiran teknik | Motor (eski) | **Binary** | Karar |
|---|---|---|---|---|
| N1 | yok | 635 | 635-637 | tamam |
| **N2** | **Zirh 20** | **635** | **720-722** | **Zirh Kaos'a DEGIYOR** |
| **N3** | **Tilsim 20** | **635** | **740-741** | **Tilsim Kaos'a DEGIYOR** |
| **N4** | Zirh + Tilsim | **635** | **824-826** | ikisi birikiyor |
| **N5** | savunanda Zirh 20 | **635** | **602-603** | savunanda da gecerli |
| **P2b** | Ejderha + Tilsim 20 | **859** | **880-881** | Tilsim'in **buyuklugu** de yanlis |

⚠️ N5'in motor satiri aslinda **betik hatasiydi**: `senaryolar3.mjs` teknigi yalniz saldirana
uyguluyordu, yani o satir sessizce N1'in kopyasi olmustu. Duzeltildi (`dTech` parametresi).

### 10.2 Uygulanan uc duzeltme

**1 · Ogre, Demircilik'ten etkilenmiyor** (§9.1) — binary olcumu + Ghidra `FUN_0041279c`.

**2 · Zirh ve Tilsim Kaos'a da uygulaniyor.** Iki liste de oyunun kendi doküman metninden
kurulmustu (*"Kaos hariç tüm savaşçılar"*, *"Mancınık/Kaos/Yük/Casus HARİÇ"*). Olcum metni
curuttu. Kaos savasin `lossMag`inin %90'ini tasidigi icin bu iki satir sapmanin buyuk kismini
tek basina uretiyordu.

**3 · Tilsim'in orani %5 degil %6.** Seviye taramasi iki bagimsiz hedefi ayni anda tutturdu:

| Tilsim seviyesi (oran %5) | Kaos kalan | Ejderha kalan |
|---|---|---|
| 20 | 725 | 859 |
| **24** | **740** | **880** |
| 26 | 748 | 891 |
| **BINARY hedefi** | **740-741** | **880-881** |

Seviye 24 × %5 = seviye 20 × **%6**. Tek bir oran iki farkli birimi birden tutturuyor —
tesaduf degil. Kardesi Zirh de zaten %6.

### 10.3 Duzeltme sonrasi tablo

**Canli savas 4108:**

| | Once | **Sonra** | Binary | Kalan sapma |
|---|---|---|---|---|
| Saldiran kayip | 29.448 | **27.264** | 27.065 | %8,8 → **%0,7** |
| Savunan kayip | 60.055 | **60.425** | 60.433 | %0,6 → **%0,01** |
| Deneyim (XP) | 1.090.641 | **840.092** | 834.221 | %30,7 → **%0,7** |
| Enkaz altin | 1.058.715.270 | **994.200.315** | 992.468.124 | %6,7 → **%0,17** |

**3. tur senaryolari — hepsi tutuyor:**

| # | Motor | Binary |
|---|---|---|
| N1 | 635 | 635-637 |
| N2 | **720** | 720-722 |
| N3 | **740** | 740-741 |
| N4 | **825** | 824-826 |
| N5 | **602** | 602-603 |
| P2b | **880** | 880-881 |
| P1a/P1b/P2a/P3a/P3b/P4a/P4b | degismedi | zaten tutuyordu |

**2. tur M serisi:**

| # | Once | **Sonra** | Binary |
|---|---|---|---|
| M3 | 2.985 | **2.757** | 2728-2735 |
| M3 savunan kayip | 6.003 | **6.041** | **6041** (birebir) |
| M4 | 2.987 | **2.758** | 2728-2736 |
| M5 | 2.987 | **2.757** | 2728-2736 |

**1. tur (A-G): hicbiri degismedi** — 21 satirin tamami eski degerlerinde kaldi, yani
duzeltmeler bir yeri onarirken baska bir yeri bozmadi.

### 10.4 Kalan %0,7

Butun gostergeler artik binary'nin kendi kosu-arasi dagilimiyla ayni mertebede (%0,2-1).
Bu seviyede daha ileri gitmek icin binary'nin RNG'sini birebir taklit etmek gerekir; oyun
dengesi acisindan anlamli bir fark degil. **Sapma kapandi sayilir.**

### 10.5 Katalog ozeti

`2ec624e6` → **`bb11b88a`**. Eski savaslar eski ozetle duruyor ve oyle kalmali —
`hash.test.ts` bu ani gerekcesiyle birlikte kilitliyor.

⚠️ **DENGE ETKISI (canliya alma karari kullanicida):**
* Ogre artik Demircilik'ten guc almiyor (Icgudu aynen duruyor) — **zayiflama**.
* Kaos artik Zirh ve Tilsim'dan yararlaniyor — **guclenme**, ve Kaos zaten savasin
  belirleyici birimi.
* Tilsim herkeste %20 daha etkili (%5 → %6).

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
| `scripts/sapma/senaryolar.mjs` | §4 tablolarını üretir |
| `scripts/sapma/ganimet4108.mjs` | Savaş sonucundan beklenen ganimeti hesaplar |
| `scripts/sapma/kapsam.mjs` | §7 kapsam analizi: birim ağırlıkları + teknik kaldıraçları |
| `scripts/sapma/senaryolar2.mjs` | §8 tablolarını üretir |
| `scripts/sapma/teknik-tarama.mjs` | §7.6 Büyücülük/İçgüdü taraması |
| `scripts/sapma/senaryolar3.mjs` | §9.5 tablolarını üretir |
| `scripts/sapma/dogrula.mjs` | M3'teki Sur hipotezini sınar (§9.3) |
| `scripts/sapma/tilsim.mjs` | Tılsım seviye/oran taraması (§10.2) |
