# KAHRAMAN KALİBRASYON TESTLERİ

> **📌 2026-07-26 — G/S/D/X turu TAMAMLANDI ve motora işlendi.** O verilerden çıkan model
> `MOBIWAR_SISTEM_PLANI.md` §13.11.4c'de. **Şimdi sıradaki tur: aşağıdaki [Y grubu](#y--yüksek-yetenek-turu-yeni--doldurulacak).**
> Bu turu doldurmadan kahraman dengesi kapanmıyor; sebebi Y grubunun başında yazılı.

> **Ortak:** Saldıran ordu = `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`, saldıran+savunan TEKNİK = hepsi 10, Tapınak(sald)=20,
> mevcut kahraman sayısı(sald)=1. Kahraman SALDIRANDA. Savunanda kahraman YOK, teknik 10.
> Her testi binary simülatörde çalıştır. **ÖNEMLİ:** "Kahramanlar" panelindeki savaş sonrası
> **DURUM %** değerini de yaz (kahraman ölürse "öldü"/%0). Tuzak yok, birkaç kez dene, aralık ver.
> `motor(mevcut)` = şu anki muhtemelen-yanlış modelin tahmini (referans, kıyas için).

## G — heroPower vs SEVİYE (yetenek=0, sadece seviye)

### H1 — lvl5  yetenek 0
- Kahraman: seviye 5, fizSald 0, fizSav 0, büyüSald 0, büyüSav 0 (toplam 0)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | defender | attacker |
| Tur | 5 | 5 |
| Saldıran kaybı | 2014 | 1741-1746 |
| Savunan kaybı | 1818 | 2072-2080 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 1168 | 1086-1092 |

### H2 — lvl10 yetenek 0
- Kahraman: seviye 10, fizSald 0, fizSav 0, büyüSald 0, büyüSav 0 (toplam 0)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | defender | attacker |
| Tur | 5 | 5 |
| Saldıran kaybı | 2014 | 1671-1677 |
| Savunan kaybı | 1818 | 2261-2268 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 1168 | 984-991 |

### H3 — lvl15 yetenek 0
- Kahraman: seviye 15, fizSald 0, fizSav 0, büyüSald 0, büyüSav 0 (toplam 0)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | defender | attacker |
| Tur | 5 | 5 |
| Saldıran kaybı | 2014 | 1556-1562 |
| Savunan kaybı | 1818 | 2580-2588 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 1168 | 846-850 |

## S — heroPower vs YETENEK TOPLAMI (seviye 15 sabit)

### S1 — lvl15 toplam 0
- Kahraman: seviye 15, fizSald 0, fizSav 0, büyüSald 0, büyüSav 0 (toplam 0)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | defender | attacker |
| Tur | 5 | 6 |
| Saldıran kaybı | 2014 | 1556-1562 |
| Savunan kaybı | 1818 | 2580-2588 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 1168 | 846-850 |

### S2 — lvl15 fizSald 6
- Kahraman: seviye 15, fizSald 6, fizSav 0, büyüSald 0, büyüSav 0 (toplam 6)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldıran kaybı | 597 | 1223-1230 |
| Savunan kaybı | 3431 | 3238-3246 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 243 | 578-582 |

### S3 — lvl15 fizSald 12
- Kahraman: seviye 15, fizSald 12, fizSav 0, büyüSald 0, büyüSav 0 (toplam 12)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldıran kaybı | 253 | 975-979 |
| Savunan kaybı | 4264 | 4011-4020 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 94 | 410-412 |

## D — YETENEK DAĞILIMI (seviye 10, toplam 10, tek statta)

### D1 — lvl10 fizSald 10
- Kahraman: seviye 10, fizSald 10, fizSav 0, büyüSald 0, büyüSav 0 (toplam 10)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldıran kaybı | 1656 | 1127-1131 |
| Savunan kaybı | 2118 | 3356-3365 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 1000 | 518-521 |

### D2 — lvl10 fizSav 10
- Kahraman: seviye 10, fizSald 0, fizSav 10, büyüSald 0, büyüSav 0 (toplam 10)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldıran kaybı | 1656 | 1497-1502 |
| Savunan kaybı | 2118 | 2353-2359 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 1000 | 846-850 |

### D3 — lvl10 büyüSald 10
- Kahraman: seviye 10, fizSald 0, fizSav 0, büyüSald 10, büyüSav 0 (toplam 10)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldıran kaybı | 1656 | 1672-1677 |
| Savunan kaybı | 2118 | 2261-2268 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 1000 | 987-990 |

### D4 — lvl10 büyüSav 10
- Kahraman: seviye 10, fizSald 0, fizSav 0, büyüSald 0, büyüSav 10 (toplam 10)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldıran kaybı | 1656 | 1671-1677 |
| Savunan kaybı | 2118 | 2261-2267 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 1000 | 987-992 |

## X — KAHRAMAN ÖLÜMÜ / DURUM% (aynı kahraman, artan düşman)

