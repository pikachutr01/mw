# TOPLU İŞ LİSTESİ — 2026-08-21 keşif raporu

Kullanıcının tek seferde verdiği 21 maddenin **kod tarafındaki karşılığı**. Bu belge
uygulamadan ÖNCE yazıldı: her madde için «bugün ne var · nereye dokunulacak · öneri · açık
soru» dörtlüsü. Uygulanan madde `✅` ile işaretlenir, gerekçesi koda/commit'e taşınır.

⚠️ Belge **planlama** içindir. Kalıcı mimari kararlar `MOBIWAR_SISTEM_PLANI.md`'ye, oyuncuya
görünen değişiklikler değişiklik günlüğüne yazılır.

## ✅ KULLANICI KARARLARI (2026-08-21)

| Konu | Karar |
| :-- | :-- |
| Başlangıç kümesi | **Hızlı mobil düzeltmeler** (F1 · F2 · F3) |
| Yük arabası ayarı | **Varsayılan AÇIK** (araba orduyu yavaşlatmaz) · yalnız `cargo_wagon`, **gnom hariç** |
| Web mobil şehir sayfası | Uygulamadaki şehir görünümü gibi: **daha büyük gösterim, ekrana tam sığan ögeler** |
| Zebra tonu | `#EADBBE` bir tık **açıldı** → `#EDE0C6` (ayrım 1,235 → 1,181) |
| Navbar altın/yemek taşması | **Sığmazsa yazı küçülsün** — tam sayı her zaman görünür (F1-a) |
| Zebra deseni kapsamı | **Web ve mobil birlikte** — token kaynaktan koyulaşır, tek kaynak korunur |
| Tatil modu ölçütü | **Onaylandı**: bina + 2×teknik + 10×(şehir−1); ordu ve kaynak formüle GİRMEZ |

**Hâlâ cevap bekleyen tek soru:** A6 — `T0` ve `g` sayıları (önerim 60 ve 1,6).

⚠️ H1 artık soru DEĞİL: kullanıcı 2026-08-21'de sohbet kural metnini yazmayı devretti
(*"Sohbet uyarı metinlerini sen oluştur şimdilik, ben gerekli görürsem değiştirtirim"*).

---

# 🔴 KALAN İŞLER — BURADAN DEVAM ET

> Bu bölüm **bağlam sıfırlansa bile** tek başına yeterli olacak şekilde yazıldı. Her satırda
> işin nerede yaşadığı ve ilk bakılacak dosya var; ayrıntılı keşif notları aşağıdaki A-H
> bölümlerinde duruyor.

| # | İş | İlk bakılacak yer | Durum / not |
| :-- | :-- | :-- | :-- |
| **+ Yardım** | Mobil `/help` ekranı — **kuyrukta yoktu, tur 9'da bulundu** | web `apps/web/src/screens/Help.tsx` (417 satır) | «Daha» menüsünün dört maddesinden biri ve **hâlâ yer tutucu**. İçerik %100 statik: 9 konu, 40 madde, ~550 kelime, hepsi `Help.tsx`in İÇİNDE. ⭐ Doğru yol metni kopyalamak değil, `TOPICS`i `apps/web/src/lib/`e taşıyıp `facts.g.dart` üretecine bağlamak (üreteç zaten `info-texts.ts`i okuyor). ⚠️ `/help/sefer` ayrı bir iş: tamamen dinamik bir sefer hesaplayıcı. **Sıradaki iş bu.** |
| **F4** | Mobil genel/ittifak sohbeti görünümü | `apps/mobile/lib/features/chat/{global,alliance}_chat_sheet.dart` | Yalnız **görsel**: baloncuk, hizalama, gönderen ayrımı, zaman damgası, boş durum. ⚠️ Oyuncunun yazdığı metinde Cinzel YASAK. |
| **G1** | Web mobil görünümde Şehir sayfası | `apps/web/src/screens/City.tsx` (1138 satır) | Kullanıcı kararı: **uygulamadaki şehir görünümü gibi** olacak, *"daha büyük gösterim ve ekrana tam sığan ögeler"*. |
| **H1** | DM + ittifak sohbetinde kural onayı | `apps/api/src/chat/` · şema `chat_participants` | Tasarım aşağıda (H1). Kural **metnini ben yazacağım** (kullanıcı 2026-08-21 devretti). DM onayı kanal başına (`chat_participants`e yeni kolon), ittifak onayı oyun başına (`players`), ikisi de **sürümlü**. |
| **A6** | Tatil modu hak kazanma eşiği | `apps/api/src/vacation/vacation.service.ts` | Mekanik ONAYLI: `P = Σbina + 2×Σteknik + 10×(şehir−1)`, eşik `T(n) = T0 × g^n`, yeni kolon `players.vacation_count`. E-posta doğrulaması pazarlıksız şart. **Açık soru:** `T0` ve `g` (önerim 60 ve 1,6). |
| **+** | Doğrulanmamış e-postada mobil kısıtları | `apps/api/src/auth/unverified.ts` · mobil ekranlar | Sunucu zaten kapıyı tutuyor (`assertVerified`); iş, mobilde **web'dekiyle aynı görsel kısıtların** olup olmadığını denetlemek. Yoksa eklenecek. |

**Sıra önerisi:** Yardım → F4 → G1 → H1 → A6. Gerekçe: önce sunucusu hazır olup yalnız
arayüz isteyenler, sonra yeni altyapı isteyenler, en sonda tasarım kararı ağır basanlar.

---

## ✅ TAMAMLANANLAR

| Madde | Tur |
| :-- | :-- |
| F1 · F2 · F3 (hızlı mobil düzeltmeler) | 1 |
| B1 (ordu dönüşünde Tapınak/Baraka tazeleme) | 2 |
| A3 (son üye lider ayrılamaz, dağıtmalı) | 2 |
| A4 · A5 (davet + 5 şehir doğrulaması) | 2 |
| F5 · F6 · F7 · F8 · F9 (ara turda gelen mobil düzeltmeler) | 2 |
| A1 (savaştan çıkan kahraman dönüş kafilesine biniyor) | 3 |
| A2 (yük arabası: saldırı kapısı + hız muafiyeti + admin ayarı) | 3 |
| A2 düzeltmesi: saldırı kapısından **gnom çıkarıldı** | 4 |
| Mobil ittifak daveti (dünya künyesinden) | 4 |
| Değişiklik günlüğü maddeleri üretim veritabanına yazıldı (**taslak**) | 4 |
| E4 (dünya çarpanı rozeti) · E5 (uzun bas → saatlik üretim) | 5 |
| Kahraman diriltme sheet'i (web + mobil) | 5 |
| E3 (mobil Seçenekler: Cihazlar · Şehir yönetimi · Hesabı sil) | 6 |
| C (dünya satırında görev ikonları) · D (rapordan sefer düğmeleri) | 7 |
| **B2** (toast/notify) · C'nin satır taşması düzeltmesi | 8 |
| **E1** (mobil simülatör + «Simülatöre aktar») | 9 |
| **E2** (mobil destek: misafir + oturumlu) | 10 |

### C ve D nasıl çözüldü (tur 7)

**İkisi tek bir fikirle çözüldü: `?m=`.** Plan D için *"sefer formunu koordinattan açabilen
bir giriş noktası"* öneriyordu. Uygulanan yol farklı ve daha ucuz: rapor formu **kendi
açmıyor**, Dünya ekranına `/world/:k/:d?s=<slot>&m=<tür>` ile gidiyor.

