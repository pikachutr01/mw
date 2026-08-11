# SUR — motor ile binary neden ayrışıyor (2026-08-12)

Tetikleyen ölçüm: kullanıcının rastgele kurduğu büyük savaş. **Savaşın geri kalanı tuttu, tek
sapan Sur.**

| | binary | motor | fark |
|---|---:|---:|---:|
| saldıran kaybı | 25.629 | 25.654 | +%0,10 |
| savunan kaybı | 18.408 | 18.310 | −%0,53 |
| enkaz (altın) | 66.382.961 | 66.239.897 | −%0,22 |
| kahraman XP | 26.809 | 26.414 | −%1,5 |
| kahraman çıkma | %33,51 | %33,05 | ✓ |
| **Sur sv10** | **%53,59** | **%100** | ⛔ |

### Seviye taraması — eğri ~6 seviye kaymış

| sv | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **motor** | 0 | 32,1 | 66,0 | 82,9 | 90,9 | 95,3 | 98,4 | **100** | **100** |
| **binary** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **15,19** | **53,59** |

---

## 1. Formül YANLIŞ DEĞİL — Ghidra'da satır satır doğrulandı

Sapmayı formülde aramak boşuna; zincirin tamamı okundu ve motorla **birebir** aynı:

| binary | ne yapıyor | motor karşılığı |
|---|---|---|
| `FUN_00413610` | `(int)( 1,8^Sv × [obj+0xc] × durum × C )` — `[obj+0xc]` **Alan**, `FILD` ile int okunuyor | `gradePower` ✅ |
| `FUN_0041338c` | `stat × Sv × 1,8^Sv × durum × C`; dağıtıcı 3=pAtk · 4=pDef · 5=mAtk · 6=mDef | `gradeStat` ✅ |
| `FUN_0040e0c4` @0x40e628 | `net = güç × havuz/P − gradeStat(pAtk)` · `düşüş = net / gradeStat(mDef)` | `gradeTakeHit` ✅ |
| `FUN_00413534` | `durum -= 100 × düşüş`, 0'ın altında kırpar | ✅ |

`1,8` sabiti de birebir: `0x3FFCCCCCCCCCCCCD`.

### ⭐⭐ Bunun sonucu: `1,8^Sv` ve `durum` SADELEŞİYOR

Hem pay hem payda `Sv × 1,8^Sv × durum` taşıdığı için faz başına düşüş şuna iniyor:

```
        düşüş  =  100 × (Alan/mDef) × (havuz/P) / Sv   −   100 × (pAtk_ölçekli/mDef)
```

⇒ Sur'un davranışını **yalnız iki oran** belirliyor: `Alan/mDef` ve `pAtk_ölçekli/mDef`.
Başka hiçbir şey — seviye üssü bile — girmiyor.

**Ölçülerek doğrulandı:** `cfg.wall.base` 1,5 · 1,8 · 2,5 yapıldığında Sur bütünlüğü
82,90 · 82,94 · 83,08 çıkıyor — yani ⚠️ **`wall.base` Sur'un yıpranmasında ÖLÜ BİR DÜĞME.**
(Yalnız Sur'un P'ye kattığı güç üzerinden birim kayıplarını dolaylı oynatıyor.)

---

## 2. ⚠️ Taş Ustalığı sorumlu mu? — KISMEN, ama tek başına açıklamıyor

Kullanıcının sorusu. Ölçtüm: aynı savaşta Taş Ustalığı'nı **0** yapınca

| sv | TU 0 | TU 17 | binary |
|---:|---:|---:|---:|
| 7 | 87,83 | 98,38 | **0** |
| 8 | 91,57 | 100,00 | **15,19** |
| 10 | 95,76 | 100,00 | **53,59** |

⭐ Taş Ustalığı ~10 puanlık pay taşıyor (formüldeki ikinci terimi büyütüyor) ama açık **~88
puan**. Yani sezgi doğru yönde, sebep değil.

---

## 3. ⭐⭐⭐ Gerçek sebep: Sur'un STATLARI

Formül doğru + `base` etkisiz ⇒ geriye tek olasılık kalıyor. Ve Sur, katalogdaki **belgelenmiş
kaynağı olmayan tek satır**:

```
d('wall', 'Sur', 2,  hp 0, mhp 0, carry 0, pAtk 50, pDef 50, mAtk 0, mDef 600, area 300)
```

