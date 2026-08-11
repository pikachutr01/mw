# TEKNİK UYGULAYICILARININ SÜZGECİ — binary okuması + açık kalan ölçüm

Üretim: 2026-08-12 · motor karşılığı: `packages/engine/test/tech-channels.test.ts` (11 test, yeşil)
· tetikleyen ölçüm: kullanıcının rastgele kurduğu gerçek savaş (aşağıda)

---

## 1. NE OLDU — %17,8'lik sapmanın iki kök nedeni

Kullanıcı binary simülatörde **rastgele** bir savaş kurdu (11 birim türü, 8 teknik, iki taraf da
seviye 7-15) ve aynısını bizim motorda koştu:

| | binary | eski motor | fark |
|---|---:|---:|---:|
| saldıran kaybı | 4.512 | 5.316 | **+%17,8** |
| savunan kaybı | 8.760 | 8.807 | +%0,5 |
| kahraman deneyimi | 8.404 | 10.695 | **+%27,3** |
| enkaz (altın) | 8.905.481 | 9.796.770 | +%10,0 |

Birim birim bakınca saldıranın **her** türü %15-20 fazla ölüyordu, Mancınık ise %24-26 —
yani **iki ayrı sinyal**: biri taraf-özel ve genel, diğeri birim-özel.

---

## 2. ⭐⭐⭐ BİNARY MİMARİSİ — teknik uygulayıcılarının İKİ ailesi var

Ghidra'da bütün zincir okundu. Fark tek satır:

```
── atk AİLESİ (Okçuluk · Demircilik · Kimya · İçgüdü) ──────────────────────────
   FUN_0041185c → FUN_004123fc      (Kimya)     if (FUN_0041279c(birim) == 4) {…}
                → FUN_00412fa8      (yapılar)   if (FUN_00413190(yapı)  == 4) {…}
   …            → FUN_00412464      (İçgüdü)    if (FUN_0041279c(birim) == 7) {…}
                                                   ⇧ GRUP SÜZGECİ VAR

── Zırh · Büyücülük · Tılsım ───────────────────────────────────────────────────
   FUN_0041185c → FUN_00412528      (Zırh)      if (seviye != 0) {…}   ← iki stat çifti
   FUN_004118e8 → FUN_004124cc      (Büyücülük) if (seviye != 0) {…}
   FUN_00411988 → FUN_004125c8      (Tılsım)    if (seviye != 0) {…}
                → FUN_004130c4      (yapılar)   if (seviye != 0) {…}
                → FUN_00413744      (Kalkan)    ← ayrı, oranı %5
                                                   ⇧ SÜZGEÇ YOK — HERKESE UYGULANIR
```

### ⭐ Altı getter'ın altısı da bu turda yerine oturdu

Her tekniğin dokunduğu stat, uygulayıcısının çağırdığı getter'dan **bağımsızca** okundu:

| getter | ofset | stat | kim kullanıyor |
|---|---|---|---|
| `FUN_00412b5c` | +0x00 | Can | **atk ailesi** · gece |
| `FUN_00412b9c` | +0x08 | Büyü Canı | **Büyücülük** · gece |
| `FUN_00412b7c` | +0x10 | Fiz. Saldırı | **Zırh** (1. çift) |
| `FUN_00412afc` | +0x18 | Fiz. Savunma | **Zırh** (2. çift) |
| `FUN_00412b1c` | +0x20 | Büyü Saldırı | **Tılsım** |
| `FUN_00412b3c` | +0x28 | Büyü Savunma | *hiçbir teknik* |

⭐ Zırh'ın **iki** çifti olması motordaki `pmit → pAtk + pDef` davranışını, Tılsım'ın **tek**
çifti `mmit → yalnız mAtk` davranışını doğruluyor. `mDef`e hiçbir teknik dokunmuyor — motorun
`applyTech`indeki *"mDef'i lineer teknik etkilemez"* notu yapısal olarak teyitli.

### ⚠️ Dokümanın birim listeleri SÜZGEÇ DEĞİL, BETİMLEME

Bu, aynı yanılgının **dördüncü** yakalanışı — hepsi aynı «süzgeç yok» gerçeğinin belirtisi:

| doküman iddiası | gerçek |
|---|---|
| Zırh *"Kaos hariç tüm savaşçılar"* | Kaos dahil (2026-08-09 ölçümü) |
| Büyücülük listesinde *"Büyü Kalkanı"* | Kalkanın `magicHp`si 0 → ölçeklenecek şey yok |
| Mancınık *"Etkilendiği Teknikler: Zırh, Kimya"* | **Tılsım da işliyor** (bu tur) |
| Demircilik *"…Ogre…"*, Şaman yok | Ogre İçgüdü grubunda; **Şaman Demircilik grubunda** |

Doküman "nerede **görülür**"ü anlatıyor, "nereye **uygulanır**"ı değil.

---

## 3. Kök neden 1 — ŞAMAN DEMİRCİLİK GRUBUNDA

`FUN_0041279c` bir switch; birim indeksini `atk` grubuna eşliyor. Eşleme **yedi bağımsız
çapayla** doğrulandı:

