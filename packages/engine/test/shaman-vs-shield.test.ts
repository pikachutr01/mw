/**
 * ⭐⭐ ŞAMAN ↔ BÜYÜ KALKANI — «Şamanlar düşmanın Büyü Kalkanı'na karşı da etkilidir» iddiası
 *
 * Kaynak iddia: `docs/referans/tekniklere_ve_yapilara_iliskin_on_bilgiler.txt:477` (Şaman
 * açıklaması). Bu, oyunun **kendi düzyazı dokümanı** — yani insan eliyle yazılmış ve
 * `JAVA_ROENTGEN.md` §3'teki güvenilirlik sırasında **en alt** basamak.
 *
 * ⚠️ Motor bu iddiayı **desteklemiyor** ve bu testler tam olarak onu kilitliyor. Şaman
 * binary'de `atkSub`tır: **kendisini VURAN havuzdan** ham stat çıkarır (faz 1-2 Can, faz 3
 * BüyüCan). Kalkana özel bir dalı yoktur; kalkan zaten **aynı tarafın** savunma nesnesidir.
 *
 * ⭐ İkisi iki AYRI büyü savunması ve karıştırılması çok kolay:
 *   · **Şaman** gelen gücü havuzdan **doğrudan düşürür** (`pool -= …`).
 *   · **Kalkan** gücü hiç değiştirmez; `P` paydasında yer tutup **payı üstüne çeker**, sonra
 *     kendi mitigasyonuyla yutar.
 * Bu yüzden Şaman'ı Büyücülük (büyü VURUŞ gücü), Kalkan'ı Tılsım (büyü SAVUNMASI) büyütür.
 *
 * ⇒ Dokümanın cümlesinin motordaki karşılığı yalnızca **ters yönde** vardır: savunanın Şamanı
 * gelen havuzu küçülterek **kendi kalkanını korur**. Saldıranın Şamanı düşman kalkanına
 * hiçbir şey yapmaz.
 *
 * ⚠️ **Bu dosya iddiayı ÇÜRÜTMÜYOR, motorun bugünkü hâlini KİLİTLİYOR.** Nihai hakem binary
 * ölçümüdür; kullanıcının koşacağı senaryolar `docs/SAMAN_KALKAN_TESTLERI.md`'de. Ölçüm
 * dokümanı haklı çıkarırsa buradaki beklentiler **bilerek** kırılacak ve motor değişecek —
 * testlerin görevi o anı **gürültülü** hâle getirmek.
 */
import { describe, expect, it } from 'vitest';
import { simulate } from '../src/index.ts';
import type { SimulateInput } from '../src/types.ts';

/** Sekiz seed'in ortalaması — binary ±%0,1 jitter uyguluyor, motor da üç değerli. */
const SEEDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];

function run(input: Omit<SimulateInput, 'seed'>, seed: string) {
  const r = simulate({ ...input, seed });
  return {
    shieldPct: (r.defender.shieldIntegrity ?? 0) * 100,
    atkLost: r.attacker.lost,
    defLost: r.defender.lost,
    winner: r.winner,
  };
}

function mean(input: Omit<SimulateInput, 'seed'>) {
  const runs = SEEDS.map((s) => run(input, s));
  const avg = (f: (x: (typeof runs)[number]) => number): number =>
    runs.reduce((a, x) => a + f(x), 0) / runs.length;
  return {
    shieldPct: avg((x) => x.shieldPct),
    atkLost: avg((x) => x.atkLost),
    defLost: avg((x) => x.defLost),
  };
}

/* ═══ A. Saldıranın Şamanının kalkana ÖZEL etkisi yok ══════════════════════ */

