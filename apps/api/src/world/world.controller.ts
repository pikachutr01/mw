/**
 * ⭐ DÜNYA EKRANI (§13.16) — **harita değil, DİYAR LİSTESİ**.
 *
 * Bir diyarda tam 10 şehir yuvası vardır; ekran o 10 satırı gösterir, boş yuva `-` ile geçer.
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

  /** Bir diyarın 10 yuvası. Dolu yuvada oyuncu adı + skor + koruma durumu görünür. */
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
     * ⚠️ Sıra **canlı hesaplanmaz** (§13.16): oyunun kendisi günde 3 kez sabitliyor. Sıralama
     * anlık tablosu (önceki sırayı da saklayan) Komuta Merkezi turunda gelecek; şimdilik puana
     * göre `RANK()` veriliyor — gerçek bir sayı, uydurma değil, yalnız donmuş sürümü eksik.
     * ⚠️ `alliance` şeması henüz YOK → daima `null`. Sütun yerini şimdiden tutuyor.
     */
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH ranked AS (
        SELECT id, RANK() OVER (ORDER BY score DESC, id) AS rank
          FROM players WHERE world_id = ${player.worldId}
      )
      SELECT c.id, c.name, c.s, c.is_capital,
             p.id AS player_id, p.username, p.score, p.protected_until, p.vacation_until,
             r.rank
        FROM cities c
        JOIN players p ON p.id = c.player_id
        JOIN ranked r ON r.id = p.id
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
          rank: Number(r['rank']),
          alliance: null as string | null,
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
