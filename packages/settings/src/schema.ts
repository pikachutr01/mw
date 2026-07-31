/**
 * ⭐ AYAR KATALOĞU — panelden düzenlenebilen her sayı burada tanımlı.
 *
 * Faz 1 kapsamı: **işletim limitleri** (sohbet · bildirim · posta). Dünya hız çarpanları
 * BURADA DEĞİL — onlar `worlds` tablosunda kolon olarak duruyor ve zaten her sorguda
 * okunuyor; buraya kopyalamak ikinci bir doğruluk kaynağı yaratırdı.
 *
 * Sonraki fazlar bu listeyi büyütür: Faz 4 savaş motoru, Faz 5 katalog.
 */
import type { SettingDef, SettingGroup } from './types.ts';

export const SETTING_GROUPS: readonly SettingGroup[] = [
  {
    id: 'chat',
    label: 'Sohbet',
    description: 'Özel mesajlaşmanın akış ve kötüye kullanım sınırları (§13.12.4).',
  },
  {
    id: 'notify',
    label: 'Bildirim',
    description: 'Toast ve push davranışı; metin sınırları ve ölü abonelik temizliği (§7.2).',
  },
  {
    id: 'mail',
    label: 'E-posta',
    description: 'Doğrulama ve şifre sıfırlama bağlantılarının ömrü ile kotalar (§9.2).',
  },
  {
    id: 'combat',
    label: 'Savaş motoru',
    description: '⚠️ Buradaki sayıların ÇOĞU binary\'den ÖLÇÜLDÜ — tasarım tercihi değil, '
      + 'orijinal oyunun davranışı. Değiştirmek oyunu orijinalden uzaklaştırır ve 176 motor '
      + 'testi bu değerlere sabitlenmiştir. «ölçüldü» rozetli alanlara dokunmadan önce '
      + 'docs/veri/ altındaki ölçüm dosyalarına bak.',
  },
  {
    id: 'hero',
    label: 'Kahraman',
    description: 'Kahraman stat formülünün katsayıları (60+ ölçümle doğrulandı) ve '
      + 'savaş tecrübesinin taraflar arasındaki paylaşımı.',
  },
  {
    id: 'capture',
    label: 'Kahraman çıkma',
    description: 'Savaş sonrası kahraman kazanma ihtimali (28/28 ölçüm, hepsi binary sabiti).',
  },
  {
    id: 'loot',
    label: 'Ganimet',
    description: 'Havuz + kaynak-bazlı yağma oranı (§13.10.4). Ölçüm değil TASARIM: '
      + 'ekonominin en doğrudan düğmesi burası.',
  },
] as const;

