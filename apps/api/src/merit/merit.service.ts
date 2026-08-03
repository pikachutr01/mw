/**
 * ⭐ ASKERÎ ÜNVANLAR — Subay · Komutan · Başkomutan · Mareşal (kullanıcı, 2026-08-03)
 *
 * Kural, formül ve eşiklerin gerekçesi `@mobilwar/catalog` · `merit.ts`te. Burada yalnız
 * *veritabanına yazma* mantığı var.
 *
 * ── UYGULAMA KURALLARI ──────────────────────────────────────────────────────────────────────
 *
 * • **Tek savaş sayılır, biriktirme yok.** Kullanıcı böyle tanımladı: *"Bir savaşta bu
 *   puanların üzerinde ordu öldüren oyuncuya bu unvan otomatik olarak verilsin."* Toplam
 *   üzerinden verseydik ünvan bir başarı değil bir kıdem göstergesi olurdu.
 *
 * • **Kaybeden de alır.** *"Savaşı kaybetse bile verilsin."* Ünvan sonucu değil, verilen
 *   zararı ölçüyor.
 *
 * • **Yükseltme süreyi sıfırlar, eşitlik süreyi yeniler, düşük ünvan hiçbir şey yapmaz.**
 *   Kullanıcının örneği: *"Subay rütbesinde birisi rütbesinin bitmesine 2 gün kalan
 *   Başkomutan rütbesi için gereken puanda asker öldürürse Başkomutana terfi eder ve 3 hafta
 *   süresi yeniden başlar."* Eşitlikte yenileme kullanıcı sözünde geçmiyor ama tek tutarlı
 *   davranış o: aynı başarıyı tekrar gösteren oyuncunun rozetinin sönmesi anlamsız olurdu.
 *
 * • **Aynı ittifaktan iki oyuncu arasındaki savaş SAYILMAZ.** Kullanıcı istemedi, ama bedava
 *   gelen bir emniyet: iki hesabın anlaşıp birbirine ordu yedirmesi. ⚠️ Bu sömürünün zaten
 *   kârsız olduğunu not edelim — Mareşal için 500 milyon kaynaklık ordu öldürmek gerekiyor ve
 *   o orduyu kurmak aynı kaynağı harcamak demek. Yine de aynı ittifaktakiler "birbirine
 *   saldırıyormuş gibi yapıp" rozet dağıtmasın.
 */
import { sql } from 'drizzle-orm';
import {
  DEFAULT_MERIT_CONFIG, MERIT_BY_TIER, meritDays, meritTierFor,
  type CatalogConfig, type MeritConfig, type MeritTier,
} from '@mobilwar/catalog';
import { toDateOrNull } from '../db/client.ts';
import type { Tx } from '../missions/handler-registry.ts';
import { RESOURCE_PER_POINT, lossValue } from '../scoring/score.service.ts';

const GUN_MS = 86_400_000;

/**
 * Öldürülen ordunun **kıyım puanı** = kaybettirilen kaynak / 1000.
 *
 * ⚠️ `lossValue` tekrar kullanılıyor, kopyalanmıyor: aynı sayı savunanın puanından da
 * düşülüyor (`debitLosses`). İki ayrı hesap yazsaydık dünya çarpanı değiştiğinde biri
 * güncellenir öteki bayatlardı — ve ünvan eşikleri sessizce kayardı.
 */
export function meritScore(lost: Record<string, number>, cfg?: CatalogConfig): number {
  return lossValue(lost, cfg) / RESOURCE_PER_POINT;
}

export interface MeritGrant {
  playerId: number;
  tier: MeritTier;
  name: string;
  killScore: number;
  expiresAt: Date;
  /** `true` ⇒ bir üst basamağa çıktı; `false` ⇒ aynı basamak yenilendi. */
  promoted: boolean;
}

/**
 * Bir savaşın bir tarafına ünvan uygular. Hiçbir şey değişmiyorsa `null` döner.
 *
 * ⚠️ Satır `FOR UPDATE` ile kilitleniyor. Aynı oyuncunun iki şehri aynı anda saldırı alabilir
 * ve iki savaş iki ayrı transaction'da çözülür; kilit olmadan küçük savaş büyüğünün ünvanını
 * ezebilirdi (okuma ile yazma arasına girerek).
 */
export async function applyMerit(opts: {
  tx: Tx;
  playerId: number;
  battleId: number;
  /** Karşı tarafın tür tür kayıpları. */
  enemyLosses: Record<string, number>;
  /** Görevin oyun saatindeki vadesi (`ctx.at`). */
  at: Date;
  catalog?: CatalogConfig;
  merit?: MeritConfig;
}): Promise<MeritGrant | null> {
  const cfg = opts.merit ?? DEFAULT_MERIT_CONFIG;
  const killScore = meritScore(opts.enemyLosses, opts.catalog);
  const tier = meritTierFor(killScore, cfg);
  if (tier == null) return null;

  const expiresAt = new Date(opts.at.getTime() + meritDays(tier, cfg) * GUN_MS);

  const [cur] = await opts.tx.execute<Record<string, unknown>>(sql`
    SELECT merit_tier, merit_expires_at FROM players WHERE id = ${opts.playerId} FOR UPDATE
  `);
  if (!cur) return null;

  /**
   * ⚠️ **Süresi geçmiş ünvan YOK sayılır.** `merit_expires_at <= at` olan bir satır tabloda
   * duruyor olabilir (temizleyen görev yok, bilerek — bkz. `0037_merit_rank.sql`); onu
   * "mevcut ünvan" saysaydık Mareşal'i sönmüş bir oyuncu bir daha Subay olamazdı.
   */
  const expires = toDateOrNull(cur['merit_expires_at']);
  const yururlukte = cur['merit_tier'] != null && expires != null && expires > opts.at
    ? (Number(cur['merit_tier']) as MeritTier)
    : null;

  // Yürürlükteki ünvan daha yüksekse dokunulmaz — küçük savaş büyük rozeti düşürmez.
  if (yururlukte != null && yururlukte > tier) return null;

  await opts.tx.execute(sql`
    UPDATE players
       SET merit_tier = ${tier},
           merit_score = ${Math.round(killScore)},
           merit_battle_id = ${opts.battleId},
           merit_granted_at = ${opts.at.toISOString()}::timestamptz,
           merit_expires_at = ${expiresAt.toISOString()}::timestamptz
     WHERE id = ${opts.playerId}
  `);

  return {
    playerId: opts.playerId,
    tier,
    name: MERIT_BY_TIER[tier]!.name,
    killScore: Math.round(killScore),
    expiresAt,
    promoted: yururlukte == null || tier > yururlukte,
  };
}

/** İki oyuncu aynı ittifakta mı? (Çiftlik koruması — ikisi de ittifaksızsa `false`.) */
export async function sameAlliance(tx: Tx, a: number, b: number): Promise<boolean> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    SELECT COUNT(DISTINCT alliance_id)::int AS n, COUNT(alliance_id)::int AS filled
      FROM players WHERE id IN (${a}, ${b})
  `);
  const r = rows[0];
  return Number(r?.['filled'] ?? 0) === 2 && Number(r?.['n'] ?? 0) === 1;
}
