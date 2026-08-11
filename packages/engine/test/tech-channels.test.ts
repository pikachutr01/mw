/**
 * ⭐⭐⭐ TEKNİK KANALLARI — «Şaman'ın emmesi» ve «Tılsım'ın süzgeçsizliği» (2026-08-12).
 *
 * Kullanıcı binary simülatörde **rastgele** bir savaş kurdu (11 birim türü, 8 teknik, ikisi de
 * yüksek seviyeli) ve motorumuzla karşılaştırdı. Sapma büyüktü: **saldıran kaybı +%17,8**,
 * kahraman deneyimi **+%27,3**. İki ayrı kök neden çıktı ve ikisi de Ghidra'dan okundu.
 *
 * ── 1. ŞAMAN, DEMİRCİLİK GRUBUNDA ──────────────────────────────────────────────────────────
 * `FUN_0041279c` her savaşçıyı **tek bir `atk` grubuna** eşliyor. Grup eşlemesi yedi bağımsız
 * çapayla doğrulandı (Elf/Pegasus → Okçuluk · Mancınık → Kimya · Ejderha/Ogre/Kaos → İçgüdü ·
 * Cüce/Süvari/Gnom → Demircilik) ve **Şaman (id 7) de Demircilik grubunda**.
 *
 * ⚠️⚠️ Bu 2026-08-09'da GÖRÜLDÜ ama şu gerekçeyle **reddedildi**: *"motorda Şaman hp üzerinden
 * hasar vermiyor, dolayısıyla `atk` ölçeklemesi ona dokunmaz"*. Gerekçe yanlıştı — Şaman'ın
 * `hp`si hasar vermek için değil **EMMEK** için okunuyor:
 *
 *     dealType():  pool -= shamanShield(def, ...)      // = poolHp × adet   (faz 1-2)
 *
 * O günkü sonda *"Şaman'ın hasar verdiği bir kurulum"* aradığı için sessiz kaldı; aranması
 * gereken *"emilen miktarın gelen havuza oranla büyük olduğu bir kurulum"*du.
 *
 * ── 2. TILSIM'IN BİRİM SÜZGECİ YOK ─────────────────────────────────────────────────────────
 * Teknik uygulayıcılarının **iki ailesi** var ve fark tek satır:
 *
 *     atk aileleri   FUN_004123fc / FUN_00412464 …  →  if (FUN_0041279c(birim) == grup) {…}
 *     Zırh · Büyücülük · Tılsım                     →  if (seviye != 0) {…}   ← SÜZGEÇ YOK
 *
 * Dokümanın birim başına *"Etkilendiği Teknikler"* listeleri süzgeç değil **betimleme**; aynı
 * yanılgı daha önce Zırh'ta (*"Kaos hariç"*) ve Büyücülük'te (*"Büyü Kalkanı"*) da yakalanmıştı.
 * Mancınık `mAtk` = 240 taşıdığı için Tılsım ona **ölçülebilir** biçimde işliyor.
 *
 * Ayrıntı ve binary alıntıları: `docs/TILSIM_SUZGEC_TESTLERI.md` · `packages/catalog/src/techs.ts`.
 */
import { describe, expect, it } from 'vitest';
import { TECH_BY_UNIT, UNITS_BY_ID } from '@mobilwar/catalog';
import { applyTech, simulate } from '../src/index.ts';
import type { SimulateInput } from '../src/index.ts';

const side = (counts: Record<string, number>, tech: Record<string, number> = {}) => ({
  counts, tech, heroes: [], temple: 0, heroCount: 0,
});

