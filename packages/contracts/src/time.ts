/**
 * ⭐ OYUNUN SAAT DİLİMİ — tek kaynak (kullanıcı, 2026-08-04, İKİNCİ kez bildirdi).
 *
 * ─ ŞİKÂYET ────────────────────────────────────────────────────────────────────────────────
 * *"Oyunda sıralama sayfasında 00:00 yazıyordu, admin panelde 03:00 gösteriyor. … db saati,
 * oyun saati her şey Türkiye saatine göre olmalı."*
 *
 * ─ TEŞHİS (ölçüldü, tahmin değil) ─────────────────────────────────────────────────────────
 * Veritabanı **doğruydu**: `ranking_runs.taken_at` tam olarak 00:00 / 08:00 / 16:00 **UTC**.
 * Çelişki gösterimdeydi ve iki ekran iki farklı sözleşme kullanıyordu:
 *   • Oyun ekranı `timeZone: 'UTC'` ZORLUYORDU → 00:00 yazıyordu.
 *   • Yönetim paneli tarayıcının yerel saatini kullanıyordu → 03:00 yazıyordu.
 * İkisi de kendi içinde tutarlıydı, ikisi birden aynı anda doğru olamazdı.
 *
 * ─ KÖK ÇÖZÜM ──────────────────────────────────────────────────────────────────────────────
 * **Depolama UTC kalıyor, KURAL ÇIPALARI ve GÖSTERİM oyunun saat dilimine taşınıyor.**
 *
 * ⚠️ Depolamayı yerele çevirmek **yapılmadı** ve yapılmamalı: yerel saat saklamak, saat
 * kayması olan bir bölge eklendiği gün geri dönüşü olmayan veri bozulması demektir. `timestamptz`
 * her zaman mutlak anı taşır; "hangi saat diliminde gösterilir" bir SUNUM kararıdır.
 *
 * ⚠️ Gerçek davranış değişikliği: sıralama yuvaları ve **gece savaşı penceresi** artık
 * Türkiye saatine göre. Önceden gece penceresi (00:00-08:00 UTC) Türkiye'de **03:00-11:00**
 * demekti — yani oyuncular sabah 10'da gece cezası yiyordu. Artık gerçekten gece.
 *
 * ─ NEDEN IANA BÖLGESİ, SABİT +3 DEĞİL ─────────────────────────────────────────────────────
 * Türkiye 2016'dan beri kalıcı UTC+3 ve yaz saati uygulamıyor; sabit bir sayı bugün doğru
 * sonucu verirdi. Yine de bölge ADI kullanıldı çünkü tek satırlık maliyeti var ve niyeti
 * belgeliyor: burada yazan şey "3 saat ekle" değil, "oyun Türkiye'de geçiyor". Kural bir gün
 * saat kaymalı bir bölgeye taşınırsa hesaplar kendiliğinden doğru kalır.
 */

/** ⚠️ Sunucu, oyun istemcisi ve yönetim paneli AYNI değeri kullanır. */
export const GAME_TIME_ZONE = 'Europe/Istanbul';

/**
 * ⭐ GECE PENCERESİ — oyunun kendi dokümanından: *"Saat 00:00'dan sabah 08:00'a kadar olan
 * zaman gece olarak nitelendirilir."* Saatler **oyunun saat diliminde** okunur.
 *
 * ⚠️ Burada, motorda değil: hem savaş çözümü (`isNightBattle`) hem de üst şeritteki gece
 * rozeti bunu okuyor. İki kopya olsaydı rozet ile kural ayrışabilir ve gösterge oyuncuya
 * yanlış söyleyebilirdi.
 */
export const NIGHT_FROM_HOUR = 0;
export const NIGHT_TO_HOUR = 8;

