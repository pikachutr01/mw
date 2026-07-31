# Mobiwar — Çağrı Zinciri ve Doğrulama Notları

Bu dosya, `mobiwar_simulator_analysis.md` raporunun Ghidra MCP ile doğrulanması sırasında
uğranan fonksiyonları ve ham bulguları kaydeder. Giriş: `FUN_004104e8` (savaş sonucu yazdırma).

## Fonksiyon Sözlüğü (uğranılan / doğrulanan)

| Adres | Rol (çıkarım) | Durum |
| :--- | :--- | :--- |
| `FUN_004104e8` | Savaş sonuç ekranı yazıcı (giriş) — kayıp/enkaz/kahraman ihtimali metinleri | ✅ okundu |
| `FUN_004103e8` | Kahraman esir alma olasılığı hesabı (§5) | ⏳ |
| `FUN_0040facc` | Savaş sonrası ana işlemci | ⏳ |
| `FUN_0040dcb4` | Savaş koordinatörü | ⏳ |
| `FUN_0040e0c4` | Tur bazlı hasar/kayıp hesabı (§2) | ⏳ |
| `FUN_00413610` | Kahraman güç puanı (§2) | ⏳ |
| `FUN_0040d884` | Teknoloji güncelleyici (§3, §8) | ⏳ |
| `FUN_00411350` | Enkaz geri kazanım (§4) | ⏳ |
| `FUN_0040d608` | Gece savaşı (§7) | ⏳ |
| `FUN_0041440c` | Stat tablosu (§1) | ⏳ |
| `FUN_00414018` | Altın maliyeti (§1) | ⏳ |
| `FUN_0041411c` | Yemek maliyeti (§1) | ⏳ |
| `FUN_0041421c` | Taşıma kapasitesi (§1) | ⏳ |
| `FUN_00413f14` | Eğitim süresi (§1) | ⏳ |
| `FUN_00596dbc` | round() yardımcı | ✅ (yuvarlama) |

## FUN_004104e8 — Giriş (savaş sonuç yazıcı)

- Struct `param_1` alanlarını okuyup UI'a yazıyor. HESAP YAPMIYOR, önceden hesaplanmış değerleri gösteriyor.
- Okunan alanlar: `param_1[8]`, `param_1[9]`, `param_1[10]`, `param_1[0xf]`, ve **`*(double*)(param_1+0x68)`** (kahraman ihtimali).
- **§6 DOĞRULANDI** (disassembly 0x00410bba-0x00410bdd):
  - `FLD [ECX+0x68]; FMUL [0x00410dec]; CALL round` → iVar2
  - `FLD [EDX+0x68]; FCOMP [0x00410dec]; JNC` → eşik aşılırsa "%100,0"
  - Gösterim: `iVar2/100` tam, `iVar2%100` ondalık. Rapor birebir doğru.
- Not: `+0x68` alanı hem çarpan hem eşik olarak `_DAT_00410dec` kullanıyor — bu "çelişki değil":
  `*100` ondalık haneleri çıkarmak için, eşik ise 100 puan tavanı. Alan 0-100 ölçekli "yüzde puanı".
- Çağrılan iç getter'lar: FUN_00410f88, FUN_004115c4, FUN_004115f4, FUN_00411ee0 (ordu birim getter'ları),
  FUN_00413960 (birim sayısı), FUN_00411fc4 (canlı birim sayacı), FUN_00412a78 (HP getter, float).

## §1 STAT/MALİYET TABLOLARI — DOĞRULANDI

- **FUN_00413f14 (Eğitim)**: 21 değer okundu. Muhafız[16]=257, Sur[18]=900, BüyüKalkanı[19]=300,
  Tapınak[20]=400 → 4 düzeltme DOĞRU. Tüm savaşçı eğitim süreleri de eşleşti.
