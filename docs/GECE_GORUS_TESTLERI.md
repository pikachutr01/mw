# GECE GÖRÜŞÜ — BİNARY SİMÜLATÖR DOĞRULAMA SETİ

Üretim: 2026-08-11 · motor karşılığı: `packages/engine/test/night-vision-golden.test.ts` (17 test, yeşil)
· önceki tur: `docs/veri/gece-savasi-olcumleri.md` (2026-07-31, mekanizma + 6 hücrelik tarama)

## Bu set neyi soruyor

2026-07-31'de gece'nin **hangi statları** çarptığı Ghidra ile satır satır okundu (Can + Büyü Canı,
başka hiçbir şey) ve **büyüklüğü** 6 hücrelik bir taramayla doğrulandı. Ama o taramanın altısı da
**5 turluk** savaşlardı ve 5 turluk savaşta her şey her şeyi etkiler. O yüzden şu soru **hiç
sorulamadı**:

> **Gece görüşü savunmaya da mı işliyor, yoksa yalnız saldırıya mı?**

Doküman burada **kendi içinde çelişiyor**:

| kaynak | ne diyor |
|---|---|
| `on_bilgiler.txt:25` | *"…savaşçıların **vuruş ve savunma** gücü o kadar artar"* |
| `on_bilgiler.txt:583` | *"…ordu ve savunmanın **vuruş gücü** azalır… (**logaritmik** bir oran)"* |

### Motorun bugünkü modeli (çürütülmek üzere ortaya konuyor)

```
Gece çarpanı YALNIZ poolHp / poolMagicHp'ye uygulanıyor. O alanları da sadece iki yer okuyor:
    combatPool()      = saldırı havuzu
    shamanShield()    = Şaman'ın emdiği miktar

Kayıp formülünün DAYANIKLILIK tarafı geceden HİÇ etkilenmiyor:
    mDef (bölücü) · unitPower (pay) · pAtk/pDef/mAtk (mitigasyon)

⇒ GECE GÖRÜŞÜ TAMAMEN OFANSİF BİR STATTIR.
  Kendi seviyen DÜŞMANIN kaybını belirler; SENİN kaybına doğrudan hiç dokunmaz.
```

⚠️ Motor ayrıca çarpanı **logaritmik değil** kabul ediyor: `çarpan = (1 − 3/(GG+3)) × 0,3 + 0,7`.

### ⭐⭐ Setin anahtarı: 2 turluk savaş iki tarafı BİRBİRİNDEN AYIRIR

Tur 2'de önce saldıran vurur, sonra savunan; **ikisi de tur başı fotoğrafını** kullanır. Savaş
2. turda biterse (bir taraf silinir) sonraki tur yoktur, yani geri besleme kanalı da yoktur:

```
savunanın kaybı = f(çarpan_saldıran)        saldıranın kaybı = g(çarpan_savunan)
```

⚠️ **Tur 2'nin faz listesi `[menzilli, büyü]` — yakın dövüş YOK.** Bu yüzden setin çekirdeği
menzilli birimlerle kurulu (Mancınık ve Elf tip 1). **Cüce (tip 2) 2. turda hiç vurmaz** — ordu
listesini kafanıza göre değiştirmeyin, tur sayısı 2'den çıkarsa izolasyon bozulur.

---

## Nasıl kullanılır

Her satırı simülatöre gir, sonucu **gerçek** sütunlarına yaz.

Aksi belirtilmedikçe: **tüm teknikler 0 · kahraman yok · tapınak 0 · Sur/Kalkan yok ·
saldıranın savunma yapısı yok.**

⚠️ Simülatör ±%0,1 rastgelelik uyguluyor → **her satırı 2-3 kez koş**, aralık olarak yaz.
Motor sütunları 8 seed ortalamasıdır.

⭐ **TUR SAYISINI HER SATIRDA YAZ.** A-F gruplarının tamamı «savaş 2 turda bitti» ön koşuluna
dayanıyor. Bir satır 3+ tur sürdüyse o satırın iddiası geçersizdir, sonucu değil **turu** bildir.

---

## ÇEKİRDEK KURULUM (A · B · C · D · E · F)

> **Saldıran: 100 Mancınık · Savunan: 9.000 Elf · GECE**

