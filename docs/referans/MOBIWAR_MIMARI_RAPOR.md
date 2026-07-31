# MOBIWAR — MİMARİ ANALİZ & YENİDEN-İNŞA YOL HARİTASI

> **Amaç:** Eski J2ME mobil savaş-strateji oyunu **MobiWar v1.5.2**'nin decompile edilmiş istemci
> kaynağını (`DecompiledSrc/src`) çözümleyip, oyunu **modern bir yığında (React web + Flutter native +
> ortak oyun motoru)** yeniden hayata geçirmek için mimari rehber. Savaş sistemi ayrı olarak Ghidra ile
> simülatör binary'sinden çıkarıldı (bkz. `DOGRULAMA_DURUMU.md`, `mobiwar-engine.js`).
>
> **Bu belge kalıcı durum kaydıdır** — "devam et" denince buradan sürdürülür. Kıdemli mühendis gözüyle,
> kanıta dayalı (her iddia bir dosya/satıra dayanır) yazılmıştır.

---

## 0.1 KULLANICI KARARLARI (2026-07-23) — bağlayıcı

Bu kararlar tüm mimariyi yönlendirir (kullanıcı onayı):

1. **Sunucu ÖLÜ** (`212.252.205.237:7785` erişilemez). → Base tabloları canlı toplayamayız. Savaşçı +
   savunma-birim maliyetleri binary'de VAR; **yapı + akademi-teknik base verileri EKSİK** → yeniden
   türetilecek/dengelenecek (bkz. Açık Soru).
2. **Savaş motoru SADECE SUNUCUDA.** Hem React hem Flutter için tüm savaş hesabı server-side. İstemcilerde
   savaş mantığı YOK — sadece sonuç/rapor gösterimi. (Orijinalin sunucu-otoriteli yapısına sadık.)
3. **Dahili savaş simülatörü eklenecek** (yeni özellik — orijinalde yoktu). Kullanıcı menüsünde bir
   simülatör görür; binary-simülatör mantığında iki orduyu (teknik/tapınak/gece/yapı dahil) girip savaşı
   simüle eder. **Bu simülasyon da SUNUCUDA çalışır ve aynı motordan beslenir** (canlı savaşla birebir
   tutarlı → simülatör güvenilir kalır).
4. **Savaş animasyonu YOK.** Orijinalde savaş raporları metin mesajı olarak geliyordu, açılıp okunuyordu.
   Rebuild de öyle: rapor = yapılandırılmış metin/mesaj. Görsel animasyon geliştirmeye gerek yok.
5. **Motor bakım-kolay olmalı.** Savaş motoru sürekli iyileştirilecek (yapı-savaşı vb.) → izole, versiyonlu,
   test-korumalı tek modül (`packages/engine/combat`). Her an güncellenebilir; güncelleme hem canlı savaşa
   hem simülatöre aynı anda yansır (tek kaynak).

### 0.1b Teknoloji & yaklaşım kararları (2026-07-23, kullanıcı seçimi)
6. **Eksik base veri stratejisi:** binary savaşçı/savunma maliyetleri + savaş statları + denge oranlarından
   **türet**; hepsi **config-driven / tunable** (oynanışta dengelenir). images/saf-tasarım ikincil.
7. **Backend = Node + NestJS + TypeScript.** Motor (`mobiwar-engine.js`) birebir TS olarak `packages/engine`'e
   taşınır; sunucu + web aynı dili paylaşır → tek kaynak, motor bakım-kolay (§0.1-5 ile uyumlu). Java/Spring
   ELENDİ (motor çift-bakım gerektirirdi).
8. **İlk MVP = ince dikey dilim:** `login → şehir → kaynak → üretim → ordu gönder → savaş → rapor`. Uçtan uca
   minimal tam akış; mimariyi (protokol, motor, DB, iki istemci) erken doğrular. Alliances/dünya-haritası/
   kahraman/mağara/teleport SONRAKİ dilimlerde. Üretim planı bu dilim etrafında kurulacak (ayrı oturumda).

## 0. Yönetici Özeti (TL;DR)

- **Ne bulduk:** İstemci, **J2ME MIDP-2.0 / CLDC-1.0** bir MIDlet (`cgs.MobiWar`). 18 obfusce (tek-harfli)
  sınıf. Tamamen **sunucu-otoriteli** bir oyun: istemci ince bir görüntüleyici + girdi katmanı, tüm oyun
  mantığı sunucuda. İstemci–sunucu iletişimi **kalıcı TCP socket** üzerinden **kompakt XML/`$~`-tag
  protokolü** ile.
