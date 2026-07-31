# YÖNETİM PANELİ — kurulum ve durum

> Mimari plan ve fazların tamamı için commit geçmişine bak; bu belge **çalışan sistemin
> künyesi**: nerede yaşıyor, nasıl açılır, hangi faz bitti.

---

## Durum

| Faz | Konu | Durum |
| :-- | :-- | :-- |
| 0 | Rol · guard · adım yükseltme · `apps/admin` iskeleti | ✅ **bitti** (2026-07-31) |
| 1 | Ayarlar altyapısı · dünya ekranı · manuel sıralama | ⏳ |
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

## Tasarım notu

Panel oyunun **tasarım jetonlarını** kullanır ama oyunun `index.css`'ini kopyalamaz: oradaki
doku/kabartma katmanı (parşömen lifi, dövme taş) oyunun atmosferi için. Panel yoğun veri
ekranı — tablo, form, uzun liste — ve doku orada okunabilirliği düşürür. **Jetonlar ortak,
uygulama farklı.**

Panel **her zaman gece temasında**; tema seçici yok. Uzun süre açık kalan, yoğun sayı okunan
bir ekranda tek görünüm hem bakımı hem kontrast doğrulamasını yarıya indiriyor.

⚠️ Service worker / PWA **yok** (oyunda var): telefon ana ekranında duran bir yönetim kısayolu
gereksiz saldırı yüzeyi, önbelleğe alınmış bir yönetim ekranı ise bayat yetki gösterebilir.
