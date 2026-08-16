/**
 * ⭐⭐ DEĞİŞİKLİK GÜNLÜĞÜ TOHUMU (2026-08-16).
 *
 * Günlük tablosu boş doğuyor; oyuncunun ilk açtığında boş bir sayfa görmemesi için bugüne
 * kadarki iki dinamik değişikliği yazar.
 *
 * ⚠️ **İdempotent** — aynı başlık zaten varsa dokunmaz (`seedOnce`). Dağıtımdan sonra kaç kez
 * koşturulursa koşturulsun madde ikizlenmez.
 *
 * ⚠️ Metinler **oyuncu dili**: formül yok, ayar anahtarı yok, "neden" değil "senin için ne
 * değişti" anlatılıyor. Kural `mw/docs/` ve hafızadaki değişiklik günlüğü notunda.
 *
 * Kullanım (sunucuda, sürüm dizininden):
 *   node --env-file=/etc/mobilwar/.env api/scripts/seed-changelog.mjs
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL yok — --env-file=/etc/mobilwar/.env ile çalıştır.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

/** ⚠️ Başlık aynı zamanda tekillik anahtarı (bkz. `ChangelogService.seedOnce`). */
const ENTRIES = [
  {
    title: 'Ganimet kuralları değişti',
    category: 'balance',
    body: [
      'Savaştan çıkan ganimet artık iki ayrı kaynaktan geliyor ve taşıma kapasiten önce birine, sonra diğerine harcanıyor.',
      '',
      '1) Savaş enkazı — ölen askerlerin (iki tarafın da) bıraktığı değer. Bunu oransız, tamamen alırsın. Savunma kuleleri, surlar ve tuzaklar enkaz vermez.',
      '',
      '2) Şehrin kasası — enkazdan sonra kapasiten artarsa savunanın deposundan da pay alırsın.',
      '',
      'ÖNEMLİ: Kapasiten önce enkaza harcanır. Yani Yük Arabası götürmezsen savaşı ne kadar ezici kazanırsan kazan kasadan pay alamazsın — taşıyamadığın enkaz savunanın şehrinde kalır. Yağma artık bir lojistik kararı.',
      '',
      'Kasadan alınan oran, savunanın deposundaki miktara göre değişiyor: 50.000 ve üstünde %40, 5.000 ve altında %30, arası kademeli. Altın ve yemek ayrı ayrı hesaplanıyor.',
      '',
      'Ganimetteki rastgelelik payı da daraltıldı; artık aynı savaş daha öngörülebilir sonuç veriyor.',
    ],
  },
  {
    title: 'Çok zayıf rakibe saldırıda ganimet cezası yumuşatıldı',
    category: 'fix',
    body: [
      'Kendinden çok zayıf birine saldırdığında ganimetin azalması kuralı duruyor — ama devreye giriş noktasında sert bir sıçrama vardı.',
      '',
      'Puan farkı 50\'yi geçtiği anda ceza bir anda tam güçle uygulanıyordu; küçük hesaplarda tek puanlık bir artış ganimeti neredeyse yarıya düşürebiliyordu. Artık ceza kademeli olarak devreye giriyor.',
      '',
      'Yüksek puanlı oyuncular için hiçbir şey değişmedi: orada ceza zaten yok denecek kadar küçüktü ve öyle kalıyor.',
    ],
  },
  {
    title: 'Saldırıların erken gerçekleşmesi sorunu giderildi',
    category: 'fix',
    body: [
      'Bazı oyuncular saldırılarının varış saatinden önce gerçekleştiğini, raporların vaktinden erken geldiğini bildirdi.',
      '',
      'Sebebi oyunun kurallarında değil, sunucunun çalıştığı makinenin saatinde bir sıçramaydı. Sorun kaynağında giderildi; ayrıca oyun artık böyle bir sıçrama tekrar yaşansa bile görevleri erken çalıştırmıyor.',
      '',
      'Etkilenen saldırılar 16 Ağustos sabahı yaşandı. Yaşadığınız bir mağduriyet varsa Destek üzerinden bize yazın.',
    ],
  },
];

try {
  for (const e of ENTRIES) {
    const body = e.body.join('\n');
    const [existing] = await sql`
      SELECT id FROM changelog_entries WHERE title = ${e.title} LIMIT 1
    `;
    if (existing) {
      console.log(`atlandı (zaten var): ${e.title}`);
      continue;
    }
    const [row] = await sql`
      INSERT INTO changelog_entries (world_id, title, body, category, published_at)
      VALUES (NULL, ${e.title}, ${body}, ${e.category}, now())
      RETURNING id
    `;
    console.log(`yazıldı #${row.id}: ${e.title}`);
  }
} finally {
  await sql.end();
}