### X1 — düşman KÜÇÜK
- Kahraman: seviye 10, fizSald 4, fizSav 3, büyüSald 2, büyüSav 1 (toplam 10)
- Savunan ordu: `cuce:500 elf:300 saman:100`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 3 | 3 |
| Saldıran kaybı | 0 | 0 |
| Savunan kaybı | 900 | 900 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 0 | 0 |

### X2 — düşman EŞİT
- Kahraman: seviye 10, fizSald 4, fizSav 3, büyüSald 2, büyüSav 1 (toplam 10)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldıran kaybı | 1656 | 1393-1399 |
| Savunan kaybı | 2118 | 2711-2720 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %100.0 |
| Deneyim (XP) | 1000 | 725-729 |

### X3 — düşman BÜYÜK
- Kahraman: seviye 10, fizSald 4, fizSav 3, büyüSald 2, büyüSav 1 (toplam 10)
- Savunan ordu: `cuce:5000 elf:3000 suvari:1200 saman:700 yuk:500`

| Ölçüm | motor(mevcut) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | defender | defender |
| Tur | 4 | 4 |
| Saldıran kaybı | 4294 | 4291 |
| Savunan kaybı | 94 | 128-129 |
| **Kahraman DURUM %** (savaş sonrası) | ? (modellenmedi) | %0.0 |
| Deneyim (XP) | 27 | 43 |

---

# Y — YÜKSEK YETENEK TURU ✅ TAMAMLANDI (2026-07-26)

> **SONUÇ: tavan çürütüldü, model düzeltildi.** Bu tur bir ara vardığım "yetenek etkisi ÜSSEL"
> çıkarımının yanlış olduğunu gösterdi (o rakam yalnız 0-12 puanlık pencereden geliyordu).
> Doğru şekil **toplamsal ve puanda lineer**; ayrıca **tam puanlı kahraman gerçekten ordu
> ölçeğinde** çıktı → koyduğum %50 tavan kaldırıldı.
> Ayrıntı: `MOBIWAR_SISTEM_PLANI.md` §13.11.4c. Motor 17/17 kazanan, 16/17 tur tutturuyor.

> **Ortak kurulum yukarıdakiyle AYNI** (baştaki nota bak): saldıran ordu
> `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`, savunan ordu **aynısı**, iki tarafta da
> **tüm teknikler 10**, Tapınak(sald)=20, mevcut kahraman sayısı(sald)=1, kahraman SALDIRANDA,
> savunanda kahraman YOK, tuzak yok. **Yalnız kahramanın seviyesi ve yetenekleri değişiyor.**
> Her testi birkaç kez çalıştır, aralık ver. **DURUM %**'i yazmayı unutma.

## Bu tur neden gerekli?

Senin keşfin (**seviye başına 3 geliştirme puanı**) elimizdeki ölçümlerin **kapsadığı aralığı çok
aştığını** gösterdi:

