# MOBİL MİMARİ — Flutter uygulamasının yapısı, test düzeni ve yol haritası

> **Ne zaman açılır:** `apps/mobile/` altında herhangi bir işe başlamadan **önce**, ve mobil
> yol haritasına yeni bir madde eklemek istediğinde. Bu belge **mimari ve sıra** taşıyor.
> Hesap kimliği, doğrulama kademeleri (K0/K1/K2), telefon doğrulaması ve attestation tasarımı
> **`MOBIL_UYGULAMA.md`**'de; derleme/imzalama/CI-CD ve tek cihaz başlık sözleşmesi
> `DAGITIM.md` §6'da. İkisi de bu belgeden önce okunmalı.

Kaynak: kullanıcının 2026-08-15 tarihli kararı — *"Artık önemli bir eşiği daha geçip mobil
uygulama aşamasına geçelim. Asıl önem vereceğimiz taraf olan flutter ile mobil uygulama
geliştirme için planlarımızı yapmaya başlayalım."*

---

## 0. Tek cümlelik ilke

> **Mobil bir port değil, İKİNCİ BİR BİRİNCİ SINIF İSTEMCİ.**

Kullanıcı *tam eşitlik* seçti: her özellik hem web'e hem mobile, kalıcı olarak. Buradan
tek bir mühendislik sonucu çıkıyor ve bu belgenin yarısı ondan türüyor:

⭐⭐ **Her iş iki kez yapılacaksa, "aynı davranış" bir umut değil bir KAPI olmalı.**
Paylaşılan katman (token · sözleşme · metin · vektör) mümkün olduğunca kalın tutulur; iki
istemcinin ayrışması derleme ya da test hatası olarak görünür hâle getirilir.

---

## 1. Alınan kararlar

| Karar | Seçim | Gerekçe |
| :-- | :-- | :-- |
| Web'in geleceği | **Tam eşitlik sürdürülür** | Web emekliye ayrılmıyor. ⚠️ Zaten ayrılamazdı: `MOBIL_UYGULAMA.md` §5 web kaydını K0'da tutuyor ve hesap silme sayfası Google Play şartı gereği web'de kalmak zorunda |
| v1 kapsamı | **Çekirdek döngü** | Mağazada bir sürüm olması attestation'ın ÖN KOŞULU (`MOBIL_UYGULAMA.md` §9-2: *"veri sonradan toplanamaz"*). Dar kapsam o günü öne çeker |
| Metinler | **`packages/i18n` şimdi kurulur** | §13.14.2 zaten *"metin koda gömülmez"* diyor ve ihlal `EKSIK_OZELLIKLER.md` §2'de kayıtlı. Tam eşitlikte her metni iki kez yazmak kalıcı vergi olurdu |
| Platform | **Şimdilik Android** | iOS klasörü üretildi ve kırılmayacak şekilde yazılıyor, ama APNs · DeviceCheck · macOS runner (~10× dakika ücreti) ertelendi |
| Codegen | ⛔ **`build_runner`/`freezed` YOK** | İkinci bir codegen adımı kendisi bayatlar ve kendi kapısını ister. Tek artefakt için tek kapı |

---

## 2. Zemin — ne hazırdı

Keşif (2026-08-15) beklenenden çok daha iyi bir başlangıç noktası buldu. Önceki turlar mobili
öngörmüş:

| Hazır | Kanıt |
| :-- | :-- |
| `tokens.dart` **zaten üretiliyor** — 22 semantik token × gündüz/gece, `MwTheme.light()/dark()` | `packages/design-tokens/src/build.ts` · `dist/tokens.dart` |
| `apps/mobile/` mimaride planlı | `MOBIWAR_SISTEM_PLANI.md:248` |
| Mobil tek-cihaz sözleşmesi **testle kilitli** | `apps/api/test/presence.test.ts` → *"⭐⭐ mobil: instanceId kalıcı olmalı"* |
| Görsel varlıklar taşınabilir — **dosya adı = katalog `id`**, eşleme tablosu yok | `apps/web/public/assets/**` |
| `x-platform` başlığı `android`/`ios` **zaten bekliyor**; `player_devices` şeması *"Flutter geldiğinde değişmeyecek"* | `abuse/device-signal.service.ts` · `db/schema.ts:536` |

⭐ **En büyük sürpriz: Dünya ekranı harita DEĞİL** — sabit 10 satırlık bir tablo
(`apps/web/src/screens/World.tsx:1-17`). Canvas yok, zoom/pan yok, sanallaştırma yok. En zor
görünen ekran Flutter'da düz bir `Table`.

### 🔴 Bugün yok — gerçek iş

**FCM/APNs** · **Google girişi** (sıfır altyapı) · **yanıt sözleşmeleri** (147 uç
`Record<string, unknown>` döndürüyor) · **OpenAPI** · **i18n** · **attestation** ·
**minimum istemci sürümü kontrolü** (`X-App-Version` yazılıyor ama hiç okunmuyor).

⚠️ **`DAGITIM.md` §6'daki push iddiası YANLIŞ.** *"`push_subscriptions` FCM jetonlarını da alacak
şekilde tasarlandı, ayrı bir şema gerekmiyor"* diyor; oysa `p256dh` ve `auth` kolonları
**NOT NULL** ve ikisi de Web Push'a özel (ECDH anahtar çifti). FCM jetonunda bu alanlar yok →
**göç şart**. Belge Faz 3'te düzeltilecek.

⚠️ İlgisiz ama aynı sınıftan bir kayıt: `README.md` ve §13.13.1 *"ham hex CI'da reddedilir"*
diyor ama **ESLint hiç kurulu değil**. Fiilî kalite kapısı üçlü: `tsc --noEmit` · `vitest` ·
`tokens:check`.

---

## 3. Mimari

| Katman | Seçim | Gerekçe |
| :-- | :-- | :-- |
| Durum | **Riverpod 3.x, codegen'SİZ** | Async provider + önbellek modeli, web'deki react-query'nin birebir karşılığı → `queries.ts`'in 34 okuma hook'u mekanik olarak çevrilir. ⚠️ `@riverpod` codegen'i KULLANILMIYOR — aşağıdaki `build_runner` yasağıyla çelişirdi; elle yazılan provider biraz daha uzun ama tek codegen zinciri kalıyor. ⚠️ `flutter pub add` kendiliğinden **2.6.1** seçiyor, 3.x açıkça istenmeli |
| Rota | **go_router** | Bildirim derin bağlantısı (`notify` yükündeki `url`) rota eşlemesi istiyor |
| HTTP | **dio** | Interceptor zinciri şart: 9 başlık · proaktif yenileme · 503≠401 · 409 `session_conflict` |
| WS | **socket_io_client** | ⚠️ Sunucu ham WebSocket DEĞİL **socket.io 4.8.3** (`realtime.gateway.ts`, path `/ws`) |
| Depo | **flutter_secure_storage** (jeton) + **shared_preferences** (tercih) | `deviceId`/`instanceId` kalıcı olmak ZORUNDA — §3.2 |
| Bildirim | **firebase_messaging** + **flutter_local_notifications** | FCM ön planda sessiz kalır; bildirimi local plugin çizer |
| Giriş | **google_sign_in 7.x** | ⚠️ 7.0 kırıcı: `signIn()` kaldırıldı → `initialize()` + `authenticate()` |

### 3.1 ✅ Faz 0 spike — socket.io uyumu KANITLANDI (2026-08-15)

Dart istemcisinin sürüm tablosu "v2~v4" diyordu ama bu **varsayılmadı, ölçüldü**: yanlış olsaydı
gerçek zamanlı katmanın tamamı yeniden tasarlanacaktı ve bunu Faz 2'de öğrenmek pahalıydı.

`apps/mobile/tool/ws_spike.dart` **canlı sunucuya** bile bile geçersiz jetonla bağlanıyor:

```
→ hedef: https://mobilwar.com  (path: /ws)
← sonuç: connect_error: {message: unauthorized}
✅ UYUM KANITLI
```

⭐ `unauthorized` **başarıdır**: Engine.IO el sıkışması tamamlanmış, paketler çözülmüş ve
sunucunun **uygulama katmanı** (`realtime.gateway.ts`'in JWT doğrulaması) cevap vermiş demektir.
Protokol uyuşmazlığı transport/parse hatası verirdi. Betik depoda kalıyor — sunucu socket.io
sürümü yükseltilirse aynı kanıt tek komutla tekrar alınır.

### 3.2 ⚠️⚠️ Gün-1 tuzağı — `X-Client-Instance` kalıcı olmalı

Web'de bu başlık bir **sekmeyi** temsil ettiği için `sessionStorage`'da. Mobilde sekme yok;
kopya = **kurulum**. Her açılışta yeni kimlik üretilirse şu yaşanır: mobil uygulamalar sürekli
öldürülüp açılır, önceki kimliğin sahipliği `session.claimGraceSeconds` (90 sn) boyunca taze
kalır ve oyuncu **kendi hesabına giremez** — ekranda *"hesabın başka bir cihazda açık"* yazar.

⚠️ Mobilde `X-Client-Instance` ile `X-Device-Id`in **aynı değer olması tamamen doğrudur**;
ikisini ayırmak yalnız web'de (sekmeler yüzünden) anlamlı.

Sözleşme `apps/api/test/presence.test.ts`'te kilitli — yanlış uygulamanın sonucu da orada bir
test olarak duruyor.

### 3.3 Paylaşılan katman

| Paylaşılan | Nasıl |
| :-- | :-- |
| Renk/tema | `tokens.dart` hazır. ⚠️ `tokens:check` mobil kopyayı da kapsamalı. ⚠️ Üreteç bugün yalnız RENK veriyor; `radius`/`space`/`font` eklenecek |
| Sözleşmeler | `packages/contracts` → `apps/mobile/lib/gen/contracts.g.dart` (§4) |
| Metin | `packages/i18n` — ortak anahtar seti, iki istemci de oradan |
| **Görseller** | ⭐ Web'in `public/assets/`i **tek kaynak**; `pnpm assets:build` mobile kopyalıyor, `pnpm assets:check` sürüklenmeyi kırıyor (`ops/assets-sync.mjs`). ⚠️ Kopya zorunlu: Flutter `pubspec.yaml`ta paket dizini DIŞINDAKİ varlığı göremiyor. Kapı üç arızayı da yakalıyor — değişmiş · eksik · **fazla** (web'den silinen ikon mobilde kalırsa da ayrışma olur) |
| Hesap | ⭐ v1 için çok az: ETA önizlemesi (`route`/`travelSeconds`/`armySpeed`) + `wallCurrentIntegrity` + üretim çubuğu. Gerisini sunucu hesaplayıp veriyor |

