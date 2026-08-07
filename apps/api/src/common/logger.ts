/**
 * ⭐⭐ YAPILANDIRILMIŞ LOG (Faz 3) — `pino`. §8 gözlemlenebilirlik.
 *
 * ⚠️ `pino` bu projede **zaten bir bağımlılıktı ama hiç kullanılmıyordu**: 25 adet düz
 * `console.*` çağrısı vardı ve hepsi serbest metin üretiyordu. Bunun bedeli 06.08.2026'da
 * ödendi — sunucudaki logdan *"hangi dünya, hangi görev, ne kadar süredir"* sorularının hiçbiri
 * süzülerek cevaplanamadı; `grep` ile metin aramak gerekti ve arıza penceresi ancak elle
 * daraltılabildi.
 *
 * ⭐ **`mixin` ile `traceId` OTOMATİK.** Her log satırına elle `traceId` eklemek yerine, pino
 * her satırda `AsyncLocalStorage`a bakıyor. Yani bir istek içinde yazılan HER satır — hangi
 * modülden gelirse gelsin — o isteğin kimliğini taşıyor ve `audit_log.trace_id` ile eşleşiyor.
 * Bu, "eklemeyi unutmak" seçeneğini ortadan kaldırıyor.
 *
 * ⚠️ **`pino-pretty` bağımlılık olarak EKLENMEDİ.** Sunucu profili 4 GB RAM ve iki canlı site
 * daha barındırıyor; üretimde zaten JSON isteniyor (PM2 dosyaya yazıyor, `jq` ile süzülüyor).
 * Geliştirmede okunur çıktı isteyen `node dist/main.js | npx pino-pretty` yazabilir — kalıcı bir
 * bağımlılık, yalnız geliştirici konforu için taşınmamalı.
 */
import pino from 'pino';
import { currentContext } from './request-context.ts';

const level = process.env['LOG_LEVEL']
  ?? (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug');

export const logger = pino({
  level,
  base: { pid: process.pid, role: process.env['ROLE'] ?? 'all' },
  /**
   * ⚠️ Zaman damgası ISO ve **UTC** — `pino`nun varsayılanı epoch milisaniye. Bu projede saat
   * karışıklığı iki kez canlı hataya yol açtı (bkz. `world/time-registry.ts`); log dosyasının
   * kendisi o karışıklığın üçüncü kaynağı olmamalı.
   */
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: () => {
    const ctx = currentContext();
    return ctx ? { traceId: ctx.traceId } : {};
  },
});

/**
 * Modül başına alt logger. `log('scheduler').error({ missionId }, 'görev hata')` biçiminde.
 * ⚠️ İlk argüman NESNE, ikinci MESAJ — ters yazılırsa alanlar süzülemez hâle gelir ve bu
 * dosyanın var oluş sebebi ortadan kalkar.
 */
export function log(mod: string): pino.Logger {
  return logger.child({ mod });
}
