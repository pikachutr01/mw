/**
 * ⭐ İSTEMCİ SAATİ — `serverNow` / `gameNow` / `remaining*` ailesi.
 *
 * **Neden şimdi yazıldı:** bu ailenin hiç testi yoktu ve tam da bu yüzden aynı hata sınıfı
 * canlıda **iki kez** çıktı: 2026-08-02'de casusluk geri sayımı sürekli «varıyor» yazıyordu,
 * 2026-08-07'de asker üretim sayacı kalıcı olarak «sipariş tamamlandı» gösteriyordu. İkisinin
 * de sebebi aynı: **oyun saatindeki bir damgayı gerçek saatle karşılaştırmak.**
 *
 * ⚠️ Asıl işlevi ileriye dönük: Faz 2'de `gameOffsetMs` kaldırılıp `gameNow()` yeniden
 * tanımlanacak. Bu dosya o değişikliğin **sözleşmeyi bozmadığını** ölçen ağdır — özellikle
 * «bitmiş» (`null`) ile «henüz bilmiyorum» ayrımını.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatClock, formatDuration, formatLongDuration, gameNow, noteMaintenance,
  noteServerTime, remaining, remainingClock, remainingLong, serverNow, timeAgo,
} from '../src/lib/hooks.ts';

/** Sabit bir "tarayıcı şimdisi" — sapma ölçümü ancak böyle deterministik olur. */
const BROWSER_NOW = Date.parse('2026-08-07T12:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BROWSER_NOW);
  // Çıpaları her testte bilinen bir noktaya çek (modül düzeyinde durum tutuluyor).
  noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW));
});

describe('saat çıpaları', () => {
  it('tarayıcı saati ileriyse sapma ölçülüp geri alınır', () => {
    // Sunucu 30 sn GERİDE → tarayıcı 30 sn ileri demektir.
    noteServerTime(iso(BROWSER_NOW - 30_000));
    expect(serverNow()).toBe(BROWSER_NOW - 30_000);
  });

  it('tarayıcı saati geriyse de düzeltilir', () => {
    noteServerTime(iso(BROWSER_NOW + 45_000));
    expect(serverNow()).toBe(BROWSER_NOW + 45_000);
  });

  /**
   * ⭐⭐ TEK ZAMAN ÇİZGİSİ (0043) — dünya çalışıyorken oyun saati ile gerçek saat AYNI.
   *
   * ⚠️ Eskiden aralarında kalıcı bir fark vardı (dünyanın toplam duraklama süresi, canlıda
   * 196,5 sn) ve bu fark iki kez canlı hataya yol açtı. Artık fark yalnız bakımda oluşuyor.
   */
  it('dünya çalışıyorken gameNow == serverNow', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW));
    expect(gameNow()).toBe(serverNow());
  });

  /** Bakımda sunucunun `gameNow`u donmuş `paused_at`i taşır → istemci de donar. */
  it('bakımda gameNow DONAR (sunucunun bildirdiği ana çakılır)', () => {
    const pausedAt = BROWSER_NOW - 10 * 60_000;
    noteServerTime(iso(BROWSER_NOW), iso(pausedAt));
    expect(gameNow()).toBe(pausedAt);

    // Gerçek zaman aksa bile oyun saati kıpırdamaz.
    vi.setSystemTime(BROWSER_NOW + 30_000);
    expect(serverNow()).toBe(BROWSER_NOW + 30_000);
    expect(gameNow()).toBe(pausedAt);
  });

  /** ⚠️ Ağ gecikmesi bakım sanılmamalı — eşiğin altındaki fark gürültüdür. */
  it('küçük fark bakım SAYILMAZ (eşik altı gürültü)', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - 300));
    expect(gameNow()).toBe(serverNow());
  });

  /**
   * ⭐ `noteMaintenance` — WS olayı geldiği anda donar, sunucunun bir sonraki yanıtı
   * beklenmez. Bakım bitince de çözer.
   */
  it('noteMaintenance anında dondurur ve çözer', () => {
    const pausedAt = BROWSER_NOW - 5_000;
    noteMaintenance(true, iso(pausedAt));
    expect(gameNow()).toBe(pausedAt);

    noteMaintenance(false, null);
    expect(gameNow()).toBe(serverNow());
  });

  it('damgasız bakım bildirimi yine de dondurur (akmaya devam etmekten iyi)', () => {
    noteMaintenance(true, null);
    const donmus = gameNow();
    vi.setSystemTime(BROWSER_NOW + 10_000);
    expect(gameNow()).toBe(donmus);
  });

  /** `gameNow` göndermeyen uçlar bakım durumunu BOZMAMALI, yalnız güncellememeli. */
  it('yalnız serverNow gönderen yanıt bakım çıpasını bozmaz', () => {
    const pausedAt = BROWSER_NOW - 60_000;
    noteServerTime(iso(BROWSER_NOW), iso(pausedAt));
    noteServerTime(iso(BROWSER_NOW));               // gameNow yok
    expect(gameNow()).toBe(pausedAt);
  });

  it('bozuk damga çıpayı bozmaz', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW));
    noteServerTime('bu bir tarih değil', 'bu da değil');
    expect(gameNow()).toBe(serverNow());
  });
});

