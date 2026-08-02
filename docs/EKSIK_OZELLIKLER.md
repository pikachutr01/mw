# EKSİK ÖZELLİKLER ENVANTERİ — "orijinalde/planda var, bizde yok"

> **Tarama tarihi:** 2026-07-31 · **Kaynaklar:** `DecompiledSrc/src/g.java` (92 menü etiketi,
> satır 32) · `k.java` (299 girişlik katalog, 67 benzersiz `.do` ucu, satır 91) ·
> `teknik_ve_yapi_dokumantasyonu.md` (oyunun kendi el kitabı, 46 bölüm) ·
> `MOBIWAR_MIMARI_RAPOR.md` §2b · `MOBIWAR_SISTEM_PLANI.md` ·
> **`mw/` kodunda grep ile doğrulandı** (yanlış pozitif ayıklandı).
>
> **Sonuç (2026-07-31 taramasında):** 92 etiketten ~62'si karşılanmış, ~22'si karşılıksızdı.
> Aynı gün mesajlaşma · push · e-posta · arama girdi; sayılar aşağıdaki maddelerde güncel.
>
> ⭐ **`ARAYUZ_YOL_HARITASI.md` bu dosyaya katlandı** (2026-07-31): iki ayrı "kalan işler"
> listesi tutmak ikisini de bayatlatıyordu (arayüz listesinde §C/§D maddeleri yapılmışken
> hâlâ işaretsizdi). **Tek backlog burasıdır.** Bitmiş işlerin dökümü `git log`'ta.

---

## 1. 🔴 BÜYÜK — oyuncunun günlük akışında hissedeceği boşluklar

### 1.1 Oyuncular arası mesajlaşma — ✅ **YAPILDI (2026-07-31)**

> **Özel mesajlaşma (DM) tamam.** Java'nın ilkel posta kutusu yerine **sohbet uygulaması**
> mantığında kuruldu (kullanıcı tercihi): balonlar, WS ile anlık, masaüstünde sağ alt köşe
> penceresi / mobilde bottom sheet, aynı anda tek kişi. Lazy loading (30'ar mesaj, kaydırma
> korumalı) · tek taraflı sohbet silme (veri sunucuda kalır) · **tek yönlü engelleme + açık
> uyarı** · şikayet kaydı (`chat_reports`) · flood koruması (10 sn'de 5 mesaj, aynı metin
> 15 sn) · acemi kısıtı 12 saat (cevap hakkı saklı) · push zemini. Ayrıntı §13.12.
>
> **Kalan boşluklar (bu turda KAPSAM DIŞI, dürüstçe açık bırakılıyor):**
> - ~~Rapor satırlarında **Sil** ve **Hepsini Seç**~~ ✅ **2026-07-31'de yapıldı**: her satırda
>   kutucuk + üstte "Hepsini Seç" ve tek "Sil" düğmesi, onay diyaloğuyla. Tek uç
>   (`POST /messages/delete`) hem tek satırı hem toplu seçimi karşılıyor; sohbet satırları
>   kendi "yalnız bende sil" ucundan geçiyor
> - 3'lü filtre "Hepsini Göster" (bizde 2 sekme — bu kullanıcının bilinçli tercihi)
> - **Şikayet moderasyon paneli** — kayıt üretiliyor, inceleme ekranı sonraki tur
> - İttifak sohbeti ve Genel Sohbet (aynı `chat_*` altyapısı, ayrı tur)

Orijinalde bir mesaj satırının aksiyonları (`g.java:1813-1852`):

| Mesaj tipi | Aksiyonlar |
| :-- | :-- |
| 8/9 (İttifak Daveti / Başvurusu) | Göster · **Kabul · Red** ✅ bizde var |
| 6/7 (oyuncu mesajı) | Göster · **Cevapla · Blokla · Sil · Şikayet Et** ❌ hiçbiri yok |
| raporlar | Göster · **Sil** ❌ |
| hepsi | **Hepsini Seç** + 3'lü filtre (Sadece Mesajlar / Sadece Raporlar / **Hepsini Göster**) ⚠️ bizde 2 sekme |