⚠️ Diğer bütün birimlerin statları ölçülmüş/doğrulanmış sayılar (Okçu Kulesi 12/6/19/325/24,
Mangonel Kulesi 192/96/120/3744/257 …). Sur'unkiler **yuvarlak ve kaynaksız**: 50/50/600/300.
`units.ts`teki yorum da yalnız FİYATIN değiştiğini anlatıyor, statların nereden geldiğini değil.

**Sayısal uyum araması** (binary'nin üç çapasına: sv7=0 · sv8=15,19 · sv10=53,59):

| | bugün | uyum |
|---|---:|---:|
| `Alan / mDef` | **0,500** | **≈ 2,5** (5 kat) |
| `pAtk_ölçekli / mDef` | 0,168 | ≈ 0,20 |

⚠️ **Bu bir UYDURMA (fit), okuma değil — o yüzden kataloğa YAZILMADI.** İki serbest parametreyi
üç çapaya oturtmak, geçen turların dersine göre yeterli kanıt değil. Aşağıdaki set ikisini
**birbirinden ayırarak** ölçer.

⭐ Bir gözlem: `Alan/mDef` oranı oyundaki **her** birimde 0,05-0,07 bandında (Cüce 0,049 ·
Ejderha 0,058 · Balista 0,054 · Mangonel Kulesi 0,069). Sur'un **0,5**'i bandın 10 katı, aranan
**2,5** ise 50 katı — yani Sur zaten bu ailenin dışında ve oranı doğrudan ölçmek şart.

---

## 4. ÖLÇÜM SETİ — iki oranı BİRBİRİNDEN AYIRIR

⭐ Anahtar, gece setindeki numaranın aynısı: **2 turluk savaş**. Tur 2'nin fazları
`[menzilli, büyü]` ve Sur yalnız menzilli fazda hatta → savaş 2 turda biterse Sur **tek bir
düşüş** alır. O zaman `Sur% = 100 − düşüş` ve formül doğrudan tersine çevrilebilir.

> **Kurulum: Saldıran 300 Mancınık · Savunan 27.000 Elf + Sur N · GÜNDÜZ ·
> tüm teknikler 0 (A grubunda) · kahraman/tapınak yok · Büyü Kalkanı yok.**

⚠️ Her satırda **tur sayısını da yaz.** Tur 2'den çıkarsa o satır geçersizdir.

### A · Seviye taraması → `Alan/mDef`yi verir

Düşüş `1/Sv` ile doğrusal olmalı; eğim doğrudan `Alan/mDef` oranıdır.

| # | Sur sv | motor: tur | motor: Sur% | motor: düşüş | **gerçek: tur** | **gerçek: Sur%** |
|---|---:|---:|---:|---:|---|---|
| A1 | 2 | 2 | 73,72 | 26,28 |2 |%73,68-73,74 |
| A2 | 3 | 2 | 85,31 | 14,69 | 2|%85,29-85,34 |
| A3 | 4 | 2 | 91,15 | 8,85 |2 |%91,12-91,15 |
| A4 | 5 | 2 | 94,69 | 5,31 |2 | %94,67-94,69|
| A5 | 6 | 2 | 97,12 | 2,88 | 2| %97,10,97,12|
| A6 | 8 | 2 | **100,00** | 0 |2 |%100,0 |
| A7 | 10 | 2 | **100,00** | 0 |2 |%100,0 |
| A8 | 12 | 2 | **100,00** | 0 | 2|%100,0 |

**Nasıl okunur:** düşüşleri `1/Sv`ye karşı çiz — düz bir doğru çıkmalı. Motorun doğrusu
A1→A5'te eğim ~52; binary'nin eğimi **5 kat büyükse** `Alan/mDef` 2,5 demektir. ⭐ Ayrıca
**Sur'un yıpranmayı bıraktığı seviye** (motorda 8) binary'de kaçta? O tek sayı bile oranı verir.

### B · Taş Ustalığı taraması → `pAtk/mDef`yi verir

Sur **sv4** sabit, yalnız Taş Ustalığı değişiyor. Formülün ikinci terimi doğrusal, yani
Sur% ile TU arasında **düz bir doğru** beklenir; eğim `100 × pAtk × 0,06 / mDef`.

| # | Taş Ustalığı | motor: tur | motor: Sur% | **gerçek: tur** | **gerçek: Sur%** |
|---|---:|---:|---:|---|---|
| B1 | 0 | 2 | 91,15 | 2| %91,12-91,15|
| B2 | 5 | 2 | 93,65 |2 |%93,20-93,24 |
| B3 | 10 | 2 | 96,15 | 2|%95,29-95,32 |
| B4 | 17 | 2 | 99,65 | 2|%98,20-98,24 |
| B5 | 20 | 2 | **100,00** | 2| %99,45-99,49|

**Nasıl okunur:**

| Gözlem | Sonuç |
|---|---|
| Doğru, motordakiyle **aynı eğimde** | ✅ `pAtk/mDef` doğru; hata yalnız `Alan/mDef`de |
| Doğru daha **yatık** | `pAtk/mDef` küçük — Sur'un pAtk'i ya da Taş Ustalığı oranı farklı |
| Sur% Taş Ustalığı'ndan **hiç etkilenmiyor** | ⭐ Taş Ustalığı Sur'un mitigasyonuna işlemiyor → ikinci terim tamamen farklı bir stattan geliyor |

⚠️ B grubu tek başına da değerli: dokümanın *"Taş Ustalığı: Okçu Kulesi, Mangonel, Balista,
**Sur**"* ifadesini doğrudan sınıyor — ve o doküman listelerinin süzgeç değil betimleme olduğu
bu projede **dört kez** yakalandı (`docs/TILSIM_SUZGEC_TESTLERI.md` §2).

---

## 5. ⭐⭐⭐ SONUÇ (2026-08-12, ölçüm geldi) — §3'teki hipotezim ÇÜRÜDÜ

**A grubu 8/8 BİREBİR tuttu.** Yani Sur'un statlarını suçlamam **yanlıştı**: `Alan/mDef` = 0,5
ve `pAtk/mDef` = 0,0833 **doğru** (A grubu Taş Ustalığı 0'da koşuluyor, yani ikisini birden
sabitliyor). §3'ün "Alan/mDef 5 kat küçük" uyumu, iki serbest parametreli bir uydurmanın nasıl
yanlış bir yere oturabileceğinin ders niteliğinde örneği — ⭐ **iyi ki kataloğa yazmamışım.**

**B grubu sapıyor ve sapma Taş Ustalığı ile DOĞRUSAL büyüyor** — bu, oranın kendisinin yanlış
olduğunun imzası. Sur% ile TU arasındaki eğim `100 × pAtk × oran / mDef` = `8,3333 × oran`:

| TU | 5 | 10 | 17 | 20 |
|---|---:|---:|---:|---:|
| ölçülen eğim | 0,4170 | 0,4170 | 0,4168 | 0,4167 |

Dört bağımsız tahmin, yayılım **0,00025** → **`oran = 0,05003`**. Motorun %6'sı 0,5 eğim
veriyordu; oran tam olarak **5/6** kadar fazlaydı.

- [x] ⭐ **Taş Ustalığı Sur'da %5, %6 değil.** `masonry.rateByUnit = { wall: 0.05 }` olarak
      girildi. Düzeltmeden sonra **13/13 hücre** ölçülen aralığın içinde (A 8/8 + B 5/5).
- [x] ⚠️ Dokümanın *"fiziksel savunma gücünü **%6** arttırır"* ifadesi yanlış — ve bu Tılsım'ın
      **aynadaki hâli**: orada doküman %5 derken savaşçılarda %6 çıkmıştı. Metnin oran sayıları
      bu projede güvenilmez.
- [x] ⚠️ **Kule/Balista ölçülmedi**, bilerek %6'da bırakıldı. Sur binary'de ayrı bir kod
      yolundan geçiyor (`gradeStat`, kademeli yapı) — tıpkı Kalkan'ın Tılsım'da kendi
      ölçekleyicisi olması gibi. Ölçülmemiş dengeyi kaydırmamak için status quo korundu.

`catalogHash` `3a8b2be4` → **`14c061fc`**.

---

## 6. ⚠️ AÇIK KALAN: asıl savaştaki Sur farkı

Taş Ustalığı düzeltmesi B grubunu kapattı ama **asıl savaşı kapatmadı**: sv10'da motor hâlâ
%100 diyor (binary %53,59), sv8'de %99,34 (binary %15,19).

⭐ Artık bunun **ne OLMADIĞINI** kesin biliyoruz: formül değil (Ghidra), Sur'un statları değil
(A grubu 8/8), Taş Ustalığı'nın oranı değil (B grubu 5/5). Geriye tek büyüklük kalıyor: **`havuz/P`**.

### Neden Sur bu kadar hassas

`düşüş = 50 × (havuz/P)/Sv − pAtk_ölçekli/6` — yani **iki büyük terimin FARKI**. sv10'da
`5×R` ile `15,4` yarışıyor; R 2,5 iken fark negatif (hiç hasar), R 4,9 iken +9,3. Birim
kayıplarında ise `pay ≫ mitigasyon` olduğu için aynı hata görünmez.

> ⭐⭐ **Sur, `havuz/P` hatalarının AMPLİFİKATÖRÜDÜR.** Birim kayıpları %0,5 tutarken Sur %100
> ↔ %53 ayrışabilir. Bu bir kusur değil, **elimizdeki en hassas sonda**.

Ablasyon bunu doğruluyor: savunanın **Ejderhasını** çıkarınca (P'nin %51'i) Sur %100 → **%0**.

### ⭐⭐⭐ Yeni set — Sur'u `Alan` TABLOSUNUN sondası olarak kullan

Kritik gözlem: birim kayıpları `pay = Alan_e × adet × havuz/P` ile hesaplanıyor ve **bütün
Alan'lar aynı katsayıyla çarpılsa hiçbir şey değişmez** (P de aynı katsayıyla büyür, sadeleşir).
Yani birim kayıpları `Alan` tablosunu **yalnız birbirine göre** ölçebiliyor. Sur'un gücü ise
`1,8^Sv × Alan_sur` ile **ayrı** bir formülden geliyor → Sur, `Alan` tablosunu **mutlak ölçekte**
ölçebilen tek araç.

> **Kurulum: Saldıran 300 Mancınık · Savunan tek tip birim + Sur sv4 · GÜNDÜZ ·
> tüm teknikler 0 · kahraman/tapınak yok.**
> Adetler, savunanın **P'si her satırda 324.000** olacak şekilde seçildi.

⭐ Motor beş satırın beşinde de **aynı** Sur%'ini veriyor — çünkü P eşit. **Binary'de farklı
çıkan satır, o birimin `Alan`ının yanlış olduğunu söyler** ve oranı doğrudan verir.

| # | Savunan | Alan | P | motor: tur | motor: Sur% | **gerçek: tur** | **gerçek: Sur%** |
|---|---|---:|---:|---:|---:|---|---|
| C1 | 27.000 Elf | 12 | 324.000 | 2 | **91,14** |2 |%91,12-91,15 |
| C2 | 4.050 Pegasus | 80 | 324.000 | 2 | **91,14** |2 |%91,12-91,15 |
| C3 | 432 Ejderha | 750 | 324.000 | 2 | **91,14** | 2|%91,12-91,15 |
| C4 | 1.350 Mancınık | 240 | 324.000 | 2 | **91,14** |2 |%91,12-91,15 |
| C5 | 360 Balista | 900 | 324.000 | 2 | **91,14** |2 | %91,12-91,15|

**Nasıl okunur:**

| Gözlem | Sonuç |
|---|---|
| Beşi de eşit (≈%91,1) | ✅ `Alan` tablosu doğru → fark başka yerde (havuz tarafı) |
| Bir satır **yüksek** | O birimin gerçek Alan'ı bizimkinden **büyük** (P büyük → R küçük) |
| Bir satır **düşük** | O birimin gerçek Alan'ı **küçük**; oran = ölçülen düşüş / motor düşüşü |

⚠️ Asıl savaşta savunanın P'sinin **%51'i Ejderha** → **C3 en kritik satır.** Ejderha'nın
Alan'ı gerçekte ~yarısıysa, asıl savaştaki R iki katına çıkar ve Sur %53'e oturur — aradığımız
büyüklük tam olarak bu.

⚠️ Bu arada Sur, motorda **olması gerekenden dayanıklı** görünüyor: yoğun savaşlarda hiç
yıpranmıyor. Canlı dengede bunu akılda tut.

### ✅ C grubu sonucu (2026-08-12) — `Alan` tablosu TEMİZ

**Beş satırın beşi de %91,12-91,15**, yani motorun 91,14'üyle birebir. ⇒ `Alan` tablosu mutlak
ölçekte doğru; **Ejderha da dahil** (C3, asıl savaşta P'nin %51'i). Hipotez elendi, sorun kapanmadı.

---

## 7. ⚠️⚠️ NEREDE OLMADIĞINI BİLİYORUZ — kalan tek aday: TUR/FAZ SAYISI

Büyük savaş hâlâ açık (motor %100 ↔ binary %53,59) ve artık eleme listesi uzun:

| aday | nasıl elendi |
|---|---|
| Formülün kendisi | Ghidra, satır satır (§1) |
| `Alan_sur` / `mDef_sur` / `pAtk_sur` | A grubu **8/8** |
| Taş Ustalığı oranı | B grubu **5/5** (düzeltildi) |
| Birimlerin `Alan` tablosu | C grubu **5/5** |
| Şamanın emmesi | Şamanı **tamamen silsek** bile Sur %98,4 (aşağıya bak) |

### ⭐ Sayısal kısıt: sorun havuz/P'nin BÜYÜKLÜĞÜNDE olamaz

Asıl savaşta faz-1 için ölçülen değerler:

```
saldıran ham havuz  11.369.480        savunan P  3.241.490
Şaman emmesi         2.543.380   →    R = 2,72     (Şaman hiç olmasa 3,51)

Sur sv10'un hasar ALMASI için gereken:  R > 3,08
binary'nin %53,59'u için gereken:       R ≈ 4,4 – 4,9
```

⚠️ **Şamanı sıfırlamak bile yetmiyor** (R 3,51 → Sur %98,42). Yani kalan fark, bu turda
incelediğimiz bileşenlerin **hiçbirinden** gelemez.

### ⭐⭐ Kalan tek yapısal fark: tur sayısı

Tutan **bütün** ölçümler (A · B · C) **2 turluk** ve Sur **tek bir düşüş** alıyor. Tutmayan
tek ölçüm **4 turluk** ve motorumuzda Sur **5 düşüş** alıyor. Yani hiç sınanmamış tek şey,
**çok turlu savaşta Sur'un kaç kez ve hangi havuzla vurulduğu.**

⚠️ İlginç bir işaret: binary'nin sv8 (%15,19) ve sv10 (%53,59) değerlerini sabit-düşüş modeline
oturtunca **~7 faz** çıkıyor, motorumuzda 5 var (tur2 faz1 · tur3 faz1+2 · tur4 faz1+2).

### D · TUR KÖPRÜSÜ — 2 turdan 3 tura geçiş

Aynı saldıran, yalnız savunanın **sayısı** değişiyor → savaş uzuyor. Basit ordu, R hesaplanabilir.

> **Saldıran 300 Mancınık · Savunan N Elf + Sur sv · GÜNDÜZ · tüm teknikler 0.**

| # | Savunan | Sur sv | motor: tur | motor: Sur% | motor: defK | **gerçek: tur** | **gerçek: Sur%** | **gerçek: defK** |
|---|---|---:|---:|---:|---:|---|---|---|
| D1 | 27.000 Elf | 4 | **2** | 91,14 | 866 | 2|%91,12-91,15 | 864-868|
| D2 | 11.000 Elf | 4 | **3** | 58,46 | 1.738 |3 |%58,37-58,56 |1734-1741 |
| D3 | 9.500 Elf | 4 | **3** | 43,35 | 2.028 | 3| %43,29-43,46| 2024-2031|
| D4 | 9.500 Elf | 6 | **3** | 70,78 | 1.870 |3 | %70,71-70,84|1866-1872|
| D5 | 9.500 Elf | 8 | **3** | 88,02 | 1.458 | 3|%87,99-88,5 |1454-1460 |
| D6 | 11.000 Elf | 8 | **3** | 91,30 | 1.262 | 3| %91,27-91,31|1258-1263 |

⚠️ **Tur sayısı bu setin ASIL ölçtüğü şey** — her satırda mutlaka yaz. Motorla binary'nin tur
sayısı bile ayrışıyorsa mesele Sur değil, savaşın uzunluğudur.

**Nasıl okunur:**

| Gözlem | Sonuç |
|---|---|
| Altısı da tutuyor | ⭐ Çok turlu Sur modeli doğru → sorun yalnız **büyük/karışık ordu** rejiminde; sıradaki adım orduyu kademe kademe basitleştirmek |
| D1 tutuyor ama D2/D3 sapıyor | ⭐⭐ **Bulundu**: fazladan tur, Sur'a modellediğimizden farklı sayıda/şiddette vuruyor. Sapma oranı doğrudan faz sayısını verir |
| Tur sayıları bile farklı | ⚠️ Sorun Sur'da değil; savaşın bitiş koşulunda (`combatAlive`) — ayrı bir tur konusu |

⭐ D2↔D3 (aynı seviye, farklı savunan) ve D3↔D4↔D5 (aynı savunan, farklı seviye) birbirinin
kontrolü: biri tutup diğeri sapıyorsa hangi eksende sapıldığı tek bakışta görünür.

### ✅ D grubu sonucu — çok turlu Sur modeli de TEMİZ

**6/6 tuttu**, 3 turluk satırlar dahil. Tur sayıları da birebir.

---

## 8. ⚠️⚠️ DURUM: 24/24 sonda tutuyor, büyük savaş hâlâ tutmuyor

| grup | ne sınadı | sonuç |
|---|---|---|
| A (8) | `Alan_sur` · `mDef_sur` · `pAtk_sur` | ✅ birebir |
| B (5) | Taş Ustalığı oranı | ✅ **düzeltildi** (%6 → %5) |
| C (5) | birimlerin `Alan` tablosu, mutlak ölçekte | ✅ birebir |
| D (6) | çok turlu Sur modeli (2 ve 3 tur) | ✅ birebir |

**Yine de büyük savaş: motor %100 ↔ binary %53,59.**

⭐ Bu sonucun kendisi bilgi: sapma **sınadığımız hiçbir eksende değil**. Dört sondanın ortak
noktası da tam olarak burada belli oluyor — hepsinde saldıran **300 Mancınık, teknikler 0**'dı.
⚠️ **Hiç değiştirilmemiş tek boyut: saldıranın bileşimi ve teknikleri, yani `havuz` tarafı.**

### Sayısal çerçeve

Sur'un yıpranmayı bıraktığı seviye kapalı formda:

```
Sv*  =  Alan_sur × R / pAtk_ölçekli  =  300 × R / 92,5  =  3,24 × R
```

Motorda büyük savaşta Sv* = **9** → `R = 2,78`. Binary sv10'da hâlâ hasar aldığına göre
`Sv* > 10` → `R > 3,1`; %53,59'u üretmek için `R ≈ 4,4-4,9`.

⭐ **Yöntem değişikliği:** dört sentetik sonda da tuttuğuna göre sıradaki adım yeni sonda
üretmek değil, **başarısız savaştan geriye doğru daraltmak.**

---

## 9. E · TEK SATIRLIK ÖLÇÜM — orduyu yeniden girmene gerek yok

> **Büyük savaşın TAM AYNISI. Tek değişen: Sur kutusundaki sayı.**

Motor sv9'dan itibaren %100 diyor. **Binary'nin ilk %100 verdiği seviye `R`'yi doğrudan verir**
(`R = Sv*/3,24`) — tek bir sayı, bütün belirsizliği kapatıyor.

| # | Sur sv | motor: tur | motor: Sur% | **gerçek: tur** | **gerçek: Sur%** |
|---|---:|---:|---:|---|---|
| E1 | 12 | 4 | **100,00** | | |
| E2 | 14 | 4 | **100,00** | | |
| E3 | 16 | 4 | **100,00** | | |
| E4 | 20 | 4 | **100,00** | | |

*(sv7 %0 · sv8 %15,19 · sv10 %53,59 zaten ölçüldü; motor sv7 %96,95 · sv8 %99,33 · sv10 %100.)*

**Nasıl okunur:**

| Binary'nin ilk %100'ü | `R` | motora göre |
|---|---:|---:|
| sv12 | 3,7 | 1,3 kat |
| sv14 | 4,3 | 1,6 kat |
| sv16 | 4,9 | 1,8 kat |
| sv20 | 6,2 | 2,2 kat |
| hiçbiri (sv20'de de hasarlı) | > 6,2 | > 2,2 kat |

⭐ Bu oran, `havuz/P`'deki farkın **büyüklüğünü** kesinleştirir ve bir sonraki turda neyin
peşine düşeceğimizi belirler: 1,3 kat ise küçük bir bileşen (Şaman emmesi, Kaos, savaş-dışı
birimler), 2 kat ise yapısal bir şey (havuza kimin katıldığı ya da P'ye kimin girdiği).

⚠️ E grubu **dört satır ve ordu girişi hiç değişmiyor** — Sur kutusuna sırayla 12/14/16/20 yazıp
Savaştır'a basman yeterli.