⛔⛔ **`packages/catalog` Dart'a ÜRETİLMEZ.** Katalog değerleri **dünya başına çalışma anında
override edilebiliyor** — 2026-08-15'te Akademi 900/700 → 500/400 tam olarak böyle değiştirildi
(`settings.catalog(worldId)` → `catalogOverrides`). Derlenmiş bir Dart kataloğu override'lı
dünyada **sessizce yanlış** olur; hata da sessiz olur, çünkü kimse "istemcideki fiyat
sunucudakinden farklı" diye bir alarm kurmadı. Katalog API'den gelir: `GET /cities/:id/catalog`
zaten var ve zaten hesaplanmış değerleri döndürüyor.

### 3.4 Bire bir taşınacak 6 mekanizma

Hepsi gerçek hatalardan doğdu. Yeniden keşfedilmesinler diye adıyla yazılıyor:

| # | Mekanizma | Kaynak | Atlanırsa |
| :-- | :-- | :-- | :-- |
| 1 | **Yenileme uçuşta tek söz** (`refreshing ??=`) | `api.ts:263` | İki eşzamanlı 401 iki yenileme başlatır, ikincisi oturumu düşürür |
| 2 | **`gameNow()` ≠ `serverNow()`** ✅ `lib/core/clock.dart` | `hooks.ts:113-118` | İki kez canlı hata üretti: casuslukta sürekli «varıyor», üretimde kalıcı «tamamlandı» |
| 3 | **`unitProgress` `startedAt` çıpası** | `City.tsx:616-630` | Sunucunun `done`/`remaining` alanları tanımı gereği bayat — **kullanılmaz** |
| 4 | **Simülatörde donmuş `ran` fotoğrafı** | `Simulate.tsx:227-255` | `undefined` («savaşa girmedi») ile `0` («girdi, yok oldu») ayrımı silinir |
| 5 | **WS `INVALIDATES` tablosu** + `presence:update` debounce'u | `realtime.ts:60-120,330` | Ekran tazelenmez ya da kalabalık ittifakta olay yağmuru |
| 6 | **`useSafetyNet()`** — WS bağlıyken 5 dk, kopukken 60 sn | `queries.ts:428` | Pil ve sunucu yükü |

### 3.4.1 ⭐⭐ Arka plandan dönüş — mobilin web'de KARŞILIĞI OLMAYAN tuzağı (2026-08-16)

Yukarıdaki altı mekanizma web'den taşınıyor. Bu yedincinin web'de karşılığı **yok**: tarayıcı
sekmesi arka plandayken soket yaşamaya devam eder, Android'de etmez.

İşletim sistemi uygulamayı dondurunca iki şey oluyor, ikisi de sessiz:

| # | Ne oluyor | Sonucu |
| :-- | :-- | :-- |
| 1 | **Zamanlayıcılar durur.** socket.io'nun üstel backoff'u bir `Timer`a dayanıyor | Geri dönünce istemci "birazdan denerim" diye bekliyor; o «birazdan» dakikalar sonra |
| 2 | ⚠️⚠️ **HAYALET SOKET.** İşletim sistemi TCP'yi öldürür, istemci hâlâ `connected` sanır | Ekranda yeşil nokta yanar, **hiçbir olay gelmez** — gösterge YALAN söyler |

Bu yüzden geri dönüşte socket.io'nun kendi durumuna **güvenilmiyor**. Karar saf bir fonksiyonda
(`shouldForceReconnect`, `core/realtime.dart`) ve testle kilitli:

* bağlı DEĞİLSEK → hemen bağlan (donmuş backoff beklenmez)
* **15 sn'den uzun uzaktaysak → bağlı GÖRÜNSEK bile yeniden kur**
* eşik Engine.IO'nun 20 sn'lik `pingTimeout`unun ALTINDA ve sınırda «yeniden bağlan» tarafına
  düşüyor: gereksiz el sıkışmanın bedeli bir istek, kaçırılan hayalet soketinki oyuncunun hiç
  olay almaması

⚠️ Arka plana geçerken soket **bilerek kapatılmıyor**: oyuncu üç saniyeliğine başka uygulamaya
baksa sahipliği bırakırdı ve web'de açık sekmesi varsa oyun oraya kaçardı.

⭐ **Cihazda ölçüldü (2026-08-16), yalıtımlı deneyle:** uygulama arka plana alındı → **API
öldürüldü** (soket öldü, arka planda hiçbir olay gelemez) → 45 sn beklendi → API geri açıldı →
uygulama öne alındı. **3 saniye içinde** bağlantı kuruldu (`account_presence.seen_at` tazelendi,
gösterge yeşile döndü).

⭐ Göstergenin kendisi de **yalanlandı**: piksel rengi ölçülerek doğrulandı — bağlıyken
`RGB(143,176,94)` yeşil, API öldürülünce `RGB(212,103,79)` kırmızı, geri gelince yine yeşil.
Sürekli yeşil kalan bir nokta ekranda birebir aynı görünürdü.

### 3.5 ⚠️ Adlandırma — makine okuyan her ad İngilizce, yorumlar Türkçe

Depo kuralı (`README` §13.14) burada da geçerli ve **Dart'ta ihlali derleme hatasıyla ortaya
çıktı**: Türkçe `ı` harfi Dart tanımlayıcılarında yasak, yani `karanlık` gibi bir alan adı
dosyayı derlenemez yapıyor. Tanımlayıcılar 2026-08-15'te toptan İngilizceye çevrildi
(`CihazKimligi` → `DeviceIdentity`, `MwButon` → `MwButton`, `yenilemeAni` → `refreshDeadline`, …).

| Katman | Dil | Örnek |
| :-- | :-- | :-- |
| Sınıf · alan · metot · sağlayıcı · parametre | **İngilizce** | `SessionStore.write()`, `bootProvider`, `updateRequired(minBuild:)` |
| Yorum · doc comment · `reason:` metni | **Türkçe** | `/// ⚠️ Oturum yalnız GERÇEK reddde düşer` |
| `test`/`group` başlıkları | **Türkçe** (⭐/⚠️ işaretleriyle) | `'⭐⭐ yenileme uçuşta TEK söz'` |
| Kullanıcıya görünen metin | **Türkçe** | `'Güncelleme gerekli'` |

⛔ **Bu dönüşüm `sed` ile yapılmaz.** `yol`, `durum`, `mesaj`, `istek`, `oku` gibi adlar aynı
zamanda yorumların içinde geçen Türkçe kelimeler; toplu değiştirme kodu düzeltirken gerekçeleri
bozar. Dosyalar tek tek yeniden yazıldı.

⚠️ İki ad Dart'ın grameriyle çakıştığı için doğrudan çevrilemedi ve bunlar kural değil **istisna**:
`Notifier.set(...)` yazılamıyor (`set` setter anahtar sözcüğü) → `update(...)`; giriş rotası
`/auth` (web'de karşılığı yok, çünkü orada giriş bir modal — bu yüzden «yollar web ile aynı»
kuralının dışında).

### 3.6 ⭐ Yazı tipleri — GÖMÜLÜ, indirilmiyor (2026-08-16)

Web ile aynı iki aile: **Cinzel** (başlık) · **Spectral** (gövde), ikisi de `tokens.json`ın
`font` bölümünden geliyor ve Dart'a `MwFonts` olarak üretiliyor — yani tek kaynak korunuyor.

⚠️⚠️ **`google_fonts` paketi KULLANILMADI.** O paket varsayılan olarak fontu **çalışma anında
indiriyor**; sonucu:
* ilk açılışta ağ yoksa oyuncu yanlış fontla karşılaşır, sonra metin zıplar
* oyunun kabuğu çevrimdışı açılabiliyor, fontu ağa bağlamak onu geriletirdi
* paket dosyayı nasılsa diske indiriyor — bedeli ödeyip karşılığını almamak

Bedel **~1,3 MB APK**; karşılığında ilk kareden itibaren doğru tipografi.

| Konu | Karar |
| :-- | :-- |
| Lisans | İkisi de **SIL OFL** — gömmeye açıkça izin veriyor. `OFL-*.txt` dosyaları yanlarında duruyor |
| Cinzel | Google Fonts'ta **yalnız değişken** sürüm var. Ağırlık `fontVariations` ile veriliyor; tek başına `fontWeight` varyasyon eksenini oynatmıyor ve başlık ince çizilirdi |
| Spectral | Statik 400/600/700 gömülü — gövde metni ağırlık sentezine bırakılmayacak kadar çok yerde |
| ⚠️⚠️ Cinzel nerede KULLANILMAZ | **Oyuncunun yazdığı metin.** Font küçük harf taşımıyor; web'de şehir adına uygulanmış ve «Mithlond» ekranda «MİTHLOND» görünmüştü. Yalnız sabit başlıklarda |