describe('A · saldıranın Şamanının Büyü Kalkanına ÖZEL etkisi yok', () => {
  /**
   * ⚠️⚠️ **BURASI İLK YAZIMDA YANLIŞTI** ve ölçüm düzeltti: "saldıranın Şamanı kalkana hiç
   * dokunmaz" diye yazmıştım, oysa **dokunuyor** — sadece iddia edilen kanaldan değil.
   *
   * Mekanizma ölçümle çıktı: Şamansız kurulumda saldıranın **tamamı ölüyor**
   * (40 Ejderha → 40 kayıp). 500 Şaman eklenince Şaman savunanın karşı vuruşunu emiyor,
   * saldıran **25 kayıpla** sonraki turlara sağ giriyor ve daha çok vuruş yapıyor.
   * Sonuç: kalkan %86,8 → %0 **ama savunanın birlikleri de** 12 → 39 kayıp veriyor.
   *
   * ⭐ Ayrım şu: etki **kalkana özel değil**, savaşın tamamına yayılıyor. «Kalkana karşı
   * etkili» bir birim olsaydı kalkan **orantısız** çökerdi; burada savunanın birlikleri en az
   * kalkan kadar zarar görüyor.
   */
  const defender = { counts: { dragon: 60, magic_shield: 3 } };

  it('⭐⭐ Şaman kalkanı da savunanın birliklerini de AYNI YÖNDE etkiler', () => {
    const sade = mean({ attacker: { counts: { dragon: 40 } }, defender });
    const samanli = mean({ attacker: { counts: { dragon: 40, shaman: 500 } }, defender });

    expect(samanli.shieldPct).toBeLessThan(sade.shieldPct);   // kalkan daha çok yıpranıyor…
    expect(samanli.defLost).toBeGreaterThan(sade.defLost);     // …ama birlikler de öyle
    /**
     * Asıl ölçüt: birliklerin gördüğü zarar **kat kat** artıyor (12 → 39, ×3'ten fazla).
     * Kalkana özel bir mekanizma olsaydı kalkan öne çıkardı, birlikler geride kalırdı.
     */
    expect(samanli.defLost).toBeGreaterThan(sade.defLost * 2);
  });

  it('⭐ KANAL: Şaman saldıranı hayatta tutuyor — kalkanı hedef almıyor', () => {
    /**
     * Şamansız saldıranın **hepsi** ölüyor (kayıp = ordu mevcudu). Şaman savunanın havuzunu
     * emdiği için saldıran sağ kalıyor; kalkanın daha çok yıpranmasının sebebi bu.
     */
    const sade = mean({ attacker: { counts: { dragon: 40 } }, defender });
    expect(sade.atkLost).toBe(40);                              // tamamı öldü

    const samanli = mean({ attacker: { counts: { dragon: 40, shaman: 500 } }, defender });
    expect(samanli.atkLost).toBeLessThan(40);                   // Ejderhalar sağ kaldı
  });

  it('⭐⭐ KONTROL: ordu büyütmek yetmiyor — 500 Yük Arabası kalkanı HİÇ oynatmıyor', () => {
    /**
     * Karşı-olgusal. Yük Arabası da orduyu büyütür ve hasarın bir kısmını üstüne çeker, ama
     * savunanın havuzuna **dokunmaz** (`hp = magicHp = 0`, havuza sıfır katkı; emici de değil).
     * Kalkan yüzdesi **birebir** aynı kalıyor → A grubundaki fark "daha kalabalık ordu"dan
     * değil, Şamanın **havuz emmesinden** geliyor.
     *
     * ⚠️ Bu satır olmasaydı ölçümdeki kalkan düşüşü "Şaman kalkana karşı etkili" diye
     * okunabilirdi — testin varlık sebebi tam olarak o yanlış okumayı kapatmak.
     */
    const sade = mean({ attacker: { counts: { dragon: 50 } }, defender });
    const arabali = mean({ attacker: { counts: { dragon: 50, cargo_wagon: 500 } }, defender });
    expect(arabali.shieldPct).toBeCloseTo(sade.shieldPct, 6);
    expect(arabali.defLost).toBe(sade.defLost);
  });

  it('kalkan zaten dokunulmazken Şaman onu YIKAMIYOR', () => {
    /**
     * 30 Ejderha kalkan sv3'ü hiç kıramıyor (%100). 500 Şaman eklenince saldıran çok daha az
     * kayıp veriyor ama kalkan **yine %100**. «Kalkana karşı etkili» bir birim burada bir
     * gedik açardı.
     */
    const sade = mean({ attacker: { counts: { dragon: 30 } }, defender });
    const samanli = mean({ attacker: { counts: { dragon: 30, shaman: 500 } }, defender });
    expect(sade.shieldPct).toBe(100);
    expect(samanli.shieldPct).toBe(100);
  });
});

/* ═══ B. Savunanın Şamanı KENDİ kalkanını KORUYOR (dokümanın tersi yön) ═════ */

