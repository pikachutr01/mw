/**
 * ⭐ SAVAŞ MOTORU SABİTLERİ PANELDEN (admin Faz 4).
 *
 * ⚠️ **En önemli vaka regresyon kanıtı**: hiçbir ayar değiştirilmemişken motor çıktısı
 * **bit-bit** eskisiyle aynı kalmalı. Motor sabitlerini yapılandırılabilir yapmanın en büyük
 * riski, "varsayılan değerlerden yeniden kurulmuş" bir config ile "varsayılanın kendisi"
 * arasında sessiz bir kayma doğmasıdır — bir alan eklenir, eşlemeye eklenmeyi unutulur ve
 * motor onu `undefined` görür. Buradaki ilk grup o riski kapatıyor.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS, applySettings } from '@mobilwar/settings';
import { DEFAULT_COMBAT_CONFIG, mergeCombatConfig, simulate } from '@mobilwar/engine';
import type { DbHandle } from '../src/db/client.ts';
import { MAPPED_KEYS, combatOverrides, lootOverrides } from '../src/settings/combat.ts';
import { SettingsService } from '../src/settings/settings.service.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let svc: SettingsService;
let worldId: number;

/** Sabit kurgulu, sabit seed'li savaş — tek değişken motor ayarları. */
const BATTLE = {
  attacker: { counts: { dwarf: 4000, elf: 1200, ogre: 300 }, tech: { blacksmith: 5 } },
  defender: {
    counts: { dwarf: 3000, archer_tower: 40, wall: 6, magic_shield: 4 },
    tech: { masonry: 4 },
  },
  seed: 'faz4-regresyon',
} as const;

beforeAll(async () => { h = await setupTestDb(); }, 60_000);
afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await h.db.execute(sql`DELETE FROM settings`);
  /**
   * ⚠️ Revizyonlar da siliniyor: tablo ekleme-yalnız ve dünya 0 katmanı TÜM dünyaları
   * etkiliyor → önceki koşuların dünya 0 revizyonları "hiç ayar yok" vakasını kirletiyordu
   * (ilk yazımda test `null` beklerken 49 gördü). Üretimde silme YOK; yalnız test yalıtımı.
   */
  await h.db.execute(sql`DELETE FROM settings_revisions`);
  svc = new SettingsService(h.db);
  await svc.load();
});

/* ═══ Regresyon — fazın en önemli iddiası ═══════════════════════════════════ */

describe('varsayılan davranış', () => {
  /**
   * ⭐ Hiç ayar yoksa `combat()` **`undefined`** döner. `simulate(input, undefined)` motorun
   * kendi `DEFAULT_COMBAT_CONFIG`ini kullanır → sonuç eski koddan ayırt edilemez.
   */
  it('hiçbir ayar değişmemişken override ÜRETİLMEZ', () => {
    expect(svc.combat(worldId)).toBeUndefined();
    expect(svc.loot(worldId)).toBeUndefined();
  });

  it('override\'sız savaş, motorun varsayılanıyla BİT-BİT aynı', () => {
    const withDefault = simulate(BATTLE);
    const viaSettings = simulate(BATTLE, svc.combat(worldId));
    expect(JSON.stringify(viaSettings)).toBe(JSON.stringify(withDefault));
  });

  /**
   * ⚠️ `mergeCombatConfig(undefined)` varsayılan nesnenin **kendisini** döndürmeli, kopyasını
   * değil. Kopya döndürseydi de sonuç aynı olurdu ama bu test bir gün birinin "her ihtimale
   * karşı" derin kopya eklemesini ve sıcak yola gereksiz bir maliyet koymasını yakalar.
   */
  it('boş birleştirme varsayılan nesnenin KENDİSİNİ döndürür', () => {
    expect(mergeCombatConfig(undefined)).toBe(DEFAULT_COMBAT_CONFIG);
  });

  /**
   * ⭐ Şema ile motor arasındaki köprünün eksiksizliği. Yeni bir `combat.*` ayarı eklenip
   * eşlemeye satır eklenmezse ayar panelde görünür ama motora HİÇ ulaşmaz — sessiz ve
   * bulunması zor bir hata. Bu test onu derleme zamanı gibi yakalıyor.
   */
  it('her motor ayarının motorda bir karşılığı var', () => {
    const engineKeys = SETTINGS
      .map((d) => d.key)
      .filter((k) => /^(combat|hero|capture|loot)\./.test(k));
    const missing = engineKeys.filter((k) => !MAPPED_KEYS.includes(k));
    expect(missing, `eşlemesi olmayan ayar: ${missing.join(', ')}`).toEqual([]);
  });

  it('eşlemede şemada olmayan anahtar YOK (ters yön)', () => {
    const keys = new Set(SETTINGS.map((d) => d.key));
    expect(MAPPED_KEYS.filter((k) => !keys.has(k))).toEqual([]);
  });
});