Gerekçe iki tane:

1. Adres zaten vardı. Raporlardaki *«Dünyada göster»* bağlantısı 2026-08-19'dan beri
   `?s=` taşıyor; `&m=` onun yanına eklenen tek bir parametre. Yeni bir giriş noktası,
   slot çözümünün ikinci bir kopyası olurdu.
2. **Rapor tarihsel bir kayıt.** Koordinatın sahibi o günden beri değişmiş olabilir.
   Dünya'ya uğramak hedefi taze listeden çözüyor; oyuncu kime saldırdığını görüyor ve form
   doğru veriyle açılıyor. Rapordaki dondurulmuş `owner` alanından slot uydurmak yanılırdı.

**Asıl ince karar — düğmenin hedefi her zaman `target` DEĞİL:**

| rapor | side | düşman uç |
| :-- | :-- | :-- |
| Saldırı Raporu | `attacker` | `target` |
| Şehir Savunma Raporu | `defender` | **`origin`** |
| Casusluk Raporu | `spy` | `target` |
| Casusluk Önleme | `target` | **`origin`** |

Yani savunma raporlarındaki düğme **karşı saldırı** açıyor. Hep `target`a bakan bir kod
saldırı raporunda doğru çalışır, savunma raporunda oyuncuya kendi şehrine saldırma düğmesi
sunardı — ekranda hiçbir şey kırılmadan. Kural iki istemcide de saf ve testli
(`lib/report-target.ts` · `message_rules.dart` · `reportEnemyCoord`).

**C'nin ince kararı da aynı türden:** hareketin "karşı ucu" yöne bağlı
(`out` → `target`, `in`/`own` → `origin`). Hep `target`a bakılsaydı **gelen** saldırının
simgesi saldırganın satırına değil oyuncunun kendi satırına düşerdi. Sunucuya dokunulmadı:
`Movement` iki ucu, yönü ve `cityId`yi zaten taşıyor. Sığmayan simgeler sessizce düşüyor
(kullanıcının şartı) ve kalanlar **en yakın varış** olanlar.

⚠️ Mobilde iki widget bu yüzden **durumlu** oldu (`_ListState`, `_OptionsState`): rapordan
gelen form **bir kez** açılmalı. Durumsuz bir widget'ta her yeniden çizim formu geri açar ve
oyuncu kapatamaz. Web'de aynı işi `useRef` yapıyor, vurgunun (`flash`) disipliniyle aynı.

### E1 — mobil simülatör (tur 9)

**⭐ Kullanıcı kararı tur ortasında geldi ve işi baştan aşağı sadeleştirdi**
(*"Uygulamada simülatöre oturumsuz ulaşılamasın… sadece oturum açan simülatör
kullanabilsin"*).

Keşif şunu bulmuştu: mobilde oturumsuz bir ekran birim **adlarını ve sırasını** hiçbir
yerden alamıyor. Katalog Dart'a bilerek üretilmiyor (dünya başına ezilebilen sayılar
yüzünden) ve `catalogProvider` yalnız oturum değil **şehir sahipliği** istiyor. Oturumsuz
kalsaydı ya adları derlemek (o kararı delerdi) ya da ekranı isimsiz göstermek gerekiyordu.
Oturum şartı gelince ikisi de gereksizleşti.

**Sonuçta üretece eklenen tek şey `kCombatTechs`.** `GET /cities/:id/catalog` savaşçıları
`WARRIOR_ORDER`, savunmayı `DEFENSE_ORDER` (tapınak hariç), teknikleri `TECH_ORDER` ile
**zaten sıralı ve adlandırılmış** döndürüyor. Sunucunun söylemediği tek şey bir tekniğin
savaş statına dokunup dokunmadığı (`stat` alanı katalog ucunda yok) — Casusluk, Haritacılık
ve Sömürgecilik'in kutusu olmamalı.

⚠️ Bunun için kök `package.json`a `@mobilwar/contracts` workspace bağımlılığı eklendi:
`HERO_POINTS_PER_LEVEL` orada yaşıyor ve üreteç ona ulaşamıyordu.

**Web'den bilinçli üç ayrım (üçü de dar ekran):**

1. Web iki tarafı geniş tablolarda çiziyor; burada satır başına iki dar kutu var ve «Kalan»
   ayrı bir sütun değil, kutunun altındaki küçük yazı.
2. Kahramanlar **ayrı bir sheet'te**: satır başına beş kutu telefonda hiçbir düzende sığmıyor.
3. Simülatör misafire kapalı (yukarıdaki karar); webde açık kalmaya devam ediyor.

**Yolda kapanan kapı:** misafir açılış ekranındaki «Savaş simülatörünü dene» düğmesi
gerçek bir ekrana değil *"Simülatör — yakında."* yer tutucusuna gidiyordu. Düğme kaldırıldı
(karar gereği), rota da eklendi (oturumlu).

⚠️ **Tur 9'da bu bölümde «Bilinmeyen sayfa hatasına düşüyordu» yazıyordu ve YANLIŞTI.**
Rota tanımlı değildi ama `router.dart`taki `drawerItems` döngüsü «Daha» listesinin her
maddesini yer tutucuya bağlıyor, yani ekranda hata değil *"yakında"* çıkıyordu. Tur 10'da
düzeltildi.

**«Simülatöre aktar»** casusluk raporuna geldi. ⚠️ Devir tek atımlık ve **okuyan siliyor**:
kayıt kalsaydı oyuncu bir hafta sonra simülatörü açtığında formu eski bir raporun verisiyle
dolmuş bulurdu. Sur ve Büyü Kalkanı `structures`tan `counts`a katılıyor — sunucu onları
`defenses`ten ayıklıyor ve atlanırsa casusluktan gelen savunmada sur hep sıfır görünürdü.

### E2 — mobil destek (tur 10)

Misafir ve oturumlu iki kipte çalışıyor; kullanıcı şartı gereği **misafire açık**
(*"desteğe en çok ihtiyaç duyan kişi zaten giriş YAPAMAYAN kişidir"*).

⚠️⚠️ **İki ayrı uç ailesi var ve seçimi İSTEMCİ yapmak zorunda:** sunucu `OptionalAuthGuard`
kullanmıyor, yani oturumu olan biri public ucu çağırsa bile talep **anonim** açılıyor ve
oyuncunun kendi hesabından kopardı.

