/**
 * ⭐ DOĞRULANMAMIŞ HESAP KISITLARI (kullanıcı kararı, 2026-08-01) — **tek kural kaynağı.**
 *
 * Bugüne kadar doğrulama YUMUŞAKTI: `email-token.service.ts:7-10` "hesap oyuna girer, şerit
 * uyarır" diyordu ve `VerifyBanner.tsx` "oyunun HİÇBİR yerinde engellenmez" diye tekrarlıyordu.
 * Yani doğrulanmamış bir hesap her şeyi yapabiliyordu → çoklu hesap üretmenin bedeli sıfırdı.
 *
 * Yeni denge: **oyunu keşfetmeyi engelleme, ilerlemeye izin verme.**
 *
 * | serbest | yasak |
 * | :-- | :-- |
 * | üretim · yapı · teknik (tavana kadar) | saldırı · nakliye · şehir kurma |
 * | casusluk | adetli savunma birimi üretimi |
 * | KENDİ şehirleri arasında destek | ittifak kurma / katılma / başvurma |
 * | kahraman, mağara, kuyruk, rapor | mesaj yazma (gelen okunur, cevap yazılamaz) |
 * | | şehir adı değiştirme |
 *
 * ⚠️ **SINIRLAR «≥» ÇALIŞIR** (kullanıcının açık şartı). Kapı "hedef seviye tavanı aşıyor mu"
 * diye değil, **"mevcut seviye tavana ULAŞTI mı"** diye sorar. Fark yalnız doğrulamayı SONRADAN
 * kaybeden hesapta görünür — e-posta adresini değiştirmek tam olarak bunu yapıyor: seviye 6
 * akademisi olan oyuncu akademiyi kaybetmez, sadece 7'ye çıkamaz. Hiçbir şey geri alınmaz,
 * hiçbir kaynak iade edilmez.
 *
 * ⚠️ **NEDEN KÜRESEL BİR KESİCİ (interceptor) DEĞİL.** `MaintenanceInterceptor` deseni hazırdı
 * ama o HTTP METODUNA göre kilitliyor (tüm POST'lar). Buradaki kısıtlar seçici: casusluk
 * serbest, saldırı yasak; yapı seviye 3'e kadar serbest, sonrası yasak. Metot bazlı bir kesici
 * bu ayrımı yapamaz. Üç servis boğazı (`queue.service.loadCity`, `mission.service.sendAttack`
 * ve `march`) yüzeyin %90'ını zaten kapsıyor.
 */
import { sql } from 'drizzle-orm';

import { liveBool, liveNumber } from '../settings/live.ts';

/** Kısıtın tetiklendiği her yerde AYNI kod — istemci tek bir metin gösterir. */
export const UNVERIFIED_CODE = 'email_unverified';

export interface UnverifiedLimits {
  enabled: boolean;
  maxBuildingLevel: number;
  maxTechLevel: number;
  maxDefenseLevel: number;
  maxWarriors: number;
}

export function unverifiedLimits(): UnverifiedLimits {
  return {
    enabled: liveBool('verify', 'enabled', true),
    maxBuildingLevel: liveNumber('verify', 'maxBuildingLevel', 3),
    maxTechLevel: liveNumber('verify', 'maxTechLevel', 3),
    maxDefenseLevel: liveNumber('verify', 'maxDefenseLevel', 3),
    maxWarriors: liveNumber('verify', 'maxWarriors', 200),
  };
}

/** Kısıt gerçekten uygulanacak mı? Doğrulanmış hesapta ya da anahtar kapalıyken HAYIR. */
export const restricted = (emailVerified: boolean): boolean =>
  !emailVerified && unverifiedLimits().enabled;

