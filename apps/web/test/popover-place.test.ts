/**
 * ⭐ POPOVER KONUMU — kullanıcının açık şartı: *"ekrandan taşmayacak şekilde kendini
 * konumlandıracak."*
 *
 * ⚠️ Ölçülen şey "güzel duruyor mu" değil, **hiçbir kenardan taşmıyor mu**. Bu yüzden testlerin
 * çoğu tek bir değişmezi farklı ekran/çıpa bileşimlerinde tekrar sınıyor: kutu tamamen görünür
 * alanda kalmalı. Tek tek koordinat beklentisi yazmak, sabitleri değiştirilemez kılardı.
 */
import { describe, expect, it } from 'vitest';
import { placePopover, type Rect, type Viewport } from '../src/components/Popover.tsx';

const PHONE: Viewport = { width: 360, height: 640 };
const DESKTOP: Viewport = { width: 1440, height: 900 };

const anchor = (left: number, top: number, width = 16, height = 16): Rect =>
  ({ left, top, bottom: top + height, width });

/** Kutunun dört kenarı da görünür alanın içinde mi? */
function icerideMi(
  box: { top: number; left: number; width: number }, h: number, vp: Viewport,
): boolean {
  return box.left >= 0 && box.top >= 0
    && box.left + box.width <= vp.width
    && box.top + h <= vp.height;
}

describe('popover konumu — taşma', () => {
  it('⭐ dar ekranda kutu DARALIR, yalnız kaydırılmaz', () => {
    const box = placePopover(anchor(10, 100), 120, PHONE);
    expect(box.width).toBeLessThanOrEqual(PHONE.width);
    expect(icerideMi(box, 120, PHONE)).toBe(true);
  });

  it('⭐ sağ kenardaki tetikleyicide sağdan taşmaz', () => {
    const box = placePopover(anchor(PHONE.width - 20, 100), 120, PHONE);
    expect(icerideMi(box, 120, PHONE)).toBe(true);
  });

  it('⭐ sol kenardaki tetikleyicide soldan taşmaz', () => {
    const box = placePopover(anchor(0, 100), 120, PHONE);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(icerideMi(box, 120, PHONE)).toBe(true);
  });

  /**
   * ⚠️ ASIL İNCE NOKTA: alta sığmayan kutuyu yalnız kelepçelemek onu tetikleyicinin ÜSTÜNE
   * bindirir ve neyi anlattığı görünmez olur. Doğru davranış **taraf değiştirmek**.
   */
  it('⭐ sayfanın altındaki tetikleyicide kutu ÜSTE geçer, çıpanın üstüne binmez', () => {
    const a = anchor(180, PHONE.height - 40);
    const box = placePopover(a, 200, PHONE);
    expect(icerideMi(box, 200, PHONE)).toBe(true);
    // Kutunun ALT kenarı, tetikleyicinin ÜST kenarının yukarısında kalmalı.
    expect(box.top + 200).toBeLessThanOrEqual(a.top);
  });

  it('sayfanın üstündeki tetikleyicide kutu ALTA açılır', () => {
    const a = anchor(180, 20);
    const box = placePopover(a, 200, PHONE);
    expect(box.top).toBeGreaterThanOrEqual(a.bottom);
  });

  /**
   * ⚠️ Ne alta ne üste sığan durum (çok kısa ekran / çok uzun metin). Burada mükemmel bir yer
   * yok; beklenen şey kutunun **üst kenardan taşmaması** — okuma yukarıdan başlasın, taşan
   * kısım aşağıda kalsın. Sessizce eksi bir `top` üretmek en kötü sonuç olurdu.
   */
  it('hiçbir tarafa sığmazsa üst kenardan taşmaz', () => {
    const kisa: Viewport = { width: 360, height: 300 };
    const box = placePopover(anchor(180, 140), 400, kisa);
    expect(box.top).toBeGreaterThanOrEqual(0);
  });

  it('geniş ekranda kutu tetikleyiciyle ortalanır', () => {
    const a = anchor(700, 300);
    const box = placePopover(a, 120, DESKTOP);
    const merkezFark = Math.abs((box.left + box.width / 2) - (a.left + a.width / 2));
    expect(merkezFark).toBeLessThan(1);
    expect(icerideMi(box, 120, DESKTOP)).toBe(true);
  });
});
