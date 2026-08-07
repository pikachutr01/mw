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

## Ölçüm için kısa şablon

Binary simülatörde her satır için yalnız şunlar lazım:

```
saldıran birimler → savunan birimler
kazanan = ?   tur sayısı = ?   saldıran kaybı = ?   savunan kaybı = ?
```

Sonuçları bana yaz; ayrışan satır olursa motoru ona göre düzeltirim ve
`packages/engine/test/combat.test.ts` içine kalıcı test olarak çakarım.