export const SETTINGS: readonly SettingDef[] = [
  /* ── Sohbet ──────────────────────────────────────────────────────────────── */
  {
    key: 'chat.burst',
    label: 'Kova: pencere başına mesaj',
    type: 'int', default: 5, min: 1, max: 100, tag: 'design', unit: 'adet',
    env: 'CHAT_RATE_BURST',
    description: 'Aşağıdaki pencerede bir oyuncunun gönderebileceği en fazla mesaj. '
      + 'Normal yazışmada asla görünmez; makro kullananı ilk saniyede durdurur.',
  },
  {
    key: 'chat.perSeconds',
    label: 'Kova penceresi',
    type: 'int', default: 10, min: 1, max: 600, tag: 'design', unit: 'sn',
    env: 'CHAT_RATE_WINDOW_SECONDS',
    description: 'Kovanın ölçüldüğü süre.',
  },
  {
    key: 'chat.duplicateSeconds',
    label: 'Aynı metin bekleme süresi',
    type: 'int', default: 15, min: 0, max: 600, tag: 'design', unit: 'sn',
    env: 'CHAT_DUPLICATE_SECONDS',
    description: 'Aynı metnin tekrar gönderilemeyeceği süre. 0 = kapalı.',
  },
  {
    key: 'chat.newPlayerHours',
    label: 'Acemi kısıtı',
    type: 'int', default: 12, min: 0, max: 720, tag: 'design', unit: 'sa',
    env: 'CHAT_DM_MIN_AGE_HOURS',
    description: 'Bu süreyi doldurmayan oyuncu YENİ konuşma başlatamaz; kendisine yazılana '
      + 'cevap verebilir. Ölçüt o dünyaya katılım (`players.created_at`), hesap yaşı değil.',
  },
  {
    key: 'chat.pageSize',
    label: 'Geçmiş sayfa boyutu',
    type: 'int', default: 30, min: 5, max: 100, tag: 'design', unit: 'adet',
    env: 'CHAT_PAGE_SIZE',
    description: 'Sohbet penceresinin bir seferde çektiği mesaj sayısı.',
  },

  /* ── Bildirim ────────────────────────────────────────────────────────────── */
  {
    key: 'notify.titleMax',
    label: 'Başlık uzunluğu',
    type: 'int', default: 60, min: 20, max: 200, tag: 'design', unit: 'karakter',
    description: 'Uzunu işletim sistemi zaten kırpar; biz kaynakta kesiyoruz.',
  },
  {
    key: 'notify.bodyMax',
    label: 'Gövde uzunluğu',
    type: 'int', default: 120, min: 40, max: 400, tag: 'design', unit: 'karakter',
    description: 'Push gövdesinin en fazla uzunluğu.',
  },
  {
    key: 'notify.productionCoalesceSeconds',
    label: 'Üretim bildirimi birleştirme',
    type: 'int', default: 600, min: 0, max: 86_400, tag: 'design', unit: 'sn',
    env: 'NOTIFY_PRODUCTION_COALESCE_SECONDS',
    description: 'Bu pencerede oyuncu başına TEK üretim push\'u gider. 0 = birleştirme kapalı. '
      + 'Toast birleştirilmez — uygulama açıkken oyuncu her satırı görmek ister.',
  },
  {
    key: 'notify.sendTimeoutMs',
    label: 'Push zaman aşımı',
    type: 'int', default: 8000, min: 1000, max: 60_000, tag: 'design', unit: 'ms',
    env: 'NOTIFY_SEND_TIMEOUT_MS',
    description: 'Push servisi yavaşsa outbox tıkanmasın.',
  },
  {
    key: 'notify.maxFailures',
    label: 'Ölü abonelik eşiği',
    type: 'int', default: 5, min: 1, max: 50, tag: 'design', unit: 'deneme',
    env: 'NOTIFY_MAX_FAILURES',
    description: 'Bu kadar arka arkaya başarısız olan abonelik silinir. '
      + '404/410 zaten anında siler; bu eşik geçici hatalar için.',
  },

  /* ── E-posta ─────────────────────────────────────────────────────────────── */
  {
    key: 'mail.verifyTtlHours',
    label: 'Doğrulama bağlantısı ömrü',
    type: 'int', default: 24, min: 1, max: 720, tag: 'design', unit: 'sa',
    env: 'MAIL_VERIFY_TTL_HOURS',
    description: 'Acele ettirmeyecek kadar uzun tutuldu.',
  },
  {
    key: 'mail.resetTtlMinutes',
    label: 'Sıfırlama bağlantısı ömrü',
    type: 'int', default: 60, min: 5, max: 1440, tag: 'design', unit: 'dk',
    env: 'MAIL_RESET_TTL_MINUTES',
    description: '⚠️ KISA tutulmalı: bu bağlantı hesabı ele geçirmeye yeter. Posta kutusuna '
      + 'erişen biri için pencere ne kadar dar olursa o kadar iyi.',
  },
  {
    key: 'mail.resendCooldownSeconds',
    label: 'Tekrar gönderme bekleme süresi',
    type: 'int', default: 60, min: 0, max: 3600, tag: 'design', unit: 'sn',
    env: 'MAIL_RESEND_COOLDOWN_SECONDS',
    description: '⚠️ Bekleme AMACA göre ayrı sayılır (doğrulama / sıfırlama). Tek sayaç '
      + 'olsaydı kayıt olup hemen şifre sıfırlamak isteyen oyuncu sessizce engellenirdi.',
  },
  {
    key: 'mail.dailyPerAccount',
    label: 'Hesap başına günlük',
    type: 'int', default: 10, min: 1, max: 200, tag: 'design', unit: 'adet',
    env: 'MAIL_DAILY_PER_ACCOUNT',
    description: 'Hem maliyet hem posta kutusu bombalama koruması.',
  },
  {
    key: 'mail.dailyPerIp',
    label: 'IP başına günlük',
    type: 'int', default: 30, min: 1, max: 500, tag: 'design', unit: 'adet',
    env: 'MAIL_DAILY_PER_IP',
    description: 'Aynı IP\'den farklı hesaplara dağıtılan bombardıman için.',
  },
  {
    key: 'mail.sendTimeoutMs',
    label: 'Gönderim zaman aşımı',
    type: 'int', default: 10_000, min: 1000, max: 60_000, tag: 'design', unit: 'ms',
    env: 'MAIL_SEND_TIMEOUT_MS',
    description: 'Resend yavaşsa outbox tıkanmasın.',
  },

  /* ── Savaş motoru (Faz 4) ────────────────────────────────────────────────────
   *
   * ⚠️ Anahtar adları DÜZ, motor nesnesi ise İÇ İÇE (`wall.base`, `hero.skillK`…).
   * Eşleme `apps/api/src/settings/combat.ts`te TEK yerde ve açıkça yazılı. Anahtarları
   * `combat.wall.base` gibi üç parçalı yapmak da mümkündü; yapmadık çünkü o zaman ayar
   * altyapısının tamamı (doğrulama, hash, panel formu) iki seviyeli olmaktan çıkardı —
   * motorun şekli yüzünden ayar sistemini değiştirmek yanlış yönde bir bağımlılık olurdu.
   */
  {
    key: 'combat.wallBase',
    label: 'Sur üs tabanı',
    type: 'number', default: 1.8, min: 1, max: 3, tag: 'measured',
    description: 'Sur gücü = base^seviye × Alan × durum/100. ⚠️ Binary\'de 1,8 '
      + '(FUN_00413610/41338c). Büyü Kalkanı ile AYNI formül. Seviye tavanı 40 olduğu için '
      + 'küçük bir değişiklik üst seviyelerde devasa fark yaratır.',
  },
  {
    key: 'combat.magicShieldBase',
    label: 'Büyü Kalkanı üs tabanı',
    type: 'number', default: 1.8, min: 1, max: 3, tag: 'measured',
    description: 'Kalkan pasif çarpan DEĞİL, Sur\'un büyü fazındaki ikizi. Binary\'de 1,8.',
  },
  {
    key: 'combat.shieldCal',
    label: 'Şaman kalkanı katsayısı',
    type: 'number', default: 1.0, min: 0.5, max: 1.5, tag: 'measured',
    description: 'Binary\'de katsayı YOK (ham çıkarma) → 1,0. Bir ara 0,85 sanılıyordu; '
      + '8 ölçümlük kalkan serisi 1,0\'ı kesinleştirdi (RMSE 40,8 → 0,53 puan).',
  },
  {
    key: 'combat.counterK',
    label: 'Karşı-yön kalibrasyonu',
    type: 'number', default: 1.0, min: 0.8, max: 1.2, tag: 'measured',
    description: 'Savunan→saldıran yönünün düzeltmesi. 24 ölçümde net minimum K=1,0; '
      + 'eski 1,01 yaması kaldırıldı.',
  },
  {
    key: 'combat.nightBase',
    label: 'Gece taban çarpanı',
    type: 'number', default: 0.7, min: 0.1, max: 1, tag: 'measured',
    description: 'Gece savaşında güç çarpanı: (1 − 3/(L+3)) × (1−base) + base. '
      + '⚠️ Gece görüşü YOKKEN güç bu orana iner. Taşıma kapasitesini ETKİLEMEZ '
      + '(2026-07-31, binary + ölçümle kesinleşti).',
  },
  {
    key: 'combat.repairMin',
    label: 'Yapı onarımı — alt sınır',
    type: 'number', default: 0.76, min: 0, max: 1, tag: 'measured',
    description: '⚠️ Oyunun KENDİ METNİ «%50-70» diyor ama 12 ölçüm 0,75-0,81 aralığını '
      + 'gösterdi ve %50-70 ölçümün en düşüğüne bile ulaşamıyor. Ölçüm esas alındı.',
  },
  {
    key: 'combat.repairMax',
    label: 'Yapı onarımı — üst sınır',
    type: 'number', default: 0.81, min: 0, max: 1, tag: 'measured',
    description: 'Her yapı türü için bağımsız rulo. Alt sınırdan küçük olmamalı.',
  },
  {
    key: 'combat.defenseFloorEnabled',
    label: 'Savunma tabanı açık',
    type: 'boolean', default: true, tag: 'design',
    description: 'Her savunma birimi TİPİNDEN savaş sonrası en az birkaç tane kalır (§13.11.10). '
      + 'Kapatmak savunmayı sıfıra indiren tek saldırıya izin verir.',
  },
  {
    key: 'combat.defenseFloorMin',
    label: 'Savunma tabanı — tip başına',
    type: 'int', default: 4, min: 0, max: 100, tag: 'design', unit: 'adet',
    description: 'Savaş öncesi adedi kadarıyla sınırlı. Tuzak hariç (tek kullanımlık mühimmat).',
  },
  {
    key: 'combat.trapTriggerMin',
    label: 'Tuzak tetiklenme — alt',
    type: 'number', default: 0.75, min: 0, max: 1, tag: 'design',
    description: 'Tuzakların en az bu oranı patlar.',
  },
  {
    key: 'combat.trapTriggerMax',
    label: 'Tuzak tetiklenme — üst',
    type: 'number', default: 0.99, min: 0, max: 1, tag: 'design',
    description: 'Tuzakların en çok bu oranı patlar.',
  },
  {
    key: 'combat.trapPerGroundUnit',
    label: 'Tuzak doygunluğu',
    type: 'number', default: 0.2, min: 0.01, max: 5, tag: 'design',
    description: '1 tuzağın tetiklenmesi için gereken yer-birimi payı. Küçük ordu az tuzak patlatır.',
  },
  {
    key: 'combat.trapGnomeDisarm',
    label: 'Gnom başına etkisiz tuzak',
    type: 'number', default: 1.5, min: 0, max: 20, tag: 'design', unit: 'adet',
    description: 'Saldırandaki her Gnom ortalama bu kadar tuzağı etkisiz bırakır (±%30 rastgele).',
  },
  {
    key: 'combat.trapPower',
    label: 'Tuzak salvo şiddeti',
    type: 'number', default: 1.0, min: 0, max: 5, tag: 'design',
    description: 'Tuzak hasarının genel çarpanı.',
  },
  {
    key: 'combat.gnomeSabotagePerStruct',
    label: 'Gnom sabotajı — yapı başına',
    type: 'number', default: 4, min: 0, max: 100, tag: 'design',
    description: 'Kaç gnom bir savunma yapısının vuruş gücünü düşürür.',
  },
  {
    key: 'combat.gnomeSabotageMax',
    label: 'Gnom sabotajı — tavan',
    type: 'number', default: 0.35, min: 0, max: 1, tag: 'design',
    description: 'Sabotajın düşürebileceği en fazla oran.',
  },
  {
    key: 'combat.debrisRate',
    label: 'Enkaz oranı',
    type: 'number', default: 0.3, min: 0, max: 1, tag: 'design',
    description: 'Ölen birimin maliyetinin bu oranı enkaza dönüşür ve ganimet havuzuna girer.',
  },
  {
    key: 'combat.combatThreshold',
    label: 'Yenik eşiği',
    type: 'number', default: 0, min: 0, max: 1, tag: 'design',
    description: 'Kalan gücün bu oranın altına düşen taraf yenik sayılır. 0 = tam imha şartı.',
  },

  /* ── Kahraman ────────────────────────────────────────────────────────────── */
  {
    key: 'hero.levelBase',
    label: 'Seviye üs tabanı',
    type: 'number', default: 1.07, min: 1, max: 2, tag: 'measured',
    description: 'Binary FUN_0040d884: 1,07. Kahraman statlarının seviye terimi.',
  },
  {
    key: 'hero.skillK',
    label: 'Yetenek katsayısı (fiziksel)',
    type: 'number', default: 4.8, min: 0, max: 50, tag: 'measured',
    description: 'taban × (1 + k × yetenek) — LİNEER ve seviyeden bağımsız. ⚠️ Binary asm '
      + '`1,06^yetenek` yazıyor ama ölçüm onu 25 kat küçük buluyor; katsayı taraması 4,8\'de '
      + 'net minimum veriyor (%0,74 hata).',
  },
  {
    key: 'hero.skillKMagic',
    label: 'Yetenek katsayısı (büyü)',
    type: 'number', default: 1.0, min: 0, max: 50, tag: 'design',
    description: '🟡 **DOĞRULANMADI** — M3/M4 ölçümü doygun çıktı (805/889 üzerinden 900). '
      + 'Temiz bir tarama gerekiyor; o yüzden «ölçüldü» değil «tasarım» etiketli.',
  },
  {
    key: 'hero.mDefLevelBase',
    label: 'mDef seviye üssü',
    type: 'number', default: 1.06, min: 1, max: 2, tag: 'measured',
    description: 'Yetenek terimi YOK (asm). Alan ve durum hesabının girdisi.',
  },
  {
    key: 'hero.areaK',
    label: 'Alan katsayısı',
    type: 'number', default: 0.005, min: 0, max: 1, tag: 'measured',
    description: 'Alan = round(mDef × k) — binary sabiti 0x40dca8 = 0,005.',
  },
  {
    key: 'hero.durumScale',
    label: 'Durum düşüş ölçeği',
    type: 'number', default: 100, min: 1, max: 1000, tag: 'measured',
    description: 'durum -= k × net/mDef — binary 100.',
  },
  {
    key: 'hero.pointsPerLevel',
    label: 'Seviye başına puan',
    type: 'int', default: 3, min: 1, max: 20, tag: 'measured', unit: 'puan',
    description: 'Oyun ekranından 5/5 doğrulandı.',
  },
  {
    key: 'hero.xpWinner',
    label: 'Tecrübe payı — kazanan',
    type: 'number', default: 2 / 3, min: 0, max: 1, tag: 'design',
    description: '⚠️ Her taraf KENDİ payını kendi sağ kalan kahramanları arasında böler; '
      + 'o tarafta kahraman yoksa pay ziyan olur, karşıya GEÇMEZ. İkisinin toplamı 1 olmalı.',
  },
  {
    key: 'hero.xpLoser',
    label: 'Tecrübe payı — kaybeden',
    type: 'number', default: 1 / 3, min: 0, max: 1, tag: 'design',
    description: 'Kaybedenin kahramanı sağ kaldıysa o da öğrenir.',
  },

  /* ── Kahraman çıkma ──────────────────────────────────────────────────────── */
  {
    key: 'capture.perTempleLevel',
    label: 'Tapınak seviyesi başına puan',
    type: 'number', default: 10, min: 0, max: 1000, tag: 'measured',
    description: 'Oyuncunun TÜM şehirlerinin tapınak seviyeleri TOPLAMI × bu sayı. Binary 10.',
  },
  {
    key: 'capture.perHeroPenalty',
    label: 'Mevcut kahraman cezası',
    type: 'number', default: 155, min: 0, max: 10_000, tag: 'measured',
    description: 'Sahip olunan her kahraman bu kadar puan ÇIKARIR (çarpımsal değil). Binary 155.',
  },
  {
    key: 'capture.xpScale',
    label: 'Tecrübe çarpanı',
    type: 'number', default: 0.000025, min: 0, max: 1, tag: 'measured',
    description: 'Binary 0,000025 → 40.000 XP\'de doyar.',
  },
  {
    key: 'capture.xpGate',
    label: 'Tecrübe alt eşiği',
    type: 'number', default: 499, min: 0, max: 100_000, tag: 'measured', unit: 'XP',
    description: 'Bu XP\'nin altında hiç kahraman çıkmaz. Binary 499.',
  },
  {
    key: 'capture.maxHeroes',
    label: 'En fazla kahraman',
    type: 'int', default: 5, min: 1, max: 50, tag: 'design', unit: 'adet',
    description: 'Bir oyuncunun sahip olabileceği kahraman sayısı.',
  },

  /* ── Ganimet ─────────────────────────────────────────────────────────────── */
  {
    key: 'loot.plunderRate',
    label: 'Yağma tavan oranı',
    type: 'number', default: 0.4, min: 0, max: 1, tag: 'design',
    description: 'Havuz (kasa + enkaz) zenginlik eşiğinin üstündeyken alınan oran.',
  },
  {
    key: 'loot.povertyThreshold',
    label: 'Zenginlik eşiği',
    type: 'int', default: 100_000, min: 0, max: 100_000_000, tag: 'design', unit: 'kaynak',
    description: 'Bu havuzun üstünde oran sabit; altında taban orana doğru DOĞRUSAL iner.',
  },
  {
    key: 'loot.floorThreshold',
    label: 'Yoksulluk eşiği',
    type: 'int', default: 5_000, min: 0, max: 10_000_000, tag: 'design', unit: 'kaynak',
    description: 'Bu havuzun altında oran sabit taban — sömürünün dibi (kullanıcı: 5.000).',
  },
  {
    key: 'loot.minRate',
    label: 'Taban oran',
    type: 'number', default: 0.20, min: 0, max: 1, tag: 'design',
    description: 'Fakir şehirden alınan oran. 2026-07-31\'de %5 → %20 yükseltildi ve motor '
      + 'sürümü 1.1.0 oldu; eski savaş kayıtları künyesinde 1.0.0 kalıyor.',
  },
  {
    key: 'loot.jitterMin',
    label: 'Rastgelelik — alt',
    type: 'number', default: 0.85, min: 0.1, max: 2, tag: 'design',
    description: 'Ganimete uygulanan rastgele çarpanın alt ucu.',
  },
  {
    key: 'loot.jitterMax',
    label: 'Rastgelelik — üst',
    type: 'number', default: 1.15, min: 0.1, max: 3, tag: 'design',
    description: 'Üst ucu. Alt uçtan küçük olmamalı.',
  },
] as const;

/** Anahtar → tanım. Doğrulama ve panel bunun üzerinden çalışır. */
export const SETTINGS_BY_KEY: Readonly<Record<string, SettingDef>> = Object.freeze(
  Object.fromEntries(SETTINGS.map((s) => [s.key, s])),
);
