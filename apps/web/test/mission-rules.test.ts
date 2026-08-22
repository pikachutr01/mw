/**
 * ⭐ GÖREV FORMUNUN POLİTİKA KÜMELERİ (`lib/mission-rules.ts`).
 *
 * ⚠️⚠️ **Bu testlerin varlık sebebi ölçülmüş İKİ kayma.** Kümeler sunucudaki bayraklarla elle
 * senkron ve ikisi de sessizce ayrıştı:
 *   • 2026-08-03 — sunucu kahramanı taşıyabiliyordu, form hiç kahraman seçtirmiyordu.
 *   • 2026-08-11 — sunucuda `allowEmptyArmy` destek/teleport için kapalıydı, buradaki küme de
 *     yalnız `found_city` diyordu. Oyuncu bildirdi: *"kendi şehirlerimiz arasında sadece
 *     kahramanı seçip göndermek mümkün değil."*
 *
 * ⚠️ Bu testler kümenin **sunucuyla aynı olduğunu ispatlayamaz** — o iş sunucu tarafındaki
 * `missions.test.ts` bekçilerinde (*«YALNIZ KAHRAMAN destek olarak gönderilebilir»* ve teleport
 * ikizi). Buradaki testler kümenin **kazara değişmemesini** sağlıyor: bir görev eklenip
 * çıkarılıyorsa bilinçli olsun ve karşılığı sunucuda da yazılsın.
 */
import { describe, expect, it } from 'vitest';
import {
  ARMY_OPTIONAL, attackHasEscort, HERO_MISSIONS, hasCrew, missionSentToast,
} from '../src/lib/mission-rules.ts';

describe('kahraman gönderilebilen görevler', () => {
  it('dört görev: saldırı · destek · teleport · şehir kurma', () => {
    expect([...HERO_MISSIONS].sort()).toEqual(['attack', 'found_city', 'support', 'teleport']);
  });

  it('⚠️ nakliye ve casusluk DIŞARIDA', () => {
    expect(HERO_MISSIONS.has('transport')).toBe(false);
    expect(HERO_MISSIONS.has('spy')).toBe(false);
  });
});

describe('ordusuz gidilebilen görevler', () => {
  it('⭐ kendi şehirleri arası taşımanın İKİ yolu da açık (destek + teleport)', () => {
    expect(ARMY_OPTIONAL.has('support')).toBe(true);
    expect(ARMY_OPTIONAL.has('teleport')).toBe(true);
    expect(ARMY_OPTIONAL.has('found_city')).toBe(true);
  });

  it('⚠️ saldırı ve nakliye DIŞARIDA — sunucu boş orduyu her hâlükârda reddediyor', () => {
    expect(ARMY_OPTIONAL.has('attack')).toBe(false);
    expect(ARMY_OPTIONAL.has('transport')).toBe(false);
    expect(ARMY_OPTIONAL.has('spy')).toBe(false);
  });

  it('ordusuz gidebilen her görev kahraman da taşıyabilmeli (yoksa küme anlamsız)', () => {
    for (const type of ARMY_OPTIONAL) {
      expect(HERO_MISSIONS.has(type), type).toBe(true);
    }
  });
});

describe('hasCrew — «gönder» düğmesinin kapısı', () => {
  it('birim varsa her görevde geçer', () => {
    for (const type of ['attack', 'transport', 'spy', 'support', 'teleport', 'found_city']) {
      expect(hasCrew(type, 1, 0), type).toBe(true);
    }
  });

  it('⭐ yalnız kahraman: destek · teleport · şehir kurmada GEÇER', () => {
    for (const type of ['support', 'teleport', 'found_city']) {
      expect(hasCrew(type, 0, 1), type).toBe(true);
    }
  });

  it('⚠️ yalnız kahraman: saldırı · nakliye · casuslukta GEÇMEZ', () => {
    for (const type of ['attack', 'transport', 'spy']) {
      expect(hasCrew(type, 0, 1), type).toBe(false);
    }
  });

  it('⚠️ ikisi de yoksa HİÇBİR görevde geçmez', () => {
    for (const type of ['attack', 'transport', 'spy', 'support', 'teleport', 'found_city']) {
      expect(hasCrew(type, 0, 0), type).toBe(false);
    }
  });
});

