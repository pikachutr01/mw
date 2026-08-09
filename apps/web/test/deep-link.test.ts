/**
 * ⭐ DERİN BAĞLANTI MANDALI (`lib/deep-link.ts`) — canlıda görülen sonsuz döngünün bekçisi.
 *
 * Kullanıcı 2026-08-09'da bildirdi: DM bildirimine tıklayınca `chat/conversations` ucuna
 * onlarca POST gidiyor ve React *"Maximum update depth exceeded"* atıp ekranı bozuyor.
 * Sebep, efektin **kendi eylemiyle kendi bağımlılığını** değiştirmesi ve adresi temizleyecek
 * `startTransition` güncellemesinin bu yüksek öncelikli döngü tarafından sürekli ertelenmesiydi.
 *
 * ⚠️ Bu dosya tarayıcı çalıştırmıyor — projede `jsdom`/`testing-library` yok. Onun yerine
 * **gözlenen dizinin kendisi** modelleniyor: "adres hâlâ `?dm=57` derken efekt tekrar tekrar
 * koşuyor". Eski mantık (yalnız `if (!dmParam) return`) bu dizide HER koşuda iş yapardı;
 * mandallı mantık bir kez yapar.
 */
import { describe, expect, it } from 'vitest';
import { deepLinkAction } from '../src/lib/deep-link.ts';

/** Efekti N kez koşturur, kaç kez iş yapıldığını sayar. Mandal bir `ref` gibi taşınır. */
function runEffect(steps: { value: string | null; ready: boolean }[]): {
  acts: string[]; latch: string | null;
} {
  let latch: string | null = null;
  const acts: string[] = [];
  for (const s of steps) {
    const step = deepLinkAction(s.value, s.ready, latch);
    latch = step.handled;
    if (step.act) acts.push(String(s.value));
  }
  return { acts, latch };
}

describe('deepLinkAction', () => {
  it('adres temizlenmeden efekt 20 kez koşsa bile iş BİR kez yapılır', () => {
    // Gözlenen dizi: `openChat` kimliği her mutasyon geçişinde değişiyor → efekt yeniden
    // koşuyor, ama `?dm=57` hâlâ adreste çünkü router güncellemesi bir geçiş (transition).
    const { acts } = runEffect(
      Array.from({ length: 20 }, () => ({ value: '57', ready: true })),
    );
    expect(acts).toEqual(['57']);
  });

  it('veri gelmeden parametre YANMAZ — mandal kapanmaz, iş veri gelince yapılır', () => {
    // `chats.data` gelmeden `known` çözülemez; o koşularda mandal kapanırsa bildirim ölür.
    const { acts } = runEffect([
      { value: '57', ready: false },
      { value: '57', ready: false },
      { value: '57', ready: true },
      { value: '57', ready: true },
    ]);
    expect(acts).toEqual(['57']);
  });

  it('adres temizlenince mandal sıfırlanır — aynı oyuncudan ikinci bildirim ölü tıklama olmaz', () => {
    const { acts } = runEffect([
      { value: '57', ready: true },   // birinci bildirim
      { value: '57', ready: true },   // adres henüz temizlenmedi (geçiş bekliyor)
      { value: null, ready: true },   // geçiş commit oldu, `?dm=` gitti
      { value: null, ready: true },
      { value: '57', ready: true },   // AYNI oyuncudan ikinci bildirim
      { value: '57', ready: true },
    ]);
    expect(acts).toEqual(['57', '57']);
  });

  it('başka bir oyuncuya geçiş mandalı devreder', () => {
    const { acts, latch } = runEffect([
      { value: '57', ready: true },
      { value: '57', ready: true },
      { value: '99', ready: true },   // ikinci bildirim, adres temizlenmeden geldi
      { value: '99', ready: true },
    ]);
    expect(acts).toEqual(['57', '99']);
    expect(latch).toBe('99');
  });

  it('parametre hiç yoksa iş yapılmaz ve mandal boş kalır', () => {
    const { acts, latch } = runEffect([
      { value: null, ready: true },
      { value: '', ready: true },     // `?dm=` (boş değer) da parametresiz sayılır
    ]);
    expect(acts).toEqual([]);
    expect(latch).toBeNull();
  });
});
