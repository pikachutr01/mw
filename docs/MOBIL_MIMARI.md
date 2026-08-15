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
| 2 | **`gameNow()` ≠ `serverNow()`** | `hooks.ts:113-118` | İki kez canlı hata üretti: casuslukta sürekli «varıyor», üretimde kalıcı «tamamlandı» |
| 3 | **`unitProgress` `startedAt` çıpası** | `City.tsx:616-630` | Sunucunun `done`/`remaining` alanları tanımı gereği bayat — **kullanılmaz** |
| 4 | **Simülatörde donmuş `ran` fotoğrafı** | `Simulate.tsx:227-255` | `undefined` («savaşa girmedi») ile `0` («girdi, yok oldu») ayrımı silinir |
| 5 | **WS `INVALIDATES` tablosu** + `presence:update` debounce'u | `realtime.ts:60-120,330` | Ekran tazelenmez ya da kalabalık ittifakta olay yağmuru |
| 6 | **`useSafetyNet()`** — WS bağlıyken 5 dk, kopukken 60 sn | `queries.ts:428` | Pil ve sunucu yükü |

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

### 4.1 Dört kapı, dördü farklı arıza

| # | Kapı | Yakaladığı | Flutter SDK gerekir mi |
| :-- | :-- | :-- | :-: |
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

### 5.2 ⭐⭐ Diller arası eşitlik kapısı

"Tam eşitlik" kararını umut olmaktan çıkarıp kapıya çeviren mekanizma:

TS testi `apps/web/test/fixtures/clock-vectors.json` üretir (sapma/duraklama/iso → beklenen
metin); Dart testi **aynı dosyayı** tüketir →
`⭐⭐ web ile AYNI vektörler AYNI metni üretir (tam eşitlik kapısı)`.

Aynı yöntem `unitProgress` için de uygulanır. ⚠️ Bunun ön koşulu: `unitProgress` bugün
`City.tsx` içine gömülü, **önce `apps/web/src/lib/`'e çıkarılmalı** ki iki taraf da test
edilebilsin ve vektör paylaşsın.

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

⚠️ `adb reverse` **her USB bağlantısında yeniden kurulur** — kalıcı değil. Ekranda kalıcı
"yükleniyor" görüyorsan ilk bakılacak yer burası (ikincisi cleartext izni, §7.1).

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
| ⚠️⚠️ **Android cleartext engeli** | Android 9+ düz HTTP'yi varsayılan olarak engelliyor. `adb reverse` + `http://127.0.0.1:3002` yolu **hiç çalışmıyor**: istek sessizce ölüyor, ekran kalıcı "yükleniyor"da kalıyor ve Dart tarafında görünür hata BASILMIYOR. Teşhisi zor | `android:usesCleartextTraffic="true"` **yalnız `src/debug/AndroidManifest.xml`**. ⛔ `src/main/`e taşınırsa üretim de düz HTTP kabul eder |
| **XML yorumunda çift tire** | `AndroidManifest.xml` yorumuna `dart-define` bayrağı tam hâliyle yazılınca manifest birleştirme *"Error parsing AndroidManifest.xml"* ile kırılıyor — XML yorumları çift tire içeremiyor | Yorumda çift tire kullanma |
| **`flutter_secure_storage` 11 ↔ compileSdk** | Paket, kendisine bağımlı uygulamanın **37+**'ye derlenmesini şart koşuyor; Flutter varsayılanı 36 → `checkDebugAarMetadata` kırılıyor | `android/app/build.gradle.kts` içinde `compileSdk = 37` sabit. AGP "önerilen en yüksek 36" diye uyarıyor — uyarı, engel değil |

---

## 8. Yol haritası

| Faz | İş | Biter sayılma ölçütü |
| :-- | :-- | :-- |
| **0 — Zemin** | `flutter create` ✅ · socket.io spike ✅ · bu belge ✅ · `tokens.dart` bağlantısı + kapı ✅ · test iskeleti ✅ · `mobile.yml` ✅ · **kalan:** `contracts` Dart üreteci + 4 kapı | `flutter test` yeşil, CI koşuyor |
| **1 — Kabuk ve oturum** | Güvenli depo ✅ · 9 başlık ✅ · **kalıcı instanceId** ✅ · yenileme (tek söz) ✅ · 409 çakışma perdesi ✅ · go_router kabuğu (alt bar + drawer) ✅ · giriş/kayıt ✅ · **kalan:** misafir akışı · minimum sürüm kontrolü | Cihazda giriş yapılıyor, oturum hayatta kalıyor |
| **2 — Çekirdek oyun** | Şehir (4 ekran + kuyruk) · Dünya · Ordular/sefer · Savaş raporu · Sohbet (3 kanal) · WS invalidation · i18n | v1 kapsamı oynanabilir |
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

---

## 10. Kaynaklar

- `MOBIL_UYGULAMA.md` — hesap kimliği, K0/K1/K2, attestation, telefon doğrulaması
- `DAGITIM.md` §6 — derleme, imzalama, mağaza, tek cihaz başlık sözleşmesi, API sürüm kısıtı
- `MOBIWAR_SISTEM_PLANI.md` §13.13 (tema) · §13.14 (adlandırma) · §13.16 (dünya ekranı)
- `apps/api/test/presence.test.ts` — mobilin `instanceId` sözleşmesi, testle kilitli
- `apps/mobile/tool/ws_spike.dart` — socket.io uyum kanıtı
