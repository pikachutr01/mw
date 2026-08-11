/**
 * ⭐⭐ GECE GÖRÜŞÜ — BELİRLEYİCİ (ayırt edici) TEST SETİ.
 *
 * Kullanıcı isteği (2026-08-11): *"gece görüş tekniğinin binary simülatör ile gerçekten ne kadar
 * uyumlu olduğunun tespitini… değişken sayılarda ordular… gece ve gündüz arasındaki sonuçları
 * gece görüş seviyesine göre **iki taraflı** ölçecek testler."*
 * Binary karşılığı: `docs/GECE_GORUS_TESTLERI.md` (kullanıcı simülatörde koşar).
 *
 * ── NEDEN YENİ BİR DOSYA (`night.test.ts` zaten var) ────────────────────────────────────────
 * `night.test.ts` **yapıyı** kilitliyor: hangi stat çarpılıyor (Can + Büyü Canı), taşıma
 * çarpılmıyor, Sur/Kalkan listede değil. 2026-07-31 ölçüm seti (`docs/veri/gece-savasi-olcumleri.md`)
 * ise **büyüklüğü** doğruladı — ama 6 hücrelik tek bir tarama ve hepsi **5 turluk** savaşlardı.
 * 5 turluk bir savaşta her şey her şeyi etkiler (geri besleme), yani o set şu soruyu **soramadı**:
 *
 *     Gece görüşü SAVUNMAYA da mı işliyor, yoksa yalnız SALDIRIYA mı?
 *
 * Doküman burada **kendi içinde çelişiyor**:
 *   · `on_bilgiler.txt:25`  → *"…savaşçıların **vuruş ve savunma** gücü o kadar artar"*
 *   · `on_bilgiler.txt:583` → *"…ordu ve savunmanın **vuruş gücü** azalır… (logaritmik bir oran)"*
 *
 * ── MOTORUN İDDİASI (çürütülmek üzere ortaya konuyor) ───────────────────────────────────────
 * Gece çarpanı **yalnız `poolHp`/`poolMagicHp`** üzerinden iş görüyor; o alanlar da yalnız
 * `combatPool` (= saldırı havuzu) ve `shamanShield` tarafından okunuyor. Kayıp formülünün
 * dayanıklılık tarafı — `mDef` (bölücü), `unitPower` (pay) ve `pAtk/pDef/mAtk` (mitigasyon) —
 * geceden **hiç** etkilenmiyor. Yani:
 *
 *     ⭐ GECE GÖRÜŞÜ TAMAMEN OFANSİF BİR STATTIR.
 *     Kendi seviyen düşmanın kaybını belirler; SENİN kaybına doğrudan hiç dokunmaz.
 *
 * ── SETİN ANAHTARI: **2 TURLUK SAVAŞ İKİ TARAFI BİRBİRİNDEN AYIRIR** ────────────────────────
 * Tur 2'de önce `dealType(atk→def)`, sonra `dealType(def→atk)` koşuyor ve **ikisi de tur başı
 * fotoğrafını** kullanıyor. Savaş 2. turda biterse (bir taraf silinir) sonraki tur yok, yani
 * geri besleme kanalı da yok:
 *
 *     savunanın kaybı = f(m_saldıran)   ·   saldıranın kaybı = g(m_savunan)
 *
 * ⚠️ Tur 2'nin faz listesi `[1, 3]` — **yakın dövüş yok**. Bu yüzden bu setin çekirdeği
 * menzilli birimlerle kuruluyor (Mancınık tip 1, Elf tip 1); Cüce (tip 2) 2. turda hiç vurmaz.
 */
import { describe, expect, it } from 'vitest';
import { nightMultiplier, simulate } from '../src/index.ts';
import type { SimulateInput, SimulateResult } from '../src/index.ts';

const side = (counts: Record<string, number>, tech: Record<string, number> = {}) => ({
  counts, tech, heroes: [], temple: 0, heroCount: 0,
});

/**
 * ⚠️ Jitter (±%0,1) tek seed'de 1-2 birim oynatabiliyor; bu setin iddiaları **birebir eşitlik**
 * üzerine kurulu. Sekiz seed'in ortalaması jitter'ı bastırır ve binary tarafındaki
 * "her satırı 2-3 kez koş" talimatının motor karşılığıdır.
 */
