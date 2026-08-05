/**
 * ⭐ BÜYÜ KALKANI BÜTÜNLÜĞÜ (§13.21) — 2026-07-29'da binary'den çözülen mekanik.
 */
import { describe, expect, it } from 'vitest';
import { simulate } from '../src/index.ts';

/* ═══ §13.21 BÜYÜ KALKANI BÜTÜNLÜĞÜ ════════════════════════════════════════
 * 2026-07-29 binary analizi: kalkan Sur ile AYNI savunma-yapıları listesinde duran ve AYNI
 * hasar formülünden geçen bir birimdir (`HasarKayipCekirdegi`); simülatörün ekranında ikisi de
 * yüzde gösterilir. Motorda ise kalkan pasif bir çarpandı ve hiç yıpranmıyordu.
 */
describe('§13.21 Büyü Kalkanı bütünlüğü', () => {
  const atk = (counts: Record<string, number>) => ({
    counts, tech: {}, heroes: [], temple: 0, heroCount: 0,
  });

  it('kalkan yoksa bütünlük null', () => {
    const r = simulate({
      attacker: atk({ dwarf: 100 }), defender: atk({ dwarf: 50 }),
      night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'k1',
    });
    expect(r.defender.shieldIntegrity).toBeNull();
  });

  it('küçük büyü saldırısında kalkan YIPRANMAZ (pay < mitigasyon)', () => {
    const r = simulate({
      attacker: atk({ dwarf: 200 }),                 // fiziksel ordu, büyü havuzu yok denecek kadar
      defender: atk({ dwarf: 200, magic_shield: 3 }),
      night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'k2',
    });
    expect(r.defender.shieldIntegrity).toBe(1);
  });

  it('⭐ ezici büyü saldırısında kalkan gözle görülür biçimde ERİR', () => {
    const r = simulate({
      // Pegasus + Şaman = ağır büyü havuzu (simülatör ekran görüntüsündeki senaryonun çekirdeği).
      attacker: atk({ pegasus: 678, shaman: 2500, cavalry: 611, elf: 545, dwarf: 354, ogre: 145 }),
      defender: atk({ dwarf: 145, elf: 249, cavalry: 345, ogre: 300, wall: 2, magic_shield: 1 }),
      night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'k3',
    });
    const s = r.defender.shieldIntegrity!;
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
    // ⚠️ Simülatör bu senaryoda %61,23 diyor; motor %80 civarı. MEKANİZMA doğru (kalkan yalnız
    //    ezici büyüde ve gerçekten eriyor), BÜYÜKLÜK henüz kalibre değil — bu test yönü kilitler,
    //    sayıyı değil. Kalibrasyon için birden çok simülatör örneği gerekiyor.
    expect(s).toBeLessThan(0.95);
  });

  it('kalkan yıpransa bile SEVİYE düşmez (bütünlük ayrı bir eksen)', () => {
    const r = simulate({
      attacker: atk({ pegasus: 2000, shaman: 5000 }),
      defender: atk({ dwarf: 50, magic_shield: 2 }),
      night: false, nightVisionAttacker: 0, nightVisionDefender: 0, seed: 'k4',
    });
    expect(r.defender.counts['magic_shield']).toBe(2);
    expect(r.defender.shieldIntegrity).toBeLessThanOrEqual(1);
  });
});

/**
 * ⭐ SAVAŞ-DIŞI BİRİMLER "AYAKTA ORDU" SAYILMAZ (kullanıcı, 2026-08-05).
 *
 * ⚠️ Motorda "bu ordu hâlâ ayakta mı" sorusunun İKİ cevabı vardı: tur döngüsü savaş-dışı
 * birimleri saymıyordu, kazanan kararı sayıyordu. Sonuç bir İSTİSMARDI: casus kuş yığmak
 * şehri dokunulmaz yapıyordu — hiç vuruşma olmuyor, iki tarafın da kaybı 0 kalıyor ve
 * "eşitlikte savunan" kuralı savunanı kazanan ilan ediyordu; saldıran ganimet de alamıyordu.
 *
 * ⚠️ Kullanıcı bunu binary simülatörle çapraz doğruladı: *"aynı 120 cüceye karşı 1000 casus
 * kuş savaşında saldıran kazanıyor, çünkü savunanın bir askeri yok, casus kuş zaten savaşmaz.
 * Savaşın 1 tur sürüp saldıranın kazanması gerekir."*
 */