⚠️⚠️ **Ayna tuzağı — ölçülerek yakalandı:** `ops/assets-sync.mjs` web'de karşılığı olmayan
dosyayı «fazla» sayıp **siliyor**. Fontların web'de dosya karşılığı yok (tarayıcı onları
CDN'den alıyor), yani ilk `pnpm assets:build` çağrısı `assets/fonts/` klasörünü sessizce
silecekti. `MOBILE_ONLY` listesi bu yüzden var ve düzeltme **komutu koşturarak** doğrulandı.

---

## 4. Tip güvenliği — "sözleşme borcu defteri"

⚠️ **Sorun bugün de var; Flutter onu ÜÇE çıkarır.** `apps/web/src/lib/queries.ts` elle yazılmış
~60 yanıt `interface`'i taşıyor; sunucudaki karşılığı controller içinde satır içi nesne
literali. Aralarında **hiçbir kapı yok**. Dart üçüncü kopya olurdu.

**Yaklaşım: kademeli — port işi, sözleşme borcunu ödeyen zorlayıcı güç olur.** Her ekran
taşınırken o ekranın yanıt şeması yazılır:

| Adım | Nerede |
| :-- | :-- |
| Yanıt şeması zod olarak yazılır | `packages/contracts/src/responses/<alan>.ts` |
| Controller dönüş tipi daraltılır | `Record<string,unknown>` → `z.infer<typeof …>`. TS'in **excess property** denetimi eksik/fazla alanı derleme anında yakalar |
| Dart modeli üretilir | `packages/contracts/src/dart/build.ts` → `apps/mobile/lib/gen/contracts.g.dart` |
| Web'in elle interface'i **silinir** | 3 kopya → 1 |

⭐ **Mandal (ratchet).** `packages/contracts/src/coverage.ts` her ucu `sozlesmeli | borclu` ve
`mobil: bool` diye işaretler. `apps/api/test/contract-coverage.test.ts` üçünü ölçer:
(a) `mobil:true` olan her uç sözleşmeli · (b) **`borclu` sayısı ASLA artmaz** — yeni uç şemasız
eklenemez · (c) sözleşmeli yolun controller'ında `Record<string, unknown>` metni bulunmaz.
Borç tek yönlü azalır; büyük patlama gerekmez.

⚠️ Üreteç **taşınabilir bir zod alt kümesini** destekler, dışına çıkanı derlemez (hata verir).
İçeride: `object · string · number · boolean · literal · enum · array · record · nullable ·
optional · union · discriminatedUnion · datetime`. Dışarıda: `transform · refine · lazy ·
intersection`. Bu da bir kapıdır: şema yazarı taşınabilir kalmak zorunda.

⚠️ Üretilen Dart, eksik alanı `int?` bırakır ve **asla `?? 0`'a düşmez** — §3.4'teki 4 numaralı
mekanizmanın (`undefined` ≠ `0`) codegen şartı.

### 4.0 ⚠️⚠️ `CityDetail` borcu — neden ÖDENMEDİ (2026-08-15)

Şehir ekranı taşındı ama `CityDetail` şeması **yazılmadı** ve bu bilinçli bir karar:

Sunucudaki `city.controller.ts` · `get()` kuyruk satırlarını **`...q` yayılımıyla** döndürüyor.
Dönüş tipini `z.infer<typeof cityDetail>`e daraltmak **derlenirdi ama hiçbir şey ölçmezdi**:
TypeScript'in fazla-alan (excess property) denetimi nesne literaline uygulanıyor, **yayılıma
uygulanmıyor**. Şema "kapsandı" görünür, gerçekte kapsamazdı — yani sahte bir kapı, borçtan
daha kötü.

⭐ **Ödeme sırası:** önce `QueueService.openQueues` açık bir dönüş şekli almalı, sonra
controller literal döndürmeli, ancak ondan sonra şema gerçek bir kapı olur.

Bu arada mobil taraf `apps/mobile/lib/features/city/city_model.dart`ta elle yazılı ve borç
orada adıyla duruyor. ⚠️ Model **yalnız ekranın okuduğu alanları** taşıyor: okunmayan alanı
modele koymak, kullanılmadığı için hiç doğrulanmayan bir sözleşme yazmak olurdu.

⭐ Şehir LİSTESİ (`GET /api/v1/cities`) borçlu değil: `citySummary` şeması vardı, `CitySummary`
zaten Dart'a üretiliyor ve ekran onu kullanıyor.

### 4.1 Dört kapı, dördü farklı arıza

| # | Kapı | Yakaladığı | Flutter SDK gerekir mi |
| :-- | :-- | :-- | :-: |
| 0 | `pnpm tokens:check` · `pnpm assets:check` | palet ya da görsel web'den ayrıştı | ✖ |
| 1 | `pnpm contracts:check` | zod değişti, `.g.dart` yeniden üretilmedi (`tokens:check` deseninin aynısı) | ✖ |
| 2 | `apps/api/test/contract-fixtures.test.ts` | controller'ın **gerçek** JSON'u şemayı sağlamıyor | ✖ |
| 3 | `pnpm contracts:compat` + `contracts/baseline/mobil-<sürüm>.json` | **yayındaki** mobil sürümün okuduğu alan silindi/yeniden adlandırıldı → `DAGITIM.md` §6'nın makineleşmiş hâli | ✖ |
| 4 | `flutter analyze --fatal-infos` | üretilen model derlenmiyor | ✔ |

⭐ **Kritik asimetri: dördünden üçü Flutter SDK'sı olmayan runner'da çalışır** — `.g.dart`
karşılaştırması düz metin karşılaştırmasıdır. `ci.yml` yalnız bir satır kazanır:
`tokens:check`in yanına `contracts:check`.

⚠️ Kapı 3'ün gerekçesi mobilin getirdiği tek gerçek kısıt: mağaza onayı günler sürer,
güncellemeyi almayan oyuncu haftalarca eski sürümde kalır. Aranan kapı "aynı mı" değil
**"geriye uyumlu mu"** kapısıdır ve hiçbir OpenAPI/codegen zinciri bunu kendiliğinden vermez.

---

## 5. Test mimarisi

⭐⭐ **Cevabın özü: cihaz da emülatör de gerekmiyor.** `flutter test` ana makinenin Dart VM'inde
**başsız** koşar. Android Studio hiç açılmaz — RAM endişesi konusuz.

```
apps/mobile/
  lib/core/ · lib/features/<alan>/ · lib/ui/ · lib/gen/   (üretilmiş: contracts.g.dart, tokens.dart)
  test/
    core/       clock · auth_refresh · realtime · safety_net
    features/   city/unit_progress · simulate/snapshot · …
    contract/   fixture replay
    golden/     @Tags(['golden'])
  integration_test/   tek cihaz · yeniden bağlanma · jeton süresi
```

Dosya adları İngilizce `snake_case.dart` (§13.14.1), **test adları Türkçe + ⭐/⚠️** —
`apps/web/test/` ile birebir aynı üslup.

| Katman | Pay | Kural |
| :-- | :-- | :-- |
| Saf Dart unit | ~%80 | Karar olan her şey. `apps/web/test/`'in aynadaki karşılığı |
| Widget | çok az | ⭐ **Yazılı kural:** bir widget testi ancak önlediği hata **mount/unmount/rebuild içinde yaşıyorsa** meşrudur; değilse mantık `lib/core`'a çıkarılır ve saf test edilir |
| Golden | dar | Yalnız `lib/ui/` primitifleri, açık+koyu+`textScale 1.3` |
| integration_test | 3-6 | Yalnız taklidi **yanlış cevap veren** akışlar. PR'da koşmaz |

⭐ Bu düzen bugünkü web istemcisinden **daha iyi** kapsama verir: `apps/web`'de bileşen testi
altyapısı hiç yok (jsdom/testing-library kurulu değil), mantık `src/lib`'e çıkarılıp saf
fonksiyon olarak test ediliyor. Flutter'da o ayrım korunur **ve** üstüne widget/golden gelir.

### 5.1 API taklidi — mock değil, kayıt

Depo mock sevmiyor: API testleri gerçek Postgres kullanıyor, gerekçesi *"SKIP LOCKED, advisory
lock ve transaction davranışı taklit edilemez"*. Aynı felsefe burada da geçerli.

`apps/api/test/contract-fixtures.test.ts` gerçek Postgres'te dünyayı kurar, controller'ları
doğrudan çağırır ve her yanıt için: (a) zod şemasıyla doğrular → **Kapı 2**, (b)
`apps/api/test/fixtures/*.json` ile karşılaştırır (`pnpm fixtures:build` yazar, aksi hâlde
farkta `exit 1`).

Flutter tarafı `test/contract/` **aynı dosyaları göreli yoldan okur, KOPYALAMAZ.** Kopya,
öldürmeye çalıştığımız bayatlamanın ta kendisidir.

⭐ **Fixture bayatlaması yakalanmaz — imkânsız kılınır.** Fixture, onu doğrulayan iddiayla
**aynı artefakt**. Controller şekli değişip fixture yenilenmezse API testi *aynı koşuda*
kırmızı yanar; yenilenirse `contracts:check` kırılır; Dart üretilmezse `flutter analyze`
kırılır; değişiklik yayındaki sürüm için kırıcıysa `contracts:compat` kırılır.

⚠️ **Taşıma dikişi (transport seam), mock değil.** Dart API istemcisi gönderici fonksiyonu
kurucudan alır: `MwApi(send: fixtureSender('city-detail.json'))`. Beklenti/`verify` yok, gerçek
baytlar var. `api.ts`'in *"çerçeveden bağımsız düz modül"* olması zaten aynı ilkeydi.