| grup | binary indeksleri | teknik | dokümanla |
|---|---|---|---|
| 0 | Elf(1) · Pegasus(3) | Okçuluk | ✅ *"Elfler ve Pegasuslar"* |
| 4 | Mancınık(5) | Kimya | ✅ *"(Mancınık, Kazancı, Mangonel)"* — son ikisi yapı |
| 7 | Ejderha(4) · Ogre(6) · Kaos(11) | İçgüdü | ✅ *"(Ejderha, Ogre, Kaos)"* |
| 1 | Cüce(0) · Süvari(2) · **Şaman(7)** · Kuş(8) · Araba(9) · Gnom(10) | Demircilik | ⛔ Şaman yok |

### ⚠️⚠️ Bu 2026-08-09'da GÖRÜLDÜ ve YANLIŞ GEREKÇEYLE reddedildi

`techs.ts`te duran eski not:

> *"Şaman binary'de bu grupta (id 7) görünüyor ama motora EKLENMEDİ — motorda Şaman `hp`
> üzerinden **hasar vermiyor**, dolayısıyla `atk` ölçeklemesi ona hiç dokunmaz. Gerçek savaşta
> eklemek kaybı 29.448 → 29.450 yaptı."*

⭐ **Gerekçedeki hata:** Şaman'ın `hp`si hasar VERMEK için değil, **EMMEK** için okunuyor.

```
dealType():   pool -= shamanShield(def, ...)          // faz 1-2 → poolHp × adet
```

O günkü sonda *"Şaman'ın hasar verdiği bir kurulum"* aradı; aranması gereken **"emilen miktarın
gelen havuza oranla büyük olduğu bir kurulum"**du. Bu savaşta saldıranda 1.200 Şaman ve
Demircilik 14 var → emme `200 × 1,7 × 1.200 = 408.000` (eskiden 240.000), savunanın faz-1
havuzu ~1,9M. Yani havuzun **%9'u**, beş tur boyunca birikerek.

⭐ **Ders:** *"denendi, etkisi yok"* kaydı, sondanın **yanlış kanalı** aramasından doğmuş
olabilir. Bir eşlemeyi binary'den okuduysan ve sonda sessiz kaldıysa, önce şunu yeniden sor:
**bu stat motorda tam olarak NEREDE okunuyor?**

⚠️ **İkinci kör nokta:** 2026-08-11 Şaman↔Kalkan setinin 20 senaryosunun tamamı **teknik 0**'dı.
Teknik 0'da iki dünya birebir aynı — o set bu hatayı yapısal olarak **göremezdi**.

---

## 4. Kök neden 2 — MANCINIK TILSIM'DAN ETKİLENİYOR

Şaman düzeltildikten sonra geriye tek aykırı kaldı: her birim ±%1,8 içindeyken Mancınık
saldıranda **−%8,2**, savunanda **−%16,4**.

Sebep §2'deki mimari: `FUN_004125c8`'de grup süzgeci yok. Mancınık'ın `mAtk`i 240 — yani
**faz-3 mitigasyonu** var ve Tılsım onu ölçekliyor.

⚠️ Dokümanın *"Büyü güçleri yoktur"* ifadesi **yanlış değil**: Mancınık'ın `magicHp`si 0, büyü
havuzuna katkı vermiyor, büyü fazında saldıramıyor. Ama **hasar alıyor** ve aldığı hasarın
mitigasyonu Tılsım'la büyüyor. Klasik ⚠️ *stat adları yanılsaması* (bkz. `mobiwar-verified-formulas`).

---

## 5. SONUÇ — iki düzeltmeden sonra

| | binary | eski motor | **yeni motor** |
|---|---:|---:|---:|
| saldıran kaybı | 4.512 | 5.316 (+%17,8) | **4.523 (+%0,24)** |
| savunan kaybı | 8.760 | 8.807 (+%0,5) | **8.759 (−%0,01)** |
| kahraman deneyimi | 8.404 | 10.695 (+%27,3) | **8.425 (+%0,25)** |
| enkaz (altın) | 8.905.481 | 9.796.770 (+%10,0) | **8.930.220 (+%0,28)** |

**18 birim hücresinin 18'i de ±3 BİRİM içinde** (en büyüğü 2.144'lük Elf'te −2,9 = %0,13).

`catalogHash` `9fce9abf` → `76e00eb7` (Şaman) → **`3a8b2be4`** (Mancınık). İkisi de tablo
değişikliği, kayması doğru.

---

## 6. ⚠️ AÇIK KALEM — savunma YAPILARINA Tılsım (ölçülmedi)

§2'deki okuma, `FUN_004130c4`'ün de süzgeçsiz olması nedeniyle Tılsım'ın **bütün savunma
yapılarına** uygulanmasını gerektiriyor. Katalogda yalnız `oil_cauldron` ve `guard` var:

| yapı | `mAtk` | Tılsım listesinde? |
|---|---:|---|
| Okçu Kulesi | 19 | ⛔ eksik |
| Tuzak | 0 | — (ölçeklenecek şey yok) |
| Kazancı | 72 | ✅ var |
| Mangonel Kulesi | 120 | ⛔ eksik |
| Muhafız | 120 | ✅ var |
| Balista | 600 | ⛔ eksik |

