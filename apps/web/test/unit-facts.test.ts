/**
 * ⭐ BİRİM BİLGİ KUTUSUNUN TÜRETİLMİŞ OLGULARI (`lib/unit-facts.ts`).
 *
 * Kullanıcı isteği (2026-08-11): Baraka'daki askerlerin yanına bilgi kutusu, *"kaynak tabii ki
 * savaş motoru olacak"*.
 *
 * ⚠️⚠️ **Bu testlerin asıl bekçilik ettiği şey, listenin ELLE yazılmamış olması.** Oyunun kendi
 * dokümanı (`docs/referans/tekniklere_ve_yapilara_iliskin_on_bilgiler.txt`) motorla **üç yerde**
 * çelişiyor ve üçü de binary ölçümüyle çürütülmüş iddialar. Aşağıdaki üç yıldızlı test tam
 * olarak o üç noktayı tutuyor: biri kırılırsa ya motor değişmiştir ya da liste sabitlenmiştir —
 * ikisi de görülmesi gereken şeyler.
 */
import { describe, expect, it } from 'vitest';
import { UNITS_BY_ID, WARRIOR_ORDER, DEFENSE_ORDER } from '@mobilwar/catalog';
import { unitStats, unitStrikeLabel, unitTechNames } from '../src/lib/unit-facts.ts';
import { UNIT_INFO } from '../src/lib/info-texts.ts';

