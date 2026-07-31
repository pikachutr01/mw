# BÜYÜ KALKANI — BİNARY SİMÜLATÖR DOĞRULAMA SETİ

Üretim: 2026-07-29 · motor: `mobiwar-engine.js` (kalkan binary modeliyle güncellendi)

## Nasıl kullanılır

Her satırı simülatöre gir, **Savaştır**'a bas, sonucu "gerçek" sütunlarına yaz.
Aksi belirtilmedikçe: **tüm teknikler 0, kahraman yok, gece kapalı, Sur 0**,
saldıranın savunma yapısı yok. Simülatör ±%0,1 rastgelelik uyguluyor → motor
tahminleri de aralık olarak veriliyor; 1-2 birimlik sapma normaldir.

> **Kalkan %** = simülatörün Büyü Kalkanı satırındaki yüzde. **Sur %** = Sur satırındaki yüzde.

## Model iddiası (test edilen şey)

```
Büyü Kalkanı, Sur'un ikizi olan seviye-tabanlı bir savunma nesnesidir ve
YALNIZ BÜYÜ FAZINDA hatta olur (Sur ise yalnız menzilli+yakın fazlarda).

  güç        = round(1,8^Sv × 400 × durum/100)      → savunanın P paydasına eklenir
  mitigasyon = 320 × Sv × 1,8^Sv × durum/100
  net        = güç × havuz/P − mitigasyon
  durum     -= 100 × net / 2000        (durum 100'den başlar; EKRANDAKİ YÜZDE BUDUR)

SUR AYNI SINIFTAN: güç = round(1,8^Sv × 300 × durum/100), mitigasyon = pAtk/pDef × Sv × 1,8^Sv ×
durum/100, bölücü ÖLÇEKLİ mDef (kalkanda faz 3 için HAM mDef). Kalkanın mitigasyonunu TILSIM,
Sur'unkini TAŞ USTALIĞI büyütür.

Koruma iki yoldan gelir: (1) kalkan P'de yer tutup hasarın bir kısmını üstüne çeker,
(2) kendi mitigasyonu net hasarı sıfırlayabilir. Mitigasyon Sv×1,8^Sv ile, güç yalnız
1,8^Sv ile büyüdüğü için yüksek seviyede kalkan hiç yıpranmaz ama korumaya devam eder.
```

# ✅ SONUÇ — 1. TUR DOĞRULAMASI TAMAMLANDI (2026-07-29)

Kullanıcı A-F gruplarının tamamını binary simülatörde koştu. **24 ölçümün 23'ü tuttu**, kalan bir
tanesi (D4) kalkanla ilgisiz çıktı. Model doğrulandı ve dört ayrı hata bulundu.

## Kesinleşenler