⚠️ **`flutter test` için gerçek API AYAĞA KALDIRILMAZ.** Her geliştiriciye Node+Postgres şartı
koşmak mobil paketi deponun en yavaş ve en kırılgan parçası yapardı. Gerçek API yalnız
`integration_test/`'te — bedelini hak ettiği yerde.

### 5.2 ⭐⭐ Diller arası eşitlik kapısı ✅ (2026-08-15, zaman ailesi kuruldu)

"Tam eşitlik" kararını umut olmaktan çıkarıp kapıya çeviren mekanizma. **Kurulu ve çalışıyor:**

| Parça | Yer |
| :-- | :-- |
| Şartname | `packages/contracts/fixtures/clock-vectors.json` — 34 vektör |
| TS tüketici | `apps/web/test/clock-vectors.test.ts` → `src/lib/hooks.ts` |
| Dart tüketici | `apps/mobile/test/core/clock_test.dart` → `lib/core/clock.dart` |

⭐⭐ **Vektörler ÜRETİLMİYOR, elle yazıldı** — ilk tasarımdan bilinçli sapma. Üretilseydi
(«TS koşar, JSON yazar») dosya TS'in aynadaki görüntüsü olurdu ve TS'teki bir hata sessizce
*beklenen* hâline gelirdi; Dart kırılınca da suç yanlış tarafa yazılırdı. Elle yazılınca dosya
**bağımsız bir otorite**: bir dil değişince önce o dilin testi kırılır, dosyayı güncellemek
bilinçli bir karar olur, sonra ÖTEKİ dilin testi kırılır. Zincirin her halkası birinin durup
bakmasını zorunlu kılıyor.

⚠️ Kopyalama YOK: iki test de dosyayı göreli yoldan okuyor (`../../packages/...`). Kopya,
öldürmeye çalıştığımız bayatlamanın ta kendisi olurdu.

⚠️ **Boş küme tuzağı:** `it.each([])` / boş `for` döngüsü hiçbir şey koşmadan YEŞİL yanar.
Yanlış anahtar okumak testi sessizce iptal ederdi; iki tarafta da vektör sayısı ayrıca
iddia ediliyor.

⭐ Kapının ısırdığı **ölçüldü**: `formatDuration` bilerek bozulduğunda 6 test kırmızıya döndü
(2026-08-15). Geçen bir test, yanlışı yakalayacağının kanıtı değil.

✅ **İkinci vektör kümesi kuruldu (2026-08-15):** `city-progress-vectors.json` — üretim bandı
(`unitProgress`) ve kaynak sayacı (`extrapolateResources`), 21 vektör.

⭐ Ön koşul da yapıldı: ikisi de ekranlardan çıkarılıp `apps/web/src/lib/city-progress.ts`e
taşındı (`City.tsx` ve `Shell.tsx`ten). Çıkarma ikisini de **ilk kez test edilebilir** yaptı —
oysa `unitProgress` kullanıcının 2026-07-28'de bildirdiği bir hatanın düzeltmesiydi ve o
düzeltmeyi koruyan hiçbir şey yoktu.

⚠️ Kaynak sayacının vektörlerinde **kesirli** bir durum var (`1045.6666666666667`). İki dil de
IEEE754 double kullanıp aynı işlem sırasını izlediği için sonuç bit düzeyinde eşit olmak
zorunda; karşılaştırma bu yüzden `closeTo` değil **tam eşitlik**.

### 5.3 `INVALIDATES` tablosu ortaklaşır

Tablo veridir. İki istemciden de çıkarılıp `packages/contracts/src/realtime.ts`'e taşınır
(`WS_INVALIDATES`), `contracts.g.dart`'a üretilir, `apps/web/src/lib/realtime.ts` oradan içe
aktarır. Asıl kapı sunucuda: `apps/api/test/realtime-topics.test.ts` →
`⭐⭐ gateway'in yaydığı HER konu istemci tablosunda karşılık buluyor` ve
`⚠️ tabloda olup gateway'in hiç yaymadığı konu YOK (ölü satır)`.

Bu, *"sunucu aylardır yayıyordu, istemci hiç dinlemiyordu"* hata sınıfını yapısal olarak kapatır.

### 5.4 Golden testler

**Evet:** yalnız `lib/ui/` primitifleri (`MwButton`, `MwBadge`, `MwProgressBar`,
`MwResourceChip`). ⭐ Gerekçe: `tokens:check` token'ların *içeriğini* kilitliyor ama üretilen
`MwTheme`'in gerçekten o paleti **boyadığını** hiçbir şey ölçmüyor. Golden tam olarak bu
tesisatı ölçer.

**Hayır:** tam ekranlar. Türkçe metinler sürekli değişiyor · ekranların çoğunda canlı geri
sayım var · veri fixture'lardan geliyor ve fixture'lar meşru sebeplerle değişiyor. Sonuç:
yakalaması gereken hatayla ilgisiz sebeplerle kırmızı yanar → refleksle `--update-goldens`
yenir → lastik damgaya döner.

⚠️ **İşletimsel tuzak:** golden'lar font/platform bağımlı ve Windows geliştirici makinesi
kalıcı sahte kırmızı üretir. Bu yüzden `@Tags(['golden'])`, yerel varsayılan
`flutter test --exclude-tags golden`, golden'lar **yalnız `ubuntu-latest`'te** ayrı adımda.

---

## 6. Geliştirme döngüsü

Android Studio **hiç açılmıyor** (kullanıcının RAM gerekçesi). Galaxy A34 `adb` üzerinden bağlı.

```bash
flutter devices                        # cihaz kimliğini gör
adb reverse tcp:3002 tcp:3002          # telefonun localhost'u → PC'deki API (main.ts:168)
flutter run -d <cihaz>                 # kur + hot reload
adb exec-out screencap -p > shot.png   # ekran görüntüsü
```

⭐ **Canlıya bağlanan yapı** (yerel API kurmadan denemek için):
`flutter build apk --debug --dart-define=MW_API=https://mobilwar.com`

⛔⛔ **YEREL API'YE BAKAN YAPI `--release` OLAMAZ** (2026-08-17'de ölçüldü). Android 9+
`usesCleartextTraffic` varsayılanını **false** yapıyor ve izin yalnız
`android/app/src/debug/AndroidManifest.xml`'de duruyor — `main/`de yok. Yani release APK
`http://127.0.0.1:3002`'ye **hiç bağlanamıyor** ve ekranda tek gördüğün *«Dünya listesi
alınamadı»* oluyor: API çökmüş gibi görünüyor. `flutter run` hep debug derlediği için bu tuzak
yıllarca görünmedi; `flutter build apk --release`e geçen ilk turda üç yanlış teşhise yol açtı.
⚠️ APK'nın içindeki adres doğruydu — `grep -a '127.0.0.1:3002' libapp.so` bunu tek komutta
söylüyor ve teşhisi kısaltıyor.

⚠️ **Yerel API'yi başlatmayı unutma** — `pnpm --filter @mobilwar/api dev` (Postgres için önce
`pnpm dev:infra`). Ekranda kalıcı "yükleniyor" görüyorsan **ilk bakılacak yer burası**;
`curl 127.0.0.1:3002/healthz` iki saniyede cevap veriyor.

⚠️ `adb reverse` **her USB bağlantısında sıfırlanır** — kalıcı değil. İkinci bakılacak yer.

### 6.1 ⛔ Hot reload komut satırından TETİKLENEMİYOR (Windows) — iki yol denendi, ikisi de kapalı

Değişiklik başına ~60 sn'lik `flutter build apk` yerine ~2 sn'lik hot reload cazip görünüyor ama
Windows'ta otomasyona kapalı. **Denenip ölçüldü (2026-08-15), tekrar denemeye değmez:**

| Yol | Neden olmadı |
| :-- | :-- |
| `--pid-file` + `SIGUSR1` | Flutter'ın belgelediği yol, ama **`SIGUSR1`/`SIGUSR2` Windows'ta yok** |
| Dart VM Service'e doğrudan `reloadSources` | `Error while starting Kernel isolate task`. Yapısal: Flutter'ın hot reload'u önce `flutter_tools`un **frontend derleyicisinin** Dart'ı artımlı kernel'a çevirmesini gerektiriyor; VM tek başına o derleyiciyi ayağa kaldıramıyor |
| `flutter run --machine` + stdin'e JSON-RPC | İstek yazılıyor, **yanıt hiç gelmiyor**. Windows'ta süreç `cmd.exe` sarmalayıcısından geçtiği için stdin aktarımı güvenilir değil |

⭐ **Bu bir engel değil, yalnız bir yavaşlık.** Doğrulama döngüsü (derle → kur → `screencap`)
çalışıyor ve güvenilir. Geliştirici kendi terminalinde `flutter run` açıp `r`ye basabilir —
kaybedilen tek şey otomasyonun aynısını yapabilmesi.

⭐ Son satır önemli: ekran görüntüsü okunabildiği için arayüz **kendi kendine doğrulanabiliyor**;
her adımda kullanıcıya *"bir bak da doğru mu görünüyor"* diye dönmek gerekmiyor.

⚠️ Kablosuz hata ayıklama (Android 11+) USB'yi de gereksiz kılar: `adb pair` → `adb connect`.

---

## 7. CI

⭐⭐ **`apps/mobile/package.json` YAZILMAZ — ve bu bilinçli bir karardır.** pnpm yalnız
`package.json` olan dizinleri paket sayar; dosya olmayınca `apps/*` glob'u `apps/mobile`'ı
almaz, turbo grafiğine girmez ve `pnpm -r --sort run test` (turbosuz yedek yol) ona hiç
uğramaz → **Flutter SDK'sı olmayan runner asla kırılmaz.** Garantinin en ucuz biçimi;
`pnpm-workspace.yaml`'a dokunmak bile gerekmiyor.

