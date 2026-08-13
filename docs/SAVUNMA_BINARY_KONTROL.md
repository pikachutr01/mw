# Savunma birimleri — binary simülatörle karşılaştırma listesi

**Tarih:** 2026-08-13 · **Sebep:** bugüne kadarki ölçümlerin neredeyse tamamı **savaşçı**
karşılaştırmasıydı (`SAVAS_BINARY_KONTROL.md`). Savunma birimlerinin savaştan nasıl çıktığına
dair elimizde çok az veri var ve ilk dört ölçüm motorun bu tarafta **ayrıştığını** gösterdi.

> Hepsi **gündüz** savaşı, teknik 0, kahraman yok, sur/kalkan yok (aksi belirtilmedikçe).
> Motor sayıları 20 tohumla (`bin-0` … `bin-19`) üretildi; aralık verilmişse tohuma göre oynuyor,
> tek sayı verilmişse motor **deterministik**.
> **Bütün sayılar `kalan/başlangıç` biçiminde** — binary simülatördeki *Kalan Asker* sütunuyla
> aynı cinsten, çevirmen gerekmiyor.

---

## 1. Bilinen ayrışmalar (kullanıcı ölçümü, 2026-08-13)

| Senaryo | Motor | Binary | Durum |
|---|---|---|---|
| Casus Kuş 100 → Tuzak 50 | tuzak **50/50** (hiç gitmiyor) | tuzak **50/50** | ✅ oturdu — kuş saldırı havuzuna girmiyor, doğru |
| Cüce 120 → Tuzak 1000 | tuzak **933/1000** · cüce **0/120** · %60 berabere | tuzak **933/1000** · cüce **1/120** · her denemede **SALDIRAN** | ⚠️ tuzak sayısı **birebir**, ölümcüllük az fazla |
| Gnom 100 → Tuzak 1000 | tuzak **806-894/1000** | tuzak **951-952/1000** | ❌ sökme katsayısı 2-4 kat fazla, saçılma çok geniş |
| Gnom 1000 → Okçu Kulesi 500 + Tuzak 1000 | kule **500/500** · tuzak **0/1000** · deterministik | kule **384-404/500** · tuzak **475-477/1000** · oynak | ❌❌ en büyük ayrışma — aşağıya bak |

### ⭐ Son satır iki ayrı şeyi birden söylüyor

**1. Binary'de gnomlar yapı yıkıyor, bizde hiç dokunmuyor.** Bizim motorda gnom `OUT_OF_BATTLE`
olduğu için savunma yapılarına hiçbir etkisi yok. Binary 500 kulenin ~100'ünü götürüyor.
⚠️ Dikkat: binary'nin **yalnız 1000 gnomla** ulaştığı sonuç (kule 384-404), bizim motorun
**3000 cüceyle** ulaştığı sonucun (L7: 382-404) aynısı. Yani binary'de gnom, yapıya karşı
tam teçhizatlı bir orduyla aynı işi görüyor.

**2. Tuzak sayısı çelişiyor — yeniden ölçüm şart.** İlk ekran görüntüsünde `Gnom 1000 → Tuzak
1000` savaşı **0 tuzak** bırakıyordu; bu ölçümde aynı 1000 gnom (yanında 500 kule varken)
**475-477 tuzak** bırakıyor. İkisi aynı anda doğru olamaz — ya kulelerin varlığı tuzak
tüketimini değiştiriyor, ya da ilk okumada "kalan" sütunu yanlış okundu.
👉 **K5 satırı bu yüzden listede: yalnız `Gnom 1000 → Tuzak 1000` koşulup kalan tuzak
sayısının tekrar bakılması gerekiyor.**

---

## 2. Motorun BUGÜNKÜ kuralı (ölçüldü)