Yeni mesaj yazma orijinalde oyuncu satırı menüsünden (`g.java:2037`, case 106): *Mesaj ·
Dünyada Bul · İttifağa Davet* — ✅ **üçü de artık var** (sıralama satırında Mesaj + Dünyada Bul,
davet ittifak yetkisi varsa). Orijinalin *"Mesaj gönderilecek. Emin misiniz!"* onayı
**bilerek kaldırıldı** (kullanıcı kararı: sohbette onay sorulmaz).

⚠️ Yukarıdaki tablo **orijinalin** aksiyon listesidir, bizim durumumuz değil: 6/7 satırındaki
Cevapla/Blokla/Şikayet ✅ sohbet penceresinde var; **eksik kalan yalnız rapor satırında Sil**
ve toplu seçim.

### 1.2 Web Push / FCM — ✅ **YAPILDI (2026-07-31)** · Faz 2 KAPANDI

> **Bildirim katmanı tamam** (§7.2b). Kullanıcının çekirdek şartı kodda: **WS bağlıyken push
> GİTMEZ**, sağ alttan kayan bir toast çıkar; WS kopukken işletim sistemi bildirimi düşer.
> Tek dallanma noktası `NotifyService.deliver()`, tek metin kaynağı `notify.catalog.ts`.
> Dört kategori (`attack`/`dm`/`report`/`production`), hepsi ayrı kapatılabilir, hepsi
> varsayılan açık. Ölü abonelik 404/410'da anında silinir. Toast masaüstünde sağ altta,
> mobilde alt barın üstünde; `z-50` ile modalın da üstünde.
>
> **Kalan boşluklar (kapsam dışı, dürüstçe açık):**
> - **Flutter/FCM token kaydı** — aynı `push_subscriptions` tablosuna girecek, uç hazır
> - **Bildirim geçmişi ekranı** yok (kaçırılan toast kalıcı kayıtta: rapor/mesaj kutusunda)
> - ⚠️ `ROLE=worker` ayrımında çevrimiçilik görülemez → o profilde WS açıkken de push gider
>   (açılışta uyarı basılıyor; dağıtım profili `ROLE=all`)

### 1.3 E-posta altyapısı — ✅ **YAPILDI (2026-07-31)**