/** Oyuncunun e-postası doğrulanmış mı? Tek satırlık bakış; çağıran kendi tx'ini geçirir. */
export async function isVerified(
  runner: { execute: <T>(q: unknown) => Promise<T[]> }, playerId: number,
): Promise<boolean> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT (a.email_verified_at IS NOT NULL) AS ok
      FROM players p JOIN accounts a ON a.id = p.account_id
     WHERE p.id = ${playerId}
  ` as never);
  return rows[0]?.['ok'] === true;
}

/**
 * ⭐ OYUNCUNUN TOPLAM SAVAŞÇI SAYISI — dört kaynağın toplamı.
 *
 * ⚠️ **Dördü de sayılmak zorunda.** Yalnız barakadakiler sayılsaydı oyuncu 200 savaşçı üretip
 * hepsini bir sefere yollar, baraka boşalır ve 200 tane daha üretirdi; limit hiçbir şey ifade
 * etmezdi. Aynı boşluk mağara (savaşçı saklama yeri) ve bekleyen üretim kuyruğu için de geçerli.
 *
 * ⚠️ Savunma birimleri sayıya GİRMEZ: onlar `defenses` tablosunda ve doğrulanmamış hesapta
 * zaten hiç üretilemiyor.
 */
export async function warriorTotal(
  runner: { execute: <T>(q: unknown) => Promise<T[]> }, playerId: number,
): Promise<number> {
  const rows = await runner.execute<Record<string, unknown>>(sql`
    SELECT
      COALESCE((SELECT SUM(u.count) FROM units u
                  JOIN cities c ON c.id = u.city_id WHERE c.player_id = ${playerId}), 0)
    + COALESCE((SELECT SUM(cu.count) FROM cave_units cu
                  JOIN cities c ON c.id = cu.city_id WHERE c.player_id = ${playerId}), 0)
    + COALESCE((SELECT SUM(mu.count) FROM mission_units mu
                  JOIN missions m ON m.id = mu.mission_id
                 WHERE m.owner_player_id = ${playerId}
                   AND m.status IN ('scheduled', 'running')), 0)
    + COALESCE((SELECT SUM(q.count) FROM queues q
                  JOIN cities c ON c.id = q.city_id
                 WHERE c.player_id = ${playerId} AND q.category = 'unit'
                   AND q.completed_at IS NULL AND q.canceled_at IS NULL), 0)
      AS total
  ` as never);
  return Number(rows[0]?.['total'] ?? 0);
}

/* ── Hazır metinler ──────────────────────────────────────────────────────────
 * ⚠️ Metin tek yerde: aynı kısıt beş ayrı serviste tetikleniyor ve beşi farklı cümle
 * kursaydı oyuncu aynı duvara her çarptığında başka bir şey okurdu.
 */

const SUFFIX = ' E-posta adresini doğrulayınca bu kısıt kalkar.';

export const UNVERIFIED_MESSAGE = {
  attack: 'Doğrulanmamış hesapla saldırı yapılamaz.' + SUFFIX,
  transport: 'Doğrulanmamış hesapla nakliye yapılamaz.' + SUFFIX,
  foundCity: 'Doğrulanmamış hesapla yeni şehir kurulamaz.' + SUFFIX,
  rename: 'Doğrulanmamış hesapla şehir adı değiştirilemez.' + SUFFIX,
  alliance: 'Doğrulanmamış hesapla ittifak kurulamaz ve ittifağa katılınamaz.' + SUFFIX,
  chat: 'Doğrulanmamış hesapla mesaj yazılamaz. Gelen mesajları okuyabilirsin.' + SUFFIX,
  defenseUnit: 'Doğrulanmamış hesapla savunma ünitesi üretilemez.' + SUFFIX,
  building: (max: number): string =>
    `Doğrulanmamış hesapta yapılar en fazla ${max}. seviyeye çıkabilir.` + SUFFIX,
  tech: (max: number): string =>
    `Doğrulanmamış hesapta teknikler en fazla ${max}. seviyeye çıkabilir.` + SUFFIX,
  defenseLevel: (max: number): string =>
    `Doğrulanmamış hesapta Sur ve Büyü Kalkanı en fazla ${max}. seviyeye çıkabilir.` + SUFFIX,
  warriors: (max: number, have: number): string =>
    `Doğrulanmamış hesapta en fazla ${max} savaşçın olabilir (şu an ${have}). `
    + 'Sayıya barakadaki, mağaradaki, yoldaki ve kuyruktaki savaşçılar dahildir.' + SUFFIX,
} as const;