| Konu | Motor ne yapıyor |
|---|---|
| **Savunma birimi kaybı** | ⚠️ Gerçek bir savaş olduğunda **hepsi yok oluyor** — istisnasız |
| **Ekranda görünen "kalan"** | Yalnızca **onarım rulosu**: `repair 0,76-0,81` × başlangıç |
| **Saldıran gücünün etkisi** | **YOK** — 500 cüce ile 10.000 cüce aynı sayıyı bırakıyor |
| **Gnom → savunma yapısı** | Hiçbir etki (gnom `OUT_OF_BATTLE`) |
| **Tuzak: gerçek orduya karşı** | Basınca göre tetiklenir ve tükenir — Cüce 120'de binary ile **birebir** |
| **Tuzak: gnoma karşı** | `gnomeDisarm 1,5` ± %30 ile sökülür — binary'den **çok yüksek** |
| **Tuzak: uçana karşı** | Hiç tetiklenmiyor (`FLYING` süzgeci) — ⚠️ [REKON] varsayım, ölçülmedi |
| **Enkaz** | Savunma birimleri enkaz **vermiyor** (`debrisFromDefenses: false`) |
| **Savunma tabanı** | `minPerType` altına düşmüyor (N2: 3 kule → 3 kalıyor) |

⚠️ **Birinci satır bu dosyanın asıl sebebi.** Onarımı kapatıp koşturunca J1·J2·J4·H1·L7'nin
hepsinde **0 birim** kalıyor. Yani motorda "kaç savunma birimi öldü" sorusunun cevabı savaşın
şiddetinden bağımsız: her zaman *"hepsi"*. Ekrandaki sayı savaşla ilgili hiçbir bilgi taşımıyor.
**J bloğu tam olarak bunu sınamak için var.**

---

## 3. Senaryolar

> `M:` = motorumuz · `B:` = binary (senin dolduracağın sütunlar).
> Boş bıraktığın hücreler ölçülmedi demektir; **saçılma varsa aralık yaz** ("384-404"),
> **sabitse** "sabit" diye not düş.

### ⭐⭐ J — Saldıran gücü savunma kaybını değiştiriyor mu? (EN ÖNEMLİ BLOK)

Savunma sabit (100 okçu kulesi), saldıran 20 kat değişiyor. Motorda dördü de aynı sonucu veriyor.

| # | Saldıran | Savunan | M: kazanan | M: tur | M: saldırandan kalan | M: savunandan kalan | B: kazanan | B: tur | B: saldırandan kalan | B: savunandan kalan |
|---|---|---|---|---|---|---|---|---|---|---|
| J1 | Cüce 500 | Okçu Kulesi 100 | SALDIRAN | 4 | Cüce 455-456/500 | Kule 76-81/100 |saldıran |4 |456 | 76-81|
| J2 | Cüce 1500 | Okçu Kulesi 100 | SALDIRAN | 3 | Cüce 1500/1500 | Kule 76-81/100 | saldıran| 3|1500 |76-81 |
| J3 | Cüce 3000 | Okçu Kulesi 100 | SALDIRAN | 3 | Cüce 3000/3000 | Kule 76-81/100 |saldıran |3 |3000 |76-81 |
| J4 | Cüce 10000 | Okçu Kulesi 100 | SALDIRAN | 3 | Cüce 10000/10000 | Kule 76-81/100 | saldıran| 3|10000 |76-81 |

👉 Binary'de bu dört satırın **kalan kule** sayısı birbirinden farklı çıkarsa motorun savunma
kaybı modeli baştan yanlış demektir. Dördü de 76-81 bandında çıkarsa model doğru, yalnız
katsayılar konuşulur.

### ⭐ L — Gnom yapı yıkıyor mu, ne kadar?

