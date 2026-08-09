/**
 * ⭐ `LIKE` ÖNEK DESENİ — arama uçlarının paylaştığı tek yardımcı.
 *
 * ⚠️ Buraya 2026-08-10'da **taşındı** (eskiden `command.controller.ts` içinde tekti). İkinci
 * kullanıcısı genel sohbetin `@` öneri ucu oldu ve kopyalamak, aşağıdaki iki bilgiyi ikinci
 * kez öğrenmek anlamına gelirdi.
 */

/**
 * Arama metnini `LIKE` önek desenine çevirir: `ay` → `ay%`.
 *
 * ⚠️ İki şey aynı anda yapılıyor ve ikisi de şart:
 *  1. **Joker kaçışı** — kullanıcı `%` yazarsa her şey eşleşirdi (`_` de tek karakter jokeri).
 *     Kaçış karakteri ters bölü, o da kendisi kaçırılmalı.
 *  2. **Desen TEK PARAMETRE** olarak gider. `lower(${q}) || '%'` yazılınca desen plan
 *     zamanında sabit olmadığı için Postgres önekin indeksten okunabileceğini göremiyor ve
 *     `lower(username)` yalnız FİLTRE olarak kalıyordu (EXPLAIN testi bunu yakaladı) —
 *     yani indeks vardı ama boşunaydı.
 */
export const prefixPattern = (q: string): string =>
  `${q.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
