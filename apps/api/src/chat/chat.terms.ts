/**
 * ⭐⭐ SOHBET KURALLARI — metnin ve sürümün **TEK KAYNAĞI**.
 *
 * Kullanıcı isteği (2026-08-21): *"DM ve ittifak sohbetinde ilk mesajdan önce kural onayı."*
 * Metni yazma işi 2026-08-22'de bana devredildi: *"Sohbet uyarı metinlerini sen oluştur
 * şimdilik, ben gerekli görürsem üzerinde değişiklik yaparım."*
 *
 * ─ ⚠️ NEDEN SUNUCUDA ─────────────────────────────────────────────────────────────────────
 * İki istemci **aynı** metni göstermek zorunda: onay hukuki bir kabul ve web'de bir şeyi,
 * uygulamada başka bir şeyi onaylatmak kaydı değersiz kılar. Metni iki istemciye kopyalamak
 * yerine uçtan veriliyor; sürüm numarası da metinle birlikte dönüyor.
 *
 * ─ ⚠️⚠️ SÜRÜMÜ ARTIRMANIN BEDELİ ────────────────────────────────────────────────────────
 * `CHAT_TERMS_VERSION` artınca **herkes** yeniden onaylıyor: DM'lerde her yazışma için
 * ayrı ayrı. Yani sürüm yalnız metnin ANLAMI değiştiğinde artırılmalı; yazım düzeltmesi,
 * noktalama, sıralama için ARTIRILMAZ. Sektör standardı da bu.
 *
 * ─ ⚠️ YAZIM ─────────────────────────────────────────────────────────────────────────────
 * Oyuncuya görünen metinde tire/çizgi yok (depo kuralı). Maddeler kısa: okunmayan bir kural
 * metni onaylanmış sayılmaz, yalnız tıklanmış olur.
 */

/**
 * Onaylanan kural sürümü.
 *
 * ⚠️ `0` "hiç onaylanmadı" demek ve veritabanı varsayılanı da o; bu yüzden gerçek sürümler
 * **1'den** başlıyor.
 */
export const CHAT_TERMS_VERSION = 1;

export interface ChatTerms {
  version: number;
  title: string;
  intro: string;
  items: readonly string[];
  confirmLabel: string;
}

export const CHAT_TERMS: ChatTerms = {
  version: CHAT_TERMS_VERSION,
  title: 'Sohbet kuralları',
  intro:
    'Yazışmaya başlamadan önce bu kuralları kabul etmen gerekiyor. Kurallar hem özel '
    + 'mesajlarda hem ittifak sohbetinde geçerli.',
  items: [
    'Hakaret, tehdit ve nefret söylemi yasak. Kimseye ırkı, dini, cinsiyeti ya da kimliği '
      + 'üzerinden saldırma.',
    'Kimseden kişisel bilgi isteme, kendi bilgilerini de paylaşma. Adres, telefon numarası '
      + 've parolanın sohbette yeri yok.',
    'Hesap alışverişi, reklam ve dış bağlantı paylaşımı yasak.',
    'Oyun içi rekabet oyun içinde kalır. Oyun dışına taşan tehdit ve taciz kural ihlalidir; '
      + 'böyle bir mesaj alırsan Destek üzerinden bize bildir.',
    'Yazdıkların kayıt altında tutuluyor ve bir şikayet geldiğinde yönetim tarafından '
      + 'okunabiliyor.',
    'Kuralları çiğneyen hesap sohbetten süreli ya da kalıcı olarak çıkarılabilir.',
  ],
  confirmLabel: 'Kuralları kabul ediyorum',
};

/** Onay yeterli mi? ⚠️ `>=`, `==` DEĞİL: sürüm ileride geri alınırsa kimse yeniden sorulmasın. */
export const termsAccepted = (version: number | null | undefined): boolean =>
  (version ?? 0) >= CHAT_TERMS_VERSION;