⚠️ Aynı sebeple kök `package.json`'a `mobile:test` betiği de **eklenmez** — birileri onu
`turbo run test`e bağlar ve aynı runner'ı kırar. Kökte yalnız Node ile koşan betikler bulunur:
`contracts:build` · `contracts:check` · `contracts:compat` · `fixtures:build`.

**`.github/workflows/mobile.yml`** — `DAGITIM.md` §6'nın öngördüğü **ayrı** akış, `deploy.yml`'a
bağlanmaz (*"mobil sürüm mağaza onayına tabi, web anında çıkıyor"*). Adımlar:
`paths` süzgeci (`apps/mobile/**`, `packages/contracts/**`, `packages/design-tokens/**`) →
`dart format --set-exit-if-changed` → `flutter analyze --fatal-infos` →
`flutter test --exclude-tags golden` → golden (ayrı adım, Linux) →
`pnpm contracts:build && git diff --exit-code` (üretilmiş dosya elle düzenlenmiş mi).

⚠️ `integration_test` PR'da koşmaz — gece ya da `workflow_dispatch`, emülatör + gerçek API ister.

### 7.1 ⚠️ Faz 0'da ölçülerek öğrenilen üç tuzak

Üçü de *"yazınca çalışır sanılan ama çalışmayan"* sınıfından; hepsi ölçüldü (2026-08-15).

| Tuzak | Belirti | Çözüm |
| :-- | :-- | :-- |
| **Hiç golden test yokken `flutter test --tags golden`** | **exit 79** — *"No tests ran"*. İlk koşuda CI'yı kırardı | Workflow **yalnız 79'u** tolere ediyor; gerçek başarısızlık (1) yine kırıyor |
| **GitHub Actions YAML anchor desteklemiyor** | `&ad`/`*ad` sessizce çalışmaz | `paths` listesi bilerek **iki kez** yazılı |
| **`dart format` ↔ `tokens:check` çatışması** | Formatçı üretilmiş `tokens.dart`'taki uzun ternary'yi üçe bölmek istiyor; bölünmüş hâli üretecin çıktısı olmadığı için `tokens:check` reddediyor. **İki kapı birbirini kilitliyor** | `lib/gen/` biçim denetiminin **dışında** (üretilmiş kodu biçimlendirmek insan işi değil), ama `flutter analyze` onu **yine de** denetliyor — "üretilen Dart derleniyor mu" kapısı açık kalıyor |
| **`flutter analyze` monorepo KÖKÜNDEN koşarsa** | 426 sahte hata: `packages/design-tokens/dist/tokens.dart` Flutter paketi dışında ama Dart dosyası, analizör onu da tarıyor ve `ThemeData` çözümlenemiyor | Her zaman `apps/mobile` içinden koş. Workflow zaten `working-directory: apps/mobile` kullanıyor |
| **`flutter pub add flutter_riverpod`** | Sessizce **2.6.1** kuruyor, 3.x'e çıkmıyor | Sürüm açıkça istenmeli: `flutter pub add "flutter_riverpod:^3.4.2"` |
| **`flutter_secure_storage` v11** | `AndroidOptions(encryptedSharedPreferences: true)` **derlenmiyor** — bayrak kaldırılmış (varsayılan zaten AES-GCM + RSA-OAEP). İnternetteki örneklerin çoğu eski API'yi gösteriyor | Seçeneksiz `const FlutterSecureStorage()` |
| ⚠️⚠️ **Kalıcı "yükleniyor" ekranı** | Ekran boş kalıyor, Dart tarafında **görünür hata basılmıyor**. Teşhisi zor çünkü arıza sessiz | ⭐ **İlk bakılacak yer: yerel API gerçekten ayakta mı** (`curl 127.0.0.1:3002/healthz`). İkincisi `adb reverse` kurulu mu — her USB bağlantısında sıfırlanıyor |
| ⚠️ **Cleartext engeli — SANILDIĞI GİBİ DEĞİL** | `adb reverse` + `127.0.0.1` yolu `usesCleartextTraffic` **GEREKTİRMİYOR**: izin tamamen kaldırılıp Android 16 cihazda ölçüldü, düz HTTP loopback sorunsuz çalıştı. İzin yalnız **LAN adresiyle** (`192.168.1.x`) geliştirirken gerekiyor | İzin debug manifestinde duruyor ama gerekçesi LAN senaryosu. ⛔ `src/main/`e taşınmaz |
| **XML yorumunda çift tire** | `AndroidManifest.xml` yorumuna `dart-define` bayrağı tam hâliyle yazılınca manifest birleştirme *"Error parsing AndroidManifest.xml"* ile kırılıyor — XML yorumları çift tire içeremiyor | Yorumda çift tire kullanma |
| **`flutter_secure_storage` 11 ↔ compileSdk** | Paket, kendisine bağımlı uygulamanın **37+**'ye derlenmesini şart koşuyor; Flutter varsayılanı 36 → `checkDebugAarMetadata` kırılıyor | `android/app/build.gradle.kts` içinde `compileSdk = 37` sabit. AGP "önerilen en yüksek 36" diye uyarıyor — uyarı, engel değil |

---

## 8. Yol haritası

| Faz | İş | Biter sayılma ölçütü |
| :-- | :-- | :-- |
| **0 — Zemin** | `flutter create` ✅ · socket.io spike ✅ · bu belge ✅ · `tokens.dart` bağlantısı + kapı ✅ · test iskeleti ✅ · `mobile.yml` ✅ · **kalan:** `contracts` Dart üreteci + 4 kapı | `flutter test` yeşil, CI koşuyor |
| **1 — Kabuk ve oturum** ✅ | Güvenli depo ✅ · 9 başlık ✅ · **kalıcı instanceId** ✅ · yenileme (tek söz) ✅ · 409 çakışma perdesi ✅ · go_router kabuğu (alt bar + drawer) ✅ · giriş/kayıt ✅ · minimum sürüm kontrolü ✅ · misafir akışı ✅ · saat çekirdeği + eşitlik kapısı ✅ | Cihazda giriş yapılıyor, oturum hayatta kalıyor |
| **2 — Çekirdek oyun** | ⏳ Kabuk (bilgi çubuğu · şehir şeridi · şehir sekmeleri · alt bar) ✅ · WS bağlantısı + arka plandan dönüş ✅ · **Baraka TAM** ✅ · **Yapılar TAM** (yükseltme · iptal · ön koşul · üretim önizlemesi · karşılıklı kilit) ✅ · **Akademi TAM** ✅ · **Savunma TAM** (Baraka ile tek ekran, iki kip: adetli birim + seviye taşıyan Sur/Büyü Kalkanı) ✅ · **native katman** (bottom sheet · titreşim · uzun basma künyesi) ✅ · **Ordular TAM** (şehir şeridi + altına asılı hareket simgeleri · detay sheet'i + görev iptali · alt bar rozeti · şehir alarm noktası) ✅ · **Dünya listesi** (kıta/diyar seçici · 10 slot · hedef künyesi sheet'i · `/world/:k/:d` derin bağlantısı) ✅ · **sefer matematiği Dart'ta + diller arası vektör kapısı** ✅ · **sefer formu TAM** (seçenek listesi · ordu · kargo · kahraman · canlı süre) ✅ · **Tapınak TAM** (puan dağıtımı · ad değiştirme · dirilt/durdur) ✅ → **ŞEHİR SEKMESİ BİTTİ** · **Posta kutusu TAM** (iki sekme + sunucu sayfalaması · uzun basmayla seçim ve toplu silme · alt bar rozeti · savaş raporu · casusluk raporu (iki yüz) · ittifak Kabul/Red · sistem duyurusu) ✅ · **Sohbet (DM) TAM** (sohbet listesi Mesajlar sekmesine karıştı · ters liste + eski sayfa · engelle/şikayet/sil · Dünya'dan «Mesaj gönder» · yazma kapıları) ✅ · **Komuta Merkezi TAM** (Genel Durum künyesi + devrik şehir tablosu · üç dallı Sıralama + «Beni göster» + satır künyesi · Arama) ✅ → **ALT BARIN BEŞ SEKMESİNİN BEŞİ DE GERÇEK EKRAN** · **WS oda katmanı + Genel Sohbet TAM** (bağlan/kopar modeli · bahsetme vurgusu · «yazıyor…» · mevcudiyet sayacı) ✅ · **DM «yazıyor…»** ✅ · **İttifak sohbeti TAM** (üye listesi · susturma/kaldırma yetki matrisi · mesaj kaldırma) ✅ · **İttifak ekranı TAM** (künye · üye listesi · yönetim matrisi · kur/başvur/ayrıl/dağıt · herkese açık künye) ✅ → **Komuta Merkezi'nin DÖRT SEKMESİ de dolu** · **kalan:** i18n | v1 kapsamı oynanabilir |
| **3 — Bildirim** | ⚠️ Sunucu: `push_subscriptions` göçü + `FcmSender` + kayıt ucu · İstemci: FCM + local notifications + derin bağlantı | Bildirime tıklayınca doğru ekran açılıyor |
| **4 — Google giriş** | Sunucu: `google.verifier.ts` + kimlik tablosu + iki adımlı kullanıcı adı akışı · İstemci: `google_sign_in` 7.x · **web'e de eklenir** | İki istemcide de çalışıyor |
| **5 — Attestation** | Play Integrity sinyalini **topla, kapı koyma** (`MOBIL_UYGULAMA.md` §9-2) | Sinyal DB'ye düşüyor |
| **6 — Eşitlik** | İttifak · Destek · Tapınak · Simülatör · **Denge** · Seçenekler panelleri | Web'deki 20 ekranın karşılığı tam |

