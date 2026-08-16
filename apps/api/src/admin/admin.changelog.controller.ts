/**
 * ⭐⭐ DEĞİŞİKLİK GÜNLÜĞÜ — YÖNETİM UCU (kullanıcı, 2026-08-16).
 *
 * ⚠️ **Bu ucun var olma sebebi, günlüğün depoda DEĞİL veritabanında olmasının sebebiyle
 * aynı:** dengeyi etkileyen değişikliklerin bir kısmı panelden yapılıyor (`settings`) ve hiç
 * deploy görmüyor. O değişikliği yapan yönetici, notu da aynı yerden yazabilmeli — yoksa not
 * "sonra yazarım"a kalır ve yazılmaz.
 *
 * ⚠️ Silme `AdminStepUpGuard` istiyor, yazma istemiyor: yanlış yazılmış bir maddeyi
 * `unpublish` zaten görünmez yapıyor (geri alınabilir), `DELETE` ise geri alınamaz.
 */
import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException,
  Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import { ChangelogService } from '../changelog/changelog.service.ts';
import { AdminGuard, AdminStepUpGuard } from './admin.guard.ts';

const createBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  category: z.enum(['balance', 'feature', 'fix']).optional(),
  worldId: z.number().int().positive().nullable().optional(),
  /** true = anında yayına al. Verilmezse TASLAK doğar. */
  publish: z.boolean().optional(),
});

const patchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
  category: z.enum(['balance', 'feature', 'fix']).optional(),
});

@Controller('api/v1/admin/changelog')
@UseGuards(AuthGuard, AdminGuard)
export class AdminChangelogController {
  constructor(private readonly changelog: ChangelogService) {}

  /** Taslaklar DÂHİL — yönetici neyi yayınlamadığını görebilmeli. */
  @Get()
  async list(): Promise<{ entries: unknown[] }> {
    const rows = await this.changelog.listAll();
    return {
      entries: rows.map((e) => ({
        id: e.id, title: e.title, body: e.body, category: e.category,
        worldId: e.worldId,
        publishedAt: e.publishedAt?.toISOString() ?? null,
      })),
    };
  }

  @Post()
  async create(@Body() body: unknown): Promise<{ id: number; publishedAt: string | null }> {
    const b = createBody.parse(body ?? {});
    const entry = await this.changelog.create({
      title: b.title,
      body: b.body,
      ...(b.category === undefined ? {} : { category: b.category }),
      worldId: b.worldId ?? null,
      publishedAt: b.publish ? new Date() : null,
    });
    /**
     * ⚠️ `publish: true` geldiyse tarihi SERVİS üzerinden tazeliyoruz — `new Date()` süreç
     * saatidir ve 2026-08-16'daki konak saati sızıntısı tam olarak o kaynağı bozmuştu
     * (`docs/SAAT_SICRAMASI.md`). `publish()` tarihi DB'nin `now()`undan yazıyor.
     */
    const final = b.publish ? await this.changelog.publish(entry.id) : entry;
    return { id: entry.id, publishedAt: final?.publishedAt?.toISOString() ?? null };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<{ ok: true }> {
    const b = patchBody.parse(body ?? {});
    if (Object.keys(b).length === 0) throw new BadRequestException('Değiştirilecek alan yok');
    const r = await this.changelog.update(Number(id), b);
    if (!r) throw new NotFoundException('Madde bulunamadı');
    return { ok: true };
  }

  @Post(':id/publish')
  @HttpCode(200)
  async publish(@Param('id') id: string): Promise<{ publishedAt: string | null }> {
    const r = await this.changelog.publish(Number(id));
    if (!r) throw new NotFoundException('Madde bulunamadı');
    return { publishedAt: r.publishedAt?.toISOString() ?? null };
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  async unpublish(@Param('id') id: string): Promise<{ ok: true }> {
    const r = await this.changelog.unpublish(Number(id));
    if (!r) throw new NotFoundException('Madde bulunamadı');
    return { ok: true };
  }

  @Delete(':id')
  @UseGuards(AdminStepUpGuard)
  @HttpCode(200)
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    const done = await this.changelog.remove(Number(id));
    if (!done) throw new NotFoundException('Madde bulunamadı');
    return { ok: true };
  }
}
