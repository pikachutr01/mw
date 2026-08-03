/**
 * ⭐ ASKERÎ ÜNVAN ROZETİ — Subay · Komutan · Başkomutan · Mareşal.
 *
 * ⚠️ **NEREDE KULLANILABİLİR:** İttifak sayfası ve oyuncunun kendi Genel Durum'u. BAŞKA HİÇBİR
 * YERDE. Kullanıcının gerekçesi stratejik: *"Bunu gören düşmanlar yakın zamanda büyük bir
 * savaştan çıktığını anlar ve sistematik olarak saldırı yaparlar."* Rozet bir başarı
 * göstergesi ama aynı zamanda "ordusu yeni kırıldı" istihbaratı. Sunucu da bunu uyguluyor:
 * `merit_tier` yalnız `/alliance` ve `/overview` yanıtlarında var (Dünya/Sıralama/Arama'da yok).
 */
import { MERIT_BY_TIER } from '@mobilwar/catalog';
import { useState } from 'react';
import { Tooltip } from './Tooltip.tsx';

/**
 * Satır arka planı — **tek renk ailesinde artan yoğunluk**, dört ayrı renk değil.
 *
 * ⚠️ Dört farklı renk (mavi/yeşil/turuncu/kırmızı) denemeye değmez: sıra bilgisini taşımaz
 * (hangi renk daha büyük?) ve renk körü oyuncuda tamamen çöker. Altın tonu hem madalyanın
 * doğal rengi hem de sıralı okunuyor — koyulaştıkça yükseliyor. Sol kenar çizgisi ikinci,
 * renkten bağımsız bir işaret: renk göremeyen de kalınlaşan şeridi görür.
 */
export const MERIT_ROW_CLASS: Readonly<Record<number, string>> = {
  1: 'bg-gold/[0.06] border-l-2 border-l-gold/30',
  2: 'bg-gold/[0.11] border-l-2 border-l-gold/50',
  3: 'bg-gold/[0.17] border-l-2 border-l-gold/75',
  4: 'bg-gold/25 border-l-[3px] border-l-gold',
};

/** "12 gün" · "6 saat" — kalan süre, kabaca. Rozetin ne zaman söneceği saniye hassasiyeti istemez. */
export function meritRemaining(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - Date.now();
  if (!(ms > 0)) return null;
  const gun = Math.floor(ms / 86_400_000);
  if (gun >= 1) return `${gun} gün`;
  const saat = Math.max(1, Math.floor(ms / 3_600_000));
  return `${saat} saat`;
}

/**
 * ⚠️ Kalan süre **gerçek saatle** hesaplanıyor, oyun saatiyle değil — `expiresAt` sunucudan
 * oyun saatinde geliyor ama ikisi ancak dünya bakımdayken ayrışır ve o sırada zaten hiçbir
 * şey ilerlemiyor. Saniye hassasiyeti olmayan bir "12 gün" için oyun saati çıpası taşımak
 * (`gameNow()`) bu bileşene bir bağlam bağımlılığı eklerdi.
 *
 * ⚠️ Tetikleyici bir **`<button>`** (kullanıcı: *"üzerine tıklayınca tooltip"*). `Tooltip`
 * `hover` + `focus` dinliyor; dokunmatikte `hover` YOKTUR, dolayısıyla odaklanabilir bir öge
 * olmasa mobilde ipucu hiç açılmazdı. Düz bir `<span>` odak almaz.
 */
export function MeritBadge({ tier, expiresAt, size = 20 }: {
  tier: number | null;
  expiresAt?: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  if (tier == null) return null;
  const def = MERIT_BY_TIER[tier];
  if (!def) return null;

  const kalan = meritRemaining(expiresAt ?? null);
  const label = (
    <>
      <span className="display block font-semibold text-gold">{def.name}</span>
      {kalan ? <span className="block text-muted">{kalan} kaldı</span> : null}
    </>
  );

  return (
    <Tooltip label={label} placement="top">
      <button type="button" aria-label={kalan ? `${def.name} · ${kalan} kaldı` : def.name}
        className="inline-flex shrink-0 cursor-help items-center align-middle">
        {/* Görsel yoksa ADI yazılır: rozetin varlığı bilgidir, kırık resim simgesi değil. */}
        {broken ? (
          <span className="text-[11px] font-semibold text-gold">{def.name}</span>
        ) : (
          <img src={`/assets/ranks/${def.id}.png`} alt=""
            width={size} height={size}
            onError={() => setBroken(true)}
            className="icon-shadow block shrink-0 object-contain"
            style={{ width: size, height: size }} />
        )}
      </button>
    </Tooltip>
  );
}