| İddia | Kanıt |
|---|---|
| **Faz ayrımı** — kalkan yalnız büyü, sur yalnız fiziksel fazda hatta | C1-C4: saf fiziksel saldırıda kalkan **4/4 kez %100,0**. D1: sur %0 iken kalkan %100. D2/D3: büyüde kalkan erirken sur %87,5. |
| **`güç = 1,8^Sv × Alan × durum/100`** | B grubu eşiği **tam 97 Ejderha**'da (motor da 97). B2 %100 → B3 %28 → B4 %0: iddia edilen uçurum aynen var. |
| **`durum -= 100 × net/mDef`** (×100 ölçeği) | B3-B4 arasındaki tek adımlık çöküş; kademeli ara değer yok. |
| **Kalkan `P` paydasına giriyor** | A grubu: kalkan Sv 4→10 boyunca hep %100,0 kalırken savunan kaybı **152 → 135 → 123 → 106 → 57 → 22** düşüyor; Sv 10'da kazanan **dönüyor**. Motor: 152/134/123/106/58/22. |
| **Şaman çıkarması ham (1,0)** | F1-F4 kalkan yüzdeleri birebir (%90,89-90,96 ↔ motor %90,93). 0,85 olsaydı savunan kaybı 3 yerine ~30 olurdu. |
| **Sabitler** (Ghidra'dan okundu) | `0x4135fc = 100,0` · `0x413600 = 0,0` · `0x413604 = 0,01` · `0x413528 = 0,01` · `0x413660 = 0,01`. Stat indeksleri switch tablosundan (`0x4133a5`): 1/2 → 0 · 3=pAtk · 4=pDef · 5=mAtk · 6=mDef. |

## Bu turda bulunan DÖRT hata (hepsi düzeltildi)

**1. SUR de aynı binary formülünü kullanıyormuş** — en büyük bulgu.
D3'te gerçek sur **%87,5** kalırken motorun tasarımsal modeli (`2500×√Sv`, `tough 12000`) %17,2
diyordu. Motorun suru yeniden kurgulama gerekçesi ("binary suru P'nin %0,4'ü kadar, işlevsiz")
suru grup C sanan yanlış analizden geliyordu. Gerçekte seviye ÜSSEL girer — Sv 5'te güç 5.668,
mitigasyon 4.724, bölücü 56.685. Tasarımsal model kaldırıldı → D1/D2/D3 **birebir** tutuyor.

**2. Şaman çıkarması FAZA GÖRE stat okumalıydı.**
Binary faz 1-2'de `sub_4121d4(şaman, 1)` = **Can**, faz 3'te `(şaman, 2)` = **BüyüCan** gönderir.
Motor her fazda BüyüCan okuyordu. Şaman'ın ikisi de 200 olduğu için teknik 0'da fark yoktu —
hata ancak Büyücülük açılınca görünüyor (yalnız BüyüCan'ı büyütür). E grubu bunu yakaladı:
Büyücülük 2'de savunan gerçekte **112** kaybederken motor **93** diyordu. Düzeltince E2/E3/E4
kalkan yüzdeleri %13,8 / %35,1 / %69,4 (gerçek %14,0 / %35,4 / %69,5) ve **E3'ün kazananı düzeldi**.

**3. Kalkanı güçlendiren teknik TILSIM, Büyücülük değil.**
`FUN_00411988` (savaşçıların `mAtk`ini = büyü savunmasını ölçekleyen uygulayıcı) AYRICA
`ordu+0x98` = kalkanı alıp `FUN_00413744` ile onun `mAtk`ini `× (1 + sv×0,05)` yapıyor. Büyücülük
uygulayıcısı (`FUN_004124cc`) yalnız `magicHp` ölçekler ve Sur/Kalkan nesnelerine **hiç dokunmaz**
— kalkanın magicHp'si zaten 0. Dokümandaki *"Büyücülük … Büyü Kalkanı"* ifadesi yanıltıcı.
İkizi: Taş Ustalığı → `FUN_00411a28` → `ordu+0x10` = Sur (`FUN_004136a4`, pAtk+pDef).

**4. `COUNTER_K = 1,01` yaması artık tersine çalışıyordu.**
1,01, motorun saldıranı ~%1 az öldürmesini kapatmak için konmuştu; o eksiklik aslında şaman
katsayısı (0,85) ve sur/kalkan faz hatasından geliyordu. 24 ölçümde tarama net bir minimum veriyor:
K=1,01 → saldıran mutlak hata toplamı **156** · K=1,00 → **78** · K=0,97 → **254**. Yani binary'de
karşı yönde ekstra katsayı yok. C1-C4 ve D1 saldıran kayıpları artık birebir (885/885, 346/347,
1118/1118, 806/806, 703/704).

## Nihai durum — 32/32 ölçüm

| Ölçüt | Değer |
|---|---|
| Kazanan | **24/24 doğru** |
| Kalkan + Sur yüzdesi | **RMSE 0,24 puan** (22 ölçüm) |
| Saldıran kaybı | 24 senaryoda toplam **20 birim** mutlak hata |
| Savunan kaybı | tümü ±%2 (küçük sayılarda ±1 birim) |

Referans savaş (`savas_testleri.txt`) da iyileşti: saldıran kaybı hatası +%22 → **+%12**,
enkaz +%8,4 → **+%2**, sur %0 (orijinalle aynı).

Ölçümlerin tamamı regresyon testi olarak kilitlendi:
`mw/packages/engine/test/magic-shield.test.ts` (18 test) +
`test/wall-shield-golden.test.ts` (53 test). Paket toplamı **139 test**, hepsi geçiyor.

## Kalkan büyüyü nasıl önlüyor? (Büyücülük'ten etkilenmiyorsa)

Kalkan **saldıranın büyü gücüne dokunmaz**. Havuz aynı kalır; değişen o havuzun nasıl
*paylaştırıldığıdır*. İki ayrı yoldan korur:

1. **P payı çalma.** Her savunan birimin aldığı hasar `birimGücü × havuz / P`. Kalkanın gücü
   (`1,8^Sv × 400 × durum/100`) savunanın `P` paydasına eklenir → herkesin payı küçülür ve
   eksilen kısım kalkanın üstüne gider.
2. **Kendi mitigasyonu.** Kalkana düşen paydan `mAtk × Sv × 1,8^Sv × durum/100` çıkarılır.
   Kalan pozitifse durumu erir, değilse **hiç yıpranmadan** payı yutmuş olur.

A grubu bunun kanıtı: Sv 4→10 arasında kalkan hep %100,0 kalıyor (mitigasyon her seferinde
net'i sıfırlıyor) ama savunanın kaybı **135 → 22** düşüyor. Yıpranmadan koruyan şey (1) numaralı
yol. Sv 1'de ise mitigasyon (576) güçten (720) küçük olduğu için kalkan eriyerek koruyor.

> **Karşılaştırma:** Şaman ile Kalkan iki FARKLI büyü savunmasıdır. Şaman gelen gücü doğrudan
> **düşürür** (`atkSub`, havuzdan çıkarma). Kalkan gücü düşürmez, **payı üstüne çeker**.
> Bu yüzden Şaman'ı Büyücülük (büyü vuruş gücü), Kalkan'ı Tılsım (büyü savunması) büyütür.

### "Ya doküman haklıysa?" — karşı-olgusal test

Motorun bir kopyasında Büyücülük kalkanın `mAtk`ini de büyütecek şekilde değiştirilip E grubuna
karşı koşuldu:

| Büyücülük | GERÇEK kalkan% | Tılsım modeli (yürürlükte) | Büyücülük de etkiler (doküman) |
|---|---|---|---|
| 0 | %3,29 | %3,2 | %3,2 |
| 2 | %14,0 | **%13,8** | %16,7 |
| 4 | %35,4 | **%35,1** | %47,0 |
| 6 | %69,5 | **%69,5** | %90,5 |
| | **RMSE** | **0,17 puan** | **12,07 puan** |

Sapma teknik seviyesiyle birlikte büyüyor — tam da fazladan bir çarpanın imzası. Kayıp sayıları
iki modelde AYNI çıkıyor (151/113/75/40), çünkü mitigasyon yalnız kalkanın kendi yıpranmasını
etkiler, `P` paydasını değil. Yani bu iki modeli ayıran **tek gözlem kalkan yüzdesidir** — ve
net biçimde ayırıyor.

## ✅ G grubu sonucu: uçma mekaniği YOK

G 7/7 birebir tuttu (G4 uçan Ejderha gerçek 757-759 ↔ motor 758-761; G5 yerdeki Ogre da uyumlu).
`P` paydası ve pay dağıtımı doğru. D4'teki sapma **Ejderha'dan gelmiyor** → H setine geçildi.
## ✅ D4 KAPANDI — model 32/32 doğrulandı

İlk D4 ölçümü (`kalkan %6,8-8,2 · sur %32,7-32,9 · saldıran 0`) **yanlış okunmuş**. Kullanıcı
senaryoyu I3 olarak birebir tekrarladı:

| I3 = D4 | kalkan% | sur% | sald / sav kayıp | saldıran kalan (Cüce/Süvari/Ejderha) |
|---|---|---|---|---|
| **gerçek (tekrar)** | %35,11-36,6 | %36,69-36,95 | 55 / 1011-1013 | 2448 / 197 / 60 |
| motor | %34,77-36,49 | %36,71-36,98 | 57-58 / 1012-1015 | 2447-2448 / 196 / 59 |

Motorun *"2. turda savunanın Elf'i saldıranın Cüce'sinden 21 tanesini öldürür"* öngörüsü
doğrulandı: Cüce 2500 → **2448**. Karşı-vuruş yönü doğru çalışıyor, `COUNTER_K=0,5` gibi bir
düzeltmeye gerek yok.

**Kalan tek fark ölçüm çözünürlüğünün altında:** motor üç I senaryosunda da saldıranın
Süvari'sini 196 (gerçek 197) ve Ejderha'sını 59 (gerçek 60) gösteriyor — yani birer birimin
yarısından az bir sapma (görüntülenen sayı `round(kalan)` olduğu için 196,4 ↔ 196,6 farkı).
Toplam saldıran kaybında ~2-3 birimlik sistematik fazlalık buradan geliyor.
---

# ÖLÇÜM TABLOLARI (kullanıcı tarafından dolduruldu)

## A) YÜKSEK SEVİYE — koruma P payından mı geliyor?

⭐ EN DEĞERLİ TEST. Sv 4 ve üstünde kalkan hiç yıpranmıyor (%100,0 kalıyor) ama savunanın kaybı seviyeyle DÜŞMEYE devam ediyor: kalkan P paydasında yer tutup gelen büyü hasarının bir kısmını üstüne çekiyor. Sv 10 seviyesinde kazanan bile DEĞİŞİYOR. Kayıplar seviyeden etkilenmiyorsa kalkan P paydasina girmiyor demektir ve model yanlıştır.

| # | Kurulum | Saldıran | Savunan | Teknik | MOTOR: kalkan% / sur% | MOTOR: tur · kazanan | MOTOR: sald kayıp / sav kayıp | GERÇEK: kalkan% | GERÇEK: sald/sav kayıp |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Kalkan Sv 0 | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman | hepsi 0 | — / — | 5 · Saldıran | 6 / 152 |- |4 / 152 |
| A2 | Kalkan Sv 4 | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 4 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Saldıran | 6 / 134–135 |%100.0 |4-5/134-135 |
| A3 | Kalkan Sv 5 | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 5 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Saldıran | 7 / 123 |%100.0 |5/123 |
| A4 | Kalkan Sv 6 | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 6 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Saldıran | 8 / 106–107 |%100.0 |6 / 106 |
| A5 | Kalkan Sv 8 | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 8 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Saldıran | 13 / 58 |%100.0 |11 / 56-57 |
| A6 | Kalkan Sv 10 | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 10 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Savunan | 17–18 / 22 |%100.0 |16/22 |

## B) EŞİK AVI — Sv 5 kalkan tam nerede kırılıyor

Saldıran Ejderha adedi tek tek artıyor. İddia: `güç × havuz/P` mitigasyonu geçene kadar kalkan TAM %100,0; geçtiği anda `durum -= 100×net/2000` çok büyük olduğu için tek fazda sıfıra iniyor. Yani ARA DEĞER neredeyse hiç görülmemeli — keskin bir uçurum olmalı. Ara yüzdeler çıkarsa `durum` ölçeği (×100) yanlıştır.

| # | Kurulum | Saldıran | Savunan | Teknik | MOTOR: kalkan% / sur% | MOTOR: tur · kazanan | MOTOR: sald kayıp / sav kayıp | GERÇEK: kalkan% | GERÇEK: sald/sav kayıp |
|---|---|---|---|---|---|---|---|---|---|
| B1 | 90 Ejderha | 90 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 5 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Saldıran | 5 / 168–169 |%100.0 |3 / 168 |
| B2 | 95 Ejderha | 95 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 5 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Saldıran | 2 / 215–216 |%100.0 |2 / 215 |
| B3 | 97 Ejderha | 97 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 5 Büyü Kalkanı | hepsi 0 | %28,33–33,65 / — | 5 · Saldıran | 2 / 235–236 |%25,71-%30.91 |1 / 235 |
| B4 | 98 Ejderha | 98 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 5 Büyü Kalkanı | hepsi 0 | %0,00 / — | 5 · Saldıran | 2 / 245 |%0.0 |1 / 245 |
| B5 | 99 Ejderha | 99 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 5 Büyü Kalkanı | hepsi 0 | %0,00 / — | 5 · Saldıran | 2 / 255–256 |%0.0 |1 / 254-255 |
| B6 | 100 Ejderha | 100 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 5 Büyü Kalkanı | hepsi 0 | %0,00 / — | 5 · Saldıran | 2 / 265–266 |%0.0 |1 / 265-266 |
| B7 | 105 Ejderha | 105 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 5 Büyü Kalkanı | hepsi 0 | %0,00 / — | 5 · Saldıran | 1 / 339–340 |%0.0 |1 / 337-338 |

## C) FAZ AYRIMI — saf fiziksel saldırıda kalkan bozulmamalı

⭐ EN KESKİN TEST. Cüce yalnız yakın, Elf yalnız menzilli vurur; BÜYÜ fazı tamamen boştur (Şaman havuza girmez). İddia doğruysa kalkan %100,0 kalır — ne kadar büyük saldırı gelirse gelsin. Kalkan burada eriyorsa faz-ayrımı modeli YANLIŞTIR.

| # | Kurulum | Saldıran | Savunan | Teknik | MOTOR: kalkan% / sur% | MOTOR: tur · kazanan | MOTOR: sald kayıp / sav kayıp | GERÇEK: kalkan% | GERÇEK: sald/sav kayıp |
|---|---|---|---|---|---|---|---|---|---|
| C1 | Saf yakın (Cüce), dengeli | 1500 Cüce | 1200 Cüce, 200 Şaman, 3 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Savunan | 896–898 / 285–286 |%100.0 |884-886 / 287-288 |
| C2 | Saf yakın (Cüce), ezici | 4000 Cüce | 1500 Cüce, 200 Şaman, 3 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Saldıran | 353–355 / 1700 |%100.0 |345-347 / 1700 |
| C3 | Saf menzilli (Elf), dengeli | 1500 Elf | 1200 Elf, 200 Şaman, 3 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Savunan | 1132–1135 / 531–533 |%100.0 |1117-1119 / 537-539|
| C4 | Saf menzilli (Elf), ezici | 2500 Elf | 1500 Elf, 200 Şaman, 3 Büyü Kalkanı | hepsi 0 | %100,00 / — | 5 · Saldıran | 819–822 / 1668 |%100.0 |805-807 / 1668-1669 |

## D) SUR + KALKAN birlikte — ikisi aynı fazda hatta DEĞİL

İddia: Sur yalnız faz 1-2 (menzilli/yakın), Kalkan yalnız faz 3 (büyü). Saf fizikselde Sur erimeli / Kalkan %100 kalmalı. (Ejderha hem menzilli hem büyü vurduğu için büyü senaryolarında Sur da yıpranır — bu beklenen.)

| # | Kurulum | Saldıran | Savunan | Teknik | MOTOR: kalkan% / sur% | MOTOR: tur · kazanan | MOTOR: sald kayıp / sav kayıp | GERÇEK: kalkan% | GERÇEK: sald/sav kayıp |
|---|---|---|---|---|---|---|---|---|---|
| D1 | Saf fiziksel (Cüce+Süvari) | 2500 Cüce, 200 Süvari | 1200 Cüce, 600 Elf, 200 Şaman, 5 Sur, 3 Büyü Kalkanı | hepsi 0 | %100,00 / %0,00 | 5 · Saldıran | 831–834 / 1292–1295 |%100.0 / %0.0 |702-704 / 1503-1506 |
| D2 | Hafif büyü (60 Ejderha) | 60 Ejderha, 500 Şaman | 1200 Cüce, 600 Elf, 650 Şaman, 5 Sur, 3 Büyü Kalkanı | hepsi 0 | %100,00 / %100,00 | 5 · Saldıran | 0 / 279–282 |%100.0 / %100.0 |0 / 279 |
| D3 | Ağır büyü (75 Ejderha) | 75 Ejderha, 500 Şaman | 1200 Cüce, 600 Elf, 650 Şaman, 5 Sur, 3 Büyü Kalkanı | hepsi 0 | %0,00 / %17,18–17,33 | 5 · Saldıran | 0 / 1072–1075 |%0.0 / %87,53-%87,61 |0 / 1202-1205 |
| D4 | Karışık | 2500 Cüce, 200 Süvari, 60 Ejderha | 1200 Cüce, 600 Elf, 650 Şaman, 5 Sur, 3 Büyü Kalkanı | hepsi 0 | %34,87–36,29 / %36,69–36,98 | 5 · Saldıran | 57–58 / 1012–1016 |⚠️ İLK OKUMA HATALI → **düzeltilmiş (I3): %35,11-36,6 / %36,69-36,95** |**55 / 1011-1013** |

## E) BÜYÜCÜLÜK tekniği — kalkanın mitigasyonunu büyütmeli

Doküman: Büyücülük "Büyü Kalkanı"nın büyü vuruş gücünü %5 artırır. Model kalkanın mitigasyonunu mAtk=320 uzerinden okuduğu için savunan Büyücülüğü kalkanı hızla DAYANIKLI yapmalı (Sv 1 iken bile 4 seviye Büyücülük savaşı çeviriyor). Saldıranınki tersini yapar. Etki yoksa kalkanın mitigasyon statı mAtk değildir.

| # | Kurulum | Saldıran | Savunan | Teknik | MOTOR: kalkan% / sur% | MOTOR: tur · kazanan | MOTOR: sald kayıp / sav kayıp | GERÇEK: kalkan% | GERÇEK: sald/sav kayıp |
|---|---|---|---|---|---|---|---|---|---|
| E1 | İkisi de 0 (taban) | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 1 Büyü Kalkanı | hepsi 0 | %3,20–3,40 / — | 5 · Saldıran | 6 / 150–151 |%3,22-%3,35 |4 / 149 |
| E2 | Savunan Büyücülük 2 | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 1 Büyü Kalkanı | sald: hepsi 0 · sav: Büyücülük 2 | %16,46–16,73 / — | 5 · Saldıran | 21 / 92–93 |%13,80-%14,2 |18-19 / 112 |
| E3 | Savunan Büyücülük 4 | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 1 Büyü Kalkanı | sald: hepsi 0 · sav: Büyücülük 4 | %40,80–41,12 / — | 5 · Savunan | 44 / 49 |%35,10 - %35,7 |41 / 74-75 (Not: Saldıran kazanır) |
| E4 | Savunan Büyücülük 6 | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 1 Büyü Kalkanı | sald: hepsi 0 · sav: Büyücülük 6 | %74,60–74,90 / — | 5 · Savunan | 67 / 21–22 |%69,35-%69,69 |63 / 39-40 |
| E5 | Saldıran Büyücülük 2 | 85 Ejderha, 500 Şaman | 60 Ejderha, 650 Şaman, 1 Büyü Kalkanı | sald: Büyücülük 2 · sav: hepsi 0 | %0,00 / — | 5 · Saldıran | 2 / 204 |%0,0 |1 / 202-203 |

## F) ŞAMAN KATSAYISI — çıkarma ham mı (1,0) yoksa 0,85 mi

⭐ Saldıranın MENZİLLİ havuzu (Can×adet = 2000×40) savunanın Şaman çıkarmasına (Can×adet = 200×400) TAM EŞİT seçildi. Katsayı 1,0 ise faz 1 havuzu tam sıfır → savunan yalnız büyü fazından kayıp verir (aşağıdaki tahmin bunu varsayıyor). 0,85 ise faz 1 de vurur ve savunanın kaybı belirgin ARTAR. Motorun 2026-07-29 tarihine kadarki 0,85 katsayısı bu testle kesin ayrışıyor.

| # | Kurulum | Saldıran | Savunan | Teknik | MOTOR: kalkan% / sur% | MOTOR: tur · kazanan | MOTOR: sald kayıp / sav kayıp | GERÇEK: kalkan% | GERÇEK: sald/sav kayıp |
|---|---|---|---|---|---|---|---|---|---|
| F1 | 40 Ejderha vs 400 Şaman | 40 Ejderha | 30 Ejderha, 400 Şaman, 1 Büyü Kalkanı | hepsi 0 | %90,89–90,97 / — | 5 · Savunan | 35 / 4 |%90,89-%90,96 |34 / 3 |
| F2 | 41 Ejderha vs 400 Şaman | 41 Ejderha | 30 Ejderha, 400 Şaman, 1 Büyü Kalkanı | hepsi 0 | %87,58–87,66 / — | 5 · Savunan | 35 / 6 |%87,57-%87,65 |34 / 4 |
| F3 | 45 Ejderha vs 400 Şaman | 45 Ejderha | 30 Ejderha, 400 Şaman, 1 Büyü Kalkanı | hepsi 0 | %70,88–71,08 / — | 5 · Savunan | 32 / 12 |%70,66-%70,83 |31 / 11 |
| F4 | 50 Ejderha vs 400 Şaman | 50 Ejderha | 30 Ejderha, 400 Şaman, 1 Büyü Kalkanı | hepsi 0 | %38,73–38,99 / — | 5 · Savunan | 28 / 31 |%38,14-%38,42 |27 / 30 |

## G) EK SET — D4 ANOMALİSİ: saldırandaki UÇAN birim karşı-vuruşu neden kesiyor?

D4 dışında her senaryo tuttu. D4'te gerçek **saldıran kaybı 0**, motor 57 diyor; karşı-yön
havuzu yarıya indirilince motor dört değeri de birebir veriyor. D1 (aynı ordu, Ejderha YOK)
birebir tuttuğuna göre fark **saldırana eklenen 60 Ejderha**. İki aday var:

- **(a) UÇMA:** Ejderha/Pegasus uçar; savunanın yer birimleri onlara vuramıyor ve o pay
  boşa gidiyor olabilir (motor payı uçana veriyor, o da mitigasyonuyla yutuyor).
- **(b) SADECE BÜYÜKLÜK:** Ejderha'nın Alan'ı (750) `P` paydasını şişirip Cüce'nin payını
  mitigasyonunun altına düşürüyor — yani mekanik doğru, motorun ölçeği yanlış.

**Ayırt eden satır G4 ↔ G5:** Ogre yerde, Alan 666; Ejderha uçar, Alan 750 — neredeyse aynı
paydayı yapıyorlar. İkisi de saldıran kaybını sıfırlıyorsa neden **(b)**; yalnız Ejderha
sıfırlıyorsa neden **(a) UÇMA**.

Savunan hepsinde sabit: **2500 Cüce, 1200 Elf, 400 Şaman** (Sur 0, Kalkan 0 — sadeleştirildi).

| # | Saldıran | MOTOR: tur · kazanan | MOTOR: sald kayıp / sav kayıp | GERÇEK: sald/sav kayıp |
|---|---|---|---|---|
| G1 | 2500 Cüce — taban — hiç uçan yok | 4 · Savunan | 2500 / 44 |2500 / 42 |
| G2 | 2500 Cüce, 20 Ejderha — 20 Ejderha | 5 · Savunan | 2482–2487 / 94–96 | 2482-2487 / 93-94 |
| G3 | 2500 Cüce, 40 Ejderha — 40 Ejderha | 5 · Savunan | 1521–1525 / 213–214 |1520-1524 / 211-212 |
| G4 | 2500 Cüce, 60 Ejderha — 60 Ejderha (uçan · Alan 750×60 = 45.000) | 5 · Saldıran | 758–761 / 1697–1704 |757-759 / 1694-1701 |
| G5 | 2500 Cüce, 68 Ogre — 68 Ogre (YERDE · Alan 666×68 = 45.288) ⭐ ayırt edici | 5 · Saldıran | 702–704 / 2697–2703 |700-702 /2696-2700  |
| G6 | 2500 Cüce, 560 Pegasus — 560 Pegasus (uçan · Alan 80×560 = 44.800) | 5 · Saldıran | 821–824 / 2290–2299 |820-822 / 2290-2297|
| G7 | 2500 Cüce, 188 Mancınık — 188 Mancınık (YERDE · Alan 240×188 = 45.120) | 5 · Saldıran | 425–428 / 3902–3910 |425-426 /3901-3909  |

| Gözlem | Sonuç |
|---|---|
| ~~G4 saldıran ≈ 0 ama G5/G7 uyumlu → UÇMA mekaniği~~ | ❌ **GERÇEKLEŞMEDİ.** G4 gerçek 757-759 ↔ motor 758-761. |
| ~~G4-G7 hepsi ≈ 0~~ | ❌ gerçekleşmedi. |
| **G2→G4 kademeli düşüş, hepsi motora yakın** | ✅ **GERÇEKLEŞEN BU — 7/7 birebir.** Uçma mekaniği yok, `P` paydası doğru. D4'teki sapma Ejderha'dan DEĞİL. Sıradaki: H seti. |

## H) EK SET 2 — D4 ANOMALİSİ: G elendi, geriye İKİ fark kaldı

G grubu **7/7 birebir** tuttu (G4 uçan Ejderha 757-759 ↔ motor 758-761; G5 yerdeki Ogre da
uyumlu) → **uçma mekaniği YOK**, `P` paydası ve pay dağıtımı DOĞRU. Yani D4'teki sapma
Ejderha'nın kendisinden gelmiyor. D1 (birebir tuttu) ile D4 (sapıyor) arasında yalnız iki
fark var; bu set onları **teker teker** açıyor:

| | saldıranda Ejderha | savunanda Şaman | Sur+Kalkan | durum |
|---|---|---|---|---|
| D1 | yok | 200 | var | ✅ birebir |
| D4 | **60** | **650** | var | ⚠️ ölçüm hatalıydı → I3 tekrarında ✅ birebir |

**H1 ↔ H2 ayırt eder:** H1 yalnız Ejderha ekler, H2 yalnız Şaman'ı 650 yapar. Hangisi
saldıran kaybını sıfırlıyorsa sebep odur. H3/H4 aynı ikiliyi Sur+Kalkan OLMADAN tekrarlar —
sapma yapılara mı bağlı, onu söyler.

| # | Saldıran | Savunan | MOTOR: kalkan% / sur% | MOTOR: tur · kazanan | MOTOR: sald / sav kayıp | GERÇEK: kalkan% / sur% | GERÇEK: sald / sav |
|---|---|---|---|---|---|---|---|
| H1 | 2500 Cüce, 200 Süvari, 60 Ejderha | 1200 Cüce, 600 Elf, 200 Şaman, 5 Sur, 3 Büyü Kalkanı | %0,00 / %0,00 | 5 · Saldıran | 21 / 2000 |%0,00 / %0,00 |21 / 2000 (Not:4 tur) |
| H2 | 2500 Cüce, 200 Süvari | 1200 Cüce, 600 Elf, 650 Şaman, 5 Sur, 3 Büyü Kalkanı | %100,00 / %76,64–76,79 | 5 · Savunan | 999–1001 / 273–275 |%100,0 / %76,64-%76,81 |999-1001 /272-274  |
| H3 | 2500 Cüce, 200 Süvari, 60 Ejderha | 1200 Cüce, 600 Elf, 200 Şaman | — / — | 3 · Saldıran | 21 / 2000 | -| 21 / 2000|
| H4 | 2500 Cüce, 200 Süvari, 60 Ejderha | 1200 Cüce, 600 Elf, 650 Şaman | — / — | 5 · Saldıran | 53 / 1321–1323 |- |52 / 1318-1322 |

| Gözlem | Sonuç |
|---|---|
| ~~H1 saldıran ≈ 0~~ | ❌ gerçekleşmedi — H1 gerçek 21 ↔ motor 21. |
| ~~H2 saldıran ≈ 0~~ | ❌ gerçekleşmedi — H2 gerçek 999-1001 ↔ motor 999-1001, sur %76,64-76,81 ↔ %76,64-76,79. |
| **H1 ve H2 ikisi de uyumlu, yalnız D4 sapıyor** | ✅ **GERÇEKLEŞEN BU — 4/4 birebir.** Tek tek hiçbir bileşen sapmıyor. Sıradaki: I seti. |
| ~~H3/H4 uyumlu ama H1/H2 sapıyor~~ | ❌ gerçekleşmedi — dördü de uyumlu (H4 gerçek 52 ↔ motor 53). |

> ⚠️ H1 ve H3'te savunan tamamen siliniyor (motor 2000/2000). Okunacak değer **saldıranın**
> kaybı — o doygun değil. H3 3 turda bitiyor, H1 5 turda.

## I) EK SET 3 — D4 tek başına kaldı: hangi YAPI yapıyor?

H seti de **4/4 birebir** tuttu. Bu bir çelişki doğurdu: D4 ile H4 (aynı ordular, tek fark
savunanda Sur 5 + Kalkan 3) **2. turda motor açısından birebir aynı durumdadır** — yapılar
saldıranın `P` paydasını değiştirmez, savunanın Elf'i iki senaryoda da 600'dür. Motor
izlemesi 2. tur karşı-vuruşunu ikisinde de aynı veriyor:

```
2. tur · faz 1 (menzilli) · savunan Elf → saldıran Cüce
  H4: pay 13.864 − mitigasyon 10.000 = net 3.864 → 21,2 Cüce ölür   (gerçek toplam 52 ✅)
  D4: pay 13.864 − mitigasyon 10.000 = net 3.864 → 21,2 Cüce ölür   (gerçek toplam  0 ❌)
```

Yani D4'te saldıranın kaybı **yalnız 2. turda bile** 21 olmalıydı. Sıfır çıkması, yapıların
varlığının karşı-vuruşu daha 2. turda kestiği anlamına gelir. I1/I2 hangi yapının yaptığını,
I3 ise ölçümün doğru okunduğunu söyler.

| # | Savunan (saldıran hep: 2500 Cüce, 200 Süvari, 60 Ejderha) | MOTOR: kalkan% / sur% | MOTOR: tur | MOTOR: sald / sav kayıp | MOTOR: sald kalan (Cüce/Süvari/Ejderha) | GERÇEK: kalkan% / sur% | GERÇEK: tur | GERÇEK: sald / sav | GERÇEK: sald kalan (C/S/E) |
|---|---|---|---|---|---|---|---|---|---|
| I1 | YALNIZ Sur 5 — 1200 Cüce, 600 Elf, 650 Şaman, 5 Sur | — / %34,44–34,71 | 5 | 56 / 1096–1099 | 2449 / 196 / 59 |- / %34,43-%34,71 |5 |53-54 / 1095-1097 |2449 / 197 / 60 |
| I2 | YALNIZ Kalkan 3 — 1200 Cüce, 600 Elf, 650 Şaman, 3 Büyü Kalkanı | %0,00 / — | 5 | 54–56 / 1222–1224 | 2449–2450 / 196–197 / 59 |%0,00 / - |5 |53 / 1220-1224 |2450 / 197 / 60 |
| I3 | **D4 birebir tekrar** (Sur 5 + Kalkan 3) — 1200 Cüce, 600 Elf, 650 Şaman, 5 Sur, 3 Büyü Kalkanı | %34,77–36,49 / %36,71–36,98 | 5 | 57–58 / 1012–1015 | 2447–2448 / 196 / 59 |%35,11-%36,6 / %36,69-%36,95  |5 |55 / 1011-1013 |2448 / 197 / 60 |

> **I3'te ekstra iki şey not et:** (1) sonuç metnindeki **tur sayısı**, (2) saldıranın
> **Cüce / Süvari / Ejderha kalan sayıları ayrı ayrı**. Motor 2. turda 21 Cüce'nin ölmesini
> bekliyor; gerçekte Cüce 2500 olarak kalıyorsa mekanizma gerçek, ~2443 ise ilk ölçümdeki
> "0" yanlış okunmuş demektir (D4 satırındaki diğer üç değer motorla zaten tutarsızdı).

| Gözlem | Sonuç |
|---|---|
| ~~I1 sapıyor, I2 uyumlu~~ | ❌ gerçekleşmedi — I1 gerçek 53-54 ↔ motor 56, sur %34,43-34,71 ↔ %34,44-34,71. |
| ~~I2 sapıyor, I1 uyumlu~~ | ❌ gerçekleşmedi — I2 gerçek 53 ↔ motor 54-56, kalkan %0,00 ↔ %0,00. |
| ~~İkisi de uyumlu, I3 sapıyor~~ | ❌ gerçekleşmedi. |
| **I3 motorla uyumlu çıktı** | ✅ **GERÇEKLEŞEN BU — 3/3 birebir.** İlk D4 ölçümü hatalıymış. Saldıranın Cüce'si 2500 → **2448** (motor 2447-2448), Süvari 200 → 197, Ejderha 60 → 60. Karşı-vuruş çalışıyor; 2. tur hesabı doğruymuş. **AÇIK MADDE KAPANDI.** |

## Sapma olursa ne anlama gelir

| Gözlem | Yorum |
|---|---|
| **A**: seviye arttıkça savunan kaybı DEĞİŞMİYOR | Kalkan `P` paydasına girmiyor; koruma tamamen mitigasyondan geliyor. |
| **A6** (Sv 10) kazananı çevirmiyor | Kalkanın güç ölçeği (`1,8^Sv × 400`) fazla tahmin edilmiş. |
| **B**: eşik 97 Ejderha yerine başka yerde | `1,8` tabanı ya da `Alan = 400` yanlış. Eşik ERKEN gelirse güç fazla, GEÇ gelirse az tahmin edilmiş. |
| **B**: kademeli ara yüzdeler var, uçurum yok | `durum -= 100 × net/mDef` ölçeği yanlış — muhtemelen `×100` yok ya da bölücü de seviyeyle ölçekli. |
| **C**: kalkan %100'ün altına düşüyor | ⛔ **Faz ayrımı YANLIŞ** — kalkan fiziksel fazlarda da hatta. Model baştan gözden geçirilmeli. |
| **D1**'de kalkan eriyor ya da **D2**'de Sur eriyor | Sur/Kalkan faz eşleşmesi ters, ya da ikisi de her fazda hatta. |
| **E**: Büyücülük kalkanı güçlendirmiyor | Kalkanın mitigasyon statı `mAtk` değil (ya da teknik kalkana işlemiyor). |
| **E**: Büyücülük kalkanı ZAYIFLATIYOR | Teknik kalkanın gücünü (Alan) büyütüyor, mitigasyonunu değil. |
| **F1**: savunan kaybı 4 yerine belirgin fazla | Şaman çıkarma katsayısı 1,0 değil — 0,85 doğruydu, geri alınmalı. |
| Kalkan yüzdeleri tutuyor ama kayıplar 5'ten fazla sapıyor | Kalkan modeli doğru; sapma başka mekanikte (karşı-yön kalibrasyonu / yapı modeli). |

Kalkan seviyesi simülatörde girilemiyorsa (spin kutusu tavanı) o satırı atla ve not düş.

## Zaten doğrulanmış olan — kullanıcı ölçümleri (2026-07-29)

Model bu sekiz ölçümün üzerine kuruldu; tekrar test etmeye gerek yok, referans olarak duruyor.
Hepsinde saldıran `N Ejderha + 500 Şaman`, savunan `60 Ejderha + 650 Şaman + Sv Büyü Kalkanı`.

| N Ejderha | Kalkan Sv | GERÇEK kalkan% | MOTOR kalkan% | gerçek sald/sav kayıp | motor sald/sav |
|---|---|---|---|---|---|
| 50 | 1 | %100,00 | %100,00 | 63 / 0 | 65 / 0 |
| 65 | 1 | %94,25 | %94,37 | 34 / 9 | 37 / 10 |
| 75 | 1 | %32,82 | %33,07 | 14 / 60 | 16 / 61 |
| 85 | 1 | %3,27 | %3,28 | 4 / 149 | 6 / 150 |
| 85 | 2 | %5,10 | %5,18 | 4 / 147 | 6 / 148 |
| 85 | 3 | %65,12 | %66,53 | 4 / 142 | 6 / 142 |
| 85 | 4 | %100,00 | %100,00 | 5 / 134 | 6 / 135 |
| 90 | 4 | %74,41 | %74,78 | 3 / 182 | 5 / 183 |

Kalkan yüzdesi RMSE **0,53 puan**. Bu set `mw/packages/engine/test/magic-shield.test.ts` içinde
regresyon testi olarak kilitlendi.

## Binary kaynakları (iddianın dayanağı)

| Fonksiyon | Ne yapıyor |
|---|---|
| `FUN_00402800` (SavasTusHandler) | Sur nesnesini stat tablosu **idx 19** + form alanı `+0x448`'ten, Büyü Kalkanı'nı **idx 20** + `+0x44c`'ten kurar; ikisinin de yüzdesini `FUN_004132b0` ile yazar |
| `FUN_0040dcb4` (SavasKoordinatoru) | Sur'u `ctx+0x5c`'ye, Kalkan'ı `ctx+0x60`'a bağlar |
| `FUN_0040e0c4` (HasarKayipCekirdegi) | `param_10==1` iken faz 1-2 → `+0x5c` (Sur), faz 3 → `+0x60` (Kalkan) |
| `FUN_00413610` | güç `= round(pow(1.8, Sv) × [+0xc] × [+0x80] × 0,01)` |
| `FUN_0041338c` | mitigasyon `= stat × Sv × pow(1.8, Sv) × [+0x80] × 0,01` (faz 1-2'de bölücü de bu) |
| `FUN_004132f4` | **ham** stat — faz 3'te bölücü olarak bu kullanılıyor (kalkana özel asimetri) |
| `FUN_00413534` | `durum(+0x80) -= 100 × dec`; emilen `= mDef × 0,01 × düşüş`; sıfırda yıkılır |
| `FUN_004132b0` | ekrandaki yüzde `= (seviye > 0 ? durum : 0)` |
| `FUN_0041286c` | kardeş sınıfın (kahraman) durumunu `0x4059000000000000` = **100.0** ile başlatır |
| `FUN_00411988` → `FUN_00413744` | **TILSIM** kalkanın (`ordu+0x98`) mAtk'ini `× (1 + sv×0,05)` yapar |
| `FUN_00411a28` → `FUN_004136a4` | **TAŞ USTALIĞI** surun (`ordu+0x10`) pAtk+pDef'ini büyütür |
| `FUN_004118e8` → `FUN_004124cc` | **BÜYÜCÜLÜK** yalnız savaşçıların magicHp'sini ölçekler — Sur/Kalkan'a dokunmaz |
| Sabitler (Ghidra) | `0x4135fc=100,0` · `0x413600=0,0` · `0x413604=0,01` · `0x413528=0,01` · `0x413660=0,01` |