**Misafirin takip jetonu cihaza yazılıyor.** Sunucu jetonu bir daha vermiyor (yalnız
`sha256`'sı duruyor); webde karşılığı adresteki `/destek/t/:token` bağlantısı ama telefonda
oyuncunun bir adresi elle saklaması gerçekçi değil. Aynı bağlantı e-postayla da gidiyor,
yani depo kaybolsa da yol açık.

⛔ **Ek (resim) yükleme YOK ve bu bilinçli bir sınır:** `pubspec.yaml`da dosya seçici paketi
yok, iki platformda da fotoğraf izni akışı gerekiyor ve `dio` üzerinden `multipart` gövdesi
`api_client`ın JSON varsayımını deler. Üçü de yapılabilir ama üçü de bu ekranın işi değil.
⚠️ Eki olan bir YÖNETİCİ mesajı sessizce yutulmuyor: «bu mesajda bir ek var» diye
işaretleniyor.

**Yolda düzeltilen gerçek bir tuzak:** `router.dart`taki yer tutucu döngüsü yalnız
`/options`ı eliyordu, oysa tur 9'da `/simulate` gerçek bir ekran olmuştu — yol **iki kez**
kayıtlıydı. go_router ilk eşleşmeyi seçtiği için ekran doğru açılıyordu ama bu bir tesadüf:
sıra değişse yer tutucu kazanır ve simülatör sessizce kaybolurdu. Süzgeç artık
`_gercekEkranlar` kümesinden besleniyor.

### B2 ve C'nin taşma düzeltmesi (tur 8)

**C bir kusurla çıkmıştı ve kullanıcı cihazda yakaladı:** görev simgesi Ordular şeridindeki
hâliyle (34 px + altında geri sayım) satıra asılmıştı. Satır `height: 46` sabit olduğu için
Flutter ekranda **gerçek bir uyarı** bastı: *«BOTTOM OVERFLOWED BY 9.0 PIXELS»*, saatler alt
satıra sarktı. Webde aynı şey sessizce oluyordu — orada simge `sm:h-14` (56 px) ve satır `h-9`
(36 px).

Kullanıcının kararı: *"ordular sayfasında göründüğü şekilde değil, buraya özel sadece ikon
olarak görünsün; altında geri sayım olmasın, simge satıra sığsın."* Çözüm iki istemcide de
`MovementIcon`a bir `compact` bayrağı:

* simge 20 px, geri sayım yok, dönüş rozeti yok
* **parıltı KALDI** — geri sayım ve rozet gittiğine göre "bana gelen saldırı" ile "benim
  ordum" ayrımını yapan tek sinyal o
* ⚠️ Mobilde `compact` kipte `tickProvider` **izlenmiyor**: geri sayım yoksa saniyede bir
  yeniden çizilecek bir şey de yok. İzleseydik on satırlık Dünya listesi hiçbir şey
  değişmediği hâlde her saniye baştan çizilirdi.

⚠️ Ayrı bir widget değil bayrak: ton kuralı (`movementTone`) iki kipte de aynı kalmalı.

---

**B2 — emir onayı toast'ı.** İki istemcide de yerel, sunucu turu beklenmiyor.

⚠️ Plandaki *"`mission:sent` muhtemelen hedefe «sana saldırı geliyor» diyor"* tahmini
**yanlıştı**: o kayıt yalnız `type === 'transport'` ise ve yalnız ALICIYA bildirim üretiyor;
gönderene hiçbir şey gitmiyor. Yani emir onayı zaten sunucudan gelemezdi.

* **Web:** altyapı hazırdı ve **hiç kullanılmıyordu** — `useToast()` dışa aktarılmış ama
  depoda tek çağıran yoktu. Yeni bir şey yazılmadı, hazır kanca bağlandı.
* **Mobil:** `lib/ui/toast.dart` sıfırdan yazıldı. `SnackBar` değil: Material tonu oyunun
  temasına ait değil ve tek toast gösteriyor, oysa web'de üç yığılabiliyor. `OverlayEntry`
  de değil — `session_conflict.dart`ın `Stack` deseni izlendi, çünkü elle yönetilen bir
  overlay ekran değişimlerinde sızıntı üretiyor.
* Davranış web'le eşli: **6 sn**, **en fazla 3**, tıklanınca rotaya git. Sabitler testle
  kilitli (`toast_test.dart` · «sabitler web ile eşli»).
* Yerleşim `SessionConflictGate`in **içinde**: oturum devralındığında perde toast'ın da
  üstünü örtmeli.
* Metin kuralı iki istemcide de saf ve testli (`missionSentToast`), cümleler birebir aynı.

⛔ **Sunucudan gelen `notify:show` mobilde HÂLÂ dinlenmiyor** ve bu bilinçli bir sınır:
mobil istemci o olaya hiç abone değil (push altyapısı Faz 3) ve bastırma kuralının
(`suppressToast`) mobil karşılığı için "hangi sohbet açık" bilgisi gerekiyor. Toast katmanı
artık hazır, yani o iş geldiğinde yalnız besleme bağlanacak.

### E3 hakkında iki düzeltme

**1. İlk turdaki üç erteleme gerekçesinin üçü de geçersiz çıktı.** Gerekçeler
`options_screen.dart` başlığına yazılmıştı ve amacı buydu: yazılı gerekçe sınanabiliyor.

* *"Cihaz listesi `x-device-id` ile eşleşiyor, «bu cihaz hangisi» ayrımını yanlış göstermek
  oyuncuya kendi oturumunu kapattırabilirdi"* → **yanlıştı.** `auth.service.ts` ·
  `listSessions` `current` bayrağını `bool_or(f.id = currentSessionId)` ile **sunucuda**
  hesaplıyor ve listeyi kendi cihaz üstte olacak biçimde sıralıyor. İstemci hiçbir şey
  tahmin etmiyor.
* *"Şehir yönetimi Şehir sekmesine daha yakın"* → web'de de **Seçenekler**'de.
* *"Hesap silme Google Play şartı gereği webde kalmak zorunda"* → şart **yıkıcı adım** için.
  `MOBIL_UYGULAMA.md` §5 silme SAYFASININ webde ve oturumsuz kalmasını istiyor ve aynı
  paragraf *"silmeyi kayıttan zorlaştırmamak mağaza kuralı, kolaylaştırmak serbest"* diyor.
  Uygulamadaki düğme hesabı silmiyor, yalnız `delete-account/request` ile 12 saatlik
  bağlantı yollatıyor.

**2. Keşif sırasında web'de iki arıza çıktı ve düzeltildi** (`CityAdminPanel.tsx`):

| arıza | eskiden | şimdi |
| :-- | :-- | :-- |
| Terk **ön kontrolü** patlarsa | `catch` sessizdi, `blockers` `null` kalıyordu → düğme **kalıcı olarak kapalı**, ekranda hiçbir açıklama yok, yeniden deneme yolu yok | ayrı `checkFailed` durumu → *"Terk denetimi yapılamadı. Sayfayı yenileyip yeniden dene."* |
| Terk **409 `abandon_blocked`** | gövde düz (`{code, blockers}`, `message` yok) → `ErrorBox` yalnız *"İstek başarısız (409)"* yazıyordu | gövdedeki `blockers` okunup ekrandaki listeye yazılıyor |

Mobil taraf ikisini de baştan doğru yapıyor; `options_screen.dart` · `_SehirState._mesaj`
ve `_Terk`in `error:` dalı.

### E4 hakkında bir düzeltme

Planın *"üstü çizili süre çizimi eksik"* notu **yanlıştı**: `catalog_bits.dart` · `MwDuration`
web'deki `Duration` bileşeninin birebir karşılığını (üstü kırmızı çizili taban süre + vurgulu
gerçek süre) zaten çiziyor ve `MwCostLine` üzerinden Yapılar/Akademi satırlarında kullanılıyor.
E4'ten geriye yalnız **navbar rozeti** kaldı ve o eklendi.

### A2 kapısı neden daraltıldı

İlk yazımda kural `NONCOMBAT` kümesine bağlanmıştı, yani gnom da reddediliyordu. Kullanıcı
düzeltti (2026-08-22): *"Savaşmayan birim olsa bile o bir savaşçı sonuçta."* Ölçüt artık
katalogdaki `CANNOT_ATTACK_ALONE` (yalnız `cargo_wagon`).

