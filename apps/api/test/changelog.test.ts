/**
 * ⭐⭐ DEĞİŞİKLİK GÜNLÜĞÜ testleri (kullanıcı, 2026-08-16).
 *
 * Sözleşmenin özü üç cümle ve üçü de burada kilitli:
 *   1. Taslak oyuncuya GÖRÜNMEZ — yayın kararı geri alınabilir olmalı.
 *   2. "Yayında mı" sorusunun cevabı **DB saatinden** gelir, süreç saatinden değil.
 *   3. Dünyaya özel madde + tüm dünyaları ilgilendiren madde BİRLİKTE döner.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChangelogService } from '../src/changelog/changelog.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
let svc: ChangelogService;

beforeAll(async () => { h = await setupTestDb(); }, 60_000);
afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await h.db.execute(sql`DELETE FROM changelog_entries`);
  svc = new ChangelogService(h.db);
});

describe('yayın durumu', () => {
  it('⭐ taslak oyuncuya GÖRÜNMEZ, yayınlanınca görünür', async () => {
    const e = await svc.create({ title: 'Ganimet değişti', body: 'Detaylar…' });
    expect(e.publishedAt).toBeNull();
    expect(await svc.list()).toHaveLength(0);          // taslak listede yok
    expect(await svc.listAll()).toHaveLength(1);       // ama yönetici görüyor

    await svc.publish(e.id);
    const genel = await svc.list();
    expect(genel).toHaveLength(1);
    expect(genel[0]!.title).toBe('Ganimet değişti');
    expect(genel[0]!.publishedAt).not.toBeNull();
  });

  it('yayından geri çekilebilir — yanlış madde silinmeden gizlenir', async () => {
    const e = await svc.create({ title: 'Yanlış', body: 'x', publishedAt: new Date() });
    await svc.publish(e.id);
    expect(await svc.list()).toHaveLength(1);

    await svc.unpublish(e.id);
    expect(await svc.list()).toHaveLength(0);
    expect(await svc.listAll()).toHaveLength(1);       // veri duruyor
  });

  it('tekrar yayınlamak tarihi KAYDIRMAZ (idempotent)', async () => {
    const e = await svc.create({ title: 'Bir', body: 'x' });
    const ilk = await svc.publish(e.id);
    await new Promise((r) => setTimeout(r, 25));
    const ikinci = await svc.publish(e.id);
    expect(ikinci!.publishedAt!.getTime()).toBe(ilk!.publishedAt!.getTime());
  });

  /**
   * ⚠️⚠️ İLERİ TARİHLİ madde yayında SAYILMAZ. Kıyaslama SQL'de (`published_at <= now()`);
   * süreç saatinden yapılsaydı 2026-08-16'daki konak saati sızıntısında
   * (`docs/SAAT_SICRAMASI.md`) ileri tarihli bir duyuru bir anlığına görünürdü.
   */
  it('⭐⭐ gelecekte yayınlanacak madde HENÜZ görünmez', async () => {
    await svc.create({
      title: 'Gelecek hafta', body: 'x',
      publishedAt: new Date(Date.now() + 7 * 24 * 3600_000),
    });
    expect(await svc.list()).toHaveLength(0);
    expect(await svc.listAll()).toHaveLength(1);
  });
});

describe('kapsam ve sıralama', () => {
  it('⭐ dünyaya özel VE genel maddeler birlikte döner', async () => {
    // ⚠️ Dünya satırı ÖNCE yaratılmalı: `changelog_entries.world_id` bir FK.
    const digerWorldId = freshWorldId();
    await createWorld(h, digerWorldId);

    const genel = await svc.create({ title: 'Herkese', body: 'x', worldId: null });
    const ozel = await svc.create({ title: 'Bu dünyaya', body: 'x', worldId });
    const baska = await svc.create({ title: 'Başka dünyaya', body: 'x', worldId: digerWorldId });
    await Promise.all([svc.publish(genel.id), svc.publish(ozel.id), svc.publish(baska.id)]);

    const liste = await svc.list({ worldId });
    const basliklar = liste.map((e) => e.title);
    expect(basliklar).toContain('Herkese');
    expect(basliklar).toContain('Bu dünyaya');
    expect(basliklar).not.toContain('Başka dünyaya');
  });

  it('en yeni en üstte', async () => {
    const a = await svc.create({ title: 'Eski', body: 'x' });
    await svc.publish(a.id);
    await new Promise((r) => setTimeout(r, 25));
    const b = await svc.create({ title: 'Yeni', body: 'x' });
    await svc.publish(b.id);

    const liste = await svc.list();
    expect(liste.map((e) => e.title)).toEqual(['Yeni', 'Eski']);
  });
});

