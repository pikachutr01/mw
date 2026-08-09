/**
 * ⭐ MENTION ÇÖZÜCÜ (§13.15c) — `@ad` metnini **çözülmüş aralıklara** çevirir.
 *
 * Saf fonksiyon: DB, HTTP, ayar bilmez. Girdi gövde + üye listesi, çıktı `[{id, at, len}]`.
 * Sonuç `chat_messages.mentions` kolonuna yazılır ve istemci onu **parse etmeden diler**.
 *
 * ## Neden metinden değil, indeksle çalışıyoruz
 *
 * ⚠️ **Kullanıcı adında BOŞLUK serbest** (`name-rules.ts`: harf + rakam + boşluk, 3-15).
 * Yani `"@Eru Ilúvatar merhaba"` metninde adın nerede bittiği **metinden çözülemez**:
 * `Eru`, `Eru Ilúvatar` ve `Eru Ilúvatar merhaba` üçü de geçerli birer ad biçimi. Bu yüzden
 * ayrımı üye listesini gören SUNUCU yapar, sonucu indeks olarak yazar ve iki taraf aynı şeyi
 * görür. İstemcide parse kuralı olmadığı için ayrışacak bir kural da yok.
 *
 * ⚠️ Yalnız `[playerId]` saklamak da YETMEZ: ad değişirse eski mesajdaki metin eski adı
 * gösterir, id'den çözülen yeni adla eşleşmez ve kalın yazılacak aralık bulunamazdı.
 */
import { USERNAME_MAX, USERNAME_MIN, normalizeName } from '@mobilwar/catalog';

/** Gövde içindeki tek bir `@ad` aralığı. `at` başlangıç, `len` **`@` dâhil** uzunluk. */
export interface Mention {
  id: number;
  at: number;
  len: number;
}

export interface MentionCandidate {
  playerId: number;
  username: string;
}

/**
 * Harf ya da rakam mı? Mention sınırlarını belirler.
 *
 * ⚠️ Boşluk BİLEREK dışarıda: adın içinde geçebiliyor, dolayısıyla "sınır karakteri" sayılmalı.
 * `\p{L}` Türkçe harfleri de kapsıyor (`name-rules.ts` ile aynı sınıf).
 */
const WORDY = /[\p{L}\p{N}]/u;
const isWordy = (ch: string | undefined): boolean => ch != null && WORDY.test(ch);

/**
 * Gövdedeki `@ad` geçişlerini çözer.
 *
 * ⚠️ **`body` KIRPILMIŞ (`trim`) olmalı** — servis DB'ye kırpılmış gövdeyi yazıyor. Farklı bir
 * dize verilirse tüm indeksler kayar ve istemci yanlış yeri kalın yazar. Bu, fonksiyonun
 * sözleşmesindeki en kırılgan nokta.
 *
 * ⚠️ **Harf büyüklüğüne DUYARLI** (bilinçli karar). Türkçe I/İ tuzağı: JS'te
 * `'İ'.toLowerCase()` birleşik iki kod noktası üretir (`i` + U+0307), Postgres `lower()` ise
 * başka bir sonuç verir — sunucuyla istemci küçük-harfe indirgemede **kaçınılmaz olarak
 * ayrışır**. Otomatik tamamlama adı zaten tam yazdığı için normal yolda bu hiç görünmez;
 * elle yanlış büyüklükte yazan bir mention üretmez. Sessizce **yanlış kişiye** bildirim
 * gitmesindense mention'ın hiç oluşmaması dürüst davranış.
 *
 * @param max En fazla kaç mention çözülür (`allianceChat.maxMentions`). 0 → özellik kapalı.
 */
export function resolveMentions(
  body: string,
  candidates: readonly MentionCandidate[],
  max: number,
): Mention[] {
  if (max <= 0 || body.length === 0 || candidates.length === 0) return [];

  /**
   * Ad → id haritası. Anahtar `normalizeName`den geçiyor çünkü kullanıcı adı KAYITTA da
   * GİRİŞTE de normalize ediliyor (`contracts/auth.ts`) — "Eru  Ilúvatar" ile "Eru Ilúvatar"
   * aynı oyuncudur ve mention da aynı şeyi görmeli.
   */
  const byName = new Map<string, number>();
  for (const c of candidates) byName.set(normalizeName(c.username), c.playerId);

  const out: Mention[] = [];

  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '@') continue;
    /**
     * ⚠️ ÖNCESİ KONTROLÜ: `@`'den önce harf/rakam varsa bu bir mention değil.
     * `ali@veli` ya da bir e-posta adresi rastgele kalın çıkmasın.
     */
    if (isWordy(body[i - 1])) continue;

    /**
     * ⚠️ **EN UZUNDAN EN KISAYA ARAMA — BOŞLUK SORUNUNU ÇÖZEN ŞEY BU.**
     *
     * Hem `Eru` hem `Eru Ilúvatar` üyeyse `@Eru Ilúvatar` **uzun olana** bağlanmalı.
     * Kısa-önce arasaydık boşluklu bir ad hiçbir zaman mention olamazdı: `Eru` eşleşir,
     * ardındaki ` Ilúvatar` sarkardı.
     */
    const maxLen = Math.min(USERNAME_MAX, body.length - i - 1);
    for (let len = maxLen; len >= USERNAME_MIN; len--) {
      const raw = body.slice(i + 1, i + 1 + len);
      /**
       * ⚠️ SONRASI KONTROLÜ: eşleşmenin bittiği yerde harf/rakam varsa reddet ve bir kısa
       * uzunluğa geç. Yalnız `Ali` üyeyken `@Alican` yazılırsa `Ali` yakalanıp `can` sarkardı.
       */
      if (isWordy(body[i + 1 + len])) continue;
      /**
       * ⚠️ Normalize edilmiş ada bakıyoruz ama aralığı HAM uzunlukla yazıyoruz. Fark yalnız
       * çoklu boşlukta doğar ("@Eru  Ilúvatar"): ad eşleşir, kalın yazılan aralık ise
       * oyuncunun gerçekten yazdığı metni kapsar — ekranda kayma olmaz.
       * ⚠️ Baş/son boşluk taşıyan aralık REDDEDİLİR — `normalizeName` onları kırpıp eşleşme
       * ürettiği için bu kontrol olmadan `"@ Eru"` (boşluklu) ve `"@Eru "` (sondan uzun)
       * geçerli mention sayılırdı; ilki hiç mention değil, ikincisinde de kalın yazılan
       * aralık adın dışına taşardı.
       */
      if (raw.trim() !== raw) continue;
      const id = byName.get(normalizeName(raw));
      if (id == null) continue;

      out.push({ id, at: i, len: len + 1 });
      // Aynı aralığın içinde ikinci bir `@` aranmasın: imleci eşleşmenin sonuna taşı.
      i += len;
      break;
    }

    if (out.length >= max) break;
  }

  return out;
}

