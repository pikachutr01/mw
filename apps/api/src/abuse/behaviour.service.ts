/**
 * ⭐ ÇOKLU HESAP — DAVRANIŞ SİNYALLERİ (§9.1.2 B1·B2·B6·B7)
 *
 * ─ NEDEN ASIL GÜÇLÜ OLANLAR BUNLAR ────────────────────────────────────────────────────────
 * Teknik izler (cihaz, IP) **taklit edilebilir**: farklı tarayıcı profili, VPN, ayrı telefon.
 * Bilen biri onların hepsinden kaçar. Davranıştan kaçamaz — çünkü davranış, çoklu hesabın
 * **amacının kendisi**. Kimse kaynak aktarmak için açmadığı bir hesabı beslemez.
 *
 * ─ ÇİFTLER n² DEĞİL, ETKİLEŞİMDEN TÜRÜYOR ─────────────────────────────────────────────────
 * ⚠️ "Her oyuncu çiftini tara" 1.000 oyunculu bir dünyada 499.500 çift demekti. Bunun yerine
 * çiftler **gerçekten birbirine bir şey yapmış** olanlardan türetiliyor: nakliye gönderenler,
 * savaşanlar. Hiç etkileşmemiş iki hesap zaten §9.1'in tarif ettiği tehdit değil.
 *
 * ─ DEĞİŞMEZ (§9.1.1) ──────────────────────────────────────────────────────────────────────
 * Buradan çıkan hiçbir sayı ceza vermez. Her sinyal masum açıklamasıyla birlikte taşınıyor;
 * karar insanın.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';
import { liveNumber } from '../settings/live.ts';

export type BehaviourKind =
  | 'oneWayResourceFlow' | 'attackFarm' | 'defenseInconsistency' | 'silentPartners';

export interface BehaviourConfig {
  weights: Record<BehaviourKind, number>;
  /** Tek yönlü akışın anlamlı sayılması için gereken en az kaynak. */
  flowMinResources: number;
  /** Ters yön, ileri yönün bu oranından azsa "tek yönlü" sayılır. */
  flowMaxReturnRatio: number;
  /** Çiftlik şüphesi için gereken en az savaş sayısı. */
  farmMinBattles: number;
  /** Aynı tarafın kazanma oranı bunu geçerse "hep aynı kişi kazanıyor". */
  farmMinWinRate: number;
}

export function behaviourConfig(): BehaviourConfig {
  return {
    weights: {
      oneWayResourceFlow: liveNumber('abuse', 'weightOneWayFlow', 25),
      attackFarm: liveNumber('abuse', 'weightAttackFarm', 30),
      defenseInconsistency: liveNumber('abuse', 'weightDefenseInconsistency', 20),
      silentPartners: liveNumber('abuse', 'weightSilentPartners', 10),
    },
    flowMinResources: liveNumber('abuse', 'flowMinResources', 50_000),
    flowMaxReturnRatio: liveNumber('abuse', 'flowMaxReturnRatio', 0.1),
    farmMinBattles: liveNumber('abuse', 'farmMinBattles', 5),
    farmMinWinRate: liveNumber('abuse', 'farmMinWinRate', 0.9),
  };
}

export const BEHAVIOUR_LABEL: Record<BehaviourKind, string> = {
  oneWayResourceFlow: 'Tek yönlü kaynak akışı',
  attackFarm: 'Kârsız saldırı çiftliği',
  defenseInconsistency: 'Savunma tutarsızlığı',
  silentPartners: 'Sessiz ortaklar',
};

/** §9.1.4'ün şartı — her sinyalin yanında masum açıklaması. */
export const BEHAVIOUR_INNOCENT: Record<BehaviourKind, string> = {
  oneWayResourceFlow: 'Güçlü bir oyuncu, ittifakındaki acemiye destek oluyor olabilir — '
    + 'oyunun teşvik ettiği bir davranış. Karşılığın kaynak olarak dönmesi de gerekmez: '
    + 'acemi, sefere asker göndererek ya da savunmaya katılarak ödüyor olabilir.',
  attackFarm: 'Komşuluk. Yakın iki oyuncudan güçlü olan, zayıf olanı düzenli yağmalıyor '
    + 'olabilir; bu oyunun normal işleyişi. Ayrıca savunan taraf inatçı olabilir — '
    + 'kaybetmeye devam etmek tek başına anlaşmalı olmak demek değildir.',
  defenseInconsistency: 'Oyuncu o sırada çevrimdışı olabilir, ordusu seferde olabilir ya da '
    + 'kaynağını savunmaya değil ilerlemeye yatırıyor olabilir. Karşılaştırma yalnız aynı '
    + 'oyuncunun BAŞKA saldırganlara karşı davranışına bakıyor — yine de kesin kanıt değil.',
  silentPartners: 'Oyun dışı iletişim çok yaygın: WhatsApp, Discord, aynı evde konuşmak. '
    + 'Sohbet kaydının boş olması yalnız "oyun içinde yazışmamışlar" demektir. '
    + '⚠️ Mesaj İÇERİĞİ okunmuyor, yalnız var/yok bakılıyor (§9.1.5).',
};

