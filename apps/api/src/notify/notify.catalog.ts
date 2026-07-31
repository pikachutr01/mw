/**
 * ⭐ BİLDİRİM KATALOĞU — outbox satırı → İNSANIN OKUYACAĞI metin.
 *
 * `realtime.bus.ts`'teki `eventForOutbox`'ın kardeşi. O, aynı satıra bakıp *"istemci hangi
 * sorguyu tazelesin"* der; bu ise *"insana ne yazacağız"* der. İkisi bilerek ayrı:
 * bir olayın ekranı tazelemesi gerekir ama bildirim üretmesi gerekmeyebilir (ve tersi).
 *
 * ⭐ **TEK METİN KAYNAĞI.** Buradan çıkan dize hem WS toast'ında hem işletim sistemi push
 * bildiriminde görünür. İki ayrı yerde üretilseydi kaçınılmaz olarak birbirinden kayardı —
 * projenin "sefer süresi önizlemesi motorun AYNI travel.ts'ini çağırır" kuralının aynısı.
 *
 * ⚠️ Bir outbox satırı BİRDEN ÇOK bildirim üretebilir ve metinleri FARKLI olabilir: savaş
 * bittiğinde saldıran "Saldırın başarılı" görürken savunan "Şehrin saldırıya uğradı" görür.
 * Bu yüzden dönüş tipi dizi.
 */
import { UNITS_BY_ID, BUILDINGS_BY_ID, TECHS_BY_ID } from '@mobiwar/catalog';

import { notifyLimits, type NotifyCategory } from './notify.limits.ts';

export interface Notification {
  /** Alıcı OYUNCU (hesap değil) — tercih ve çevrimiçilik bunun üzerinden çözülür. */
  playerId: number;
  worldId: number | null;
  category: NotifyCategory;
  title: string;
  body: string;
  /** Toast tıklaması ve push `notificationclick` AYNI adrese gider — tek davranış. */
  url: string;
  /**
   * Aynı `tag`li önceki bildirimi **değiştirir**, yanına eklemez. Örn. bir sohbetten arka arkaya
   * üç mesaj gelince bildirim merkezinde üç satır değil, güncellenen tek satır olur.
   */
  tag: string;
}

/* ── Küçük yardımcılar ──────────────────────────────────────────────────────── */

const nameOfItem = (id: string): string =>
  UNITS_BY_ID[id]?.name.tr ?? BUILDINGS_BY_ID[id]?.name.tr ?? TECHS_BY_ID[id]?.name.tr ?? id;

const n = (v: unknown): number | null => {
  const x = v == null ? NaN : Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};

const tr = (x: number): string => x.toLocaleString('tr-TR');

/** `{k,d,s}` → `1:45:7`. Eksikse boş dize (metin "bilinmeyen yerden" demez, o kısmı atlar). */
const coords = (v: unknown): string => {
  const c = v as { k?: unknown; d?: unknown; s?: unknown } | null | undefined;
  if (c?.k == null || c.d == null || c.s == null) return '';
  return `${Number(c.k)}:${Number(c.d)}:${Number(c.s)}`;
};

/**
 * "23 dk sonra" / "2 sa 5 dk sonra".
 *
 * ⚠️ Mutlak saat BİLEREK yazılmıyor: oyunun tüm zaman kuralları UTC ve ekranda "(oyun saati)"
 * etiketiyle gösteriliyor (BASLANGIC tuzak tablosu). Bir bildirim gövdesine o etiketi her
 * seferinde sığdırmak yerine göreli süre hem kısa hem yanlış anlaşılamaz.
 */
