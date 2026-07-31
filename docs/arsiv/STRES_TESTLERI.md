# MOBIWAR — MOTOR STRES TESTLERİ (karşılaştırma formu)

> Her senaryoyu binary simülatörde çalıştır ve `ORİJİNAL` sütununu doldur.
> Tuzak içeren senaryolarda RNG yüksek — birkaç kez dene, aralık yaz.
> Motor tahmini deterministik jitter (1.0) ile üretildi; ±%0.1 oynama normaldir.


---

## T1 — Tam karışık ordu · teknik 0 · yapısız

**GIRDI**

- **Saldiran:** `cuce:1200 elf:900 suvari:400 pegasus:150 ejderha:40 mancinik:120 ogre:60 saman:300 casus:50 yuk:400 gnom:200`
- Saldiran teknik: hepsi 0
- Saldiran Tapinak: 0 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:1500 elf:700 suvari:300 pegasus:200 ejderha:30 mancinik:150 ogre:80 saman:250 casus:40 yuk:500 gnom:150`
- Savunan teknik: hepsi 0
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | defender | defender |
| Tur | 5 | 5 |
| Saldiran kaybi | 1647 | 1742 |
| Savunan kaybi | 1388 | 1230 |
| Deneyim (XP) | 2437 | 1948 |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 1864829 | 1803777 |
| Enkaz yemek | 1711373 | 1660137 |
| Kalan saldiran | `cuce:656 elf:474 suvari:221 pegasus:77 ejderha:21 mancinik:60 ogre:32 saman:215 casus:24 yuk:193 gnom:200` | `cüce:617 elf:445 süvari: 204 pegasus:72 ejderha:20 mancınık:56 ogre:31 şaman:209 casus:50 yuk:174 gnom:200` |
| Kalan savunan | `cuce:909 elf:415 suvari:187 pegasus:118 ejderha:18 mancinik:88 ogre:48 saman:189 casus:40 yuk:500` | `cüce:983 elf:446 süvari:208 pegasus:129 ejderha:20 mancınık:96 ogre:53 şaman:195 casus:40 yük:500` |

---

## T2 — Tam karışık · ASİMETRİK teknik (sald 15 / sav 5)

**GIRDI**

- **Saldiran:** `cuce:1200 elf:900 suvari:400 pegasus:150 ejderha:40 mancinik:120 ogre:60 saman:300 yuk:400 gnom:200`
- Saldiran teknik: Okçuluk 15, Demircilik 15, Büyücülük 15, Zırh 15, Kimya 15, İçgüdü 15, Tılsım 15, Taş Ustalığı 15
- Saldiran Tapinak: 0 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:1500 elf:700 suvari:300 pegasus:200 ejderha:30 mancinik:150 ogre:80 saman:250 yuk:500 gnom:150`
- Savunan teknik: Okçuluk 5, Demircilik 5, Büyücülük 5, Zırh 5, Kimya 5, İçgüdü 5, Tılsım 5, Taş Ustalığı 5
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldiran kaybi | 521 | 521 |
| Savunan kaybi | 3798 | 3799 |
| Deneyim (XP) | 505 | 497 |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 2576654 | 2567262 |
| Enkaz yemek | 2396170 | 2390577 |
| Kalan saldiran | `cuce:988 elf:721 suvari:375 pegasus:125 ejderha:34 mancinik:97 ogre:52 saman:257 yuk:400 gnom:200` | `cüce:987 elf:720 süvari:375 pegasus:126 ejderha:34 mancınık:98 ogre:52 şaman:257 yük:400 gnom:200` |
| Kalan savunan | `yuk:62` | `yük:61` |

---

## T3 — Karışık + TAM savunma yapıları · eşit teknik 10

**GIRDI**

