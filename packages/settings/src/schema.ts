/**
 * ⭐ AYAR KATALOĞU — panelden düzenlenebilen her sayı burada tanımlı.
 *
 * Faz 1 kapsamı: **işletim limitleri** (sohbet · bildirim · posta). Dünya hız çarpanları
 * BURADA DEĞİL — onlar `worlds` tablosunda kolon olarak duruyor ve zaten her sorguda
 * okunuyor; buraya kopyalamak ikinci bir doğruluk kaynağı yaratırdı.
 *
 * Sonraki fazlar bu listeyi büyütür: Faz 4 savaş motoru, Faz 5 katalog.
 */
import { derivedCatalogSettings } from './derived.ts';
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
    id: 'verify',
    label: 'Doğrulanmamış hesap',
    description: '⭐ E-postasını DOĞRULAMAMIŞ oyuncunun neye kadar gidebileceği. Amaç oyunu '
      + 'keşfetmesini engellemeden çoklu hesap kurmayı zahmetli kılmak: saldırı, nakliye, '
      + 'mesaj, ittifak ve şehir kurma kapalı; casusluk ve kendi şehirleri arasında destek '
      + 'açık. ⚠️ Sınırlar «büyük eşit» çalışır: oyuncu doğrulanmışken seviye 6 akademi '
      + 'yaptıysa ve sonra doğrulamayı kaybettiyse akademiyi KAYBETMEZ, sadece 7\'ye çıkamaz. '
      + 'Hiçbir şey geri alınmaz.',
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
    id: 'buildingTuning',
    label: 'Yapı fiyatları (tek tek)',
    description: '⭐ Her yapının kendi taban fiyatı, büyüme oranı ve süre çarpanı. '
      + 'Boş bıraktığın oran hücresi «Ekonomi ve süre» grubundaki genel oranı kullanır — '
      + 'yani genel düğme yaşamaya devam eder. ⚠️ Fiyatı değiştirmek süreyi de değiştirir '
      + '(süre fiyattan türüyor); yalnız süreyi oynatmak için «Süre çarpanı» sütunu var.',
  },
  {
    id: 'techTuning',
    label: 'Teknik fiyatları (tek tek)',
    description: '⭐ Her tekniğin kendi taban fiyatı, büyüme oranı ve süre çarpanı. '
      + 'Teknikler OYUNCUYA ait, şehre değil — bir teknik seviyesi tüm şehirlerde geçerli. '
      + 'Teknikte seviye tavanı yoktur, o yüzden büyüme oranı burada en sert düğme.',
  },
  {
    id: 'loot',
    label: 'Ganimet',
    description: 'Havuz + kaynak-bazlı yağma oranı (§13.10.4). Ölçüm değil TASARIM: '
      + 'ekonominin en doğrudan düğmesi burası.',
  },
] as const;

