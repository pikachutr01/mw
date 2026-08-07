/**
 * ⭐ VERİ TABANI TARAYICI (admin Faz 7).
 *
 * ⚠️ **Genel amaçlı SQL kutusu YOK** (planın 5. kısıtı). Tablo adı, kolon adı, sıralama ve
 * filtre alanları **yalnız `db-registry.ts`ten** geliyor; istemciden gelen hiçbir ad SQL'e
 * doğrudan girmiyor. Kayıtta olmayan tablo tarayıcıda görünmez bile.
 *
 * ⚠️ Tanımlayıcılar parametreleştirilemediği için `sql.raw` kullanmak zorundayız — bu yüzden
 * **her tanımlayıcı önce kayıtta aranıyor**. Enjeksiyona kapalı olmasının sebebi kaçış değil,
 * **beyaz liste**.
 */
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Inject, NotFoundException,
  Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { ADMIN_ACTIONS } from './admin.actions.controller.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';
import { DB_TABLES, TABLES_BY_NAME, type TableSpec } from './db-registry.ts';
import { currentTraceId } from '../common/request-context.ts';

const PAGE = 50;

/** Ham düzenleme: kolon → yeni değer. Kolonlar kayıttaki `editable` listesiyle sınırlı. */
const patchBody = z.object({
  /** ⚠️ Birincil anahtar bileşik olabildiği için nesne (`{ city_id: 5, type: 'farm' }`). */
  where: z.record(z.string(), z.union([z.string(), z.number()])),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

@Controller('api/v1/admin/db')
@UseGuards(AuthGuard, AdminGuard)
export class AdminDbController {
  /**
   * tablo → sayısal kolon adları. `information_schema`dan bir kez okunup önbelleğe alınır.
   *
   * ⚠️ Kayda elle `numeric: [...]` yazmak da mümkündü; yazmadık çünkü Faz 7'de elle yazılmış
   * kolon adlarının **dördü yanlış** çıkmıştı. Şemanın kendisi tek doğruluk kaynağı.
   * Şema süreç ömrü boyunca değişmediği için önbellek güvenli.
   */
  private readonly numericCache = new Map<string, Set<string>>();

  constructor(@Inject(DB) private readonly db: Db) {}

  private async numericColumns(table: string): Promise<Set<string>> {
    const hit = this.numericCache.get(table);
    if (hit) return hit;
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ${table}
    `);
    const set = new Set(rows
      .filter((r) => /^(smallint|integer|bigint|numeric|real|double precision)$/
        .test(String(r['data_type'])))
      .map((r) => String(r['column_name'])));
    this.numericCache.set(table, set);
    return set;
  }

  /** Tarayıcının sol listesi + politikalar + uyarılar. Panel formunu bundan üretiyor. */
  @Get('tables')
  tables(): Record<string, unknown> {
    return {
      tables: DB_TABLES.map((t) => ({
        name: t.name, label: t.label, policy: t.policy,
        columns: t.columns ?? [], editable: t.editable ?? [], filters: t.filters ?? [],
        warning: t.warning ?? null,
      })),
      /** ⭐ Aksiyon künyesi de burada: panel «bu tablo aksiyonla değişir» diyebilsin. */
      actions: ADMIN_ACTIONS,
      pageSize: PAGE,
    };
  }

  /**
   * Satırları oku.
   *
   * ⚠️ Sayfalama **offset** ile. Keyset (cursor) daha doğru ölçeklenir ama bu bir yönetim
   * aracı: 50'şer satırla gezilen tablolarda offset'in maliyeti görünmez ve keyset, bileşik
   * anahtarlı tablolarda (buildings, units…) ekstra karmaşıklık getirirdi.
   */
  @Get('tables/:table')
  async rows(
    @Param('table') table: string, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const spec = this.spec(table);
    const q = (req as unknown as { query?: Record<string, unknown> }).query ?? {};
    const page = Math.max(0, Math.trunc(Number(q['page'] ?? 0)) || 0);

    const numeric = await this.numericColumns(spec.name);

    /** Filtreler: **yalnız kayıttaki alanlar**; değer parametre olarak gidiyor. */
    const conditions = [];
    const applied: Record<string, string> = {};
    for (const field of spec.filters ?? []) {
      const raw = q[field];
      if (raw == null || String(raw).trim() === '') continue;
      const value = String(raw).trim();
      applied[field] = value;
      /**
       * ⚠️ **DÜZELTİLDİ (2. nesil Tur 2).** Eskiden her alanda `::text ILIKE '%değer%'` vardı
       * ve bunun iki bedeli ölçüldü:
       *   • `player_id = 5` filtresi **15, 25, 51'i de** getiriyordu — "bir oyuncunun verisi"
       *     senaryosunda sessizce yanlış sonuç.
       *   • `::text` cast'i indeksi kullanılamaz hâle getiriyordu (her sorgu tam tarama).
       * Artık ayrım kolon adından TAHMİN edilmiyor, `information_schema`dan **okunuyor**:
       * sayısal kolonda tam eşleşme, metin kolonunda `ILIKE`.
       */
      if (numeric.has(field)) {
        const n = Number(value);
        // Sayısal kolona metin yazıldıysa hiçbir satır eşleşmemeli — SQL hatası vermemeli.
        conditions.push(Number.isFinite(n)
          ? sql`${sql.raw(`"${field}"`)} = ${n}`
          : sql`FALSE`);
      } else {
        conditions.push(sql`${sql.raw(`"${field}"`)}::text ILIKE ${`%${value}%`}`);
      }
    }
    const where = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    const cols = spec.columns?.length
      ? sql.raw(spec.columns.map((c) => `"${c}"`).join(', '))
      : sql.raw('*');

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT ${cols} FROM ${sql.raw(`"${spec.name}"`)}
      ${where}
      ORDER BY ${sql.raw(`"${spec.orderBy}"`)} DESC
      LIMIT ${PAGE} OFFSET ${page * PAGE}
    `);
    const [count] = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM ${sql.raw(`"${spec.name}"`)} ${where}
    `);

    return {
      table: spec.name, label: spec.label, policy: spec.policy,
      columns: spec.columns ?? (rows[0] ? Object.keys(rows[0]) : []),
      editable: spec.editable ?? [], filters: spec.filters ?? [],
      warning: spec.warning ?? null,
      page, pageSize: PAGE, total: Number(count?.['n'] ?? 0),
      applied,
      rows,
    };
  }

  /**
   * ⭐ HAM DÜZENLEME (kullanıcının kararı: *"ikisi birden — aksiyon + geliştirici kipi"*).
   *
   * Üç kapıdan geçiyor:
   *   1. `AdminStepUpGuard` — parola son 15 dakikada yeniden girilmiş olmalı
   *   2. Tablo politikası `edit` olmalı (`readonly`/`action` tabloları reddedilir)
   *   3. Kolon `editable` listesinde olmalı
   *
   * ⚠️ `where` de **birincil anahtar/filtre alanlarıyla sınırlı**: serbest bırakılsaydı
   * `WHERE 1=1` etkisi yaratan bir istekle tablonun tamamı güncellenebilirdi.
   *
   * ⚠️ Önceki hâl audit'e **satır olarak** yazılıyor. Ham düzenlemenin geri alınabilir olması
   * için gereken tek şey bu; aksi hâlde "ne değiştirdim" sorusu cevapsız kalırdı.
   */
  @Patch('tables/:table')
  @UseGuards(AdminStepUpGuard)
  async patch(
    @Param('table') table: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const spec = this.spec(table);
    if (spec.policy !== 'edit') {
      throw new ForbiddenException(
        spec.policy === 'readonly'
          ? `«${spec.label}» salt-okunur.`
          : `«${spec.label}» yalnız küratörlü aksiyonla değişir (${spec.warning ?? ''})`,
      );
    }
    const parsed = patchBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    const editable = new Set(spec.editable ?? []);
    const bad = Object.keys(parsed.data.values).filter((c) => !editable.has(c));
    if (bad.length > 0) {
      throw new ForbiddenException(
        `Bu kolonlar düzenlenemez: ${bad.join(', ')}. İzinli: ${[...editable].join(', ')}`,
      );
    }
    const keyFields = new Set([...(spec.filters ?? []), 'id']);
    const badKeys = Object.keys(parsed.data.where).filter((c) => !keyFields.has(c));
    if (badKeys.length > 0 || Object.keys(parsed.data.where).length === 0) {
      throw new BadRequestException(
        `Satır seçimi yalnız şu alanlarla yapılabilir: ${[...keyFields].join(', ')}`,
      );
    }

    const whereParts = Object.entries(parsed.data.where)
      .map(([k, v]) => sql`${sql.raw(`"${k}"`)} = ${v}`);
    const setParts = Object.entries(parsed.data.values)
      .map(([k, v]) => sql`${sql.raw(`"${k}"`)} = ${v}`);
    const whereSql = sql`WHERE ${sql.join(whereParts, sql` AND `)}`;

    // Önce ESKİ hâl (audit için), sonra yazım — ikisi tek transaction'da.
    const result = await this.db.transaction(async (tx) => {
      const before = await tx.execute<Record<string, unknown>>(sql`
        SELECT * FROM ${sql.raw(`"${spec.name}"`)} ${whereSql} LIMIT 20
      `);
      if (before.length === 0) throw new NotFoundException('Eşleşen satır yok.');
      /**
       * ⚠️ Toplu güncellemeye kapalı: tek istekte 20'den fazla satır etkileniyorsa bu bir
       * kaza ihtimalidir ve yönetim aracı kazayı kolaylaştırmamalı.
       */
      if (before.length > 20) throw new BadRequestException('Çok fazla satır eşleşti (>20).');

      const after = await tx.execute<Record<string, unknown>>(sql`
        UPDATE ${sql.raw(`"${spec.name}"`)} SET ${sql.join(setParts, sql`, `)} ${whereSql}
        RETURNING *
      `);
      await tx.execute(sql`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, before, after, trace_id)
        VALUES (${req.player!.worldId}, ${req.player!.playerId}, 'admin.db.patch',
                ${spec.name}, NULL,
                ${JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb, ${currentTraceId()})
      `);
      return after;
    });
    return { ok: true, updated: result.length, rows: result };
  }

  private spec(table: string): TableSpec {
    const spec = TABLES_BY_NAME[table];
    // ⚠️ Kayıtta olmayan tablo YOK muamelesi görür — varlığı da sızmaz.
    if (!spec) throw new NotFoundException('Tablo kayıtlı değil.');
    return spec;
  }
}
