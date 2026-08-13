# YÖNETİM PANELİ — kurulum ve durum

> Mimari plan ve fazların tamamı için commit geçmişine bak; bu belge **çalışan sistemin
> künyesi**: nerede yaşıyor, nasıl açılır, hangi faz bitti.

---

## Durum

| Faz | Konu | Durum |
| :-- | :-- | :-- |
| 0 | Rol · guard · adım yükseltme · `apps/admin` iskeleti | ✅ **bitti** (2026-07-31) |
| 1 | Ayarlar altyapısı · dünya ekranı · manuel sıralama | ✅ **bitti** (2026-07-31) |
| 2 | Bakım modu uçtan uca | ✅ **bitti** (2026-07-31) |
| 3 | Oturum ve cihaz yönetimi | ✅ **bitti** (2026-07-31) |
| 4 | Savaş motoru sabitleri | ✅ **bitti** (2026-07-31) |
| 5 | Katalog sabitleri | ✅ **bitti** (2026-07-31) |
| 6 | Oyuncu ve moderasyon (+ `chat_bans` canlandırma) | ✅ **bitti** (2026-07-31) |
| 7 | Veri tabanı tarayıcı + aksiyonlar | ✅ **bitti** (2026-08-01) |
| 8 | Bakım/performans | ⏳ |

---

## Nerede yaşıyor

```
apps/web/dist    →  oyun            (admin kodundan TEK BAYT yok)
apps/admin/dist  →  yönetim paneli  (ayrı Vite derlemesi)
API              →  /api/v1/admin/* (AdminGuard)
```