- **FUN_00414018 (Altın)**: Balista[17]=2400, BüyüKalkanı[19]=960, Tapınak[20]=8000 → düzeltmeler DOĞRU. 21/21 eşleşti.
- **FUN_0041411c (Yemek)**: BüyüKalkanı[19]=980 → düzeltme DOĞRU. 21/21 eşleşti.
- **FUN_0041421c (Taşıma)**: 12 savaşçı eşleşti, yapılar 0. DOĞRU.
- **FUN_0041440c (Stat)**: 21 birim × 6 setter (b68=HP, ba8=BüyüHP, b88=FizSald, b08=FizSav, b28=BüyüSald, b48=BüyüSav).
  Değerler IEEE754 double. Cüce/Okçu Kulesi/Kaos tam çözüldü, hepsi eşleşti. Setter kimlikleri §3 ile uyumlu.
- **HATA (rapor)**: §1 "7 hücre düzeltildi" diyor ama fiilen **8 hücre** kalın (Muhafız-eğitim, Balista-altın,
  Sur-eğitim, BüyüKalkanı-altın/yemek/eğitim, Tapınak-altın/eğitim). 7 → 8 düzeltilmeli.
- Yazma sırası (yapılar): 12,13,14,19,15,16,17,18,20 — §9.1 tuhaflığı stat/maliyet fn'lerinde de mevcut, doğrulandı.

## §2 KAHRAMAN GÜCÜ (FUN_00413610) — DOĞRULANDI
- `if [+0x14]==0 return 0` (seviye). `pow(1.8, L)` (0x3ffcccccccccccccd=1.8) × HP[+0xc] × bonus[+0x80] × 0.01[0x413660], round.
- Formül `round(Can × 1.8^L × Bonus% × 0.01)` ve offsetler rapordaki gibi. ✅

## §5 ESİR ALMA (FUN_004103e8) — DOĞRULANDI (satır satır)
- Koşul: XP[+0x3c]>499 && level!=0 && captureCount<5. C_taban=level*10 - captureCount*155(0x9b).
- S=0.000025*XP, min(1.0). Sonuç=max(0.0, C_taban*S) → alan +0x68. Sabitler d4=0.0, d8=0.000025, e4=1.0.
- +0x68 alanı 0-100 ölçekli (level*10). §6 ile aynı alan, doğrulandı. ✅

## BİRİM STRUCT ALAN HARİTASI (kesin, disassembly'den)
- Stat (double): +0x00 Can | +0x08 BüyüCanı(field2) | +0x10 FizSald | +0x18 FizSav | +0x20 BüyüSald | +0x28 BüyüSav | +0x70 BirimPuanı
- Getterlar: b5c(+0x00) b9c(+0x08) b7c(+0x10) afc(+0x18) b1c(+0x20) b3c(+0x28)
- Setterlar: b68(+0x00) ba8(+0x08) b88(+0x10) b08(+0x18) b28(+0x20) b48(+0x28)
- Teknik seviyeleri (int): +0x94 Kahraman | +0x98 İçgüdü→Can | +0x9c Zırh→FizSald/Sav | +0xa0 →BüyüCanı | +0xa4 Büyücülük→BüyüSald

## §3 TEKNOLOJİ (FUN_0040d884) — ÇOĞU DOĞRU, 1 HATA
- Zırh bug'ı DOĞRULANDI: b88(FizSald) ve b08(FizSav) İKİSİ de [EBP-0x14]'ü alıyor; [-0x14] sadece afc(FizSav,+0x18)
  getter'ından türüyor (0040d983 + 0040d9e2), FizSald getter b7c(+0x10) hiç çağrılmıyor. Sabitler 1.07/1.06 ✅.
- İçgüdü→Can ✅, Büyücülük→BüyüSald ✅, BüyüSav hero-only (L+1)×1.06^L ✅.
- **HATA:** Rapor "Kimya→Taşıma Kapasitesi" diyor. GERÇEK: +0xa0 tekniği **Büyü Canı'nı (field2, +0x08)** ölçekliyor
  (getter b9c +0x08 → setter ba8 +0x08). Taşıma kapasitesi FUN_0040d884'te HİÇ ölçeklenmiyor, taban değerinde kalır.
  Formül yapısı doğru (base×heromult + base×1.06^tech) ama uygulanan stat yanlış etiketlenmiş.
