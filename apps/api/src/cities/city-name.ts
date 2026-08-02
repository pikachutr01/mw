/**
 * Şehir / kahraman adının **zod** sarmalı. Kuralın kendisi katalogda
 * (`@mobilwar/catalog` → `name-rules.ts`): sunucu doğrulaması ile ad üreteçleri aynı sayıya
 * bakmak zorunda, bu yüzden sınır orada tek yerde duruyor.
 */
import { NAME_MAX, NAME_MIN, NAME_PATTERN, NAME_RULE_MESSAGE, normalizeName } from '@mobilwar/catalog';
import { z } from 'zod';

/**
 * ⚠️ Sıra önemli: önce **normalleştir**, sonra ölç. Tersi olsaydı `"  Ova  "` yedi karakter
 * sayılır, kırpıldıktan sonra üçe düşerdi — oyuncuya "kabul edildi" deyip farklı bir ad
 * yazmış olurduk. Aynı sebeple uzunluk sınırı da normalleştirilmiş dizeye uygulanıyor.
 */
export const gameName = z.string()
  .transform(normalizeName)
  .refine((s) => s.length >= NAME_MIN && s.length <= NAME_MAX, NAME_RULE_MESSAGE)
  .refine((s) => NAME_PATTERN.test(s), NAME_RULE_MESSAGE);

export const renameRequest = z.object({ name: gameName });

export { NAME_MAX, NAME_MIN, NAME_RULE_MESSAGE };