⚠️⚠️ **Faz 3'ten sonra API'de kırıcı değişiklik yasağı başlar** (`DAGITIM.md` §6). Bu yüzden
**minimum sürüm kontrolü Faz 1'de** — kapı olmadan mağazaya çıkmak geri dönülemez bir karardır.

⚠️ Faz 6'nın en büyük parçası **Denge tezgâhı**: `apps/web/src/lib/balance-model.ts` 535 satır
saf hesap ve Dart'a portu gerekiyor. v1'i bloke etmiyor, bu yüzden sona bırakıldı.

---

## 9. 📌 Sonradan eklenenler — fikir defteri

> Bu bölüm **bilerek açık uçlu**. Akla gelen yeni özellik, fark edilen eksik ya da alınan
> karar buraya tarihiyle yazılır; sırası geldiğinde §8'deki faz tablosuna taşınır.
> Kullanıcı isteği (2026-08-15): *"Aklımıza geldikçe yeni özellikleri de bu dosyaya
> ekleyebilmeliyiz."*

| Tarih | Fikir / eksik | Durum |
| :-- | :-- | :-- |
| 2026-08-15 | Misafir derin bağlantıyla `/armies`'e gelirse geri dönülecek adres hatırlanmıyor (web'de de bozuk, `App.tsx:206-208`) — mobilde baştan doğru yapılabilir | 📋 Faz 1 |
| 2026-08-15 | Tema/dil tercihi için sunucu ucu YOK (`updatePreferencesRequest` şeması var, uç yok) — cihazlar arası taşınması isteniyorsa eklenmeli | 🔵 karar bekliyor |
| 2026-08-15 | `/api/v1/auth/refresh` hız sınırı listesinde değil — yenileme fırtınası korumasız | 📋 Faz 1 |
| 2026-08-15 | Bildirim yükündeki `url` alanı **web rotaları** taşıyor (`/armies`, `/messages?dm=`) → Flutter rota eşleme tablosu gerekecek | 📋 Faz 3 |
| 2026-08-17 | ⭐⭐ **Native davranış politikası kuruldu** (`ui/native.dart`): web'de modal olan her şey mobilde **bottom sheet**; titreşim üç seviye (emir → hafif, yıkıcı onay → orta, red → ağır); web'de tooltip olan künye mobilde **uzun basma + sheet**. Kural ortak dosyada, çünkü ekran ekran serbest bırakılsa her ekran kendi tonunu seçerdi | ✅ kuruldu |
| 2026-08-17 | Savunma ekranı Baraka'nın ŞEKLİNDE (adetli üretim + seviye taşıyan Sur/Büyü Kalkanı bir arada). Web'de tek bileşen: `Trainable({kind})`. Mobilde de `barracks_screen` **`kind` alacak biçimde genelleştirilmeli**, ikinci bir kopya yazılmamalı | 📋 sıradaki tur |
| 2026-08-17 | Mağara meşguliyeti (`cave.repairing` / `cave.job`) `CityDetail`te YOK → Yapılar'da mağara kilidi bugün `false`. Sunucu reddediyor, yani hata değil eksik. Mağara ekranı gelince modele eklenecek | 📋 Mağara turu |
| 2026-08-17 | ⭐⭐ **Ordular = şerit + asılı hareket simgeleri; metinli liste YOK** (kullanıcı kararı, aynı gün iki turda netleşti). İlk yazımda tersi yapılmıştı — simgeler taşınmamış, yerine metinli liste konmuştu; gerekçe *"üstteki bant alttaki listenin tekrarı"* idi ve **yanlış tarafı sildi**. Tekrarı kaldırmanın iki yolu vardı, oyunun kendi dili simgelerden yana. Bant yalnız `/armies`te görünüyor, hareket sayısına göre aşağı uzuyor ve gerekirse kaydırılıyor. ⚠️ Bu yüzden şerit orada **kabukta değil sayfa gövdesinde** (`armies_screen.dart`): sınırsız yükseklik ancak orada mümkün. Ek olarak **alt bar rozeti** ve **kırmızı alarm noktası** kaldı — ikisi de tekrar değil, ikisi de sıfır dikey yer kaplıyor | ✅ karar verildi |
| 2026-08-17 | ⚠️ **Metin ok karakteri `↩` (U+21A9) Android'de EMOJİ olarak çiziliyor** — dönüş rozeti, rengi ne olursa olsun mavi bir kutuya dönüşüyordu. Web'de aynı karakter düz metin. Kural: oyunun kendi görseli olmayan simgelerde **Material ikonu** kullan (`Icons.undo`), metin sembolü değil | ✅ düzeltildi |
| 2026-08-17 | ⚠️ **`MwResource` Material ikonu çiziyordu** (`Icons.circle` / `Icons.eco`) — altın yerine düz daire, yemek yerine yaprak. Oysa `assets/ui/gold.png` ve `food.png` depoda ve `info_bar.dart` onları kullanıyordu, yani **aynı ekranda iki farklı kaynak gösterimi** vardı. Kural: kaynak/birim/yapı/teknik/görev simgeleri **daima** web'le aynı dosyalardan | ✅ düzeltildi |
| 2026-08-17 | ~~Aşağı çekip tazeleme hiçbir ekranda yok~~ → **2026-08-19'da ONU ekranların hepsine bağlandı** (`MwRefresh`). ⚠️ Not iki yerde bayattı: jest aslında `CityData`da VARDI ama **iki sessiz kusurla** — (1) `onRefresh` `invalidate`ten sonra beklemiyordu, yani çark veri gelmeden kayboluyor ve oyuncu eski sayılara bakarken "tazelendi" sanıyordu; (2) fizik verilmediği için **kısa içerikli ekran hiç kaydırılamıyor**, dolayısıyla jest hiç doğmuyordu (boş posta kutusu, tek satırlık Akademi). İkisi de düzeltildi | ✅ kapandı |
| 2026-08-19 | ⭐⭐ **Fizik tuzağını API kapatıyor.** `MwRefresh` bir `child` DEĞİL, `builder(physics)` alıyor: çağıran fiziği yazmayı "unutamaz", kutunun içine koymak zorunda. `child` alsaydık fiziği dışarıdan dayatmanın yolu yok ve her yeni ekran aynı hatayı yeniden yapardı — üstelik hata **sessiz**: ekran çalışıyor görünür, yalnız jest hiç doğmaz | ✅ karar verildi |
| 2026-08-19 | ⚠️ **Tazeleme kümesi ekrana göre DAR tutuldu**: Dünya yalnız diyarı (şehir listesi ilgisiz), Tapınak tapınak+şehir (diriltme kaynak harcıyor, üst bardaki kasa aynı jestle güncellenmeli), Mesajlar iki kaynağı da (ekran ikisini birleştiriyor), Komuta Merkezi **aktif sekmeye göre** (dördünü birden geçersiz kılmak, oyuncunun bakmadığı üç isteği her jeste eklemek olurdu). ⚠️ `mwRefreshAll` hataları YUTUYOR: ekran zaten hata kutusunu çiziyor, jestin işi çarkı doğru anda kaldırmak | ✅ karar verildi |
| 2026-08-17 | ⭐ **Olgu üreteci büyüdü**: `kHeroSkills` (dört yeteneğin anahtar/simge/etiketi, oyunun kendi sırasıyla) ve `kNameMin`/`kNameMax`/`kNameRuleMessage` de artık `ops/facts-to-dart.ts`ten geliyor. Ad sınırını elle yazmak web'de hataya yol açmıştı — kutu 2-24 diyordu, sunucu 3-10 istiyordu ve reddi oyuncu ancak kaydedince görüyordu | ✅ kuruldu |
| 2026-08-17 | ⚠️ **Sefer formunun ilk yazımında gövde ve alt bölüm iki ayrı builder'dı** ve durumu paylaşmak için ekrana özel bir Riverpod scope'u kurulmuştu; depodaki diğer formlar durumu düz `setState` ile tutuyor. `mwTallSheet` artık tek bir `child` alıyor, form kendi `Column`'unu veriyor (üstü `Expanded` ile kayıyor, altı sabit) | ✅ sadeleştirildi |
| 2026-08-17 | ⭐⭐ **Sefer süresi önizlemesi cihazda sunucuyla BİREBİR doğrulandı**: ekran «38 dk 28 sn», sunucunun yazdığı `travelSeconds` 2308. Vektör kapısının sentetik olmayan kanıtı — gerçek Haritacılık seviyesi ve harita ayarlarıyla | ✅ ölçüldü |
| 2026-08-19 | ⭐⭐ **İttifak ekranı TEK EKRAN, İKİ YÜZ.** Sunucu tek istekte hangisini göreceğimizi söylüyor: üyeysem künye + üye listesi, değilsem kurma şartı + ittifak listesi. İki ekran yazmadık çünkü hangisinin geleceğini istemci **önceden bilmiyor** ve iki sağlayıcı, bilinmeyen bir dalın isteğini boşuna atmak olurdu | ✅ karar verildi |
| 2026-08-19 | ⚠️⚠️ **Yönetim matrisinde ÜÇ AYRI KAPI var ve genişlikleri farklı:** atmak Konsey'e açık, **rütbe değiştirmek yalnız Lider'e** (yoksa Konsey kendini çoğaltırdı), liderlik devri yalnız Lider'e. ⚠️ Atma matrisi susturmanınkiyle birebir olduğu için `canMute`e devrediliyor — iki kopya yazsaydık biri düzeltilip diğeri unutulurdu; test devrin gerçekten aynı sonucu verdiğini 18 kombinasyonda kilitliyor | ✅ karar verildi |
| 2026-08-19 | ⚠️⚠️ **SON ÜYE KALAN LİDERDE «AYRIL» = «DAĞIT»** ve sunucu bunu SESSİZCE yapıyor. Ekran söylemezse lider ittifağını kazara siler; `leaveGate.disbands` yalnız onay metnini değiştirmek için var (etiket de «İttifaktan ayrıl (dağılır)» oluyor). ⚠️ Üye varken lider ayrılamıyor — düğme çizilmiyor **ve sebebi yazılıyor**: gizlemek tek başına yanlış olurdu | ✅ karar verildi |
| 2026-08-19 | ⚠️ **Başvuru düğmesinin görünürlüğü SUNUCUDAN** (`canApply` + `applyBlockedReason`), istemci yeniden türetmiyor — kural `alliance.service.apply`te yaşıyor ve iki yerde tutmak kayardı. ⚠️ Düğme yoksa **sebep yazılıyor**, sessizce gizlenmiyor. ⭐ Yönetim matrisi bunun TERSİ: orada karar istemcide kopya ama yine karar vermiyor, yalnız reddedilecek düğmeyi göstermiyor. Ayrım şu — kapı sunucuda, görünürlük nerede daha az kopyalanıyorsa orada | ✅ karar verildi |
| 2026-08-19 | ⭐ **`mwTextSheet` eklendi** (`ui/native.dart`): ad değiştirme · ittifak metni · toplu mesaj · ittifak kurma. Dördü de aynı üç şeyi istiyor (klavyede görünür kutu, sınır sayacı, geçersizde kapalı düğme) ve ekran ekran yazılsaydı biri her seferinde unutulurdu. ⚠️ Dönüş `null` = iptal, boş dize = gerçek değer — ittifak metnini SİLMEK meşru ve ikisini birleştirmek onu imkânsız kılardı | ✅ kuruldu |
| 2026-08-19 | ⚠️ **`ALLIANCE_RULES` elle yazıldı ve bu bir borç:** olgu üreteci taşımıyor çünkü sabitler `packages/catalog`ta değil **`apps/api` içinde** ve üreteç oradan import edemiyor (sınır `scoring.ts`te yazılı). Sayılar ayrışırsa kutu sunucunun reddedeceği bir adı kabul eder — ad kuralında tam bu yaşandı. Testler sunucudaki değerlerle karşılaştırıyor | 📋 üreteç turu |
| 2026-08-19 | ⭐⭐ **İTTİFAK SOHBETİNDE MODERASYON VAR, GENEL SOHBETTE YOK** — ve fark bir tutarsızlık değil, yetkinin kaynağı. Genel sohbette susturma/silme `AdminGuard` altında (oyun yönetimi, web paneli); ittifakta kapı **ittifak rütbesi** ve o kişi oyunu telefondan oynuyor olabilir. ⚠️ Matris sunucudan (`assertCanModerate`) KOPYALANDI ve karar VERMİYOR — sunucu son sözü söylüyor, istemcinin işi reddedilecek bir düğmeyi hiç göstermemek. Kopya olduğu için her satırı ayrı ayrı testli | ✅ karar verildi |
| 2026-08-19 | ⚠️⚠️ **EN KOLAY KAÇIRILACAK ASİMETRİ:** susturmada kendine dokunmak YASAK, mesaj silmede SERBEST. «Kendini susturamazsın» anlamlı bir koruma, «kendi sözünü geri alamazsın» değil — susturma ileriye, silme geriye bakıyor. ⚠️ İkinci asimetri: **ayrılmış üyenin mesajı serbest** (rütbesi artık bu ittifağın rütbesi değil); kapatsaydık ayrılan bir üyenin küfrü kanalda kalıcı olurdu — tam da silmenin var olma sebebi. İstemcide "ayrılmış" demek: gönderen üye listesinde YOK (`roleOf` → `null`) | ✅ karar verildi |
| 2026-08-19 | ⚠️ ~~İttifak Sohbeti geçici olarak «Daha» menüsünde~~ → **AYNI GÜN TAŞINDI**: doğru evi İttifak ekranı ve o ekran geldi. Geçici madde kaldırıldı | ✅ kapandı |
| 2026-08-19 | ⭐⭐ **WS ODA KATMANI KURULDU** — iki turdur ertelenen parça. `Realtime` artık iki AYRI yol taşıyor: `kInvalidates` olayları **haber** (`{topic, ref}` → sorguyu tazele, tek doğru kaynak HTTP kalır), `kRoomEvents` ise **yük** («yazıyor…», mevcudiyet sayacı). ⚠️ İkisi ayrı kalmalı: oda olaylarının tazeleyecek bir sorgusu YOK — kimin yazdığı ve kaç kişinin bağlı olduğu hiçbir tabloda durmuyor, yalnız o anda var. Testi çakışmayı kilitliyor. ⚠️⚠️ `_rooms` tablosu **yeniden bağlanma için ŞART**: soket kopunca sunucudaki oda üyeliği de gidiyor ve istemci hatırlamazsa sohbet ekranı açık kalır, sessizce hiçbir olay almaz — `battle:resolved`in bir zamanlar yaptığı sessiz arızanın aynısı | ✅ kuruldu |
| 2026-08-19 | ⚠️⚠️ **Sunucuda ÜÇ AYRI oda olay çifti var ve tek bir `chat:open` YETMİYOR** (`realtime.gateway.ts`): her slot tek kanal tutuyor ve açılışta önce eskisinden çıkılıyor. Oyuncu aynı anda bir DM, ittifak sheet'i ve genel sohbet açık tutabiliyor — ortak slot ikisini birbirinin odasından atardı. `MwChatRoom` enum'u üç çifti taşıyor, test de adların birbirinden farklı olduğunu kilitliyor | ✅ karar verildi |
| 2026-08-19 | ⭐⭐ **Genel Sohbette «bağlı mıyım» bayrağı YOK: sheet açıksa bağlıyım.** Kullanıcı tarifi mobil için zaten buydu (*"alttan açılsın, açık olduğu sürece sohbete bağlı kabul edilsin"*). Kopukken **hiçbir sorgu dönmüyor** — açılış paketi de geçmiş de yalnız sheet mount olunca okunuyor, WS olayı da yalnız odadayken geliyor. Sessizlik bir bayrakla değil **yaşam döngüsüyle** sağlanıyor | ✅ karar verildi |
| 2026-08-19 | ⚠️⚠️ **«Yazıyor…» için zamanlayıcı DEĞİL, son-görülme DAMGASI.** Web'de her olay kendi 3 sn'lik zamanlayıcısını kuruyor ve hiçbiri iptal edilmiyordu: karşı taraf durmadan yazarken ilk olayın zamanlayıcısı ateşleyip göstergeyi kapatıyordu — gösterge yanıp sönüyordu (kullanıcı bildirdi). Damga + saniyelik süzme (`tickProvider`) o sınıf hatayı **yapısal olarak** imkânsız kılıyor. ⚠️ Şerit **koşulsuz** çiziliyor, yalnız metni gidip geliyor: belirip kaybolan bir şerit son mesajı zıplatırdı | ✅ karar verildi |
| 2026-08-19 | ⚠️⚠️ **Bahsetmeler istemcide PARSE EDİLMİYOR** — kullanıcı adında boşluk serbest olduğu için `@ad`ın nerede bittiği metinden çözülemez; ayrımı üye listesini gören sunucu yapıyor ve **indeks** gönderiyor. ⭐ Dilimleyicinin garantisi: bozuk bir aralık bir bahsetmenin vurgulanamamasına yol açabilir ama **bir harfin bile kaybolmasına ASLA**. Çakışma süzgeci kaldırılınca test metnin ÇOĞALDIĞINI gösterdi (`@AliVeli` → `@AliVeliVeli`) | ✅ karar verildi |
| 2026-08-19 | ⛔ **Genel Sohbette taşınmayan iki şey:** `@` önerisi (autocomplete) yalnız bir kolaylık — bahsetmeyi sunucu gövdeden çözüyor, yani `@ad` elle yazıldığında da çalışıyor; öneri kutusu dar ekranda klavyenin üstünde ayrı bir katman ister. **Yönetici susturma/mesaj silme** `AdminGuard` altında ve yönetim işleri web panelinde — mobil istemciye koymak yetki modelini ikinci bir yüzeyde tekrar etmek olurdu. ⚠️ `RoomOpen.isStaff` yine de okunuyor, ileride eklenecek düğme ikinci bir istek gerektirmesin diye | 📋 ileride |
| 2026-08-19 | ⚠️ `worldStateProvider` eklendi ama **yalnız `globalChat` bayrağı** okunuyor. Aynı uç bakım perdesini de besliyor (`paused`/`notice`) ve o perde mobilde HÂLÂ YOK; okunup kullanılmayan alan, ekranda karşılığı olmayan veri taşımak olurdu. Perde geldiğinde bu sağlayıcı büyüyecek | 📋 bakım perdesi turu |
| 2026-08-18 | ⭐⭐ **ŞEHİR TABLOSU: yatay kaydırma ama İLK SÜTUN SABİT.** Tablo devrik (satır = kalem, sütun = şehir) ve beş şehirde yedi sütun telefona sığmıyor. Savaş raporunda tabloyu tamamen bırakmıştık çünkü orada kaydırma **bilgiyi gizliyordu**; burada gizlemiyor — kalem adı ekranda kalıyor ve başlık satırı şehir adlarını yazıyor, yani oyuncu neye baktığını hiç kaybetmiyor. ⚠️ Sabit sütun ile kayan sütunlar AYRI `Column`'lar; hizaları ancak **aynı sabit satır yüksekliğiyle** tutuyor | ✅ karar verildi |
| 2026-08-18 | ⭐ **Olgu üreteci yine büyüdü**: `kMeritTiers` (askerî unvan basamağı → rozet dosyası + ad) ve `kLevelBased` (Sur · Büyü Kalkanı · Tapınak). İkisi de elle yazılsaydı **sessizce** yanlış olurdu: unvan rozeti çizilmez (`MwIcon` bulunamayan dosyada hata vermiyor), seviye taşıyan kalem «Sur 5» diye beş adet sur gibi okunur ve şehirler arası toplanırdı. ⚠️ Unvanın `threshold`/`days` alanları BİLEREK taşınmadı — ikisi de panelden dünya başına değiştirilebiliyor, sabit tablo ayarı değiştirilmiş dünyada yalan söylerdi | ✅ kuruldu |
| 2026-08-18 | ⚠️⚠️ **Komuta Merkezi'nde sekme = DURUM, rota DEĞİL.** Web'de her sekme ayrı rota (`/command/rankings`), çünkü orada geri tuşu tarayıcının tuşu. Mobilde geri tuşuna basan oyuncunun beklediği şey **ekrandan çıkmak**; alt sekmeleri rota yapsaydık Sıralamalar'dan Genel Durum'a düşerdi. ⚠️ `TabBar` da kullanılmadı: `TabBarView` sekmelerin hepsini birden kuruyor, yani oyuncu hiç bakmadan üç istek atılırdı | ✅ karar verildi |
| 2026-08-18 | ⚠️ **Komuta Merkezi'nde İttifak sekmesi YOK** — web'de var ve `AllianceScreen`i gömüyor; o ekranın kendisi Faz 6. Sıralamanın **İttifak dalı** çalışıyor ama satırı pasif: açılacak künye bir ittifak künyesi olurdu. ⚠️ Kahraman dalında satır AÇILIYOR, çünkü `playerId` geliyor (kahramanın sahibi) — ve `row.id` orada KAHRAMAN kimliği, ikisini karıştırmak rastgele bir oyuncuya sohbet açardı | 📋 Faz 6 |
| 2026-08-18 | ⚠️ **Saat dilimi: `toLocal()`, IANA değil.** Web «güncelleme HH:mm»i `Europe/Istanbul`a sabitliyor; Dart'ta IANA desteği `timezone` paketi ister (~1 MB veri) ve tek bir «hh:mm» için bu ağır. Cihaz saati kullanılıyor — yurt dışındaki oyuncuda ayrışır, kabul edilen bir yaklaşım | ✅ karar verildi |
| 2026-08-18 | ⭐⭐ **SÖZLEŞME BORCU ÖDENDİ: `ChatConversation`** artık `contracts.g.dart`ten geliyor (`registry.ts`). Girebilmesinin sebebi `chat.service.ts` · `ConversationRow`un şemayla **birebir** olması. ⚠️ Kardeşi `chatMessage` BİLEREK eklenmedi: DM geçmişi ucu o şemanın ALT KÜMESİNİ döndürüyor (`senderName`/`isPinned`/`deletedAt` yok) ve üretmek, istemciye hiç gelmeyen üç alanı varmış gibi göstermek olurdu — defterin «sahte kapı» dediği şey. O model elle yazıldı, gerekçesi başlığında | ✅ ödendi |
| 2026-08-18 | ⭐⭐ **Sohbette ters liste — web'in en karmaşık parçası mobilde bedava.** `ChatWindow` kaydırma konumunu elle yönetiyor (`prevHeight` + `useLayoutEffect`: yeni mesajda dibe in, eski sayfa eklenince farkı hesapla). Flutter'da `ListView(reverse: true)` ikisini de kendiliğinden veriyor: index 0 dipte, listenin sonuna ekleme görüntüyü oynatmıyor. ⭐ Sunucu zaten en yeniyi önce döndürdüğü için web'deki `.slice().reverse()` de yok | ✅ karar verildi |
| 2026-08-18 | ⚠️⚠️ **Sohbet başlığında Cinzel YASAK** — orada karşı tarafın **kullanıcı adı** yazıyor ve Cinzel küçük harf taşımıyor («Mithlond» → «MİTHLOND», web'de yaşanmıştı). `mwTallSheet` bu yüzden `titleIsUserText` aldı; sistem başlıkları (rapor türleri) Cinzel'de kalıyor. Ayrım tam olarak «bu metni oyuncu mu yazdı» sorusu | ✅ eklendi |
| 2026-08-18 | ⚠️ **Sohbet geçmişinin eski sayfaları sağlayıcıda DEĞİL, sheet'in durumunda.** Riverpod'da "sonsuz sorgu" karşılığı yok ve ekrana özel bir Notifier kurmak sefer formunda bir kez denenip bırakılmıştı. Bölünme sağlam çünkü iki taraf da **id ile tekilleşiyor**; WS tazelemesi mükerrer balon üretmiyor | ✅ karar verildi |
| 2026-08-18 | ⛔ ~~«yazıyor…» göstergesi yok~~ → **KAPANDI 2026-08-19** (oda sohbeti turu): oda katmanı gelince DM'e de eklendi. ⚠️ DM odasının TEK işi bu — mesajın kendisi kişisel odaya gidiyor ki sohbet KAPALIYKEN de ulaşsın | ✅ kapandı |
| 2026-08-18 | ⭐⭐ **Posta kutusunda seçim ayrı bir KİP: uzun basma.** Web'de her satırın solunda kalıcı bir kutucuk var; telefonda kalıcı kutucuk satırın en dar kaynağını (yatay yeri) sürekli tüketiyor, oysa oyuncu kutuyu okumak için açıyor. Uzun basma tek başına keşfedilebilir olmadığı için panel başlığında ayrıca **«Seç»** düğmesi var — kip iki yoldan da açılıyor. ⚠️ Seçim sekme ve sayfa değişince **sıfırlanıyor**: «Hepsini Seç» yalnız görünen sayfayı seçiyor ve görünmeyen bir satırın seçili kalması, oyuncunun göremediği bir şeyi silmesi demek olurdu | ✅ karar verildi |
| 2026-08-18 | ⚠️ **Savaş raporundaki döküm TABLO DEĞİL, satır.** Web'de altı sütunlu gerçek bir `<table>`; 360 dp'ye sığmıyor ve yatay kaydırmaya alınsaydı raporun en önemli sütunu («ölen») ekranın dışında kalırdı — oyuncu kaydırmayı fark etmeden onu hiç görmezdi. Aynı veri satır başına tek hizada: solda ad, sağda «katılan → kalan» ve kayıp. Sütun başlıkları da kalktı, satır zaten okunuyor | ✅ karar verildi |
| 2026-08-18 | ⚠️ **Sayfa boyu seçicisi (10/20/50) taşınmadı** — masaüstü mobilyası; parmakla kaydırmak sayfa değiştirmekten ucuz. Mobilde sabit 20. Sayfalayıcı da yalnız birden çok sayfa varsa çiziliyor | ✅ karar verildi |
| 2026-08-18 | ⛔ **Casusluk raporundaki «Simülatöre Aktar» düğmesi YOK** — Simülatör ekranı mobilde yer tutucu ve olmayan bir ekrana götüren düğme, çalışıyormuş gibi görünen bir kapı olurdu. Faz 6'da o ekranla birlikte gelecek | 📋 Faz 6 |
| 2026-08-18 | ⚠️ ~~Mesajlar sekmesi tek kaynaklı~~ → **KAPANDI aynı gün** (Sohbet turu): birleştirme `mergeInbox`ta, saf ve testli. ⚠️ Sohbetler **yalnız Mesajlar sekmesinde ve yalnız ilk sayfada** — sayfalanmadıkları için her sayfaya eklenseler her sayfada tekrar görünürlerdi. ⚠️ İki kaynak iki farklı SİLME yolundan geçiyor ve tek uca indirilemez: mesaj gerçekten siliniyor, sohbet yalnız benden siliniyor ve karşı tarafta duruyor; onay metni bunu açıkça söylüyor | ✅ kapandı |
| 2026-08-18 | ⚠️ **Rapor gövdeleri `jsonb` ve tiplenmedi** — sunucuda da `Record<string, unknown>`. Dart'ta bir sınıfa daraltmak DERLENİR ama hiçbir şey ölçmez (sözleşme borcu defteri §4). Alanlar okundukları yerde savunmayla çözülüyor; kararların kendisi (`reportType`, `leakLabel`, `foundCityReason`, `clampPage`) saf fonksiyonlarda ve testli | ✅ karar verildi |
| 2026-08-18 | ⚠️ Rapordaki birim **adları sunucudan** geliyor (`ReportLine.name`), katalogtan değil — rapor savaş anındaki ada sadık kalıyor. **İstisna:** mağara kaçış dökümü ham `id` taşıyor ve ad `reportNamesProvider` (aktif şehrin kataloğu) ile çözülüyor. Adlar dünya ölçeğinde, şehir değişse de değişmiyor | ✅ karar verildi |
| 2026-08-17 | `movementsProvider` **aile DEĞİL** (uç `?cityId=` desteklese de): şerit ve rozet bütün şehirleri okuyor, aile olsaydı beş şehirli oyuncuda her tazelemede beş istek giderdi. Sefer ekranı tek şehir için süzme isterse istemcide süzülür | ✅ karar verildi |

---

## 10. Kaynaklar

- `MOBIL_UYGULAMA.md` — hesap kimliği, K0/K1/K2, attestation, telefon doğrulaması
- `DAGITIM.md` §6 — derleme, imzalama, mağaza, tek cihaz başlık sözleşmesi, API sürüm kısıtı
- `MOBIWAR_SISTEM_PLANI.md` §13.13 (tema) · §13.14 (adlandırma) · §13.16 (dünya ekranı)
- `apps/api/test/presence.test.ts` — mobilin `instanceId` sözleşmesi, testle kilitli
- `apps/mobile/tool/ws_spike.dart` — socket.io uyum kanıtı