describe('etkilendiği teknikler — motordan türetiliyor', () => {
  it('sıradan bir savaşçı: Akademi ekranıyla AYNI sırada', () => {
    // TECH_ORDER: Okçuluk → Demircilik → … → Büyücülük → … → Zırh → … → Tılsım
    expect(unitTechNames('pegasus')).toEqual(['Okçuluk', 'Büyücülük', 'Zırh', 'Tılsım']);
    expect(unitTechNames('dwarf')).toEqual(['Demircilik', 'Zırh', 'Tılsım']);
  });

  /**
   * ⭐ Bu testi yazarken **dokümanın kendi içinde çeliştiğini** bulduk: Elf maddesi
   * *"Etkilendiği Teknikler: … Büyücülük"* diyor ama aynı dosyanın TEKNİKLER bölümündeki
   * Büyücülük listesinde (*"Şaman, Pegasus, Ejderha, Kaos, Büyü Kalkanı"*) Elf **yok**.
   * Motor ikincisini uyguluyor ve haklı: Elf'in `magicHp`si 0, yani Büyücülük ona uygulansa
   * bile ölçülebilir hiçbir şey yapmazdı.
   */
  it('⭐ Elf Büyücülük\'ten etkilenmez — `magicHp` = 0', () => {
    expect(unitTechNames('elf')).toEqual(['Okçuluk', 'Zırh', 'Tılsım']);
    expect(UNITS_BY_ID['elf']!.magicHp).toBe(0);
  });

  it('⭐ Kaos Zırh ve Tılsım listesinde — dokümanın «Kaos hariç» ifadesi ÇÜRÜTÜLDÜ', () => {
    const t = unitTechNames('chaos');
    expect(t).toContain('Zırh');
    expect(t).toContain('Tılsım');
  });

  it('⭐ Ogre Demircilik\'ten etkilenmez — tek `atk` tekniği İçgüdü', () => {
    expect(unitTechNames('ogre')).not.toContain('Demircilik');
    expect(unitTechNames('ogre')).toContain('İçgüdü');
  });

  it('⭐ Büyü Kalkanı\'nı TILSIM ölçekler, Büyücülük değil', () => {
    /**
     * ⚠️ Beklenti 2026-08-11'de `['Tılsım']` → `['Tılsım (%5)']` oldu: Tılsım'ın Kalkan'daki
     * oranı savaşçılardan (%6) FARKLI ve popover artık onu yazıyor. Listenin **tek üyeli**
     * kalması bu testin asıl iddiası — Büyücülük'ün girmemesi.
     */
    expect(unitTechNames('magic_shield')).toEqual(['Tılsım (%5)']);
  });

  /**
   * ⚠️⚠️ **BEKLENTİ 2026-08-12'de TERSİNE DÖNDÜ: `['Zırh','Kimya']` → `['Zırh','Kimya','Tılsım']`.**
   *
   * Eski hâli oyunun kendi dokümanının Mancınık maddesine (*"Etkilendiği Teknikler: Zırh,
   * Kimya"*) dayanıyordu ve **bu setin baştaki uyarısının dördüncü örneği** oldu. Ghidra:
   * Tılsım'ın uygulayıcısı `FUN_004125c8` yalnız `seviye != 0`'a bakıyor, `atk` ailelerindeki
   * `FUN_0041279c` grup süzgeci onda **yok** → Tılsım her savaşçıya işliyor.
   * Ölçüm de doğruladı (gerçek savaşta Mancınık kalanı 159 → 172, binary 173).
   *
   * ⭐ Dokümanın *"Büyü güçleri yoktur"* ifadesi yanlış değil — ama `magicHp` hakkında
   * (Mancınık büyü havuzuna katkı vermez). Tılsım'ın ölçeklediği `mAtk` ise faz-3
   * **mitigasyonu** ve Mancınık'ta 240. Klasik stat-adı yanılsaması.
   */
  it('⭐ Mancınık Tılsım listesinde VAR — «süzgeç yok» mimarisi (2026-08-12)', () => {
    expect(unitTechNames('mangonel')).toEqual(['Zırh', 'Kimya', 'Tılsım']);
    expect(UNITS_BY_ID['mangonel']!.magicHp, 'büyü SALDIRISI yok — doküman burada haklı').toBe(0);
    expect(UNITS_BY_ID['mangonel']!.mAtk, 'ama faz-3 mitigasyonu var').toBeGreaterThan(0);
  });

  it('savaş statına dokunmayan teknikler listede GÖRÜNMEZ', () => {
    // Casusluk · Haritacılık · Sömürgecilik · Gece Görüş → `stat: null`
    for (const id of [...WARRIOR_ORDER, ...DEFENSE_ORDER]) {
      for (const yasak of ['Casusluk', 'Haritacılık', 'Sömürgecilik', 'Gece Görüş']) {
        expect(unitTechNames(id), `${id}`).not.toContain(yasak);
      }
    }
  });

  it('destek birimleri hiçbir teknikten etkilenmez (kutu bunu açıkça yazıyor)', () => {
    expect(unitTechNames('cargo_wagon')).toEqual([]);
    expect(unitTechNames('spy_bird')).toEqual([]);
  });
});

describe('vuruş fazı', () => {
  it('tip 1 menzilli, tip 2 yakın dövüş', () => {
    expect(unitStrikeLabel('elf')).toBe('Menzilli');
    expect(unitStrikeLabel('dwarf')).toBe('Yakın dövüş');
  });

  it('⭐ büyü canı olan birim İKİ fazda birden vurur', () => {
    // Motorda büyü havuzuna tip süzgeci YOK: `magicHp` > 0 olan herkes girer.
    expect(unitStrikeLabel('pegasus')).toBe('Menzilli · Büyü');
    expect(unitStrikeLabel('dragon')).toBe('Menzilli · Büyü');
    expect(unitStrikeLabel('chaos')).toBe('Yakın dövüş · Büyü');
  });

  it('havuza girmeyen ve hasar vermeyen birimlerde etiket YOK', () => {
    for (const id of ['shaman', 'gnome', 'spy_bird', 'cargo_wagon', 'trap']) {
      expect(unitStrikeLabel(id), id).toBeNull();
    }
  });
});

