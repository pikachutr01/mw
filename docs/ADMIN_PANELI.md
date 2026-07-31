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
| 3 | Oturum ve cihaz yönetimi | ⏳ |
| 4 | Savaş motoru sabitleri | ⏳ |
| 5 | Katalog sabitleri | ⏳ |
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

## Tasarım notu

Panel oyunun **tasarım jetonlarını** kullanır ama oyunun `index.css`'ini kopyalamaz: oradaki
doku/kabartma katmanı (parşömen lifi, dövme taş) oyunun atmosferi için. Panel yoğun veri
ekranı — tablo, form, uzun liste — ve doku orada okunabilirliği düşürür. **Jetonlar ortak,
uygulama farklı.**

Panel **her zaman gece temasında**; tema seçici yok. Uzun süre açık kalan, yoğun sayı okunan
bir ekranda tek görünüm hem bakımı hem kontrast doğrulamasını yarıya indiriyor.

⚠️ Service worker / PWA **yok** (oyunda var): telefon ana ekranında duran bir yönetim kısayolu
gereksiz saldırı yüzeyi, önbelleğe alınmış bir yönetim ekranı ise bayat yetki gösterebilir.
