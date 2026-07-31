# Mobiwar — Teknik & Savaş Mantığı Raporu (v0.6)

**Tarih:** 2026-07-25 · **Kapsam:** `teknik_etkileri.md` (motor çıkarımı) ↔ `teknik_ve_yapi_dokumantasyonu.md`
(oyunun kendi dokümanı) karşılaştırması, `savas_farki_analizi.md` maddelerinin değerlendirilmesi ve
`mobiwar-engine.js` v0.6 için alınan tasarım kararları.

---

## 0. Kritik ön bulgu: stat ADLARI yanıltıcı, motor aslında dokümanla büyük ölçüde UYUMLUYDU

Binary'den çıkardığımız stat indeksleri (1=HP, 2=MagicHP, 3=PhysAtk, 4=PhysDef, 5=MagicAtk, 6=MagicDef)
hasar çekirdeğinde **adlarının ima ettiği işi yapmıyor**. Gerçek işlevler:

| Stat (eski ad) | Motordaki gerçek işlevi | Doğru ad |
| :-- | :-- | :-- |
| `hp` (Can) | Faz 1/2 saldırı **havuzuna** katkı | **Fiziksel vuruş gücü** (menzillide "uzak", yakında "yakın") |
| `magicHp` (Büyü Canı) | Faz 3 saldırı havuzuna katkı | **Büyü vuruş gücü** |
| `pAtk` (Fiz. Saldırı) | Faz 1 (menzilli) mitigasyonu | **Ok/menzil savunması** |
| `pDef` (Fiz. Savunma) | Faz 2 (yakın) mitigasyonu | **Yakın dövüş savunması** |
| `mAtk` (Büyü Saldırı) | Faz 3 mitigasyonu | **Büyü savunması** |
| `mDef` (Büyü Savunma) | Kayıp bölücüsü (her fazda) | **Genel dayanıklılık** |

Bu okuma ham stat tablosuyla da doğrulanıyor:
- **Süvari** `pAtk 72` ≫ `pDef 36` — doküman: *"kullandıkları kalın zırhlar ile özellikle **oklara karşı** çok dayanıklıdırlar"*.
- **Elf** `pDef 4` (en düşük) — doküman: *"göğüs göğüse çarpışmalara karşı önemli zaafiyetleri vardır"*.
- **Ejderha/Kaos** en yüksek `mDef/hp` oranı — *"Bir Kaosu yok etmek çok zordur"*.

### Sonuç 1 — "Tılsım yanlış stata etki ediyor" iddiası bir ADLANDIRMA yanılsamasıydı
`savas_farki_analizi.md` §1, Tılsım'ın `mAtk`'ı büyüttüğünü görüp "büyü **saldırısını** artırıyor, oysa
büyü **savunmasını** artırmalı" demiş ve `mDef`'e taşınmasını önermiş. Ama:
- `mAtk` motorda **hiçbir yerde saldırı olarak kullanılmıyor** — yalnızca büyü fazının mitigasyonu, yani
  fiilen **büyü savunması**. Tılsım zaten doğru stata etki ediyormuş.
- `mDef` ise büyüye özel değil, **her fazın** bölücüsü = genel dayanıklılık. Tılsım oraya taşınsaydı
  "büyü savunması" tekniği fiziksel dayanıklılığı da artırırdı → doküman ihlali olurdu.

**Karar:** Tılsım `mAtk`'ta kaldı (oranı %6→%5 düzeltildi, üyelik listesi doküman listesine göre daraltıldı).
Stat adları kod içinde §T bloğunda işlevleriyle belgelendi. *(TS portunda alanlar `rangedDef/meleeDef/
magicDef/toughness` olarak yeniden adlandırılmalı — bu yanılgı tekrarlanmasın.)*

Aynı sebeple **"her teknik aslında vuruş gücünü artırır" ifadesi ile motorun HP'yi büyütmesi çelişmiyor**:
menzilli bir birimin HP'si onun uzak vuruş gücüdür. Okçuluk→Elf/Pegasus HP, Demircilik→Cüce/Süvari HP,
Kimya→Mancınık HP, Büyücülük→BüyüCan zinciri **dokümanla birebir örtüşüyor**.

---

