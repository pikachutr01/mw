# Savaş motoru — binary simülatörle karşılaştırma listesi

**Tarih:** 2026-08-05 · **Sebep:** kullanıcının yakaladığı "1000 casus kuş savunanı kazandırıyor"
hatası düzeltildi (`packages/engine/src/combat.ts`, kazanan kararı artık `combatAlive` ile).

Aşağıdaki tablo **düzeltmeden SONRAKİ** motor çıktısıdır. Aynı savaşları binary simülatörde
koşturup sonuçları karşılaştıralım; ayrışan satır varsa motorda düzeltilecek.

> Hepsi **gündüz** savaşı, teknik 0, kahraman yok, sur/kalkan yok (aksi belirtilmedikçe).
> Tohum sabit (`bin-<no>`), yani çıktılar tekrar üretilebilir.

| # | Saldıran | Savunan | Motor: kazanan | Tur | Kayıp (sal/sav) | Not |
|---|---|---|---|---|---|---|
| 1 | Cüce 120 | Casus Kuş 1000 | **SALDIRAN** | 1 | 0 / 0 | ⭐ düzeltilen durum (doğru) |
| 2 | Cüce 120 | Yük Arabası 500 | **SALDIRAN** | 1 | 0 / 0 | aynı desen (doğru) |
| 3 | Cüce 120 | Gnom 500 | **SALDIRAN** | 1 | 0 / 0 | aynı desen (Sonuç: saldıran kazanır. saldıran 0 kaybeder, savunan 4 kaybeder, 1 tur, tüm denemelerde aynı sonuç) |
| 4 | Cüce 120 | Cüce 1 + Casus Kuş 1000 | **SALDIRAN** | 3 | 0 / 1 | tek savaşçı savaşı başlatıyor (Sonuç: saldıran kazanır, saldıran 0 kaybeder, savunan 1001 kaybeder, 3 tur, tüm denemelerde aynı sonuç, ölen kuşlardan ganimet çıkıyor) |
| 5 | Yük Arabası 50 | Cüce 10 | **SAVUNAN** | 1 | 0 / 0 | simetri: saldıran da savaşmıyor (doğru) |
| 6 | Yük Arabası 50 | Casus Kuş 100 | **BERABERE** | 1 | 0 / 0 | iki taraf da savaşmıyor (simülatörde berabere olmadığı için savunan kazandı diyor ama diğer bilgiler doğru) |
| 7 | Cüce 120 | Sur 3 | **SALDIRAN** | 5 | 0 / 0 | sur yıkılıyor → savunan ayakta kalmıyor (saldıran kazanıyor, iki taraf da 0 kayıp ama sur yıkılmıyor, yüzde 100 kalıyor, 1 tur) |
| 8 | Cüce 120 | Büyü Kalkanı 3 | ⚠️ **SAVUNAN** | 5 | 0 / 0 | **şüpheli — aşağıya bak** (Sonuç: saldıran kazanır, iki taraf da 0 kaybeder, büyü kalkanı canı hiç inmez, yüzde 100 de kalıyor., 1 tur) |
| 9 | Cüce 120 | Tuzak 50 | **SALDIRAN** | 1 | 75 / 0 | tuzak salvosu vuruyor ama şehri tutamıyor (sonuç: saldıran kazaır, 1 tur, saldıran 63-85 arası kaybeder. Savunanda 1-12 arası tuzak kalıyor, kalan tuzak sayısı azaldıkça ölen cüce sayısı artıyor. ) |
| 10 | Cüce 120 | Tapınak 3 | ⚠️ **SAVUNAN** | 5 | 0 / 0 | **şüpheli — aşağıya bak** (sonuç, saldıran kazanır, 1 tur, saldıran da savunan da 0 kaybeder)|
| 11 | Cüce 120 | Şaman 200 | ⚠️ **SAVUNAN** | 5 | 0 / 0 | **şüpheli — aşağıya bak** (sonuç: savunan kazanır, iki taraf da 0 kaybeder, 5 tur) |
| 12 | Cüce 120 | (boş şehir) | **SALDIRAN** | 1 | 0 / 0 | kıyas grubu (sonuç: saldıran kazanır, iki taraf da 0 kayıp, 1 tur) |
| 13 | Cüce 100 | Cüce 100 | SALDIRAN | 5 | 63 / 63 | çekişmeli savaş, dokunulmadı (sonuç: iki taraftan da 62 kayıp olur, 5 tur, kazanan tamamen rastgele belirlenir, bazen savunan bazen saldıran kazanır) |
| 14 | Cüce 3000 | Casus Kuş 1000 + Okçu Kulesi 50 | **SALDIRAN** | 3 | 0 / 0 | kuş + gerçek savunma karışımı (sonuç: saldıran kazanır, savunan 1000 kaybeder, saldıran 0 kaybeder, 38-41 arası okçu kulesi kalır, ölen kuşlar ganimet verir, 3 tur) |
| 15 | Cüce 3000 + Elf 500 | Casus Kuş 50 | **SALDIRAN** | 1 | 0 / 0 | ezici üstünlük (doğru) |

