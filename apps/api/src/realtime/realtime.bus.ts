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
  /** Olayın gideceği oyuncular. Boşsa (ve allianceId de yoksa) dünya geneli yayın. */
  playerIds: number[];
  /** Dolu ise olay AYRICA ittifak odasına da gider (`w{w}:a{id}`) — üyeler listeyi tazeler. */
  allianceId?: number | null;
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
    /**
     * ⭐ İTTİFAK DEĞİŞTİ (üyelik/metin/ad/dağıtma, 2026-07-30) — ittifak odasındaki herkes +
     * etkilenen oyuncular (atılan/ayrılan üye odadan düşmüş olabilir, kendi kanalından alır).
     */
    case 'alliance:changed': {
      const ids = Array.isArray(payload['playerIds'])
        ? (payload['playerIds'] as unknown[]).map((x) => Number(x)) : [];
      return {
        topic: 'alliance:changed', worldId,
        playerIds: players(...ids),
        allianceId: num(payload['allianceId']),
        ref: { allianceId: num(payload['allianceId']) },
      };
    }

    // ⭐ Kullanıcının örneği: biri bize casus kuş gönderdiği ANDA görünmeli.
    // ⚠️ `city:incoming_spy` 2026-07-30'a kadar EŞLENMEMİŞTİ: outbox yazılıyor ama switch'te
    //    karşılığı olmadığı için default null → olay sessizce düşüyordu; savunan gelen
    //    casusluğu ancak 60 sn'lik emniyet yoklamasında görüyordu. Aynı satıra bağlandı.
    case 'city:incoming_attack':
    case 'city:incoming_spy':
      return {
        topic: 'missions:changed', worldId,
        playerIds: players(num(payload['defenderPlayerId'])),
        ref: { cityId: num(payload['targetCityId']), missionId: num(payload['missionId']) },
      };

    /**
     * ⭐ GÖREV GÖNDERİLDİ → GÖNDERENE (kullanıcı, 2026-08-02). Ordular rozeti görev verilir
     * verilmez belirsin.
     *
     * ⚠️ Bu satır olmadan rozet YALNIZ isteği yapan sekmede güncelleniyordu (mutation kendi
     * sorgusunu tazeliyor). Oyuncunun açık ikinci sekmesi ya da telefonu 60 sn'lik emniyet
     * yoklamasına kadar hiçbir şey görmüyordu — ve nakliye/destek/şehir kurmanın zaten hiç
     * olayı yoktu. `city:incoming_*` yalnız SAVUNANA gider, bu ise gönderene.
     */
    case 'mission:sent':
      return {
        topic: 'missions:changed', worldId,
        /**
         * ⚠️ **ALICI da burada** (2026-08-03). Önce yalnız gönderen vardı ve bu, gelen
         * nakliye/destek/şehir-kurmanın savunan tarafta HİÇ olayı olmaması demekti:
         * `city:incoming_attack` ve `city:incoming_spy` yalnız saldırı ve casuslukta
         * yazılıyor, diğer üç görev tipi 60 saniyelik emniyet yoklamasını bekliyordu.
         * Tek satır üç tipi birden kapatıyor.
         */
        playerIds: players(num(payload['ownerPlayerId']), num(payload['targetPlayerId'])),
        ref: { cityId: num(payload['originCityId']), missionId: num(payload['missionId']) },
      };

    /**
     * ⭐ TATİL OTOMATİK BİTTİ (2026-08-03) — **yazılıp eşlenmemiş üçüncü olay.**
     *
     * `vacation.handler.ts:48` bunu outbox'a yazıyordu ama burada karşılığı yoktu →
     * `default: null` ile sessizce düşüyordu. Sonuç: 30 günü dolan oyuncunun kaynakları
     * sunucuda akmaya başlıyor, ekranda ise donmuş sayaç ve mavi «Tatilde» rozeti duruyordu.
     * `city:changed` konusu hem şehri hem de tatil panelini tazeliyor (`realtime.ts`).
     */
    case 'vacation:ended':
      return {
        topic: 'city:changed', worldId,
        playerIds: players(num(payload['playerId'])),
        ref: { playerId: num(payload['playerId']) },
      };

    /**
     * ⭐ BİRLEŞİK GÖREV BİTİŞİ (2026-07-30) — scheduler her Ordular-görünür görevi başarıyla
     * işleyince yazar. Tek olay üç işi görür: (1) Ordular sayfasında satır ANINDA düşer,
     * (2) başka sayfadayken sol menü rozeti kendiliğinden güncellenir, (3) payload gelecekte
     * web push / FCM sink'inin bildirim üretmesine yetecek bilgiyi taşır (tip + şehirler).
     * Nakliye varışında GÖNDERENİN listesi bu olaydan önce hiç tetiklenmiyordu.
     */
    case 'mission:completed':
      return {
        topic: 'missions:changed', worldId,
        playerIds: players(num(payload['ownerPlayerId']), num(payload['targetPlayerId'])),
        ref: { missionId: num(payload['missionId']), cityId: num(payload['targetCityId']) },
      };

    case 'battle:resolved':
      return {
        topic: 'battle:resolved', worldId,
        playerIds: players(num(payload['attackerPlayerId']), num(payload['defenderPlayerId'])),
        ref: { battleId: num(payload['battleId']), cityId: num(payload['cityId']) },
      };

    /**
     * ⭐ İptal İKİ tarafa da gider: sahibine "ordun dönüyor", hedefe "gelen saldırı DÜŞTÜ".
     * Hedefe haber vermezsek savunan var olmayan bir orduya karşı savunma yapar — iptalin
     * en önemli yan etkisi budur.
     */
    case 'mission:canceled':
      return {
        topic: 'missions:changed', worldId,
        playerIds: players(num(payload['ownerPlayerId']), num(payload['targetPlayerId'])),
        ref: { missionId: num(payload['missionId']), cityId: num(payload['targetCityId']) },
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
    /**
     * ⚠️ **BU İKİSİ EKSİKTİ** (2026-07-28'de bulundu). `city:changed` nakliye/destek varışında,
     * `city:founded` yeni şehir kurulduğunda yazılıyordu ama burada karşılığı olmadığı için
     * `eventForOutbox` `null` dönüyor ve olay WS'e HİÇ çıkmıyordu. Ekran güncelleniyordu çünkü
     * istemci 5 saniyede bir şehri yokluyordu — yani yoklama gerçek bir boşluğu örtüyordu.
     * Yoklamayı emniyet ağına indirmeden önce boşluğun kapanması gerekiyordu.
     */
    case 'city:changed':
      return {
        topic: 'city:changed', worldId,
        playerIds: players(num(payload['playerId'])),
        ref: { cityId: num(payload['cityId']) },
      };

    /**
     * Yeni şehir ŞEHİR LİSTESİNİ de değiştirir → istemcide `cities` anahtarı da tazelenir.
     *
     * ⭐ `city:renamed` aynı satıra bağlı (2026-07-31): ad; şehir şeridinde, Genel Durum
     * tablosunun sütun başlığında ve dünya listesinde ayrı ayrı duruyor. `city:changed`
     * deseydik yalnız o şehrin sorgusu tazelenir, şerit eski adı göstermeye devam ederdi.
     */
    case 'city:renamed':
    /**
     * ⚠️ `city:abandoned` de burada olmak ZORUNDA: şehir listeden düşünce şerit, dünya
     * haritası ve Genel Durum tablosu üçü birden değişiyor. `ActiveCityProvider` "kayıtlı
     * şehir artık bize ait değilse başkente düş" kuralını `cities` sorgusundan okuyor —
     * yani bu olay gelmezse oyuncu var olmayan bir şehri seçili görmeye devam eder.
     */
    case 'city:abandoned':
    case 'city:founded':
      return {
        topic: 'cities:changed', worldId,
        playerIds: players(num(payload['playerId'])),
        ref: { cityId: num(payload['cityId']) },
      };

    /**
     * Posta kutusuna düşen HER satır (savaş raporu · dönüş · casusluk · nakliye · destek).
     * Okunmamış rozeti bununla anında güncelleniyor; `messages` yoklaması artık yalnız emniyet ağı.
     */
    case 'message:written':
      return {
        topic: 'messages:changed', worldId,
        playerIds: players(num(payload['playerId'])),
        ref: { kind: payload['kind'] == null ? null : String(payload['kind']) },
      };

    /**
     * ⭐ ÖZEL MESAJ (2026-07-31) — İKİ tarafa da gider: alıcı balonu/rozeti görsün, gönderenin
     * başka sekmesi/cihazı da senkronlansın.
     *
     * ⚠️ Olay GÖVDE TAŞIMAZ, yalnız kimlik: NOTIFY 8000 bayt sınırı ve "olay veri değil haber
     * taşır" kuralı. İstemci olayı alınca geçmişi/listeyi tazeler. Önizleme metni outbox
     * PAYLOAD'ında durur (push bildirimi ileride oradan besleneceği için) ama WS olayına girmez.
     */
    case 'chat:dm':
      return {
        topic: 'chat:message', worldId,
        playerIds: players(num(payload['senderId']), num(payload['recipientId'])),
        ref: { channelId: num(payload['channelId']), messageId: num(payload['messageId']) },
      };

    /**
     * ⭐ BAKIM MODU (admin Faz 2) — **dünya geneli** yayın: perde herkeste aynı anda açılıp
     * kapanmalı. Olay kimlik değil DURUM taşıyor (`paused`, `notice`, `eta`) ve bu, "olay veri
     * değil haber taşır" kuralının bilinçli tek istisnası: perdenin amacı zaten oyuncuyu
     * sunucudan uzak tutmak; onu göstermek için istemciyi bir sorgu daha yapmaya zorlamak
     * (üstelik tam da bakım anında, tüm istemciler aynı saniyede) tersine bir yük dalgası olurdu.
     * Yük küçük ve sabit; NOTIFY'ın 8000 bayt sınırına yaklaşmıyor.
     */
    case 'world:maintenance':
      return {
        topic: 'world:maintenance', worldId, playerIds: [],
        ref: {
          paused: payload['paused'] === true ? 1 : 0,
          notice: payload['notice'] == null ? null : String(payload['notice']),
          eta: payload['eta'] == null ? null : String(payload['eta']),
        },
      };

    /**
     * Sıralama anlık görüntüsü — **dünya geneli** yayın (`playerIds` boş): sıra herkesinkini
     * aynı anda değiştirir, oyuncu başına olay üretmek 10.000 satırlık bir dünyada anlamsız olurdu.
     */
    case 'ranking:updated':
      return {
        topic: 'ranking:updated', worldId, playerIds: [],
        ref: { takenAt: payload['takenAt'] == null ? null : String(payload['takenAt']) },
      };

    default:
      return null;
  }
}