/**
 * ⭐⭐ ADAY ADLAR — **roster'ı olmayan sohbetin mention'ı bu fonksiyonla çözülüyor** (§13.12).
 *
 * İttifak sohbetinde aday listesi hazır geliyordu: üyeler (≤300) zaten çekiliyor ve
 * `resolveMentions`'a olduğu gibi veriliyordu. **Genel sohbette öyle bir liste YOK** — aday
 * kümesi dünyanın tamamı, yani binlerce satır. Onları çekip belleğe almak, tek bir mesaj için
 * dünyayı taramak olurdu.
 *
 * ⭐ Ters çeviriyoruz: metinden **olası ad dizelerini** üretip veritabanına *"bunlardan hangisi
 * gerçek bir oyuncu"* diye tek sorguda soruyoruz (`username = ANY($1)`, `players_world_username`
 * tekil indeksi). Dönen satırlar sonra **değiştirilmemiş** `resolveMentions`'a besleniyor —
 * böylece en-uzundan-en-kısaya eşleme kuralı ve I/İ kararı tek yerde kalıyor.
 *
 * ⚠️ **Neden `@`den sonraki tek kelimeyi almak YETMEZ:** kullanıcı adında boşluk serbest
 * (`name-rules.ts`), yani `"@Eru Ilúvatar merhaba"` metninde adın nerede bittiği bilinemez.
 * Bu yüzden her `@` için `USERNAME_MIN..USERNAME_MAX` arası **tüm** alt dizeler üretiliyor.
 *
 * ⚠️ **Maliyet sınırlı ve öngörülebilir:** `@` başına en fazla 13 dize (15−3+1), taranan `@`
 * sayısı `maxMentions` ile kesiliyor. Varsayılan 3 mention → en fazla 39 aday, tek sorgu.
 * `maxMentions` tavanı bu yüzden yalnız bir spam kapısı değil, aynı zamanda bir maliyet kapısı.
 *
 * ⚠️ `body` **kırpılmış** gelmeli — `resolveMentions` ile aynı gövdeyi görmezse aday üretilen
 * ad ile indekslenen aralık farklı dizeye bakar.
 */
export function mentionCandidateNames(body: string, max: number): string[] {
  if (max <= 0 || body.length === 0) return [];

  const out = new Set<string>();
  let seen = 0;

  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '@') continue;
    // ⚠️ `resolveMentions` ile AYNI ön koşul: `ali@veli` ya da e-posta aday üretmemeli.
    if (isWordy(body[i - 1])) continue;

    const maxLen = Math.min(USERNAME_MAX, body.length - i - 1);
    for (let len = maxLen; len >= USERNAME_MIN; len--) {
      const raw = body.slice(i + 1, i + 1 + len);
      /* Baş/son boşluklu aralık ada çözülmez (`resolveMentions` da reddediyor) → sorguya girmesin. */
      if (raw.trim() !== raw) continue;
      out.add(normalizeName(raw));
    }

    seen++;
    if (seen >= max) break;
  }

  return [...out];
}

/**
 * Bildirim gidecek oyuncular — tekilleştirilmiş, **gönderen çıkarılmış**.
 *
 * ⚠️ Aynı kişi bir mesajda iki kez anılırsa **iki aralık** döner (ikisi de kalın yazılmalı) ama
 * bildirim **tek** gider. Ayrım burada; `resolveMentions` görsel katmana, bu fonksiyon bildirim
 * katmanına hizmet ediyor.
 *
 * ⚠️ Gönderen burada süzülüyor, `notify.catalog.ts`te değil: katalog saf bir eşleyici kalmalı
 * ("hangi olay hangi bildirimi üretir"), "kim kendini anmış" bilgisi sohbetin işi.
 */
export const mentionRecipients = (mentions: readonly Mention[], senderId: number): number[] =>
  [...new Set(mentions.map((m) => m.id))].filter((id) => id !== senderId);