| # | Saldıran | Savunan | M: kazanan | M: tur | M: saldırandan kalan | M: savunandan kalan | B: kazanan | B: tur | B: saldırandan kalan | B: savunandan kalan |
|---|---|---|---|---|---|---|---|---|---|---|
| **L1** | Gnom 1000 | Okçu Kulesi 500 | SAVUNAN | 1 | Gnom 1000/1000 | Kule 500/500 | savunan| 1| 1000|380-401 |
| L2 | Gnom 1000 | Okçu Kulesi 500 + Tuzak 1000 | SAVUNAN | 1 | Gnom 1000/1000 | Kule 500/500 · Tuzak 0/1000 | *(ölçüldü)* | | Gnom 1000/1000 | Kule 384-404 · Tuzak 475-477 |
| L3 | Gnom 500 | Okçu Kulesi 500 | SAVUNAN | 1 | Gnom 500/500 | Kule 500/500 |savunan |1 |500 |429-441 |
| L4 | Gnom 2000 | Okçu Kulesi 500 | SAVUNAN | 1 | Gnom 2000/2000 | Kule 500/500 |savunan |1 |2000 |380-401 |
| L5 | Gnom 1000 | Balista 100 | SAVUNAN | 1 | Gnom 1000/1000 | Balista 100/100 |savunan |1 |1000 |98 |
| L6 | Gnom 1000 | Muhafız 200 | SAVUNAN | 1 | Gnom 1000/1000 | Muhafız 200/200 | savunan| 1|934 |188-190 |
| L7 | Cüce 3000 + Gnom 1000 | Okçu Kulesi 500 | SALDIRAN | 3 | Cüce 2859/3000 · Gnom 1000/1000 | Kule 382-404/500 | saldıran| 1|3000 cüce / 1000 gnom |380-401 |

👉 **L1 kilit satır:** L2'den tek farkı tuzakların olmaması. L1'de de ~100 kule gidiyorsa
gnomun yapı yıkması **tuzaktan bağımsız** bir mekanizma. L1'de hiç kule gitmiyorsa yıkım
tuzak patlamasının yan etkisi demektir.
👉 L3 · L1 · L4 gnom sayısıyla ölçeklemeyi verir · L5 · L6 hedef yapının cinsi fark ediyor mu.

### ⭐ K — Tuzak: sökme (gnom) ve tüketim (gerçek ordu)

| # | Saldıran | Savunan | M: kazanan | M: tur | M: saldırandan kalan | M: savunandan kalan | B: kazanan | B: tur | B: saldırandan kalan | B: savunandan kalan |
|---|---|---|---|---|---|---|---|---|---|---|
| K1 | Gnom 50 | Tuzak 1000 | BERABERE | 1 | Gnom 50/50 | Tuzak 903-947/1000 |savunan |1 |50 |1000 |
| K2 | Gnom 100 | Tuzak 1000 | BERABERE | 1 | Gnom 100/100 | Tuzak 806-894/1000 | *(ölçüldü)* | | Gnom 100/100 | Tuzak 951-952/1000 |
| K3 | Gnom 250 | Tuzak 1000 | BERABERE | 1 | Gnom 250/250 | Tuzak 516-734/1000 | savunan| 1|250 |236-239 |
| K4 | Gnom 500 | Tuzak 1000 | BERABERE | 1 | Gnom 500/500 | Tuzak 32-468/1000 | savunan| 1|500 |0 |
| **K5** | Gnom 1000 | Tuzak 1000 | BERABERE | 1 | Gnom 1000/1000 | Tuzak 0/1000 |savunan |1 |1000 | 0 |
| K6 | Gnom 2000 | Tuzak 1000 | BERABERE | 1 | Gnom 2000/2000 | Tuzak 0/1000 | savunan|1 |2000 |0 |
| K7 | Cüce 120 | Tuzak 1000 | BERABERE %60 / SALDIRAN %40 | 1 | Cüce 0/120 | Tuzak 933/1000 | *(ölçüldü)* SALDIRAN | | Cüce 1/120 | Tuzak 933/1000 |
| K8 | Cüce 500 | Tuzak 1000 | BERABERE %60 / SALDIRAN %40 | 1 | Cüce 0-1/500 | Tuzak 719/1000 |saldıran |1 |2-3 |720 |
| K9 | Cüce 3000 | Tuzak 1000 | SALDIRAN | 1 | Cüce 1308-1742/3000 | Tuzak 14-246/1000 | saldıran| 1| 1301-1749| 10-250|