Savunanın havuzu saldıranın dayanıklılığının ~4 katı → saldıran 2. turda **tamamen** siliniyor
(atkK her satırda 100). Savunanın kaybı ise doymuyor (9.000'den ~100-300) → ölçülebilir kalıyor.

---

## A · Savunanın gece görüşü KENDİ kaybını değiştiriyor mu?

⭐⭐⭐ **Setin en belirleyici grubu.** Doküman satır 25 haklıysa savunanın gece görüşü onun
savunma gücünü büyütür ve **kendi kaybını düşürür**. Motor bunu tamamen reddediyor.

| # | GG sal/sav | motor: tur | motor: atkK | motor: defK | **gerçek: tur** | **gerçek: atkK** | **gerçek: defK** |
|---|---|---:|---:|---:|---|---|---|
| A1 | 0 / 0 | 2 | 100 | **102,5** |2 | 100|102-103 |
| A2 | 0 / 1 | 2 | 100 | **102,5** |2 |100 |102-103 |
| A3 | 0 / 3 | 2 | 100 | **102,5** |2 |100 |102-103 |
| A4 | 0 / 5 | 2 | 100 | **102,5** |2 | 100|102-103 |
| A5 | 0 / 10 | 2 | 100 | **102,5** | 2|100 |102-103 |
| A6 | 0 / 20 | 2 | 100 | **102,5** |2 |100 |102-103 |

### Nasıl okunur

| Gözlem | Sonuç |
|---|---|
| Altı satırın defK'sı da aynı (±1) | ✅ Gece görüşü **ofansif**, doküman satır 583 haklı, satır 25 yanlış |
| defK GG arttıkça **düşüyor** | ⛔ Gece savunmaya/dayanıklılığa da işliyor → motorda **eksik bir kanal** var |
| defK GG arttıkça **artıyor** | ⛔ Beklenmedik; çarpan tek taraflı değil, savaş çapında bir şey olabilir |
| Bir satırda tur ≠ 2 | ⚠️ İzolasyon bozuldu, o satırı iptal et |

⚠️ **Bu grup tek başına «hiçbir şey ölçmüyor» diye eleştirilebilir** (belki simülatör GG_savunan
kutusunu hiç okumuyordur). **E grubu tam olarak bunun kontrolüdür**: aynı kurulum, tek fark
savunmaya eklenen 100 Şaman — ve orada aynı kutu sayıyı 37,4'ten 15,4'e indiriyor.
**A ve E birlikte koşulmadan hiçbiri karara girmez.**

---

## B · Eğrinin ŞEKLİ — parametreden bağımsız oran testi

Aynı çekirdek kurulum, bu sefer **saldıranın** gece görüşü taranıyor.

| # | GG sal/sav | motor: tur | motor: defK | **gerçek: tur** | **gerçek: defK** |
|---|---|---:|---:|---|---|
| B1 | 0 / 0 | 2 | 102,5 |2 |102-103 |
| B2 | 1 / 0 | 2 | 150,5 |2 |150-151 |
| B3 | 2 / 0 | 2 | 179,4 |2 | 178-180|
| B4 | 3 / 0 | 2 | 198,5 | 2| 198-199|
| B5 | 5 / 0 | 2 | 222,5 |2 | 222-223|
| B6 | 10 / 0 | 2 | 250,4 |2 |249-251 |
| B7 | 20 / 0 | 2 | 269,5 | 2| 269-270|
| B8 | **GÜNDÜZ** | 2 | **294,9** | 2| 294-295|

### ⭐⭐ Oran testi — ordu boyundan, birimden ve tabandan BAĞIMSIZ

Kayıp çarpana **afin** bağlı (`kayıp = A·çarpan − B`). Farkların oranını alınca hem `A` hem `B`
sadeleşiyor:

```
        defK(GG) − defK(0)         çarpan(GG) − çarpan(0)
       ────────────────────  =  ────────────────────────────
        defK(20) − defK(0)         çarpan(20) − çarpan(0)
```

Sağ taraf **yalnız formülün şekline** bağlı. ⭐ Dahası, `0,7` tabanı da sadeleşiyor — yani bu
test **şekli**, B8/B1 aralığı ise **büyüklüğü** ölçüyor. İkisi birbirinden bağımsız:

> Oranlar tutuyor ama mutlak sayılar tutmuyorsa → **eğri doğru, yalnız `0,7` tabanı yanlış.**
> Oranlar tutmuyorsa → **eğrinin kendisi yanlış.**

| GG | **motor** `1−3/(L+3)` | `1−1/(L+1)` | `1−5/(L+5)` | **logaritmik** | karekök |
|---:|---:|---:|---:|---:|---:|
| 1 | **0,2875** | 0,5250 | 0,2083 | 0,2277 | 0,2236 |
| 2 | **0,4600** | 0,7000 | 0,3571 | 0,3608 | 0,3162 |
| 3 | **0,5750** | 0,7875 | 0,4688 | 0,4553 | 0,3873 |
| 5 | **0,7188** | 0,8750 | 0,6250 | 0,5885 | 0,5000 |
| 10 | **0,8846** | 0,9545 | 0,8333 | 0,7876 | 0,7071 |

⭐ Sütunlar birbirinden yeterince uzak: tek bir satır (GG 5) bile beş modelden dördünü eler.
Dokümanın *"logaritmik oran"* ifadesi burada **karara bağlanıyor**.

---

## C · AYNA — iki kod yolu aynı sabitleri mi kullanıyor?

⭐⭐ Binary'de gece'yi uygulayan **iki ayrı fonksiyon** var ve sabitleri **iki ayrı adresten**
okunuyor: saldıran `FUN_004111d4` (0x00411280..) · savunan `FUN_00411a80` (0x00411b74..). İkisinin
de `3,0 · 1,0 · 0,3 · 0,7` okuduğu **varsayılıyor** — hiç sınanmadı.

Kurulum tam ayna: **aynı iki ordu, roller ters.** Saldıran **9.000 Elf** · Savunan **100 Mancınık**.

| # | GG sal/sav | motor: tur | motor: atkK | B'deki karşılığı | **gerçek: tur** | **gerçek: atkK** |
|---|---|---:|---:|---:|---|---|
| C1 | 0 / 0 | 2 | 102,6 | B1 = 102,5 |2 | 102-103|
| C2 | 0 / 1 | 2 | 150,6 | B2 = 150,5 |2 |150-151 |
| C3 | 0 / 3 | 2 | 198,6 | B4 = 198,5 | 2| 198-199|
| C4 | 0 / 5 | 2 | 222,6 | B5 = 222,5 | 2|222-223 |
| C5 | 0 / 10 | 2 | 250,4 | B6 = 250,4 | 2|249-251 |
| C6 | 0 / 20 | 2 | 269,6 | B7 = 269,5 |2 | 269-270|

**Nasıl okunur:** C sütunu B sütununa **birebir** oturmalı. Sistematik bir sapma (örneğin
savunan tarafta hep daha yüksek/düşük) iki kod yolunun **farklı sabitler** kullandığı anlamına
gelir ve motorun tek `nightMultiplier`'ı yanlış olur.

---

## D · Ölçek değişmezliği — «değişken sayılarda ordular»

Gece çarpımsal bir **havuz** etkisiyse iki orduyu da `k` ile büyütmek her iki kaybı da tam `k`
katına çıkarır (havuz ∝ k, güç toplamı P ∝ k → `havuz/P` sabit). Gece'de adetten bağımsız
**mutlak** bir bileşen olsaydı tam burada kırılırdı.

### D-1 · tek tip ordu (çekirdek kurulum × k) — 2 tur

| # | ordu | GG sal/sav | motor: defK | motor: defK ÷ k | **gerçek: defK** |
|---|---|---|---:|---:|---|
| D1 | 100 Manc. / 9.000 Elf | 0 / 0 | 102,5 | 102,5 | 102-103|
| D2 | 300 Manc. / 27.000 Elf | 0 / 0 | 307,4 | 102,5 | 306-309|
| D3 | 1.000 Manc. / 90.000 Elf | 0 / 0 | 1.025,0 | 102,5 |1021-1030 |
| D4 | 100 Manc. / 9.000 Elf | 20 / 0 | 269,5 | 269,5 | 269-270|
| D5 | 300 Manc. / 27.000 Elf | 20 / 0 | 809,3 | 269,8 |807-811 |
| D6 | 1.000 Manc. / 90.000 Elf | 20 / 0 | 2.697,3 | 269,7 | 2691-2704|

### D-2 · karışık ordu, 5 turluk savaş (geri besleme AÇIK)

⚠️ Burada **üç farklı boy** var ve `k` yalnız satırları etiketleyen bir çarpan — kutulara
girilecek sayılar aşağıdaki tabloda **tam olarak** yazıyor. Her boyda **oran aynı**, yalnız
adetler büyüyor.

| k | **Saldıran kutusuna** | **Savunan kutusuna** |
|---:|---|---|
| **1** | 800 Elf · 1.200 Cüce · 150 Süvari | 600 Elf · 1.800 Cüce · 80 Pegasus |
| **2** | 1.600 Elf · 2.400 Cüce · 300 Süvari | 1.200 Elf · 3.600 Cüce · 160 Pegasus |
| **5** | 4.000 Elf · 6.000 Cüce · 750 Süvari | 3.000 Elf · 9.000 Cüce · 400 Pegasus |

⚠️ Bu grup **5 tur sürmeli** (çekirdek kurulumun tersine) — ordularda Cüce ve Süvari var, yani
yakın dövüş fazı da devrede ve iki taraf da ayakta kalıyor. Burada `tur = 5` beklenen davranıştır,
hata değil.

| # | k | GG sal/sav | motor: atkK | motor: defK | motor: kazanan | **gerçek: atkK** | **gerçek: defK** | **gerçek: kazanan** |
|---|---:|---|---:|---:|---|---|---|---|
| D7 | 1 | 0 / 0 | 1.001 | 986 | savunan |998-1000 | 983-986| savunan|
| D8 | 1 | 10 / 0 | 840 | 1.562 | **saldıran** | 838-841|1559-1562 | saldıran|
| D9 | 1 | 0 / 10 | 1.641 | 777 | savunan | 1639-1642|774-777 | savunan|
| D10 | 2 | 0 / 0 | 2.002 | 1.973 | savunan |2000-2004 |1968-1973 | savunan|
| D11 | 2 | 10 / 0 | 1.681 | 3.124 | **saldıran** | 1677-1681|3120-3125 | saldıran|
| D12 | 5 | 0 / 0 | 5.005 | 4.931 | savunan | 4995-5006| 4924-4935|savunan |
| D13 | 5 | 10 / 0 | 4.203 | 7.811 | **saldıran** | 4199-4207|7802-7818 | saldıran|
| D14 | 1 | **GÜNDÜZ** | 1.535 | 1.361 | savunan |1532-1536 |1358-1361 | savunan|

⭐ D7→D10→D12 ve D8→D11→D13 **tam ×2 ve ×5** olmalı. Karışık orduda ve geri besleme açıkken
bile ölçek değişmezliği bozulmuyorsa gece'nin tek etkisi havuz çarpanıdır.

---

## E · ŞAMAN JİLETİ — savunanın gece görüşünün TEK savunma kanalı

⭐⭐⭐ **A grubunun kontrol deneyi ve setin ikinci belirleyici grubu.**

A grubu «savunanın GG'si kendi kaybını değiştirmez» diyor. Motorun öngördüğü **tam olarak bir
istisna** var: Şaman. Şaman gelen havuzdan **ham stat × adet** çıkarıyor ve o stat da gece
çarpanıyla ölçekli. Yani gece Şaman'ı zayıflatır, gece görüşü de Şaman'ı **geceden korur**.

Kurulum: çekirdek + savunmaya **100 Şaman** (`9.000 Elf + 100 Şaman`).

| # | GG sal/sav | motor: tur | motor: defK | A'daki eşi (şamansız) | **gerçek: tur** | **gerçek: defK** |
|---|---|---:|---:|---:|---|---|
| E1 | 0 / 0 | 2 | **37,4** | 102,5 |2 | 36-37|
| E2 | 0 / 1 | 2 | **31,0** | 102,5 |2 | 30-31|
| E3 | 0 / 3 | 2 | **24,5** | 102,5 |2 |24-25 |
| E4 | 0 / 5 | 2 | **21,5** | 102,5 |2 |21 |
| E5 | 0 / 10 | 2 | **18,0** | 102,5 |2 | 17-18|
| E6 | 0 / 20 | 2 | **15,4** | 102,5 | 2| 15|
| E7 | **GÜNDÜZ** | 2 | 202,4 | 294,9 |2 | 201-202|

### Nasıl okunur

| Gözlem | Sonuç |
|---|---|
| A sabit **ve** E düşüyor | ✅ Motor doğru: tek savunma kanalı Şaman, o da havuz emmesi üzerinden |
| A sabit **ve** E de sabit | ⛔ Gece Şaman'ın emdiği miktarı ölçeklemiyor → `shamanShield` gece dışında kalmalı |
| A da düşüyor, E de düşüyor | ⛔ Genel bir savunma kanalı var → motorda eksik |

⭐ **Büyüklük de öngörülü.** Emilen fark = `200 (Şaman Canı) × 100 (adet) × Δçarpan`, kayba
dönüşümü `÷ 234` (Elf'in mDef'i):

```
E1 − E6  =  200 × 100 × (0,9609 − 0,7000) / 234  =  22,3 birim        (motor: 37,4 − 15,4 = 22,0)
```

Ölçüm **yönü** tutup **büyüklüğü** tutmuyorsa Şaman katsayısı (2026-07-29'da ölçülen `1,0`)
yeniden açılır.

---

## F · SUR — gece yapıyı zayıflatmaz, orduyu zayıflatır

Sur ve Büyü Kalkanı binary'de ayrı alanlar (`ordu+0x10` / `ordu+0x98`) ve gece'nin taradığı
listelerde **yok**. Sonuç sezgiye ters ama net: **gece sur GÖRECELİ olarak güçlenir** — ordular
%30 zayıflarken sur aynı kalır.

Kurulum: çekirdek + savunmada **Sur 3** (`9.000 Elf + Sur sv3`).

| # | GG sal/sav | motor: tur | motor: **Sur %** | motor: defK | **gerçek: tur** | **gerçek: Sur %** | **gerçek: defK** |
|---|---|---:|---:|---:|---|---|---|
| F1 | 0 / 0 | 2 | **92,39** | 95,4 |2 |%92,37-92,40 | 94-95|
| F2 | 5 / 0 | 2 | **88,11** | 213,5 | 2| %88,10-88,14| 213-214|
| F3 | 20 / 0 | 2 | **86,44** | 259,9 |2 | %86,43-86,47| 259-260|
| F4 | 0 / 5 | 2 | **92,39 (F1 ile BİREBİR)** | 95,4 |2 | %92,37-92,40| 94-95|
| F5 | 0 / 20 | 2 | **92,39 (F1 ile BİREBİR)** | 95,4 |2 |%92,37-92,40 | 94-95|
| F6 | **GÜNDÜZ** | 2 | **85,55** | 284,5 | 2|%85,53-85,58 | 284-285|

⭐ İki iddia birden sınanıyor:

1. **F4/F5 = F1** → sur bütünlüğü savunanın gece görüşünden bağımsız (A grubunun yapı hâli).
2. **F1 > F6** → gece sur daha az yıpranıyor, çünkü yapı geceden etkilenmiyor.
3. ⭐ Sur yüzdesi de afin → **B'nin oranı üçüncü kez, bambaşka bir kod yolundan** çıkmalı:
   `(F1 − F2)/(F1 − F3) = (92,39 − 88,11)/(92,39 − 86,44) = 0,719` — B5'in oranıyla aynı sayı.

⚠️ Simülatör sur yüzdesini göstermiyorsa **defK sütunu tek başına yeter**: F4/F5, F1 ile aynı
(95,4) ve F2/F3 kat kat yüksek olmalı.

---

## G · Geri besleme — 5 turluk savaşın sezgi kıran sonucu

⭐⭐ **Motorun en kolay çürütülebilir öngörüsü.** Gece'de tek bir "savaş zorlaşır" çarpanı olsaydı
**hiçbir gece hücresi gündüzü geçemezdi.** Motor tam tersini söylüyor.

Kurulum: **2.500 Cüce vs 3.500 Cüce** (2026-07-31 setinin aynısı — çapa satırları da burada).

| # | GG sal/sav | motor: atkK | motor: defK | not | **gerçek: atkK** | **gerçek: defK** |
|---|---|---:|---:|---|---|---|
| G1 | 0 / 0 | 1.903 | 805 | ✅ 2026-07-31 çapası (1901-1903 / 802-806) |1900-1904 |803-805 |
| G2 | 5 / 0 | 1.803 | 1.177 | ✅ 2026-07-31 çapası (1175-1178) |1800-1802 | 1175-1178|
| G3 | **20 / 0** | 1.763 | **1.324** | ⭐ **gündüzden FAZLA** |1760-1765 | 1322-1325|
| G4 | 0 / 5 | 2.500 | 656 | ✅ 2026-07-31 çapası (654-657) |2500 |654-657 |
| G5 | 0 / 20 | 2.500 | 600 | |2500 | 599-601|
| G6 | 10 / 10 | 2.500 | 1.024 | ✅ 2026-07-31 çapası (1021-1025) | 2500| 1021-1025|
| G7 | 20 / 20 | 2.500 | 1.045 | ✅ 2026-07-31 çapası (1042-1047) |2500 | 1042-1046|
| G8 | **GÜNDÜZ** | 2.500 | **1.070** | ✅ 2026-07-31 çapası (1068-1072) | 2500| 1068-1072|

⭐ **G3 > G8** olmalı: saldıranın gece görüşü 20 iken savunan, **gündüzkünden daha çok** kayıp
verir. Sebep gece'nin iki taraflı ve bağımsız olması — gündüz savunan da tam güçte vurup saldıranı
erken eritir, gecede ise saldıran tam güce yakın kalıp daha çok tur vurur.

⚠️ Çapa satırları (G1·G2·G4·G6·G7·G8) **yeniden ölçülmeli**: aynı sayıları verirlerse simülatör
kurulumun geçen turkuyle aynı olduğu doğrulanmış olur ve G3/G5 gerçekten yeni bilgi taşır.

---

## H · Kazananın çevrilmesi — sayı okumadan tek bakışta

⭐ Aynı savaş: **gündüz savunan kazanıyor, gecede gece görüşü ≥ 7 ile SALDIRAN kazanıyor.**
Kayıp sayılarına bakmaya gerek yok; simülatörün «kazanan» satırı yeter.

Kurulum: **900 Süvari vs 5.200 Cüce**.

| # | GG sal/sav | motor: kazanan | motor: atkK | motor: defK | **gerçek: kazanan** | **gerçek: atkK / defK** |
|---|---|---|---:|---:|---|---|
| H1 | 0 / 0 | savunan | 582 | 1.722 | savunan|580-582/1719-1722 |
| H2 | 3 / 0 | savunan | 550 | 2.279 | savunan| 549-550/2275-2280|
| H3 | 5 / 0 | savunan | 542 | 2.420 |savunan |541-542/2416-2422 |
| H4 | **6 / 0** | **savunan** | 540 | 2.467 | savunan|538-539/2464-2470 |
| H5 | **7 / 0** | **SALDIRAN** | 537 | 2.504 |saldıran | 536-537/2501-2506|
| H6 | 10 / 0 | saldıran | 533 | 2.582 |saldıran |532-533/2578-2585 |
| H7 | 20 / 0 | saldıran | 527 | 2.695 | saldıran|525-527/2691-2697 |
| H8 | **GÜNDÜZ** | **savunan** | 805 | 2.321 |savunan |804-806/2317-2324 |

⚠️ Eşik **keskin** (6 → savunan, 7 → saldıran) çünkü kazanan `lossMag` karşılaştırmasıyla
belirleniyor ve iki taraf burada başa baş. Eşiğin bir-iki kademe kayması bile gece eğrisinde
küçük bir sapmanın habercisidir; **H4 ve H5'i mutlaka 3'er kez koş.**

---

## I · Gündüz — gece görüşü hiçbir şeye dokunmuyor mu?

Ucuz ama atlanmaması gereken kontrol: simülatörün GG kutularını yanlış anlamadığımızı doğrular.

> **Ordular çekirdek kurulumun AYNISI: Saldıran 100 Mancınık · Savunan 9.000 Elf.**
> Değişen tek şey gece kutusu ve iki GG kutusu.

⭐ **I1'i yeniden koşmana gerek yok — o satır B8 ile aynı savaş** (gündüz, GG kutuları boş).
B8'e ne yazdıysan buraya kopyala; I2 ve I3 gerçekten yeni.

| # | gece? | GG sal/sav | motor: atkK | motor: defK | **gerçek: atkK** | **gerçek: defK** |
|---|---|---|---:|---:|---|---|
| I1 | ⛔ gündüz | 0 / 0 | 100 | 294,9 *(= B8)* | 100|294-295 |
| I2 | ⛔ gündüz | **20 / 20** | 100 | **294,9 (I1 ile BİREBİR)** | 100|294-295 |
| I3 | ✅ gece | **20 / 20** | 100 | **269,5 (I1'in ALTINDA)** |100 |269-270 |

⭐ **I3 < I1** olmalı: çarpan 1'e yaklaşır ama **asla ulaşmaz** (GG 20 → 0,9609; GG 1.000 → 0,999).
Yani hiçbir gece görüşü seviyesi geceyi gündüze çevirmez. I3 = I1 çıkarsa formülün üst sınırı
farklı demektir.

---

## ⭐⭐⭐ SONUÇ (2026-08-11, kullanıcı ölçümü tamamlandı — 9 grup, 60+ hücre)

| Grup | Motor ne diyor | Ölçüm ne dedi | Karar |
|---|---|---|---|
| A | Savunanın GG'si 2 turluk savaşta kendi kaybına **hiç** dokunmaz | **6/6 tuttu.** Altı satırın da defK'sı 102-103 — GG 0'dan 20'ye kıpırdamadı | ✅ Motor doğru |
| B | Eğri `1 − 3/(GG+3)`, logaritmik **değil** | **8/8 tuttu.** ⭐ Çarpanın **yedi değeri de geri çözüldü** (aşağıda); oran testi dört alternatifi de eledi | ✅ Motor doğru |
| C | İki kod yolu aynı sabitleri kullanıyor | **6/6 birebir.** Ayna sütunu B'ye tam oturdu | ✅ Motor doğru |
| D | Saf çarpımsal havuz etkisi → tam ölçek değişmezliği | **21/22 tuttu.** ×10'a kadar birebir; karışık orduda ve 5 turluk savaşta da bozulmadı | ✅ Motor doğru |
| E | Savunanın tek savunma kanalı **Şaman** | **7/7 tuttu.** Aynı kutu şamansızken 102,5'i kıpırdatmıyor, 100 Şaman'la 37 → 15 yapıyor | ✅ Motor doğru |
| F | Sur geceden etkilenmez → gece **göreceli güçlenir** | **6/6 tuttu.** F4/F5 = F1 (%92,37-92,40) · gündüz %85,55 · oran **0,719** üçüncü kez | ✅ Motor doğru |
| G | Saldıranın yüksek GG'si savunana **gündüzden fazla** kayıp verdirir | **8/8 tuttu.** G3 = 1322-1325 · G8 (gündüz) = 1068-1072 → 250 birimlik fark | ✅ Motor doğru |
| H | Gündüz savunan, gecede GG ≥ 7 saldıran kazanıyor | **8/8 tuttu.** Eşik **tam yerinde**: GG 6 savunan, GG 7 saldıran | ✅ Motor doğru |
| I | Gündüz GG etkisiz; gece hiçbir GG ile gündüz olmaz | **3/3 tuttu.** I1 = I2 (294-295) · I3 = 269-270 | ✅ Motor doğru |

### ⭐⭐⭐ Asıl kazanım: çarpan tablosu ÖLÇÜMDEN geri çözüldü

B grubunda kayıp ile çarpan arasındaki bağıntı **tam olarak tersine çevrilebilir**:

```
defK = (1500 × 100 × çarpan × jitter − 9 × 9.000) / 234
   ⇒  çarpan = (defK × 234 + 81.000) / (150.000 × jitter)
```

Yani ölçülen kayıp sayısı doğrudan çarpanı veriyor. Aşağıdaki aralıklar **muhafazakâr**:
raporlanan tam sayıya ±0,5 yuvarlama **ve** ±%0,1 jitter payı eklendi.

| GG | ölçülen defK | **ölçümden geri çözülen çarpan** | motor | |
|---:|---|---|---:|:--|
| 0 | 102-103 | **0,6976 – 0,7022** | 0,7000 | ✅ |
| 1 | 150-151 | **0,7724 – 0,7771** | 0,7750 | ✅ |
| 2 | 178-180 | **0,8161 – 0,8224** | 0,8200 | ✅ |
| 3 | 198-199 | **0,8473 – 0,8521** | 0,8500 | ✅ |
| 5 | 222-223 | **0,8847 – 0,8895** | 0,8875 | ✅ |
| 10 | 249-251 | **0,9267 – 0,9333** | 0,9308 | ✅ |
| 20 | 269-270 | **0,9579 – 0,9629** | 0,9609 | ✅ |

⭐ Bu, Ghidra'dan okunan `3,0 · 1,0 · 0,3 · 0,7` sabitlerinin **ölçümle bağımsız teyidi**.
Özellikle taban: `0,7` üç ondalık basamağa kadar doğrulandı (0,6976 – 0,7022).

### Eğrinin şekli — dört alternatif de ELENDİ

Oran testi aralık **uçlarıyla** (en kötü durum) koşuldu; hiçbir satırda alternatif model
ölçülen bandın içine giremedi:

| GG | ölçülen bant | motor `1−3/(L+3)` | `1−1/(L+1)` | `1−5/(L+5)` | **logaritmik** | karekök |
|---:|---|---|---|---|---|---|
| 1 | 0,2798 – 0,2952 | **0,2875 ✅** | 0,5250 ⛔ | 0,2083 ⛔ | 0,2277 ⛔ | 0,2236 ⛔ |
| 2 | 0,4464 – 0,4699 | **0,4600 ✅** | 0,7000 ⛔ | 0,3571 ⛔ | 0,3608 ⛔ | 0,3162 ⛔ |
| 3 | 0,5655 – 0,5843 | **0,5750 ✅** | 0,7875 ⛔ | 0,4688 ⛔ | 0,4553 ⛔ | 0,3873 ⛔ |
| 5 | 0,7083 – 0,7289 | **0,7188 ✅** | 0,8750 ⛔ | 0,6250 ⛔ | 0,5885 ⛔ | 0,5000 ⛔ |
| 10 | 0,8690 – 0,8976 | **0,8846 ✅** | 0,9545 ⛔ | 0,8333 ⛔ | 0,7876 ⛔ | 0,7071 ⛔ |

⭐ Beş satırın **her biri tek başına** dört alternatifi de eliyor.

---

## Nihai karar (2026-08-11)

- [x] ⭐⭐ **`on_bilgiler.txt:25` YANLIŞ.** *"…vuruş **ve savunma** gücü o kadar artar"* — gece
      görüşünün savunma tarafı **yok**. Belirleyici grup **A**: savunanın GG'si 0'dan 20'ye
      çıkarken kendi kaybı 102-103'te **hiç kıpırdamıyor**. Kontrol deneyi **E** aynı kutunun
      gerçekten okunduğunu kanıtlıyor (100 Şaman eklenince aynı kutu 37 → 15 yapıyor), yani
      A'daki değişmezlik "simülatör kutuyu okumuyor" ile açıklanamaz.
- [x] ⭐ **`on_bilgiler.txt:583` KISMEN doğru.** *"Ordu ve savunmanın vuruş gücü azalır"* kısmı
      doğru ve satır 25'i çürütüyor. Ama *"**logaritmik** bir oran"* **yanlış**: eğri
      `1 − 3/(GG+3)` biçiminde **rasyonel** bir doygunluk eğrisi ve logaritmik model beş satırın
      beşinde de ölçülen bandın dışında kaldı.
- [x] **Motorda düzeltilmesi gereken bir gece kanalı YOK.** Dokuz grubun dokuzu da tuttu;
      `applyNight`'ın yalnız `poolHp`/`poolMagicHp`'ye dokunması binary'nin davranışını
      birebir üretiyor.
- [x] **Gece görüşü tamamen ofansif bir stat** — oyun tasarımı açısından da kayda değer:
      teknik seni korumaz, **düşmanına daha çok kayıp verdirir**. G grubu bunun ucunu gösteriyor
      (yüksek GG ile savunan **gündüzden fazla** kayıp veriyor).

Kilitlendi: `packages/engine/test/night-vision-golden.test.ts` (17 test) + geri çözülen çarpan
bandının altın testi.

---

## ⚠️ Tek açık kalem: ≤1 birimlik artık (gece'den BAĞIMSIZ)

60+ hücrenin ~10'unda motorun değeri ölçülenin **bir tam sayı üstünde** kaldı ve sapma hep
**aynı yönde**:

| hücre | motor seed kümesi | ölçülen | fark |
|---|---|---|---|
| E1 defK | 37-38 | 36-37 | ~0,5 |
| E7 defK | 202-203 | 201-202 | ~0,5 |
| F1 defK | 95-96 | 94-95 | ~0,5 |
| H3/H4/H5 atkK | 542-543 / 539-540 / 537-538 | 541-542 / 538-539 / 536-537 | ~0,5 |
| D7 atkK | 1001-1002 | 998-1000 | ~2 (‰2) |

**Neden bu setin sonucunu etkilemiyor:**

1. ⭐ Sapma **gece görüşü seviyesiyle değişmiyor**. F1 sapıyor ama F2/F3/F6 tam isabet; B'nin
   sekiz satırının sekizi de tam isabet. Gece görüşü yalnız **eğimi** oynatır — sabit bir
   kaydırma onun işareti olamaz.
2. ⭐⭐ Bu setin **bütün iddiaları farksal**: değişmezlik (A · F4/F5 · I2), oran (B · C · F),
   ölçek (D), işaret değişimi (G3 > G8 · H4 → H5). **Sabit bir kaydırma hepsinden sadeleşir.**
3. Büyüklük ‰2 – %2,7 arasında ve her hücrede iki dağılım hâlâ **bir tam sayıda örtüşüyor**
   (tek istisna D7, ‰2).

> ✅ **2026-08-12'DE KAPANDI — `docs/TILSIM_SUZGEC_TESTLERI.md` §7.** Kullanıcının binlerce
> birimlik rastgele savaşı, gereken çözünürlüğü verdi: artık **mutlak** (birim türü başına
> ~1-2 birim), **oransal değil** — 2.144'lük Elf'te −2,9 (%0,13), 76'lık Ejderha'da −1,0
> (%1,32). Oransal olsaydı Elf ~28 sapardı. ⇒ **Yuvarlama sınıfı bir fark, model hatası değil.**
> Aşağıdaki iki adaydan *"Şaman sayılmıyor"* da elendi (o savaşta Şaman kalanı 820,5 ↔ 822 ile
> diğer birimlerle aynı hassasiyette).

⚠️ **Mekanizma aramadım — veri ayırmıyor.** İki aday var ve set onları ayırt edemiyor:
*(a)* binary savunanın **Şaman'ını kayıp toplamına saymıyor** olabilir (E1 ve E7'nin ölçülen
aralıkları motorun **şamansız** kaybına birebir oturuyor) — ama E3 tersini söylüyor;
*(b)* kalan sayının yuvarlama geleneği farklı olabilir (yarı-yukarı ↔ aşağı kırpma).
Ayırmak için **çok daha büyük adetlerle** kurulmuş kendi seti gerekir (±1 birim ‰0,1'e insin).
Bu turun konusu değil; ⭐ **artık gece'ye ait olmadığı gösterildiği için burada kapatılıyor.**

---

## ⚠️ Ölçüm disiplini

Geçen turun (Şaman ↔ Kalkan) dersleri burada da geçerli:

1. **Sapan tek bir ölçüm için mekanizma aramadan ÖNCE o ölçümü tekrarlat** — özellikle komşu
   satırlar tutuyorsa.
2. ⭐ **Bir parametreyi kalibre eden ölçüm, o parametrenin uçurumuna yakın kurulmalı.** Bu sette
   uçurum **H4/H5** (kazanan çevrilmesi) ve **B2** (GG 1, eğrinin en dik yeri) — beş modelin
   birbirinden en çok ayrıldığı satır da B2.
3. ⚠️ **Tur sayısı bu setin sessiz ön koşulu.** A-F gruplarında tur 2'den çıkarsa iddia geçersiz
   olur; sonucu değil turu bildir. Sebebi genelde ordu listesine tip-2 birim (Cüce, Süvari, Ogre)
   karışmasıdır — tur 2'de yakın dövüş fazı yoktur.
