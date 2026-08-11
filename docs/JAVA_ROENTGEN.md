# JAVA RÖNTGEN ARŞİVİ — orijinal istemciden çıkarılan kalıcı bilgi

> **Ne işe yarar:** `docs/DecompiledSrc/src/*.java` (MobiWar v1.5.2 J2ME istemcisi) her yeni
> özellikte baştan analiz edilmesin diye. Bir özelliği bir kez röntgenledik mi, bulgular
> **buraya** yazılır; bir dahaki sefere kod yerine bu dosya okunur.
>
> **Kurulan kural (kullanıcı, 2026-08-11):** *"Java dosyalarına çok sık başvurduğumuz için her
> özellik için her seferinde yeni baştan analiz yerine oradan edindiğin bilgileri bir dosyada
> kalıcı tut. Başka bir özellik için yeni bir analiz yaptığımız zaman yine o dosyaya ekleriz."*

⚠️ **Bu dosya `docs/referans/MOBIWAR_MIMARI_RAPOR.md`'yi TEKRARLAMAZ.** Orası 2026-07-23
dönemine ait **dondurulmuş** bir mimari raporu: sınıf/rol haritası (`k` hub, `e` ağ, `g` menü…),
menü envanteri ve protokol şekli orada. Burası ise **yaşayan röntgen arşivi** — özellik başına
derinlemesine çözüm. Sınıf haritası lazımsa oraya bak, tekrar yazmadık.

---

## 0. Nasıl eklenir (bir sonraki analizde)

1. Aleti çalıştır (§1), aradığın etiketin **indeksini** bul.
2. O indeksi kodda ara (`grep -n "a\[NNN\]" *.java`) — kullanan ekran/işlev çıkar.
3. Bulguları **§4 alan sözlüğüne** ve **§5 uç kataloğuna** ekle (bunlar birikimli, en çok
   yeniden kullanılan bölümler).
4. Özellik için §6'ya yeni bir alt bölüm aç.
5. ⭐ Orijinalde olup **bizde olmayan** bir şey bulduysan §7 defterine yaz — kullanıcının
   ifadesiyle *"bu çok değerli"*.

---

## 1. ⚙️ Çözümleme aleti — `docs/araclar/java-dize.py`

Ekranda görünen **her metin** ve **her sunucu ucu** tek bir dizide: `k.java` →
`public static final String[] a` (**299 kayıt**). Kod bu diziyle çıplak indeks üzerinden
konuşur (`k.a[231]`), o yüzden indeksleri okunur hâle getirmek analizin ilk adımıdır.

```bash
python docs/araclar/java-dize.py              # tabloyu kall.txt'e dök
python docs/araclar/java-dize.py 231 232 233  # verilen indeksleri yaz
python docs/araclar/java-dize.py --ara Dirilt # metne göre indeks bul
```

### Üç tuzak (üçüne de düşüldü, hepsi betikte kapatıldı)

| Tuzak | Belirti | Doğrusu |
|---|---|---|
| **Çift kodlama** | `Altýn` / `AltÃ½n` görürsün | Dosya **UTF-8**, ama Türkçe bir kez bozulmuş: cp1254 baytı (`ı`=0xFD) latin-1 sanılıp (`ý`) UTF-8'e yazılmış. Geri dönüşüm: **utf-8 oku → `.encode('latin-1')` → `.decode('cp1254')`**. Dosyayı latin-1 okumak regex'i çalıştırır ama metni **çift bozar** ve artık düzelmez |
| **Windows kabuğu** | `re.PatternError: unterminated character set` | `python -c "..."` kullanma — Git Bash ters bölüleri yiyor. Betik **dosya olarak** çalıştırılmalı |
| **Konsola basmak** | Tablo yarıda kesiliyor, sayı eksik görünüyor | Konsol cp1254; `⇒` gibi bir karakter `UnicodeEncodeError` ile betiği öldürüyor. Çıktı daima **UTF-8 dosyaya** yazılır |

### ⭐ Asıl kalıp — «bitişik indeks bloğu»

Kod sık sık `k.a[N + değişken]` yazar. Örnek, `j.java:401`:

```java
n.a.append(k.a[238] /* "Durum:" */).append(k.a[231 + var1]);   // var1 = durum kodu
```

⇒ **Etiket kümeleri tabloda ardışık durur.** Bir durum/tip tablosu bulduğunda komşu indeksleri
okumak o özelliğin **tüm sözlüğünü** verir — kodun geri kalanını hiç okumadan. Kahraman
durumlarının yedisi de (§6.1) tek bir `231+u` satırından çıktı.

