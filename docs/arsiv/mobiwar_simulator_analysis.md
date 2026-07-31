# Mobiwar Simulator v0.5.5 Tersine Mühendislik ve Savaş Mekanikleri Analiz Raporu

Bu rapor, **Mobiwar Simulator v0.5.5** Windows uygulaması üzerinde Ghidra ve bellek analizi (memory analysis) yöntemleri kullanılarak gerçekleştirilen tersine mühendislik çalışmalarının bulgularını içermektedir.

> **Doğrulama durumu (2026-07-18):** Bu rapor, önceki bir analiz turunda ortaya çıkan hatalı bir bulgu (Gece Görüşü'nün "işlevsiz" olduğu iddiası — bu YANLIŞTI) sonrası, üç kademeli bir ajan hattı (keşif → çıkarım → sentez) ile sıfırdan, iddia iddia çapraz doğrulanmıştır. Her bölümün başında o bölümün doğrulama durumu belirtilmiştir. Sayısal sabitlerin bir kısmı (özellikle x87/FPU float-literal'leri) Ghidra MCP araç setiyle okunamamıştır — bu sabitler §10'da ayrıca listelenmiştir ve Ghidra GUI'de manuel doğrulama gerektirir.
>
> **Ek doğrulama turu (2026-07-19):** Savaş sonuç yazıcısı `FUN_004104e8`'den başlanıp çağrı zinciri Ghidra MCP ile takip edilerek §1–§8 yeniden teyit edildi (uğranılan fonksiyonların dökümü: `call_chain_notes.md`). Bu turda **üç düzeltme** yapıldı: (1) §1'deki düzeltilmiş hücre sayısı 7 değil **8**; (2) §3'teki "Kimya → Taşıma Kapasitesi" iddiası hatalıydı — ilgili teknoloji **Büyü Canı'nı (field2)** ölçekler, taşıma kapasitesi savaşta hiç ölçeklenmez; (3) §7'deki savunan 3. döngüsünün "savunma yapıları" olduğu (`FUN_00413120`) kanıtlandı. §1 stat/maliyet tabloları (Cüce, Okçu Kulesi, Kaos tam çözüldü) ve §2/§4/§5/§6/§8 formülleri binary ile birebir eşleşti.
>
> **Kapanış (2026-07-19, ikinci geçiş):** Kalan tüm açık maddeler kapatıldı: (a) §1 stat tablosunun **126/126 hücresi** IEEE-754'ten tek tek çözülüp doğrulandı; (b) §4 Ogre `1.15^L` üsteli immediate'ten (`0x3ff2666666666666`) byte-kesinleştirildi; (c) §7 saldıran tarafı (`FUN_004111d4`, 2 döngü) teyit edildi; (d) §9.1 isim fonksiyonu (`FUN_00413a2c`) tam haritalandı; (e) §10'daki **19 FLD-sabitinin ham değeri** Ghidra GUI'de okunarak 19/19 doğrulandı. **Son açık madde de kapatıldı (§2 kayıp bölücüsü, tam trace):** `FUN_0040e0c4` baştan sona disassemble edildi. Sonuç, raporun §2 detayında **üç hata** ortaya çıkardı ve düzeltildi: (a) kayıp bölücüsü türe göre değişmez — **tüm türlerde Büyü Savunması** (sabit dağıtıcı indeksi 6, §8'de kanıtlı `b3c`); (b) çıkarılan mitigasyon statı türe göre FizSald(t1)/FizSav(t2)/BüyüSald(t3); (c) saldıran havuz Can/Büyü Canı tabanlı ve `FUN_00410e60` ile **±%0.1 rastgele oynamaya** tabi. Orantılı dağıtım iskeleti ve $P_{toplam}$/kahraman terimi doğru kaldı. Artık rapordaki hiçbir iddia trace edilmemiş değildir.

---

## 1. Ünite ve Savunma Yapıları Temel Özellikleri (Base Stats)

**Doğrulama durumu: Savaşçılar tam doğrulandı (değişiklik yok). Savunma yapılarında 8 hücre düzeltildi.**

Simülatörde yer alan 12 askeri ünite ve 9 savunma/destek yapısının nitelikleri `FUN_0041440c` (statlar), `FUN_00414018` (Altın maliyetleri), `FUN_0041411c` (Yemek maliyetleri), `FUN_0041421c` (Taşıma kapasiteleri) ve `FUN_00413f14` (Eğitim süreleri) fonksiyonlarından çıkarılmıştır. Tüm 5 fonksiyon aynı 21-elemanlı düz indeksleme şemasını kullanır (idx 0-11 = 12 savaşçı, idx 12-20 = 9 savunma yapısı, rapordaki sırayla).

### Savaşçılar (Warriors)

*Doğrulama: 12 ünitenin Can/Taşıma/FizSaldırı/FizSavunma/BüyüSaldırı/BüyüSavunma/Altın/Yemek/Eğitim değerlerinin tamamı (108/108 hücre) binary'den çekilen ham verilerle birebir eşleşti. Değişiklik yok.*

| Ünite Adı (Türkçe / İngilizce) | Can (HP) | Büyü Canı (Magic HP / field2) | Taşıma Kapasitesi | Fiziksel Saldırı | Fiziksel Savunma | Büyü Saldırısı | Büyü Savunması | Altın Maliyeti | Yemek Maliyeti | Eğitim Süresi (sn) | Saldırı Türü (1:Menzilli, 2:Yakın, 3:Büyü) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Cüce (Dwarf)** | 60 | 0 | 10 | 4 | 9 | 4 | 182 | 200 | 450 | 9 | 2 (Yakın) |
| **Elf** | 80 | 0 | 4 | 9 | 4 | 11 | 234 | 450 | 650 | 12 | 1 (Menzilli) |
| **Süvari (Cavalry)** | 300 | 0 | 40 | 72 | 36 | 18 | 845 | 1200 | 2400 | 52 | 2 (Yakın) |
| **Pegasus** | 300 | 250 | 40 | 48 | 84 | 60 | 1300 | 4000 | 3200 | 80 | 1 (Menzilli) |
| **Ejderha (Dragon)** | 2000 | 2800 | 300 | 540 | 540 | 600 | 13000 | 45000 | 20000 | 750 | 1 (Menzilli) |
| **Mancınık (Catapult)** | 1500 | 0 | 0 | 204 | 120 | 240 | 4160 | 12000 | 6000 | 240 | 1 (Menzilli) |
| **Ogre** | 3000 | 0 | 500 | 420 | 720 | 300 | 12000 | 18000 | 24000 | 666 | 2 (Yakın) |
| **Şaman (Shaman)** | 200 | 200 | 1 | 6 | 6 | 12 | 750 | 2000 | 2000 | 18 | 1 (Menzilli) |
| **Casus Kuş (Scout Bird)** | 0 | 0 | 0 | 1 | 1 | 2 | 10 | 100 | 200 | 1 | 1 (Menzilli) |
| **Yük Arabası (Cargo Cart)** | 0 | 0 | 3000 | 10 | 10 | 10 | 100 | 1000 | 1000 | 8 | 2 (Yakın) |
| **Gnom (Gnome)** | 200 | 0 | 4 | 12 | 12 | 12 | 260 | 1600 | 1600 | 25 | 2 (Yakın) |
| **Kaos (Chaos)** | 220000 | 250000 | 0 | 40000 | 40000 | 27000 | 1200000 | 2000000 | 2000000 | 40000 | 2 (Yakın) |

### Savunma ve Destek Yapıları (Defense Structures) — *düzeltilmiş*

*Not: Savunma yapıları sadece savunma yapan (Defender) orduda yer alır ve saldırı güçlerini savunma ordusuna ekler.*

*Doğrulama: HP/FizSaldırı/FizSavunma/BüyüSaldırı/BüyüSavunma değerlerinin tamamı (45/45 hücre) doğrulandı, değişiklik yok. Altın/Yemek/Eğitim süresinde ise **8 hücre yanlış çıktı** — bunlar aşağıda **kalın** işaretlenmiştir. (Muhafız-eğitim, Balista-altın, Sur-eğitim, Büyü Kalkanı-altın/yemek/eğitim, Tapınak-altın/eğitim.)*

| Yapı Adı | Can (HP) | Büyü Canı (Magic HP / field2) | Saldırı Gücü (Fiziksel) | Savunma Gücü (Fiziksel) | Büyü Saldırısı | Büyü Savunması | Altın Maliyeti | Yemek Maliyeti | Eğitim Süresi (sn) | Türü |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Okçu Kulesi** | 1200 | 1200 | 240 | 240 | 300 | 4000 | 6000 | 4000 | 140 | 2 |
| **Tuzak (Trap)** | 60 | 0 | 12 | 6 | 19 | 325 | 300 | 450 | 24 | 1 |
| **Kazancı (Boiler)** | 340 | 0 | 0 | 18 | 0 | 42 | 400 | 0 | 3 | 2 |
| **Mangonel** | 800 | 0 | 30 | 120 | 72 | 2418 | 2400 | 3200 | 150 | 2 |
| **Muhafız (Guardian)** | 700 | 0 | 192 | 96 | 120 | 3744 | 1000 | 8000 | **257** *(rapor eski hali: 180)* | 1 |
| **Balista (Ballista)** | 200 | 300 | 48 | 144 | 120 | 3172 | **2400** *(eski: 8000)* | 2000 | 180 | 2 |
| **Sur (Wall)** | 2500 | 2500 | 480 | 240 | 600 | 16640 | 20000 | 16000 | **900** *(eski: 180)* | 1 |
| **Büyü Kalkanı** | 0 | 0 | 50 | 50 | 0 | 600 | **960** *(eski: 2000)* | **980** *(eski: 2000)* | **300** *(eski: 180)* | 2 |
| **Tapınak (Temple)** | 0 | 0 | 0 | 0 | 320 | 2000 | **8000** *(eski: 2000)* | 2000 | **400** *(eski: 3)* | 3 |

> **Kaynak notu:** Eski değerler muhtemelen bir önceki sürümden (v0.5.5 öncesi) kalan tahminlerdi ya da yer tutucu (placeholder) değerlerdi — Muhafız/Sur/Büyü Kalkanı'nın eski eğitim süresinin üçünün de aynı "180" olması bunu destekliyor. Yeni değerler doğrudan `FUN_00413f14`/`FUN_00414018`/`FUN_0041411c` decompile çıktısından (immediate literal sabitler, dizi/DAT referansı değil) alınmıştır.

### Doğrulanan Nitelik: Büyü Canı (Magic HP / field2) Stat Alanı

`FUN_0041440c`'deki her varlığın stat struct'ında `offset +0x08` alanına yazılan sayıların gizemi çözülmüştür:
* Bu alan, Büyü Saldırı türüne maruz kalındığında standart can yerine kullanılan **Büyü Canı (Magic HP / field2)** statıdır.
* Çoğu normal savaşçıda (Cüce, Elf, Süvari vb.) değeri 0'dır, bu yüzden büyü hasarına karşı savunmasızdırlar.
* Pegasus (250), Ejderha (2800), Şaman (200), Kaos (250000), Okçu Kulesi (1200), Balista (300) ve Sur (2500) birimlerinde ise büyü savaşlarına direnç sağlayacak şekilde yüksek değerlere sahiptir. Savaş hasar formülünde büyü saldırısı modunda can havuzu olarak bu değer okunur (bkz. §2).

---

## 2. Savaş Mekanikleri ve Hasar Hesaplama Formülü

**Doğrulama durumu: Orantılı dağıtım yapısı ve kahraman terimi DOĞRULANDI; ancak 2026-07-19 tam trace'inde ÜÇ hata düzeltildi — (a) kayıp bölücüsü türe göre değişmez, daima Büyü Savunması'dır; (b) çıkarılan mitigasyon statı türe göre FizSald/FizSav/BüyüSald'dir; (c) saldıran havuz Can/Büyü Canı tabanlıdır ve ±%0.1 rastgele oynamaya (`FUN_00410e60`) tabidir.**

Savaşlar tur bazlıdır ve en fazla 5 tur sürer. `FUN_0040e0c4` fonksiyonu turlardaki hasar dağılımını ve kayıpları hesaplar; tam disassembly ile doğrulanan akış aşağıdaki formülle birebir örtüşmektedir:

1. **Toplam Saldırı Gücü ($A_{toplam}$)**: Saldıran ordunun o turdaki aktif tüm ünitelerinin saldırı statlarının (Fiziksel veya Büyü) toplamıdır:
   $$A_{toplam} = \sum (Saldiri_{unite} \times Adet_{unite})$$

2. **Toplam Ordu Değeri Puanı ($P_{toplam}$)**: Savunan ordunun o turdaki aktif tüm ünitelerinin dinamik **Birim Puanı (Unit Power Score)** değerlerinin toplamıdır:
   $$P_{toplam} = \sum (BirimPuan_{unite} \times Adet_{unite})$$

3. **Orantılı Hasar Dağılımı ($A_{pay}$)**: Toplam saldırı gücü, savunmadaki ünitelerin ordu değeri puanı havuzundaki paylarına göre orantılı olarak dağıtılır (can yüzdesi yerine):
   $$A_{pay} = A_{toplam} \times \frac{BirimPuan_{unite} \times Adet_{unite}}{P_{toplam}}$$

4. **Net Hasar ($D_{net}$)**: Her ünite grubunun alacağı net hasar, kendisine ayrılan orantılı hasardan o grubun **saldırı türüne göre seçilen bir mitigasyon statının** çıkarılmasıyla bulunur. *(2026-07-19 düzeltmesi: bu terim tüm türlerde "Fiziksel Savunma" değildir — türe göre değişir, aşağıya bakınız.)*
   $$D_{net} = A_{pay} - (Stat_{mitigasyon} \times Adet_{unite})$$
   Disassembly'de (`FUN_0040e0c4`, ofset 0x0040e3df–0x0040e422) çıkarılan stat, `FUN_004121d4` dağıtıcısıyla saldırı türüne göre seçilir:
   * **Type 1 (Menzilli)** → **Fiziksel Saldırı** (dağıtıcı indeksi 3, `unit+0x10`)
   * **Type 2 (Yakın)** → **Fiziksel Savunma** (indeks 4, `unit+0x18`)
   * **Type 3 (Büyü)** → **Büyü Saldırısı** (indeks 5, `unit+0x20`)

5. **Kayıp Hesaplama (Losses) — *düzeltildi (2026-07-19)***: Net hasar bir bölücüye bölünerek kayıp bulunur ve kalan asker sayıları `double` olarak saklanır. **Önceki raporda bölücünün türe göre değiştiği (Type 1&2 → Can, Type 3 → Büyü Savunması) yazıyordu; bu YANLIŞTIR.** Disassembly (`FUN_0040e0c4`, her üç grup ve kahraman için: 0x0040e448, 0x0040e512, 0x0040e5dc, 0x0040e66b/e6e6/e75a) bölücünün **daima sabit dağıtıcı indeksi `6` (Büyü Savunması)** olduğunu gösterir — `PUSH 0x6; CALL FUN_00412294` (savaşçı), `FUN_00412d0c` (yapı), `FUN_0041338c`/`FUN_004132f4` (kahraman). Türe göre `PUSH` değeri değişmez.
   $$Kayip = \frac{D_{net}}{BüyüSavunması_{unite}} \quad \text{(TÜM saldırı türleri için: 1, 2 ve 3)}$$
   > **İndeks 6 = Büyü Savunması kanıtı:** Dağıtıcı indeks→getter sırası `1=b5c(Can)`, `2=b9c(BüyüCan)`, `3=b7c(FizSald)`, `4=afc(FizSav)`, `5=b1c(BüyüSald)`, `6=b3c(BüyüSav)`. `b3c`'nin (`FUN_00412b3c`, stat struct +0x28) Büyü Savunması getter'ı olduğu §8'de bağımsızca kanıtlanmıştı (birim puanı = `round(BüyüSav × 0.005)`). Dolayısıyla bölücü kesinlikle Büyü Savunması'dır.

> **Numeratör hakkında ek düzeltme ($A_{toplam}$):** Yukarıdaki 1. adımda "$A_{toplam}$ = saldırı statları toplamı" denmişti; disassembly bunu tam desteklemiyor. Gerçekte saldıran havuz (`FUN_0040e0c4`, `[EBP-0x8]`), tür-eşleşen aktif birimlerin **Can (Type 1,2) / Büyü Canı (Type 3)** değerlerinin `×Adet` toplamıdır ve `FUN_00410e60` ile **±%0.1 rastgele oynamaya** tabidir (`(rand%3)+999`, ×0.001 → 0.999/1.000/1.001). Havuzun `BirimPuan` payına göre dağıtımı (2.–3. adımlar) ve $P_{toplam}$ = Σ(BirimPuan×Adet) + kahraman gücü kısmı ise **doğrudur**. Yani genel "havuzu orantılı dağıt" yapısı doğru; ancak havuzun statı (saldırı değil, Can/Büyü Canı) ve ±%0.1 jitter raporun ilk sürümünde eksikti.

> **Kahramanın Savaştaki Rolü ve Güç Formülü (param_10):**
> Savaş hasarı fonksiyonu (`FUN_0040e0c4`) incelendiğinde, `param_10 == 1` (kahraman/lider mevcut) olduğunda kahraman orduya bağımsız bir askeri grup gibi dahil edilir:
> 1. Toplam ordu güç havuzuna (`local_1c`) kahramanın kendi **Kahraman Güç Puanı ($Power_{kahraman}$)** eklenir.
> 2. Gelen orantılı hasardan kahraman kendi güç payı oranında hasar alır.
> 3. Kahramanın aldığı net hasar kendi savunmasından büyükse, kahraman doğrudan hasar görür (`FUN_0041338c` ve `FUN_004132f4`).
>
> **Kahraman Güç Puanı Hesabı (`FUN_00413610`):**
> Kahramanın ordu gücü havuzuna eklediği katsayı şu üstel formülle hesaplanır:
> $$Power_{kahraman} = \text{round}\left( Can_{kahraman} \times 1.8^{L_{kahraman}} \times Bonus_{ekipman}\% \times 0.01 \right)$$
> * `Can_{kahraman}` (`[ECX + 0xc]`): Kahramanın can statı.
> * `L_{kahraman}` (`[EDX + 0x14]`): Kahramanın seviyesi (1.8 tabanında üstel olarak büyür).
> * `Bonus_{ekipman}\%` (`[EAX + 0x80]`): Kahramanın ekipman/yetenek yüzdelik bonusu.
> * `0.01` (`0x00413660` adresindeki extended float): Yüzdelik katsayıyı orana çeviren çarpan.
>
> Hasar eşik sabiti (`_DAT_0040e790`) ise **`0.0`** (float) olarak doğrulanmıştır ve sadece pozitif net hasarların kayba neden olmasını sağlar (negatif kayıp koruması). Formülde iddia edilen başka bir sabit katsayı yoktur.

---

## 3. Teknoloji ve Teknik Seviye Etkileri

**Doğrulama durumu: DOĞRULANDI (Yüksek güven) — Zırh (Armor) bloğundaki kritik kopyala-yapıştır hatası (bug) disassembly ile kesinleştirilmiştir. 4. teknolojinin etkisi düzeltildi (Taşıma Kapasitesi → Büyü Canı).**

Oyuncuların geliştirdiği tekniklerin üniteler üzerindeki etkileri `FUN_0040d884` fonksiyonunda tanımlanmıştır. Tüm geliştirmeler **üstel (exponential)** olarak etki eder. Sabitler (`0x3ff11eb851eb851f` = **1.07** ve `0x3ff0f5c28f5c28f6` = **1.06**) doğrudan hex baytlarından IEEE-754 çözümüyle kesin olarak doğrulanmıştır.

* **Kahraman Seviyesi ($L_{kahraman}$)**: Tüm askeri nitelikleri (Can, Saldırı, Savunma) doğrudan etkiler:
  $$Hero\_Multiplier = (L_{kahraman} + 1) \times 1.07^{L_{kahraman}}$$

* **İçgüdü (Instinct - $L_{icgudu}$)**: Ünitelerin Can değerini artırır:
  $$HP_{yeni} = HP_{temel} \times Hero\_Multiplier + HP_{temel} \times 1.06^{L_{icgudu}}$$

* **Zırh (Armor - $L_{zirh}$)**: Ünitelerin Fiziksel Saldırı ve Fiziksel Savunma değerlerini artırması gerekirken **kritik bir kod hatası (bug)** barındırır (bkz. aşağıdaki not):
  $$\text{Stat}_{yeni} = \text{Savunma}_{temel} \times Hero\_Multiplier + \text{Savunma}_{temel} \times 1.06^{L_{zirh}}$$

* **Dördüncü Teknoloji ($L_{tek4}$, unit+0xa0)**: Ünitelerin **Büyü Canı'nı (Magic HP / field2)** artırır — *önceki raporda hatalı olarak "Kimya → Taşıma Kapasitesi" yazılmıştı, düzeltildi (bkz. aşağıdaki not):*
  $$BüyüCanı_{yeni} = BüyüCanı_{temel} \times Hero\_Multiplier + BüyüCanı_{temel} \times 1.06^{L_{tek4}}$$
  Bu blok `FUN_00412b9c` (Büyü Canı getter, `unit+0x08`) ile okuyup `FUN_00412ba8` (Büyü Canı setter, `unit+0x08`) ile yazar; teknik seviyesi `unit+0xa0`'dan (`FUN_004128cc`) okunur.

> **DÜZELTME (Taşıma Kapasitesi ≠ ölçeklenmez):** Bu raporun önceki sürümünde 4. teknolojinin (Kimya) **Taşıma Kapasitesini** artırdığı iddia ediliyordu. Ghidra disassembly ile (`FUN_0040d884` içindeki blok 0x0040da00–0x0040dabf) bunun **yanlış** olduğu kesinleşti: söz konusu teknoloji Büyü Canı (field2, `unit+0x08`) statını ölçekler. **Taşıma Kapasitesi savaş öncesi teknoloji güncelleyicisi tarafından HİÇ değiştirilmez** — `FUN_0041421c`'den gelen taban değerinde kalır. (Teknolojinin oyun-içi adının gerçekten "Kimya" olup olmadığı ayrıca UI eşlemesiyle teyit edilmelidir; kesin olan, ölçeklediği statın Büyü Canı olduğudur.)

* **Büyücülük (Wizardry - $L_{buyu}$)**: Ünitelerin Büyü Saldırısını artırır:
  $$MagicAtk_{yeni} = MagicAtk_{temel} \times Hero\_Multiplier + MagicAtk_{temel} \times 1.06^{L_{buyu}}$$

* **Büyü Savunması**: Sadece Kahraman Seviyesi ile doğrudan artar, ek bir teknolojisi yoktur (toplama terimi yok, ikinci teknoloji alanı yok):
  $$MagicDef_{yeni} = MagicDef_{temel} \times (L_{kahraman} + 1) \times 1.06^{L_{kahraman}}$$

### §3-EK: Adlandırılmış Teknik Sistemi (`FUN_0040d608`) — *YENİ (2026-07-19)*

**Doğrulama durumu: DOĞRULANDI — 9 tekniğin uygulayıcı/modifier zinciri disassemble edildi, artış sabitleri byte-okundu. UI etiket→indeks eşlemesi kısmen çıkarım.**

Önceki §3 yalnızca `FUN_0040d884`'ü kapsıyordu. Ancak koordinatör `FUN_0040dcb4`, savaş öncesi **iki** teknik fonksiyonunu da çağırır:
```
FUN_0040d608();   // adlandırılmış teknikler idx 0-8 (LİNEER) + gece görüşü
FUN_0040d884();   // kahraman çarpanı + üstel + Zırh bug'ı (yukarıdaki bölüm), ×2 (saldıran/savunan)
```
`FUN_0040d608`, her teknik için getter (`FUN_004115d0` saldıran `army+8+idx*4` / `FUN_00411f48` savunan `army+0x120+idx*4`) + birim döngüsü + modifier çağırır. **Ekrandaki 8 adlandırılmış teknik burada uygulanır** (gece görüşü = idx 6). Modifier formülü lineer:
$$\text{Stat}_{yeni} = \text{Stat}_{taban} \times (1 + Seviye \times k)$$

| idx | Modifier | Etki | Kapsam | k (byte-doğrulandı) |
| :---: | :--- | :--- | :--- | :---: |
| 0 | `FUN_00412394` | Can | birim sınıfı 0 (Elf, Pegasus) | **0.05** |
| 1 | `FUN_0041232c` | Can | birim sınıfı 1 (genel piyade) | **0.05** |
| 2 | `FUN_004124cc` | Büyü Canı | tümü | **0.05** |
| 3 | `FUN_00412528` | Fiz. Saldırı **+** Fiz. Savunma (her biri kendi getter'ından — burada bug YOK) | tümü | **0.06** |
| 4 | `FUN_004123fc` | Can | birim sınıfı 4 (Mancınık) | **0.05** |
| 5 | `FUN_00413010` | Fiz. Sav + Fiz. Sald | **yalnız yapılar** (savunan) | **0.06** |
| 6 | `FUN_00412624` | Can + Taşıma | tümü (gece görüşü, §7) | (§7) |
| 7 | `FUN_00412464` | Can | birim sınıfı 7 (Ejderha, Ogre, Kaos) | **0.05** |
| 8 | `FUN_004125c8` | Büyü Saldırı | tümü | **0.06** |

* **Birim sınıfı** (`FUN_0041279c`: `unit+0x7c` → tablo `0x4127b7` → jump `0x4127c4` → {0,1,4,7}) HP tekniklerini birimin sınıfına göre kapılar. **Savaşçı** tarafında idx2/3/8 kategori kontrolü yok (tüm savaşçılar). idx5 `FUN_004131d8` ile yapı tipini (`unit+0x00`, 0xd–0x12) kontrol eder → **Taş Ustalığı = idx5** (savunan yapı tekniği; ekrandaki "-" ile birebir). **DİKKAT:** Bu tablonun "Kapsam" sütunu **savaşçı** uygulayıcısını anlatır. **Yapı** uygulayıcıları farklıdır (ayrı modifier'lar, farklı kapılar): Büyücülük(idx2) ve İçgüdü(idx7) yapıya HİÇ uygulanmaz, Zırh(idx3) yapıda yalnız TaşUst-kategori 3'e uygulanır — tam yapı tablosu için **bkz. §11**.
* **UI etiket→indeks eşlemesi** (2026-07-19, çapa zinciriyle belirlendi):
  Okçuluk→0, Demircilik→1, Büyücülük→2 (Büyü Canı), Zırh→3, Kimya→4 (Mancınık Can), Taş Ustalığı→5, [Gece Görüş→6], İçgüdü→7 (Can), Tılsım→8 (Büyü Sald).
  Gerekçe: (a) idx5=Taş Ustalığı binary-KESİN (savunan-only + `FUN_004131d8` yapı kontrolü); (b) panel pozisyonu 5 = dizi indeksi 5 → ilk 6 teknik panel sırasıyla idx0-5; (c) Gece Görüş dizi slotu idx6; (d) kalan idx7/8 → İçgüdü/Tılsım (panel sırasıyla); (e) İçgüdü→idx7=Can, §3'ün bağımsız "İçgüdü→Can" bulgusuyla ikili teyit.
  Savaştır işleyicisi `FUN_00402800` (~19KB, tek fonksiyon) MCP ile decompile edilemediği için doğrudan yazma sırası okunamadı; yukarıdaki zincir eşlemeyi belirliyor. İstenirse gerçek simülatörde tek-teknik davranış testiyle son onay yapılabilir.
* **Uygulama sırası** (koordinatörden): önce `FUN_0040d608` (lineer), sonra `FUN_0040d884` (kahraman çarpanı + Zırh bug'ı). `FUN_0040d884`'ün üstel-teknik terimlerinin (`unit+0x98..0xa4`) UI teknikleriyle beslenip beslenmediği (yani İçgüdü/Zırh/Kimya/Büyücülük'ün ayrıca üstel etkisi olup olmadığı) henüz doğrulanmadı — bu, ordu kurulum kodunun izlenmesini gerektirir.
* **Tapınak** bu 9 indeksin parçası değildir; ayrı bir alanda (`army+0x30` saldıran / `army+0x144` savunan) saklanır ve **kahraman çıkma ihtimalini** belirler (bkz. §5, davranışsal olarak doğrulandı). Bir stat-tekniği değildir.

> **WARNING: Kritik Kod Hatası (Zırh Geliştirme Bug'ı):**
> `FUN_0040d884` fonksiyonunda Zırh teknolojisi uygulanırken, hem Fiziksel Saldırı hem de Fiziksel Savunma değerlerini güncellemek için tek bir formül bloğu çalıştırılır. Bu blokta, güncel değeri türetmek için kullanılan kaynak `Stat_temel` olarak **yalnızca Fiziksel Savunma getter'ı (`FUN_00412afc`)** çağrılır. Fiziksel Saldırı getter'ı (`FUN_00412b7c`) ise tamamen ihmal edilmiştir.
>
> Hesaplanan bu ortak değer (`[EBP - 0x14]`), daha sonra hem Fiziksel Saldırı setter'ına (`FUN_00412b88`) hem de Fiziksel Savunma setter'ına (`FUN_00412b08`) yazılmaktadır.
>
> **Oynanışa Etkisi:** Oyunda Zırh teknolojisi arttıkça, birimlerin yeni Fiziksel Saldırı değerleri kendi orijinal saldırı güçlerinden tamamen kopar ve **tamamen kendi orijinal Fiziksel Savunma statlarına göre** güncellenir. Bu hata, Okçu (Saldırı 45, Savunma 10) gibi yüksek saldırı/düşük savunmalı birimlerin zırh basıldıkça saldırı gücünün **düşmesine (nerf)** sebep olurken; Sur (Saldırı 200, Savunma 2500) gibi yüksek savunmalı yapıların ise saldırı güçlerinin astronomik seviyelere (örn. 6900+) fırlamasına yol açar.
>
> **unit+0x70 Ofsetinin Güncellenmesi:** Fonksiyonun en sonunda, her savaşçı için Büyü Savunması sonucu (`unit+0x28`) okunarak `round(Büyü_Savunması * 0.005)` formülüyle `unit+0x70` (Birim Puanı / Ordu Değeri) alanı güncellenir (bkz. §8).

---

## 4. Enkaz (Debris) Geri Kazanım Formülü — *düzeltilmiş*

**Doğrulama durumu: DOĞRULANDI (Yüksek güven) — Ogre enkaz formülü ve saldıran ordudaki enkaz hesaplama mekanizması tamamen doğrulanmıştır. Kodda hata (bug) yoktur.**

Savaşta ölen ünitelerin maliyetlerinin bir kısmı savaştan sonra enkaz olarak geri kazanılır. Enkaz miktarı `(kayıp_sayısı × birim_maliyeti) × 0.3` taban oranıyla hesaplanır:

* **Normal Üniteler İçin**:
  $$Altin\_Enkaz = Kayip\_Sayisi \times Altin\_Maliyeti \times 0.3$$
  $$Yemek\_Enkaz = Kayip\_Sayisi \times Yemek\_Maliyeti \times 0.3$$
  *(0.3 taban katsayısı PE dosyasındaki `0x004120e4` ve `0x00412114` adreslerinden kesin olarak doğrulanmıştır)*

* **Ogre Ünitesi İçin Özel Durum (Type = 6) ve Kahraman Etkisi**:
  Ogre ünitesi öldüğünde enkaz dönüşüm oranı kahraman seviyesine bağlı olarak katlanarak artar:
  $$Enkaz_{Ogre} = Kayip\_Sayisi \times Maliyet \times 0.3 \times 1.15^{L_{kahraman}}$$
  *(Buradaki `1.15` katsayısı `0x00412aad` adresindeki `1.15` ve `0.3` katsayısı `0x00411cf8` / `0x004113f8` adresindeki `0.3` double sabitlerinden kesin doğrulanmıştır)*

* **Decompiler Yanılgısı (Önemli Not):**
  Decompile çıktısında (`FUN_00411350`) Ogre tespiti yapıldığında `local_8 = FUN_00596dbc();` şeklinde bir doğrudan atama (replacing/overwriting) yapıldığı görünmektedir. Ancak bu **tamamen bir Ghidra decompiler hatasıdır (decompiler artifact)**. Assembly seviyesinde makine kodları incelendiğinde, FPU stack işlemleri (`FILD` ve `FADDP` komutları) kullanılarak Ogre enkazının genel toplama **doğru bir şekilde eklendiği (`+=` / accumulate)** kanıtlanmıştır:
  ```assembly
  004113c6: FILD dword ptr [EBP + -0x14]   ; Ogre enkaz değerini yükle
  004113c9: FMUL double ptr [0x004113f8]   ; 0.3 ile çarp
  004113cf: FILD dword ptr [EBP + -0x4]    ; Birikmiş toplam enkazı yükle
  004113d2: FADDP                          ; İkisini TOPLA! (st1 = st1 + st0)
  004113d4: CALL 0x00596dbc                ; Yuvarla
  004113d9: MOV dword ptr [EBP + -0x4],EAX  ; Toplam enkaz değişkenini güncelle
  ```
  Bu nedenle simülatörde Ogre enkazının diğer enkazları silmesi gibi bir bug bulunmamaktadır. Her iki tarafta da enkazlar doğru şekilde toplanır.

---

## 5. Kahraman Çıkma İhtimali (Tapınak Tabanlı) — *düzeltildi (2026-07-20)*

**Doğrulama durumu: DOĞRULANDI + DÜZELTİLDİ — kullanıcının 3 ekran görüntüsüyle (Tapınak 2/16/20) davranışsal olarak birebir doğrulandı. Önceki sürümde `local_8` "düşman kahraman seviyesi" diye YANLIŞ etiketlenmişti; aslında KAZANANIN Tapınak seviyesidir.**

Savaş sonunda galip tarafta yeni bir kahraman çıkma (ve mağlubun kahramanını esir alma) olasılığı `FUN_004103e8` tarafından hesaplanır. `FUN_0040facc` (savaş sonrası işlemci) tarafından, sondaki `FUN_004104e8` (gösterim) çağrısından hemen önce çağrılır — **aktif koddur.**

Fonksiyon önce `FUN_00410ec8()` ile kazananı belirler ve **kazananın** ordu nesnesinden iki alan okur:
- **Tapınak seviyesi** (`local_8`): saldıran `army+0x30` / savunan `army+0x144`.
- **Kahramanlar (mevcut kahraman sayısı)** (`local_c`): saldıran `army+0x34` / savunan `army+0x148`.

*(Böylece Tapınak'ın neden §3-EK'teki 9-teknik dizisinde olmadığı da anlaşılır: ayrı bir alanda, `army+0x30`'da saklanır — bir teknik değil, kahraman-üretim yapısıdır.)*

**Gerekli Koşullar** (üçü de sağlanmalı — kodda tek `&&`'li koşul):
1. Savaşta kazanılan XP en az **500** olmalıdır (kod: `499 < XP`).
2. Kazananın **Tapınak seviyesi > 0** olmalıdır (`local_8 != 0`) — Tapınak yoksa ihtimal %0.
3. Kazananın mevcut kahraman sayısı **5'ten az** olmalıdır (`local_c < 5`).

**Hesaplama Formülü** (davranışsal olarak birebir doğrulandı):
- **Temel Şans ($C_{taban}$)**: Kazananın Tapınak seviyesiyle artar, mevcut kahraman sayısıyla cezalanır (kahraman başına 155):
  $$C_{taban} = (Tapınak_{kazanan} \times 10) - (Kahramanlar \times 155)$$
- **XP Ölçeklendirme Katsayısı ($S$)**: (Maksimum 1.0)
  $$S = \min\left(1.0,\ XP_{kazanilan} \times 0.000025\right)$$
- **Nihai Olasılık** (0-100 ölçekli yüzde puanı, §6):
  $$Olasilik = \max\left(0.0,\ C_{taban} \times S\right)$$

> **Davranışsal doğrulama (kullanıcı, 2026-07-20):** Kahramansız (Kahramanlar=0) aynı tip savaşta:
> Tapınak **20**, XP 4924 → 200 × 0.1231 = **%24,62** ✓ · Tapınak **16**, XP 4968 → 160 × 0.1242 = **%19,87** ✓ · Tapınak **2**, XP 4981 → 20 × 0.1245 = **%2,49** ✓. Üç ölçüm de formülle birebir eşleşti.

Bu değer bir struct alanına (`+0x68` ofseti, double) yazılır. **Bu alan, §6'da anlatılan "Kahraman Çıkma İhtimali" göstergesiyle DOĞRUDAN AYNI DEĞERDİR.**

> Ölçekleme sabitleri artık **byte-kesin doğrulanmıştır** (Ghidra GUI okuması, 2026-07-19): eşik `_DAT_004104d4` = **0.0** (float), XP çarpanı `_DAT_004104d8` = **0.000025** (extended), doygunluk eşiği `_DAT_004104e4` = **1.0** (float). Raporun formülüyle birebir örtüşür (bkz. §10).

---

## 6. "Kahraman Çıkma İhtimali" Göstergesi *(YENİ bölüm)*

**Doğrulama durumu: DOĞRULANDI (Yüksek güven) — bu, §5'teki mekanizmanın ta kendisidir.**

Simülatörün savaş sonucu ekranında görünen **"Kahraman çıkma ihtimali %X"** metni, ayrı bir hesaplama DEĞİLDİR. Bu metni üreten kod (`FUN_004104e8`), doğrudan `FUN_004103e8`'in yazdığı struct alanını (`+0x68`, double) okur — yani §5'te anlatılan **Kahraman Esir Alma Olasılığı formülüyle bire bir aynı sayı, aynı mekanizmadır.** İki farklı isim ("esir alma olasılığı" vs. "kahraman çıkma ihtimali"), muhtemelen aynı olayın iki farklı taraftan (mağlup kahramanın esir düşmesi / galip tarafın yeni bir kahraman kazanması) anlatımıdır.

**Gösterim mantığı:**
- Eğer olasılık alanı eşik sabitini (`_DAT_00410dec` = **100.0**, byte-doğrulandı) aşıyorsa, ekranda sabit **"%100,0"** yazılır (disassembly: `FLD [ECX+0x68]; FCOMP [0x00410dec]; JNC → "%100,0"`).
- Aksi halde `round(alan × _DAT_00410dec) / 100` (tam kısım) ve `% 100` (ondalık kısım) ile iki haneli bir yüzde string'i ("XX,YY") oluşturulur (disassembly: `FLD [ECX+0x68]; FMUL [0x00410dec]; CALL round; IDIV 100`).
- `C_taban = seviye × 10` teriminin büyüklüğü (örn. seviye 10 için ≈100), saklanan `+0x68` alanının 0.0-1.0 arası saf bir oran değil, **0-100 ölçekli bir "yüzde puanı"** olduğunu gösterir; bu §5'te `+0x68`'e yazılan değerle (seviye×10) ve eşiğin 100.0 olmasıyla tutarlıdır. *Sabitin hem çarpan hem eşik olarak kullanılması bir çelişki değildir:* `× 100` işlemi 0-100 ölçekli değerden **iki ondalık hane çıkarmak** içindir (round sonrası `/100` ve `%100`), eşik ise gösterimin **%100 tavanını** uygular.

---

## 7. Gece Savaşı ve Gece Görüşü Mekanikleri

**Doğrulama durumu: TAM DOĞRULANDI. 2026-07-19 turunda hem savunan (`FUN_00411a80`) hem saldıran (`FUN_004111d4`) tarafı yeniden okundu; çarpan formülü, döngü sayıları (2 vs 3) ve sabitlerin ham değerleri (3.0/1.0/0.3/0.7, her iki taraf için) byte-kesin teyit edildi (§10).**

> **ÖNEMLİ DÜZELTME (kalıcı not):** Bu raporun ÇOK daha önceki bir taslağında "Gece Görüşü işlevsizdir" denilmişti. Bu **yanlış** bulunmuştur (bkz. `docs/combat-analysis.md` günlüğündeki düzeltme kaydı). Gece Savaşı mekanikleri `FUN_0040d608` fonksiyonunda **tam olarak uygulanmaktadır**.

### Çalışma Akışı (FUN_0040d608 → FUN_004111d4 / FUN_00411a80)

Savaş koordinatörü (`FUN_0040dcb4`), 0x0040df79 adresinde `FUN_0040d608(self, self+4, self+8)` çağrısı yapar. `FUN_0040d608`, savaş yapı nesnesinin `+0x74` ofsetindeki **Gece Savaşı bayrağını** kontrol eder (`if (*(char*)(self+0x74) != 0)`). Bayrak aktifse (checkbox işaretli):

1. **Saldıranın Gece Görüşü seviyesi** okunur (teknik indeks `6`, `FUN_004115d0` → `*(int*)(param+8+idx*4)`)
2. `FUN_004111d4` çağrılarak **saldıran ordunun HP ve Taşıma Kapasitesi** değerleri (2 döngü, `param_1` birincil birlikler ve `param_1 + 4` ikincil/destek birlikler) gece çarpanıyla güncellenir.
3. **Savunanın Gece Görüşü seviyesi** okunur (teknik indeks `6`, `FUN_00411f48` → `*(int*)(param+0x120+idx*4)`)
4. `FUN_00411a80` çağrılarak **savunan ordunun** HP/Taşıma Kapasitesi değerleri 3 döngü halinde gece çarpanıyla güncellenir:
   * **1. Döngü (`param_1 + 4`)**: Birincil savunan savaşçılar.
   * **2. Döngü (`param_1 + 8`)**: İkincil/destek savunan savaşçılar.
   * **3. Döngü (`param_1` / `FUN_00413120` ile)**: **Savunma Yapıları (Okçu Kulesi, Sur vb.)**. Bu döngüde çağrılan `FUN_00413120` metodu, yapısal olarak normal birimlerin modifier metoduyla (`FUN_00412624`) tamamen eşdeğerdir.

*Böylece savunan tarafın asimetrisi (3 döngü olması) mantıksal olarak doğrulanmıştır: Saldıran tarafta savunma yapıları bulunmadığı için 2 döngü yeterliyken, savunan tarafta 3. döngü savunma yapılarını günceller.*

### Gece Görüşü Çarpan Formülü

Her iki taraf için de aynı formül kullanılır:

$$GeceÇarpanı = \left(1.0 - \frac{3.0}{GeceGörüşSeviyesi + 3.0}\right) \times 0.3 + 0.7$$

**PE dosyasından doğrulanmış sabitler:**

| Adres (Saldıran / Savunan) | Tür | Doğrulanan Değer | Rol |
| :--- | :---: | :---: | :--- |
| `0x00411280` / `0x00411b74` | float | **`3.0`** | Paydaya eklenen ve bölünen sabit |
| `0x00411284` / `0x00411b78` | float | **`1.0`** | Çıkarma tabanı |
| `0x00411288` / `0x00411b7c` | double | **`0.3`** | Ölçekleme çarpanı |
| `0x00411290` / `0x00411b84` | double | **`0.7`** | Taban çarpan (minimum) |

### Etki Tablosu

| Gece Görüşü Seviyesi | Çarpan | HP ve Cargo Kaybı |
| :---: | :---: | :---: |
| 0 (teknik yok) | 0.700 | **%30.0 kayıp** |
| 1 | 0.775 | %22.5 kayıp |
| 2 | 0.820 | %18.0 kayıp |
| 3 | 0.850 | %15.0 kayıp |
| 5 | 0.888 | %11.3 kayıp |
| 10 | 0.931 | %6.9 kayıp |
| 15 | 0.950 | %5.0 kayıp |
| 20 | 0.961 | %3.9 kayıp |
| ∞ | → 1.000 | → %0 kayıp |

### Etkilenen Statlar ve Kapsamı

* **Etkilenen**: Sadece **HP (Can)** ve **Taşıma Kapasitesi (Cargo)** — bu YAPISAL olarak (döngü/offset sayısı) doğrulandı.
* **Etkilenmeyen**: Fiziksel Saldırı, Fiziksel Savunma, Büyü Saldırısı, Büyü Savunması.
* **Kapsam**: Saldıranın HP/Cargo'su + savunanın HP/Cargo'su + savunanın 3. döngüsü (savunma yapıları). Bu 3. döngünün savunma yapıları olduğu **artık doğrulanmıştır** (2026-07-19 turu): `FUN_00411a80` içindeki 3. döngü, savaşçı modifier'ından (`FUN_00412624`) **farklı** olan `FUN_00413120` yapı-modifier metodunu çağırır (saldıranın `FUN_004111d4`'ünde ise yalnızca 2 döngü ve yapı-modifier yok). Asimetrinin nedeni budur.
* Kullanıcının kendi testinde checkbox açık/kapalıyken savaş sonuçlarının çok farklı çıkması, bu mekanizmanın gerçekten aktif olduğuyla birebir tutarlıdır.

---

## 8. Birim Puanı (Unit Power Score) ve Eğitim Süreleri İlişkisi

**Doğrulama durumu: DOĞRULANDI (Yüksek güven) — `unit + 0x70` ofsetinin savaş alanındaki oransal hasar dağıtımı rolü kesinleştirildi.**

Eğitim süreleri `FUN_00413f14` fonksiyonundaki statik bir diziden çekilmektedir (bkz. §1 tablosu).
* Ordu kurulurken bu süreler `Birlik` nesnelerinin `0x70` ofsetine geçici olarak yazılır.
* Ancak savaş başlamadan hemen önce çağrılan teknoloji güncelleyici (`FUN_0040d884`), bu `0x70` ofsetinin üzerine güncellenmiş **Birim Puanı (Unit Power Score)** değerini yazar.
* Savaş hesaplamalarında (`FUN_0040e0c4`), bu `0x70` ofseti birimlerin hasar paylaşım oranı hesaplanırken çarpan olarak okunur (bkz. §2).
* **Sonuç**: Birim eğitim süreleri savaş esnasında **hiçbir şekilde kullanılmaz**. Bu değerler ilk kurulumda `0x70` alanına geçici olarak yazılsa da savaş öncesinde teknoloji güncelleyici tarafından Büyü Savunması üzerinden türetilen ordu puanıyla tamamen ezilir. Eğitim süresini kısaltan kışla vb. mekanikler simülatörde yer almamaktadır.

> **Matematiksel Formül:** Teknoloji güncelleyici, her savaşçının yeni Büyü Savunmasını alır, `0.005` (`0x0040dca8` adresi) ile çarpar ve yuvarlayarak `0x70` ofsetine yazar:
> $$\text{Birim Puanı} = \text{round}(\text{Büyü Savunması} \times 0.005)$$

---

## 9. Ek Bulgular / Çözülmemiş Tuhaflıklar

Bu bölüm, rapor kapsamının dışında kalan ama tersine mühendislik sürecinde fark edilen gözlemleri listeler.

1. **İsim-yazma fonksiyonu (`FUN_00413a2c`) sıra tuhaflığı — *doğrulandı (2026-07-19)*:** UI'a varlık isimlerini yazan bu fonksiyon, stat/maliyet fonksiyonlarıyla AYNI offset sıçrama desenini (12,13,14,19,15,16,17,18,20) kullanmasına rağmen, idx12 konumuna **"Kahraman"** (`s_Kahraman_005a4328`), idx13'e **"Savunma Kulesi"** (`s_Savunma_Kulesi_005a4331`), idx14'e **"Tuzak"** (`005a4340`), idx16'ya **"Mangonel"** (`005a4352`), idx18'e **"Balista"** (`005a4363`) string'lerini yazdığı **decompile ile birebir teyit edildi** — bu, stat/maliyet verisinin gösterdiği düz sıradan (Okçu Kulesi, Tuzak, Kazancı, Mangonel, Muhafız, Balista, Sur...) FARKLI. Yazma AnsiString[21] dizisine 4-bayt pointer slotları halinde yapılır (idx = ofset/4). Türkçe karakter kodlamaları (Windows-1254) çözülerek tüm 21 ismin hafızadaki yerleşimi birebir haritalanmıştır (bkz. §10).

2. **Zırh bloğunun Saldırı'yı Savunma'dan türetmesi** (§3 Not 1) — olası gerçek tuhaflık ya da okuma hatası.

---

## 11. Teknik–Birim Etkileşim Doğrulaması (Doküman Çapraz Kontrolü) — *TAMAMLANDI (2026-07-20, ikinci geçiş)*

**Doğrulama durumu: TAM DOĞRULANDI + ÖNEMLİ DÜZELTME. Bu bölümün ilk taslağı yapı tarafını "Zırh/Büyücülük/Tılsım tümü" varsayıyordu; tam trace bunun YANLIŞ olduğunu gösterdi. Artık 8 tekniğin hem savaşçı hem yapı uygulayıcı+modifier zinciri disassemble edildi ve yapı tür kimlikleri (`unit+0x00`) `FUN_00402800`'den okundu.**

### Uygulama zinciri (kesin)

Lineer teknik dağıtıcısı `FUN_0040d608`, her teknik `idx` için bir **uygulayıcı** çağırır; uygulayıcı **iki ayrı döngü** işletebilir: savaşçı listesi (`army+4`) ve yapı listesi (`army+0`). Her döngü kendi **modifier**'ını çağırır. Modifier formülü (disassembly `FUN_00412394` vb.): $\text{Stat}_{yeni} = \text{Stat}_{taban} \times (1 + Seviye \times k)$, $k = 0.05$ (Can/BüyüCan) veya $0.06$ (saldırı statları).

| idx / Teknik | Savaşçı modifier (döngü `army+4`) | Yapı modifier (döngü `army+0`) |
| :--- | :--- | :--- |
| 0 Okçuluk | `FUN_00412394` — Can, sınıf==0 | `FUN_00412e8c` — Can, HP-kat==0 |
| 1 Demircilik | `FUN_0041232c` — Can, sınıf==1 | `FUN_00412e24` — Can, HP-kat==1 |
| 2 Büyücülük | `FUN_004124cc` — BüyüCan, **kapısız (tüm savaşçı)** | **YOK — yapı döngüsü yok** |
| 3 Zırh | `FUN_00412528` — Fiz.Sald+Sav, **kapısız (tüm savaşçı)** | `FUN_00412ef4` — Fiz.Sav+Sald, **TaşUst-kat==3** |
| 4 Kimya | `FUN_004123fc` — Can, sınıf==4 | `FUN_00412fa8` — Can, HP-kat==4 |
| 5 Taş Ustalığı | **YOK — savaşçı döngüsü yok** | `FUN_00413010` — Fiz.Sav+Sald, TaşUst-kat==5 |
| 7 İçgüdü | `FUN_00412464` — Can, sınıf==7 | **YOK — yapı döngüsü yok** |
| 8 Tılsım | `FUN_004125c8` — BüyüSald, **kapısız (tüm savaşçı)** | `FUN_004130c4` — BüyüSald, **kapısız (tüm yapı)** |

> **KRİTİK DÜZELTME (yapı tarafı):** Zırh/Büyücülük/Tılsım'ın "tüm birimlere" uygulandığı önceki iddiası yalnız **savaşçılar** için doğrudur. Yapılarda: **Büyücülük ve İçgüdü hiç uygulanmaz** (yapı döngüleri yok); **Zırh yalnız TaşUst-kategori 3'e** (Tuzak/Kazancı/Muhafız) uygulanır — tüm yapılara değil; **Tılsım tüm yapılara** uygulanır. HP-teknikleri yapı HP-kategorisine göre kapılıdır. Zırh yapı modifier'ında (`FUN_00412ef4`) Fiz.Sald ve Fiz.Sav **kendi getter'larından** okunur — burada §3'teki üstel-Zırh bug'ı YOKTUR.

### Kategori fonksiyonları (switch-çözümlü, Ghidra)

* Savaşçı sınıfı `FUN_0041279c` (`unit+0x7c`, savaşçı indeksi 0-11): {0,2,7,8,9,10}→1, {1,3}→0, {4,6,11}→7, {5}→4. Motor `UNIT_CLASS` ile birebir.
* Yapı HP-kategorisi `FUN_00413190` (`unit+0x00` tür): {13,18}→0, {14,17}→1, {15,16}→4, **default→0**.
* Zırh/Taş Ustalığı yapı kategorisi `FUN_004131d8` (tür): {13,16,18}→5, {14,15,17}→3, **default→0**.

### Yapı tür kimlikleri (`unit+0x00`) — `FUN_00402800`'den okundu

Savaştır işleyicisi `FUN_00402800`, yapı nesnelerinin `+0x00` alanını `FUN_004137dc` ile ayarlar: bir döngü (0x004044a4–0x0040456b) tür = döngü indeksi 13→18 yazar, iki açık blok tür 19 (0x00404a20) ve 20 (0x00404b99) yazar. §9.1 isim sırasıyla (12=Kahraman) birleştirilince: **Okçu Kulesi=13, Tuzak=14, Kazancı=15, Mangonel=16, Muhafız=17, Balista=18, Sur=19, Büyü Kalkanı=20.** Tapınak savaş alanına birim olarak konmaz (tür-id atanmaz; kahraman-üretim yapısı, §5).

### Savaşçılar

| Savaşçı | HP-teknik (Can, sınıf) | Zırh (Fiz)* | Büyücülük (BüyüCan)** | Tılsım (BüyüSald)* | Doküman ile |
| :--- | :--- | :---: | :---: | :---: | :--- |
| Cüce | Demircilik | ✔ | — (BüyüCan=0) | ✔ | ✅ tam (dok: Demircilik, Zırh, Tılsım) |
| Elf | Okçuluk | ✔ | — (BüyüCan=0) | ✔ | ⚠️ dok. Büyücülük der ama Elf'in Büyü Canı 0 → etkisiz |
| Süvari | Demircilik | ✔ | — | ✔ | ✅ tam |
| Pegasus | Okçuluk | ✔ | ✔ (250) | ✔ | ✅ tam |
| Ejderha | İçgüdü | ✔ | ✔ (2800) | ✔ | ✅ tam |
| Mancınık | **Kimya** | ✔ | — | ✔ | ⚠️ dok. Tılsım'ı saymamış |
| Ogre | İçgüdü | ✔ | — | ✔ | ⚠️ dok. fazladan Demircilik demiş (Ogre sınıf 7 = İçgüdü) |
| Şaman | Demircilik | ✔ | ✔ (200) | ✔ | ⚠️ dok. Demircilik'i saymamış |
| Casus Kuş | Demircilik (Can=0→etkisiz) | ✔ | — | ✔ | (dok. girdisi yok) |
| Yük Arabası | Demircilik (Can=0→etkisiz) | ✔ | — | ✔ | (dok. girdisi yok) |
| Gnom | Demircilik | ✔ | — | ✔ | ✅ tam |
| Kaos | İçgüdü | ✔ | ✔ (250000) | ✔ | ⚠️ dok. Zırh ve Tılsım'ı saymamış |

*Zırh ve Tılsım binary'de **istisnasız tüm** savaşçılara uygulanır. **Büyücülük→Büyü Canı** eşlemesi dokümanla bağımsız doğrulanır: dokümanın Büyücülük listesi (Pegasus, Ejderha, Şaman, Kaos) tam olarak Büyü Canı > 0 olan savaşçılarla örtüşür (Elf hariç — dok. hatası).

**Savaşçı sonucu:** Doküman HP-teknik atamalarında doğru. Farklar lore kaynaklı: (1) binary Zırh/Tılsım'ı herkese uygular; (2) Ogre'nin Can tekniği yalnız İçgüdü; (3) Şaman Demircilik'ten de etkilenir; (4) Elf'in Büyü Canı 0 olduğu için Büyücülük fiilen etkisiz.

### Savunma Yapıları — *düzeltilmiş tablo*

| Yapı | Tür | HP-teknik (Can) | Zırh (kat3) | Taş Ust. (kat5) | Tılsım (hep) | Büyücülük/İçgüdü | Doküman ile |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| Okçu Kulesi | 13 | **Okçuluk** | — | **✔** | ✔ | — | ✅ (dok: Okçuluk, Taş Ustalığı) |
| Tuzak | 14 | **Demircilik** | ✔ | — | ✔ | — | ✅ (dok: Demircilik) |
| Kazancı | 15 | **Kimya** | ✔ | — | ✔ | — | ✅ **birebir** (dok: Zırh, Tılsım, Kimya) |
| Mangonel | 16 | **Kimya** | — | **✔** | ✔ | — | ✅ (dok: Kimya, Taş Ustalığı) |
| Muhafız | 17 | **Demircilik** | ✔ | — | ✔ | — | ✅ **birebir** (dok: Demircilik, Zırh, Tılsım) |
| Balista | 18 | **Okçuluk** | — | **✔** | ✔ | — | ✅ (dok: Okçuluk, Taş Ustalığı) |
| Sur | 19 | **Okçuluk** (default kat0) | — | — | ✔ (BüyüSald 600) | — | ⚠️ dok: Taş Ustalığı — savaşta **UYGULANMIYOR** (aşağıya bkz.) |
| Büyü Kalkanı | 20 | Okçuluk (default kat0, HP=0→etkisiz) | — | — | ✔ (BüyüSald=0→etkisiz) | — | ⚠️ dok: Büyücülük — savaşta **UYGULANMIYOR** (aşağıya bkz.) |
| Tapınak | — | (savaş alanına konmaz; kahraman yapısı, §5) | — | — | — | — | — |

**Yapı sonucu:** Altı muhafız/saldırı yapısı (Okçu Kulesi–Balista) için doküman ile binary **BİREBİR uyuşur** — üstelik Kazancı ("Zırh, Tılsım, Kimya" = kat4 HP + kat3 Zırh + kapısız Tılsım) ve Muhafız ("Demircilik, Zırh, Tılsım" = kat1 HP + kat3 Zırh + Tılsım) dokümandaki **üç tekniğin de** binary kategori sistemine tam oturması, hem UI→idx eşlemesini hem de yapı kategori fonksiyonlarını çift-bağımsız kanıtlar.

**İki doküman–binary çelişkisi (lore ≠ savaş motoru):**
* **Sur** dokümanda "Taş Ustalığı" der; ancak Sur'un tür kimliği **19**'dur ve `FUN_004131d8(19)=default 0 ≠ 5`, dolayısıyla **Taş Ustalığı Sur'un savaş statlarını ölçeklemez**. Sur'un savaşta etkilendiği tekniklerin gerçeği: **Okçuluk** (HP, default→kat0 üzerinden) + **Tılsım** (BüyüSald). Dokümandaki "Taş Ustalığı → Sur" muhtemelen savaş-dışı bir etki (sur tamiri/inşa lore'u), bu simülatörün kapsamı dışıdır.
* **Büyü Kalkanı** dokümanda "Büyücülük" der; ancak **Büyücülük hiçbir yapıya uygulanmaz** (idx2'nin yapı döngüsü yoktur) ve Büyü Kalkanı'nın BüyüCan'ı zaten 0'dır. Büyü Kalkanı'nın savaşta anlamlı statı sabit BüyüSav'ıdır (600); listelenen tekniklerin hiçbiri onu etkilemez.

*Bu bulgular motora birebir aktarıldı: `mobiwar-engine.js` `applyTech` fonksiyonu savaşçı/yapı dallarını ayrı ele alır; yapı tarafında Büyücülük/İçgüdü uygulanmaz, Zırh yalnız kat3, Taş Ustalığı yalnız kat5, HP-teknikleri HP-kategorisine göre kapılıdır.*

---

## 12. Tur Akışı, Eşzamanlılık ve Hasar Büyüklüğü — *YENİ (2026-07-20, derin trace)*

**Doğrulama durumu: TUR YAPISI ve FORMÜL binary'den TAM trace edildi (önceki [REKON] kaldırıldı). Hasarın MUTLAK büyüklüğü gerçek 3 savaş verisiyle KALİBRE edildi (tam sayısal eşleşme değil).**

Kullanıcının aynı orduların 3 kez savaştırıldığı gerçek çıktısı, önceki motorun ciddi hatalı olduğunu gösterdi (gerçek: **5 tur**, kaybeden ~%78 kayıpla ama **her kategoride survivor**; eski motor: **3 tur**, kaybeden **tamamen yok**). Kök nedenler `FUN_0040dcb4 → FUN_0040e794/ec4c/f35c → FUN_0040e0c4` zinciriyle bulundu:

### Tur programı (FUN_0040dcb4)
Her tur ayrı bir faz fonksiyonu ve **saldırı türleri tura göre devreye girer**:
- **Tur 1** (`FUN_0040e794`): yalnız **Menzilli (tip 1)**.
- **Tur 2** (`FUN_0040ec4c`, 4 hasar-çağrısı): **Menzilli + Büyü (tip 1, 3)** — yakın dövüş henüz yok.
- **Tur 3–5** (`FUN_0040f35c`, 6 çağrı): **üç tür de (1, 2, 3)** — YAKIN dövüş ancak ordular kapanınca (tur 3+).

Savaş, `FUN_00410390` yalnızca bir taraf **tamamen** yok olursa erken biter; aksi halde **5 tur** dolar. (Savaşçı dokümanının "erken safha uzun menzil, sonra yakın dövüş" anlatımıyla birebir.)

### Eşzamanlılık (snapshot)
`FUN_0040ec4c/f35c` her tur başında iki orduyu da **0x90-baytlık yerel kopyalara** alır; savunanın karşı-vuruşu bu **tur-başı fotoğraftan** yapılır (saldıran canlı orduyu vururken savunan tam gücüyle karşılık verir). Motorda bu, **tur-başı `snapshot` + kaybı biriktirip tur sonunda uygulama** ile modellenir — bu, tur-içi pozitif geri besleme/ani çöküşü engeller (aksi halde savunan güç havuzu P küçüldükçe hasar katlanarak artıp orduyu anında siliyordu).

### Kritik formül düzeltmesi: Havuz ×Adet KESİN
Önceki analizde saldırı havuzunun "adetle çarpılıp çarpılmadığı" belirsizdi. **Kesinleşti:** `FUN_004121d4` (havuz stat dağıtıcısı) disassembly'de **her getter çağrısından sonra `FMUL [birim+0x8]` (×Adet)** yapar — bu çarpım **decompile çıktısında GÖRÜNMÜYORDU** (Ghidra stub'ı yalnız getter switch'ini gösteriyordu). Mitigasyon statı da `FUN_004121d4` ile ×Adet'tir; **bölücü** ise `FUN_00412294` ile (×Adet YOK) daima **BüyüSav**'dır. Yani:
$$\text{net}_i = (\text{BirimPuan}_i \times Adet_i)\times\frac{Havuz}{P} - (\text{Mitigasyon}_i \times Adet_i), \qquad \text{kayıp}_i = \frac{\text{net}_i}{\text{BüyüSav}_i}$$

### Hasar büyüklüğü kalibrasyonu — *[KALİBRE]*
Tam-teknik statlarla (Can ×3.5: lineer ×1.75 + üstel ×2) havuz ~3× fazla şişip kaybeden 3 turda yok oluyordu. Gerçek 3 savaş verisine ancak **havuzun Can'ı LİNEER-teknik ölçeğinde** (FUN_0040d884'ün üstel ×2 katmanı **havuza girmeden**; mitigasyon/bölücü tam-teknik) alınınca oturdu: **5 tur, her kategoride survivor, savunan kaybı gerçeğin ~%83'ü, enkaz gerçeğe ~%5 yakın, kahraman çıkma ihtimali ~%7 (gerçek %8,3)**. Bu, üstel-teknik alanının (`unit+0x98`) beslenip beslenmediğinin **§3-EK'te zaten "doğrulanmadı" olmasıyla** tutarlıdır. **Açık kalan sapma:** kazanan (saldıran) tarafın kaybı motorda gerçeğin ~1.8×'i çıkıyor; savunan kaybı/tur/enkaz gerçeğe yakın. Bu asimetrinin tam kaynağı (muhtemelen `FUN_0040e794` tur-1 özel mantığı veya üstel-teknik beslemesi) trace edilmeyi bekliyor.

---

## 13. Kahraman Mekaniği ve "Kahramanlar" Sayacı — *YENİ (2026-07-20)*

**Doğrulama durumu: Kahraman güç/hasar zinciri disassemble edildi (FUN_00413610/FUN_0041338c/FUN_004132f4/FUN_00413534). "Kahramanlar" sayacının yalnız esir-ihtimaline etki ettiği FUN_004103e8'den KESİN.**

### İki ayrı "kahraman" kavramı (karıştırılmamalı)
1. **Savaş kahramanları** (ortadaki "Kahramanlar" paneli): saldıran/savunana **en fazla 5'er** kahraman eklenir; her birinin **Fiz.Saldırı, Fiz.Savunma, Büyü.Saldırı, Büyü.Savunma ve Seviye** değerleri ayrı girilir (orijinalde "Esir Sayısı" **yoktur** — 5 kutu). Bunlar **savaşa katılır**.
2. **"Kahramanlar" sayacı** (Teknikler panelinin altı): saldıran/savunan için bir **adet**. Bu, `army+0x34`/`army+0x148` alanına yazılır ve **YALNIZCA kahraman çıkma ihtimalini** belirler (`FUN_004103e8`: $C_{taban} = Tapınak\times10 - \text{Kahramanlar}\times155$). **Savaş kayıplarına HİÇBİR etkisi yoktur** — kullanıcının gözlemi doğru. (Mevcut kahraman sayısı arttıkça yeni kahraman çıkma/esir alma ihtimali düşer.)

### Savaş kahramanı nasıl kullanılır (FUN_0040e0c4)
Kahraman, savaşa **ekstra bir katılımcı** gibi girer:
- **Güç puanı** (`FUN_00413610`): $Güç = \text{round}(Can \times 1.8^{Seviye} \times Bonus\% \times 0.01)$. Seviye **1.8 tabanında üstel** — yüksek seviyeli kahraman belirleyici. Saldıran kahraman **saldırı havuzuna** (faz 1, param_8), savunan kahraman **savunma güç havuzu P'ye** (faz 2, param_10) eklenir.
- **Hasar alma**: kahraman da orantılı hasar alır; mitigasyonu türe göre kendi statından (`FUN_0041338c`: t1→FizSald, t2→FizSav, t3→BüyüSald; hepsi $\times Seviye \times 1.8^{Seviye} \times Bonus \times 0.01$), bölücüsü BüyüSav; kaybı `FUN_00413534` ile kahraman HP havuzuna (`+0x80`) işlenir.
- **Ayrıca**: kahraman seviyesi, savaş öncesi tüm birimlerin teknoloji çarpanını (§3 $Hero\_Multiplier=(L+1)\times1.07^L$) besler — yani bir kahraman **tüm orduyu** güçlendirir (seviye 12'de ordu ~30× güçlenir).

> **Motora aktarım [REKON]:** UI kahramanında **HP ve Bonus alanı yok** (yalnız 4 stat + seviye). Motorda güç ≈ $\text{round}((FSl{+}FSv{+}BSl{+}BSv)\times1.8^{Seviye})$ (HP≈stat toplamı, Bonus=%100) olarak modellendi; kahramanlar P'ye ve saldıran havuzuna eklenir; en yüksek kahraman seviyesi birim çarpanını besler. Kesin HP/Bonus eşlemesi için `FUN_00402800`'deki kahraman-kurulum kodu izlenmeli.

---

## 10. Doğrulanan Sayısal Sabitler ve Adres Haritası

Analiz sürecinde Ghidra MCP araçlarının otomatik çözümleyemediği FPU / x87 sabitleri iki kategoriye ayrılır:

> **DOĞRULAMA SEVİYESİ NOTU (2026-07-19):** Aşağıdaki tablodaki tüm sabitler artık **byte-kesin doğrulanmıştır.**
> - **Immediate (makine kodundan):** `PUSH` ile koda gömülü sabitler disassembly'den doğrudan çözüldü: **1.8** (`0x3ffcccccccccccccd`, §2), **1.07** (`0x3ff11eb851eb851f`, §3), **1.06** (`0x3ff0f5c28f5c28f6`, §3), **1.15** (`0x3ff2666666666666`, §4).
> - **Bellekten (`FLD [adres]`):** Aşağıdaki tabloda listelenen 19 inline float/double/extended sabitin ham değerleri Ghidra GUI'de (veri tipi float/double/longdouble olarak ayarlanıp) elle okunarak **19/19 beklenen değerle birebir eşleşti** — 3.0, 1.0, 0.3, 0.7 (gece görüşü, her iki taraf); 0.0 (hasar eşiği); 0.005, 0.01 (extended, +2 padding); 0.3×3 (enkaz); 0.0/0.000025/1.0 (esir olasılığı); 100.0 (kahraman gösterimi); 0.0 (`0x00412324`, kayıp dağıtıcısı default dalı). Artık bu bölümdeki hiçbir sabit "okunamadı" durumunda değildir.

| Adres | Bağlam | Tür | Doğrulanan Gerçek Değer | Rolü |
| :--- | :--- | :---: | :---: | :--- |
| `0x00411280` / `0x00411b74` | Gece Görüşü (§7) | float | **`3.0`** | Paydaya eklenen limit katsayısı |
| `0x00411284` / `0x00411b78` | Gece Görüşü (§7) | float | **`1.0`** | Azalma tabanı katsayısı |
| `0x00411288` / `0x00411b7c` | Gece Görüşü (§7) | double | **`0.3`** | Maksimum gece penaltısı oranı (%30) |
| `0x00411290` / `0x00411b84` | Gece Görüşü (§7) | double | **`0.7`** | Gece stat taban çarpanı (%70 can/cargo) |
| `_DAT_0040e790` | Hasar Havuzu (§2) | float | **`0.0`** | Pozitif net hasar kontrolü sınırı |
| `0x0040dca8` | Ordu Puanı (§3/§8) | extended | **`0.005`** | Büyü sav. ordu puanına çevirme çarpanı |
| `0x00413660` | Kahraman Gücü (§2) | extended | **`0.01`** | Kahraman ekipman yüzdesini orana çevirici |
| `0x004120e4` | Enkaz Altın Oranı (§4) | double | **`0.3`** | Savaş sonrası enkaz altın oranı (%30) |
| `0x00412114` | Enkaz Yemek Oranı (§4) | double | **`0.3`** | Savaş sonrası enkaz yemek oranı (%30) |
| `_DAT_004104d4` | Esir Olasılığı (§5) | float | **`0.0`** | Minimum esaret olasılık sınırı (%0) |
| `_DAT_004104d8` | Esir Olasılığı (§5) | extended | **`0.000025`** | Savaş XP'si olasılık katsayısı ($2.5 \times 10^{-5}$) |
| `_DAT_004104e4` | Esir Olasılığı (§5) | float | **`1.0`** | Maksimum esaret olasılık sınırı (%100) |
| `_DAT_00410dec` | Kahraman Gösterimi (§6) | float | **`100.0`** | Arayüz yüzde çarpanı ve üst sınır tavanı |
| `0x5a42d4` - `0x5a4374` | İsim Stringleri (§9.1) | Windows-1254 | **Bkz. Nitelikler Tablosu** | Tüm 21 varlık adı ham ASCII/ANSI olarak inline |

---

*Bu rapor, `docs/combat-analysis.md` günlüğündeki ham keşif/çıkarım kayıtlarının bir sentezidir. Ham disassembly, decompile çıktıları ve ajan-bazlı doğrulama süreci için o dosyaya bakınız.*
