# CASUSLUK SİSTEMİ — RÖNTGEN

**Tarih:** 2026-08-09 · **Kaynak:** `apps/api/src/missions/mission.handlers.ts` (`createSpyHandler`,
`gatherIntel`) · `packages/catalog/src/formulas.ts` (`spyEffectiveDiff`, `spyLevelFor`,
`spyInterception`, `SPY_CONSTANTS`) · `mission.service.ts` (`sendSpy`, `march`,
`assertTargetAllowed`) · referans: `docs/referans/tekniklere_ve_yapilara_iliskin_on_bilgiler.txt`

---

## 0. Bir bakışta

Casusluk **tek bir sayı** üzerinden çalışmıyor; birbirinden bağımsız **iki hesap** var ve
oyuncuların en çok karıştırdığı yer burası:

| | Soru | Formül | Neye bakar |
|---|---|---|---|
| **A** | Kuş **geçebiliyor mu?** | `kesişim` | Rakip **kuş/kule/elf sayısı** × `2^(seviye farkı)` |
| **B** | Geçtiyse **ne kadar bilgi?** | `etkin fark` | Casusluk seviyesi + `log2(kuş)` |

⚠️ **Kuş sayısı iki hesapta da var ama farklı işlevle.** (B)'de logaritmik — 2 katı kuş = +1
seviye. (A)'da doğrusal — duvarı aşmak için kuşu **kaç katına** çıkarman gerekiyorsa o kadar.
Bir oyuncu "kuş sayısını artırıyorum, hâlâ bilgi gelmiyor" diyorsa neredeyse her zaman (A)'da
takılıdır ve (B) hesabı hiç devreye girmemiştir.

Sıra: **önce (A), sonra (B).** Hiç bilgi kuşu geçmediyse (`infoBirds = 0`) hesaplanmış kademe
kullanılmaz, rapora `null` yazılır.

---

## 1. Görev yola çıkarken — kapılar

`sendSpy()` → `march({ type: 'spy', forbidOwnTarget: true, allowSpyBird: true })`

| Kapı | Kural | Not |
|---|---|---|
| Birim | **Yalnız Casus Kuş** (`spy_needs_birds`) | Tek başka birim varsa görev reddedilir |
| Hedef | Kendi şehrin **olamaz** (`forbidOwnTarget`) | |
| Başlangıç koruması | Hedef korumadaysa **engel** (`target_protected`) | Casusluk «düşmanca» sayılıyor |
| Tatil modu | Hedef tatildeyse **engel** (`target_vacation`) | Gönderen tatildeyse de engel |
| Ceza | Hedefin cezası «saldırıya kapalı» ise engel | |
| Ordu limiti | Şehir başına **eşzamanlı görev ≤ Baraka seviyesi** | `assertMarchLimit` |
| **10 kat kuralı** | ⛔ **UYGULANMAZ** | Yalnız `sendAttack` gövdesinde |
| **Günlük limit** | ⛔ **YOK** | Saldırıdaki «24 saatte 3» casuslukta yok |
| Doğrulanmamış hesap | ⛔ **Serbest** | `unverified.ts` tablosu: *casusluk serbest* |

⚠️ **Savunan, kuşlar yoldayken haberdar oluyor** (`city:incoming_spy`, 2026-07-31): hedef
şehir, kalkış koordinatı, **varış saati ve kaç kuş geldiği**. Bu bilinçli — savunan karşı kuş
üretip üretmeyeceğine karar verebilsin diye. Yani casusluk sürpriz bir eylem değil.

---

## 2. (A) Kesişim — kuş geçiyor mu?

```
espK      = 2 ^ clamp(rakipCasusluk − benimCasusluk, −6, +6)      ← en fazla 64×, en az 1/64×
vurmaGücü = (kule × 1,0 + elf × 0,2) × espK        ← yalnız kule/elf VARSA, yoksa 0
ölen      = min(gönderilen, round(vurmaGücü))
engelGücü = rakipKuş × 1,0 × espK
engellenen= min(gönderilen − ölen, round(engelGücü))
bilgiKuşu = gönderilen − ölen − engellenen
```