type Mean = { atkLost: number; defLost: number; turns: number; wall: number; winner: string };

function mean(o: Partial<SimulateInput> & Pick<SimulateInput, 'attacker' | 'defender'>): Mean {
  const N = 8;
  const acc = { atkLost: 0, defLost: 0, turns: 0, wall: 0 };
  const winners = new Set<string>();
  for (let i = 0; i < N; i++) {
    const r: SimulateResult = simulate({
      night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: `gg-${i}`, ...o,
    });
    acc.atkLost += r.attacker.lost;
    acc.defLost += r.defender.lost;
    acc.turns += r.turns;
    acc.wall += r.defender.wallIntegrity ?? 0;
    winners.add(r.winner);
  }
  return {
    atkLost: acc.atkLost / N, defLost: acc.defLost / N, turns: acc.turns / N,
    wall: (acc.wall / N) * 100,
    winner: winners.size === 1 ? [...winners][0]! : 'karışık',
  };
}

const m = (L: number): number => nightMultiplier(L);

/* ── Setin çekirdek kurulumu: saldıran 2. turda siliniyor ─────────────────────
 * 100 Mancınık (tip 1, Can 1500) · 9000 Elf (tip 1, Can 80, mDef 234, pAtk 9).
 * Savunanın faz-1 havuzu 504.000 ≫ saldıranın dayanıklılığı (100 × 13.540) → tur 2'de biter.
 * Savunanın kaybı ise doymuyor (9000'den ~100-300) → ölçülebilir kalıyor. */
const CORE_ATK = side({ mangonel: 100 });
const CORE_DEF = side({ elf: 9000 });

describe('A · çapraz bağımsızlık — savunanın GG si KENDİ kaybını değiştirmez', () => {
  /**
   * ⭐⭐⭐ SETİN EN BELİRLEYİCİ TESTİ.
   *
   * Doküman satır 25 haklıysa (*"savunma gücü de artar"*) savunanın gece görüşü onun
   * mitigasyonunu ya da dayanıklılığını büyütür ve **kendi kaybını düşürür**. Motor bunu
   * reddediyor: 2 turluk savaşta savunanın GG'si kendi kaybına **hiç** dokunamaz.
   *
   * ⚠️ Bu iddia yalnız savaş 2 turda bittiği için temiz. 5 turluk bir savaşta savunanın GG'si
   * kendi kaybını **dolaylı** olarak düşürür (saldıranı daha hızlı eritir → sonraki turlarda
   * gelen havuz küçülür). O yüzden `turns === 2` bu testin ön koşulu, süsü değil.
   */
  it('⭐⭐⭐ savaş 2 turda biterse savunanın kaybı GG_savunan dan BAĞIMSIZ', () => {
    const base = mean({ attacker: CORE_ATK, defender: CORE_DEF, night: true });
    expect(base.turns, 'izolasyonun ön koşulu').toBe(2);

    for (const nv of [1, 5, 10, 20]) {
      const r = mean({ attacker: CORE_ATK, defender: CORE_DEF, night: true, nightVisionDefender: nv });
      expect(r.turns).toBe(2);
      expect(r.defLost, `GG_sav ${nv}`).toBeCloseTo(base.defLost, 1);
    }
  });

  /** Aynı savaşta saldıranın GG'si savunanın kaybını KAT KAT değiştiriyor — kanal ofansif. */
  it('⭐ aynı savaşta saldıranın GG si savunanın kaybını 2,6 KAT büyütüyor', () => {
    const nv0 = mean({ attacker: CORE_ATK, defender: CORE_DEF, night: true });
    const nv20 = mean({ attacker: CORE_ATK, defender: CORE_DEF, night: true, nightVisionAttacker: 20 });
    expect(nv0.defLost).toBeCloseTo(102.5, 0);
    expect(nv20.defLost).toBeCloseTo(269.5, 0);
    // Saldıran her iki koşumda da tamamen siliniyor → kendi GG'si kendini KURTARMIYOR.
    expect(nv0.atkLost).toBe(100);
    expect(nv20.atkLost).toBe(100);
  });
});

