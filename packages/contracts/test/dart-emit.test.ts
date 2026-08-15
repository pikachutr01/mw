/**
 * ⭐ ZOD → DART ÜRETECİ (`src/dart/emit.ts`).
 *
 * Bu dosya iki şeyi kilitliyor:
 *
 * 1. **Üretilen Dart'ın ŞEKLİ** — özellikle `?? 0`a düşmemesi. Eksik alanı varsayılana
 *    çevirmek, MOBIL_MIMARI.md §3.4'teki 4 numaralı mekanizmayı (simülatörde `undefined` ile
 *    `0` ayrımı) sessizce yok ederdi ve hata ancak oyuncu "hepsi ölmüş görünüyor" diye
 *    yazınca fark edilirdi.
 *
 * 2. **Taşınabilir alt kümenin SINIRI** — üreteç desteklemediği yapıyı sessizce atlarsa,
 *    Dart tarafında o alan hiç doğmaz ve kimse fark etmez. Bu yüzden HATA VERMESİ gerekiyor;
 *    aşağıdaki testler bunun gerçekten olduğunu ölçüyor.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildDart } from '../src/dart/emit.ts';

describe('Dart üreteci — tip eşlemesi', () => {
  it('⭐ int alan `num` üzerinden okunur (JSON 3 de 3.0 da gönderebilir)', () => {
    const out = buildDart({ T: z.object({ n: z.number().int() }) });
    expect(out).toContain('final int n;');
    expect(out).toContain("n: (json['n'] as num).toInt()");
  });

  it('⚠️⚠️ eksik alan ASLA varsayılana düşürülmez — `?? 0` üretilmez', () => {
    const out = buildDart({
      T: z.object({
        a: z.number().int().nullable(),
        b: z.number().int().optional(),
        c: z.string().nullable(),
      }),
    });
    expect(out).not.toContain('?? 0');
    expect(out).not.toContain("?? ''");
    expect(out).toContain('final int? a;');
    expect(out).toContain('final int? b;');
    expect(out).toContain('final String? c;');
  });

  it('nullable ve optional aynı sonucu verir (ikisi de Dart\'ta `?`)', () => {
    const a = buildDart({ T: z.object({ x: z.string().nullable() }) });
    const b = buildDart({ T: z.object({ x: z.string().optional() }) });
    expect(a).toBe(b);
  });

  it('⭐ enum Dart enum\'una DEĞİL String\'e çevrilir', () => {
    // Gerekçe: sunucu enum'a yeni bir değer eklerse (ör. yeni görev tipi) Dart enum'u olan
    // ESKİ uygulama çözümlemede çöker. String kalması expand-contract'ın istemci tarafı.
    const out = buildDart({ T: z.object({ k: z.enum(['a', 'b']) }) });
    expect(out).toContain('final String k;');
    expect(out).not.toContain('enum ');
  });

  it('iç içe nesne ayrı bir sınıf üretir ve adı ebeveynden türer', () => {
    const out = buildDart({ Sehir: z.object({ koordinat: z.object({ k: z.number().int() }) }) });
    expect(out).toContain('class SehirKoordinat {');
    expect(out).toContain('final SehirKoordinat koordinat;');
  });

  it('nullable iç içe nesne null kontrolüyle okunur', () => {
    const out = buildDart({ T: z.object({ c: z.object({ id: z.number().int() }).nullable() }) });
    expect(out).toContain('final TC? c;');
    expect(out).toContain("json['c'] == null ? null : TC.fromJson(");
  });

  it('dizi ve sözlük üretilir', () => {
    const out = buildDart({
      T: z.object({ xs: z.array(z.string()), m: z.record(z.number().int()) }),
    });
    expect(out).toContain('final List<String> xs;');
    expect(out).toContain('final Map<String, int> m;');
  });

  it('nesne dizisi eleman sınıfını çağırır', () => {
    const out = buildDart({ T: z.object({ xs: z.array(z.object({ id: z.number().int() })) }) });
    expect(out).toContain('final List<TXsItem> xs;');
    expect(out).toContain('TXsItem.fromJson(e as Map<String, dynamic>)');
  });

  it('`datetime()` dizesi String kalır — ayrıştırma uygulamanın işi', () => {
    const out = buildDart({ T: z.object({ at: z.string().datetime() }) });
    expect(out).toContain('final String at;');
  });
});

describe('⚠️ taşınabilir alt kümenin sınırı — sessizce atlamaz, HATA VERİR', () => {
  it('`transform` reddedilir', () => {
    expect(() => buildDart({ T: z.object({ x: z.string().transform((s) => s.length) }) }))
      .toThrow(/Taşınabilir olmayan/);
  });

  it('literal olmayan union reddedilir', () => {
    expect(() => buildDart({ T: z.object({ x: z.union([z.string(), z.number()]) }) }))
      .toThrow(/ZodUnion/);
  });

  it('kök şema nesne değilse reddedilir', () => {
    expect(() => buildDart({ T: z.array(z.string()) as never })).toThrow(/nesne olmalı/);
  });

  it('⭐ hata mesajı ALANIN YOLUNU söyler (hangi alan olduğu aranmasın)', () => {
    expect(() => buildDart({ Sehir: z.object({ ic: z.object({ kotu: z.symbol() as never }) }) }))
      .toThrow(/Sehir\.ic\.kotu/);
  });

  it('literal birliği (a|b) String olarak KABUL edilir', () => {
    const out = buildDart({ T: z.object({ x: z.union([z.literal('a'), z.literal('b')]) }) });
    expect(out).toContain('final String x;');
  });
});

describe('Dart anahtar kelimeleri', () => {
  it('⚠️ `is` gibi ayrılmış ad kaçılır (aksi hâlde üretilen dosya DERLENMEZ)', () => {
    const out = buildDart({ T: z.object({ is: z.string() }) });
    expect(out).toContain('final String is_;');
    expect(out).toContain("is_: json['is'] as String");
  });
});
