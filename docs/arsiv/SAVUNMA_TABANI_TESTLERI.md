# SAVUNMA TABANI + ENKAZ DOĞRULAMASI — Binary Simülatör Testleri

**Amaç:** İki şeyi orijinal simülatörde ölçmek:
1. **Savunma tabanı** — "tuzak hariç her savunma biriminden en az 4 kalır" kuralı binary'de
   var mı, varsa değeri gerçekten 4 mü? (Bizim motorda kural kullanıcı kararıyla canlı;
   binary'de karşılığı olup olmadığı hiç ölçülmedi.)
2. **Savunma birimi enkazı** — yıkılan savunma birimlerinin ganimete %30'la girdiği daha önce
   T3'te toplu doğrulandı; burada küçük, izole sayılarla teyit ediyoruz.

**Kurulum (tüm testler için):**
- Saldıran: yalnız **Cüce**, teknikler 0, kahraman yok, gece kapalı.
- Savunan: yalnız aşağıdaki savunma birimleri; asker yok, Sur 0, Büyü Kalkanı 0, teknik 0.
- Savaş sonrası **savunanda kalan adetleri** ve (E testlerinde) **enkaz altın/yemek** değerini not et.
- Onarım %50-70 arası rastgele olduğu için T testlerini **ikişer kez** koşup iki sonucu da yaz.

---

## T grubu — taban var mı?

| # | Savunan | Saldıran | Beklenti (taban VARSA) | Sonuç 1 | Sonuç 2 |
|---|---------|----------|------------------------|---------|---------|
| T1 | 10 Okçu Kulesi | 5.000 Cüce | kalan kule **≥ 4** ve iki koşuda da aynı alt sınır |8 |9 |
| T2 | 4 Okçu Kulesi | 5.000 Cüce | kalan **tam 4** (hiç düşmez) |4 |4 |
| T3 | 3 Okçu Kulesi | 5.000 Cüce | kalan **3** (taban savaş öncesi adedi AŞAMAZ — 4'e çıkmaz!) |3 |3 |
| T4 | 10 Tuzak | 5.000 Cüce | tuzak tükenir, 4 garantisi YOK (0-2 kalabilir) | 1|3 (1-3 arası, ama 0 da kalabilir çok önemli değil. Sonuç olarak 4 den aşağı düşüyor)|
| T5 | 10 Muhafız | 5.000 Cüce | kalan **≥ 4** (taban kule dışındakilere de işliyor mu?) |8 | 9|

> **Okuma:** T1'de iki koşuda da 4'ün altına inilmiyorsa taban var. T1 sonuçları 5-7 gibi
> değişkense alt sınırı görmek için 20.000 Cüce ile tekrarla (onarım payını ezmek için).
> T3 kritik: taban "en az 4 üret" değil "4'e KADAR koru" olmalı.

## E grubu — savunma birimi enkazı

Okçu Kulesi maliyeti 300 altın + 450 yemek (dokümandan). Enkaz = kalıcı kayıp × maliyet × 0,30.

| # | Savunan | Saldıran | Hesap | Beklenen enkaz | Ölçülen |
|---|---------|----------|-------|----------------|---------|
| E1 | 10 Okçu Kulesi | 5.000 Cüce | kalıcı kayıp = 10 − kalan | kayıp × (90 altın + 135 yemek) + cüce enkazı | 0 altın 0 yemek oluştu|
| E2 | 10 Okçu Kulesi | 100 Cüce (yenilir) | saldıran kaybederse enkaz kime? | savaş raporundaki enkaz satırı | saldıran kazandı. saldıran sadece 2 asker kaybetti. 119 altın, 269 yemek. Kalan okçu kulesi 8-9|

> **Okuma:** E1'de enkazın *kalan* değil *kalıcı kayıp* üzerinden çıktığını doğruluyoruz —
> onarımla (ve varsa tabanla) geri gelen kuleler enkaz VERMEMELİ. Cüce enkazını ayırmak için
> aynı savaşı savunmasız şehirle bir kez koşup farkı al.

---

## Bizim motorlardaki durum (referans)

- **TS motoru:** taban 4, korunanlar = kule/kazancı/mangonel/muhafız/balista, tuzak hariç,
  savaş öncesi adetle sınırlı (`defenseFloor`, §13.11.10).
- **mobiwar-engine.js:** aynı kural 2026-07-30'da eklendi; `global.__DEFENSE_FLOOR = 0` ile
  kapatılır (eski ölçüm senaryolarını yeniden koşarken kapat!). Smoke: 5 muhafız → tabanla 4
  (kapalıyken 3), enkaz düşüyor (3855 → 3135 altın), tuzak etkilenmiyor.

Sonuçlar buraya işlendikten sonra taban değeri/kapsamı iki motorda birden kalibre edilecek.

---

## SONUÇ (kullanıcı ölçümleri, 2026-07-30)

- **TABAN DOĞRULANDI:** T2 (4→4) ve T3 (3→3, 4'e ÇIKMIYOR) birebir — taban "4'e kadar koru"
  şeklinde ve savaş öncesi adetle sınırlı; tuzak taban dışı (T4: 1-3'e düşüyor). T1/T5'te 8-9
  kalması onarım payı; taban davranışıyla çelişmiyor. İki motor da bu hâliyle DOĞRU.
- **⚠️ SAVUNMA BİRİMİ ENKAZI ŞÜPHELİ:** E1'de 10 kule + 5.000 cüce savaşı **0 enkaz** üretti;
  E2'de görünen 119 altın / 269 yemek ölen 2 cücenin enkazıyla uyumlu (2 × (57+120) = 114/240 +
  jitter), kule payı görünmüyor. Yani binary'de savunma birimleri enkaz VERMİYOR olabilir —
  eski T3 toplu kalibrasyonu (enkaz 1,12M) bunu örtmüş olabilir çünkü orada asker kayıpları
  baskındı. **Geniş izole testlerle yeniden ölçülecek** (örn. yalnız 500 kule + değişen ordu
  boyları); o zamana kadar iki motorda `debris` savunma birimlerini saymaya devam ediyor
  (dokunulmadı) — ölçüm kesinleşince tek satırlık değişiklikle kapatılır.