---

## 2. Protokol — üç cümlelik hatırlatma

- İstek: `<uç>.do?<parametreler>` + oturum eki; yanıt **ASCII metin**, ikili değil.
- Yanıt `h` ağacına parse edilir: sıralı `String → Object` map + `long[3]` yük
  (`MOBIWAR_MIMARI_RAPOR.md` §4).
- Ekranlar alanları **tek harfli anahtarlarla** okur: `this.a.a(k.a[177])` → `"v"` alanı.
  Bu yüzden §4 sözlüğü olmadan hiçbir ekran çözülemiyor.

---

## 3. Kaynak güvenilirlik sırası

Bir sayı çelişirse öncelik: **binary simülatör ölçümü** > **istemci kodu** > **oyun ekran
görüntüsü** > **referans dokümanı** (`docs/referans/tekniklere_ve_yapilara_iliskin_on_bilgiler.txt`).
⚠️ Referans dokümanı insan eliyle yazılmış ve birkaç yerde ölçümle çürütüldü (örn. teknik
listelerindeki "Kaos hariç" ifadesi).

---

## 4. 📖 Sunucu alan sözlüğü (birikimli)

Tek harfli anahtarlar bağlama göre yeniden kullanılıyor — **hangi ekranda** olduğu önemli.

| anahtar | `k.a[]` | anlam | nerede doğrulandı |
|---|---:|---|---|
| `i` | 91 | varlığın **adı** (kahraman adı) | `l.java:175` diriltme onayı |
| `l` | 108 | **altın** bedeli | `l.java:175` · bina maliyetiyle aynı harf (`e.java:380-393`) |
| `m` | 110 | **yemek** bedeli | aynı |
| `p` | 135 | **tecrübe / puan** (mevcut) | `j.java:412` → `Puan: <p>/<w>` |
| `w` | 187 | bir sonraki **eşik** | aynı |
| `r` | 139 | portre / ikon numarası | `j.java:385` |
| `s` | 144 | işlemin **toplam süresi** | `j.java:393` diriltme ilerleme çubuğu |
| `t` | 162 | **varlık kimliği** (kahraman id) | `grKoz.do?k=<t>`, `drKah.do?k=<t>` |
| `u` | 170 | **durum kodu** | `j.java:382` + `k.a[231+u]` |
| `v` | 177 | **seviye** | `j.java:391` → `Seviye: <v>` |
| `x` | 178 | **kalan yetenek puanı** | `g.java:654` puan harcandıkça elle azaltılıyor |
| `B` | 19 | **birim listesi** ağacı | mağara ekranı + sefer formu (`g.java:1722`) |
| `K` | 103 | **kahraman listesi** ağacı | aynı + kahraman ekranı (`e.java:624`) |
| `Ekr` | 50 | o anki **ekran kodu** | `g.java:2144` dallanması |
| `e` | 49 | şehir adı (dünya slotu · arama sonucu) | `j.java:203` · `j.java:281` |
| `o` | 123 | slotun **sahibi var mı** (null → Sahipsiz) | `j.java:278` |
| `t` | 162 | mesaj listesinde **rapor/sefer tipi** | `o.java:277` |
| `v` | 177 | mesaj listesinde **TARAF** (1 gönderen · 2 alan) ⚠️ seviye değil | `o.java:280` |

⚠️ `long[3]` yükünün `a[2]` gözü ilerleme sayacı olarak kullanılıyor (`j.java:406`: geçen
süre × 100 / toplam = yüzde).

---

## 5. 🔌 Uç kataloğu — 69 `.do` ucu

Ön ekler anlamlı: `gr`=getir · `dg`=değiştir · `it`=ittifak · `is`=sıralama · `ip`=iptal ·
`kn`=komuta · `gn`=gönder · `ol`=oluştur · `ur`=üret · `ar`=ara · `uy`=üyelik.

Aşağıda **bu arşivde çözülmüş** olanlar; tam liste için aleti çalıştır (`--ara .do`).

