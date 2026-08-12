import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ENGINE_VERSION } from '@mobilwar/engine';
import { catalogHash, CATALOG_VERSION } from '@mobilwar/catalog';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { DEFAULT_OPS_THRESHOLDS } from '../ops/ops-monitor.ts';
import { OUTBOX_MAX_ATTEMPTS } from '../outbox/outbox.dispatcher.ts';

/**
 * ⚠️ `fastify` tiplerini İÇE AKTARMIYORUZ — `common/http-exception.filter.ts`teki `ReplyLike`
 * ile aynı gerekçe: proje `fastify`'ı doğrudan bir bağımlılık olarak tutmuyor (adaptör üzerinden
 * geliyor) ve tek ihtiyacımız olan `status`. Yapısal tipleme yeterli.
 */
interface ReplyLike {
  status: (code: number) => unknown;
}

@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Canlılık ucu. Motor sürümü ve katalog hash'i de döner: dağıtımdan sonra "hangi denge yayında"
   * sorusu tek istekle cevaplanır (§8 gözlemlenebilirlik).
   *
   * ⭐⭐ **`?deep=1` — DERİN KONTROL (Faz 3).**
   *
   * ⚠️ Sığ hâli süreç ayakta olduğu sürece **daima 200** döner ve bu, izlemenin en tehlikeli
   * yanılsamasıdır: 06.08.2026'da API sapasağlamdı, `/healthz` yeşildi ve kuyruk 9,5 saattir
   * durmuştu. Süreç yaşıyor olmak, sistemin çalıştığını göstermez.
   *
   * ⚠️ Derin kontrolün var oluş sebebi `ops-rules.ts`in ölçemediği tek şeyi ölçmek:
   * **scheduler'ın kendi ölümü.** Eşik değerlendirmesi scheduler döngüsünün İÇİNDE koşuyor,
   * yani döngü durursa alarm da durur. Kendi ölümünü haber veren bir süreç yazılamaz — o boşluğu
   * ancak DIŞARIDAN bakan bir yoklayıcı kapatır. Bu uç onun bakacağı yer.
   *
   * ⚠️ **Ayrı bir uç değil, aynı ucun parametresi** — bilerek. `/healthz`i yoklayan mevcut
   * altyapı (PM2, dağıtım betiği, uptime izleyicisi) adresi değiştirmeden `?deep=1` ekleyebilir.
   * ⚠️ Varsayılan hâli DEĞİŞMEDİ: sığ kontrol hâlâ sorgusuz ve anlık. Derin kontrolü varsayılan
   * yapsaydık her canlılık yoklaması dört sorgu üretirdi ve izlemenin kendisi yük olurdu.
   */
  @Get('healthz')
  async health(
    @Query('deep') deep: string | undefined,
    @Res({ passthrough: true }) res: ReplyLike,
  ): Promise<Record<string, unknown>> {
    const base = {
      status: 'ok',
      serverNow: new Date().toISOString(),
      role: process.env['ROLE'] ?? 'all',
      engineVersion: ENGINE_VERSION,
      catalogVersion: CATALOG_VERSION,
      catalogHash: catalogHash(),
    };
    if (deep !== '1' && deep !== 'true') return base;

    const t = DEFAULT_OPS_THRESHOLDS;
    const checks: Record<string, unknown> = {};
    let ok = true;
    const fail = (name: string, detail: Record<string, unknown>): void => {
      ok = false;
      checks[name] = { ok: false, ...detail };
    };

    try {
      /**
       * ⚠️ Tek sorgu, üç kaynak: nabız yaşı · kuyruk gecikmesi · ölü mektup. Ayrı sorgular
       * atsaydık yoklayıcı her 30 sn'de üç gidiş-dönüş üretirdi ve sayılar farklı anlara ait olurdu.
       * ⚠️ Gecikme `COALESCE(paused_at, now())` ile ölçülüyor: bakımdaki bir dünya "arızalı"
       * görünmemeli — tam da o sırada operatör bu ucu yokluyor olabilir.
       */
      const [row] = await this.db.execute<Record<string, unknown>>(sql`
        SELECT
          (SELECT EXTRACT(EPOCH FROM (now() - MAX(at)))::int
             FROM worker_heartbeats WHERE kind = 'scheduler')  AS scheduler_age_s,
          (SELECT EXTRACT(EPOCH FROM (now() - MAX(at)))::int
             FROM worker_heartbeats WHERE kind = 'dispatcher') AS dispatcher_age_s,
          (SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (COALESCE(w.paused_at, now()) - m.execute_at))), 0)::int
             FROM missions m JOIN worlds w ON w.id = m.world_id
            WHERE m.status = 'scheduled' AND w.paused_at IS NULL
              AND m.execute_at <= COALESCE(w.paused_at, now()))  AS lag_s,
          (SELECT COUNT(*)::int FROM outbox
            WHERE dispatched_at IS NULL AND attempts >= ${OUTBOX_MAX_ATTEMPTS}) AS outbox_dead,
          (SELECT COUNT(*)::int FROM ops_events WHERE resolved_at IS NULL) AS open_events
      `);

      const n = (k: string): number | null => (row?.[k] == null ? null : Number(row[k]));
      const schedAge = n('scheduler_age_s');
      const dispAge = n('dispatcher_age_s');
      const lagS = n('lag_s') ?? 0;
      const outboxDead = n('outbox_dead') ?? 0;

      checks['db'] = { ok: true };

      /**
       * ⚠️ Nabız satırının **YOKLUĞU** sağlık kanıtı değil ama arıza da değil: `ROLE=api`
       * profilinde scheduler bu süreçte hiç çalışmıyor. Yalnız satır VARSA yaşına bakılıyor —
       * ölçemediğimiz bir şey için 503 dönmek, gerçek arızayı gürültüye boğardı.
       */
      /**
       * ⚠️⚠️ **NEGATİF YAŞ DA ARIZADIR** (2026-08-12 canlı olayı).
       *
       * Kontrol yalnız `yaş > eşik` bakıyordu. Sunucunun saati ~9,5 saat ileri kayıp NTP onu
       * geriye adımlayınca nabız satırları **gelecekte** kaldı → `age` negatife düştü →
       * `age > staleAfter` hep yanlış → **ölü worker "taze" göründü.** `healthz` dört saat
       * boyunca `{"scheduler":{"ok":true,"ageS":-18739}}` dedi; iki `ops_event` açık kaldı ve
       * kimse fark etmedi. Nabzı yazan guard (`heartbeat.ts`: `t - lastWrite < minInterval`)
       * da aynı sıçramada negatife düşüp yazmayı 5 saat boyunca atlıyordu.
       *
       * ⭐ Ders: bir "yaş" ölçüsünde **tek taraflı** eşik yetmez. Negatif yaş fiziksel olarak
       * imkânsız; gördüğümüz an ya saat sıçramıştır ya da satır bozuktur — ikisi de arıza.
       */
      const staleAfter = t.staleHeartbeatS * 3;
      const beat = (name: 'scheduler' | 'dispatcher', age: number | null): void => {
        if (age == null) { checks[name] = { ok: true, ageS: null }; return; }
        if (age > staleAfter) { fail(name, { ageS: age, staleAfterS: staleAfter }); return; }
        if (age < 0) { fail(name, { ageS: age, reason: 'clock_skew' }); return; }
        checks[name] = { ok: true, ageS: age };
      };
      beat('scheduler', schedAge);
      beat('dispatcher', dispAge);

      if (lagS > t.alertLagS) fail('queue', { lagS, thresholdS: t.alertLagS });
      else checks['queue'] = { ok: true, lagS };

      if (outboxDead > t.alertOutboxDead) {
        fail('outbox', { dead: outboxDead, threshold: t.alertOutboxDead });
      } else checks['outbox'] = { ok: true, dead: outboxDead };

      checks['openEvents'] = n('open_events') ?? 0;
    } catch (err) {
      // ⚠️ Veritabanına ulaşılamıyorsa bu KESİN bir arıza — 503 dönmemek yanlış olurdu.
      fail('db', { error: String(err).slice(0, 300) });
    }

    if (!ok) res.status(503);
    return { ...base, status: ok ? 'ok' : 'degraded', deep: true, checks };
  }
}