/* ═══ Override gerçekten motora ulaşıyor mu ═════════════════════════════════ */

describe('ayar → motor', () => {
  it('`night.base` değişince GECE savaşı değişir, gündüz AYNI kalır', async () => {
    const day = { ...BATTLE, night: false };
    const nightBattle = { ...BATTLE, night: true };
    const beforeDay = simulate(day);
    const beforeNight = simulate(nightBattle);

    await svc.update({ worldId, patch: { 'combat.nightBase': 0.4 }, actorId: null });
    const cfg = svc.combat(worldId);
    expect(cfg).toEqual({ night: { base: 0.4 } });

    // ⚠️ Gündüz savaşı gece çarpanına HİÇ girmez → değişmemeli. Değişseydi override
    //    beklenmedik bir yere sızıyor demekti.
    expect(JSON.stringify(simulate(day, cfg))).toBe(JSON.stringify(beforeDay));
    expect(JSON.stringify(simulate(nightBattle, cfg))).not.toBe(JSON.stringify(beforeNight));
  });

  it('iç içe alanlar doğru yere yazılıyor (düz anahtar → iç içe nesne)', () => {
    const built = applySettings([{
      'combat.wallBase': 2.1,
      'combat.repairMin': 0.5,
      'combat.repairMax': 0.6,
      'hero.skillK': 6,
      'capture.maxHeroes': 7,
    }]);
    expect(combatOverrides(built.effective, built.overridden)).toEqual({
      wall: { base: 2.1 },
      repair: { min: 0.5, max: 0.6 },
      hero: { skillK: 6 },
      capture: { maxHeroes: 7 },
    });
  });

  it('ganimet ayarları ayrı nesneye gidiyor', () => {
    const built = applySettings([{ 'loot.minRate': 0.35, 'loot.plunderRate': 0.5 }]);
    expect(lootOverrides(built.effective, built.overridden))
      .toEqual({ minRate: 0.35, plunderRate: 0.5 });
    // ⚠️ Ganimet anahtarları savaş config'ine SIZMAMALI.
    expect(combatOverrides(built.effective, built.overridden)).toBeUndefined();
  });

  it('kısmi override motorun diğer alanlarını BOZMAZ', () => {
    const merged = mergeCombatConfig({ night: { base: 0.4 } });
    expect(merged.night.base).toBe(0.4);
    // Aynı gruptaki komşu alanlar ve tüm diğer gruplar varsayılanda kalmalı.
    expect(merged.wall).toEqual(DEFAULT_COMBAT_CONFIG.wall);
    expect(merged.hero).toEqual(DEFAULT_COMBAT_CONFIG.hero);
    expect(merged.repair).toEqual(DEFAULT_COMBAT_CONFIG.repair);
    expect(merged.defenseFloor.protectedTypes)
      .toEqual(DEFAULT_COMBAT_CONFIG.defenseFloor.protectedTypes);
  });

  /** Dünya bazlı: bir dünyanın dengesi diğerini etkilemez. */
  it('override DÜNYA BAZLI', async () => {
    const other = freshWorldId();
    await createWorld(h, other);
    await svc.update({ worldId, patch: { 'combat.nightBase': 0.4 }, actorId: null });
    expect(svc.combat(worldId)).toEqual({ night: { base: 0.4 } });
    expect(svc.combat(other)).toBeUndefined();
  });
});

/* ═══ Künye ═════════════════════════════════════════════════════════════════ */