- G/S/D/X turunda en yüksek denenen yetenek **12 puan**.
- Oysa seviye 15 kahramanın **45 puanı** var, seviye 20'nin **60 puanı**.
- O 12 puana kadarki veriden çıkan etki **üssel**: puan başına ≈ **×1,18**
  (lvl15'te ofans katkısı 0/6/12 puan için 17.500 → 40.000 → **125.000**).
- Bu eğriyi 45 puana uzatmak **×1.735** veriyor → tek kahraman koca orduyu gölgede bırakır.

Bu yüzden motora **geçici bir tavan** koydum: kahramanın katkısı kendi ordusunun gücünün en fazla
**%50'si** olabiliyor. **Bu tavan uydurma bir sayı** — bu turun tek amacı onu ölçümle değiştirmek.

### Ölçüm ne dedi? (soruların cevapları)
| Soru | Cevap |
| :-- | :-- |
| Artış 12 puandan sonra sürüyor mu? | **Sürüyor ama yavaşlayarak.** Puan başına ×1,244 → ×1,018. Üssel DEĞİL, lineer. |
| Tavan gerekli mi? | **HAYIR.** Tam puanlı kahraman gerçekten ordu ölçeğinde; tavan oyunun gerçeğini bozuyordu. |
| Savunan kaybı neden doydu? | Öldürülecek ordu bitti (4.276 / 4.300 birim), kahramanın gücü doymadı. |
| Fazla güç nereye gidiyor? | **Kendi kaybına**: 977 → 688 → 439 → 318. Ve savaş 5 turdan 4 tura iniyor. |
| Savunma kanadı? | fizSav de lineer (≈420/puan) ama **saldırıdan zayıf koruyor** (Y3 908 > Y1 688). |
| Büyü puanları? | **Ziyan.** Y4 (15'i büyüde) 758 > Y1 (hepsi saldırıda) 688. |

---

## Y1 — lvl15, fizSald 24 (bütçenin yarısı)
- Kahraman: **seviye 15**, fizSald **24**, fizSav 0, büyüSald 0, büyüSav 0 (toplam 24 / 45)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- **Sorusu:** 12 → 24 puan arasında üssel artış sürüyor mu?

| Ölçüm | motor(yeni model) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker |attacker |
| Tur | 5 |5 |
| Saldıran kaybı | 972 |687-690 |
| Savunan kaybı | 4241 |4254 |
| **Kahraman DURUM %** | %100.0 |%100.0 |
| Deneyim (XP) | 398 |273-274 |

## Y2 — lvl15, fizSald 45 (TAM bütçe, tek statta)
- Kahraman: **seviye 15**, fizSald **45**, fizSav 0, büyüSald 0, büyüSav 0 (toplam 45 / 45)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- **Sorusu:** en uç durum — tek kahraman savaşı tek başına çevirebiliyor mu? **Tavan gerekli mi?**

| Ölçüm | motor(yeni model) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker |attacker |
| Tur | 5 |4 |
| Saldıran kaybı | 971 |438-441 |
| Savunan kaybı | 4241 |4269 |
| **Kahraman DURUM %** | %100.0 |%100.0 |
| Deneyim (XP) | 398 |164 |

> ⚠️ Y2 ile Y1'in orijinal sayıları **birbirine yakınsa** oyun doyuyor demektir. **Çok
> farklıysa** (savunan kaybı belirgin artmışsa) üssellik sürüyor.

## Y3 — lvl15, fizSav 45 (TAM bütçe, savunmada)
- Kahraman: **seviye 15**, fizSald 0, fizSav **45**, büyüSald 0, büyüSav 0 (toplam 45 / 45)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- **Sorusu:** savunma kanadı da üssel mi? (D2'de 10 puan ordunun kaybını 1674→1499 indirmişti.)

| Ölçüm | motor(yeni model) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker |attacker |
| Tur | 5 |5 |
| Saldıran kaybı | 837 |906-911 |
| Savunan kaybı | 2990 |2927-2934 |
| **Kahraman DURUM %** | %100.0 |%100.0 |
| Deneyim (XP) | 376 |428-430 |

## Y4 — lvl15, DENGELİ dağıtım (gerçekçi referans)
- Kahraman: **seviye 15**, fizSald **15**, fizSav **15**, büyüSald **8**, büyüSav **7** (toplam 45 / 45)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- **Sorusu:** gerçek bir oyuncunun kuracağı kahraman. İki kanat birlikte çalışınca toplam etki
  toplamsal mı, çarpımsal mı? (Ayrıca büyü puanlarının gerçekten ölü olduğunu bir kez daha teyit eder.)

| Ölçüm | motor(yeni model) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker |attacker |
| Tur | 5 |5 |
| Saldıran kaybı | 823 |757-760 |
| Savunan kaybı | 4248 |4238 |
| **Kahraman DURUM %** | %100.0 |%100.0 |
| Deneyim (XP) | 331 |308-310 |

## Y5 — lvl20, fizSald 60 (üst uç)
- Kahraman: **seviye 20**, fizSald **60**, fizSav 0, büyüSald 0, büyüSav 0 (toplam 60 / 60)
- Savunan ordu: `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- **Sorusu:** seviye tavanında kahraman-ordu dengesi. Kahraman burada "ordu kadar" mı oluyor?

| Ölçüm | motor(yeni model) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | attacker |attacker |
| Tur | 5 |4 |
| Saldıran kaybı | 955 |317-319 |
| Savunan kaybı | 4241 |4276 |
| **Kahraman DURUM %** | %100.0 |%100.0 |
| Deneyim (XP) | 390 |116-117 |

---

## Y6 — (OPSİYONEL) kahraman ÖLÜMÜ yüksek yetenekte
Sadece vaktin varsa. X3 senaryosunun yüksek-yetenekli hâli: güçlü kahraman ezici düşman karşısında
hâlâ ölüyor mu, yoksa yetenekler onu ayakta tutuyor mu?
- Kahraman: **seviye 15**, fizSald **20**, fizSav **25** (toplam 45 / 45)
- Savunan ordu: `cuce:5000 elf:3000 suvari:1200 saman:700 yuk:500` ← **X3'ün büyük ordusu**

| Ölçüm | motor(yeni model) | ORİJİNAL (doldur) |
|---|---|---|
| Kazanan | ? |defender |
| Tur | ? |4 |
| Saldıran kaybı | ? |4265 (sadece 36 yük arabası hayatta kaldı) |
| Savunan kaybı | ? |561-563 |
| **Kahraman DURUM %** | ? |%0.0 |
| Deneyim (XP) | ? |217-218 |

---

## ✅ Dolduruken dikkat
1. **Bütçeyi aşan bir kahraman kurma** — simülatör muhtemelen izin verir (istemcide doğrulama YOK,
   binary'de kontrol etmedim) ama oyunda imkânsız olur, veriyi kirletir. Toplamlar: lvl15 → 45, lvl20 → 60.
2. **Aynı testi 3-5 kez çalıştır**, aralık yaz (ör. `971-978`). Jitter ±%0,1 ve tuzak/onarım
   rastgeleliği var.
3. **DURUM %** en kıymetli veri — kahramanın hayatta kalma modelini yalnız o kalibre ediyor.
4. Beklenmedik bir şey görürsen (tur sayısı değişti, kazanan döndü) **yaz** — model hatası oradan çıkar.
