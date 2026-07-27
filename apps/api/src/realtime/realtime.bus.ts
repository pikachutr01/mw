/**
 * ⭐ GERÇEK ZAMANLI OLAY YOLU — Postgres `LISTEN`/`NOTIFY`.
 *
 * **Neden Redis pub/sub değil:** küçük sunucu profilinde (§4.0) Redis **opsiyonel**; zorunlu
 * kılmak tek uygulama için ikinci bir altyapı bağımlılığı demekti. Postgres zaten var ve
 * zorunlu. `ROLE=all` iken API ile worker aynı süreçte olsa bile bu yol çalışır; `ROLE=api` /
 * `ROLE=worker` diye ayrıldığında **kod değişmeden** çalışmaya devam eder — asıl kazanç bu.
 *
 * ⚠️ **Yük taşımaz, HABER taşır.** `NOTIFY` yükü 8000 bayta sınırlıdır ve daha önemlisi: olayın
 * içine veri koyarsak iki kaynak doğar (WS yükü ve DB) ve bunlar kaçınılmaz olarak birbirinden
 * kayar. Bu yüzden olay yalnız "şu oyuncunun şu verisi değişti" der; istemci tazeler.
 *
 * ⚠️ En az bir kez teslim garantisi **outbox**tadır (§1). Bu yol "hızlı ama kayıpsız değil"
 * katmandır: WS mesajı düşerse oyuncu bir sonraki yoklamada/girişte yine görür. Bu yüzden
 * bildirim asla YALNIZ buradan gitmez.
 */
import type postgres from 'postgres';

/** Postgres kanal adı. Tek kanal yeterli; ayrım yükteki `topic` alanında. */
export const CHANNEL = 'mw_realtime';

export interface RealtimeEvent {
  /** `missions:changed` · `messages:new` · `city:changed` · `battle:resolved` … */
  topic: string;
  worldId: number | null;
  /** Olayın gideceği oyuncular. Boşsa dünya geneli yayın. */
  playerIds: number[];
  /** Yalnız KİMLİK bilgisi — veri değil (yukarıdaki kural). */
  ref?: Record<string, number | string | null>;
}

export class RealtimeBus {
  private unsubscribe: (() => Promise<void>) | null = null;

  constructor(private readonly sql: postgres.Sql) {}

  /** Olayı yayınlar. Hata ATILMAZ: bildirim yolu, oyun mutasyonunu asla düşürmemeli. */
  async publish(event: RealtimeEvent): Promise<void> {
    const payload = JSON.stringify(event);
    if (payload.length > 7500) {
      // Bu asla olmamalı (olaylar kimlik taşır); olduysa kod bir yerde veri koymuş demektir.
      // eslint-disable-next-line no-console
      console.warn('[realtime] olay çok büyük, atlandı:', event.topic, payload.length);
      return;
    }
    try {
      await this.sql`SELECT pg_notify(${CHANNEL}, ${payload})`;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[realtime] yayın başarısız:', err);
    }
  }

  /** Dinlemeye başlar. postgres.js `listen` için ayrı bir bağlantı açar (havuzu tıkamaz). */
  async subscribe(handler: (event: RealtimeEvent) => void): Promise<void> {
    const sub = await this.sql.listen(CHANNEL, (raw) => {
      try {
        handler(JSON.parse(raw) as RealtimeEvent);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[realtime] bozuk olay yükü:', err);
      }
    });
    this.unsubscribe = () => sub.unlisten();
  }

  async stop(): Promise<void> {
    await this.unsubscribe?.();
    this.unsubscribe = null;
  }
}

/**
 * Outbox konusu → gerçek zamanlı olay.
 *
 * Outbox konuları oyun diliyle ("savaş çözüldü"), WS olayları istemci diliyle ("şu sorguyu
 * tazele") konuşur. Eşleme burada tek yerde durur; yeni bir konu eklenince yalnız bu tablo büyür.
 */
export function eventForOutbox(
  topic: string, payload: Record<string, unknown>, worldId: number | null,
): RealtimeEvent | null {
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  const players = (...ids: (number | null)[]): number[] =>
    [...new Set(ids.filter((x): x is number => typeof x === 'number' && x > 0))];

  switch (topic) {
    // ⭐ Kullanıcının örneği: biri bize casus kuş gönderdiği ANDA görünmeli.
    case 'city:incoming_attack':
      return {
        topic: 'missions:changed', worldId,
        playerIds: players(num(payload['defenderPlayerId'])),
        ref: { cityId: num(payload['targetCityId']), missionId: num(payload['missionId']) },
      };

    case 'battle:resolved':
      return {
        topic: 'battle:resolved', worldId,
        playerIds: players(num(payload['attackerPlayerId']), num(payload['defenderPlayerId'])),
        ref: { battleId: num(payload['battleId']), cityId: num(payload['cityId']) },
      };

    case 'city:army_returned':
      return {
        topic: 'missions:changed', worldId,
        playerIds: players(num(payload['playerId'])),
        ref: { cityId: num(payload['cityId']) },
      };

    case 'city:building_finished':
    case 'city:units_finished':
    case 'city:defense_finished':
    case 'player:tech_finished':
      return {
        topic: 'city:changed', worldId,
        playerIds: players(num(payload['playerId'])),
        ref: { cityId: num(payload['cityId']) },
      };

    default:
      return null;
  }
}