describe('remaining — varsayılan çıpa OYUN saati', () => {
  /**
   * ⭐⭐ 2026-08-02 HATASININ BEKÇİSİ — artık YAPISAL olarak imkânsız.
   *
   * Casusluk 120 sn sürüyor. Eski modelde oyun saati gerçek saatin 196,5 sn gerisindeydi, yani
   * varış anı gerçek saatle bakıldığında HEP geçmişte kalıyor ve geri sayım yerine sürekli
   * «varıyor» yazıyordu. Hata görev SÜRESİ kısaldıkça görünür oluyordu — uzun seferlerde
   * yutuluyordu, bu yüzden aylarca fark edilmedi.
   *
   * ⭐ Tek zaman çizgisinde iki çıpa AYNI değeri veriyor: yanlış çıpa seçmek artık bir hataya
   * yol açamıyor. Test bunu kanıtlıyor — ve `gameNow` ile `serverNow` bir gün yeniden ayrışırsa
   * (yalnız bakımda ayrışmalı) burada görünür.
   */
  it('kısa görev (120 sn) doğru sayar — iki çıpa da aynı sonucu verir', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW));
    const varis = iso(gameNow() + 120_000);

    expect(remaining(varis)).toBe('2 dk 00 sn');
    expect(remaining(varis, serverNow())).toBe('2 dk 00 sn');
  });

  /** ⚠️ Ama BAKIMDA ayrışıyorlar — ve geri sayım donmuş saatten çizilmeli. */
  it('bakımda geri sayım DONMUŞ saatten çizilir', () => {
    const pausedAt = BROWSER_NOW - 10 * 60_000;
    noteServerTime(iso(BROWSER_NOW), iso(pausedAt));
    const varis = iso(pausedAt + 120_000);           // duraklama anından 2 dk sonrası

    expect(remaining(varis)).toBe('2 dk 00 sn');     // ⭐ donmuş: iş ilerlemiyor
    expect(remaining(varis, serverNow())).toBeNull(); // ⛔ gerçek saat: "bitmiş" sanır
  });

  it('bitmiş süre null döner', () => {
    expect(remaining(iso(gameNow() - 1_000))).toBeNull();
  });

  it('boş/geçersiz girdi null döner', () => {
    expect(remaining(null)).toBeNull();
    expect(remaining(undefined)).toBeNull();
    expect(remaining('çöp')).toBeNull();
  });

  it('remainingClock aynı çıpayı kullanır', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - 196_563));
    expect(remainingClock(iso(gameNow() + 271_000))).toBe('04:31');
  });

  /**
   * ⚠️ `remainingLong` varsayılanı GERÇEK saat — çünkü tek çağıranı tatil paneli ve oradaki
   * damga gün ölçeğinde. Çıpa isteyen açıkça geçmeli. Bu testin işi o asimetriyi **bilinçli**
   * kılmak: değişirse burada görünür.
   */
  it('remainingLong varsayılanı GERÇEK saat (bilinçli asimetri)', () => {
    noteServerTime(iso(BROWSER_NOW), iso(BROWSER_NOW - 196_563));
    const gunler = iso(serverNow() + 3 * 86_400_000);
    expect(remainingLong(gunler)).toBe('3 gün');
  });
});

/**
 * ⭐ GEÇMİŞE BAKAN DAMGA — sohbetlerin zaman gösterimi (kullanıcı, 2026-08-11).
 *
 * ⚠️ Eskiden yalnız `SS:dd` yazıyordu: üç gün önce 13:06'da gelen mesajla bugün 13:06'da
 * gelen mesaj ekranda AYNI görünüyordu (kullanıcının bildirdiği hata).
 */
