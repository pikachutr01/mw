# CASUSLUK SİSTEMİ — RÖNTGEN

**Son değişiklik:** ⭐ 2026-08-11 — **casusluk artık hiçbir hâlde boşa gitmiyor**: tüm kuşlar
vurulsa bile rakibin **altın ve yemek** miktarı görülüyor (§0a).
Öncesi: 2026-08-09 — sistem **baştan sadeleştirildi** (kullanıcı: *"çok karışık ve çok
zor… daha basite indirgenmiş bir mantık kurmalıyız"*).

**Kaynak:** `packages/catalog/src/formulas.ts` (`spyEffectiveDiff`, `spyLevelFor`, `spyLosses`) ·
`packages/catalog/src/config.ts` (`SpyConfig`) · `apps/api/src/missions/mission.handlers.ts`
(`createSpyHandler`, `gatherIntel`) · `mission.service.ts` (`sendSpy`) · referans:
`docs/referans/tekniklere_ve_yapilara_iliskin_on_bilgiler.txt`

---

## 0. Model — dört satır

```
E  (etkin fark) = benimCasusluk + min(log2(kuş), 8) − rakipCasusluk
kademe          = tier(E)                              ← doküman tablosu

S  (savunma)    = kule×1,0 + rakipKuş×0,5 + elf×0,25
P  (kayıp tavanı)= 0,95 × S / (S + 40)
kayıpOranı      = P / (1 + 2^E)
ölen            = round(kuş × kayıpOranı)   ·   dönen = kuş − ölen
```

**Kademe kadar bilgi gelmesinin şartı: sağ dönen ≥ 1 kuş.** Sağ dönen yoksa kademe
`resources`e iner — **hiçbir hâlde sıfır bilgi yok** (§0a).

⚠️ **Savunma bilgiyi ENGELLEMEZ, vergilendirir.** Kademe yalnız `E`'den çıkar; kule/elf/kuş
sayısı yalnız kaç kuşun öleceğini belirler. Bu bilinçli bir karar (kullanıcı: *"yeterli kuş
gönderilip casusluk seviyesi farkı kapatılırsa gerekli bilgiler alınır"*).

---

## 0a. ⭐⭐ KASA TABANI — casusluk boşa gitmez (kullanıcı, 2026-08-11)

```
kademe = tier(E)                       ← farkın verdiği kademe
son    = dönen ≥ 1 ? kademe : 'resources'      ← spyLevelAfterLosses
```

> *"Tüm kuşlar öldürülse bile rakibin sadece altın ve yemek miktarı alınabilsin. Casusluk
> seviyesi çok düşük bir oyuncu yüksek olan birisine casusluk gönderince tek gönderdiği kuş
> ölse bile altın ve yemek bilgisini alabilir."*

⚠️ **KURAL DEĞİŞTİ.** Önceden `dönen === 0` casusluğu **tamamen** boşa çıkarıyordu: ne kademe
ne tek bir sayı, üstelik kuşlar da ölmüştü. Savunmanın ödülü artık bilgiyi **kesmek** değil,
en alt kademeye **indirmek** (+ kuş öldürmek).

- Kural **kademeden bağımsız** yazıldı (`spyLevelAfterLosses`, `formulas.ts`) — kullanıcının
  ikinci örneği *"casusluk seviyesi yüksek olsa bile savunmadaki birimler yüzünden tüm kuşları
  ölse bile"* bunu gerektiriyor.
- ⚠️ **Ama o ikinci örnek bugün ULAŞILAMAZ** (ölçüldü): `lossMax 0,95` ve `balancePoint 0` ile
  `E ≥ 0` olan bir casusun kuşlarının TAMAMI, savunma sonsuz olsa bile asla ölmüyor. Sınır
  bilinçli ve `spy.test.ts`te kilitli; `lossMax`/`balancePoint` oynarsa orada görünür.
- **Dönüş görevi kuralı değişmedi:** tüm kuşlar ölürse eve dönen olmaz.
- **Savunanın raporu da dürüst kaldı:** `leakedLevel` artık asla null değil — *"hiçbir bilgi
  sızmadı"* demek yalan olurdu. O cümle yalnız 2026-08-11 öncesi raporlarda görünüyor.
- ⚠️ Kasa **zaten en alt kademeydi** (`gatherIntel` `resources`ı koşulsuz dolduruyor); bu
  değişiklik yeni bir bilgi türü açmıyor, var olan en alt kademeyi **erişilemez olmaktan
  çıkarıyor**.

### Neden bu şekil

| Parça | Ne sağlıyor |
|---|---|
| `1/(1+2^E)` | `log2(kuş)` ile **aynı eksen** (taban 2): «+1 seviye» ile «kuşu ikiye katlamak» tek cetvelde okunur. `E` büyüdükçe kayıp hızla sıfıra iner |
| `S/(S+40)` doygunluğu | Savunma ne kadar büyürse büyüsün oran tavana **yaklaşır, çarpmaz** — *"pat diye vurmamalı"* |
| `S = 0 → P = 0` | Kule/elf/kuş yoksa **hiç kuş ölmez** (dokümanla uyumlu) |
| **`lossMax = 0,95 < 1`** | ⭐ Oran asla 1 olamaz → yeterince kuş gönderen **daima** en az bir kuşu geri getirir, yani **daima bir şey öğrenir**. *"Acemi, veteranın kaynak bilgisini alabilsin ama kuş kaybetsin"* şartı budur — ayrı bir kural yazılmadı, formülden çıkıyor |
| **Kuş tavanı +8 (256)** | ⭐ *"On binlerce kuş göndermek zorunda olmasınlar."* 256'nın üstü kademeye hiçbir şey **katmaz, yalnız ölür** → farkı kapatmanın tek yolu tekniği yükseltmek olur |

---

## 1. ⚠️ 2026-08-09'da KALDIRILAN model

Öncesinde **iki bağımsız hesap** vardı ve oyuncu ikisini ayırt edemiyordu:

1. **Duvar** — rakip kuş sayısı `2^fark` ile çarpılıp bir *engelleme kapasitesi* üretiyordu;
   gönderilen kuş bunu **doğrusal** aşmak zorundaydı.
2. **Kademe** — `seviye + log2(kuş)`, yani **logaritmik**.

Duvar aşılmadan kademe hiç kullanılmıyordu. Bedeli §5'teki vakada ölçüldü: bir oyuncu 8 denemede
**7.339 kuş** harcadı, hepsi sıfır bilgiyle döndü, duvarın 20.536 kuş olduğunu hiç öğrenemedi.

Kaldırılanlar: `spyInterception` · `SPY_CONSTANTS` · `blocked`/`infoBirds` kavramları ·
raporlardaki `birdsBlocked` alanı · «Casusluk engellendi» başlığı.

---

## 2. Görev yola çıkarken — kapılar

| Kapı | Kural |
|---|---|
| Birim | **Yalnız Casus Kuş** (`spy_needs_birds`) |
| Hedef | Kendi şehrin **olamaz** |
| Başlangıç koruması · Tatil modu · Ceza | Hedef bunlardan birindeyse **engel** |
| Ordu limiti | Şehir başına eşzamanlı görev ≤ Baraka seviyesi |
| **10 kat kuralı** | ⛔ **UYGULANMAZ** (yalnız saldırıda) |
| **Günlük limit** | ⛔ **YOK** (saldırıdaki «24 saatte 3» casuslukta yok) |
| Doğrulanmamış hesap | ⛔ **Serbest** |

⚠️ **Savunan, kuşlar yoldayken haberdar oluyor** (`city:incoming_spy`): kalkış koordinatı, varış
saati ve **kaç kuş geldiği**. Savunma dikmek için zamanı var — §5'teki vakada tam olarak bu oldu.

---

## 3. Kademe tablosu

| E | Kademe | Eklenen bilgi |
|---:|---|---|
| `< 0` | `resources` | **Altın ve yemek** |
| `0` | `economy` | + **Maden** ve **Çiftlik** seviyesi |
| `1` | `armyTotals` | + **toplam savaşçı** ve **toplam savunma ünitesi** |
| `2` | `armyTypes` | + birim **tipleri** · + **kahraman sayısı** |
| `3` | `armyCounts` | + tek tek **sayılar** · + kahramanların **adı, seviyesi, 4 yeteneği** |
| `≥ 4` | `full` | + **teknikler** · Kale · Sur · Büyü Kalkanı · ⭐ **Mağara** · ⭐ **Teleport** seviyesi |

**TAM bilgi için gereken kuş** (tavanın somut sonucu):

| Seviye farkı | Gereken kuş |
|---|---|
| Eşit | **16** |
| 2 geride | 64 |
| 4 geride | **256** |
| 5+ geride | ⛔ **ULAŞILAMAZ** — tekniği yükseltmek şart |

### ⛔ Casusluğun ASLA göremediği üç şey

1. **Mağaranın İÇİ** — yalnız *seviye* sızar, saklanan ordu değil.
2. **Seferdeki kahramanlar** — görevdeyken `heroes.city_id` NULL, sorgu onları hiç görmez.
3. **Ölü / dirilmekte olan kahramanlar** — yalnız `alive` sayılır.

⚠️ **Rakibin casusluk SEVİYESİ de sızmaz.** Rapor gövdesinde `diff` yok (2026-08-09'da
kaldırıldı): oyuncu kendi seviyesini ve gönderdiği kuşu bildiği için o sayıdan rakibin
seviyesini birebir çözerdi. Aynı gerekçeyle *"bir üst kademe için ≈N kuş"* ipucu da
**bilerek eklenmedi** (kullanıcı kararı).

⛔ **Rapor modalındaki formül ipucu 2026-08-11'de KALDIRILDI** (kullanıcı): *"Daha fazla bilgi
için daha çok casus kuş gönder ya da Casusluk tekniğini yükselt. Kuş sayısı ikinin kuvvetiyle
sayılır: 8 kuş = +3 seviye, 16 kuş = +4."* ⚠️ Geri eklenmesin — aynı sızıntı: formülü ekrana
yazmak `rakip = benim + log2(kuş) − fark` denklemini çözülebilir kılıyor, yani `diff`i
gövdeden çıkarmakla kapatılan kapıyı arayüzden yeniden açardı.

---

## 4. Kalibrasyon — motorla hesaplandı

**Ağır savunma: 100 okçu kulesi + 300 casus kuş** (kayıp tavanı %82)

| Kuş | Seviye | E | Kademe | Kayıp | Ölen/Dönen |
|--:|---|--:|---|--:|---|
| 32 | 5 vs 13 | −3,0 | kaynak | %73 | 23 / 9 |
| 64 | 5 vs 13 | −2,0 | kaynak | %66 | 42 / 22 |
| 256 | 5 vs 13 | 0,0 | +maden/çiftlik | %41 | 105 / 151 |
| 16 | 13 vs 13 | +4,0 | **TAM** | %5 | 1 / 15 |
| **1** | 17 vs 13 | +4,0 | **TAM** | %5 | **0 / 1** |

**Dev savunma: 100 kule + 500 kuş + 200 elf**

| Kuş | Seviye | E | Kademe | Kayıp | Ölen/Dönen |
|--:|---|--:|---|--:|---|
| **1** | 24 vs 20 | +4,0 | **TAM** | %5 | **0 / 1** |
| 16 | 20 vs 20 | +4,0 | **TAM** | %5 | 1 / 15 |
| 256 | 1 vs 20 | −11,0 | kaynak | %86 | 221 / 35 |

**Terk edilmiş hedef (yalnız 4 kule kalmış)**

| Kuş | Seviye | E | Kademe | Kayıp | Ölen/Dönen |
|--:|---|--:|---|--:|---|
| **1** | 20 vs 5 | +15,0 | **TAM** | %0 | **0 / 1** |
| 16 | 5 vs 5 | +4,0 | **TAM** | %1 | 0 / 16 |

⚠️ **Az kuş = daha yüksek kayıp ORANI** (ilk iki satır: 32 kuşta %73, 64 kuşta %66). Kullanıcının
açık şartıydı: az kuş küçük `E` demek, küçük `E` de savunmaya daha çok fırsat.

---

## 5. Sabitler panelden ayarlanabilir

Yedi sabit **Ayarlar → Casusluk** grubunda (`SpyConfig`, `packages/catalog/src/config.ts`):

| Ayar | Varsayılan | Not |
|---|--:|---|
| Kuş bonusu tavanı | 8 | 256 kuş; üstü boşa ölür |
| Kayıp tavanı | 0,95 | ⚠️ **1 YAPMA** — «daima bir şey öğrenilir» garantisi buna bağlı |
| Savunma doygunluğu | **40** | ⚠️ **KÜÇÜLTMEK sertleştirir.** 40 = «sert» (kullanıcı seçimi); 150 = ölçülü (tavan %82 → %59) |
| Kayıp eğrisi denge noktası | 0 | Büyütmek yüksek seviyeli casusa da kayıp verdirir |
| Kule / Savunan kuş / Elf ağırlığı | 1,0 / 0,5 / 0,25 | Maliyet-temelli: 750 / 300 / 1.100 kaynak; elf savaşçı olduğu için en düşük |

⚠️ Sabitler `CatalogConfig` içinde, çünkü panelden ayarlanmanın tek yolu bu. Varsayılan
değerlerde `catalogHash` **değişmiyor** (hash yalnız varsayılandan SAPMAYI kodluyor); bir sabit
panelden değiştirilirse hash değişir — istenen davranış.

---

## 6. VAKA (2026-08-09, ESKİ model) — 1:17:5 → 1:28:5

Bu vaka sadeleştirmenin gerekçesidir; **aşağıdaki sayılar kaldırılan modele aittir.**

**Kaos** (casusluk 22) → **cotanak28** (25), savunan şehirde 2.567 kuş + (sonradan) 100 kule.
8 deneme, 7.339 kuş, **8 kez sıfır bilgi**. Eski motorla sekizi de birebir yeniden üretilmişti:

| # | Saat | Kuş | Fark | Ölen | Engellenen | Bilgi |
|--:|---|--:|--:|--:|--:|--:|
| 1-4 | 11:27–14:42 | 560→1.163 | −0,87 → 4,18 | 0 | **hepsi** | 0 |
| 5-7 | 18:00–19:02 | 879 | 4,78 → 5,78 | 0 | **879** | 0 |
| 8 | 19:35 | 879 | 6,78 | **800** | 79 | 0 |

Sebep: `espK = 2^(25−22) = 8` → engel duvarı `2.567 × 8 = 20.536` kuş. En büyük akın duvarın
**%5,7**'siydi. 8. denemede savunan, 7. akını `city:incoming_spy` ile görüp 19:02'de 100 kule
dikmiş, 19:30'da bitmiş, 19:35'te 800 kuş ölmüştü.

### Aynı vaka YENİ modelde ne verirdi

| Deneme | E | Kademe | Kayıp | Ölen/Dönen |
|---|--:|---|--:|---|
| 8. deneme (879 kuş, 22 vs 25) | +6,78 (tavan yok) | **TAM** | ~%1 | ~9 / 870 |

Yeni modelde Kaos ilk denemesinde bilgiyi alırdı: `E = 22 + min(log2(879), 8) − 25 = +5`.
Duvar yok, savunma yalnız birkaç kuş düşürürdü.

---

## 7. Denge notu

⚠️ Bu dünyadaki kuş stokları **organik değil**: `audit_log`'a göre 09.08 00:52'de bir **toplu
birim verme** 36 şehre yazmış. cotanak28'in dört şehrinde ~11.900 kuş var, ama tüm oyun boyunca
**ürettiği kuş 28 tane**. Yeni sabitlerin gerçek dengesi, kuş stokları üretim maliyetiyle
sınırlıyken tekrar ölçülmeli.
