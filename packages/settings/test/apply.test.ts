/**
 * Ayar şemasının ve katman birleştirmesinin SAF testleri — veri tabanı gerektirmez.
 *
 * ⚠️ Servis tarafı (önbellek, `pg_notify`, canlı köprü) `apps/api/test/settings.test.ts`te;
 * orası gerçek Postgres istiyor. Buradaki vakalar saniyeler değil milisaniyeler sürüyor ve
 * şema bozulduğunda ilk kırılan onlar olsun diye pakete konuldu.
 */
import { describe, expect, it } from 'vitest';
import { SETTINGS, SETTINGS_BY_KEY, SETTING_GROUPS, applySettings, coerce, validatePatch } from '../src/index.ts';

describe('şema tutarlılığı', () => {
  it('her anahtar `grup.alan` biçiminde, tekil ve tanımlı bir gruba ait', () => {
    const groups = new Set(SETTING_GROUPS.map((g) => g.id));
    const seen = new Set<string>();
    for (const def of SETTINGS) {
      /**
       * ⚠️ **TAM BİR NOKTA** — bu kural taşıyıcı. `settings/catalog.ts` ve
       * `admin.world.controller.ts:439` anahtarı `key.split('.')` ile TAM İKİ parçaya
       * bölüyor; üç parçalı bir anahtar ikincisinde **sessizce varsayılan gösterirdi**.
       * Yaprakta `:` ve `_` serbest (`buildingTuning.architect_school:gold`), nokta DEĞİL.
       */
      expect(def.key.split('.').length, `${def.key}: tam bir nokta olmalı`).toBe(2);
      expect(def.key, def.key).toMatch(/^[a-zA-Z]+\.[a-zA-Z0-9_:]+$/);
      expect(seen.has(def.key), `tekrar eden anahtar: ${def.key}`).toBe(false);
      seen.add(def.key);
      expect(groups.has(def.key.split('.')[0]!), `tanımsız grup: ${def.key}`).toBe(true);
    }
  });

  it('varsayılanlar kendi aralığında ve her ayarın açıklaması var', () => {
    for (const def of SETTINGS) {
      expect(def.description.length, def.key).toBeGreaterThan(10);
      if (def.type === 'boolean') continue;
      const v = def.default as number;
      if (def.min != null) expect(v, def.key).toBeGreaterThanOrEqual(def.min);
      if (def.max != null) expect(v, def.key).toBeLessThanOrEqual(def.max);
    }
  });

  it('`int` alanların varsayılanı gerçekten tam sayı', () => {
    for (const def of SETTINGS) {
      if (def.type !== 'int') continue;
      expect(Number.isInteger(def.default), def.key).toBe(true);
    }
  });
});

describe('değer doğrulama', () => {
  const burst = SETTINGS_BY_KEY['chat.burst']!;

  it('aralık dışı reddedilir', () => {
    expect(coerce(burst, 0)).toHaveProperty('message');
    expect(coerce(burst, 101)).toHaveProperty('message');
    expect(coerce(burst, 7)).toBe(7);
  });

  /** ⚠️ Kesirli değer SESSİZCE YUVARLANMAZ: "5,5 yazdım 5 oldu" denge ayarında en can sıkıcı hata. */
  it('`int` alanda kesirli değer reddedilir, yuvarlanmaz', () => {
    const out = coerce(burst, 5.5);
    expect(out).toHaveProperty('message');
    expect(String((out as { message: string }).message)).toContain('Tam sayı');
  });

  it('sayı olmayan reddedilir', () => {
    expect(coerce(burst, 'abc')).toHaveProperty('message');
  });

  it('bilinmeyen anahtar yamada hata üretir (sessizce yutulmaz)', () => {
    expect(validatePatch({ 'yok.boyle': 1 }).issues).toHaveLength(1);
  });
});

describe('katman sırası', () => {
  it('varsayılan → env → dünya 0 → dünya; sonraki öncekini ezer', () => {
    const d = SETTINGS_BY_KEY['chat.burst']!.default;
    expect(applySettings([]).effective['chat']?.['burst']).toBe(d);
    expect(applySettings([], { CHAT_RATE_BURST: '7' }).effective['chat']?.['burst']).toBe(7);
    /** ⚠️ DB env'i EZER: panelden kaydedilen değer yeniden başlatmada geri alınmamalı. */
    expect(applySettings([{ 'chat.burst': 9 }], { CHAT_RATE_BURST: '7' })
      .effective['chat']?.['burst']).toBe(9);
    expect(applySettings([{ 'chat.burst': 9 }, { 'chat.burst': 11 }])
      .effective['chat']?.['burst']).toBe(11);
  });

  it('bozuk değer sessizce atlanır — açılışı düşürmez', () => {
    const out = applySettings([{ 'chat.burst': 'saçma' as never }]);
    expect(out.effective['chat']?.['burst']).toBe(SETTINGS_BY_KEY['chat.burst']!.default);
  });

  it('sonuç DONMUŞ (paylaşılan duruma yanlışlıkla yazılamasın)', () => {
    const eff = applySettings([]).effective;
    expect(Object.isFrozen(eff)).toBe(true);
    expect(Object.isFrozen(eff['chat'])).toBe(true);
  });
});

describe('içerik özeti', () => {
  it('içerik değişince değişir, ANAHTAR SIRASI değişince değişmez', () => {
    const a = applySettings([{ 'chat.burst': 9, 'chat.pageSize': 40 }]);
    const b = applySettings([{ 'chat.pageSize': 40, 'chat.burst': 9 }]);
    const c = applySettings([{ 'chat.burst': 10, 'chat.pageSize': 40 }]);
    expect(b.hash).toBe(a.hash);
    expect(c.hash).not.toBe(a.hash);
  });

  it('`overridden` yalnız varsayılandan sapanları listeler', () => {
    expect(applySettings([]).overridden).toHaveLength(0);
    expect(applySettings([{ 'chat.burst': 9 }]).overridden).toEqual(['chat.burst']);
  });
});
