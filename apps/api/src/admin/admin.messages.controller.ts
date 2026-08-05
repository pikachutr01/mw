/**
 * ⭐ SİSTEM MESAJI — yöneticiden oyunculara (kullanıcı isteği, `ek_bilgiler`).
 *
 * *"Admin panelinden oyunculara sistem mesajı göndermek, özel veya herkese bildirim mesajı
 * iletmek… Önemli bir bilgi veya güncelleme olursa oyuncuları hızlıca bilgilendirmek amaçlı."*
 *
 * ⚠️ **YENİ TABLO YOK, YENİ EKRAN YOK.** Mesaj mevcut posta kutusuna (`messages`)
 * `kind = 'system'` ile düşüyor. Bunun üç somut kazancı var ve üçü de kullanıcının
 * şartlarının doğrudan karşılığı:
 *   • *"Mesajlar sekmesine düşebilir"* → sekme ayrımı `kind LIKE '%_report'`; `system` rapor
 *     değil, yani hiçbir kod yazmadan doğru sekmeye düşüyor.
 *   • *"Tıpkı raporlar gibi modal üzerinde açılırlar"* → posta kutusunun modalı zaten o.
 *   • *"Açılınca okunmuş sayılırlar"* → `read_at` satır başına; mevcut `messages/:id/read`
 *     akışı olduğu gibi çalışıyor.
 *
 * ⚠️ **DUYURU = OYUNCU BAŞINA BİR SATIR**, paylaşılan tek satır değil. Tek satır + ayrı bir
 * "kim okudu" tablosu daha tutumlu görünür ama okunmuşluk, silme ve sayaçların HEPSİ satır
 * bazlı çalışıyor; paylaşılan satır bu üçünü de yeniden yazmayı gerektirirdi. Yazım tek
 * `INSERT … SELECT` olduğu için maliyet oyuncu sayısıyla değil tek sorguyla ölçülüyor.
 */
