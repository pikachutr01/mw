# DAĞITIM — neyi nasıl canlıya çıkarırız

> Bu belge **"değişikliği canlıya nasıl alırım"** sorusunun tek cevabıdır.
> Sunucunun künyesi, ilk kurulum ve kalan yayın adımları `YAYINA_ALMA.md`'de.

---

## 1. Kısa cevap: her değişiklik aynı yoldan gider

**Actions → «Canlıya çıkış» → Run workflow.** Başka hiçbir şey yapmana gerek yok.

| Ne değişti | Ek iş var mı | Neden |
|---|---|---|
| Yalnız **web** (React ekranı) | **Hayır** | Aynı paket, aynı akış |
| Yalnız **API** (sunucu kodu) | **Hayır** | `pm2 reload` dağıtımın içinde |
| Yalnız **veritabanı** (yeni tablo/kolon) | **Hayır** | Göçler dağıtımın **ilk adımı** |
| Yalnız **admin paneli** | **Hayır** | Aynı pakette taşınıyor |
| Karma | **Hayır** | — |

Göç adımı `ops/surum-yayinla.sh` içinde, kod değişiminden **önce** koşuyor:

```
göçler → current symlink → pm2 reload → /healthz → (geçmezse otomatik geri alma)
```

Yani "veritabanını da güncellemem gerekiyor mu?" sorusunun cevabı **hayır** — göç dosyasını
depoya işlemen yeterli, gerisi otomatik.

---

## 2. Neden kısmi dağıtım yok (yalnız web / yalnız api)

İlk bakışta "sadece CSS değişti, neden her şeyi derliyoruz?" mantıklı görünüyor. İki sebeple
yapmıyoruz:

**1. Zaten derlemiyoruz.** Turbo değişmeyen paketi yeniden derlemez; önbellekten alır.
Ölçüm (2026-08-03): sekiz işten **beşi önbellekten**, toplam ~35 saniye. Kazanılacak zaman
zaten kazanılmış durumda; kalan süre `pnpm install` ve testler ki ikisi de atlanmamalı.

**2. Asıl bedeli tutarlılık.** Tek sürüm dizini (`releases/<zaman-sha>/`) web, admin, API ve
göçlerin **aynı commit'ten** geldiğini garanti ediyor. Kısmi dağıtımda «web yeni, API eski»
durumu mümkün olur ve bu hatalar sessizdir: yeni ekran, sunucuda henüz olmayan bir alanı
okur ve boş gösterir. Geri alma da karmaşıklaşır — hangi parçanın hangi sürüme döneceği
ayrı bir karar hâline gelir.

> Dağıtım süresi gerçekten sorun olursa doğru çözüm kısmi dağıtım değil, **testleri
> paralelleştirmek** ya da `pnpm install`i önbelleğe almaktır.

---

## 3. Veritabanı değişiklikleri

### Göç dosyası yazma

`apps/api/drizzle/00XX_ad.sql` — sıradaki numarayı al, `meta/_journal.json`'a girişi ekle
(`idx`, `version: "7"`, `when`, `tag`, `breakpoints: true`).

Bu depoda göçler **elle** yazılıyor (drizzle-kit üretimi değil) ve bir üslubu var:
Türkçe başlık yorumu **neden** yapıldığını anlatır, `IF NOT EXISTS` ile tekrar-dayanıklıdır,
iş kuralı varsa `CHECK` olarak da yazılır, mevcut satırlar `UPDATE … WHERE` ile doldurulur.
Örnek: `0036_ranking_exempt.sql`.

### ⚠️ Göç GERİ ALINMAZ

`surum-yayinla.sh` sağlık kontrolü düşerse **kodu** eski sürüme döndürür, şemayı değil.
Bunun tek bir pratik sonucu var ve pazarlıksızdır:

> **Her göç, bir önceki sürümün de çalışabileceği şekilde yazılmalı.**

Bu yüzden **expand-contract**:

| İş | Doğru yol |
|---|---|
| Kolon ekleme | Tek adım — `DEFAULT` ver, `NOT NULL` ancak varsayılanla birlikte |
| Kolon silme | **İki sürüme yay**: önce kodu koludan ayır (sürüm N), sonra kolonu düşür (N+1) |
| Kolon adı değiştirme | Yeni kolon ekle → iki yere yaz → okumayı taşı → eskiyi düşür |
| `NOT NULL` yapma | Önce geri-doldur, sonra kısıtı ekle |
| Tablo silme | Kod artık dokunmuyor olmalı, en az bir sürüm bekle |

### Boş veritabanında sınama

Göç zincirinin sıfırdan da koştuğunu doğrula (canlıda yeni dünya kurulursa bu yol işler):

```bash
docker exec mw-postgres psql -U mobilwar -d postgres -c "CREATE DATABASE mw_goctest;"
cd mw/apps/api && DATABASE_URL="postgresql://mobilwar:mobilwar@localhost:5432/mw_goctest" node scripts/migrate.mjs
docker exec mw-postgres psql -U mobilwar -d postgres -c "DROP DATABASE mw_goctest;"
```

---

## 4. ⭐ Servis komutları

### Canlı sunucu (`ssh root@31.210.36.185`)

```bash
sudo -u deploy pm2 list                      # ne çalışıyor
sudo -u deploy pm2 restart mobilwar          # yeniden başlat (kesinti ~2 sn)
sudo -u deploy pm2 reload  mobilwar          # zarif: çalışan görev turu biter, sonra değişir
sudo -u deploy pm2 stop    mobilwar          # durdur (oyun kapanır, veri kaybı yok)
sudo -u deploy pm2 start   mobilwar          # başlat
sudo -u deploy pm2 logs    mobilwar --lines 100 --nostream    # son loglar
sudo -u deploy pm2 describe mobilwar         # ⚠️ «interpreter args» satırını buradan doğrula
```

⚠️ **`pm2 delete` kullanma** — uygulama tanımı silinir ve `pm2 save` sonrası açılışta geri
gelmez. Yeniden kurmak gerekirse: `pm2 startOrReload /var/www/mobilwar/shared/ecosystem.config.cjs`.

```bash
nginx -t && systemctl reload nginx           # ⚠️ ÖNCE test: aynı nginx üç siteyi birden tutuyor
systemctl status postgresql
sudo -u postgres psql -d mobilwar            # veritabanı kabuğu
```

**Göçü elle koşturmak** (dağıtım dışında, nadiren):

```bash
cd /var/www/mobilwar/current/api
/opt/node22/bin/node --env-file=/etc/mobilwar/.env scripts/migrate.mjs
```

**Sürümü geri almak:**

```bash
ls -1t /var/www/mobilwar/releases | head -5
sudo -u deploy /var/www/mobilwar/releases/<eski-sürüm>/ops/surum-yayinla.sh <eski-sürüm>
```

**İlk admin / rol atama:**

```bash
cd /var/www/mobilwar/current/api
/opt/node22/bin/node --env-file=/etc/mobilwar/.env scripts/rol-ver.mjs <kullanıcıadı> admin
```

Elle SQL karşılığı (denetim kaydı yazmaz, script tercih edilir):
`UPDATE accounts SET role = 'admin' WHERE email = '…';`

> Rol **her istekte** veritabanından okunuyor — çıkış/giriş gerekmez, yetki anında geçerli.
> Sıradan bir oyuncu panele **giriş yapabilir** ama yalnız «Bu alan için yetkin yok.» görür.

### Yerel geliştirme

```bash
cd C:\Projects\misc\ghidra\mw && docker compose -f compose.dev.yml up -d && pnpm db:migrate && pnpm build
```
```bash
cd C:\Projects\misc\ghidra\mw\apps\api && node --env-file=../../.env dist/main.js
```
```bash
cd C:\Projects\misc\ghidra\mw && pnpm --filter @mobilwar/web dev
```
```bash
cd C:\Projects\misc\ghidra\mw && pnpm --filter @mobilwar/admin dev
```

Oyun **5173** · panel **5174** · API **3002** (`ROLE=all` → worker aynı süreçte; worker
olmadan savaşlar çözülmez).