/** `at` anı gece penceresinde mi? Savaş çözümü ve arayüz rozeti aynı yanıtı verir. */
export function isNightHour(at: Date, zone: string = GAME_TIME_ZONE): boolean {
  const h = zonedHour(at, zone);
  return h >= NIGHT_FROM_HOUR && h < NIGHT_TO_HOUR;
}

/**
 * Verilen anda oyun bölgesinin UTC'ye göre kayması (ms).
 *
 * ⚠️ Sabit bir sayı DEĞİL, ana bağlı: yaz saati uygulayan bir bölgede yılın yarısında farklı
 * olur. `Intl`in kendi veritabanından okunuyor — kendi tablomuzu tutmak, bölge kuralları
 * değiştiğinde sessizce bayatlayan bir kopya olurdu.
 */
export function zoneOffsetMs(at: Date, zone: string = GAME_TIME_ZONE): number {
  /*
   * `formatToParts` ile bölgedeki duvar saatini okuyup UTC'deki duvar saatiyle farkını alıyoruz.
   * `timeZoneName: 'longOffset'` daha doğrudan görünürdü ama çıktısı ("GMT+03:00") biçim olarak
   * ortamlar arasında oynayabiliyor; sayısal alanları okumak her yerde aynı sonucu veriyor.
   */
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string): number => Number(p.find((x) => x.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'),
  );
  // Saniye altını at: bölge kaymaları hiçbir zaman saniye kesri taşımaz.
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * `at` anının oyun bölgesindeki **gün başlangıcı** (yerel 00:00), mutlak an olarak.
 *
 * ⚠️ Gün sınırını UTC'de hesaplamak, günde üç kez koşan sıralamayı 3 saat kaydırıyordu —
 * şikâyetin kaynağı tam olarak buydu.
 */
export function zonedDayStart(at: Date, zone: string = GAME_TIME_ZONE): Date {
  const off = zoneOffsetMs(at, zone);
  const local = new Date(at.getTime() + off);
  const localMidnight = Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(),
  );
  /*
   * ⚠️ İKİNCİ ÇEVRİM ŞART. Kaymayı `at` anından okuduk ama gün başlangıcı BAŞKA bir andır ve
   * saat kaymalı bir bölgede o iki an farklı kaymalara düşebilir (geçiş gecesi). Aday anı
   * kurup kaymayı bir kez daha okumak bunu kapatıyor.
   */
  const guess = new Date(localMidnight - off);
  const off2 = zoneOffsetMs(guess, zone);
  return off2 === off ? guess : new Date(localMidnight - off2);
}

/** `at` anının oyun bölgesindeki saati (0-23). Gece penceresi bununla ölçülüyor. */
export function zonedHour(at: Date, zone: string = GAME_TIME_ZONE): number {
  return new Date(at.getTime() + zoneOffsetMs(at, zone)).getUTCHours();
}

/**
 * ⭐ EKRANDA GÖRÜNEN TEK BİÇİM. Oyun ve yönetim paneli bunu kullanır.
 *
 * ⚠️ Tarayıcının yerel saati BİLEREK kullanılmıyor. Oyunun hedef kitlesi Türkiye ve bütün
 * zaman kuralları (gece savaşı, sıralama yuvaları) Türkiye saatinde tanımlı. Yerel saate
 * bıraksaydık yurt dışındaki bir oyuncu ya da yönetici, kuralların yazdığı saatlerden farklı
 * sayılar görür ve destek konuşmaları anlamsızlaşırdı — "saldırı 03:00'te iniyor" diyen iki
 * kişinin farklı anları kastetmesi.
 */
export function formatGameTime(
  value: string | number | Date,
  opts: { withDate?: boolean; withSeconds?: boolean } = {},
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: GAME_TIME_ZONE,
    ...(opts.withDate === false ? {} : { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
    ...(opts.withSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  }).format(d);
}

/** Yalnız saat-dakika — dar yerler için (`güncelleme 19:00`). */
export function formatGameHhmm(value: string | number | Date): string {
  return formatGameTime(value, { withDate: false });
}