describe('savaşın künyesi', () => {
  /**
   * ⚠️ Ayar değiştirilmemiş dünyada revizyon **yoktur** ve `null` doğru cevaptır: sahte bir
   * sıfırıncı revizyon üretmek, olmayan bir kaydı varmış gibi göstermek olurdu.
   */
  it('hiç ayar yoksa revizyon kimliği null', () => {
    expect(svc.revisionId(worldId)).toBeNull();
  });

  /**
   * ⭐ GENEL katman (dünya 0) değişikliği de bu dünyayı etkiler → işaret ondan geri kalmamalı.
   * İlk yazımda `??` zinciri vardı ve dünyanın ESKİ kendi revizyonu, genel katmandaki YENİ
   * değişikliği gölgeliyordu.
   */
  it('genel katmandaki daha yeni revizyon dünyanınkini gölgelemez', async () => {
    const own = await svc.update({ worldId, patch: { 'combat.nightBase': 0.6 }, actorId: null });
    const shared = await svc.update({ worldId: 0, patch: { 'combat.debrisRate': 0.4 }, actorId: null });
    expect(shared.revisionId).toBeGreaterThan(own.revisionId);
    expect(svc.revisionId(worldId)).toBe(shared.revisionId);
  });

  it('kayıttan sonra revizyon kimliği doluyor ve büyüyor', async () => {
    const first = await svc.update({ worldId, patch: { 'combat.nightBase': 0.6 }, actorId: null });
    expect(svc.revisionId(worldId)).toBe(first.revisionId);

    const second = await svc.update({ worldId, patch: { 'combat.nightBase': 0.5 }, actorId: null });
    expect(second.revisionId).toBeGreaterThan(first.revisionId);
    expect(svc.revisionId(worldId)).toBe(second.revisionId);
  });

  /**
   * ⭐ Revizyon ekleme-yalnız: eski bir savaşın işaret ettiği revizyon, ayar sonradan
   * değişse bile olduğu gibi durur → "bu savaş hangi dengeyle çözüldü" cevaplanabilir kalır.
   */
  it('eski revizyon satırı sonraki değişiklikten ETKİLENMEZ', async () => {
    const first = await svc.update({ worldId, patch: { 'combat.nightBase': 0.6 }, actorId: null });
    await svc.update({ worldId, patch: { 'combat.nightBase': 0.5 }, actorId: null });

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT snapshot FROM settings_revisions WHERE id = ${first.revisionId}
    `);
    const snap = row!['snapshot'] as Record<string, Record<string, number>>;
    expect(snap['combat']?.['nightBase']).toBe(0.6);
  });
});

/* ═══ Doğrulama ═════════════════════════════════════════════════════════════ */

describe('sınırlar', () => {
  it('aralık dışı motor sabiti reddedilir', async () => {
    // `combat.nightBase` 0.1-1 arası; 5 kabul edilirse gece savaşı gündüzden güçlü olurdu.
    await expect(svc.update({ worldId, patch: { 'combat.nightBase': 5 }, actorId: null }))
      .rejects.toThrow();
    expect(svc.combat(worldId)).toBeUndefined();
  });

  it('`int` motor sabitine kesirli değer geçmez', async () => {
    await expect(svc.update({ worldId, patch: { 'capture.maxHeroes': 3.5 }, actorId: null }))
      .rejects.toThrow();
  });

  /** ⚠️ Ölçülmüş sabitler panelde uyarı ROZETİ taşımalı — etiket kaybolursa uyarı da kaybolur. */
  it('binary\'den ölçülen sabitler «measured» etiketli', () => {
    const measured = ['combat.wallBase', 'combat.nightBase', 'combat.repairMin',
      'combat.shieldCal', 'hero.skillK', 'capture.perHeroPenalty'];
    for (const key of measured) {
      const def = SETTINGS.find((d) => d.key === key);
      expect(def?.tag, key).toBe('measured');
    }
  });

  /** Varsayılanlar motorun gerçek varsayılanlarıyla aynı olmalı — yoksa panel yalan söyler. */
  it('şema varsayılanları motorun varsayılanlarıyla AYNI', () => {
    const built = applySettings([]);
    const c = built.effective['combat'] ?? {};
    expect(c['wallBase']).toBe(DEFAULT_COMBAT_CONFIG.wall.base);
    expect(c['nightBase']).toBe(DEFAULT_COMBAT_CONFIG.night.base);
    expect(c['repairMin']).toBe(DEFAULT_COMBAT_CONFIG.repair.min);
    expect(c['repairMax']).toBe(DEFAULT_COMBAT_CONFIG.repair.max);
    expect(c['shieldCal']).toBe(DEFAULT_COMBAT_CONFIG.shieldCal);
    expect(c['debrisRate']).toBe(DEFAULT_COMBAT_CONFIG.debrisRate);
    const hero = built.effective['hero'] ?? {};
    expect(hero['skillK']).toBe(DEFAULT_COMBAT_CONFIG.hero.skillK);
    expect(hero['levelBase']).toBe(DEFAULT_COMBAT_CONFIG.hero.levelBase);
    expect(hero['xpWinner']).toBe(DEFAULT_COMBAT_CONFIG.heroXpShare.winner);
  });
});