const STATIC_SETTINGS: readonly SettingDef[] = [
  /* ── Sohbet ──────────────────────────────────────────────────────────────── */
  {
    key: 'chat.burst',
    label: 'Kova: pencere başına mesaj',
    type: 'int', default: 5, min: 1, max: 100, tag: 'design', unit: 'adet',
    env: 'CHAT_RATE_BURST',
    description: 'Bir oyuncunun kısa bir süre içinde atabileceği en fazla mesaj. Büyütürsen spam '
      + 'kolaylaşır; küçültürsen hızlı yazan normal oyuncu da engellenir.',
  },
  {
    key: 'chat.perSeconds',
    label: 'Kova penceresi',
    type: 'int', default: 10, min: 1, max: 600, tag: 'design', unit: 'sn',
    env: 'CHAT_RATE_WINDOW_SECONDS',
    description: 'Yukarıdaki sayının ölçüldüğü süre. «5 mesaj / 10 saniye» gibi düşün. Büyütmek sınırı '
      + 'gevşetir, küçültmek sertleştirir.',
  },
  {
    key: 'chat.duplicateSeconds',
    label: 'Aynı metin bekleme süresi',
    type: 'int', default: 15, min: 0, max: 600, tag: 'design', unit: 'sn',
    env: 'CHAT_DUPLICATE_SECONDS',
    description: 'Aynı metni tekrar göndermek için beklenecek süre. 0 yazarsan bu kontrol kapanır.',
  },
  {
    key: 'chat.newPlayerHours',
    label: 'Acemi kısıtı',
    type: 'int', default: 12, min: 0, max: 720, tag: 'design', unit: 'sa',
    env: 'CHAT_DM_MIN_AGE_HOURS',
    description: 'Yeni oyuncunun kimseye ilk mesajı atamayacağı süre. Kendisine yazılana cevap verebilir. '
      + 'Büyütmek dolandırıcıyı zorlaştırır ama yeni oyuncuyu da yalnız bırakır.',
    note: 'Ölçüt hesabın yaşı değil, o DÜNYAYA katılma anı (`players.created_at`) — aynı hesapla '
      + 'yeni bir dünyaya giren yine acemi sayılır.',
  },
  {
    key: 'chat.pageSize',
    label: 'Geçmiş sayfa boyutu',
    type: 'int', default: 30, min: 5, max: 100, tag: 'design', unit: 'adet',
    env: 'CHAT_PAGE_SIZE',
    description: 'Sohbet penceresi bir seferde kaç eski mesaj çeker. Büyütmek geçmişi daha çok gösterir '
      + 'ama her açılışı yavaşlatır.',
  },

  /* ── Bildirim ────────────────────────────────────────────────────────────── */
  {
    key: 'notify.titleMax',
    label: 'Başlık uzunluğu',
    type: 'int', default: 60, min: 20, max: 200, tag: 'design', unit: 'karakter',
    description: 'Telefona giden bildirimin başlık uzunluğu. Uzun başlığı telefon zaten keser; biz '
      + 'kaynakta kesiyoruz ki nerede kesildiği belli olsun.',
  },
  {
    key: 'notify.bodyMax',
    label: 'Gövde uzunluğu',
    type: 'int', default: 120, min: 40, max: 400, tag: 'design', unit: 'karakter',
    description: 'Bildirim metninin uzunluğu. Başlıkla aynı mantık.',
  },
  {
    key: 'notify.productionCoalesceSeconds',
    label: 'Üretim bildirimi birleştirme',
    type: 'int', default: 600, min: 0, max: 86_400, tag: 'design', unit: 'sn',
    env: 'NOTIFY_PRODUCTION_COALESCE_SECONDS',
    description: 'Üretim bittiğinde art arda bildirim yağmasın diye bekleme süresi: bu pencerede oyuncuya '
      + 'TEK bildirim gider. 0 yazarsan her üretim ayrı bildirim olur.',
    note: 'Yalnız telefona giden push birleştirilir. Oyun açıkken görünen toast birleştirilmez — '
      + 'oyuncu ekranı açıkken her satırı görmek ister.',
  },
  {
    key: 'notify.sendTimeoutMs',
    label: 'Push zaman aşımı',
    type: 'int', default: 8000, min: 1000, max: 60_000, tag: 'design', unit: 'ms',
    env: 'NOTIFY_SEND_TIMEOUT_MS',
    description: 'Bildirim servisi cevap vermezse kaç milisaniye beklenir. Büyütmek yavaş servisi tolere '
      + 'eder ama bildirim kuyruğunu tıkayabilir.',
  },
  {
    key: 'notify.maxFailures',
    label: 'Ölü abonelik eşiği',
    type: 'int', default: 5, min: 1, max: 50, tag: 'design', unit: 'deneme',
    env: 'NOTIFY_MAX_FAILURES',
    description: 'Bir cihaza üst üste kaç kez bildirim gönderilemezse o kayıt silinir. Küçültmek ölü '
      + 'cihazları çabuk temizler ama geçici bir arızada gerçek cihazı da atar.',
    note: 'Tarayıcı «bu abonelik yok» (404/410) derse kayıt zaten anında silinir; bu eşik yalnız '
      + 'geçici hatalar için.',
  },

  /* ── E-posta ─────────────────────────────────────────────────────────────── */
  {
    key: 'mail.verifyTtlHours',
    label: 'Doğrulama bağlantısı ömrü',
    type: 'int', default: 24, min: 1, max: 720, tag: 'design', unit: 'sa',
    env: 'MAIL_VERIFY_TTL_HOURS',
    description: 'Hesap doğrulama bağlantısının kaç saat geçerli olduğu. Uzun tutmak oyuncuyu acele '
      + 'ettirmez; kısaltmanın pek bir güvenlik kazancı yok.',
  },
  {
    key: 'mail.resetTtlMinutes',
    label: 'Sıfırlama bağlantısı ömrü',
    type: 'int', default: 60, min: 5, max: 1440, tag: 'design', unit: 'dk',
    env: 'MAIL_RESET_TTL_MINUTES',
    description: 'Şifre sıfırlama bağlantısının kaç dakika geçerli olduğu. ⚠️ Kısa tut: bu bağlantı hesabı '
      + 'ele geçirmeye yeter, uzun ömür riski büyütür.',
  },
  {
    key: 'mail.resendCooldownSeconds',
    label: 'Tekrar gönderme bekleme süresi',
    type: 'int', default: 60, min: 0, max: 3600, tag: 'design', unit: 'sn',
    env: 'MAIL_RESEND_COOLDOWN_SECONDS',
    description: 'Aynı oyuncuya ikinci bir e-posta gönderilmeden önce beklenecek süre. «Tekrar gönder» '
      + 'düğmesine üst üste basılmasını engeller.',
  },
  {
    key: 'mail.dailyPerAccount',
    label: 'Hesap başına günlük',
    type: 'int', default: 10, min: 1, max: 200, tag: 'design', unit: 'adet',
    env: 'MAIL_DAILY_PER_ACCOUNT',
    description: 'Bir hesaba günde en fazla kaç e-posta. Hem maliyet hem de posta kutusunu bombalamaya '
      + 'karşı koruma.',
  },
  {
    key: 'mail.dailyPerIp',
    label: 'IP başına günlük',
    type: 'int', default: 30, min: 1, max: 500, tag: 'design', unit: 'adet',
    env: 'MAIL_DAILY_PER_IP',
    description: 'Aynı internet bağlantısından günde en fazla kaç e-posta. Farklı hesaplara dağıtılan '
      + 'bombardımanı yakalar.',
  },
  {
    key: 'mail.sendTimeoutMs',
    label: 'Gönderim zaman aşımı',
    type: 'int', default: 10_000, min: 1000, max: 60_000, tag: 'design', unit: 'ms',
    env: 'MAIL_SEND_TIMEOUT_MS',
    description: 'E-posta servisi cevap vermezse kaç milisaniye beklenir.',
  },

  /* ── Başlangıç kesesi ────────────────────────────────────────────────────────
   * ⚠️ `economy` grubunda çünkü `CatalogConfig.economy`ye oturuyor (anahtar eşlemesi
   * `settings/catalog.ts`teki iki seviyeli kuralla birebir).
   */
  {
    key: 'economy.startingGold',
    label: 'Başlangıç altını',
    type: 'int', default: 4000, min: 0, max: 100_000_000, tag: 'design', unit: 'altın',
    description: 'Yeni oyuncunun başkentine konan altın. Büyütürsen oyuncu ilk dakikalarda '
      + 'daha rahat başlar; küçültürsen ilk saatler beklemeyle geçer.',
    note: '4000 seçilmişti çünkü sıfır keseyle oyuncunun ilk gününde ~26 saat ölü zaman '
      + 'doğuyordu (§13.11.1a). ⚠️ Yalnız BAŞKENT alır; kurulan koloni sıfırla doğar ve o '
      + 'sayı ayarlanabilir DEĞİL — koloniye kese vermek «şehir kur → keseyi al → terk et» '
      + 'döngüsüyle sınırsız kaynak basmayı açardı.',
  },
  {
    key: 'economy.startingFood',
    label: 'Başlangıç yemeği',
    type: 'int', default: 4000, min: 0, max: 100_000_000, tag: 'design', unit: 'yemek',
    description: 'Yeni oyuncunun başkentine konan yemek. Altınla birlikte düşün: ilk '
      + 'yükseltmelerin çoğu ikisini birden istiyor.',
  },

  /* ── Doğrulanmamış hesap kısıtları ───────────────────────────────────────────
   *
   * ⚠️ **Sınırlar «≥» kurar** (kullanıcı şartı 2026-08-01): kapı "hedef seviye sınırı aşıyor
   * mu" diye DEĞİL, "mevcut seviye sınıra ULAŞTI mı" diye sorar. Fark, oyuncunun doğrulamayı
   * sonradan kaybettiği durumda ortaya çıkıyor (e-posta adresini değiştirince tam olarak bu
   * oluyor): elindekini kaybetmez, yalnız ilerleyemez. "Fazlasını geri al" seçeneği hem
   * kaynak iadesi sorusunu açardı hem de oyuncunun emeğini silerdi.
   */
  {
    key: 'verify.enabled',
    label: 'Kısıtlar açık',
    type: 'boolean', default: true, tag: 'design',
    description: 'Kapatırsan doğrulanmamış hesap her şeyi doğrulanmış gibi yapabilir. Açık '
      + 'tutmak sahte hesap üretmeyi zahmetli kılar; kapatmak yalnız test ya da acil durum için.',
    note: 'Tek anahtar bilerek: kısıtları tek tek kapatılabilir yapmak, hangi kombinasyonun '
      + 'açık kaldığını takip etmeyi imkânsız kılardı. Bir kısıt gereksizse sayısını yükselt.',
  },
  {
    key: 'verify.maxBuildingLevel',
    label: 'En yüksek yapı seviyesi',
    type: 'int', default: 3, min: 1, max: 40, tag: 'design', unit: 'sv',
    description: 'Doğrulanmamış oyuncunun yapılarını çıkarabileceği tavan. Büyütürsen oyunun '
      + 'daha çoğunu doğrulamadan görür; küçültürsen ilk dakikalarda duvara toslar.',
    note: '3 seçildi çünkü Kale 2 Akademi\'yi, Kale 3 + Mimar Okulu 3 Tapınak\'ı açıyor — '
      + 'yani oyuncu üretim, teknik ve kahraman mekaniklerinin üçünü de görebiliyor ama '
      + 'hiçbirinde ilerleyemiyor.',
  },
  {
    key: 'verify.maxTechLevel',
    label: 'En yüksek teknik seviyesi',
    type: 'int', default: 3, min: 1, max: 30, tag: 'design', unit: 'sv',
    description: 'Akademideki tekniklerin tavanı. Yapı tavanıyla aynı tutulması mantıklı: '
      + 'ikisi de "oyunu gör ama ilerleme" çizgisini çiziyor.',
    note: '⚠️ Sömürgecilik de bir teknik ve 3\'e çıkabiliyor → `maxCities` formülü ikinci '
      + 'şehre izin verirdi. Bu yüzden şehir kurma AYRICA yasak (tavanı yükseltmek o kapıyı '
      + 'açmaz).',
  },
  {
    key: 'verify.maxDefenseLevel',
    label: 'En yüksek Sur / Büyü Kalkanı',
    type: 'int', default: 3, min: 1, max: 20, tag: 'design', unit: 'sv',
    description: 'Sur ve Büyü Kalkanı seviyesinin tavanı. Adetli savunma birimleri '
      + '(Okçu Kulesi, Tuzak…) doğrulanmamış hesapta ZATEN tamamen kapalı.',
  },
  {
    key: 'verify.maxWarriors',
    label: 'En çok savaşçı',
    type: 'int', default: 200, min: 1, max: 100_000, tag: 'design', unit: 'adet',
    description: 'Doğrulanmamış oyuncunun sahip olabileceği toplam savaşçı. Sayıma barakadaki, '
      + 'mağaradaki, yoldaki ve üretim kuyruğundaki savaşçıların hepsi girer.',
    note: '⚠️ Dördünün de sayılması şart: yalnız baraka sayılsaydı "üret → gönder → yine üret" '
      + 'döngüsüyle sınırsız ordu kurulabilirdi ve limit hiçbir şey ifade etmezdi.',
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
    description: 'Sur\'un her seviyesi savunmayı kaç kat güçlendirir. 1,8 = her seviye %80 daha güçlü. ⚠️ '
      + 'Seviye 40\'a kadar çıktığı için buradaki minik bir değişiklik üst seviyelerde devasa fark '
      + 'yaratır.',
    note: 'Binary\'den ölçüldü (FUN_00413610/41338c): 1,8. Büyü Kalkanı da aynı formülü kullanıyor.',
  },
  {
    key: 'combat.magicShieldBase',
    label: 'Büyü Kalkanı üs tabanı',
    type: 'number', default: 1.8, min: 1, max: 3, tag: 'measured',
    description: 'Büyü Kalkanı\'nın her seviyesi büyü savunmasını kaç kat güçlendirir. Sur\'un büyü '
      + 'fazındaki ikizi.',
    note: 'Kalkan pasif bir çarpan DEĞİL, Sur ile aynı formülün büyü fazındaki hâli. Binary\'de 1,8.',
  },
  {
    key: 'combat.shieldCal',
    label: 'Şaman kalkanı katsayısı',
    type: 'number', default: 1.0, min: 0.5, max: 1.5, tag: 'measured',
    description: 'Şaman\'ın kalkan büyüsünün gücünü ölçekler. 1 = binary\'deki hâli.',
    note: 'Bir ara 0,85 sanılıyordu; 8 ölçümlük kalkan serisi 1,0\'ı kesinleştirdi (hata payı 40,8 → '
      + '0,53 puana düştü).',
  },
  {
    key: 'combat.counterK',
    label: 'Karşı-yön kalibrasyonu',
    type: 'number', default: 1.0, min: 0.8, max: 1.2, tag: 'measured',
    description: 'Savunanın saldırana verdiği hasarın ince ayarı. 1 = düzeltme yok.',
    note: '24 ölçümde net minimum K = 1,0; eski 1,01 yaması kaldırıldı.',
  },
  {
    key: 'combat.nightBase',
    label: 'Gece taban çarpanı',
    type: 'number', default: 0.7, min: 0.1, max: 1, tag: 'measured',
    description: 'Gece görüşü olmayan ordunun gece savaşındaki güç oranı. 0,7 = gücünün %70\'iyle savaşır. '
      + 'Küçültmek geceyi daha tehlikeli yapar, Gece Görüşü tekniğini değerlendirir.',
    note: 'Taşıma kapasitesini ETKİLEMEZ — 2026-07-31\'de binary + ölçümle kesinleşti.',
  },
  {
    key: 'combat.repairMin',
    label: 'Yapı onarımı — alt sınır',
    type: 'number', default: 0.76, min: 0, max: 1, tag: 'measured',
    description: 'Savaşta hasar gören bir yapının en az ne kadarının kendiliğinden onarıldığı. 0,76 = en '
      + 'kötü ihtimalle %76\'sı geri gelir.',
    note: '⚠️ Oyunun kendi metni «%50-70» diyor ama 12 ölçüm 0,75–0,81 aralığını gösterdi; %50-70 '
      + 'ölçümün en düşüğüne bile ulaşamıyor. Ölçüm esas alındı.',
  },
  {
    key: 'combat.repairMax',
    label: 'Yapı onarımı — üst sınır',
    type: 'number', default: 0.81, min: 0, max: 1, tag: 'measured',
    description: 'En iyi ihtimalle ne kadarının onarıldığı. Her yapı türü için ayrı zar atılır. Alt '
      + 'sınırdan küçük olamaz.',
  },
  {
    key: 'combat.defenseFloorEnabled',
    label: 'Savunma tabanı açık',
    type: 'boolean', default: true, tag: 'design',
    description: 'Açıkken her savunma birimi türünden savaş sonrası birkaç tane hayatta kalır. Kapatırsan '
      + 'tek bir saldırı savunmayı sıfıra indirebilir.',
  },
  {
    key: 'combat.defenseFloorMin',
    label: 'Savunma tabanı — tip başına',
    type: 'int', default: 4, min: 0, max: 100, tag: 'design', unit: 'adet',
    description: 'Yukarıdaki koruma açıkken tür başına kaç birim hayatta kalır. Savaş öncesi adedinden '
      + 'fazlasını yaratmaz.',
    note: 'Tuzak hariç — tuzak tek kullanımlık mühimmat, geri kalması anlamsız olurdu.',
  },
  {
    key: 'combat.trapTriggerMin',
    label: 'Tuzak tetiklenme — alt',
    type: 'number', default: 0.75, min: 0, max: 1, tag: 'design',
    description: 'Savaşta tuzakların en az ne kadarı patlar. 0,75 = en az %75\'i.',
  },
  {
    key: 'combat.trapTriggerMax',
    label: 'Tuzak tetiklenme — üst',
    type: 'number', default: 0.99, min: 0, max: 1, tag: 'design',
    description: 'En fazla ne kadarı patlar. Aradaki fark rastgele belirlenir.',
  },
  {
    key: 'combat.trapPerGroundUnit',
    label: 'Tuzak doygunluğu',
    type: 'number', default: 0.2, min: 0.01, max: 5, tag: 'design',
    description: 'Bir tuzağın kaç yaya düşman birimini durdurabildiği. Büyütmek tuzağı güçlendirir.',
  },
  {
    key: 'combat.trapGnomeDisarm',
    label: 'Gnom başına etkisiz tuzak',
    type: 'number', default: 1.5, min: 0, max: 20, tag: 'design', unit: 'adet',
    description: 'Bir Gnom\'un etkisiz hâle getirdiği tuzak sayısı. Büyütmek Gnom\'u tuzağa karşı daha '
      + 'değerli yapar.',
  },
  {
    key: 'combat.trapPower',
    label: 'Tuzak salvo şiddeti',
    type: 'number', default: 1.0, min: 0, max: 5, tag: 'design',
    description: 'Patlayan tuzak başına düşmana verilen hasar.',
  },
  {
    key: 'combat.gnomeSabotagePerStruct',
    label: 'Gnom sabotajı — yapı başına',
    type: 'number', default: 4, min: 0, max: 100, tag: 'design',
    description: 'Bir savunma yapısını sabote etmek için gereken Gnom sayısı. Küçültmek sabotajı '
      + 'ucuzlatır.',
  },
  {
    key: 'combat.gnomeSabotageMax',
    label: 'Gnom sabotajı — tavan',
    type: 'number', default: 0.35, min: 0, max: 1, tag: 'design',
    description: 'Tek savaşta sabote edilebilecek en fazla yapı oranı. 1 = hepsi sabote edilebilir.',
  },
  {
    key: 'combat.debrisRate',
    label: 'Enkaz oranı',
    type: 'number', default: 0.3, min: 0, max: 1, tag: 'design',
    description: 'Yıkılan savunma yapılarının kaçta kaçının enkaz olarak geri geldiği.',
  },
  {
    key: 'combat.combatThreshold',
    label: 'Yenik eşiği',
    type: 'number', default: 0, min: 0, max: 1, tag: 'design',
    description: 'Savaşın bittiği kabul edilen güç oranı. Bir taraf bu oranın altına düşünce tur biter.',
  },

  /* ── Kahraman ────────────────────────────────────────────────────────────── */
  {
    key: 'hero.levelBase',
    label: 'Seviye üs tabanı',
    type: 'number', default: 1.07, min: 1, max: 2, tag: 'measured',
    description: 'Kahramanın her seviyesinin savaş gücüne katkı tabanı. Büyütmek kahramanları orduya göre '
      + 'daha belirleyici yapar.',
    note: '60\'tan fazla ölçümle doğrulandı.',
  },
  {
    key: 'hero.skillK',
    label: 'Yetenek katsayısı (fiziksel)',
    type: 'number', default: 4.8, min: 0, max: 50, tag: 'measured',
    description: 'Kahramanın fiziksel yetenek puanlarının güce dönüşme katsayısı.',
  },
  {
    key: 'hero.skillKMagic',
    label: 'Yetenek katsayısı (büyü)',
    type: 'number', default: 1.0, min: 0, max: 50, tag: 'design',
    description: 'Aynısının büyü tarafı. Ayrı tutuluyor çünkü büyü fazı ayrı hesaplanıyor.',
  },
  {
    key: 'hero.mDefLevelBase',
    label: 'mDef seviye üssü',
    type: 'number', default: 1.06, min: 1, max: 2, tag: 'measured',
    description: 'Kahramanın dayanıklılığının seviyeyle büyüme tabanı.',
  },
  {
    key: 'hero.areaK',
    label: 'Alan katsayısı',
    type: 'number', default: 0.005, min: 0, max: 1, tag: 'measured',
    description: 'Kahramanın ordu içindeki «alan» ağırlığı — savaş gücü payını belirler.',
  },
  {
    key: 'hero.durumScale',
    label: 'Durum düşüş ölçeği',
    type: 'number', default: 100, min: 1, max: 1000, tag: 'measured',
    description: 'Kahramanın can/durum yüzdesinin güce etkisi.',
  },
  {
    key: 'hero.pointsPerLevel',
    label: 'Seviye başına puan',
    type: 'int', default: 3, min: 1, max: 20, tag: 'measured', unit: 'puan',
    description: 'Kahraman seviye atlayınca kaç yetenek puanı kazanır. Büyütmek kahramanları hızla '
      + 'güçlendirir.',
  },
  {
    key: 'hero.xpWinner',
    label: 'Tecrübe payı — kazanan',
    type: 'number', default: 2 / 3, min: 0, max: 1, tag: 'design',
    description: 'Savaşı kazanan tarafın kahramanına giden tecrübe payı.',
  },
  {
    key: 'hero.xpLoser',
    label: 'Tecrübe payı — kaybeden',
    type: 'number', default: 1 / 3, min: 0, max: 1, tag: 'design',
    description: 'Kaybeden tarafın payı. İkisinin toplamı savaşın ürettiği tecrübeyi bölüştürür.',
  },

  /* ── Kahraman çıkma ──────────────────────────────────────────────────────── */
  {
    key: 'capture.perTempleLevel',
    label: 'Tapınak seviyesi başına puan',
    type: 'number', default: 10, min: 0, max: 1000, tag: 'measured',
    description: 'Tapınağın her seviyesi savaş sonrası kahraman çıkma ihtimalini ne kadar artırır.',
    note: '28 ölçümün 28\'i tuttu; hepsi binary sabiti.',
  },
  {
    key: 'capture.perHeroPenalty',
    label: 'Mevcut kahraman cezası',
    type: 'number', default: 155, min: 0, max: 10_000, tag: 'measured',
    description: 'Zaten sahip olunan her kahraman, yeni kahraman çıkma ihtimalini ne kadar düşürür. '
      + 'Kahraman biriktirmeyi frenler.',
  },
  {
    key: 'capture.xpScale',
    label: 'Tecrübe çarpanı',
    type: 'number', default: 0.000025, min: 0, max: 1, tag: 'measured',
    description: 'Savaşın büyüklüğünün (kazanılan tecrübenin) çıkma ihtimaline etkisi. Büyük savaş = daha '
      + 'yüksek şans.',
  },
  {
    key: 'capture.xpGate',
    label: 'Tecrübe alt eşiği',
    type: 'number', default: 499, min: 0, max: 100_000, tag: 'measured', unit: 'XP',
    description: 'Bu tecrübenin altındaki savaşlardan kahraman çıkmaz. Küçük çarpışmalarla kahraman '
      + 'avlamayı engeller.',
  },
  {
    key: 'capture.maxHeroes',
    label: 'En fazla kahraman',
    type: 'int', default: 5, min: 1, max: 50, tag: 'design', unit: 'adet',
    description: 'Bir oyuncunun sahip olabileceği en fazla kahraman sayısı.',
  },

  /* ── Ganimet ─────────────────────────────────────────────────────────────── */
  {
    key: 'loot.plunderRate',
    label: 'Yağma tavan oranı',
    type: 'number', default: 0.4, min: 0, max: 1, tag: 'design',
    description: 'Kazanan tarafın savunanın kaynağının kaçta kaçını yağmaladığı. ⭐ Ekonominin en doğrudan '
      + 'düğmesi: büyütmek saldırıyı kârlı, küçültmek üretimi değerli kılar.',
  },
  {
    key: 'loot.povertyThreshold',
    label: 'Zenginlik eşiği',
    type: 'int', default: 100_000, min: 0, max: 100_000_000, tag: 'design', unit: 'kaynak',
    description: 'Bu miktarın altında kaynağı olan oyuncudan yağma oranı düşer — yeni ve fakir oyuncuyu '
      + 'tamamen boşaltmamak için.',
  },
  {
    key: 'loot.floorThreshold',
    label: 'Yoksulluk eşiği',
    type: 'int', default: 5_000, min: 0, max: 10_000_000, tag: 'design', unit: 'kaynak',
    description: 'Yağma sonrası savunanda en az bu kadar kaynak kalır.',
  },
  {
    key: 'loot.minRate',
    label: 'Taban oran',
    type: 'number', default: 0.20, min: 0, max: 1, tag: 'design',
    description: 'Fakirlik indirimi uygulansa bile yağma oranı bunun altına inmez.',
  },
  {
    key: 'loot.jitterMin',
    label: 'Rastgelelik — alt',
    type: 'number', default: 0.85, min: 0.1, max: 2, tag: 'design',
    description: 'Yağmaya eklenen rastgeleliğin alt sınırı. Aynı savaş her seferinde birebir aynı ganimeti '
      + 'vermesin diye.',
  },
  {
    key: 'loot.jitterMax',
    label: 'Rastgelelik — üst',
    type: 'number', default: 1.15, min: 0.1, max: 3, tag: 'design',
    description: 'Rastgeleliğin üst sınırı.',
  },

  /* ── Ekonomi ve süre (Faz 5) ─────────────────────────────────────────────── */
  {
    key: 'economy.foodBase',
    label: 'Çiftlik taban üretimi',
    type: 'number', default: 6, min: 0.1, max: 1000, tag: 'measured', unit: 'yemek/sa',
    description: 'Çiftliğin 1. seviyedeki saatlik yemek üretimi. Tüm üretim eğrisi bunun üstüne kurulu.',
    note: '40 seviyenin 40\'ında orijinal oyunla birebir doğrulandı.',
  },
  {
    key: 'economy.foodRate',
    label: 'Çiftlik büyüme oranı',
    type: 'number', default: 1.16, min: 1, max: 2, tag: 'measured',
    description: 'Çiftliğin her seviyesi üretimi kaç kat artırır. 1,16 = her seviye %16 daha çok yemek. '
      + 'Büyütmek oyunu hızlandırır, küçültmek yavaşlatır.',
  },
  {
    key: 'economy.goldBase',
    label: 'Maden taban üretimi',
    type: 'number', default: 5, min: 0.1, max: 1000, tag: 'measured', unit: 'altın/sa',
    description: 'Madenin 1. seviyedeki saatlik altın üretimi.',
  },
  {
    key: 'economy.goldRate',
    label: 'Maden büyüme oranı',
    type: 'number', default: 1.15, min: 1, max: 2, tag: 'measured',
    description: 'Madenin seviye başına üretim artışı.',
  },
  {
    key: 'economy.buildingCostRate',
    label: 'Yapı maliyet oranı',
    type: 'number', default: 1.8, min: 1, max: 3, tag: 'design',
    description: 'Yapıların her seviyesi bir öncekine göre kaç kat pahalı. 1,8 = her seviye %80 zam. ⭐ '
      + 'Oyunun temposunu belirleyen en sert düğme: büyütmek üst seviyeleri erişilemez yapar, '
      + 'küçültmek oyunu çabuk bitirir.',
    note: 'Çiftlik ve Maden bu orana DAHİL DEĞİL — onların kendi oranı var (aşağıda). Tek tek yapı '
      + 'oranı istersen «Yapı fiyatları» grubundaki Oran sütununu kullan.',
  },
  {
    key: 'economy.economyCostRate',
    label: 'Çiftlik/Maden maliyet oranı',
    type: 'number', default: 1.33, min: 1, max: 3, tag: 'design',
    description: 'Çiftlik ve Maden\'in maliyet artış oranı. Diğer yapılardan ayrı ve daha düşük, çünkü '
      + 'onlar 40 seviyeye kadar çıkıyor.',
    note: '⚠️ 1,45 DEĞİL 1,33. Oyunun kendi dokümanı 1,45 yazıyor ama o oran orijinalin bilinmeyen '
      + 'tabanlarına aitti. Bizim tavanımız 40 ve 1,45 ile seviye 40 ekonomik olarak ULAŞILAMAZ '
      + 'oluyordu (190 milyon kaynak, ~1 yıl geri ödeme). 1,33 ile 7,1 milyon ve 20–36 gün.',
  },
  {
    key: 'economy.techCostRate',
    label: 'Teknik maliyet oranı',
    type: 'number', default: 1.5, min: 1, max: 3, tag: 'design',
    description: 'Tekniklerin seviye başına maliyet artışı. ⚠️ Tekniklerde seviye tavanı YOK, o yüzden bu '
      + 'oran uzun vadede en belirleyici sayı.',
  },
  {
    key: 'economy.timeDecayRate',
    label: 'Süre kısaltma oranı',
    type: 'number', default: 1.2, min: 1, max: 3, tag: 'design',
    description: 'Hızlandırıcı yapının (Mimar Okulu, Akademi, Baraka) her seviyesi süreyi kaça böler. 1,2 '
      + '= her seviye %20 hızlandırır.',
    note: 'Orijinalde 1,4\'tü ve bu yirmi seviyede 836 kat demekti — tek bir yapı oyunun kaderini '
      + 'belirliyor, seviye 1\'deki oyuncu hiçbir şey üretemiyordu. 1,2 ile yirmi seviye 32 kat: '
      + 'hissedilir ama tek eksenli değil.',
  },
  {
    key: 'economy.timeExponent',
    label: 'Süre üssü',
    type: 'number', default: 0.8, min: 0.1, max: 2, tag: 'design',
    description: 'Fiyatın süreye dönüşme eğrisi. 1\'den küçük olması pahalı birimi saniye başına daha '
      + 'verimli yapar — Ejderha, Cüce\'nin 100 katı fiyata 39 katı süre alır.',
    note: '0,8 orijinal kaynağın kendi üssü. 1,0 olsaydı birim seçimi yalnız maliyet verimliliğine '
      + 'inerdi ve elit birimlerin anlamı kalmazdı.',
  },
  {
    key: 'economy.unitTimeFactor',
    label: 'Birim süre katsayısı',
    type: 'number', default: 190, min: 1, max: 10000, tag: 'design',
    description: 'Asker ve savunma birimi üretim süresinin genel katsayısı. Büyütmek tüm ordu üretimini '
      + 'yavaşlatır.',
  },
  {
    key: 'economy.structureTimeFactor',
    label: 'Yapı süre katsayısı',
    type: 'number', default: 400, min: 1, max: 20000, tag: 'design',
    description: 'Yapı, teknik, Sur ve Kalkan sürelerinin genel katsayısı. Büyütmek tüm inşaatı '
      + 'yavaşlatır.',
  },
  {
    key: 'economy.timeDivisorRate',
    label: 'Süre böleni tabanı',
    type: 'number', default: 1.4, min: 1, max: 3, tag: 'design',
    description: 'Süre bölme modelinin taban oranı (emekli model; bugünkü hesapta kullanılmıyor).',
  },
  {
    key: 'economy.carryTimeWeight',
    label: 'Taşıma kapasitesi ağırlığı',
    type: 'number', default: 1, min: 0, max: 10, tag: 'design',
    description: 'Birimin taşıma kapasitesinin üretim süresine katkı ağırlığı. Büyütmek Yük Arabası gibi '
      + 'taşıyıcıları pahalı/uzun yapar.',
  },
  {
    key: 'economy.buildingCostMultiplier',
    label: 'Yapı fiyat çarpanı',
    type: 'number', default: 1, min: 0.01, max: 100, tag: 'design',
    description: 'TÜM yapı fiyatlarını topluca ölçekler. 2 yazarsan her yapı iki katına çıkar, eğri aynı '
      + 'kalır.',
    note: 'Tek tek yapı fiyatı için «Yapı fiyatları (tek tek)» grubunu kullan — orada boş '
      + 'bıraktığın hücre bu çarpanı kullanmaya devam eder.',
  },
  {
    key: 'economy.unitCostMultiplier',
    label: 'Birim fiyat çarpanı',
    type: 'number', default: 1, min: 0.01, max: 100, tag: 'design',
    description: 'TÜM birim fiyatlarını topluca ölçekler. Puan hesabı da bu çarpanı kullanır, yani ordu '
      + 'kaybı da orantılı puan götürür.',
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
    description: 'Mağaranın 1. seviyedeki kapasitesi (alan cinsinden). Her seviye iki katına çıkar.',
    note: 'Kapasite tablosunun 20 satırının 20\'si bu formülle tuttu.',
  },
  {
    key: 'cave.breakBase',
    label: 'Yıkma tabanı',
    type: 'number', default: 100, min: 1, max: 1000000, tag: 'measured', unit: 'cüce',
    description: 'Seviye 1 mağarayı yıkmak için gereken cüce sayısı.',
    note: 'Cüce tablosunun 120 hücresinin 119\'u tuttu; tek uyuşmayan hücre tablonun kendi içinde de '
      + 'tutarsız (basım hatası kabul edildi).',
  },
  {
    key: 'cave.breakRate',
    label: 'Yıkma büyüme oranı',
    type: 'number', default: 1.5, min: 1, max: 5, tag: 'measured',
    description: 'Mağaranın her seviyesi yıkmak için gereken cüce sayısını kaç kat artırır.',
  },
  {
    key: 'cave.blacksmithingRelief',
    label: 'Demircilik indirimi',
    type: 'number', default: 0.05, min: 0, max: 1, tag: 'measured',
    description: 'Demircilik tekniğinin her seviyesi mağara yıkmayı ne kadar kolaylaştırır. 0,05 = seviye '
      + 'başına %5 indirim.',
    note: '⚠️ Bu bir TOPLAMSAL payda (1 + 0,05×seviye), üssel değil. Ayrım büyük: Demircilik 30\'da '
      + 'üssel model 0,21 verirken gerçek tablo 0,40 diyor.',
  },
  {
    key: 'cave.transferFactor',
    label: 'Doldurma/boşaltma katsayısı',
    type: 'number', default: 25, min: 1, max: 1000, tag: 'design',
    description: 'Mağarayı doldurma/boşaltma süresinin genel katsayısı. 25 ile seviye 1\'de dolu bir mağara '
      + '2 dk 57 sn\'de dolar.',
  },
  {
    key: 'cave.transferDecayRate',
    label: 'Doldurma kısalma oranı',
    type: 'number', default: 1.1, min: 1, max: 3, tag: 'design',
    description: 'Mağaranın her seviyesi doldurma/boşaltmayı ne kadar hızlandırır. 1,1 = seviye başına '
      + '%10.',
  },
  {
    key: 'cave.minTransferSeconds',
    label: 'En kısa transfer',
    type: 'int', default: 5, min: 0, max: 3600, tag: 'design', unit: 'sn',
    description: 'Tek birimlik bir transfer bile bu süreden kısa olamaz — anlık giriş-çıkış istismarını '
      + 'engeller.',
  },
  {
    key: 'cave.repairBaseSeconds',
    label: 'Onarım tabanı',
    type: 'int', default: 72000, min: 60, max: 604800, tag: 'design', unit: 'sn',
    description: 'Yıkılan mağaranın onarım süresi (seviye 1 için). 20 saat.',
    note: 'Bir ara 26 saatti; 2026-07-28\'de indirildi çünkü mağara yıkılınca oyuncunun en değerli '
      + 'ordusu bir gün boyunca korumasız kalıyordu.',
  },
  {
    key: 'cave.repairDecayRate',
    label: 'Onarım kısalma oranı',
    type: 'number', default: 0.9, min: 0.1, max: 1, tag: 'design',
    description: 'Mağaranın her seviyesi onarımı ne kadar kısaltır. 0,9 = seviye başına %10 daha hızlı.',
    note: 'Dokümanda böyle bir bilgi yok, bilerek eklendi: mağarayı yükseltmek yalnız kapasite '
      + 'değil dayanıklılık da kazandırmalı.',
  },

  /* ── Sur onarımı ─────────────────────────────────────────────────────────── */
  {
    key: 'wall.repairBaseSeconds',
    label: 'Sur onarım tabanı',
    type: 'int', default: 43200, min: 60, max: 604800, tag: 'design', unit: 'sn',
    description: 'Tamamen yıkılmış seviye 1 surun kendini onarma süresi (12 saat). Süre alınan hasarla '
      + 'orantılı: %20\'ye düşmüş sur, %70\'te kalandan çok daha uzun sürer.',
  },
  {
    key: 'wall.repairDecayRate',
    label: 'Sur onarım kısalma oranı',
    type: 'number', default: 0.92, min: 0.1, max: 1, tag: 'design',
    description: 'Surun her seviyesi onarımı ne kadar kısaltır. Seviye 20 sur 2 sa 28 dk\'da toparlanır.',
    note: 'Dokümanda yok, bilerek eklendi: suru yükseltmek toparlanma hızı da kazandırmalı.',
  },

  /* ── Bakım ve saklama (§admin Faz 8) ─────────────────────────────────────── */
  {
    key: 'ops.messagesReadDays',
    label: 'Okunmuş rapor saklama',
    type: 'int', default: 60, min: 1, max: 3650, tag: 'design', unit: 'gün',
    description: 'OKUNMUŞ savaş/casus raporları kaç gün sonra silinebilir. Küçültmek veri tabanını '
      + 'küçültür ama oyuncunun geçmişini kısaltır.',
    note: 'Okunmamış raporlar bu kuraldan MUAF — oyuncunun hiç görmediği bir raporu silmek, veriyi '
      + 'değil ne olduğunu öğrenme hakkını siler.',
  },
  {
    key: 'ops.messagesAnyDays',
    label: 'Okunmamış rapor tavanı',
    type: 'int', default: 365, min: 1, max: 3650, tag: 'design', unit: 'gün',
    description: 'Okunmamış raporlar için sert tavan. Bu olmasaydı oyunu bırakmış bir hesabın kutusu '
      + 'sonsuza kadar büyürdü.',
  },
  {
    key: 'ops.chatDays',
    label: 'Sohbet saklama',
    type: 'int', default: 30, min: 1, max: 3650, tag: 'design', unit: 'gün',
    description: 'Sohbet mesajları kaç gün saklanır. Sohbet akıştır, arşiv değil.',
    note: 'Sabitlenmiş mesajlar muaf — ittifak kuralları genelde sabitlenmiş bir mesajda durur.',
  },
  {
    key: 'ops.outboxDays',
    label: 'Teslim edilmiş outbox saklama',
    type: 'int', default: 7, min: 1, max: 365, tag: 'design', unit: 'gün',
    description: 'Teslim EDİLMİŞ bildirim kayıtları kaç gün sonra silinir.',
    note: '⚠️ Teslim edilmemiş satır yaşı ne olursa olsun silinmez: bekleyen bir bildirimi '
      + 'kaybetmek, temizliğin üretebileceği en kötü sonuç.',
  },
  {
    key: 'ops.emailTokenDays',
    label: 'E-posta jetonu saklama',
    type: 'int', default: 7, min: 1, max: 365, tag: 'design', unit: 'gün',
    description: 'Süresi geçmiş veya kullanılmış e-posta bağlantıları kaç gün sonra silinir. Jeton zaten '
      + 'işlevsiz, satır yalnız yer kaplıyor.',
  },
  {
    key: 'ops.pushDeadDays',
    label: 'Ölü push aboneliği saklama',
    type: 'int', default: 30, min: 1, max: 365, tag: 'design', unit: 'gün',
    description: 'Ölü sayılan bildirim abonelikleri kaç gün sonra silinir.',
  },
  {
    key: 'ops.pushFailThreshold',
    label: 'Ölü sayılma eşiği',
    type: 'int', default: 5, min: 1, max: 100, tag: 'design', unit: 'hata',
    description: 'Bir abonelik kaç arka arkaya hatadan sonra ölü sayılır.',
  },
  {
    key: 'ops.rankingRunDays',
    label: 'Sıralama koşusu saklama',
    type: 'int', default: 90, min: 1, max: 3650, tag: 'design', unit: 'gün',
    description: 'Sıralama koşusu geçmişi kaç gün saklanır (günde 3 satır/dünya).',
    note: '⚠️ Temizlenen tablo koşu GEÇMİŞİ; sıralamanın kendisi her anlık görüntüde üzerine '
      + 'yazılıyor, büyümüyor ve hiç silinmiyor.',
  },
  {
    key: 'ops.sessionDays',
    label: 'Ölü oturum saklama',
    type: 'int', default: 90, min: 1, max: 3650, tag: 'design', unit: 'gün',
    description: 'İptal edilmiş veya süresi geçmiş oturum kayıtları kaç gün saklanır. En hızlı büyüyen '
      + 'tablo burası.',
    note: 'Canlı oturumlar etkilenmez: aktif bir satırın son kullanma tarihi gelecekte ve iptal '
      + 'kaydı boştur, iki koşula da girmez. Oyuncu temizlikten sonra oturumundan DÜŞMEZ.',
  },
  {
    key: 'ops.cleanupBatch',
    label: 'Tek koşuda en fazla satır',
    type: 'int', default: 20000, min: 100, max: 1000000, tag: 'design', unit: 'satır',
    description: 'Bir temizlik koşusunda en fazla kaç satır silinir. ⚠️ Güvenlik freni: milyonluk tek bir '
      + 'silme tabloyu kilitler ve oyunu durdurur. Tavan aşılırsa kalan bir sonraki koşuya '
      + 'bırakılır.',
  },
  {
    key: 'ops.staleHeartbeatS',
    label: 'Nabız bayatlama eşiği',
    type: 'int', default: 30, min: 5, max: 3600, tag: 'design', unit: 'sn',
    description: 'Bir sunucu döngüsünün nabzı kaç saniye güncellenmezse «ölü» sayılır. Nabız 5 saniyede '
      + 'bir yazıldığı için 30 sn altı yanlış alarm üretir.',
  },
] as const;

/**
 * ⭐ Statik liste + **katalogdan türetilenler**.
 *
 * ⚠️ Türetme `derived.ts`te ve elle yazılmadı: 84 satırlık el yazımı bir blok, `buildings.ts`
 * bir gün değiştiğinde panelde yalan söylerdi (varsayılan kopyası bayatlar).
 */
export const SETTINGS: readonly SettingDef[] = [
  ...STATIC_SETTINGS,
  ...derivedCatalogSettings(),
];

/** Anahtar → tanım. Doğrulama ve panel bunun üzerinden çalışır. */
export const SETTINGS_BY_KEY: Readonly<Record<string, SettingDef>> = Object.freeze(
  Object.fromEntries(SETTINGS.map((s) => [s.key, s])),
);