| uç | işlev | bizde |
|---|---|---|
| `grKhr.do?u=<şehir>` | kahraman listesi | ✅ `GET /cities/:id/heroes` |
| `grKoz.do?k=<kahraman>` | özellikler ekranı | ✅ |
| `dgKoz.do?k=<yetenek>&o=<kahraman>` | yetenek puanı harca (+1) | ✅ `POST /heroes/:id/skills` |
| `dgKad.do?a=<ad>&t=<kahraman>` | kahraman adını değiştir | ✅ `POST /heroes/:id/rename` |
| `drKah.do?k=<kahraman>&o=1` | **Dirilt** | ✅ `POST /heroes/:id/revive` |
| `drKah.do?k=<kahraman>&o=2` | **Diriltmeyi Durdur** | ✅ `.../revive/cancel` |
| `isKhr.do?s=` | kahraman sıralaması | ✅ |
| `ipMgr.do?u=` | mağara işlemini iptal | ✅ `DELETE /cities/:id/cave/job` |
| `msBlk.do?` | oyuncuyu blokla | ⚠️ bkz. `EKSIK_OZELLIKLER.md` |

---

## 6. 🔬 Özellik röntgenleri

### 6.1 TAPINAK / KAHRAMAN MENÜSÜ (2026-08-11)

⚠️ **Orijinalde «Tapınak» diye bir EKRAN yok.** Tapınağın işlevleri `Kahramanlar` ekranında
toplanmış; Tapınak yalnız Yapılar'dan yükseltilen bir bina.

#### Kahraman satırı — `j.java:381 g()`

```java
int var1 = parseInt(a(k.a[170]));            // u = durum kodu
if (var1 != 7) append(k.a[231]).append(a(k.a[177]));      // "Seviye: <v>"
else           { var6 = parseInt(a(k.a[144])); … }        // s = toplam süre
if (var1 != 7) append(k.a[238]).append(k.a[231 + var1]);  // "Durum: <etiket>"
else           çubuk(a[2] * 100 / var6);                  // % ilerleme
if (var1 != 7) append(k.a[240]).append(a(k.a[135])).append('/').append(a(k.a[187]));
else           append(k.a[239]);                          // "Diriltiliyor"
```

#### ⭐⭐ YEDİ DURUM — `k.a[231 + u]`

| kod | orijinal etiket | bizdeki karşılık |
|---:|---|---|
| 1 | Görevde | ✅ `on_mission` |
| 2 | Şehirde | ✅ `in_city` |
| 3 | **Mağarada** | ✅ `in_cave` (2026-08-11, §6.2) |
| 4 | **Mağaradan Çıkıyor** | ✅ `leaving_cave` — **türetilir**, kolonu yok |
| 5 | **Mağaraya Giriyor** | ✅ `entering_cave` — **türetilir**, kolonu yok |
| 6 | Yok Edildi ! | ✅ `dead` |
| 7 | Diriltiliyor (+ ilerleme çubuğu) | ✅ `reviving` |

⚠️ Bizde **fazladan** bir durum var: `returning` (ölmüş ama eve varmamış). Orijinalde yok —
muhtemelen «Görevde» sayılıyordu. Bizimki daha bilgilendirici, korunuyor.

#### Diriltme onay diyaloğu — `l.java:175`

> `<i> <l> Altın <m> Yemek karşılığında diriltilecek. Emin misiniz!`

⚠️⚠️ **EN ÖNEMLİ BULGU: bedel istemcide HESAPLANMIYOR.** `l`/`m` sunucudan gelen hazır
sayılar. `k.java`'nın ekonomi fonksiyonu (`1373-1448`) yalnız **bina tip kodlarına** bakıyor
(62=Çiftlik, 64=Maden, 67=Mimar Okulu); kahraman dalı yok.

⇒ **Diriltme maliyet ve süre eğrilerinin TAMAMI bizim tasarımımız.** Elimizdeki tek ölçülmüş
veri seviye 0 tabanı: **3000 altın / 2000 yemek** (`images/scr_itv03`; referans dokümanı
satır 531 de doğruluyor). Bu yüzden 2026-08-11'de üssü 1,50 → **1,25** yapmak hiçbir orijinal
veriyi ihlal etmedi (§13.11.4b).

#### Yetenek puanı akışı

`g.java:654-655`: `dgKoz.do` başarılı olunca istemci `x` alanını **elle bir azaltıyor** ve
ekranı tazeliyor. `j.java:432`: `<x> seviye ilerletme hakkınız var`.
⇒ «her seviye N puan verir, kalan puan takip edilir» mekanizması **istemcide doğrulandı**;
ama **N = 3 sayısı istemcide YOK** (sunucu tarafıydı) — bizim `hero.pointsPerLevel` tasarımı
mekanizmayla birebir örtüşüyor.

#### Referans dokümanından teyit edilenler

