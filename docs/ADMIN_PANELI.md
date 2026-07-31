# YÖNETİM PANELİ — kurulum ve durum

> Mimari plan ve fazların tamamı için commit geçmişine bak; bu belge **çalışan sistemin
> künyesi**: nerede yaşıyor, nasıl açılır, hangi faz bitti.

---

## Durum

| Faz | Konu | Durum |
| :-- | :-- | :-- |
| 0 | Rol · guard · adım yükseltme · `apps/admin` iskeleti | ✅ **bitti** (2026-07-31) |
| 1 | Ayarlar altyapısı · dünya ekranı · manuel sıralama | ✅ **bitti** (2026-07-31) |
| 2 | Bakım modu uçtan uca | ⏳ |
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

## Tasarım notu

Panel oyunun **tasarım jetonlarını** kullanır ama oyunun `index.css`'ini kopyalamaz: oradaki
doku/kabartma katmanı (parşömen lifi, dövme taş) oyunun atmosferi için. Panel yoğun veri
ekranı — tablo, form, uzun liste — ve doku orada okunabilirliği düşürür. **Jetonlar ortak,
uygulama farklı.**

Panel **her zaman gece temasında**; tema seçici yok. Uzun süre açık kalan, yoğun sayı okunan
bir ekranda tek görünüm hem bakımı hem kontrast doğrulamasını yarıya indiriyor.

⚠️ Service worker / PWA **yok** (oyunda var): telefon ana ekranında duran bir yönetim kısayolu
gereksiz saldırı yüzeyi, önbelleğe alınmış bir yönetim ekranı ise bayat yetki gösterebilir.
