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
| E1 | 12 | 4 | **100,00** | 2| %85,50-85,56|
| E2 | 14 | 4 | **100,00** | 4| %100,0|
| E3 | 16 | 4 | **100,00** | 4| %100,0|
| E4 | 20 | 4 | **100,00** | 4| %100,0|

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

### ✅ E grubu sonucu (2026-08-12) — EŞİK BULUNDU

| sv | 7 | 8 | 10 | 12 | **13** | 14 | 16 | 20 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **binary** | 0 | 15,19 | 53,59 | 85,53 | **96,85** | **100** | 100 | 100 |
| **motor** | 96,95 | 99,33 | 100 | 100 | 100 | 100 | 100 | 100 |

⚠️ E1'de (sv12) **tur 2** yazılmış; sv10 ve sv13/14 hepsi 4 tur. Tek başına monoton olmayan bu
satır ya bir yazım kayması ya da ayrı bir ipucu — **yeniden koşulmalı.**

---

## 10. ⭐⭐⭐ SAPMA TEK BİR SKALER: `havuz/P` × 1,8

### n'den BAĞIMSIZ kıskaç

Eşik koşulu (`düşüş > 0`) faz sayısını **içermiyor**, yani yalnız "sv13 hasarlı, sv14 hasarsız"
bilgisinden kesin bir aralık çıkıyor:

```
g > 15,417 × 13 / (50 × R(13))  =  1,756
g < 15,417 × 14 / (50 × R(14))  =  2,135          ⇒   g ∈ (1,76 ; 2,14)
```

### Tek sabit BÜTÜN eğriyi üretiyor

`havuz/P`yi tek bir `g` ile çarpıp faz sayısını serbest bırakınca:

| sv | 7 | 8 | 10 | 12 | 13 | 14+ |
|---|---:|---:|---:|---:|---:|---:|
| binary | 0 | 15,19 | 53,59 | 85,53 | 96,85 | 100 |
| **g = 1,74 · n = 6,1** | 0,00 | 15,24 | 54,16 | 85,27 | 100 | 100 |
| motor (g = 1) | 96,95 | 99,33 | 100 | 100 | 100 | 100 |

⭐ Sekiz seviyenin toplam hatası **4 puan** (yalnız sv13 kaçıyor). Yani sapma bir **şekil** hatası
değil, **tek bir çarpan**.

### ⚠️⚠️ Ve bu bir PARADOKS yaratıyor

Aynı `havuz` ve `P`, birim hasarında da kullanılıyor ve **orada %0,1-0,5 tutuyor**. İkisi birden
doğruysa fark Sur'un **kendi terimlerinde** olmalı — ama A/C/D onları (Taş Ustalığı 0'da)
birebir sabitledi.

⭐ **Hiç sınanmamış tek bileşim: yüksek Taş Ustalığı + yüksek Sur seviyesi + çok tur.**
A · C · D hepsi TU 0; B ise TU'yu taradı ama **sv4 ve 2 turda**.

⚠️ Dikkat çekici sayı: **1 + 17 × 0,05 = 1,85** — Taş Ustalığı 17'nin çarpanı, kıskacın
(1,76-2,14) tam ortasında. Basit biçimleri (masonry'nin `Alan`ı ya da `mDef`i ölçeklemesi)
B grubu **çürütüyor** (o durumda Sur% TU ile DÜŞERDİ, ölçümde ARTIYOR) — ama tesadüf olamayacak
kadar iyi oturuyor.

---

## 11. F · SON ÖLÇÜM — aynı savaş, Taş Ustalığı kutusu 0

> **Büyük savaşın TAM AYNISI. Tek değişen: savunanın Taş Ustalığı 17 → 0.**

Bu, kalan tek değişkeni kaldırıyor. Motor TU 0'da Sur'u belirgin biçimde daha çok yıpratıyor —
yani iki dünya arasındaki mesafe TU 0'da **kapanıyorsa** suçlu Taş Ustalığı×Sur eşleşmesidir.

| # | Sur sv | motor (TU 17) | **motor (TU 0)** | binary TU17 | **gerçek: TU 0 Sur%** | **gerçek: tur** |
|---|---:|---:|---:|---:|---|---|
| F1 | 7 | 96,96 | **87,82** | 0 | %0,0| 4|
| F2 | 8 | 99,34 | **91,56** | 15,19 |%0,15-0,40 | 4|
| F3 | 10 | 100,00 | **95,76** | 53,59 | %42,10-42,6|4 |
| F4 | 13 | 100,00 | **99,95** | 96,85 | %89,55-89,60|4 |

**Nasıl okunur:**

| Gözlem | Sonuç |
|---|---|
| TU 0'da binary ≈ motor | ⭐⭐⭐ **Bulundu:** suçlu Taş Ustalığı'nın Sur'a etkisi; B grubunun göremediği ikinci bir kanalı var |
| TU 0'da fark hâlâ ~1,8 kat | Taş Ustalığı masum → sapma `havuz` tarafında, tekniklerin `Can` ölçeklemesinde aranmalı |
| TU 0'da fark BÜYÜYOR | Model TU'yu ters yönde uyguluyor — B grubu yeniden okunmalı |

⚠️ Dört satır, ordu girişi yine değişmiyor: Taş Ustalığı kutusunu 0 yap, Sur'a sırayla
7/8/10/13 yaz.

### ⭐⭐⭐ F grubu sonucu — TAŞ USTALIĞI MASUM

| sv | binary TU17 | binary **TU 0** | motor TU 0 |
|---:|---:|---:|---:|
| 7 | 0 | **0** | 87,82 |
| 8 | 15,19 | **0,15-0,40** | 91,56 |
| 10 | 53,59 | **42,10-42,60** | 95,76 |
| 13 | 96,85 | **89,55-89,60** | 99,95 |

Taş Ustalığı 0'da fark **kapanmıyor**, hatta binary daha da sert. Yön doğru (TU azalınca iki
tarafta da Sur zayıflıyor) ama büyüklük hâlâ uçurum. ⇒ Taş Ustalığı × Sur eşleşmesi **suçlu değil**.

---

## 12. ⚠️⚠️ ÖNCEKİ TURUN ÇERÇEVESİ DÜZELTİLDİ: «tek skaler» DEĞİL