⚠️ Küme `SPEED_EXEMPT_WHEN_ESCORTED` ile aynı üyeye sahip ama **ayrı duruyor**: biri "hız
hesabına girer mi", diğeri "tek başına saldırabilir mi" sorusunu cevaplıyor. Tek kümeye
bağlansaydı yarın hız muafiyetine bir birim eklendiğinde saldırı kapısı da sessizce değişirdi.

### A1 nasıl çözüldü

Yeni kahraman `mission_heroes`'a **şu anki görevin** kimliğiyle yazılıyor; `scheduleReturn`
hemen ardından o satırı dönüş görevine taşıyor. Varışta ek kod gerekmedi — `createReturnHandler`
zaten `mission_heroes`taki herkesin `city_id`'sini şehre yazıp satırları siliyor. Kahramanın
`city_id`'si yolculuk boyunca `NULL` (şemanın kendi kuralı) ve `mission_heroes_hero` tekil
indeksi başka bir sefere seçilmesini **veritabanı seviyesinde** engelliyor.

⚠️ Dönüş görevinin kurulma koşuluna `capturedTravels` eklendi: saldıran KAZANIP tek savaşçısı
bile kalmayabiliyor ve tam o savaşta kahraman çıkabiliyor — o dalda görev kurulmasaydı kahraman
`city_id = NULL` ile kalıcı olarak ortada kalırdı.
⚠️ `heroTravelSeconds` artık **her saldırıya** yazılıyor: saldırı kahraman taşımasa bile
kahraman üretebiliyor ve ordunun tamamı ölmüşse süreyi o alan veriyor.

### A2 nasıl çözüldü

* Muafiyet kümesi katalogda (`SPEED_EXEMPT_WHEN_ESCORTED` — yalnız `cargo_wagon`).
* `armySpeed` iki aday topluyor (hepsi / muaflar hariç) ve muaf olmayan hiç birim yoksa
  muafiyet **düşüyor** → tek başına araba kendi hızıyla yürüyor. Kahraman refakatçi sayılmıyor.
* Ayar `MapConfig.cargoIgnoresSpeed` (varsayılan **açık**) → `map.cargoIgnoresSpeed` admin
  anahtarı. ⚠️ `mapOverrides` yalnız `number` geçiriyordu; boolean desteği eklenmeseydi ayar
  panelde görünür, kaydedilir, **motora hiç ulaşmazdı**.
* Saldırı kapısı `NONCOMBAT` kümesinden besleniyor (araba + gnom), yalnız `sendAttack`te.
* Önizleme iki istemcide de aynı bayrağı görüyor; ortak fixture'a (`travel-vectors.json`)
  altı yeni vektör eklendi, ikisi ayarın kapalı hâlini ve gnom istisnasını kilitliyor.

## 📌 ARA TURDA EKLENEN MADDELER (2026-08-21)

Kullanıcı iş listesini verdikten SONRA, uygulama denerken bildirdikleri:

* **F5 — Tapınak düğmelerinin fontu.** `MwSmallButton` `styleFrom(textStyle:)` ile düğmenin
  yazı biçimini tamamen değiştiriyor ve ailesiz bir `TextStyle` verdiği için Flutter platform
  varsayılanına (Roboto) düşüyordu. Depodaki **tek** `textStyle:` ezmesiydi; aile açıkça
  yazıldı. ✅
* **F6 — Şehir şeridi başlığında koordinat/chevron ortalara kayıyor.** Sebep `_Header`in
  düzeni değil, dıştaki `Column`un varsayılan `crossAxisAlignment: center` değeri: başlık
  gevşek genişlik alıyor, `Row` daralıyor, içindeki `Spacer` 0 piksel kalıyordu.
  `stretch` ile çözüldü. ✅
* **F7 — 5 şehirde şerit yatay kaydırma üretiyor.** Hücre sabit 72 px; 5×72 + 4 ayırıcı +
  yan dolgu = **392 px** ve telefonların çoğunda taşıyor. Genişlik `min(72, sığan)` oldu;
  tek şehirde hücre yine ekranı kaplamıyor. ✅
* **F8 — Dünya ekranında kendi şehirlerimin rengi açık modda okunmuyor.** Mobil `accent`
  (bronz) kullanıyordu; web aynı şikâyetle 2026-08-11'de `own` (lacivert) token'ına geçmişti.
  `MwColors.own` eklendi, Dünya listesi ve hedef künyesi ona bağlandı. ✅
* **F9 — Sefer formu metinleri.** «Şehrinde savaşçı yok — kahraman tek başına da gidebilir.»
  → «Şehrinde savaşçı veya kahraman yok.»; kahraman seçicinin başlığından «(isteğe bağlı)»
  kalktı. İkisi de web + mobil. ⚠️ Kural değişmedi, kahraman hâlâ tek başına gidebiliyor. ✅

---

## A. SUNUCU KURALLARI

### A1. Savaştan çıkan kahraman ordu dönene kadar kullanılamasın

**Bugün:** `battle.handlers.ts` · `maybeCaptureHero()` kahramanı savaşın çözüldüğü anda
`INSERT INTO heroes (… city_id = originCityId, status = 'alive')` ile yazıyor. Ordu hâlâ
yolda; kahraman **anında evde ve sefere hazır** görünüyor. Savunanda sorun yok (kahraman
kendi şehrinde doğuyor), kusur yalnız **saldıran kazandığında**.

**Mekanizma zaten var:** `scheduleReturn()` dönüş görevini kuruyor ve
`UPDATE mission_heroes SET mission_id = <dönüş>` ile seferdeki kahramanları dönüşe taşıyor.
`mission_heroes` üzerinde `uniqueIndex('mission_heroes_hero')` var → bir kahraman aynı anda
tek seferde olabiliyor; sefer seçicileri de bu tablodan süzüyor.

**Öneri:** yeni kahramanı **dönüş görevine bindir**. Yani `maybeCaptureHero` kahramanın
`id`sini de döndürsün, `scheduleReturn` sonrası `INSERT INTO mission_heroes (<dönüş>, <yeni>)`
yazılsın. Böylece:
* kahraman dönüş süresince hiçbir göreve seçilemez (indeks + süzgeç bunu zaten yapıyor),
* varışta dönüş handler'ı onu serbest bırakır — ek kod gerekmez,
* Ordular ekranında dönen orduda **adıyla** görünür (`Movement.heroes`).

⚠️ **Ordu tamamen ölmüşse:** `scheduleReturn(heroOnly: true)` dalı zaten var ve süreyi
`payload.heroTravelSeconds` ile hesaplıyor (kahramanın kendi hızı). Kontrol edilecek: kazanan
saldıranın ordusu sıfırsa dönüş görevi **gerçekten kuruluyor mu**; kurulmuyorsa yalnız-kahraman
dönüşü için kurulmalı. Kullanıcının şartı birebir bu.

**Dokunulacak:** `apps/api/src/missions/battle.handlers.ts`.
**İstemci:** ayrı iş **gerekmiyor** (Tapınak ve sefer formu `mission_heroes`e bakıyor); yalnız
Tapınak'ta durumun «görevde» diye okunduğu doğrulanacak.

---

### A2. Yük Arabası — saldırı kapısı + hız kuralı + admin ayarı

