/**
 * ⭐ MÜTTEFİK ROZETİ — Dünya listesinde aynı ittifaktan oyuncuyu ilk bakışta ayırır
 * (kullanıcı 2026-08-07).
 *
 * ⚠️ **Yeni bilgi SIZDIRMAZ.** İttifak adı zaten aynı satırda, kendi sütununda yazıyor; rozet
 * yalnız "bu benimkiyle aynı" karşılaştırmasını gözden alıp göze veriyor. Bu yüzden §13.16.5
 * gizlilik kuralıyla çelişmiyor — asker/kaynak sızdıran hiçbir yanı yok.
 *
 * ⚠️ Rozet **İttifak sütununun yerine geçmez**: o sütun mobilde gizli (`hidden sm:table-cell`)
 * ve zaten *hangi* ittifak sorusunu cevaplıyor. Rozetin cevapladığı soru başka: *"bu adama
 * saldırabilir miyim?"* — ve o soru asıl mobilde sorulacak, sütunun görünmediği yerde.
 */
import { useState } from 'react';
import { Tooltip } from './Tooltip.tsx';

/**
 * ⚠️ Tetikleyici **`<button>`**, düz `<span>` değil — `MeritBadge`teki aynı gerekçe: `Tooltip`
 * `hover` + `focus` dinliyor, dokunmatikte `hover` YOKTUR ve odak alamayan bir öge ipucuyu
 * mobilde tamamen kör ederdi.
 * ⚠️ `stopPropagation`: rozet tıklanabilir bir tablo satırının içinde duruyor; olmasaydı ipucu
 * okumak isteyen her dokunuş görev modalını açardı.
 */
export function AllyBadge({ size = 16 }: { size?: number }) {
  const [broken, setBroken] = useState(false);
  // Görsel yüklenemezse hiç yer kaplamaz: kırık resim simgesi dar satırda gürültünün daniskası
  // ve rozetin taşıdığı bilgi zaten İttifak sütununda yazılı — kayıp telafi edilebilir.
  if (broken) return null;

  return (
    <Tooltip label={<span className="text-accent">İttifak üyesi</span>} placement="top">
      <button
        type="button"
        aria-label="İttifak üyesi"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex shrink-0 cursor-help items-center align-middle"
      >
        <img
          src="/assets/ui/alliance.png"
          alt=""
          width={size}
          height={size}
          onError={() => setBroken(true)}
          className="icon-shadow block shrink-0 object-contain"
          style={{ width: size, height: size }}
        />
      </button>
    </Tooltip>
  );
}
