# ŞAMAN ↔ BÜYÜ KALKANI — BİNARY SİMÜLATÖR DOĞRULAMA SETİ

Üretim: 2026-08-11 · motor karşılığı: `packages/engine/test/shaman-vs-shield.test.ts` (10 test, yeşil)

## Test edilen iddia

`docs/referans/tekniklere_ve_yapilara_iliskin_on_bilgiler.txt:477`, Şaman açıklaması:

> *"Şamanlar düşmanın **Büyü Kalkanı'na karşı** da etkilidir."*

**Motor bu cümleyi desteklemiyor.** Bu set onu ölçümle karara bağlamak için.

### Motorun bugünkü modeli (çürütülmek üzere ortaya konuyor)

```
ŞAMAN = atkSub. SAVUNAN tarafın Şamanı, KENDİSİNİ VURAN havuzdan ham stat çıkarır:
    havuz -= şamanStat × adet          (faz 1-2 → Can 200 · faz 3 → BüyüCan 200)
Kalkana özel bir dalı YOKTUR. Kalkan zaten AYNI tarafın savunma nesnesidir.

KALKAN = güç × havuz/P − mitigasyon. Havuzu değiştirmez; P paydasında yer tutup payı
üstüne çeker, sonra kendi mitigasyonuyla yutar.

⇒ İkisi AYNI tarafta çalışan İKİ AYRI savunma. Savunanın Şamanı kalkanı KORUR
  (havuz küçülür → kalkana düşen pay azalır).
```

⚠️ Saldıranın Şamanının kalkana **dolaylı** bir etkisi var (A grubu): savunanın karşı vuruşunu
emip saldıranı hayatta tutuyor, o da daha çok vuruş yapıyor. Ama bu **kalkana özel değil** —
savunanın birlikleri de aynı oranda, hatta daha fazla zarar görüyor.

## Nasıl kullanılır

Her satırı simülatöre gir, **Savaştır**'a bas, sonucu **gerçek** sütunlarına yaz.

Aksi belirtilmedikçe: **tüm teknikler 0 · kahraman yok · gece kapalı · Sur 0 ·
saldıranın savunma yapısı yok.**

⚠️ Simülatör ±%0,1 rastgelelik uyguluyor ve savunmada tuzak varken sapma çok artıyor
(referans doküman, satır 529) — bu sette **tuzak yok**. Yine de **her satırı 2-3 kez koş**;
motor tahminleri 8 seed ortalamasıdır.

> **Kalkan %** = simülatörün Büyü Kalkanı satırındaki yüzde.

---

## A · Saldıranın Şamanının kalkana ÖZEL etkisi var mı?

⭐⭐ **Setin en kritik grubu** — ve motoru yazarken ilk varsayımım burada **yanlış çıktı**, o
yüzden dikkatli kurgulandı.

Motor şunu söylüyor: saldıranın Şamanı kalkanın daha çok yıpranmasına **yol açıyor**, ama
kalkanı hedef aldığı için değil — savunanın karşı vuruşunu emip **saldıranı hayatta tuttuğu**
için. Kanıtı: Şamansız saldıranın **tamamı ölüyor**, Şamanla sağ kalıp sonraki turlarda vurmaya
devam ediyor. Aynı sebeple **savunanın birlikleri de** kat kat fazla kayıp veriyor.

Hepsinde savunan: **60 Ejderha + Büyü Kalkanı sv3**.

| # | Saldıran | motor: Kalkan % | motor: savunan kaybı | motor: saldıran kaybı | **gerçek: Kalkan %** | **gerçek: sav. kaybı** | **gerçek: sal. kaybı** |
|---|---|---:|---:|---:|---|---|---|
| A1 | 30 Ejderha | 100,00 | 6 | 30 (hepsi) | | | |
| A2 | 30 Ejderha + **500 Şaman** | **100,00** | 21 | 61 | | | |
| A3 | 40 Ejderha | 86,76 | 12 | 40 (hepsi) | | | |
| A4 | 40 Ejderha + **500 Şaman** | **0,00** | 39 | 25 | | | |
| A5 | 50 Ejderha | 2,45 | 24 | 50 (hepsi) | | | |
| A6 | 50 Ejderha + **500 Şaman** | **0,00** | 58 | 14 | | | |

⭐ **A7 — KONTROL DENEYİ. Bu satır olmadan set karar veremez.**