describe('timeAgo — geçmişe bakan süre', () => {
  const gecmis = (ms: number): string => iso(BROWSER_NOW - ms);

  it('eşikleri sırayla geçer: saniye → dakika → saat → gün → ay → yıl', () => {
    expect(timeAgo(gecmis(3_000))).toBe('3 saniye önce');
    expect(timeAgo(gecmis(59_000))).toBe('59 saniye önce');
    expect(timeAgo(gecmis(60_000))).toBe('1 dakika önce');
    expect(timeAgo(gecmis(45 * 60_000))).toBe('45 dakika önce');
    expect(timeAgo(gecmis(3_600_000))).toBe('1 saat önce');
    expect(timeAgo(gecmis(23 * 3_600_000))).toBe('23 saat önce');
    expect(timeAgo(gecmis(86_400_000))).toBe('1 gün önce');
    expect(timeAgo(gecmis(29 * 86_400_000))).toBe('29 gün önce');
    expect(timeAgo(gecmis(30 * 86_400_000))).toBe('1 ay önce');
    expect(timeAgo(gecmis(200 * 86_400_000))).toBe('6 ay önce');
    expect(timeAgo(gecmis(400 * 86_400_000))).toBe('1 yıl önce');
  });

  /**
   * ⚠️⚠️ ÇIPA `serverNow()` — ve bu, `remaining` ailesinin TERSİ. Sebebi
   * `chat_messages.created_at`in `NON_TIMELINE_COLUMNS` içinde olması: sohbet damgası bir oyun
   * olayı değil, geçmiş kaydıdır ve bakım kaydırmasından etkilenmez. `gameNow()` kullansaydık
   * bakım boyunca bütün mesajların yaşı donardı.
   */
  it('⭐ bakımda bile YAŞLANMAYA DEVAM eder (gameNow değil serverNow)', () => {
    const pausedAt = BROWSER_NOW - 10 * 60_000;
    noteServerTime(iso(BROWSER_NOW), iso(pausedAt));
    expect(gameNow()).not.toBe(serverNow());          // saatler gerçekten ayrışmış

    const mesaj = iso(BROWSER_NOW - 5 * 60_000);
    expect(timeAgo(mesaj)).toBe('5 dakika önce');
    // ⛔ Oyun saatiyle bakılsaydı mesaj «gelecekte» kalır ve «1 saniye önce» donardı:
    expect(timeAgo(mesaj, gameNow())).toBe('1 saniye önce');
  });

  /**
   * ⚠️ GELECEK damga «1 saniye önce» sayılır, negatif YAZILMAZ: sunucu ile tarayıcı saati
   * arasındaki küçük kayma yüzünden yeni gönderilmiş bir mesaj birkaç saniye ileride
   * görünebiliyor ve *"-2 saniye önce"* kabul edilemez.
   */
  it('⚠️ gelecek damga ve 0 saniye «1 saniye önce» olur, negatife düşmez', () => {
    expect(timeAgo(iso(BROWSER_NOW))).toBe('1 saniye önce');
    expect(timeAgo(iso(BROWSER_NOW + 4_000))).toBe('1 saniye önce');
  });

  it('boş/geçersiz girdi tire döner (geri sayımlardaki `null` DEĞİL)', () => {
    expect(timeAgo(null)).toBe('—');
    expect(timeAgo(undefined)).toBe('—');
    expect(timeAgo('çöp')).toBe('—');
  });
});

describe('biçimlendirme', () => {
  it('formatDuration saniyeyi HER ZAMAN yazar (kullanıcı kararı)', () => {
    expect(formatDuration(7_457)).toBe('2 sa 04 dk 17 sn');
    expect(formatDuration(192)).toBe('3 dk 12 sn');
    expect(formatDuration(9)).toBe('9 sn');
    expect(formatDuration(-5)).toBe('0 sn');
  });

  it('formatLongDuration bir günden kısasını formatDuration\'a devreder', () => {
    expect(formatLongDuration(86_399)).toBe('23 sa 59 dk 59 sn');
    expect(formatLongDuration(86_400)).toBe('1 gün');
    expect(formatLongDuration(30 * 86_400 - 60)).toBe('29 gün 23 sa');
  });

  it('formatClock dar yerler için saat biçimi verir', () => {
    expect(formatClock(271)).toBe('04:31');
    expect(formatClock(7_467)).toBe('2:04:27');
  });
});