- **Saldiran:** `cuce:3000 elf:2000 suvari:800 pegasus:400 ejderha:100 mancinik:300 ogre:150 saman:600 yuk:800 gnom:400`
- Saldiran teknik: Okçuluk 10, Demircilik 10, Büyücülük 10, Zırh 10, Kimya 10, İçgüdü 10, Tılsım 10, Taş Ustalığı 10
- Saldiran Tapinak: 0 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:1500 elf:1200 suvari:400 pegasus:200 saman:400 gnom:300 okcu:200 tuzak:400 kazanci:150 mangonel:100 muhafiz:120 balista:80 sur:5 buyukalkani:3`
- Savunan teknik: Okçuluk 10, Demircilik 10, Büyücülük 10, Zırh 10, Kimya 10, İçgüdü 10, Tılsım 10, Taş Ustalığı 10
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | attacker |attacker  |
| Tur | 4 | 4 |
| Saldiran kaybi | 172 | 213 |
| Savunan kaybi | 3700 | 4000 |
| Deneyim (XP) | 104 | 90 |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 1720721 | 1121252 |
| Enkaz yemek | 2093534 | 1395467 |
| Kalan saldiran | `cuce:2914 elf:1948 suvari:800 pegasus:392 ejderha:99 mancinik:297 ogre:148 saman:580 yuk:800 gnom:400` | `cüce:2923 elf:1997 süvari:800 pegasus:394 ejderha:100 mancınık:293 ogre:149 şaman:589 yük:800 gnom:292` |
| Kalan savunan | `gnom:300 okcu:156 tuzak:312 kazanci:117 mangonel:78 muhafiz:94 balista:62 sur:4 buyukalkani:2` | `okçu kulesi:152-161 arası, tuzak:4-100 arası belirli sayılar, kazancı:114-121 arası, mangonel:76-81 arası, muhafız:92-97 arası, balista:61-65 arası, sur:%0.0, buyukalkani:%0.0` |

---

## T4 — SÜPER BİRİM · kaos + ejderha · teknik 15

**GIRDI**

- **Saldiran:** `kaos:3 ejderha:200 elf:1000 saman:400 yuk:300`
- Saldiran teknik: Okçuluk 15, Demircilik 15, Büyücülük 15, Zırh 15, Kimya 15, İçgüdü 15, Tılsım 15, Taş Ustalığı 15
- Saldiran Tapinak: 0 · mevcut kahraman sayisi: 0
- **Savunan:** `kaos:2 ejderha:250 cuce:2000 suvari:500 saman:600 yuk:400`
- Savunan teknik: Okçuluk 15, Demircilik 15, Büyücülük 15, Zırh 15, Kimya 15, İçgüdü 15, Tılsım 15, Taş Ustalığı 15
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | defender | defender |
| Tur | 5 | 5 |
| Saldiran kaybi | 1669 | 1653-1660 arası |
| Savunan kaybi | 2498 | 2488-2503 arası |
| Deneyim (XP) | 8604 | 8584-8682 arası |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 8430099 | 7952849 (değişken) |
| Enkaz yemek | 5775864 | 5312975 (değişken) |
| Kalan saldiran | `elf:21 ejderha:2 saman:79 yuk:132` | `elf:25-27, ejderha:3, şaman:83-85, yük:132-133, kaos:1` |
| Kalan savunan | `cuce:449 suvari:68 ejderha:50 saman:286 yuk:400 kaos:1` | `cüce:445-455, süvari:67-69, ejderha:50-51, şaman:287-289, yük:400, kaos:1` |

---

## T5 — GECE savaşı · gece görüş farkı (sald 0 / sav 12)

**GIRDI**

- **Saldiran:** `cuce:2000 elf:1500 suvari:600 pegasus:300 ejderha:60 saman:500 yuk:400`
- Saldiran teknik: Okçuluk 12, Demircilik 12, Büyücülük 12, Zırh 12, Kimya 12, İçgüdü 12, Tılsım 12, Taş Ustalığı 12
- Saldiran Tapinak: 0 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:1800 elf:1200 suvari:500 pegasus:250 ejderha:50 saman:450 yuk:350`
- Savunan teknik: Okçuluk 12, Demircilik 12, Büyücülük 12, Zırh 12, Kimya 12, İçgüdü 12, Tılsım 12, Taş Ustalığı 12
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0
- **GECE ACIK** — Gece Gorus: saldiran 0 / savunan 12

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | defender | defender |
| Tur | 5 | 5 |
| Saldiran kaybi | 2196 | 2061-2070 |
| Savunan kaybi | 1075 | 913-914 |
| Deneyim (XP) | 782 | 626-631 |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 1178004 | 1034402 |
| Enkaz yemek | 1168198 | 1043237 |
| Kalan saldiran | `cuce:1146 elf:926 suvari:376 pegasus:186 ejderha:37 saman:359 yuk:134` | `cüce:1203-1206 elf:966-968, süvari:392, pegasus:199, ejderha:40, şaman:367-368, yük:126` |
| Kalan savunan | `cuce:1290 elf:894 suvari:390 pegasus:199 ejderha:40 saman:362 yuk:350` | `cüce:1361-1363, elf:936-937, süvari:415, pegasus:207, ejderha:42-43, şaman:373,  yük:350` |