Yük Arabası da orduyu büyütür ve hasarın bir kısmını üstüne çeker, ama savunanın havuzuna
**dokunmaz** (`Can = BüyüCan = 0`). Motor kalkanın **birebir aynı** kalacağını söylüyor.

| # | Saldıran | motor: Kalkan % | motor: savunan kaybı | **gerçek: Kalkan %** | **gerçek: sav. kaybı** |
|---|---|---:|---:|---|---|
| A7 | 50 Ejderha + **500 Yük Arabası** | **2,45 (A5 ile BİREBİR)** | **24 (A5 ile aynı)** | | |

### Nasıl okunur

| Gözlem | Sonuç |
|---|---|
| A4/A6'da kalkan düşüyor **ve** savunan kaybı da kat kat artıyor | Etki **genel**, kalkana özel değil → doküman yanlış |
| A4/A6'da kalkan düşüyor ama savunan kaybı **aynı kalıyor** | Etki **kalkana özel** → doküman haklı, motorda mekanizma eksik |
| A2'de kalkan %100'ün altına iniyor | ⭐ Şaman kalkanda **gedik açıyor** → doküman haklı; 30 Ejderha kalkanı tek başına hiç kıramıyor |
| A7'de kalkan A5'ten farklı çıkıyor | Etkinin kaynağı Şaman değil **ordu büyüklüğü** → motorun kanal açıklaması yanlış |

⚠️ **En bilgilendirici tek satır A2.** Orada saldıran kalkanı zaten kıramıyor; Şaman kalkanı
**yine de** düşürüyorsa bu ancak doğrudan bir etkileşimle açıklanabilir.

## B · Savunanın Şamanı kendi kalkanını koruyor mu? (ters yön)

Motor: evet, koruyor. Bu grup aynı zamanda A grubunun kontrolü — Şamanın gerçekten
çalıştığını, yalnız iddia edilen kanaldan çalışmadığını gösteriyor.

| # | Saldıran | Savunan | motor: Kalkan % | **gerçek: Kalkan %** |
|---|---|---|---|---|
| B1 | 85 Ejderha | 60 Ejderha + Kalkan sv1 | 0,00 | |
| B2 | 85 Ejderha | 60 Ejderha + **400 Şaman** + Kalkan sv1 | 0,28 | |
| B3 | 85 Ejderha | 60 Ejderha + **650 Şaman** + Kalkan sv1 | 48,92 | |

⭐ **B4 — tam sıfırlama noktası.** Ejderha `BüyüCan` 2800, Şaman `BüyüCan` 200:
`65 × 2800 = 182.000` ve `910 × 200 = 182.000` → faz-3 havuzu **tam sıfır** olmalı.

| # | Saldıran | Savunan | motor: Kalkan % | **gerçek: Kalkan %** |
|---|---|---|---|---|
| B4 | 65 Ejderha | 60 Ejderha + **910 Şaman** + Kalkan sv1 | **100,00** | |
| B5 | 65 Ejderha | 60 Ejderha + **650 Şaman** + Kalkan sv1 | 96,18 | |

⚠️ B4 %100 çıkmazsa çıkarma ham (katsayı 1,0) değil demektir — 2026-07-29'da ölçülen
`ŞAMAN KATSAYISI = 1,0` bulgusu tekrar açılır.

---

## C · Şaman kalkandan bağımsız mı? (mekanizma testi)

İddia «kalkana karşı» ise, kalkan **hiç yokken** Şamanın rolü farklı olmalı. Motor: aynı.

| # | Saldıran | Savunan | motor: savunan kaybı | **gerçek: savunan kaybı** |
|---|---|---|---:|---|
| C1 | 85 Ejderha | 60 Ejderha | 60 (tamamı) | |
| C2 | 85 Ejderha | 60 Ejderha + **650 Şaman** | **41** | |

⭐ **C3/C4 — asıl ayrım.** Cüce **büyü kullanmaz** (faz 1-2) ve kalkan fiziksel fazlarda
**hatta değildir**. Şaman burada da emiyorsa, «büyü karşıtı» değil **genel havuz emicisi**dir.

| # | Saldıran | Savunan | motor: savunan kaybı | **gerçek: savunan kaybı** |
|---|---|---|---:|---|
| C3 | 3000 Cüce | 400 Elf | 400 (tamamı) | |
| C4 | 3000 Cüce | 400 Elf + **650 Şaman** | **253** | |