**Üç ayrı iş, tek madde.**

**(a) Yalnız Yük Arabası ile saldırı başlatılamasın.**
Bugün `mission.service.ts` · `sendAttack()` iki kapı işletiyor: `def.kind !== 'warrior'` ve
`this.rules.attackForbiddenUnits` (bugün `['spy_bird']`). Yük Arabası `warrior` sayıldığı ve
listede olmadığı için tek başına saldırı **başlatılabiliyor**.
→ Yeni kapı: saldırıda **savaşan** birim yoksa reddet. Ölçüt `NONCOMBAT` kümesi
(`cargo_wagon`, `spy_bird`, `gnome`, `trap` — `packages/catalog/src/units.ts`), yani kural
"yük arabası" diye değil «savaşacak kimse yok» diye yazılır: gnom da tek başına saldıramaz ve
listeye yeni bir savaşmayan birim eklendiğinde kapı kendiliğinden kapanır.
⚠️ Yalnız `sendAttack`e konur — nakliye/destek/şehir kurma ortak `march()` yolundan gidiyor ve
bu kodu hiç görmüyor (10 kat kuralında da aynı ayrım var).

**(b) Yük Arabası orduyu yavaşlatmasın.**
`packages/engine/src/travel.ts` · `armySpeed()` bugün **tüm** birimlerin en küçük hızını alıyor.
Katalog hızları: kaos 80 · cüce/mancınık/ogre 100 · elf/şaman/gnom 120 · **yük arabası 140** ·
süvari 140 · pegasus/ejderha 160 · casus kuş 6000. (Büyük sayı = HIZLI; `travelSeconds`te
`100/speed`.) Yani araba yalnız **hızlı** ordularda (pegasus/ejderha) frene basıyor: 160 → 140.
→ Kural: orduda arabadan başka birim varsa araba `min()` hesabına **girmez**; tek başınaysa
kendi hızı geçerli (nakliye/destek/şehir kurma bundan etkilenmez).

**(c) Admin ayarı.**
`packages/settings/src/schema.ts` içine yeni anahtar (ör. `travel.cargoIgnoresSpeed`).
Kapalıyken bugünkü davranış birebir korunur.

**Açık soru:** ayarın **varsayılanı** açık mı kapalı mı? Bir de kural yalnız `cargo_wagon`a mı,
yoksa savaşmayan birimlerin tamamına mı (gnom 120 ile bir pegasus ordusunu yavaşlatıyor) ?

**Dokunulacak:** `packages/engine/src/travel.ts` · `packages/settings/src/schema.ts` ·
`apps/api/src/missions/mission.service.ts` · admin paneli ayar ekranı · sefer formunun süre
önizlemesi (web `world-modal.tsx`, mobil `mission_form.dart` — ikisi de aynı formülü çizmeli).

---

### A3. İttifakta son üye (lider) dağıtmadan ayrılamasın

**Bugün:** `alliance.service.ts` · `leave()` — lider ve başka üye varsa
`leader_must_transfer` hatası veriyor (**doğru**). Ama **tek üye kalmışsa** `leave()`
sessizce `disbandInner()` çağırıp ittifakı dağıtıyor. Kullanıcının istediği: bu durumda
ayrılma **reddedilsin**, oyuncu açıkça «Dağıt» demek zorunda kalsın.

**Öneri:** `leave()` içindeki tek-üye dalını hataya çevir (`must_disband`), `disband()` ucu
zaten var ve dokunulmuyor. Web `AllianceModal.tsx` ve mobil `alliance_screen.dart`te tek üye
kalan lidere «Ayrıl» yerine «İttifakı Dağıt» gösterilsin.

⚠️ Bu bir **davranış değişikliği**, eksik kontrol değil: bugünkü hâli sessizce dağıtıyor.

---

### A4. Zaten ittifakta olana davet gönderilememesi

**Bugün:** `alliance.service.ts` · `invite()` → `target_has_alliance` hatası **zaten var**
(satır 437). `WorldSlot.city.hasAlliance` alanı da istemciye gidiyor, yani düğme gizlenebiliyor.
**Yapılacak:** web ve mobilde davet düğmesinin gerçekten gizlendiği/kapandığı doğrulanacak;
sunucuya dokunulmayacak. Bir de test var mı bakılacak, yoksa eklenecek.

---

### A5. Beş şehir sınırı — yoldaki şehir kurma görevi de saysın

**Bugün:** `mission.service.ts:555-576` — sorgu `owned` ile birlikte
`missions … type='found_city' AND status IN ('scheduled','running')` sayısını (`pending`)
okuyor ve `owned + pending >= limit` ise reddediyor. Yani **istenen kural zaten yazılı** ve
gerekçesi de yorumda («henüz kurulmadı boşluğu»).
**Yapılacak:** yalnız test doğrulaması + istemci tarafında aynı sayının gösterildiği kontrolü.

---

### A6. Tatil modu — oyun içi hak kazanma eşiği (TASARIM)

**Bugün var olanlar** (`apps/api/src/vacation/vacation.service.ts`):
* `blockers()`: yoldaki ordu (giden/dönen/gelen), süren üretim/ilerletme, çıkıştan sonraki
  `cooldownDays` beklemesi.
* Ayarlar: `vacation.minHours` (48) · `maxDays` · `cooldownDays` · **`premiumOnly`**.
* Tatil kaydı: `players.vacation_since / vacation_until / vacation_ended_at / vacation_mission_id`.
* E-posta doğrulaması **bugün tatil için aranmıyor** (`unverified.ts`te tatil yok).

**Önerilen mekanik — «Tatil Hakkı Puanı» (çevrimiçi süre DEĞİL, kalıcı emek):**

```
P = Σ(tüm şehirlerdeki bina seviyeleri)
  + 2 × Σ(teknik seviyeleri)
  + 10 × (şehir sayısı − 1)
```

⚠️ Formülde **ordu ve kaynak YOK ve bu bilinçli**: ordu savaşta eriyor, kaynak harcanıyor.
Onları saymak, saldırı yiyen oyuncunun tatil hakkını **elinden almak** olurdu. Bina ve teknik
seviyesi ise geri gitmiyor (fetih yok, bina yıkılmıyor) → P monoton artıyor, oyuncu kazandığı
hakkı kaybetmiyor.

⚠️ Çevrimiçi süre bilerek kullanılmadı: kullanıcının kendi endişesi haklı — oyunu açık
bırakmak bedava eşik doldurur. P ise ancak kaynak üretip harcayarak yükseliyor.

**Eşik:** `T(n) = T0 × g^n`, `n` = daha önce girilen tatil sayısı (yeni kolon
`players.vacation_count`). Her tatilden sonra eşik `g` katına çıkıyor → kullanıcının
"her seferinde biraz artsın" şartı.

**Ek şartlar:**
1. **E-posta doğrulanmış olmalı** — pazarlıksız (kullanıcının şartı). `assertVerified`
   deseniyle eklenecek.
2. Bugünkü `blockers()` aynen kalır.

**Oyuncuya görünen yüz:** Seçenekler → Tatil modu kartında ilerleme çubuğu
(«Tatil hakkı: 62 / 80») ve eksikse **neyin** eksik olduğunu söyleyen satır. Sayı ekranda
hesaplanmaz, sunucudan gelir (`/vacation/status` içine `progress: {value, need}`).