⚠️ API'de `pnpm dev` **kullanma** — NestJS dekoratörleri Node'un tip sıyırmasıyla kayboluyor;
`pnpm build` sonra `node dist/main.js`.

⚠️ API kodu değiştiyse süreç **yeniden başlatılmalı**; web tarafı HMR ile kendiliğinden güncel.

**Port doluysa** (`EADDRINUSE`): `netstat -ano | findstr :3002` → `taskkill /PID <pid> /F`.

**Duman testi:** `node apps/api/scripts/smoke.mjs http://localhost:3002`
⛔ **Üretime karşı ÇALIŞTIRMA** — gerçek hesap açar ve gerçek e-posta gönderir. Betikte
`NODE_ENV=production` kapısı var.

---

## 5. Sıralama otomatik mi koşuyor?

**Evet, cron gerekmiyor.** Zamanlama `missions` tablosunda bir `ranking_snapshot` satırı:
handler anlık görüntüyü alır ve **aynı transaction'da bir sonrakini yazar**, zincir kopmaz.
Worker her açılışta `ensureRankingSchedule` ile zinciri onarır; tekillik anahtarı
(`ranking:<iso>`) kopya görev oluşmasını engeller. Saatler oyun saatiyle **00:00 · 08:00 ·
16:00** (`ranking.service.ts` → `SNAPSHOT_HOURS`), bakımda takvim doğal olarak kayar.

Aradaki bir anda elle almak: panel → Dünya → **«Sıralamayı şimdi güncelle»**.

---

## 6. İleride: Flutter mobil uygulaması

### Depo yerleşimi
`apps/mobile/` — aynı monorepo. Paylaşılan kural ve metinler için `packages/catalog` ve
`packages/contracts` **kaynak olarak** kullanılmalı (`design-tokens` zaten `tokens.dart`
üretiyor); iki dilde iki ayrı katalog tutmak, ilk gün sürüklenmeye başlar.

### CI/CD — GitHub yapabilir

Ayrı bir iş akışı (`.github/workflows/mobile.yml`), oyun dağıtımından **bağımsız**: mobil
sürüm mağaza onayına tabi, web ise anında çıkıyor; ikisini aynı workflow'a bağlamak
web dağıtımını mağazanın hızına indirger.

| Adım | Nasıl |
|---|---|
| Derleme | `flutter build appbundle --release` → `.aab` |
| İmzalama | Keystore + parola **GitHub secret** (base64 olarak) |
| Play Store | `r0adkll/upload-google-play` — servis hesabı JSON'u secret'ta. `internal` track'e otomatik, üretime **elle terfi** |
| iOS | ⚠️ **macOS runner** gerekir (dakika ücreti ~10×) + sertifika/provisioning secret'ları. İlk sürümlerde Xcode'dan manuel yükleme daha ucuz |

### ⭐⭐ Tek cihaz kuralı — mobilin uyması gereken sözleşme

Oyun, bir hesabın aynı anda tek yerde açık olmasını zorluyor (`session.singleDevice`,
varsayılan AÇIK). İstemci her istekte üç başlık gönderiyor; mobil de aynısını yapmalı:

| başlık | değer | nerede saklanır |
|---|---|---|
| `X-Device-Id` | kurulum başına UUID | kalıcı depo |
| **`X-Client-Instance`** | **kurulum başına UUID** (aşağıdaki uyarı!) | **kalıcı depo** |
| `X-Platform` | `android` / `ios` | — |

⚠️⚠️ **`X-Client-Instance` bellekte üretilmez, kalıcı saklanır.** Başlığın anlamı «uygulamanın
çalışan tek kopyası»; web'de bu bir **sekme** olduğu için orada `sessionStorage` kullanılıyor.
Mobilde sekme yok, kopya = **kurulum**. Her açılışta yeni kimlik üretilirse şu yaşanır: mobil
uygulamalar sürekli öldürülüp açılır, önceki kimliğin sahipliği `session.claimGraceSeconds`
(90 sn) boyunca taze kalır ve oyuncu **kendi hesabına giremez** — ekranda *"hesabın başka bir
cihazda açık"* yazar. Kalıcı kimlikle yeniden açılış aynı sahipliği anında geri alır.