describe('B · eğrinin şekli — parametreden BAĞIMSIZ oran testi', () => {
  /**
   * ⭐ Kayıp, havuza (dolayısıyla çarpana) **afin** bağlı: kayıp = A·m(L) − B.
   * Farkların oranını alınca hem A hem B sapıyor:
   *
   *     ( kayıp(L) − kayıp(0) ) / ( kayıp(20) − kayıp(0) )  =  ( m(L) − m(0) ) / ( m(20) − m(0) )
   *
   * Sağ taraf **yalnız formülün şekline** bağlı — ordu boyu, birim türü, mitigasyon hiç girmiyor.
   * Dokümanın *"logaritmik oran"* ifadesi doğru olsaydı bu oranlar tutmazdı.
   */
  it('⭐ fark oranları çarpan formülünü BİREBİR veriyor (ordu boyundan bağımsız)', () => {
    const loss: Record<number, number> = {};
    for (const nv of [0, 1, 2, 3, 5, 10, 20]) {
      loss[nv] = mean({
        attacker: CORE_ATK, defender: CORE_DEF, night: true, nightVisionAttacker: nv,
      }).defLost;
    }
    const span = loss[20]! - loss[0]!;
    for (const nv of [1, 2, 3, 5, 10]) {
      const measured = (loss[nv]! - loss[0]!) / span;
      const predicted = (m(nv) - m(0)) / (m(20) - m(0));
      expect(measured, `GG${nv}`).toBeCloseTo(predicted, 2);
    }
  });

  /** Altın satırlar — bir gerileme burada sayı olarak görünür. */
  it('altın tablo (8 seed ortalaması)', () => {
    const golden: [number, number][] = [
      [0, 102.5], [1, 150.5], [2, 179.4], [3, 198.5], [5, 222.5], [10, 250.4], [20, 269.5],
    ];
    for (const [nv, expected] of golden) {
      const r = mean({ attacker: CORE_ATK, defender: CORE_DEF, night: true, nightVisionAttacker: nv });
      expect(r.defLost, `GG${nv}`).toBeCloseTo(expected, 0);
    }
    // Gündüz üst sınır: GG 20 bile gündüze YETİŞEMEZ (m(20) = 0,9609 < 1).
    const day = mean({ attacker: CORE_ATK, defender: CORE_DEF, night: false });
    expect(day.defLost).toBeCloseTo(294.9, 0);
    expect(day.defLost).toBeGreaterThan(269.5);
  });
});

describe('C · AYNA — iki kod yolu aynı sabitleri mi kullanıyor', () => {
  /**
   * ⭐⭐ Binary'de gece'yi uygulayan **iki ayrı fonksiyon** var ve sabitleri **iki ayrı adresten**
   * okunuyor: saldıran `FUN_004111d4` (0x00411280..) · savunan `FUN_00411a80` (0x00411b74..).
   * İkisinin de `3.0 · 1.0 · 0.3 · 0.7` okuduğu varsayılıyor — bu test o varsayımı sınar.
   *
   * Kurulum tam ayna: aynı iki ordu, roller ters. Motor simetrikse (counterK = 1,0) sayılar
   * **birebir** çıkmalı. Sapma varsa gece'nin iki tarafta farklı işlediği anlamına gelir.
   */
  it('⭐⭐ roller ters çevrilince sayılar BİREBİR aynı', () => {
    for (const nv of [0, 1, 3, 5, 10, 20]) {
      const ileri = mean({
        attacker: CORE_ATK, defender: CORE_DEF, night: true, nightVisionAttacker: nv,
      });
      const ayna = mean({
        attacker: CORE_DEF, defender: CORE_ATK, night: true, nightVisionDefender: nv,
      });
      expect(ayna.turns, `GG${nv}`).toBe(2);
      // İleri koşumda ölçülen SAVUNANIN kaybı, aynada SALDIRANIN kaybı olur.
      expect(ayna.atkLost, `GG${nv} ayna`).toBeCloseTo(ileri.defLost, 0);
    }
  });
});