**Açık soru:** `T0` ve `g` değerleri. Öneri: `T0 = 60`, `g = 1.6` — tek şehirli yeni bir
oyuncunun birkaç gün oynayarak ulaşabileceği, ikinci tatilde 96, üçüncüde 154 olan bir eğri.
Hepsi admin ayarı olacak (`vacation.unlockBase`, `vacation.unlockGrowth`).

---

## B. GERÇEK ZAMANLI + GERİ BİLDİRİM

### B1. Ordu şehre dönünce Baraka/Tapınak anında tazelensin

**Bugün:** dönüş handler'ı (`battle.handlers.ts:539`) iki olay yayıyor:
`city:army_returned` ve `city:changed (reason: army_returned)`.
Yönlendirme (`realtime.bus.ts:232`) doğru: olay yalnız sahibine gidiyor.

**Kusur eşleme tablosunda:**
* Web `apps/web/src/lib/realtime-topics.ts` · `INVALIDATES` içinde **`city:army_returned`
  satırı HİÇ YOK** → olay istemciye ulaşıyor ama hiçbir sorguyu tazelemiyor.
* Kurtaran şey ikinci olay: `city:changed` → `['city', 'catalog', 'overview']`.
  Yani asker sayısı tazeleniyor ama **`temple` (kahraman) ve `missions` tazelenmiyor**.
* Mobil `apps/mobile/lib/core/realtime.dart:60` aynı tabloyu taşıyor → aynı boşluk.

**Öneri:** iki istemcide de `'city:army_returned': ['city', 'catalog', 'overview', 'temple', 'missions']`
satırı eklensin. Kahraman dönüşü tam da bu yüzden gecikiyordu.

⚠️ Tablo dosyanın kendi başlığında *"bir olay karşılıksız kalırsa ekran dakikalarca yalan
söyler"* diye uyarıyor — bu madde o uyarının canlı örneği.

---

### B2. Görev emri verilince toast/notify

**Web:** altyapı **var** — `components/Toaster.tsx`. Ama tasarımı gereği metni **sunucudan**
alıyor (`notify.catalog.ts`), istemci kendi metnini üretmiyor. `notify.catalog.ts` içinde
`mission:sent` **zaten bir kayıt** (satır 266) — kime gittiği kontrol edilecek; bugün
muhtemelen yalnız hedefe («sana saldırı geliyor») gidiyor, gönderene gitmiyor.

**Mobil:** toast/notify altyapısı **YOK** (`ui/` altında yalnız `native.dart`,
`primitives.dart`, `keyboard_guard.dart`).

**Öneri:**
1. Mobilde `MwToast` — kendi yazacağımız `Overlay` tabanlı bir katman. Hazır paket yerine
   kendi sınıfımız: depo diğer tüm ilkelleri kendi yazıyor, tema token'ları
   (`gen/tokens.dart`) hazır ve web'in davranışını (sağdan gir, 6 sn, en fazla 3 yığın,
   tıklanınca rotaya git) birebir eşlemek gerekiyor.
2. Sözleşme web ile aynı: `{title, body?, url?, category}`.
3. Kaynak **iki tane**: (a) sunucudan gelen `notify:push` olayları, (b) yerel emir onayları
   («Ordular sefere çıktı»).

**Açık soru:** «Ordular sefere çıktı» metni sunucudan mı gelsin (notify kataloğuna
`mission:sent:self` eklenir, iki istemci de aynı cümleyi görür) yoksa istemcide yerel mi
üretilsin (anında çıkar, sunucu turu beklemez)? Öneri: **yerel** — emir onayı bir bildirim
değil, tıklamanın karşılığı; ağ turu beklemek onu geç ve yanlış hissettirir.

---

## C. DÜNYA EKRANI GÖREV İKONLARI ✅ (tur 7)

**İstenen:** aktif şehrin ilgili olduğu görevlerin ikonu, Dünya listesinde **karşı tarafın
kullanıcı adının yanında**; birden çoksa yan yana; sığmayan gizlenir; ikona dokununca
Ordular ekranındakiyle **aynı** detay penceresi açılır (web modal, mobil bottom sheet).

**Veri:** `WorldSlot` (`queries.ts:306`) bugün görev bilgisi **taşımıyor**. Ama sunucuya
dokunmaya **gerek yok**: `Movement` tipi (`queries.ts:255`) `origin` / `target` koordinatlarını,
`direction`ı (`out`/`in`/`own`), `cityId`yi, `icon`u ve `canCancel`i zaten taşıyor ve Ordular
listesi istemcide hazır. Slot eşleşmesi `k:d:s` üçlüsüyle yapılır, aktif şehir süzgeci
`m.cityId === activeCityId`.

**Hazır parçalar:** web `components/movements.tsx` → `MovementIcon` · `MovementModal` ·
`movementTone`; mobil `features/armies/movement_icon.dart` · `movement_sheet.dart`.
Yani ikon ve detay penceresi **yeniden yazılmayacak**, yeni yere takılacak.

⚠️ Dikkat: Dünya satırı dar ve `truncate` ile çalışıyor (`max-w-[8rem]`). İkon şeridi
kullanıcı adını ezmemeli — ad `min-w-0 truncate`, şerit `shrink-0` ve sabit sayıda ikon
(öneri: en fazla 3, gerisi sessizce düşer — kullanıcının şartı).

**Dokunulacak:** `apps/web/src/screens/World.tsx` · `apps/mobile/lib/features/world/world_screen.dart`.

---

## D. RAPOR EKRANLARINA SALDIRI / CASUSLUK DÜĞMELERİ ✅ (tur 7)

**İstenen:** casusluk raporu · casusluk önleme raporu · saldırı raporu · şehir savunma
raporu ekranlarına, köşeye, **ikon** şeklinde «saldır» ve «casus gönder» düğmeleri. Casusluk
raporundan doğrudan saldırı formu açılabilsin.

**Bugün:** sefer formu YALNIZ Dünya ekranından açılıyor (web `World.tsx` → `setTarget({slot, type})`
→ `world-modal.tsx`; mobil `world_screen.dart` → `target_sheet.dart` / `mission_form.dart`).
Raporda hedefin koordinatı **var** (`body.route.target` / savaş raporunda `coords.target`).

**Öneri:** sefer formunu **koordinattan** açabilen bir giriş noktası çıkarılsın (bugün slot
nesnesi isteniyor). Rapor ekranı koordinatı verir, form hedefi kendi çözer.
⚠️ 10 kat kuralı gibi kısıtlar zaten sunucuda (`sendAttack`) — istemci kapı koymayacak,
kullanıcının da dediği gibi hata dönerse form gösterir.

**Model:** «Simülatöre Aktar» düğmesi (web `Messages.tsx:611`) bu desenin kanıtlanmış örneği:
footer'da, ekran değiştiren eylem. Yeni ikon düğmeleri de aynı yere.

---

## E. MOBİL EŞİTLEME

### E1. Simülatör ekranı ✅ (tur 9)

`app/router.dart` — `/simulate` **PlaceholderScreen**. Rota misafire açık
(`routing_rules.dart:37`), sunucu ucu `simulate.controller.ts` `OptionalAuthGuard` ile
oturumsuz çalışıyor. Web karşılığı `screens/Simulate.tsx` (girdi formu + `localStorage`
son koşu hatırlama). «Simülatöre Aktar» yolu: `writeSimPrefill()` → `/simulate`.
`message_sheet.dart:17` bu eksiği zaten not etmiş (*«olmayan bir ekrana düğme koymamak»*).
**İş:** ekranın kendisi + prefill deposu (mobilde `storage.dart`) + rapor sheet'ine düğme.