---

## T6 — ŞAMAN ağırlıklı savunma (kalkan testi) · teknik 8

**GIRDI**

- **Saldiran:** `cuce:2500 elf:2000 suvari:700 ejderha:80 mancinik:200 ogre:100 yuk:500`
- Saldiran teknik: Okçuluk 8, Demircilik 8, Büyücülük 8, Zırh 8, Kimya 8, İçgüdü 8, Tılsım 8, Taş Ustalığı 8
- Saldiran Tapinak: 0 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:800 elf:600 saman:2500 yuk:600`
- Savunan teknik: Okçuluk 8, Demircilik 8, Büyücülük 8, Zırh 8, Kimya 8, İçgüdü 8, Tılsım 8, Taş Ustalığı 8
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldiran kaybi | 0 | 0 |
| Savunan kaybi | 4500 | 4500 |
| Deneyim (XP) | 0 | 0 |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 1809000 | 1808996 |
| Enkaz yemek | 1905000 | 1904996 |
| Kalan saldiran | `cuce:2500 elf:2000 suvari:700 ejderha:80 mancinik:200 ogre:100 yuk:500` | `cüce:2500 elf:2000 süvari:700 ejderha:80 mancınık:200 ogre:100 yük:500` |
| Kalan savunan | `` | `` |

---

## T7 — KAHRAMAN (sald lvl5, toplam 5) · teknik 6

**GIRDI**

- **Saldiran:** `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- Saldiran teknik: Okçuluk 6, Demircilik 6, Büyücülük 6, Zırh 6, Kimya 6, İçgüdü 6, Tılsım 6, Taş Ustalığı 6
- Saldiran KAHRAMAN: seviye 5 — fizSald 2, fizSav 1, buyuSald 1, buyuSav 1 (toplam 5)
- Saldiran Tapinak: 8 · mevcut kahraman sayisi: 1
- **Savunan:** `cuce:2200 elf:1000 suvari:600 saman:350 yuk:350`
- Savunan teknik: Okçuluk 6, Demircilik 6, Büyücülük 6, Zırh 6, Kimya 6, İçgüdü 6, Tılsım 6, Taş Ustalığı 6
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | defender | defender |
| Tur | 5 | 5 |
| Saldiran kaybi | 2362 | 2238-2242 |
| Savunan kaybi | 1217 | 1394-1399 |
| Deneyim (XP) | 680 | 833-838 |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 595153 | 601656 |
| Enkaz yemek | 974397 | 990786 |
| Kalan saldiran | `cuce:976 elf:472 suvari:178 saman:199 yuk:113` | `cüce:1031-1034, elf:501-502, süvari:193, şaman:206, yük:126-127`   |
| Kalan savunan | `cuce:1638 elf:632 suvari:381 saman:282 yuk:350` | `cüce:1540-1542, elf:587-588, süvari:349-350, şaman:275, yük:350` |

