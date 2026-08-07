/**
 * ⭐⭐ VADE KAYIT DEFTERİ BEKÇİSİ — bu turun en önemli tek testi.
 *
 * Tek zaman çizgisi mimarisinde bakımdan çıkarken bekleyen vadeler toplu kaydırılıyor
 * (`time-registry.ts`). **Kaydırılması gereken bir sütun unutulursa hata SESSİZDİR:** o alan
 * bakım süresi kadar geçmişte kalır, onu okuyan kural yanlış davranır, hiçbir yerde hata çıkmaz.
 * Aylar sonra "şu bakımdan sonra bozulmuş" diye fark edilir.
 *
 * Bu test o unutmayı imkânsız kılıyor: şemadaki **her** `timestamptz` sütunu ya kayıt defterinde
 * ya da açık dışlama listesinde olmak zorunda. Yeni bir sütun ekleyen geliştirici karar vermeyi
 * atlayamaz — suite kırılır ve mesaj ne yapması gerektiğini söyler.
 *
 * ⚠️ Deseni `admin-ops.test.ts`teki `information_schema` karşılaştırmasından alıyor; o kalıp
 * Faz 7'de kayıttaki DÖRT yanlış kolon adını yakalamıştı.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/db/client.ts';
import { DEFAULT_ATTACK_RULES } from '../src/missions/mission.service.ts';
import {
  ATTACK_WINDOW_SHIFT_HOURS, NON_TIMELINE_COLUMNS, TIME_SHIFT_REGISTRY,
} from '../src/world/time-registry.ts';
import { setupTestDb } from './helpers/db.ts';

let h: DbHandle;
/** Şemadaki tüm zaman sütunları — `tablo.sütun` biçiminde. */
let schemaColumns: string[];