---

## ✅ 2026-08-07 — KÖK NEDEN BULUNDU VE DÜZELTİLDİ

**Tek satırlık hata, üç şüpheli satırın ikisini + canlı bir hatayı birden açıklıyor.**

`combatAlive` (`packages/engine/src/combat.ts`) "bu ordu hâlâ ayakta mı" sorusunu yanıtlarken
`NONCOMBAT`i süzüyordu ama **`LEVEL_BASED`i süzmüyordu**. Sur · Büyü Kalkanı · Tapınak girdide
ADET değil **SEVİYE** taşıyor (`Sur 8` = sekizinci seviye sur) ve savaşta seviyeleri hiç
düşmüyor — dolayısıyla **seviye, canlı birim adedi gibi davranıyordu**: ordusu olmayan ama
Sur 8'i olan şehir "8 birim ayakta" görünüyor, savaş 5 tur boşa dönüyor, kimse kayıp vermiyor
ve karar *"eşitlikte savunan"* kuralına düşüyordu.

⚠️ Bu, 2026-08-05'te düzeltilen "1000 casus kuş" hatasının **ikizi**: o zaman savaş-dışı
BİRİMLER şehri ayakta tutuyordu, burada seviye taşıyan YAPILAR tutuyordu. Katalogdaki
`LEVEL_BASED` yorumu zaten *"hayatta kalan birim toplamına KATILMAZLAR"* diyordu ve raporun
`alive` sayacı (`combat.ts:852`) bunu doğru uyguluyordu — sapan tek yer `combatAlive`di.

**Canlı doğrulama** (kullanıcı raporu): 132 Yük Arabası + 2 Ejderha, savunanın şehrinde hiç
ordu yok, yalnız Sur 8 → eskiden **saldıran 5 tur sonra 0 kayıpla KAYBEDİYOR** ve sur %31'e
iniyordu. Düzeltmeden sonra: **saldıran kazanır · 1 tur · iki taraf da 0 kayıp · sur %100.**

| # | Eski motor | Yeni motor | Binary | Durum |
|---|---|---|---|---|
| 7 | SALDIRAN · 5 tur | SALDIRAN · **1 tur** · sur %100 | SALDIRAN · 1 tur · sur %100 | ✅ oturdu |
| 8 | ⚠️ SAVUNAN · 5 tur | **SALDIRAN** · 1 tur · kalkan %100 | SALDIRAN · 1 tur · kalkan %100 | ✅ oturdu |
| 10 | ⚠️ SAVUNAN · 5 tur | **SALDIRAN** · 1 tur | SALDIRAN · 1 tur | ✅ oturdu |
| 11 | SAVUNAN · 5 tur | SAVUNAN · 5 tur (değişmedi) | SAVUNAN · 5 tur | ✅ zaten doğruymuş |

