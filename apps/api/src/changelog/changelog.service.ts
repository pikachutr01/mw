/**
 * ⭐⭐ DEĞİŞİKLİK GÜNLÜĞÜ SERVİSİ (kullanıcı, 2026-08-16).
 *
 * Tek iş: yayınlanmış maddeleri okumak ve yönetici tarafından yazılanları kaydetmek.
 * Gerekçe ve şema kararları `drizzle/0048_changelog.sql` başlığında.
 *
 * ⚠️ **"Yayında mı" sorusunun tek cevabı `published_at <= now()`** — ve bu karşılaştırma
 * SQL'de yapılıyor, süreç saatinde değil. 2026-08-16'da konak saatinin sızması yüzünden
 * scheduler'ın 12 görevi erken çalıştırdığı olay tam olarak bu hata sınıfıydı
 * (`docs/SAAT_SICRAMASI.md`): kıyaslamanın iki ucu aynı saatten gelmezse ileri tarihli bir
 * madde bir anlığına yayınlanmış görünebilirdi.
 */
import { sql } from 'drizzle-orm';
import { toDate, toDateOrNull, type Db } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';

export type ChangelogCategory = 'balance' | 'feature' | 'fix';

export interface ChangelogEntry {
  id: number;
  title: string;
  body: string;
  category: ChangelogCategory;
  publishedAt: Date | null;
  worldId: number | null;
}

export interface ChangelogInput {
  title: string;
  body: string;
  category?: ChangelogCategory;
  worldId?: number | null;
  /** Verilmezse madde TASLAK doğar; `publish` ile yayına alınır. */
  publishedAt?: Date | null;
  createdBy?: number | null;
}

type Runner = Db | Tx;

const CATEGORIES: ReadonlySet<string> = new Set(['balance', 'feature', 'fix']);

/** ⚠️ Kapı burada da var (şemada CHECK olsa bile): 500 yerine anlamlı hata dönsün. */
export function normalizeCategory(v: unknown): ChangelogCategory {
  const s = String(v ?? 'balance');
  if (!CATEGORIES.has(s)) throw new Error(`Geçersiz kategori: ${s}`);
  return s as ChangelogCategory;
}

export class ChangelogService {
  constructor(private readonly db: Db) {}

  /**
   * Oyuncuya görünen liste — yayınlanmışlar, yeniden eskiye.
   *
   * ⚠️ `worldId` verilirse o dünyaya ÖZEL maddeler **ve** tüm dünyaları ilgilendirenler
   * (`world_id IS NULL`) birlikte döner. Yalnız eşitlik arasaydık genel duyurular hiçbir
   * oyuncuya görünmezdi — tablodaki satırların bugün tamamı öyle.
   */
  async list(opts: { worldId?: number | null; limit?: number; offset?: number } = {}): Promise<ChangelogEntry[]> {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, world_id, title, body, category, published_at
        FROM changelog_entries
       WHERE published_at IS NOT NULL AND published_at <= now()
         AND (world_id IS NULL OR world_id = ${opts.worldId ?? null})
       ORDER BY published_at DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}
    `);
    return rows.map(mapRow);
  }

  /** Yönetim listesi — taslaklar DÂHİL. */
  async listAll(limit = 100): Promise<ChangelogEntry[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, world_id, title, body, category, published_at
        FROM changelog_entries
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC
       LIMIT ${Math.min(500, Math.max(1, limit))}
    `);
    return rows.map(mapRow);
  }

  async create(input: ChangelogInput, runner: Runner = this.db): Promise<ChangelogEntry> {
    const category = normalizeCategory(input.category);
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) throw new Error('Başlık ve gövde boş olamaz');

    const rows = await runner.execute<Record<string, unknown>>(sql`
      INSERT INTO changelog_entries (world_id, title, body, category, published_at, created_by)
      VALUES (${input.worldId ?? null}, ${title}, ${body}, ${category},
              ${input.publishedAt ? input.publishedAt.toISOString() : null}::timestamptz,
              ${input.createdBy ?? null})
      RETURNING id, world_id, title, body, category, published_at
    `);
    return mapRow(rows[0]!);
  }

  /**
   * Yayına al. ⚠️ Zaman **DB saatinden** (`now()`), süreç saatinden değil — dosya başlığındaki
   * gerekçe. Zaten yayındaki bir maddeyi tekrar yayınlamak tarihini KAYDIRMAZ (idempotent).
   */
  async publish(id: number): Promise<ChangelogEntry | null> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE changelog_entries
         SET published_at = COALESCE(published_at, now()), updated_at = now()
       WHERE id = ${id}
      RETURNING id, world_id, title, body, category, published_at
    `);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /** Yayından geri çek (taslağa döndürür) — yanlış yazılmış bir madde silinmeden gizlenebilsin. */
  async unpublish(id: number): Promise<ChangelogEntry | null> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE changelog_entries SET published_at = NULL, updated_at = now()
       WHERE id = ${id}
      RETURNING id, world_id, title, body, category, published_at
    `);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async update(id: number, patch: Partial<Pick<ChangelogInput, 'title' | 'body' | 'category'>>): Promise<ChangelogEntry | null> {
    const category = patch.category === undefined ? null : normalizeCategory(patch.category);
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      UPDATE changelog_entries
         SET title    = COALESCE(${patch.title?.trim() ?? null}, title),
             body     = COALESCE(${patch.body?.trim() ?? null}, body),
             category = COALESCE(${category}, category),
             updated_at = now()
       WHERE id = ${id}
      RETURNING id, world_id, title, body, category, published_at
    `);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async remove(id: number): Promise<boolean> {
    const rows = await this.db.execute<{ id: number }>(sql`
      DELETE FROM changelog_entries WHERE id = ${id} RETURNING id
    `);
    return rows.length > 0;
  }

  /**
   * ⭐ TOHUMLAMA — aynı başlık zaten varsa yeniden yazmaz.
   *
   * ⚠️ Benzersizlik kısıtı YOK ve olmamalı: aynı başlık ileride tekrar kullanılabilir
   * ("Denge güncellemesi"). Bu yüzden tekillik burada, **tohumlayan tarafta** aranıyor —
   * betiği iki kez koşturmak maddeyi ikizlemesin diye.
   */
  async seedOnce(input: ChangelogInput): Promise<{ created: boolean; entry: ChangelogEntry | null }> {
    const existing = await this.db.execute<{ id: number }>(sql`
      SELECT id FROM changelog_entries WHERE title = ${input.title.trim()} LIMIT 1
    `);
    if (existing.length > 0) return { created: false, entry: null };
    return { created: true, entry: await this.create(input) };
  }
}

function mapRow(r: Record<string, unknown>): ChangelogEntry {
  return {
    id: Number(r['id']),
    worldId: r['world_id'] == null ? null : Number(r['world_id']),
    title: String(r['title']),
    body: String(r['body']),
    category: String(r['category']) as ChangelogCategory,
    publishedAt: r['published_at'] == null ? null : toDate(r['published_at']),
  };
}

/** Test ve yönetim ekranı için: yayın tarihini güvenle okur. */
export const publishedAtOf = (e: { publishedAt: unknown }): Date | null => toDateOrNull(e.publishedAt);