describe('B · savunanın Şamanı kendi kalkanını korur', () => {
  /**
   * ⭐ Dokümandaki cümlenin motordaki tek karşılığı bu ve **yönü ters**: Şaman gelen havuzu
   * küçülttüğü için kalkana düşen pay da küçülüyor. Yani Şaman kalkanı **zayıflatmıyor**,
   * güçlendiriyor.
   */
  const attacker = { counts: { dragon: 85 } };

  it('⭐⭐ Şamanlı savunmada kalkan DAHA AZ yıpranır', () => {
    const sade = mean({ attacker, defender: { counts: { dragon: 60, magic_shield: 1 } } });
    const samanli = mean({
      attacker, defender: { counts: { dragon: 60, shaman: 650, magic_shield: 1 } },
    });
    expect(samanli.shieldPct).toBeGreaterThan(sade.shieldPct);
  });

  it('⭐ yeterli Şaman faz-3 havuzunu SIFIRLAR → kalkan hiç yıpranmaz (%100)', () => {
    /**
     * Tam eşitlik noktası: Ejderha `magicHp` **2800**, Şaman `magicHp` **200**.
     *   65 × 2800 = 182.000   ve   910 × 200 = 182.000  → faz-3 havuzu **tam sıfır**.
     * `dealType` `pool <= 0` dalında erken dönüyor, dolayısıyla kalkan hiç hasar almıyor.
     *
     * ⚠️ Hafızadaki *"65 Ejderha = 650 Şaman"* eşitliği **faz 1**e aitti (`hp` 2000 ↔ 200).
     * Faz 3'ün kendi eşiği farklı çünkü Ejderha'nın büyü canı fiziksel canından büyük. Bu ayrım
     * testin varlık sebebi: 650 Şaman kalkanı **%96,18**e kadar koruyor, sıfırlamıyor.
     */
    expect(mean({
      attacker: { counts: { dragon: 65 } },
      defender: { counts: { dragon: 60, shaman: 910, magic_shield: 1 } },
    }).shieldPct).toBe(100);

    expect(mean({
      attacker: { counts: { dragon: 65 } },
      defender: { counts: { dragon: 60, shaman: 650, magic_shield: 1 } },
    }).shieldPct).toBeLessThan(100);
  });
});

/* ═══ C. Şaman KALKAN-ÖZEL DEĞİL — kalkan yokken de aynı işi yapıyor ════════ */

describe('C · Şamanın çıkarması kalkandan bağımsız', () => {
  it('kalkan HİÇ YOKKEN de savunanın Şamanı kaybını azaltır', () => {
    /**
     * İddia «kalkana karşı etkili» olsaydı, kalkan olmayan bir savaşta Şamanın rolü
     * değişmezdi — ama bu test onun kalkanla hiç ilgisi olmadığını gösteriyor: etki aynen var.
     */
    const attacker = { counts: { dragon: 85 } };
    const sade = mean({ attacker, defender: { counts: { dragon: 60 } } });
    const samanli = mean({ attacker, defender: { counts: { dragon: 60, shaman: 650 } } });
    expect(samanli.defLost).toBeLessThan(sade.defLost);
  });

  it('⭐ SAF FİZİKSEL saldırıda da çalışır — «büyü karşıtı» bir birim değil', () => {
    /**
     * ⚠️ Asıl ayrım noktası. Cüce büyü kullanmaz (faz 1-2); kalkan da fiziksel fazlarda
     * **hatta değildir**. Şaman burada da çıkarma yapıyorsa, mekanizması «büyüye/kalkana
     * karşı» değil **genel bir havuz emicisi**dir. Binary de faz 1-2'de Şamanın CAN'ını
     * okuyor (BüyüCan'ını değil) — bu testin kilitlediği şey o.
     */
    const attacker = { counts: { dwarf: 3000 } };
    const sade = mean({ attacker, defender: { counts: { elf: 400 } } });
    const samanli = mean({ attacker, defender: { counts: { elf: 400, shaman: 650 } } });
    expect(samanli.defLost).toBeLessThan(sade.defLost);
  });
});

/* ═══ D. Kalkanı büyüten teknik TILSIM, Büyücülük DEĞİL ════════════════════ */