**Bilgi ancak `bilgiKuşu ≥ 1` ise gelir.**

| Savunma öğesi | Ağırlık | Ne yapar | Kaynak maliyeti | Engel başına maliyet |
|---|---|---|---|---|
| **Casus Kuş** | `1,0` | **Engeller** (öldürmez) | 300 | **300** — en verimli |
| **Okçu Kulesi** | `1,0` | **Vurur** (öldürür) | 750 | 750 |
| **Elf** | `0,2` | **Vurur** (öldürür) | 1.100 | 5.500 — yan görev |

Üç tasarım kararı:

1. **Kuş vurmaz, engeller.** Rakipte gönderdiğin kadar kuş varsa hiçbir bilgi sızmaz **ama
   kimse ölmez** — kuşlar eve döner. "Kuşa kuş" dengesi böyle kuruluyor.
2. **Yalnız Kule ve Elf öldürür** (dokümanla birebir: *"Casus Kuşlar casusluk sırasında
   Savunma Kuleleri ve Elfler tarafından vurulabilirler"*). Şehirde ikisi de yoksa **kayıp
   sıfırdır** — kuşların hepsi eve döner, sadece bilgi gelmez.
3. **Deterministik, zar yok.** Aynı girdi hep aynı sonucu verir.

⚠️ **Tüm kuşlar ölürse dönüş görevi oluşmaz.** Engellenen kuşlar ölmez, eve döner.

⚠️ **`espK` bu sistemin en sert çarpanı.** 6 seviye geride olmak, savunanın her savunma
öğesini **64 katına** çıkarır. Bu bilinçli bir seçim (kullanıcı: *"buradaki en büyük çarpan
casusluk seviyesi farkı"*), ama pratik sonucu şu: **seviye farkını kapatmadan kuş sayısıyla
duvarı aşmak neredeyse imkânsızdır** — §8'deki vaka tam olarak bunun örneği.

---

## 3. (B) Etkin fark — ne kadar bilgi?

```
etkinFark = max(0, benimCasusluk) + log2(gönderilenKuş) − max(0, rakipCasusluk)
kademe    = SPY_LEVELS[ min(5, floor(etkinFark) + 1) ]      (fark < 0 → en alt kademe)
```

Dokümanla birebir: *"8 casus kuş yollarsanız 2³=8 olduğundan casusluk tekniğiniz 3 seviye
fazla gibi davranır."*

⚠️ `log2` **gönderilen** kuşa bakar — vurulan/engellenen düşülmez. Kademe ile geçiş ayrı
hesaplar.

---

## 4. Kademe tablosu — hangi farkta ne geliyor

Kademeler **kümülatif**: her biri bir öncekinin üstüne ekler.

| Fark | Kademe | Eklenen bilgi |
|---:|---|---|
| `< 0` | `resources` | **Altın ve yemek** miktarı |
| `0` | `economy` | + **Maden** ve **Çiftlik** seviyesi |
| `1` | `armyTotals` | + **toplam savaşçı** ve **toplam savunma ünitesi** sayısı |
| `2` | `armyTypes` | + savaşçı/savunma **tipleri** (hangi birim var, sayı yok) · + **kahraman SAYISI** |
| `3` | `armyCounts` | + savaşçı ve savunma **tek tek sayıları** · + her kahramanın **adı, seviyesi ve 4 yetenek puanı** |
| `≥ 4` | `full` | + **tüm teknikler** · **Kale** · **Sur** · **Büyü Kalkanı** · ⭐ **Mağara** · ⭐ **Teleport** seviyesi |

### Sonradan eklenenler (orijinal dokümanda yok)

| Ne | Kademe | Gerekçe |
|---|---|---|
| ⭐ **Mağara seviyesi** | `full` | *"Bu şehir ne kadar asker saklayabilir"* sorusunun cevabı |
| ⭐ **Teleport seviyesi** | `full` | *"Bu oyuncu bana ne kadar hızlı ulaşır"* — ordu bir anda başka kıtaya gidebilir |
| ⭐ **Kahraman sayısı** | `armyTypes` | |
| ⭐ **Kahraman ad/seviye/yetenek** | `armyCounts` | Ad, seviye ve XP zaten **herkese açık** (kahraman sıralaması); yeni olan **yetenek puanları**. Sıralama günde 3 kez donuyor, casusluk ise **canlı** — kademenin gerçek değeri bu |

### ⛔ Casusluğun ASLA göremediği üç şey

1. **Mağaradaki askerler.** Yalnız mağara **seviyesi** sızar, içindeki ordu değil (`cave_units`
   ayrı tablo). Mağaranın bütün varlık sebebi bu — doküman: *"düşmanlarınızın casus kuşları
   mağaradaki askerleri göremezler."*
2. **Seferdeki kahramanlar.** Görevdeyken `heroes.city_id` NULL olduğu için sorgu onları hiç
   görmez — ayrıca kod yazmaya gerek kalmadan gizleniyor.
3. **Ölü / dirilmekte olan kahramanlar.** Yalnız `alive` sayılır: savaşa katılamayacak bir
   kahramanı saymak, raporu doğrudan simülatöre taşıyan oyuncuyu yanlış savaşa sokardı.

⚠️ Sur ve Büyü Kalkanı **adet değil seviye** taşıdığı için "toplam savunma ünitesi" sayısına
girmezler; `full` kademesinde ayrıca seviye olarak veriliyorlar.

---

## 5. Raporlama — iki taraf da yazılır

Her ikisi de casusluğun **çözüldüğü anda** yazılır; kuşların eve dönüşü beklenmez.

**Casusluk yapana** (`side: 'spy'`): gönderilen/ölen/engellenen kuş, etkin fark, kademe ve
toplanan bilgi. Başlıkta hedef şehir + **rakibin kullanıcı adı**.

**Savunana** (`side: 'target'`) — **her casuslukta**, kuş vurulmasa bile: kaç kuş geldi, kaçı
vuruldu/engellendi, **hangi kademe bilgi sızdı** (`leakedLevel`) ve **kimin yaptığı**.

⚠️ **Sessiz casusluk yok.** Savunan hem varıştan önce (`city:incoming_spy`) hem de sonrasında
haber alıyor. Yani casusluk bilgi kazandırır ama **iz bırakır**: rakip senin casusluk
denediğini ve ne öğrendiğini bilir.

---

## 6. Denge: hangi savunma neyi durdurur

Savunanın casusluk seviyesi **rakibinkine eşitse** (`espK = 1`), N kuşluk bir akını tam
durdurmak için gereken:

| Savunma | Gereken adet | Kaynak |
|---|---:|---:|
| Casus Kuş | N | 300 × N |
| Okçu Kulesi | N | 750 × N |
| Elf | 5 × N | 5.500 × N |

⚠️ **Adanmış sayaç her zaman kuştur** — hem en ucuz hem tek işi bu. Kule ve elf "yan görev"
olarak durdurur; asıl işleri savunma. Bu ağırlıklar `scripts/spy-balance.mjs` süpürmesiyle
kalibre edildi.

⚠️ **Ama seviye farkı her şeyi ezer.** 3 seviye geride olan bir casus, savunanın her bir kuşunu
**8 kuş** gibi karşısında bulur. Duvarın gerçek yüksekliği `rakipKuş × 2^fark`.

---

## 7. Bilinen tasarım gerilimleri

1. **Kuş sayısı kademede logaritmik, duvarda doğrusal.** Oyuncunun sezgisi "daha çok kuş = daha
   çok bilgi" ama duvarı aşmadan kademe hiç kullanılmıyor. Rapor şu an farkı (`diff`) yazıyor;
   **duvarın yüksekliğini yazmıyor** — oyuncu neden geçemediğini sayıyla göremiyor. §8'deki
   oyuncunun 8 kez üst üste denemesinin sebebi büyük ihtimalle bu.
2. **`espClamp = ±6`** üstünde fark artırmak savunmaya bir şey katmıyor; 6'dan sonra tek çare
   kuş sayısı.
3. **Günlük limit yok.** Casusluk ucuz ve sınırsız denenebilir; tek maliyeti kuş kaybı ve
   kayıp da yalnız savunanda kule/elf varsa oluşuyor.

---

## 8. VAKA: 1:17:5 → 1:28:5 — "hiç bilgi alamadım"

**Taraflar** (dünya 1)

| | Oyuncu | Şehir | Casusluk (an itibarıyla) |
|---|---|---|---|
| Saldıran | **Kaos** (`id 24`) | `1:17:5` — Kaos (`id 35`) | **22** |
| Savunan | **cotanak28** (`id 4`) | `1:28:5` — Büşra (`id 23`) | **25** |

**Savunan şehrin durumu:** `2.567` casus kuş · `100` okçu kulesi · `0` elf

### 8.1 Sekiz deneme, sekiz kez sıfır bilgi

Motor kodu (`spyEffectiveDiff` + `spyInterception`) sunucudaki gerçek verilerle koşuldu ve
**sekizinin de raporu birebir yeniden üretildi**:

| # | Saat (TSİ) | Kuş | Kaos esp. | cotanak esp. | Fark | Ölen | Engellenen | **Bilgi kuşu** |
|--:|---|--:|--:|--:|--:|--:|--:|--:|
| 1 | 11:27 | 560 | 14 | 24 | −0,87 | 0 | **560** | **0** |
| 2 | 14:29 | 1.000 | 16 | 24 | 1,97 | 0 | **1.000** | **0** |
| 3 | 14:34 | 1.100 | 17 | 24 | 3,10 | 0 | **1.100** | **0** |
| 4 | 14:42 | 1.163 | 18 | 24 | 4,18 | 0 | **1.163** | **0** |
| 5 | 18:00 | 879 | 20 | 25 | 4,78 | 0 | **879** | **0** |
| 6 | 18:12 | 879 | 21 | 25 | 5,78 | 0 | **879** | **0** |
| 7 | 19:02 | 879 | 21 | 25 | 5,78 | 0 | **879** | **0** |
| 8 | 19:35 | 879 | 22 | 25 | 6,78 | **800** | 79 | **0** |

### 8.2 Sebep — üç cümlede

**1) Bilgi kademesi hiç sorun değildi.** 4. denemeden itibaren etkin fark **4'ün üstünde**,
yani kademe zaten `full` (teknikler + Kale/Sur/Kalkan/Mağara/Teleport). Kaos'un casusluk
seviyesini 14'ten 22'ye çıkarmak **doğru hamleydi ama yanlış eksende işe yarıyordu**: kademe
zaten tavandaydı, tırmanan tek şey **duvarın alçalmasıydı**.

**2) Duvar, savunanın 2.567 kuşu.** İlk yedi denemede savunan şehirde **hiç kule ve elf yoktu**
— bu yüzden bir tek kuş bile ölmedi. Hepsi **engellendi**:

```
espK      = 2^(25 − 22) = 8
engelGücü = 2.567 × 1,0 × 8 = 20.536 kuş
```

Kaos'un gönderdiği en büyük akın **1.163 kuş**, yani duvarın **%5,7'si**.

**3) Sekizinci denemede savunan tam da o sırada kule dikti.** Sunucudaki üretim kuyruğu:

| Ne | Başladı | Bitti |
|---|---|---|
| 100 × Okçu Kulesi (şehir 23) | **09.08 19:02** | **09.08 19:30** |
| Kaos'un 8. casusluğu | | **09.08 19:35** |

Kule üretimi, Kaos'un **7. denemesinin geldiği dakikada** başlamış ve 8. denemeden **beş dakika
önce** bitmiş. Sonuç: `vurmaGücü = 100 × 1,0 × 8 = 800` → 879 kuşun **800'ü öldü**, kalan 79'u
engellendi. Kaos'un elinde şu an **79 kuş** kaldı — yani stoğu bitti.

⚠️ Bu bir tesadüf değil: savunan **`city:incoming_spy` ile kuşların geldiğini önceden
görüyor** ve 7. akını gördüğü anda savunma inşasına başlamış. Sistem tasarlandığı gibi
çalışmış.

### 8.3 Kaos ne yapmalıydı — sayıyla