⭐ **11 numara şüpheli DEĞİLMİŞ**: Şaman `NO_POOL` ama gerçek bir savaşçı, binary de savunanı
kazandırıyor. Yeterli şaman gerçekten dokunulmazlık sağlıyor — motor bunu doğru uyguluyordu.

Kalıcı bekçi testleri `packages/engine/test/reference.test.ts` sonunda (7·8·10 + canlı senaryo
+ iki karşı kontrol: Sur ordusu olan savunanda hâlâ hem koruyor hem yıpranıyor).

### ⏳ Hâlâ ayrışan satırlar — AYRI bir aile, dokunulmadı

Bunlar "kim kazandı" değil **"kayıp nasıl sayılıyor"** sorusu; kök neden farklı ve ölçüm
gerektiriyor. Motor bu satırlarda kazananı ve tur sayısını doğru veriyor, yalnız kayıp
dökümü tutmuyor:

| # | Motor | Binary | Fark |
|---|---|---|---|
| 3 | savunan 0 kayıp | savunan **4 gnom** kaybeder | Gnom `NO_ROUND_LOSS`; binary 1. turda az sayıda gnom kırıyor |
| 4 | savunan 1 kayıp | savunan **1001** kaybeder | Savunanın ordusu kırılınca kuşlar da gidiyor; motorda kuş kaçıyor |
| 14 | savunan 0 kayıp | savunan **1000 kuş** + ~10 okçu kulesi | Aynı aile + kule kaybı |
| 6 | BERABERE | savunan (binary'de berabere yok) | Kullanıcı notu: *"diğer bilgiler doğru"* — gösterim farkı |

⚠️ 4 ve 14'ün ortak deseni: **savaş gerçekten olduğunda** kaybeden tarafın savaş-dışı birimleri
yok oluyor; hiç vuruşma olmayan 1 numarada ise kuşlar sağ kalıyor (*"(doğru)"* diye
işaretlenmiş). Motordaki `SETTLE_ON_LOSS`/`NO_ROUND_LOSS` ayrımı bunu tam karşılamıyor.
Düzeltmeden önce binary'de **"kuşlar ne zaman ölür"** sorusunun ayrı ölçülmesi gerekiyor.

---

## ⚠️ Üç şüpheli satır (8, 10, 11) — ✅ 8 ve 10 DÜZELTİLDİ, 11 zaten doğruymuş (yukarı bak)

Bunlar 1 numaralı hatanın **aynı ailesinden** ama farklı birimlerle. Kullanıcının talimatı
"doğrudan düzeltme, bana rapor ver" olduğu için bilerek dokunulmadı.

### 8 — Yalnız Büyü Kalkanı olan şehir saldırıyı savuşturuyor
Kalkan `PASSIVE_STRUCTS` içinde (kendi mekanizması var, normal saldırı havuzuna girmez) ama
**`NONCOMBAT` içinde değil**. Dolayısıyla "bu ordu ayakta mı" sorusunda kalkanın **seviyesi**
(3) canlı birim gibi sayılıyor: savunan ayakta görünüyor, kimse kayıp vermiyor ve karar
"eşitlikte savunan" kuralına düşüyor.
**Soru:** binary'de tek başına büyü kalkanı olan (ordusu ve savunma birimi olmayan) bir şehir
saldırıyı savuşturuyor mu, yoksa saldıran mı kazanıyor?
⚠️ Not: 7 numaralı satırda **sur** aynı durumda değil, çünkü sur savaşta yıkılıp sıfırlanıyor.

### 10 — Yalnız Tapınak olan şehir saldırıyı savuşturuyor
Aynı sebep. Üstelik kodun kendi yorumu tapınak için *"savaşmaz"* diyor — yani niyet zaten
savaşa katılmaması. Buna rağmen şehri ayakta tutuyor.
**Soru:** binary'de yalnız tapınağı olan şehir ne oluyor?

### 11 — 200 Şaman tek başına 120 cüceyi durduruyor
Şaman `NO_POOL` (saldırı havuzuna katkı vermez) ama gerçek bir birim. Şaman kalkanı gelen
gücü tamamen emiyor → savunan 0 kayıp; şaman vurmadığı için saldıran da 0 kayıp; sonuç
5 tur sonra beraberlik → savunan kazanıyor.
**Soru:** binary'de yalnız şamanı olan bir şehre saldırı ne veriyor? Şaman kalkanının bir
üst sınırı var mı, yoksa yeterli şaman gerçekten dokunulmazlık mı sağlıyor?

---

# 🔵 2026-08-07 — YENİ ÖLÇÜM İSTEĞİ: "savaş-dışı birimler ne zaman ölür?"

Kalan tek ayrışma ailesi bu. **Kazanan ve tur sayısı doğru**, tutmayan şey kayıp dökümü.

## Motorun BUGÜNKÜ kuralı (ölçüldü, aşağıdaki tabloda görünüyor)

| Birim | Motor ne yapıyor |
|---|---|
| **Casus Kuş** | **HİÇ ölmüyor** — hangi taraf kaybederse kaybetsin uçup kaçıyor |
| **Gnom** | **HİÇ ölmüyor** |
| **Yük Arabası** | Yalnız **kaybeden** tarafta, kayıp oranıyla **orantısal** gidiyor (C3: 300'ün 150'si) |
| **Okçu Kulesi** | Normal savunma birimi gibi kayıp veriyor — **binary ile zaten uyuşuyor** (E1/E2: 10 kayıp ≈ senin ölçtüğün "38-41 kalır") |

## Binary'de görünen ve açıklayamadığımız üç şey

1. **Satır 4:** `Cüce 120 → Cüce 1 + Kuş 1000` = **1001 kayıp.** Yani savunanın tek cücesi
   ölünce 1000 kuş da gidiyor. Motorda kuşlar sağ kalıyor.
2. **Satır 1:** `Cüce 120 → Kuş 1000` = **0 kayıp** (sen "(doğru)" diye işaretledin). Yani
   savaş HİÇ olmayınca kuşlar yaşıyor. Satır 4'ten tek farkı bir cüce.
3. **Satır 3:** `Cüce 120 → Gnom 500` = **4 gnom** ölüyor, hem de 1 turda (yani vuruşma yok).
   Motor 0 diyor. Bu sayı nereden geliyor?

**Çalışma varsayımım:** *"gerçek bir tur dönerse, kaybeden tarafın savaş-dışı birimleri de
yok olur; hiç tur dönmezse yaşarlar."* Aşağıdaki senaryolar bunu sınamak için seçildi —
özellikle **A5/B1** (kazanan tarafta kuş) ve **A6/C3** (iki taraf da kısmen sağ kalıyor)
varsayımı ya doğrular ya çürütür.

## 📋 Senaryolar — binary sonuçlarını `Binary` sütununa yazman yeterli

> Hepsi **gündüz**, teknik 0, kahraman yok, sur/kalkan yok. Tohum `bin-<no>`.
> `—` = hiç kayıp yok.

| # | Saldıran | Savunan | Motor: kazanan | Tur | Motor: saldıran kaybı | Motor: savunan kaybı | Binary |
|---|---|---|---|---|---|---|---|
| A1 | Cüce 120 | Casus Kuş 1000 | **SALDIRAN** | 1 | — | — | *(satır 1: kuşlar sağ ✅)* |
| A2 | Cüce 120 | Cüce 1 + Casus Kuş 1000 | **SALDIRAN** | 3 | — | Cüce −1 | *(satır 4: 1001 ölü ❌)* |
| A3 | Cüce 120 | Cüce 50 + Casus Kuş 1000 | **SALDIRAN** | 4 | Cüce −11 | Cüce −50 | saldıran kazanır, saldıran 10 kaybder, savunanda sadece 175 kuş kalır. 4 tur (tüm senayolarda ölen kuşlar da ganimet üretir)  |
| A4 | Cüce 2000 | Cüce 50 + Casus Kuş 1000 | **SALDIRAN** | 3 | — | Cüce −50 | saldıran kazanır, saldıran 0 kaybeder, savunan 1050 kaybeder, 3 tur  |
| **A5** | Cüce 20 | Cüce 500 + Casus Kuş 1000 | **SAVUNAN** | 3 | Cüce −20 | — |savunan kazanır, saldıran 20 kaybeder, savunan 0 kaybeder, 3 tur |
| **A6** | Cüce 100 + Casus Kuş 500 | Cüce 100 + Casus Kuş 500 | **SALDIRAN** | 5 | Cüce −63 | Cüce −63 | Bu senaryo karışık. Bazen saldıran bazen de savunan kazanıyor. saldıranın kazandığı durumda: saldıran 62 kaybeder (hepsi cüce), savunan 312 kaybeder (62 cüce, 250 kuş), 5 tur. Savunanın kazandığı durumda: saldıran 62 kaybeder (yine hepsi cüce), savunan 62 kaybeder (hepsi cüce), 5 tur. Genel oyun mekaniği olarak casus kuşlar saldıran tarafta zaten olmaz, casus kuşlar saldırı durumunda etkisiz olmaları gerekir  |
| **B1** | Cüce 120 + Casus Kuş 1000 | Cüce 1 | **SALDIRAN** | 3 | — | Cüce −1 | saldıran kazanır, saldıran 0 kaybeder, savunan 1 kaybeder, 3 tur  |
| B2 | Cüce 20 + Casus Kuş 1000 | Cüce 500 | **SAVUNAN** | 3 | Cüce −20 | — |savunan kazanır, saldıran 20 kaybeder (hepsi cüce), savunan 0 kaybeder, 3 tur  |
| C1 | Cüce 120 | Cüce 1 + Yük Arabası 500 | **SALDIRAN** | 3 | — | Cüce −1, Yük −500 |saldıran kazanır, saldıran 0 kaybder, savunan 501 kaybeder (ölen yük arabaları da ganimet oluşturur), 3 tur  |
| C2 | Cüce 20 + Yük Arabası 500 | Cüce 500 | **SAVUNAN** | 3 | Cüce −20, Yük −500 | — |savunan kazanır, saldıran 520 kaybeder, savunan 0 kaybeder, 3 tur  |
| **C3** | Cüce 100 + Yük Arabası 300 | Cüce 100 + Yük Arabası 300 | **SALDIRAN** | 5 | Cüce −63 | Cüce −63, Yük −150 |bazen savunan bazen saldıran kazanır. saldıranın kazandığı durumda: saldıran 62 kaybeder (hepsi cüce), savunan 212 kaybeder (62 cüce, 150 araba), 5 tur. Savunanın kazandığı durumda:  saldıran 212 kaybeder (62 cüce, 150 araba), savunan 62 kaybeder (hepsi cüce), 5 tur |
| D1 | Cüce 120 | Gnom 500 | **SALDIRAN** | 1 | — | — | *(satır 3: 4 gnom ölü ❌)* |
| D2 | Cüce 240 | Gnom 500 | **SALDIRAN** | 1 | — | — |saldıran kazanır, saldıran 0 kaybeder, savunan 32 kaybeder, 1 tur  |
| D3 | Cüce 120 | Gnom 50 | **SALDIRAN** | 1 | — | — | saldıran kazanır, saldıran 0 kaybeder, savunan 25 kaybeder, 1 tur |
| D4 | Gnom 500 | Cüce 120 | **SAVUNAN** | 1 | — | — |savunan kazanır, aldıran ve savunan 0 kaybeder, 1 tur, ganimet çıkmaz  |
| D5 | Cüce 120 + Gnom 100 | Cüce 120 | **SALDIRAN** | 5 | Cüce −75 | Cüce −75 |bazen saldıran bazen savunan kazanır, iki durumda da iki taraf ta 75 cüce kaybeder, 5 tur |
| E1 | Cüce 3000 | Okçu Kulesi 50 | **SALDIRAN** | 3 | — | Okçu Kulesi −10 |saldıran kazanır, saldıran 0 kaybeder, avunan 0 kaybeder (çünkü savunanda asker yok), 38-41 arası okçu kulesi kalır, 3 tur  |
| E2 | Cüce 3000 | Casus Kuş 1000 + Okçu Kulesi 50 | **SALDIRAN** | 3 | — | Okçu Kulesi −10 | *(satır 14: +1000 kuş ölü ❌)* |

## ✅ SONUÇ (2026-08-07, ölçüm geldikten sonra)

**13/13 satır oturdu.** Ayrı bir formül yokmuş — kuş yalnız **yanlış listedeymiş**.

### Bulunan kural

| Birim | Saldıranda | Savunanda |
|---|---|---|
| **Yük Arabası** | kaybedince orantısal gider | kaybedince orantısal gider |
| **Casus Kuş** | **hiç ölmez** | kaybedince **aynı orantısal kuralla** gider |
| **Gnom** | **hiç ölmez** *(D5 ölçümü)* | *(ölçülmedi — kuş/araba ailesiyle aynı varsayıldı)* |

Oran, motorda zaten var olan `frac = kaybedenKaybı / (kaybedenKaybı + kazananKaybı)`:
A2/A4/E2 → %100 · **A6 → %50** · A3 → ~%83 · A1 → %0 (savaş hiç olmadı).
A3'te motor 826, binary 825 kuş öldürüyor — fark 1, yuvarlama.

⭐ **Asimetrinin sebebi oyunun kendi kuralı:** kuş normal bir saldırıya zaten katılamıyor
(`mission.service.ts` yalnız casusluk · destek · şehir kurma). Saldıran tarafta kuş bulunması
ancak **simülatörde** mümkün ve binary orada kuşu etkisiz sayıyor — kullanıcının ifadesiyle
*"casus kuşlar saldırı durumunda etkisiz olmaları gerekir"*.

### Düzeltmeler
- `SETTLE_ON_LOSS` → yalnız `cargo_wagon` (gnom çıkarıldı, D5).
- Yeni `SETTLE_ON_LOSS_DEFENDER` = `spy_bird` + `gnome` — §4b'de yalnız kaybeden SAVUNANA eklenir.
- Bekçi testleri `packages/engine/test/reference.test.ts` (A1·A2·A5·A6·B2·C2·C3·D5).

### ⏳ TEK AÇIK KALAN: Tur 1'de savunan gnomu (D1·D2·D3)

| Ölçüm | Saldıran | Savunan gnom | Ölen |
|---|---|---|---|
| D1 | Cüce 120 | 500 | **4** |
| D2 | Cüce 240 | 500 | **32** |
| D3 | Cüce 120 | 50 | **25** |

Bunlar **1 turda** oluyor, yani vuruşma döngüsü hiç dönmeden → bir **Tur 1 mekanizması**.
Settle kuralı bunu açıklayamaz (kimse kayıp vermediği için `frac = 0`).

⚠️ Genel bir "Tur 1 hasar turu" da DEĞİL: satır 2'de (`Cüce 120 → Yük Arabası 500`) hiç yük
arabası ölmüyor, yani mekanizma **gnoma özel**.

**Ghidra izi (2026-08-07):** ana döngü `FUN_0040dcb4` → Tur 1 = **`FUN_0040e794`**. Bu fonksiyon
tuzak salvosundan (`(rand%25+75) × tuzak / 100`, sonda) **ÖNCE üç ayrı `FUN_0040e0c4` (hasar
çekirdeği) çağrısı** yapıyor; sonuçları `param_1+0x10` ve `+0x18`e yazıyor. Motorda karşılığı
`turn1GnomeSkirmish` — **yazılı ama `cfg.turn1GnomeSkirmish: false` ile kapalı** ve yönü
saldıran-gnomu → savunan (ölçüm ise tersini söylüyor: D4'te saldıranın 500 gnomu hiçbir şey
yapmıyor). Listeleri yürüten `FUN_00410f90` / `FUN_00411608` iterator'larının hangi birim
indeksine oturduğunu çözmek ayrı bir tur işi.

**Pratik etkisi düşük:** yalnız "savunmada YALNIZ gnom var" hâlinde ve 500 gnomun 4'ü
mertebesinde. Kapatmak istersen iki yol var — (a) ayrı bir Ghidra turu, (b) şu üç ölçüm:
`Cüce 480 → Gnom 500` · `Cüce 120 → Gnom 500 + Cüce 1` · `Cüce 120 → Gnom 500 + Yük 500`
(ilki ölçeklemeyi, ikincisi "gerçek savaş varken de oluyor mu"yu, üçüncüsü "yalnız gnom mu
hedef"i ayırır).

---

## Her blok neyi ayırt ediyor

- **A3 · A4** — savunanın savaşçısı tamamen kırılıyor. Kuşlar da gidiyor mu, yoksa kalan
  savaşçı sayısıyla mı orantılı?
- **A5 ⭐** — savunan **KAZANIYOR** ve kuşları var. Kuş kaybı "kaybeden taraf" kuralına mı
  bağlı, yoksa savaşa girmek yeterli mi? *Bu satır varsayımı tek başına çürütebilir.*
- **A6 ⭐⭐** — iki tarafta da kuş var, savaş 5 tur sürüyor ve **iki taraf da kısmen sağ
  kalıyor**. Kaybedenin kuşlarının hepsi mi gidiyor yoksa oranla mı? Kazananın kuşları duruyor
  mu? *En bilgilendirici tek satır.*
- **B1 · B2** — kuş **SALDIRANDA**. Kural taraf-bağımsız mı?
- **C1 · C2 · C3** — yük arabasında aynı sorular. C3 orantısallığı doğrudan ölçüyor
  (motor 300'ün 150'sini alıyor).
- **D2 · D3** — satır 3'teki "4 gnom" saldıran sayısıyla mı (D2: cüce iki katı) yoksa gnom
  havuzuyla mı (D3: gnom onda bir) ölçekleniyor? Sabitse mekanizma başka.
- **D4 · D5** — gnom saldıranda; D5'te gerçek bir 5 turluk savaş var.
- **E1 ⭐** — kulelerin kayıp sayısı kuşlardan **bağımsız** mı? E1 ile E2 aynı çıkarsa
  (motorda öyle) satır 14'teki tek fark kuşlar demektir.

⚠️ **Rastgelelik varsa aralık yaz** (satır 9'da yaptığın gibi: "63-85 arası"). Motorun
sayıları tek tohumla (`bin-<no>`) üretildi, seninkiler farklı tohumla düşebilir — önemli olan
**hangi birimin ölüp ölmediği**, tam sayı değil.

---

## Ölçüm için kısa şablon

Binary simülatörde her satır için yalnız şunlar lazım:

```
saldıran birimler → savunan birimler
kazanan = ?   tur sayısı = ?   saldıran kaybı = ?   savunan kaybı = ?
```

Sonuçları bana yaz; ayrışan satır olursa motoru ona göre düzeltirim ve
`packages/engine/test/combat.test.ts` içine kalıcı test olarak çakarım.
