/**
 * ⭐⭐ SIRALAMA ZİNCİRİNİN HAYATTA KALMASI — canlıda ölen zincirin regresyon testi.
 *
 * ⚠️ **CANLIDA YAŞANDI (2026-08-05).** Vadesi 16:00 olan `ranking_snapshot` görevi 09:42'de
 * işlendi. İleri-vade emniyeti anlık görüntüyü doğru şekilde atladı, ama zinciri `ctx.at`
 * yerine `gameNow` ile sürdürdüğü için `nextSnapshotAt(gameNow)` **atlanan görevin kendi
 * yuvasını** döndürdü, tekillik anahtarı çakıştı, `ON CONFLICT DO NOTHING` yeni satırı yuttu
 * ve **zincir öldü**. Sıralama 15 saat dondu; o dönemin üç yuvası kalıcı olarak kayboldu ve
 * 05:00'dan sonra oyuna katılan 14 oyuncu listeye hiç giremedi.
 *
 * Bu dosya iki ayrı emniyeti kilitliyor:
 *   1. Atlama dalı zinciri ASLA koparmamalı (aynı yuva yeniden kuyruğa girer).
 *   2. Zincir yine de koparsa bekçi onu kendi kendine kurmalı.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/db/client.ts';
import type { HandlerContext, MissionHandler, Tx } from '../src/missions/handler-registry.ts';
import type { MissionRow } from '../src/missions/mission.repository.ts';
import {
  createRankingSnapshotHandler, createRankingWatchdog,
} from '../src/ranking/ranking.handler.ts';
import {
  MAX_SNAPSHOT_RETRY, nextSnapshotAt, takeSnapshot,
} from '../src/ranking/ranking.service.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let worldId: number;
const handler: MissionHandler = createRankingSnapshotHandler();

interface SnapshotMission {
  id: number; status: string; executeAt: string; key: string; payload: Record<string, unknown>;
}

const snapshots = async (): Promise<SnapshotMission[]> => {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT id, status, execute_at, idempotency_key, payload FROM missions
     WHERE world_id = ${worldId} AND type = 'ranking_snapshot' ORDER BY id
  `);
  return rows.map((r) => ({
    id: Number(r['id']),
    status: String(r['status']),
    executeAt: new Date(String(r['execute_at'])).toISOString(),
    key: String(r['idempotency_key']),
    payload: (r['payload'] ?? {}) as Record<string, unknown>,
  }));
};

const runCount = async (): Promise<number> => {
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    SELECT COUNT(*)::int AS n FROM ranking_runs WHERE world_id = ${worldId}
  `);
  return Number(row!['n']);
};

/**
 * ⭐⭐ CANLIDAKİ DURUMU BİREBİR KURAR ve bu kurulum testin ASIL DEĞERİ.
 *
 * ⚠️ İlk yazımda vade olarak "şimdi + 8 saat" gibi keyfi bir an kullanmıştım ve test
 * **hatayı yakalamıyordu**: keyfi bir an gerçek bir yuvaya (00/08/16 TSİ) denk gelmediği için
 * `nextSnapshotAt(gameNow)` başka bir yuva döndürüyor, anahtar çakışması hiç oluşmuyordu.
 * Kontrol deneyi (eski kodu geri koyup koşmak) bunu ortaya çıkardı — test yeşil/kırmızı doğru
 * yanıyordu ama **yanlış sebeple**.
 *
 * Doğru kurulum üç şart istiyor:
 *   1. Vade GERÇEK bir yuva olmalı (yoksa çakışma üretilemez).
 *   2. Oyun saati o vadeden **1 saatten fazla** geride olmalı (yoksa emniyet devreye girmez).
 *   3. `nextSnapshotAt(oyunSaati)` tam da o vadeyi vermeli (çakışmanın mekanizması bu).
 * Üçünü birden tutturmak için dünyanın saati `clock_offset_ms` ile geriye alınıyor:
 * oyun saati bir önceki yuvanın hemen sonrasına kurulunca sıradaki yuva 8 saat ileride kalır.
 */
async function armCollisionScenario(): Promise<Date> {
  const due = nextSnapshotAt(nextSnapshotAt(new Date()));       // iki yuva ileri: gerçek yuva
  const prevSlot = new Date(due.getTime() - 8 * 3_600_000);     // bir önceki yuva
  const desiredGameNow = new Date(prevSlot.getTime() + 60_000); // yuvadan 1 dk sonrası
  const offset = Date.now() - desiredGameNow.getTime();
  await h.db.execute(sql`
    UPDATE worlds SET clock_offset_ms = ${offset} WHERE id = ${worldId}
  `);
  return due;
}

