# MOBİL UYGULAMA — hesap kimliği, doğrulama kademeleri ve çoklu hesap temeli

> **Ne zaman açılır:** Flutter uygulamasına başlamadan **önce**, ve kayıt/doğrulama/silme
> akışlarına her dokunulduğunda. Bu belge **niyet ve gerekçe** taşıyor; derleme, imzalama,
> CI/CD ve tek cihaz başlık sözleşmesi `DAGITIM.md` §6'da, sinyal toplama katmanı
> `MOBIWAR_SISTEM_PLANI.md` §9.1'de, doğrulanmamış hesap kısıtları §9.2b'de.

Kaynak: kullanıcının 2026-08-13 tarihli kararı — *"insanların çoklu hesap açmasını
engelleyecek yöntemler üzerinde durmaya devam etmek istiyorum… kayıt olma sürecini de sadece
mobil uygulama üzerinden sağlamayı düşünüyorum… oyuncuların tercihlerine saygı duyan bir
sistem"*.

---

## 0. Tek cümlelik ilke

> **Doğrulanmamış hesap OYNAYABİLİR ama BESLEYEMEZ.**

Bütün tasarım bu cümleden türüyor. Aşağıdaki her kural, bir yerde bu cümleye geri bağlanabilir
olmalı; bağlanamıyorsa o kural bu belgeye ait değildir.

---

## 1. Neden "engellemek" değil "kârsız kılmak"

