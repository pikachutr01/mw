/**
 * ⭐⭐ DEĞİŞİKLİK GÜNLÜĞÜ — GENEL UÇ (kullanıcı, 2026-08-16).
 *
 * ⚠️ **Guard YOK, bilerek** — `worlds-public.controller.ts` ile aynı gerekçe: oyuncunun
 * dengede ne değiştiğini öğrenmesi için giriş yapmış olması gerekmiyor, üstelik ana sayfadan
 * ve misafir modundan da okunabilmeli.
 *
 * ⚠️ Dönen alanlar kasıtlı olarak fakir: `createdBy` (hangi yönetici yazdı) ve taslaklar
 * DIŞARIDA. İlki personel bilgisi, ikincisi henüz yayınlanmamış karar.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ChangelogService } from './changelog.service.ts';

const listQuery = z.object({
  worldId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

@Controller('api/v1/changelog')
export class ChangelogController {
  constructor(private readonly changelog: ChangelogService) {}

  @Get()
  async list(@Query() query: unknown): Promise<{
    entries: Array<{ id: number; title: string; body: string; category: string; publishedAt: string }>;
  }> {
    const q = listQuery.parse(query ?? {});
    const rows = await this.changelog.list({
      worldId: q.worldId ?? null,
      ...(q.limit === undefined ? {} : { limit: q.limit }),
      ...(q.offset === undefined ? {} : { offset: q.offset }),
    });
    return {
      entries: rows.map((e) => ({
        id: e.id,
        title: e.title,
        body: e.body,
        category: e.category,
        // ⚠️ `list` yalnız yayınlanmışları döndürüyor → `publishedAt` burada asla null olamaz.
        publishedAt: e.publishedAt!.toISOString(),
      })),
    };
  }
}
