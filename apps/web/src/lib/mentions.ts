/**
 * ⭐ MENTION DİLİMLEYİCİ (§13.15c) — gövdeyi sunucunun verdiği aralıklara göre parçalar.
 *
 * ⚠️ **BURADA PARSE YOK.** Kullanıcı adında boşluk serbest olduğu için `@ad`ın nerede
 * bittiği metinden çözülemez; ayrımı üye listesini gören sunucu yapıyor ve sonucu indeks
 * olarak gönderiyor (`chat_messages.mentions`). İstemcinin işi yalnız o indekslerden dilim
 * almak. İki tarafta iki ayrı parse kuralı olsaydı kaçınılmaz olarak ayrışırlardı.
 *
 * ⚠️ **XSS yüzeyi yok**: `dangerouslySetInnerHTML` kullanılmıyor, parçalar JSX metin düğümü
 * olarak basılıyor ve React kaçırıyor.
 */
import type { ChatMention } from '@mobilwar/contracts';

export interface MentionPart {
  text: string;
  /** Dolu ise bu parça bir bahsetme — kalın yazılır. */
  mentionId?: number;
}

/**
 * Gövdeyi düz metin ve bahsetme parçalarına böler.
 *
 * ⚠️ **Bozuk aralıklar SESSİZCE atılır** (sınır dışı `at`, gövdeyi aşan `len`, önceki
 * aralıkla çakışma). Gerekçe: gövdenin kırpılması ya da karakterlerin kaybolması, bir
 * bahsetmenin kalın yazılamamasından çok daha kötü bir hata olurdu. Metin her hâlükârda
 * eksiksiz çıkar.
 */
export function splitMentions(
  body: string, mentions: readonly ChatMention[] | undefined,
): MentionPart[] {
  if (!mentions || mentions.length === 0) return [{ text: body }];

  const valid = [...mentions]
    .filter((m) => Number.isInteger(m.at) && Number.isInteger(m.len)
      && m.at >= 0 && m.len > 0 && m.at + m.len <= body.length)
    .sort((a, b) => a.at - b.at);

  const parts: MentionPart[] = [];
  let cursor = 0;
  for (const m of valid) {
    if (m.at < cursor) continue;                    // çakışan aralık → at
    if (m.at > cursor) parts.push({ text: body.slice(cursor, m.at) });
    parts.push({ text: body.slice(m.at, m.at + m.len), mentionId: m.id });
    cursor = m.at + m.len;
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor) });
  return parts.length > 0 ? parts : [{ text: body }];
}

/* ── Yazarken @ önerisi ──────────────────────────────────────────────────────── */

export interface MentionQuery {
  /** `@`den sonra yazılmış metin (boş olabilir — `@` yeni yazıldı). */
  text: string;
  /** `@` işaretinin gövdedeki konumu — seçim yapılınca buradan itibaren değiştirilir. */
  at: number;
}

/** Kullanıcı adı sınırı (`name-rules.ts`) — sorgu bundan uzunsa `@` bir bahsetme değildir. */
const QUERY_MAX = 15;

/**
 * İmlecin solundaki metne bakıp aktif bir `@` sorgusu var mı söyler.
 *
 * ⚠️ Bu YALNIZ öneri kutusu içindir; kanonik eşleşmeyi sunucu yapıyor. Bu yüzden burada
 * Türkçe küçük-harf farkının (I/İ) bir zararı yok: yanlış öneri en fazla listeyi boş bırakır,
 * gönderilen metni değiştirmez.
 *
 * İptal koşulları: `@`den önce harf/rakam var (`ali@veli`) · araya satır sonu girmiş ·
 * sorgu ad sınırını aşmış.
 */
export function activeMentionQuery(value: string, caret: number): MentionQuery | null {
  const head = value.slice(0, caret);
  const at = head.lastIndexOf('@');
  if (at < 0) return null;

  const before = head[at - 1];
  if (before != null && /[\p{L}\p{N}]/u.test(before)) return null;

  const text = head.slice(at + 1);
  if (text.includes('\n')) return null;
  if (text.length > QUERY_MAX) return null;
  return { text, at };
}

/**
 * Seçilen adı taslağa yerleştirir → `{ value, caret }`.
 *
 * ⚠️ **Sondaki boşluk ŞART.** Boşluklu adlarda ("Eru Ilúvatar") kullanıcının hemen ardından
 * yazacağı kelime adın parçası sanılabilirdi; sunucunun uzun-eşleşme kuralı yine doğruyu
 * bulur ama görsel geri bildirim ancak boşlukla net olur.
 */
export function applyMention(
  value: string, query: MentionQuery, username: string,
): { value: string; caret: number } {
  const head = value.slice(0, query.at);
  const tail = value.slice(query.at + 1 + query.text.length);
  const inserted = `@${username} `;
  return {
    value: `${head}${inserted}${tail}`,
    caret: head.length + inserted.length,
  };
}

/** Öneri süzgeci — önek eşleşmesi, Türkçe küçük harf. Zaten anılanlar listeden düşer. */
export function suggestMentions<T extends { playerId: number; username: string }>(
  members: readonly T[], query: string, limit = 6,
): T[] {
  const q = query.toLocaleLowerCase('tr');
  return members
    .filter((m) => q === '' || m.username.toLocaleLowerCase('tr').startsWith(q))
    .slice(0, limit);
}