describe('savaş-dışı birimler savunanı ayakta tutmaz', () => {
  const attack = (defender: Record<string, number>) => simulate({
    seed: 'noncombat', night: false,
    attacker: { counts: { dwarf: 120 } },
    defender: { counts: defender },
  });

  it('⭐ 1000 casus kuş: savaş 1 TUR sürer ve SALDIRAN kazanır', () => {
    const r = attack({ spy_bird: 1000 });
    expect(r.winner).toBe('attacker');
    expect(r.turns).toBe(1);
    // Hiç vuruşma olmadı: kuşlar savaşmaz, saldıranın kaybı da yok.
    expect(r.attacker.lost).toBe(0);
    expect(r.defender.lost).toBe(0);
  });

  /** Yük arabası ve gnom da `NONCOMBAT` — aynı muafiyet onlarda da vardı. */
  it('yük arabası ve gnom da savunanı kazandırmaz', () => {
    expect(attack({ cargo_wagon: 500 }).winner).toBe('attacker');
    expect(attack({ gnome: 500 }).winner).toBe('attacker');
  });

  /**
   * ⚠️ **Kıyas grubu — düzeltmenin fazla ileri gitmediğinin kanıtı.** Bunların hepsi ZATEN
   * saldıranı kazandırıyordu ve öyle kalmalı; kırılan tek durum savunanda yalnız savaş-dışı
   * birim bulunmasıydı.
   */
  it('boş şehir · tek cüce · yalnız sur: davranış DEĞİŞMEDİ (saldıran kazanır)', () => {
    expect(attack({}).winner).toBe('attacker');
    expect(attack({ dwarf: 1 }).winner).toBe('attacker');
    expect(attack({ wall: 3 }).winner).toBe('attacker');
  });

  /**
   * ⭐ **Çekişmeli savaş dalı DEĞİŞMEDİ** — regresyon çivisi.
   *
   * ⚠️ Bu testin adı bir ara *"eşit kayıpta savunan kazanır"* idi ve bu **yanıltıcıydı**:
   * eşit ORDULAR eşit `lossMag` üretmiyor (savunanın vuruşuna `counterK` çarpanı biniyor),
   * dolayısıyla test kendi adının iddia ettiği şeyi ölçmüyordu — tohuma göre saldıran da
   * kazanabiliyor. Ölçülen gerçek şey şu: iki tarafın da savaşçısı varken sonuç **kayıp
   * büyüklüğünden** çıkıyor ve bu dal düzeltmeden etkilenmedi. Değer tohuma çivilendi.
   */
  it('iki tarafın da savaşçısı varken sonuç kayıp büyüklüğünden çıkar', () => {
    const r = simulate({
      seed: 'esit', night: false,
      attacker: { counts: { dwarf: 100 } },
      defender: { counts: { dwarf: 100 } },
    });
    expect(r.winner).toBe('defender');
    // Gerçekten vuruşma oldu — "kimse savaşmadı" dalına düşmedi.
    expect(r.attacker.lost).toBeGreaterThan(0);
    expect(r.defender.lost).toBeGreaterThan(0);
  });

  /** ⚠️ Simetri: saldıran da yalnız savaş-dışı birim gönderirse KAZANAMAZ. */
  it('saldıran yalnız yük arabası gönderirse savunan kazanır', () => {
    const r = simulate({
      seed: 'yuk', night: false,
      attacker: { counts: { cargo_wagon: 50 } },
      defender: { counts: { dwarf: 10 } },
    });
    expect(r.winner).toBe('defender');
  });
});