describe('D · ölçek değişmezliği — «değişken sayılarda ordular»', () => {
  /**
   * Gece çarpımsal bir havuz etkisiyse iki orduyu da k ile büyütmek her iki kaybı da tam k
   * katına çıkarır: havuz ∝ k, P ∝ k → `havuz/P` sabit, pay ∝ adet, mitigasyon ∝ adet.
   * Mutlak (adetten bağımsız) bir gece bileşeni olsaydı bu tam burada kırılırdı.
   */
  it('⭐ iki ordu da k katına çıkınca kayıplar TAM k katı (tek tip ordu)', () => {
    for (const nv of [0, 20]) {
      const birim = mean({
        attacker: side({ mangonel: 100 }), defender: side({ elf: 9000 }),
        night: true, nightVisionAttacker: nv,
      }).defLost;
      for (const k of [3, 10]) {
        const r = mean({
          attacker: side({ mangonel: 100 * k }), defender: side({ elf: 9000 * k }),
          night: true, nightVisionAttacker: nv,
        });
        expect(r.defLost / k, `GG${nv} ×${k}`).toBeCloseTo(birim, 0);
      }
    }
  });

  it('⭐ karışık orduda ve 5 turluk savaşta da ölçek değişmezliği geçerli', () => {
    const A = (k: number) => side({ elf: 800 * k, dwarf: 1200 * k, cavalry: 150 * k });
    const D = (k: number) => side({ elf: 600 * k, dwarf: 1800 * k, pegasus: 80 * k });
    for (const nv of [0, 10]) {
      const birim = mean({ attacker: A(1), defender: D(1), night: true, nightVisionAttacker: nv });
      expect(birim.turns).toBe(5);
      for (const k of [2, 5]) {
        const r = mean({ attacker: A(k), defender: D(k), night: true, nightVisionAttacker: nv });
        expect(r.atkLost / k, `atk GG${nv} ×${k}`).toBeCloseTo(birim.atkLost, -1);
        expect(r.defLost / k, `def GG${nv} ×${k}`).toBeCloseTo(birim.defLost, -1);
      }
    }
  });
});

describe('E · ŞAMAN JİLETİ — savunanın GG sinin TEK savunma kanalı', () => {
  /**
   * ⭐⭐⭐ A grubu «savunanın GG si kendi kaybını değiştirmez» diyor. Bunun **tam olarak bir
   * istisnası** var ve motor onu öngörüyor: Şaman.
   *
   * `combatPool` sonrası `pool -= shamanShield(def, ...)` çalışıyor ve Şaman'ın emdiği miktar
   * `poolHp × adet`, yani **gece çarpanıyla ölçekli**. Dolayısıyla:
   *
   *   · Şamansız savunan → GG'si kendi kaybına HİÇ dokunmaz (A grubu).
   *   · Şamanlı savunan  → GG'si arttıkça Şaman DAHA ÇOK emer → kendi kaybı DÜŞER.
   *
   * ⚠️ Yön sezgiye ters ama mekanik olarak zorunlu: gece Şaman'ı da zayıflatır, yani gece
   * görüşü burada "Şaman'ı geceden korumak" işini görüyor.
   *
   * Bu test aynı zamanda A grubunun **kontrol deneyi**: aynı kurulumda tek bir birim türü
   * eklenince değişmezlik dependence'a dönüyorsa, A'daki değişmezlik "hiçbir şey ölçmüyor"
   * eleştirisinden kurtulur.
   */
  it('⭐⭐⭐ şamansız savunan: GG etkisiz · şamanlı savunan: GG kaybı DÜŞÜRÜYOR', () => {
    const sansiz = [0, 5, 20].map((nv) => mean({
      attacker: CORE_ATK, defender: CORE_DEF, night: true, nightVisionDefender: nv,
    }).defLost);
    expect(sansiz[1]).toBeCloseTo(sansiz[0]!, 1);
    expect(sansiz[2]).toBeCloseTo(sansiz[0]!, 1);

    const samanli = [0, 5, 20].map((nv) => mean({
      attacker: CORE_ATK, defender: side({ elf: 9000, shaman: 100 }),
      night: true, nightVisionDefender: nv,
    }));
    for (const r of samanli) expect(r.turns).toBe(2);
    expect(samanli[0]!.defLost).toBeCloseTo(37.4, 0);
    expect(samanli[1]!.defLost).toBeCloseTo(21.5, 0);
    expect(samanli[2]!.defLost).toBeCloseTo(15.4, 0);
    // Kesin olarak azalan.
    expect(samanli[1]!.defLost).toBeLessThan(samanli[0]!.defLost);
    expect(samanli[2]!.defLost).toBeLessThan(samanli[1]!.defLost);
  });

  /**
   * Büyüklük de öngörülü: emilen fark = 200 (Şaman Canı) × adet × Δm, kayba dönüşümü ÷ 234
   * (Elf mDef). 100 Şaman · Δm = m(20) − m(0) = 0,26087 → 200×100×0,26087/234 ≈ 22,3 birim.
   */
  it('şaman kanalının BÜYÜKLÜĞÜ ham stat çıkarmasıyla uyuşuyor', () => {
    const nv0 = mean({
      attacker: CORE_ATK, defender: side({ elf: 9000, shaman: 100 }), night: true,
    }).defLost;
    const nv20 = mean({
      attacker: CORE_ATK, defender: side({ elf: 9000, shaman: 100 }),
      night: true, nightVisionDefender: 20,
    }).defLost;
    const beklenen = (200 * 100 * (m(20) - m(0))) / 234;
    expect(nv0 - nv20).toBeCloseTo(beklenen, 0);
  });
});

