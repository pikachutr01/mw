# DOĞRULAMA DURUMU — Kaldığımız Yer (Resume State)

> # 🔄 YÖN DEĞİŞİKLİĞİ (2026-07-25) — ÖNCE BUNU OKU
> Motor **v0.6.0**'dan itibaren binary'yi birebir taklit etmeyi HEDEFLEMİYOR. Yeni ölçüt:
> **oyunun kendi dokümanı** (`teknik_ve_yapi_dokumantasyonu.md`). Binary'nin doğrulanmış çekirdeği
> (hasar formülü, tur akışı, havuz/P, enkaz, XP, kahraman) korunuyor; belgelenmiş mantık hataları
> KOPYALANMIYOR. Değişenler ve gerekçeleri: **`TEKNIK_MANTIK_RAPORU.md`**.
> Bu dosyanın aşağısındaki "orijinalle birebir" hedefli ölçümler **v0.5.5 tarihlidir** — v0.6 ile
> sayısal karşılaştırma yaparken bunu hesaba kat (yapı senaryoları kazanan/tur olarak hâlâ geçerli).
>
> **Amaç (v0.5.x dönemi):** mobiwar-engine.js motorunu binary ile karşılaştırıp doğrulamak, sonra
> motoru gerçek simülatörle birebir uyumlu hale getirmek. Kullanıcı asıl simülatörle
> aynı girdide FARKLI sonuç aldığını bildirdi. Bu dosya, 5 saatlik limit araştırmayı
> yarıda keserse "devam et" komutunda tam buradan sürdürebilmek içindir.
>
> **DEVAM ET denince:** Önce bu dosyayı (özellikle aşağıdaki ⏩ EN GÜNCEL DURUM) + memory/
> mobiwar-verified-formulas.md'yi oku. Ghidra MCP (127.0.0.1:8080) DATA sabitleri okuyor (limit<=30).
> Binary ayrıca YEREL: binaries/disassembly/*.asm ve binaries/decompiled_2/*.c (fonksiyon-adıyla) —
> MCP'den hızlı. Motor testleri: scratchpad/ altında (node ile, Math.random=()=>0.5 deterministik).

---

# ⏩ EN GÜNCEL DURUM (2026-07-24) — YENİ SESSION BURADAN BAŞLA

## Bu oturumda TAMAMLANANLAR
1. **Yapı stat off-by-one DÜZELTİLDİ** + doğal savaş + savaş-sonrası onarım (×0.22) → yapı senaryoları 11/11.
   Empirik hack'ler (STRUCT_FP/STRUCT_TANK/structureAttack) KALDIRILDI. Detay: aşağıda "YAPI SAVAŞ MODELİ".
2. **Casus kuş savaşta hiç kayıp almaz** (settle'dan çıkarıldı). **Yapı enkazı** onarım-sonrası kalıcı kayba göre.
3. **KAHRAMAN MODELİ kuruldu + kalibre + UI'a entegre** (bu oturumun ana işi):
   - Binary: heroPower=round(1.8^lvl×300×durum/100), [+0xc]=train[19]=300 (handler ASM). Yetenek puanları
     heroPower'a girmez → birim statlarına. Kahraman hem P'ye (savunma) hem hero-as-unit (ofans) katkı verir.
   - Ham heroPower P'ye eklenince DOYUYOR → efektif 2-bileşen model (mobiwar-engine.js heroDefP/heroOffP):
     heroDefP=(1500+70·lvl)·(1+0.2·fizSav)·durum/100 [P'ye]; heroOffP=120·lvl²·(1+0.25·fizSald)·durum/100 [havuza].
     büyüSald/büyüSav fiziksel savaşta etkisiz (doğrulandı). Katsayılar [REKON-KALİBRE, kullanıcı G/S/D verisi].
   - **DURUM/ÖLÜM** (FUN_00413534): durum 100'den başlar, dealType'ta pay alır (DURUM_MIT=5, DURUM_K=0.0002),
     0'da ölür. res.heroes[]={lvl,durum,alive}. index.html sonuç log'unda "durum %YY / ÖLDÜ" gösterir (doğrulandı).
   - SONUÇ: G/D2/D3/D4 ~birebir; T7 atkK2217/2240 defK1306/1396 (eski 2362/1217'den çok iyi). Regresyon 0.

## KALAN İŞLER (öncelik sırası)
- **[Kahraman inceayar]** yüksek-fizSald ofansı ~%25 düşük (D1 def 2941/3360); iki-taraf kahraman (T8);
  durum orta-eğri ~%10. KÖK: kahramanı GERÇEK BİRİM olarak modellemek (index-19 taban stat binary'den decode
  + d884 hero-üstel ölçekleme). Bu "item-2" — ayrı odaklı iş. Şu an efektif çarpanla yaklaşılıyor (yeterince iyi).
- **[T11 kazanan ters]** Tur1-gnom skirmish lossMag şişiriyor → __NO_TUR1_GNOM düzeltir ama S2 gnom'unu bozar (nüanslı).
- **[Gnom yapıya karşı ölür]** T3/T9: savunanda yapı varken saldıran gnom sabotajda ölür (Tur1 attack1 modellenmemiş).
- **[Gece ~%15 over-kill]** (T5); **küçük ordu ~1-2 birim** (T10); **T12 saldıran-az-ölür** (yüksek-tech büyük savaş).
- **[TS PORT GERİDE]** packages/engine 1:1 idi ama o günden beri motor çok değişti (off-by-one, casus, enkaz,
  KAHRAMAN, durum). Model kesinleşince packages/engine/src'yi mobiwar-engine.js'e göre YENİDEN senkronla + testleri güncelle.

## ANA DOSYALAR
- **mobiwar-engine.js** (motor), **index.html** (UI/simülatör). **packages/engine/** (TS port — geride).
- **scratchpad/**: test_all.js, test_scen.js (S1-S4), test_struct_ref.js (yapı 11 ref), stres_testleri.js (T1-T15),
  test_hero_all.js (G/S/D), test_hero_durum.js (X durum kalibrasyon), kahraman_test_uret.js.
- **STRES_TESTLERI.md** + **KAHRAMAN_TESTLERI.md** (kullanıcı orij-sim verisiyle DOLU — üzerine yazma!).
- **MOBIWAR_OYUN_VERISI.md** (katalog), **MOBIWAR_MIMARI_RAPOR.md** (rebuild planı §0.1 kararlar).

---
# 🧪 16-SENARYO STRES TESTİ SONUÇLARI (2026-07-23, kullanıcı orij-sim'de doldurdu → STRES_TESTLERI.md)
Kullanıcı 16 çeşitli senaryoyu (karışık ordu, asimetrik teknik, tüm yapılar, süper birim, gece, şaman,
kahraman, küçük ordu, yük/casus) orijinal simülatörde çalıştırıp karşılaştırma tablosunu doldurdu.

## ✅ KULLANICI VERİSİYLE DOĞRULANAN (iyi):
- **Teknik ölçekleme** (T2 asimetrik 15/5): saldıran 521/521, savunan 3798/3799 — ~BİREBİR. Teknik sistemi doğru.
- **Süper birim** (T4 kaos+ejderha): kayıplar aralık içinde, kaos 1 hayatta ✓.
- **Şaman kalkanı** (T6): 0/4500 — BİREBİR.
- **Kazanan/tur:** 13/16 senaryoda doğru (istisnalar aşağıda).
- **Yapı survivor'ları** (T3): aralık içinde; **enkaz düzeltildikten sonra** ~birebir.

## ✅ BU TURDA DÜZELTİLEN (kullanıcı verisiyle):
- **CASUS KUŞ savaşta HİÇ kayıp almaz** (T1: 50→50, T11: 300→300). Settle'dan casus çıkarıldı (yalnız yük
  settle olur). Doküman: casus yalnız casusluk görevinde vurulabilir, orduda uçarak kaçar.
- **YAPI ENKAZI onarım-sonrası (kalıcı) kayba göre** (H3): onarılan yapı enkaz vermez. T3 enkaz 1720721→
  **1115969** (orij 1121252, ~birebir). debris() yapılarda count0−countFloor kullanır.

## 🔴 KALAN AÇIKLAR (öncelik sırası, kullanıcı verisiyle):
1. **KAHRAMAN MODELİ** (en büyük). e0c4 çözüldü: heroPower P'ye eklenir (orduyu korur) + kahraman TEK varlık
   olarak `heroPower×havuz/P − mit` hasar alır, durum% düşer, ÖLEBİLİR (FUN_00413534). heroPower = round(
   1.8^lvl × [+0xc] × [+0x80] × 0.01) [413610 disasm KESİN]. Motorun mevcut modeli (statToplam×1.8^lvl havuza)
   YANLIŞ eğri: lvl3 etkisiz, lvl15 ezici. Orij eğrisi doyumlu (lvl3→15 savunan kaybı 2130→3165). İZOLASYON:
   T13a(lvl10):orij atkK1394/defK2717 · T14a(lvl15):orij atkK1216/defK3165 · T15a(lvl3):orij atkK1689/defK2130 ·
   T13b(kahramansız):atkK2014/defK1818. GEREKLİ: koordinatör dcb4 grup-eşlemesi (kahraman hangi grupta, nasıl
   giriyor) + [+0xc]/[+0x80] setter'ları + hero-as-unit vs heroPower-term ayrımı. AYRI ODAKLI İŞ.
   - **KAHRAMAN SAYISI alanı** = oyuncunun TOPLAM kahraman sayısı (savaştaki değil); capture-chance'i etkiler.
     Motor `kahramanlar` param'ı bunu doğru kullanıyor (base=Tapınak×10−Kahraman×155). T13a/14a/15a config'te
     kahA 0→1 düzeltildi.
   - **KAHRAMAN ÖLÜMÜ / durum%**: FUN_00413534 (+FUN_0041338c) hero'ya hasar uygular. Motor modellemiyor. Eklenecek.
2. **T11 KAZANAN TERS** (motor saldıran, orij SAVUNAN — kritik). KÖK: Tur1-gnom skirmish'i saldıranın TÜM
   melee havuzunu savunan gnom'una yığıp def.lossMag'i şişiriyor → kazananı çeviriyor. __NO_TUR1_GNOM=1 ile
   kazanan DÜZELİR (defender) AMA S2 savunan-gnom'u (6→0 orij) artık ölmüyor → skirmish yönü doğru, lossMag
   katkısı/magnitüdü yanlış. Çözüm: gnom-skirmish'in lossMag'e katkısını kısıtla/ayır. NÜANSLI [REKON].
3. **GNOM YAPIYA KARŞI KAYIP ALIR** (T3 saldıran gnom 400→292, T9 600→390): savunanda YAPI varken saldıran
   gnom sabotajda ölür (Tur1 attack1: atk gnom→def yapı grubu, modellenmemiş). Yapısız savaşta saldıran gnom
   tam hayatta (T1/T2/T12 ✓). T9 enkaz-altın açığının bir kısmı bu ölen gnom'lardan.
4. **T15a KAZANAN TERS** (kahraman lvl3: motor savunan, orij saldıran) — #1 kahraman modeliyle çözülür.
5. **T9 TUR SAYISI** (motor 4, orij 3) + enkaz-altın (gnom + yapı). Yapı-ağırlıklı savaş ince-ayar.
6. **GECE hafif over-kill** (T5: motor savunan-kaybı 1075 vs orij 913; saldıran 2196 vs 2061). Gece ~%15 fazla.
7. **KÜÇÜK ORDU** (T10): ~1-2 birim sapma. Teknik formülü float (binary double stat — floor/round YOK); sapma
   [REKON] kalibrasyonlardan (COUNTER_K 1.01, şaman 0.85) küçük orduda orantısal görünür. İkincil.
8. **T12 dengeli-büyük:** saldıran-kaybı az (9427 vs 10309), savunan-kaybı fazla (5786 vs 4922) — "saldıran az
   ölür" sistematik eğilimi yüksek-tech büyük savaşta. XP fazla (8052 vs 6090).

# ✅✅✅ YAPI SAVAŞ MODELİ ÇÖZÜLDÜ (2026-07-23) — off-by-one + doğal savaş + savaş-sonrası onarım
Kullanıcı 7 yapı senaryosunu orijinal simülatörde ölçtü (tüm teknikler 0). Sonuç: **kazanan 7/7, tur 7/7,
yapı-kalan 7/7; saldıran kaybı ve XP %0-2 (okçu %4/%8)**. Üç bileşen:
1. **OFF-BY-ONE DÜZELTMESİ** (binary 3 tablo + txt Alan + kullanıcı Tuzak-maliyeti + saldırı-tipi semantiği):
   yapı statları index 13-20'den okunur (motor 12-20 okuyordu). Gerçek Mangonel pAtk192/MENZİLLİ,
   Balista pAtk480/MENZİLLİ, Okçu HP60/zayıf, Büyü Kalkanı BÜYÜ tipi — hepsi doküman açıklamalarıyla birebir.
2. **DOĞAL SAVAŞ (artık VARSAYILAN)**: yapılar normal stat-savaşına girer (combatPool'da). STRUCT_FP /
   STRUCT_TANK empirik hack'leri ARTIK GEREKSİZ (yanlış base statları telafi ediyorlarmış). Geri dönmek
   için `__STRUCT_LEGACY_FP=1`.
3. **SAVAŞ-SONRASI YAPI ONARIMI**: yapılar savaşta TAM ölür (combat çıktısı doğru) ama gösterilen sayıda
   kaybın **%78'i yenilenir** → kalıcı kayıp = combat kaybı × **0.22**. 5 senaryoda sabit (.219/.220/.211/
   .220/.219). Dokümandaki "%50-70 yenilenir" kuralının ölçülmüş hali. `__STRUCT_KEEP` ile ayarlanır.
   KRİTİK: onarım savaş-SONRASI olduğu için lossMag/XP/kazanan/saldıran-kaybını ETKİLEMEZ (in-combat
   dayanıklılık denendi → yapı hayatta kalıp fazla hasar verdi, saldıran kaybı +61/+89% bozuldu; ÇÜRÜDÜ).
Yapısız savaşlar (S1-S4) HİÇ etkilenmedi ✓. Harness: `scratchpad/test_struct_ref.js` (orij referans gömülü).

**❗ KALAN TEK AÇIK: Senaryo 7 — menzilli yapı vs YAKIN-dövüş savaşçı.** 2000 cüce vs 500 mangonel:
orij saldıran **200** kaybeder, motor **2000** (10× fazla). Ama 300 mangonel 2000 **elf**'i siliyor (motor
birebir). Fark: elf MENZİLLİ(1), cüce YAKIN(2), mangonel MENZİLLİ(1). "Savunan tip filtresi" denendi
(menzilli fazda yalnız menzilli savunan vurulur) → senaryo 7'de 0 kayıp (çok az) + diğer senaryoları bozdu
→ tam filtre YANLIŞ; kısmi/yönlü bir mekanizma olmalı. Ayırt edici veri gerekiyor (bkz. sonraki adım).

# 🗺️ PROJE MİMARİ RAPORU + YOL HARİTASI (2026-07-23) → `MOBIWAR_MIMARI_RAPOR.md`
Kullanıcı ilk mesajda savaş-doğrulamanın ÖTESİNDE tüm projeye dair mimari rapor istemişti (Java kaynağı
`DecompiledSrc/src` analizi, elde olan/olmayan bilgi, DB şeması, sunucu iletişimi, React+Flutter modüler
rebuild yol haritası). Bu, ayrı belgeye yazıldı: **`MOBIWAR_MIMARI_RAPOR.md`** (11 bölüm). Özet bulgular:
- İstemci = **J2ME MIDP-2.0 MobiWar v1.5.2**, sunucu-otoriteli ince istemci. 18 obfusce sınıf; roller
  çözüldü (k=hub, e=ağ, g=UI/RMS, h=veri düğümü, a=sabit-nokta matematik, o/n/i/j/m/l=ekranlar, r=font).
- **Sunucu:** kalıcı TCP `socket://212.252.205.237:7785`; istek=`user+cs+şifre+;jsessionid=+.do?params`;
  yanıt=XML-benzeri VEYA `$~`-tag parser (`e.java`). ~70 `.do` uç-noktası kataloglandı.
- **ELİMİZDE:** katalog (12 birim/8 yapı/9 bina/12 teknik), UI/menü ağacı, protokol, **ekonomi formülü +
  büyüme sabitleri** (0.8/1.2/1.4/1.5/1.45/1.8; `k.java:1373`), savaş motoru (~%98).
- **ELİMİZDE YOK (sunucu):** base maliyet/stat tabloları (init.do/tip-35 canlı gelir — ama formül var +
  savaş statları binary'den çıkarıldı), doğrulama eşikleri, dünya/harita state, timer otoritesi.
- **Öneri:** monorepo + ortak TS `engine` (savaş+ekonomi) + NestJS otoriter sunucu + React web + Flutter
  native + WebSocket/JSON protokol. DB: Postgres (§8 şema taslağı) + Redis. Fazlı yol haritası (§9).
- **Savaş entegrasyonu (§10):** `mobiwar-engine.js` → `packages/engine/combat` (TS port, testlerle regresyon
  0) → sunucu ordu-varışında motoru çağırır → rapor. Yapısız savaş üretime hazır; yapılı ~%1-15 artık.
SONRAKİ ADIM (rebuild başlarsa): monorepo iskeleti + motoru TS'e port + katalog JSON çıkar (Faz 0-1).

# ✅ KAZANAN KOŞULU DÜZELTİLDİ = KESİN `>` (2026-07-23, binary-kesin)
S3 (çift-şaman 2000, kimse ölmez, orij: SAVUNAN kazanır) motorda YANLIŞ "attacker" veriyordu. KÖK NEDEN:
motor `dLM >= aLM ? attacker : defender` kullanıyordu; iki taraf da 0 kaybedince `0>=0→attacker`. Binary
FUN_0040facc KESİN: `if (ctx[0x10] <= ctx[0x18]) result=2(savunan) else result=1(saldıran)` → saldıran
YALNIZ `dLM > aLM` (kesin büyük) ile kazanır; eşitlikte savunan. DÜZELTME: mobiwar-engine.js iki yerde
(final winner sat.556 + settle-loser sat.520) `>=`→`>`. SONUÇ: S3 defender✓; S1/S2/S4 + A1-A10 mancınık
(10/10 winner) + yapı senaryoları HEPSİ korundu (regresyon yok). Motorun kendi yorumu zaten `>` diyordu —
kod yorumla çelişiyordu, kod hatalıydı. [Binary-türetilmiş, kalibrasyon DEĞİL.]

# ⭐ YENİ SESSION — BURADAN BAŞLA (2026-07-22 temiz özet)
> Bu bölüm kendi kendine yeter. Alttaki tarihli bölümler ayrıntı/kanıt arşividir (bazıları "ÇÜRÜDÜ" işaretli).

## PROJE
Mobiwar Simulator v0.5.5'in savaş motorunu Ghidra ile tersine mühendislikle çözüp **mobiwar-engine.js**
web motorunu orijinaline BİREBİR yaklaştırmak. Kullanıcı orijinal simülatörü çalıştırıp ekran görüntüleriyle
karşılaştırma veriyor; ben motoru düzeltip binary'den doğruluyorum. Motor JS, tarayıcıda çalışıyor.

## ANA DOSYALAR
- **C:/Projects/misc/ghidra/mobiwar-engine.js** — MOTOR (tek dosya, üzerinde çalışıyoruz).
- **binaries/decompiled_2/** — decompile edilmiş C fonksiyonları. **binaries/disassembly/** — .asm.
- **DOGRULAMA_DURUMU.md** (bu dosya) — resume. **memory/mobiwar-verified-formulas.md** — özet (auto-load).
- **scratchpad/** — test harness'ları (test_scen.js, test_s5.js, DOGRULAMA_SENARYOLARI.md, ...).

## MOTOR TEST (harness)
`cd C:/Projects/misc/ghidra` sonra node ile; **Math.random=()=>0.5** deterministik jitter (=1.0) verir.
Kalibrasyon override'ları (global.__X): `__SHIELD_K, __STRUCT_FP, __STRUCT_TANK, __COUNTER_K, __TUR1_GNOM,
__NO_TUR1_GNOM, __NIGHT_BASE, __COMBAT_THRESH, __NO_POOL, __NO_ROUND_LOSS, __TURN_SCHEDULE`. Örnek:
`node -e "global.__COUNTER_K=1.0; Math.random=()=>0.5; require('./mobiwar-engine.js'); ...E.simulate(cfg)"`.

## ÇÖZÜLMÜŞ MEKANİKLER (motora uygulandı, ~25 senaryoda doğrulandı)
1. **Çekirdek hasar formülü + LİNEER teknik ölçekleme** — binary-doğru (B/D testleri BİREBİR). net=birimPuan
   ×adet×havuz/P − mitigasyon×adet; kayıp=net/MagicDef. Havuz faz1/2=HP, faz3=MagicHP; mitig faz1=pAtk/f2=pDef/
   f3=mAtk. unitPower=EĞİTİM(train). Teknik k: HP=0.05, saldırı=0.06.
2. **ŞAMAN = KALKAN** (FUN_0040e0c4 atkSub): savunanın şaman'ı gelen saldırı gücünden ŞamanHP×adet çıkarır.
   `SHIELD_CAL=0.85` [REKON]. Bol şaman→sıfır kayıp; çift şaman→kimse ölmez.
3. **XP** (FUN_0040facc): Round((atkLM+defLM)×(kazananLM/kaybedenLM)×0.001). lossMag=Σnet.
4. **KAZANAN** = lossMag: **dLM>aLM→saldıran (KESİN >)** (FUN_0040facc `ctx[0x10]<=ctx[0x18]→result 2/savunan`,
   yoksa result 1/saldıran). Eşitlikte (çift-şaman 0/0) SAVUNAN kazanır. (train-power DEĞİL.)
5. **KAHRAMAN %100 CAP** (SonucYazici): ham değer ≥100→ekranda %100. captureChance=min(100,...).
6. **MANCINIK** doğru (HP-havuzu; 10/10 senaryo). **NO_POOL={şaman}** (binary `!=7`).
7. **TUR1 = gnom skirmish** (FUN_0040e794): YAPISIZ savunanlarda AÇIK — saldıran ana ordu→savunan gnom
   (yok eder), savunan gnom→saldıran mancınık. Settle yalnız yük/casus (gnom DEĞİL). Yapılıda KAPALI.
8. **YAPILAR**: normal stat-saldırısı YAPMAZ (binary sub_413254 +0x84 filtre bug'ı). Özel firepower:
   `STRUCT_FP={okcu:6,tuzak:274,kazanci:292,mangonel:402,muhafiz:234,balista:585,sur:0,buyukalkani:0}`
   (tuzak yalnız Tur1). `STRUCT_TANK={okcu:3,tuzak:1,kazanci:45,mangonel:15,muhafiz:15,balista:22,sur:1,
   buyukalkani:1}` (combat-dayanıklılık bölücü). Saf-yapı 7/7 kazanan doğru. Sur/Kalkan pasif.
9. **survivor = round(kalan-güç)** (floor DEĞİL) — süper-birim (kaos) 1-fazla-kayıp düzeldi.
10. **GECE**: nightMult(0)=0.7 hem Can(HP) hem BüyüCan(MagicHP) havuzunu azaltır (eskiden yalnız HP).
11. **COUNTER_K=1.01** [REKON]: ~%1 karşı-saldırı zayıflığını düzeltir (gece kaos + genel saldıran-kaybı).
12. **combatAlive** erken-çıkış: yük/casus/gnom/tuzak "yenik" kontrolünde sayılmaz (binary FUN_004114b0/db4).
13. **applyLoss** (FUN_00412148): yok-oluşta lossMag'e net değil mDef×adet (kırpılmış) eklenir.

## KALİBRASYON SABİTLERİ (hepsi [REKON], mobiwar-engine.js içinde, override'lı)
SHIELD_CAL=0.85 · STRUCT_FP/STRUCT_TANK (yukarı) · COUNTER_K=1.01 · nightMult tabanı 0.7 (binary-doğru).

## KALAN ARTIKLAR (ikincil — yeni tuhaflık gelirse buradan)
- **S7 (yapı + dev gnom 7520):** Tur1-gnom yapılıda kapalı (dev-gnom P'den düşünce lossMag/over-kill winner
  flip). Yapılı savaşlar YAKLAŞIK; dev-gnom ölmüyor. Yapı-firepower/tank ince-ayar gerekebilir.
- **Mangonel oran-eşiği** (facc "iki taraf sağ" kazananı) tam yakalanmıyor.
- **Genel yüksek-tech karışık over-kill** (~%1-few, COUNTER_K kısmen telafi).
- **Yapı-kaybı razing** ince-ayarı (yapı survivor'ları ~%5-15 sapabilir).

## YÖNTEM (nasıl çalışıyoruz)
Kullanıcı orijinal+web ekran görüntüsü verir → farkı izole et (harness'la, birim-birim) → binary'den nedeni
bul (decompiled_2/disassembly/Ghidra MCP) → düzelt → tüm senaryolarda REGRESYON kontrolü (bozma!) → doğrula.
Binary-sadık düzeltme tercih; olmazsa [REKON] kalibrasyon (birden çok senaryoyu iyileştirmeli, overfitting değil).

## 🧩 KOMPLEKS/YAPILI SAVAŞ (S7) ARAŞTIRMASI (2026-07-21) — DEVAM EDİYOR
Kullanıcı yapı+kahraman-tapınaklı büyük savaş verdi (S7: sald 4874cüce.. + 5000yük + 641gnom + 2kaos;
sav 2000cüce.. + 7520gnom + 999casus + yapılar okcu268/tuzak400/../sur7/kalkan5; tech 15/14, tap 32/26).
Orij: SAVUNAN kazanır, atkK 10270, defK 10921, XP 30311, cap %100. Bulgular ve düzeltmeler:

- [✅ UYGULANDI] **KAHRAMAN İHTİMALİ %100 CAP**: FUN_004104e8 (SonucYazici) `FCOMP ctx[0x68] vs
  FLOAT_00410dec=100.0; JNC→0x410d8f` = ham değer ≥100 ise "%100,0" yazılır. FUN_004103e8 ham değeri
  (base×min(1,xp×2.5e-5)) hesaplar, CAP YOK orada — cap SADECE görüntülemede. Motor: captureChance min(100).
- [✅ UYGULANDI] **applyLoss (FUN_00412148 birebir)**: bir birim YOK OLUNCA lossMag'e net değil `mDef×sayı`
  (emilen, kırpılmış) eklenir. Eski kod net'i ekliyordu → tek-hedefe yoğun saldırıda (Tur1 3b) lossMag
  devasa şişiyordu. dealType + dealTargeted ikisi de applyLoss kullanıyor.
- [✅ UYGULANDI] **"X ünite kaybetti" toplamı YALNIZ savaşçı (kind='w')**: yapılar (Okçu Kulesi/Tuzak/Sur..)
  bu toplama girmez (orij S7: 10921 = savaşçı 3401 + gnom 7520; yapı kayıpları hariç). Motor da hariç tutuyor.
- [🔬 BULUNDU, GATED] **TUR1 = gnom skirmish (FUN_0040e794)**: attack 3b (sald ANA ORDU melee → SADECE
  savunan gnom grp10, atkSub=sav şaman) savunan gnom'u yok eder (orij: sav gnom 7520→0). attack 3a
  (sav gnom → SADECE sald mancınık grp5) sald mancınığı yok eder (orij: sald man→0). Motora tur1()+
  dealTargeted() eklendi AMA `global.__TUR1_GNOM` bayrağı ARKASINDA (default KAPALI): gnom ölünce savunan
  P paydası düşüp motorun BÜYÜK-SAVAŞ fazla-öldürme sorununu açığa çıkarıyor (S7 winner-flip, defK 19032).
  ÖNCE #over-kill çözülmeli. (Attack1/2/4 = yapı/destek-ateşi modellenmedi.)
- [🔬 BULUNDU] **YAPILAR farklı erişimci kullanıyor (grup C, ctx+0x58, 0x88-byte kayıt)**: sub_412da4
  (savunma = [+0xc]×[+0x78]), sub_412db8 (kayıp, +0x78, eşik 0x412e20), sub_412d0c (HP). Savaşçılar
  sub_4120a8([+0x70]×[+0x8])/sub_412148/sub_412294. Yapı "sayı/bütünlük" +0x78'de. **Sur(idx19)/Büyü
  Kalkanı(idx20) SEVİYE(+0xc)×BÜTÜNLÜK(+0x78)**; orij bütünlüğü % gösteriyor (Sur %0=yıkık, Kalkan %100=
  sağlam). Motor bunları sayı sanıp azaltıyor (Sur 7→1, Kalkan 5→0) — YANLIŞ, seviye-birim olarak modellenmeli.
- [❗ KÖK SORUN] **BÜYÜK/YÜKSEK-TECH SAVAŞTA FAZLA-ÖLDÜRME** ("sayı artınca sapma"): S7'de savaşçı kaybı
  ~%31 fazla (motor combat 4466 vs orij 3401). S5'te (tech 0) tam tersi ~%7 AZ. Değişken: TECH SEVİYESİ
  (S7 tech14-15). Şaman-kalkanı(0.85) da bir kalibrasyon; büyük savaşta havuzlar milyonlarca, kalkan küçük.
  Şüpheliler: (a) tech mitigasyon/HP ölçekleme yüksek seviyede kayıyor, (b) yapıların P'ye katkısı yanlış
  (train yerine [+0xc]?), (c) çok-tür çeşitliliğinde pay/P dengesi. GATED tur1 bunu maskeliyordu (gnom P'de).
- [✅ İZOLE EDİLDİ — B/C/D testleri, kullanıcı orij verisi] Over-kill'in kaynağı KESİN: **YAPILAR**.
  - **B grubu (tech ölçekleme, saf cüce, tech 0/5/10/15): TAM İSABET** — motor defK 1070/1135/1237/1303
    = orij 1070/1133/1236/1302, tur 5/5/4/4 birebir. → **tech ölçeklemesi DOĞRU.**
  - **D grubu (yüksek-tech karışık, YAPISIZ): TAM İSABET** — motor 2352/3641 = orij 2348/3640. →
    **çok-tür karışık ordu + yüksek tech DOĞRU.** Over-kill'in tech/çeşitlilikle İLGİSİ YOK.
  - **C grubu (SAF YAPI savunması): FELAKET** — her yapı yanlış:
    · Okçu Kulesi 500: orij elf kolay yener (51 kayıp, okçu ~110 ölür, 3 tur); MOTOR elf'in TAMAMINI
      öldürür (yapı HP×adet havuzu devasa, mancınık gibi). · Tuzak 1000: orij 1 TURDA 1200 elf öldürür,
      kendi 30-250 kalır (10'un katları, BÜYÜK RNG); motor 250 elf/4 tur (çok zayıf). · Mangonel 300:
      orij 2000 elf'i siler 8 kayıpla (4 tur); motor 184 kayıp. · Muhafız 200: orij elf yener; motor
      elf kaybeder (TERS).
  - **SONUÇ:** S7 sapması TAMAMEN yapılardan. Motor yapıları savaşçı formülüyle (HP×adet havuzu, train
    payda) işliyor — YANLIŞ. Yapılar grup C'de AYRI matematik + Tur1 katılımı kullanıyor.
- [🔬 YAPI RE İLERLEMESİ (2026-07-21, Ghidra MCP ile)]:
  · **6 STAT TABLOSU çözüldü** (handler başı 0x402862-0x40289d yükler, index 0-20 tüm birimler):
    sub_413f14=EĞİTİM/train(+0x70), sub_414018=ALTIN, sub_41411c=YEMEK, sub_41421c=TAŞIMA,
    sub_414308=SALDIRI-TİPİ(+0x88), sub_41440c=6 SAVAŞ STATI(+0x10, SetHP..SetMagicDef ×21).
    Yapı index: okcu=12, tuzak=13, kazanci=14, mangonel=15, muhafiz=16, balista=17, sur=18,
    buyukalkani=19, tapinak=20 (0x30-byte aralıklı). YAPILAR AYRI TABLO KULLANMIYOR — aynı 6 tabloda.
  · **YAPI STATLARI DOĞRU** (sub_41440c decode: okcu HP1200/pAtk240/mDef4000, mangonel HP800/mDef2418
    vb. motorla birebir). → stat ataması YANLIŞ DEĞİL. Sorun statlarda değil savaş AKIŞINDA/GRUBUNDA.
  · **YAPI KONUMU**: sub_411600(def)=def+0 (defC=ctx+0x58), sub_4115f4(def)=def+4 (defA warriors=ctx+0x4c),
    sub_410f88(atk)=atk+0. → YAPILAR defC grubunda, 0x88-byte, grup-C erişimcileri (sub_412da4/c4c/db8).
  · **YAPI STRUCT ctor sub_413278**: +0x80=0, **+0x84=100.0 (bütünlük %, başlangıç)**. Sur/Kalkan % buradan.
  · **Handler yapı/hero setter'ları** (MCP ile): sub_4137a0 → **[+0xc]=train** (defTbl1[i]); sub_4137b0 →
    [+0x4]=food; sub_4132e4 → [+0x14]; sub_413688 → 12-dword STAT bloğu [+0x20]'ye; sub_411ed0(x)=x+0x98
    (iç alt-nesne). Yani yapı defansif çarpanı +0xc = train (savaşçı +0x70 ile aynı DEĞER). Struct 0x88.
  · **ÇÖZÜLEMEYEN ÇEKİRDEK BİLMECE (inference yetmiyor)**: okçu(HP1200,pAtk240,mDef4000) her statta
    mangonel(HP800,pAtk30,mDef2418)'den BÜYÜK ya da eşit. Ama orij: MANGONEL 2000 elf'i SİLER (8 kayıp,
    4 tur), OKÇU neredeyse hiç vuramaz (51 elf, 3 tur). Stat-tabanlı warrior formülü bunu ÜRETEMEZ →
    yapılar TÜR/ROL-tabanlı ÖZEL mekanizma taşıyor: muhtemel (a) BÜTÜNLÜK(+0x84) tükenmesi tur-sayısını/
    saldırıyı belirliyor (okçu 3-tur'da biter=bütünlük 0), (b) yapı-türüne göre farklı saldırı stat/faz,
    (c) Tur1 yapı katılımı (destek-ateşi/gnom). Bu, METODİK BİNARY TRACE gerektirir (grup-C damage core
    yolu + bütünlük güncelleme + handler yapı-listesi kurulumu) — TEK TURDA ÇÖZÜLEMEDİ, ayrı oturum.
  · SAĞLAM DURUM: yapısız savaşlar 19 senaryoda doğrulanmış (S1-S5, A1-A10, B, D). Yapı modeli
    tamamlanana kadar yapılı savaşlar YAKLAŞIK. Motor bu haliyle yapısız için üretime hazır.

## ✅ KAOS 1-FAZLA-KAYIP DÜZELTİLDİ = floor→round (2026-07-22)
Kullanıcı: kazananın (savunan) kaos'u orij 7→5 (2 kayıp), web 7→4 (3 kayıp) — 1 fazla, her denemede aynı.
KÖK NEDEN: motor survivor'ı **Math.floor** ile gösteriyordu; savunan kaos ham count = **4.799** → floor 4,
ama binary **ROUND** kullanıyor (doküman/SonucYazici: "survivor = round(kalan-güç)") → round(4.799)=5.
DÜZELTME: finalize'da floor→Math.round. SONUÇ: kaos 5/5 ✓ + TÜM birimler ~1 orijinale yaklaştı (cüce
659 vs floor658, süvari 487 vs 486, ...). Toplam sapma düştü, regresyon 7/7 korundu. Süper-birimlerde
(kaos, mDef 1.2M) floor'un 1-fazla-kayıp göstermesi kötü UX'ti — round hem doğru hem UX-dostu.
Ek: erken-çıkış `alive`→`combatAlive` (binary FUN_004114b0/db4: yük/casus/gnom/tuzak "yenik" kontrolünde
sayılmaz). Turn-sayısı (bu senaryoda web5/orij4) loser-tail'den kalıyor (ikincil, sonucu etkilemiyor:
tur5 hasar 0). global.__COMBAT_THRESH ile eşik test edilebilir (FLOAT_0041156c okunmadı).

## ✅✅ GECE = BÜYÜ HAVUZUNU DA AZALTMALI (2026-07-22) — ÇÖZÜLDÜ (aşağıdaki "KAOS" teşhisini DÜZELTİR)
Gece savaşında motor savunanı fazla öldürüyordu (S10-gece defK 2209/1889, XP 9421/7106; S9-gece 1794/1505).
KÖK NEDEN: applyNight yalnız poolHp (fiziksel Can) azaltıyordu; **poolMagicHp (BüyüCan) tam güçte** kalıyordu.
Kaos magicHp=250000 → 6 kaos type3'te 1.5M büyü havuzu gece azalmıyor → savunanı fazla öldürüyor. DÜZELTME:
applyNight artık magicHp/poolMagicHp'yi de ×nightMult azaltıyor (ikisi de "can"). SONUÇ: S10-gece defK
1909/1889 + kaos 6/6✓ + XP 7175/7106; S9-gece 1527/1505 + XP 4467/4398 — hepsi ~%1. Gündüz etkilenmez
(regresyon 5/5). → Aşağıdaki "GECE = KAOS" teşhisi YANLIŞTI: sorun kaos değil, gece-büyü eksikliğiydi.
(__NIGHT_BASE ile gece taban-mult'u test edilebilir; 0.7 doğru.)

## 🌙 (ESKİ/DÜZELTİLDİ) GECE SAVAŞI FARKI = KAOS, gece DEĞİL (2026-07-22)
Kullanıcı S9 (gece açık, tech atk14/def15, tapınak atk20): savunan kaybı web1794/orij1505, XP web6008/
orij4398. İzole: gece mekanizması DOĞRU (nightMult(0)=0.7 binary-doğrulandı; kayıpları doğru yönde
azaltıyor: gündüz2064→gece1794, orij1505'e yaklaşır — gece-özel over-kill YOK). GERÇEK NEDEN: **KAOS**.
Saldıranın 4 kaos'unu çıkarınca defK 1794→391 → o 4 kaos savunan ölümlerinin ~1400'ünü yapıyor. Kaos
HP=220000 (doğrulandı, sub_41440c 0x410adb00), tech14'le ~1.5M havuz → saldırı havuzunu domine edip
savunanı ~%19 fazla öldürüyor. XP farkı bunun sonucu (defLM fazla → oran → XP artar). Genel yüksek-tech
karışık over-kill (S7 ~%31) de katkıda. → KAOS attack-havuzu kalibrasyonu gerekli (kontrollü veri:
N kaos vs bilinen ordu). İKİNCİL — kaos rare süper-birim; kaossuz savaşlar doğru.

## ✅ SALDIRAN-KAOS (gece) DÜZELTİLDİ = COUNTER_K 1.01 (2026-07-22)
Gece savaşında saldıran (kaybeden) kaos'u orij 6→0 ama web 6→1 (round(0.51)=1). KÖK: sistematik ~%1
karşı-saldırı (savunan→saldıran) ZAYIFLIĞI — S4/S5/S8/S10'da hep saldıran-kaybı orijinalin biraz altındaydı.
DÜZELTME: COUNTER_K 1.0→1.01 (dealType karşı-yön pool'una, kalkandan sonra → şaman-sıfır korunur). SONUÇ:
S10-gece atk-kaos 0/0✓ + savunan 1909→1890(orij1889) + XP; S4/S5/S8/S10 saldıran-kaybı hepsi orijinale
yaklaştı; kazanan 8/8, yapılar korundu. S1 defK 1070→1059 (RNG gürültüsü içinde tek ufak tradeoff). Cliff
1.05'te (razor-close S5 patlar); 1.01 güvenli. [REKON kalibre — binary-türetilmiş değil ama gerçek
sistematik zayıflığı düzeltir]. NOT: eski "COUNTER_K temiz çözüm yok" değerlendirmesi ÇÜRÜDÜ — 1.05 cliff'ini
görüp erken reddetmiştim; 1.01 çok altında ve faydalı.

## (ESKİ/ÇÜRÜDÜ) SALDIRAN-TAIL ~2-3× fazla sağ — TEMİZ ÇÖZÜM YOK (2026-07-22)
S8: saldıran (kaybeden) combat kuyruğu fazla sağ (süvari 158 vs 42, cüce 96 vs 43; ÖZELLİKLE süvari,
yüksek mDef=845 → tanky). Toplam kayıp yakın (%5). Denenen: karşı-yön çarpanı COUNTER_K (dealType 4.
param, kalkandan SONRA → şaman-sıfır korunur). SONUÇ: cliff davranışı — S5 razor-close kazanma, K=1.05'te
saldıran-kaybı 956→1977 patlıyor; K=1.03 S4/S5'i korur ama S8'i ancak kısmen düzeltir (süv 102 vs 42).
FUN_004114b0'da eşik-wipe YOK (yalnız "yenik mi" kontrolü). → global karşı-çarpan bu kuyruğu temiz
çözemiyor. COUNTER_K=1.0 (no-op, üretim). Muhtemel gerçek neden: kaybeden near-wipe tail'inin yüksek-mDef
birimlerine özel bir temizleme (binary'de izlenmedi). İKİNCİL — kazanan/savunan/gnom hepsi doğru.
override: global.__COUNTER_K.

## ✅ GNOM DÜZELTMESİ (2026-07-22) — yapısız savaşlarda gnom artık doğru
Kullanıcı S8 (yapısız, tek0): saldıran gnom 248→248 (sağ), savunan gnom 333→0 (ölür). Motor tersini
veriyordu. ÇÖZÜM:
- **Tur1-gnom yapısız savunanlarda AÇIK** (defHasStruct=false → doTur1Gnom): saldıran ana ordu (melee)
  → savunan gnom'u yok eder (binary attack 3b). Savunan gnom → saldıran mancınık (3a).
- **Settle'dan GNOM ÇIKARILDI** (yalnız yük/casus): gnom savaşçıdır, kaybeden tarafta (yapı yoksa) SAĞ kalır.
- Yapılı savaşlarda (S7) Tur1-gnom KAPALI: dev-gnom obliterasyonu def.lossMag şişirip kazananı çeviriyor
  + ayrı over-kill (S7 winner-flip). override: __TUR1_GNOM=1 (zorla aç) / __NO_TUR1_GNOM=1 (zorla kapa).
- SONUÇ: S8 gnom atk248/248✓ def0/0✓, savunan survivor'ları ~birebir (cüce805/813, ogre310/314, yük3254✓),
  XP7591/7230. S5 gnom da düzeldi (def0, orij0). Regresyon 6/6, yapı senaryoları + S7 kazananı korundu.
  Kalan: S8 saldıran ~%5 az öldürülüyor (süvari fazla sağ); S7 dev-gnom hâlâ ölmüyor (yapılı-gate).

## ✅✅✅ YAPI MODELİ UYGULANDI + KALİBRE (2026-07-22) — çalışıyor
Motora eklendi (hepsi [REKON kalibre], kullanıcı verisiyle):
- **Yapılar combatPool'a girmez** (normal stat-saldırısı yok — binary sub_413254 +0x84 filtre bug'ı, doğrulandı).
- **STRUCT_FP** (birim×tur firepower): okcu6, tuzak274, kazanci292, mangonel402, muhafiz234, balista585, sur0, kalkan0.
  `structureAttack(def,atk,round)`: pool=ΣFP×adet, saldırana train-ağırlıklı, mitigasyonsuz, kayıp=pay/mDef.
  Tuzak yalnız Tur1 (burst). Sur/Büyü Kalkanı firepower=0 (pasif — tek başına anlamsız, doğrulandı).
- **STRUCT_TANK** (combat-dayanıklılık, kayıp bölücü): okcu3, tuzak1, kazanci45, mangonel15, muhafiz15,
  balista22, sur1, kalkan1. Yapılar combat'ta çok dayanıklı (kazancı 5000elf'e ~%8) → hayatta kalıp ateşe devam.
- **KAZANAN = FUN_004114b0/db4 + facc:** bir taraf "yenik" = TÜM savaş birimleri eşik-altı (gnom/yük/casus
  HARİÇ; savunanda YAPILAR sayılır, tuzak idx14 HARİÇ). Yapı orduyu silerse→saldıran yenik→savunan kazanır.
  İkisi sağ→lossMag (ctx[0x10]>ctx[0x18]→saldıran). Motor: winner = dLM>=aLM (train-power'dan değiştirildi).
- SONUÇ: **saf-yapı 7/7 kazanan doğru** (okçu/tuzak saldıran; kazancı/muhafız/balista/mangonel savunan);
  **yapısız 8/8 regresyon KORUNDU**; **S7 karışık: kazanan✓, cap100✓, yapı survivor'ları doğru aralıkta**
  (okçu240/230, mangonel603/545, balista350/323). Kalan: gnom Tur1 (gated), mangonel oran-eşiği ince,
  yapı-kaybı razing ince-ayar. Harness: scratchpad/DOGRULAMA_SENARYOLARI.md, override'lar __STRUCT_FP/__STRUCT_TANK.

## ✅✅ YAPI MODELİ ÇÖZÜLDÜ — başka ajanın raporu + benim doğrulamam (2026-07-21)
Başka bir AI ajanı yapı bilmecesini çözen bir rapor verdi; binary'den DOĞRULADIM + ampirik test ettim:
- **DOĞRULANDI (binary):** `sub_413254(u)=*(u+0x84)` — saldırı-tipi filtresi +0x84 okur. Ama +0x84 = ctor
  sub_413278'de **bütünlük=100.0** ile, setup sub_413264'te **attackType** ile ÇAKIŞIR. Faz1/2 filtresi
  `sub_413254==phase` → yapı normal stat-saldırısı büyük ölçüde KİLİTLİ. Faz3'te filtre YOK (kaçak) ama
  yapı orada MagicHP ile vurur (okçu MagicHP1200 → küçük; mangonel MagicHP0 → sıfır).
- **DOĞRULANDI (ampirik):** motora `global.__STRUCT_NO_ATTACK` (yapı combatPool'a girmez) ekleyip test:
  2000 elf vs 500 okçu → elf kaybı 0 (orij 51, ÇOK YAKIN!), okçu 456 (orij 380-401). Mevcut motor elf'i
  siliyordu → **ajan HAKLI: yapılar normal savaşta vurmaz.** Okçu artık doğru yönde zayıf.
- **AJAN CLAIM 3 DOĞRU:** mangonel'in gücü normal savaştan DEĞİL — hardcoded ÖZEL YETENEK (Tur1 destek-
  ateşi tarzı, ID-özel). Yapı-saldırmaz modelde mangonel orduyu silemiyor → özel firepower gerekli.
- **DOĞRU YAPI MODELİ (uygulanacak):** (1) yapılar combatPool'a girmez (normal saldırı yok) [binary-doğru];
  (2) yapılar kazanan güç-karşılaştırmasına girmez (okçu train-gücüyle sahte kazanıyordu → savunanın ordusu
  belirler, ordusuzsa saldıran sağsa kazanır); (3) her yapıya ÖZEL FIREPOWER (okçu~0, mangonel~silme;
  kullanıcı verisiyle KALİBRE); (4) yapı KAYBI = saldıran-kazanınca ~%20 yıkım+RNG / savunan-kazanınca
  ∝ordu-kaybı [kullanıcı verisinden]. GATED, kalibrasyon verisi bekliyor (her yapı × standart ordu).

## 📐 YAPI STRUCT LAYOUT — TAM ÇÖZÜLDÜ (2026-07-21, handler döngüsü 0x40449a, index 13-18, MCP)
Yapılar 0x88-byte, [EBP+d414]+idx×0x88 array'inde, def+0 (defC) listesine eklenir. Setter'lar:
- +0x00 = idx (sub_4137dc)      +0x04 = food (sub_4137b0)      +0x08 = carry (sub_4137c0)
- +0x0c = **train** (sub_4137a0; sub_412da4 defansif = train×[+0x78])
- +0x10 = 6-double SAVAŞ STATI (sub_413238 ← sub_414fc4(deec, idx); deec=sub_41440c BASE STATLARI)
- +0x40 = 6-double İKİNCİ stat bloğu (sub_41321c ← aynı base statlar)
- +0x78 = adet (double)          +0x84 = **bütünlük** (float, 100.0 başlar)   +0x88 = saldırı-tipi (sub_413264)

## ❌ ÇÖZÜLEMEYEN ÇEKİRDEK — YAPI SALDIRI MODELİ (runtime-trace gerekiyor)
Struct +0x10 = BASE STATLAR (okçu HP1200, mangonel HP800). Grup-C saldırı sub_412c4c(u,1)=GetHP(+0x10)×
[+0x78] = HP×adet. Buna göre OKÇU (1200×500=600k) MANGONEL'den (800×300=240k) GÜÇLÜ olmalı. AMA orij:
mangonel 2000 cüceyi siler / okçu neredeyse hiç vuramaz — TAM TERSİ. Denenip ELENEN tüm açıklamalar:
base statlar (hepsi okçu≥mangonel), tip (ikisi=2 melee), train-power (okçu 70k>mangonel 45k), HP-durability
(okçu 600k>240k), mDef-tankiness (okçu 4000>2418), mitigasyon. HEPSİ okçu'yu güçlü gösteriyor, gerçek tersi.
→ Yapı savaşı, statik-trace'le görülemeyen bir mekanizma taşıyor (muhtemelen: yapılar normal damage-core'a
GİRMİYOR; ayrı bir yapı-savaş rutini + bütünlük + tür-özel firepower var). Statik binary + inference YETMEDİ;
kesin çözüm için debugger'da runtime izleme (yapı battle'da hangi fonksiyonların ne değerle çağrıldığı) gerekir.
KULLANICI GÖZLEMİ (model için altın): (1) SALDIRAN kazanınca yapı kaybı ~%20 SABİT + RNG (okçu 500→380-401),
saldıran boyutundan BAĞIMSIZ → savaş-SONRASI "yıkım", combat değil. (2) SAVUNAN kazanınca yapı kaybı ∝ savunan
ORDU kaybı; ordu kaybı 0 → yapı kaybı 0. (3) Yüksek-mDef yapı (okçu 4000) combat'ta ~0 kayıp; düşük (mangonel
2418) az kayıp. Bu 3 kural yapı-KAYBI modelini verir; ama YAPI-SALDIRISI (kimin kazandığını belirleyen) açık.
- [🔬 YAPI SAVAŞ MODELİ — SONRAKİ BÜYÜK İŞ] Çözülecekler:
  · Grup-C erişimcileri: sub_412c4c (atk=getter×[+0x78]), sub_412da4 (def=[+0xc]×[+0x78]), sub_412db8
    (kayıp, +0x78), sub_412d0c (HP div). +0x78=yapı adedi, +0xc=? (train değil olabilir). Struct 0x88-byte,
    ctor sub_413278. Handler'da yapı +0xc/+0x78 setup'ı bulunmalı.
  · Tur1 yapı katılımı: attack4 (grp14=TUZAK destek-ateşi %75-99 RNG → elf), attack1 (atk gnom→def grup
    ctx+0x58=Sur/Kalkan?), attack2 (grp17=MUHAFIZ→atk gnom). Tuzak 1-tur davranışı buradan.
  · FUN_00410390 (savaş-bitti): iki tarafın da BİRİMİ (sub_4114b0/sub_411db4="boş mu") varken sürer.
    Yapıların bu kontrole nasıl girdiği tur-sayısını belirliyor (okçu 3/tuzak 1/mangonel 4/muhafız 5).
  · Sur(19)/Büyü Kalkanı(20) = seviye(+0xc)×bütünlük(+0x78), % gösterilir.
  · BÜYÜK yapı-RNG: tuzak survivor 30-250 (10 katları), okçu 380-401 → jitter ±%0.1'den ÇOK fazla; ayrı
    RNG mekanizması var (destek-ateşi %75-99 + muhtemelen birim-başı zar). Bizim RNG eksik.
- NOT (kullanıcı): Gece Görüşü de bir TEKNİKtir; gece savaşı açıkken iki tarafın gece-görüş seviyesine
  göre etkir. Tech artarken Tapınak/Kahramanlar HARİÇ (onlar tech'e girmez).

## GENEL DURUM
- Task #1-7, #9: TAMAM (11 uzun asm + 4600 satır handler decompiled_2'ye çevrildi).
- Task #8 (doğrulama): DEVAM EDİYOR. Aşağısı bunun durumu.

## ✅ MANCINIK ARAŞTIRMASI — DOĞRULANDI (2026-07-21, kullanıcı A1-A10'u orijinalde test etti)
- "Tutarsızlık" giriş uyuşmazlığıydı: orijinal=50000 elf, web=5000 elf. Motor 50000 elf'te orijinali birebir
  tutturuyordu. Mekanizma (doğru): mancınık HP=1500 → N mancınık ~N×1500 SABİT karşı-havuzu; küçük ordu silinir.
- **A1-A10 orijinal testi: KAZANAN 10/10 ✓, TUR 10/10 ✓, enkaz ~%0.03-2.6, kayıp ~%0-5.** Motor mancınık
  davranışını TÜM elf spektrumunda (eşik ~15000-20000 arası; A4 20000'de attacker kazanır — orij de attacker)
  doğru veriyor. **A7/A9 KRİTİK ONAY: melee birim (cüce/süvari) Tur3'ten önce silinip mancınık'a HİÇ vuramıyor —
  orijinalde de savunan 0 kayıp.** → motorun Tur1=boş + melee-Tur3'ten yapısı SADIK. A8 (ters) da eşleşti.
- Kalan ufak artık: 5-tur şaman savaşlarında (A3/A4/A6) saldıran ~%3-5 fazla öldürülüyor (A6 şaman 115 vs 214).
  İKİNCİL — şaman-kalkanı 0.85 kalibrasyonu bazı uzun savaşlarda şaman-survival'ı hafif düşürüyor olabilir.
- Tüm inline sabitler çözüldü (decompiled_2/UNRESOLVED_CONSTANTS.md).

## KESİN DOĞRULANMIŞ DATA MODEL (disasm ile)
- `unit+0x8`  = adet (double). sub_4121d4/sub_4120a8 sonda `FMUL/[×] [unit+0x8]`.
- `unit+0x10` = stats bloğu başı (sub_412820(unit)=unit+0x10). 6 double stat:
  - +0x00 HP, +0x08 MagicHP, +0x10 PhysAtk, +0x18 PhysDef, +0x20 MagicAtk, +0x28 MagicDef
  - Getter/Setter AYNI offset (ör. sub_412b5c GetHP okur [+0], sub_412b68 SetHP yazar [+0]).
- `unit+0x70` = unitPower (INT!). sub_411fe8 yazar; sub_4120a8 = FILD[+0x70] × [unit+0x8].
- sub_41282c: 12 dword'ü (6 double stat) unit+0x10'a MOVSD kopyalar.
- Stat-index dispatcher (sub_4121d4 = sub_412294, unit,idx→getter):
  1=HP(412b5c) 2=MagicHP(412b9c) 3=PhysAtk(412b7c) 4=PhysDef(412afc) 5=MagicAtk(412b1c) 6=MagicDef(412b3c)

## GRUP-KAPSAM (koordinatör FUN_0040dcb4 + handler FUN_00402800)
- Savaşçılar → army+0 listesi (sub_410f88). Koordinatörde self+0x40 (+ grup 9,8,10).
- Kahramanlar → army+4 listesi (sub_4115c4). Koordinatörde self+0x44.
- Savunan aynası: main +0x4c, kahraman +0x50, ekstra +0x58.
- **d884 (ÜSTEL) yalnız self+0x44 ve self+0x50'ye uygulanır** (KAHRAMANLAR). Ana savaşçılar YALNIZ lineer (d608).
- Savaşçı unitPower'ı handler'da tanım tablosundan set (sub_411fe8 ← sub_414008). Kahraman unitPower = round(mDef×0.005) (d884).

## MOTORDA DOĞRU OLANLAR (değiştirme)
- Hasar formülü yapısı: net = birimPuan×adet×havuz/P − mitigasyon×adet; kayıp=net/mDef.
- Stat/havuz/mitigasyon eşlemeleri, ×adet, eşzamanlı snapshot, captureChance (FUN_004103e8), heroPower 1.8^lvl tabanı.

## BULUNAN HATALAR (motora yansıtılacak — ŞİMDİLİK YANSITILMADI)
1. **Savaşçılara üstel ölçek (motorun en olası hatası):** applyTech() heroMult=(L+1)·1.07^L ve
   mDef·1.06^L üstelini TÜM savaşçıların pAtk/pDef/mAtk/mDef/unitPower'ına uyguluyor.
   Binary: savaşçılar LİNEER; üstel yalnız kahramanlarda. → applyTech'te savaşçılar için
   finalPAtk/PDef/MAtk = lineer değer (heroMult'suz), mDef = lineer (×(L+1)·1.06^L YOK),
   unitPower = round(lineer_mDef × 0.005) olmalı. (Yalnız heroLvl>0'da fark yaratır.)
2. **unitPower yuvarlama:** motor `mDef×0.005` (float). Binary INT round → düşük-mDef 0 olur
   (Casus mDef=10→0). Motorda `round(mDef×0.005)` yap.
3. **Tur yapısı — KISMEN reconcile edildi (bu turda):** phase(binary)=type(motor) eşlemesi:
   pool phase1/2→HP, phase3→MagicHP; mitigasyon phase1→PhysAtk, phase2→PhysDef, phase3→MagicAtk.
   Faz programı (decompiled_2 Tur çevirilerimden):
   - **Tur2 (ec4c): binary {faz1, faz3} = motor [1,3]** ✓ UYUYOR (attacker→def faz1&3; def-kopya→atk faz1&3)
   - **Tur3-5 (f35c): binary {faz1,2,3} = motor [1,2,3]** ✓ UYUYOR
   - **Tur1 (e794): binary 4 çağrının HEPSİ faz=2 + özel gruplar ≠ motor [1]** ✗ UYUŞMUYOR.
     Tur1 çağrıları: (1) atkA=grp10 → defC=+0x58, hero geçici sıfır, sonuç ATILIR; (2) atkC=savGrp17 →
     defA=grp10, ctx[0x18]; (3a) def-grp10→atk-grp5 ATILIR; (3b) ana ordu(+0x40,+0x44) → def-grp10,
     atkSub=ctx[0x54], ctx[0x10]; (4) RNG destek ateşi (def-grp14, %75-99 kapasite) → ctx[0x18].
   - **AÇIK SORU:** Tur1 neden faz 2 (PhysDef mitigasyon), motor tip1 (pAtk)? Ya motorun Tur1'i yanlış
     (menzilli=faz1 varsayımı), ya da phase-anlamı eksik anlaşıldı. e794 asm'de Call3b'nin (0040eba6
     civarı) phase push'unu bir daha teyit et (2 olarak okundu). Bu, 1.8× sapmanın olası kaynağı.
   - Motorun basit "iki yön × tip-listesi" modeli Tur1'in 4-çağrılı özel yapısını (grup10/grup17/RNG
     destek) HİÇ yansıtmıyor — motorda Tur1 yeniden modellenmeli.
4. **XP formülü ÇÖZÜLDÜ (bu turda):** ctx[0x3c] = XP (FUN_004103e8 `ctx[0x3c]>499` kapısı; SonucYazici bunu "Deneyim" satırına yazar). FUN_0040facc'teki formül:
   - result==1 (saldıran kazandı, ctx[0x10]>ctx[0x18]): `XP = Round((ctx[0x10]+ctx[0x18]) × (ctx[0x18]/ctx[0x10]) × 0.001)`
   - result==2 (savunan kazandı): `XP = Round((ctx[0x10]+ctx[0x18]) × (ctx[0x10]/ctx[0x18]) × 0.001)`
   - ctx[0x10]=savunan kayıp BÜYÜKLÜĞÜ (double, Σnet/mDef — birim sayısı DEĞİL), ctx[0x18]=saldıran kayıp büyüklüğü.
   - Yani XP = toplamKayıpBüyüklüğü × (kazananınKaybı/kaybedeninKaybı) × 0.001. Motorun `defLost×0.25` (birim sayısı) YANLIŞ temelde; motorun global kayıp-büyüklüğü toplaması gerekir (e.loss zaten var, globalde toplanmıyor).
   - NOT: facc XP kısmını asm'den bir kez daha teyit et (kendi çevirimden alındı, C384=0.001 doğrulandı).

## SIRADAKİ ADIMLAR (buradan devam et)
1. **TUR YAPISI reconciliation (öncelik):** decompiled_2/FUN_0040e794.c (Tur1),
   FUN_0040ec4c.c (Tur2), FUN_0040f35c.c (Tur3-5) ile mobiwar-engine.js'in
   simulate()/dealType()/TURN_SCHEDULE mantığını satır satır karşılaştır. Özellikle:
   - Tur1'in 4 e0c4 çağrısı hangi grupları hangi fazla eşleştiriyor (atkA/atkB/atkC/defA/B/C, phase, includeHero) — FUN_0040e0c4.c imzasına göre.
   - Motor Tur1'i [1] (sadece menzilli) sanıyor; binary'de grp10/grp17/ana-ordu/RNG-destek var.
   - Amaç: 1.8× sapmayı izole etmek.
2. **XP trace:** FUN_0040facc (SavasSonrasi) içinde XP nerede hesaplanıyor? ctx+0x3c
   (KahramanOlasilikHesabi girişi) = XP mi? FUN_004103e8 ctx[0x3c]>499 kontrolü yapıyor.
   ctx+0x3c'yi kimin yazdığını bul (facc'te `ctx[0x3c]=Round((L10+L18)*(oran)*0.001)` vardı —
   bu XP olabilir!). L10=savunan kaybı, L18=saldıran kaybı (double). Bunu motorun xp'siyle karşılaştır.
3. **Savaşçı unitPower kesinleştir:** tanım tablosu (sub_413f14→sub_414008) savaşçı unitPower
   değerini round(mDef×0.005) mı veriyor? Gerekiyorsa sub_414008/sub_413f14 disasm.
4. Kalan combat-math getter/setter'ları (sub_412c4c, sub_412da4, sub_412148, sub_412980,
   sub_412db8, sub_412d0c) offsetlerini doğrula — savunan grup C (sub_412c20/412da4) farklı
   offset kullanıyor olabilir (yapılar). 
5. Doğrulama bitince: **motoru güncelle** (hata #1-4 + tur yapısı). Kullanıcı "en son
   motoru güncelleyelim" dedi — önce doğrula, sonra tek seferde motoru düzelt.

## YENİ DOĞRULANANLAR (2. doğrulama turu)
- **Field map (unit struct):** +0x8=adet(double), +0x10..0x38=6 stat, +0x40..=lineer-modifier bloğu
  (sub_412804 MOVSD 12 dword buraya), +0x70=unitPower(int, sub_411fe8), +0x74(sub_412014),
  +0x78(sub_412004), +0x7c=birim indeksi(sub_412030← i), +0x80(sub_412040), +0x84=?(sub_413254
  okur, grup C; sub_4120bc'de [+0x78]×[+0x84]×const_4120e4 kullanılır), **+0x88=ATTACK TYPE**
  (sub_412858 yazar ← defTbl5[i]; sub_412848 okur; phase filtresi bununla).
- **ATTACK TYPE tablosu (sub_414308=defTbl5, unit+0x88), index→tip:**
  0:2 1:1 2:2 3:1 4:1 5:1 6:2 7:1 8:1 9:2 10:2 11:2 12:2 13:1 14:2 15:2 16:1 17:2 18:1 19:2 20:3.
  Motorun UNITS.type sütunuyla BİREBİR (1=menzilli,2=yakın,3=büyü DOĞRULANDI, motor doğru).
- **sub_412148 (kayıp uygulayıcı grup A):** sayı[+0x8] -= frac; döndürür mDef×frac (=net, çünkü
  frac=net/mDef). → SAYI azalması=net/mDef ✓ (motorla aynı); ctx[0x10]/[0x18]=Σnet (XP için).
  Kenar durum: frac>=sayı VEYA frac<const_4121b0 → sayı=0 (wipe). const_4121b0 değeri OKUNMADI.
- **phase = ATTACK TYPE filtresi KESİN** (e0c4 loop: phase∈{1,2}→sub_412848==phase; phase3→tümü).
- **KRİTİK: Tur1 = phase 2 = YAKIN DÖVÜŞ.** Tur1'in 4 e0c4 çağrısının HEPSİ phase=2. Motor Tur1'i
  menzilli [1] sanıyor → **HATA.** (Tur2 faz{1,3}✓, Tur3-5 faz{1,2,3}✓ motorla uyuyor.)
  AÇIK: Tur1 gerçekte "yakın dövüş turu" mu yoksa "özel birim turu" mu (grp10/grp17 = sub_412024
  ile belirli birim indeksleri)? sub_412024'ün ne okuduğunu bul → Tur1'in gerçek doğası.
  Motorun "Tur1=menzilli, derin trace" iddiası ÇÜRÜDÜ — yeniden modellenmeli.

## YENİ DOĞRULANANLAR (devam)
- sub_412024(unit)=[unit+0x7c]=birim indeksi. sub_410f90/sub_411608(list,idx)=indeksi idx olan birim.
  sub_411660(list,idx) FARKLI alan (sub_4137d0(unit)==idx) kullanır. Tur1 grupları: attacker grp10
  (=gnom idx10), defender grp17 (sub_4137d0==17), grp14. Bu özel birim-etkileşimleri motorda YOK.
- **Gece görüşü DOĞRULANDI:** DOUBLE_00411b7c=0.3, DOUBLE_00411b84=0.7, FLOAT_00411b78=1.0 →
  motor nightMult=(1−3/(L+3))×0.3+0.7 KESİN DOĞRU.
- sub_4120bc = round([+0x78]×[+0x84]×0.3) (DOUBLE_004120e4=0.3) — enkaz benzeri hesap.
- **const_4121b0 (sub_412148 wipe eşiği) HÂLÂ TANIMSIZ** — kullanıcı Data→float yapmalı (VEYA küçük
  epsilon/1.0 varsay). Muhtemelen sub_412148/e0c4 wipe davranışını etkiler.

## SABİT-ÇÖZME DURUMU (MCP)
list_data_items değer döndürüyor. Tanımlı görülenler: FLOAT_00412a64=100, 00412a68=0,
LONGDOUBLE_00412a6c=0.01, LONGDOUBLE_00413660=0.01(heroPower), 00411b7c=0.3, 00411b84=0.7,
004120e4=0.3, DOUBLE_0041238c/4/45c=0.05 (lineer teknik kHP — motor 0.05 kullanıyor ✓).
FLOAT_004104d4/LONGDOUBLE_004104d8/FLOAT_004104e4 (capture) OKUNMADI ama motor formülü doğru.
TANIMSIZ (kullanıcı Data→float yapmalı): const_4121b0.

## 🎯 EN KRİTİK BULGU — unitPower = EĞİTİM (train), mDef×0.005 DEĞİL
- Savaşçı unit+0x70 (P-havuzu değeri, sub_4120a8=[+0x70]×adet) handler'da `sub_411fe8(u,
  sub_414008(defTbl1, i))` ile set edilir. **defTbl1 (sub_413f14) = EĞİTİM (train) değerleri**
  (9,12,52,80,750,240,666,18,1,8,25,40000,140,24,3,150,257,180,900,300,400 — motorun train
  sütunuyla BİREBİR, kaos=40000/tapinak=400 ayırt edici).
- Yani: **savaşçı güç-havuzu değeri = EĞİTİM MALİYETİ.** mDef×0.005 YALNIZ kahramanlarda (d884).
- Motor `unitPower = mDef×0.005`'i TÜM birimlere uyguluyor → hasar payları (share) ve P havuzu
  KÖKTEN yanlış. Birimler arası oran tamamen farklı (cuce train=9 vs mDef×0.005=0.91). **1.8×
  sapmanın EN GÜÇLÜ adayı.** DÜZELTME: motorda savaşçı/yapı unitPower = u.train (int).
- const_4121b0 = 0.0 (FLOAT, doğrulandı). sub_412148 kayıp = max(0, sayı−frac) ✓ motorla aynı.
- e0c4 share/P her ikisi de sub_4120a8=[+0x70]×adet kullanır → ikisi de EĞİTİM tabanlı.
- Kahraman unit+0x70 = round(mDef×0.005) (d884). Kahramanlar +0x44 grubunda UNİT olarak havuzda;
  AYRICA KahramanGucPuani (1.8^lvl) e0c4'te param_8/param_10 ile eklenir. Motor kahramanı yalnız
  heroPower skaları olarak tutuyor — bu da eksik/yanlış olabilir (ikinci öncelik).

## 🎯🎯 EN BÜYÜK BULGU (2026-07-21) — ŞAMAN = KALKAN (atkSub mekanizması)
Kullanıcı: bol Şaman'lı saldıran orijinalde SIFIR kayıpla kazanıyor; iki tarafta yüksek Şaman → kimse
ölmez, ganimet yok; motor ise saldıranı eziyordu. NEDEN çözüldü:
- FUN_0040e0c4'ün **`atkSub` parametresi** (satır 105-110): her yönde SAVUNAN tarafın ŞAMAN birimi
  atkSub olarak verilir ve `attackPower -= sub_4121d4(saman, idx)` yapılır. idx=1(HP) faz1/2, idx=2
  (BüyüCan) faz3. sub_4121d4 = getter × count[+0x8] (disasm KESİN, her idx FMUL[+0x8]).
- Yani her tarafın **Şaman'ı KENDİSİNE gelen saldırı gücünden ŞamanHP×adet çıkarır** = düz hasar-emme
  kalkanı. Yeterli Şaman → gelen güç ≤ 0 → o taraf o fazda SIFIR kayıp. Tur2/Tur3-5'te her yönde
  atkSub = savunan tarafın Şaman'ı (ctx+0x54=savunan#7 A-yönü; ctx+0x48=saldıran#7 B-yönü).
- Payda-şişirme DEĞİL: defTbl1[7]=0x12=18 (train, disasm doğrulandı FUN_00413f14) — küçük, sıfır-kayıp
  üretemez. Mekanizma kesinlikle atkSub çıkarması.
- MOTORA EKLENDİ: `shamanShield(def,type)` = def.şaman (type3?poolMagicHp:poolHp) × canlı adet;
  dealType'ta `pool -= shamanShield(def,type)`. combatPool zaten şaman'ı dışlıyor → çift sayım yok.

## GÜNCEL DÜZELTME LİSTESİ + DURUM
- [✅ UYGULANDI] **unitPower = base.train** (savaşçı/yapı). mDef×0.005 yalnız kahraman.
- [✅ UYGULANDI] **Savaşçı stat'ları LİNEER** (applyTech'ten heroMult/üstel/Zırh-bug KALDIRILDI).
- [✅ UYGULANDI] **Tur-içi ANINDA azaltma**: dealType savunan pay/P canlı sayıdan, kayıp anında (sub_412148).
- [✅ UYGULANDI 2026-07-21] **ŞAMAN KALKANI (atkSub)** — yukarıdaki en büyük bulgu. dealType'ta pool'dan
  savunan-şaman HP havuzu çıkarılır. S2/S3 (şaman senaryoları) artık doğru.
- [✅ UYGULANDI 2026-07-21] **XP = Round((atkLM+defLM) × (kazananLM/kaybedenLM) × 0.001)** (FUN_0040facc).
  Kazanan sıfır kayıpla kazanınca XP=0 (orij S2 XP=0 ile birebir). Eski defLost×0.25 kaldırıldı.
- [✅ UYGULANDI 2026-07-21] **TUR1 = BOŞ**: binary Tur1 (FUN_0040e794) genel menzilli tur değil, özel
  skirmish (grp10=gnom / grp17,grp14=yapı / destek-ateşi). Yapı/gnom-hedef yoksa hiçbir şey yapmaz.
  Eski `Tur1=[1]` fazladan menzilli tur ekleyip savunanı fazla, saldıranı (kalkan yüzünden) az
  öldürüyordu. Boş Tur1 → S4 saldıran-kaybı 674→938, XP 1163→1873 (orij 1064/2082).
- [✅ UYGULANDI 2026-07-21] **NO_POOL = {şaman} SADECE** (binary `!=7`). Eski {saman,gnom,yuk,casus}
  kludge'u kalkan yokken empirik hack'ti; gnom havuza geri kondu (S4 enkaz/defK iyileşti).
- [✅ UYGULANDI 2026-07-21] **ŞAMAN KALKANI KALİBRASYONU k=0.85 [REKON]**: ham ŞamanHP×adet çıkarması
  gerçek veriye göre ~%15 fazla güçlüydü (savunan ~%10-15 az öldürülüyordu). 5 senaryoda kalkan-katsayısı
  taraması k≈0.85'i işaret etti — S2 saldıran HÂLÂ 0/0 (kalkan ezici çoğunlukta sıfırlıyor) AMA S2 savunan
  3385→4067 (orij 4086), S2 enkaz %87→%100.2, S4 saldıran 938→1036, S5 de yaklaştı. Tam binary nedeni
  izole edilemedi (aday: faz-içi Şaman kendi-attrition zamanlaması). mobiwar-engine.js `SHIELD_CAL=0.85`.
- [ ] KALAN ufak artıklar (İKİNCİL, hepsi ~%3-7): S5 savunan defK 2779/2996 (-7%), S4 XP 2025/2082.
  Kaybeden gnom tam ölmüyor (S5 sav-gnom 16 vs orij 0) — Tur1'in "attacker ana ordu → savunan gnom melee"
  skirmish'i modellenmedi; gnom'u NO_ROUND_LOSS'tan çıkarmak S4 kazanan-gnom'unu bozuyor, o yüzden bırakıldı.
- [ ] Kahraman modeli (+0x44'te unit + KahramanGucPuani). Yapılı savaşlarda Tur1 destek-ateşi/yapı etkileşimi.

## SON DURUM — 5 SENARYO (Math.random=0.5, k=0.85 kalıcı)
| Senaryo | Kazanan | Saldıran K. | Savunan K. | XP | Enkaz altın |
|---|---|---|---|---|---|
| S1 saf-cüce (tek0) | defender ✓ | 2500/2500 ✓ | 1070/1070 ✓ | 272/278 | 214185/214198 |
| S2 karışık-ogresiz | attacker ✓ | 0/0 ✓ | 4067/4086 | 0/0 ✓ | 1020757/1019151 |
| S3 çift-şaman(2000) | defender ✓ | 0/0 ✓ | 0/0 ✓ | 0/0 ✓ | 0/0 ✓ |
| S4 kalibrasyon(ogre) | attacker ✓ | 1036/1064 | 8209/8340 | 2025/2082 | 6461262/6633538 |
| S5 karışık tek0 | attacker ✓ | 918/956 | 2779/2996 | 1685/1711 | 1539186/1649442 |
Winner/tur HEPSİ ✓; S1/S2/S3 ~birebir; S4/S5 %93-98. Harness: scratchpad/test_scen.js, test_s5.js,
test_shieldsweep.js (kalkan-k taraması, global.__SHIELD_K override), test_all.js, test_sched.js.

## EMPİRİK İTERASYON SONUÇLARI (Node harness: scratchpad/test_engine.js)
Motor kendi kendine çalıştırılabiliyor: `node -e "Math.random=()=>0.5; require('./mobiwar-engine.js'); require('.../test_engine.js')"`.
Uygulanan düzeltmeler (mobiwar-engine.js'de KALICI):
1. unitPower = base.train
2. Savaşçı stat'ları lineer (heroMult/×2/Zırh-bug kaldırıldı)
3. Tur-içi anında azaltma (dealType canlı sayı + hemen düşür)
4. NO_POOL = {saman,gnom,yuk,casus}: saldırı havuzuna katkı YOK (şaman binary `!=7` KESİN; diğerleri empirik)
5. NO_ROUND_LOSS = {gnom,yuk,casus}: tur içi kayıp YOK (kazanan tarafta 0 — orijinalle bire bir)

SONUÇ (aynı girdi): tur=5 ✓, saldıran gnom/yük tam hayatta ✓ (orij ✓), savunan artık SİLİNMİYOR
(her kategoride survivor). Savunan combat kaybı orijinale ~%10 yakın. 
KALAN SAPMALAR:
 - Saldıran (kazanan) kaybı 1853 (orij 1064) ~1.74× fazla — ağırlıklı cüce (825 vs 408). Kazanan
   tarafın küçük kaybı orantısal olarak fazla tahmin ediliyor. Mekanizma? (kazanan-koruması? tur
   yapısı? Tur1 özel?). SONRAKİ ANA HEDEF.
 - Kaybeden yük 5000→5000 (orij 1006): savaş-DIŞI birim tur kaybı almıyor ama kaybedende SAVAŞ-SONRASI
   ölmeli (FUN_0040facc). Modellenmedi.
 - XP 1210 (orij 2082): gerçek formül (Σnet×oran×0.001) uygulanmadı; motor hâlâ defLost×0.25.
 - Savunan combat survivor'ları orijinalin ~%50'si (kayıp ~%10 fazla) — hafif over-kill.

## SABİT DOĞRULAMASI (fixed_constants.md — kullanıcı sorusu) — HEPSİ DOĞRU
MCP artık okuyor. Binary'den doğrulanan (motorla birebir):
- Lineer teknik k: HP-teknikleri (0x41238c vb.)=0.05, saldırı (zirh 0x4125c0, tilsim 0x41261c)=0.06. Motor 0.05/0.06 ✓.
- Teknik→stat eşlemeleri (zirh→pAtk+pDef, tilsim→mAtk, demircilik→HP class1, buyuculuk→MagicHP, tasusta idx5 struct-cat5) ✓.
- FUN_00410e60 (saldırı gücü dönüşümü): power×(rand%3+999)×0.001 (0x410ebc=0.001, eşik 0x410eb0=0.0). Motor jitter ✓.
- Capture: 0x4104d8=0.000025, 0x4104e4=1.0, 0x4104d4=0.0 ✓. Hero: 1.8, 0x413660=0.01 ✓. Gece 0.3/0.7 ✓. Enkaz 0.3 ✓.
- FUN_00412674 (0x412778=0.018, 0x41278c=0.02): KAHRAMAN-tekniği modifier'ı (FUN_00411298/FUN_00411b8c çağırır,
  Wizardry/Armor/Tech4/Instinct hero-techlerini birime uygular). Motorda MODELLENMEDİ ama kahramansız savaşta etkisiz.
  → Kahramanlı savaşlar için motora eklenmeli (ikincil).
- Ampirik: teknik seviyesi sonucu değiştiriyor (tek0 def-kaybı 2851, tek15 4841). Teknikler UYGULANIYOR.
- SONUÇ: Sabitler DOĞRU. Kazanan-over-loss sabit-kaynaklı DEĞİL (teknik seviyesinden bağımsız ~1850 sabit) → YAPISAL.

## KAZANAN-KAYBI (~1.8×) — DERİN AMPİRİK ARAŞTIRMA (harness ile)
Motorda KALICI sağlam düzeltmeler: train, lineer stat, anında-azaltma, NO_POOL/NO_ROUND_LOSS dışlamaları.
Bu haliyle: saldıran 1853 (orij 1064), savunan combat survivor'lı (silinmiyor). Denenen hipotezler:
- **Tur1 BOŞ** (özel skirmish bu savaşta gnom/balista/kazancı=0 → ~hiçbir şey yapmaz): SAVUNAN
  neredeyse BİRE BİR oturuyor (cüce144/127, elf352/336, şaman458/454). → Motorun Tur1=[1] genel
  menzilli değişimi SAHTE; savunanı fazla öldürüyordu. AMA saldıran daha da kötü (2107) çünkü savunan
  Tur2'ye tam güçle giriyor, daha çok karşı-vuruyor. → Saldırının kalibrasyonu DOĞRU; sorun karşı-vuruş.
- **Karşı-vuruş (D→A) ×0.57** → saldıran orijinale oturuyor (912@0.5, 1120@0.6). Yani savunan
  karşı-vuruşu ~1.75× fazla güçlü. DİREKSİYONEL (yalnız D→A).
- **×2 mitigasyon (iki yön)** → savunan bozuluyor (elf 1111 vs 336). Yani ×2 mitigasyon (kaldırılan
  fix #2) DEĞİL — asimetri simetrik değişimle çözülmüyor.
- **Canlı havuz (sıralı, frozen değil)** → saldıran 707 (az), savunan fazla ölüyor. Coupling.
- SONUÇ: Kazanan-koruması DİREKSİYONEL bir mekanizma (yalnız kaybeden→kazanan vuruşu ~1.75× zayıf
  olmalı). Simetrik mitigasyon/havuz/P ile çözülmüyor. Muhtemel kaynak: (a) Tur1 özel skirmish yapısı
  (gerçekte kaybedeni erken/farklı azaltıyor), (b) FUN_0040facc post-battle kazanan-koruması,
  (c) karşı-vuruşun frozen değil kısmi-azalmış güçten olması. TAM MEKANİZMA ÇÖZÜLMEDİ — SONRAKİ HEDEF.
  İpucu: harness `node -e "Math.random=()=>0.5; require('./mobiwar-engine.js'); require('.../test_engine.js')"`.

## SAYI MODELİ + SAVAŞ-SONRASI (kesin, disasm+facc)
- unit+0x4 = INT sayı (sub_41211c/sub_412128), unit+0x8 = DOUBLE kalan-güç (sub_4121b4, savaşta azalır,
  havuz/hasar bunu kullanır; sub_412128 ilk sette 0x8'i sayıdan başlatır). unit+0x84 = INT ölü sayısı.
  Görüntülenen survivor = round(kalan-güç). Kazanan-koruması sayı-recompute'ta YOK.
- **SAVAŞ-SONRASI kaybeden savaş-dışı kaybı (FUN_0040facc settle_loser_unit) UYGULANDI:** kaybedenin
  yük/casus'u count × def.lossMag/(def.lossMag+atk.lossMag) kadar ölür. dealType artık lossMag (Σnet)
  biriktiriyor. SONUÇ: savunan toplam kaybı 8492 (orij 8340) ✓, XP 2123 (orij 2082) ✓, capture 8.49
  (orij 8.32) ✓ — ARTIK NEREDEYSE BİREBİR. Kalan tek sorun: SALDIRAN (kazanan) kaybı 1853 vs 1064.
- KALAN KAZANAN-OVER-LOSS analizi: savunanın MELEE karşı-vuruşu (ogre 300×5250=1.575M havuz) saldıran
  cüce'yi fazla öldürüyor (Tur3-5 t2). Ogre count yüksek → melee counter dev. Empty-Tur1 savunan-combat'ı
  oturtuyor ama saldıranı kötüleştiriyor (2107). Counter ×0.57 saldıranı oturtuyor (direksiyonel, mekanizma?).
  Hasar formülü/sabitler/teknikler DOĞRU; sorun counter magnitude/tur-yapısı. ÇÖZÜLMEDİ.

## EMPİRİK TEST VERİSİ (referans — aynı girdi, iki simülatör)
Girdi: kahramansız, gece yok, teknikler 15, Tapınak 16/9. Saldıran/Savunan adetleri ekranda.
ORİJİNAL: Saldıran kaybı 1062, Savunan kaybı 8342, 5 tur, enkaz 6633538A/6348088Y, XP 2079, %8.31.
  Kalan (saldıran): cüce1693 elf253 süv201 peg240 ejd216 man140 ogre5 şam1228 yük2000 gnom1560.
  Kalan (savunan): cüce127 elf335 süv241 peg48 ejd12 man34 ogre44 şam454 yük1005.
WEB(eski, düzeltmeler öncesi): Sald kaybı 1966, Sav kaybı 10419. Savunan neredeyse silinmiş
  (çoğu 0), gnom 564. → Hata A (fazla öldürme) + Hata B (×2 mit) + Tur1(gnom) belirtileri.
SONRAKİ TEST: 3 düzeltme sonrası bu verilerle tekrar karşılaştır; gnom hâlâ ölüyorsa Tur1 gerek.

## KRİTİK FONKSİYON ADRESLERİ (referans)
- Handler/giriş: 00402800. Koordinatör: 0040dcb4. Lineer dağıtıcı: 0040d608. Üstel: 0040d884.
- Hasar çekirdeği: 0040e0c4 (imza: ctx,atkA,atkB,atkC,defA,defB,defC,atkSub,phase,includeHero).
- Turlar: 0040e794/0040ec4c/0040f35c. Sonrası: 0040facc. SonucYazici: 004104e8.
- KahramanGucPuani: 00413610 = round(1.8^h[0x14] × h[0xc] × h[0x80] × 0.01).
- KahramanOlasilikHesabi: 004103e8 = Tapınak×10−Kahraman×155, ×min(1,XP×0.000025), XP>499&&Tap≠0&&Kah<5, kazananın (00410ec8) tapınağı.
- jitter: 00410e60 = (rand%3+999)×0.001.