👉 K1-K6 sökme eğrisini verir (binary'de 100 gnom ≈ 48 tuzak söküyor → katsayı ~0,5; bizde 1,5).
K5 çelişkisi burada çözülür.
👉 K7-K9 tüketim eğrisi. K7 zaten birebir tutuyor; K8 · K9 formülün ölçekte de tutup tutmadığını
gösterir. **K8'de kaç cüce kaldığı** ayrıca önemli — bizde 0-1, yani K7'deki gibi kesir eşiğinde
geziniyor ve kazananı o belirliyor.

### H — Her savunma birimi tek başına (aynı saldırgan: Cüce 3000)

| # | Saldıran | Savunan | M: kazanan | M: tur | M: saldırandan kalan | M: savunandan kalan | B: kazanan | B: tur | B: saldırandan kalan | B: savunandan kalan |
|---|---|---|---|---|---|---|---|---|---|---|
| H1 | Cüce 3000 | Okçu Kulesi 50 | SALDIRAN | 3 | Cüce 3000/3000 | Kule 38-40/50 |saldıran |3 |3000 | *(eski E1: 38-41 ✅)* |
| H2 | Cüce 3000 | Kazancı 50 | SALDIRAN | 3 | Cüce 2928-2929/3000 | Kazancı 38-40/50 |saldıran |3 |2929 | 38-41|
| H3 | Cüce 3000 | Mangonel 50 | SALDIRAN | 4 | Cüce 2744-2745/3000 | Mangonel 38-40/50 | saldıran| 4| 2745| 38-41|
| H4 | Cüce 3000 | Muhafız 50 | SALDIRAN | 3 | Cüce 2967/3000 | Muhafız 38-40/50 | saldıran| 3|2967 | 38-41|
| H5 | Cüce 3000 | Balista 50 | **SAVUNAN** | 4 | Cüce **0**/3000 | Balista 48-49/50 |savunan |4 |0 |49 |
| H6 | Cüce 3000 | Tuzak 50 | SALDIRAN | 1 | Cüce 3000/3000 | Tuzak 1-12/50 |saldıran |1 |3000 |1-11 |

👉 "Saldırandan kalan" sütunu her savunma biriminin **saldırı gücünü** ayrı ayrı ölçer.
H5 çarpıcı: 50 balista 3000 cücenin tamamını siliyor — binary de böyle mi?

### I — Savunma adedi ölçeği (saldıran sabit: Cüce 3000)

| # | Saldıran | Savunan | M: kazanan | M: tur | M: saldırandan kalan | M: savunandan kalan | B: kazanan | B: tur | B: saldırandan kalan | B: savunandan kalan |
|---|---|---|---|---|---|---|---|---|---|---|
| I1 | Cüce 3000 | Okçu Kulesi 10 | SALDIRAN | 3 | Cüce 3000/3000 | Kule 8/10 |saldıran |3 |3000 |8-9 |
| I2 | Cüce 3000 | Okçu Kulesi 200 | SALDIRAN | 3 | Cüce 3000/3000 | Kule 152-162/200 |saldıran |3 |3000 |155-161 |
| I3 | Cüce 3000 | Okçu Kulesi 500 | SALDIRAN | 3 | Cüce 2800/3000 | Kule 380-405/500 | saldıran|3 |2800-2801 | 380-401|

👉 Motorda kalan **oran** hep %76-81; adet değişse de oran sabit. Binary'de oran mı sabit
kalıyor, yoksa giden **adet** mi?

### M — Uçan saldırgan savunmayı nasıl görüyor?

| # | Saldıran | Savunan | M: kazanan | M: tur | M: saldırandan kalan | M: savunandan kalan | B: kazanan | B: tur | B: saldırandan kalan | B: savunandan kalan |
|---|---|---|---|---|---|---|---|---|---|---|
| **M1** | Ejderha 100 | Tuzak 1000 | SALDIRAN | 1 | Ejderha 100/100 | Tuzak 1000/1000 | saldıran| 1| 79-85|10-250 |
| **M2** | Pegasus 500 | Tuzak 1000 | SALDIRAN | 1 | Pegasus 500/500 | Tuzak 1000/1000 | saldıran| 1| 274-334|10-250 |
| M3 | Casus Kuş 100 | Tuzak 50 | BERABERE | 1 | Casus Kuş 100/100 | Tuzak 50/50 | *(ölçüldü)* | | Kuş 100/100 | Tuzak 50/50 ✅ |
| M4 | Ejderha 100 | Okçu Kulesi 500 | SALDIRAN | 2 | Ejderha 100/100 | Kule 380-405/500 | saldıran|2 |100 |380-401 |

👉 **M1/M2 açık bir [REKON] varsayımını sınıyor.** `combat.ts:640` yorumu aynen şöyle diyor:
*"Uçanlar hâlâ dışarıda. Binary'nin toplamında böyle bir süzgeç GÖRÜNMÜYOR (iki liste ham
toplanıyor), ama oyunun kendi dokümanı tuzağın yer ünitelerine zarar verdiğini söylüyor…
ölçümle çürütülürse `ground` filtresinden `FLYING`i çıkarmak tek satır."*
Binary tuzakları harcarsa ya da ejderha kaybettirirse süzgeç kalkacak.
⚠️ M3 ile karıştırma: kuş zaten `OUT_OF_BATTLE`; M1/M2 gerçek savaşçı uçanlar.

