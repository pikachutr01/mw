/**
 * ⭐ TEKNİK BİLGİ KUTUSUNUN TÜRETİLMİŞ OLGULARI (`lib/tech-facts.ts`).
 *
 * Kullanıcı isteği (2026-08-11): Akademi'deki tekniklere de bilgi kutusu;
 * *"Buradaki değerlerin yerine gerçek motorda ölçülen değerleri dinamik olarak alsın."*
 *
 * ⚠️⚠️ Bu testlerin bekçilik ettiği şey **oranın ve listenin elle yazılmamış olması**. Referans
 * doküman Tılsım'ı %5 diyor, motor %6 uyguluyor (iki bağımsız binary ölçümüyle doğrulandı) —
 * ilk test tam olarak o farkı tutuyor. Sabitlenirse popover eski yanlışı öğretmeye döner.
 */
import { describe, expect, it } from 'vitest';
import { TECHS_BY_ID, TECH_ORDER, maxCities } from '@mobilwar/catalog';
import { DEFAULT_MAP_CONFIG, mergeCombatConfig } from '@mobilwar/engine';
import {
  colonizationSteps, nightGapClosed, roadTimeFactor, spyTierLabels, techEffectLine, techUnitNames,
} from '../src/lib/tech-facts.ts';
import { TECH_INFO } from '../src/lib/info-texts.ts';

describe('etkisi satırı — oran katalogtan', () => {
  it('⭐ TILSIM %6 — referans doküman %5 diyor, motor ölçümü onu çürüttü', () => {
    expect(techEffectLine('talisman')).toContain('%6');
    expect(TECHS_BY_ID['talisman']!.rate).toBe(0.06);
  });

  it('%5 ve %6 grupları doğru ayrışıyor', () => {
    for (const id of ['archery', 'blacksmithing', 'chemistry', 'instinct', 'sorcery']) {
      expect(techEffectLine(id), id).toContain('%5');
    }
    for (const id of ['armor', 'masonry', 'talisman']) {
      expect(techEffectLine(id), id).toContain('%6');
    }
  });

  it('ölçeklenen büyüklük `stat` koduna göre yazılıyor', () => {
    expect(techEffectLine('archery')).toContain('vuruş gücünü');
    expect(techEffectLine('sorcery')).toContain('büyü vuruş gücünü');
    expect(techEffectLine('armor')).toContain('fiziksel korumasını');
    expect(techEffectLine('talisman')).toContain('büyü korumasını');
  });

  it('savaş statına dokunmayan teknikte etki satırı YOK', () => {
    for (const id of ['espionage', 'cartography', 'colonization', 'night_vision']) {
      expect(techEffectLine(id), id).toBeNull();
      expect(techUnitNames(id), id).toEqual([]);
    }
  });
});

describe('etkilediği birimler — liste katalogtan', () => {
  it('⭐ Zırh ve Tılsım listesinde KAOS var (dokümanın «Kaos hariç»i yanlış)', () => {
    expect(techUnitNames('armor')).toContain('Kaos');
    expect(techUnitNames('talisman')).toContain('Kaos');
  });

  it('⭐ Büyü Kalkanı\'nı TILSIM ölçekler; Büyücülük listesinde yok', () => {
    expect(techUnitNames('talisman')).toContain('Büyü Kalkanı');
    expect(techUnitNames('sorcery')).not.toContain('Büyü Kalkanı');
  });

  it('⭐ İçgüdü Ogre\'yi kapsar, Demircilik kapsamaz', () => {
    expect(techUnitNames('instinct')).toContain('Ogre');
    expect(techUnitNames('blacksmithing')).not.toContain('Ogre');
  });

  it('liste katalogla BİREBİR aynı uzunlukta (sessizce kırpılmıyor)', () => {
    for (const id of TECH_ORDER) {
      expect(techUnitNames(id).length, id).toBe(TECHS_BY_ID[id]!.units.length);
    }
  });
});