### E2. Destek ekranı ✅ (tur 10)

`/destek` → PlaceholderScreen. Web `screens/Support.tsx` + `SupportPublicThread.tsx`.
Sunucu ucu tam (`/api/v1/support*`, ek dosya yükleme dâhil). Misafire açık olmak **zorunda**.

### E3. Seçenekler ekranı eksikleri ✅ (tur 6)

| Web paneli | Mobilde | Durum |
| :-- | :-- | :-- |
| `AccountPanel` | «Hesap» | var |
| `NotifySettings` | «Bildirimler» | var |
| `PrefsPanel` | «Görünüm» | kısmen |
| `VacationPanel` | «Tatil modu» | var |
| `BlockedPanel` | «Engellenenler» | var |
| `DevicesPanel` | «Aktif cihazlar» | ✅ tur 6 |
| `CityAdminPanel` | «Şehir» | ✅ tur 6 |
| `DeleteAccountPanel` | «Hesabı sil» | ✅ tur 6 |

**Hesap silme:** uç hazır — `POST /auth/delete-account/request` (oturumlu) yalnız **posta
yolluyor**, yıkıcı adım jetonla e-postadan onaylanıyor. Yani mobilde tek düğme yeter, akışın
geri kalanı zaten e-postada. `_HesapSilmeNotu` gerçek panele dönüştü.

⚠️ Geriye **tek** bilerek eksik panel kaldı: `PrefsPanel`in arka plan görseli ayarı. Web'e
özel bir görsel tercih, mobilde karşılığı yok.

**Mobilin web'den ayrıldığı üç yer** (üçü de bilinçli, koda gerekçesiyle yazıldı):

1. «Diğer cihazlar» **yerinde açılıyor**, modalda değil. Web'de modal olmasının sebebi
   panelin iki sütunlu ızgarada durması; mobilde sayfa zaten kayıyor ve listeyi sheet'e
   koymak kaydırılabilir bir şeyin üstüne ikinci bir kaydırılabilir katman bindirirdi.
2. Kendi cihazını çıkarınca **hemen çıkış** yapılıyor. Sunucu yanıtta `self` bayrağını
   yolluyor; web onu okumuyor ve oturum ancak bir sonraki istek 401 alınca düşüyor. Onay
   metninde verilen söz *(«giriş ekranına döneceksin»)* ancak bayrak okununca tutuluyor.
3. Son görülme **göreli süre** («5 dakika önce»), web'deki mutlak tarih değil. `clock.dart`
   bilerek `intl` taşımıyor ve uygulamanın geri kalanı da her yerde göreli süre gösteriyor.

### E4. Dünya çarpanı rozeti + kısaltılmış süre çizgisi

* Rozet: web `components/Shell.tsx` · `SpeedBadge` — yalnız bir değer 1'den farklıysa çiziliyor,
  ipucunda dört satır (`Kaynak üretimi · Sefer hızı · Birim üretimi · İnşaat/araştırma`).
  Mobil karşılığı `features/shell/info_bar.dart`in **sağ bölgesi** (bugün orada tatil rozeti
  ve `ConnectionDot` var). Dokunma → `MwTapTip`.
* Üstü çizili süre: web `screens/City.tsx` · `Duration({seconds, baseSeconds})`. Sunucu
  `baseSeconds`i **yalnız farklıysa** gönderiyor. Mobil model bunu **zaten okuyor**
  (`catalog_model.dart:102, 175`) ve `upgrade_row.dart:159` alanı aşağı geçiriyor — yani veri
  hazır, **çizim eksik**.

### E5. Altın/yemek üzerine uzun basınca saatlik üretim

Web `Shell.tsx` · `ResRate` ipucu. Mobilde veri **zaten modelde**:
`info_bar.dart:45-46` `goldPerHour` / `foodPerHour` okuyor ama kullanmıyor.
Tatildeyken sunucu ikisini de 0 döndürüyor; ipucu bunu **sebebiyle** söylemeli (web öyle).

---

## F. MOBİL GÖRSEL DÜZELTMELER

### F1. Navbar'da altın/yemek alt satıra kayıyor — ✅ **YAPILDI (2026-08-21)**

Çözüm: `SizedBox(width: 68)` içindeki `Text` bir `FittedBox(fit: scaleDown, alignment:
centerLeft)` ile sarıldı, `maxLines: 1` + `softWrap: false` eklendi. Genişlik sabit kaldı
(orta bölge zıplamıyor), taşan sayı kırılmak yerine küçülüyor.
⚠️ **Web'de aynı kusur YOK ve ölçüldü**: `components/ui.tsx` · `Res` dış kabında
`whitespace-nowrap` var, sayı sarılamıyor; genişlik de `min-w-[9ch]` yani **asgari**, sabit
değil — uzun sayı kutuyu büyütüyor. Web'e dokunulmadı.

**Kök neden bulundu:** `features/shell/info_bar.dart:177-181` — sayı sabit
`SizedBox(width: 68)` içinde ve `Text`in `maxLines`/`softWrap` ayarı yok. Sayı 68 px'e
sığmayınca **satır kırılıyor**.
⚠️ Sabit genişlik bilerek konmuş (şehir değişince orta bölge zıplamasın diye) — çözüm
genişliği büyütmek değil, taşmayı **kırılma yerine küçülme** ile karşılamak.

**Açık soru:** iki seçenek var —
(a) `maxLines: 1` + `FittedBox(fit: scaleDown)`: tam sayı görünür, çok büyükse yazı küçülür.
(b) Eşiğin üstünde kısaltma («12,3 M»): boyut sabit kalır, tam sayı ipucunda görünür.
Web'de aynı risk `Shell.tsx`te var mı diye ayrıca bakılacak (orada sabit genişlik yok, ama
kontrol edilecek).

### F2. Açık modda zebra deseni belirsiz — ✅ **YAPILDI (2026-08-21)**

Kaynak `packages/design-tokens/tokens.json`; `parchment` ölçeğine **yeni bir kademe**
(`250: #EADBBE`) eklendi ve `rowAlt.light` oraya bağlandı (eskiden `parchment.200 = #F3E9D6`).