const mean = (o: Partial<SimulateInput> & Pick<SimulateInput, 'attacker' | 'defender'>) => {
  const N = 8;
  const acc = { atk: 0, def: 0, xp: 0, a: {} as Record<string, number>, d: {} as Record<string, number> };
  for (let i = 0; i < N; i++) {
    const r = simulate({ night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: `tc-${i}`, ...o });
    acc.atk += r.attacker.lost / N; acc.def += r.defender.lost / N; acc.xp += r.xp / N;
    for (const [k, v] of Object.entries(r.attacker.counts)) acc.a[k] = (acc.a[k] ?? 0) + v / N;
    for (const [k, v] of Object.entries(r.defender.counts)) acc.d[k] = (acc.d[k] ?? 0) + v / N;
  }
  return acc;
};

describe('katalog ↔ binary grup eşlemesi', () => {
  /**
   * ⭐ `FUN_0041279c` bir **switch**: her savaşçı tam olarak bir `atk` grubuna düşüyor.
   * Bu test o yapıyı kilitliyor — bir savaşçının grubu unutulursa (Şaman'da olan tam buydu)
   * kırılır. Savaş-dışı birimler (Kuş/Araba) binary'de grup 1'de ama `hp`leri 0 → dışarıda.
   */
  it('⭐⭐ HER savaşçının tam olarak BİR `atk` tekniği var', () => {
    const warriors = ['dwarf', 'elf', 'cavalry', 'pegasus', 'dragon', 'mangonel', 'ogre',
      'shaman', 'gnome', 'chaos'];
    for (const id of warriors) {
      const atk = (TECH_BY_UNIT[id] ?? []).filter(([, stat]) => stat === 'atk');
      expect(atk.length, `${id} → ${JSON.stringify(atk)}`).toBe(1);
    }
  });

  it('⭐ Şaman Demircilik grubunda (binary id 7 = Cüce/Süvari/Gnom ile aynı)', () => {
    const atk = (TECH_BY_UNIT['shaman'] ?? []).find(([, s]) => s === 'atk');
    expect(atk?.[0]).toBe('blacksmithing');
    expect((TECH_BY_UNIT['dwarf'] ?? []).find(([, s]) => s === 'atk')?.[0]).toBe('blacksmithing');
  });

  /**
   * ⭐⭐ SÜZGEÇSİZ AİLE: Zırh ve Tılsım her savaşçıya işliyor. Kaos 2026-08-09'da ölçümle,
   * Mancınık 2026-08-12'de hem okumayla hem ölçümle bu listelere girdi.
   */
  it('⭐⭐ Zırh ve Tılsım İSTİSNASIZ tüm savaşçılarda', () => {
    const warriors = ['dwarf', 'elf', 'cavalry', 'pegasus', 'dragon', 'mangonel', 'ogre',
      'shaman', 'gnome', 'chaos'];
    for (const id of warriors) {
      const t = (TECH_BY_UNIT[id] ?? []).map(([tid]) => tid);
      expect(t, `${id} Zırh`).toContain('armor');
      expect(t, `${id} Tılsım`).toContain('talisman');
    }
  });
});