§10'da *"sapma `havuz/P` üzerinde tek bir çarpan (g ≈ 1,8)"* demiştim. **Bu fazla iyimserdi**
ve düzeltilmesi gerekiyor: o sonuç, düşüşün her fazda **sabit** olduğunu varsayan analitik bir
modelden geliyordu. Gerçekte `havuz/P` turlar boyunca hızla düşüyor (saldıran 28.000 birimin
25.654'ünü kaybediyor), yani sabit-düşüş modeli yanlış bir zemin.

Motorun kendisiyle iki ayrı yoldan sınadım — **ikisi de şekli tutturamıyor**:

| deneme | ne yapar | sonuç |
|---|---|---|
| `Alan_sur` × g | Sur'un R'sini g katına çıkarır | en iyi g = 3,2'de bile hata **173 puan** |
| savunanın tüm `Alan`ları ÷ g | birim hasarını bozmadan Sur'un R'sini g katına çıkarır | en iyi g = 3,0'da hata **203 puan** |

⭐ İkisinde de aynı desen: **yüksek seviyede oturuyor, düşük seviyede oturmuyor.** g ne kadar
büyütülse de motor sv7-8'de Sur'u yıkamıyor (%26-45'te kalıyor), binary ise **tamamen yıkıyor**.

**Asıl imza şu:** motorun sv7'deki hasarı (3,04 puan) binary'nin **sv13**'teki hasarına (3,15)
denk. Yani fark bir **ölçek** değil, **seviye ekseninde kayma** gibi davranıyor — ama TU 0
verisinde kayma sabit çıkmıyor (5,9 · 3,6 · 1,0), yani saf kayma da değil.

---

## 13. DURUM ÖZETİ — ne kazanıldı, ne açık

**Kazanılan (kalıcı):**
- [x] ⭐ **Taş Ustalığı Sur'da %5** (`rateByUnit`), 13/13 hücre. `catalogHash` → `14c061fc`.
- [x] Sur formül zincirinin tamamı Ghidra'da doğrulandı; `1,8^Sv` ve `durum` sadeleşiyor.
- [x] ⚠️ **`cfg.wall.base` ölü düğme** — panelden oynatan biri bunu bilmeli.
- [x] Sur'un `Alan`/`mDef`/`pAtk`'i, birimlerin `Alan` tablosu, çok turlu Sur modeli: hepsi temiz.

**Açık (35 hücrelik 6 grup sonrası):** büyük savaşta Sur, motorda binary'den kat kat dayanıklı.
Elenenler: formül · Sur statları · Taş Ustalığı · birim `Alan` tablosu · Şaman emmesi ·
tek-skaler `havuz/P` açıklaması.

⚠️⚠️ **SIRADAKİ ADIM ÖLÇÜM DEĞİL.** Altı set koşuldu ve altısı da elemeyle bitti; yedincisini
istemek kullanıcının emeğini boşa harcamak olur. Kalan iş **kod okuma**: `FUN_0040e0c4`'ün
Sur dalı disassembly'den okundu ama **çağıranı** (`FUN_0040dcb4`, tur döngüsü) okunmadı —
Sur'un hangi turlarda, hangi sırayla ve hangi havuz fotoğrafıyla vurulduğu orada. Bir sonraki
tur oradan başlamalı.

---

## 14. ✅ TUR DÖNGÜSÜ OKUNDU (2026-08-14) — faz sayısı da ELENDİ

§13'ün istediği okuma yapıldı. `FUN_0040dcb4` tur koordinatörü **üç ayrı tur fonksiyonu**
çağırıyor ve üçünün de hasar çekirdeği (`FUN_0040e0c4`) çağrı sayısı sayıldı:

| tur | fonksiyon | `FUN_0040e0c4` çağrısı | yön başına faz | motor karşılığı |
|---|---|---:|---:|---|
| 1 | `FUN_0040e794` | 5 | (özel: tuzak + gnom) | `trapVolley` + `turn1GnomeSkirmish` |
| 2 | `FUN_0040ec4c` | **4** | **2** | `turnSchedule[2] = [1,3]` ✅ |
| 3·4·5 | `FUN_0040f35c` | **6** | **3** | `turnSchedule[3..5] = [1,2,3]` ✅ |

Döngü `local_40 = 3 … 5`, yani **en fazla 5 tur** ✅. Her turun başında iki ordu yerel tampona
kopyalanıyor (`local_6d0` stride 0x90 · `local_a90` stride 0xc0) — yani **tur başı fotoğrafı**,
motordaki `snap` ile aynı.

⭐ **`FUN_00413534` (durum düşürme) yalnız ÜÇ yerden çağrılıyor** — `0040e68a` · `0040e705` ·
`0040e779`, üçü de hasar çekirdeğinin içinde, faz başına bir tane. Yani Sur'un yıprandığı yer
tek: her hasar çekirdeği çağrısı, fazına göre Sur'a **ya da** Kalkan'a bir düşüş yazıyor.
Başka hiçbir kod yolu Sur'un durumuna dokunmuyor.

⚠️ Ayrıca `durum` alanı **`obj+0x80`** (0x84 double'ın üst yarısı). §1'de kullanılan
`FUN_004132d8/e4` ikilisi ise `obj+0x14`in getter/setter'ı — durum DEĞİL, dolayısıyla Tur 1'deki
"oku → çekirdek → geri yaz" deseni Sur'u korumuyor.

⇒ **§7'nin "kalan tek aday: tur/faz sayısı" hipotezi de çürüdü.** Faz sayıları, tur tavanı ve
fotoğraf mantığı motorla birebir.

---

## 15. ⭐⭐⭐ YENİ ADAY: GNOM — bütün sondaların ortak körlüğü

Altı sondanın (A·B·C·D·E·F) saldıranı **istisnasız `300 Mancınık`**tı ve hiçbirinde **gnom yoktu**.
Büyük savaşta ise var — bu oyuncunun kayıtlı bütün ordularında 4.000 gnom taşınıyor
(`apps/api/scripts/sapma/*.mjs`).

⭐ 2026-08-13'te ölçülerek bulundu ki **gnom Tur 1'de savunma yapılarını hasar çekirdeğiyle
yıkıyor** (`docs/SAVUNMA_BINARY_KONTROL.md`). Sur da bir savunma yapısı. Motorda
`gnomeStructStrike` Sur'u **hedef dışı** bırakıyor (`LEVEL_BASED` süzgeci) — ama bu dışlama
**binary'ye karşı hiç doğrulanmadı**: doğrulama ölçümü `counts.wall`a bakıyordu, o ise Sur'un
**SEVİYESİ** ve zaten hiç değişmiyor. Bakılması gereken `wallIntegrity`ydi.

> ⚠️ Yani "gnom Sur'a dokunmaz" bugüne kadar **ölçülmüş bir gerçek değil, sınanmamış bir
> varsayım.** Ve tam olarak sondaların göremeyeceği yerde duruyor.

Bu aday, elimizdeki bütün kısıtlarla tutarlı: A-F'nin neden tuttuğunu (gnom yok), büyük savaşın
neden sapdığını (4.000 gnom var) ve sapmanın neden `havuz/P` gibi davrandığını (Tur 1'de fazladan
bir düşüş, tıpkı §7'nin aradığı "fazladan faz" gibi) aynı anda açıklıyor.

### G · ÖLÇÜM SETİ — tabana yalnız GNOM ekliyor

> **G1 zaten ölçülmüş D1/A3 tabanı.** G2-G4'te tek değişen saldırandaki gnom sayısı;
> savunan, teknikler ve mancınık aynı kalıyor. Gündüz · tüm teknikler 0 · kahraman/tapınak yok.

| # | Saldıran | Savunan | motor: tur | motor: Sur% | **gerçek: tur** | **gerçek: Sur%** |
|---|---|---|---:|---:|---|---|
| G1 | 300 Mancınık | 27.000 Elf + Sur 4 | 2 | 91,15 | *(ölçüldü: 91,12-91,15 ✅)* | %91,12-91,15|
| G2 | 300 Mancınık + **1.000 Gnom** | 27.000 Elf + Sur 4 | 2 | 91,15 | 2|%91,12-91,15 |
| G3 | 300 Mancınık + **4.000 Gnom** | 27.000 Elf + Sur 4 | 2 | 91,15 |2 | %91,12-91,15|
| **G4** | **4.000 Gnom** (mancınıksız) | 27.000 Elf + Sur 4 | 1 | **100,00** |1 |%100,0 |
| G5 | 300 Mancınık + 4.000 Gnom | 27.000 Elf + **Sur 10** | 2 | 100,00 |2 | %100,0|
| G6 | 300 Mancınık | 27.000 Elf + **Sur 10** | 2 | 100,00 | 2|%100,0 |

**Nasıl okunur:**

| Gözlem | Sonuç |
|---|---|
| G2/G3, G1'den **düşük** | ⭐⭐⭐ **Bulundu:** gnom Sur'un bütünlüğünü düşürüyor. G2↔G3 farkı katsayıyı doğrudan verir |
| **G4'te Sur %100'ün altında** | ⭐ En temiz kanıt: ortada savaşan birim yok, savaş 1 turda bitiyor — Sur'daki her düşüş **yalnız** gnom kanalından gelebilir |
| G2=G3=G1 ve G4=%100 | Gnom masum; büyük savaştaki fark ordunun başka bir bileşeninde (Kaos · Şaman · yük arabası) — aynı deseni onlarla tekrarla |
| G5, G6'dan düşük | Sapma yüksek seviyede de sürüyor → büyük savaştaki sv10 açığını doğrudan açıklıyor |

⚠️ **G4 tek başına yeter.** Diğerleri katsayıyı ve seviye davranışını verir; ilk bakılacak satır G4.

### ⚠️ Bunun için gereken ikinci şey: büyük savaşın GİRDİSİ

Belgede büyük savaşın **yalnız çıktıları** var (kayıplar · enkaz · XP · Sur eğrisi · faz-1 için
`havuz 11.369.480` ve `P 3.241.490`). **Ordu bileşimi ve teknikler hiçbir yerde kayıtlı değil**
— `apps/api/scripts/sapma/` altındaki betiklerin hepsi başka bir savaşa (görev 4108, Sur sv2)
ait ve o savaş 5 tur sürüp 27.074/60.433 kayıp veriyor, yani bu değil.

👉 Girdiyi (iki tarafın birim sayıları + teknikleri + kahraman/tapınak) bir kez yazarsan
`scripts/sapma/` altına kalıcı bir betik olarak koyarım; o zaman hipotezleri **senin ölçüm
yapmana gerek kalmadan** kayıtlı çıktılara karşı sınayabilirim. Bugüne kadarki altı setin her
biri bu yüzden senden ölçüm istemek zorunda kaldı.

---

## 16. 2026-08-14 — G grubu sonucu, YENİ REFERANS SAVAŞ, hasar çekirdeğinin tamamı

### ✅ G grubu: GNOM MASUM (6/6)

Hipotez çürüdü — gnom Sur'un bütünlüğüne dokunmuyor. G4 (4.000 gnom, mancınıksız) binary'de de
**%100**. Motordaki `gnomeStructStrike`in `LEVEL_BASED` dışlaması böylece **ölçümle doğrulanmış**
oldu (daha önce yalnız varsayımdı: doğrulama `counts.wall`a bakıyordu, o ise Sur'un SEVİYESİ ve
zaten hiç değişmiyor).

### ⭐ Yeni referans savaş — artık GİRDİ kayıtlı

İlk büyük savaşın girdisi kayıp; kullanıcı yerine yenisini üretti ve
**`apps/api/scripts/sapma/sim-sur-buyuk.mjs`** olarak kaydedildi. Hipotezler artık ölçüm
istemeden sınanabilir.

| | motor | binary | fark |
|---|---:|---:|---:|
| saldıran kaybı | 33.595 | 33.558 | +%0,11 |
| savunan kaybı | 12.600 | 12.645 | −%0,36 |
| enkaz altın | 46.305.465 | 46.340.216 | −%0,07 |
| birim birim kalan (12 tür) | — | — | hepsi **±%0,3** |
| **Sur sv7** | **%78,05** | **%0** | ⛔ |

Binary seviye eğrisi: sv7 **0** · sv13 **38,5** · sv14 **71,5** · sv15 **90,6** · sv16 **100**.
Motor: sv7 78,05 · sv8 84,54 · sv10 94,09 · sv12 98,47 · **sv13'ten itibaren 100**.

⇒ İlk savaşın imzası birebir tekrarlandı: **savaşın tamamı tutuyor, tek sapan Sur.**

### ✅ Hasar çekirdeği (`FUN_0040e0c4`) baştan sona disassembly'den okundu

| bölge | ne yapıyor |
|---|---|
| `0x40e0ea-0x40e27b` | **havuz**: 3 saldıran listesi; faz 1-2 → `tip == faz` süzgeci + stat1 (hp), faz 3 → stat2 (magicHp), süzgeçsiz. Sonra şaman emmesi çıkarılıyor. `kind == 7` olan birim havuza girmiyor |
| `0x40e2a1-0x40e35b` | **P**: 3 savunan listesi toplanıyor — ⚠️ **hiçbir kategori süzgeci YOK** |
| `0x40e35b-0x40e3a0` | ⭐ faz 1-2 → `gradePower(SUR)`, faz 3 → `gradePower(KALKAN)` **P'ye ekleniyor** (motorda da var: `powerSum`) |
| `0x40e3b2-0x40e618` | birim hasarı; mitigasyon statı faz 1→3 (pAtk) · faz 2→4 (pDef) · faz 3→5 (mAtk) |
| `0x40e618-0x40e787` | Sur/Kalkan hasarı; Sur mitigasyonu faz 1'de `gradeStat(pAtk)`, **faz 2'de `gradeStat(pDef)`** |

⭐ Sur'un pAtk'i ve pDef'i ikisi de 50 olduğu için faz 1/faz 2 mitigasyon farkı **sonucu
değiştirmiyor** — ama katalogda bu ikisi ayrışırsa değiştirir, not düşüldü.

### ❌ Elenen iki yeni hipotez

**1. "Sur kendi kendini koruyor" (P'ye giren `gradePower`).** `1,8^Sv` ile üstel büyüyen ve
sadeleşmeyen tek terim bu: sv7'de 18.367, **sv16'da 3.643.186** — savunanın P'siyle aynı
mertebede. Yani §1'deki *"seviye üssü bile girmiyor"* çıkarımı **eksik**: `R` aslında `Sv`'ye
bağlı. Ama ölçüldü — `wall.base` 1,8 → 1,3 süpürmesi sv7'yi 78,0'dan yalnız **77,8**'e taşıyor
(sv7'de Sur'un P payı binde 6). ⇒ Sapmanın sebebi bu değil.

**2. Gnom** (yukarıda, G grubu).

### ⚠️ Kalan tek yapısal fark — ama YÖNÜ TERS

Binary'nin P döngülerinde kategori süzgeci yok; bizim `powerSum` ise `OUT_OF_BATTLE`
(yük arabası · casus kuş · gnom) birimlerini P'den **çıkarıyor**. Bu savaşta savunanda
6.543 + 4.125 + 6.661 tane var, yani küçük bir fark değil.
⚠️ Ne var ki eklemek P'yi **büyütür** → `R` küçülür → Sur **daha az** hasar alır; bizde zaten az.
Yani tek başına yönü yanlış. Yine de gerçek bir ayrışma, sınanmadan kapatılmamalı.

### 📐 Aranan büyüklük sayısallaştı

`düşüş% = 50·R/Sv − 14,167` (Taş Ustalığı 14 → `pAtk_ölçekli` 85):

| | motorun R'si | binary'nin R'si |
|---|---:|---:|
| sv7'de toplam düşüşten | ~2,4 | ~4,0 |
| Sur'un yıpranmayı bıraktığı seviyeden | 3,40-3,68 | 4,25-4,53 |

⇒ **Binary'nin `R`'si bizimkinin ~1,25-1,65 katı.** §12'nin paradoksu aynen duruyor: aynı `R`
birim hasarında da kullanılıyor ve orada **±%0,3** tutuyoruz.

---

## 17. ⭐⭐ 2026-08-14 (devam) — "YÜKSEK R" ELENDİ, şüphe TEKNİKLERE daraldı

### Tur 2'nin fazları okundu: `[1,3]` — motor doğruymuş

`FUN_0040ec4c`'in dört `FUN_0040e0c4` çağrısının argümanları disassembly'den çıkarıldı:

| çağrı | faz `[EBP+0x28]` | bayrak `[EBP+0x2c]` | birikim |
|---|---:|---:|---|
| 1 | **1** | 1 | `ctx+0x10` (saldıran→savunan) |
| 2 | **3** | 1 | `ctx+0x10` |
| 3 | **1** | 2 | `ctx+0x18` (savunan→saldıran) |
| 4 | **3** | 2 | `ctx+0x18` |

⇒ `turnSchedule[2] = [1,3]` **doğrulandı**; "tur 2 aslında `[1,2]` olabilir" hipotezi çürüdü.
⭐ Bayrak boolean değil **1/2**: hasar çekirdeği Sur'u yalnız bayrak 1'de P'ye ekliyor ve yalnız
o zaman yıpratıyor — yani ters yönde Sur ne P'ye giriyor ne hasar alıyor.
⭐ Fotoğraf semantiği de doğrulandı: ters yön çağrılarında savunanın listeleri **yerel kopyadan**
(tur başı fotoğrafı), hedef listeleri ise **canlı** geçiliyor — motordaki `snap` mantığının aynısı.

### ⛔ Tek çarpan şekli veremiyor (yeni savaşta tekrarlandı)

`gradePower(Sur)` geçici olarak `g` ile ölçeklendi (`dist` yaması, sonra rebuild ile geri alındı):

| g | sv7 | sv13 | sv14 | sv15 | sv16 | toplam hata | atk/def kaybı |
|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 78,0 | 100 | 100 | 100 | 100 | 177 | 33.596 / 12.588 |
| 2,5 | **0,0** | 81,7 | 93,3 | 99,7 | 100 | 74 | 33.605 / 12.530 |
| 4 | 0,0 | 64,1 | 84,1 | 97,0 | 100 | **45** | 33.608 / 12.511 |
| **binary** | **0,0** | **38,5** | **71,5** | **90,6** | **100** | 0 | 33.558 / 12.645 |

sv7'yi tutturmak için g ≥ 2,5 gerekiyor ama o zaman sv13-15 tutmuyor. §12'nin bulgusu aynen.
⭐ Yan gözlem: g 1→4 arasında **birim kayıpları kıpırdamıyor** (33.596→33.608). Yani bu düğme
gerçekten Sur'a özel — "Sur, `havuz/P` hatalarının amplifikatörüdür" tespiti doğrulanıyor.

### ⭐⭐⭐ D3 zaten YÜKSEK R'deydi ve TUTTU

Sondaların hepsinin düşük R'de olduğunu varsayıyorduk. Değilmiş:

| sonda | savunan P | R (göreli) | sonuç |
|---|---:|---:|---|
| A grubu (27.000 Elf + Sur 4) | 327.149 | 1,0× | ✅ |
| **D3 (9.500 Elf + Sur 4)** | **117.149** | **~2,8×** | ✅ **tuttu** (43,35 ↔ 43,29-43,46) |
| büyük savaş | — | ~2,9× (R≈4,0-4,5) | ⛔ |

⇒ **`R`'nin büyüklüğü sapmanın sebebi DEĞİL.** D3'ün R'si büyük savaşınkiyle aynı mertebede ve
birebir tutuyor. Bu, §12'nin "yüksek seviyede oturuyor, düşükte oturmuyor" gözlemini de yeniden
çerçeveliyor: sorun R'de değil.

### ⇒ Geriye kalan fark: TEKNİKLER

D3 ile büyük savaş arasındaki farklar: **teknikler (D3'te hepsi 0)** · birim çeşitliliği · şaman ·
tur sayısı (3 ↔ 5). Tur/faz yapısı §14'te Ghidra'dan doğrulandığına göre en güçlü aday teknikler.

⚠️ Teknik tablosunda Sur **yalnız Taş Ustalığı'nın** listesinde (`pmit`) — hiçbir saldırı
tekniğinin listesinde değil. F grubu Taş Ustalığı'nı zaten sıfırladı ve açık kapanmadı; ama
**diğer yedi teknik hiç sıfırlanmadı.**

### H · AYIRICI ÖLÇÜM — aynı savaş, teknik kutuları boş

> **`sim-sur-buyuk.mjs` savaşının TAM AYNISI. Tek değişen teknik kutuları.**
> ⚠️ Teknikleri kısmak orduların gücünü de değiştirir; bu yüzden **kayıpları da yaz** — satırın
> geçerli olup olmadığını onlar söyler.

| # | Teknikler | motor: Sur sv7 | sv10 | sv13 | motor: tur | motor: atk/def kaybı | **gerçek: Sur sv7** | **gerçek: kayıplar** |
|---|---|---:|---:|---:|---:|---|---|---|
| H1 | asıl (ölçüldü) | 78,0 | 94,1 | 100 | 5 | 33.596 / 12.588 | **%0,0** ✅ölçüldü | 33.558 / 12.645 |
| **H2** | **iki taraf da 0** | **82,2** | 95,4 | 100 | 5 | 19.303 / 12.002 |%0,0 |19222/12042 |
| H3 | yalnız saldıran 0 | 100,0 | 100 | 100 | 4 | 34.457 / 7.232 |%0,0 | 34449/7232|
| H4 | yalnız savunan 0 | 0,0 | 18,0 | 67,0 | 5 | 4.954 / 41.703 |%0,0 | 4930/42055|

**Nasıl okunur — H2 tek başına kesiyor:**

| H2'de binary'nin Sur'u | Sonuç |
|---|---|
| **~%82** (motora yakın) | ⭐⭐⭐ **Bulundu:** suçlu tekniklerden biri. Sıradaki adım tek tek sıfırlayıp hangisi olduğunu bulmak (Kimya · Okçuluk · Demircilik · İçgüdü · Büyücülük · Zırh · Tılsım) |
| **~%0** (asıl savaştaki gibi) | Teknikler masum → geriye birim çeşitliliği ve şaman kalıyor; sonda tek tip orduyla kurulduğu için sıradaki set karışık ordu olur |
| arada bir yerde | Teknikler payın bir kısmını taşıyor; H3/H4 hangi tarafın tekniği olduğunu ayırır |

⚠️ H3/H4'ün kayıpları asıl savaştan çok uzak (H4'te saldıran 33.558 yerine 4.954 kaybediyor) —
onlar yalnız H2 "arada" çıkarsa yön ayırmak için. **İlk ve tek bakılacak satır H2.**

---

## 18. ⭐⭐⭐ H SONUCU — teknikler de elendi, ama H3 elimizdeki EN KESKİN kısıt

### Teknikler masum

H2'de (iki tarafta da bütün teknikler 0) binary yine **Sur %0** veriyor. Kayıplar da tutuyor
(motor 19.303/12.002 ↔ binary 19.222/12.042). ⇒ Sapma tekniklerden gelmiyor.

### ⭐ H3 — birim kayıpları BİREBİR, Sur %100 ↔ %0

| H3 (saldıran teknikleri 0) | motor | binary |
|---|---:|---:|
| saldıran kaybı | 34.457 | 34.449 |
| savunan kaybı | **7.232** | **7.232** |
| tur | 4 | — |
| **Sur sv7** | **%100** (hiç dokunulmamış) | **%0** (tamamen yıkık) |

Bu satır bir çelişki üretiyor ve artık hipotez değil, **aritmetik**:

```
Motorda Sur sv7'ye hiç dokunulmaması ⇒ her fazda net ≤ 0
  net = gradePower(7)·R − gradeStat(7, pAtk) = 18.367·R − 30.666 ≤ 0  ⇒  R ≤ 1,670
Binary'nin Sur'a hasar verebilmesi için                              ⇒  R > 1,983
```

⇒ Binary'nin `R`'si bizimkinin **en az 1,19 katı** olmak zorunda. Ama savunanın kaybı iki
tarafta da **tam 7.232** — %15'lik bir kayıp oranında (doygun değil) %19'luk bir `R` farkı
bunu bozmadan geçemez.

> ⚠️⚠️ **Sur'un aldığı hasar, binary'de birim hasarıyla AYNI büyüklüğe bağlı olamaz** — oysa
> disassembly'de ikisi de aynı `[EBP-0x8]` (havuz) ve `[EBP-0x18]` (P) yerlerini kullanıyor.
> Bu turun asıl sonucu bu çelişkinin **kesinleşmesi**.

### ✅ Bulunan gerçek kod farkı (ama bu savaşlarda etkisiz)

`FUN_00413534`'te durum düşürmenin **iki** yıkım yolu var; bizde bir tane:

```
0041355d: JNC → düşüş >= durum     → durum = 0     (motorda VAR)
0041356b: JC  → düşüş <  EPSILON   → durum = 0     (motorda YOK)
```

Motora eklendi ve `EPSILON` 0'dan 5'e kadar süpürüldü: **hiçbir değerde eğri kıpırdamadı**
(177,4 hata sabit). Sebebi açık — bu savaşlarda düşüş ya çok büyük (sv7) ya da `net ≤ 0` olduğu
için fonksiyon hiç çağrılmıyor (sv13+). ⇒ Gerçek bir modelleme eksiği, ama sapmanın sebebi değil.
⚠️ Yine de not: `EPSILON` aynı fonksiyonun sonunda *"kalan durumu sıfıra yapıştır"* eşiği olarak
da kullanılıyor, yani küçük bir sayı. Değeri okunmadı (`0x00413600`).

### ⚠️ A grubunun neyi pinlediği düzeltildi

§5 *"A grubu `Alan/mDef` = 0,5 ve `pAtk/mDef` = 0,0833 doğru"* diyordu. Yarısı doğru:

| büyüklük | nasıl belirleniyor | durum |
|---|---|---|
| `pAtk/mDef` | doğrunun **kesişimi** — `R`'den BAĞIMSIZ | ✅ ölçüm 0,0849-0,0927; motor 0,0833 (biraz düşük) |
| `Alan/mDef` | doğrunun **eğimi** = `(Alan/mDef) × R` — yalnız ÇARPIM | ⚠️ `R` doğruysa doğru |

⇒ `Alan_sur/mDef_sur` hâlâ `R` ile birlikte serbest; A grubu ikisini ayıramıyor.

### Bu turda elenenler

| aday | nasıl elendi |
|---|---|
| Tur 2'nin faz çizelgesi | Ghidra argüman okuması: `[1,3]` ✅ motor doğru |
| Yüksek `R` rejimi | D3 sondası zaten R≈2,8× ve **tuttu** |
| Teknikler | H2 (hepsi 0) → binary yine %0 |
| Sur gücüne tek çarpan | sv7 için g≥2,5, sv13 için g≤1,2 — şekil tutmuyor |
| `EPSILON` yıkım dalı | süpürüldü, eğri hiç kıpırdamadı |
| Gnom | G grubu 6/6 |

### 📋 I · SIRADAKİ ÖLÇÜM — ince seviye taraması

Elimizde H1 savaşının yalnız 5 seviyesi var (7·13·14·15·16). Aradaki **5 seviye** eklenirse
eğriden **faz başına düşüş dizisi doğrudan tersine çevrilebilir** ve motorunkiyle faz faz
karşılaştırılır — bu, "kaç kez ve ne şiddette vuruluyor" sorusunu ölçümle kapatır.

> **`sim-sur-buyuk.mjs` savaşının aynısı (asıl teknikler). Yalnız Sur kutusu değişiyor.**

| # | Sur sv | motor: Sur% | **gerçek: Sur%** | **gerçek: tur** |
|---|---:|---:|---|---|
| I1 | 8 | 84,5 | %0,0| 5|
| I2 | 9 | 90,0 | %0,0| 5|
| I3 | 10 | 94,1 |%0,0| 5|
| I4 | 11 | 96,8 |%0,0| 5|
| I5 | 12 | 98,5 | %0,0| 5|

*(zaten ölçülü: sv7 → 0 · sv13 → 38,5 · sv14 → 71,5 · sv15 → 90,6 · sv16 → 100)*

⭐ Binary'nin sv7→sv13 arasında **nerede sıfırdan çıktığı** tek başına çok şey söyler: keskin bir
sıçrama varsa yıkım eşiklidir (EPSILON dalı gibi), yumuşak bir eğri varsa düşüş birikimlidir ve
dizisi hesaplanabilir.

---

## 19. ⭐⭐⭐ 2026-08-14 — EĞRİ UÇURUMLU ÇIKTI, `n = 7` BINARY'DEN DOĞRULANDI

### I grubu: sv8-12 hepsi %0 — düz eğri değil, UÇURUM

| sv | 7 | 8 | 9 | 10 | 11 | 12 | **13** | 14 | 15 | 16 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| binary | 0 | 0 | 0 | 0 | 0 | 0 | **38,5** | 71,5 | 90,6 | 100 |
| motor | 78,0 | 84,5 | 90,0 | 94,1 | 96,8 | 98,5 | 100 | 100 | 100 | 100 |

⭐ İki parametreli uyum **on seviyenin dokuzunu birebir** veriyor (yalnız sv15 kaçıyor, 9,4 puan):

```
Toplam düşüş  T(Sv) = 6006/Sv − 400,5      (0..100 arasına kırpılır)
   sv12 → T = 100,0  ⇒ Sur %0   ← uçurum tam burada, ölçümle birebir
   sv13 → T =  61,5  ⇒ Sur %38,5 ✓     sv14 → T = 28,5 ⇒ %71,5 ✓     sv16 → T < 0 ⇒ %100 ✓
```

Yani sv≤12'nin hepsinin sıfır olması ayrı bir mekanizma değil — **kırpma**. Eğri baştan sona
`a/Sv − b` biçiminde, tıpkı formülümüz gibi.

### ✅ `n` (Sur kaç kez vuruluyor) BINARY'DEN OKUNDU: 7

`FUN_0040f35c` (turlar 3·4·5) altı çağrısının argümanları:

| çağrı | faz | bayrak | sonuç |
|---|---:|---:|---|
| 1 | 1 | 1 | ileri → **SUR** |
| 2 | 2 | 1 | ileri → **SUR** |
| 3 | 3 | 1 | ileri → Kalkan |
| 4·5·6 | 1·2·3 | 2 | geri → Sur'a dokunmaz |

Tur 2 (§17) → 1 Sur vuruşu · turlar 3-5 → 2'şer. **5 turluk savaşta toplam 7.**
⇒ Motorun `turnSchedule`'ı ve Sur'un hangi fazlarda vurulduğu **birebir doğru**. Faz sayısı
hipotezi de elendi.

### ⚠️⚠️ Ve bu, formülün ŞEKLİNİ çürütüyor

`n = 7` sabitlenince uyumun iki katsayısı doğrudan çözülüyor:

| | binary (uyumdan) | motor | oran |
|---|---:|---:|---:|
| `b = n·m` ⇒ **m** (faz başına mitigasyon) | **57,2** | 14,17 | **4,0×** |
| `a = 50·ΣR` ⇒ **ΣR** (7 fazın toplamı) | **120,1** | ~17,5 | **6,9×** |
| Sur*'tan (hasarın durduğu seviye) ⇒ **R_max** | **~4,4** | 3,68 | **1,19×** |

⚠️ Bu üçü **aynı anda** sağlanamıyor. `m`'yi 4 kat büyütmek Sur*'u 4 kat KÜÇÜLTÜR, oysa
binary'nin Sur*'u bizimkinden **büyük**. Yani sapma artık bir katsayı hatası değil:
**`düşüş = 50·R/Sv − m` biçiminin kendisi binary'nin yaptığı şeyi tarif etmiyor** — A grubunda
(tek vuruş, teknik 0) tarif ediyor ama yedi vuruşlu, teknikli bir savaşta etmiyor.

⭐ Dikkat çeken tek yapısal ipucu: binary'nin `ΣR`'si `7 × R_max`'a çok yakın (120,1 ↔ 30,8… hayır,
tersine: `ΣR/7 = 17,2` ≫ `R_max ≈ 4,4`). Yani uyumdaki `a`, tek tek fazların R'leriyle
açıklanamayacak kadar büyük. Bir yerde **fazladan bir çarpan** var.

### 🔬 SIRADAKİ ADIM: ölçüm değil, ÇALIŞMA ANI GÖZLEMİ

Yedi ölçüm seti (A·B·C·D·E·F·G·H·I, 50+ hücre) ve dört Ghidra okuması sonrası elenenler:
formül zinciri · Sur statları · Taş Ustalığı · birim `Alan` tablosu · şaman · gnom · teknikler ·
tur/faz sayısı (**binary'den doğrulandı**) · yüksek R rejimi · Sur'un P'ye kattığı güç ·
`EPSILON` yıkım dalı · tek çarpan açıklaması.

⇒ Statik okuma ve kara kutu ölçümü tükendi. Kalan tek verimli yol **`FUN_0040e0c4`@`0x40e628`'e
breakpoint koyup** büyük savaşta `havuz` (`[EBP-0x8]`), `P` (`[EBP-0x18]`) ve `net` (`[EBP-0x4c]`)
değerlerini yedi vuruşun her birinde okumak. Tek koşu, bütün belirsizliği kapatır:
motorun aynı yedi değeriyle yan yana koyunca fark hangi terimde, doğrudan görünür.

---

## 20. 🔬 x32dbg KILAVUZU — Sur'un yedi vuruşunu canlı okuma

Uygulama 32 bit, **x32dbg** doğru araç (Ghidra'nın debugger'ına gerek yok).
Amaç: hasar çekirdeğinin Sur dalında **beş değeri** her vuruşta okuyup motorunkiyle yan yana koymak.

### Hangi adresler ve neden

Sur'un hasarı `FUN_0040e0c4` içinde iki ayrı yerde hesaplanıyor (faz 1 = menzilli, faz 2 = yakın).
Her ikisinde de `net` hesabı bittikten hemen SONRAKİ komut durak olarak seçildi — o anda beş
değerin beşi de bellekte hazır:

| durak | hangi faz | ne zaman çalışır |
|---|---|---|
| **`0040E659`** | faz 1 (menzilli) | tur 2·3·4·5 → **4 kez** |
| **`0040E6D4`** | faz 2 (yakın) | tur 3·4·5 → **3 kez** |

⭐ Toplam **7 durma** bekleniyor. **Kaç kez durduğunu not et** — sayının kendisi veri
(motorda bir fazda havuz sıfıra indiği için bazen 6 oluyor).

### Her durakta okunacak beş değer

| ne | yazılacak ifade | tip |
|---|---|---|
| **havuz** (saldırı gücü) | `ebp-8` | double |
| **P** (savunanın toplam gücü) | `ebp-18` | double |
| **mitigasyon** (Sur'un savunması) | `ebp-10` | double |
| **net** (fark — asıl aradığımız) | `ebp-4c` | double |
| **güç** (Sur'un `gradePower`i) | `ebp-64` faz 1 · `ebp-68` faz 2 | int (4 bayt) |

Formül: `net = güç × havuz / P − mitigasyon`. Beş sayı gelince fark **hangi terimde**, tek
bakışta görünür.

### Adım adım

1. **x32dbg'yi aç** → `File ▸ Open` → `Mobiwar Simulator.exe`.
2. Program giriş noktasında duracak. **F9**'a bas (gerekirse 2-3 kez) — simülatörün penceresi
   açılana kadar. Artık program çalışıyor.
3. **Durakları kur.** Altdaki komut satırına sırayla yaz, her birinden sonra Enter:
   ```
   bp 40E659
   bp 40E6D4
   ```
4. **Doğrula** (önemli): CPU penceresinde `Ctrl+G` → `40E659` → Enter. O satırdaki komut
   **`FLD QWORD PTR SS:[EBP-4C]`** olmalı. Öyleyse adresler doğru.
   ⚠️ Değilse programın yüklendiği taban `00400000` değil demektir — bana modül tabanını yaz,
   adresleri yeniden hesaplarım.
5. **Dump penceresini double'a al:** alt soldaki Dump panosunda sağ tık →
   `Float ▸ Double (64-bit)`. Böylece sayılar ondalık görünecek, hex çevirmeye gerek kalmayacak.
6. **Savaşı kur** (simülatör penceresinde): `sim-sur-buyuk.mjs`'teki ordu ve teknikler,
   **Sur = 13**. *(Bu seviye en bilgilendirici: binary %38,5 diyor, motor %100 — yani
   `net`in İŞARETİ farklı olmak zorunda.)*
7. **Savaştır**'a bas. Debugger duracak.
8. **Beş değeri oku.** Dump panosunda `Ctrl+G` → `ebp-8` → Enter → ilk sayı **havuz**.
   Aynısını `ebp-18`, `ebp-10`, `ebp-4c` için tekrarla.
   `ebp-64` (ya da faz 2'de `ebp-68`) için dumpı geçici olarak `Integer ▸ Dword` yap.
   ⚠️ Hangi durakta durduğunu da not et (`40E659` = faz 1 · `40E6D4` = faz 2).
9. **F9** ile devam et, sonraki durakta 8'i tekrarla. Yedi kez.
10. Son duraktan sonra F9 → savaş bitsin; sonuç panelindeki Sur yüzdesini de yaz
    (%38,5 civarı bekleniyor — böylece doğru savaşı ölçtüğümüz teyitlenir).

### Motorun aynı savaştaki değerleri — karşılaştırma tablosu

**Sur sv13** (motor sonucu %100, yani hiç hasar almıyor · binary %38,5):

| # | faz | güç | havuz | P | mitigasyon | **net** |
|---|---|---:|---:|---:|---:|---:|
| 1 | 1 | 624.689 | 2.369.672 | 4.345.714 | 2.300.938 | **−1.960.301** |
| 2 | 1 | 624.689 | 2.351.712 | 4.307.531 | 2.300.938 | **−1.959.886** |
| 3 | 2 | 624.689 | 15.166.189 | 4.307.531 | 2.300.938 | **−101.499** |
| 4 | 1 | 624.689 | 883.756 | 3.960.147 | 2.300.938 | **−2.161.530** |
| 5 | 2 | 624.689 | 9.439.472 | 3.960.147 | 2.300.938 | **−811.919** |
| 6 | 2 | 624.689 | 3.135.427 | 3.905.580 | 2.300.938 | **−1.799.433** |

**Sur sv7** (motor %78,11 · binary %0) — ikinci koşu için:

| # | faz | güç | havuz | P | mitigasyon | **net** |
|---|---|---:|---:|---:|---:|---:|
| 1 | 1 | 18.367 | 2.369.672 | 3.739.392 | 36.427 | −24.788 |
| 2 | 1 | 18.367 | 2.351.712 | 3.701.209 | 36.427 | −24.757 |
| 3 | 2 | 18.367 | 15.166.189 | 3.701.209 | 36.427 | **+38.834** |
| 4 | 1 | 15.593 | 915.608 | 3.228.809 | 30.926 | −26.504 |
| 5 | 2 | 15.593 | 9.471.356 | 3.228.809 | 30.926 | **+14.815** |
| 6 | 2 | 14.346 | 3.577.818 | 3.077.431 | 28.453 | −11.775 |

⭐ Motorda Sur'a hasarı **yalnız faz 2** veriyor (havuzu faz 1'in ~6 katı, çünkü saldıranın
ordusu ağırlıklı tip 2). Binary'de de öyle mi, ilk bakılacak şey bu.

### Ne arıyoruz

| gözlem | sonuç |
|---|---|
| **havuz** ya da **P** bizimkinden farklı | Sapma hasar çekirdeğine GİREN veride → `combatPool`/`powerSum` |
| **güç** farklı | `gradePower` (Sur'un `Alan`ı ya da `1,8^Sv`) |
| **mitigasyon** farklı | `gradeStat` (Sur'un `pAtk`/`pDef`i ya da Taş Ustalığı kanalı) |
| dördü de aynı ama **net** farklı | Hesabın sırası/tipi farklı (tek ihtimal kalır) |
| **durma sayısı** 7 değil | Sur beklediğimizden farklı sayıda vuruluyor |

⚠️ Rastgelelik: binary'nin kendi jitter'ı var, sayılar birebir tutmayabilir. Önemli olan
**mertebe ve işaret** — özellikle sv13'te `net`in negatif mi pozitif mi olduğu.

---

# 21. 🎯 ÇÖZÜLDÜ (2026-08-14) — Sur, TUR 1'İN GNOM FAZINDA yıkılıyor

x32dbg ile `FUN_0040e0c4`'ün Sur dalına durak konup yedi vuruşun beş değeri de canlı okundu.
**Beş değerin dördü motorunkiyle birebir tuttu; ayrışan tek şey `P` idi — ve yalnız BİR vuruşta.**

### Okunan veri

| kırılma | EBP | güç | havuz | **P** | mitigasyon | net |
|---|---|---:|---:|---:|---:|---:|
| **1** | `001AC83C` ⚠️ **farklı çerçeve** | 624.689 | 15.434.621 | **791.213** | 2.300.938 | **+9.885.190** |
| 2 | `001ABAAC` | — | 2.372.044 | 3.965.514 | 900.536 | −754.290 |
| 3 | `001ABAAC` | — | 2.351.827 | 3.927.331 | 900.536 | −754.127 |
| 4 | `001ABAAC` | — | 15.166.337 | 3.927.331 | 900.536 | +43.618 |
| 5·6·7 | `001ABAAC` | — | 905.064 / 9.471.290 / 3.401.602 | 3.503.450 / 3.503.450 / 3.392.408 | 884.747 | hepsi negatif |

⭐ **Kırılma 1'in EBP'si farklı** — yani başka bir çağırandan geliyor. Kırılma 2-7 tur
fonksiyonlarından (`FUN_0040ec4c` / `FUN_0040f35c`) ve onların `havuz`/`P`'si motorunkiyle
**birebir** tutuyor (Sur'un `durum`la ölçeklenen katkısı düşülünce fark **binde 1'in altında**).

### Kilit sayı

```
P (kırılma 1) = 791.213
gradePower(Sur sv13) = 624.689
savunanın GNOMLARININ gücü = 6.661 × 25 = 166.525
                              624.689 + 166.525 = 791.214   ✅
```

⇒ Kırılma 1, **Tur 1'in gnom fazı**: saldıranın tip-2 havuzu savunanın gnomlarını vuruyor.
Binary bunu **standart hasar çekirdeğinden** geçiriyor ve bayrak 1 olduğu için **Sur da o
çağrının hedef listesinde**. `P` yalnız *gnomlar + Sur* olduğundan `R = havuz/P = 19,5` çıkıyor
(normal turlarda ~4) ve Sur **tek vuruşta %100 → %39,14**'e iniyor. Kalan altı vuruş yalnız
+0,69 ekliyor → **%38,45**, ölçümün kendisi.

### Bütün eğri tek mekanizmadan çıkıyor

`net = gradePower(Sur) × havuz/(gnomGücü + gradePower(Sur)) − gradeStat(Sur, pDef)`

| sv | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **model** | 0 | 0 | 0 | 0 | 0 | 0 | 39,1 | 71,5 | 90,7 | 100 |
| **binary** | 0 | 0 | 0 | 0 | 0 | 0 | 38,5 | 71,5 | 90,6 | 100 |

**10/10.** Uçurum da açıklanıyor: sv≤12'de düşüş 100'ü aşıp kırpılıyor. sv16'da ise
`gradePower` `P`'yi domine edip `R`'yi 4,1'e düşürüyor, `gradeStat(pDef)` ise `Sv×1,8^Sv` ile
daha hızlı büyüyüp `net`i negatife çeviriyor → Sur hiç hasar almıyor.

### Neden 50+ sonda hücresi bunu göremedi

⚠️ **A·B·C·D·E·F sondalarının hepsinde saldıran `300 Mancınık`, savunan tek tip Elf'ti —
iki tarafta da GNOM YOKTU.** Gnom yoksa Tur 1'in gnom fazı hiç çalışmıyor, dolayısıyla Sur
Tur 1'de hiç vurulmuyor ve motor ile binary birebir tutuyor. Sapma yalnız **savunanda gnom
olan** savaşlarda doğuyor.
⚠️ G grubu da kaçırdı çünkü orada gnom **saldıranda**ydı; bu faz **savunanın** gnomlarını hedefler.

### Motordaki eksik

`turn1GnomeSkirmish` → `gnomeStrike` **elle yazılmış ayrı bir fonksiyon**: yalnız hedef birime
dokunuyor, hasar çekirdeğinden geçmiyor. Bu yüzden Sur o fazda ne `P`'ye giriyor ne hasar alıyor.
⇒ Düzeltme: Tur 1'in gnom fazı `dealType` çekirdeğine bağlanmalı; hedef listesi
**savunanın gnomları + Sur**, `P` = ikisinin toplamı.

⚠️ Dikkat: `gnomeStrike`in bugünkü tam sayılı hesabı `SAVAS_BINARY_KONTROL.md`'deki **11 gnom
ölçümünü birebir** tutturuyor (hepsinde sur YOK, dolayısıyla `pay = havuz` ve iki formül
çakışıyor). Düzeltme o 11 hücreyi bozmamalı — sur varken pay `gnomGücü/(gnomGücü+surGücü)`
oranında bölünecek, sur yokken bugünkü davranış aynen kalacak.

### ✅ UYGULANDI (2026-08-14) — `combat.ts` · `gnomeStrike`

İki satırlık düzeltme, iki ayrı eksik:

1. **Sur hedef listesine alındı.** `P = gnomGücü + gradePower(Sur)`, Sur `gradeTakeHit` ile
   vuruluyor (faz tipi 2), gnomların payı `gnomGücü/P` oranında bölünüyor.
2. **Şaman emmesi havuzdan düşülüyor** — çekirdek her çağrıda `[EBP+0x24]`'ü çıkarıyor, bizde
   yoktu. Eksikken Tur 1 havuzu %14 şişiyordu (17.639.202 ↔ binary 15.434.621) ve Sur sv13'te
   %38 yerine %27'ye iniyordu.

| sv | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | **toplam hata** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| binary | 0 | 0 | 0 | 0 | 0 | 0 | 38,5 | 71,5 | 90,6 | 100 | — |
| **motor (yeni)** | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | **38,4** | **71,5** | **90,7** | **100,0** | **0,2** |
| motor (eski) | 78,0 | 84,5 | 90,0 | 94,1 | 96,8 | 98,5 | 100 | 100 | 100 | 100 | 177,4 |

Savaşın geri kalanı da korundu: saldıran kaybı **33.555** (binary 33.558, %0,01) · 5 tur.
Savunan kaybı 12.935 ↔ 12.645 (+%2,3 — Sur erken yıkılınca `P`'den çıkıyor ve sonraki turlarda
savunan biraz fazla kayıp veriyor; tek kalan açık bu).

⚠️ **Eski ölçümlerin hiçbiri bozulmadı:** 281/281 motor testi geçiyor — 11 gnom hücresi
(sur yok → `gradePower 0` → formül eskisine iner), Sur/Kalkan altın kaydı (gnomsuz sonda),
A·B·C·D·G setleri. Bekçi testleri `packages/engine/test/gnome-struct.test.ts` sonunda:
seviye eğrisi · **gnom ablasyonu** (savunanın gnomu 0 → Sur %95+ sağlam) · şaman emmesi kontrolü.