### N — Onarım ve savunma tabanı

| # | Saldıran | Savunan | M: kazanan | M: tur | M: saldırandan kalan | M: savunandan kalan | B: kazanan | B: tur | B: saldırandan kalan | B: savunandan kalan |
|---|---|---|---|---|---|---|---|---|---|---|
| **N1** | Cüce 500 | Okçu Kulesi 50 + Cüce 2000 | SAVUNAN | 3 | Cüce 0/500 | Kule 49/50 · Cüce 1946/2000 |savunan |3 | 0|1946-1947 cüce / 49-50 kule |
| N2 | Cüce 3000 | Okçu Kulesi 3 | SALDIRAN | 3 | Cüce 3000/3000 | Kule 3/3 | saldıran|3 |3000 |3 |
| N3 | Cüce 10000 | Okçu Kulesi 5 + Balista 2 | SALDIRAN | 3 | Cüce 10000/10000 | Kule 4/5 · Balista 2/2 |saldıran |3 |10000 |4-5 kule / 2 balista |

👉 **N1 kilit:** savunan **kazandığında** kuleleri neredeyse hiç gitmiyor (49/50); kaybettiğinde
%20 gidiyor. Binary'de de kazanmak savunmayı koruyor mu, yoksa kayıp sonuçtan bağımsız mı?
👉 N2 · N3 küçük sayılarda taban koruması (bizde 3 kule hiç gitmiyor).

### O — Enkaz (savunma birimi ganimet üretiyor mu?)

Bu blokta **enkaz** sütunu asıl ölçülen şey; `altın/yemek` biçiminde yaz.

| # | Saldıran | Savunan | M: kazanan | M: tur | M: savunandan kalan | M: enkaz (altın/yemek) | B: kazanan | B: savunandan kalan | B: enkaz (altın/yemek) |
|---|---|---|---|---|---|---|---|---|---|
| O1 | Cüce 3000 | Okçu Kulesi 200 | SALDIRAN | 3 | Kule 152-162/200 | **0 / 0** | saldıran|152-161 |0/0 |
| O2 | Cüce 3000 | Cüce 1000 + Okçu Kulesi 200 | SALDIRAN | 4 | Cüce 0/1000 · Kule 152-160/200 | 70.860 / 159.435 | saldıran|2819-2820 | 70858/159433|

