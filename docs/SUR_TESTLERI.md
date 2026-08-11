# SUR — motor ile binary neden ayrışıyor (2026-08-12)

Tetikleyen ölçüm: kullanıcının rastgele kurduğu büyük savaş. **Savaşın geri kalanı tuttu, tek
sapan Sur.**

| | binary | motor | fark |
|---|---:|---:|---:|
| saldıran kaybı | 25.629 | 25.654 | +%0,10 |
| savunan kaybı | 18.408 | 18.310 | −%0,53 |
| enkaz (altın) | 66.382.961 | 66.239.897 | −%0,22 |
| kahraman XP | 26.809 | 26.414 | −%1,5 |
| kahraman çıkma | %33,51 | %33,05 | ✓ |
| **Sur sv10** | **%53,59** | **%100** | ⛔ |

### Seviye taraması — eğri ~6 seviye kaymış

| sv | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **motor** | 0 | 32,1 | 66,0 | 82,9 | 90,9 | 95,3 | 98,4 | **100** | **100** |
| **binary** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **15,19** | **53,59** |

---

## 1. Formül YANLIŞ DEĞİL — Ghidra'da satır satır doğrulandı

Sapmayı formülde aramak boşuna; zincirin tamamı okundu ve motorla **birebir** aynı:

| binary | ne yapıyor | motor karşılığı |
|---|---|---|
| `FUN_00413610` | `(int)( 1,8^Sv × [obj+0xc] × durum × C )` — `[obj+0xc]` **Alan**, `FILD` ile int okunuyor | `gradePower` ✅ |
| `FUN_0041338c` | `stat × Sv × 1,8^Sv × durum × C`; dağıtıcı 3=pAtk · 4=pDef · 5=mAtk · 6=mDef | `gradeStat` ✅ |
| `FUN_0040e0c4` @0x40e628 | `net = güç × havuz/P − gradeStat(pAtk)` · `düşüş = net / gradeStat(mDef)` | `gradeTakeHit` ✅ |
| `FUN_00413534` | `durum -= 100 × düşüş`, 0'ın altında kırpar | ✅ |

`1,8` sabiti de birebir: `0x3FFCCCCCCCCCCCCD`.

### ⭐⭐ Bunun sonucu: `1,8^Sv` ve `durum` SADELEŞİYOR

Hem pay hem payda `Sv × 1,8^Sv × durum` taşıdığı için faz başına düşüş şuna iniyor:

```
        düşüş  =  100 × (Alan/mDef) × (havuz/P) / Sv   −   100 × (pAtk_ölçekli/mDef)
```

⇒ Sur'un davranışını **yalnız iki oran** belirliyor: `Alan/mDef` ve `pAtk_ölçekli/mDef`.
Başka hiçbir şey — seviye üssü bile — girmiyor.

**Ölçülerek doğrulandı:** `cfg.wall.base` 1,5 · 1,8 · 2,5 yapıldığında Sur bütünlüğü
82,90 · 82,94 · 83,08 çıkıyor — yani ⚠️ **`wall.base` Sur'un yıpranmasında ÖLÜ BİR DÜĞME.**
(Yalnız Sur'un P'ye kattığı güç üzerinden birim kayıplarını dolaylı oynatıyor.)

---

## 2. ⚠️ Taş Ustalığı sorumlu mu? — KISMEN, ama tek başına açıklamıyor

Kullanıcının sorusu. Ölçtüm: aynı savaşta Taş Ustalığı'nı **0** yapınca

| sv | TU 0 | TU 17 | binary |
|---:|---:|---:|---:|
| 7 | 87,83 | 98,38 | **0** |
| 8 | 91,57 | 100,00 | **15,19** |
| 10 | 95,76 | 100,00 | **53,59** |

⭐ Taş Ustalığı ~10 puanlık pay taşıyor (formüldeki ikinci terimi büyütüyor) ama açık **~88
puan**. Yani sezgi doğru yönde, sebep değil.

---

## 3. ⭐⭐⭐ Gerçek sebep: Sur'un STATLARI

Formül doğru + `base` etkisiz ⇒ geriye tek olasılık kalıyor. Ve Sur, katalogdaki **belgelenmiş
kaynağı olmayan tek satır**:

```
d('wall', 'Sur', 2,  hp 0, mhp 0, carry 0, pAtk 50, pDef 50, mAtk 0, mDef 600, area 300)
```

⚠️ Diğer bütün birimlerin statları ölçülmüş/doğrulanmış sayılar (Okçu Kulesi 12/6/19/325/24,
Mangonel Kulesi 192/96/120/3744/257 …). Sur'unkiler **yuvarlak ve kaynaksız**: 50/50/600/300.
`units.ts`teki yorum da yalnız FİYATIN değiştiğini anlatıyor, statların nereden geldiğini değil.