describe('savaş dışı tekniklerin çizelgeleri', () => {
  /**
   * ⭐⭐ `nightGapClosed`ün var olma sebebi bu test. Mutlak gece çarpanı `combat.nightBase`e
   * bağlı ve o sayı **panelden ayarlanabiliyor, istemciye de gelmiyor** — göstersek kutu
   * yönetici sayıyı değiştirdiği an yalan söylerdi. «Kapanan pay» ise tabandan BAĞIMSIZ.
   * Aşağıdaki iki koşu bunu ispatlıyor: taban 0,7 ile 0,4'te sonuç aynı.
   */
  it('⭐⭐ gece kaybının kapanan payı, ayarlanabilir TABANDAN bağımsız', () => {
    const sert = mergeCombatConfig({ night: { base: 0.4 } });
    const yumusak = mergeCombatConfig({ night: { base: 0.9 } });
    for (const lv of [1, 3, 9, 20]) {
      expect(nightGapClosed(lv, sert)).toBeCloseTo(nightGapClosed(lv, yumusak), 10);
    }
    // Motorun eğrisi `1 − 3/(L+3)`: sv1 çeyreği, sv3 yarısı, sv9 dörtte üçü.
    expect(nightGapClosed(1)).toBeCloseTo(0.25, 10);
    expect(nightGapClosed(3)).toBeCloseTo(0.5, 10);
    expect(nightGapClosed(9)).toBeCloseTo(0.75, 10);
  });

  it('haritacılık yol çarpanı harita adımından türüyor', () => {
    expect(roadTimeFactor(0)).toBe(1);
    // Varsayılan adım 0,05 → sv20'de yol süresi yarıya iner.
    expect(roadTimeFactor(20)).toBeCloseTo(0.5, 10);
    // ⚠️ SUNUCUDAN gelen config kazanır: panelden adım değiştirilebiliyor.
    const hizli = { ...DEFAULT_MAP_CONFIG, cartographyStep: 0.1 };
    expect(roadTimeFactor(10, hizli)).toBeCloseTo(0.5, 10);
  });

  it('sömürgecilik basamakları `maxCities` ile aynı şeyi söylüyor', () => {
    const steps = colonizationSteps();
    expect(steps).toEqual([
      { level: 3, cities: 2 }, { level: 6, cities: 3 },
      { level: 9, cities: 4 }, { level: 12, cities: 5 },
    ]);
    for (const s of steps) {
      expect(maxCities(s.level), `sv ${s.level}`).toBe(s.cities);
      // Bir önceki seviyede henüz açılmamış olmalı — basamak gerçekten orada.
      expect(maxCities(s.level - 1), `sv ${s.level - 1}`).toBe(s.cities - 1);
    }
  });

  it('casusluk kademeleri motorun listesiyle aynı sayıda ve sıralı', () => {
    const tiers = spyTierLabels();
    expect(tiers).toHaveLength(6);
    expect(tiers[0]!.gap).toBe('Geride');
    expect(tiers[1]!.gap).toBe('Eşit');
    expect(tiers[5]!.gap).toBe('+4 ve üzeri');
    // Ham kimlik sızmamalı — her kademenin oyuncuya görünen bir metni olmalı.
    for (const t of tiers) expect(t.text, t.gap).toMatch(/[a-zçğıöşü]/i);
    for (const t of tiers) expect(t.text).not.toMatch(/^[a-z]+[A-Z]/);   // 'armyTotals' gibi
  });
});

describe('kapsam', () => {
  it('⭐ Akademi\'de görünen HER tekniğin açıklaması var', () => {
    for (const id of TECH_ORDER) {
      expect(TECH_INFO[id], `açıklama eksik: ${id}`).toBeTruthy();
    }
  });

  it('açıklaması olan her id katalogda GERÇEKTEN var (yazım hatası bekçisi)', () => {
    for (const id of Object.keys(TECH_INFO)) {
      expect(TECHS_BY_ID[id], `katalogda yok: ${id}`).toBeTruthy();
    }
  });
});

/**
 * ⭐⭐ BİRİME ÖZEL ORAN İSTİSNASI (2026-08-11) — kullanıcının binary ölçümünden geldi.
 *
 * Tılsım savaşçılarda %6, **Büyü Kalkanı'nda %5**. Akademi kutusu tek oran yazıp Kalkan'ı da
 * etkilenen birimler listesine koyduğu sürece oyuncuya **yanlış** öğretiyordu; üstelik Kalkan
 * pahalı bir yapı ve oyuncu yatırım kararını o sayıya bakarak veriyor.
 *
 * ⚠️ Metin elle yazılmıyor, `TechDef.rateByUnit`ten türetiliyor — yeni bir istisna eklendiğinde
 * kutu kendiliğinden doğru kalsın diye. Bu testler o türetmeyi kilitliyor.
 */
describe('birime özel oran istisnası', () => {
  it('⭐ Tılsım satırı hem %6 hem Büyü Kalkanı %5 istisnasını yazar', () => {
    const line = techEffectLine('talisman')!;
    expect(line).toContain('%6');
    expect(line).toContain('İstisna');
    expect(line).toContain('Büyü Kalkanı %5');
  });

  it('katalogla tutarlı: istisna gerçekten %5 ve taban %6', () => {
    expect(TECHS_BY_ID['talisman']!.rateByUnit?.['magic_shield']).toBe(0.05);
    expect(TECHS_BY_ID['talisman']!.rate).toBe(0.06);
  });

  /**
   * ⭐⭐ İKİNCİ İSTİSNA: **Taş Ustalığı Sur'da %5** (2026-08-12, kullanıcı ölçümü).
   * `docs/SUR_TESTLERI.md` B grubu: Sur bütünlüğü Taş Ustalığı ile doğrusal, eğim
   * `8,3333 × oran` ve dört bağımsız tahmin 0,4167-0,4170 → oran **0,05003**.
   * ⚠️ Kule/Balista ölçülmedi, %6'da bırakıldı — kutu da bunu böyle yazmalı.
   */
  it('⭐ Taş Ustalığı satırı Sur istisnasını yazar (%6 taban, Sur %5)', () => {
    const line = techEffectLine('masonry')!;
    expect(line).toContain('%6');
    expect(line).toContain('İstisna');
    expect(line).toContain('Sur %5');
    expect(TECHS_BY_ID['masonry']!.rateByUnit?.['wall']).toBe(0.05);
    expect(TECHS_BY_ID['masonry']!.rate).toBe(0.06);
  });

  it('istisnası OLMAYAN teknikte fazladan cümle yok', () => {
    // ⚠️ `masonry` bu listeden 2026-08-12'de ÇIKARILDI — artık istisnası var (yukarı bak).
    for (const id of ['armor', 'archery', 'sorcery', 'blacksmithing']) {
      expect(techEffectLine(id), id).not.toContain('İstisna');
    }
  });
});