beforeAll(async () => {
  h = await setupTestDb();
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type LIKE 'timestamp%'
     ORDER BY table_name, column_name
  `);
  schemaColumns = rows.map((r) => `${String(r['table_name'])}.${String(r['column_name'])}`);
}, 60_000);

afterAll(async () => { await h?.close(); });

const registryKeys = (): string[] => TIME_SHIFT_REGISTRY.map((e) => `${e.table}.${e.column}`);

describe('kapsam — hiçbir zaman sütunu kararsız kalamaz', () => {
  /**
   * ⭐⭐ ASIL BEKÇİ. Kırılırsa yapılacak şey testi düzeltmek değil, **karar vermek**:
   * bu sütunu şimdiki zamanla karşılaştıran bir kural var mı? Varsa `TIME_SHIFT_REGISTRY`'ye,
   * yoksa `NON_TIMELINE_COLUMNS`'a.
   */
  it('şemadaki HER timestamptz sütunu ya kayıtta ya açık dışlama listesinde', () => {
    const known = new Set([...registryKeys(), ...NON_TIMELINE_COLUMNS]);
    const kararsiz = schemaColumns.filter((c) => !known.has(c));

    expect(
      kararsiz,
      `Bu sütunlar hiçbir listede yok — bakımda kaydırılacak mı, karar ver:\n`
      + `  ${kararsiz.join('\n  ')}\n`
      + `Soru: bu değeri şimdiki zamanla karşılaştıran canlı bir kural var mı?\n`
      + `  VAR  → apps/api/src/world/time-registry.ts · TIME_SHIFT_REGISTRY\n`
      + `  YOK  → apps/api/src/world/time-registry.ts · NON_TIMELINE_COLUMNS`,
    ).toEqual([]);
  });

  /** Ters yön: yazım hatası olan bir giriş sessizce hiçbir satırı kaydırmaz. */
  it('kayıttaki her giriş şemada GERÇEKTEN var', () => {
    const inSchema = new Set(schemaColumns);
    const hayalet = registryKeys().filter((c) => !inSchema.has(c));
    expect(hayalet, `Kayıtta olup şemada olmayan sütun (yazım hatası?): ${hayalet.join(', ')}`)
      .toEqual([]);
  });

  it('dışlama listesindeki her giriş de şemada var (bayat kayıt bırakmayalım)', () => {
    const inSchema = new Set(schemaColumns);
    const hayalet = NON_TIMELINE_COLUMNS.filter((c) => !inSchema.has(c));
    expect(hayalet, `Dışlama listesinde olup şemada olmayan sütun: ${hayalet.join(', ')}`)
      .toEqual([]);
  });
});

describe('tutarlılık', () => {
  /**
   * ⚠️ ÇİFT KAYDIRMA KORUMASI. Aynı `(tablo, sütun)` iki girişte olsaydı ve yüklemleri
   * kesişseydi, kesişen satırlar **2×D** kayardı. `missions.execute_at` tam bu yüzden tek
   * girişte `OR`'lu bir yüklem taşıyor.
   */
  it('bir (tablo, sütun) çifti kayıtta EN FAZLA BİR KEZ geçer', () => {
    const keys = registryKeys();
    const tekrar = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(tekrar, `Kayıtta tekrar eden giriş (çift kaydırma riski): ${tekrar.join(', ')}`)
      .toEqual([]);
  });

  it('bir sütun iki listede birden olamaz', () => {
    const excluded = new Set(NON_TIMELINE_COLUMNS);
    const kesisim = registryKeys().filter((k) => excluded.has(k));
    expect(kesisim, `Hem kaydırılıyor hem dışlanıyor: ${kesisim.join(', ')}`).toEqual([]);
  });

  it('dışlama listesinde tekrar yok', () => {
    const tekrar = NON_TIMELINE_COLUMNS.filter((k, i) => NON_TIMELINE_COLUMNS.indexOf(k) !== i);
    expect(tekrar).toEqual([]);
  });

  /**
   * ⭐ Kaydırılan saldırı penceresi, kuralın baktığı pencereden GENİŞ olmalı. Biri
   * `attackWindowHours`ı 48'in üstüne çıkarırsa bu test kırılır ve sabit güncellenir —
   * yoksa "24 saatte 3 saldırı" kuralı bakımdan sonra sessizce gevşerdi.
   */
  it('saldırı penceresi kaydırması, kuralın penceresinden geniş', () => {
    expect(ATTACK_WINDOW_SHIFT_HOURS).toBeGreaterThan(DEFAULT_ATTACK_RULES.attackWindowHours);
  });
});

describe('yüklemler çalıştırılabilir', () => {
  /**
   * ⭐ Sözdizimi/kolon hatasını YAKALAR. Kayıt defterindeki bir `where()` bozuksa kaydırma
   * transaction'ı canlıda, bakım penceresinin ortasında patlardı — en pahalı yer.
   *
   * `EXPLAIN` gerçek bir planlama yapıyor: kolon adı yanlışsa, tip uyuşmuyorsa ya da SQL
   * bozuksa burada hata verir. Satırlara dokunmuyor.
   */
  it('her giriş için EXPLAIN geçiyor (kolon adı ve tip doğru)', async () => {
    const ref = sql`now()`;
    for (const e of TIME_SHIFT_REGISTRY) {
      const table = sql.raw(e.table);
      const col = sql.raw(e.column);
      await expect(
        h.db.execute(sql`
          EXPLAIN UPDATE ${table} SET ${col} = ${col} + interval '1 second'
           WHERE world_id = -1 AND ${e.where(ref)}
        `),
        `${e.table}.${e.column} yüklemi çalıştırılamıyor`,
      ).resolves.toBeDefined();
    }
  });

  /** Her giriş bir gerekçe taşımalı — "neden kayıyor" sorusu kodda cevaplı olsun. */
  it('her girişin gerekçesi yazılı', () => {
    for (const e of TIME_SHIFT_REGISTRY) {
      expect(e.reason.length, `${e.table}.${e.column} gerekçesiz`).toBeGreaterThan(10);
    }
  });
});

/**
 * ⭐⭐ EMEKLİ SÜTUN BEKÇİSİ — `worlds.clock_offset_ms`.
 *
 * Sütun 0043'te emekli oldu (daima 0, hiçbir formülde geçmiyor) ama **düşürülmedi**:
 * expand-contract gereği göç koşarken eski kod hâlâ çalışıyor ve onu okuyor. Düşürme bir
 * SONRAKİ dağıtımın işi.
 *
 * ⚠️⚠️ Tam da bu ara dönem tehlikeli: sütun hâlâ var, yani onu okuyan kod **çalışmaya devam
 * ediyor** ve ne derleyici ne test kırılıyor. 2026-08-08'de yapılan taramada gerçekten iki
 * kalıntı bulundu — `admin.world.controller` onu SELECT ediyor ama kullanmıyordu,
 * `ranking.handler` teşhis kaydına yazıyordu. İkisi de ham SQL, ikisi de tip denetiminin
 * göremeyeceği yerde. Düşürme günü geldiğinde biri panelin dünyalar sekmesini, diğeri **her
 * sıralama anlık görüntüsünü** patlatacaktı.
 *
 * Bu test o ara dönemin bekçisi: kaynak kodda emekli sütunun adı geçmesin. Düşürme göçü
 * yazıldığında bu testin kendisi de silinebilir — o noktada Postgres zaten zorluyor olacak.
 */
describe('emekli sütun sızıntısı', () => {
  it('kaynak kodda clock_offset_ms okuyan kalmadı', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const hits: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { await walk(p); continue; }
        if (!e.name.endsWith('.ts')) continue;
        const src = await readFile(p, 'utf8');
        src.split('\n').forEach((line, i) => {
          if (!/clock_offset_ms|clockOffsetMs/.test(line)) return;
          /**
           * ⚠️ Yorumlar MUAF — sütunun neden emekli olduğunu anlatan metinler kalmalı; asıl
           * değerleri o. Aranan şey **çalışan kod**.
           */
          const t = line.trim();
          if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
          // `schema.ts`teki tanım kalıyor: sütun hâlâ var ve şema onu tarif etmeli.
          if (p.endsWith('schema.ts')) return;
          hits.push(`${p}:${i + 1}: ${t.slice(0, 100)}`);
        });
      }
    };
    await walk(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

    expect(hits, `emekli sütun hâlâ okunuyor:\n${hits.join('\n')}`).toEqual([]);
  });
});
