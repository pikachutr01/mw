/**
 * ⭐ YENİDEN BAŞLATMA DUYURUSU — her sayfada, navbarın hemen altında.
 *
 * Kullanıcı isteği (2026-08-21): *"Tüm sayfalarda gözükecek şekilde en üstte navbarın altına
 * bir alert gibi olsun."*
 *
 * ─ ⚠️ NEDEN KAPATILABİLİR DEĞİL ──────────────────────────────────────────────────────────
 * `VerifyBanner` kapatılabiliyor ve gerekçesi orada yazılı: *"her sayfa açılışında geri gelen
 * bir uyarı, uyarı olmaktan çıkıp gürültü olur"*. Burada durum **tersi**: bu şerit bir
 * kısıtı değil, oyuncunun emeğinin akıbetini duyuruyor. Kapatılabilir olsaydı bir kez kapatan
 * oyuncu, oyunun sıfırlanacağını **hiç bilmeden** aylarca şehir büyütebilirdi. Kullanıcı da
 * "kalıcı uyarı" dedi.
 *
 * ─ ⚠️ TEK BİLEŞEN, İKİ KABUK ─────────────────────────────────────────────────────────────
 * `Shell` (oturumlu) ve `GuestShell` (misafir) ayrı ağaçlar. Metni iki yere kopyalamak
 * deponun bilinen tuzağı: *"İki bileşenin aynı şeyi çizmesi"* — şehir şeridi bir ara hem
 * kabuktan hem ekrandan çizilip **iki şerit** görünmüştü. Metin burada TEK yerde; iki kabuk
 * da bunu çağırıyor.
 *
 * ─ ⚠️ RENK: `bg-warning` + `text-on-accent` ─────────────────────────────────────────────
 * `VerifyBanner`ın KANITLANMIŞ çifti. `--color-info` da var ama `--color-on-info` **yok**;
 * üstüne hangi metin renginin okunacağı garanti değil ve Tailwind bilinmeyen bir sınıfı
 * sessizce üretmediği için hata da vermezdi (aynı dosyadaki not).
 *
 * ⚠️ Metinde **tire/çizgi yok** — oyuncuya görünen metinlerde yasak (yazım tarzı kuralı).
 */

/** ⚠️ Metnin TEK kaynağı. İki kabuk da buradan okuyor. */
const METIN =
  'Mobil uygulama hazır olup tüm hatalar tamamen giderildikten sonra oyun yeniden '
  + 'başlatılacaktır. Anlayışınız için teşekkür ederiz.';

export function RestartBanner(): React.ReactElement {
  return (
    /* ⚠️ `role="note"`: kalıcı bir duyuru, canlı bölge DEĞİL. `role="status"` ekran
       okuyucuya "bu az önce değişti" der ve her sayfa geçişinde metni yeniden okuturdu. */
    <div
      role="note"
      className="tex mb-2 rounded-[var(--radius-sm)] border-2 border-strong bg-warning
        px-3 py-1.5 text-center text-xs text-on-accent"
    >
      {METIN}
    </div>
  );
}
