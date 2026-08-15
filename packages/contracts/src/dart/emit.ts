/**
 * ⭐ ZOD → DART ÜRETECİ (MOBIL_MIMARI.md §4).
 *
 * Neden var: bugün aynı yanıt şekli İKİ yerde elle yazılı — sunucuda controller'ın döndürdüğü
 * nesne literali, web'de `queries.ts`teki `interface`. Aralarında hiçbir kapı yok. Flutter
 * ÜÇÜNCÜ kopya olurdu; bu üreteç onun yerine tek kaynaktan (zod) türetiyor.
 *
 * ⚠️ **`build_runner`/`freezed` BİLEREK kullanılmıyor.** O ikinci bir codegen adımıdır: kendisi
 * bayatlar ve kendi kapısını ister. Tek artefakt için tek kapı (`contracts:check`).
 *
 * ⚠️⚠️ **TAŞINABİLİR ZOD ALT KÜMESİ.** Desteklenmeyen bir yapı görülürse üreteç HATA VERİR,
 * sessizce atlamaz. Bu da bir kapıdır: şema yazarı taşınabilir kalmak zorunda. Sunucuya özel
 * dönüşümler (`transform`/`refine`) istemci sözleşmesine ait değildir — oraya konurlarsa
 * istemci sunucunun iç mantığına bağlanmış olur.
 */
import { z } from 'zod';

/** Üretilecek şemalar: Dart sınıf adı → zod şeması. */
export type Registry = Record<string, z.ZodTypeAny>;

interface Ctx {
  /** Üretilen yardımcı sınıflar (iç içe nesneler) — ad → gövde. */
  classes: Map<string, string>;
}

const pascal = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

class TasinamazSema extends Error {
  constructor(yol: string, tur: string) {
    super(
      `Taşınabilir olmayan zod yapısı: ${tur} (${yol}).\n`
      + '  Dart üreteci şu alt kümeyi destekler: object · string · number · boolean · literal ·\n'
      + '  enum · array · record · nullable · optional · literal union · datetime.\n'
      + '  Çözüm: şemayı bu alt kümeye indir, ya da alanı istemci sözleşmesinden çıkar.',
    );
    this.name = 'TasinamazSema';
  }
}

/** Bir zod düğümünü Dart tipine çevirir; iç içe nesneler için yeni sınıf üretir. */
function dartType(node: z.ZodTypeAny, yol: string, ad: string, ctx: Ctx): { tip: string; nullable: boolean } {
  const def = node._def as { typeName: string; [k: string]: unknown };

  switch (def.typeName) {
    case 'ZodOptional':
    case 'ZodNullable': {
      const ic = dartType(def['innerType'] as z.ZodTypeAny, yol, ad, ctx);
      return { tip: ic.tip, nullable: true };
    }
    case 'ZodDefault':
      // ⚠️ Varsayılan SUNUCUDA uygulanır; istemci alanı yine de eksik görebilir → nullable.
      return { ...dartType(def['innerType'] as z.ZodTypeAny, yol, ad, ctx), nullable: true };

    case 'ZodString':
      return { tip: 'String', nullable: false };
    case 'ZodBoolean':
      return { tip: 'bool', nullable: false };
    case 'ZodNumber': {
      const checks = (def['checks'] ?? []) as { kind: string }[];
      return { tip: checks.some((c) => c.kind === 'int') ? 'int' : 'double', nullable: false };
    }
    case 'ZodEnum':
      // Dart enum ÜRETİLMEZ: sunucu yeni bir değer eklerse eski uygulama çökerdi.
      // String kalması expand-contract'ın istemci tarafıdır (DAGITIM.md §6).
      return { tip: 'String', nullable: false };
    case 'ZodLiteral':
      return { tip: typeof def['value'] === 'number' ? 'num' : 'String', nullable: false };

    case 'ZodArray': {
      const ic = dartType(def['type'] as z.ZodTypeAny, `${yol}[]`, `${ad}Item`, ctx);
      return { tip: `List<${ic.tip}${ic.nullable ? '?' : ''}>`, nullable: false };
    }
    case 'ZodRecord': {
      const ic = dartType(def['valueType'] as z.ZodTypeAny, `${yol}{}`, `${ad}Value`, ctx);
      return { tip: `Map<String, ${ic.tip}${ic.nullable ? '?' : ''}>`, nullable: false };
    }
    case 'ZodObject': {
      const sinif = pascal(ad);
      emitClass(sinif, node as z.ZodObject<z.ZodRawShape>, yol, ctx);
      return { tip: sinif, nullable: false };
    }
    case 'ZodUnion': {
      // Yalnız literal birliği (ör. 'a' | 'b') taşınabilir sayılır → String.
      const opts = def['options'] as z.ZodTypeAny[];
      if (opts.every((o) => (o._def as { typeName: string }).typeName === 'ZodLiteral')) {
        return { tip: 'String', nullable: false };
      }
      throw new TasinamazSema(yol, 'ZodUnion (literal olmayan)');
    }
    default:
      throw new TasinamazSema(yol, def.typeName);
  }
}

