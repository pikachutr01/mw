/**
 * ⭐ TOPLU İŞLEMLER (panel 2. nesil, Tur 2) — *"Tüm hesaplara toplu asker ekleme veya silme,
 * savunma ünitesi ekleme silme, sur büyü kalkan seviyesi, akademi tekniği düzenleme."*
 *
 * ⚠️ **KURU KOŞU VARSAYILAN.** `confirm: true` yoksa hiçbir satır değişmez; uç yalnız
 * "kaç oyuncu, kaç şehir, kaç satır" ve ilk 20 oyuncunun adını döndürür. Bu Faz 8 temizlik
 * deseninin aynısı ve aynı dersin sonucu: geri alınamaz bir işlemi ölçmeden çalıştırmak,
 * kaybı bir tık uzağa koyar.
 *
 * ⚠️ **HEDEF SEÇİMİ İKİ AŞAMALI**: önce filtre (dünya · ittifak · puan aralığı · aktiflik),
 * sonra `exclude` ile listeden tek tek çıkarma. Yalnız filtre olsaydı "herkese ver ama şu üç
 * kişiye verme" istenemezdi; yalnız elle seçim olsaydı 50 kişilik bir dünyada 50 kutu
 * işaretlemek gerekirdi.
 */
import {
  BadRequestException, Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { LEVEL_BASED, TECHS_BY_ID, UNITS_BY_ID } from '@mobiwar/catalog';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.ts';
import { CityService } from '../cities/city.service.ts';
import type { Db } from '../db/client.ts';
import { DB } from '../db/tokens.ts';
import { GameClockService } from '../world/game-clock.service.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from './admin.guard.ts';

/**
 * ⚠️ Güvenlik freni. 500'den fazla oyuncuya tek istekte dokunmak bir yönetim aracının işi
 * değil; bu sayıya ulaşan bir istek büyük ihtimalle yanlış kurulmuş bir filtredir. Aşılırsa
 * uç **çalışmayı reddediyor**, sessizce kırpmıyor: kırpsaydık yönetici hangi yarısının
 * etkilendiğini bilemezdi.
 */
const MAX_PLAYERS = 500;

const target = z.object({
  worldId: z.number().int().min(0).max(32767),
  allianceId: z.number().int().positive().nullable().optional(),
  scoreMin: z.number().int().min(0).optional(),
  scoreMax: z.number().int().min(0).optional(),
  /** Son N gün içinde görülmüş olanlar. Yokluğunda aktiflik filtresi uygulanmaz. */
  activeSinceDays: z.number().int().min(1).max(3650).optional(),
  /** Filtreye giren ama BU işlemden muaf tutulacak oyuncular. */
  exclude: z.array(z.number().int().positive()).max(500).default([]),
  /** Verilirse filtre yok sayılır ve YALNIZ bu oyuncular hedeflenir. */
  only: z.array(z.number().int().positive()).max(500).optional(),
});

const counts = z.record(z.string(), z.number().int().min(-1_000_000).max(10_000_000));

const bodies = {
  units: z.object({
    target, confirm: z.boolean().optional(),
    units: counts,
    where: z.enum(['barracks', 'cave']).default('barracks'),
    /** `set` = adedi yaz · `add` = mevcuda ekle (negatif değer düşer, 0'ın altına inmez). */
    mode: z.enum(['set', 'add']).default('set'),
  }),
  defense: z.object({
    target, confirm: z.boolean().optional(),
    units: counts,
    mode: z.enum(['set', 'add']).default('set'),
  }),
  structure: z.object({
    target, confirm: z.boolean().optional(),
    type: z.string().min(1).max(40),
    level: z.number().int().min(0).max(40),
  }),
  tech: z.object({
    target, confirm: z.boolean().optional(),
    type: z.string().min(1).max(40),
    level: z.number().int().min(0).max(40),
  }),
  resources: z.object({
    target, confirm: z.boolean().optional(),
    gold: z.number().int().min(-1_000_000_000).max(1_000_000_000).default(0),
    food: z.number().int().min(-1_000_000_000).max(1_000_000_000).default(0),
  }),
} as const;

type Op = keyof typeof bodies;

interface Victim { id: number; username: string; cities: number[] }

/** Panelin form üreteceği toplu işlem künyesi — tek kaynak (`ADMIN_ACTIONS` emsali). */
export const BULK_OPS = [
  {
    id: 'units', label: 'Toplu ordu', scope: 'city',
    description: 'Seçilen oyuncuların TÜM şehirlerine yazar. «Yaz» adedi eşitler, «ekle» '
      + 'mevcuda ilave eder (negatif düşer, 0\'ın altına inmez).',
    fields: [
      { key: 'units', label: 'Birimler', type: 'unitPicker', source: 'warriors', required: true },
      {
        key: 'where', label: 'Nereye', type: 'select', options: ['barracks', 'cave'],
        optionLabels: ['Baraka', 'Mağara'], default: 'barracks',
      },
      {
        key: 'mode', label: 'Kip', type: 'select', options: ['set', 'add'],
        optionLabels: ['Yaz (eşitle)', 'Ekle (mevcuda)'], default: 'set',
      },
    ],
  },
  {
    id: 'defense', label: 'Toplu savunma', scope: 'city',
    description: '⛔ Sur ve Büyü Kalkanı burada YOK — onlar adet değil seviye taşır.',
    fields: [
      { key: 'units', label: 'Savunma birimleri', type: 'unitPicker', source: 'defenses', required: true },
      {
        key: 'mode', label: 'Kip', type: 'select', options: ['set', 'add'],
        optionLabels: ['Yaz (eşitle)', 'Ekle (mevcuda)'], default: 'set',
      },
    ],
  },
  {
    id: 'structure', label: 'Toplu Sur / Büyü Kalkanı', scope: 'city',
    description: 'Seviye yazar (0 = kaldır). Sur bütünlüğüne dokunmaz.',
    fields: [
      { key: 'type', label: 'Yapı', type: 'structurePicker', required: true },
      { key: 'level', label: 'Seviye', type: 'number', min: 0, max: 40, required: true },
    ],
  },
  {
    id: 'tech', label: 'Toplu teknik (akademi)', scope: 'player',
    description: '⚠️ Teknik OYUNCUYA ait — şehir başına değil, oyuncu başına tek satır.',
    fields: [
      { key: 'type', label: 'Teknik', type: 'techPicker', required: true },
      { key: 'level', label: 'Seviye', type: 'number', min: 0, max: 40, required: true },
    ],
  },
  {
    id: 'resources', label: 'Toplu kaynak', scope: 'city',
    description: '⚠️ Her şehirde önce çıpa şimdiye çekilir (materialize), sonra eklenir. '
      + 'Negatif değer alır, kasa eksiye düşmez.',
    fields: [
      { key: 'gold', label: 'Altın (±)', type: 'number', default: 0 },
      { key: 'food', label: 'Yemek (±)', type: 'number', default: 0 },
    ],
  },
] as const;

@Controller('api/v1/admin/bulk')
@UseGuards(AuthGuard, AdminGuard, AdminStepUpGuard)
export class AdminBulkController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly cities: CityService,
    private readonly clock: GameClockService,
  ) {}

  @Post(':op')
  @HttpCode(200)
  async run(
    @Param('op') op: string, @Body() body: unknown, @Req() req: AdminRequest,
  ): Promise<Record<string, unknown>> {
    const schema = bodies[op as Op];
    if (!schema) throw new BadRequestException(`Bilinmeyen toplu işlem: ${op}`);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const d = parsed.data;

    const victims = await this.resolve(d.target);
    if (victims.length > MAX_PLAYERS) {
      throw new BadRequestException(
        `Filtre ${victims.length} oyuncu eşleştirdi; tavan ${MAX_PLAYERS}. Filtreyi daralt.`,
      );
    }
    const cityCount = victims.reduce((s, v) => s + v.cities.length, 0);
    const preview = {
      op,
      players: victims.length,
      cities: cityCount,
      /** İlk 20 isim: yöneticinin "doğru kümeyi mi seçtim" sorusuna gözle cevap. */
      sample: victims.slice(0, 20).map((v) => ({ id: v.id, username: v.username, cities: v.cities.length })),
      truncatedSample: victims.length > 20,
    };

    // ⚠️ Doğrulama kuru koşuda da yapılıyor: "çalıştırınca patlayacak" bir önizleme işe yaramaz.
    this.validate(op as Op, d as never);

    if (!d.confirm) return { ...preview, ran: false, changed: 0 };
    if (victims.length === 0) return { ...preview, ran: true, changed: 0 };

    const changed = await this.apply(op as Op, d as never, victims);

    await this.db.execute(sql`
      INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, before, after)
      VALUES (${d.target.worldId}, ${req.player!.playerId}, ${`admin.bulk.${op}`}, 'world',
              ${d.target.worldId},
              ${JSON.stringify({ target: d.target, payload: stripTarget(d) })}::jsonb,
              ${JSON.stringify({ players: victims.length, cities: cityCount, changed })}::jsonb)
    `);
    return { ...preview, ran: true, changed };
  }

  /** Filtreyi oyuncu + şehir listesine çevirir. Kuru koşu da bunu kullanıyor. */
  private async resolve(t: z.output<typeof target>): Promise<Victim[]> {
    const conds: SQL[] = [sql`p.world_id = ${t.worldId}`];
    if (t.only && t.only.length > 0) {
      conds.push(sql`p.id = ANY(${sql.raw(idArray(t.only))})`);
    } else {
      if (t.allianceId != null) conds.push(sql`p.alliance_id = ${t.allianceId}`);
      if (t.scoreMin != null) conds.push(sql`p.score >= ${t.scoreMin}`);
      if (t.scoreMax != null) conds.push(sql`p.score <= ${t.scoreMax}`);
      if (t.activeSinceDays != null) {
        conds.push(sql`p.last_seen_at > now() - (${t.activeSinceDays} * interval '1 day')`);
      }
    }
    if (t.exclude.length > 0) {
      conds.push(sql`NOT (p.id = ANY(${sql.raw(idArray(t.exclude))}))`);
    }

    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT p.id, p.username,
             COALESCE(ARRAY_AGG(c.id ORDER BY c.id) FILTER (WHERE c.id IS NOT NULL), '{}') AS cities
        FROM players p LEFT JOIN cities c ON c.player_id = p.id
       WHERE ${sql.join(conds, sql` AND `)}
       GROUP BY p.id, p.username
       ORDER BY p.id
       LIMIT ${MAX_PLAYERS + 1}
    `);
    return rows.map((r) => ({
      id: Number(r['id']),
      username: String(r['username']),
      cities: (r['cities'] as unknown[]).map(Number),
    }));
  }

  /** Katalog doğrulaması — kuru koşuda da çalışır. */
  private validate(op: Op, d: Record<string, unknown>): void {
    if (op === 'units' || op === 'defense') {
      const wantDefense = op === 'defense';
      for (const id of Object.keys(d['units'] as Record<string, number>)) {
        const def = UNITS_BY_ID[id];
        if (!def) throw new BadRequestException(`Bilinmeyen birim: ${id}`);
        if (wantDefense && def.kind !== 'defense') {
          throw new BadRequestException(`«${def.name.tr}» bir savunma birimi değil.`);
        }
        if (!wantDefense && def.kind !== 'warrior') {
          throw new BadRequestException(`«${def.name.tr}» barakada üretilmez.`);
        }
        if (LEVEL_BASED.has(id)) {
          throw new BadRequestException(
            `«${def.name.tr}» adet değil SEVİYE taşır — «Toplu Sur / Büyü Kalkanı» işlemini kullan.`,
          );
        }
      }
    }
    if (op === 'structure' && !LEVEL_BASED.has(String(d['type']))) {
      throw new BadRequestException(`«${String(d['type'])}» seviye taşıyan bir yapı değil.`);
    }
    if (op === 'tech' && !TECHS_BY_ID[String(d['type'])]) {
      throw new BadRequestException(`Bilinmeyen teknik: ${String(d['type'])}`);
    }
  }

  /** Etkilenen satır sayısını döndürür. */
  private async apply(op: Op, d: Record<string, unknown>, victims: Victim[]): Promise<number> {
    const cityIds = victims.flatMap((v) => v.cities);
    let changed = 0;

    if (op === 'resources') {
      /**
       * ⚠️ Şehir şehir **materialize → ekle**. Toplu bir `UPDATE cities SET gold = gold + n`
       * yazmak çok daha hızlı olurdu ve **sessizce yanlış** olurdu: çıpa geçmişte kaldığı için
       * eklenen miktarın üstüne birikim de gelir. Hız değil doğruluk seçiliyor.
       */
      const at = await this.clock.gameNow(Number((d['target'] as { worldId: number }).worldId));
      for (const id of cityIds) {
        await this.cities.materialize(id, at);
        const [row] = await this.db.execute<Record<string, unknown>>(sql`
          SELECT gold, food FROM cities WHERE id = ${id}
        `);
        const have = { gold: Number(row!['gold']), food: Number(row!['food']) };
        await this.cities.add(id, {
          gold: Math.max(Number(d['gold']), -have.gold),
          food: Math.max(Number(d['food']), -have.food),
        }, at);
        changed++;
      }
      return changed;
    }

    if (op === 'tech') {
      const level = Number(d['level']);
      const type = String(d['type']);
      await this.db.transaction(async (tx) => {
        for (const v of victims) {
          if (level === 0) {
            await tx.execute(sql`
              DELETE FROM techs WHERE player_id = ${v.id} AND type = ${type}
            `);
          } else {
            await tx.execute(sql`
              INSERT INTO techs (player_id, type, level) VALUES (${v.id}, ${type}, ${level})
              ON CONFLICT (player_id, type) DO UPDATE SET level = ${level}
            `);
          }
          changed++;
        }
      });
      return changed;
    }

    if (op === 'structure') {
      const level = Number(d['level']);
      const type = String(d['type']);
      await this.db.transaction(async (tx) => {
        for (const id of cityIds) {
          if (level === 0) {
            await tx.execute(sql`DELETE FROM defenses WHERE city_id = ${id} AND type = ${type}`);
          } else {
            await tx.execute(sql`
              INSERT INTO defenses (city_id, type, count) VALUES (${id}, ${type}, ${level})
              ON CONFLICT (city_id, type) DO UPDATE SET count = ${level}
            `);
          }
          changed++;
        }
      });
      return changed;
    }

    // units | defense
    const table = op === 'defense'
      ? 'defenses'
      : (d['where'] === 'cave' ? 'cave_units' : 'units');
    const add = d['mode'] === 'add';
    const units = d['units'] as Record<string, number>;

    await this.db.transaction(async (tx) => {
      for (const id of cityIds) {
        for (const [type, n] of Object.entries(units)) {
          if (!add && n <= 0) {
            await tx.execute(sql`
              DELETE FROM ${sql.raw(table)} WHERE city_id = ${id} AND type = ${type}
            `);
            changed++;
            continue;
          }
          /**
           * ⚠️ `add` kipinde `GREATEST(0, …)`: negatif bir ekleme mevcudun altına inmemeli.
           * Çıkan 0 ise satır **silinmiyor**, 0 olarak kalıyor — okuma tarafı zaten 0'ları
           * eliyor ve silmek "eskiden vardı" bilgisini de yok ederdi.
           */
          await tx.execute(sql`
            INSERT INTO ${sql.raw(table)} (city_id, type, count)
            VALUES (${id}, ${type}, ${Math.max(0, n)})
            ON CONFLICT (city_id, type) DO UPDATE
              SET count = ${add
    ? sql`GREATEST(0, ${sql.raw(`"${table}"`)}.count + ${n})`
    : sql`${Math.max(0, n)}`}
          `);
          changed++;
        }
      }
    });
    return changed;
  }
}

/** ⚠️ Tam sayı süzgeci — `sql.raw`a giden tek şey doğrulanmış kimlikler. */
function idArray(ids: number[]): string {
  const safe = ids.filter((n) => Number.isInteger(n) && n > 0);
  return `ARRAY[${safe.join(',') || 'NULL'}]::bigint[]`;
}

function stripTarget(d: Record<string, unknown>): Record<string, unknown> {
  const { target: _t, confirm: _c, ...rest } = d;
  return rest;
}