> **Resend entegrasyonu tamam** (§9.2). Kayıt doğrulama + **şifre sıfırlama** + şifre
> değiştirme çalışıyor. SDK yok (tek `fetch`), gönderim **outbox** üzerinden (`mail:send`
> topic'i + konuya özel sink) → yeniden deneme bedava; `Idempotency-Key` = outbox satır id'si
> olduğu için tekrar denemede mükerrer mail gitmez. Doğrulama **yumuşak** (kullanıcı kararı):
> oyun kilitlenmez, şerit uyarır; doğrulama yalnız sıfırlama için şart.
> `forgot-password` **daima 204** (sayım sızdırmaz). Sıfırlama tüm oturumları düşürür.
> Anahtarsız ortamda `LogSender` gövdeyi konsola basar → akış posta kurmadan denenebilir.
>
> ⭐ **2026-08-01: doğrulama artık DİŞLİ** (§9.2b). Doğrulanmamış hesap saldıramaz, nakliye
> yapamaz, şehir kuramaz, savunma ünitesi üretemez, ittifağa giremez, mesaj yazamaz, şehir adı
> değiştiremez; yapı/teknik/Sur en fazla 3. seviye, en çok 200 savaşçı. Casusluk ve kendi
> şehirleri arasında destek serbest. Sınırlar **«≥»**: doğrulamayı sonradan kaybeden hesap
> elindekini KAYBETMEZ, yalnız ilerleyemez. Sayılar panelden ayarlanır (`verify` grubu).
>
> ⭐ **2026-08-01: hesap yönetimi tamamlandı** (§9.2c) — **hesap silme** (12 saatlik tek
> kullanımlık bağlantı + oturumsuz `/hesap-sil` sayfası; anonimleştirme, başkent kalır,
> diğer şehirler yıkılır, e-posta serbest kalır), **e-posta ADRESİ değiştirme** (parola şart,
> doğrulama düşer, eski adrese bilgi maili), **şifre değiştirme** artık aktif oturumu
> düşürmüyor + bilgilendirme maili gönderiyor. Ad sınırı 10 → **15**.
>
> **Kalan (kullanıcıya bağlı):** `RESEND_API_KEY` üretilip `mw/.env`'e yazılacak ve
> `send.scrabblecozucu.site` alt alanının DNS kayıtları hosting paneline eklenecek.
> **Kalan (kod):** gönderim günlüğü/panel yok.

### 1.4 Arama (Oyuncu Ara) + Dünyada Bul — ✅ **YAPILDI (2026-07-31)**

> **Arama sekmesi girdi** (§13.18). Komuta Merkezi'nde dördüncü sekme: **Oyuncu Ara**
> (ada göre **veya** koordinata göre — orijinalin iki kipi, `m.java:413-416`) ve
> **İttifak Ara**. Sonuç satırına tıklayınca **Dünya ekranının `TargetModal`'ı** açılıyor →
> Saldırı/Casusluk/Nakliye/Destek/Mesaj/Davet bedava geldi (orijinalde de arama sonucunun
> menüsü dünya satırının menüsüydü, `i.java:542`).
> **Dünyada Bul** (`grDny.do?o=`) orijinaldeki yerinde: **sıralama satırında** (`g.java:2040`),
> arama sonucunda değil — çünkü arama koordinatı zaten getiriyor. Yeni `/world/:k/:d` derin
> bağlantısı eklendi (geri tuşu çalışıyor, adres paylaşılabilir).
> Gizlilik: arama **yalnız BAŞKENT** verir (§13.16.5). Debounce 300 ms + en az 2 karakter.
> Yeni indeks `players_world_username_lower` (`text_pattern_ops`) — EXPLAIN testiyle
> gerçekten kullanıldığı doğrulandı.
>
> **Kalan:** infix arama (`%q%`) yok, önek eşleşmesi var (`pg_trgm` gerekirdi) ·
> `Alliance.tsx`'teki "Başvur" listesi kendi arama kutusunu koruyor (katılma akışının parçası).

### 1.5 Tatil modu — ✅ **BİTTİ** (2026-08-02, uçtan uca)
Göç `0035_vacation_mode.sql` · `apps/api/src/vacation/` (servis + controller + `vacation_end`
görevi) · 22 test (`test/vacation.test.ts`).

Biten: `GET/POST /api/v1/vacation{,/enter,/leave}` · **48 saat** alt sınır · **30 gün** üst sınır
ve otomatik çıkış · **3 gün** yeniden giriş beklemesi · ön-şart kontrolü (kuyruk + giden/gelen/
dönen ordu + ceza + bekleme) · **üretimin ve kaynak birikiminin durdurulması** · tatildeyken
sefer/kuyruk/mağara/diriltme kapalı (`on_vacation`, 403).

⭐ **Kanonik yüklem `vacation_until IS NOT NULL`** (zaman karşılaştırması DEĞİL) ve çıkışın tek
yolu `endVacation()`. İkisi birlikte "30 günlük kaynağın tek okumada bankalanması" hatasını
yapısal olarak imkânsız kılıyor — ayrıntı göç dosyasının başında.

Arayüz: Seçenekler'de `VacationPanel` (engel listesi · orijinalin onay metni · iki geri sayım) ·
bilgi çubuğunda mavi **Tatilde** rozeti (panele götürür) · ittifak sağ paneli ve tablosunda
çevrimiçilik YERİNE mavi **Tatilde** · yönetim panelinde «Tatili bitir» aksiyonu
(`vacation_until` elle düzenleme KALDIRILDI: çıpayı ortada bırakıp oyuncuya tüm tatil süresini
kaynak olarak veriyordu).

**Kalan:** yok. İleride premium'a alınmak istenirse tek anahtar: `vacation.premiumOnly`.

### 1.6 Şehir terk etme
`trShr.do?u=`, onay *"Şehri terk ediyorsunuz. Emin misiniz!"* (`g.java:613`). Doküman kuralları
(`:936-939`): binalar silinir, kaynaklar yok olur, **puanlar kaybedilir**, başkent terk edilemez,
barakada savaşçı olmamalı. Bizde hiç yok (`Placeholders.tsx:70` "yakında" listesinde).

### 1.7 Premium / üyelik — iki ayrı ürün
- `Ekstra Paket Al` → `uyYnl.do?o=2` · `Aylık Sınırsız Kullanım Al` → `uyYnl.do?o=1` ·
  `Üyelik Bilgileri` → `grUyi.do` (hepsi `g.java:2178-2188`).
- Dokümandaki tek açık premium hakkı: *"İttifak kurabilmeniz için ekstra paket aboneliğiniz
  olmalıdır"* (`:650`) — bizde **bilinçli uygulanmıyor**, `premiumOnly: false` bekliyor.
- `queue.service.ts:100` yorumu: *"kuyruk uzatma premium konusu"*.
- `players.is_premium` kolonu var, **hiçbir kod okumuyor**. Ürün kararı + ödeme akışı gerekiyor.

### 1.8 Admin paneli / moderasyon
✅ **BÜYÜK ÖLÇÜDE BİTTİ** (2026-07-31, admin Faz 0-6 — künye `docs/ADMIN_PANELI.md`).

Biten: ayrı `apps/admin` uygulaması · rol + adım yükseltme · dünya çarpanları ve manuel
sıralama · bakım modu (donma + perde + mutasyon kilidi) · oturum/cihaz yönetimi ·
**savaş motoru sabitleri** (38) · **katalog sabitleri** (26) · **şikayet kuyruğu** ·
⭐ **sohbet yasağı artık gerçekten işliyor** (`chat_bans` ölü bir tabloydu).

**Kalan:** veri tabanı tarayıcı + küratörlü aksiyonlar + ham kip (Faz 7) ·
bakım/performans ekranı ve temizlik görevleri (Faz 8) · `audit_log` görüntüleme ·
çoklu hesap **analizi** (toplama ✅ çalışıyor, skorlama/rapor ❌ — künyede sayı olarak
gösteriliyor ama §9.1.1 gereği otomatik karar üretmiyor).

---

## 2. 🟡 ORTA

| Konu | Kanıt | Durum |
| :-- | :-- | :-- |
| **Askerî unvanlar** | `k.java:1214-1245`: Asker/**Subay/Komutan/Başkomutan/Mareşal** (1-5) — ittifak rolünden (Konsey/Lider) AYRI alan. Verilme şartı istemcide YOK, sunucudaydı | Bizde yalnız 3 rol. Kullanıcı: *"savaşlardaki başarılarına göre veriliyordu, muhtemelen süreli"* → şart bilinmiyor; gösterim rozeti ucuz |
| **Yardım sayfası** | `grYrd.do`; içerik zaten `teknik_ve_yapi_dokumantasyonu.md`'de duruyor | `Placeholders.tsx:26-31` iki satır "yakında" |
| ~~**Şehir adı değiştirme**~~ | `dgSad.do?a=` (`g.java:1892`) | ✅ **yapıldı** (Tur B). ⚠️ Sınır 2026-08-01'de **15** karaktere çıktı; orijinalin 10'u hesap silmenin ürettiği `hükümdarN` adlarına yetmiyordu |
| ~~**Şifre değiştir / hatırlat**~~ | `dgSif.do?e=` · `gnSfr.do?d=` | ✅ **2026-07-31'de yapıldı** (§1.3) |
| **Mağara Raporu** | `g.java:32` a[37] "Maðara Rapor", ayrı ekran (`g.java:1666,1750`) | Mağara mekaniği ✅ tam, ayrı rapor mesajı ❌ |
| **Gelen Ordu ayrı paneli** | `g.java:1915` case 66 — ayrı ekran | Bizde tek listede (`Armies.tsx`) gelen/giden birlikte; ayrı panel yok |
| **Mesaj filtresi "Hepsini Göster"** | `g.java:1845-1848` 3'lü filtre | Bizde 2 sekme (Raporlar/Mesajlar) |
| **Birim/yapı detay modalı** | `grBil.do?t=` "Bilgi" | Tooltip var, detay modalı yok. `City.tsx:50` `Budget` bileşeni hiç çizilmiyor. Kale'nin bütçe çubuğu buraya girecek |
| ~~**Dahili simülatör ekranı**~~ | `POST /api/v1/simulate` ✅ çalışıyor | ✅ **2026-08-02'de tamamlandı**: `screens/Simulate.tsx` — sözleşmenin TAMAMI. Birim adetleri + **birim birim KALAN**, 8 savaş tekniği (Taş Ustalığı yalnız savunanda), taraf başına 0-5 kahraman (seviye + 4 yetenek + puan sayacı + savaş sonrası durum), tapınak toplamı ve mevcut kahraman sayısı, gece savaşı + gece görüşü, 1-50 tekrar. Sonuçta kazanan · süre · iki tarafın kaybı ve kalanı · savaş ganimeti · kahraman için deneyim · kahraman çıkma ihtimali · taşıma kapasitesi. Seed ekranda yok; cihaza kaydediliyor ve «Son savaşı yükle» ile aynı savaş birebir tekrar oynatılıyor. ⚠️ İlk sürüm (2026-08-01) yalnız adetleri soruyordu, kullanıcı haklı olarak eksik buldu |
| **i18n dosyaları** | `MOBIWAR_SISTEM_PLANI.md:1990` kuralı: *"metin asla koda gömülmez → i18n/tr.json"* | **Kural ihlal ediliyor** — tüm Türkçe metin JSX içinde |
| **Kuşatma bonusu** (Mancınık/Ogre → sur) | §13.5 Faz 3 | Kodlanmadı |
| **Gece savaşı over-kill artığı** | Faz 3 | ⚠️ **İddia BAYAT.** "%15" 2026-07-22 öncesinden; o gün gece'nin Büyü Canı'nı da azaltması eklenince S9/S10 orijinale ~%1'e oturmuştu. 2026-07-31'de mekanizma Ghidra ile **yapısal olarak** doğrulandı (`FUN_00412624` = Can + BüyüCan, başka hiçbir şey) ve bir sapma bulunup düzeltildi: **taşıma kapasitesi boşuna çarpılıyordu**. Kalan büyüklük sorusu kullanıcının ölçümünü bekliyor → `veri/gece-savasi-olcumleri.md` |
| ~~**Bildirim ayarları sayfası**~~ | — | ✅ **2026-07-31'de yapıldı**: Seçenekler → Bildirimler (izin düğmesi + 4 kategori anahtarı) |
| **Denge senaryoları** | Kullanıcı isteği | Yok |
| **Tek aktif sekme kuralı** | Kullanıcı isteği (WhatsApp gibi): başka sekmeden açınca uyarı | Yok. İki sekme aynı oyunu açık tutabiliyor |
| **Yardım sayfası içeriği** | `grYrd.do`; metin `referans/teknik_ve_yapi_dokumantasyonu.md`'de hazır | Modallardan çıkarılan açıklamalar (casusluk kademeleri, iade kuralları, sefer formülü) buraya toplanacak |

---

## 3. 🟢 KÜÇÜK

- **Beni Hatırla** onay kutusu (refresh token altyapısı ✅ var, UI yok)
- **Hepsini Seç** / toplu mesaj silme
- **Arkadaşına Tavsiye Et** (`arTvs.do`) — ⚠️ **bilinçli ertelendi**: çoklu hesap vektörü (§9.1)
- **Boyut Atlat** (`g.java:2085`) — anlamı çözülemedi, muhtemelen premium hızlandırma
- **Müzik** etiketi — `g.java`'da hiç kullanılmıyor, ölü
- **Dünya tablosu görev simgeleri** · **tooltip yaygınlaştırma** · **Ordular alt listesi**
- İttifaktan ayrılma sonrası 24 sa bekleme — `cooldownHoursAfterLeave: 0` düğmesi hazır, kapalı
- `prod_notlar.txt` fikirleri (bot şehirler · elçilik binası · nakliye 1M üst sınırı · 10 kat
  puan farkında saldırı yasağı) — **kullanıcı "doğrudan eklenmesine gerek yok" demişti**, karar bekliyor

---

## 4. ❌ ORİJİNALDE DE YOK — "eksik" sanılmasın

Grep ile doğrulandı: **ticaret/pazar · günlük görev · olaylar · hava durumu · sezon ·
fetih/işgal · başarım · müzayede · ittifak savaşı/diplomasi/forum** — ne oyunun dokümanında
ne `k.java` katalogunda karşılıkları var. Fetih yerine oyunun modeli **Şehir Kur + Şehir Terk Et**.

---

## 5. ✅ DOĞRULANDI: dokümandaki mekanikler çalışıyor

Üretim bandı & iptal iadesi · savunma ünitesi %50-70 onarımı · günde 3 saldırı · ordu limiti =
Baraka seviyesi · Sömürgecilik/3 → maks 5 şehir · akademi kilidi · teleport bekleme · Kale
bütçesi ×10 · mağara (kapasite/yıkma/onarım/taşıma/kaçış) · casusluk 2^fark kademeleri +
kesişim modeli · puan = harcanan/1000 · sıralama 3×/gün · ittifak (roller, davet/başvuru,
presence, sıralama) · savaş raporu detayı · kahraman yaşam döngüsü · sur onarımı + iade.

---

## 6. ⚠️ BELGE HATALARI (bu taramada bulundu)

1. `MOBIWAR_MIMARI_RAPOR.md:168` — *"Oyuncuyu Blokla ✅ eklendi (`player_blocks`), DM'yi etkiler"*
   **YANLIŞ**: yalnız tablo var; uç, servis, ekran yok — DM'nin kendisi de yok.
2. ~~`ARAYUZ_YOL_HARITASI.md` §C/§D maddeleri yapılmışken işaretsizdi~~ — dosya 2026-07-31'de
   bu belgeye katlandı; **iki ayrı backlog tutmak tam da bu bayatlamayı üretiyordu.**

---

## Önerilen sıra

1. ✅ ~~**DM/sohbet**~~ — **2026-07-31'de bitti** (§1.1). `gnMsj.do` · `msBlk.do` · `skMsj.do`
   karşılıkları girdi; `slMsj.do` (rapor silme) ve toplu seçim hâlâ açık.
2. ✅ ~~**Web push**~~ + ✅ ~~**E-posta (Resend)**~~ — ikisi de **2026-07-31'de bitti**
   (§1.2, §1.3). Faz 2 kapandı; şifre sıfırlama artık mümkün.
3. ✅ ~~**Arama + Dünyada Bul**~~ — **2026-07-31'de bitti** (§1.4)
4. ✅ ~~**Hesap/şehir aksiyonları paketi**~~ — ad · terk · şifre · e-posta değiştirme ·
   hesap silme (2026-08-01, §9.2c) + ⭐ ~~**TATİL MODU**~~ **2026-08-02'de uçtan uca bitti**
   (§1.5). **Paket tamamen kapandı.**
5. **Moderasyon minimumu** (şikayet + blokla, tablolar hazır) + basit admin görünümü
6. **Premium** — ürün kararı gerektiriyor
7. **Yardım + i18n**
8. **Askerî unvanlar (gösterim) · Mağara Raporu · birim detay modalı** — küçük, tatmin edici
