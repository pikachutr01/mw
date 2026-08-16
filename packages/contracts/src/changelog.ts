import { z } from 'zod';

/**
 * ⭐⭐ DEĞİŞİKLİK GÜNLÜĞÜ SÖZLEŞMESİ (kullanıcı, 2026-08-16).
 *
 * *"api tarafında oyunu etkileyen değişiklik yapıldığında … oyuncular da görsün."*
 *
 * Oyunun dengesi bugüne kadar yalnız commit mesajlarında ve kod yorumlarında anlatılıyordu;
 * ikisi de geliştirici içindir. Bu uç, aynı bilgiyi oyuncunun diliyle taşır.
 *
 * ⚠️ Gövde **DÜZ METİN** — `support.ts` ile aynı kural: HTML/markdown yok, XSS yüzeyi sıfır.
 * Satır sonu istemcide korunuyor (`whitespace-pre-line`), biçimlendirme başka bir şey değil.
 *
 * ⚠️ `worldId` yükte YOK: genel uç dünya kimliğini sorgu parametresinden okuyor ve maddelerin
 * bugüne kadarki tamamı tüm dünyaları ilgilendiriyor. Oyuncuya dönen satırda da yok — hangi
 * dünyaya yazıldığı oyuncunun işine yaramaz, o zaten kendi dünyasının listesini görüyor.
 */
export const changelogCategory = z.enum(['balance', 'feature', 'fix']);
export type ChangelogCategory = z.infer<typeof changelogCategory>;

/** Rozet etiketleri — panelde ve oyuncu ekranında TEK kaynak. */
export const CHANGELOG_CATEGORY_LABEL: Readonly<Record<ChangelogCategory, string>> = {
  balance: 'Denge',
  feature: 'Yenilik',
  fix: 'Düzeltme',
};

export const changelogEntry = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  category: changelogCategory,
  /** ISO 8601. Genel uçta daima dolu — taslaklar hiç dönmez. */
  publishedAt: z.string(),
});
export type ChangelogEntry = z.infer<typeof changelogEntry>;

export const changelogList = z.object({ entries: z.array(changelogEntry) });
export type ChangelogList = z.infer<typeof changelogList>;