⚠️ Eski değer `bg.light` ile **birebir aynıydı** — zebra satırı sayfa zemininin rengini
tekrarlıyordu ve tablolar `surface` (#FAF3E3) üstünde durduğu için ayrım kontrastı yalnız
**1,089**'du (koyu temada 1,123, yani açık tema daha da zayıftı).

Ölçülen adaylar (zemin `surface` #FAF3E3):

| aday | zeminden ayrım | ink | muted | own |
| :-- | --: | --: | --: | --: |
| `#F3E9D6` (eski) | 1,089 | 13,09 | 5,59 | 5,69 |
| **`#EADBBE` (yeni)** | **1,235** | 11,54 | 4,93 | 5,02 |
| `#D6C3A1` (kenarlık rengi) | 1,559 | 9,15 | **3,90** | **3,97** |

⚠️ `parchment.300` denenip **elendi**: `textMuted` ve `own` için kontrast 4,5 eşiğinin altına
düşüyor ve deponun kendi kapısı (`tokens.json` · `contrastPairs`) onu zaten reddederdi.
`#EADBBE` dört kapının hepsinde ≥ 4,9 pay bırakıyor.

⚠️ **Koyu temaya DOKUNULMADI**: şikâyet açık moda dairdi ve koyu temanın ayrımı zaten daha
güçlüydü. Kullanıcı kararı gereği değişiklik web ile mobili **birlikte** etkiliyor (tek kaynak).

`pnpm tokens:build` koşuldu → `lib/gen/tokens.dart` + `dist/*` yeniden üretildi,
`tokens:check` ve `design-tokens` testleri (38) geçiyor.

Token: `lib/gen/tokens.dart` → açık tema `rowAlt = #F3E9D6`, koyu tema `#2A2218`.
Kullanım: `academy_screen.dart:136` · `buildings_screen.dart:140` · `city_panels.dart:159` ·
`trainable_screen.dart:250` (hepsi `i.isOdd`).
⚠️ Token **üretilmiş dosyada** (`gen/`) — kaynağı `packages/design-tokens`. Elle değil
oradan değiştirilip `pnpm tokens:build` koşulacak, yoksa ilk üretimde geri gelir.
Web'de de aynı token `bg-row-alt` olarak kullanılıyor → **iki tarafı birden** etkiler; web'de
de belirginleşmesi isteniyor mu diye sorulacak.

### F3. Tapınakta «Adını Değiştir» sheet'i klavyenin altında kalıyor — ✅ **YAPILDI (2026-08-21)**

`mwSheet` gövdesi `Padding(bottom: MediaQuery.viewInsets.bottom)` ile sarıldı — `mwTextSheet`
ve `mwTallSheet`te baştan beri olan dolgunun aynısı. Dolgu `SafeArea`nın **dışında**: `SafeArea`
sistem çubuklarını hesaplıyor, klavyeyi değil; içeri alsaydık iki dolgu üst üste binerdi.
⚠️ Düzeltme `mwSheet` kullanan tüm sheet'leri etkiliyor ve bu istenen yön — yazı alanı
olmayanlarda `viewInsets.bottom` zaten 0.

**Kök neden bulundu:** `ui/native.dart` —
* `mwTextSheet` gövdesini `EdgeInsets.only(bottom: MediaQuery.viewInsets.bottom)` ile itiyor ✔
* `mwTallSheet` başlığında *«`viewInsets` ŞART»* yazıyor ✔
* **`mwSheet` bunu HİÇ yapmıyor** (satır 108-136: yalnız `SafeArea` + `Column`).

`temple_screen.dart:330` · `_adSheet()` → `mwSheet(title: 'Adını değiştir', child: _RenameBox)`
→ içinde `TextField` var → klavye açılınca sheet **altta kalıyor**.
**Düzeltme:** `mwSheet`e de `viewInsets` dolgusu. ⚠️ `mwSheet` çok yerde kullanılıyor,
düzeltme hepsini birden etkiler (istenen yönde: yazı alanı olan her sheet düzelir).

### F4. Genel/ittifak sohbeti görünümü

`features/chat/global_chat_sheet.dart` (557 satır) · `alliance_chat_sheet.dart` (749 satır).
İşlevsel olarak tam (gerçek zamanlı olaylar, susturma, yavaş mod, bahsetme). İstenen yalnız
**görsel**: baloncuk/hizalama, gönderen ayrımı, zaman damgası, ayırıcılar, boş durum.
⚠️ Oyuncunun yazdığı metinde Cinzel **yasak** (`mwDisplayStyle` kuralı) — tasarım bunu bozmamalı.

---

## G. WEB

### G1. Web mobil görünümdeki Şehir sayfası mobil mantığına hizalansın

Web `screens/City.tsx` **1138 satır**, `CityHub.tsx` 56 satır; mobil
`city_hub_screen.dart` 169 satır. Kullanıcı mobildeki düzeni daha iyi buluyor.
⚠️ Bu maddenin kapsamı en belirsiz olanı — hangi ekranın (şehir merkezi mi, yapılar mı)
hangi yönde değişeceği örnekle netleştirilmeli.

---

## H. SOHBET KURALLARI

### H1. DM ve ittifak sohbetinde ilk mesajdan önce kural onayı

**Şema hazır:** `chat_channels` (`kind` · `dm_key` · `alliance_id`) ·
`chat_participants` (kanal × oyuncu, `muted_until`, görünür pencere alanları) ·
`chat_messages` · `chat_bans` · `alliance_chat_mutes`.
Servisler: `apps/api/src/chat/` (dm · genel · ittifak ayrı ayrı).

**Önerilen tasarım:**
* **DM:** onay `chat_participants` satırına yeni kolonla bağlanır
  (`terms_accepted_at`, `terms_version`). Yani **her DM için ayrı** — kullanıcının istediği gibi.
  * Gönderen onaylamadan mesaj **gönderemez**.
  * Alıcı onaylamadan mesajı **göremez** (maskelenmiş gösterilir).
* **⚠️ Geçmişi silen oyuncu:** onay **KORUNUR**, yeniden sorulmaz. Gerekçe: onay bir arayüz
  durumu değil, **hukuki bir kabul**; her geçmiş silmede yeniden sormak oyuncuyu "okumadan
  onayla"maya alıştırır ve kaydın değerini düşürür. `chat_participants` satırı zaten silinmiyor
  (geçmiş silme yalnız görünür pencereyi kaydırıyor). Yeniden sorulacak tek durum:
  **metin sürümü değişirse** (`terms_version` artar) — sektör standardı da bu.
* **İttifak sohbeti:** onay **oyun başına BİR KEZ** (`players.chat_terms_version`), ittifak
  başına değil. Gerekçe: kurallar oyuncunun **davranışına** dair, ittifaka özel değil; ittifak
  değiştirmek kuralları değiştirmiyor. Sürüm artarsa yeniden sorulur.
* Metin **sunucudan** gelir (tek kaynak, iki istemci aynı metni gösterir, sürüm numarası
  metinle birlikte döner).

**Açık soru:** metnin maddeleri kullanıcı tarafından mı yazılacak, taslağı ben mi hazırlayayım?

---

## ÖNERİLEN SIRA

| # | Küme | Maddeler | Neden bu sırada |
| :-- | :-- | :-- | :-- |
| 1 | Hızlı mobil düzeltmeler | F1 · F2 · F3 | Küçük, bağımsız, tek turda biter; ekran hemen düzelir |
| 2 | Gerçek zamanlı + kurallar | B1 · A3 · A4 · A5 | Küçük dokunuşlar, çoğu doğrulama; sunucu turu tek |
| 3 | Sunucu kuralları | A1 · A2 | Motor ve sefer kuralları — test yükü yüksek, ayrı tur |
| 4 | Bildirim altyapısı | B2 | Mobil `MwToast` yeni bir ilkel; sonraki maddeler onu kullanacak |
| 5 | Dünya + rapor kısayolları | C · D | Ortak parça: sefer formunu koordinattan açmak |
| 6 | Mobil eşitleme | E4 · E5 · E3 | Veri hazır, yalnız çizim |
| 7 | Mobil büyük ekranlar | E1 · E2 | Simülatör ve destek — her biri kendi turu |
| 8 | Tasarım ağırlıklı | A6 · H1 · F4 · G1 | Önce karar, sonra kod |