import {
  BadRequestException, Body, Controller, Get, HttpCode, Inject, NotFoundException, Post, Query,
  Req, UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';

/**
 * ⚠️ Uzunluk sınırları **gösterime** göre: konu posta kutusu listesinde tek satır, gövde
 * modalda okunuyor. 4000 karakter, bir duyuru için fazlasıyla geniş; sınırsız bırakmak
 * `jsonb` gövdesini ve WS yükünü açık uçlu hâle getirirdi.
 */
const sendBody = z.object({
  worldId: z.number().int().positive(),
  /** `world` = o dünyadaki HERKES · `player` = tek oyuncu. */
  scope: z.enum(['world', 'player']),
  playerId: z.number().int().positive().optional(),
  subject: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(4000),
});

@Controller('api/v1/admin/messages')
@UseGuards(AuthGuard, AdminGuard)
export class AdminMessagesController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: GameClockService,
  ) {}

  /**
   * Duyuruyu gönderir.
   *
   * ⚠️ **Adım yükseltme ZORUNLU** (`AdminStepUpGuard`): bu, panelin geri alınamayan tek
   * "dışarı çıkan" aksiyonu. Yanlış gönderilen bir duyuru binlerce posta kutusuna düşer ve
   * geri çağrılamaz — silme ucu bilerek yok (aşağıya bak).
   */
  @Post()
  @HttpCode(200)
  @UseGuards(AdminStepUpGuard)
  async send(@Body() body: unknown, @Req() req: AdminRequest): Promise<Record<string, unknown>> {
    const d = parse(sendBody, body);
    if (d.scope === 'player' && d.playerId == null) {
      throw new BadRequestException('Tek oyuncuya gönderim için oyuncu seçilmeli.');
    }

    /**
     * ⚠️ Zaman OYUN saatinden (`messages.at` sözleşmesi: "ne zaman oldu", "ne zaman yazıldı"
     * değil). Duyuru için ikisi aynı ana denk geliyor ama sütunun anlamı dünya genelinde tek
     * olmalı — `now()` yazmak, dünya duraklatılmışken listeyi geleceğe savururdu.
     */
    const at = await this.clock.gameNow(d.worldId);
    /**
     * ⚠️ `origin: 'admin'` bir süs değil, **KÖKEN İŞARETİ**. `kind = 'system'` panelden
     * ÖNCE de kullanılıyordu (ittifaktan çıkarılma, liderlik devri, mağara iptali) ve
     * aşağıdaki «gönderilenler» listesi onları da toplayınca panel, hiç göndermediği
     * mesajları "gönderdiklerin" diye gösteriyordu — dev verisinde görüldü.
     *
     * ⚠️ Ayrım **`text` alanının varlığına** bağlanmadı: o, istemcinin "gösterilecek düz
     * metin var mı" sorusunun cevabı ve ileride başka bir altsistem metinli bir sistem
     * mesajı yazarsa panel listesine sızardı. Köken ayrı bir soru, ayrı alan.
     */
    const payload = JSON.stringify({ text: d.text, origin: 'admin' });

    let sent: number;
    let playerName: string | null = null;
    if (d.scope === 'player') {
      const [p] = await this.db.execute<Record<string, unknown>>(sql`
        SELECT username FROM players WHERE id = ${d.playerId!} AND world_id = ${d.worldId}
      `);
      if (!p) throw new NotFoundException('Oyuncu bu dünyada bulunamadı.');
      playerName = String(p['username']);
      await this.db.execute(sql`
        INSERT INTO messages (world_id, player_id, kind, side, subject, body, at)
        VALUES (${d.worldId}, ${d.playerId!}, 'system', 'owner', ${d.subject},
                ${payload}::jsonb, ${at.toISOString()}::timestamptz)
      `);
      sent = 1;
    } else {
      /**
       * ⚠️ **Tatildeki ve korumadaki oyuncular DA alır** — süzgeç bilerek yok. Duyurunun
       * konusu oyunun kendisi (bakım, kural değişikliği); tatilden dönen oyuncunun onu
       * kaçırmış olması, duyuruyu göndermemekle aynı sonucu verirdi.
       */
      const rows = await this.db.execute<Record<string, unknown>>(sql`
        INSERT INTO messages (world_id, player_id, kind, side, subject, body, at)
        SELECT ${d.worldId}, p.id, 'system', 'owner', ${d.subject},
               ${payload}::jsonb, ${at.toISOString()}::timestamptz
          FROM players p WHERE p.world_id = ${d.worldId}
        RETURNING 1
      `);
      sent = rows.length;
    }

    /**
     * ⭐ Tek outbox satırı yetiyor. Dağıtıcı `playerIds` boş gelince olayı **dünya odasına**
     * yayıyor (`realtime.gateway.dispatch`) — yani duyuru için oyuncu başına satır yazmaya
     * gerek yok, rozet herkeste yine anında güncelleniyor.
     */
    await this.db.execute(sql`
      INSERT INTO outbox (world_id, topic, payload)
      VALUES (${d.worldId}, 'message:written', ${JSON.stringify(
    d.scope === 'player' ? { playerId: d.playerId, kind: 'system' } : { kind: 'system' },
  )}::jsonb)
    `);

    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after)
      VALUES (${d.worldId}, ${req.player!.playerId}, 'system_message.send', 'message',
              ${d.playerId ?? 0},
              ${JSON.stringify({
    scope: d.scope, sent, subject: d.subject, target: playerName, chars: d.text.length,
  })}::jsonb)
    `);

    return { ok: true, sent, scope: d.scope, target: playerName };
  }

  /**
   * Gönderilmiş duyurular + **okunma sayacı**.
   *
   * ⚠️ Bu uç bir konfor değil, gönderimin TEK geri bildirimi: duyuru yöneticinin kendi posta
   * kutusuna düşmüyor, dolayısıyla o olmadan "gitti mi, kaç kişi açtı" sorusunun cevabı
   * hiçbir ekranda yok. Aynı `subject + at` ile yazılan satırlar tek duyuru sayılıyor —
   * toplu yazımın hepsi aynı `at` değerini paylaşıyor (yukarıda tek `at` hesaplanıyor).
   *
   * ⚠️ Süzgeç `origin = 'admin'`: `kind = 'system'` oyunun kendi bildirimlerinde de
   * kullanılıyor ve onlar bu listeye ait değil (yukarıdaki nota bak).
   */
  @Get()
  async list(
    @Query('worldId') worldId: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>[]> {
    const w = Number(worldId);
    if (!Number.isInteger(w) || w <= 0) throw new BadRequestException('worldId gerekli.');
    const n = Math.min(50, Math.max(1, Number(limit) || 20));

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT m.subject, m.at, m.body->>'text' AS text,
             COUNT(*)::int AS recipients,
             COUNT(*) FILTER (WHERE m.read_at IS NOT NULL)::int AS read_count,
             -- Tek alıcı varsa kime gittiği de görünsün; toplu duyuruda anlamsız → NULL.
             CASE WHEN COUNT(*) = 1 THEN MIN(p.username) END AS target
        FROM messages m JOIN players p ON p.id = m.player_id
       WHERE m.world_id = ${w} AND m.kind = 'system' AND m.body->>'origin' = 'admin'
       GROUP BY m.subject, m.at, m.body->>'text'
       ORDER BY m.at DESC
       LIMIT ${n}
    `);

    return rows.map((r) => ({
      subject: String(r['subject']),
      at: toDate(r['at']).toISOString(),
      text: String(r['text'] ?? ''),
      recipients: Number(r['recipients']),
      readCount: Number(r['read_count']),
      target: r['target'] == null ? null : String(r['target']),
    }));
  }
}

/** `admin.actions.controller`taki `parse` ile aynı gerekçe: `z.output<S>` (bkz. oradaki not). */
function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data as z.output<S>;
}