**Sayısal uyum araması** (binary'nin üç çapasına: sv7=0 · sv8=15,19 · sv10=53,59):

| | bugün | uyum |
|---|---:|---:|
| `Alan / mDef` | **0,500** | **≈ 2,5** (5 kat) |
| `pAtk_ölçekli / mDef` | 0,168 | ≈ 0,20 |

⚠️ **Bu bir UYDURMA (fit), okuma değil — o yüzden kataloğa YAZILMADI.** İki serbest parametreyi
üç çapaya oturtmak, geçen turların dersine göre yeterli kanıt değil. Aşağıdaki set ikisini
**birbirinden ayırarak** ölçer.

⭐ Bir gözlem: `Alan/mDef` oranı oyundaki **her** birimde 0,05-0,07 bandında (Cüce 0,049 ·
Ejderha 0,058 · Balista 0,054 · Mangonel Kulesi 0,069). Sur'un **0,5**'i bandın 10 katı, aranan
**2,5** ise 50 katı — yani Sur zaten bu ailenin dışında ve oranı doğrudan ölçmek şart.

---

## 4. ÖLÇÜM SETİ — iki oranı BİRBİRİNDEN AYIRIR

⭐ Anahtar, gece setindeki numaranın aynısı: **2 turluk savaş**. Tur 2'nin fazları
`[menzilli, büyü]` ve Sur yalnız menzilli fazda hatta → savaş 2 turda biterse Sur **tek bir
düşüş** alır. O zaman `Sur% = 100 − düşüş` ve formül doğrudan tersine çevrilebilir.

> **Kurulum: Saldıran 300 Mancınık · Savunan 27.000 Elf + Sur N · GÜNDÜZ ·
> tüm teknikler 0 (A grubunda) · kahraman/tapınak yok · Büyü Kalkanı yok.**

⚠️ Her satırda **tur sayısını da yaz.** Tur 2'den çıkarsa o satır geçersizdir.

### A · Seviye taraması → `Alan/mDef`yi verir

Düşüş `1/Sv` ile doğrusal olmalı; eğim doğrudan `Alan/mDef` oranıdır.

| # | Sur sv | motor: tur | motor: Sur% | motor: düşüş | **gerçek: tur** | **gerçek: Sur%** |
|---|---:|---:|---:|---:|---|---|
| A1 | 2 | 2 | 73,72 | 26,28 | | |
| A2 | 3 | 2 | 85,31 | 14,69 | | |
| A3 | 4 | 2 | 91,15 | 8,85 | | |
| A4 | 5 | 2 | 94,69 | 5,31 | | |
| A5 | 6 | 2 | 97,12 | 2,88 | | |
| A6 | 8 | 2 | **100,00** | 0 | | |
| A7 | 10 | 2 | **100,00** | 0 | | |
| A8 | 12 | 2 | **100,00** | 0 | | |

**Nasıl okunur:** düşüşleri `1/Sv`ye karşı çiz — düz bir doğru çıkmalı. Motorun doğrusu
A1→A5'te eğim ~52; binary'nin eğimi **5 kat büyükse** `Alan/mDef` 2,5 demektir. ⭐ Ayrıca
**Sur'un yıpranmayı bıraktığı seviye** (motorda 8) binary'de kaçta? O tek sayı bile oranı verir.

### B · Taş Ustalığı taraması → `pAtk/mDef`yi verir

Sur **sv4** sabit, yalnız Taş Ustalığı değişiyor. Formülün ikinci terimi doğrusal, yani
Sur% ile TU arasında **düz bir doğru** beklenir; eğim `100 × pAtk × 0,06 / mDef`.

| # | Taş Ustalığı | motor: tur | motor: Sur% | **gerçek: tur** | **gerçek: Sur%** |
|---|---:|---:|---:|---|---|
| B1 | 0 | 2 | 91,15 | | |
| B2 | 5 | 2 | 93,65 | | |
| B3 | 10 | 2 | 96,15 | | |
| B4 | 17 | 2 | 99,65 | | |
| B5 | 20 | 2 | **100,00** | | |

**Nasıl okunur:**

| Gözlem | Sonuç |
|---|---|
| Doğru, motordakiyle **aynı eğimde** | ✅ `pAtk/mDef` doğru; hata yalnız `Alan/mDef`de |
| Doğru daha **yatık** | `pAtk/mDef` küçük — Sur'un pAtk'i ya da Taş Ustalığı oranı farklı |
| Sur% Taş Ustalığı'ndan **hiç etkilenmiyor** | ⭐ Taş Ustalığı Sur'un mitigasyonuna işlemiyor → ikinci terim tamamen farklı bir stattan geliyor |

⚠️ B grubu tek başına da değerli: dokümanın *"Taş Ustalığı: Okçu Kulesi, Mangonel, Balista,
**Sur**"* ifadesini doğrudan sınıyor — ve o doküman listelerinin süzgeç değil betimleme olduğu
bu projede **dört kez** yakalandı (`docs/TILSIM_SUZGEC_TESTLERI.md` §2).

---

## 5. Neden şimdi değiştirmedim

`packages/catalog/src/units.ts`teki Sur satırı **olduğu gibi duruyor**. Gerekçe geçen turunkiyle
aynı: iki serbest parametreyi üç çapaya oturtan bir uydurma, savunma dengesini değiştirmek için
yeterli kanıt değil. Yukarıdaki set iki oranı **ayrı ayrı** ölçüyor; geldiğinde stat satırı
ölçümle yazılır ve `catalogHash` bilerek kayar.

⚠️ Bu arada Sur, motorda **olması gerekenden çok daha dayanıklı**: sv8+ hiç yıpranmıyor.
Canlı dengede surun bedava bir kalkan gibi davrandığını akılda tut.