⭐ **Ayrı derleme hedefi olmasının tek sebebi:** oyuncunun indirdiği pakete admin kodu
girmesin. Aynı SPA içinde tembel yüklenen bir parça olsaydı kod yine dağıtılan pakette dururdu
(chunk adı manifest'ten okunabilir); ayrı derleme bunu **yapısal olarak** imkânsız kılıyor.

⚠️ `apps/admin` → `apps/web` bağımlılığı **yok** ve olmamalı. Ortak olan yalnız paketler
(`contracts`, `catalog`, `design-tokens`).

### Geliştirmede

```bash
pnpm --dir mw --filter @mobilwar/admin dev
```

Oyun 5173'te, panel **5174**'te. İkisi de `/api`yi 3002'ye proxy'liyor.

### Üretimde (nginx — ✅ UYGULANDI, 2026-08-02)

> ⚠️ Aşağıdaki blok **öğretici bir özet**; canlıdaki gerçek dosya `ops/nginx/admin.mobilwar.com.conf`
> ve ondan daha fazlasını içeriyor (Cloudflare dışından gelen isteği düşüren `444` kuralı,
> `/healthz` proxy'si, önbellek başlıkları). Değişiklik gerekiyorsa **o dosyayı** düzenle.

Alt alan **`admin.mobilwar.com`** (2026-08-02 kullanıcı kararı; eskiden `yonetim.` yazıyordu).
Önünde ayrıca **Cloudflare Access** var: panele ulaşmadan önce e-posta doğrulamalı kapı — bot
taraması panelin giriş ekranını hiç görmez. Access, panelin kendi `AdminGuard`'ının **yerine
geçmez**, önüne eklenir.

```nginx
server {
    server_name admin.mobilwar.com;
    root /var/www/mobilwar-admin;           # apps/admin/dist
    index index.html;

    # SPA: bilinmeyen yol index'e döner
    location / { try_files $uri $uri/ /index.html; }

    # API aynı sürece gider; yetki sınırı AdminGuard'ta, ağ katmanında değil
    location /api/ { proxy_pass http://127.0.0.1:3002; }

    # ⚠️ Panel indekslenmesin
    add_header X-Robots-Tag "noindex, nofollow" always;
    # ⚠️ Panel çerçevelenmesin (clickjacking)
    add_header X-Frame-Options "DENY" always;

    listen 443 ssl;                        # certbot --nginx ile
}
```

---

## Yetki modeli

```
accounts.role        player | moderator | admin
sessions.elevated_until   adım yükseltmesinin bitiş anı (15 dk)
```

**İki kademe:**

| Guard | Ne ister | Neyi açar |
| :-- | :-- | :-- |
| `AdminGuard` | `role ∈ {moderator, admin}` | Panel açılır, okuma serbest |
| `AdminStepUpGuard` | `elevated_until > now()` | Yıkıcı işlem (silme · sabit kaydetme · ham düzenleme) |

⚠️ **Rol access token'a GÖMÜLMEZ.** `AdminGuard` her istekte `accounts`tan okur. Token'a
gömseydik rolü geri aldığımızda token ömrü boyunca (bugün varsayılan **12 saat**,
`session.accessTtlHours`) geçerli kalırdı — "adminliği aldım" dedikten sonra yarım gün hâlâ admin. Bedeli `accounts_staff` kısmi indeksi üzerinden tek
satır okuması. Testle sabitlendi (`admin.test.ts` → *"rol geri alınınca AYNI oturumda anında
etkisiz"*).

⚠️ **Yükseltme OTURUMA ait, hesaba değil.** Bir sekmede yükseltmek diğerini açmaz; bu da
testte.

### Rol atama

Panelden rol atama **yok** (bilinçli — ilk adminin kendini yaratması gerekirdi). Elle:

```sql
UPDATE accounts SET role = 'admin' WHERE email = 'senin@adresin';
```

---

## Uçlar (Faz 0)

| Uç | Guard | İş |
| :-- | :-- | :-- |
| `GET /api/v1/admin/me` | Admin | kim · rol · yükseltme taze mi |
| `POST /api/v1/admin/step-up` | Admin | parola ister, 15 dk yükseltme yazar |
| `POST /api/v1/admin/step-down` | Admin | yükseltmeyi bırakır |
| `POST /api/v1/admin/echo-elevated` | Admin + StepUp | kapının kapalı olduğunu ölçen prob |

⚠️ Yanlış parolada `accounts.failed_logins` **bilerek artırılmıyor**: o sayaç giriş ucunun kaba
kuvvet kilidi; buradaki kullanıcı zaten kimliğini kanıtlamış bir admin ve yanlış yazması kendi
hesabını kilitlememeli. Buraya gelmek için geçerli bir admin oturumu gerekiyor zaten.

---

## Ayarlar katmanı (Faz 1)

### ⭐ Sıcak yolda sorgu YOK — ölçüldü

Kullanıcının katalog fazını onaylarken sorduğu soru buydu: *"bu değerleri veri tabanına alırsan
oyun her seferinde oradan okuyup ek yük oluşturacak mı?"*

```
Açılışta bir kez:    settings tablosu ──► donmuş bellek-içi anlık görüntü (dünya başına)
Her istekte:         chatLimits().burst ──► ÖZELLİK OKUMASI, 0 sorgu
Admin kaydettiğinde: yazım + pg_notify('mw_settings') ──► tüm süreçler yeniden yükler
```

**Ölçüm:** `apps/api/test/settings.test.ts` → *"yüklemeden sonra 1000 okuma = 0 sorgu"*.
`db.execute` sarılıp sayılıyor; sıcak yola I/O sızarsa test kırılır. Bu test **kalıcıdır** —
Faz 5 (katalog) bu varsayıma dayanıyor.

**Süreçler arası yayılma da ölçüldü:** ikinci bir süreç `SettingsService` ile ayağa kaldırıldı,
panelden değer değiştirildi, ikinci süreç değişikliği gördü (33 → 44).
⚠️ İlk ölçümde "çalışmıyor" sonucu çıkmıştı; sebep koddaki bir hata değil, sondanın 15 saniyelik
penceresinin tetikten önce dolmasıydı. **Ölçüm aracının kendi hatası, ölçtüğü şeyin hatası gibi
okunuyor** — bu turda ikinci kez yaşandı.

### Katman sırası

```
şema varsayılanı  →  env  →  settings(world_id = 0)  →  settings(world_id = N)
```

⚠️ **`env` DB'nin ALTINDA.** Panelden bir değer kaydedildiği an `.env` o ayarı artık yönetmiyor.
Tersi olsaydı panelden yapılan değişiklik sunucu yeniden başlayınca sessizce geri alınırdı.

⚠️ `world_id = 0` gerçek bir dünya değil, "tüm dünyalar için varsayılan". Bu yüzden `worlds`a
yabancı anahtarı yok.

### ⚠️⚠️ Kapsam sınırı — Faz 1'de bilinçliydi, 2026-08-10'da ARIZAYA dönüştüğü ölçüldü

**Eski karar:** işletim limitleri (`chatLimits()`, `notifyLimits()`, `mailLimits()`) **dünya 0
katmanından** okunuyordu. Gerekçe sağlamdı: bu okuyucular `worldId` bilmeyen yerlerde de
çağrılıyor (`mail/templates.ts`, `mail.service.ts`).

**Sorun:** panel **daima dünya 1'e** yazıyor (`apps/admin/src/App.tsx` → `login({… worldId: 1 })`).
İki karar ayrı ayrı savunulabilirdi; **birlikte** ise panelin yazdığı katmanı hiçbir tüketicinin
okumadığı anlamına geliyordu. Ölçüm:

```
panelden chat.burst = 99
  snapshot(1).effective.chat.burst → 99   ✓ kayıt gerçekten yazılmış
  chatLimits().burst               → 5    ✗ tüketici varsayılanı kullanıyor
```

⚠️ Bu **on bir grubu** kapsıyordu: `chat` · `allianceChat` · `globalChat` · `verify` ·
`vacation` · `session` · `mail` · `notify` · `ratelimit` · `abuse`. Panel *"kaydedildi, tüm
süreçlerde hemen etkin"* diyordu ve kayıt gerçekten yazılıyordu — yalnız kimse okumuyordu.

⚠️ **Aynı arıza 2026-08-08'de bir kez daha görülmüştü** (savaş ayarı) ve `liveNumberFor`
kapısıyla çözülmüştü — ama kapıdan yalnız ÜÇ çağrı noktası geçirilmişti (`mission` · `scoring` ·
`placement`). Yani o düzeltme hatanın kendisini değil, tek bir örneğini kapatmıştı.

**Çözüm:** köprü artık `snapshot(primaryWorldId())` ile besleniyor — yani **sürecin hizmet
ettiği dünyanın** birleştirilmiş görüntüsüyle. Katman sırası korunuyor (dünya 0 → dünya N), yani
kurulum geneli ayarlar aynen geçerli, üstüne o dünyanınki biniyor. Davranış hiçbir koşulda
eskisinden dar değil.

⚠️ **Kalan sınır (teorik):** çok dünyalı kurulumda `worldId` bilmeyen bir okuyucu, sürecin
birincil dünyasının katmanını görür. Bugün her süreç tek dünyaya hizmet ediyor (`WORLD_ID`,
§4.0). Gerçekten dünya bazlı olması gereken okuyucular zaten `liveNumberFor` kullanıyor.

Bekçi: `settings.test.ts` → *«dünya bilmeyen okuyucular da panelin katmanını görür»*.

### ⚠️ Ayarı okuyan servisi ÇÖZÜCÜSÜZ kurmama kuralı

Ayar bir servise **fonksiyon olarak** geçiyor (`new CityService(db, (w) => s.catalog(w), …)`).
Fonksiyonu vermeyen bir örnek `DEFAULT_CATALOG_CONFIG`e düşer ve panel **sessizce** etkisiz kalır.

2026-08-10'da iki kurban bulundu ve düzeltildi:

| Yer | Ne kırılmıştı |
| :-- | :-- |
| `AuthService` | **Başlangıç altını/yemeği** yeni kayıt olan oyuncuya hiç ulaşmıyordu — herkes varsayılan 4000/4000 ile başlıyordu |
| `worker.ts` | Worker'ın `CityService`i katalogsuzdu: aynı şehir, API tarafından ayarlanmış üretim hızıyla, worker tarafından (savaş, nakliye varışı) **varsayılan** hızla materyalize ediliyordu |

⚠️ Bu tür parametreler **isteğe bağlı yapılmamalı**: varsayılanı olan bir parametre tuzağı açık
bırakır. `AuthService`inki bu yüzden zorunlu. Bekçi: `catalog-settings.test.ts` →
*«ayar servise ULAŞIYOR mu»*.

### Nerede ne duruyor

| Sabit ailesi | Yer | Neden |
| :-- | :-- | :-- |
| Hız çarpanları (4) | `worlds` kolonları | Oyun kodu zaten her sorguda oradan okuyor; `settings`e kopyalamak ikinci doğruluk kaynağı olurdu |
| İşletim limitleri | `settings` tablosu | Eskiden `.env`di; yeniden başlatma gerektiriyordu |
| Sırlar (Resend anahtarı, VAPID) | **yalnız `.env`** | ⛔ Ayarlara taşınmaz: veri tabanına yazıp panelde göstermek onları yedeklere ve tarayıcı geçmişine sızdırmak olurdu |

### Manuel sıralama

Sıra normalde 00/08/16'da donuyor (§13.17.2). `POST /admin/worlds/:id/ranking-run` aradaki bir
anda elle aldırır.

⚠️ Anlık görüntü **doğrudan alınmıyor**, bir `ranking_snapshot` görev satırı yazılıyor: sıralama
zaten bir görev olarak modellenmiş ve o yol audit + outbox + `ranking:updated` olayını birlikte
üretiyor. Elle `takeSnapshot` çağırmak aynı işi ikinci bir kod yolundan yapmak olurdu ve ikisi
zamanla ayrışırdı.

---

## Bakım modu (Faz 2)

Kullanıcının cümlesi: *"her şey aniden donar ve bakım bitiminde kaldığı yerden devam eder."*
Donmanın yarısı **saatte**, yarısı **kilitte**.

```
POST /admin/worlds/:id/pause    → saat donar + perde metni + WS duyurusu   (adım yükseltmesi)
POST /admin/worlds/:id/resume   → duraklama offset'e eklenir, kilit kalkar (adım yükseltmesi)
PUT  /admin/worlds/:id/notice   → bakım sürerken metni güncelle            (adım yükseltmesi)
GET  /api/v1/world/state        → perdenin İLK YÜKLEMEDEKİ kaynağı (oyuncu ucu)
```

### Kilit neden interceptor, guard değil

⚠️ Nest'te **global guard'lar controller guard'larından ÖNCE** koşar. `APP_GUARD` olsaydı
`AuthGuard` henüz çalışmamış olurdu → `req.player` boş → ne hangi dünyanın kilitlendiği
bilinirdi ne de personel muafiyeti uygulanabilirdi. **Interceptor'lar tüm guard'lardan sonra**
çalışır; kimlik hazır.

Alternatif (her controller'a `@UseGuards(…, MaintenanceGuard)`) çalışırdı ama "**TÜM** mutasyonlar
kilitli" iddiası o zaman gelecekteki her controller'ın unutmamasına bağlı olurdu. Tek kayıt
noktası bu iddiayı **yapısal** olarak taşıyor.

Kilit **HTTP metodundan** okunur (`POST/PUT/PATCH/DELETE`), uç listesinden değil → yarın eklenen
bir uç kendini otomatik kilitli bulur.

| Yol | Durum | Neden |
| :-- | :-- | :-- |
| `/api/v1/auth/*` | ⭐ **açık** | Kapatsaydık oturumu düşen oyuncu **perdeyi bile göremezdi** — perde oturum gerektiren bir ekranda |
| `/api/v1/admin/*` | açık | Bakımı bitirecek uçlar kendi kilidinde kalamaz |
| `role ∈ {moderator, admin}` | muaf | Bakımı test edebilmek için (kullanıcının isteği) |
| Okuma (GET/HEAD) | açık | Karar "**salt-okunur** + perde"; oyuncu şehrine bakabilmeli |

⚠️ Rol sorgusu **yalnız bakım açıkken** yapılır. Çalışan dünyada kilit tek bir `Map` okuması —
sorgusu yok (aşağıdaki ölçüm).

### Ölçümler

**Donma (birim testi, enjekte edilmiş saat):** 10 dakikalık bakımda kuyruğun kalan süresi
**≤1 ms** kaydı. Tolerans `clock_offset_ms`in `EXTRACT(EPOCH …)*1000` yuvarlamasından.

**Donma (canlı, gerçek HTTP + duvar saati):**

```
gerçek geçen süre        12 274 ms
offset artışı            12 222 ms
kalan süre sapması         −152 ms      (dondurma olmasaydı −12 274 ms)
```

⚠️ 152 ms **bakım süresiyle orantılı değil**: `pause` isteğinin gidiş-dönüşü boyunca akan gerçek
zaman. 10 dakikalık bakımda da 10 saatlik bakımda da aynı büyüklükte kalır.

**Sıcak yol:** `apps/api/test/maintenance.test.ts` → *"yüklemeden sonra 1000 kilit kontrolü =
0 sorgu"*. Faz 1'in ayar sayacının kardeşi.

**Beklenmedik kapanma:** süreç bakımdayken öldürülüp yeniden başlarsa bakım **devam eder** —
donma bellekte değil `worlds` satırında. Testte yeni bir `WorldStateService` örneğiyle taklit
ediliyor; canlıda API süreci yeniden başlatılarak da doğrulandı.

### Perde

`apps/web/src/components/MaintenanceCurtain.tsx` — rotaların **dışında** (sayfa değiştirmek
kapatamaz), kapatma düğmesi **yok** (kapatılabilen perde = arkasındaki her düğmenin 503 döndüğü
bir oyun). Oyun ekranı arkada bulanık **duruyor**: bakım "kapandı" değil "donduruldu".

İki kaynağı var ve ikisi de aynı sorguyu besliyor:
`world:maintenance` WS olayı (değişim anı) + `/world/state` (ilk yükleme ve 30 sn emniyet ağı).
⚠️ Emniyet ağı diğerlerinin yarısı (30 sn): bakımın **bittiğini** kaçırmak, başladığını
kaçırmaktan daha can sıkıcı. Sunucu bu isteği bellekten karşılıyor, sıklaştırmanın DB maliyeti sıfır.

⚠️ `world:maintenance` olayı, "olay veri değil haber taşır" kuralının **bilinçli tek istisnası**
(`paused`, `notice`, `eta` taşır): perdenin amacı oyuncuyu sunucudan uzak tutmak; onu göstermek
için tüm istemcileri aynı saniyede bir sorgu daha yapmaya zorlamak tersine bir yük dalgası olurdu.

### Faz 2'de kapanan eski bir açık

⚠️ Nest'in DI fabrikasından çıkan `SettingsService` örneği **hiç `load()` edilmiyordu**:
`main.ts` kendi örneğini kuruyordu ve panel, yeni açılan bir süreçte DB'deki değerler yerine
şema varsayılanlarını gösteriyordu (ilk kayıttan sonra kendiliğinden düzeliyordu — bu yüzden
Faz 1 doğrulamasında görünmedi). `main.ts` artık `app.get(SettingsService)` ile **Nest'in**
örneğini alıp `start(rawSql)` çağırıyor; `WorldStateService` de aynı yoldan besleniyor.

---

## Oturum ve cihaz yönetimi (Faz 3)

### ⚠️ Sorun: oturum kimliği her yenilemede DEĞİŞİYORDU

`auth.service.refresh()` eski satırı `revoked_at` ile kapatıp **yeni satır** açıyor. Güvenlik
için doğru — tek kullanımlık refresh sayesinde çalıntı token bir kez işler, sonra gerçek
kullanıcının oturumu düşer ve hırsızlık **fark edilir**. Ama cihaz listesi için kırıktı:
oyuncunun telefonu 15 dakikada bir listede yeni bir satır gibi görünür, "bu cihazı çıkar"
dediği satır ise **zaten ölü** olurdu.

**Çözüm `sessions.chain_id`:** ilk girişte üretilir, her yenilemede taşınır.

```
bir CİHAZ  = bir zincir  (chain_id)
bir SATIR  = bir token nesli (id)
```

Dönmeli refresh mantığına **hiç dokunulmadı**; satırlara yalnız ortak bir kimlik eklendi.
Geçmiş satırlar `chain_id = id` ile dolduruldu — her biri kendi zincirinin başı sayılır.
⚠️ `device_id`'ye göre gruplamak daha "akıllı" görünürdü ama yanlış olurdu: aynı cihazda arka
arkaya iki kez giriş gerçekten iki ayrı oturumdur.

### Ölçüm (canlı, gerçek HTTP)

```
ilk giriş                → satır 1 · zincir 1 · liste 1
4 kez /auth/refresh      → satır 5 · zincir 1 · LİSTE 1      ← zincir olmasaydı liste 5 olurdu
ikinci cihazdan giriş    → zincir 2 · liste 2 · "bu cihaz" 1 tane
cihazı çıkar             → liste 1 · o cihazın refresh'i 401 · access'i 401
```

### ⭐ İptal edilen oturumun soketi ANINDA düşer

```
DELETE /auth/sessions/:chainId
  → session:revoked olayı @ +8 ms
  → disconnect ("io server disconnect") @ +13 ms
```

⚠️ **Önce olay, sonra `disconnect`.** Sırayı ters kursaydık istemci kopmayı ağ arızasından
ayıramaz ve sonsuz yeniden bağlanma döngüsüne girerdi. Bugüne kadar iptal edilen bir oturumun
soketi ancak token yenilenirken (15 dakikaya kadar) fark ediyordu — HTTP tarafı zaten anında
ölüyordu (`AuthGuard` her istekte `revoked_at`e bakar) ama soket açık kaldığı için olaylar
akmaya devam ediyordu.

Aynı yol **parola değişimi/sıfırlamada da** çalışıyor: `revokeAll` artık soketleri de kapatıyor.

### Uçlar

| Uç | Kim | İş |
| :-- | :-- | :-- |
| `GET /api/v1/auth/sessions` | oyuncu | kendi cihazları (zincir başına tek satır) |
| `DELETE /api/v1/auth/sessions/:chainId` | oyuncu | bir cihazı çıkar |
| `POST /api/v1/auth/sessions/revoke-others` | oyuncu | bu cihaz hariç hepsi |
| `GET /api/v1/admin/players/lookup?q=` | admin | oyuncu ara (dar kapsam; künye Faz 6) |
| `GET /api/v1/admin/players/:id/sessions` | admin | **aynı servis metodu** (`listSessions`) |
| `POST /api/v1/admin/players/:id/revoke-sessions` | admin + StepUp | tüm oturumları düşür |

⚠️ Admin listesi oyuncununkiyle **aynı metottan** geliyor. İki ayrı sorgu yazsaydık zamanla
ayrışır ve "oyuncu şunu görüyor, ben bunu" tartışması çıkardı.

⚠️ `revokeChain` her zaman `account_id` koşuluyla çalışır: zincir kimliği tahmin edilemez ama
sahiplik kontrolü tahmin edilemezliğe bırakılmaz (testte).

### `last_seen_at` ne anlama geliyor

Zincirin **en son satırının** oluşma anı, yani "token en son ne zaman yenilendi". Her istekte
güncelleseydik istek başına bir yazma olurdu; yenileme jeton ömrü kadar seyrek olduğu için
bedava ve yeterince taze.

### Kapsam dışı (bilinçli)

**Tek aktif oturum zorlaması** yok — kullanıcının kararı: *"ileride"*. Şema hazır (`chain_id`
+ `platform`), kural uygulanmıyor. Uygulanacağı gün tek yer değişecek: `issueSession` yeni
zincir açmadan önce diğerlerini iptal eder.

---

## Savaş motoru sabitleri (Faz 4)

**38 sabit**, dört grup: `combat` · `hero` · `capture` · `loot`. Panel formu şemadan üretiliyor
(Faz 1 altyapısı), yani yeni bir sabit eklemek tek satır.

### ⚠️ Kısıt 1 hâlâ geçerli: ölçülmüş değer ≠ denge düğmesi

Sabitlerin çoğu **binary'den ölçülmüş gerçekler** (`wall.base 1.8` · `night.base 0.7` ·
`repair 0.76-0.81` · `hero.skillK 4.8` · `capture.*`). Panelde her biri **«ölçüldü» rozeti**
taşıyor ve değiştirilmeye başlandığında satırın altında uyarı çıkıyor. Etiketin varlığı testle
sabitlendi — rozet kaybolursa uyarı da kaybolur.

### ⭐ Regresyon kanıtı: varsayılanda BİT-BİT aynı

```
combat(worldId) → hiç ayar değişmemişse  undefined
simulate(input, undefined)               → DEFAULT_COMBAT_CONFIG'in KENDİSİ
```

Bunu her seferinde varsayılanlardan yeniden kurulmuş dolu bir nesne üretecek şekilde yazsaydık,
bir gün "yeniden kurulmuş varsayılan" ile "varsayılanın kendisi" arasında sessiz bir kayma
doğardı: bir alan eklenir, eşlemeye eklenmesi unutulur, motor onu `undefined` görür.
`overridden` listesinden gitmek bu riski tamamen kaldırıyor — dokunulmamış alan dönüştürülmüyor
bile. Ölçüldü: **176 motor testi + 48 katalog testi yeşil**, `simulate` çıktısı JSON düzeyinde
birebir.

Köprünün eksiksizliği de testte: her `combat.*`/`hero.*`/`capture.*`/`loot.*` anahtarının
`settings/combat.ts`te karşılığı olmalı (ve ters yönde, eşlemede şemasız anahtar olmamalı).
Bu olmadan yeni bir ayar panelde görünür ama motora hiç ulaşmazdı.

### Motora nasıl ulaşıyor

```
worker  → SchedulerService.engineFor(worldId) → ctx.engine → battle.handlers → simulate(…, cfg)
API     → SimulateController → settings.combat(worldId)    → simulate(…, cfg)
```

⚠️ `engineFor` bir **fonksiyon**, nesne değil: panelden kaydedilen sabit kuyruktaki bir sonraki
savaşta etkili olmalı, süreç yeniden başlatmayı beklememeli.

⚠️ Handler'a modül seviyesinden "canlı config" okutmak daha az kod olurdu ama gizli bir küresel
durum yaratırdı; savaş handler'ı saf bir fonksiyon ve testte ne verildiyse onu görmeli.

### Faz 4'te bulunan iki sessiz hata

⚠️ **`simulate` tam `CombatConfig` istiyordu.** Kısmi bir nesne geçen çağıran, `undefined`
alanlarla sessizce yanlış savaş çözerdi. İmza `DeepPartial` alacak ve içeride
`mergeCombatConfig` çağıracak şekilde değişti.

⚠️ **`/simulate` ucunda `req.player` HİÇ dolmuyordu.** `AuthGuard` controller bazlı ve o uçta
yok; `req.player?.worldId ?? 0` derleniyor, çalışıyor ve daima 0 dönüyordu — yani dünya bazlı
denge ayarı simülatöre hiç ulaşmıyordu. **Canlı ölçümde yakalandı** (kaydedilen sabit sonucu
değiştirmedi). Çözüm `OptionalAuthGuard`: token varsa bağlam dolar, yoksa (veya geçersizse)
anonim devam — uç kimliksiz kalmaya devam ediyor (§0.0).

### ⭐ Önizleme

`POST /admin/settings/:worldId/preview` — aynı savaşı **aynı seed'le** iki kez çözer: mevcut
ayarlarla ve önerilen yamayla. Seed aynı olduğu için aradaki her fark sabitlerden gelir.

⚠️ Yama **kaydedilmez** ve `AdminStepUpGuard` yoktur: uç hiçbir şey değiştirmiyor. Ölçüldü —
önizlemeden sonra simülatör çıktısı birebir aynı kaldı.

Canlı örnek (`night.base` 0,7 → 0,4, aynı savaş, aynı seed):

| | Mevcut | Taslak |
| :-- | --: | --: |
| Saldıran kaybı | 8 | **0** |
| Saldıran kalan | 5.492 | **5.500** |
| Tecrübe | 2 | **0** |

Kaydet → simülatör anında yeni sonucu verdi · Varsayılana dön → **eski sonuca birebir döndü**.

### Savaşın künyesi

`battles.settings_revision_id` (migration 0029). ⚠️ `NULL` geçerli ve yaygın: hiç ayar
değiştirilmemiş dünyada revizyon satırı yoktur ve NULL "motorun varsayılanlarıyla çözüldü"
demektir.

⚠️ İşaret **iki katmanın büyüğü** (dünyanın kendi revizyonu + genel dünya 0 revizyonu). İlk
yazımda yalnız `??` zinciri vardı ve dünyanın ESKİ kendi revizyonu, genel katmandaki YENİ bir
değişikliği gölgeliyordu — **testte yakalandı**. Bilinen sınır: dünya 0 revizyonunun
`snapshot`u o dünyanın kendi geçersiz kılmalarını içermez; kesin cevap için iki katmana da
bakılır. Her dünya için ayrı revizyon üretmek bunu çözerdi ama dünya sayısı 1 iken bedeli
buna değmiyor.

### ⛔ Panele AÇILMAYANLAR (bilinçli)

| Alan | Neden |
| :-- | :-- |
| `turnSchedule` | Sayı değil, tur→faz tablosu. Doğrulanabilir bir form üretilemez; yanlış düzenleme savaşı sessizce bozar (kullanıcı kararı: KİLİTLİ) |
| `defenseFloor.protectedTypes` | Birim kimliği listesi; katalogla senkron olmalı (Faz 5) |
| `loot.condition` | Sayı değil kip seçimi (üç değerden biri); ayrı editör ister |
| `engineVersion` | Türev — savaş künyesinin kimliği, elle değiştirilecek bir şey değil |
| `chat.bodyMax` | `contracts`taki `max(500)` ile aynı sayı olmak zorunda; panelden değişseydi istemci geçerli saydığı mesajı sunucuya reddettirirdi |

---

## Katalog sabitleri (Faz 5)

**26 sabit**, üç grup: `economy` · `cave` · `wall`. Kullanıcının istediği "temel fiyatlar,
temel süreler, büyüme oranları" bunlar.

### ⭐⭐ İKİ AYRI SÜRE ÜSSÜ (2026-08-10) — hangisi neyi yavaşlatır

Süre çekirdeği `K × (değer/1000)^ÜS / 1,2^(hızlandıran yapı)` ve **üs artık iki tane**:

| Ayar | Varsayılan | Neyi yönetir |
| :-- | --: | :-- |
| `economy.timeExponent` | **0,80** | **Yalnız** savaşçı ve savunma **birimi** üretimi. `k.java`'nın kendi sayısı — dokunmadan önce iki kez düşün. |
| `economy.structureTimeExponent` | **0,95** | Yapı · teknik · Sur · Büyü Kalkanı yükseltmeleri. |

⭐ **Üst seviyeleri yavaşlatmak istiyorsan doğru düğme `structureTimeExponent`, `structureTimeFactor`
DEĞİL.** Sebep: eğri tam **1000 kaynak** noktasında dönüyor (`1,0^0,80 = 1,0^0,95 = 1,0`). Üssü
büyütmek 1000'in **altındaki** kalemleri hızlandırır, üstündekileri yavaşlatır — yani erken oyuna
dokunmadan yalnız tepeyi uzatır. Katsayı (`K`) ise her seviyeyi aynı oranda çarpar, yeni oyuncuyu
da aynı ölçüde cezalandırır.

⚠️ İkisi 2026-08-10'a kadar **tek bir alandı** (0,8). Yapı sürelerini uzatmak için o tek üssü
büyütmek Kaos ve Ejderha üretimini de patlatıyordu; ayrım bunun için açıldı.

### ⭐ `economy.heroReviveCostRate` — kahraman diriltme üssü (2026-08-11)

`maliyet = (3.000 altın, 2.000 yemek) × oran^kahramanSeviyesi`. **Varsayılan 1,25.**
⚠️ Taban ölçülmüştür (oyunun kendi ekranı), oran **bizim tasarım düğmemizdir**: orijinal
istemci bedeli hiç hesaplamıyor, sunucudan hazır alıyordu (`JAVA_ROENTGEN.md` §6.1).

| Bu düğmeyi büyütürsen | Küçültürsen |
| :-- | :-- |
| Ceza **altına** kayar; yüksek seviye kahramanı diriltmek ekonomik bir karar olur | Ceza **zamana** kayar; asıl bedel 48 saate kadar diriltme beklemesi olur |

⚠️ **1,50'yi geri koymadan önce oku.** 2026-08-11'de tam da oradan indirildi: sv20'de
kahramanın savaş değeri sv0'ın 81 katıyken bedel **3.325** katıydı — bedel değerden 41 kat
hızlı büyüyor ve tavanı yoktu, sv15+ kahraman pratikte **kalıcı ölü** oluyordu (Maden 20
ekonomisinde 23 günlük gelir). `formulas.test.ts`'teki *«bedel savaş değerinden ıraksamaz»*
testi 1,5'te **kırmızı verir** — bandı gevşetmeden önce o gerekçeyi yeniden tartış.

### ⚠️ `buildingTuning`de bir tane varsayılan kayıt VAR — ve olması gerekiyor

Seyreklik sözleşmesi (aşağıda) *"dokunulmamış varlık için kayıt olmaz"* diyor ve hâlâ geçerli.
Tek istisna **`architect_school:timeFactor = 0,1`**: bu bir denge ince ayarı değil, orijinal oyunun
**kural** farkı — `k.java:1396-1403`te Mimar Okulu, diğer yapıların aldığı `×10` süre çarpanını hiç
almıyor. Kayıt yalnız `timeFactor` ekseninde; `:gold/:food/:rate` boş kaldığı için global fiyat ve
oran düğmeleri yaşamaya devam ediyor. **1 yaparsan Mimar Okulu'nun her yükseltmesi 10 kat uzar.**

### Formüller: isteğe bağlı son parametre

```ts
buildingCost(id, level, cfg = DEFAULT_CATALOG_CONFIG)
```

⚠️ **İmza kırılmadı.** Parametresiz çağıran (176 motor testi, 48 katalog testi, istemci) hiç
değişmedi ve sonucu aynı; API çağrıları `settings.catalog(worldId)` geçiriyor.
`ECONOMY_CONSTANTS` / `CAVE_CONSTANTS` / `WALL_CONSTANTS` hâlâ dışa aktarılıyor ama artık
`config.ts`ten türetiliyor — **sayıların hiçbiri değişmedi**.

Servisler config'i **fonksiyon** olarak alıyor (`catalogFor?: (worldId) => CatalogConfig`),
nesne olarak değil: panelden kaydedilen fiyat bir sonraki istekte geçerli olsun diye. Verilmezse
formüller varsayılanı kullanır ve davranış değişmez — testler bu yüzden onu geçmeden çalışıyor.

### ⭐ Fiyat: yapı BAŞINA değil, üç çarpan

`economy.buildingCostMultiplier` · `unitCostMultiplier` · `techCostMultiplier`.

⚠️ Katalogda 11 yapı + 12 teknik + 21 birim var, her birinin altın/yemek tabanı ayrı: **~90
ayar**. Panelde 90 satırlık düz bir liste hem kullanılamaz olurdu hem de asıl soruyu
(*"fiyatlar genel olarak yüksek mi"*) 90 kez düzenlemeye zorlardı. Tek tek düzenleme **veri
tarayıcısının işi (Faz 7)**; bu üç çarpan dengeyi kaydırmak için gereken düğme ve eğrinin
şeklini bozmuyor.

⚠️ Birim fiyatında yuvarlama **adetle çarpımdan sonra**: birim başına yuvarlasaydık 100 birimlik
sipariş ile 100 kez 1 birimlik sipariş farklı tutar öderdi ve oyuncu ucuz olanı bulurdu (testte).

### Ölçümler (canlı, gerçek HTTP)

```
yapı fiyatı      9.898 → 29.694   (× 3,00 — tam)
birim fiyatı       200 → 100      (× 0,5)
yemek/saat       2.844 → 5.796    (foodRate 1,16 → 1,2) · altın/saat DEĞİŞMEDİ
```

**⭐ Süren kuyruk:** fiyat üç katına çıkarıldıktan sonra `finish_at` ve `spent_*` **birebir aynı
kaldı**. İptal **9.897** iade etti — ödenen 9.898'in karşılığı, güncel (üç kat) fiyatın değil.

Varsayılana dönünce her değer eski hâline döndü.

### Kısıt 3 zaten kapalıymış

Plan *"`cancelRefund` iadeyi katalogdan yeniden hesaplıyor"* diyordu. **Bu iddia bayattı**: hem
`queue.service.cancel` hem savaş sonrası sur-iptali yolu `queues.spent_gold/spent_food` okuyor.
Düzeltilecek bir şey yoktu; onun yerine davranışı **teste bağladım** — fiyatlar oynatılabilir
hâle gelince kimse "iadeyi güncel fiyattan hesaplayalım" diye değiştirmesin.

### Katalog özeti artık ayarları da kapsıyor

`catalogHash(cfg?)`. ⚠️ `cfg` verilmediğinde özet **eskisiyle birebir aynı** kalır — varsayılan
config'te yüke `c` alanı eklenmiyor. Eklenseydi tüm eski `battles.catalog_hash` değerleri
"başka bir katalog" gibi görünürdü.

### ⚠️ Canlı ölçümün yakaladığı hata

`CityService`e katalog köprüsü eklenmiş ama **üretim formüllerinde kullanılmamıştı**. Birim
testleri geçiyordu (formül doğru), ayar kaydediliyordu, hash değişiyordu — ama oyuncunun gördüğü
yemek/saat sabit kalıyordu. Ekrandaki sayının ayarla ayrışması panelin en sinsi hata sınıfı;
artık testle kilitli.

### ⛔ Panele AÇILMAYANLAR

| Alan | Neden |
| :-- | :-- |
| Yapı/birim/teknik BAŞINA fiyat | ~90 ayar; çarpanla çözüldü, tek tek düzenleme Faz 7 |
| 21 birim × 11 savaş statı | Motor verisi ve çoğu binary'den ölçülmüş; Faz 4 kapsamı zaten savaş sabitleri |
| `trainTimeAreaDecay`, `originalTrainFactor`, `originalDivisorRate` | **Emekli** süre modelleri; yalnız arşiv/karşılaştırma için duruyor |
| `heroXpForLevel` eğrisi | 80/80 doğrulanmış kapalı formül, sabiti yok |

---

## Oyuncu ve moderasyon (Faz 6)

### ⭐ `chat_bans` artık ölü değil

Tablo 2026-07-31'e kadar **tamamen ölüydü**: satır yazılabiliyordu ama `chat.service`te tek
satır kontrol yoktu — panelden ban verilse bile oyuncu mesaj yazmaya devam ediyordu.

Kontrol iki yere kondu: `send()` ve `openConversation()`.

⚠️ **Yeni konuşma açmak da kapalı.** Yalnız `send`i kapatsaydık banlı oyuncu karşı tarafın
listesinde boş bir konuşma açabilirdi ve bu tek başına bir taciz aracı olurdu.

⚠️ **Yasak kontrolü, yeniden-deneme kontrolünden SONRA.** Ban gelmeden önce yazılmış bir
mesajın ağ tekrarı "yasaklısın" hatası almamalı — o mesaj zaten yazıldı, istemci yalnız
cevabını kaçırdı (testte).

⚠️ Yasaklı oyuncu **okumaya devam eder**. Okumayı da kapatsaydık ceza "sohbetten silinmek"
olurdu ve oyuncu kendisine ne yazıldığını göremezdi (kullanıcı kararı).

⚠️ **HTTP 403**, 400 değil. `blocked` bilerek 400'de tutuluyor ki durum kodundan "beni
engellemiş" çıkarılamasın; yasak ise oyuncuya zaten sebebiyle bildiriliyor. Canlı ölçümde 400
dönüyordu — 400 "isteğin bozuk" demek ve yanlıştı; testle sabitlendi.

### Ölçüm (canlı, gerçek HTTP)

```
yasaksız mesaj                 → 201
panelden yasak                 → 200 (7 gün)
yasaklıyken mesaj              → 403 chat_banned + sebep + retryAfterSeconds
karşı taraf mesaj              → 201   (yasak yalnız yasaklıyı bağlar)
yasaklının okuması             → 200, 2 mesaj
yasağı kaldır → mesaj          → 201
yasak geçmişi                  → satır DURUYOR, active:false, veren: wstest
```

### Yasak kaldırma satırı SİLMEZ

`until` geçmişe çekilir. Silseydik *"bu oyuncu daha önce ban yemiş miydi"* sorusu cevapsız
kalır ve tekrarlayan davranışı görmek imkânsızlaşırdı.

### Şikayet kuyruğu

`chat_reports` de bugüne kadar yalnız **biriktiriliyordu**. Panel artık okuyor.

⚠️ Gösterilen metin şikayet ANINDAKİ kopya (`body_snapshot`), canlı mesaj değil — şikayet
edilen kişi mesajı silerek kanıtı yok edemesin.

⚠️ Şikayeti **kapatmak** ile **ceza vermek** ayrı iki işlem ve ayrı iki `audit_log` satırı.
Tek düğmede birleştirseydik geçmişte hangisinin olduğu ayırt edilemezdi. Durum sözlüğü
şemadan birebir: `reviewed | actioned | dismissed`.

### §9.1.1 değişmezi korundu: otomatik ceza YOK

Künyede cihaz/IP paylaşım sayıları görünüyor ama hiçbiri kendiliğinden ban üretmiyor. Ekranda
açıkça yazıyor: *"Cihaz/IP paylaşımı tek başına suç değildir (ev, iş, internet kafe). Karar
senin."* Tarayıcı doğrulamasında dev ortamı bunu güzel gösterdi: `127.0.0.1 · 50 oyuncu`
uyarı renginde çıkıyor ve hiçbir anlam taşımıyor.

---

## Oyuncu cezası — saldırıya AÇIK / KAPALI

Kullanıcı isteği (2026-07-31). `players.banned_at` zaten vardı ve girişi engelliyordu ama iki
eksiği vardı: **süresi yoktu** ("3 gün ceza" verilemiyordu) ve **cezalının şehirlerine ne
olacağı tanımsızdı**.

İkincisi asıl soru. Cezalı oyuncu giremiyor, yani şehirlerini savunamıyor:

| Kip | Diğer oyuncular | Ne zaman |
| :-- | :-- | :-- |
| **`open`** — saldırıya açık | saldırı ✅ · casus ✅ · nakliye ✅ | Kalıcı cezanın tek doğru kipi: hesap geri gelmeyecek, şehirleri dünyanın kaynağı olur |
| **`closed`** — saldırıya kapalı | saldırı ❌ · **casus ✅** · nakliye ❌ | Süreli ceza: oyuncu döndüğünde imparatorluğunu bulur |

⚠️ **Süresiz ceza DAİMA açıktır.** Kural iki yerde birden: zod şeması ve veri tabanı
`CHECK` kısıtı. Elle SQL ile bile delinemesin — bu bir ürün kararı.

⚠️ **Açık ceza acemi korumasını ve tatil modunu EZER.** Ezmeseydi yönetici "saldırıya açık"
dedikten sonra saldırılar korumaya çarpar ve verilen karar sessizce uygulanmazdı (testte).

⚠️ **Kapalıda nakliye de kapalı**: açık olsaydı cezalının dokunulmaz şehri güvenli bir kasa
olurdu. Destek zaten yalnız kendi şehirlerine gidiyor (`requireOwnTarget`) — orada kural
bugün no-op; guard tip-bağımsız yazıldı ki müttefik desteği geldiğinde ayrıca eklemek
gerekmesin.

⚠️ **Ceza gerçek zamanla ölçülür**, oyun saatiyle değil. Ceza bir moderasyon kararı, oyun
mekaniği değil: bakımda oyun saati donuyor ve ceza da donsaydı "3 gün" bakım süresince uzardı.

⚠️ Ceza verilince **tüm oturumlar düşer ve soketler kapanır** — oyuncu "girişim hâlâ açık"
diye devam edememeli.

⚠️ Süresi geçmiş ceza kaydı **temizlenmez** (`ban_reason`, `banned_by` durur): "bu oyuncu daha
önce ceza almış mıydı" cevaplanabilir kalsın. `chat_bans` ile aynı sözleşme.

### Ölçüm (canlı, gerçek HTTP)

```
ceza yok            → saldırı 201 · casus 201 · nakliye 201
3 gün, AÇIK         → saldırı 201 · casus 201 · nakliye 201 · cezalının girişi 401 banned
3 gün, KAPALI       → saldırı 403 target_banned · casus 201 · nakliye 403 target_banned
süresiz + kapalı    → 400 "Süresiz ceza saldırıya kapalı olamaz."
süresiz (açık)      → saldırı 201
ceza kaldır         → giriş 201
```

⚠️ Canlı ölçüm bir eşleme eksiği yakaladı: `target_banned` HTTP eşlemesine eklenmemişti ve
varsayılan dala düşüp **400** dönüyordu. `target_protected`/`target_vacation` ile aynı aile
("bu hedefe bu görevi yapamazsın") → **403**; testle sabitlendi.

---

## Veri tabanı tarayıcı + küratörlü aksiyonlar (Faz 7)

Kullanıcının somut ihtiyacı: *"Test yapmak için kendi şehirlerime ordu koymak istesem şu an
nasıl yapacağımı bilmediğim için sana sormak zorundayım."*

### ⭐ Neden ham SQL değil de adı konmuş aksiyon

Çünkü bu tablolarda ham yazmak **sessizce yanlış** ve en tehlikelisi en masum görüneni:

| Alan | Tuzak |
| :-- | :-- |
| `cities.gold` / `food` | ⛔ Kaynak **tembel birikimle**: gerçek değer = `gold` + (şimdi − `resources_at`) × üretim. Elle yazarsan bir sonraki okumada üstüne birikim eklenir |
| `players.score` | TÜREV (`floor(score_base/1000)`) — ilk puan hareketinde geri hesaplanıp silinir |
| `queues` ↔ `missions` | ÇİFT — yalnız kuyruğu kapatırsan bitiş görevi olmayan bir kuyruğu tamamlamaya çalışır |
| `heroes.level` ↔ `xp` | Bağlı — yalnız seviyeyi değiştirirsen sonraki XP kazanımında geri hesaplanır |

**Canlı kanıt** (`Çığlıktepe`, gerçek dev verisi):

```
ham  UPDATE cities SET gold = 1000  →  oyuncunun gördüğü 4.704   ✗ TUTMADI
aksiyon grant-resources +50.000     →  4.704 → 54.705 (+50.001)  ✓ TUTTU
aşırı çekim (-1 milyar)             →  0, eksiye düşmedi         ✓
```

Aksiyon doğru sırayı uyguluyor: **`materialize()` → oku → kırp → `add()`**.

### 9 küratörlü aksiyon

`Şehre ordu koy` · `Kaynak ver/al` · `Yapı seviyesi ata` · `Teknik seviyesi ata` ·
`Kahraman ver` · `Kuyruğu iptal et` · `Görevi iptal et` · `Puanı yeniden hesapla` ·
`Şehri başka oyuncuya taşı`

⚠️ **Ordu vermek puanı değiştirmiyor** — bilinçli: test aracı oyuncuyu sıralamada yukarı
taşımamalı. Düzeltmek isteyen «Puanı yeniden hesapla»yı ayrıca çağırır.

⚠️ Birim/teknik kimliği **katalogdan doğrulanıyor**: uydurma bir tip yazılırsa savaş motoru
onu tanımaz ve o şehrin her savaşı sessizce eksik orduyla çözülür.

⚠️ İptallerde **iade yok**: bu bir yönetim aracı, oyuncunun iptali değil. Sessizce para
vermek aracı öngörülemez yapardı.

### Tarayıcı: liste değil BEYAZ LİSTE

**24 tablo** kayıtlı (`db-registry.ts`), politika dağılımı: 13 salt-okunur · 8 yalnız-aksiyon ·
3 ham-düzenlenebilir.

⚠️ **Genel amaçlı SQL kutusu YOK** (kısıt 5). Tablo adı, kolon adı, sıralama ve filtre alanı
**yalnız kayıttan** geliyor; istemciden gelen hiçbir ad SQL'e girmiyor. Tanımlayıcılar
parametreleştirilemediği için `sql.raw` şart — enjeksiyona kapalı olmasının sebebi kaçış değil,
beyaz liste. Kayıtta olmayan tablo **404**, varlığı bile sızmıyor.

⛔ `audit_log` · `battles` · `outbox` ham kipte de **salt-okunur** (üçü de ekleme-yalnız).

### Ham kip

Varsayılan **kapalı**; açılınca kırmızı şerit. Üç kapı: adım yükseltmesi → tablo politikası
`edit` → kolon `editable` listesinde. `where` de anahtar/filtre alanlarıyla sınırlı (boş
`where` reddedilir, >20 satır eşleşirse durur) ve **eski hâl `audit_log`a satır olarak** yazılır.

### ⚠️ Kayıt testinin yakaladığı 4 hata

`db-registry.ts`teki kolon adlarını `information_schema` ile karşılaştıran test, elle yazdığım
kayıtta **dört yanlış kolon** buldu: `heroes.revive_at` (doğrusu `revive_until`),
`alliances.tag`/`description` (şemada yok, metin tek kolonda: `text`),
`abuse_signals.severity` (doğrusu `score`), `audit_log.created_at` (doğrusu `at`).
Test olmasaydı bu tablolar panelde **boş** görünecekti.

---

## Bakım ve performans (Faz 8)

Planın son fazı. Ekran dört soruya **kanıtla** cevap veriyor: döngüler yaşıyor mu · kuyruklar
tıkalı mı · veri tabanı nerede büyüyor · ne temizlenebilir.

### ⭐ Canlılık TÜRETİLEMEZ

İlk tasarım canlılığı gözlemlenebilir durumdan çıkarmaktı: "vadesi geçmiş görev var mı", "en
eski teslim edilmemiş outbox satırı kaç saniyelik". Bu ölçüler **arızayı** görür ama **sağlığı**
göremez — kuyruklar boşken ikisi de sıfırdır ve sıfır iki farklı şeyi anlatır:

| gözlem | anlam A | anlam B |
| :-- | :-- | :-- |
| gecikme 0, kuyruk boş | döngü çalışıyor, yapacak iş yok | döngü üç saat önce öldü, yeni iş de gelmedi |

Ayrımın tek yolu döngünün **kendi imzası**: `worker_heartbeats` (migration 0031). Bir bakım
panelinin en kötü hâli "her şey yolunda" derken sessizce durmuş olmaktır.

Üç kural nabzın kendisinin arıza kaynağı olmasını engelliyor:

1. **Kısıtlanmış** — 5 sn'den sık yazılmaz. 1 sn'lik poll saniyede bir UPDATE demekti; bir
   izleme kaydı izlediği sistemden fazla yazma üretmemeli.
2. **Yutan** — yazım hatası sessizce yutulur (ör. migration koşmamış DB). Nabız yazamadı diye
   görev döngüsünün durması, çözmeye çalıştığı sorunu yaratmak olurdu.
3. **Transaction dışında** — görevle aynı transaction'da olsaydı görev geri alındığında nabız
   da geri alınırdı; tam arıza anında iz kaybolurdu.

⚠️ **Scheduler ve dispatcher AYRI satır.** Tek satır tutsaydık dispatcher bir e-posta sink'inde
bloke olurken scheduler'ın nabzı "worker sağlıklı" demeye devam ederdi.

⚠️ **Satır yokluğu «sağlıklı» değil «bilinmiyor»dur** (`loopsKnown: false`) — worker hiç
çalışmamış ya da migration uygulanmamış olabilir.

### Eski pid'lerin artığı

`worker_id` = `worker-<pid>` olduğu için her yeniden başlatma yeni bir satır açıyor; eskisi
kalıyor ve panel birkaç gün sonra onlarca "ÖLÜ" satırla dolup gerçek bir arızayı gürültünün
içinde kaybettirirdi. Çözüm: her süreç **5 dakikada bir**, **aynı tür + aynı dünya** için
1 saatten eski satırları süpürüyor.

⚠️ Süpürme yalnız **canlı bir halef varken** çalışır. Worker gerçekten ölüp yerine kimse
gelmediyse kimse süpürmez ve satır kalır — asıl görmek istediğimiz durum tam olarak budur.

⚠️ **Canlı ölçüm bu tasarımda bir açık buldu.** İlk hâli süpürmeyi yalnız *açılışta bir kez*
yapıyordu. Gerçek yeniden başlatmada selefin satırı o anda henüz **27 saniyelikti** — 1 saatlik
eşiğin çok altında, yani süpürülmedi; ve süpürme bir kereye özel olduğu için bir daha da
denenmedi. Panelde kalıcı iki "ÖLÜ" satır kaldı. Testler geçiyordu (hepsi zaten bayat satırla
başlıyordu); açığı yalnız gerçek bir süreç ölümü gösterdi. Düzeltme: süpürme periyodik.

### Ölçüm (canlı, gerçek HTTP + gerçekten öldürülmüş süreç)

```
ilk okuma  CANLI dispatcher worker-16572  nabız 3 sn önce  ayakta 137 sn  tur 272
           CANLI scheduler  worker-16572  nabız 3 sn önce  ayakta 137 sn  tur 137
```

Tur sayıları poll aralıklarını doğruluyor: 137 sn'de dispatcher 272 tur (500 ms), scheduler
137 tur (1000 ms).

Süreç **gerçekten öldürüldü**, yenisi kalktı:

```
+0 sn    CANLI dispatcher worker-14872  nabız   0 sn  ayakta   0 sn  tur   1   ← yeni pid
         CANLI dispatcher worker-16572  nabız  27 sn  ayakta 147 sn  tur 292   ← ölü, henüz eşik altında
+2 dk    CANLI dispatcher worker-14872  nabız   3 sn  ayakta 102 sn  tur 202
         ÖLÜ   dispatcher worker-16572  nabız 131 sn  ayakta 147 sn  tur 292
         ÖLÜ   scheduler  worker-16572  nabız 131 sn  ayakta 147 sn  tur 147
```

⭐ Ölü sürecin son turu (292) donmuş duruyor, canlı olanınki artıyor. `ayakta` alanı
crash-loop'u ayırt eder: nabız taze ama süreç sürekli yeniden doğuyorsa `at` güncel kalır ve
yalnız bu alan düşer.

`ANALYZE` ucu: **20 tablo** "satır sayısı bilinmiyor" durumundaydı, `POST /ops/analyze`
**678 ms** sürdü ve hepsi sayıya dönüştü (`battles` bilinmiyor → 15, `techs` → 8, `worlds` → 1).

### ⚠️ Satır sayısı TAHMİN

Boyut ekranı `pg_class.reltuples` okuyor, `COUNT(*)` değil: 38 tabloya tam sayım atmak bu
ekranı açan her yöneticiye tam tablo taraması yaptırırdı. Hiç `ANALYZE` görmemiş tabloda
`reltuples = −1` gelir ve panel **«bilinmiyor»** yazar — 0 gösterseydik "tablo boş" diye
okunurdu, ki yanlış olurdu.

⛔ **`VACUUM FULL` düğmesi bilerek YOK.** Tabloyu tamamen kilitler ve tablo boyutu kadar geçici
disk ister; küçük sunucu profilinde (§4.0) bir bakım aracının sunabileceği en tehlikeli düğme
olurdu. Şişme sorununun çözümü autovacuum ayarı, panelden tek tık değil.

`pg_stat_statements` kurulu değilse uç **500 atmıyor**: `available: false` + kurulum komutu
dönüyor, panelin geri kalanı çalışmaya devam ediyor.

### Temizlik: görev NE SİLMEDİĞİYLE tanımlanır

7 görev var ve her birinin ekranda ayrı bir **🛡 koruma** satırı duruyor:

| görev | siler | ⭐ korur |
| :-- | :-- | :-- |
| `messages` | okunmuş posta > 60 gün | **okunmamış** posta 365 güne kadar |
| `chat` | sohbet > 30 gün | **sabitlenmiş** mesajlar |
| `outbox` | teslim edilmiş > 7 gün | teslim EDİLMEMİŞ satır, yaşı ne olursa olsun |
| `email_tokens` | süresi geçmiş/kullanılmış > 7 gün | hâlâ geçerli jetonlar |
| `push` | ≥5 hata almış > 30 gün | eşik altındaki abonelikler |
| `ranking_runs` | koşu geçmişi > 90 gün | `rankings` tablosuna hiç dokunmaz |
| `sessions` | iptal/süresi geçmiş > 90 gün | **canlı zincirler** |

Üç karar açıklama istiyor:

**Okunmamış rapor korunuyor.** Oyuncunun hiç görmediği bir savaş raporunu silmek veriyi değil,
oyuncunun ne olduğunu öğrenme hakkını siler. Sert tavan (365 gün) yalnız bırakılmış hesapların
kutusu sonsuza kadar büyümesin diye var.

**Teslim edilmemiş outbox satırı hiç silinmiyor.** Ölü mektup kuyruğundaki satır bir arıza
kanıtıdır; silmek arızayı görünmez yapar — temizliğin üretebileceği en kötü sonuç.

**⚠️ Plan yanlıştı: `rankings` temizlenemez.** Plan "eski `rankings`" diyordu; ölçünce tablonun
her anlık görüntüde **üzerine yazıldığı** görüldü (unique `world+kind+subject`) → boyutu oyuncu
sayısıyla sınırlı, büyümüyor ve temizlenecek bir şeyi yok. Biriken tablo koşu geçmişi olan
`ranking_runs` (günde 3 satır/dünya). Sıralama ekranı `rankings`i okuyor; silseydik sıralama
boşalırdı.

### ⚠️ Zaman kolonu tuzağı

Projede iki saat var: `messages.at`, `battles.at`, `ranking_runs.taken_at` **OYUN** saatinde —
bakımda donar, `worlds.clock_offset_ms` ile gerçek saatten kayar. Saklama süresi ise bir
**depolama** kuralıdır ve gerçek zamanla ölçülür. Bu yüzden her görev `created_at` benzeri
gerçek zaman kolonuna bakıyor; `at` kullansaydık uzun bir bakımdan sonra "60 günlük" eşiği
aslında 62 gün öncesini keserdi. Bir test her görevin zaman kolonunu `information_schema` ile
doğruluyor.

Aynı ayrım kuyruk gecikmesinde de var ama **ters yönde**: gecikme oyun saatiyle ölçülüyor,
çünkü worker da ona bakıyor. Ölçüldü: görev 3 saat geride + dünya saati 2 saat geride →
panel **1 saat** diyor, 3 saat değil. Gerçek saatle ölçseydik var olmayan bir arıza gösterirdi.

### Kuru koşu VARSAYILAN

Faz 7'de öğrenilen dersin kuralı. Silme üç kapıdan geçiyor: **adım yükseltmesi** ·
**`confirm: true`** · **satır tavanı**. `confirm` yoksa uç hata atmıyor, **kuru koşu**
döndürüyor — panelin "önce göster" akışı ile aynı ucu kullanıyor, yani yanlış tıklama veri
kaybına dönüşemiyor. Her koşu saklama süreleriyle birlikte `audit_log`a yazılıyor
(«hangi eşikle silindi» sonradan sorulabilsin).

Satır tavanı (varsayılan 20.000) bir güvenlik freni: `LIMIT`siz bir DELETE milyon satırda
tabloyu kilitler ve oyunu durdurur. Silme `ctid` ile parça parça yapılıyor (bileşik anahtarlı
tablolarda tek kolonluk anahtar yok); tavan aşılırsa kalan bir sonraki koşuya bırakılıyor ve
panelde yazıyor. Ölçüldü: 250 satır, tavan 100 → `100 sildi / 150 kaldı` → `100/50` → `50/0`.

### Ölçüm (canlı, kuru koşu — hiçbir satır silinmedi)

```
veri tabanı 11,90 MB · 38 tablo
  sessions   0,48 MB (indeks 0,16 · 5 indeks)  ≈437 satır   ← en büyük tablo
  outbox     0,21 MB                            ≈348 satır
  missions   0,20 MB (indeks 0,11 · 7 indeks)  ≈212 satır

outbox: toplam 373 · bekleyen 0 · ölü mektup 0
dünya 1: bekleyen 1 · çalışan 0 · başarısız 0 · gecikme 0 sn
havuz:  12/100 · etkin 1 · boşta 11 · transaction'da boşta 0

temizlik kuru koşusu — 7 görevin HEPSİ 0 satır eşleştirdi
```

⭐ Proje yeterince genç: hiçbir satır saklama eşiğinin ötesinde değil, yani canlıda silinecek
bir şey yok. Yine de `sessions` şimdiden en büyük tablo (447 satır) — dönmeli refresh her
yenilemede yeni satır açtığı için uzun vadede ilk dolacak olan o.

Kapılar canlıda doğrulandı: bilinmeyen görev **400** · token'sız **401** · yükseltmesiz +
`confirm` **403** · `confirm`siz çalıştır → `ran=false, deleted=0`.

⚠️ **Silme yolu canlıda ÇALIŞTIRILMADI** — bilerek. Canlıda eşleşen satır yoktu ve olsaydı da
kullanıcının verisini onaysız silmek Faz 7'nin hatasını tekrarlamak olurdu. Silme davranışı
test veritabanında ölçülüyor (27 test): korumalar, tavan, audit satırı ve `confirm` kapısı.

---

## 2. NESİL — Tur 1: «Oyuncular» sekmesi ve imparatorluk künyesi

Dokuz faz bitince kullanıcı paneli açtı ve şunu söyledi:

> *"Bu kalabalığın içinde bu paneli ben etkili şekilde kullanabilir miyim emin değilim.
> Bir kullanıcıya asker eklemek için onun şehir kimliğini bulup sonra askerleri de json
> formatında bir de İngilizce adları ile yazarak yapmam gerekiyor."*

Sorun eksik özellik değil, **eksik bağlam**. Panel satır gösteriyordu, imparatorluk göstermiyordu.

### Oyuncu verisi üç sekmeye dağılmıştı

| Soru | Nerede aranıyordu |
| :-- | :-- |
| "bu oyuncu kim" | Oturumlar → arama |
| "cezalı mı, cihazları ne" | Moderasyon → künye |
| "ordusu ne, teknikleri ne" | Veri tabanı → şehir şehir, 20+ istek |

Üçü tek **«Oyuncular»** sekmesinde toplandı: liste → oyuncu → *Künye · İmparatorluk · Oturumlar*.
«Oturumlar» sekmesi kalktı, içeriği `/oyuncular/:id/oturumlar` altına taşındı.

### ⭐ Künyenin gösterdiği kaynak, tarayıcınınkinden FARKLI

Veri tabanı tarayıcısı `cities.gold`u ham okuyor ve o sayı **oyuncunun gördüğü sayı değil**:
kaynak tembel birikimle tutuluyor, gerçek değer `gold + (şimdi − resources_at) × üretim`.
İmparatorluk ucu `CityService.snapshot()` çağırıyor → çıpayı ilerletiyor → **oyuncunun kendi
ekranındaki sayının aynısını** veriyor. Test bunu kilitliyor: çıpa 3 saat geriye itilip ham
değerin 1.000'de kaldığı, künyenin ondan büyük ve `snapshot()` ile **birebir eşit** olduğu
ölçülüyor.

⚠️ Canlıda bu farkı *sonradan* göstermek mümkün değil — künyeyi okumak çıpayı ilerletiyor,
yani ham satır da güncelleniyor. Farkın kanıtı testte.

### ⭐ «Bu oyuncuya kim saldırıyor» sorusu ilk kez sorulabiliyor

`missions.owner_player_id` **saldıranı** taşıyor; hedefin sahibi tabloda yok, ancak
`cities` üzerinden JOIN ile bulunuyor. Veri tabanı tarayıcısında bu filtre kurulamıyordu, yani
gelen saldırılar panelde **hiç görünmüyordu**. Ayrıca `mission_units` kayıtta olmadığı için
**yoldaki ordunun bileşimi hiçbir uçtan alınamıyordu** — ikisi de artık künyede.

### Sur ve Büyü Kalkanı savunma birimlerinden ayrı kutuda

İkisi de `defenses` tablosunda ve ikisinin de kolonu `count` — ama Sur'da o sayı **adet değil
SEVİYE** (katalogdaki `LEVEL_BASED`). Aynı listede "300 Okçu Kulesi" ile "6 Sur" yan yana
dursaydı 6 adet sur diye okunurdu.

### Katalog id'leri Türkçeye çevriliyor — ama bilinmeyen id gizlenmiyor

`dwarf` → **Cüce**, `architect_school` → **Mimar Okulu**. ⚠️ Katalogda olmayan bir tip
**elenmiyor**, ham hâliyle geçiyor: veri orada ve panel görmezden gelirse tanı imkânsız olur.

### Çevrimiçilik: «bilinmiyor» ≠ «çevrimdışı»

`RealtimeGateway.onlinePlayerIds()` eklendi (öncesinde yalnız `isOnline(id)` vardı ve admin'de
hiç kullanılmıyordu). ⚠️ Bilgi **süreç-yerel**: `ROLE=worker` profilinde `getGateway()` daima
`null`. Bu yüzden yanıt `onlineKnown` bayrağı taşıyor ve panel o `false` iken **noktayı hiç
çizmiyor** — "herkes çevrimdışı" göstermek, bilgisizlikten kötü bir yalan olurdu.

⚠️ İki farklı "aktif" var ve panel ikisini de ayrı gösteriyor: **soket** (kesin ama süreç-yerel,
yalnız "şu an") ve **`players.last_seen_at`** (yalnız giriş ve token yenilemede yazılıyor —
her istekte değil; yenileme jeton ömrü kadar seyrek olduğu için kaba bir değer, "3 dakika önce
oynuyordu"yu göstermez).

### ⭐⭐ «Üretim» sekmesi — birim × Baraka seviyesi süre tablosu (2026-08-12)

Kullanıcı: *"Her askerin her baraka seviyesine göre, seçili oranlarda ne kadar sürede
üretildiğini gösteren bir şey ekleyelim. **Dinamik** olarak kontrol edilsin."*

Ekran iki panelden oluşuyor: üstte dört süre düğmesi (kaydırıcı + sayı), altında tablo.
⭐ **Düğmeyi oynatmak tabloyu anında günceller — kaydetmeden.** Yönetici asker oranını
1,20'den 1,35'e çekince Cüce'nin 1 saniyeye indiği seviyenin 27'den 17'ye kaydığını o an
görüyor; kaydetmek ayrı ve bilinçli bir adım.

⚠️ **Hesap panelde, formül panelin DEĞİL.** `trainingTimeSeconds` doğrudan
`@mobilwar/catalog`tan çağrılıyor. Formülü panelde yeniden yazmak en cazip ve en yanlış
seçenekti: iki uygulama bir gün ayrışır ve panel, sunucunun ürettiğinden başka bir sayı
göstermeye başlardı. Uç (`GET /admin/settings/:worldId/catalog-config`) tabloyu değil yalnız
etkin `CatalogConfig`i veriyor — her tuş vuruşunda HTTP turu atmamak için.

⚠️ **1 saniye sert taban** tabloda soluk hücreyle işaretli ve sunucudan `minSeconds` olarak
geliyor, panelde sabit yazılmıyor (taban `queue.service.ts` `scaled` + `city.controller.ts`
`dur` içinde; biri değişirse tablo sessizce yalan söylemesin).

⭐ Sekme «Ayarlar»dan **ayrı**: Ayarlar bir FORM, ne yazdığını gösterir; bu ekran sonucu
gösteriyor. Formun içine gömülseydi tablo 84 ayarın arasında kaybolurdu.

### ⭐ «Asker fiyatları ve süreleri (tek tek)» ayar grubu (2026-08-12)

`unitTuning` — `buildingTuning`/`techTuning`in kardeşi. Her asker ve savunma birimi için
**taban altın · taban yemek · süre çarpanı**.

| eksen | ne değişir |
| :-- | :-- |
| `gold` · `food` | **hem fiyat hem süre** — oyunda ayrı bir «taban süre» YOK, süre fiyattan türüyor (`unitTimeValue` = altın + yemek + taşıma) |
| `timeFactor` | **yalnız süre**, fiyat sabit |

⚠️ **`rate` ekseni yok** — askerlerin seviyesi yok, "her seviye kaç kat pahalı" anlamsız olurdu.
⚠️ **Sur ve Büyü Kalkanı bu grupta değil**: onlar `LEVEL_BASED`, fiyatları `defenseStructureCost`ten
geliyor. Buraya konsalardı panel yazılan ama hiçbir şeye bağlı olmayan bir düğme gösterirdi.

⭐ Ayarlar ekranında **kod yazılmadan matris olarak belirdi**: `Settings.tsx` grubu `entity`
künyesi dolu olduğu için otomatik matrise çeviriyor.

### ⚠️ İki ayrı süre kısaltma oranı (2026-08-12)

`economy.timeDecayRate` artık **yalnız asker/savunma birimi**; yapı, teknik, Sur ve Kalkan
`economy.structureTimeDecayRate` kullanıyor. Varsayılanları aynı (1,2) → ayrım hiçbir süreyi
değiştirmedi.

⚠️ Ayrım şart oldu: ortakken askerleri hızlandırmak için oranı 1,2'den 1,4'e çekmek, Mimar
Okulu 20'nin **yapı** hızlandırmasını 38 kattan **837 kata** çıkarıp inşaat ekonomisini yok
ediyordu. `timeExponent`/`structureTimeExponent` 2026-08-10'da aynı sebeple ayrılmıştı.

**Cüce/Elf 1 saniyeye inme seviyesi:** 1,20 → 27/30 · 1,25 → 23/24 · 1,30 → 19/21 ·
1,35 → 17/18 · 1,40 → 15/16.

### Tek cihazı düşürme

`AuthService.revokeChain` Faz 3'ten beri hazırdı ama admin tarafında yalnız "hepsini düşür"
vardı: *"şu bilinmeyen telefonu at"* demenin yolu, oyuncunun tüm oturumlarını kapatmaktan
geçiyordu. Artık zincir başına düşürme var ve her ikisi de onay adımı istiyor.

⭐ **2026-08-12:** oturum iptalinin dördü de (çıkış · zincir · diğerleri · hepsi) artık
`account_presence` satırını da düşürüyor (`releaseRevokedPresence`). Öncesinde iptal yalnız
`revoked_at` yazdığı için sahiplik **90 saniye asılı kalıyordu** — yani "diğer tüm cihazlardan
çık" diyen oyuncu kendi cihazından o süre boyunca giremiyordu; hesabı ele geçirilip parolasını
değiştiren oyuncu için ise sahiplik saldırganın örneğinde kalıyordu.

### ⭐⭐ Tek cihaz kuralı — `Oturum → Tek cihaz kuralı`

Bir hesabın aynı anda yalnız TEK yerde açık olabilmesi (ikinci sekme dâhil). **Varsayılan
AÇIK** ve panelden kapatılabilir.

⚠️ Anahtar 2026-08-03'te eklendi ama **2026-08-12'ye kadar hiçbir işe yaramadı**: kod ayrıca
`NODE_ENV === 'production'` arıyordu ve varsayılan kapalıydı; ikisi birleşince kural
doğrulanabileceği tek yerin üretim olduğu bir kısır döngüye giriyordu. Ortam kontrolü kaldırıldı,
varsayılan açıldı. Ayrıntı ve ölçüm `presence.service.ts` başlığında.

⚠️ Panel **muaf** (`PRESENCE_EXEMPT`): yönetici oyunla aynı hesaba ayrı bir oturumla giriyor,
muaf olmasaydı paneli açmak yöneticiyi kendi oyunundan atardı.

⚠️ Acil vana: kural canlıda beklenmedik biçimde oyuncuları kilitlerse ve panele erişilemiyorsa,
sürece `SINGLE_SESSION_OFF=1` verip yeniden başlatmak anahtarı ezer.

### Router ve React Query açıldı

İkisi de Faz 0'dan beri `package.json`'da duruyordu ama **hiç import edilmemişti**.

- **Router** — sekme durumu `useState` idi; bunun üç somut bedeli vardı: derin bağlantı yok,
  tarayıcı geri tuşu çalışmıyor, yenilemede ilk sekmeye dönülüyor. Artık
  `/oyuncular/19/imparatorluk` paylaşılabilir bir adres. (nginx taslağındaki
  `try_files $uri $uri/ /index.html` bunu zaten karşılıyor.)
- **React Query** — `useState + useEffect + fetch` üçlüsü ve mutasyondan sonra elle `load()`
  çağrısı **yirmi yerde** tekrar ediyordu. ⚠️ `retry: false` bilinçli: 403 "yükseltme gerekli"
  demektir ve sessizce tekrarlanınca kullanıcı diyaloğu geç görür.

`apps/admin/src/lib/format.ts` açıldı: `when`/`dur`/`num`/`bytes`/`cell` üç ekranda üç kopyaydı
ve ayrışmaya başlamıştı (biri "az önce" derken diğeri "0 dk önce" diyordu).

### Ölçüm (canlı dev dünyası, gerçek veri)

```
liste     50 oyuncu · 1 çevrimiçi · sayfalama 1–25 / 50 (sunucu taraflı)
künye     wstest · 5 şehir · 20.692.160 altın · 21.063.401 yemek
teknikler Sömürgecilik sv 12 · Haritacılık sv 9 · Casusluk sv 8 · Okçuluk sv 6 …
şehir     Karakol 1:3:1 — Maden sv 21 · Çiftlik sv 20 · Baraka sv 15 · Kale sv 15 …
          Sur sv 1 (ayrı kutuda) · Cüce 1.002 · Elf 300 · Süvari 200 … · mağarada Elf 300
```

Derin bağlantı doğrulandı: `/oyuncular/19/imparatorluk` doğrudan açılıyor.

⚠️ **Görülen bir tutarsızlık** (Tur 2'ye kaldı): bir kahramanın `status` alanı `idle` — şemanın
sözlüğü `alive | dead | reviving | destroyed`. `give-hero` aksiyonu `'idle'` yazıyor.

---

## 2. NESİL — Tur 2: kolay düzenleme ve toplu işlemler

Kullanıcının en somut cümlesi buydu:

> *"Bir kullanıcıya asker eklemek için onun şehir kimliğini bulup sonra askerleri de json
> formatında bir de İngilizce adları ile yazarak yapmam gerekiyor."*

Üç ayrı sürtünme vardı ve üçü de kalktı.

### 1 · Ham JSON yerine katalogdan seçici

`GET /admin/catalog` açıldı: savaşçılar · savunma birimleri · Sur/Kalkan · yapılar · teknikler,
**Türkçe adlarıyla** ve oyunun kendi ekran sırasıyla (`display-order.ts`). Panel `{"dwarf": 500}`
yazdırmıyor; **Cüce** yazan bir satıra sayı giriliyor, üstünde Türkçe arama var.

⚠️ Liste **sunucudan** geliyor. Panelde sabit tutsaydık katalog büyüdüğünde iki yer güncellenmek
zorunda kalır, biri unutulunca seçici sessizce eksik kalırdı. Bir test her seçici alanın
`source` değerinin katalogda gerçekten var olduğunu doğruluyor.

⚠️ **Yalnız sıfırdan farklı satırlar gönderiliyor.** Hepsi gitseydi `{dwarf: 0, elf: 0, …}`
olurdu ve «yaz» kipinde bu **21 satırı birden silmek** demektir — yönetici yalnız cüce yazmak
isterken tüm orduyu uçururdu.

### 2 · Şehir kimliği elle aranmıyor

İmparatorluk ekranındaki her şehir kartının altında **«Bu şehri düzenle…»** var; açılan form
o şehir için önceden doldurulmuş. Form `ActionForm`ın **aynısı** (`lockedCityId` ile), yani
Veri tabanı sekmesindekiyle aynı kod — ikinci bir kopya yazsaydık doğrulama ve alan tipleri
iki yerde ayrışırdı.

Ayrıca aksiyon künyesine `required` · `min` · `max` · `default` eklendi. Öncesinde sınırlar
yalnız Zod'daydı ve doğrulama tek yönlüydü: yönetici "seviye en fazla kaç" sorusunun cevabını
ancak **400 alarak** öğreniyordu.

### 3 · İki yeni aksiyon: savunma ve Sur/Kalkan

| aksiyon | tablo | sayının anlamı |
| :-- | :-- | :-- |
| `set-defense` | `defenses` | **adet** (Okçu Kulesi, Tuzak, Balista…) |
| `set-defense-structure` | `defenses` | **seviye** (Sur, Büyü Kalkanı) |

⚠️ İkisi **aynı tabloda** ve ikisinin de kolonu `count` — ama Sur'da o sayı seviye. Tek
aksiyonda birleştirseydik "6 adet sur" yazmak mümkün olurdu. `set-defense` Sur'u açıkça
reddediyor ve doğru aksiyonu söylüyor.

⚠️ Sur seviyesi `wall_integrity`ye **dokunmuyor** — o ayrı bir eksen (savaşta düşen, onarımla
geri gelen bütünlük oranı). İkisini bağlamak "seviye verdim ama sur hâlâ yıkık" sürprizini
çözmez, sadece gizlerdi.

### ⭐ Toplu işlemler — üç adımlı ve kuru koşu atlanamaz

`POST /admin/bulk/:op` — 5 işlem: ordu · savunma · Sur/Kalkan · teknik · kaynak.

**Hedef seçimi iki aşamalı:** önce filtre (dünya · ittifak · puan aralığı · aktiflik), sonra
listeden tek tek **çıkarma**. Yalnız filtre olsaydı *"herkese ver ama şu üç kişiye verme"*
istenemezdi; yalnız elle seçim olsaydı 50 kişilik bir dünyada 50 kutu işaretlemek gerekirdi.

⚠️ **`confirm: true` yoksa hiçbir satır değişmez** — uç kaç oyuncu, kaç şehir ve ilk 20 ismi
döndürür. Panelde "Uygula" düğmesi ancak önizleme alındıktan sonra beliriyor; filtre ya da
işlem değişince önizleme geçersiz oluyor (eski sayıyla onaylanmasın).

⚠️ **Katalog reddi kuru koşuda da veriliyor.** "Çalıştırınca patlayacak" bir önizleme işe
yaramaz: yönetici 12 oyuncu görür, onaylar, sonra 400 alır.

⚠️ **Tavan 500 oyuncu** ve aşılırsa uç **çalışmayı reddediyor**, sessizce kırpmıyor — kırpsaydı
yönetici hangi yarısının etkilendiğini bilemezdi.

⚠️ **Toplu kaynak şehir şehir `materialize` ediyor.** Tek bir `UPDATE cities SET gold = gold + n`
çok daha hızlı olurdu ve sessizce yanlış: çıpa geçmişte kaldığı için eklenen miktarın üstüne
birikim de gelirdi. Hız değil doğruluk seçildi.

⚠️ «ekle» kipinde `GREATEST(0, …)`: negatif bir ekleme mevcudun altına inmez. Eksi ordu diye
bir şey yok ve savaş motoru onu okuyamaz.

### ⚠️ İki ölçülmüş hata düzeltildi

**1. `player_id = 5` filtresi 15, 25, 51'i de getiriyordu.** Tarayıcıdaki her filtre
`::text ILIKE '%değer%'` idi. İki bedeli vardı: yanlış satırlar ve `::text` cast'i yüzünden
indeksin kullanılamaması. Artık ayrım kolon adından **tahmin edilmiyor**,
`information_schema`dan okunuyor (süreç ömrü boyunca önbellekli): sayısal kolonda tam eşleşme,
metin kolonunda `ILIKE`.

```
öncesi   player_id=1  → 19 numaralı oyuncunun satırları da geliyordu
sonrası  player_id=1  → 0 satır      ·   player_id=19 → 6 satır, hepsi 19
```

**2. Panelden verilen kahraman oyuncuya ÖLÜ görünüyordu.** `give-hero` aksiyonu
`status = 'idle'` yazıyordu; bu değer şemanın sözlüğünde (`alive | dead | reviving |
destroyed`) **yok** ve iki okuyucu onu farklı yorumluyordu:

| okuyucu | `'idle'` nasıl okunuyordu |
| :-- | :-- |
| `hero.controller.ts:245` | dallanmanın son dalı → **şehirde** (doğru görünüm) |
| `command.controller.ts:405` | `dead: status <> 'alive'` → **ÖLÜ** |

Kod `'alive'` yazacak şekilde düzeltildi; migration `0032` geçmişte yazılmış satırları onardı.
⚠️ Yalnız `'idle'` hedeflendi — gerçek `dead`/`reviving`/`destroyed` oyunun meşru halleri.
Canlıda ölçüldü: `Süleyman` `idle → alive`, gerçekten ölü olan `Baturalp` **dokunulmadı**.

### Ölçüm (canlı dev dünyası)

```
seçici     "casus" yazınca liste «Casus Kuş»a indi → 7 girildi → özet «1 satır: Casus Kuş 7»
yazma      units.spy_bird = 7  ·  audit: {"units":{"spy_bird":7},"target":"barracks"}
           ⭐ Mancınık 20 DOKUNULMADI (sıfırlar gönderilmiyor)
geri alma  spy_bird 0 → satır silindi, şehir yine yalnız mangonel=20

filtre     player_id=1 → 0 satır   ·   player_id=19 → 6 satır, hepsi 19
toplu      puan ≥ 100 → 12 oyuncu / 17 şehir  ·  tüm dünya → 50 oyuncu / 55 şehir  · ran=false
           Sur toplu savunmada → 400 «adet değil SEVİYE taşır»
```

⚠️ Toplu işlemin **yazma yolu canlıda çalıştırılmadı** — bilerek. Kuru koşu ölçüldü, silme/yazma
davranışı test veritabanında (29 test): kip ayrımı, negatif taban, muafiyet, katalog reddi,
audit satırı.

---

## 2. NESİL — Tur 3: okunabilirlik (detay kısılmadan)

Kullanıcının cümlesi: *"Bu kalabalığın içinde bu paneli ben etkili şekilde kullanabilir miyim
emin değilim… detaylı bilgiyi kısmadan daha kullanıcı dostu bir arayüz."*

**Kural: metin silinmez, katmanlanır.** Panelin uzun uyarıları (ham SQL tuzakları, «ölçüldü»
gerekçeleri, «ne silinmiyor» satırları) bu panelin en değerli parçası ve hepsi duruyor —
sadece istendiğinde açılıyor.

### ⭐ Ölçüldü: Ayarlar ekranı 8 829 px → 810 px

Aynı 92 ayar, aynı 11 grup, tarayıcıda `document.body.scrollHeight`:

| durum | yükseklik |
| :-- | --: |
| **öncesi** — hepsi açık, ayar başına 4 satır metin | **8 829 px** |
| sonrası — hepsi açık, ayar başına 1 satır + ⓘ | 5 458 px |
| **sonrası — varsayılan (gruplar kapalı)** | **810 px** |

İki ayrı kazanç: satır sadeleşmesi (%38) ve katlanma (%91). Metnin tamamı ⓘ balonunda duruyor.

### Neden native `<details>`

Collapse ve ⓘ için kendi bileşenimizi yazmak yerine tarayıcının kendi öğesi kullanıldı.
Bedavaya gelen üç şey: klavye erişimi, ekran okuyucu semantiği ve — en önemlisi —
**`Ctrl+F` kapalı bölümlerin içini de bulup açabiliyor**. Kendi yazdığımız bir collapse'ta
üçü de kaybolurdu ve tam olarak "detay kısılmasın" kuralı delinirdi.

### Arama üç alanda birden

Ayar araması etikette, **açıklamada** ve anahtarda çalışıyor: yönetici bir ayarı çoğu zaman
adıyla değil işleviyle arıyor. `ops.chatDays` ayarı "sohbet" yazınca çıkmalı; yalnız etikette
(«Sohbet saklama») arasaydık `chat.burst` («Kova: pencere başına mesaj») çıkmazdı.

⚠️ **Arama varken gruplar otomatik açılıyor.** Kapalı kalsalardı arama sonucu bulunur ama
görünmezdi — arama işe yaramazdı. Ölçüldü: "kaynak" → **4 / 92 ayar**, iki grup açık.

### Bakım ekranı: dispatcher ve scheduler artık ekranda anlatılıyor

Kullanıcı doğrudan sordu; cevap belgede kalmamalı, **soru nerede doğuyorsa orada** durmalı.
Panelin tepesinde:

> **scheduler** — oyunun saatini işletir (seferler, kuyruklar, savaşlar; saniyede bir).
> Durursa **oyun donar**.
> **dispatcher** — bildirim postacısı (`outbox` → WebSocket + push; yarım saniyede bir).
> Durursa **oyun işler ama kimse haber almaz**.
> ⭐ Normalde iki satır olmalı: bir canlı scheduler + bir canlı dispatcher.

### ⭐ Ölü satır ≠ ölü satır

Bu ekranda **yeni bir tasarım açığı ölçüldü**: geliştirme sırasında sunucu altı kez yeniden
başlayınca liste **10 «ÖLÜ» satırla** doldu ve gerçek bir arıza bu yığının içinde
kaybolurdu. Ayrım artık ekranda:

| durum | görünüm |
| :-- | :-- |
| canlı | normal |
| ölü, **ama aynı türden canlı VAR** | yeniden başlatma **artığı** → katlanmış, soluk |
| ölü, **aynı türden canlı YOK** | **gerçek arıza** → üstte + kırmızı açıklama |

Ölçüldü: 12 satır → ekranda 2 canlı + «10 eski süreç artığı» tek satırlık katlanmış bir kutu.

### Paylaşılan bileşenler

`ui.tsx` 96 satırdan büyüdü ve tekrarları yuttu:
`Panel collapsible` · `Info` (ⓘ) · `Alert` (9 kopya `<p className="text-success">` yerine) ·
`DataTable` (**5** el yazımı tablo, 5 farklı `thead` stili yerine; zebra için `row-alt`
jetonu — tasarım sisteminde **hazırdı ve hiç kullanılmıyordu**) · `SearchInput` (debounce
Oturumlar'da vardı, Veri tabanı filtrelerinde **yoktu** ve her tuş bir sorgu atıyordu) ·
`Pagination` (sayfa numarası **girilebiliyor**: 50 sayfalık tabloda 40'a gitmek 39 tık demekti) ·
`Empty` · `Loading` · `Stat` (iki ayrı kopyası vardı) · `Select` · `Checkbox` (dört farklı
satır içi stille yazılmıştı, ikisi 16 px ikisi 14 px) · `DangerConfirm` · `Countdown`.

**`Countdown`** — yükseltmenin bitiş anı `sessions.elevated_until`de baştan beri duruyordu ama
yalnız `step-up` yanıtında dönüyordu; sayfa yenilenince kalan süre bilinmiyordu ve 15 dakika
**sessizce doluyor**, yönetici bunu ancak bir 403 alınca fark ediyordu. `/admin/me` artık
`elevatedUntil` döndürüyor, üst şeritte `12:46` yazıyor.

---

## 2. NESİL — Tur 4: katalog tesisatı ve iki gerçek hata

Bu tur **hiçbir sayıyı değiştirmemeliydi** — tesisat kuruluyor, denge duruyor. İddia ölçüldü:
912 test yeşil, 176 motor testi ve 616 API testi **dokunulmadan** geçti.

### Adım 0: önce kanıt, sonra kod

⚠️ **Mevcut hash testi bir totolojiymiş.** `catalog-settings.test.ts:74`:

```ts
expect(catalogHash(DEFAULT_CATALOG_CONFIG)).toBe(catalogHash());
```

İki taraf da `cfg === DEFAULT_CATALOG_CONFIG` kısayolunu alıyor → **aynı kod yolu, aynı
sonuç, her zaman**. `UNITS`/`TECHS`/`BUILDINGS`'e bir alan eklense bu test yine geçerdi.
Yani kod tabanında varsayılan özeti sabitleyen **hiçbir** test yoktu; katalog tesisatına
girmeden önce kapatılması gereken ilk delik buydu.

İki yeni dosya, ikisi de **literal** (snapshot değil — `vitest -u` bir snapshot'ı sessizce
yeniden yazar ve regresyon kanıtı kanıtladığı şeyle birlikte kayar):

- `packages/catalog/test/hash.test.ts` — varsayılan özet `2ec624e6`
- `packages/catalog/test/golden-prices.test.ts` — 9 yapı × 5 seviye, 12 teknik × 4 seviye,
  Sur/Kalkan × 5 seviye için `{altın, yemek, saniye}` **elle yazılmış**

### ⚠️ Hata 1: Sur ve Büyü Kalkanı panel ayarlarını hiç okumuyordu

Bu hesap kataloğun **dışında, üç ayrı dosyada kopya** hâlinde duruyordu ve üçü de çıplak
`1.8` literali kullanıyordu:

| dosya | ne için |
| :-- | :-- |
| `queue.service.ts:297` | oyuncunun ödediği fiyat |
| `city.controller.ts:422` | arayüzde gösterilen fiyat |
| `score.service.ts:141` | puan hesabı |

Sonuç: yönetici `economy.buildingCostRate`'i 1,8'den 2,2'ye çıkarsa **Sur ve Kalkan hariç**
her şey değişiyordu; `buildingCostMultiplier`'ı ikiye katlasa Sur fiyatı hiç kıpırdamıyordu.
Panelde bir düğme vardı ve oyunun bir köşesine hiç ulaşmıyordu.

Hesap katalogda tek yere taşındı (`defenseStructureCost` / `defenseStructureTimeSeconds`).
⚠️ Bu ikisi `buildings.ts`te değil `units.ts`te duruyor (savunma birimi olarak), o yüzden
`buildingCost` onları tanımıyor ve ayrı bir giriş noktası gerekiyordu.

**Canlı ölçüm** — Çığlıktepe, Sur seviyesi 6:

```
API'nin bildirdiği sonraki seviye fiyatı   {gold: 32652, food: 33332}
beklenen (960·1,8⁶ · 980·1,8⁶)              32652        33332
```

Birebir aynı. `/healthz` katalog özeti de değişmedi: **`2ec624e6`**.

### ⚠️ Hata 2: puan hesabı dünya ayarlarını görmüyordu

Üç kaçak vardı ve en sinsisi `lossValue`: `def.gold + def.food` **ham** okunuyordu, yani
`economy.unitCostMultiplier`'ı hiç görmüyordu. Çarpanı 2 yapan bir dünyada oyuncu birimi
**iki katı** ödüyor, ölünce **tek katı** puan kaybediyordu — ordu kaybetmek kârlıydı.

`cumulativeBuildingValue` · `cumulativeTechValue` · `cumulativeDefenseStructureValue` ·
`lossValue` · `unitsValue` · `recomputeScoreBaseFromHoldings` artık `cfg` alıyor;
çağrı yerleri (`city.service.ts` şehir terk etme, admin aksiyonları) mevcut
`catalogFor?: (worldId) => CatalogConfig` kalıbını kullanıyor.

### Adım 2: varlık başına ince ayar tesisatı

`CatalogConfig`e iki grup eklendi: `buildingTuning` ve `techTuning`. Anahtarlar
`<id>:<eksen>` — `castle:gold` · `castle:rate` · `castle:timeFactor`.

⚠️ **Anahtar tek parça, ayar anahtarı iki parça kalıyor** (`buildingTuning.castle:gold`).
Üç parçalı yapmak (`bases.buildings.castle.gold`) iki yerdeki `key.split('.')` varsayımını
kırardı — `settings/catalog.ts:26` ve `admin.world.controller.ts:439` — ve **ikincisi
sessizce varsayılan gösterirdi**. Ayırıcı `:` bilinçli: id'ler snake_case
(`architect_school`), `_gold` soneki ayrıştırmayı belirsizleştirirdi.

⚠️⚠️ **SEYREKLİK SÖZLEŞMESİ — varsayılan BOŞ.** Dokunulmamış bir varlık için kayıt olmaz ve
formül global orana düşer. Buraya "yardımcı olsun" diye 9 yapının varsayılanını doldurmak
`economy.buildingCostRate`'i **sessizce işlevsizleştirirdi**: her yapının kendi kaydı olurdu
ve global düğme hiçbirine ulaşmazdı. Testle kilitlendi.

| durum | kullanılan |
| :-- | :-- |
| hiçbir şey değişmemiş | global (varsayılan) |
| yalnız global değişmiş | **global** ✅ düğme yaşıyor |
| yalnız varlık değişmiş | varlık |
| ikisi de | **varlık kazanır** |

### «Taban süre» yerine süre çarpanı

Kullanıcı "her yapının **taban süresi**" istemişti; oyunda öyle bir alan **yok** — süre
maliyetten türüyor (`timeFromCost`). Taban süre eklemek "süre maliyetten türer" değişmezini
kırar ve **ikinci bir süre kaynağı** açardı; "fiyatı üçe katladım ama süre değişmedi"
hatasının doğduğu yer tam olarak orası olurdu. Onun yerine `<id>:timeFactor` (1,0 varsayılan)
hesaplanan süreyi ölçekliyor. ⚠️ Çarpan `timeFromCost`ta değil sarmalayıcıda: o fonksiyon
yalnız `Cost` görüyor, varlık kimliğini bilmiyor.

### ⚠️ Ölçülmüş kırılma: hash şema büyümesine bağışık değildi

`CatalogConfig`e `buildingTuning: {}` eklendiği anda test kırıldı: özet yükü `c` alanına
config'in **tamamını** yazıyordu, dolayısıyla yeni bir alan — değeri varsayılan bile olsa —
**override'ı olan her dünyanın özetini kaydırıyordu** ve o dünyanın geçmiş savaşları sahte
bir "denge değişti" sinyali veriyordu.

Yük artık varsayılandan **fark**: `{economy:{foodRate:1.2}}`. Şemaya on alan daha eklense bu
string değişmez, ve bir test bunu kilitliyor.

⚠️ Geçişin bedeli: override'lı dünyalar için **bir kereye mahsus** kayma
(`e92dfa15` → `3f7fdea2`). Kabul edildi — `battles.catalog_hash` hiçbir sorguda `WHERE`e
girmiyor, yalnız savaş künyesinde gösteriliyor. **Canlı dünyada override yok** (panel
«0 ayar varsayılandan farklı» diyor) → oradaki hiçbir kayıt etkilenmedi.

### Doğrulama

```
912 test yeşil  (katalog 48 → 74, +26)
altın fiyat tablosu       değişmedi — 9 yapı, 12 teknik, Sur/Kalkan, her seviye
varsayılan katalog özeti  2ec624e6  (kod içinde ve canlı /healthz'de)
176 motor + 616 API testi dokunulmadan geçti
canlı Sur fiyatı          32.652 / 33.332 — formülle birebir
```

---

## 2. NESİL — Tur 5: katalog paneli ve düz Türkçe açıklamalar

Planın son turu. Kullanıcının iki sorusunun cevabı:

> *"Her tekniğin base fiyatı ve base süresi, her yapının base fiyatı… diğer binaların ve
> tekniklerin büyüme oranlarını nasıl görüp düzenlerim?"*
> *"Bu ayarların açıklamalarını biraz daha benim anlayacağım şekilde yazar mısın?"*

### 84 yeni ayar — elle yazılmadı, **türetildi**

`packages/settings/src/derived.ts`: 9 yapı ve 12 teknik × (altın · yemek · büyüme oranı ·
süre çarpanı). Panelde **92 → 176 ayar**.

⚠️ El yazımı bir blok iki şeyi bozardı:
1. `combat.ts`in uyardığı tabloya dönüşürdü — *"yeni bir ayar eklenince buraya da satır
   eklenmezse ayar panelde görünür ama motora hiç ulaşmaz"*.
2. Varsayılanlar **kopya** olurdu: `castle:gold` varsayılanı 200 yazılır, `buildings.ts` bir
   gün 220 olur ve **panel yalan söylerdi**. Türetmede varsayılan kaynağından geliyor.

⚠️ Bağımlılık `settings → catalog` ve tek yönlü — `packages/catalog`in hiç bağımlılığı yok,
döngü riski sıfır. Sınırlar da türetiliyor: sabit bir `max` koysaydık Teleport'un 500.000'lik
tabanı neredeyse kilitli olurdu.

### Matris — 84 ayar düz liste olamazdı

Satır = yapı/teknik (Türkçe ad, oyunun kendi sırasıyla), sütun = eksen, sağda **seviye seviye
önizleme**.

⚠️ **Dokunulmamış hücre DEĞER göstermiyor, `placeholder` gösteriyor.** Şema varsayılanını
değer olarak yazsaydık ve yönetici genel oranı 2,2 yapsaydı hücre hâlâ 1,8 derdi — panel
yalan söylerdi. Boş hücre = **devralınan**; yazdığın anda o kaleme özel olur ve genel düğme
o kalem için devre dışı kalır.

`POST /admin/settings/:worldId/catalog-preview` — savaş önizlemesinin kardeşi.
⚠️ İstemcide hesaplamak `catalogOverrides`ın (API paketinde) kopyalanmasını gerektirirdi;
kopya bir gün ayrışır ve panel oyunun ödetmediği bir fiyat gösterir.

**Ölçüm** (canlı, Kale satırı):

```
sv 1     111 a /     83 y ·  1 dk
sv 10  22.040 a / 16.530 y ·  2 sa
sv 20  7.869.282 a / 5.901.961 y ·  9 gün
```

Altın fiyat tablosuyla birebir aynı.

### ⭐ Açıklamalar: iki katman

`SettingDef`e `note` eklendi ve **92 açıklamanın hepsi** yeniden yazıldı:

| alan | ne söyler | örnek |
| :-- | :-- | :-- |
| `description` | **bu sayı ne yapar · büyütürsen ne olur · küçültürsen ne olur** | *"Çiftlik ve Maden'in maliyet artış oranı. Diğer yapılardan ayrı ve daha düşük, çünkü onlar 40 seviyeye kadar çıkıyor."* |
| `note` | **neden bu sayı** — ölçüm kaynağı, reddedilen alternatif, tarihçe | *"⚠️ 1,45 DEĞİL 1,33. Oyunun kendi dokümanı 1,45 yazıyor ama o oran orijinalin bilinmeyen tabanlarına aitti…"* |

Panelde ⓘ balonunda üst üste: önce sade cümle, sonra **«Neden bu sayı:»** başlığıyla gerekçe,
en altta anahtar ve aralık. **Hiçbir teknik detay silinmedi** — binary adresleri, ölçüm
sayıları, hata payları, reddedilen alternatifler hepsi `note`ta duruyor.

### Bayat yorumlar düzeltildi

`config.ts` ve `schema.ts` hâlâ *"tek tek düzenleme veri tarayıcısının işi (Faz 7)"* diyordu.
O vaat **gerçekleşmemişti**: tarayıcı yalnız DB tablolarını açıyor, katalog verisi veri
tabanında değil derlenmiş TypeScript'te. Ayrıca yorum "11 yapı" diyordu — gerçek **9**
(Sur ve Kalkan `units.ts`te savunma birimi olarak duruyor).

### ⚠️ Bilinen etki: ayar özeti kaydı

`settings_revisions.hash` tüm anahtarları özetliyor ve 84 anahtar eklenince ailesi kaydı
(`90c6f4a2` → `1cdbd074`). Kaçınılmaz ve zararsız — o hash hiçbir sorguda kullanılmıyor,
yalnız panelde gösteriliyor.

### Doğrulama

```
914 test yeşil  (API 616 → 618)
panel            92 → 176 ayar · 11 → 13 grup
matris           9 yapı × 4 eksen, devralınan değerler placeholder olarak doğru
                 (Çiftlik/Maden 1,33 · diğerleri 1,8 — iki farklı eğri)
önizleme         Kale sv 20 → 7.869.282 a / 9 gün, altın tabloyla birebir
```

---

## Oyuncuyu dünyadan kaldır (`purge-player`, 2026-08-06)

⛔ **Geri alınamaz.** Küratörlü aksiyonlar listesinde, `AdminStepUpGuard` arkasında.

**Hesap silmeden (`AccountDeleteService`) farkı ve NEDEN farklı:**

| | Hesap silme | Dünyadan kaldırma |
| :-- | :-- | :-- |
| Kim başlatır | oyuncunun kendisi (mağaza şartı) | yönetici (moderasyon) |
| Şehirler | **HEPSİ KALIR**, adlarıyla (2026-08-13) | **HEPSİ SİLİNİR**, başkent dahil |
| Kahramanlar | oldukları şehirde kalır | **silinir** — taşınacak şehir kalmıyor |
| Kullanıcı adı | **korunur** (2026-08-13) | **korunur** — denetim izi |
| Puan / sıralamalar | **dokunulmaz**, listelerde kalır | puan sıfırlanır, `ranking_excluded` |
| Hesap | sterilize edilir | dokunulmaz; oyuncuya **kalıcı ceza** |

⚠️ **Hesap silme 2026-08-13'te oyun dünyasına dokunmayı tamamen bıraktı** (kullanıcı): şehirler,
ad, puan ve sıralamalar aynen kalıyor, *"diğer oyuncular bu hesabın silindiğini anlayamasın."*
İki akış artık yalnız `players.deleted_at` işaretinde ortak. ⚠️ Eski tasarımda hayatta bırakılan
başkent, sıralama muafiyeti yüzünden 10 kat kuralına takılıp **saldırılamaz** hâle geliyordu;
değişikliğin asıl gerekçesi buydu.

**Ne yapar:** ittifak bağını koparır (⚠️ **LİDERSE ittifak DAĞITILIR** — lidersiz ittifak
onarılamaz olurdu, çünkü davet/at/ad/dağıt hepsi lider kapısının arkasında ve kaldırılan lider
bir daha giriş yapamaz; üyelere §13.15b.1 bildirimi gider) · açık görevleri iptal eder ·
kahramanları siler · **başkent dahil** tüm şehirleri siler (`buildings`·`units`·`defenses`·
`cave_units`·`queues` CASCADE ile gider) · puanı sıfırlar · `ranking_excluded` işaretler ·
kalıcı ceza verir ve oturumları düşürür · `audit_log`a yazar.

⚠️ **`missions` ve `battles` FK'SIZ.** Şehir silinince kendiliğinden temizlenmezler; açık
görevler elle iptal edilmezse varışta şehri bulamayıp `failed`'a düşer. Oyuncunun kendi
seferleri kadar **ona gelen** seferler de iptal ediliyor — hedefi yok olmuş bir saldırı da
boşlukta kalırdı.

⚠️ **`players` satırı SİLİNMEZ**: `cities.player_id` NO ACTION, `battles`/`rankings` ise
FK'sız referans tutuyor.

⚠️ **Ceza şart, işaret yetmez.** `players.deleted_at` yalnız bir işaret; oyun sorgularının
hiçbiri onu okumuyor. Tek okuyucusu 2026-08-13'ten beri girişin kendisi (`auth.service` →
`login`) ve o kapı da "parola yanlış" diyerek reddediyor, yani kaldırılan oyuncuya ne olduğunu
anlatmıyor. Ceza verilmeseydi kaldırılan oyuncu şehirsiz, bozuk bir dünyaya düşerdi.

**İki ayrı onay:** step-up parolası *"bu gerçekten sen misin"*, `confirm` alanı *"doğru
oyuncuyu mu seçtin"* sorusunu cevaplıyor — yanlış satıra tıklamak parolayla yakalanmıyor.
Ne kadar şehir/kahraman gideceği oyuncunun **«imparatorluk» ekranında** zaten yazıyor;
aksiyona ayrı bir önizleme eklenmedi.

---

## Tasarım notu

Panel oyunun **tasarım jetonlarını** kullanır ama oyunun `index.css`'ini kopyalamaz: oradaki
doku/kabartma katmanı (parşömen lifi, dövme taş) oyunun atmosferi için. Panel yoğun veri
ekranı — tablo, form, uzun liste — ve doku orada okunabilirliği düşürür. **Jetonlar ortak,
uygulama farklı.**

Panel **her zaman gece temasında**; tema seçici yok. Uzun süre açık kalan, yoğun sayı okunan
bir ekranda tek görünüm hem bakımı hem kontrast doğrulamasını yarıya indiriyor.

⚠️ Service worker / PWA **yok** (oyunda var): telefon ana ekranında duran bir yönetim kısayolu
gereksiz saldırı yüzeyi, önbelleğe alınmış bir yönetim ekranı ise bayat yetki gösterebilir.
