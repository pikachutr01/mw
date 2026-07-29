/**
 * ⭐ CASUSLUK — kademe tablosu (doküman-birebir) + kesişim modeli altın testleri.
 *
 * Model kullanıcı tasarımı (2026-07-30): Kule+Elf VURUR, rakip kuşlar ENGELLER; ikisi de
 * casusluk seviye farkıyla `2^fark` ölçeklenir. Ağırlıklar `spy-balance.mjs` sweep'iyle
 * kalibre edildi — buradaki sayılar o kalibrasyonun kilididir, değişirlerse denge bozulur.
 */
import { describe, expect, it } from 'vitest';
import {
  SPY_CONSTANTS, spyEffectiveDiff, spyInterception, spyLevelFor, UNITS_BY_ID,
} from '../src/index.ts';

describe('bilgi kademesi (doküman-birebir, GÖNDERİLEN kuştan)', () => {
  it('8 kuş = +3 seviye · 16 kuş = +4 seviye', () => {
    expect(spyEffectiveDiff(0, 8, 0)).toBe(3);
    expect(spyEffectiveDiff(2, 16, 1)).toBe(5);
  });

  it('kademe tablosu', () => {
    expect(spyLevelFor(-1)).toBe('resources');
    expect(spyLevelFor(0)).toBe('economy');
    expect(spyLevelFor(1)).toBe('armyTotals');
    expect(spyLevelFor(2)).toBe('armyTypes');
    expect(spyLevelFor(3)).toBe('armyCounts');
    expect(spyLevelFor(4)).toBe('full');
    expect(spyLevelFor(9.2)).toBe('full');
  });

  it('256 ile 300 kuş AYNI kademeye denk gelir (2^8 bandı) — eşik 512', () => {
    expect(Math.floor(Math.log2(256))).toBe(Math.floor(Math.log2(300)));
    expect(Math.floor(Math.log2(512))).toBe(9);
  });
});

describe('kesişim modeli', () => {
  const base = { myEspionage: 5, theirEspionage: 5, towers: 0, elves: 0, defenderBirds: 0 };

  it('anti-hava yoksa (kule=elf=0) hiç kuş ölmez', () => {
    const r = spyInterception({ ...base, birds: 100, defenderBirds: 0 });
    expect(r.killed).toBe(0);
    expect(r.infoBirds).toBe(100);
  });

  it('⭐ TAM BLOK: eşit casuslukta rakipte gönderilen kadar kuş → bilgi SIZMAZ, kimse ölmez', () => {
    const r = spyInterception({ ...base, birds: 300, defenderBirds: 300 });
    expect(r.killed).toBe(0);          // kuş kuşu vurmaz
    expect(r.blocked).toBe(300);       // ama tamamını engeller
    expect(r.infoBirds).toBe(0);       // "kimse kimseden casusluk bilgisi alamaz"
    expect(r.survivors).toBe(300);     // hepsi eve döner — açmaz kansızdır
  });

  it("⭐ kullanıcının 256/300 örneği: K_vur=280'de 256'nın tamamı ölür, 300'den 20 kuş sızar", () => {
    const k256 = spyInterception({ ...base, birds: 256, towers: 280 });
    expect(k256.killed).toBe(256);
    expect(k256.infoBirds).toBe(0);

    const k300 = spyInterception({ ...base, birds: 300, towers: 280 });
    expect(k300.killed).toBe(280);
    expect(k300.infoBirds).toBe(20);
  });

  it('⭐ +1 casusluk seviyesi ≙ kuşları İKİYE katlamak (aynı oran ölçeğinde)', () => {
    // Savunma sabit; saldıran ya +1 seviye alır ya kuşları ikiye katlar → sızan oran aynı.
    const defans = { towers: 100, elves: 500, defenderBirds: 50 };
    const seviyeli = spyInterception({
      birds: 400, myEspionage: 6, theirEspionage: 5, ...defans,
    });
    const kalabalik = spyInterception({
      birds: 800, myEspionage: 5, theirEspionage: 5, ...defans,
    });
    expect(kalabalik.killed).toBe(seviyeli.killed * 2);
    expect(kalabalik.blocked).toBe(seviyeli.blocked * 2);
    expect(kalabalik.infoBirds).toBe(seviyeli.infoBirds * 2);
  });

  it('seviye farkı her iki kapasiteyi de 2^fark ölçekler, ±6 ile kırpılır', () => {
    const at = (my: number) => spyInterception({
      birds: 100_000, myEspionage: my, theirEspionage: 10,
      towers: 100, elves: 0, defenderBirds: 100,
    });
    expect(at(10).killed).toBe(100);
    expect(at(9).killed).toBe(200);       // savunan +1 → ×2
    expect(at(12).killed).toBe(25);       // saldıran +2 → ÷4
    expect(at(0).killed).toBe(6_400);     // fark 10 ama kırpma 6 → ×64
    expect(at(0).blocked).toBe(6_400);
  });

  it('monotonluk: savunma arttıkça bilgi kuşu azalır, kuş arttıkça artar', () => {
    const bilgi = (birds: number, towers: number) => spyInterception({
      birds, myEspionage: 5, theirEspionage: 5, towers, elves: 0, defenderBirds: 0,
    }).infoBirds;
    expect(bilgi(200, 50)).toBeGreaterThan(bilgi(200, 150));
    expect(bilgi(400, 150)).toBeGreaterThan(bilgi(200, 150));
    expect(bilgi(100, 100)).toBe(0);
    expect(bilgi(100, 0)).toBe(100);
  });

  it('önce vurulur, kalanlar engellenir — engel ölüleri kapsamaz', () => {
    const r = spyInterception({
      birds: 100, myEspionage: 5, theirEspionage: 5,
      towers: 60, elves: 0, defenderBirds: 70,
    });
    expect(r.killed).toBe(60);
    expect(r.blocked).toBe(40);           // kalan 40, jam kapasitesi 70 ama kuş kalmadı
    expect(r.infoBirds).toBe(0);
    expect(r.survivors).toBe(40);
  });
});

describe('maliyet dengesi (sweep kilidi)', () => {
  it('engelleme başına maliyet: kuş < kule < elf — adanmış sayaç daima kuş', () => {
    const bird = UNITS_BY_ID['spy_bird']!;
    const tower = UNITS_BY_ID['archer_tower']!;
    const elf = UNITS_BY_ID['elf']!;
    const per = (u: { gold: number; food: number }, w: number) => (u.gold + u.food) / w;

    const kusMaliyet = per(bird, SPY_CONSTANTS.wBird);      // 300
    const kuleMaliyet = per(tower, SPY_CONSTANTS.wTower);   // 750
    const elfMaliyet = per(elf, SPY_CONSTANTS.wElf);        // 5.500

    expect(kusMaliyet).toBeLessThan(kuleMaliyet);
    expect(kuleMaliyet).toBeLessThan(elfMaliyet);
    // Bandın kendisi de kilitli: oynarsa sweep yeniden koşulmalı.
    expect(kusMaliyet).toBe(300);
    expect(kuleMaliyet).toBe(750);
    expect(elfMaliyet).toBe(5_500);
  });

  it('erken oyunda casusluk imkânsız değil: 10 kule + 100 elf eşit seviyede 31 kuşla sızılır', () => {
    const r = spyInterception({
      birds: 31, myEspionage: 1, theirEspionage: 1, towers: 10, elves: 100, defenderBirds: 0,
    });
    expect(r.infoBirds).toBe(1);
  });
});
