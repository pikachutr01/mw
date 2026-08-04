/**
 * ⭐ HAREKET RENGİ (kullanıcı, 2026-08-04: *"giden destekte turuncu, gelen destekte kırmızı
 * renk görünüyor"*).
 *
 * Kullanıcı dokuz vakayı tek tek saydı; bu dosya o dokuzunu birebir çakıyor. Renk kuralı tek
 * bir soruya cevap veriyor — **bu bana bir tehdit mi?** — ve testin işi o sorunun cevabının
 * yönle karışmamasını garantilemek: eski kod "gelen" ile "tehdit"i eşitliyordu ve müttefikin
 * gönderdiği destek, saldırıyla aynı kırmızıyla yanıyordu.
 *
 * ⚠️ Bu, `apps/web`teki İLK test dosyası. Uygulama epeyce saf mantık biriktirdi (tercihler,
 * sefer yardımcıları, biçimlendirme) ve hiç test koşucusu yoktu; dokuz vakalık bir kuralı
 * tarayıcıdan doğrulamak mümkün değildi (dokuz farklı hareket tipini elde üretmek gerekirdi).
 */
import { describe, expect, it } from 'vitest';
import { movementGlow, movementTone } from '../src/components/movements.tsx';
import type { Movement } from '../src/lib/queries.ts';

/** Testin ilgilendiği üç alan dışındakiler renk kararına GİRMİYOR; o yüzden kabaca dolduruluyor. */
const mv = (type: string, direction: Movement['direction']): Movement => ({
  key: 'k', id: 1, type, direction, icon: type, cityId: 1,
  startedAt: '2026-08-04T00:00:00Z', executeAt: '2026-08-04T01:00:00Z',
  origin: null, originPlayer: null, target: null, targetPlayer: null,
  returnOf: null, canceled: false, canCancel: false,
} as unknown as Movement);

describe('kullanıcının saydığı dokuz vaka', () => {
  it('giden destek YEŞİL, gelen destek TURUNCU', () => {
    expect(movementTone(mv('support', 'out'))).toBe('text-success');
    expect(movementTone(mv('support', 'in'))).toBe('text-warning');
  });

  it('giden ve dönen saldırı YEŞİL, gelen saldırı KIRMIZI', () => {
    expect(movementTone(mv('attack', 'out'))).toBe('text-success');
    expect(movementTone(mv('attack', 'own'))).toBe('text-success');
    expect(movementTone(mv('attack', 'in'))).toBe('text-danger');
  });

  it('giden ve dönen casusluk YEŞİL, gelen casusluk KIRMIZI', () => {
    expect(movementTone(mv('spy', 'out'))).toBe('text-success');
    expect(movementTone(mv('spy', 'own'))).toBe('text-success');
    expect(movementTone(mv('spy', 'in'))).toBe('text-danger');
  });

  it('giden ve dönen nakliye YEŞİL, gelen nakliye TURUNCU', () => {
    expect(movementTone(mv('transport', 'out'))).toBe('text-success');
    expect(movementTone(mv('transport', 'own'))).toBe('text-success');
    expect(movementTone(mv('transport', 'in'))).toBe('text-warning');
  });

  /** Kullanıcı: *"mağara yıkımı sonrası şehre gelen ordu da tek yönlü destek olduğu için"*. */
  it('mağaradan kaçış TURUNCU — tek yönlü destek', () => {
    expect(movementTone(mv('cave_return', 'in'))).toBe('text-warning');
  });
});

describe('kuralın kenarları', () => {
  /**
   * ⚠️ Koordinatıma gelen `found_city` sunucuda `attack` olarak MASKELENİYOR (§13.6.5) ve
   * buraya maskelenmiş hâliyle geliyor. Renk de kırmızı çıkmalı: oyuncunun gördüğü şey bir
   * saldırı ve maske renkte delinmemeli.
   */
  it('maskelenmiş şehir kurma saldırı gibi kırmızı yanar', () => {
    expect(movementTone(mv('attack', 'in'))).toBe('text-danger');
  });

  /** ⚠️ Tanınmayan bir tür "gelen" ise DOSTANE varsayılıyor: yeni bir görev tipi eklendiğinde
   *  oyuncuyu sebepsiz korkutmak, sessizce yeşil göstermekten daha kötü bir varsayılan. */
  it('bilinmeyen gelen tür turuncu', () => {
    expect(movementTone(mv('teleport', 'in'))).toBe('text-warning');
  });

  it('şehir içi mağara işleri yeşil', () => {
    expect(movementTone(mv('cave_store', 'own'))).toBe('text-success');
    expect(movementTone(mv('cave_withdraw', 'own'))).toBe('text-success');
  });
});

describe('şerit parıltısı aynı kuralı izler', () => {
  /** ⚠️ Liste ile şeridin ayrışması, oyuncuya iki farklı hikâye anlatmak olurdu. */
  it('gelen tehdit kırmızı, gelen dost turuncu, kendi hareketim parıltısız', () => {
    expect(movementGlow(mv('attack', 'in'))).toContain('danger');
    expect(movementGlow(mv('support', 'in'))).toContain('warning');
    expect(movementGlow(mv('attack', 'out'))).toBe('');
    expect(movementGlow(mv('attack', 'own'))).toBe('');
  });
});
