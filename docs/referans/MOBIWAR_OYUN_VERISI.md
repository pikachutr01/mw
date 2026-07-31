# MOBIWAR — OYUN VERİSİ KATALOĞU (design + meta reference)

> Kaynak: `tekniklere_ve_yapilara_iliskin_on_bilgiler.txt` (resmi oyun-içi açıklamalar = OTORİTER tasarım
> verisi) + binary'den çıkarılan savaş statları (`mobiwar-engine.js` UNITS). Bu belge **rebuild'in katalog
> kaynağıdır** → `packages/engine/catalog/*.json`. Savaş sayısal statları için `mobiwar-engine.js`
> UNITS tablosu esastır; bu belge **ön-şart / hız / kapasite / Alan / teknik-etki / dünya kuralları** gibi
> DESIGN meta-verisini ekler (binary'de olmayan ama rebuild için şart).

---

## 🎯 KRİTİK ÇAPRAZ-DOĞRULAMA: "Alan" = train = unitPower

txt'deki her birimin **"Alan"** özelliği, binary'den çıkardığımız **`train` (unitPower)** değeriyle
**12/12 SAVAŞÇIDA BİREBİR** eşleşiyor → bağımsız kaynak doğrulaması:

| Birim | Alan (txt) | train (binary) | | Birim | Alan | train |
|---|---|---|---|---|---|---|
| Cüce | 9 | 9 ✓ | | Ogre | 666 | 666 ✓ |
| Elf | 12 | 12 ✓ | | Şaman | 18 | 18 ✓ |
| Süvari | 52 | 52 ✓ | | Casus Kuş | 1 | 1 ✓ |
| Pegasus | 80 | 80 ✓ | | Yük Arabası | 5000→**8** | 8 ✓* |
| Ejderha | 750 | 750 ✓ | | Gnom | 25 | 25 ✓ |
| Mancınık | 240 | 240 ✓ | | Kaos | 40000 | 40000 ✓ |

> *Yük Arabası: txt "Alan: 8" değil "Kapasite: 5000, Alan: 8" — Alan=8=train ✓ (kapasite ayrı alan).
> **Sonuç:** "Alan" = birimin savaş güç-havuzu ağırlığı (unitPower) = üretim/hesaplarda kullanılan boyut.

### 🔴 YAPI STATLARI OFF-BY-ONE — KESİN DOĞRULANDI (2026-07-23, binary 3 tablo) + KÖK NEDEN
Motorun TÜM savunma-yapısı statları **bir index kaymış**: binary'de yapılar **13-20** indeksinde ama motor
**12-20** satırında okuyor → her yapı BİR ÖNCEKİ slotun verisini almış. **3 bağımsız binary tablo decompile
edildi** (hepsi motor UNITS ile birebir → motor binary'yi doğru KOPYALAMIŞ; hata index→isim EŞLEMESİNDE):

| idx | train (sub_413f14) | altın (sub_414018) | yemek (sub_41411c) | = gerçek yapı (txt Alan/maliyet ile) |
|---|---|---|---|---|
| 12 | 140 | 6000 | 4000 | ❓ GİZEM (8 txt-yapısına uymaz; motor yanlışlıkla "okcu" demiş) |
| 13 | 24 | 300 | 450 | **Okçu Kulesi** (Alan 24 ✓) |
| 14 | 3 | 400 | 0 | **Tuzak** (Alan 3 ✓, maliyet 400/0 ✓ — kullanıcı hatırası) |
| 15 | 150 | 2400 | 3200 | **Kazancı** (Alan 150 ✓) |
| 16 | 257 | 1000 | 8000 | **Mangonel** (Alan 257 ✓) |
| 17 | 180 | 2400 | 2000 | **Muhafız** (Alan 180 ✓) |
| 18 | 900 | 20000 | 16000 | **Balista** (Alan 900 ✓) |
| 19 | 300 | 960 | 980 | **Sur** (seviye-bazlı; Alan 1000 special) |
| 20 | 400 | 8000 | 2000 | **Büyü Kalkanı** (seviye-bazlı) |

Motorun kendi `STRUCT_TYPE_ID`'si (mobiwar-engine.js:148) zaten okcu=13 diyor → iç çelişki (statı 12'den,
tekniği 13'ten okuyor). **Kullanıcının Tuzak 400/0 hatırası + txt Alan + binary = ÜÇLÜ doğrulama.**

**🎯 KÖK NEDEN — "çözülemeyen çekirdek bilmece" çözüldü:** DOĞRU eşlemede motorun **"muhafiz" satırı = gerçek
Mangonel** (pAtk **192**, mDef 3744), **"sur" satırı = gerçek Balista** (pAtk **480**, mDef 16640). Yani gerçek
Mangonel/Balista'nın YÜKSEK saldırı statları var — "mangonel 2000 elf'i siler ama okçu vuramaz" gizeminin
kaynağı buymuş. **STRUCT_FP/STRUCT_TANK empirik kalibrasyonları, kaymış (yanlış) base statları telafi eden
hack'lermiş.** Motoru dengelemekteki tüm zorluk buradan.

### DOĞRU YAPI STAT TABLOSU (motor satırları +1 kaydırılarak — uygulanacak)
Motor UNITS'te her yapı, mevcut BİR SONRAKİ satırın verisini almalı (idx12 düşer; tapınak savaşmaz):

| Yapı | hp | magicHp | pAtk | pDef | mAtk | mDef | altın | yemek | train | type | (motor kaynağı satır) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| okcu | 60 | 0 | 12 | 6 | 19 | 325 | 300 | 450 | 24 | 1 | (şu anki `tuzak`) |
| tuzak | 340 | 0 | 0 | 18 | 0 | 42 | 400 | 0 | 3 | 2 | (şu anki `kazanci`) |
| kazanci | 800 | 0 | 30 | 120 | 72 | 2418 | 2400 | 3200 | 150 | 2 | (şu anki `mangonel`) |
| mangonel | 700 | 0 | 192 | 96 | 120 | 3744 | 1000 | 8000 | 257 | 1 | (şu anki `muhafiz`) |
| muhafiz | 200 | 300 | 48 | 144 | 120 | 3172 | 2400 | 2000 | 180 | 2 | (şu anki `balista`) |
| balista | 2500 | 2500 | 480 | 240 | 600 | 16640 | 20000 | 16000 | 900 | 1 | (şu anki `sur`) |
| sur | 0 | 0 | 50 | 50 | 0 | 600 | 960 | 980 | 300 | 2 | (şu anki `buyukalkani`) |
| buyukalkani | 0 | 0 | 0 | 0 | 320 | 2000 | 8000 | 2000 | 400 | 3 | (şu anki `tapinak`) |

**AKSİYON (staged):** (1) TS porta ÖNCE 1:1 sadık geç (mevcut/kaymış değerlerle → regresyon-0 ispatı).
(2) Sonra bu doğru tabloyu uygula + yapı-combat'ını DOĞAL stat-formülüyle test et → STRUCT_FP/STRUCT_TANK
muhtemelen GEREKSİZ (kaldırılabilir). Re-verify: orig-sim C-grubu (DOGRULAMA_DURUMU.md) + kullanıcı yeni veri.
idx12 gizem-slotu ayrıca araştırılabilir (hero/kale/kullanılmayan?).

---

## SAVAŞÇILAR (12) — meta

| Birim | Hız | Kapasite | Alan | Ön-şart | Etkilendiği teknikler |
|---|---|---|---|---|---|
| Casus Kuş | 6000 | 0 | 1 | Baraka 3, Casusluk 1 | Casusluk |
| Cüce | 100 | 10 | 9 | Baraka 1, Demircilik 1 | Demircilik, Zırh, Tılsım |
| Ejderha | 160 | 300 | 750 | Baraka 10, Büyücülük 12 | İçgüdü, Zırh, Tılsım, Büyücülük |
| Elf | 120 | 4 | 12 | Baraka 3, Okçuluk 1 | Okçuluk, Zırh, Tılsım, Büyücülük |
| Gnom | 120 | 4 | 25 | Baraka 6, Demircilik 3 | Demircilik, Zırh, Tılsım |
| Kaos | 80 | 0 | 40000 | Baraka 15, Büyücülük 20 | İçgüdü, Büyücülük |
| Mancınık | 100 | 0 | 240 | Baraka 8, Kimya 5 | Zırh, Kimya |
| Ogre | 100 | 500 | 666 | Baraka 8, İçgüdü 6 | Demircilik, Zırh, Tılsım, İçgüdü |
| Pegasus | 160 | 40 | 80 | Baraka 7, Okçuluk 5 | Okçuluk, Zırh, Tılsım, Büyücülük |
| Süvari | 140 | 40 | 52 | Baraka 4, Demircilik 3 | Demircilik, Zırh, Tılsım |
| Şaman | 120 | 1 | 18 | Baraka 5, Büyücülük 4 | Zırh, Tılsım, Büyücülük |
| Yük Arabası | 140 | 5000 | 8 | Baraka 3, Haritacılık 1 | — |

**Özel:** Cüce → yeterli sayıda düşman mağarasını yıkar (sayı×demircilik tablosu: `images/cuce-magara.png`).
Elf → Casus Kuş'u vurabilmek için şehirde Elf **veya** Okçu Kulesi gerek. Gnom → tuzak bozar + yapı sabote
(mancınığa karşı). Şaman → iyileştirme + düşman Büyü Kalkanı'na karşı etkili (= şaman-kalkanı mekaniği).

## SAVUNMA YAPILARI (8) — meta

| Yapı | Alan | Ön-şart | Etkilendiği teknikler |
|---|---|---|---|
| Okçu Kulesi | 24 | Okçuluk 1, Sur 1 | Okçuluk, Taş Ustalığı |
| Tuzak | 3 | Sur 1 | Demircilik |
| Kazancı | 150 | Kale 3, Kimya 3, Sur 3 | Zırh, Tılsım, Kimya |
| Mangonel | 257 | Kale 5, Kimya 6, Sur 5 | Kimya, Taş Ustalığı |
| Muhafız | 180 | Kale 4, Demircilik 4, Zırh 3, Sur 4 | Demircilik, Zırh, Tılsım |
| Balista | 900 | Kale 6, Okçuluk 10, Sur 6 | Okçuluk, Taş Ustalığı |
| Sur | 1000 (sv1) | yok | Taş Ustalığı |
| Büyü Kalkanı | 1000 | Büyücülük 8, Sur 10 | Büyücülük |

**Roller:** Okçu Kulesi=uzak+mekanik; Kazancı=sur-üstü yakın (kızgın yağ); Mangonel=uzun menzil alan-hasar
(ordu uzaktayken); Muhafız=ok+kılıç (sadece kendi şehrini savunur); Balista=uçan-birim avcısı (Ejderha/
Pegasus/Kaos'a etkili); Sur=temel koruma (yıkılınca savaşçılar açığa çıkar, savaş sonrası tamir); Büyü
Kalkanı=düşman büyü-birimlerini zayıflatır (Şaman buna karşı etkili). Muhafız göreve gönderilemez.

## BİNALAR (9) — meta

| Bina | İşlev | Ön-şart |
|---|---|---|
| Kale | Ana yapı; **her seviye diğer yapılara +10 toplam seviye hakkı** verir | — |
| Maden | Saatlik altın üretimi (sv1-40 tablo — images) | — |
| Çiftlik | Saatlik yemek üretimi (sv1-40 tablo — images) | — |
| Baraka | Savaşçı eğitimi; seviye↑ → üretim hızı↑ | — |
| Akademi | Teknik geliştirme (krallık-geneli); seviye↑ → o akademideki teknik süresi↓ | Kale 2 |
| Mimar Okulu | Yapı/savunma yapım süresi↓ | — |
| Mağara | Savaşçı saklama (kapasite tablo: **50-100-200-400...** sv1-20; savunmaya katılmaz) | Mimar Okulu 1 |
| Tapınak | Kahraman yapısı; seviye↑ → kahraman-çıkma olasılığı↑ + dirilme süresi↓ | Kale 3, Mimar Okulu 3, Büyücülük 6 |
| Teleport | Boyut geçidi (anlık ordu transferi, kaynak taşınmaz, cooldown) | Kale 12, Mimar Okulu 12, Büyücülük 12 |

## TEKNİKLER (12) — etki + ön-şart (hepsi Akademi'de, krallık-geneli)

| Teknik | Etki | Ön-şart |
|---|---|---|
| Demircilik | Savaşçı silahları (saldırı↑) | Akademi 1 |
| Zırh | Ordu dayanıklılığı (savunma↑) | Akademi 1 |
| Okçuluk | Elf & Pegasus saldırı↑ (ok) | Akademi 2 |
| Casusluk | Rakip hakkında daha çok bilgi | Akademi 2 |
| Haritacılık | Ordu ulaşım süresi↓ | Akademi 3 |
| Kimya | Uzak-birim taşları/okları yanıcı (hasar↑) | Akademi 4, Demircilik 4 |
| Taş Ustalığı | Yapı inşası (savunma+gelişim) | Akademi 6, Demircilik 5 |
| Sömürgecilik | **Her 3 seviye = 1 yeni şehir** (toplam 5 şehir) | Akademi 7, Haritacılık 5 |
| Büyücülük | Şaman iyileştirme + büyü-birim kapasitesi↑ (büyü-dayanıklılık DEĞİL) | Akademi 8, Kimya 2 |
| Tılsım | Savaşçıları büyü-saldırısına karşı korur | Akademi 9, Büyücülük 3 |
| Gece Görüş | Gece (00:00-08:00) savaşta vuruş/savunma↑ | Akademi 10, Casusluk 12 |
| İçgüdü | Ejderha & Ogre (& Kaos) savaşçılık↑ | Akademi 10 |

> **Not:** Kahramanlar ve Tapınak tekniklerden ETKİLENMEZ (tech ölçeklemeye girmez). Gece = 00:00-08:00;
> Gece Görüş seviyesi iki tarafın gece etkisini belirler (savaş motorunda nightMult mekaniği).

## KAHRAMAN MEKANİĞİ
Üretilemez — sadece **büyük savaşların sonunda** çıkar (olasılık ∝ Tapınak seviyesi; motor: FUN_004103e8).
XP toplar → seviye atlar → fiziksel/büyü gücüne puan dağıtılır (kişiselleştirilebilir). Seviyesi orduyu da
güçlendirir (üstel: 1.8^lvl). Ön-şart: Tapınak 1, Büyücülük 5. Özellik: Hız 200, Kapasite 0, Alan 5.
XP→seviye tablosu sv1-80 (images). **Sv0 kahraman dirilme maliyeti: 3000 altın + 2000 yemek** (resimden).

## DÜNYA & KURALLAR (özet — prod planı için)
- **Dünya yapısı:** 10 kıta × 500 diyar × 10 şehir. Koordinat `kıta:diyar:şehir` (ör. 1:45:10).
  Dünyalar izole (transfer yok); bir oyuncunun çok dünyada hesabı olabilir.
- **Kaynak:** altın (Maden), yemek (Çiftlik) — saatlik üretim, seviyeye bağlı. Savaşta ganimet olarak da.
- **Tatil modu:** min 48 saat; içindeyken saldırılamaz ama üretim/ilerletme de olmaz; girmek için aktif
  üretim/ilerletme/ordu-hareketi olmamalı.
- **Şehir terk:** başkent terk edilemez; sonradan kurulan şehir ancak boş baraka + hareketsiz + üretimsizken.
- **İttifak:** isim 3-10 karakter; kurmak için ekstra paket; Konsey (lider+yetkililer) davet/çıkarma yetkili.
  Roller: Asker/Subay/Komutan/Başkomutan/Mareşal (oyuncu), Konsey/Lider (ittifak). (`k.java:1214`)
- **Kimlik:** kullanıcı adı 3-10 karakter, tek, değişmez; şifre 3-8 karakter.
- **Kale kuralı:** her Kale seviyesi diğer yapılara toplam +10 seviye hakkı.

## 🆕 GÜNCEL EKLENEN BİLGİLER (eski web sitesinden, 2026-07-23)

### Teknik etki oranları + etkilenen üniteler (resmi açıklama)
| Teknik | Etki | Oran | Etkilenen üniteler |
|---|---|---|---|
| Okçuluk | uzak vuruş gücü↑ | %5 | Elf, Pegasus, Okçu Kulesi, Balista |
| Demircilik | yakın vuruş gücü↑ | %5 | Cüce, Süvari, Ogre, Gnom, Tuzak, Muhafız |
| Haritacılık | tüm ünite hızı↑ | %5 | tümü |
| Büyücülük | büyü vuruş gücü↑ | %5 | Şaman, Pegasus, Ejderha, Kaos, Büyü Kalkanı |
| Zırh | fiziksel savunma↑ | %6 | Kaos hariç tüm savaşçılar |
| Kimya | vuruş gücü↑ | %5 | Mancınık, Kazancı, Mangonel |
| Taş Ustalığı | fiziksel savunma↑ | %6 | Okçu Kulesi, Mangonel, Balista, Sur |
| İçgüdü | vuruş gücü↑ | %5 | Ejderha, Ogre, Kaos |
| Tılsım | büyü savunma↑ | %5 | Mancınık hariç tüm üniteler |
| Gece Görüş | gece vuruş gücü↑ | logaritmik | tümü |

> **⚠️ DİSKREPANS (uzlaştırılacak):** Oranlar (%5/%6) motorun katsayılarıyla (kHP=0.05, kATK=0.06) UYUŞUR.
> AMA resmi açıklama tekniklerin ETKİLEDİĞİ STAT'ı motordan farklı söylüyor: ör. Okçuluk→"uzak SALDIRI"
> (motor: Elf/Pegasus HP'sine uyguluyor); Demircilik→"yakın SALDIRI" (motor: HP). Motorun teknik modeli
> binary'den B-grubu testiyle (saf cüce tek0-15) BİREBİR doğrulandı → **combat için motor otoriter**; resmi
> açıklama UI/tooltip metni için. Hangi stat'ın gerçekten değiştiği binary'de yeniden trace edilip
> uzlaştırılacak (motor HP-tekniği mi gerçekten saldırı mı?). Tılsım motorda kATK=0.06 ama resmi %5 — kontrol.

### Casusluk formülü (KESİN — kod için)
Gönderilen casus kuş sayısı 2^n → n seviye avantaj. Fark = (senin casusluk sv) − (hedef casusluk sv) + n.
Bilgi kademeleri (kümülatif): **Fark<0:** kaynak · **=0:** +Maden & Çiftlik sv · **=1:** +toplam savaşçı/savunma
sayısı · **=2:** +ünite TİPLERİ · **=3:** +savaşçı tek-tek sayıları · **=4:** +Teknikler, Kale/Sur/Büyü Kalkanı sv.

### Mağara (KESİN)
Her seviye: kapasite ×2, doldurma/boşaltma süresi −%10, dayanıklılık +%50. Sv1 yıkmak için ≥150 cüce
(demircilik↑ → gereken cüce↓; sv0 demircilik tablosu `images/cuce-magara.png`). Yıkılınca ordu şehre kaçar
(boşaltma süresi kadar), mağara 24 saatte onarılır (kısalmaz). Mağaradaki asker savunmaya katılmaz + casus
kuş göremez. Kapasite örüntüsü 50-100-200-400... (java'da da var).

### Puanlama & limitler (KESİN — kod için)
- **Puan:** harcanan her 1000 kaynak = +1 puan; savaşta kayıp = aynı oranda puan kaybı.
- **Saldırı limiti:** bir şehre 24 saatte en fazla 3 saldırı (premium'da bile değişmez).
- **Ordu hareket limiti:** bir şehirde aynı anda en fazla **baraka seviyesi** kadar görev (saldırı/nakliye/
  casusluk/destek/şehir-kurma). Baraka↑ → limit↑.
- **Sömürgecilik:** her 3 seviye +1 şehir; başkent + en fazla 4 = **toplam 5 şehir**.
- **Mimar Okulu:** her seviye yapı+savunma yapım süresi −%4.
- **Teleport:** her seviye cooldown −%2.
- **Şehir alanı:** her yapı 1 alan; her Kale seviyesi +10 alan. Yapılar asla yıkılmaz/düşmez, savaşta zarar görmez.
- **Savunma yenilenmesi:** savaş sonrası zarar gören savunma üniteleri %50-70 oranında yenilenir; Sur ayrıca tamir olur.

### Ekonomi iptal kuralları (KESİN)
- **Baraka üretim iptali:** devam eden 1 ünitenin kaynağı iade EDİLMEZ; kuyruktaki başlamamışların tümü iade.
- **Yapı yapım iptali:** o ana kadar harcanan kaynak iade edilmez (ör. %20 tamamlanmış 100/100 yapı → 80/80 iade).

### Kahraman çıkma (KESİN — 4 faktör)
(1) Tapınak sv (kendi şehri), (2) savaş büyüklüğü (büyük + güç-dengeli ordular↑; güç farkı açıldıkça↓),
(3) mevcut kahraman sayısı (her kahraman olasılığı↓), (4) max 5 kahraman. İlk çıktığı savaş XP kazandırmaz.
Tapınak her şehir için kendi şehrine etki eder (motor captureChance ile uyumlu: base=Tapınak×10−Kahraman×155).

## 💎 PREMIUM (Ekstra Paket) — temel kurulacak, maddeler sonra
İstemcide mevcut (g.java:643 satın-alma akışı + menü "Ekstra Paket Al / Aylık Sınırsız Kullanım / Üyelik
Bilgileri"). Premium avantajları (dokümantasyondan):
1. Günlük mesaj limiti 10 → 50. 2. İttifak kurma + konseye girme yetkisi. 3. Ölen kahramanı diriltme.
4. Mesaj kutusu filtreleme. 5. Gelişmiş genel-durum ekranı + fazla istatistik. 6. Günlük saldırı/nakliye
limiti sınırsız (ama bir şehre 24s'de max 3 saldırı DEĞİŞMEZ).
> **Karar (kullanıcı):** Şimdilik maddeleri tek tek EKLEME; **premium temelini** kur (oyuncuda `is_premium`
> bayrağı + yetki-kontrol noktaları). Madde 5 (gelişmiş genel-durum) muhtemelen java UI'de kodlu → onu
> **herkese açık** yapabiliriz (premium değil). Diğerleri yetki-kapısı arkasında ama uygulanabilir zeminde dursun.

## KAYNAK DOSYALAR (repo)
- `mobiwar-engine.js` UNITS — savaş sayısal statları (binary, esas).
- `mobiwar-savascilar.md`, `mobiwar-savunma-uniteleri.md` — birim lore/mekanik.
- `images/` — ekran görüntüleri (mobil/web/TV) → **tasarım/renk-paleti/yerleşim referansı** (birim
  maliyetleri ESKİ, kullanma); `cuce-magara.png` (mağara-yıkma tablosu); maden/çiftlik/mağara/XP tabloları.
- `prod_notlar.txt` — topluluk istek/kural fikirleri (doğrudan eklenmez; değerlendirilir).
- **EKSİK base veri:** yapı + akademi-teknik base maliyet/süre tabloları (sunucu ölü → yeniden türetilecek/
  dengelenecek). Savaşçı + savunma-birim maliyetleri binary'de VAR (`mobiwar-engine.js` gold/food).
