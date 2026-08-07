/**
 * `vacation_end` görevi — **30 günlük üst sınır dolunca otomatik çıkış** (kullanıcı kararı).
 *
 * Tip adı `worker.ts:67`de aylardır ayrılmıştı; gövdesi burada.
 *
 * ⚠️ **İdempotent**: oyuncu 48 saat sonra elle çıktıysa görev sessizce hiçbir şey yapmaz
 * (`endVacation` false döner). Görev iptal edilmiyor, çünkü iptali unutmak "hayalet çıkış"
 * üretirdi: oyuncu ikinci kez tatile girer, eski görev vadesi gelir ve onu erkenden çıkarırdı.
 * Bunun yerine görev **her zaman çalışır ama yalnız hâlâ tatildeyse etki eder** — ve
 * `idempotency_key` giriş anını taşıdığı için ikinci girişin kendi görevi ayrı satırdır.
 *
 * ⚠️ `ctx.at` görevin VADESİDİR (§1), worker'ın uyandığı an değil. Kaynak çıpası tam o ana
 * çekilir; worker altı saat geç kalsa bile oyuncuya altı saatlik bedava üretim yazılmaz.
 */
import { sql } from 'drizzle-orm';
import type { MissionHandler } from '../missions/handler-registry.ts';
import { endVacation } from './vacation.service.ts';

export function createVacationEndHandler(): MissionHandler {
  return async (ctx) => {
    const payload = (ctx.mission.payload ?? {}) as { playerId?: number; since?: string };
    const playerId = Number(payload.playerId ?? 0);
    if (!Number.isFinite(playerId) || playerId <= 0) return;

    /**
     * ⚠️ **Görev, YAZILDIĞI tatile bağlıdır.** Oyuncu elle çıkıp yeniden girdiyse bu görev
     * ARTIK BAŞKA bir tatilin ortasında ateşleniyor olabilir ve onu erken bitirirdi
     * (senaryo `vacation.service.ts` → `enter()` 3. adımda yazılı). `vacation_since`
     * eşleşmiyorsa dokunmadan çekiliyoruz.
     *
     * Eski görevlerde `since` yok (bu koruma sonradan geldi) → o durumda eski davranış:
     * hâlâ tatildeyse bitir.
     */
    const [own] = await ctx.tx.execute<Record<string, unknown>>(sql`
      SELECT vacation_mission_id, vacation_since FROM players WHERE id = ${playerId}
    `);

    if (own?.['vacation_mission_id'] != null) {
      /**
       * ⭐⭐ KİMLİK KARŞILAŞTIRMASI — zamandan bağımsız (2026-08-07).
       *
       * ⚠️ Eskiden burada `payload.since` ile `vacation_since` **ISO dize eşitliği**
       * karşılaştırılıyordu ve bu, tek zaman çizgisinde sessiz bir arıza olurdu: bakımda
       * `vacation_since` kaydırılıyor, JSONB'deki `since` kaydırılmıyor → eşitlik tutmaz,
       * handler no-op'a düşer ve oyuncu **sonsuza kadar tatilde kalır**. Görev kimliği
       * kaymaya duyarsız.
       */
      if (Number(own['vacation_mission_id']) !== ctx.mission.id) return;
    } else if (payload.since != null) {
      // Geriye dönük: kimlik sütunu doldurulmadan önce yazılmış görevler.
      const since = own?.['vacation_since'] == null
        ? null : new Date(String(own['vacation_since'])).toISOString();
      if (since !== new Date(payload.since).toISOString()) return;
    }

    const ended = await endVacation(ctx.tx, playerId, ctx.at);
    if (!ended) return;                 // elle çıkılmış → sessiz no-op

    const [p] = await ctx.tx.execute<Record<string, unknown>>(sql`
      SELECT username FROM players WHERE id = ${playerId}
    `);
    await ctx.emit('vacation:ended', {
      worldId: ctx.worldId,
      playerId,
      at: ctx.at.toISOString(),
      reason: 'max_days',
    });
    await ctx.audit({
      action: 'vacation.auto_end',
      after: { playerId, username: p?.['username'] ?? null, at: ctx.at.toISOString() },
    });
  };
}