describe('F · SUR — gece yapıyı zayıflatmaz, orduyu zayıflatır', () => {
  /**
   * ⭐ Sur (ve Büyü Kalkanı) `army.units` dışında, yani `applyNight` onlara hiç dokunmuyor.
   * Sonuç: **gece sur GÖRECELİ olarak güçlenir** — ordular zayıflarken sur aynı kalır.
   *
   * İki ayrı iddia birden sınanıyor:
   *   1. Sur bütünlüğü savunanın GG'sinden BAĞIMSIZ (2 turluk izolasyon).
   *   2. Sur bütünlüğü saldıranın GG'sine afin bağlı → B grubunun oranı **üçüncü kez**,
   *      bambaşka bir kod yolundan (`gradeTakeHit`) çıkmalı.
   */
  const WALL_DEF = side({ elf: 9000, wall: 3 });

  it('⭐ sur bütünlüğü savunanın GG sinden BAĞIMSIZ', () => {
    const a = mean({ attacker: CORE_ATK, defender: WALL_DEF, night: true });
    const b = mean({ attacker: CORE_ATK, defender: WALL_DEF, night: true, nightVisionDefender: 20 });
    expect(a.turns).toBe(2);
    expect(b.wall).toBeCloseTo(a.wall, 2);
    expect(a.wall).toBeCloseTo(92.39, 1);
  });

  it('⭐ gece sur DAHA AZ yıpranıyor — yapı geceden etkilenmediği için', () => {
    const gece = mean({ attacker: CORE_ATK, defender: WALL_DEF, night: true });
    const gunduz = mean({ attacker: CORE_ATK, defender: WALL_DEF, night: false });
    expect(gece.wall).toBeGreaterThan(gunduz.wall);
    expect(gunduz.wall).toBeCloseTo(85.55, 1);
  });

  it('⭐ sur yıpranması da AYNI çarpan oranını veriyor (üçüncü bağımsız okuma)', () => {
    const w = (nv: number): number =>
      mean({ attacker: CORE_ATK, defender: WALL_DEF, night: true, nightVisionAttacker: nv }).wall;
    const w0 = w(0), w5 = w(5), w20 = w(20);
    const measured = (w0 - w5) / (w0 - w20);
    expect(measured).toBeCloseTo((m(5) - m(0)) / (m(20) - m(0)), 2);
  });
});