- **Elimizde olan:** Tüm UI/menü ağacı, sunucu istek uç-noktaları (`.do`), istek/yanıt protokol formatı,
  birim/yapı/teknik kataloğu, **ekonomi ölçekleme formülleri + büyüme sabitleri**, sabit-nokta matematik
  kütüphanesi, ve **savaş sistemi** (binary'den ~%98 doğrulukla çıkarıldı).
- **Elimizde olmayan (sunucu-otoriteli):** Base maliyet tabloları (çalışma anında `init.do`/tip-35 ile
  gelir — ama formül elimizde), sunucu doğrulama kuralları, dünya/harita durumu, gerçek-zaman timer
  otoritesi. Bunlar **yeniden tasarlanabilir** (birebir kopya şart değil; formüller + savaş motoru elde).
- **Öneri:** **Monorepo** + **ortak TypeScript oyun-motoru paketi** (savaş + ekonomi), **NestJS/Node
  backend** (otoriter sunucu), **React (web)** ve **Flutter (native)** iki ince istemci. Protokolü
  modernize et (**JSON/WebSocket**), eski `.do` tag-protokolünü referans-spec olarak koru.

---

## 1. Ne Tür Bir Sistemle Karşı Karşıyayız?

`META-INF/MANIFEST.MF`:
```
MIDlet-1: MobiWar,i.png,cgs.MobiWar
MIDlet-Version: 1.5.2
MicroEdition-Configuration: CLDC-1.0
MicroEdition-Profile: MIDP-2.0
```

**J2ME tuş-telefon oyunu** (2000'ler). Bu, mimari için belirleyici:

- **Ekran = 128×160 civarı, tuş girişli.** Tüm UI, bir sprite-atlas'tan (`/alfabe.bmf`, `/a2.bmf`, `b1.png`,
  `bg.png`) `Graphics.drawRegion` ile çizilen bitmap ikonlar + bitmap font. (`k.java:177-792` dev bir
  `switch` = ikon atlası koordinat tablosu; her `case` bir birim/yapı ikonunun atlas'taki x,y,w,h'si.)
- **İstemci "aptal terminal".** Hesaplama yok denecek kadar az: istemci sunucuya komut yollar, gelen
  durumu parse edip çizer. Oyun kuralları (savaş, üretim, doğrulama) **sunucuda**.
- **Bellek/bant kısıtlı** → protokol aşırı sıkıştırılmış (tek-harfli tag'ler), veri modeli tek bir
  generic düğüm tipiyle (`h`) tutuluyor.

> **Rebuild için sonuç:** Eski istemcinin *çizim/ekran* kodu (sınıfların ~%70'i) modern rebuild'de
> **atılır** — yerine React/Flutter gelir. Değerli olan: **protokol, katalog, formüller, savaş mantığı.**

---

## 2. Sınıf Haritası (rol tablosu)

Obfusce isimler tek-harf; roller kanıta dayalı çıkarıldı:

| Sınıf | Satır | Rol | Kanıt |
|---|---|---|---|
| `cgs.MobiWar` | 43 | **MIDlet giriş noktası** (yaşam döngüsü). `k` + `c`(canvas) kurar. | `extends MIDlet`, `startApp` |
| `k` | 1702 | **Merkezî oyun-durumu + iş mantığı hub'ı.** Katalog string'leri, ikon atlası, ekonomi formülü, timer'lar, birim/teknik durumu. En kritik dosya. | `k.java:89` katalog, `1373` ekonomi |
| `e` | 923 | **Ağ katmanı (Runnable thread).** Socket aç/yaz/oku + yanıt parse. İki thread: biri ağ, biri 1sn tick. | `e.java:44-219`, `SocketConnection` |
| `g` | 2500 | **UI/navigasyon kontrolcüsü + yerel depolama (RMS).** Menü ağacı, ekran yığını, login/ayar kaydı. | `g.java:32` menü tablosu, `RecordStore` |
| `o` | 483 | **Ekran router/container.** Aktif `n` ekranını tutar/yönlendirir. | `o.java` `n[] a` |
| `n` | 67 | **Ekran taban sınıfı** (abstract). `i/j/m/l` bunu genişletir. | `extends n` |
| `i` | 914 | **Savaş raporu/animasyon ekranı.** `d[]` = savaş log kayıtları. Motorumuzun `(i)this.b.a.a` referansı. | `i extends n`, `d[] a` |
| `j` | 544 | Genel **liste/form ekranı**. | `j extends n` |
| `m` | 624 | **Şehir/grid ekranı** (bina yerleşim koordinat tabloları). | `m.java` int[] grid |
| `l` | 285 | **Sayfalı liste ekranı** (`h[10]` sayfa). | `l extends n` |
| `r` | 239 | **Bitmap font/sprite renderer** (glyph çizimi). | `Image + short[]/byte[]` |
| `h` | 146 | **Evrensel veri düğümü** = sıralı `String→Object` map + `long[3]` payload. Tüm durum bu ağaçta. | bkz. §5 |
| `a` | 216 | **Sabit-nokta (24.8) matematik** kütüphanesi (×, ÷, üs, exp, ln). Ekonomi+savaş temeli. | `a.java` |
| `b` | 86 | Kaynak (resim/font) yükleyici. | `b.a("/alfabe.bmf")` |
| `c` | 60 | **GameCanvas/Displayable** (ekranı çizen, tuş yakalayan). | `MobiWar.java:15` |
| `d` | 121 | **Savaş log kayıt** yapısı (bir savaş satırı). | `i.java` `d[] a` |
| `q,p,f,n` | ufak | Yardımcı (menü öğesi, timer, misc). | — |

---

## 2b. ⭐ MENÜ YÜZEYİ — oyunun TAM aksiyon envanteri (2026-07-26, `g.java` + `k.java`)

`g.java:32` `String[] a` = **91 menü etiketi**; `k.java` katalog dizisi = **299 giriş**, içinde
**~70 `.do` uç noktası**. İkisi birlikte oyunun *tüm* aksiyon yüzeyini verir. Rebuild ilerledikçe
"bunu atlamış mıyız?" sorusunun tek doğru kaynağı bu bölüm.

### Ekranlar (üst düzey)
`Baraka` · `Yapılar` · `Savunma` · `Akademi` · `Dünya` · **`Komuta Merkezi`** · `Mesajlar` ·
`Genel Durum` · `İttifak` · `Arama` · `Sıralamalar` · `Kahramanlar` · `Seçenekler` · `Yardım`

> ⚠️ **"Komuta Merkezi" bizim planda yoktu** — ordu görev/oluştur/gelen-ordu aksiyonlarının evi.
> ⚠️ **"Tapınak" diye bir ekran YOK** — tapınağın işlevi `Kahramanlar` ekranından kullanılıyor
> (`Dirilt`, `Diriltmeyi Durdur`, `Seviye Arttır`, `Özellikler`, `Adını Değiştir`).

### ⭐ İPTAL AKSİYONLARI — her kuyruk türü için var
| Menü | Uç nokta | Not |
| :-- | :-- | :-- |
| `Yapımı Durdur` | — | bina/birim üretimini durdur |
| `İlerletmeyi Durdur` | — | teknik araştırmasını durdur |
| `Diriltmeyi Durdur` | — | kahraman diriltmeyi durdur |
| `Görev İptal` | `ipOrd.do?u=` | yoldaki orduyu geri çağır |
| — | `ipUnt.do?u=` | birim üretimi iptal (`ip` = iptal) |
| — | `ipMgr.do?u=` | mağara işlemi iptal |

**İade oranı istemcide YOK** (sunucudan geliyordu) → bizim denge kararımız.

### Kahraman yetenek puanları — kullanıcının "3 puan/seviye" bulgusunun MEKANİK teyidi
- Menü: `Seviye Arttır` (58) · `Özellikler` (60) · metin: *"… seviye ilerletme hakkınız var"* (61)
- `j.java:432`: kalan puan sayısı **sunucudan gelen bir alandan** okunuyor (`e.a(k.a[178])`, key `"x"`)
  ve ekranda basılıyor. Uçlar: `grKoz.do?k=` (özellikleri getir) · `dgKoz.do?k=` (puan harca).
- 🎯 **Sonuç:** "her seviye N puan verir ve kalan puan takip edilir" mekanizması **istemcide
  doğrulandı**; ama **N = 3 sayısı istemcide YOK** — sunucu tarafıydı. Yani 3 değeri hâlâ
  kullanıcı hatırası (bizim `heroSkillBudget` tasarımı mekanizmayla birebir örtüşüyor).

### Bizde eksik olan diğer özellikler
| Özellik | Uç nokta | Durum |
| :-- | :-- | :-- |
| **Oyuncuyu Blokla / Bloklamayı Kaldır** | `msBlk.do?` | ⚠️ **DÜZELTME (2026-07-31): yalnız TABLO var** (`player_blocks`) — uç, servis, ekran YOK; DM'nin kendisi de yok. Eskiden "✅ eklendi" yazıyordu, yanlıştı. Bkz. `EKSIK_OZELLIKLER.md` |
| **Şikayet Et** (mesaj/oyuncu) | `skMsj.do?m=` | plana alındı (sohbet şikâyetinden ayrı) |
| Arkadaşına Tavsiye Et | `arTvs.do?m=` | ertelendi (⚠️ çoklu hesap vektörü — §9.1) |
| Şifre Hatırlat / Değiştir | `gnSfr.do?d=` / `dgSif.do?e=` | planda var, Faz 2 sonu |
| Üyelik: `Aylık Sınırsız Kullanım` + `Ekstra Paket` | `uyYnl.do?o=` | **iki ürün** — premium tasarımına not |
| Sıralamalar: `Oyuncuya` / `İttifağa` / **`Kahramana`** Göre | `isOyn/isItt/isKhr.do?s=` | **üç eksen** (kahraman sıralaması da var) |
| İttifak: `Konseye Al` / `Konseyden Çıkar` / `Liderlik Devri` | `itKdv/itYti/itUsl.do` | **rol hiyerarşisi: lider → konsey → üye** |
| İttifak: `Davet` + `Başvuru` | `itDvt.do?a=` / `itBsv.do?i=` | **iki katılım yolu** |
| `Şehir Terk Et` / `Şehir Adı Değiştir` | `trShr.do?u=` / `dgSad.do?a=` | planda var (§13.11.5) |
| `Tatil Moduna Al/Çık` | `ttMod.do?m=` | planda var |
| `Hepsini Seç`, `Bilgi`, `Müzik`, `Dünyada Bul` | — | arayüz kolaylıkları |

---

## 3. Sunucu İletişimi (en kritik bölüm — rebuild'in kalbi)

### 3.1 Transport
- **Kalıcı ham TCP socket:** `socket://212.252.205.237:7785` (`k.java:91` a[81]).
- Bazı istekler (tip 35 = harita/liste sunucusu) farklı bir URL'ye gider (`e.java:74`, `this.a.i`).
- Her istek **tek satır** olarak yazılır (`\n` ile biter), yanıt `\n`'e kadar okunur (`e.java:82-91`).
- Encoding: istek **UTF-8** (a[175]), yanıt **ISO-8859-1**→UTF-8 dönüşümü (`e.java:93`).

### 3.2 İstek formatı (`e.java:32-42`)
```
[kullanıcıAdı veya "----"] + "cs" + [şifre] + ";jsessionid=" + [istekYolu&parametreler]
```
- `cs` = credential separator; `;jsessionid=` = a[3]. Auth **her istekte inline** (stateless-benzeri).
- İstek yolları katalog `k.java:91`'de: `login.do?`, `kayit.do?`, `init.do`, `auth.do?d=`, `cikis.do`,
  `grBil.do?t=`, `grBrk.do?u=` (baraka), `grDny.do?u=` (dünya), `grSvn.do?u=` (savunma),
  `grTkn.do` (teknik), `grOgr.do?u=` (öğren), `knOrd.do` (ordu), `olOrd.do?u=` (ordu oluştur),
  `itDvt.do?a=` (ittifak davet)... (~70 uç-nokta). **Bunlar tüm oyun aksiyon yüzeyi.**

### 3.3 Yanıt formatı — **iki parser**
1. **XML-benzeri parser** (`e.java:221-300`, çoğu istek): `<tag attr=deg ...>metin` → `h` ağacı. Tag'ler
   tek-harf (a[19]="B", a[143]="S", a[161]="T", a[179]="Y" ...) → bant tasarrufu.
2. **`$`/`~` delimited parser** (`e.java:741-903`, tip 3/8/47): `~`=alan ayırıcı, `$`=kayıt ayırıcı. En
   yoğun listeler (birim listesi, harita) için ultra-kompakt.

### 3.4 İstek tipleri (int kod → `.do` aksiyonu → parse sonrası işleme)
`e.java:e()` (satır 415-702) istek tipine göre dispatch eder: tip 1/4/5/7/9/16 (login/menü),
2/10/11/12 (üretim/teknik/bina/kahraman kuyrukları), 27/28 (ordu detay), 29 (durum), 35 (init: base
tablolar), 42-46 (ordu görev), 53 (mağara)... Her tip belirli bir XML şablonu döndürür.

> **Rebuild önerisi (§8'de detay):** Bu tag-protokolünü **referans spec** olarak koru ama modern
> istemcide **JSON + WebSocket** kullan. Her `.do` uç-noktası → bir WebSocket mesaj tipi / REST route.
> Eski protokol = "sunucunun ne veri döndürdüğünün" kesin kaynağı.

---

## 4. Veri Modeli — `h` Ağacı → Modern Şemalar

`h` (`h.java`) = **generic JSON-benzeri düğüm**:
- `String[] keys` + `Object[] values` (paralel diziler, sıralı map)
- `long[3] payload` — sayısal 3-slot (timer/adet/değer; savaşta a[0]=adet, a[1]=birikim, a[2]=süre)
- `boolean` (kullanım/dirty bayrağı)

Tüm oyun durumu bu düğümlerin ağacı. Örn. `k.b()` = aktif şehir düğümü; `sehir.a("Y")` = üretim kuyruğu;
`sehir.a("Y").a("S67")` = birim base statları. Modern rebuild'de bu ağaç **tiplenmiş TypeScript
interface'lerine** map edilir (bkz. §9 şema önerisi).

---

## 5. Ekonomi & Formüller (istemci-türevli — ELİMİZDE)

`k.java:1373` `a(String kategori, h düğüm)` = **üretim/geliştirme maliyet & süre projeksiyonu.**
Büyüme sabitleri (`k.java:10-15`, sabit-nokta):

| Sabit | Değer | Kullanım |
|---|---|---|
| a | 0.8 | bina maliyet tabanı |
| b | 1.2 | özel birim (tip 67) süre |
| c | 1.4 | **hız/süre böleni** (akademi/teknik seviyesi) |
| d | 1.5 | kahraman dirilt maliyeti |
| e | 1.45 | özel birim (tip 62/64) ölçek |
| f | 1.8 | **üretim maliyet ölçeği** (birim seviyesi) |

> ⚠️ **BU BÖLÜMÜN ESKİ KATEGORİ EŞLEMESİ YANLIŞTI — 2026-07-26'da düzeltildi.**
> Kesin çözüm ve doğru formüller: **`MOBIWAR_SISTEM_PLANI.md` §13.9**. Özet düzeltme:
> **B = savaşçı üretimi** (Baraka) · **Y = yapı/bina** (Kale ön-şartı, Mimar Okulu hızlandırır) ·
> **S = savunma ünitesi** (Sur ön-şartı) · **T = TEKNİK** (Akademi ön-şartı ve hızlandırıcısı —
> "kahraman dirilt" değil) · **K = kahraman** (süre sunucudan gelir).
> Kanıt: `j.java:85-105` ön-şart ekranı her kategori için hangi binanın gerektiğini yazdırıyor.

**(ESKİ/HATALI — kayıt amaçlı bırakıldı)** Çıkarılan formül şablonu:
- ~~**Birim üretimi** (kat. "Y"/a[179]): `maliyet = base × 1.8^seviye`~~ → aslında YAPI
- ~~**Bina** (kat. "B"/a[19])~~ → aslında SAVAŞÇI: `süre = ((altın+yemek)/10)^0.8 × 65 / 1.4^Baraka`
- ~~**Teknik** (kat. "S"/a[143])~~ → aslında SAVUNMA ÜNİTESİ
- ~~**Kahraman dirilt** (kat. "T"/a[161])~~ → aslında TEKNİK: `maliyet = base × 1.5^(seviye+1)`,
  `süre = 10×(altın+yemek) / 1.4^Akademi(o şehrin)`

> **Kritik:** *Base* tablolar sunucudan (`init.do`/tip-35, `e.java:380-393` `this.a.a[]/b[]/c[]` dizilerine
> yüklenir), *ölçekleme* istemcide. Yani **maliyet formülü elimizde; base sayıları savaş binary'sinden +
> canlı yanıttan** elde edilebilir (savaş statları zaten çıkarıldı — `mobiwar-verified-formulas.md`).

**Sabit-nokta matematik** (`a.java`): 24.8 formatı (24 bit tam, 8 ondalık). `a.b`=çarp, `a.c`=böl,
`a.e`=üs, `a.d(long)`=exp (Taylor), `a.e(long)`=ln. Rebuild'de **normal double/BigInt** ile değiştirilir
(sabit-noktaya gerek yok; sadece yuvarlama davranışını eşle).

---

## 6. Elimizde Olan / Olmayan (net envanter)

### ✅ ELİMİZDE (rebuild'i besler)
- **Birim/yapı/teknik kataloğu** (`k.java:89` b[]): 12 birim (Cüce…Kaos), 8 savunma yapısı
  (Okçu Kulesi…Büyü Kalkanı), 9 bina (Çiftlik…Teleport), 12 teknik (Okçuluk…Tılsım).
- **Tüm UI/menü ağacı** (`g.java:32`, ~90 aksiyon): oyunun tam işlevsel yüzeyi.
- **Sunucu protokolü**: uç-noktalar, istek formatı, yanıt şemaları (§3).
- **Ekonomi formülleri + büyüme sabitleri** (§5).
- **Savaş sistemi**: `mobiwar-engine.js` — binary'den ~%98 doğrulanmış (hasar, teknik ölçekleme, şaman
  kalkanı, gece, XP, ganimet, kazanan, yapı modeli). Bkz. `DOGRULAMA_DURUMU.md`.

### ❌ ELİMİZDE OLMAYAN (sunucu-otoriteli — yeniden tasarlanacak)
- **Base maliyet/stat tabloları**: çalışma anında gelir. *Ama*: formül elde, savaş statları binary'den
  çıkarıldı → tablolar rekonstrükte edilebilir.
- **Sunucu doğrulama kuralları** (üretim ön-koşulları: "Gerekli Baraka/Kale/Akademi/Sur" — `k.java:91`'de
  string olarak var ama eşik sayıları sunucuda).
- **Dünya/harita durumu, oyuncu veritabanı, ittifak sistemi state'i** — tamamen sunucu.
- **Gerçek-zaman timer otoritesi** (üretim bitiş zamanları sunucu saatinde).

> **Boşlukları nasıl dolduracağız:** (1) formül + savaş motoru zaten var; (2) base tablolar için ya canlı
> sunucudan (hâlâ ayaktaysa 212.252.205.237:7785) örnek yanıt topla, ya da savaş binary'sinden + oyun
> dengesinden yeniden türet; (3) doğrulama eşiklerini oyun-tasarımı kararı olarak biz belirle (rebuild
> "ruhu koru ama modernize et" — birebir eşik şart değil).

---

## 7. Önerilen Modern Mimari

### 7.1 Monorepo (tek repo, çok paket)
```
mobiwar/
├── packages/
│   ├── engine/          # ORTAK oyun motoru (TS) — savaş + ekonomi + kurallar. Platformdan bağımsız.
│   │   ├── combat/      # mobiwar-engine.js buraya taşınır (TS'e port + test'ler)
│   │   ├── economy/     # §5 formülleri
│   │   ├── catalog/     # birim/yapı/teknik veri (JSON) + tipler
│   │   └── protocol/    # mesaj tipleri (eski .do → JSON şema eşlemesi, referans)
│   ├── shared-types/    # istemci↔sunucu ortak TS tipleri (DTO'lar)
│   └── sim/             # doğrulama harness'ları (mevcut scratchpad/ buraya)
├── apps/
│   ├── server/          # NestJS (Node) — OTORİTER sunucu. engine'i import eder.
│   ├── web/             # React + Vite — ince istemci
│   └── mobile/          # Flutter — native istemci (engine'i FFI/port veya server-only ile)
└── infra/               # docker, db migration, ci
```

### 7.2 Neden bu ayrım?
- **`engine` paketi = tek doğruluk kaynağı.** Savaş ve ekonomi mantığı BİR kez yazılır (TS), hem sunucu
  hem (istemci-tarafı önizleme/animasyon için) web onu kullanır. **Oyunun "ruhu" burada yaşar.**
- **Sunucu otoriter** (eski oyundaki gibi): tüm mutasyonlar sunucuda doğrulanır → hile önleme. İstemci
  sadece gösterir + komut yollar. Bu, orijinalin mimarisine sadık ama modern.
- **İki ince istemci** aynı backend'e konuşur → özellik paritesi kolay.

### 7.3 Flutter & ortak motor — KARAR: server-authoritative (motor Dart'a PORT EDİLMEZ)
Kullanıcı kararı (§0.1-2): savaş SADECE sunucuda. Flutter (Dart) TS motorunu çalıştırmaz ve **çalıştırmasına
gerek de yok** — hem canlı savaş hem dahili simülatör sunucuda koşar, Flutter/React sadece sonucu/raporu
gösterir. Bu, motoru tek yerde tutar (bakım-kolay, §0.1-5) ve iki istemciyi ince tutar. → Dart'a port
GÜNDEMDE DEĞİL. (İleride istemci-tarafı anlık önizleme istenirse yeniden değerlendirilir; şimdilik hayır.)

### 7.3b Dahili savaş simülatörü (yeni özellik)
Menüde "Simülatör": kullanıcı iki orduyu + teknik/tapınak/gece/yapı girer → **sunucu aynı `engine/combat`
ile** çözer → sonucu döndürür. Endpoint `POST /simulate` (auth'lu, kalıcı state YAZMAZ — saf hesap).
Canlı savaşla birebir tutarlı (tek motor). Bu, orijinal binary-simülatörün oyun-içi karşılığı.

### 7.4 Protokol modernizasyonu
- **WebSocket** (kalıcı bağlantı — orijinal socket'in modern karşılığı) + kritik olmayan işler için REST.
- Mesajlar **JSON** (veya protobuf, bant önemliyse). Eski tek-harf tag'ler → okunur alan adları; eski
  protokol dokümante edilip **referans** olarak `packages/engine/protocol/legacy-map.md`'de tutulur.
- Auth: **JWT** (eski inline `cs<şifre>` yerine). Oturum WebSocket handshake'te.

---

## 8. Önerilen Veritabanı Şeması (ilk taslak)

**PostgreSQL** (ilişkisel — strateji oyununun envanteri/ilişkileri buna uygun). Redis (timer/oturum/cache).

```
players        (id, username, password_hash, gold, food, created_at, vacation_mode, ...)
cities         (id, player_id, name, x, y, is_capital, ...)
buildings      (id, city_id, type, level, upgrade_finish_at)         -- type: çiftlik/maden/baraka/...
units          (id, city_id, type, count, level)                     -- type: cüce/elf/.../kaos
defenses       (id, city_id, type, count, integrity)                 -- okçu kulesi/tuzak/sur/kalkan...
techs          (player_id, type, level)                              -- okçuluk/demircilik/... (oyuncu-genel)
heroes         (id, player_id, name, level, hp, ...)                 -- kahramanlar (üstel ölçekli)
production_queue(id, city_id, category, item_type, count, finish_at) -- category: Y/B/S/T (üret/bina/tek/dirilt)
armies         (id, player_id, origin_city_id, target_x, target_y, mission, arrive_at)
army_units     (army_id, unit_type, count)
battles        (id, attacker_id, defender_id, city_id, result, atk_loss, def_loss, xp, gold_debris, at)
battle_log     (battle_id, seq, unit_type, side, ...)                -- savaş raporu satırları (i/d sınıfı)
alliances      (id, name, leader_id, ...)
alliance_members(alliance_id, player_id, role)                       -- asker/subay/komutan/... (k.java:1214)
messages       (id, from_id, to_id, type, body, sent_at)
```

**Notlar:**
- `techs` **oyuncu-genel** (şehir değil) — orijinalde teknikler tüm imparatorluğa etki eder (`e.java:380`
  tip-35 oyuncu bazında yükler). Kahramanlar/Tapınak tekniğe girmez (savaş dokümanı notu).
- `production_queue.category` = §5 formül kategorisi → maliyet/süre motordan hesaplanır.
- `battles` + `battle_log` = `engine/combat` çıktısını saklar; istemci animasyonu buradan oynatır.
- Timer'lar (`finish_at`, `arrive_at`) **sunucu saatinde**; istemci sadece geri sayım gösterir (orijinal
  `k.java` `u` sayacı + `e.java:192` 1sn tick mantığının modern hali).

---

## 9. Yol Haritası (fazlı)

**Faz 0 — Temel (mevcut durumdan)**
- [x] Savaş motoru çıkarıldı & doğrulandı (`mobiwar-engine.js`, ~%98).
- [ ] Monorepo iskeleti kur (pnpm/turborepo). `mobiwar-engine.js` → `packages/engine/combat` (TS'e port,
      mevcut `scratchpad/` testlerini taşı → regresyon güvencesi).
- [ ] Katalog JSON'u çıkar (`k.java:89` b[] + savaş statları `mobiwar-verified-formulas.md`'den).

**Faz 1 — Motor & ekonomi**
- [ ] `packages/engine/economy` = §5 formülleri (TS) + testler.
- [ ] Base-tablo rekonstrüksiyonu: savaş statları + ekonomi dengesi → `catalog/*.json`.
- [ ] Protokol spec'i yaz (`protocol/legacy-map.md`): her `.do` → JSON şema.

**Faz 2 — Otoriter sunucu (MVP)**
- [ ] NestJS + Postgres + Redis. §8 şeması + migration.
- [ ] Çekirdek döngü: login, şehir durumu, üretim kuyruğu (timer), bina/teknik, ordu gönder, **savaş
      çözümü (engine)**, rapor. WebSocket kanalı.

**Faz 3 — Web istemci**
- [ ] React + Vite. Durum ekranı, şehir, üretim, savunma, dünya haritası, savaş raporu animasyonu
      (engine'i istemcide önizleme için de kullanabilir).

**Faz 4 — Flutter istemci**
- [ ] Server-authoritative (§7.3-A). Aynı WebSocket API. Native bildirim (üretim/ordu bitti).

**Faz 5 — Denge & modernizasyon**
- [ ] Orijinal "ruh" korunarak QoL: daha iyi harita, sohbet, bildirimler, sezon/etkinlik sistemi.

---

## 10. Savaş Sistemi Entegrasyonu (kullanıcının son hedefi)

Savaş motoru (`mobiwar-engine.js`) hâlihazırda saf/deterministik: girdi = iki ordu + teknik + tapınak +
gece; çıktı = kazanan, kayıplar, XP, ganimet, hayatta kalanlar. Entegrasyon:
1. Motoru `packages/engine/combat`'e TS olarak taşı (mevcut testlerle birebir doğrula — regresyon 0).
2. Sunucu, `army arrive` olayında iki tarafın anlık durumunu motora verir → sonucu `battles`/`battle_log`'a
   yazar → oyunculara WebSocket ile bildirir.
3. İstemci raporu (`i`/`d` sınıfının modern hali) log'dan oynatır.
4. **Kalan doğrulama artıkları** (yapı savaşları ~%1-15 sapma, `DOGRULAMA_DURUMU.md` "KALAN ARTIKLAR")
   entegrasyondan önce kullanıcı orij-sim verisiyle kapatılır — ama yapısız savaşlar üretime hazır.

---

## 11. Riskler & Açık Sorular
- **Sunucu ÖLÜ** (§0.1-1) → base tablo toplanamıyor. **En büyük veri boşluğu: yapı + akademi-teknik base
  maliyet/süre tabloları.** Savaşçı + savunma-birim maliyetleri binary'de VAR (`mobiwar-engine.js` gold/
  food). Boşluk stratejisi (kullanıcıyla netleşecek): (a) binary combat statlarından + oyun-dengesi
  oranlarından türet, oynanışta tunable; (b) `images/` ekran görüntülerinden çıkarılabilenleri al; (c)
  saf tasarım kararı (yeniden dengele — "ruhu koru"). Öneri: (a)+(c), config-driven.
- **✅ ÇÖZÜLDÜ — Yapı stat off-by-one** (bkz. `MOBIWAR_OYUN_VERISI.md`): binary 3 tablo (train/altın/yemek)
  + kullanıcı Tuzak-maliyet hatırası + txt Alan = ÜÇLÜ doğrulama. Motorun TÜM yapı statları 1 index kaymış;
  gerçek Mangonel/Balista'nın güçlü saldırı statları var → "yapı bilmecesi"nin kök nedeni buymuş. STRUCT_FP/
  STRUCT_TANK hack'leri yanlış statları telafi ediyormuş. Düzeltme staged (TS port 1:1 sadık; sonra +1 kaydır
  + yapı-combat re-verify → STRUCT_FP muhtemelen gereksiz). Doğru stat tablosu OYUN_VERISI.md'de hazır.
- **Teknik-etki STAT diskrepansı** (OYUN_VERISI.md): resmi %'ler motor katsayılarıyla uyuşur ama etkilenen
  STAT farklı (resmi "saldırı" vs motor "HP"). Combat için motor otoriter (B-grubu binary-doğrulandı); binary
  re-trace ile uzlaştırılacak.
- **Premium temeli**: istemcide izler var (g.java:643 + menü). `is_premium` bayrağı + yetki-kapıları kurulacak;
  6 madde sonra. Gelişmiş genel-durum ekranı muhtemelen herkese açık yapılacak.
- **Yapı-savaş modeli** hâlâ yaklaşık (statik trace tükendi; runtime-trace veya orij-sim kalibrasyon verisi
  gerekir). Yapısız savaş sağlam.
- **Denge kararları:** Base tablolar birebir kopyalanamazsa, "ruhu koru" ilkesiyle yeniden dengeleme —
  bu bir tasarım fırsatı (modern QoL) ama nostalji-sadakati ile denge gerektirir.

---

## İlgili Dosyalar
- `packages/engine/` — **savaş motorunun TypeScript portu** (`@mobiwar/engine`, 22/22 regresyon testi geçer,
  JS ile birebir). Rebuild'de tek kaynak (sunucu-otoriteli). Faz 0 başladı.
- `MOBIWAR_OYUN_VERISI.md` — **oyun verisi kataloğu** (birim/yapı/teknik meta: Alan=train doğrulaması,
  ön-şartlar, hız/kapasite, teknik-etki, dünya kuralları). Rebuild katalog kaynağı.
- `DOGRULAMA_DURUMU.md` — savaş motoru tersine-mühendislik durumu (resume).
- `mobiwar-engine.js` — savaş motoru (TS'e taşınacak).
- `memory/mobiwar-verified-formulas.md` — binary-doğrulanmış savaş formülleri + statlar.
- `DecompiledSrc/src/` — istemci kaynağı (bu raporun temeli).
- `scratchpad/` — doğrulama harness'ları (→ `packages/sim`).