Savunan sabit kalırsa (2.567 kuş + 100 kule), **tek bir bilgi kuşu** geçirmek için:

| Kaos casusluk | espK | Duvar (ölen + engellenen) | **Gereken kuş** |
|--:|--:|--:|--:|
| 22 (bugünkü) | 8 | 21.336 | **21.337** |
| 23 | 4 | 10.668 | 10.669 |
| 24 | 2 | 5.334 | 5.335 |
| **25 (eşitlik)** | **1** | **2.667** | **2.668** |
| 26 | 0,5 | 1.334 | 1.335 |
| 28 | 0,125 | 334 | **335** |
| 31 | 0,016 | 42 | **43** |

Her kademede kuş ihtiyacı **yarıya iniyor**. Kaos 22 → 25 çıkarsa gereken kuş 21.337'den
2.668'e düşüyor; 28'e çıkarsa 335'e. **Kuş üretmek değil, casusluk seviyesini kapatmak asıl
kaldıraç** — ve geçtiği anda kademe zaten `full` olacak.

### 8.4 Aynı savunanın diğer casusluk kayıtları — sistem çalışıyor mu?

cotanak28'in **28 önleme raporu** var. Sistem tıkalı değil; savunma zayıfken bilgi **sızmış**:

| Tarih | Hedef | Kuş | Ölen | Engellenen | Sızan kademe |
|---|---|--:|--:|--:|---|
| 06.08 21:40 | 1:3:4 | 20 | 0 | 0 | **armyCounts** |
| 07.08 06:15 | 1:3:4 | 22 | 0 | 0 | **full** |
| 07.08 22:48 | 1:5:8 | 47 | 0 | 0 | **full** |
| 08.08 20:38 | — | 15 | 0 | 0 | **armyTypes** |
| 09.08 03:44 | 1:3:4 | **15.480** | 0 | **15.480** | — |
| 09.08 08:36 | 1:5:8 | 1.000 | **1.000** | 0 | — |

