/**
 * Görev tipi → handler kaydı (SİSTEM PLANI §1: "hepsi aynı çatı").
 *
 * Handler sözleşmesi — pazarlıksız iki kural:
 *  1. **`ctx.at` "şimdi"dir, `now()` DEĞİL.** Kaynak birikimi, savaş anı, dönüş bacağının zamanı
 *     hepsi buna göre hesaplanır. Bu kural olmadan 800 ms geç işlenen görev fazladan kaynak yazar
 *     ve zincir kayar (§13.10.2 kural 3).
 *  2. **Her şey tek transaction'da.** Oyun mutasyonu + outbox satırı + görev durumu aynı
 *     transaction'da yazılır → "savaş oldu ama rapor gitmedi" imkânsız.
 */
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { CombatConfig, DeepPartial, LootConfig } from '@mobilwar/engine';
import type { MissionRow } from './mission.repository.ts';

/** Handler'ın kullanacağı transaction tipi (drizzle'ın tx nesnesi). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = PgTransaction<any, any, any>;

export interface HandlerContext {
  tx: Tx;
  mission: MissionRow;
  /** ⭐ OYUN SAATİ olarak "şimdi" = mission.executeAt. */
  at: Date;
  worldId: number;
  /** Aynı transaction'da outbox satırı yaz (bildirim/WS/rapor tek yol). */
  emit(topic: string, payload: Record<string, unknown>): Promise<void>;
  /** Denetim kaydı (kaynak/asker değiştiren her işlem). */
  audit(entry: {
    action: string;
    entity?: string;
    entityId?: number;
    playerId?: number | null;
    before?: unknown;
    after?: unknown;
  }): Promise<void>;
  /** Hedef şehri seri hâle getirir: aynı şehre düşen görevler çakışmaz. */
  lockCity(cityId: number): Promise<void>;
  /**
   * ⭐ DÜNYA BAZLI MOTOR AYARLARI (§admin Faz 4). **Yoksa motor varsayılanı kullanılır** ve
   * sonuç bit-bit eskisiyle aynı olur — bu yüzden isteğe bağlı.
   *
   * ⚠️ Handler'a modül seviyesinden bir "canlı config" okutmak daha az kod olurdu ama
   * gizli bir küresel durum yaratırdı: savaş handler'ı saf bir fonksiyon ve test edilirken
   * ne verildiyse onu görmeli.
   */
  engine?: {
    combat?: DeepPartial<CombatConfig>;
    loot?: Partial<LootConfig>;
    /** `battles.settings_revision_id` — hangi ayar sürümüyle çözüldüğünün künyesi. */
    settingsRevisionId?: number | null;
  };
}

export type MissionHandler = (ctx: HandlerContext) => Promise<void>;

export class HandlerRegistry {
  private readonly handlers = new Map<string, MissionHandler>();

  register(type: string, handler: MissionHandler): this {
    if (this.handlers.has(type)) throw new Error(`Görev tipi zaten kayıtlı: ${type}`);
    this.handlers.set(type, handler);
    return this;
  }

  get(type: string): MissionHandler | undefined {
    return this.handlers.get(type);
  }

  types(): string[] {
    return [...this.handlers.keys()];
  }
}