---

## T8 — KAHRAMAN iki taraf (lvl8 top6 / lvl10 top7) + TAPINAK · teknik 12

**GIRDI**

- **Saldiran:** `cuce:3000 elf:2000 suvari:900 pegasus:300 ejderha:80 saman:700 yuk:600`
- Saldiran teknik: Okçuluk 12, Demircilik 12, Büyücülük 12, Zırh 12, Kimya 12, İçgüdü 12, Tılsım 12, Taş Ustalığı 12
- Saldiran KAHRAMAN: seviye 8 — fizSald 3, fizSav 2, buyuSald 1, buyuSav 0 (toplam 6)
- Saldiran Tapinak: 16 · mevcut kahraman sayisi: 1
- **Savunan:** `cuce:2800 elf:1800 suvari:800 pegasus:250 ejderha:70 saman:650 yuk:550`
- Savunan teknik: Okçuluk 12, Demircilik 12, Büyücülük 12, Zırh 12, Kimya 12, İçgüdü 12, Tılsım 12, Taş Ustalığı 12
- Savunan KAHRAMAN: seviye 10 — fizSald 2, fizSav 2, buyuSald 2, buyuSav 1 (toplam 7)
- Savunan Tapinak: 12 · mevcut kahraman sayisi: 1

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldiran kaybi | 1177 | 1017-1021 |
| Savunan kaybi | 5744 | 6736-6743 |
| Deneyim (XP) | 670 | 544-547 |
| Kahraman ihtimali | %0.1 |  %0.6|
| Enkaz altin | 2447406 | 2718437 |
| Enkaz yemek | 2479211 | 2770037 |
| Kalan saldiran | `cuce:2460 elf:1639 suvari:768 pegasus:261 ejderha:69 saman:606 yuk:600` | `cüce:2536-2538, elf:1685-1687, süvari:777-778, pegasus:271, ejderha:72, şaman:617, yük:600` |
| Kalan savunan | `cuce:423 elf:276 suvari:92 pegasus:28 ejderha:9 saman:256 yuk:92` | `şaman:108-112, yük:71` |

---

## T9 — YAPI ağırlıklı savunma + saldıranda gnom/mancınık · teknik 14

**GIRDI**