⚠️ **Bilerek DEĞİŞTİRMEDİM.** Tetikleyen savaşta savunma yapısı yoktu → bu satırlar **ölçülmedi**
ve savunma dengesini yalnız okumaya dayanarak değiştirmek istemedim. Aşağıdaki set onu kapatır.

### Ölçüm seti — savunma yapılarında Tılsım

Kurulum: **saldıran 200 Ejderha** (saf büyü baskısı, faz 3) · savunan yalnız o yapıdan.
Diğer tüm teknikler 0, gece kapalı, Sur/Kalkan yok.

> Motor sütunu **bugünkü** (Tılsım'sız) hâli gösteriyor. Tılsım 15 satırı bugünkü motorda
> Tılsım 0 ile **birebir aynı** çıkmalı; binary'de FARKLI çıkarsa okuma doğrulanmış olur.

| # | Savunan | Tılsım (sav) | motor: kalan | **gerçek: kalan** |
|---|---|---:|---:|---|
| Y1 | 3.000 Okçu Kulesi | 0 | | |
| Y2 | 3.000 Okçu Kulesi | **15** | Y1 ile AYNI | |
| Y3 | 1.500 Mangonel Kulesi | 0 | | |
| Y4 | 1.500 Mangonel Kulesi | **15** | Y3 ile AYNI | |
| Y5 | 400 Balista | 0 | | |
| Y6 | 400 Balista | **15** | Y5 ile AYNI | |
| Y7 | 1.000 Muhafız *(kontrol — listede ZATEN var)* | 0 | | |
| Y8 | 1.000 Muhafız *(kontrol)* | **15** | Y7'den YÜKSEK | |

**Nasıl okunur:**

| Gözlem | Sonuç |
|---|---|
| Y2>Y1 · Y4>Y3 · Y6>Y5 **ve** Y8>Y7 | ✅ Okuma doğru → üç yapı listeye eklenmeli |
| Y2=Y1 · Y4=Y3 · Y6=Y5 ama Y8>Y7 | ⛔ Yapılarda süzgeç VAR → `FUN_004130c4` yeniden okunmalı |
| Y8 = Y7 | ⚠️ Kurulum bozuk — Muhafız zaten listede, fark GÖRÜNMELİ. Kalan sayı doymuş olabilir (hepsi ölmüş ya da hiç ölmemiş); Ejderha sayısını ayarla |

⭐ **Y7/Y8 kontrol satırı zorunlu.** Onsuz "fark yok" sonucu, "Tılsım yapılara işlemiyor" ile
"kurulum farkı gösteremiyor" arasında ayrım yapamaz — geçen iki turun da en pahalı dersi buydu.

⚠️ Savunma yapılarında **onarım** var (%76-81) ve kalan sayıyı dalgalandırır → her satırı
**3 kez** koş, aralık yaz.

---

## 7. ⭐ Gece setinin açık kalemi — BU TURDA KAPANDI

`docs/GECE_GORUS_TESTLERI.md` bir artık bırakmıştı: 60+ hücrenin ~10'unda motor **≤1 birim**
yüksekti ve iki aday (Şaman kayıp toplamına sayılmıyor · yuvarlama geleneği) ayrılamıyordu.
Kapatmak için *"±1 birim ‰0,1'e insin diye çok daha büyük adetlerle kurulmuş bir set"* gerekiyordu.

**Bu savaş tam olarak o set.** Adetler binlerde ve artığın **mutlak mı oransal mı** olduğu
doğrudan görünüyor:

| birim | binary | motor | mutlak | oransal |
|---|---:|---:|---:|---:|
| Elf (saldıran) | 2.144 | 2.141,1 | −2,9 | **−%0,13** |
| Ejderha (saldıran) | 76 | 75,0 | −1,0 | **−%1,32** |

⭐ **Aynı mutlak büyüklük, on kat farklı yüzde.** Hata oransal olsaydı Elf %1,3'ten ~28 birim
sapardı; 2,9 sapıyor. ⇒ Artık **birim TÜRÜ başına ~1-2 birimlik, adetten bağımsız** bir kayma,
yani **yuvarlama sınıfı** bir fark — model hatası değil.

Toplamda saldıranda 8 tür × ~1,4 ≈ 11 birim, ölçülen fark **+11** (4.523 ↔ 4.512). Tutuyor.

- [x] **Kapandı: model hatası yok.** Artık, tek bir binary koşumunun çözünürlüğünün (jitter
      ±%0,1 + tür başına yuvarlama) **altında**. Daha ileri gitmek için binary'nin kalan-sayı
      yuvarlama geleneğini disassembly'den okumak gerekir; ölçümle ayrılamaz.
- [x] Eski iki adaydan **«Şaman sayılmıyor» ELENDİ**: bu savaşta Şaman kalanı saldıranda
      820,5 ↔ 822, savunanda 543,4 ↔ 544 — Şaman diğer birimlerle **aynı** hassasiyette.
