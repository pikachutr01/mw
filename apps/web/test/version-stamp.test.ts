/**
 * ⭐ SÜRÜM DAMGASI (kullanıcı kararı, 2026-08-06): kökte tek dosya + kısa git SHA.
 *
 * ⚠️ Burada ölçülen şey ekranın görüntüsü değil **tesisat**: `vite.config.ts` → `define`
 * sabitleri gerçekten yerine koyuyor mu. Tesisat kırıksa `Help.tsx` çalışma anında
 * `__APP_VERSION__ is not defined` ile patlar — ve bu YALNIZ Yardım sayfası açılınca
 * görülürdü. Vitest aynı `vite.config.ts`i okuduğu için burada birebir aynı yol koşuyor.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('sürüm damgası', () => {
  it('⭐ define sabitleri gerçekten enjekte ediliyor', () => {
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__.length).toBeGreaterThan(0);
    expect(typeof __APP_COMMIT__).toBe('string');
    expect(__APP_COMMIT__.length).toBeGreaterThan(0);
  });

  it('sürüm KÖK package.json ile aynı (tek kaynak)', () => {
    const root = JSON.parse(
      readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { version?: string };
    // ⚠️ Sürüm başka bir yere kopyalanmadı; kopyalansaydı biri bumplanıp diğeri unutulurdu.
    expect(__APP_VERSION__).toBe(root.version);
  });

  /**
   * ⚠️ `'dev'` yedeği KABUL EDİLİR ve bu bilinçli: derleme git deposu olmayan bir yerde
   * (Docker `COPY`, tarball, shallow checkout) koşabilir. Kırılmış bir derleme, eksik bir
   * etiketten çok daha pahalı.
   */
  it('SHA kısa onaltılık ya da `dev` yedeği', () => {
    expect(__APP_COMMIT__).toMatch(/^([0-9a-f]{7,12}|dev)$/);
  });
});