/** Görev satırı yazar; `execute_at` ve `payload` senaryoya göre veriliyor. */
async function writeSnapshotMission(at: Date, payload: Record<string, unknown> = {}): Promise<number> {
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO missions (world_id, type, status, execute_at, payload, idempotency_key)
    VALUES (${worldId}, 'ranking_snapshot', 'scheduled', ${at.toISOString()}::timestamptz,
            ${JSON.stringify(payload)}::jsonb, ${`ranking:${at.toISOString()}`})
    RETURNING id
  `);
  return Number(row!['id']);
}

/**
 * Handler'ı DOĞRUDAN çağırır.
 *
 * ⚠️ Scheduler üzerinden gidilemez: `claimDue` vadeyi SQL'de kıyaslıyor
 * (`mission.repository.ts` · `GAME_NOW_SQL`), yani "gelecekteki bir görevi şimdi çalıştır"
 * senaryosu kuyruktan ÜRETİLEMEZ — canlıda nasıl olduğu hâlâ açık bir soru. Ölçmek istediğimiz
 * şey zaten kuyruk değil, **handler'ın o durumdaki davranışı**.
 */
async function runHandler(missionId: number, at: Date, payload: Record<string, unknown> = {}): Promise<void> {
  const mission = { id: missionId, worldId, type: 'ranking_snapshot', payload } as unknown as MissionRow;
  const ctx = {
    tx: h.db as unknown as Tx,
    mission,
    at,
    worldId,
    emit: async () => {},
    audit: async () => {},
    lockCity: async () => {},
  } as unknown as HandlerContext;
  await handler(ctx);
}

beforeAll(async () => { h = await setupTestDb(); }, 60_000);
afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await h.db.execute(sql`DELETE FROM ranking_runs WHERE world_id = ${worldId}`);
  await createPlayer(h, worldId, `r${randomUUID().slice(0, 6)}`);
});

describe('ileri vade emniyeti zinciri koparmaz', () => {
  /**
   * ⭐ **CANLIDAKİ HATANIN TA KENDİSİ.** Düzeltmeden önce bu test KIRMIZI yanar: atlama dalı
   * `gameNow` ile zinciri sürdürdüğü için ürettiği anahtar atlanan görevin anahtarıyla
   * çakışır ve hiç yeni satır yazılmaz.
   */
  it('vadesi gelecekte olan görev atlanır ama AYNI YUVA yeniden kuyruğa girer', async () => {
    const due = await armCollisionScenario();
    const id = await writeSnapshotMission(due);

    await runHandler(id, due);

    // 1) Anlık görüntü ALINMADI — erken çalışmak her zaman hatadır.
    expect(await runCount()).toBe(0);

    // 2) ⭐ Zincir YAŞIYOR: bekleyen bir görev var.
    const pending = (await snapshots()).filter((m) => m.status === 'scheduled' && m.id !== id);
    expect(pending).toHaveLength(1);

    // 3) ⭐ Vade DEĞİŞMEDİ — 16:00'ın görüntüsü yine 16:00 damgasıyla alınacak.
    expect(pending[0]!.executeAt).toBe(due.toISOString());

    // 4) Anahtar çakışmasın diye deneme eki almış.
    expect(pending[0]!.key).toBe(`ranking:${due.toISOString()}#retry1`);
    expect(pending[0]!.payload['attempt']).toBe(1);
  });

  /**
   * ⚠️ Sonsuz döngü kapısı: aynı görev üst üste erken tetiklenirse yuva sonsuza dek yeniden
   * denenmemeli. Hak bitince zincir İLERLER — ama `ctx.at`ten sonrasına, `gameNow`dan değil.
   * `gameNow` kullanılsaydı yine aynı anahtar üretilir ve zincir yine ölürdü.
   */
  it('deneme hakkı bitince yuva bırakılır ve zincir İLERİ taşınır', async () => {
    const due = await armCollisionScenario();
    const id = await writeSnapshotMission(due, { attempt: MAX_SNAPSHOT_RETRY });

    await runHandler(id, due, { attempt: MAX_SNAPSHOT_RETRY });

    const pending = (await snapshots()).filter((m) => m.status === 'scheduled' && m.id !== id);
    expect(pending).toHaveLength(1);
    // Vade artık İLERİDE — atlanan yuvanın kendisi değil.
    expect(new Date(pending[0]!.executeAt).getTime()).toBeGreaterThan(due.getTime());
    expect(pending[0]!.executeAt).toBe(nextSnapshotAt(due).toISOString());
  });

  /** Normal yol bozulmadı: vadesi geçmiş görev görüntüyü alır ve bir sonrakini yazar. */
  it('vadesi geçmiş görev normal çalışır ve zinciri sürdürür', async () => {
    const due = new Date(Date.now() - 60_000);
    const id = await writeSnapshotMission(due);

    await runHandler(id, due);

    expect(await runCount()).toBe(1);
    const pending = (await snapshots()).filter((m) => m.status === 'scheduled' && m.id !== id);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.executeAt).toBe(nextSnapshotAt(due).toISOString());
  });
});

