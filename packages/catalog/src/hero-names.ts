/**
 * ⭐ KAHRAMAN AD HAVUZU — savaştan yeni çıkan kahramana verilir.
 *
 * Orijinalde binary'de `KarakterAdlari` diye bir dizi var (RTTI, 0x40764c) ama içeriği
 * çıkarılamadı; bu havuz **bizim kurgumuz**. Oyuncu adı tapınaktan zaten değiştirebiliyor
 * (`dgKad.do` uç noktası, "Kahraman Adı Değiştir"), yani buradaki adlar yalnız başlangıç.
 *
 * Seçim: destansı/eski Türkçe ve Türk mitolojisinden adlar — oyunun dünyasına uyuyor ve
 * oyuncunun ekran görüntüsündeki "VaRaN-1" gibi elle konmuş adlarla çakışmıyor.
 */
export const HERO_NAMES: readonly string[] = [
  'Alpagut', 'Alptekin', 'Arslan', 'Atsız', 'Ayaz', 'Balaban', 'Baybars', 'Bayındır',
  'Bilge', 'Boğaç', 'Börü', 'Buğrahan', 'Çağrı', 'Dede Korkut', 'Demirbaş', 'Doğaç',
  'Emrehan', 'Ergenekon', 'Ertuğrul', 'Gökberk', 'Gökhan', 'Görklü', 'Ilteriş', 'Kağan',
  'Karabudun', 'Karaca', 'Kayahan', 'Kımız', 'Konur', 'Korkut', 'Kutalmış', 'Kürşad',
  'Mete', 'Oğuzhan', 'Orkun', 'Otağ', 'Pusat', 'Salur', 'Sancar', 'Savcı',
  'Sungur', 'Tanyeli', 'Tarkan', 'Tegin', 'Tuğrul', 'Tunga', 'Uluğ', 'Umay',
  'Yağız', 'Yavuz', 'Yıldıray', 'Yula',
] as const;

/**
 * Havuzdan ad seçer. `taken` verilirse aynı oyuncuda tekrar etmemeye çalışır; havuz tükenirse
 * sonuna sıra numarası ekler (ör. "Tarkan 2") — ad çakışması oyunu durdurmamalı.
 */
export function pickHeroName(random: () => number, taken: readonly string[] = []): string {
  const used = new Set(taken);
  const free = HERO_NAMES.filter((n) => !used.has(n));
  const pool = free.length > 0 ? free : HERO_NAMES;
  const name = pool[Math.floor(random() * pool.length) % pool.length] as string;
  if (free.length > 0) return name;
  // Havuz tükendi: aynı adın kaçıncı kopyası olduğunu bul.
  let n = 2;
  while (used.has(`${name} ${n}`)) n += 1;
  return `${name} ${n}`;
}
