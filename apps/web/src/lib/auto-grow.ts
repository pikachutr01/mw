/**
 * ⭐ KENDİLİĞİNDEN BÜYÜYEN MESAJ KUTUSU (kullanıcı, 2026-08-11 — *"özellikle mobil cihazlarda"*).
 *
 * ⚠️ Üç sohbetin composer'ı da `rows={1}` + `resize-none` ile duruyordu, yani kutu **hiç
 * büyümüyordu**: uzun mesaj tek satırlık pencerenin içinde kayıyor ve oyuncu yazdığının
 * yalnız son satırını görebiliyordu. Masaüstünde katlanılabilir, telefonda değil — dokunmatik
 * klavye ekranın yarısını kaplarken metnin görünmemesi yazmayı fiilen kör bir işe çeviriyor.
 * `max-h-24` sınıfı zaten oradaydı ama **hiçbir zaman devreye girmiyordu**: yüksekliği `rows`
 * belirlediği için büyüme diye bir şey yoktu ki tavana çarpsın.
 *
 * ⚠️ Ölçüm ve yazma DOM'a dokunuyor; test edilebilir olması için karar (`autoGrowHeight`) saf
 * bir fonksiyona ayrıldı — `mission-rules.ts` / `chat-moderation.ts` ile aynı gerekçe. Web
 * paketinde jsdom yok, dolayısıyla test edilebilen tek parça matematiktir.
 */
import { useLayoutEffect } from 'react';

/** Kutunun büyüyebileceği son yükseklik (px) — yaklaşık 4 satır. */
export const CHAT_INPUT_MAX_PX = 96;

export interface AutoGrowResult {
  /** `style.height` olarak yazılacak piksel değeri. */
  height: number;
  /** Tavana çarpıldıysa `auto` (içeride kaydır), çarpılmadıysa `hidden`. */
  overflowY: 'auto' | 'hidden';
}

/**
 * İçeriğin gerektirdiği yüksekliği tavanla sınırlar.
 *
 * ⚠️ `borderY` (üst+alt kenarlık) AYRICA ekleniyor. Tailwind preflight her şeye
 * `box-sizing: border-box` veriyor: `height` kenarlığı DA kapsıyor, oysa `scrollHeight`
 * kapsamıyor. Eklemezsek kutu her zaman 2px kısa kalır ve içerik tam sığdığı hâlde **kalıcı
 * bir kaydırma çubuğu** belirir — büyüme çalışıyor ama bozuk görünürdü.
 */
export function autoGrowHeight(
  scrollHeight: number, borderY: number, maxPx: number = CHAT_INPUT_MAX_PX,
): AutoGrowResult {
  const istenen = Math.max(0, scrollHeight) + Math.max(0, borderY);
  return istenen > maxPx
    ? { height: maxPx, overflowY: 'auto' }
    : { height: istenen, overflowY: 'hidden' };
}

/**
 * ⭐ Kaydırma kabı dibinde miydi? (`tolerans` px'lik pay ile)
 *
 * ⚠️ Pay ŞART: alt piksel yükseklikler ve mobil tarayıcıların esneme (rubber-band) davranışı
 * yüzünden «tam dip» hiçbir zaman tam 0 çıkmıyor; katı eşitlik arayan bir kontrol dipte
 * olduğunu asla kabul etmezdi.
 */
export function isAtBottom(
  scrollHeight: number, scrollTop: number, clientHeight: number, tolerans = 8,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= tolerans;
}

/**
 * `value` her değiştiğinde kutuyu içeriğine göre yeniden boyutlandırır.
 *
 * ⭐ `scroller` verilirse: kutu büyürken **dipte kalınır**. Gerekçe bir yan etki:
 * composer `shrink-0`, liste `flex-1` — kutu 40px büyüyünce listenin yüksekliği 40px azalıyor
 * ama `scrollTop` sabit kalıyor, yani son mesaj tam da oyuncu uzun bir cevap yazarken görüş
 * alanından kayıyor. Cevabı yazdığın mesajın gözden kaybolması, büyüme özelliğinin kendisini
 * bir kazanç olmaktan çıkarırdı.
 *
 * ⚠️ Ölçüm **yeniden boyutlandırmadan ÖNCE** yapılıyor: sonra bakılsaydı kabın küçülmüş hâli
 * okunur ve oyuncu zaten dipteyken bile «dipte değil» sonucu çıkardı.
 *
 * ⚠️ **`useLayoutEffect`, `useEffect` DEĞİL**: boyutlandırma boyanmadan önce olmalı, yoksa
 * her tuş vuruşunda kutu bir kare eski yükseklikte çizilip sonra zıplar.
 *
 * ⚠️ Ölçüm sırası önemli ve üç adımı da atlanamaz:
 *   1. `overflowY = 'hidden'` — masaüstünde görünür bir kaydırma çubuğu yatay yer kaplar,
 *      metin daha erken sarar ve `scrollHeight` OLDUĞUNDAN BÜYÜK ölçülür (kutu her ölçümde
 *      biraz daha büyüyen bir geri besleme döngüsüne girer).
 *   2. `height = 'auto'` — küçülme ancak böyle mümkün: eski yükseklik dururken `scrollHeight`
 *      ondan küçük olamaz, yani kutu bir kez büyüyünce bir daha ASLA küçülmezdi (mesaj
 *      gönderildikten sonra boş kutu 4 satır olarak kalırdı).
 *   3. Ölç ve yaz.
 */
export function useAutoGrow(
  ref: { current: HTMLTextAreaElement | null },
  value: string,
  scroller?: { current: HTMLElement | null },
  maxPx: number = CHAT_INPUT_MAX_PX,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sc = scroller?.current ?? null;
    const dipteydi = sc != null && isAtBottom(sc.scrollHeight, sc.scrollTop, sc.clientHeight);

    el.style.overflowY = 'hidden';
    el.style.height = 'auto';
    const { height, overflowY } = autoGrowHeight(
      el.scrollHeight, el.offsetHeight - el.clientHeight, maxPx,
    );
    el.style.height = `${height}px`;
    el.style.overflowY = overflowY;

    if (sc != null && dipteydi) sc.scrollTop = sc.scrollHeight;
  }, [ref, value, scroller, maxPx]);
}
