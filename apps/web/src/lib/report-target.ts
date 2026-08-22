/**
 * ⭐⭐ RAPORDAN SEFERE — bir raporun "karşı taraf" koordinatı hangisi?
 *
 * Kullanıcı isteği (2026-08-21): casusluk · casusluk önleme · saldırı · şehir savunma
 * raporlarına köşeye ikon şeklinde «saldır» ve «casus gönder» düğmeleri.
 *
 * ⚠️⚠️ ASIL KARAR BURADA ve göründüğünden ince: düğmenin hedefi **her zaman `target` DEĞİL**.
 * Rapor iki taraflı ve hangi ucun düşman olduğu `side`a bağlı:
 *
 *   | rapor                | side       | benim olan uç | düşman uç |
 *   | :--                  | :--        | :--           | :--       |
 *   | Saldırı Raporu       | `attacker` | origin        | **target** |
 *   | Şehir Savunma Raporu | `defender` | target        | **origin** |
 *   | Casusluk Raporu      | `spy`      | origin        | **target** |
 *   | Casusluk Önleme      | `target`   | target        | **origin** |
 *
 * Yani savunma raporlarında düğme **karşı saldırı** açıyor: saldıran kimse ona. Hep `target`a
 * bakılsaydı oyuncu kendi şehrine saldırmaya çalışırdı — sunucu reddederdi ama düğmenin
 * kendisi anlamsız olurdu.
 *
 * ⚠️ Nakliye, destek, şehir kurma ve ittifak mesajlarında düğme YOK (`null`): oralarda
 * "düşman uç" diye bir şey yok ve nakliye yaptığın müttefikine saldır düğmesi sunmak
 * yanlış bir davet olurdu.
 *
 * ⚠️ **İstemci başka hiçbir kapı koymuyor.** 10 kat kuralı, koruma, tatil modu, doğrulanmamış
 * e-posta — hepsi sunucuda (`sendAttack`) ve orada yeniden bakılıyor. Kullanıcının kararı
 * (2026-08-21): *"hata dönerse form gösterir"*. Rapor tarihsel bir kayıt; koordinatın
 * bugünkü sahibi değişmiş olabilir ve bunu istemcide tahmin etmeye çalışmak yanılırdı.
 */

/** Rapor güzergâhının bir ucu. `name`/`owner` olayın anına donmuş, bugünü göstermez. */
export interface ReportCoord {
  k: number;
  d: number;
  s: number;
  name?: string;
  owner?: string;
}

/** Düğmelerin açacağı sefer türleri — sırası ekrandaki sırası. */
export const REPORT_MISSIONS = [
  { type: 'attack', icon: 'attack', label: 'Saldır' },
  { type: 'spy', icon: 'spy_out', label: 'Casus gönder' },
] as const;

/** Düğmelerin çıktığı rapor türleri; `side` hangi ucun düşman olduğunu söylüyor. */
const ENEMY_END: Record<string, 'origin' | 'target'> = {
  'battle_report:attacker': 'target',
  'battle_report:defender': 'origin',
  'spy_report:spy': 'target',
  'spy_report:target': 'origin',
};

/**
 * Raporun düşman ucu, yoksa `null`.
 *
 * ⚠️ `spy_report`ta `side` sunucuda `'spy'` dışında bir değer de olabiliyor (eski kayıtlar);
 * ekran zaten *"`side === 'target'` değilse casusluk raporu"* kuralıyla çalışıyor ve burada
 * da aynı kural uygulanıyor — bilinmeyen bir `side` casusluk raporu sayılıyor, sessizce
 * düşürülmüyor. Aksi hâlde eski bir raporda düğmeler görünmezdi ve sebebi anlaşılmazdı.
 */
export function reportEnemyCoord(
  kind: string,
  /** ⚠️ `null` olabilir: ittifak mesajı gibi taraf kavramı olmayan türlerde sunucu boş bırakıyor. */
  side: string | null,
  origin: ReportCoord | null | undefined,
  target: ReportCoord | null | undefined,
): ReportCoord | null {
  const normalized = kind === 'spy_report' && side !== 'target' ? 'spy' : side;
  const end = ENEMY_END[`${kind}:${normalized}`];
  if (end == null) return null;
  return (end === 'target' ? target : origin) ?? null;
}