- Tapınak **iki** işe yarar: kahraman çıkma ihtimali + **diriltme süresi**. Maliyete etkisi
  yok — bizim kararımız (2026-07-29) dokümanla uyumlu.
- Tapınak **per-şehir** (satır 601): diriltme süresinde uygulanıyor ✅. ⚠️ Kahraman ÇIKMA'da
  bilerek sapıyoruz (binary ölçümü: oyuncunun **tüm** tapınaklarının toplamı, 28/28 ölçüm).
- *"Kahramanın çıktığı ilk savaş ona tecrübe kazandırmaz"* (satır 611) → bizde **yapı gereği
  zaten sağlanıyor**: `maybeCaptureHero`, `settleHeroes`'tan SONRA koşuyor, yeni kahraman XP
  dizilerinde hiç yok. Eksik değil.

### 6.2 MAĞARA EKRANI — asker + kahraman (2026-08-11)

#### ⭐⭐ EN ÖNEMLİ BULGU: kahraman durum koduyla eleniyor

`i.java:815 g(int)` = **"tümünü seç"**. Önce birim satırlarını (`B` ağacı) doldurur, sonra
**kahraman listesini** (`n.a.e`, `K` ağacı) gezer:

```java
int var8 = var2.a - 1;                         // birim satırı sayısı
for (int var6 = 1; var6 < n.a.e.a; ++var6) {   // ← KAHRAMANLAR, birimlerin ARDINDAN
   if (var1 == 1) {                                                  // Mağara Doldur
      if (parseInt(n.a.e.a(var6).a(k.a[170])) == 2 …) { … }           // u == 2 «Şehirde»
   } else if (parseInt(n.a.e.a(var6).a(k.a[170])) == 3 …) { … }       // u == 3 «Mağarada»
}
```

| işlem | kabul edilen durum | elenenler |
|---|---|---|
| **Mağara Doldur** | `u == 2` **Şehirde** | Görevde(1) · Mağarada(3) · geçişler(4,5) · **Yok Edildi(6)** · **Diriltiliyor(7)** |
| **Mağara Boşalt** | `u == 3` **Mağarada** | diğer hepsi |

⭐ Bizim karşılığımız `status='alive' AND city_id = <şehir>`. ⚠️ Yalnız `alive` demek **yetmez**:
seferdeki kahraman da `alive`, onu `city_id IS NULL` ayırıyor.

#### Mağara işlemleri SEFER TİPİDİR

`k.java:886-894` görev tipi → etiket tablosu:

| kod | etiket | kod | etiket |
|---:|---|---:|---|
| 1 | Saldırı | 4 | Destek |
| 2 | Casusluk | 5 | Şehir Kur |
| 3 | Nakliye | **11** | **Mağara Doldur** |
| | | **12** | **Mağara Boşalt** |

⇒ Mağara doldur/boşalt orijinalde saldırıyla **aynı numaralandırmada**. Bizdeki
`cave_store`/`cave_withdraw` görev tipleri bununla birebir örtüşüyor.

#### Tek ekran, tek istek

`g.java:1716-1734` (ekran 42 = Doldur, 43 = Boşalt) formu **iki ağaçla birden** kuruyor:

```java
var5.a(this.a.b().a(k.a[19]) /* B = birimler */,
       this.a.b().a(k.a[103]) /* K = kahramanlar */, k.a[129] /* "O11" */);
```

Gönderim `gnOrd.do` (`g.java:1016-1024`) ve başarılı olunca istemci **her iki ağacı da**
temizliyor. ⇒ Orijinalde asker ve kahraman **aynı emirde** seçiliyordu — bizim tek modal /
iki bölüm kararımızın kaynağı bu.

Bu turda çözülen `B` · `K` · `Ekr` anahtarları **§4 sözlüğüne** eklendi (§0 kuralı: alanlar
tek yerde birikir, özellik bölümleri onları tekrarlamaz).

### 6.3 DÜNYA EKRANI — başkent gösterimi YOK (2026-08-11)

Soru: *"dünya sayfasından bir oyuncunun başkenti özel olarak gösteriliyor mu?"* → **Hayır.**

Dize tablosunda **tek bir** «Başkent» geçiyor: `k.a[194] = "Başkent: "` (iki nokta üst üste,
yani bir **etiket**, harita işareti değil). Tek kullanım yeri `j.java:203`, `this.e == 5`
başlık kipi:

```java
if (this.a.a(k.a[49] /* "e" */) == null) var2 = k.a[194];   // "Başkent: "
else                                     var2 = k.a[193];   // "Şehir: "
append(var2).append(a("e")).append("(").append(a("p") /* puan */).append(")");
```