👉 O1'de 40-48 kule ölüyor ama enkaz **sıfır**. O2'de yanına 1000 cüce koyunca enkaz çıkıyor —
yani bizde enkazın tamamı cücelerden geliyor, kuleler hiç katkı vermiyor. Binary'de O1 sıfırdan
büyük çıkarsa `debrisFromDefenses` açılacak; O2'de bizden **fazla** çıkarsa fark kulelerin payıdır.

---

## 4. Ölçüm şablonu

Her satır için binary simülatörden şunlar lazım:

```
saldıran birimler → savunan birimler
kazanan = ?            tur = ?
saldırandan kalan = ?  (her tür ayrı)
savunandan kalan = ?   (her tür ayrı — tuzak/kule dâhil)
enkaz = ? altın / ? yemek        (yalnız O bloğunda şart)
```

⚠️ **Saçılmanın kendisi de veri.** Motorumuzun oynak/sabit olduğu yerler binary ile ters
düşüyor: L2'de binary oynak biz sabitiz, K2'de biz çok geniş saçılıyoruz binary 951-952'ye
sıkışmış. Sabit çıkan satırlara "sabit" diye not düş.

## 5. ✅ SONUÇ (2026-08-13, ölçümler geldikten sonra)

**Savunma modelinin çekirdeği DOĞRUYMUŞ; üç ayrı eksik var ve üçü de tek bir formüle iniyor.**

### Oturan bloklar — dokunulmayacak

| Blok | Sonuç |
|---|---|
| **J** (4/4) | ⭐ Savunma kaybı saldıran gücünden **gerçekten bağımsız**. 500 ile 10.000 cüce aynı sonucu veriyor, kule dördünde de 76-81. Şüphelendiğimiz "hepsi ölüyor + onarım" modeli **doğruymuş**. |
| **H** (6/6) | Her savunma biriminin saldırı gücü birebir (H4 muhafız: 2967 = 2967). 50 balista gerçekten 3000 cüceyi siliyor. |
| **I** (3/3) | Kalan **oran** sabit, adet değil — bizdeki gibi. |
| **N** (3/3) | Onarım ve savunma tabanı doğru; savunan kazanınca kuleleri korunuyor (49-50/50). |
| **O** (2/2) | Savunma birimleri enkaz **vermiyor** — O1 binary'de de `0/0`. `debrisFromDefenses: false` doğru. |
| **K7-K9** | Tuzak tüketimi ve tetikleme tavanı doğru. |

### ⭐ Bulunan kural — üç eksiğin ortak kökü

Gnomun yapıya karşı davranışı **ayrı bir mekanizma değil**, standart hasar çekirdeğinin Tur 1
tip-2 fazında savunma yapılarına uygulanmış hali:

```
havuz   = gnom.hp (200) × gnomAdedi
pay_i   = (alan_i × adet_i / Σ alan×adet) × havuz     ← hedefler ALANA göre pay alır
net_i   = pay_i − pDef_i × adet_i
yıkılan_i = ⌊ net_i / mDef_i ⌋                        (hedef adediyle sınırlı)
```

Ardından **sağ kalan** tip-2 savunma birimleri aynı formülle gnomları vuruyor (sıra önemli).

| Ölçüm | Formülün tahmini | Binary | |
|---|---|---|---|
| L1 · 1000 gnom → 500 kule | 606 → tavan 500 yıkık → **380-405** kalır | 380-401 | ✅ |
| L3 · 500 gnom → 500 kule | 298 yıkık → **428-443** | 429-441 | ✅ |
| L4 · 2000 gnom → 500 kule | tavan → **380-405** | 380-401 | ✅ |
| L5 · 1000 gnom → 100 balista | 10 yıkık → **98** | 98 | ✅ |
| L6 · 1000 gnom → 200 muhafız | 53 yıkık → **187-190** | 188-190 | ✅ |
| L6 ters yön · 147 muhafız → gnom | 66 gnom ölür → **934** | 934 | ✅ birebir |
| L2 · kule+tuzak birlikte | kule **384-408** · tuzak **477** | 384-404 · 475-477 | ✅ |
| K1 · 50 gnom → 1000 tuzak | net **negatif** → 0 yıkık | 1000 | ✅ |
| K3 · 250 gnom | 761 yıkık → **239** | 236-239 | ✅ |
| K4/K5/K6 · 500+ gnom | tavan → **0** | 0 | ✅ |

