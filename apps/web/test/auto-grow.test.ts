/**
 * ⭐ KENDİLİĞİNDEN BÜYÜYEN MESAJ KUTUSU (`lib/auto-grow.ts`).
 *
 * ⚠️ Web paketinde jsdom yok — `useAutoGrow`un DOM'a dokunan kısmı burada ölçülemez. Test
 * edilen şey **kararın kendisi**: hangi yükseklik, hangi taşma. Hatanın saklanabileceği iki
 * yer de tam olarak burası (kenarlık payı ve tavana çarpma), o yüzden ayrılmaya değdi.
 */
import { describe, expect, it } from 'vitest';
import { autoGrowHeight, CHAT_INPUT_MAX_PX, isAtBottom } from '../src/lib/auto-grow.ts';

/** Tek satırlık bir kutu: 20px satır + 16px dolgu (p-2) = 36px; kenarlık 1+1. */
const TEK_SATIR = 36;
const KENARLIK = 2;

describe('autoGrowHeight', () => {
  it('tek satır: içerik kadar büyür, kaydırma çubuğu ÇIKMAZ', () => {
    expect(autoGrowHeight(TEK_SATIR, KENARLIK)).toEqual({ height: 38, overflowY: 'hidden' });
  });

  it('metin uzadıkça yükseklik büyür (kullanıcının istediği davranış)', () => {
    const tek = autoGrowHeight(TEK_SATIR, KENARLIK).height;
    const iki = autoGrowHeight(TEK_SATIR + 20, KENARLIK).height;
    const uc = autoGrowHeight(TEK_SATIR + 40, KENARLIK).height;
    expect(iki).toBeGreaterThan(tek);
    expect(uc).toBeGreaterThan(iki);
    expect(uc).toBeLessThanOrEqual(CHAT_INPUT_MAX_PX);
  });

  /**
   * ⚠️⚠️ KENARLIK PAYI — bu satır düşerse hata **sessiz** olur: kutu büyümeye devam eder ama
   * içerik tam sığdığı hâlde 2px eksik kalır ve KALICI bir kaydırma çubuğu belirir.
   */
  it('⭐ kenarlık yüksekliğe EKLENİR (box-sizing: border-box)', () => {
    expect(autoGrowHeight(TEK_SATIR, 0).height).toBe(36);
    expect(autoGrowHeight(TEK_SATIR, 2).height).toBe(38);
    expect(autoGrowHeight(TEK_SATIR, 6).height).toBe(42);
  });

  it('⭐ tavana çarpınca büyüme durur ve kaydırma DEVREYE girer', () => {
    const uzun = autoGrowHeight(400, KENARLIK);
    expect(uzun.height).toBe(CHAT_INPUT_MAX_PX);
    expect(uzun.overflowY).toBe('auto');
  });

  it('tam tavan sınırında henüz kaydırma yok, bir piksel fazlasında var', () => {
    expect(autoGrowHeight(CHAT_INPUT_MAX_PX, 0)).toEqual({
      height: CHAT_INPUT_MAX_PX, overflowY: 'hidden',
    });
    expect(autoGrowHeight(CHAT_INPUT_MAX_PX + 1, 0)).toEqual({
      height: CHAT_INPUT_MAX_PX, overflowY: 'auto',
    });
  });

  it('⚠️ tavan sohbete makul: ~4 satır — mesaj listesini yutmamalı', () => {
    expect(CHAT_INPUT_MAX_PX).toBeGreaterThanOrEqual(TEK_SATIR * 2);
    expect(CHAT_INPUT_MAX_PX).toBeLessThanOrEqual(TEK_SATIR * 4);
  });

  it('saçma ölçüler negatife düşmez', () => {
    expect(autoGrowHeight(-10, -4).height).toBe(0);
  });

  /** Çağıran kendi tavanını verebilmeli (kutu başka bir yerde kullanılırsa). */
  it('tavan parametreyle değişebilir', () => {
    expect(autoGrowHeight(200, 0, 60)).toEqual({ height: 60, overflowY: 'auto' });
  });
});

/**
 * ⭐ Kutu büyürken listenin dipte kalması. ⚠️ Bu olmadan büyüme özelliği kendi kazancını yer:
 * composer 40px büyüyünce liste 40px kısalıyor, `scrollTop` sabit kaldığı için **cevabını
 * yazdığın mesaj** görüş alanından kayıyor.
 */
describe('isAtBottom', () => {
  it('tam dipte true, tepede false', () => {
    expect(isAtBottom(500, 300, 200)).toBe(true);
    expect(isAtBottom(500, 0, 200)).toBe(false);
  });

  /**
   * ⚠️ PAY ŞART: alt piksel yükseklikler ve mobil esneme davranışı yüzünden «tam dip» hiçbir
   * zaman tam 0 çıkmıyor. Katı eşitlik arayan bir kontrol dipte olduğunu ASLA kabul etmezdi —
   * yani dipte kalma özelliği hiç çalışmazdı ve bu sessiz bir hata olurdu.
   */
  it('⭐ birkaç piksellik sapma hâlâ «dipte» sayılır (pay 8px)', () => {
    expect(isAtBottom(500, 295, 200)).toBe(true);      // 5px yukarıda → dipte
    expect(isAtBottom(500, 292, 200)).toBe(true);      // 8px, tam sınır → dipte
    expect(isAtBottom(500, 291, 200)).toBe(false);     // 9px, sınırın ötesi → değil
  });

  it('pay parametreyle değişebilir', () => {
    expect(isAtBottom(500, 250, 200, 50)).toBe(true);
    expect(isAtBottom(500, 250, 200, 10)).toBe(false);
  });

  it('içerik kaba sığıyorsa (kaydırma yoksa) daima dipte sayılır', () => {
    expect(isAtBottom(200, 0, 200)).toBe(true);
  });
});