describe('G · geri besleme — 5 turluk savaşın sezgi kıran sonucu', () => {
  /**
   * ⭐⭐ 2026-07-31 setinin A2 satırı zaten göstermişti: saldıranın GG'si 5 olunca savunanın
   * kaybı 805 → 1177'ye ÇIKIYOR. Bu test onu uca taşıyor.
   *
   * GG 20 / 0'da savunan **1324** kaybediyor — **gündüzkü 1070'in de üstünde.** Sebep gece'nin
   * iki taraflı ve BAĞIMSIZ olması: gündüz savunan da tam güçte vurur ve saldıranı erken eritir;
   * gece savunan %30 zayıfken saldıran tam güce yakın kalırsa daha çok tur vurmuş olur.
   *
   * ⚠️ Bu, motorun modelinin **en kolay çürütülebilir** öngörüsü: gece'de tek bir "savaş
   * zorlaşır" çarpanı olsaydı hiçbir gece hücresi gündüzü geçemezdi.
   */
  it('⭐⭐ saldıranın yüksek GG si savunana GÜNDÜZDEN FAZLA kayıp verdiriyor', () => {
    const A = side({ dwarf: 2500 });
    const D = side({ dwarf: 3500 });
    const gunduz = mean({ attacker: A, defender: D, night: false });
    const gg20 = mean({ attacker: A, defender: D, night: true, nightVisionAttacker: 20 });
    expect(gunduz.defLost).toBeCloseTo(1069.8, -1);
    expect(gg20.defLost).toBeCloseTo(1323.8, -1);
    expect(gg20.defLost).toBeGreaterThan(gunduz.defLost);
  });

  /** 2026-07-31 ölçümünün doğrulanmış çapaları — kurulumun aynı kaldığının kanıtı. */
  it('doğrulanmış çapalar (2026-07-31 ölçümü) yerinde', () => {
    const A = side({ dwarf: 2500 });
    const D = side({ dwarf: 3500 });
    const gg00 = mean({ attacker: A, defender: D, night: true });
    expect(gg00.atkLost).toBeCloseTo(1903, -1);   // orijinal 1901-1903
    expect(gg00.defLost).toBeCloseTo(805, -1);    // orijinal 802-806
    const gg50 = mean({ attacker: A, defender: D, night: true, nightVisionAttacker: 5 });
    expect(gg50.defLost).toBeCloseTo(1177, -1);   // orijinal 1175-1178
  });
});

describe('H · kazananın çevrilmesi — tek bakışta okunabilir eşik', () => {
  /**
   * ⭐ Aynı savaş: **gündüz savunan kazanıyor, gecede GG ≥ 7 ile SALDIRAN kazanıyor.**
   * Kayıp sayısı okumaya gerek yok; binary'nin «kazanan» satırı yeter.
   *
   * ⚠️ Eşik keskin (6 → savunan · 7 → saldıran) çünkü kazanan `lossMag` karşılaştırmasıyla
   * belirleniyor ve iki taraf burada başa baş. Bu keskinlik testi hassas yapıyor: eşiğin
   * kayması gece eğrisinde küçük bir sapmanın bile habercisidir.
   */
  it('⭐ GG 6 → savunan · GG 7 → saldıran · gündüz → savunan', () => {
    const A = side({ cavalry: 900 });
    const D = side({ dwarf: 5200 });
    const at = (nv: number) => mean({ attacker: A, defender: D, night: true, nightVisionAttacker: nv }).winner;
    expect(at(0)).toBe('defender');
    expect(at(5)).toBe('defender');
    expect(at(6)).toBe('defender');
    expect(at(7)).toBe('attacker');
    expect(at(20)).toBe('attacker');
    expect(mean({ attacker: A, defender: D, night: false }).winner).toBe('defender');
  });
});

describe('I · gündüz — gece görüşü hiçbir şeye dokunmaz', () => {
  it('gündüz GG 20/20 ile GG 0/0 BİREBİR aynı', () => {
    const a = mean({ attacker: CORE_ATK, defender: CORE_DEF, night: false });
    const b = mean({
      attacker: CORE_ATK, defender: CORE_DEF, night: false,
      nightVisionAttacker: 20, nightVisionDefender: 20,
    });
    expect(b.defLost).toBe(a.defLost);
    expect(b.atkLost).toBe(a.atkLost);
  });

  /** GG tavanı yok ama çarpan 1'e ASLA ulaşmaz → gece hiçbir seviyede gündüz olmaz. */
  it('⭐ GG 20/20 gece bile gündüzün ALTINDA kalıyor', () => {
    const gece = mean({
      attacker: CORE_ATK, defender: CORE_DEF, night: true,
      nightVisionAttacker: 20, nightVisionDefender: 20,
    });
    const gunduz = mean({ attacker: CORE_ATK, defender: CORE_DEF, night: false });
    expect(gece.defLost).toBeLessThan(gunduz.defLost);
    expect(m(1000)).toBeLessThan(1);
  });
});
