# MOBILWAR — BAŞLANGIÇ

> ### ⭐ 2026-08-02 — ÜRÜNÜN ADI ARTIK **MobilWar**
> Alan adı **`mobilwar.com`**. Kod, paket adları (`@mobilwar/*`), veritabanı (`mobilwar` /
> `mobilwar_test`), ekran metinleri ve mail şablonları **tamamen** geçirildi.
>
> ⚠️ `docs/` altındaki **Mobiwar/MobiWar yazımları BİLEREK DURUYOR**: onlar tersine
> mühendislikle çözülen **orijinal J2ME oyununun** kayıtları (`MobiWar.zip`, `cgs/MobiWar.java`,
> `mobiwar-engine.js`, ölçüm raporları). Onları yeniden adlandırmak kaynağın izini bozardı.
> Kural basit: **çalışan ürün MobilWar, tersine mühendislik kaynağı Mobiwar.**

> **📍 NEREDEYİZ (2026-07-31):** Faz 0 ✅ · Faz 1 ✅ · **Faz 2 TAM KAPANDI** (son çıkış kriteri
> offline push 2026-07-31'de girdi) · Faz 3-4 parça parça
>
> **Eski özet (2026-07-30):**
> Oyun **tarayıcıda oynanabilir ve anlık**. Altı görev tipi · üretim bandı · Mağara · Kahramanlar
> (Tapınak) · **İttifak sistemi** (roller, davet/başvuru, canlı durum, sıralama) · zengin **savaş
> raporu** (kahraman kartları, Sur/Mağara, ganimet dökümü) · **şehir kurma yarışı görünürlüğü** ·
> **dört dünya hız çarpanı (hepsi 1)** · motor **1.0.0**.
> Kod `mw/`, GitHub'da, **571 test yeşil**, 21 migration.
>
> **🚦 SIRADAKİ İŞ:** **Hesap/şehir aksiyonları** (tatil modu · şehir terk · şehir adı) ·
> orijinal Java metin taraması · denge senaryoları · moderasyon minimumu (şikayet paneli).
> ⚠️ **Genel Sohbet kullanıcı tarafından EN SONA alındı.**
> 🔵 **Kullanıcıdan bekleyen:** `RESEND_API_KEY` (`mw/.env`'e kendisi yazacak) +
> **`send.mobilwar.com`** DNS kayıtları (MX + SPF + DKIM). ⚠️ Alan adı `mobilwar.com`
> olarak değişti; `send.scrabblecozucu.site` planı iptal — ayrıntı `VPS_DURUM_RAPORU.md`
> başındaki 2026-08-02 notu ve `mw/.env.example` başlığı.
>
> **🔑 Test hesapları:** `wstest` / `mobiwar2026` (4 şehir, dolu ordu) · ittifak denemesi için
> `itflider` + `itfuye` / `parola-12345` (run.dll ittifağı). Giriş **kullanıcı adıyla**.
>
> ### 🔵 KULLANICIDAN CEVAP BEKLEYEN SORU
> 1. ✅ **Büyü Kalkanı + Sur — ÇÖZÜLDÜ ve 24 ÖLÇÜMLE DOĞRULANDI (2026-07-29).** İkisi de aynı
>    nesne sınıfı, faza göre sırayla hatta: **faz 1-2 → Sur · faz 3 → Kalkan**. Motorda 24/24
>    kazanan doğru. Doğrulama dört hata çıkardı ve hepsi düzeltildi: Sur da binary formülünü
>    kullanıyormuş (tasarımsal `2500×√Sv` modeli kaldırıldı) · Şaman çıkarması faza göre stat
>    okur · kalkanı güçlendiren teknik **Tılsım**, Büyücülük değil · `COUNTER_K` 1,01 → 1,0.
>    Ayrıntı `BUYU_KALKANI_TESTLERI.md` ve `mobiwar-verified-formulas` hafızası.
>    ✅ **TAM DOĞRULANDI: 32/32 ölçüm.** Tek sapan senaryo (D4) yanlış okunmuşmuş; tekrarlanınca
>    motorla oturdu. Üç izolasyon seti (G/H/I) bu yüzden koşuldu — **ders:** sapan tek ölçüm için
>    mekanizma aramadan önce o ölçümü tekrarlat. Kalan sapma yalnız ölçüm çözünürlüğü altında
>    (saldıranın Süvari/Ejderha kalanında 1 birim).
> 2. **Mağara yıkma tabanı** — `cuce-magara.png` tablosu sv1 = **100** cüce diyor, oyunun kendi
>    düzyazısı **150**. Tabloyu esas aldık; `CAVE_CONSTANTS.breakBase` tek sayı değişikliğiyle
>    150 olur. Ayrıntı §13.20.1.

---

## 1. Oyunu aç

Docker Desktop'ı aç (yeşil "Engine running"), sonra sırayla — **2. ve 3. komut kendi terminalinde
açık kalmalı** (biri API+worker, biri web sunucusu):

```bash
cd C:\Projects\misc\ghidra\mw && docker compose -f compose.dev.yml up -d && pnpm db:migrate && pnpm build
```

```bash
cd C:\Projects\misc\ghidra\mw\apps\api && node --env-file=../../.env dist/main.js
```

```bash
cd C:\Projects\misc\ghidra\mw && pnpm --filter @mobilwar/web dev
```

→ tarayıcıda **http://localhost:5173**. API 3002'de (`ROLE=all` → worker aynı süreçte;
worker olmadan **savaşlar çözülmez**, ordular sonsuza kadar yolda kalır).

**Hızlı doğrulama** (`mw/` içinden): `node apps/api/scripts/smoke.mjs http://localhost:3002`
→ tüm uçları gerçek HTTP üzerinden dener; *"API mi bozuk, arayüz mü"* sorusunun ilk cevabı.

---

## 2. ⚠️ TUZAKLAR — bilmeden ayağını kaydıranlar

Hepsi bu projede **gerçekten başımıza geldi**. Yeni oturum bunları okumadan koda dokunmasın.

| Tuzak | Sonucu | Doğrusu |
|---|---|---|
| API'de `pnpm dev` | NestJS dekoratörleri Node'un tip-sıyırmasıyla gitmiyor | `pnpm build` → `node dist/main.js` |
| `node dist/main.js` çıplak | `DATABASE_URL tanımsız` | `node --env-file=../../.env dist/main.js` |
| Worker kapalı (`ROLE=api`) | **Savaşlar hiç çözülmez**, ordular sonsuza kadar yolda | `ROLE=all` (varsayılan) |
| Ham SQL'de `timestamptz` | postgres.js **dize** döndürüyor → "getTime is not a function" ve sessiz yanlış karşılaştırma | Sınırda `toDate()` |
| Handler'da `now()` | Geç işlenen görev fazladan kaynak yazar, zincir kayar | **`ctx.at`** = görev vadesi |
| Nest DI'da `import type` | Dekoratör metadata'sı `Object` yazar, bağımlılık çözülemez | Servisleri **değer** olarak import et; sembol belirteçte `@Inject(DB)` |
| Gövdesiz istekte `content-type: application/json` | Fastify **400**: *"Body cannot be empty…"* — yapı iptali ve "okundu" böyle patlıyordu | Başlığı **yalnız gövde varken** gönder (`api.ts`) |
| Süre böleninde `?? 1` | Bölen `1,2^seviye`; kurulmamış yapı için 1 yazmak **var olmayan binayı çalıştırır** | Varsayılan **`?? 0`** |
| JSX yorumu `{/* */}` **ifade** konumunda | Babel *"Unexpected token"* → sayfa **bomboş** açılır (konsolda iz YOK, yalnız `hot update failed`) | Yorumu JSDoc'a al ya da eleman **çocuğu** yap |
| Varlık görselini kaynak çözünürlükte koymak | 42 ikon × ~400 KB = **36 MB**, her sayfada | Gösterim ölçüsüne indir (160-200 px → **2,1 MB**); kaynaklar `images/` altında kalır |
| Kuyruk emrini **sipariş anından** zamanlamak | Emirler **paralel** geri sayar; iptalde bekleyenlerin hepsi birden üretilmiş görünür | Zinciri her değişiklikte kur (`rescheduleUnitChain`): 2. emir 1.'nin BİTİŞİNDE başlar |
| Ekranda ham katalog `id`'si | *"temple için ön-şart: sorcery 6"* — oyuncu ne olduğunu anlamaz (§13.14) | Sunucu mesajında da `nameOfItem()` ile Türkçeleştir |
| CSS'te `position` dayatan yardımcı sınıf | `.tex` bir ara `relative` dayatıyordu → mobil alt bar **ekran dışına düştü** | Yardımcı sınıflar konumlandırmaya dokunmasın |
| İki bileşenin aynı şeyi çizmesi | Şehir şeridi hem kabuktan hem ekrandan çizilince **iki şerit** göründü | Paylaşılan öge tek yerde (`Shell`) |
| `numeric(20,6)` | En fazla **14 tam basamak**; 1e15 taşar | Test verisinde 1e12 üstü kullanma |
| `pnpm` kurulum betikleri | esbuild engellenince **Vite hiç çalışmaz** | Kök `package.json` → `pnpm.onlyBuiltDependencies` |
| Etkide `[onClose]` gibi **satır içi işlev** bağımlılığı | Her render'da yeni kimlik → etki yeniden koşar. `Modal`'da bu **odak çalıyordu**: yazarken imleç kayboluyordu | Etkiyi `[]` ile bir kez koştur, işlevi `useRef` üzerinden oku |
| Yoklama aralığını **düşürerek** tazelik aramak | Asıl sorun WS eşlemesinde eksik konudur; yoklama onu örter ve sorun görünmez kalır (§13.19) | Olayı `eventForOutbox`'a ekle; yoklama **emniyet ağı** olarak 60 sn kalsın |
| JSX yorumu `.map(() => ( ... ))` **döndürülen ifadenin başında** | İki kardeş öge dönmüş olur → derleme hatası, sayfa **bomboş** | Yorumu `map`'in ÜSTÜNE al (bu tuzağa 2026-07-28'de ikinci kez düşüldü) |
| Mutlak saati **yerel saatle** yazmak | Oyunun tüm zaman kuralları UTC (gece savaşı 00:00-08:00, sıralama 00/08/16). UTC+3'teki oyuncu "sıralama 19:00'da" okur, dokümanla asla eşleşmez | Ekranda `timeZone: 'UTC'` + "(oyun saati)" etiketi |
| Ön-şartta yapı seviyesini yalnız `buildings`ten okumak | **Sur ve Büyü Kalkanı `defenses` tablosunda yaşar.** Bu yüzden Sur ön-şartlı BÜTÜN savunma birimleri (Okçu Kulesi, Balista, Muhafız…) aylarca hiç üretilemedi ve kimse fark etmedi | `structureLevels()` ile iki kaynağı birleştir (§13.21.4) |
| Puanı doğrudan tam sayı yazmak | Her harcamanın **binlik artığı** çöpe gider; 900+900 harcayan 1 yerine 0 puan alır | Taban `numeric`'te saklanır, puan `floor(base/1000)` ile türetilir |
| `docker` PATH'te yok | Komut bulunamaz | `$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin` |
| `ROLE=worker` + push açık | Çevrimiçilik sayacı **yalnız API sürecinde** dolu (`gateway-registry`) → worker herkesi çevrimdışı sanar ve **WS bağlıyken de push atar** (kullanıcının 1 numaralı şartı sessizce delinir) | `ROLE=all` (varsayılan). Ayırmak şartsa push kararı API sürecine taşınmalı; açılışta uyarı basılıyor |
| Dispatcher'a **ikinci `'*'` sink** | `sinkFor` tek sink döndürür → ikincisi birincisini **sessizce susturur** (WS ya da bildirim komple ölür) | Yeni iş mevcut `'*'` sink'in İÇİNE; konuya ÖZEL sink (`dispatcher.on('mail:send', …)`) güvenli |
| Tek kullanımlık jetonu `useEffect`te tüketmek | **StrictMode etkiyi İKİ KEZ koşturur**: birinci istek jetonu harcar, ikincisi "geçersiz" der ve SONRA geldiği için ekrana hata yazar → iş OLMUŞken kullanıcı olmadı sanır (`/verify-email`'de yaşandı) | `useRef` ile jeton başına tek istek. ⚠️ `alive` bayrağı YETMEZ — o yalnız sonucu yok sayar, ikinci isteği engellemez |
| `LIKE` desenini SQL'de birleştirmek (`lower($1) \|\| '%'`) | Desen plan zamanında sabit olmadığı için Postgres öneki **indeksten okuyamıyor**, `lower(username)`'ı filtreye düşürüyor → indeks var ama boşuna (EXPLAIN testi yakaladı) | Deseni JS'te kur (`prefixPattern()`), tek parametre olarak geçir. Aynı yerde `%`/`_` jokerlerini de kaçır |
| PWA kurulabilirliğini `pnpm dev`de denemek | Service worker **yalnız üretim derlemesinde** kaydediliyor (`main.tsx`, HMR çakışması yüzünden bilerek) → `beforeinstallprompt` hiç ateşlenmez, «Uygulamayı İndir» düğmesi görünmez ve "çalışmıyor" sanılır | `pnpm --filter @mobilwar/web build` sonra `preview` (4173). ⚠️ `preview` **kendi proxy'sini** ister, `server.proxy`yi devralmaz |
| Modalın kaydırma kilidini her modalın kendi yedeğiyle geri vermesi | İki modal üst üsteyken ikincisi yedek olarak `'hidden'`i alır; önce birinci kapanırsa **sayfa kalıcı kaydırılamaz** kalır. Üst üste modal istisna değil: `ConfirmProvider` de bir `Modal` çiziyor | Modül düzeyinde sayaç: özgün değeri **ilk** modal saklar, **son** modal geri verir (`Modal.tsx`) |
| Hız sınırını "hesap başına" saymak | Kayıt maili, 60 sn içindeki **şifre sıfırlama** isteğini de bloklamıştı; sayım-sızdırmama kuralı hatayı da yuttuğu için mail **sessizce** hiç gitmiyordu | Cooldown **amaç başına** (`purpose`); günlük tavan hesap geneli kalır |

---

## 3. Mimari — değişmeyen kurallar

- **Maliyet, süre, ön-şart, sıralama, Türkçe ad → SUNUCUDAN** (`GET /cities/:id/catalog`).
  İstemci hesaplamaz, kendi tablosunu tutmaz; tutsa katalogdan sürüklenirdi.
- **Sefer süresi önizlemesi motorun AYNI `travel.ts`'ini çağırır** — iki formül kaçınılmaz kayardı.
- **WS olayı VERİ değil HABER taşır** (`{topic, ref}`); istemci sorguyu tazeler. Teslim garantisi
  **outbox**ta; WS "hızlı" katman, "kayıpsız" değil.
- **`worldId` daima imzalı token'dan**, istek yükünden asla. WS odaları `w{id}:` ile başlar;
  olayda `worldId` yoksa olay **düşürülür**.
- **Ekranda İngilizce `id` görünmez** (§13.14): kod/DB/URL İngilizce, görünen metin Türkçe.
- **Renkler yalnız design-tokens'tan.** Ham renk yazılırsa gece/gündüz eşleşmesi ve WCAG kapısı
  sessizce bozulur. Dokular da CSS (görsel dosya yok).
- **Görsel yolu id'den üretilir** (§13.11.9): `assets/{units,defenses,techs,buildings,missions}/<id>.png`.
  Eşleme tablosu YOK.

---

## 4. ⭐ GÖREV TİPLERİ — hepsi çalışıyor (2026-07-28)

Doküman (DÜNYA): *"tüm görev seçenekleri yalnızca dünya menüsünden yapılabilir"* → arayüzde
**tek modal** (`screens/world-modal.tsx`), sunucuda **tek uç** (`POST /missions/send`).
Hedefe göre hangi seçeneklerin çıkacağını **sunucu** söyler (`GET /missions/options`) — kural
istemcide ikinci kez yaşamıyor. Kapalı seçenek gizlenmez, **sebebiyle** gösterilir.

| Görev | Hedef | Kural |
|---|---|---|
| **Saldırı** | başka oyuncu | 24 saatte 3 (çift başına) · birlikler yola çıkarken düşer |
| **Casusluk** | başka oyuncu | yalnız Casus Kuş · `fark = casusluk + log2(kuş) − rakip` → 6 bilgi kademesi · vurulma **yalnız** savunanda Elf/Okçu Kulesi varsa · tüm kuşlar ölürse rapor da dönüş de YOK |
| **Nakliye** | herkes | kaynak **kalkışta** düşer, varışta teslim · ordu **boş döner** · miktar taşıma kapasitesiyle sınırlı |
| **Destek** | kendi şehrin | **TEK YÖNLÜ** — birlikler barakaya, kahramanlar tapınağa yerleşir, dönüş YOK · kaynak da gönderilebilir |
| **Şehir Kurma** | boş şehir | `1 + ⌊Sömürgecilik/3⌋`, tavan 5 · **yoldaki görevler de sayılır** · varışta şehir yeri dolduysa ordu geri döner |
| **Teleport** | kendi şehrin | **ANLIK**, görev satırı yok · iki şehirde de Teleport ≥ 1 · sonrasında bekleme (`20sa × 0,98^(sv−1)`) |

⚠️ **Aynı ittifakta olmak saldırı/casusluğa engel DEĞİL** (kullanıcı kuralı).
⚠️ Baraka sefer limiti **tüm tipleri birlikte** sayar (doküman: ORDU EKRANI).

**Faz 2 çıkış kriteri — HEPSİ ✅ (2026-07-31):** iki gerçek hesap ✅ · gerçek saldırı ✅ ·
doğru rapor ✅ · dünya yalıtımı ✅ · anlık bildirim ✅ · **altı görev tipi ✅** ·
**offline push ✅** (§7.2b — son kriter bugün kapandı).

## 4b. ⭐ ÇALIŞAN MEKANİKLER — tek bakışta

Hepsinin **gerekçesi ve formülü** `MOBIWAR_SISTEM_PLANI.md`'de; burası yalnız indeks.
Koda dokunmadan önce ilgili §'yi aç.

| Mekanik | Özü | § |
|---|---|---|
| **Üretim bandı** (Baraka + Savunma) | Tek bant, teker teker, tembel (tick YOK). 2. emir 1.'nin BİTİŞİNDE başlar. Emir sayısı: Baraka'da Baraka sv, Savunma'da **Sur sv**. Sayaç **istemcide türetilir**, sunucu beklenmez | §13.19.5 |
| **Puan** | `score_base` = net harcanan kaynak, `score = floor(base/1000)`. Harcamada artar, iadede ve savaş kaybında azalır | §13.17.1 |
| **Sıralama** | Canlı DEĞİL: `rankings` tablosu, günde 3 kez (00:00/08:00/16:00 oyun saati). `prev_rank` **veridir**, hesap değil | §13.17.2 |
| **Mağara** | Kapasite `50×2^(sv−1)` alan · yıkma `round(100×1,5^(sv−1)/(1+0,05·Demircilik))` · taşıma `25×√alan/1,1^(sv−1)` · onarım `20sa×0,9^(sv−1)`. **Emir taşımaz, sayaç kurar**; iptal serbest | §13.20 |
| **Sur** | Savaşta yıpranır, sonra onarılır: `8sa × hasarOranı × 0,92^(sv−1)`. Onarım sürerken **hasarlı savaşır** | §13.21.2 |
| **Sur + Büyü Kalkanı** | ⭐ AYNI nesne sınıfı, faza göre sırayla hatta: **faz 1-2 → Sur · faz 3 → Kalkan**. güç `round(1,8^Sv × Alan × durum/100)` → savunanın P'sine girer · mitigasyon `stat × Sv × 1,8^Sv × durum/100` · `durum -= 100 × net/bölücü` (bölücü: Sur ölçekli mDef, Kalkan HAM mDef). Ekrandaki yüzde = durum. Kalkanı **Tılsım**, Sur'u **Taş Ustalığı** güçlendirir | §13.21.1 |
| **Kahraman** | ⭐ Stat tablosu **satır 12** (hp/magicHp 1200 · pAtk/pDef 240 · mAtk 300 · mDef 4000). `stat = (sv+1)×taban×1,07^sv + taban×(1+4,8×yetenek)` — yetenek terimi **lineer ve seviyeden bağımsız**. Havuz: faz 2 → hp · faz 3 → magicHp · faz 1 yok. `Alan = mDef×0,005`. **Büyü ÇALIŞIYOR** (eski "ziyan" iddiası çürüdü). Yaşayan kahraman orduyu ayakta tutar; ölen kahraman ünite kaybı sayılır | §13.11.4 |
| **Kahraman çıkma** | `(ToplamTapınak×10 − Kahraman×155) × min(1, XP×0,000025)`, XP>499 kapısı — 28/28 ölçüm. ⚠️ Tapınak = oyuncunun **TÜM şehirlerinin toplamı** | §13.11.4 |
| **Kahraman yaşam döngüsü** | Ölüm yalnız durum %0,0'da. ⭐ **Yok olma YOK** (2026-08-01): kahraman her hâlükârda eve döner — sağ birlik varsa onlar taşır, yoksa **kendi hızıyla** yalnız yürür (`HERO_SPEED`, kalkışta yazılan `heroTravelSeconds`). Etiket tek: «Yok Edildi». XP havuzu **kazanan 2/3 · kaybeden 1/3**, taraf içi `1/(sv+1)` ağırlıkla. Diriltme `9 sa × 0,93^(Tapınak+Sv)` — süre seviyeyle KISALIR, maliyet artar | §13.11.4d |
| **Ganimet (havuz modeli)** | Havuz = kasa+enkaz (kaynak başına AYRI) · oran **%40→%20** doğrusal (100k→5k), taban %20 (2026-07-31) · kapasite yetse bile orandan fazlası alınmaz · jitter 0,85-1,15 KALDI | §13.10.4 |
| **Casusluk (kesişim)** | Kule+Elf VURUR, rakip kuş ENGELLER; ikisi de `2^seviyeFarkı` ölçekli. Tam blok: eşit seviyede kuşa kuş. Savunan HER casuslukta Önleme Raporu alır. Sweep: `spy-balance.mjs` | §13.11.6 |
| **Sur yıkım iadesi** | Tam yıkımda savunma emirleri iptal + "1 ünite eksik" iade (ganimetten SONRA kasaya) · rapor yalnız savunana · onarımdaki sur YÜKSELTİLEMEZ | §13.21.2 |
| **İttifak** | Roller 1 Asker · 2 Konsey · 3 Lider · davet/başvuru mesaj kutusunda Kabul/Red · online durumu YALNIZ ittifak içi · sıralama = üye puan toplamı | §13.15b |
| **Dünya hız çarpanları** | 4 kolon: resource/speed/training/construction — **hepsi 1** (kullanıcı). Kaçış dönüşü sefer sayılır; onarımlar ve mağara doldur/boşalt çarpan DIŞI. Casus seferi kuş tabanında (120 sn) | §13.7.0 |
| **Savaş raporu detayı** | `myArmy/enemyArmy/defenderStructs` + kahraman kartları (ad/resim/Yok Edildi !/XP) + Sur/Mağara kartı + ganimet dökümü (ortaya çıkan/taşınan) · savunana özel blok `defenderPrivate` iki katman maskeli · eski kayıtlar degrade | §7.1b |
| **Şehir kurma yarışı** | Koordinatı önce kapan, yoldaki kuruluş seferini **gelen saldırı** olarak görür (tip maskeli, **içerik açık**); varışta savaşsız dönüş; satır anında düşer | §13.16.6 |
| **Gelen ordu görünürlüğü** | Gelen saldırı/casuslukta **tam döküm**: birim sayıları + kahraman ad/seviye + kaç kuş. Casusluk şartı YOK (2026-07-31). Gizli kalan tek şey ganimet: dönüş bacağını savunan görmez (`OUT_ICON`'da `return` yok — gizlilik sınırı) | §13.10.1 |
| **Özel mesajlaşma (DM)** | Sohbet balonları, WS ile anlık · masaüstünde sağ alt köşe penceresi / mobilde bottom sheet, aynı anda TEK kişi · lazy loading (30'ar, kaydırma korumalı) · tek taraflı silme (veri sunucuda kalır) · engelleme TEK YÖNLÜ + açık uyarı · şikayet kaydı · flood (10sn/5, aynı metin 15sn) · acemi kısıtı 12 sa | §13.12 |
| **E-posta (Resend)** | Kayıt doğrulama + şifre sıfırlama/değiştirme. SDK yok (tek `fetch`), gönderim **outbox**tan (`mail:send` + konuya özel sink) · `Idempotency-Key` = outbox satır id'si · doğrulama **yumuşak** (şerit uyarır, oyun kilitlenmez) · `forgot-password` **daima 204** · sıfırlama tüm oturumları düşürür · anahtarsızken gövde konsola basılır | §9.2 |
| **Bildirim (toast + push)** | ⭐ **WS bağlıyken push GİTMEZ** — tek dallanma `NotifyService.deliver()`. Metin tek kaynaktan (`notify.catalog.ts`, `eventForOutbox`'ın kardeşi) → toast ve push aynı dizeyi gösterir. 4 kategori ayrı kapatılabilir · abonelik HESAP düzeyinde · 404/410'da satır silinir · üretim push'u 10 dk birleşir · toast sağdan girip sağa çıkar, `z-50` | §7.2b |
| **Arama** | Komuta Merkezi'nin 4. sekmesi: **Oyuncu Ara** (ada göre **veya** koordinata göre — orijinalin iki kipi) + **İttifak Ara**. Sonuç satırı Dünya'nın `TargetModal`'ını açar (yedi aksiyon bedava) · ada göre arama **yalnız BAŞKENT** verir · **önek** eşleşmesi (`text_pattern_ops` indeksi) · debounce 300 ms + 2 karakter · **Dünyada Bul** sıralama satırında → `/world/:k/:d` | §13.18.0 |
| **Şehir terk etme** | Altı engel: **başkent** · barakada savaşçı · **mağarada savaşçı** · **şehirde kahraman** · açık kuyruk · gelen/giden ordu. (Son ikisi ⭐ kullanıcı kararı; dokümanda yok ama `cave_units` CASCADE, `heroes.city_id` SET NULL → sessiz kayıp olurdu.) Engeller **liste** hâlinde döner; kilit altında YENİDEN kontrol edilir. Yapı+savunma puanı düşer (teknik düşmez), `city:abandoned` → `cities:changed`, `audit_log` satırı | §13.18 |
| **Gece savaşı** | Çarpan `(1 − 3/(GG+3))×0,3 + 0,7`, **yalnız Can ve Büyü Canı**'na uygulanır — Ghidra ile satır satır doğrulandı (`FUN_00412624`: iki oku-çarp-yaz çifti, stat+0x00 ve stat+0x08). ⚠️ **Taşıma çarpılmaz** (2026-07-31'de kaldırıldı; eski raporun "HP ve Taşıma" ifadesi yanlıştı). Savunma YAPILARI etkilenir (3. döngü), **Sur/Kalkan etkilenmez** (ayrı alanlar). Ölçüm dosyası `veri/gece-savasi-olcumleri.md` | §7 |
| **İki motor senkronu** | `scratchpad/engine_diff.mjs` keşif (`mobiwar-engine.js`) ve üretim motorunu yan yana koşturur — 6/8 birebir. ⚠️ **Birim id'leri farklı** (Türkçe/İngilizce) ve `mangonel` ikisinde BAŞKA birim; eşleme tablosu harness'te | — |
| **Ad kuralı (şehir + kahraman)** | **3-10 karakter**, Türkçe harf ve boşluk serbest, noktalama yok. Kaynak orijinal form (`g.java:1893` → `m.a(2, 10, …)`). Kural `@mobilwar/catalog/name-rules.ts`'te TEK yerde — ⚠️ ad ÜRETEÇLERİ de ona uymak zorunda (koloni adı `"Koloni N"`, kahraman havuzu ≤10). Eski uzun adlar `0024_name_limits.sql` ile kırpıldı | §13.18 |
| **Orijinal menü ağacı** | `g.java`+`k.java` çözüldü. Komuta Merkezi bir HUB: Mesajlar · Genel Durum · **İttifak** · **Arama** · Sıralamalar. Onay kalıbı ünlemle: *"… Emin misiniz!"* | §13.18 |
| **WS + yoklama** | Ekranı WS güncel tutar; yoklama yalnız **emniyet ağı** (60 sn). Aralığı düşürme isteği = WS'te eksik konu | §13.19 |

### Sıradaki
> ⭐ **Tam eksik envanteri `EKSIK_OZELLIKLER.md`'de** (2026-07-31 taraması: orijinalin 92 menü
> etiketinden ~22'si, 67 `.do` ucundan 16'sı hâlâ karşılıksız). Aşağıdaki liste onun özeti.

1. ✅ ~~Oyuncular arası mesajlaşma~~ — **2026-07-31'de bitti** (§13.12). Kalan: rapor satırında
   Sil / toplu seçim · şikayet moderasyon paneli · ittifak & genel sohbet (aynı altyapı).
2. ✅ ~~Web Push~~ — **2026-07-31'de bitti** (§7.2b), **Faz 2 kapandı**. Kalan: Flutter/FCM
   token kaydı (aynı tabloya girer) · bildirim geçmişi ekranı.
2b. ✅ ~~E-posta (Resend)~~ — **2026-07-31'de bitti** (§9.2). Kod anahtarsız da çalışıyor
   (gövde konsola). 🔵 **Kullanıcıdan bekleyen:** `RESEND_API_KEY` + `send.scrabblecozucu.site`
   DNS kayıtları (hostingdunyam paneli).
3. ✅ ~~Arama + Dünyada Bul~~ — **2026-07-31'de bitti** (§13.18.0). Kalan: infix arama.
4. **Hesap/şehir aksiyonları** — Tatil Modu toggle (savunma tarafı hazır) · Şehir Terk Et ·
   Şehir Adı Değiştir · Şifre Değiştir/Hatırlat
5. **Orijinal Java metin taraması** — bildirim/uyarı/rapor adlarının sistematik uygulanması
6. **Askerî unvanlar** (Subay/Komutan/Başkomutan/Mareşal) — kazanma şartı orijinalde
   sunucudaydı, bilinmiyor; kullanıcı "büyük savaş başarısı + süreli" diyor
7. **Denge senaryoları** — erken/orta/geç oyun maliyet-süre testleri
8. **Genel Sohbet** — ⚠️ kullanıcı EN SONA aldı

### Web arayüzü — ne var, ne yok
Masaüstünde üç sütun: sol **logo + menü** · orta **bilgi çubuğu + şehir şeridi + içerik** ·
sağ **ittifak + sohbet**. Boydan boya navbar YOK; alt gezinti barı **yalnız mobilde**.
Şehir şeridi masaüstünde her ekranda, **mobilde yalnız Ordular'da**; hareket simgeleri
**yalnız Ordular'da** ve kale simgesiyle aynı boyutta.

| Sayfa | Durum |
|---|---|
| **Ordular** | ✅ hareket listesi · detay modalı + görev iptali · şehir değiştirme. **Önizleme = görev tanımı + koordinat** ("Saldırı gidiyor / yaklaşıyor", `titleOf` tek kaynak); ordunun birleşimi yalnız modalde (2026-07-31) |
| **Baraka / Savunma** | ✅ üretim bandı (sıralama + iptal) · Savunma'da Sur/Kalkan **paralel şerit** |
| **Yapılar / Akademi** | ✅ kuyruk + iptal · Yapılar'da **Mağara modalı** (adına tıkla) |
| **Dünya** | ✅ diyar listesi → modal (altı görev tipi) · **açılış aktif şehrin diyarından** · ittifak sütunu dolu · görev modalında sabit alt bölüm · **`/world/:k/:d` derin bağlantısı** |
| **Mesajlar** | ✅ Raporlar/Mesajlar sekmeleri · tek tip liste satırı · **zengin savaş raporu modalı** (§7.1b) · **silme**: satır kutucuğu + "Hepsini Seç" + tek "Sil", onay diyaloğuyla (`POST /messages/delete`) |
| **Komuta Merkezi** | ✅ Genel Durum + İttifak (§13.15b) + **Arama** (§13.18.0) + Sıralamalar (Oyuncu ✅ · Kahraman ✅ · İttifak ✅) |
| **Seçenekler** | ✅ hesap (e-posta + doğrulama rozeti + **Şifre Değiştir**) + **Şehir paneli** (Şehir Adı Değiştir · Şehri Terk Et; orijinalde de bu menüde — `g.java` case 63) + tema (tema **yalnız burada**) + **Bildirimler paneli** (izin düğmesi + 4 kategori anahtarı, §7.2b) |
| **Tapınak** | ✅ kahraman kartları · yetenek/diriltme/yeniden adlandırma |
| **⚙ YÖNETİM PANELİ** | ✅ **9 faz + 5 kullanılabilirlik turu bitti** — `apps/admin`, dev 5174, oyuncu paketine tek bayt girmez. Yedi ekran: **Oyuncular** (liste · imparatorluk künyesi · oturumlar) · Dünya · **Ayarlar** (176 ayar, 13 grup; yapı/teknik başına fiyat matrisi) · Toplu işlem · Moderasyon · Veri tabanı · Bakım. Tam künye ve tuzaklar `docs/ADMIN_PANELI.md` |
| **Uygulamayı İndir** | ✅ PWA kurulum daveti (2026-08-02) — sol menüde ve mobil «Daha» listesinde. Mağaza uygulaması DEĞİL: `beforeinstallprompt` yakalanır (`lib/pwa.ts`), iOS'ta yönerge modalı açılır (Safari'de kurulum programla tetiklenemez), **uygulama penceresinde düğme hiç çizilmez**. Misafirde yok (kullanıcı kararı). Mağaza bağlantıları için dikiş bırakıldı (`STORE_LINKS`) |
| **Yardım** | ⛔ yer tutucu |
| Sohbet | ⛔ en sona alındı |

---

## 5. ✅ ALINAN KARARLAR (hepsi plana işlendi)

### Ekonomi ve üretim
| Karar | Sonuç |
|---|---|
| **Üretim süresi** (§13.11.3) | `K × (değer/1000)^0,8 / 1,2^sv` · K = **190** birim / **400** yapı-teknik · değer = altın+yemek (+savaşçıda **taşıma**) · hızlandıran Baraka / Mimar Okulu / Akademi |
| **Taban fiyatın anlamı** | Oyuncunun **ÖDEDİĞİ İLK** yükseltme. Kale/Baraka/Çiftlik/Maden sv1 başladığı için onlarda **1→2**'nin fiyatı |
| **Çiftlik/Maden tabanı** | Maden **4 altın + 3 yemek** · Çiftlik **3 + 4** (ürettiği kaynaktan ağır yer) |
| **`economyCostRate`** | 1,45 → **1,33** → seviye 40 gerçekten ulaşılabilir (geri ödeme 870 sa) |
| **Taşıma kapasitesi** | Kaynak = oyunun kendi dokümanı, binary DEĞİL. Yük Arabası **5.000** (3.000 yazılıydı) |
| Yapı/teknik tabanları | §13.9 tablosu + Teleport sv1 = 500.000/500.000 |
| Başlangıç | Kale 1 · Baraka 1 · Çiftlik 1 · Maden 1 · **4.000 altın + 4.000 yemek** (yalnız başkente) |
| Seviye tavanları | Çiftlik/Maden **40** · diğer yapılar + Sur/Kalkan **20** · teknik sınırsız |
| Kale bütçesi | Σ(bina seviyeleri) ≤ Kale×10 · **Sur/Büyü Kalkanı HARİÇ** |
| **Sur kapasitesi** | ⛔ **UYGULANMIYOR** — savunma birimi ön-şart varsa sınırsız (`enforced: false`) |
| İptal iadesi | Yapı/teknik **süreye göre**, savaşçı **kalan adetten bir birim eksik** |
| **Dünya hızı** | 4 çarpan: `resource` (üretim) · `speed` (sefer + mağara-kaçış) · `training` (birim) · `construction` (bina/Sur sv/teknik). **Hepsi 1** (2026-07-30). ⚡ rozeti 1x'te görünmez (§13.7.0) |
| **Giriş** | Kullanıcı adı + parola (e-posta yalnız kayıtta) |

### Oyun kuralları
| Karar | Sonuç |
|---|---|
| Dünya | 10 kıta × 500 diyar × 10 şehir, **1-indeksli** · Dünya ekranı **harita değil diyar listesi** |
| Şehir kurma | Konum kısıtı **yok** |
| Ganimet | **Havuz modeli** (§13.10.4): havuz = kasa + enkaz (kaynak başına ayrı) · oran %40 (≥100k) → %20 (≤5k) doğrusal · jitter 0,85-1,15 · kapasite yetse bile orandan fazlası alınmaz |
| Savunma tabanı | Her savunma tipinden savaş sonrası **en az 4** kalır (Tuzak hariç) |
| Casusluk | Gidiş hedefte **görünür** (kırmızı kuş) + **kuş sayısı da görünür** (2026-07-31), dönüş görünmez |
| Saldırı limiti | 24 saatte 3, **saldıran-hedef çifti başına** · Baraka sefer limiti = Baraka seviyesi |
| Görev iptali | Dönüş süresi = **gidilen yol kadar**; `return` iptal edilemez |
| Gece savaşı | **00:00–08:00** (oyun saati, UTC) |
| Kahraman | Seviye **0** başlar · diriltme `(3000,2000)×1,5^lvl` · şimdilik **ücretsiz otomatik** dirilme |
| İttifak kurma | Yalnız **Kale ≥ 5** (orijinalin premium şartı uygulanmıyor) |
| Sohbet | İttifak + DM + Genel · hepsi WS · **her dünyada ayrı** · DM'de ilk 12 saat kısıtı |
| Tema · Adlandırma | Gece/gündüz antik palet, tek kaynak design-tokens · kod İngilizce, metin Türkçe |

## 6. 🔵 Senden bekleyen kararlar (hiçbiri ilerlemeyi engellemiyor)

| # | Karar | Varsayılanım |
|---|---|---|
| 0 | Mağara yıkma tabanı **100** (tablo) mu **150** (doküman metni) mi? (§13.20.1) | tablo = 100 |
| 1 | ✅ **Alan adı — `scrabblecozucu.site` (apex)** seçildi (2026-07-31). Sertifika HAZIR (apex+www, otomatik yenileniyor). Bugün nginx'te `.site` tüm trafiği `.com`'a 301'liyor (`scrabblecozucu.com` conf, satır 70 ve 79) — yayına alırken o iki blok kaldırılacak. Mail alt alanı: `send.scrabblecozucu.site` | — |
| 2 | ✅ Dünya hızı — **x1'e çekildi** (2026-07-30, dört çarpan da 1) | — |
| 3 | Palet tonları + başlık fontu (§13.13.2) | ekranda görünce ayarlarız |
| 4 | Tuzak savunma tabanına girsin mi (§13.11.10) | hayır (tek kullanımlık) |
| 5 | Kahraman ölünce **ücretsiz otomatik dirilme** doğru mu? | evet; ücretli süre kısaltma Faz 4'te |
| 6 | RAM yükseltme zamanı (4 GB + 3 çekirdek) | canlıya çıkmadan önce |

---

## 7. Hangi belge ne zaman açılır

> ⭐ **Belgelerin hepsi 2026-07-31'de `mw/docs/` altına, yani GİT'E alındı.** Öncesinde kökte
> ve versiyonsuz duruyorlardı. Yollar aşağıda `docs/`'a görelidir.

| Belge | Ne zaman |
|---|---|
| **`MOBIWAR_SISTEM_PLANI.md`** | **Projenin beyni.** Kural, formül ve gerekçe (§13.5 harita · §13.9 ekonomi · §13.11 şehir/üretim · §13.12 sohbet · §13.13 tema · §13.16 dünya). ⚠️ Yalnız **kural değişince** güncellenir, özellik bitince değil |
| **`EKSIK_OZELLIKLER.md`** | **Tek backlog.** Yeni iş seçerken açılır (arayüz listesi de buraya katlandı) |
| `VPS_DURUM_RAPORU.md` | Canlıya çıkmadan önce (⚠️ yedekler hâlâ aynı sunucuda) |
| `referans/teknik_ve_yapi_dokumantasyonu.md` | Oyunun kendi kuralları — tartışmalarda **resmî kaynak** |
| `referans/TEKNIK_MANTIK_RAPORU.md` | **Savaş motoruna dokunmadan önce** — özellikle §0 "stat adları yanılsaması" |
| `referans/MOBIWAR_TEKNIK_KURULUM.md` · `referans/KURULUM_REHBERI.md` | DB şeması · sunucu profili · kurulumu **uygularken** |
| `referans/MOBIWAR_OYUN_VERISI.md` · `referans/MOBIWAR_MIMARI_RAPOR.md` | Birim statı / eski istemci ekran yapısı gerekince |
| `referans/*.txt` | Kullanıcının kendi kaynak metinleri (`duzenleme_onerileri` · `mesajlar` · `prod_notlar`) |
| `veri/` | Kalibrasyon çıkarımları (birim statları, üretim tabloları, mağara kapasitesi) |
| `DecompiledSrc/src/` | Orijinal J2ME java kaynağı — `g.java` menüler, `k.java` protokol |
| `araclar/harita.html` | Sefer süresini elle denemek için — tarayıcıda aç, oyna |

**⚫ `arsiv/` — açma.** Tarihsel ölçüm kayıtları ve eski oturumların dökümü. İçerik korunuyor
ama hiçbiri güncel değil; bir şeyi doğrulamak için değil, **ne yaptığımızı hatırlamak** için var.

> **Tur tur geçmiş bu dosyada TUTULMAZ** — `git log` (70+ commit, gerekçeli mesajlar) tek ve
> doğru kaynak. Burada tutmak aynı bilgiyi ikinci kez takip etmek demekti.
