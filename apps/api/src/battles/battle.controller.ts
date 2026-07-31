/**
 * Posta kutusu ve savaş raporu uçları.
 *
 * ⭐ Rapor `battles.result`'tan **okuma anında** türetilir (`buildBattleReport`), ayrıca
 * saklanmaz. Görünürlük burada uygulanır: savaşı yalnız SALDIRAN veya SAVUNAN görebilir ve
 * her biri kendi yüzünü görür (§13.10.1).
 */
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Inject,
  NotFoundException, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { buildBattleReport, type BattleRow, type ReportSide } from './battle-report.ts';

/**
 * Toplu silme isteği. **200 üst sınırı** keyfî değil: "Hepsini Seç" ekrandaki SAYFAYI seçer
 * (en fazla 100 satır), yani sınır normal kullanımın iki katı. Sınırsız bıraksaydık tek
 * istekle on binlerce satır silinebilirdi ve `id = ANY(...)` planı çöker.
 */
const deleteMessagesRequest = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

@Controller('api/v1')
@UseGuards(AuthGuard)
export class BattleController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Posta kutusu — savaş ve dönüş raporları, en yeni üstte. */
  @Get('messages')
  async messages(
    @Req() req: AuthedRequest,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const take = Math.min(100, Math.max(1, Number(limit ?? 50) || 50));
    const cursor = before ? Number(before) : null;

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT id, kind, side, battle_id, mission_id, subject, body, at, read_at
        FROM messages
       WHERE world_id = ${player.worldId} AND player_id = ${player.playerId}
         AND (${cursor}::bigint IS NULL OR id < ${cursor}::bigint)
       ORDER BY id DESC
       LIMIT ${take}
    `);
    const unread = await this.db.execute<Record<string, unknown>>(sql`
      SELECT COUNT(*)::int AS n FROM messages
       WHERE world_id = ${player.worldId} AND player_id = ${player.playerId} AND read_at IS NULL
    `);

    return {
      unread: Number(unread[0]?.['n'] ?? 0),
      items: rows.map((r) => ({
        id: Number(r['id']),
        kind: String(r['kind']),
        side: r['side'] == null ? null : String(r['side']),
        battleId: r['battle_id'] == null ? null : Number(r['battle_id']),
        missionId: r['mission_id'] == null ? null : Number(r['mission_id']),
        subject: String(r['subject']),
        body: r['body'] ?? {},
        at: toDate(r['at']).toISOString(),
        readAt: r['read_at'] == null ? null : toDate(r['read_at']).toISOString(),
      })),
      serverNow: new Date().toISOString(),
    };
  }

  @Post('messages/:id/read')
  @HttpCode(204)
  async markRead(@Param('id') id: string, @Req() req: AuthedRequest): Promise<void> {
    const player = req.player!;
    // Sahiplik koşulu WHERE'de: başkasının mesajı hiç güncellenmez, 404 sızıntısı da olmaz.
    await this.db.execute(sql`
      UPDATE messages SET read_at = now()
       WHERE id = ${Number(id)} AND player_id = ${player.playerId}
         AND world_id = ${player.worldId} AND read_at IS NULL
    `);
  }

  /**
   * ⭐ **MESAJ / RAPOR SİLME** — orijinalin `slMsj.do`'su + "Hepsini Seç" (`g.java:32` a[14]).
   *
   * Tek uç hem tek satırı hem toplu seçimi karşılar: istemci her hâlde bir `ids` dizisi
   * gönderir. Ayrı bir `DELETE /messages/:id` yazmak aynı sahiplik koşulunu ikinci kez
   * kopyalamak olurdu — ve iki yoldan biri unutulduğunda sızıntı tam oradan çıkar.
   *
   * ⚠️ **Yalnız posta kutusu satırı silinir, SAVAŞ silinmez.** `messages.battle_id` →
   * `battles` bağı `ON DELETE CASCADE` ama yön TERS (savaş silinirse mesaj gider, tersi
   * değil). Bu şart: aynı savaşın karşı tarafı kendi raporunu görmeye devam etmeli, üstelik
   * `battles` denetim kaydıdır.
   *
   * ⚠️ Sahiplik koşulu WHERE'de (`markRead` ile aynı desen): başkasının satırı hiç
   * eşleşmez, dolayısıyla "var mı yok mu" bilgisi de sızmaz. Yanıt yalnız **kaç satır
   * silindiğini** söyler.
   *
   * ⚠️ Sohbetler (`chat_*`) buradan GEÇMEZ — onların kendi "yalnız bende sil" ucu var
   * (`DELETE /chat/conversations/:id`), çünkü sohbet iki taraflı ve satır sunucuda kalır.
   */
  @Post('messages/delete')
  @HttpCode(200)
  async deleteMessages(
    @Body() body: unknown, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const parsed = deleteMessagesRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz istek.');

    /**
     * ⚠️ Kimlik listesi **jsonb** olarak geçiyor, `bigint[]` olarak DEĞİL. Denendi ve iki ayrı
     * duvara çarpıldı: ham `number[]` verilince postgres.js *"the 'string' argument must be of
     * type string"* diye patlıyor (int8 dizisini metin protokolüyle yazıyor), `String`'e
     * çevirince de drizzle diziyi tek parametreye düzleştirip *"malformed array literal"*
     * ürettiriyor. Tek metin parametresi bu katmanların ikisini de atlıyor ve planlayıcı
     * yine `messages_player` indeksini kullanıyor.
     */
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      DELETE FROM messages
       WHERE player_id = ${player.playerId} AND world_id = ${player.worldId}
         AND id IN (
           SELECT value::bigint FROM jsonb_array_elements_text(${JSON.stringify(parsed.data.ids)}::jsonb)
         )
      RETURNING id
    `);
    return { deleted: rows.length };
  }

  /** Savaş raporu — okuyanın tarafına göre şekillenir. */
  @Get('battles/:id')
  async battle(@Param('id') id: string, @Req() req: AuthedRequest): Promise<Record<string, unknown>> {
    const player = req.player!;
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT b.id, b.world_id, b.attacker_player_id, b.defender_player_id,
             b.attacker_city_id, b.defender_city_id,
             b.at, b.winner, b.night, b.rng_seed, b.engine_version, b.catalog_hash, b.input, b.result,
             oc.k AS ok, oc.d AS od, oc.s AS os, tc.k AS tk, tc.d AS td, tc.s AS ts
        FROM battles b
        LEFT JOIN cities oc ON oc.id = b.attacker_city_id
        LEFT JOIN cities tc ON tc.id = b.defender_city_id
       WHERE b.id = ${Number(id)}
    `);
    const b = rows[0];
    if (!b || Number(b['world_id']) !== player.worldId) throw new NotFoundException('Savaş bulunamadı.');

    const side: ReportSide | null =
      Number(b['attacker_player_id']) === player.playerId ? 'attacker'
        : Number(b['defender_player_id']) === player.playerId ? 'defender'
          : null;
    if (!side) throw new ForbiddenException('Bu savaşın tarafı değilsiniz.');

    /**
     * ⭐ SIZINTI KİLİDİ: savunana özel blok (`defenderPrivate` — mağara kaçış dökümü) saldıran
     * tarafta anahtarıyla birlikte SİLİNİR. Rapor kurucusu ayrıca side'a bakar ama tek satırlık
     * bu silme, ileride eklenen her yeni özel alanı da otomatik korur.
     */
    const result = { ...(b['result'] as Record<string, unknown>) };
    if (side !== 'defender') delete result['defenderPrivate'];

    const coord = (k: unknown, d: unknown, s: unknown): { k: number; d: number; s: number } | null =>
      k == null ? null : { k: Number(k), d: Number(d), s: Number(s) };
    const battle: BattleRow = {
      id: Number(b['id']),
      at: toDate(b['at']),
      night: Boolean(b['night']),
      winner: String(b['winner']),
      input: b['input'] as BattleRow['input'],
      result: result as unknown as BattleRow['result'],
      // Eski kayıtlarda `result.coords` yok → şehirler hâlâ duruyorsa JOIN'den türet.
      fallbackCoords: {
        origin: coord(b['ok'], b['od'], b['os']),
        target: coord(b['tk'], b['td'], b['ts']),
      },
    };

    return {
      ...buildBattleReport(battle, side),
      // ⭐ Determinizm künyesi: savaşın hangi motor ve denge verisiyle çözüldüğü raporda görünür
      //    → "sonuç neden böyle" tartışmasında kanıt oyuncunun elinde olur (§5).
      provenance: {
        seed: Number(b['rng_seed']),
        engineVersion: String(b['engine_version']),
        catalogHash: String(b['catalog_hash']),
      },
    };
  }
}
