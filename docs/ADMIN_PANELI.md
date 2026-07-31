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
| 6 | Oyuncu ve moderasyon (+ `chat_bans` canlandırma) | ⏳ |
| 7 | Veri tabanı tarayıcı + aksiyonlar | ⏳ |
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
pnpm --dir mw --filter @mobiwar/admin dev
```

Oyun 5173'te, panel **5174**'te. İkisi de `/api`yi 3002'ye proxy'liyor.

### Üretimde (nginx — henüz uygulanmadı)

```nginx
server {
    server_name yonetim.scrabblecozucu.site;
    root /var/www/mobiwar-admin;           # apps/admin/dist
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
gömseydik rolü geri aldığımızda token ömrü (15 dk) boyunca geçerli kalırdı — "adminliği aldım"
dedikten sonra çeyrek saat hâlâ admin. Bedeli `accounts_staff` kısmi indeksi üzerinden tek
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

### Kapsam sınırı (bilinçli, Faz 1)

İşletim limitleri (`chatLimits()`, `notifyLimits()`, `mailLimits()`) **dünya 0 katmanından**
okunuyor. Sebep: bu okuyucular `worldId` bilmeyen yerlerde de çağrılıyor (`mail/templates.ts`,
`mail.service.ts`). Dünya bazlı geçersiz kılma **saklanıyor ve panelde görünüyor** ama tüketim
henüz dünya 0'dan. Gerçek dünya bazlı limit gerekince çağrı noktalarına `worldId` geçirilecek;
**depolama değişmez**.

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
güncelleseydik istek başına bir yazma olurdu; yenileme zaten ~15 dakikada bir olduğu için
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

## Tasarım notu

Panel oyunun **tasarım jetonlarını** kullanır ama oyunun `index.css`'ini kopyalamaz: oradaki
doku/kabartma katmanı (parşömen lifi, dövme taş) oyunun atmosferi için. Panel yoğun veri
ekranı — tablo, form, uzun liste — ve doku orada okunabilirliği düşürür. **Jetonlar ortak,
uygulama farklı.**

Panel **her zaman gece temasında**; tema seçici yok. Uzun süre açık kalan, yoğun sayı okunan
bir ekranda tek görünüm hem bakımı hem kontrast doğrulamasını yarıya indiriyor.

⚠️ Service worker / PWA **yok** (oyunda var): telefon ana ekranında duran bir yönetim kısayolu
gereksiz saldırı yüzeyi, önbelleğe alınmış bir yönetim ekranı ise bayat yetki gösterebilir.