describe('özellik satırları', () => {
  const id = (n: number): string => String(n);

  it('sıfır değerli satır ÇİZİLMEZ', () => {
    // Muhafız: hız 0 (sefere çıkmaz), taşıma 0, savunmada alan yok → yalnız Vuruş kalır.
    expect(unitStats('guard', id).map((s) => s.label)).toEqual(['Vuruş']);
    // Cüce: dördü de dolu.
    expect(unitStats('dwarf', id).map((s) => s.label))
      .toEqual(['Hız', 'Taşıma kapasitesi', 'Alan', 'Vuruş']);
  });

  /**
   * ⭐⭐ Kullanıcı kararı (2026-08-11): *"savunma üniteleri için alan tanımı olmasın; dokümanda
   * yazıyor ama oyunda efektif olarak kullanmadık."*
   *
   * Dayanağı ölçülebilir: savunmanın alan bütçesi `defenseCapacity` ve o kural
   * `capacity.service.ts`te **kapalı** (`enforced: false`) — yani savunma birimi alanı oyuncunun
   * hiçbir kararını değiştirmiyor. Savaşçıda ise alan Mağara kapasitesini tüketiyor, orada kalıyor.
   *
   * ⚠️ Bu test, `defenseCapacity.enforced` bir gün `true` olursa kırılmaz — o zaman satırı geri
   * getirmek bilinçli bir karar olmalı ve testin de birlikte değişmesi gerekir.
   */
  it('⭐⭐ HİÇBİR savunma ünitesinde «Alan» yok, her savaşçıda VAR', () => {
    for (const unitId of DEFENSE_ORDER) {
      expect(unitStats(unitId, id).map((s) => s.label), unitId).not.toContain('Alan');
    }
    for (const unitId of WARRIOR_ORDER) {
      expect(unitStats(unitId, id).map((s) => s.label), unitId).toContain('Alan');
    }
  });

  it('⚠️ sunucudan gelen sayı katalogtakini EZER (ekrandaki her sayının tek kaynağı sunucu)', () => {
    const rows = unitStats('dwarf', id, { area: 99, speed: 7, carry: 3 });
    expect(rows.find((r) => r.label === 'Alan')?.value).toBe('99');
    expect(rows.find((r) => r.label === 'Hız')?.value).toBe('7');
    expect(rows.find((r) => r.label === 'Taşıma kapasitesi')?.value).toBe('3');
  });
});

describe('kapsam', () => {
  it('⭐ Baraka ve Savunma\'da görünen HER birimin açıklaması var', () => {
    for (const unitId of [...WARRIOR_ORDER, ...DEFENSE_ORDER]) {
      expect(UNIT_INFO[unitId], `açıklama eksik: ${unitId}`).toBeTruthy();
    }
  });

  it('açıklaması olan her id katalogda GERÇEKTEN var (yazım hatası bekçisi)', () => {
    for (const unitId of Object.keys(UNIT_INFO)) {
      expect(UNITS_BY_ID[unitId], `katalogda yok: ${unitId}`).toBeTruthy();
    }
  });
});

/**
 * ⭐⭐ BİRİME ÖZEL TEKNİK ORANI (2026-08-11) — Savunma sayfasındaki Büyü Kalkanı popover'ı.
 *
 * Tılsım savaşçılarda %6, Kalkan'da **%5**. Popover yalnız teknik ADINI yazdığı sürece oyuncu
 * Akademi'deki %6'yı Kalkan'a da uyguluyordu. Oran `rateByUnit`ten türetiliyor; elle yazılmıyor.
 */
describe('birime özel teknik oranı', () => {
  it('⭐ Büyü Kalkanı listesinde Tılsım kendi oranıyla görünür', () => {
    expect(unitTechNames('magic_shield')).toContain('Tılsım (%5)');
  });

  it('⚠️ istisnası olmayan birimde oran YAZILMAZ — liste gürültüye dönmesin', () => {
    // Ejderha da Tılsım'dan etkileniyor ama genel oranla (%6) → yalnız ad.
    expect(unitTechNames('dragon')).toContain('Tılsım');
    expect(unitTechNames('dragon')).not.toContain('Tılsım (%6)');
  });
});