export interface BehaviourSignal {
  a: number;
  b: number;
  kind: BehaviourKind;
  score: number;
  evidence: Record<string, unknown>;
}

type Runner = Db | Tx;

export class BehaviourService {
  constructor(private readonly db: Runner) {}

  /** Pencere içindeki tüm davranış sinyalleri. Çiftler daima küçük id önce. */
  async scan(worldId: number, from: Date, to: Date): Promise<BehaviourSignal[]> {
    const cfg = behaviourConfig();
    return [
      ...await this.oneWayFlow(worldId, from, to, cfg),
      ...await this.attackFarm(worldId, from, to, cfg),
      ...await this.defenseInconsistency(worldId, from, to, cfg),
      ...await this.silentPartners(worldId, from, to, cfg),
    ];
  }

  /**
   * **B1 — TEK YÖNLÜ KAYNAK AKIŞI.** A→B nakliye var, B→A yok.
   *
   * ⚠️ Ölçüt mutlak miktar DEĞİL, **oran + taban**. Yalnız orana baksaydık 100 altınlık tek
   * bir hediye "tek yönlü akış" sayılırdı; yalnız mutlak miktara baksaydık iki yönlü canlı bir
   * ticaret de eşiği geçerdi. İkisi birden şart.
   *
   * ⚠️ Yalnız **tamamlanmış** nakliyeler (`status = 'done'`): yoldaki ya da iptal edilmiş bir
   * sefer kaynak taşımadı, saymak yanlış olurdu.
   */
  private async oneWayFlow(
    worldId: number, from: Date, to: Date, cfg: BehaviourConfig,
  ): Promise<BehaviourSignal[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH flows AS (
        SELECT m.owner_player_id AS from_p, c.player_id AS to_p,
               COALESCE((m.payload->'cargo'->>'gold')::numeric, 0)
             + COALESCE((m.payload->'cargo'->>'food')::numeric, 0) AS amount
          FROM missions m
          JOIN cities c ON c.id = m.target_city_id
         WHERE m.world_id = ${worldId}
           AND m.type = 'transport' AND m.status = 'done'
           AND m.execute_at >= ${from.toISOString()}::timestamptz
           AND m.execute_at <  ${to.toISOString()}::timestamptz
           AND m.owner_player_id IS NOT NULL AND c.player_id IS NOT NULL
           AND m.owner_player_id <> c.player_id
      )
      SELECT LEAST(from_p, to_p) AS a, GREATEST(from_p, to_p) AS b,
             SUM(CASE WHEN from_p < to_p THEN amount ELSE 0 END) AS ab,
             SUM(CASE WHEN from_p > to_p THEN amount ELSE 0 END) AS ba,
             COUNT(*)::int AS trips
        FROM flows
       GROUP BY 1, 2
    `);
    const out: BehaviourSignal[] = [];
    for (const r of rows) {
      const ab = Number(r['ab']);
      const ba = Number(r['ba']);
      const forward = Math.max(ab, ba);
      const back = Math.min(ab, ba);
      if (forward < cfg.flowMinResources) continue;
      if (back > forward * cfg.flowMaxReturnRatio) continue;
      const a = Number(r['a']);
      const b = Number(r['b']);
      out.push({
        a, b, kind: 'oneWayResourceFlow', score: cfg.weights.oneWayResourceFlow,
        evidence: {
          yön: ab >= ba ? `${a} → ${b}` : `${b} → ${a}`,
          gidenKaynak: Math.round(forward),
          dönenKaynak: Math.round(back),
          seferSayısı: Number(r['trips']),
        },
      });
    }
    return out;
  }

  /**
   * **B2 — KÂRSIZ SALDIRI ÇİFTLİĞİ.** Aynı çift defalarca savaşıyor ve hep aynı taraf kazanıyor.
   *
   * ⚠️ Tek bir savaş hiçbir şey söylemez; sinyal **tekrar** üzerine kurulu (`farmMinBattles`).
   * ⚠️ Kazanma oranı eşiği 1,0 değil: gerçek bir çiftlikte de arada bir ters sonuç çıkabilir
   * ve tam kusursuzluk şartı, sinyali kaçırmanın en kolay yolu olurdu.
   */
  private async attackFarm(
    worldId: number, from: Date, to: Date, cfg: BehaviourConfig,
  ): Promise<BehaviourSignal[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH b AS (
        SELECT LEAST(attacker_player_id, defender_player_id) AS a,
               GREATEST(attacker_player_id, defender_player_id) AS b,
               CASE WHEN winner = 'attacker' THEN attacker_player_id
                    WHEN winner = 'defender' THEN defender_player_id END AS won_by
          FROM battles
         WHERE world_id = ${worldId}
           AND at >= ${from.toISOString()}::timestamptz
           AND at <  ${to.toISOString()}::timestamptz
           AND attacker_player_id IS NOT NULL AND defender_player_id IS NOT NULL
           AND attacker_player_id <> defender_player_id
      )
      SELECT a, b, COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE won_by = a)::int AS wins_a,
             COUNT(*) FILTER (WHERE won_by = b)::int AS wins_b
        FROM b
       GROUP BY a, b
      HAVING COUNT(*) >= ${cfg.farmMinBattles}
    `);
    const out: BehaviourSignal[] = [];
    for (const r of rows) {
      const n = Number(r['n']);
      const wa = Number(r['wins_a']);
      const wb = Number(r['wins_b']);
      const top = Math.max(wa, wb);
      if (top / n < cfg.farmMinWinRate) continue;
      const a = Number(r['a']);
      const b = Number(r['b']);
      out.push({
        a, b, kind: 'attackFarm', score: cfg.weights.attackFarm,
        evidence: {
          savaşSayısı: n,
          hepKazanan: wa >= wb ? a : b,
          kazanmaOranı: Math.round((top / n) * 100) / 100,
        },
      });
    }
    return out;
  }

  /**
   * **B6 — SAVUNMA TUTARSIZLIĞI.** Savunan, BU saldırgana karşı neredeyse hiç birim tutmuyor
   * ama BAŞKA saldırganlara karşı gerçekten savunuyor.
   *
   * ⚠️ **Karşılaştırma kilit nokta.** "Savunmasız savunan" tek başına ölçülseydi acemi ve zayıf
   * her oyuncu bu sinyale takılırdı — oyunun en savunmasız kesimi, en masum kesimi. Oyuncuyu
   * KENDİSİYLE kıyaslamak bu yanlış pozitifi kökten kapatıyor: birine karşı savunup diğerine
   * karşı savunmamak bir TERCİHTİR, kaynak yokluğu değil.
   *
   * ⚠️ Birim sayısı savaş anındaki girdiden okunuyor (`battles.input`), bugünkü şehir
   * durumundan değil: bugün dolu olan bir şehir o gün boş olabilir ve tersi.
   */
  private async defenseInconsistency(
    worldId: number, from: Date, to: Date, cfg: BehaviourConfig,
  ): Promise<BehaviourSignal[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH d AS (
        SELECT b.defender_player_id AS def, b.attacker_player_id AS atk,
               (SELECT COALESCE(SUM(v::numeric), 0)
                  FROM jsonb_each_text(b.input->'defender'->'counts') AS e(k, v)) AS units
          FROM battles b
         WHERE b.world_id = ${worldId}
           AND b.at >= ${from.toISOString()}::timestamptz
           AND b.at <  ${to.toISOString()}::timestamptz
           AND b.defender_player_id IS NOT NULL AND b.attacker_player_id IS NOT NULL
           AND b.defender_player_id <> b.attacker_player_id
      ),
      pair AS (
        SELECT def, atk, COUNT(*)::int AS n, AVG(units) AS avg_units FROM d GROUP BY def, atk
      ),
      other AS (
        -- Aynı savunanın DİĞER saldırganlara karşı ortalaması (kendisiyle kıyas).
        SELECT p.def, p.atk,
               (SELECT AVG(x.units) FROM d x WHERE x.def = p.def AND x.atk <> p.atk) AS avg_other,
               (SELECT COUNT(*) FROM d x WHERE x.def = p.def AND x.atk <> p.atk)::int AS n_other
          FROM pair p
      )
      SELECT p.def, p.atk, p.n, p.avg_units, o.avg_other, o.n_other
        FROM pair p JOIN other o ON o.def = p.def AND o.atk = p.atk
       WHERE p.n >= 2 AND o.n_other >= 2
    `);
    const out: BehaviourSignal[] = [];
    for (const r of rows) {
      const mine = Number(r['avg_units']);
      const other = Number(r['avg_other'] ?? 0);
      // Bu saldırgana karşı savunma, başkalarına karşı savunmanın onda birinden azsa.
      if (other <= 0 || mine > other * 0.1) continue;
      const def = Number(r['def']);
      const atk = Number(r['atk']);
      out.push({
        a: Math.min(def, atk), b: Math.max(def, atk),
        kind: 'defenseInconsistency', score: cfg.weights.defenseInconsistency,
        evidence: {
          savunan: def,
          buSaldırganaKarşıOrtalamaBirim: Math.round(mine),
          diğerlerineKarşıOrtalamaBirim: Math.round(other),
          savaşSayısı: Number(r['n']),
        },
      });
    }
    return out;
  }

  /**
   * **B7 — SESSİZ ORTAKLAR.** Aralarında yoğun kaynak alışverişi var ama oyun içinde HİÇ
   * yazışmamışlar.
   *
   * ⚠️ **Mesaj İÇERİĞİ okunmuyor** (§9.1.5). Sorgu yalnız "bu çiftin DM kanalında pencerede
   * mesaj var mı" diye soruyor; gövdeye hiç dokunulmuyor ve dokunulmamalı.
   *
   * ⚠️ En zayıf sinyal ve öyle kalmalı: oyun dışı iletişim (WhatsApp, Discord, aynı evde
   * konuşmak) çok yaygın. Tek başına neredeyse hiçbir şey söylemiyor; değeri diğerlerinin
   * üstüne binmesinde.
   */
  private async silentPartners(
    worldId: number, from: Date, to: Date, cfg: BehaviourConfig,
  ): Promise<BehaviourSignal[]> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      WITH flows AS (
        SELECT LEAST(m.owner_player_id, c.player_id) AS a,
               GREATEST(m.owner_player_id, c.player_id) AS b,
               COALESCE((m.payload->'cargo'->>'gold')::numeric, 0)
             + COALESCE((m.payload->'cargo'->>'food')::numeric, 0) AS amount
          FROM missions m
          JOIN cities c ON c.id = m.target_city_id
         WHERE m.world_id = ${worldId}
           AND m.type = 'transport' AND m.status = 'done'
           AND m.execute_at >= ${from.toISOString()}::timestamptz
           AND m.execute_at <  ${to.toISOString()}::timestamptz
           AND m.owner_player_id IS NOT NULL AND c.player_id IS NOT NULL
           AND m.owner_player_id <> c.player_id
      ),
      agg AS (
        SELECT a, b, SUM(amount) AS total FROM flows GROUP BY a, b
         HAVING SUM(amount) >= ${cfg.flowMinResources}
      )
      SELECT g.a, g.b, g.total,
             (SELECT COUNT(*) FROM chat_messages msg
                JOIN chat_channels ch ON ch.id = msg.channel_id
               WHERE ch.world_id = ${worldId} AND ch.kind = 'dm'
                 AND ch.dm_key = (g.a || ':' || g.b)
                 AND msg.created_at >= ${from.toISOString()}::timestamptz
                 AND msg.created_at <  ${to.toISOString()}::timestamptz)::int AS messages
        FROM agg g
    `);
    return rows
      .filter((r: Record<string, unknown>) => Number(r['messages']) === 0)
      .map((r: Record<string, unknown>) => ({
        a: Number(r['a']), b: Number(r['b']),
        kind: 'silentPartners' as const, score: cfg.weights.silentPartners,
        evidence: {
          toplamKaynak: Math.round(Number(r['total'])),
          oyunİçiMesaj: 0,
        },
      }));
  }
}