## 1. `teknik_etkileri.md` ↔ doküman karşılaştırması

`teknik_etkileri.md`, motorun *binary'den kopyalanmış* sınıf-tablosunu anlatıyordu. Doküman ile
farkları (✗ = doküman ile çelişen, ✓ = uyumlu):

| Teknik | `teknik_etkileri.md` iddiası | Doküman | Durum / v0.6 |
| :-- | :-- | :-- | :-- |
| Okçuluk | Elf, Pegasus, **Şaman, Casus Kuş** (+%5 Can) | Elf, Pegasus (+ yapı: Okçu Kulesi, Balista) | ✗ Şaman/Casus yanlış (üstelik motorda da yanlıştı: ikisi de sınıf-1'di, yani Demircilik alıyorlardı). **Düzeltildi.** |
| Demircilik | Cüce, Süvari, Gnom, **Yük Arabası** | Cüce, Süvari, **Ogre**, Gnom (+ Tuzak, Muhafız) | ✗ Ogre eksik, Yük fazla. **Düzeltildi.** |
| Kimya | Mancınık | Mancınık, Kazancı, Mangonel | ✓ (yapılar zaten doğruydu) |
| İçgüdü | Ejderha, Ogre, Kaos | aynı | ✓ |
| Büyücülük | **tüm savaşçılar** | Şaman, Pegasus, Ejderha, Kaos + **Büyü Kalkanı** | ~ (statı 0 olanlarda etkisizdi → pratikte aynı); **Büyü Kalkanı eksikti, eklendi.** |
| Zırh | **tüm savaşçılar** + Tuzak/Kazancı/Muhafız; Fiz.Sald **ve** Fiz.Sav | "**Kaos hariç** tüm savaşçılar" + Kazancı, Muhafız; yalnız **fiziksel defans** | ✗ Kaos ve Tuzak hariç tutuldu. (Fiz.Sald+Fiz.Sav ikisi de = "ok savunması + yakın savunma"; §0'a göre bu zaten **savunma**dır, doküman ile çelişmez.) |
| Taş Ustalığı | Okçu Kulesi, Mangonel, Balista | + **Sur** | ✗ Sur eksikti. **Eklendi** (sur dayanıklılığını artırır). |
| Tılsım | **tüm** savaşçı ve yapılar, %6, "Büyü Saldırısı" | "Mancınık hariç tüm üniteler", %5, büyü **savunması** | ✗ Oran %5'e çekildi; Mancınık/Kaos/Yük/Casus ve savaşmayan yapılar çıkarıldı. |
| Gece Görüş | (yok) | gece vuruş gücü düşer, teknik logaritmik telafi | ✓ motorda zaten `(1−3/(L+3))×0.3+0.7` |

> Not: `teknik_etkileri.md` "Zırh ve Taş Ustalığı yapıların **saldırısını da** artırıyor, ilginç bir tasarım
> tercihi" diyor. §0'a göre o alanlar saldırı değil **savunma** — ortada tuhaflık yok, yalnızca isim karışıklığı.

### v0.6 nihai teknik tablosu (motorda `TECH_TARGETS`)

| Teknik | Oran | Etkilediği stat | Birimler |
| :-- | :-- | :-- | :-- |
| Okçuluk | %5 | uzak vuruş gücü | Elf, Pegasus, Okçu Kulesi, Balista |
| Demircilik | %5 | yakın vuruş gücü | Cüce, Süvari, Ogre, Gnom, Tuzak, Muhafız |
| Kimya | %5 | vuruş gücü | Mancınık, Kazancı, Mangonel |
| İçgüdü | %5 | vuruş gücü | Ejderha, Ogre, Kaos |
| Büyücülük | %5 | büyü vuruş gücü (+ Şaman iyileştirmesi, + Büyü Kalkanı gücü) | Şaman, Pegasus, Ejderha, Kaos, Büyü Kalkanı |
| Zırh | %6 | fiziksel savunma (ok + yakın) | Kaos/Yük/Casus hariç savaşçılar, Kazancı, Muhafız |
| Taş Ustalığı | %6 | fiziksel savunma / sur dayanıklılığı | Okçu Kulesi, Mangonel, Balista, Sur |
| Tılsım | %5 | büyü savunması | Mancınık/Kaos/Yük/Casus hariç savaşçılar, Kazancı, Muhafız |

**Yığılma kuralı:** aynı stata iki teknik geliyorsa (tek örnek: **Ogre** = Demircilik + İçgüdü) bonuslar
**toplanır**: `1 + Σ(seviye × k)`. Çarpım Ogre'yi sv10'da ×2.25'e fırlatıyordu; toplama ×2.0 verir ve
"her seviye +%5" ifadesinin doğrudan karşılığıdır. Seviye üst sınırı yok (binary'de de yoktu).

---

## 2. Bir tekniğin birimlere MANTIKEN nasıl etki etmesi gerektiği (tasarım ilkeleri)

Motoru güncellerken kullandığım ve rebuild'de de geçerli olmasını önerdiğim ilkeler:

1. **Teknik, birimin karakterini güçlendirir; karakterini değiştirmez.** Okçuluk bir Cüce'yi okçu yapmaz;
   sadece zaten ok atanların menzilli vuruşunu büyütür. Bu yüzden üyelik listeleri birim açıklamalarından
   türetilmeli (dokümandaki "Etkilendiği Teknikler" satırları), sınıf-ID tablolarından değil.
2. **Saldırı teknikleri %5, savunma/zırh teknikleri %6.** Savunma tarafı biraz daha ucuz büyür; bu,
   sonsuz teknik seviyesinde saldırının patlamasını dengeler.
3. **Hiçbir teknik "her şeye" uygulanmaz.** Her tekniğin en az bir istisnası olmalı (Kaos zırh giymez,
   Mancınık'ın büyü direnci yoktur, Yük Arabası savaşmaz) — istisnalar birimlere kimlik kazandırır.
4. **Destek birimleri kendi tekniklerinden beslenir.** Şaman'ın kalkanı/iyileştirmesi **Büyücülük** ile
   büyümeli (v0.5'te yanlışlıkla Demircilik'ten besleniyordu, çünkü kalkan Can'dan okunuyordu).
5. **Yapı teknikleri yapıyı "daha iyi yapı" yapar.** Taş Ustalığı taş yapıların savunmasını ve **surun
   dayanıklılığını** artırır; Kimya ateşli mühimmatın (Mancınık/Mangonel/Kazancı) vuruşunu artırır.
6. **Kahraman tekniklerden etkilenmez** (doküman açık) — motorda da öyle; kahraman gücü yalnız seviye,
   yetenek dağılımı ve durum%'ye bağlı.

---

## 3. `savas_farki_analizi.md` maddelerinin değerlendirmesi

| # | İddia | Değerlendirme |
| :-- | :-- | :-- |
| 1 | Tılsım yanlış stata etki ediyor, `mDef`'e alınmalı | **Kısmen yanlış.** §0: `mAtk` zaten büyü savunmasıdır. Taşınmadı; oran ve üyelik düzeltildi (Mancınık artık hariç ✓). |
| 2 | Yapı hasarı hep `mDef`'e bölünüyor (binary bug'ı), motor faz ayrımı yapıyor | **Tespit hatalı.** Motor da **her zaman** `mDef`'e böler; faz ayrımı *mitigasyonda* (pAtk/pDef/mAtk). `mDef` = genel dayanıklılık olduğu için bu doğru davranış; değiştirilmedi. |
| 3 | Jitter yapıları uçuruyor, motorun stabilliği korunmalı | Katılıyorum; jitter ±%0.1 kaldı. Dalgalanma artık **doğru yerden** geliyor (tuzak tetiklenmesi + onarım rulosu). |
| 4 | Savunanda faz-tipi filtresi olmalı | **Reddedildi.** Hem mantıksız (okçu, yerdeki piyadeyi vurabilir) hem de ölçümle çürüdü (2000 mancınık 2000 cüceyi 2 turda siliyor). `DEF_TYPE_FILTER` kapalı kaldı. |
| 5 | Sur adet değil yüzde olmalı | **Kabul + uygulandı** (§4). |
| 6 | Zırh/Büyücülük istisnaları eklenmeli | **Kabul + uygulandı** (Kaos Zırh/Tılsım almaz; Büyücülük yalnız büyü gücü olanlara). |
| 7 | Tuzak rastgeleliği hikâyesi | **Kabul, ama farklı mekanizmayla:** bölme hatasını taklit etmek yerine tuzağı **tek kullanımlık + rastgele tetiklenen** yaptım (§5). Sonuç aynı "dalgalı tuzak", sebep mantıklı. |
| 8 | Gnom–Tuzak sabotajı kodda yok, eklenmeli | **Kabul + uygulandı**, hem tuzak etkisizleştirme hem yapı sabotajı olarak (§6). |

---

## 4. v0.6'da eklenen/değişen savaş mekanikleri

### [S] Sur = bütünlük (%) — **binary mekanizmasıyla** (2026-07-25 doğrulandı)
Binary'de sur gerçekten modellenmiş: **grup C** (`defC`, FUN_0040e0c4). Sur, "adedi kesirli SEVİYE olan
bir birim" gibi işleniyor — normal birimle aynı hasar yolu, yalnız üç erişimci farklı:

| | Normal birim (grup A/B) | Sur / Büyü Kalkanı (grup C) |
| :-- | :-- | :-- |
| güç | `train × adet` (`sub_4120a8`) | `[+0xc] × bütünlük(+0x78)` (`sub_412da4`) |
| mitigasyon | `stat × adet` (`sub_4121d4`) | `stat × bütünlük` (`sub_412c4c`) |
| kayıp | `adet -= net/mDef` (`sub_412148`) | `bütünlük -= net/mDef` (`sub_412db8`) |

`sub_412C2C` bütünlüğü seviyeden başlatıyor (`+0x78 = seviye`), `sub_412db8` de tıpkı `sub_412148` gibi
kırpıyor (yıkılışta `mDef × kalan` döner). Ekranda `bütünlük/seviye` yüzdesi yazılıyor.

**Karar: binary'nin mekanizması benimsendi, benim uydurduğum "baskı/kapasite" formülü ATILDI.** Gerekçe:
mevcut hasar yoluna hiç yeni mekanizma eklemiyor, bütünlük ve % doğal olarak çıkıyor, korumayı da doğru
yerden veriyor — **sur P paydasında yer tutup gelen hasarın bir kısmını üstüne çekiyor**; yıkılınca o pay
askerlere dönüyor. Bu, dokümandaki *"Sur yıkılmadığı sürece savaşçılara çok önemli bir koruma görevi
üstlenir"* cümlesinin mekanik karşılığı.

**Tek sapma = BÜYÜKLÜK.** Binary'nin taban değerleriyle (train 300/sv, mDef 600) sur, büyük savaşta P'nin
~%0,4'ü kadar kalıp ilk fazda yok oluyor — pratikte işlevsiz. Seviye maliyeti geometrik büyüdüğü için:
`güç = 2500 × √seviye × bütünlük` (toplam ≈ seviye^1.5), `bölücü = 12000` (bütünlük puanı başına, yani
dayanma kapasitesi seviyeyle **lineer** — yüksek sur çok emer ama sonsuz değil). Taş Ustalığı ikisini de
%6/seviye artırır. Sur her fazda vurulur (büyü dahil, binary'deki gibi).

Ölçüm (1500 cüce + 800 elf → 2600 cüce savunma): sur yokken savunan 1898 kaybediyor; sv3 → 1593,
sv6 → 1279, sv12 → 729; her senaryoda sur yıkılıyor (%0) ve saldıranın kaybı 1315 → 1978'e çıkıyor.
Referans büyük savaşta sv3 sur ~%4 fayda sağlayıp yıkılıyor (binary: %0.0 ✓).

### [K] Büyü Kalkanı — artık işlevsel
Binary'de bu yapı savaşta **hiçbir şey yapmıyordu** (Can=BüyüCan=0, özel dalı yok). v0.6:
- Büyü fazında gelen hasarı `min(%60, %5 × etkinSeviye)` kadar azaltır; `etkinSeviye = seviye × (1+%5×Büyücülük)`.
- **Saldıranın Şamanları kalkanı deler** (doküman: *"Şamanlar düşmanın Büyü Kalkanı'na karşı da etkilidir"*):
  her 50×seviye Şaman etkiyi yarıya indirir.
- Ölçüm: 30 Ejderha → 5000 Cüce; kalkansız 1291 kayıp, sv8'de 816, sv16'da 618. 300 Şaman'lı saldırgan
  aynı sv8 kalkana karşı 1180 (kalkansız 1528) → kalkan delinmiş oluyor.

### [Z] Tuzak = tek kullanımlık salvo
- Savaş başında (Tur 1, ordu şehre yaklaşırken) **yalnız yer birimlerine** (Pegasus/Ejderha/Casus hariç) vurur.
- Tetiklenme: doygunluk × **%75-99 rastgele** → doküman notundaki *"tuzak varsa sonuç değişkenlik gösterir"*
  ifadesinin mantıklı karşılığı.
- Ayak altında patlayan tuzağa zırh işlemez → **mitigasyon uygulanmaz**, yalnız dayanıklılık böler.
- Tetiklenen tuzak **tükenir ve onarılmaz**. Sonuç: aynı savaş tekrarlandığında kalan tuzak 300'den
  **5-67** arası çıkıyor (binary 2-28, eski motor sabit 262).

### [G] Gnom = sabotajcı (savaş hattında değil)
- Saldırandaki her Gnom ortalama **1.5 tuzağı** patlatmadan etkisiz bırakır (±%30).
- Savunma **yapılarının** vuruş gücünü `min(%35, gnom/(yapı×4))` kadar düşürür (savaşçılar etkilenmez).
- Gnom artık ne saldırı havuzuna girer ne hasar payı alır; ordusu **kaybederse** (Yük Arabası gibi)
  savaş sonrası ele geçirilir.
  > Neden böyle: v0.5'te gnom P paydasına giriyor ama hiç kayıp almıyordu → **"ölümsüz hasar süngeri"**;
  > orduya bedava gnom eklemek herkesin kaybını düşürüyordu (sömürülebilir). Onu normal savaşçı yapmayı
  > da denedim: `train 25 / mDef 260` oranıyla her büyük savaşta **tamamen siliniyordu** (1600 altınlık
  > birim için anlamsız). Doküman zaten onu bir teknisyen olarak tanımlıyor → hattın dışında, katkısı
  > yalnızca sabotaj. Ölçüm: 2000 cüce + 400 gnom → 200 muhafıza karşı cüce kaybı 1513 → 782.
- Binary'nin **Tur1 "gnom kıyımı" skirmish'i emekliye ayrıldı** (`global.__TUR1_GNOM` ile arşiv amaçlı
  açılabilir): dokümanda karşılığı yoktu, lossMag'i şişirip kazananı ters çevirebiliyordu (T11).

### [O] Savaş sonrası onarım = %50-70, **rastgele**
Doküman: *"zarar gören savunma üniteleri %50-70 arası bir oranda yenilenir."* v0.5'te binary ölçümünden
gelen sabit %78 vardı → aynı ordular her zaman aynı sayıyı bırakıyordu. Artık her yapı türü için
**bağımsız rulo**. Aynı savaşın 20 tekrarında: Okçu Kulesi 83-101, Kazancı 77-90, Mangonel 41-47,
Muhafız 23-27, Balista 14-16 (tuzak ayrı, yukarıda). **Kullanıcının istediği dalgalanma sağlandı.**

### [Ş] Şaman kalkanı Büyücülük'e bağlandı
Kalkan artık her fazda BüyüCan ölçeğinde okunuyor → yalnız Büyücülük büyütüyor (doküman).

### [H] Kahraman çıkma ihtimali
Binary: `Tapınak×10 − Kahraman×155` → 2 kahramandan sonra ihtimal **matematiksel olarak imkânsız**
oluyordu; oysa doküman 5 kahramana kadar çıkabileceğini söylüyor. Çarpımsal cezaya çevrildi:
`Tapınak×10 × (5−K)/5`. Tapınak 10 / büyük savaş için: 0 kahraman %100 → 4 kahraman %20 → 5'te 0.
Dokümanın diğer üç koşulu (savaşın büyüklüğü ve orduların denkliği) zaten XP çarpanında var:
`XP = (aLM+dLM) × (kazananKaybı/kaybedenKaybı) × 0.001` — denk ordularda oran 1'e yaklaşır, ezici
savaşta 0'a gider. Yani formül dokümandaki dört faktörü de içeriyor.

### Yük Arabası / Casus Kuş
Savaşmadıkları için artık **güç havuzuna (P) da girmiyorlar** — aksi halde arkada duran arabalar hasarı
seyreltip orduyu koruyordu. Kaybeden tarafın arabaları ganimet olarak gidiyor; **Casus Kuş uçarak kaçar**
(hiçbir koşulda kayıp vermez — orijinal simülatörle de uyumlu).

---

## 5. Referans savaş: v0.5.5 → v0.6 karşılaştırması

`savas_testleri.txt` senaryosu (tüm teknikler 0, kahraman yok; savunmada 129 okçu, 300 tuzak, 111 kazancı,
60 mangonel, 33 muhafız, 3 sv sur):

| | binary orij | v0.5.5 motor | **v0.6 motor** |
| :-- | :-- | :-- | :-- |
| kazanan | saldıran | saldıran | **saldıran ✓** |
| tur | 5 | 5 | **5 ✓** |
| saldıran kaybı | 1595-1646 | 1805-1808 | **1963-2028** |
| savunan kaybı | 4050-4114 | 3520-3529 | **3879-3964** |
| enkaz altın | 2.483.188 | 2.403.310 | **2.695.115-2.706.833** |
| XP | 2179-2251 | 2816-2828 | **2854-3010** |
| kalan tuzak | 2-28 | 262 (sabit) | **12-67** ✓ |
| sur | %0.0 | "2" (hatalı) | **%0.0** ✓ |

Saldıranın kaybının artması bilinçli: sur artık gerçekten koruyor (~%12 fiziksel kesinti), tuzaklar
gerçekten vuruyor (~100 kayıp), arabalar artık hasarı seyreltmiyor. **Yapı senaryoları (11 referans savaş)
regresyona uğramadı: kazanan 11/11, tur 11/11, saldıran kaybı ±%3.**

### Ayar düğmeleri (hepsi `global.__X` ile override edilebilir)
`__SUR {power:2500, tough:12000, exp:0.5}` · `__MSHIELD {perLevel:0.05, max:0.60, samanPerLevel:50}` ·
`__TRAP {triggerMin:0.75, triggerMax:0.99, perGroundUnit:0.2, gnomDisarm:1.5, power:1}` ·
`__GNOM_SAB {perStruct:4, max:0.35}` · `__STRUCT_KEEP` (sabit onarıma dönmek için).
En hassas düğme sur: `tough`'u 25000 yapmak sv12 suru kırılmaz kaleye çeviriyor (savunan neredeyse
sıfır kayıpla kazanıyor); 12000'de sur her ciddi savaşta düşüyor ve etkisi kademeli kalıyor.

---

## 6. Sırada ne var (öneri / kontrol listesi)

0. **Kuşatma bonusu (yeni öneri, dokümandan):** Mancınık — *"düşman şehrinin direncini kırarak"*,
   Ogre — *"savunma yapılarına karşı da son derece etkilidir"*. Şu an bu birimlerin sura/yapılara karşı
   özel bir üstünlüğü YOK. Sur güçlendikçe "kuşatma birimi getir" stratejisinin karşılığı olmalı:
   surun aldığı payı saldırandaki mancınık/ogre oranına göre artıran bir çarpan önerilir. Yeni sistemin
   planına dahil edilecek.

1. **`packages/engine` TS portu v0.5.5'te kalmış** — v0.6 mekanikleri ve kahraman modeli orada yok.
   Rebuild bu portu tek doğruluk kaynağı sayacağı için güncellenmeli (stat alan adları da §0'a göre
   yeniden adlandırılarak).
2. **Sur'un büyü fazına etkisi yok** — Büyü Kalkanı bunu karşılıyor; ikisinin birlikte davranışı
   büyük savaşlarda ayrıca test edilmeli.
3. **Kahraman ince ayarı** (yüksek fizSald ofansı ~%25 düşük, iki taraflı kahraman) v0.5'ten devrediyor.
4. **Mağara / cüce-mağara yıkma**, casusluk formülü, puanlama gibi savaş-dışı doküman kuralları motorda yok
   (rebuild kapsamı).
