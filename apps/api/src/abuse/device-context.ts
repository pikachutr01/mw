/**
 * İstemci cihaz bağlamının HTTP başlıklarından çıkarılması (§9.1.2).
 *
 * Web ve mobil aynı sözleşmeyi kullanır ama farklı alanları doldurur:
 *   web    → `X-Device-Id` (localStorage + httpOnly çerez) + User-Agent
 *   mobil  → `X-Device-Id` (flutter_secure_storage) + `X-Platform`/`X-OS-Version`/`X-Device-Model`
 *            (mobilde User-Agent YOK)
 *
 * `X-Device-Id` istemcide üretilir; sunucu onu **kimlik doğrulama için ASLA kullanmaz** (taklit
 * edilebilir) — yalnız korelasyon sinyali olarak kaydeder.
 */
import { detectPlatform, type DeviceContext } from './device-signal.service.ts';

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

const one = (v: string | string[] | undefined): string | null => {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
};

/** UUID biçim kontrolü: uydurma/aşırı uzun device_id ile tablo kirletilmesin. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const trim = (v: string | null, max: number): string | null =>
  v == null ? null : v.slice(0, max);

export function extractDeviceContext(req: RequestLike): DeviceContext {
  const h = req.headers;
  const rawDeviceId = one(h['x-device-id']);
  const declared = one(h['x-platform']);
  const userAgent = one(h['user-agent']);

  // Ters vekil (nginx) arkasındayız: gerçek IP X-Forwarded-For'un İLK öğesidir.
  const forwarded = one(h['x-forwarded-for']);
  const ip = (forwarded?.split(',')[0]?.trim() || req.ip) ?? null;

  return {
    deviceId: rawDeviceId && UUID_RE.test(rawDeviceId) ? rawDeviceId.toLowerCase() : null,
    ip,
    userAgent: trim(userAgent, 500),
    platform: detectPlatform(userAgent, declared),
    osVersion: trim(one(h['x-os-version']), 60),
    deviceModel: trim(one(h['x-device-model']), 100),
    appVersion: trim(one(h['x-app-version']), 40),
    timezone: trim(one(h['x-timezone']), 60),
    locale: trim(one(h['x-locale']), 20),
  };
}