/**
 * ⭐⭐ YALNIZ YÜK ARABASI İLE SALDIRI BAŞLATILAMAZ (kullanıcı, 2026-08-21: *"Artık bir saldırı
 * için yalnızca yük arabası seçilirse görev başlatılamasın… Ama sadece saldırı için geçerli,
 * nakliye, destek gibi görevlerde sadece yük arabası seçilebilir."*).
 *
 * ⚠️ Sunucudaki kapının aynası (`mission.service.ts` · `sendAttack` → `no_units`). İkisi
 * ayrışırsa ya düğme boşuna pasif kalır (sessiz) ya da form sunucunun reddedeceği bir seferi
 * gönderir (gürültülü).
 */
describe('attackHasEscort — yalnız araba ile saldırı yasağı', () => {
  it('⭐⭐ yalnız Yük Arabası ile saldırı GEÇMEZ', () => {
    expect(attackHasEscort('attack', ['cargo_wagon'])).toBe(false);
  });

  /**
   * ⚠️⚠️ **GNOM GEÇER ve bu bilinçli.** Kural ilk yazımda `NONCOMBAT` kümesine bağlanmıştı,
   * yani gnom da kapıya takılıyordu. Kullanıcı düzeltti (2026-08-22): *"Savaşmayan birim olsa
   * bile o bir savaşçı sonuçta."* Test o kararı kilitliyor — biri kümeyi tekrar `NONCOMBAT`e
   * bağlarsa burası düşer.
   */
  it('⭐⭐ yalnız Gnom ile saldırı GEÇER (gnom bir asker)', () => {
    expect(attackHasEscort('attack', ['gnome'])).toBe(true);
    expect(attackHasEscort('attack', ['gnome', 'cargo_wagon'])).toBe(true);
  });

  it('yanında bir savaşçı varsa GEÇER', () => {
    expect(attackHasEscort('attack', ['cargo_wagon', 'dwarf'])).toBe(true);
  });

  /* ⚠️⚠️ Kapı YALNIZ saldırıda: nakliye · destek · şehir kurmada tek başına araba MEŞRU. */
  it('⭐⭐ saldırı DIŞINDAKİ görevlerde araba tek başına serbest', () => {
    for (const type of ['transport', 'support', 'found_city', 'teleport']) {
      expect(attackHasEscort(type, ['cargo_wagon']), type).toBe(true);
    }
  });
});

/**
 * ⭐⭐ EMİR ONAYI METNİ — mobil karşılığıyla BİREBİR aynı cümleler olmalı
 * (`apps/mobile/lib/features/world/mission_rules.dart` · `missionSentToast`).
 *
 * ⚠️ Arıza sınıfı sessiz: iki istemcide iki farklı cümle yazmak hiçbir yerde hata üretmez,
 * yalnız aynı oyun iki dille konuşur. Bu yüzden cümleler burada birebir yazılı — mobil
 * tarafta değişen bir kelime, bu testi kırmasa da eşleşmeyi gözle görülür kılıyor.
 */
describe('missionSentToast', () => {
  it('⭐ her sefer türünün kendi cümlesi var', () => {
    expect(missionSentToast('attack')).toBe('Saldırın yola çıktı');
    expect(missionSentToast('spy')).toBe('Casusun yola çıktı');
    expect(missionSentToast('transport')).toBe('Nakliyen yola çıktı');
    expect(missionSentToast('support')).toBe('Desteğin yola çıktı');
    expect(missionSentToast('found_city')).toBe('Şehir kurma seferin yola çıktı');
    expect(missionSentToast('teleport')).toBe('Teleport başladı');
  });

  /** ⚠️ Sunucuya yeni bir görev tipi eklendiğinde toast BOŞ kalmamalı. */
  it('⭐ bilinmeyen tür genel cümleye düşüyor, boş kalmıyor', () => {
    expect(missionSentToast('ritual')).toBe('Sefer başlatıldı');
    expect(missionSentToast('')).toBe('Sefer başlatıldı');
  });

  /** ⚠️ Oyuncuya görünen metinde tire/çizgi YASAK (depo yazım kuralı). */
  it('⭐ hiçbir cümlede tire yok', () => {
    for (const t of ['attack', 'spy', 'transport', 'support', 'found_city', 'teleport', 'x']) {
      expect(missionSentToast(t)).not.toMatch(/[-–—]/);
    }
  });
});
