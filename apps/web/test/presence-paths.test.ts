/**
 * ⭐ ÇAKIŞMA KAPISI KENDİLİĞİNDEN KAPANIR — hangi ucun 200'ü sahipliği KANITLAR?
 *
 * `api.ts` 2026-08-16'ya kadar `setConflict`i yalnız DOLU değerle çağırıyordu; `null` hiç
 * yazılmıyordu. Kapı bir kez açılınca ekranda kalıyordu — öteki kopya kapanmış, sahiplik
 * serbest kalmış ve istekler yeniden 200 dönüyor olsa bile.
 *
 * ⚠️ Koşulsuz temizlemek YANLIŞ olurdu: `/auth/*` ve `/admin/*` sunucuda tek cihaz kuralından
 * MUAF (`auth.guard.ts` → `PRESENCE_EXEMPT`). Kapı açıkken jeton yenileme çalışmaya devam
 * ediyor; onun 200'ü sahipliğin bizde olduğunu kanıtlamaz ve kapıyı her yenilemede
 * yanıp söndürürdü.
 */
import { describe, expect, it } from 'vitest';
import { isPresenceGuarded } from '../src/lib/api.ts';

describe('sahiplik kuralına tabi uçlar', () => {
  for (const path of [
    '/api/v1/cities',
    '/api/v1/cities/15',
    '/api/v1/missions',
    '/api/v1/messages?kind=all&page=0&limit=1',
    '/api/v1/world/state',
    '/api/v1/command/overview',
  ]) {
    it(`${path} → 200'ü sahipliği kanıtlar`, () => {
      expect(isPresenceGuarded(path)).toBe(true);
    });
  }

  for (const path of [
    '/api/v1/auth/refresh',
    '/api/v1/auth/session/claim',
    '/api/v1/auth/me',
    '/api/v1/admin/players',
  ]) {
    it(`${path} MUAF → 200'ü hiçbir şey kanıtlamaz`, () => {
      expect(isPresenceGuarded(path)).toBe(false);
    });
  }

  /** ⚠️ Baştaki eğik çizgi olmadan da aynı karar: `api()` iki biçimi de kabul ediyor. */
  it('baştaki eğik çizgi kararı değiştirmez', () => {
    expect(isPresenceGuarded('api/v1/auth/refresh')).toBe(false);
    expect(isPresenceGuarded('api/v1/cities')).toBe(true);
  });

  /** ⚠️ `authors` gibi bir uç eklenirse `auth` ön ekine takılmamalı (`\b` sınırı). */
  it('«auth» ile BAŞLAYAN başka bir ad muaf sayılmaz', () => {
    expect(isPresenceGuarded('/api/v1/authors')).toBe(true);
  });
});