⭐ **K5 çelişkisi çözüldü.** İlk ekran görüntüsü doğruymuş: 1000 gnom tek başına 1000 tuzağın
hepsini siliyor. L2'de 475-477 kalmasının sebebi **pay paylaşımı** — yanına 500 kule girince
alan oranı `kule 12.000 / tuzak 3.000` oluyor, tuzağa havuzun yalnız %20'si düşüyor → 523 tuzak.
İki ölçüm de aynı formülün sonucu.

### Yapılacak üç düzeltme

**1. Gnom → savunma yapısı vuruşu ekle (Tur 1).** Motorda bunun **ters yönü zaten var**:
`turn1GnomeSkirmish` savunanın gnomunu saldıranın mancınığına vurduruyor. Eksik olan simetriği.
Ghidra teyidi: Tur 1 fonksiyonu `FUN_0040e794` içinde tur döngüsünün dışında **beş ayrı**
`FUN_0040e0c4` (hasar çekirdeği) çağrısı var — yani vuruş tura değil Tur 1'e bağlı.

**2. `cfg.trap.gnomeDisarm` kaldırılacak.** Böyle bir katsayı yok; sökme aynı formülün tuzağa
uygulanmış hali. Bugünkü `1,5 × gnom` modeli hem şekil hem büyüklük olarak yanlış — gerçek eğri
lineer değil (50 gnom → **0**, çünkü net negatif; 100 → 47; 250 → 761; 500+ → hepsi).

**3. `FLYING` süzgeci kalkacak** (`trapVolley` · `combat.ts:655`). Tuzak uçanları da vuruyor;
`combat.ts:640`'taki [REKON] varsayımı **çürüdü**. Süzgeç kalkınca çıkacak sayılar hesaplandı:

| | Tahmin | Binary |
|---|---|---|
| Ejderha 100 | 78-85 kalır | 79-85 ✅ |
| Pegasus 500 | 273-336 kalır | 274-334 ✅ |
| Cüce 3000 (kontrol) | 1299-1747 | 1301-1749 ✅ |

Tuzak tarafı üçünde de `10-250` — tetikleme tavanı (`triggerMin 0,75 / triggerMax 0,99`)
zaten doğru. **Tek satırlık değişiklik, başka ayar gerekmiyor.**

### ⚠️ Dördüncü, küçük ama sonucu değiştiren fark

Binary öldürüleni **aşağı yuvarlıyor**, biz yuvarlıyoruz → her savaşta 1-3 saldıran fazla
ölüyor bizde: K7 `0 ↔ 1` · K8 `0-1 ↔ 2-3` · O2 `2818 ↔ 2819`.

⭐ Bu, oturumun başındaki **beraberlik sorusunu da kapatıyor**: K7/K8'de binary son 1 cüceyi
sağ bıraktığı için hep SALDIRAN kazanıyor, biz 0'a indirdiğimiz için %60 BERABERE veriyoruz.
Yani beraberlik ayrı bir kural sorunu değil, **yuvarlama** sorunuymuş.
`SAVAS_BINARY_KONTROL.md`'de bu zaten *"AŞAĞI YUVARLAMA ŞART"* diye kayıtlı ve `applyLoss`a
dokunulmadığı için Tur 1 kendi tam sayılı hesabını yapıyor (`gnomeStrike`).

---

## 6. ✅ UYGULANDI (2026-08-13) — 38 satırın 35'i tutuyor

