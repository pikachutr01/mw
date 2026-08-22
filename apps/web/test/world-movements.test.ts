/**
 * ⭐⭐ DÜNYA SATIRINDAKİ GÖREV SİMGELERİ — hangi hareket hangi satıra düşer?
 *
 * Arıza sınıfı: hareketin "karşı ucu" yön'e bağlı ve hep `target`a bakan bir kod, **gelen**
 * saldırıyı saldırganın satırına değil BENİM satırıma asar. Ekranda hata yok, yalnız simge
 * yanlış yerde ve oyuncu saldırganı göremiyor. Bu dosya üç yönü de tek tek çakıyor.
 */
import { describe, expect, it } from 'vitest';
import { movementsForSlot, otherEnd } from '../src/components/movements.tsx';
import type { Coords, Movement } from '../src/lib/queries.ts';

const c = (k: number, d: number, s: number): Coords => ({ k, d, s });

/** Renk/başlık kararına girmeyen alanlar kabaca dolduruluyor; testin derdi uçlar ve yön. */
const mv = (o: {
  id: number;
  direction: Movement['direction'];
  cityId: number;
  origin: Coords | null;
  target: Coords | null;
  executeAt?: string;
}): Movement => ({
  key: `${o.id}-${o.direction}`,
  id: o.id,
  type: 'attack',
  direction: o.direction,
  icon: 'attack',
  cityId: o.cityId,
  origin: o.origin,
  target: o.target,
  startedAt: '2026-08-22T10:00:00.000Z',
  executeAt: o.executeAt ?? '2026-08-22T12:00:00.000Z',
  canCancel: false,
} as Movement);

const BENIM = c(1, 10, 3);
const HEDEF = c(1, 10, 7);

describe('otherEnd', () => {
  /**
   * ⚠️⚠️ `cityId` HER ZAMAN benim şehrim; hangi ucun "öteki" olduğunu yalnız yön söylüyor.
   *  • `out`  → ordumu gönderdiğim yer = target
   *  • `in`   → bana geleni gönderen yer = origin
   *  • `own`  → kendi ordumun döndüğü yer = origin
   */
  it('⭐ giden hareketin karşı ucu target', () => {
    expect(otherEnd(mv({ id: 1, direction: 'out', cityId: 5, origin: BENIM, target: HEDEF })))
      .toEqual(HEDEF);
  });

  it('⭐⭐ GELEN hareketin karşı ucu origin (kendi satırıma düşmesin)', () => {
    expect(otherEnd(mv({ id: 2, direction: 'in', cityId: 5, origin: HEDEF, target: BENIM })))
      .toEqual(HEDEF);
  });

  it('⭐ dönen kendi ordumun karşı ucu origin', () => {
    expect(otherEnd(mv({ id: 3, direction: 'own', cityId: 5, origin: HEDEF, target: BENIM })))
      .toEqual(HEDEF);
  });

  /** ⚠️ Uç `null` olabilir: boş koordinata şehir kurma dönüşünde kaynak yok. */
  it('uç yoksa null', () => {
    expect(otherEnd(mv({ id: 4, direction: 'out', cityId: 5, origin: BENIM, target: null })))
      .toBeNull();
  });
});

describe('movementsForSlot', () => {
  const giden = mv({ id: 1, direction: 'out', cityId: 5, origin: BENIM, target: HEDEF });
  const gelen = mv({ id: 2, direction: 'in', cityId: 5, origin: HEDEF, target: BENIM });
  /** Başka bir şehrimin hareketi — aktif şehir süzgeci bunu dışarıda bırakmalı. */
  const baskaSehrim = mv({ id: 3, direction: 'out', cityId: 9, origin: c(1, 10, 4), target: HEDEF });
  const alakasiz = mv({ id: 4, direction: 'out', cityId: 5, origin: BENIM, target: c(2, 20, 1) });

  it('⭐ hedef satırına hem giden hem gelen düşüyor', () => {
    const r = movementsForSlot([giden, gelen, alakasiz], 5, HEDEF);
    expect(r.map((m) => m.id).sort()).toEqual([1, 2]);
  });

  /**
   * ⚠️⚠️ AKTİF ŞEHİR SÜZGECİ: başka şehrimin aynı hedefe giden ordusu bu satıra DÜŞMEMELİ.
   * Kullanıcının şartı "aktif şehrin ilgili olduğu görevler" — hepsi değil.
   */
  it('⭐⭐ başka şehrimin hareketi listeye girmiyor', () => {
    expect(movementsForSlot([baskaSehrim], 5, HEDEF)).toEqual([]);
    expect(movementsForSlot([baskaSehrim], 9, HEDEF).map((m) => m.id)).toEqual([3]);
  });

  /** ⚠️ Aktif şehir yoksa liste boş: süzgeç anlamsızlaşır ve satırlara her şey düşerdi. */
  it('⭐ aktif şehir yoksa boş', () => {
    expect(movementsForSlot([giden, gelen], null, HEDEF)).toEqual([]);
  });

  it('kendi satırıma (gelen hareketin hedefi) hiçbir şey düşmüyor', () => {
    expect(movementsForSlot([gelen], 5, BENIM)).toEqual([]);
  });

  /**
   * ⚠️⚠️ TAVAN VE SIRA: sığmayan sessizce düşüyor (kullanıcının şartı) ve kalanlar **en yakın
   * varış** olanlar. En eski başlayanı tutmak, belki de en uzaktakini öne alırdı.
   */
  it('⭐⭐ en fazla 3 ve en yakın varış üstte', () => {
    const geç = mv({ id: 10, direction: 'out', cityId: 5, origin: BENIM, target: HEDEF, executeAt: '2026-08-22T18:00:00.000Z' });
    const orta = mv({ id: 11, direction: 'out', cityId: 5, origin: BENIM, target: HEDEF, executeAt: '2026-08-22T14:00:00.000Z' });
    const erken = mv({ id: 12, direction: 'out', cityId: 5, origin: BENIM, target: HEDEF, executeAt: '2026-08-22T11:00:00.000Z' });
    const enErken = mv({ id: 13, direction: 'out', cityId: 5, origin: BENIM, target: HEDEF, executeAt: '2026-08-22T09:00:00.000Z' });

    const r = movementsForSlot([geç, orta, erken, enErken], 5, HEDEF);
    expect(r.map((m) => m.id)).toEqual([13, 12, 11]);
  });

  it('tavan dışarıdan değiştirilebiliyor', () => {
    const a = mv({ id: 20, direction: 'out', cityId: 5, origin: BENIM, target: HEDEF, executeAt: '2026-08-22T11:00:00.000Z' });
    const b = mv({ id: 21, direction: 'out', cityId: 5, origin: BENIM, target: HEDEF, executeAt: '2026-08-22T12:00:00.000Z' });
    expect(movementsForSlot([a, b], 5, HEDEF, 1).map((m) => m.id)).toEqual([20]);
  });
});