const inWords = (iso: unknown, now: Date): string => {
  const t = iso == null ? NaN : Date.parse(String(iso));
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((t - now.getTime()) / 60_000);
  if (mins <= 0) return 'birazdan';
  if (mins < 60) return `${mins} dk sonra`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} sa sonra` : `${h} sa ${m} dk sonra`;
};

/** `{cuce: 3000, elf: 20}` → `3.000 Cüce · 20 Elf`; uzunsa "ve N tür daha". */
const unitList = (v: unknown, max = 3): string => {
  const raw = (v ?? {}) as Record<string, unknown>;
  const items = Object.entries(raw)
    .map(([id, count]) => [id, Number(count)] as const)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (items.length === 0) return '';
  const head = items.slice(0, max).map(([id, count]) => `${tr(count)} ${nameOfItem(id)}`);
  const rest = items.length - head.length;
  return rest > 0 ? `${head.join(' · ')} ve ${rest} tür daha` : head.join(' · ');
};

const clip = (s: string, max: number): string =>
  (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

const note = (o: Notification): Notification => ({
  ...o,
  title: clip(o.title.trim(), notifyLimits().titleMax),
  body: clip(o.body.trim(), notifyLimits().bodyMax),
});

/**
 * Mesaj kutusuna düşen satır türlerinin Türkçe adı (`Messages.tsx`'teki `REPORT_TYPE` ile
 * aynı diller). `battle_report` BİLEREK yok — savaşın bildirimi `battle:resolved` üzerinden
 * çok daha zengin (kim kazandı) üretiliyor; ikisi de üretse oyuncu aynı savaş için İKİ
 * bildirim alırdı.
 */
const MESSAGE_KINDS: Readonly<Record<string, { title: string; body: string }>> = {
  spy_report: { title: 'Casusluk raporu', body: 'Rapor mesaj kutunda.' },
  transport_report: { title: 'Nakliye raporu', body: 'Rapor mesaj kutunda.' },
  support_report: { title: 'Destek raporu', body: 'Rapor mesaj kutunda.' },
  found_city_report: { title: 'Şehir kurma raporu', body: 'Rapor mesaj kutunda.' },
  alliance_invite: { title: 'İttifak daveti', body: 'Mesaj kutunda Kabul / Red ile bekliyor.' },
  alliance_application: { title: 'İttifak başvurusu', body: 'Mesaj kutunda Kabul / Red ile bekliyor.' },
  alliance_message: { title: 'İttifak mesajı', body: 'İttifakından yeni bir duyuru var.' },
  system: { title: 'Bildirim', body: 'Mesaj kutunda yeni bir kayıt var.' },
};

/* ── Katalog ────────────────────────────────────────────────────────────────── */

export function notificationForOutbox(
  topic: string,
  payload: Record<string, unknown>,
  worldId: number | null,
  now: Date = new Date(),
): Notification[] {
  switch (topic) {
    /**
     * ⭐ EN KRİTİK BİLDİRİM. Oyuncu uygulamada değilken bunu kaçırırsa şehrini kaybeder;
     * push'un varlık sebebi tam olarak bu satır. Birim dökümü payload'da 2026-07-31'den beri
     * duruyor ("gelen ordu tam görünürlük" turu) — burada nihayet kullanılıyor.
     */
    case 'city:incoming_attack': {
      const to = n(payload['defenderPlayerId']);
      if (to == null) return [];
      const from = coords(payload['originCoordinates']);
      const units = unitList(payload['units']);
      const heroes = n(payload['heroCount']);
      const when = inWords(payload['arrivesAt'], now);
      const parts = [
        from === '' ? '' : `${from}'den`,
        units,
        heroes == null ? '' : `⚔ ${heroes} kahraman`,
        when,
      ].filter((x) => x !== '');
      return [note({
        playerId: to, worldId, category: 'attack',
        title: 'Saldırı geliyor!',
        body: parts.join(' · '),
        url: '/armies',
        tag: `attack:${n(payload['missionId']) ?? to}`,
      })];
    }

    case 'city:incoming_spy': {
      const to = n(payload['defenderPlayerId']);
      if (to == null) return [];
      const from = coords(payload['originCoordinates']);
      const birds = n(payload['birds']);
      const parts = [
        from === '' ? '' : `${from}'den`,
        birds == null ? '' : `${tr(birds)} Casus Kuş`,
        inWords(payload['arrivesAt'], now),
      ].filter((x) => x !== '');
      return [note({
        playerId: to, worldId, category: 'attack',
        title: 'Casus kuş geliyor!',
        body: parts.join(' · '),
        url: '/armies',
        tag: `spy:${n(payload['missionId']) ?? to}`,
      })];
    }

    /**
     * ⚠️ Yalnız ALICIYA. `chat:dm` outbox satırı WS için iki tarafa da gidiyor (gönderenin
     * başka sekmesi senkronlansın diye) ama kimse kendi yazdığı mesajın bildirimini almamalı.
     */
    case 'chat:dm': {
      const to = n(payload['recipientId']);
      const from = n(payload['senderId']);
      if (to == null) return [];
      const name = String(payload['senderName'] ?? '').trim();
      return [note({
        playerId: to, worldId, category: 'dm',
        title: name === '' ? 'Yeni mesaj' : name,
        body: String(payload['preview'] ?? '').trim() || 'Sana bir mesaj gönderdi.',
        // Derin bağlantı: Mesajlar açılır ve sohbet penceresi bu oyuncuyla doğrudan gelir.
        url: from == null ? '/messages' : `/messages?dm=${from}`,
        tag: `dm:${n(payload['channelId']) ?? to}`,
      })];
    }

    /**
     * ⭐ İKİ ALICI, İKİ FARKLI METİN — dönüş tipinin dizi olmasının sebebi bu dal.
     * `winner` motorun `'attacker' | 'defender' | 'draw'` değeri (`engine/combat.ts:658`).
     */
    case 'battle:resolved': {
      const winner = String(payload['winner'] ?? '');
      const attacker = n(payload['attackerPlayerId']);
      const defender = n(payload['defenderPlayerId']);
      const battleId = n(payload['battleId']);
      const tag = `battle:${battleId ?? 0}`;
      const out: Notification[] = [];
      if (attacker != null) {
        out.push(note({
          playerId: attacker, worldId, category: 'report',
          title: 'Savaş bitti',
          body: winner === 'attacker' ? 'Saldırın başarılı oldu. Rapor mesaj kutunda.'
            : winner === 'defender' ? 'Saldırın püskürtüldü. Rapor mesaj kutunda.'
              : 'Savaş berabere bitti. Rapor mesaj kutunda.',
          url: '/messages', tag,
        }));
      }
      if (defender != null) {
        out.push(note({
          playerId: defender, worldId, category: 'report',
          title: 'Şehrin saldırıya uğradı',
          body: winner === 'defender' ? 'Saldırıyı püskürttün. Rapor mesaj kutunda.'
            : winner === 'attacker' ? 'Savunma çöktü. Rapor mesaj kutunda.'
              : 'Savaş berabere bitti. Rapor mesaj kutunda.',
          url: '/messages', tag,
        }));
      }
      return out;
    }

    /** Mesaj kutusuna düşen diğer satırlar. Savaş raporu yukarıda ele alındı → burada atlanır. */
    case 'message:written': {
      const to = n(payload['playerId']);
      const kind = String(payload['kind'] ?? '');
      if (to == null || kind === 'battle_report') return [];
      const t = MESSAGE_KINDS[kind];
      if (!t) return [];
      return [note({
        playerId: to, worldId, category: 'report',
        title: t.title, body: t.body,
        url: '/messages', tag: `msg:${kind}:${to}`,
      })];
    }

    case 'city:building_finished': {
      const to = n(payload['playerId']);
      if (to == null) return [];
      const level = n(payload['level']);
      return [note({
        playerId: to, worldId, category: 'production',
        title: 'Yapı tamamlandı',
        body: `${nameOfItem(String(payload['type'] ?? ''))}${level == null ? '' : ` seviye ${level}`} hazır.`,
        url: '/buildings', tag: `prod:${to}`,
      })];
    }

    case 'player:tech_finished': {
      const to = n(payload['playerId']);
      if (to == null) return [];
      const level = n(payload['level']);
      return [note({
        playerId: to, worldId, category: 'production',
        title: 'Araştırma tamamlandı',
        body: `${nameOfItem(String(payload['type'] ?? ''))}${level == null ? '' : ` seviye ${level}`} hazır.`,
        url: '/academy', tag: `prod:${to}`,
      })];
    }

    /**
     * ⚠️ `city:defense_finished` İKİ AYRI ŞEKİL taşır (`queue.handlers.ts`): savunma birimi
     * bandı `{produced}` yazar, Sur/Büyü Kalkanı yükseltmesi ise `{type, level}` yazar.
     * İkisi de buradan geçiyor; ayrım `produced`ın varlığında.
     */
    case 'city:units_finished':
    case 'city:defense_finished': {
      const to = n(payload['playerId']);
      if (to == null) return [];
      const isUnits = topic === 'city:units_finished';
      if (payload['produced'] == null) {
        const level = n(payload['level']);
        return [note({
          playerId: to, worldId, category: 'production',
          title: 'Yapı tamamlandı',
          body: `${nameOfItem(String(payload['type'] ?? ''))}${level == null ? '' : ` seviye ${level}`} hazır.`,
          url: '/defense', tag: `prod:${to}`,
        })];
      }
      const list = unitList(payload['produced']);
      if (list === '') return [];
      return [note({
        playerId: to, worldId, category: 'production',
        title: 'Üretim tamamlandı',
        body: `${list} hazır.`,
        url: isUnits ? '/barracks' : '/defense',
        tag: `prod:${to}`,
      })];
    }

    /**
     * Bildirim ÜRETMEYEN olaylar (ekranı tazeler ama insana haber değildir):
     * `mission:completed` · `mission:canceled` · `city:army_returned` · `city:changed` ·
     * `city:founded` · `alliance:changed` · `ranking:updated` · `echo:done`.
     * ⚠️ Kendi ordunun dönüşü için bildirim BİLEREK yok — oyuncu onu zaten bekliyor ve
     * her seferde bildirim atmak `production`dan bile gürültülü olurdu.
     */
    default:
      return [];
  }
}