describe('⭐⭐⭐ ŞAMAN KANALI — Demircilik emme gücünü büyütüyor', () => {
  /**
   * 2026-08-09'un sondasının göremediği kanal. `applyTech` düzeyinde apaçık:
   * Demircilik Şaman'ın `poolHp`sini ölçekliyor ve `shamanShield` tam olarak onu okuyor.
   */
  it('Demircilik Şaman`ın poolHp`sini ölçekliyor (emmenin ham maddesi)', () => {
    const base = applyTech(UNITS_BY_ID['shaman']!, {});
    const d14 = applyTech(UNITS_BY_ID['shaman']!, { blacksmithing: 14 });
    expect(base.poolHp).toBe(200);
    expect(d14.poolHp).toBeCloseTo(200 * 1.7, 6);   // 1 + 14 × 0,05
  });

  /**
   * ⭐⭐⭐ DOĞRU SONDA. 2026-08-09'daki sonda Şaman'ın *hasar verdiği* bir kurulum arıyordu ve
   * fark **2 birim** çıktı. Aranması gereken, emilen miktarın gelen havuza oranla büyük olduğu
   * bir kurulum: burada 2 turluk izolasyonda savunanın Şamanı saldıranın havuzunu emiyor.
   *
   * ⚠️ Bu test Demircilik 0 ↔ 14 farkını ölçüyor; teknik 0'da iki dünya AYNI olduğu için
   * 2026-08-11 Şaman↔Kalkan seti (hepsi teknik 0) bu hatayı **göremezdi**. Kör noktanın
   * kaydı da bu.
   */
  it('⭐⭐⭐ savunanın Demirciliği kendi kaybını YARIYA indiriyor (emme kanalı)', () => {
    const attacker = side({ mangonel: 300 });
    const d0 = mean({ attacker, defender: side({ elf: 27_000, shaman: 450 }) });
    const d14 = mean({
      attacker,
      defender: side({ elf: 27_000, shaman: 450 }, { blacksmithing: 14 }),
    });
    /* ⚠️ Savunanda Demircilik'ten etkilenen BAŞKA birim yok — Elf Okçuluk grubunda. Yani
     * gözlenen fark tek kanaldan geliyor: Şaman'ın emdiği miktar 90.000 → 153.000. */
    expect(d0.def).toBeGreaterThan(400);            // ölçüm: 470,6
    expect(d14.def).toBeLessThan(d0.def * 0.6);     // ölçüm: 206,1
  });

  it('⚠️ Şamansız savunanda Demircilik HİÇBİR ŞEY değiştirmez (kontrol)', () => {
    const attacker = side({ mangonel: 300 });
    const d0 = mean({ attacker, defender: side({ elf: 27_000 }) });
    const d14 = mean({ attacker, defender: side({ elf: 27_000 }, { blacksmithing: 14 }) });
    expect(d14.def).toBeCloseTo(d0.def, 1);
  });
});

describe('⭐⭐ TILSIM KANALI — Mancınık da ölçekleniyor', () => {
  it('Tılsım Mancınık`ın mAtk`ini (faz-3 mitigasyonu) büyütüyor', () => {
    const base = applyTech(UNITS_BY_ID['mangonel']!, {});
    const t14 = applyTech(UNITS_BY_ID['mangonel']!, { talisman: 14 });
    expect(base.mAtk).toBe(240);
    expect(t14.mAtk).toBeCloseTo(240 * (1 + 14 * 0.06), 6);
    // ⚠️ Büyü SALDIRISI hâlâ yok — doküman orada haklı.
    expect(t14.poolMagicHp).toBe(0);
  });

  it('⭐ Tılsım Mancınık`ın savaştaki dayanıklılığını ölçülebilir biçimde artırıyor', () => {
    /* ⚠️ Savunan Ejderha sayısı kritik: 250+ Ejderha Mancınığın TAMAMINI süpürüyor ve iki
     * koşum da 0 veriyor — ilk denemede tam bu oldu, fark görünmüyordu. 150'de kısmi kayıp var. */
    const defender = side({ dragon: 150 });     // büyü baskısı baskın (faz 3)
    const t0 = mean({ attacker: side({ mangonel: 600 }), defender });
    const t14 = mean({ attacker: side({ mangonel: 600 }, { talisman: 14 }), defender });
    expect(t0.a['mangonel']!).toBeGreaterThan(0);       // ölçüm: 439
    expect(t14.a['mangonel']!).toBeGreaterThan(t0.a['mangonel']! + 30);   // ölçüm: 493
  });
});

/**
 * ⭐⭐⭐ ALTIN SAVAŞ — kullanıcının binary simülatörde koştuğu rastgele kurulum (2026-08-12).
 *
 * Bu setin **varlık sebebi**: iki düzeltme de tek tek doğru görünse bile, birlikte gerçek bir
 * savaşı tutturmaları gerekiyor. Sapma %17,8'den **%0,2**'ye indi.
 *
 * ⚠️ Beklentiler ±%3 bandında: binary tek koşum (jitter ±%0,1) ve motor 8 seed ortalaması;
 * ayrıca kalan sayıların yuvarlanması küçük birimlerde ±1 oynatıyor. Bandı daraltmak testi
 * kırılgan yapar, genişletmek düzeltmeyi doğrulamaz.
 */