- **Saldiran:** `cuce:4000 elf:2500 suvari:1000 ejderha:120 mancinik:400 ogre:200 saman:800 gnom:600 yuk:700`
- Saldiran teknik: Okçuluk 14, Demircilik 14, Büyücülük 14, Zırh 14, Kimya 14, İçgüdü 14, Tılsım 14, Taş Ustalığı 14
- Saldiran Tapinak: 0 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:1000 elf:800 saman:300 gnom:500 okcu:300 tuzak:600 kazanci:250 mangonel:180 muhafiz:200 balista:120 sur:8 buyukalkani:5`
- Savunan teknik: Okçuluk 14, Demircilik 14, Büyücülük 14, Zırh 14, Kimya 14, İçgüdü 14, Tılsım 14, Taş Ustalığı 14
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 4 | 3 |
| Saldiran kaybi | 166 | 336-359 arasında sabit değerler |
| Savunan kaybi | 2100 | hep 2600 |
| Deneyim (XP) | 73 | 101-102 |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 1597637 | 775971 |
| Enkaz yemek | 1935656 | 873546 |
| Kalan saldiran | `cuce:3894 elf:2464 suvari:1000 ejderha:120 mancinik:400 ogre:198 saman:778 yuk:700 gnom:600` | `cüce:3906-3907, elf:2481-2500 arası, süvari:1000, ejderha:120, mancınık:381, ogre:199, şaman:784-787, yük:700, gnom:390` |
| Kalan savunan | `gnom:500 okcu:234 tuzak:468 kazanci:195 mangonel:140 muhafiz:156 balista:94 sur:6 buyukalkani:4` | `okçu kulesi:228-241, tuzak:6-150 arası değişen sabit değerler, kazancı:193-201, mangonel:137-145, muhafız:152-161, balista:92-97, sur:%0.0, büyükalkanı:%0.0` |

---

## T10 — KÜÇÜK ordular (yuvarlama/edge) · teknik 3

**GIRDI**

- **Saldiran:** `cuce:40 elf:25 suvari:10 saman:8 yuk:5`
- Saldiran teknik: Okçuluk 3, Demircilik 3, Büyücülük 3, Zırh 3, Kimya 3, İçgüdü 3, Tılsım 3, Taş Ustalığı 3
- Saldiran Tapinak: 0 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:35 elf:20 suvari:12 saman:6 yuk:4`
- Savunan teknik: Okçuluk 3, Demircilik 3, Büyücülük 3, Zırh 3, Kimya 3, İçgüdü 3, Tılsım 3, Taş Ustalığı 3
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldiran kaybi | 28 | 24 (net sayı) |
| Savunan kaybi | 33 | 28 (net sayı) |
| Deneyim (XP) | 17 | 16 |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 10037 | 8346 |
| Enkaz yemek | 16536 | 13971 |
| Kalan saldiran | `cuce:28 elf:15 suvari:6 saman:6 yuk:5` | `cüce:29 elf:16 süvari:7 şaman:7 yük:5` |
| Kalan savunan | `cuce:21 elf:11 suvari:6 saman:4 yuk:2` | `cüce:23 elf:12 süvari:7 şaman:5 yük:2` |

---

## T11 — YÜK/CASUS ağırlıklı (savaş-dışı settle) · teknik 7

**GIRDI**

- **Saldiran:** `cuce:1500 elf:800 saman:200 casus:300 yuk:3000 gnom:400`
- Saldiran teknik: Okçuluk 7, Demircilik 7, Büyücülük 7, Zırh 7, Kimya 7, İçgüdü 7, Tılsım 7, Taş Ustalığı 7
- Saldiran Tapinak: 0 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:1800 elf:900 saman:250 casus:200 yuk:2500 gnom:350`
- Savunan teknik: Okçuluk 7, Demircilik 7, Büyücülük 7, Zırh 7, Kimya 7, İçgüdü 7, Tılsım 7, Taş Ustalığı 7
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | attacker | defender |
| Tur | 5 | 5 |
| Saldiran kaybi | 197 | 4048-4052 |
| Savunan kaybi | 3603 | 275 |
| Deneyim (XP) | 61 | 89-90 |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 959093 | 1030057 |
| Enkaz yemek | 1036907 | 1138042 |
| Kalan saldiran | `cuce:1440 elf:681 saman:182 casus:300 yuk:3000 gnom:400` | `cüce:558-559, elf:260-261, şaman:116, casus kuş:300, yük:513-515, gnom:400` |
| Kalan savunan | `cuce:1279 elf:533 saman:196 casus:29 yuk:360` | `cüce:1790, elf:829, şaman:240, casus kuş:200, yük:2500, gnom:166` |

---

## T13a — KAHRAMAN İZOLASYON — lvl10 (toplam 10) VAR · teknik 10

**GIRDI**

- **Saldiran:** `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- Saldiran teknik: Okçuluk 10, Demircilik 10, Büyücülük 10, Zırh 10, Kimya 10, İçgüdü 10, Tılsım 10, Taş Ustalığı 10
- Saldiran KAHRAMAN: seviye 10 — fizSald 4, fizSav 3, buyuSald 2, buyuSav 1 (toplam 10)
- Saldiran Tapinak: 20 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- Savunan teknik: Okçuluk 10, Demircilik 10, Büyücülük 10, Zırh 10, Kimya 10, İçgüdü 10, Tılsım 10, Taş Ustalığı 10
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldiran kaybi | 1656 | 1394-1398 |
| Savunan kaybi | 2118 | 2713-2722 |
| Deneyim (XP) | 1000 | 724-728 |
| Kahraman ihtimali | %5.0 | kahramanlar 1 değerine göre %0.81, kahraman 0 ise &3.63 |
| Enkaz altin | 611974 | 668721 |
| Enkaz yemek | 1001161 | 1092066 |
| Kalan saldiran | `cuce:1248 elf:622 suvari:255 saman:219 yuk:300` | `cüce:1405-1408, elf:679-680, süveri:286, şaman:232, yük:300` |
| Kalan savunan | `cuce:1079 elf:545 suvari:217 saman:203 yuk:138` | `cüce:779-782, elf:378-379, süvari:139, şaman:177, yük:109` |

