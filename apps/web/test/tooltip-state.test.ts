/**
 * ⭐⭐ İPUCU DAVRANIŞI — olayların SIRASI üzerinden.
 *
 * ⚠️ Bu mantık iki kez geriledi ve ikisinde de tek bir olayı okuyarak fark edilemezdi:
 *   • 2026-08-04 — dokunmatik kapısı eklendi, mobilde TÜM ipuçları kör oldu.
 *   • 2026-08-06 — kapı geri alındı, ama dokunmatikte hâlâ hiç açılmıyordu.
 *   • 2026-08-08 — kullanıcı: *"telefonda tıkladığımda hiçbir şey gözükmüyor; uygulamayı arka
 *     plana alıp öne çektiğimde ancak öyle görülebiliyor."*
 *
 * Hata, olayların TEK TEK değil ARDIŞIK etkisinde yaşıyordu: bir dokunuşta `enter` ve `focus`
 * açıyor, hemen ardından gelen `click` kapatıyordu. Bu yüzden testler tek olay değil, tarayıcının
 * gerçekten ürettiği **tam diziyi** oynatıyor.
 */
import { describe, expect, it } from 'vitest';
import { TIP_INITIAL, tipReduce, type TipEvent, type TipState } from '../src/components/Tooltip.tsx';

/** Bir olay dizisini baştan oynatır ve son durumu döndürür. */
const run = (...events: TipEvent[]): TipState => events.reduce(tipReduce, TIP_INITIAL);

/** Tarayıcının tek bir DOKUNUŞTA ürettiği gerçek dizi (taklit fare olayları dâhil). */
const TAP: TipEvent[] = [
  { type: 'pointerdown', pointer: 'touch' },
  { type: 'enter', pointer: 'touch' },
  { type: 'focus' },
  { type: 'click' },
];

/** Farenin üstüne gelip tıklaması. */
const MOUSE_CLICK: TipEvent[] = [
  { type: 'enter', pointer: 'mouse' },
  { type: 'pointerdown', pointer: 'mouse' },
  { type: 'focus' },
  { type: 'click' },
];

describe('ipucu — dokunmatik', () => {
  it('⭐ TEK DOKUNUŞ ipucunu AÇAR (kullanıcının şikâyeti tam buydu)', () => {
    expect(run(...TAP).open).toBe(true);
  });

  it('⭐ İKİNCİ DOKUNUŞ kapatır (aç/kapa)', () => {
    expect(run(...TAP, ...TAP).open).toBe(false);
  });

  it('üçüncü dokunuş yeniden açar — durum takılı kalmıyor', () => {
    expect(run(...TAP, ...TAP, ...TAP).open).toBe(true);
  });

  it('⭐ başka bir yere dokunmak kapatır', () => {
    expect(run(...TAP, { type: 'outside' }).open).toBe(false);
  });

  /**
   * ⚠️ Uygulama arka plandan öne gelince tarayıcı YALNIZ taklit `enter`ı yeniden ateşliyor
   * (`click` gelmiyor). Eski kodda ipucunun "ancak öyle görünmesi" bu yüzdendi. Artık dokunmatik
   * `enter` hiçbir şey yapmıyor, yani o sahte açılış da yok.
   */
  it('⭐ öne gelince gelen taklit «enter» kendiliğinden AÇMAZ', () => {
    expect(run({ type: 'enter', pointer: 'touch' }).open).toBe(false);
  });

  it('dokunuşla gelen odak tek başına açmaz — «click» kararı bozulmasın', () => {
    expect(run({ type: 'pointerdown', pointer: 'touch' }, { type: 'focus' }).open).toBe(false);
  });
});

describe('ipucu — fare', () => {
  it('üstüne gelince açılır, çekilince kapanır', () => {
    expect(run({ type: 'enter', pointer: 'mouse' }).open).toBe(true);
    expect(run({ type: 'enter', pointer: 'mouse' }, { type: 'leave', pointer: 'mouse' }).open)
      .toBe(false);
  });

  /** Kullanıcı eyleme geçti → ipucunun işi bitti. Dokunmatikteki aç/kapa buraya SIZMAMALI. */
  it('⭐ tıklamak KAPATIR (aç/kapa değil)', () => {
    expect(run(...MOUSE_CLICK).open).toBe(false);
  });

  it('dokunuştan sonra fareye geçilirse davranış fareye döner', () => {
    // Önce dokunuşla aç, sonra fareyle tıkla → kapanmalı (aç/kapa yapıp yeniden açmamalı).
    expect(run(...TAP, ...MOUSE_CLICK).open).toBe(false);
  });
});

describe('ipucu — klavye', () => {
  it('odak açar, odak kaybı kapatır', () => {
    expect(run({ type: 'focus' }).open).toBe(true);
    expect(run({ type: 'focus' }, { type: 'blur' }).open).toBe(false);
  });
});
