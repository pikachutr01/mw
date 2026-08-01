/**
 * ⭐ ÇOKLU HESAP SİNYAL TOPLAMA (SİSTEM PLANI §9.1.2)
 *
 * Bu servis **yalnız kaydeder, karar vermez.** Toplama bugün başlamalı çünkü tespit mantığı
 * sonradan yazılabilir ama VERİ sonradan toplanamaz — altı ay sonra "bu iki hesap aynı cihazdan mı
 * giriyordu?" sorusunun cevabı ancak bugünden itibaren kaydettiysek var.
 *
 * ⚠️ Otomatik ceza YOK (§9.1.1). Her teknik izin masum açıklaması var: aynı evdeki kardeşler,
 * okul/ofis ağı, mobil operatör NAT'ı (binlerce abone tek IP), paylaşılan tablet.
 * ⚠️ Canvas/WebGL parmak izi KULLANILMIYOR — KVKK/GDPR açısından ağır, kolay atlatılır ve
 * davranış sinyalleri (§9.1.2 B1-B7) zaten çok daha güçlü.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';

export type Platform = 'web' | 'android' | 'ios' | 'unknown';

/** İstemciden gelen cihaz bağlamı. Web ve mobil AYRI alanlar doldurur (§9.1.2 tablosu). */
export interface DeviceContext {
  /** İstemcide üretilip kalıcı saklanan UUID (`X-Device-Id`). En güçlü teknik iz. */
  deviceId: string | null;
  ip: string | null;
  /** Web: User-Agent. Mobilde YOK → null. */
  userAgent: string | null;
  platform: Platform;
  /** Mobil: OS sürümü ve cihaz modeli (web'de UA'nın karşılığı). */
  osVersion?: string | null;
  deviceModel?: string | null;
  appVersion?: string | null;
  timezone?: string | null;
  locale?: string | null;
}

/**
 * IPv4 /24 öbeği. Mobil operatör NAT'ında tek IP eşleşmesi zayıf sinyaldir; öbek daha anlamlı.
 * IPv6'da ilk 48 bit (site öneki) kullanılır.
 */
export function ipBlock(ip: string | null): string | null {
  if (!ip) return null;
  const clean = ip.replace(/^::ffff:/, '').split('%')[0] ?? ip;
  if (clean.includes(':')) {
    const parts = clean.split(':').filter((p) => p !== '');
    return parts.length >= 3 ? `${parts.slice(0, 3).join(':')}::/48` : null;
  }
  const octets = clean.split('.');
  return octets.length === 4 ? `${octets[0]}.${octets[1]}.${octets[2]}.0/24` : null;
}

/**
 * Web istemcisinin platformunu UA'dan tahmin eder. Mobil uygulama platformunu AÇIKÇA gönderir
 * (`X-Platform`), tahmine gerek kalmaz — UA taklit edilebildiği için açık bildirim daha güvenilir.
 */
export function detectPlatform(userAgent: string | null, declared?: string | null): Platform {
  if (declared === 'web' || declared === 'android' || declared === 'ios') return declared;
  if (!userAgent) return 'unknown';
  return 'web';
}

export class DeviceSignalService {
  constructor(private readonly db: Db) {}

  /**
   * Oturum açılışında/yenilenmesinde çağrılır. Sayaç tablolarını günceller (upsert):
   * satır sayısı oyuncu×cihaz ile sınırlı olduğu için sınırsız büyümez ve `sessions` 90 günde
   * budandıktan sonra bile öbek bilgisi kalır.
   */
  async record(playerId: number, ctx: DeviceContext): Promise<void> {
    if (ctx.deviceId) {
      await this.db.execute(sql`
        INSERT INTO player_devices (player_id, device_id, platform)
        VALUES (${playerId}, ${ctx.deviceId}, ${ctx.platform})
        ON CONFLICT (player_id, device_id)
        DO UPDATE SET last_seen = now(), hits = player_devices.hits + 1
      `);
    }
    if (ctx.ip) {
      await this.db.execute(sql`
        INSERT INTO player_ips (player_id, ip, ip_block_24)
        VALUES (${playerId}, ${ctx.ip}, ${ipBlock(ctx.ip)})
        ON CONFLICT (player_id, ip)
        DO UPDATE SET last_seen = now(), hits = player_ips.hits + 1
      `);
    }
  }

  /**
   * "Bu cihazı bu dünyada kaç oyuncu kullandı?" — analizörün (Faz 4) ana sorgusu.
   * Faz 2'de yalnız kabul kriterini doğrulamak için var.
   */
  async playersSharingDevice(deviceId: string): Promise<number[]> {
    const rows = await this.db.execute<{ player_id: number } & Record<string, unknown>>(sql`
      SELECT DISTINCT player_id FROM player_devices WHERE device_id = ${deviceId} ORDER BY player_id
    `);
    return rows.map((r) => Number(r.player_id));
  }

  async playersSharingIpBlock(block: string): Promise<number[]> {
    const rows = await this.db.execute<{ player_id: number } & Record<string, unknown>>(sql`
      SELECT DISTINCT player_id FROM player_ips WHERE ip_block_24 = ${block} ORDER BY player_id
    `);
    return rows.map((r) => Number(r.player_id));
  }
}

/*
 * ⚠️ Burada bir `pruneOldSessions(retentionDays)` metodu vardı; 2026-08-02'de **silindi**.
 * İki sebep:
 *   1. **Çağıranı yoktu** — tüm repo tarandı, yalnız kendi tanımı eşleşiyordu.
 *   2. **Mantığı yanlıştı**: `created_at < now() - N gün` diyerek CANLI oturumları da silerdi.
 *      Dönmeli refresh her yenilemede yeni satır açtığı için uzun süredir bağlı bir cihazın
 *      zinciri eskidir ama satırı diridir; o satırı silmek oyuncuyu durduk yere düşürürdü.
 * Doğrusunu yönetim panelinin Faz 8 temizlik görevi zaten yapıyor: `admin/ops-jobs.ts`
 * `sessions` işi `revoked_at`/`expires_at` üzerinden yalnız GERÇEKTEN ölü satırları siliyor.
 */