O kipi çağıran **tek** yer `g.java:1705-1707`, ekran **case 41**:

```java
this.a.a = a[67];                  // g.a[67] = "Oyuncu Ara"
var5.a((String)k.a[13], 5);        // ← mod 5
```

⇒ «Başkent» yalnız **Oyuncu Ara** (arama sonuçları) ekranında, `Başkent: <ad> (<puan>)`
biçiminde görünüyor. Dünya haritasında değil.

Dünya slotunun kendi çizimi `j.java d()` ve orada başkentten hiç söz yok:

```java
if (a("o") != null) { append("Ittifak: ").append(a("i")); append("Şehir: ").append(a("e")); }
else                { append(k.a[48] /* "Durum: Sahipsiz" */); }
```

⇒ Dolu slot **her zaman** `Şehir:` diyor — `Başkent:` demiyor. Sahipsiz slot için ayrı etiket
var. Yıldız/ikon türünden bir başkent işareti de yok.

⭐ **Bizdeki karşılığı (2026-08-11):** dünya tablosundaki `★` kaldırıldı; bilgi kaybolmadı,
şehir modalında «· başkent» olarak duruyor. Kendi şehir listelerimizde (Komuta Merkezi,
şehir şeridi) yıldız **korunuyor** — orası harita değil, oyuncunun kendi envanteri.

### 6.4 MESAJ KUTUSU — rapor başlıkları (2026-08-11)

Soru: *"gelen saldırı raporu mesaj kutusunda nasıl gösteriliyor — Saldırı Önleme Raporu mu,
Şehir Savunma Raporu mu?"* → **Şehir Savunma Raporu.** «Saldırı Önleme» diye bir dize tabloda
**hiç yok**.

Çizici `o.java:263 b()`, mesaj listesinin her satırı için:

```java
int var4 = parseInt(a(k.a[162] /* t = tip */));
if (var4 > 0 && var4 < 6) {
   int var5 = parseInt(a(k.a[177] /* v = TARAF: 1 gönderen · 2 alan */));
   String var8 = k.a(var4);                          // sefer tipi adı (§6.2 tablosu)
   if      (var5 == 2 && var4 == 1) var8 = k.a[159]; // ⭐ "Şehir Savunma"
   else if (var5 == 2 && var4 == 2) var8 = k.a[31];  //    "Casusluk Önleme"
   var3.a = (a.b > 150) ? var8 + k.a[12] /* " Raporu" */ : var8;
} else if (var4 == 11 || var4 == 12) {
   var3.a = k.a(var4) + k.a[268];                    // "ma Raporu"
}
```

⇒ Başlık = **sefer tipi adı**, savunan tarafta yalnız **iki tip** için değiştiriliyor:

| tip | gönderen tarafta | **alan tarafta** |
|---|---|---|
| 1 Saldırı | Saldırı Raporu | ⭐ **Şehir Savunma Raporu** |
| 2 Casusluk | Casusluk Raporu | Casusluk Önleme Raporu |
| 3 Nakliye | Nakliye Raporu | Nakliye Raporu (aynı) |
| 4 Destek | Destek Raporu | Destek Raporu (aynı) |
| 5 Şehir Kur | Şehir Kurma Raporu | — |
| 11/12 Mağara | Mağara Doldurma / Boşaltma Raporu | — |

⚠️ **«Raporu» eki KOŞULLU**: ekran genişliği ≤150px ise yalnız ad yazılıyor (`a.b > 150`
dallanması). Bizde böyle bir daraltma yok ve gerekmiyor — CSS kırpma zaten var.

⚠️ **`v` (177) burada SEVİYE DEĞİL, TARAF.** §4 sözlüğü `v`yi kahraman ekranında «seviye»
olarak kaydetmişti; mesaj listesinde 1/2 değerli bir yön bayrağı. Sözlüğün en başındaki uyarı
tam da bu: *"tek harfli anahtarlar bağlama göre yeniden kullanılıyor."*

⭐ **Bizdeki karşılığı:** `Messages.tsx` → `REPORT_TYPE`. Dördünden üçü zaten birebir tutuyordu
(Saldırı · Casusluk · Casusluk Önleme · Şehir Kurma); yalnız savunan savaş raporu
«Saldırı Önleme Raporu» diye **uydurulmuştu** ve 2026-08-11'de düzeltildi.

### 6.5 EKONOMİ FORMÜLLERİ — `k.java:1373-1448`

