/**
 * Panel oturumunun yetki durumu: **kimim, hangi rol, yükseltmem taze mi**.
 *
 * ⭐ Yükseltme durumu tek yerde tutulur ve her yıkıcı istekten sonra tazelenir. İki ayrı yerde
 * tutulsaydı (ör. her ekran kendi bayrağını saklasaydı) 15 dakika dolduğunda ekranlar farklı
 * şeyler söylerdi: biri düğmeyi açık gösterirken sunucu 403 dönerdi.
 */
import { api, AdminApiError, STEP_UP_CODE } from './api.ts';

export interface AdminMe {
  accountId: number;
  username: string;
  email: string;
  role: 'moderator' | 'admin';
  elevated: boolean;
  /** ⭐ Yükseltmenin bitiş anı — geri sayım için. Veri vardı, gösterimi yoktu. */
  elevatedUntil: string | null;
  stepUpMinutes: number;
}

export const fetchMe = (): Promise<AdminMe> => api<AdminMe>('/api/v1/admin/me');

export const stepUp = (password: string): Promise<{ elevatedUntil: string }> =>
  api<{ elevatedUntil: string }>('/api/v1/admin/step-up', { method: 'POST', body: { password } });

export const stepDown = (): Promise<void> =>
  api<void>('/api/v1/admin/step-down', { method: 'POST' });

/** Sunucu "parolanı yeniden gir" mi diyor? Ekranlar bunu görünce yükseltme diyaloğunu açar. */
export const needsStepUp = (err: unknown): boolean =>
  err instanceof AdminApiError && err.code === STEP_UP_CODE;