/** `json['x']` ifadesinden Dart değerine dönüşüm. */
function okuma(tip: string, nullable: boolean, anahtar: string): string {
  const ham = `json['${anahtar}']`;
  const q = nullable ? '?' : '';

  if (tip === 'int') {
    // ⚠️ `as int` YAZILMAZ: JSON'da 3 ve 3.0 aynı alandan gelebiliyor; `num` üzerinden geçmek
    // ikisini de kabul eder. ⚠️⚠️ `?? 0` ASLA — eksik alan 0 DEĞİLDİR (MOBIL_MIMARI §3.4/4).
    return nullable ? `(${ham} as num?)?.toInt()` : `(${ham} as num).toInt()`;
  }
  if (tip === 'double') return nullable ? `(${ham} as num?)?.toDouble()` : `(${ham} as num).toDouble()`;
  if (tip.startsWith('List<')) {
    const ic = tip.slice(5, -1);
    const icOku = ic.endsWith('?') ? ic.slice(0, -1) : ic;
    const map = ozelSinif(icOku) ? `${icOku}.fromJson(e as Map<String, dynamic>)` : `e as ${ic}`;
    return `(${ham} as List<dynamic>${q})${q}.map((e) => ${map}).toList()`;
  }
  if (tip.startsWith('Map<String, ')) {
    const ic = tip.slice(12, -1);
    const icOku = ic.endsWith('?') ? ic.slice(0, -1) : ic;
    const map = ozelSinif(icOku) ? `${icOku}.fromJson(v as Map<String, dynamic>)` : `v as ${ic}`;
    return `(${ham} as Map<String, dynamic>${q})${q}.map((k, v) => MapEntry(k, ${map}))`;
  }
  if (ozelSinif(tip)) {
    return nullable
      ? `${ham} == null ? null : ${tip}.fromJson(${ham} as Map<String, dynamic>)`
      : `${tip}.fromJson(${ham} as Map<String, dynamic>)`;
  }
  return `${ham} as ${tip}${q}`;
}

/** Üretilmiş bir sınıf mı (String/int/bool/num değil)? */
const ozelSinif = (tip: string): boolean => /^[A-Z]/.test(tip) && !['String', 'Map', 'List'].includes(tip);

function emitClass(ad: string, sema: z.ZodObject<z.ZodRawShape>, yol: string, ctx: Ctx): void {
  if (ctx.classes.has(ad)) return;
  ctx.classes.set(ad, '');            // döngüsel referansa karşı yer tutucu

  const alanlar: { ad: string; tip: string; nullable: boolean; anahtar: string }[] = [];
  for (const [anahtar, alt] of Object.entries(sema.shape)) {
    const { tip, nullable } = dartType(alt as z.ZodTypeAny, `${yol}.${anahtar}`, `${ad}${pascal(anahtar)}`, ctx);
    alanlar.push({ ad: dartAd(anahtar), tip, nullable, anahtar });
  }

  const q = (a: (typeof alanlar)[number]): string => (a.nullable ? '?' : '');
  const govde = [
    `class ${ad} {`,
    `  const ${ad}({`,
    ...alanlar.map((a) => `    ${a.nullable ? '' : 'required '}this.${a.ad},`),
    '  });',
    '',
    ...alanlar.map((a) => `  final ${a.tip}${q(a)} ${a.ad};`),
    '',
    `  factory ${ad}.fromJson(Map<String, dynamic> json) => ${ad}(`,
    ...alanlar.map((a) => `        ${a.ad}: ${okuma(a.tip, a.nullable, a.anahtar)},`),
    '      );',
    '}',
  ].join('\n');

  ctx.classes.set(ad, govde);
}

/** JSON anahtarı → Dart alan adı. Zaten camelCase (§13.14) ama Dart anahtar kelimeleri kaçılır. */
const DART_ANAHTAR = new Set(['is', 'in', 'if', 'for', 'new', 'this', 'class', 'default', 'switch', 'var', 'final', 'const']);
const dartAd = (k: string): string => (DART_ANAHTAR.has(k) ? `${k}_` : k);

export function buildDart(registry: Registry): string {
  const ctx: Ctx = { classes: new Map() };
  for (const [ad, sema] of Object.entries(registry)) {
    const def = sema._def as { typeName: string };
    if (def.typeName !== 'ZodObject') throw new TasinamazSema(ad, `kök ${def.typeName} (nesne olmalı)`);
    emitClass(ad, sema as z.ZodObject<z.ZodRawShape>, ad, ctx);
  }

  return [
    '// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. Kaynak: packages/contracts/src/dart/registry.ts',
    '// Üreteç: packages/contracts/src/dart/emit.ts  ·  Kapı: pnpm contracts:check',
    '//',
    '// ⚠️ Eksik alanlar `null` bırakılır, ASLA varsayılana düşürülmez: "alan yok" ile',
    '// "alan sıfır" farklı şeylerdir (MOBIL_MIMARI.md §3.4, madde 4).',
    '',
    [...ctx.classes.values()].filter(Boolean).join('\n\n'),
    '',
  ].join('\n');
}