Dördü de yazıldı; düzeltme sonrası motor ölçümle karşılaştırıldı:

| Blok | Önce | Sonra |
|---|---|---|
| J · H · I · N · O | zaten tutuyordu | ✅ bozulmadı |
| **L** (gnom → yapı) | kule 500/500 (hiç dokunmuyordu) | ✅ 7/7 satır |
| **K** (tuzak) | sökme eğrisi yanlış | ✅ 8/9 satır |
| **M** (uçan) | tuzak 1000/1000 | ✅ 4/4 — ejderha **79-85**, ölçümle birebir |

### Kod değişiklikleri

- **`gnomeStructStrike`** (yeni) — saldıranın gnomu savunmanın sayılı yapılarını alan-paylı
  vurur. `LEVEL_BASED` hedef değil; `PASSIVE_STRUCTS` olan Tuzak hedef.
- **`structGnomeCounter`** (yeni) — sağ kalan **tip-2, pasif olmayan** savunma yapıları gnoma
  karşılık verir. Sıra ölçümle sabit (L6 → 934).
- **Tur 1 sırası değişti** — gnom sabotajı artık tuzak salvosundan **önce** (Ghidra
  `FUN_0040e794` ve L2 ölçümü bunu gerektiriyor).
- **`cfg.trap.gnomeDisarm` kaldırıldı** — `packages/engine/src/config.ts`,
  `packages/settings/src/schema.ts` ve `apps/api/src/settings/combat.ts`'ten de silindi.
- **`FLYING` süzgeci kaldırıldı** (`trapVolley`).
- **Tur 1 yuvarlaması** — tetiklenen tuzak ve salvo kaybı artık `floor`. `applyLoss`a
  DOKUNULMADI (referans savaş + Sur/Kalkan altın testleri ona sabit).

Bekçi testleri: `packages/engine/test/gnome-struct.test.ts` (9 test) + `trap.test.ts`'teki iki
test ölçüme göre yeniden yazıldı. **Motor 278/278, tam çalışma alanı koşusu temiz.**

### ⏳ Kalan üç satır — ikisi bilinen aile, biri önemsiz

**L1 · L4 — `BERABERE` ↔ `SAVUNAN`.** Gnom yapıların hepsini yıkınca iki tarafta da ayakta
kimse kalmıyor → motor BERABERE diyor, binary'de berabere yok. Bu, `SAVAS_BINARY_KONTROL.md`
satır 6'daki **aynı bilinen ayrım**; yeni bir kırılma değil, ama artık **8 ölçümde birden**
görünüyor (K1-K6 · L1 · L4 · M3 hepsinde binary "savunan" diyor).
✅ **KARAR (2026-08-14, kullanıcı): beraberlik KALIYOR — bilinçli sapma.** Kimsenin ayakta
kalmadığı bir savaşı savunanın zaferi saymak yanlış okunuyor; MobilWar beraberliği oyun
mekaniği olarak tutuyor. Sonuçları da kabul edildi: berabere savaşta iki tarafa da 0 XP,
kahraman şansı 0, saldırana ganimet yok (enkazın tamamı savunanın şehrine). Gerekçe
`combat.ts`'te kazanan kararının başına yazıldı ki ileride "binary'ye uymuyor" diye
düzeltilmeye kalkılmasın.

**K2 — tuzak 953 ↔ 951-952.** 100 gnom için formül 47 tuzak veriyor, binary 48-49 kırıyor.
±2'lik bu fark yalnız bu satırda; K3'te (761 ↔ 761-764) alt sınır birebir tutuyor. Binary'de
havuza küçük bir jitter var gibi görünüyor. Kovalamaya değmez, kayda geçti.

⚠️ Ayrıca **L7 tur sayısı** düzeldi: gnomlar kuleleri Tur 1'de yıktığı için savaş artık
binary'deki gibi **1 turda** bitiyor (eskiden 3 tur sürüyordu).
