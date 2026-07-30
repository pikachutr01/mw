/**
 * ⭐ DÜNYA EKRANI (§13.16) — **harita değil, DİYAR LİSTESİ**.
 *
 * Bir diyarda tam 10 şehir yeri vardır; ekran o 10 satırı gösterir, boş şehir `-` ile geçer.
 *
 * ⚠️ **GİZLİLİK (§13.16.5):** bu uç asker ve kaynak **GÖSTERMEZ** — onları öğrenmenin tek yolu
 * casusluktur. Dönen tek "hassas" bilgi koruma durumudur (saldırı düğmesini kapatmak için gerekir)
 * ve **süresi değil yalnız sebebi** verilir.
 */
import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard.ts';
import { toDate, type Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { GameClockService } from './game-clock.service.ts';

/** §13.16.1 — oyunun kendi dokümanından, BİREBİR. Koordinatlar 1-indekslidir. */
export const WORLD_SHAPE = {
  continents: 10,
  districtsPerContinent: 500,
  citiesPerDistrict: 10,
  oneIndexed: true,
} as const;

@Controller('api/v1/world')
@UseGuards(AuthGuard)
export class WorldController {
  constructor(
    private readonly clock: GameClockService,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Get('shape')
  shape(): Record<string, unknown> {
    return WORLD_SHAPE;
  }

  /** Bir diyarın 10 şehir yeri. Dolu şehirde oyuncu adı + skor + koruma durumu görünür. */
  @Get(':k/:d')
  async district(
    @Param('k') k: string, @Param('d') d: string, @Req() req: AuthedRequest,
  ): Promise<Record<string, unknown>> {
    const player = req.player!;
    const kk = clamp(Number(k), 1, WORLD_SHAPE.continents);
    const dd = clamp(Number(d), 1, WORLD_SHAPE.districtsPerContinent);
    const gameNow = await this.clock.gameNow(player.worldId);

    /**
     * ⭐ `rank` = oyuncunun dünya sırası. Doküman (DÜNYA): *"oyuncuların oyuncu adını, şehrinin
     * adını, ittifak adını ve kaçıncı sırada olduğunu görebilirsiniz"*.
     *
     * ⚠️ Sıra **CANLI HESAPLANMAZ** (§13.16): `rankings` anlık görüntüsünden okunur — günde 3 kez
     * donan sıra. Bir zamanlar burada `RANK() OVER (…)` vardı; doğru sayıyı veriyordu ama YANLIŞ
     * sayıydı: Dünya ekranındaki sıra ile Sıralamalar ekranındaki sıra birbirini tutmuyordu.
     * Anlık görüntü henüz alınmamışsa (yeni dünyanın ilk dakikaları) `null` döner ve ekran `-`
     * yazar — tahmini bir sıra uydurmaktan iyidir.
     * `alliance` = oyuncunun ittifak adı (LEFT JOIN — ittifaksızsa null).
     */
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT c.id, c.name, c.s, c.is_capital,
             p.id AS player_id, p.username, p.score, p.protected_until, p.vacation_until,
             r.rank, a.name AS alliance_name, p.alliance_id
        FROM cities c
        JOIN players p ON p.id = c.player_id
        LEFT JOIN rankings r
          ON r.world_id = p.world_id AND r.kind = 'player' AND r.subject_id = p.id
        LEFT JOIN alliances a ON a.id = p.alliance_id
       WHERE c.world_id = ${player.worldId} AND c.k = ${kk} AND c.d = ${dd}
       ORDER BY c.s
    `);

    const bySlot = new Map<number, Record<string, unknown>>();
    for (const r of rows) bySlot.set(Number(r['s']), r);

    const slots = [];
    for (let s = 1; s <= WORLD_SHAPE.citiesPerDistrict; s++) {
      const r = bySlot.get(s);
      if (!r) {
        slots.push({ s, city: null });
        continue;
      }
      const protectedUntil = r['protected_until'] == null ? null : toDate(r['protected_until']);
      const vacationUntil = r['vacation_until'] == null ? null : toDate(r['vacation_until']);
      slots.push({
        s,
        city: {
          id: Number(r['id']),
          name: String(r['name']),
          playerId: Number(r['player_id']),
          username: String(r['username']),
          score: Number(r['score']),
          isCapital: Boolean(r['is_capital']),
          isOwn: Number(r['player_id']) === player.playerId,
          rank: r['rank'] == null ? null : Number(r['rank']),
          alliance: r['alliance_name'] == null ? null : String(r['alliance_name']),
          /** Davet butonu için: hedef zaten bir ittifakta mı? (adı olmasa bile kimliği yeter) */
          hasAlliance: r['alliance_id'] != null,
          // Yalnız SEBEP; bitiş zamanı verilmez (saldırıyı saniyesine planlamayı kolaylaştırırdı).
          protection: protectedUntil && protectedUntil > gameNow ? 'beginner'
            : vacationUntil && vacationUntil > gameNow ? 'vacation'
              : null,
        },
      });
    }

    return {
      coordinates: { k: kk, d: dd },
      shape: WORLD_SHAPE,
      slots,
      gameNow: gameNow.toISOString(),
      serverNow: new Date().toISOString(),
    };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? Math.trunc(n) : min));
}