⚠️ Dikkat: **22 kuşla `full` alınmış** (07.08 06:15) — o an savunan şehirde kuş/kule yoktu.
Aynı savunan iki gün sonra **15.480 kuşluk** bir akını hiç kayıp vermeden tamamen engelliyor.
Aradaki tek fark **savunanın kuş stoğu**.

### 8.5 Dengeye dair not

⚠️ Bu dünyadaki kuş sayıları **organik değil.** `audit_log` kaydı: **09.08 00:52'de toplu birim
verme** işlemi 36 şehirde 25 oyuncuya 432 satır yazmış. cotanak28'in dört şehrinde toplam
**~11.900 casus kuş** var; buna karşılık tüm oyun boyunca **ürettiği kuş 28 tane**. Yani
§8'deki duvar bir denge sonucu değil, **test amaçlı toplu yüklemenin** sonucu.

Gerçek dengeyi ölçmek için bu dünya uygun değil — kuş stokları üretim maliyetiyle sınırlıyken
tekrar bakılmalı.

---

## 9. Bu turda düzeltme YAPILMADI

Rapor teşhistir; kod değiştirilmedi. Değerlendirilmesi gereken iki aday §7'de:

1. **Rapora "duvar" bilgisi eklemek** — oyuncu şu an *neden* geçemediğini göremiyor, yalnız
   "engellendi" yazıyor. Kaç kuşun engellendiği yazıyor ama **kaç kuş gerektiği** yazmıyor.
   §8'deki oyuncunun 7.339 kuşu boşa harcamasının sebebi bu olabilir.
2. **Casusluk seviyesi farkının ağırlığı** (`espK`, taban 2, ±6 kırpma) — 3 seviyelik fark
   duvarı 8 katına çıkarıyor. Bu bilinçli bir karardı; ölçüm organik bir dünyada tekrarlanmalı.