---

## T13b — KAHRAMAN İZOLASYON — aynı savaş, kahraman YOK (kontrol)

**GIRDI**

- **Saldiran:** `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- Saldiran teknik: Okçuluk 10, Demircilik 10, Büyücülük 10, Zırh 10, Kimya 10, İçgüdü 10, Tılsım 10, Taş Ustalığı 10
- Saldiran Tapinak: 20 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- Savunan teknik: Okçuluk 10, Demircilik 10, Büyücülük 10, Zırh 10, Kimya 10, İçgüdü 10, Tılsım 10, Taş Ustalığı 10
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | defender |  |
| Tur | 5 |  |
| Saldiran kaybi | 2014 |  |
| Savunan kaybi | 1818 |  |
| Deneyim (XP) | 1168 |  |
| Kahraman ihtimali | %0.0 |  |
| Enkaz altin | 619746 |  |
| Enkaz yemek | 1016850 |  |
| Kalan saldiran | `cuce:1135 elf:566 suvari:228 saman:209 yuk:148` |  |
| Kalan savunan | `cuce:1159 elf:578 suvari:234 saman:211 yuk:300` |  |

---

## T14a — KAHRAMAN İZOLASYON — lvl15 (toplam 12, dağıtılmamış 3) VAR · teknik 10

**GIRDI**

- **Saldiran:** `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- Saldiran teknik: Okçuluk 10, Demircilik 10, Büyücülük 10, Zırh 10, Kimya 10, İçgüdü 10, Tılsım 10, Taş Ustalığı 10
- Saldiran KAHRAMAN: seviye 15 — fizSald 5, fizSav 4, buyuSald 2, buyuSav 1 (toplam 12)
- Saldiran Tapinak: 20 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- Savunan teknik: Okçuluk 10, Demircilik 10, Büyücülük 10, Zırh 10, Kimya 10, İçgüdü 10, Tılsım 10, Taş Ustalığı 10
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | attacker | attacker |
| Tur | 5 | 5 |
| Saldiran kaybi | 253 | 1216-1120 |
| Savunan kaybi | 4264 | 3161-3170 |
| Deneyim (XP) | 94 | 580-582 |
| Kahraman ihtimali | %0.0 | saldıran kahramanlar sayısı 1 e göre %0.65 ; 0 a göre %2.91 |
| Enkaz altin | 762786 | 712221 |
| Enkaz yemek | 1191110 | 1160751 |
| Kalan saldiran | `cuce:1945 elf:1057 suvari:462 saman:283 yuk:300` | `cüce:1501-1504, elf:727-729, süvari:311-312, şaman:239, yük:300 |
| Kalan savunan | `saman:17 yuk:19` | `cüce:546-550, elf:257-259, süvari:85-86, şaman:153-154, yük:90-91` |

---

## T15a — KAHRAMAN İZOLASYON — lvl3 (toplam 3) VAR · teknik 10

**GIRDI**

- **Saldiran:** `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- Saldiran teknik: Okçuluk 10, Demircilik 10, Büyücülük 10, Zırh 10, Kimya 10, İçgüdü 10, Tılsım 10, Taş Ustalığı 10
- Saldiran KAHRAMAN: seviye 3 — fizSald 1, fizSav 1, buyuSald 1, buyuSav 0 (toplam 3)
- Saldiran Tapinak: 20 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:2000 elf:1200 suvari:500 saman:300 yuk:300`
- Savunan teknik: Okçuluk 10, Demircilik 10, Büyücülük 10, Zırh 10, Kimya 10, İçgüdü 10, Tılsım 10, Taş Ustalığı 10
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | defender | attacker |
| Tur | 5 | 5 |
| Saldiran kaybi | 2013 | 1686-1692 |
| Savunan kaybi | 1818 | 2129-2136 |
| Deneyim (XP) | 1169 | 1028-1032 |
| Kahraman ihtimali | %0.0 | %1.15 (çünkü saldıran kazandı) |
| Enkaz altin | 619681 | 620481 |
| Enkaz yemek | 1016738 | 1017771 |
| Kalan saldiran | `cuce:1136 elf:566 suvari:228 saman:209 yuk:148` | `cüce:1241-1243, elf:603-604, süvari:246-247, şaman:219, yük:300` |
| Kalan savunan | `cuce:1159 elf:578 suvari:234 saman:211 yuk:300` | `cüce:1086-1090, elf:526-528, süvari:208-209, şaman:206, yük:139-140` |

---

## T12 — DENGELİ büyük savaş (5 tur beklenir) · teknik 11 vs 13

**GIRDI**

- **Saldiran:** `cuce:5000 elf:3500 suvari:1200 pegasus:600 ejderha:150 mancinik:400 ogre:250 saman:1000 yuk:1000 gnom:500`
- Saldiran teknik: Okçuluk 11, Demircilik 11, Büyücülük 11, Zırh 11, Kimya 11, İçgüdü 11, Tılsım 11, Taş Ustalığı 11
- Saldiran Tapinak: 0 · mevcut kahraman sayisi: 0
- **Savunan:** `cuce:5200 elf:3300 suvari:1300 pegasus:550 ejderha:160 mancinik:380 ogre:270 saman:950 yuk:1100 gnom:450`
- Savunan teknik: Okçuluk 13, Demircilik 13, Büyücülük 13, Zırh 13, Kimya 13, İçgüdü 13, Tılsım 13, Taş Ustalığı 13
- Savunan Tapinak: 0 · mevcut kahraman sayisi: 0

| Olcum | MOTOR | ORIJINAL (doldur) |
|---|---|---|
| Kazanan | defender | defender |
| Tur | 5 | 5 |
| Saldiran kaybi | 9427 | 10309-10349 |
| Savunan kaybi | 5786 | 4922-4936 |
| Deneyim (XP) | 8052 | 6090-6129 |
| Kahraman ihtimali | %0.0 | %0.0 |
| Enkaz altin | 9120415 | 9090732 |
| Enkaz yemek | 8433742 | 8404902 |
| Kalan saldiran | `cuce:1285 elf:908 suvari:281 pegasus:134 ejderha:35 mancinik:94 ogre:60 saman:495 yuk:381 gnom:500` | `cüce:944-954, elf:651-660, süvari:186-190, pegasus:90-91, ejderha:25, mancınık:64-65, ogre:43, şaman:432-434, yük:320-322, gnom:500` |
| Kalan savunan | `cuce:2866 elf:1718 suvari:792 pegasus:302 ejderha:86 mancinik:201 ogre:154 saman:655 yuk:1100` | `cüce:3233-3241, elf:1941-1947, süvari:907-910, pegasus:343-344, ejderha:99, mancınık:231, ogre:175, şaman:693-694, yük:1100` |