Çoklu hesap tamamen engellenemez. Engellemeye çalışan her sistem er ya da geç masum oyuncuyu
vurur — ve §9.1.1 bunu zaten yazmış: *"sistem asla otomatik ceza vermez"*, çünkü her teknik
izin masum açıklaması var (kardeşler, okul/ofis ağı, operatör NAT'ı, paylaşılan tablet).

⭐ **Asıl soru "kaç hesap var" değil, "zarar nereden geliyor".** §9.1'in kendi tehdit tanımı:
kendi kendini besleme (nakliye), bilerek ordu kırdırma (enkaz + XP hediyesi), sahte savaşla
puan/kahraman üretme. Üçünün ortak paydası **değer aktarımı**.

Buradan iki sonuç çıkıyor ve ikisi de sezgiye ters:

1. **Hesabın var olması zararsızdır.** Kullanıcının kendi tespiti (2026-08-13): yem hesaplar
   dünyada *yağmalanacak şehir* üretiyor, bu fena değil. Yeni hesap silme tasarımı da aynı
   yöne çalışıyor — silinen hesabın şehirleri dünyada kalıyor (§9.2c).
2. **Kapı, hesabın doğduğu yere değil, değerin aktığı yere konur.** Kayıtta kurulan kapı
   herkesi yorar ve kimseyi durdurmaz; nakliyenin önündeki kapı yalnız aktarım yapmak isteni
   durdurur.

⚠️ **Bu belgedeki hiçbir mekanizma otomatik ceza vermez.** Kilitli özellik ile ceza arasındaki
fark oyuncu için çok büyük: biri *"şunu yaparsan açılır"*, diğeri *"kaybettin"*. §9.1.1 aynen
geçerli, kapılar da onun istisnası değil.

---

## 2. Kademe modeli — K0 · K1 · K2

| Kademe | Nasıl geçilir | Ne açılır |
| :-- | :-- | :-- |
| **K0** — keşif | mobil uygulamadan kayıt | bugünkü doğrulanmamış limitleri (§9.2b: yapı/teknik/savunma sv 3, 200 savaşçı, saldırı-nakliye-şehir kurma-ittifak yok) |
| **K1** — e-posta doğrulandı | doğrulama bağlantısı | oyunun tamamı: saldırı, savunma, şehir kurma, kahraman, sıralama |
| **K2** — telefon doğrulandı | SMS kodu, **mobil uygulamada** | **başka bir oyuncuya değer aktarma**: nakliye, destek, ittifak kurma/katılma, (ileride) pazar |

⭐ **K1 → K2 sınırının nerede olduğu tasarımın en önemli kararı.** Sınır "oyunun tamamı"nda
değil, "başkasına bir şey verebilme"de. Böylece:

- doğrulamayan oyuncu **oynamaya devam eder** — saldırır, savunur, gelişir, sıralamaya girer;
- ama **hiçbir çoklu hesap senaryosu işlemez**, çünkü hepsi aktarımdan geçiyor;
- ve K2'yi isteyen an, oyuncunun *zaten bir şey yapmak istediği* an.

### 2.1 ⚠️ Neden "acemi koruması bitince zorunlu" değil

Acemi korumasının bitişi oyuncunun **saldırmak istemesiyle** ilgili, çoklu hesapla değil.
Oraya kapı koymak, kapıyı yanlış eyleme bağlamak olur: saldırı oyunun ana döngüsü ve onu
kilitlemek, doğrulamayı "oyunu oynayabilmenin bedeli" hâline getirir.

Acemi korumasının bitişi yine de değerlidir — ama **hatırlatma** anı olarak: bir kez gösterilen,
kapatılabilir bir bilgilendirme. Zorlama değil.

### 2.2 ⚠️ Neden "X gün içinde doğrulamayan otomatik engellenir" değil

Üç gerekçe, üçü de bağımsız olarak yeterli:

1. **Retansiyonu doğrudan öldürür.** Oyuncu oynarken kapı yer.
2. **Destek yükü yaratır.** *"Oynuyordum, banlandım"* biletlerinin cevabı yok.
3. **§9.1.1'i bozar.** Otomatik ceza yasağı bu belgede de geçerli.

Onun yerine **kilitli özellik** modeli: hesap yaşar, oynar, ama besleyemez.

### 2.3 K2'nin tetiklendiği anlar

- ilk nakliye/destek denemesi (asıl kapı)
- ittifak kurma / katılma / başvurma
- ⭐ ikinci bir cihazdan ya da tarayıcıdan giriş (sinyal zaten `player_devices`'ta var)
- acemi koruması bitişi → **yalnız hatırlatma**

---

## 3. Doğrulama anını seçmek — oyuncu davranışı tarafı

⭐ **Değer eşiği ilkesi:** doğrulama, oyuncunun yatırımı doğrulamanın maliyetini aştığı anda
istenir. Kayıt ekranında oyuncunun yatırımı sıfırdır ve telefon numarası pahalı bir bilgidir;
üç gün oynamış ve ittifaka girmek isteyen oyuncu için denklem tersine döner. Aynı istek, aynı
metin, farklı an — dönüşüm arasındaki fark kat kat.

⚠️ **E-posta ile SMS'i asla aynı oturumda üst üste sorma.** Bıkkınlık iki doğrulamanın
varlığından değil, **arka arkaya gelmesinden** doğuyor. Ayrı zamanlara ve ayrı gerekçelere
bağlanırsa oyuncu ikisini tek bir "kayıt zahmeti" olarak algılamaz.

**Telefon ekranının söylemesi gerekenler** (dördü de eksiksiz):
- numara **yalnız** çoklu hesabı engellemek için alınıyor;
- **geri döndürülemez biçimde** saklanıyor, ham hâli sunucuda durmuyor (§7);
- oyun içinde **hiçbir yerde görünmüyor**, kimseye gösterilmiyor, SMS reklamı gönderilmiyor;
- hesap silinince ne olduğu (§8).

⚠️ **Her kapıda huni ölçülmeli:** `gösterildi · başladı · tamamladı · vazgeçti`. Eşikler
tahminle değil veriyle ayarlanır; depo zaten canlı ayar paneliyle çalışıyor, `verify.phone.*`
anahtarları `packages/settings/src/schema.ts`e doğal oturur (§9.2b'deki `verify.*` grubunun
yanına).

⭐ **İtiraz yolu her kademede açık kalmalı.** Aynı evde iki kardeş gerçekten var; yönetici
panelden elle onaylayabilmeli. §9.1.1'in ruhu bu ve teknik bir kapı onu iptal etmez.

---

## 4. Cihaz katmanı — parmak izi değil, attestation

Kendi ürettiğimiz UUID (`X-Device-Id`) uygulamanın kaldırılıp yeniden kurulmasında ölür.
Canvas/WebGL parmak izi ise hem kolay atlatılır hem KVKK açısından ağırdır — **§9.1.5 zaten
yasaklamış**. İkisi de değil; platformların tam bu iş için verdiği araçlar var:

| Platform | Araç | Ne veriyor | Kalıcılık |
| :-- | :-- | :-- | :-- |
| Android | **Play Integrity API — device recall** (beta) | cihaza yazılan **3 bit** özel veri | fabrika ayarlarına dönüşü **ve** yeniden kurulumu atlatıyor; geliştirici hesabı genelinde paylaşılıyor, 3 yıl saklanıyor |
| iOS | **DeviceCheck** | **2 bit** + zaman damgası | *"Tüm içeriği ve ayarları sil"*i bile atlatıyor; Secure Enclave'e bağlı |

⭐ **Bunlar parmak izi DEĞİL** ve ayrım teknik değil hukuki: cihaz kimliği vermiyorlar, yalnız
*"bu cihaza daha önce **benim** koyduğum bayrak var mı"* sorusunu cevaplıyorlar. Uygulama başka
hiçbir cihaz/kullanıcı tanımlayıcısına erişmiyor. §9.1.5'in yasağıyla çelişmiyor.

⭐ **Bit sayısı az ama tam yetecek kadar:** 3 bit = 0-7 arası sayaç, 2 bit = 0-3. Yani
*"bu cihaz kaç hesap açtı"* doğrudan bite sığıyor ve "cihaz başına en fazla 3 hesap" kuralı
birebir uygulanabilir. ⚠️ **Sayacı sunucuda tutmak işe yaramaz**: sunucu tarafındaki her anahtar
kurulum kimliğine bağlı ve o kurulum silinince sıfırlanır. Sıfırlanmayan tek hafıza bu bitler.

Play Integrity ayrıca cihaz/uygulama bütünlüğü verdikti veriyor (emülatör, rootlu cihaz,
değiştirilmiş APK) — toplu hesap çiftliklerini kesen asıl şey bu.

⚠️ **Bedeli ve sınırları:**
- device recall **beta**; sözleşmesi değişebilir, tek dayanak yapılmamalı;
- Play Integrity yalnız Play üzerinden dağıtılan uygulamada çalışır ve cihazda Google hesabı ister;
- iOS'ta 2 bit sınırı sert — "3 hesap" kuralı orada tavan;
- ikisi de **web'de yok**. Web tarafının cevabı §5'te.

⭐⭐ **Toplamaya ilk günden başla, kapıyı sonra kur.** §9.1.0'ın kendi argümanı burada da
geçerli ve daha da sert: *tespit mantığı sonradan yazılabilir, VERİ sonradan toplanamaz.*
Uygulamanın ilk sürümü attestation sinyalini göndersin; eşik ve kapı sonra gelir.

---

## 5. "Kayıt yalnız mobilden" — keskin kuralı yumuşat

Keskin kural (web'den kayıt tamamen kapalı) web'den gelen oyuncuyu tamamen kaybettirir. Aynı
korumayı çok daha ucuza veren biçim:

> **Web'den kayıt K0'da kalır. K1'e ancak mobil uygulamadan, attestation ile geçilir.**

Böylece tarayıcıdan keşfe izin verilir, ilerlemek için uygulama gerekir ve tarayıcıdan sonsuz
hesap açma yolu yine kapalıdır. Kaybedilen oyuncu sayısı çok daha az, koruma aynı.

⚠️ **Hesap SİLME sayfası her hâlükârda web'de ve oturumsuz kalmalı** — Google Play'in açık
şartı ve `apps/web/src/screens/DeleteAccount.tsx` zaten öyle kurulmuş (§9.2c). "Kayıt mobilde,
silme webde" ikisi birden doğru ve birbiriyle çelişmiyor: silmeyi kayıttan **zorlaştırmamak**
mağaza kuralı, kolaylaştırmak serbest.

---

## 6. SMS — maliyet, sağlayıcı ve asıl tuzak

**Firebase Phone Auth** (2026 Ağustos itibarıyla, aramayla doğrulandı): Blaze planı zorunlu,
günde ilk 10 SMS ücretsiz, ABD/Kanada ~$0,01, çoğu ülke ~$0,06, en pahalı bölgelerde $0,46'ya
kadar.

⚠️ **Türkiye için kesin rakam doğrulanmadan bütçe yapılmamalı** — kaynaklar TR'yi ayrı
listelemiyor. Büyük olasılıkla "diğer ülkeler" katmanı: 10.000 doğrulama ≈ $600, tekrar
denemelerle ×1,3.

Bu tablo kararı zaten veriyor: **kayıtta herkesten SMS istemek hem dönüşümü hem bütçeyi aynı
anda yakar.** Geç ve dar kapı, iki açıdan da doğru — §2'deki kademe modelinin ikinci gerekçesi
bu.

### 6.1 ⚠️⚠️ Asıl risk fiyat değil: SMS toll fraud (SMS pumping)

Saldırgan premium numaralara OTP tetikler, operatörden gelir payı alır, faturayı biz öderiz.
Bu, telefon doğrulaması eklemenin **en pahalı** yoludur ve önlem alınmazsa kaçınılmazdır.

Zorunlu önlemler (hepsi, tek tek):
- yalnız **+90** ve bilinçli seçilmiş birkaç ülke whitelist'te;
- **App Check / Play Integrity zorunlu** — doğrulama isteği yalnız gerçek uygulamadan gelsin;
- cihaz + IP başına sert kota (kayıt kötüye kullanımındaki `signupMaxPerBlock` deseni, §9.1.7c);
- yeniden gönderme gecikmesi (artan);
- **günlük bütçe alarmı** — sessiz kalan bir sızıntı ay sonunda görülür.

### 6.2 Sağlayıcı bağımlılığı

`PhoneVerifyProvider` gibi tek bir arayüzün arkasına konur. Hacim büyüyünce yerli bir SMS
sağlayıcısına (Türkiye için muhtemelen daha ucuz) taşımak kod değişikliği gerektirmemeli.
⚠️ Firebase'in asıl kazandırdığı fiyat değil, **hazır bot koruması ve Flutter entegrasyonu**;
taşırken kaybedilecek şey de bu.

---

## 7. Telefon numarasını saklama (KVKK)

⚠️⚠️ **"Şifrelenmiş saklıyoruz" demek yetmez — düz hash telefon numarasında İŞE YARAMAZ.**
Türkiye'de mobil numara uzayı ~10⁹; bir GPU tüm SHA-256'ları saniyeler içinde üretip tabloyu
geri çözer. Yani SHA-256 ile saklamak, açık saklamakla neredeyse aynı şeydir. Bu, tasarımın
sessizce yanlış yapılabileceği yerlerden biri: kod doğru görünür, koruma yoktur.

**Doğrusu:**

| kural | neden |
| :-- | :-- |
| **HMAC-SHA256 + veritabanında BULUNMAYAN gizli anahtar** (pepper), anahtar env/KMS'te | eşitlik kontrolü için yeterli — ihtiyacımız olan tek işlem *"bu numara daha önce kullanıldı mı"* |
| ham numara **hiç saklanmaz** | Firebase kimlik jetonu sunucuda doğrulanır, `phone_number` iddiası alınır, HMAC'lenir, atılır |
| anahtar rotasyon planı **baştan** yazılır | rotasyon eski hash'leri kullanılamaz kılar → çift yazma dönemi gerekir |
| kayıtta **son kullanım tarihi** tutulur | ⚠️ operatörler numarayı yeniden tahsis eder; hash'i sonsuza kadar tutarsak iki yıl sonra o numarayı alan yeni oyuncu sebepsiz bloklanır. 12-24 ay hareketsizlikten sonra serbest bırakılır |

Aydınlatma metni + açık rıza: amaç sınırlı (*yalnız* kötüye kullanımın önlenmesi), süre sınırlı,
pazarlama yok. ⭐ Bunu ekranda net yazmak **dönüşümü artırır** — gizlilik metni burada hukuki
bir yük değil, ikna aracı.

---

## 8. Hesap silme ile ilişkisi

⛔ **Silme için ASLA telefon doğrulaması isteme.** İki gerekçe: Google Play silmeyi kayıttan
zorlaştırmayı yasaklıyor; ve bir oyuncu öylesine kaydolduğu bir oyuna, *sırf hesabını silmek
için* telefon numarası vermez. Bugünkü e-posta bağlantısı (§9.2c) doğru araç ve öyle kalıyor.

⭐ **Asıl soru: silinen hesabın telefon hash'i ne olacak?** İki uç da kötü:

| seçenek | sonucu |
| :-- | :-- |
| hash **kalır** | meşru *"sil ve yeniden başla"* senaryosu ölür — numara sonsuza kadar yanmış olur |
| hash **silinir** | *"sil → yeni hesap → sil → yeni hesap"* döngüsü SMS kapısını tamamen etkisiz kılar |

**Orta yol (önerilen):** hash kalır ama **"kullanımda değil"** işaretiyle; üstünde bir sayaç
(bu numara kaç kez hesap açtı) ve bir bekleme süresi (ör. 30 gün) taşır. KVKK'nın *amaçla
sınırlı saklama* ilkesini karşılıyor (amaç: kötüye kullanımın önlenmesi — meşru menfaat) ve
döngüyü kırıyor.

⭐ **Yeni silme tasarımıyla örtüşme (2026-08-13).** Silmede artık kullanıcı adı serbest
kalmıyor ve şehirler dünyada duruyor. Yani *"sil → yeniden kayıt ol"* bir farm döngüsü değil,
sıfırdan yeni bir kimlik; geride bıraktığı şehirler de tam olarak istenen yağma hedefi. Silme
tasarımı, hiç o amaçla yazılmadığı hâlde, çoklu hesap tarafında da doğru yöne çalışıyor.

---

## 9. Sıra — ne önce yapılır

| # | İş | Neden bu sırada |
| :-- | :-- | :-- |
| 1 | **Cihaz başına hesap sayacı** — `player_devices` zaten dolu; kayıt akışına panelden ayarlanabilir bir eşik | bugün yapılabilir, sıfır maliyet. Web'de zayıf ama bedava |
| 2 | **Flutter ilk sürümü: attestation sinyalini TOPLA** (Play Integrity + DeviceCheck), kapı koymadan | veri sonradan toplanamaz (§4, §9.1.0) |
| 3 | **K0/K1/K2 kademelerini kur** — henüz SMS'siz, yalnız e-posta ile | kapıların doğru yerde olup olmadığı burada ölçülür |
| 4 | **SMS'i tek dar kapıda aç** (nakliye + ittifak), tek ülkede | en pahalı ve en riskli parça en sona; §6.1 önlemleri hazır olmadan açılmaz |
| 5 | **Eşikleri veriyle ayarla** (§3 huni olayları) | tahminle konan eşik masum oyuncuyu suçlar (§9.1.1) |

---

## 10. Açık uçlar — karara/doğrulamaya muhtaç

- **Türkiye SMS birim fiyatı** — Firebase'in resmî fiyat sayfasından doğrulanacak (§6).
- **Device recall beta durumu** — genel kullanıma çıktı mı, sözleşmesi değişti mi (§4).
- **K2'nin tam eylem listesi**: nakliye ve ittifak kesin; destek, pazar ve "kendi şehirleri
  arasında nakliye" ayrı ayrı kararlaştırılmalı (kendi şehirleri arası aktarım çoklu hesap
  değildir, K1'de kalmalı).
- **Yem hesabı kârsız kılma** seçeneği: telefonu doğrulanmamış hesaptan alınan ganimet/enkaz/XP
  azaltılsın mı? ⭐ Hem besleme kârsız olur hem acemi daha az yağmalanır (retansiyon kazancı) —
  ⚠️ ama kullanıcının *"yağmalanacak şehir oluşması fena değil"* tercihiyle çelişir. Karar
  verilmedi.
- **Web K0 sınırının** §9.2b limitleriyle aynı mı yoksa daha dar mı olacağı.

---

## 11. Kaynaklar

- [Detect repeat abuse using device recall (beta) — Android Developers](https://developer.android.com/google/play/integrity/device-recall)
- [Overview of the Play Integrity API — Android Developers](https://developer.android.com/google/play/integrity/overview)
- [Mitigate fraud with App Attest and DeviceCheck — WWDC21](https://developer.apple.com/videos/play/wwdc2021/10244/)
- [Apple DeviceCheck & App Attest: Prevent Fraud on iOS — adjoe](https://adjoe.io/company/engineer-blog/prevent-fraud-on-ios-with-apple-devicecheck-and-app-attest/)
- [Firebase Authentication Pricing: A 2026 Guide — RapidNative](https://www.rapidnative.com/blogs/firebase-authentication-pricing)
- [2026 Firebase Authentication's latest pricing explained — Logto](https://blog.logto.io/firebase-authentication-pricing)