describe('D · Büyücülük kalkanı güçlendirmez (doküman yanıltıyor)', () => {
  /**
   * ⚠️ `tekniklere_ve_yapilara_iliskin_on_bilgiler.txt:573` Büyücülüğü Büyü Kalkanı ile birlikte
   * sayıyor. 2026-07-29 binary ölçümünde çürütüldü: Büyücülük yalnız `magicHp` ölçekler,
   * kalkanınki **0**. Kalkanın `mAtk`ini **Tılsım** büyütür (`FUN_00411988` → `FUN_00413744`).
   *
   * ⭐ İki iddia (Şaman↔Kalkan ve Büyücülük↔Kalkan) **aynı karışıklığın iki yüzü**: ikisi de
   * "büyüyle ilgili her şey kalkana etki eder" varsayımından geliyor.
   */
  const defender = { counts: { dragon: 60, magic_shield: 3 } };
  const attacker = { counts: { dragon: 50 } };   // kalkanı eriten ama silmeyen büyüklük

  /**
   * ⭐⭐⭐ **ALTIN ÖLÇÜM — Tılsım kalkanda %5, savaşçılarda %6** (kullanıcı binary ölçümü,
   * 2026-08-11, `docs/SAMAN_KALKAN_TESTLERI.md` D2).
   *
   * 20 senaryonun **yalnız bu biri** motorla tutmadı: motor %100,0 derken gerçek **%87,6-88,6**.
   * Sebep 2026-08-09'da girmiş sessiz bir gerileme: Tılsım oranı Kaos/Ejderha ölçümleriyle
   * %5 → %6 yapılırken `magic_shield` aynı listede olduğu için **o da** %6'ya çıkmıştı. Oysa
   * binary'de kalkanın ölçekleyicisi **ayrı bir fonksiyon** (`FUN_00413744`, sabiti 0,05);
   * savaşçılarınki `FUN_00411988`.
   *
   * ⚠️ Neden 19 senaryo bunu göremedi: kalkanın mitigasyonu `Sv × 1,8^Sv` ile, gücü yalnız
   * `1,8^Sv` ile büyüyor → net hasarın işaret değiştirdiği bir **uçurum** var. %6'da çarpan
   * 1,36 net hasarı tamamen sıfırlıyor (%100), %5'te 1,30 ve kalkan yıpranıyor. Uçurumun
   * dışındaki her senaryo bu parametreye duyarsız.
   *
   * ⭐ Bu testin görevi oranı **sayıyla** kilitlemek: biri `rateByUnit`i kaldırıp tek orana
   * dönerse burası kırmızıya döner.
   */
  it('⭐⭐⭐ ALTIN: Tılsım 6 → kalkan %87,7 (binary %87,6-88,6)', () => {
    const r = mean({ attacker, defender: { ...defender, tech: { talisman: 6 } } });
    expect(r.shieldPct).toBeGreaterThanOrEqual(86.5);
    expect(r.shieldPct).toBeLessThanOrEqual(89.5);
  });

  it('⚠️ oran %6 olsaydı kalkan HİÇ yıpranmazdı — gerilemenin imzası', () => {
    /**
     * Karşı-olgusal: savaşçı oranı (%6) kalkana da uygulansaydı Tılsım **5**'te çarpan 1,30
     * olurdu, yani bugünkü Tılsım 6 ile aynı. Test bunu doğrudan gösteriyor: Tılsım 7'de
     * (çarpan 1,35) kalkan tavana vuruyor.
     */
    expect(mean({ attacker, defender: { ...defender, tech: { talisman: 7 } } }).shieldPct)
      .toBe(100);
  });

  it('⭐⭐ Tılsım kalkanı KURTARIR (%2 → %88), Büyücülük neredeyse hiç oynatmaz', () => {
    const sade = mean({ attacker, defender }).shieldPct;
    const tilsim = mean({ attacker, defender: { ...defender, tech: { talisman: 6 } } }).shieldPct;
    const buyu = mean({ attacker, defender: { ...defender, tech: { sorcery: 6 } } }).shieldPct;

    // Tılsım kalkanın kendi mitigasyonunu büyütüyor → doğrudan ve çok büyük etki.
    expect(tilsim - sade).toBeGreaterThan(50);
    /**
     * ⚠️ Büyücülük'ün etkisi **tam sıfır değil** (%2,45 → %3,72) ve bu bir çelişki DEĞİL:
     * savunanın Ejderhalarının büyü vuruşunu büyüttüğü için saldıran daha erken eriyor,
     * sonraki turlarda gelen havuz küçülüyor. Yani etki **dolaylı** — savaşın gidişatından
     * geliyor, kalkanın kendi statından değil. Ayıran ölçü **büyüklük**: Tılsım 50+ puan,
     * Büyücülük 5 puanın altında.
     */
    expect(Math.abs(buyu - sade)).toBeLessThan(5);
    expect(tilsim - sade).toBeGreaterThan((buyu - sade) * 10);
  });

  it('⭐ Büyücülüğün gerçek kanalı ŞAMAN: şamanlı savunmada kalkanı belirgin kurtarıyor', () => {
    /**
     * Aynı teknik, tek fark savunmada Şaman olması. Kalkan yüzdesi şamansız kurulumda
     * kımıldamıyor (üstteki test), şamanlı kurulumda **%0 → %21,9**e çıkıyor — çünkü Büyücülük
     * Şamanın BüyüCan'ını büyütüyor ve faz-3 çıkarması artıyor.
     *
     * ⭐ Dokümanın *"Büyücülük … Büyü Kalkanı"* satırının ölçümde neden doğru göründüğünü de
     * bu açıklıyor: etki gerçekti ama **kalkanın değil Şamanın** üzerindendi.
     */
    const withShaman = { counts: { dragon: 60, shaman: 300, magic_shield: 3 } };
    const heavy = { counts: { dragon: 80 } };
    const sade = mean({ attacker: heavy, defender: withShaman }).shieldPct;
    const buyu = mean({
      attacker: heavy, defender: { ...withShaman, tech: { sorcery: 6 } },
    }).shieldPct;
    expect(buyu - sade).toBeGreaterThan(10);
  });
});
