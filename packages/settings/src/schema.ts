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
    id: 'economy',
    label: 'Ekonomi ve süre',
    description: '⭐ Oyunun temposunu belirleyen eğriler: üretim, maliyet büyümesi ve süre '
      + 'modeli. ⚠️ Buradaki bir değişiklik SÜREN işleri etkilemez — kuyruk bitiş anı ve '
      + 'sefer varış anı girerken hesaplanıp yazılıyor; yalnız bundan sonraki işler etkilenir.',
  },
  {
    id: 'cave',
    label: 'Mağara',
    description: 'Kapasite ve yıkılma eşiği ÖLÇÜLDÜ (kapasite tablosu 20/20, cüce tablosu '
      + '119/120); doldurma/boşaltma ve onarım süreleri kurgu.',
  },
  {
    id: 'wall',
    label: 'Sur onarımı',
    description: 'Savaştan sonra surun kendini onarma süresi. Doküman süreyi vermiyor — '
      + 'ikisi de kurgu (§13.21.2).',
  },
  {
    id: 'ops',
    label: 'Bakım ve saklama',
    description: '⭐ Temizlik görevlerinin **saklama süreleri** ve sağlık eşikleri (§admin Faz 8). '
      + 'Buradaki sayılar oyunun dengesini değil veri tabanının büyümesini yönetir. '
      + '⚠️ Süreyi kısaltmak GEÇMİŞİ SİLER: temizlik çalıştığı anda eşik altındaki satırlar '
      + 'gider ve geri gelmez. Önce kuru koşuyla kaç satır etkileneceğine bak.',
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

  /* ── Ekonomi ve süre (Faz 5) ─────────────────────────────────────────────── */
  {
    key: 'economy.foodBase',
    label: 'Çiftlik taban üretimi',
    type: 'number', default: 6, min: 0.1, max: 1000, tag: 'measured', unit: 'yemek/sa',
    description: 'Üretim = taban × seviye × oran^seviye. 40/40 seviyede birebir doğrulandı.',
  },
  {
    key: 'economy.foodRate',
    label: 'Çiftlik büyüme oranı',
    type: 'number', default: 1.16, min: 1, max: 2, tag: 'measured',
    description: '⚠️ Üstel: seviye 40ta 1,16^40 ≈ 380 kat. Küçük bir değişiklik geç oyunu '
      + 'tamamen değiştirir.',
  },
  {
    key: 'economy.goldBase',
    label: 'Maden taban üretimi',
    type: 'number', default: 5, min: 0.1, max: 1000, tag: 'measured', unit: 'altın/sa',
    description: '40/40 seviyede birebir doğrulandı.',
  },
  {
    key: 'economy.goldRate',
    label: 'Maden büyüme oranı',
    type: 'number', default: 1.15, min: 1, max: 2, tag: 'measured',
    description: 'Çiftlikten biraz düşük — altın oyunda daha kıt olsun diye.',
  },
  {
    key: 'economy.buildingCostRate',
    label: 'Yapı maliyet oranı',
    type: 'number', default: 1.8, min: 1, max: 3, tag: 'design',
    description: 'Normal yapıların maliyet eğrisi: oran^(seviye−1).',
  },
  {
    key: 'economy.economyCostRate',
    label: 'Çiftlik/Maden maliyet oranı',
    type: 'number', default: 1.33, min: 1, max: 3, tag: 'design',
    description: '⚠️ **1,45 DEĞİL 1,33.** k.javada 1,45 yazıyordu ama o oran orijinalin '
      + 'bilinmeyen tabanlarına aitti. Bizim tavanımız 40 ve 1,45 ile seviye 40 ekonomik '
      + 'olarak ULAŞILAMAZ oluyordu (190 milyon kaynak, ~1 yıl geri ödeme). 1,33 ile 7,1 '
      + 'milyon kaynak ve 20-36 gün.',
  },
  {
    key: 'economy.techCostRate',
    label: 'Teknik maliyet oranı',
    type: 'number', default: 1.5, min: 1, max: 3, tag: 'design',
    description: 'Teknik maliyeti: taban × oran^(seviye+1).',
  },
  {
    key: 'economy.timeDecayRate',
    label: 'Süre kısaltma oranı',
    type: 'number', default: 1.2, min: 1, max: 3, tag: 'design',
    description: 'Her hızlandırıcı yapı seviyesi süreyi böler. ⚠️ Orijinaldeki 1,4 yirmi '
      + 'seviyede **836 kat** demekti; Baraka tek başına oyunun kaderini belirliyor ve '
      + 'seviye 1deki oyuncu hiçbir şey üretemiyordu. 1,2 ile yirmi seviye 32 kat.',
  },
  {
    key: 'economy.timeExponent',
    label: 'Süre üssü',
    type: 'number', default: 0.8, min: 0.1, max: 2, tag: 'design',
    description: 'Pahalı birimi saniye başına daha verimli yapar. 1,0 olsaydı birim seçimi '
      + 'yalnız maliyet verimliliğine inerdi.',
  },
  {
    key: 'economy.unitTimeFactor',
    label: 'Birim süre katsayısı',
    type: 'number', default: 190, min: 1, max: 10000, tag: 'design',
    description: 'Savaşçı ve savunma birimi → Cüce, Baraka 1de 1 dk 54 sn.',
  },
  {
    key: 'economy.structureTimeFactor',
    label: 'Yapı süre katsayısı',
    type: 'number', default: 400, min: 1, max: 20000, tag: 'design',
    description: 'Yapı/teknik/Sur/Kalkan → aynı maliyette birimin ~2 katı süre.',
  },
  {
    key: 'economy.timeDivisorRate',
    label: 'Süre böleni tabanı',
    type: 'number', default: 1.4, min: 1, max: 3, tag: 'design',
    description: 'Emekli süre modellerinin böleni; güncel modelde kullanılmıyor.',
  },
  {
    key: 'economy.carryTimeWeight',
    label: 'Taşıma kapasitesi ağırlığı',
    type: 'number', default: 1, min: 0, max: 10, tag: 'design',
    description: '1 birim taşıma kapasitesi kaç kaynak sayılır. Yalnız Yük Arabasında '
      + 'anlamlı fark yaratır.',
  },
  {
    key: 'economy.buildingCostMultiplier',
    label: 'Yapı fiyat çarpanı',
    type: 'number', default: 1, min: 0.01, max: 100, tag: 'design',
    description: '⭐ TÜM yapı fiyatlarını topluca ölçekler; eğrinin şeklini bozmaz. '
      + '⚠️ Yapı BAŞINA fiyat düzenleme burada YOK: 11 yapı × 2 kaynak = 22 satırlık düz bir '
      + 'liste asıl soruyu ("fiyatlar genel olarak yüksek mi") cevaplamıyordu. Tek tek '
      + 'düzenleme veri tarayıcısının işi (Faz 7).',
  },
  {
    key: 'economy.unitCostMultiplier',
    label: 'Birim fiyat çarpanı',
    type: 'number', default: 1, min: 0.01, max: 100, tag: 'design',
    description: 'TÜM birim fiyatlarını topluca ölçekler.',
  },
  {
    key: 'economy.techCostMultiplier',
    label: 'Teknik fiyat çarpanı',
    type: 'number', default: 1, min: 0.01, max: 100, tag: 'design',
    description: 'TÜM teknik fiyatlarını topluca ölçekler.',
  },

  /* ── Mağara ──────────────────────────────────────────────────────────────── */
  {
    key: 'cave.capacityBase',
    label: 'Kapasite tabanı',
    type: 'number', default: 50, min: 1, max: 100000, tag: 'measured', unit: 'alan',
    description: 'Kapasite = taban × 2^(seviye−1). Tablo 20/20 doğrulandı.',
  },
  {
    key: 'cave.breakBase',
    label: 'Yıkma tabanı',
    type: 'number', default: 100, min: 1, max: 1000000, tag: 'measured', unit: 'cüce',
    description: 'Seviye 1 mağarayı yıkmak için gereken cüce (Demircilik 0). '
      + 'cuce-magara.png tablosunun 119/120 hücresi bu formülle tutuyor.',
  },
  {
    key: 'cave.breakRate',
    label: 'Yıkma büyüme oranı',
    type: 'number', default: 1.5, min: 1, max: 5, tag: 'measured',
    description: 'Her seviye mağaraya %50 dayanıklılık (doküman + tablo).',
  },
  {
    key: 'cave.blacksmithingRelief',
    label: 'Demircilik indirimi',
    type: 'number', default: 0.05, min: 0, max: 1, tag: 'measured',
    description: '⚠️ **TOPLAMSAL payda** (1 + 0,05·d), üssel DEĞİL. Ayrım büyük: Demircilik '
      + '30da üssel model 0,21 verirken gerçek tablo 0,40 diyor.',
  },
  {
    key: 'cave.transferFactor',
    label: 'Doldurma/boşaltma katsayısı',
    type: 'number', default: 25, min: 1, max: 1000, tag: 'design',
    description: 'süre = katsayı × √alan / oran^(sv−1). 25 → seviye 1de dolu mağara 2 dk 57 sn.',
  },
  {
    key: 'cave.transferDecayRate',
    label: 'Doldurma kısalma oranı',
    type: 'number', default: 1.1, min: 1, max: 3, tag: 'design',
    description: 'Doküman: her mağara seviyesi doldurma/boşaltmayı %10 azaltır.',
  },
  {
    key: 'cave.minTransferSeconds',
    label: 'En kısa transfer',
    type: 'int', default: 5, min: 0, max: 3600, tag: 'design', unit: 'sn',
    description: 'Tek birimlik işlem bile anlık olmasın (istismar tamponu).',
  },
  {
    key: 'cave.repairBaseSeconds',
    label: 'Onarım tabanı',
    type: 'int', default: 72000, min: 60, max: 604800, tag: 'design', unit: 'sn',
    description: 'Yıkılan mağaranın onarımı (20 saat). ⚠️ Bir ara 26 saatti; kullanıcı '
      + '2026-07-28de indirdi — mağara yıkılınca oyuncunun en değerli ordusu bir gün boyunca '
      + 'korumasız kalıyordu.',
  },
  {
    key: 'cave.repairDecayRate',
    label: 'Onarım kısalma oranı',
    type: 'number', default: 0.9, min: 0.1, max: 1, tag: 'design',
    description: 'Her seviye onarımı %10 kısaltır — mağarayı yükseltmek yalnız kapasite '
      + 'değil dayanıklılık da kazandırmalı.',
  },

  /* ── Sur onarımı ─────────────────────────────────────────────────────────── */
  {
    key: 'wall.repairBaseSeconds',
    label: 'Sur onarım tabanı',
    type: 'int', default: 43200, min: 60, max: 604800, tag: 'design', unit: 'sn',
    description: 'Tamamen yıkılmış seviye 1 sur bu sürede (12 saat) toparlanır. Süre alınan '
      + 'hasarla ORANTILI: %20ye düşmüş sur, %70te kalandan çok daha uzun sürer.',
  },
  {
    key: 'wall.repairDecayRate',
    label: 'Sur onarım kısalma oranı',
    type: 'number', default: 0.92, min: 0.1, max: 1, tag: 'design',
    description: 'Seviye 20 sur 2 sa 28 dkda toparlanır. Dokümanda böyle bir bilgi yok, '
      + 'bilerek eklendi: Suru yükseltmek toparlanma hızı da kazandırmalı.',
  },

  /* ── Bakım ve saklama (§admin Faz 8) ─────────────────────────────────────── */
  {
    key: 'ops.messagesReadDays',
    label: 'Okunmuş rapor saklama',
    type: 'int', default: 60, min: 1, max: 3650, tag: 'design', unit: 'gün',
    description: '⚠️ **Okunmuş** posta bu süreden eskiyse silinebilir. Okunmamış olanlar bu '
      + 'kuraldan MUAF — oyuncunun hiç görmediği bir savaş raporunu silmek, veriyi değil '
      + 'oyuncunun oyunu anlama hakkını siler.',
  },
  {
    key: 'ops.messagesAnyDays',
    label: 'Okunmamış rapor tavanı',
    type: 'int', default: 365, min: 1, max: 3650, tag: 'design', unit: 'gün',
    description: 'Okunmamış posta için sert tavan. Bu olmasaydı bir yıl önce oyunu bırakmış '
      + 'hesabın kutusu sonsuza kadar tabloda kalırdı.',
  },
  {
    key: 'ops.chatDays',
    label: 'Sohbet saklama',
    type: 'int', default: 30, min: 1, max: 3650, tag: 'design', unit: 'gün',
    description: 'Sohbet akıştır, arşiv değil. ⚠️ **Sabitlenmiş** mesajlar muaf: ittifak '
      + 'kuralları genelde sabitlenmiş bir mesajda durur.',
  },
  {
    key: 'ops.outboxDays',
    label: 'Teslim edilmiş outbox saklama',
    type: 'int', default: 7, min: 1, max: 365, tag: 'design', unit: 'gün',
    description: '⚠️ Yalnız `dispatched_at` DOLU satırlar. Teslim edilmemiş satır ne kadar '
      + 'eski olursa olsun silinmez — bekleyen bir bildirim kaybı, temizlikle üretilebilecek '
      + 'en kötü sonuçtur.',
  },
  {
    key: 'ops.emailTokenDays',
    label: 'E-posta jetonu saklama',
    type: 'int', default: 7, min: 1, max: 365, tag: 'design', unit: 'gün',
    description: 'Süresi geçmiş ya da kullanılmış doğrulama/sıfırlama jetonları. Jeton zaten '
      + 'işlevsiz; satır yalnız yer kaplıyor.',
  },
  {
    key: 'ops.pushDeadDays',
    label: 'Ölü push aboneliği saklama',
    type: 'int', default: 30, min: 1, max: 365, tag: 'design', unit: 'gün',
    description: 'Üst üste başarısız olmuş (`fail_count` eşiği aşmış) abonelikler. Tarayıcı '
      + 'aboneliği iptal etmiş demektir; her bildirimde boşuna denenir.',
  },
  {
    key: 'ops.pushFailThreshold',
    label: 'Ölü sayılma eşiği',
    type: 'int', default: 5, min: 1, max: 100, tag: 'design', unit: 'hata',
    description: 'Bu kadar arka arkaya hata alan abonelik ölü sayılır.',
  },
  {
    key: 'ops.rankingRunDays',
    label: 'Sıralama koşusu saklama',
    type: 'int', default: 90, min: 1, max: 3650, tag: 'design', unit: 'gün',
    description: '⚠️ Temizlenen tablo `ranking_runs` (koşu GEÇMİŞİ), `rankings` DEĞİL. '
      + '`rankings` her anlık görüntüde üzerine yazılıyor (unique world+kind+subject) → '
      + 'boyutu oyuncu sayısıyla sınırlı, büyümüyor ve temizlenecek bir şeyi yok.',
  },
  {
    key: 'ops.sessionDays',
    label: 'Ölü oturum saklama',
    type: 'int', default: 90, min: 1, max: 3650, tag: 'design', unit: 'gün',
    description: '⚠️ Yalnız İPTAL EDİLMİŞ ya da SÜRESİ GEÇMİŞ satırlar. Dönmeli refresh her '
      + 'yenilemede yeni satır açtığı için bu tablo en hızlı büyüyendir; canlı zincirler '
      + 'etkilenmez (aktif satırın `expires_at`i gelecekte).',
  },
  {
    key: 'ops.cleanupBatch',
    label: 'Tek koşuda en fazla satır',
    type: 'int', default: 20000, min: 100, max: 1000000, tag: 'design', unit: 'satır',
    description: '⚠️ Güvenlik freni. Milyonluk bir DELETE tabloyu kilitler ve oyunu durdurur; '
      + 'tavan aşılırsa görev kalanı bir sonraki koşuya bırakır ve panelde "kalan" yazar.',
  },
  {
    key: 'ops.staleHeartbeatS',
    label: 'Nabız bayatlama eşiği',
    type: 'int', default: 30, min: 5, max: 3600, tag: 'design', unit: 'sn',
    description: 'Bir döngünün nabzı bu süredir güncellenmediyse panel «ÖLÜ» der. '
      + 'Nabız 5 sn\'de bir yazıldığı için 30 sn altı yanlış alarm üretir.',
  },
] as const;

/** Anahtar → tanım. Doğrulama ve panel bunun üzerinden çalışır. */
export const SETTINGS_BY_KEY: Readonly<Record<string, SettingDef>> = Object.freeze(
  Object.fromEntries(SETTINGS.map((s) => [s.key, s])),
);