**Nasıl okunur:** C4 < C3 ise Şaman fiziksel saldırıyı da emiyor ⇒ mekanizma büyüye/kalkana
özel değil. C4 = C3 ise Şaman gerçekten yalnız büyü fazında çalışıyor ve dokümanın cümlesi
**kısmen** haklı olabilir — o zaman A grubu belirleyici olur.

---

## D · Kalkanı hangi teknik büyütüyor? (ikinci doküman iddiası)

`…on_bilgiler.txt:573` Büyücülüğü Büyü Kalkanı ile birlikte sayıyor. 2026-07-29'da çürütülmüştü
(Büyücülük yalnız `magicHp` ölçekler, kalkanınki 0; kalkanı **Tılsım** büyütür). Burada tekrar
sınanıyor çünkü **iki iddia aynı karışıklığın iki yüzü**.

Hepsinde: saldıran **50 Ejderha**, savunan **60 Ejderha + Kalkan sv3**.

| # | Savunanın tekniği | motor: Kalkan % | **gerçek: Kalkan %** |
|---|---|---|---|
| D1 | yok | 2,45 | |
| D2 | **Tılsım 6** | **100,00** | |
| D3 | **Büyücülük 6** | 3,72 | |

⚠️ D3'ün tam olarak D1'e eşit **olmaması** beklenen: savunanın Ejderhalarının büyü vuruşu
büyüyor, saldıran daha erken eriyor, sonraki turlarda gelen havuz küçülüyor. Yani etki
**dolaylı**. Ayıran ölçü **büyüklük**: Tılsım ~98 puan, Büyücülük ~1 puan.

⭐ **D4 — Büyücülüğün gerçek kanalı.** Savunmaya Şaman eklenince Büyücülük kalkanı belirgin
kurtarıyor; çünkü Şamanın BüyüCan'ını büyütüyor.

| # | Saldıran | Savunan | motor: Kalkan % | **gerçek: Kalkan %** |
|---|---|---|---|---|
| D4a | 80 Ejderha | 60 Ejderha + 300 Şaman + Kalkan sv3 | 0,00 | |
| D4b | 80 Ejderha | aynısı + **Büyücülük 6** | **21,91** | |

---

## Sonuç bölümü (ölçümden sonra doldurulacak)

| Grup | Motor ne diyor | Ölçüm ne dedi | Karar |
|---|---|---|---|
| A | Saldıran Şamanının etkisi var ama **kalkana özel değil**; kanal = saldıranın hayatta kalması (kontrol: A7) | | |
| B | Savunan Şamanı kalkanı korur | | |
| C | Şaman kalkandan bağımsız, fiziksel fazda da emer | | |
| D | Kalkanı Tılsım büyütür, Büyücülük değil | | |

**Nihai karar:**

- [ ] Doküman **yanlış** → `on_bilgiler.txt:477` çürütülenler listesine eklenir
      (`mobiwar-verified-formulas` hafızası + `JAVA_ROENTGEN.md` §3 güvenilirlik notu).
- [ ] Doküman **haklı** → motora Şaman↔Kalkan etkileşimi eklenir, `shaman-vs-shield.test.ts`
      beklentileri tersine çevrilir ve `magic-shield.test.ts` altın seti yeniden koşulur.
- [ ] **Kısmen** → hangi kanalın gerçek olduğu yazılır, model ona göre daraltılır.

---

## ⚠️ Ölçüm disiplini (geçen turun pahalı dersi)

2026-07-29'da tek bir **yanlış okunmuş** ölçüm (D4) saatlerce hipotez üretimine yol açtı ve
sonunda ölçümün kendisi hatalı çıktı. Kural:

> **Sapan tek bir ölçüm için mekanizma aramadan ÖNCE o ölçümü tekrarlat** — özellikle komşu
> senaryolar tutuyorsa.

Bu sette A grubu tam da öyle bir yer: A2 ile A1 arasında **küçük** bir fark görürsen, önce
ikisini de yeniden koş. Gerçek bir mekanizma farkı küçük olmaz — Şaman havuzdan **ham stat ×
adet** çıkarır, yani 500 Şamanın etkisi görünürse **100.000 birimlik** bir etki olarak görünür.