Bu röntgen 2026-08-10 ekonomi turunda yapıldı ve tamamı
**`MOBIWAR_SISTEM_PLANI.md` §13.9a / §13.11.3**'te duruyor (çarpanlar `k.java:10-15`,
Çiftlik/Maden ayrımı, Mimar Okulu'nun `×10` muafiyeti). Burada tekrarlanmıyor.

⚠️ Çözülemeyen: `k.java:91`'de referanssız iki ondalık — `"1.3"` ve `"1.02"` (indeks 218-219).
Kesinleştirmek için `javap -c` ile bytecode taraması gerekir.

---

## 7. ⭐ UYGULAMADIKLARIMIZ DEFTERİ

> Orijinalde **var**, bizde **yok**. Kullanıcı: *"java kodlarından çıkan ve bizim
> uygulamadığımız bir yöntem varsa bu çok değerli."*

| # | Özellik | Orijinal kanıt | Bizdeki durum | Karar |
|---:|---|---|---|---|
| 1 | **Kahraman mağaraya saklanabiliyor** | `k.a[234..236]` = Mağarada · Mağaraya Giriyor · Mağaradan Çıkıyor; `i.java:844-852` durum süzgeci | ✅ **UYGULANDI** (2026-08-11) | Künye §7.1'de |

> Defter şu an boş — bulunan tek madde uygulandı. Yeni bir röntgende orijinalde olup bizde
> olmayan bir şey çıkarsa **buraya** yazılır (kullanıcı: *"bu çok değerli"*).

### 7.1 Kahraman mağarada — UYGULANDI (2026-08-11)

Tasarımın tamamı `MOBIWAR_SISTEM_PLANI.md` **§13.20.6**'da; burada yalnız röntgenden çıkan
kararlar ve **ertelenirken sorulan soruların cevapları** duruyor.

| Açık soruydu | Cevap |
|---|---|
| Şema: `cave_heroes` tablosu mu, bayrak mı? | **İkisi de değil** — `heroes.status = 'in_cave'`. `status='alive'` süzgeci zaten beş yerde duruyor, hepsi kendiliğinden doğru çalıştı |
| Geçiş süresi kahramana özel mi? | Hayır, askerlerle **aynı formül**. Kahramanın alanı **5** (ölçülmüş, `teknik_ve_yapi_dokumantasyonu.md:209`) |
| İki geçiş durumu nasıl saklanacak? | **Saklanmıyor, türetiliyor**: süren emrin yönü + `payload.heroIds` |
| Savaşa katılır mı? | Hayır → ölmez de. Mağara, kahraman kaybına karşı **sigorta**; §13.20.6'da bilinen denge sonucu olarak yazıldı |
| Casusluk görür mü? | Hayır — `heroCount` sorgusu `status='alive'` süzüyor, ek kod gerekmedi |
| Mağara yıkılınca kahraman? | Kullanıcı kararı: **kaçış görevine katılır**, yol boyunca `in_cave` kalır, varınca `alive` olur |

⚠️ Röntgenin **beklenmedik yan çıktısı**: mağara ekranının asker ve kahramanı tek istekte
göndermesi (§6.2), kullanıcının bağımsız olarak istediği "tek ekran, iki bölüm" kararıyla
birebir örtüştü.

---

## 8. Değişiklik günlüğü

| Tarih | Ne eklendi |
|---|---|
| 2026-08-11 | Dosya açıldı. §1 alet + üç tuzak · §4 alan sözlüğü (11 anahtar) · §5 uç kataloğu · §6.1 **Tapınak/Kahraman röntgeni** · §7 **mağarada kahraman** kaydı |
| 2026-08-11 (4) | §6.4 **Mesaj kutusu rapor başlıkları**: savunan savaş raporu «**Şehir Savunma Raporu**», «Saldırı Önleme» diye bir dize YOK. §4'e `t` ve bağlama bağlı `v` |
| 2026-08-11 (3) | §6.3 **Dünya ekranı**: başkentin haritada özel gösterimi **YOK** — «Başkent:» yalnız *Oyuncu Ara* ekranında. §4'e `e` ve `o` |
| 2026-08-11 (2) | §6.2 **Mağara ekranı röntgeni** (kahraman durum süzgeci `i.java:844-852` · mağara = sefer tipi 11/12 · tek istek) · §4'e `B`/`K`/`Ekr` · §5'te `ipMgr` düzeltmesi (iptal BİZDE VAR) · §7 defteri **kapandı**, madde uygulandı |