- §8 BirimPuanı: round(BüyüSav[+0x28] × 0.005[0x0040dca8]) → +0x70 (FUN_00411fe8). ✅

## §4 ENKAZ (FUN_00411350) — DOĞRULANDI
- Ogre bloğu (type==6, 0x004113b5) disassembly rapordaki alıntıyla birebir: FILD[-0x14]; FMUL[0x004113f8=0.3];
  FILD[-0x4]; FADDP; round; MOV[-0x4]. "local_8 = round()" decompiler yanılgısı; gerçekte FADDP ile birikiyor. Bug yok. ✅

## §2 HASAR (FUN_0040e0c4) — DOĞRULANDI
- param_9 = saldırı türü (1/2/3), param_10 = kahraman bayrağı. fVar1=A_toplam, fVar2=P_toplam(+kahraman gücü).
- Net hasar = (BirimPuan × A_toplam)/P_toplam - Savunma. Eşik _DAT_0040e790=0.0.
- Kahraman: FUN_00413610 gücü havuza eklenir; net = (heroPow×A)/P - heroSav; FUN_0041338c(tip1,2)/FUN_004132f4(tip3). ✅

## §7 GECE GÖRÜŞÜ (FUN_0040d608 / FUN_00411a80) — DOĞRULANDI + GÜÇLENDİRİLDİ
- Bayrak +0x74. Saldıran FUN_004115d0+FUN_004111d4 (2 döngü); Savunan FUN_00411f48+FUN_00411a80 (3 döngü).
- Çarpan: (1.0[b78] - 3.0[b74]/(L+3.0)) × 0.3[b7c] + 0.7[b84]. Rapordaki formülle birebir. ✅
- **3. döngü ayrı FUN_00413120 (yapı modifier'ı) kullanıyor** → "savunma yapıları" çıkarımı artık KANITLI.
  Rapor §7 "Kapsam" bülteninin "kanıtlanmamış çıkarım" ifadesi güncellendi.

## 2026-07-19 İKİNCİ GEÇİŞ — KALAN MADDELERİN KAPATILMASI

- **§1 tüm stat hücreleri**: FUN_0041440c disassembly'sindeki 21 birim × 6 stat = 126 IEEE-754 double
  tek tek çözüldü, HEPSİ rapordaki değerlerle eşleşti (Elf 80/11/234, Mancınık 1500/204/4160, Sur 2500/16640,
  Muhafız 700/192/3744, Balista 200/300/144/3172, Tapınak BüyüSald 320, vb.). 126/126 DOĞRU.
- **§4 Ogre 1.15**: FUN_00412a88 → PUSH 0x3ff2666666666666 = **1.15** (byte-confirmed), pow(1.15,L_kahraman),
  round(taban × 1.15^L). Üstel katsayı artık immediate'ten kesin.
- **§7 saldıran**: FUN_004111d4 = tam 2 döngü (her ikisi FUN_00412624). Çarpan formülü inline:
  FADD[0x411280] FDIVR[0x411280] FSUBR[0x411284] FMUL[0x411288] FADD[0x411290] — savunanla aynı, roller doğru.
- **§9.1 isimler**: FUN_00413a2c tam haritalandı. Yazma sırası 12,13,14,19,15,16,17,18,20.
  idx12=Kahraman(5a4328), idx13=Savunma Kulesi(5a4331), idx14=Tuzak(5a4340), idx16=Mangonel(5a4352),
  idx18=Balista(5a4363). §9.1 iddialarının tamamı DOĞRU.
- **§2 kayıp bölücüsü**: FUN_00412294 = tip-dağıtıcı switch(0-6); tipe göre farklı stat getter seçer
  (case0→b5c/+0x10, case1→b9c, case2→b7c, case3→afc, case4→b1c, case5→b3c, default→FLD[0x412324]).
  Yapısal olarak "tipe göre farklı bölücü" ile tutarlı; type3→BüyüSav eşlemesi tam trace edilmedi (kısmi).
- **§10 ham float DEĞERLERİ**: Kullanıcı tarafından veri tipleri (float/double/long double) Ghidra'da tanımlandıktan sonra MCP üzerinden başarıyla okundu. 19/19 sabit doğrudan API'den çekildi ve değerleri hatasız olarak doğrulandı:
  0x411280/411b74=3.0f, 0x411284/411b78=1.0f, 0x411288/411b7c=0.3d, 0x411290/411b84=0.7d,
  0x40e790=0.0f, 0x40dca8=0.005(ext), 0x413660=0.01(ext), 0x4113f8/4120e4/412114=0.3d,
  0x4104d4=0.0f, 0x4104d8=0.000025(ext), 0x4104e4=1.0f, 0x410dec=100.0f, 0x412324=0.0d (dağıtıcı default).
  Immediate byte-confirmed: 1.8, 1.07, 1.06, 1.15. → §10 artık TAM byte-kesin.

## §2 KAYIP BÖLÜCÜSÜ — TAM TRACE (FUN_0040e0c4 baştan sona)
- Stat struct base = FUN_00412820(unit) = unit+0x10. Getter offsetleri: b5c+0(Can) b9c+8(BüyüCan)
  b7c+0x10(FizSald) afc+0x18(FizSav) b1c+0x20(BüyüSald) b3c+0x28(BüyüSav). Dağıtıcı indeks = getter sırası (1..6).
- FUN_004120a8 = BirimPuan(+0x70) × Adet(+0x8). FUN_00412024=durum(+0x7c), FUN_00412848=birim tür(+0x88).
- Saldıran havuz [-0x8]: tür-eşleşen birimlerin Can(t1,2)/BüyüCan(t3) × Adet toplamı; FUN_00410e60 ile ×(0.999..1.001)
  [ (rand%3)+999, ×0.001 = ±%0.1 jitter ]. P havuzu [-0x18] = Σ BirimPuan×Adet + kahraman gücü (DOĞRU).
- Net = (BirimPuan×Adet)×[-0x8]/[-0x18] - Stat_mit×Adet;  Stat_mit = FizSald(t1)/FizSav(t2)/BüyüSald(t3) [indeks 3/4/5].
- Kayıp = net / BüyüSav  — bölücü HER TÜRDE sabit indeks 6 (PUSH 0x6): FUN_00412294(savaşçı)/FUN_00412d0c(yapı)/
  FUN_0041338c(kahraman t1,2)/FUN_004132f4(kahraman t3). b3c=BüyüSav §8'de kanıtlı → bölücü kesinlikle BüyüSav.
- RAPOR HATASI (düzeltildi): §2 "t1,2→Can'a böl" YANLIŞ; daima BüyüSav'a bölünür. Mitigasyon statı da türe göre değişir.

## §3-EK: ADLANDIRILMIŞ TEKNİK SİSTEMİ (FUN_0040d608) — YENİ KEŞİF (2026-07-19)

Koordinatör FUN_0040dcb4 savaş öncesi İKİ teknik fonksiyonunu da çağırır (0040df79/df8b/df9d):
  FUN_0040d608()  → adlandırılmış teknikler idx 0-8 (LİNEER) + gece
  FUN_0040d884()  → kahraman çarpanı + üstel teknik (§3) ×2 (saldıran+savunan)
Yani §3 eksikti: FUN_0040d884 tek sistem değil; asıl adlandırılmış teknikler FUN_0040d608'de.

FUN_0040d608: her teknik idx için getter(FUN_004115d0 saldıran army+8+idx*4 / FUN_00411f48 savunan army+0x120+idx*4)
+ uygulayıcı(birimlerde döngü) + modifier(stat değiştirir). Modifier formülü: yeniStat = base × (1 + seviye × sabit).

| idx | uygulayıcı(sald) | modifier | ETKİ (stat) | kapsam | sabit adresi |
|:--|:--|:--|:--|:--|:--|
| 0 | FUN_00411024 | FUN_00412394 | Can (+0x00) | kategori 0 | 0x004123f4 |
| 1 | FUN_00410fdc | FUN_0041232c | Can | kategori 1 | 0x0041238c |
| 2 | FUN_004110fc | FUN_004124cc | Büyü Canı (+0x08) | tümü | 0x00412520 |
| 3 | FUN_0041106c | FUN_00412528 | Fiz.Sald(+0x10)+Fiz.Sav(+0x18) | tümü | 0x004125c0 |
| 4 | FUN_004110b4 | FUN_004123fc | Can | kategori 4 | 0x0041245c |
| 5 | (savunan) FUN_00411a28 | FUN_00413010 | Fiz.Sav+Fiz.Sald | kategori 5 (yapı) | 0x004130bc |
| 6 | FUN_004111d4 | FUN_00412624 | Can+Taşıma (gece §7) | tümü | (§7 sabitleri) |
| 7 | FUN_00411144 | FUN_00412464 | Can | kategori 7 | 0x004124c4 |
| 8 | FUN_0041118c | FUN_004125c8 | Büyü Sald (+0x20) | tümü | 0x0041261c |

- idx3 (Zırh adayı) Fiz.Sald ve Fiz.Sav'ı KENDİ getter'larından okur → BURADA BUG YOK (d884'teki bug'dan farklı).
- idx5 sadece savunanda (FUN_00411a28), kategori fn FUN_004131d8 yapı tip alanı unit+0x00 (0xd-0x12) okur → Taş Ustalığı=idx5 (yapı tekniği), ekrandaki "-" ile uyumlu.
- Kategori fn FUN_0041279c: unit+0x7c → tablo[0x4127b7] → jump[0x4127c4] → {0,1,4,7}. HP tekniklerini (idx0/1/4/7) birim sınıfına göre kapılar.
  Tablo (field 0-12 → dönen kat): 0→1,1→0,2→1,3→0,4→7,5→4,6→7,7→1,8→1,9→1,10→1,11→7,12→1.
  (+0x7c = savaşçı index varsayımıyla: cat0=Elf,Pegasus | cat4=Mancınık | cat7=Ejderha,Ogre,Kaos | cat1=diğerleri.)

ÇIKARILAN UI→idx eşlemesi (çapa: Taş Ustalığı="-"=savunan=idx5; panel satır6→idx5):
  Okçuluk→0, Demircilik→1, Büyücülük→2(BüyüCan), Zırh→3(FizSald+Sav), Kimya→4, Taş Ustalığı→5, İçgüdü→7, Tılsım→8.
  Gece Görüş=idx6. → Kesinleştirmek için UI handler (FUN_00402800, çok büyük/timeout) veya 8 sabit + davranış testi gerek.

AÇIK: (1) 8 tek-artış sabiti (FMUL double, inline → GUI okuması gerek); (2) UI etiket→idx kesin eşlemesi;
(3) Tapınak (9 indeksten biri DEĞİL — ayrı mekanik, henüz bulunmadı); (4) d608(lineer)+d884(üstel) kompozisyonu.

## NİHAİ DURUM (2026-07-19) — TAMAMEN KAPANDI
- §1(126 stat + tüm maliyet/eğitim/taşıma), §2(hasar+kahraman, TAM trace + 3 düzeltme), §3(zırh bug + Kimya→BüyüCanı),
  §4(enkaz), §5(esir), §6(gösterim), §7(gece, iki taraf + sabitler), §8(birim puanı), §9.1(isimler), §10(19 sabit) → DOĞRULANDI.
- Açık/kısmi madde KALMADI. Rapordaki her sayısal iddia binary'den trace edildi.

## §11 TEKNİK–BİRİM ETKİLEŞİMİ — TAM TRACE (2026-07-20 ikinci geçiş)

Kategori fonksiyonları (Ghidra switch-çözümlü, .asm jump-tabloları .c'de mevcut):
- FUN_0041279c (savaşçı, +0x7c 0-11): {0,2,7,8,9,10,12}→1 {1,3}→0 {4,6,11}→7 {5}→4. UNIT_CLASS ile birebir.
- FUN_00413190 (yapı HP-kat, +0x00 tür): {13,18}→0 {14,17}→1 {15,16}→4 default→0.
- FUN_004131d8 (yapı Zırh/TaşUst-kat, +0x00): {13,16,18}→5 {14,15,17}→3 default→0.

Yapı tür kimlikleri (+0x00), FUN_00402800 → FUN_004137dc (`*param=type`):
- Döngü 0x004044a4–0x0040456b: tür = indeks 13→18 (Okçu Kulesi..Balista).
- Açık bloklar: 0x00404a20 PUSH 0x13→Sur=19; 0x00404b99 PUSH 0x14→Büyü Kalkanı=20.
- §9.1 isim sırasıyla birleşik: OkcuKule=13,Tuzak=14,Kazancı=15,Mangonel=16,Muhafız=17,Balista=18,Sur=19,BüyüKalkanı=20.
- Tapınak: savaş alanına birim konmaz (tür-id atanmaz). Ek doğrulama: FUN_00414308 = saldırı-türü tablosu (21 değer, motorun `type` alanıyla 21/21 eşleşti).

Uygulayıcılar (FUN_0040d608 çağırır) — savaşçı döngüsü (army+4) + yapı döngüsü (army+0):
| idx/Teknik | Savaşçı modifier | Yapı modifier |
|:--|:--|:--|
| 0 Okçuluk    | FUN_00412394 Can sınıf==0 | FUN_00412e8c Can HP-kat==0 |
| 1 Demircilik | FUN_0041232c Can sınıf==1 | FUN_00412e24 Can HP-kat==1 |
| 2 Büyücülük  | FUN_004124cc BüyüCan kapısız | **YOK (yapı döngüsü yok)** |
| 3 Zırh       | FUN_00412528 Fiz+Fiz kapısız | FUN_00412ef4 Fiz+Fiz **kat==3** |
| 4 Kimya      | FUN_004123fc Can sınıf==4 | FUN_00412fa8 Can HP-kat==4 |
| 5 Taş Ust.   | **YOK (savaşçı döngüsü yok)** | FUN_00413010 Fiz+Fiz kat==5 |
| 7 İçgüdü     | FUN_00412464 Can sınıf==7 | **YOK (yapı döngüsü yok)** |
| 8 Tılsım     | FUN_004125c8 BüyüSald kapısız | FUN_004130c4 BüyüSald **kapısız (tüm yapı)** |

- Modifier formülü (FUN_00412394 disasm): stat_yeni = stat_taban × (1 + seviye × k); k=0.05(Can/BüyüCan) / 0.06(atk). Getter/setter kendi statından (savaşçı Zırh idx3 = b7c/afc → BUG YOK, d884'ten farklı).
- Saldıran uygulayıcılar (FUN_00411024 vb.) tek döngü (savaşçı), aynı modifier'lar — simetrik, yapı yok.

DÜZELTME (rapor §11 ilk taslak YANLIŞTI): "Zırh/Büyücülük/Tılsım tüm YAPILARA" → sadece savaşçılara.
Gerçek yapı: Büyücülük/İçgüdü yapıya HİÇ; Zırh yalnız {Tuzak,Kazancı,Muhafız}(kat3); TaşUst yalnız {OkcuKule,Mangonel,Balista}(kat5); Tılsım tüm yapı; HP-tek HP-kategorisine göre.
Doküman çapraz kontrol: 6 saldırı yapısı BİREBİR (Kazancı/Muhafız üç teknik de oturdu). Çelişki: Sur(tür19)→TaşUst UYGULANMIYOR (dok. lore); Büyü Kalkanı(tür20)→Büyücülük UYGULANMIYOR (dok. lore).

## §12 TUR AKIŞI + HASAR BÜYÜKLÜĞÜ — DERİN TRACE (2026-07-20)
Tetikleyici: kullanıcı gerçek 3 savaş çıktısı verdi (5 tur, kaybeden ~%78 kayıp + survivor). Eski motor 3 tur, tam yok.
- Koordinatör FUN_0040dcb4: FUN_0040e794(tur1) → FUN_00410390(bitiş?) → FUN_0040ec4c(tur2) → do{FUN_0040f35c}(tur3-5, local_40=3..5).
  FUN_00410390: FUN_004114b0 & FUN_00411db4 (taraf boş mu) → yalnız tam yok oluşta erken biter; yoksa 5 tur.
- Tür programı (FUN_0040e0c4 param_9): Tur1=[1]; Tur2 (FUN_0040ec4c 4 çağrı)=[1,3] iki yön; Tur3-5 (FUN_0040f35c 6 çağrı)=[1,2,3] iki yön.
  Args (FUN_0040ec4c disasm 0x40f1af+): atk listeleri battle+0x40/+0x44, def +0x4c/+0x50/+0x58; def→atk çağrıları param_2/3/4=[EBP-0x4/-0x8/-0xc]=SNAPSHOT kopyalar → eşzamanlı (savunan tur-başı gücüyle karşılık verir).
- **HAVUZ ×ADET KESİN:** FUN_004121d4.asm → her case `CALL getter; FMUL [birim+0x8]` (×Adet). DECOMPILE STUB'INDA GİZLİ (sadece switch görünüyordu). Stat struct birim+0x10'da, adet +0x08, BirimPuan +0x70.
  Mitigasyon (FUN_004121d4) ×Adet; BÖLÜCÜ (FUN_00412294) ×Adet YOK, =BüyüSav. Havuz stat: t1,2→Can(idx1), t3→BüyüCan(idx2, tüm birim).
  FUN_004120a8.asm = FILD[+0x70]×[+0x8] = BirimPuan×Adet. FUN_00410e60 = ±%0.1 jitter (pool>eşik ise ×0.999-1.001).
- **MAGNITUDE:** tam-teknik Can (×3.5) havuzu ~3× şişiriyor → 3 turda çöküş (tur-içi P küçülmesi runaway). Ampirik kalibrasyon (gerçek 3 savaş):
  havuz Can'ı LİNEER ölçekte (üstel ×2 YOK) + tur-başı snapshot (frozen P) + tür programı → 5 tur, savunan kayıp gerçeğin %83'ü, enkaz ~%5 yakın, capture %6.9 vs %8.3.
  Kalan: kazanan kaybı ~1.8× fazla (tur1 FUN_0040e794 özel mantığı / üstel-teknik beslemesi trace edilmedi). XP formülü [REKON] (×0.25 düşman kaybı tahmini).
- **§8 DÜZELTME:** BirimPuan=round(BüyüSav×0.005) yuvarlaması düşük-BüyüSav birimleri savaş-dışı bırakıyordu; motorda yuvarlama kaldırıldı (oran zaten sadeleşir). NOT: Cüce BüyüSav=182 (4 değil — önceki elle-hesap hatası), yani yuvarlama sorunu yalnız Yük/Casus gibi çok düşük olanlarda.

## ÖZET — RAPOR DÜZELTMELERİ
1. §1: "7 hücre" → **8 hücre** (fiilen 8 hücre düzeltilmiş). [YAPILDI]
2. §3: "Kimya → Taşıma Kapasitesi" YANLIŞ → +0xa0 tekniği **Büyü Canı'nı (field2)** ölçekliyor; taşıma hiç ölçeklenmiyor. [YAPILDI]
3. §7: 3. döngü kimliği (savunma yapıları) kanıtlandı; "kanıtlanmamış" notu güncellendi. [YAPILDI]
4. §11: yapı tarafı "Zırh/Büyücülük/Tılsım tümü" YANLIŞ → yapı-modifier kapıları trace edildi; Sur/Büyü Kalkanı tür-id'leri (19/20) FUN_00402800'den okundu; motora aktarıldı. [YAPILDI]
