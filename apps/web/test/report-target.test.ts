/**
 * ⭐⭐ RAPORDAN SEFER — düğmenin hedefi hangi uç?
 *
 * Arıza sınıfı sinsi ve sessiz: hep `target`a bakan bir kod **saldırı raporunda doğru**
 * çalışır, şehir savunma raporunda oyuncuya kendi şehrine saldırma düğmesi sunar. Ekranda
 * hiçbir şey kırılmaz, sunucu isteği reddeder ve oyuncu "düğme bozuk" der. Bu dosya dört
 * rapor türünün dördünü de tek tek çakıyor.
 */
import { describe, expect, it } from 'vitest';
import { REPORT_MISSIONS, reportEnemyCoord, type ReportCoord } from '../src/lib/report-target.ts';

const benim: ReportCoord = { k: 1, d: 10, s: 3, owner: 'ben' };
const dusman: ReportCoord = { k: 2, d: 20, s: 7, owner: 'rakip' };

describe('reportEnemyCoord', () => {
  /**
   * ⚠️ SALDIRAN tarafta ordu benim şehrimden çıkıp karşıya gitti: `origin` benim,
   * `target` düşman. Düğme «tekrar saldır» anlamına geliyor.
   */
  it('⭐ saldırı raporunda düşman uç = target', () => {
    expect(reportEnemyCoord('battle_report', 'attacker', benim, dusman)).toEqual(dusman);
  });

  /**
   * ⚠️⚠️ ASIL VAKA: şehir savunma raporunda ordu BANA geldi, yani `target` benim şehrim.
   * Düğme `origin`i açmalı ki oyuncu saldırana **karşı saldırı** başlatabilsin.
   */
  it('⭐⭐ şehir savunma raporunda düşman uç = origin (karşı saldırı)', () => {
    expect(reportEnemyCoord('battle_report', 'defender', dusman, benim)).toEqual(dusman);
  });

  it('⭐ casusluk raporunda düşman uç = target', () => {
    expect(reportEnemyCoord('spy_report', 'spy', benim, dusman)).toEqual(dusman);
  });

  it('⭐⭐ casusluk önleme raporunda düşman uç = origin (casusu gönderen)', () => {
    expect(reportEnemyCoord('spy_report', 'target', dusman, benim)).toEqual(dusman);
  });

  /**
   * ⚠️ Eski kayıtlarda `spy_report`un `side`ı `'spy'` olmayabiliyor. Ekranın kendi kuralı
   * *"`target` değilse casusluk raporu"* ve burada da aynısı geçerli: bilinmeyen bir `side`
   * sessizce düğmeleri yok etmemeli, yoksa eski raporda sebebi anlaşılmayan bir eksiklik olur.
   */
  it('⭐ bilinmeyen spy_report side\'ı casusluk raporu sayılıyor', () => {
    expect(reportEnemyCoord('spy_report', 'sender', benim, dusman)).toEqual(dusman);
    expect(reportEnemyCoord('spy_report', '', benim, dusman)).toEqual(dusman);
  });

  /**
   * ⚠️ Düğme YOKSA `null`: nakliye yaptığın müttefikine «saldır» düğmesi sunmak yanlış bir
   * davet olurdu ve şehir kurma raporunda karşı taraf diye bir şey zaten yok.
   */
  it('⭐ düşman ucu olmayan türlerde null', () => {
    for (const kind of [
      'transport_report', 'support_report', 'found_city_report',
      'return_report', 'alliance_invite', 'alliance_message', 'system',
    ]) {
      expect(reportEnemyCoord(kind, 'owner', benim, dusman)).toBeNull();
    }
  });

  /** ⚠️ `side` null gelebilir (ittifak mesajı gibi taraf kavramı olmayan türler). */
  it('side null ise null', () => {
    expect(reportEnemyCoord('battle_report', null, benim, dusman)).toBeNull();
  });

  /**
   * ⚠️ Doğru tür ama koordinat YOK: boş koordinata şehir kurma dönüşü gibi vakalarda uç
   * gerçekten yok. `undefined` dönmemeli — çağıran `enemy ? ... : null` ile bakıyor ve
   * `undefined` de düşerdi ama tip sözleşmesi `null` diyor.
   */
  it('⭐ tür doğru ama uç yoksa null', () => {
    expect(reportEnemyCoord('battle_report', 'attacker', benim, null)).toBeNull();
    expect(reportEnemyCoord('battle_report', 'defender', undefined, benim)).toBeNull();
  });
});

describe('REPORT_MISSIONS', () => {
  /**
   * ⚠️ Tür adları SUNUCUNUN sefer türleriyle birebir olmak zorunda: bu dizeler adrese
   * (`?m=`) yazılıyor ve Dünya ekranı onları `TargetModal`ın `initialType`ına veriyor.
   * Yazım hatası sessizce "hiçbir form açılmadı"ya dönüşürdü.
   */
  it('⭐ tür adları sunucunun sefer türleri', () => {
    expect(REPORT_MISSIONS.map((r) => r.type)).toEqual(['attack', 'spy']);
  });

  it('her düğmenin ikonu ve etiketi var', () => {
    for (const r of REPORT_MISSIONS) {
      expect(r.icon).not.toBe('');
      expect(r.label).not.toBe('');
    }
  });
});