describe('zincir bekçisi', () => {
  /**
   * ⭐ İkinci emniyet. Zincir hangi sebeple kopmuş olursa olsun (bilinmeyen bir yol da dahil)
   * bekçi onu kurar. Canlıda bu olmadığı için kopma **15 saat** sürdü ve ancak elle fark edildi.
   */
  it('bekleyen görev yoksa zinciri yeniden kurar', async () => {
    // Zincirin ölmüş hâlini kur: bir görüntü alınmış, ama bekleyen görev yok.
    await takeSnapshot(h.db, worldId, new Date(Date.now() - 3_600_000));
    expect((await snapshots()).filter((m) => m.status === 'scheduled')).toHaveLength(0);

    await createRankingWatchdog(h.db, 0)(worldId);

    expect((await snapshots()).filter((m) => m.status === 'scheduled')).toHaveLength(1);
  });

  /** ⚠️ Zincir sağlamken bekçi hiçbir şey yazmamalı — kopya görev üretmek de bir arızadır. */
  it('bekleyen görev varken kopya yazmaz', async () => {
    await writeSnapshotMission(new Date(Date.now() + 3_600_000));

    await createRankingWatchdog(h.db, 0)(worldId);

    expect((await snapshots()).filter((m) => m.status === 'scheduled')).toHaveLength(1);
  });

  /** Seyreltme: scheduler saniyede bir koşuyor, bekçi her turda DB'ye gitmemeli. */
  it('aralık dolmadan ikinci kez sorgu yapmaz', async () => {
    await takeSnapshot(h.db, worldId, new Date(Date.now() - 3_600_000));
    const watchdog = createRankingWatchdog(h.db, 900_000);

    await watchdog(worldId);                       // ilk çağrı zinciri kurar
    await h.db.execute(sql`DELETE FROM missions WHERE world_id = ${worldId}`);
    await watchdog(worldId);                       // aralık dolmadı → hiçbir şey yapmamalı

    expect(await snapshots()).toHaveLength(0);
  });
});

/**
 * ⭐ Hatanın kök cümlesi: `nextSnapshotAt` verilen andan **kesinlikle sonrasını** döndürür.
 * Bu tuttuğu sürece `scheduleSnapshot`a görevin KENDİ vadesini vermek güvenlidir; `gameNow`
 * (vadeden küçük bir an) vermek ise aynı yuvayı geri getirir — canlıdaki kopmanın mekanizması.
 */
describe('yuva hesabı', () => {
  it('nextSnapshotAt verilen andan kesinlikle sonrasını verir', () => {
    for (const iso of [
      '2026-08-05T13:00:00.000Z', '2026-08-05T06:42:59.931Z', '2026-08-05T20:59:59.999Z',
    ]) {
      const from = new Date(iso);
      expect(nextSnapshotAt(from).getTime()).toBeGreaterThan(from.getTime());
    }
  });

  /** ⚠️ Kopmanın birebir kanıtı: vadeden ÖNCEKİ bir an aynı yuvayı geri getiriyor. */
  it('vadeden önceki bir an AYNI yuvayı üretir (kopmanın sebebi)', () => {
    const due = new Date('2026-08-05T13:00:00.000Z');
    const early = new Date('2026-08-05T06:42:59.931Z');
    expect(nextSnapshotAt(early).toISOString()).toBe(due.toISOString());
  });
});