describe('yazım kapıları', () => {
  it('boş başlık ya da gövde reddedilir', async () => {
    await expect(svc.create({ title: '   ', body: 'x' })).rejects.toThrow();
    await expect(svc.create({ title: 'x', body: '  ' })).rejects.toThrow();
  });

  it('geçersiz kategori reddedilir', async () => {
    await expect(
      svc.create({ title: 'x', body: 'y', category: 'saçma' as never }),
    ).rejects.toThrow(/kategori/i);
  });

  it('kategori varsayılanı «balance»', async () => {
    const e = await svc.create({ title: 'x', body: 'y' });
    expect(e.category).toBe('balance');
  });

  /** ⭐ Tohumlama iki kez koşturulunca maddeyi İKİZLEMEZ (dağıtım betiği için). */
  it('seedOnce aynı başlığı ikinci kez yazmaz', async () => {
    const ilk = await svc.seedOnce({ title: 'Tek', body: 'x', publishedAt: new Date() });
    expect(ilk.created).toBe(true);
    const ikinci = await svc.seedOnce({ title: 'Tek', body: 'x', publishedAt: new Date() });
    expect(ikinci.created).toBe(false);
    expect(await svc.listAll()).toHaveLength(1);
  });

  it('düzenleme ve silme çalışır', async () => {
    const e = await svc.create({ title: 'Eski başlık', body: 'x' });
    await svc.update(e.id, { title: 'Yeni başlık', category: 'fix' });
    const [g] = await svc.listAll();
    expect(g!.title).toBe('Yeni başlık');
    expect(g!.category).toBe('fix');

    expect(await svc.remove(e.id)).toBe(true);
    expect(await svc.listAll()).toHaveLength(0);
    expect(await svc.remove(e.id)).toBe(false);        // ikinci kez yok
  });
});

/**
 * ⭐ UÇ SEVİYESİ — controller'ın kendi sözleşmesi.
 *
 * ⚠️ Asıl kilit: **taslak genel uçtan SIZMAZ.** Servis testi bunu zaten ölçüyor ama sızıntı
 * controller'da da doğabilir (yanlış metot çağırmak yeter: `listAll` ↔ `list`). İki katman iki
 * ayrı hata sınıfı.
 */
describe('uç sözleşmesi', () => {
  it('⭐ genel uç taslak DÖNDÜRMEZ, yayınlanmışı düz alanlarla döndürür', async () => {
    const { ChangelogController } = await import('../src/changelog/changelog.controller.ts');
    const c = new ChangelogController(svc);

    const taslak = await svc.create({ title: 'Taslak', body: 'gizli' });
    const yayin = await svc.create({ title: 'Yayında', body: 'Sade açıklama', category: 'fix' });
    await svc.publish(yayin.id);

    const r = await c.list({});
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      id: yayin.id, title: 'Yayında', body: 'Sade açıklama', category: 'fix',
    });
    expect(typeof r.entries[0]!.publishedAt).toBe('string');
    expect(JSON.stringify(r.entries)).not.toContain('gizli');
    expect(taslak.publishedAt).toBeNull();
  });

  it('genel uç sayfalama parametrelerini doğrular', async () => {
    const { ChangelogController } = await import('../src/changelog/changelog.controller.ts');
    const c = new ChangelogController(svc);
    await expect(c.list({ limit: 0 })).rejects.toThrow();
    await expect(c.list({ limit: 999 })).rejects.toThrow();
    await expect(c.list({ offset: -1 })).rejects.toThrow();
  });

  it('yönetim ucu taslakları GÖRÜR ve yayına alabilir', async () => {
    const { AdminChangelogController } = await import('../src/admin/admin.changelog.controller.ts');
    const a = new AdminChangelogController(svc);

    const olusan = await a.create({ title: 'Panelden', body: 'metin', category: 'balance' });
    expect(olusan.publishedAt).toBeNull();                 // `publish` verilmedi → taslak
    expect((await a.list()).entries).toHaveLength(1);
    expect(await svc.list()).toHaveLength(0);              // oyuncu görmüyor

    await a.publish(String(olusan.id));
    expect(await svc.list()).toHaveLength(1);              // artık görüyor
  });

  /**
   * ⚠️ `publish: true` yolunda tarih **DB saatinden** yazılmalı. Controller `new Date()` ile
   * bir taslak açıp hemen `publish()` çağırıyor; bu test o ikinci adımın gerçekten koştuğunu
   * kilitliyor (`docs/SAAT_SICRAMASI.md` — süreç saatine güvenmeme kuralı).
   */
  it('⭐⭐ publish:true anında yayınlar ve tarihi DB saatinden yazar', async () => {
    const { AdminChangelogController } = await import('../src/admin/admin.changelog.controller.ts');
    const a = new AdminChangelogController(svc);

    const rows = await h.db.execute<{ now: string }>(sql`SELECT now() AS now`);
    const dbNow = new Date(rows[0]!.now).getTime();
    const r = await a.create({ title: 'Anında', body: 'metin', publish: true });

    expect(r.publishedAt).not.toBeNull();
    const yazilan = new Date(r.publishedAt!).getTime();
    expect(yazilan).toBeGreaterThanOrEqual(dbNow - 1000);
    expect(await svc.list()).toHaveLength(1);
  });
});
