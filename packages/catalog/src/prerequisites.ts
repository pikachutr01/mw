/**
 * ⭐ ÖN-ŞARTLAR (`MOBIWAR_OYUN_VERISI.md` tablolarından, SİSTEM PLANI §13.9)
 *
 * 🎯 **ÖN-ŞART SEVİYEYLE DEĞİŞMEZ.** İstemci ön-şart eşiğini tip başına TEK bir değerden okuyordu
 * (`byte[45]` dizisi); seviyeye bağlı ön-şart formülü orijinalde YOK. Yani "Haritacılık 3→4 için
 * gereken Akademi seviyesi artar mı?" → **artmaz**. Ölçekleme yalnız maliyet ve süre üzerinden.
 *
 * ⚠️ Ön-şart yalnız **ÜRETİMİ/ARAŞTIRMAYI** kapılar. Bir birimi *bulundurmak* için ön-şart
 * gerekmez: Baraka'sı yetmeyen şehre destekle Ejderha gönderilebilir ve orada savunur (§13.11.5).
 */

export interface Requirement {
  /** Gerekli yapı seviyeleri: `{ barracks: 3 }`. */
  buildings?: Record<string, number>;
  /** Gerekli teknik seviyeleri: `{ espionage: 1 }`. */
  techs?: Record<string, number>;
}

/** Savaşçı ve savunma birimlerinin üretim ön-şartları. */
export const UNIT_REQUIREMENTS: Readonly<Record<string, Requirement>> = {
  // ── Savaşçılar (Baraka + teknik) ─────────────────────────────────────────────
  dwarf: { buildings: { barracks: 1 }, techs: { blacksmithing: 1 } },
  elf: { buildings: { barracks: 3 }, techs: { archery: 1 } },
  spy_bird: { buildings: { barracks: 3 }, techs: { espionage: 1 } },
  cargo_wagon: { buildings: { barracks: 3 }, techs: { cartography: 1 } },
  cavalry: { buildings: { barracks: 4 }, techs: { blacksmithing: 3 } },
  shaman: { buildings: { barracks: 5 }, techs: { sorcery: 4 } },
  gnome: { buildings: { barracks: 6 }, techs: { blacksmithing: 3 } },
  pegasus: { buildings: { barracks: 7 }, techs: { archery: 5 } },
  mangonel: { buildings: { barracks: 8 }, techs: { chemistry: 5 } },
  ogre: { buildings: { barracks: 8 }, techs: { instinct: 6 } },
  dragon: { buildings: { barracks: 10 }, techs: { sorcery: 12 } },
  chaos: { buildings: { barracks: 15 }, techs: { sorcery: 20 } },

  // ── Savunma birimleri (Sur + Kale + teknik) ─────────────────────────────────
  trap: { buildings: { wall: 1 } },
  archer_tower: { buildings: { wall: 1 }, techs: { archery: 1 } },
  oil_cauldron: { buildings: { castle: 3, wall: 3 }, techs: { chemistry: 3 } },
  guard: { buildings: { castle: 4, wall: 4 }, techs: { blacksmithing: 4, armor: 3 } },
  mangonel_tower: { buildings: { castle: 5, wall: 5 }, techs: { chemistry: 6 } },
  ballista: { buildings: { castle: 6, wall: 6 }, techs: { archery: 10 } },
  magic_shield: { buildings: { wall: 10 }, techs: { sorcery: 8 } },
  // Sur'un ön-şartı yok (doküman: "yok").
  wall: {},
};

/** Tekniklerin araştırma ön-şartları — hepsi Akademi'de, oyuncu-genel. */
export const TECH_REQUIREMENTS: Readonly<Record<string, Requirement>> = {
  blacksmithing: { buildings: { academy: 1 } },
  armor: { buildings: { academy: 1 } },
  archery: { buildings: { academy: 2 } },
  espionage: { buildings: { academy: 2 } },
  cartography: { buildings: { academy: 3 } },
  chemistry: { buildings: { academy: 4 }, techs: { blacksmithing: 4 } },
  masonry: { buildings: { academy: 6 }, techs: { blacksmithing: 5 } },
  colonization: { buildings: { academy: 7 }, techs: { cartography: 5 } },
  sorcery: { buildings: { academy: 8 }, techs: { chemistry: 2 } },
  talisman: { buildings: { academy: 9 }, techs: { sorcery: 3 } },
  night_vision: { buildings: { academy: 10 }, techs: { espionage: 12 } },
  instinct: { buildings: { academy: 10 } },
};

/**
 * Yapıların ön-şartı (§13.9 "Y" kategorisi): çoğu **Kale**'ye, Mağara/Teleport/Tapınak
 * **Mimar Okulu**'na bağlı. Kale'nin kendisinin ön-şartı yok.
 */
export const BUILDING_REQUIREMENTS: Readonly<Record<string, Requirement>> = {
  castle: {},
  farm: {},
  mine: {},
  barracks: { buildings: { castle: 1 } },
  academy: { buildings: { castle: 2 } },
  architect_school: { buildings: { castle: 3 } },
  cave: { buildings: { architect_school: 2 } },
  temple: { buildings: { architect_school: 4 } },
  teleport: { buildings: { architect_school: 10 } },
};

export interface UnmetRequirement {
  kind: 'building' | 'tech';
  id: string;
  required: number;
  current: number;
}

/**
 * Ön-şartları kontrol eder. **Karşılanmayanların TAMAMINI** döndürür — tek tek değil, çünkü
 * arayüzde "Baraka 8 ve Kimya 5 gerekli" demek, oyuncuyu iki kez denemeye zorlamaktan iyidir.
 */
export function checkRequirement(
  req: Requirement | undefined,
  have: { buildings: Record<string, number>; techs: Record<string, number> },
): UnmetRequirement[] {
  const unmet: UnmetRequirement[] = [];
  for (const [id, level] of Object.entries(req?.buildings ?? {})) {
    const current = have.buildings[id] ?? 0;
    if (current < level) unmet.push({ kind: 'building', id, required: level, current });
  }
  for (const [id, level] of Object.entries(req?.techs ?? {})) {
    const current = have.techs[id] ?? 0;
    if (current < level) unmet.push({ kind: 'tech', id, required: level, current });
  }
  return unmet;
}