describe('⭐⭐⭐ altın savaş — binary ile birebir (2026-08-12)', () => {
  const A = {
    dwarf: 1248, elf: 4151, cavalry: 1500, pegasus: 1000, dragon: 144, mangonel: 333,
    ogre: 250, shaman: 1200, cargo_wagon: 566, gnome: 67,
  };
  const D = {
    dwarf: 2474, elf: 3121, cavalry: 1750, pegasus: 957, dragon: 200, mangonel: 179,
    ogre: 300, shaman: 965, spy_bird: 3241, cargo_wagon: 412, gnome: 99,
  };
  const TA = { archery: 13, blacksmithing: 14, sorcery: 15, armor: 9, chemistry: 11, instinct: 12, talisman: 14 };
  const TD = { archery: 12, blacksmithing: 14, sorcery: 10, armor: 7, chemistry: 13, masonry: 9, instinct: 11, talisman: 15 };
  /** Binary'nin «kalan asker» sütunu, birebir ekran görüntüsünden. */
  const BIN_A: Record<string, number> = {
    dwarf: 643, elf: 2144, cavalry: 803, pegasus: 523, dragon: 76, mangonel: 173,
    ogre: 130, shaman: 822, cargo_wagon: 566, gnome: 67,
  };
  const BIN_D: Record<string, number> = {
    dwarf: 807, elf: 1092, cavalry: 536, pegasus: 293, dragon: 65, mangonel: 61,
    ogre: 93, shaman: 544, spy_bird: 1283, cargo_wagon: 164, gnome: 0,
  };

  const r = mean({ attacker: side(A, TA), defender: side(D, TD) });

  it('⭐ toplam kayıplar ve kahraman deneyimi', () => {
    expect(r.atk).toBeGreaterThan(4512 * 0.97);   // binary 4.512 (eski motor 5.316)
    expect(r.atk).toBeLessThan(4512 * 1.03);
    expect(r.def).toBeGreaterThan(8760 * 0.97);   // binary 8.760
    expect(r.def).toBeLessThan(8760 * 1.03);
    expect(r.xp).toBeGreaterThan(8404 * 0.97);    // binary 8.404 (eski motor 10.695)
    expect(r.xp).toBeLessThan(8404 * 1.03);
  });

  it('⭐⭐ 21 birim hücresinin HEPSİ ±%3 içinde', () => {
    for (const [id, want] of Object.entries(BIN_A)) {
      if (want === 0) continue;
      expect(r.a[id] ?? 0, `saldıran ${id}`).toBeGreaterThan(want * 0.97);
      expect(r.a[id] ?? 0, `saldıran ${id}`).toBeLessThan(want * 1.03);
    }
    for (const [id, want] of Object.entries(BIN_D)) {
      if (want === 0) continue;
      expect(r.d[id] ?? 0, `savunan ${id}`).toBeGreaterThan(want * 0.97);
      expect(r.d[id] ?? 0, `savunan ${id}`).toBeLessThan(want * 1.03);
    }
  });

  /**
   * ⚠️ Mancınık, iki düzeltmenin İKİNCİSİNİN tek ölçülebilir tanığı: Şaman düzeltmesinden
   * sonra bile −%8,2 / −%16,4 sapıyordu. Ayrı bir test olarak duruyor ki bir gün Tılsım
   * listesinden çıkarılırsa hangi kanalın kırıldığı tek bakışta görünsün.
   */
  it('⭐ Mancınık — Tılsım düzeltmesinin tanığı', () => {
    expect(r.a['mangonel'] ?? 0).toBeGreaterThan(165);   // binary 173, düzeltme öncesi 159
    expect(r.d['mangonel'] ?? 0).toBeGreaterThan(57);    // binary  61, düzeltme öncesi  51
  });
});