⚠️ Mobilde `X-Client-Instance` ile `X-Device-Id`in **aynı değer olması tamamen doğrudur**;
ikisini ayırmak yalnız web'de (sekmeler yüzünden) anlamlı.

Bu davranış `apps/api/test/presence.test.ts` → *«mobil: instanceId kalıcı olmalı»* bloğunda
kilitli; yanlış uygulamanın sonucu da orada bir test olarak duruyor.

### ⚠️ Mobilin getirdiği tek gerçek kısıt: API sürüm uyumu

Web'de eski istemci yoktur — sayfa yenilenir, herkes yeni sürümdedir. Mobilde **öyle değil**:
mağaza onayı günler sürer, güncellemeyi almayan oyuncu haftalarca eski sürümde kalır.

> Mobil çıktıktan sonra API'de **kırıcı değişiklik yapılamaz**: alan silme, alan anlamını
> değiştirme, zorunlu yeni alan. Yeni alanlar opsiyonel eklenir, eskiler bir sürüm boyunca
> doldurulmaya devam eder — göçlerdeki expand-contract kuralının HTTP karşılığı.

Push tarafı hazır: `push_subscriptions` tablosu FCM jetonlarını da alacak şekilde tasarlandı
(§7.2b), ayrı bir şema gerekmiyor.

---

## 7. Sık sorulanlar

**"Sadece bir yazım hatası düzelttim, yine de tüm süreç mi işleyecek?"**
Evet — ve ~10 dakika sürer. Testlerin koşması bir maliyet değil, düzeltmenin başka bir şeyi
kırmadığının kanıtı.

**"Dağıtım yarıda kesilirse?"**
Sürüm dizini `releases/` altında ayrı; `current` symlink'i ancak göç ve dosya açma bittikten
sonra değişiyor. Yarıda kesilen dağıtım canlıya hiç dokunmaz.

**"Canlıda bir şeyi elle düzeltebilir miyim?"**
`current/` altındaki dosyaları düzenleme — bir sonraki dağıtımda kaybolur ve o ana kadar
depo ile canlı ayrışır. Acil durumda doğru yol: düzeltmeyi depoya işle, dağıt. Gerçekten
acilse önce `pm2 stop mobilwar` (oyun kapanır ama veri güvende).

**"Yedek nerede?"**
`/var/backups/mobilwar/*.dump` (günlük 04:45, 14 gün). ⚠️ **Aynı sunucuda** — sunucu tamamen
giderse yedek de gider. Uzak kopya hâlâ yapılacaklar listesinde.

---

## 8. ⚠️ Veritabanını sıfırlamanın görünmeyen bedeli

Canlı veritabanını `DROP`/`CREATE` ile sıfırlarken **dizi sayaçları da sıfırlanır**
(`outbox.id` yeniden 1'den başlar). Bu tek başına zararsız görünür ama dışarıdaki servisler
o kimlikleri hatırlıyor olabilir.

**2026-08-03'te yaşandı:** Resend'e giden `Idempotency-Key` `outbox-<id>` biçimindeydi.
Sıfırlamadan önce `outbox-1` ve `outbox-2` anahtarları kullanılmıştı; sıfırlamadan sonraki
ilk kayıt maili aynı anahtarları **farklı gövdeyle** istedi ve Resend
**409 `invalid_idempotent_request`** döndürdü. Doğrulama e-postası hiç gitmedi, üstelik
ekranda "Gönderdik" yazıyordu (o mesaj bilerek iyimser — sayım sızdırmamak için).

Anahtar artık `outbox-<id>-<created_at ms>`; sıfırlanmış bir veritabanı eski anahtarlarla
çakışmıyor. Ama ders daha genel:

> **Dış servise gönderdiğin her kimliğe, veritabanı sıfırlansa da tekrar etmeyecek bir
> bileşen ekle.** Dizi sayaçları bu garantiyi vermez.

Aynı risk taşıyan yerler: ödeme sağlayıcısına gidecek sipariş kimlikleri, mağaza satın alma
doğrulamaları, dış webhook'lara verilen `event_id`'ler.
