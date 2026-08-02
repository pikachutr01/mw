/**
 * ── HESAP ROLÜ ATAMA ─────────────────────────────────────────────────────────
 *
 * Kullanım (`apps/api` içinden):
 *   node --env-file=../../.env scripts/rol-ver.mjs <kullanıcıadı|e-posta> <player|moderator|admin>
 *
 * Canlıda:
 *   cd /var/www/mobilwar/current/api
 *   /opt/node22/bin/node --env-file=/etc/mobilwar/.env scripts/rol-ver.mjs <ad> admin
 *
 * ⭐ NEDEN BİR SCRIPT — panelde rol atama **bilerek yok** (`db-registry.ts`: `accounts` tablosu
 * salt-okunur). Sebep tavuk-yumurta: ilk adminin kendini yaratması gerekirdi. Ama tek çare
 * olarak elle `UPDATE` bırakmanın iki kusuru vardı:
 *   1. **Hiçbir yere kaydedilmiyordu** — yetki yükseltme sistemdeki en kritik işlem ve
 *      `audit_log`'da izi yoktu. Bu script kaydı yazıyor.
 *   2. Yanlış `WHERE` ile birden çok hesabı birden yükseltmek kolaydı.
 *
 * ⚠️ Rol **hesap** düzeyinde (dünya değil): bir admin tüm dünyaları yönetir.
 *
 * ⚠️ Panele giriş **kullanıcı adıyla** yapılıyor (`apps/admin/src/lib/api.ts`), e-postayla
 * değil — bu yüzden burada ikisi de kabul ediliyor, hangisi elinizdeyse.
 */
import { createInterface } from 'node:readline/promises';
import postgres from 'postgres';

const ROLLER = ['player', 'moderator', 'admin'];

const [hedef, rol] = process.argv.slice(2);

if (!hedef || !rol) {
  console.error('Kullanım: node scripts/rol-ver.mjs <kullanıcıadı|e-posta> <player|moderator|admin>');
  process.exit(1);
}
if (!ROLLER.includes(rol)) {
  console.error(`Geçersiz rol: ${rol}. Geçerli olanlar: ${ROLLER.join(' · ')}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL tanımsız — betiği `--env-file` ile çalıştır.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  /**
   * ⚠️ Kullanıcı adı **dünya başına** tekil, yani teoride iki dünyada iki ayrı oyuncu aynı adı
   * taşıyabilir — ama ikisi de AYNI hesaba bağlı olmak zorunda değil. Bu yüzden eşleşen hesap
   * birden fazlaysa script durur; yanlış hesabı yükseltmektense hiçbir şey yapmamak doğru.
   */
  const adaylar = await sql`
    SELECT DISTINCT a.id, a.email, a.role
      FROM accounts a
      LEFT JOIN players p ON p.account_id = a.id
     WHERE lower(a.email) = lower(${hedef})
        OR lower(p.username) = lower(${hedef})
  `;

  if (adaylar.length === 0) {
    console.error(`Hesap bulunamadı: ${hedef}`);
    process.exit(1);
  }
  if (adaylar.length > 1) {
    console.error(`«${hedef}» birden çok hesapla eşleşti (${adaylar.length}). E-posta ile dene:`);
    for (const a of adaylar) console.error(`  · ${a.email} (rol: ${a.role})`);
    process.exit(1);
  }

  const hesap = adaylar[0];
  if (hesap.role === rol) {
    console.log(`Değişiklik yok — ${hesap.email} zaten «${rol}».`);
    process.exit(0);
  }

  // Yetki YÜKSELTMEK geri alınabilir ama sessizce yapılmamalı; düşürmek zaten güvenli yön.
  if (rol !== 'player') {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const cevap = await rl.question(
      `${hesap.email} hesabına «${rol}» yetkisi verilecek (şu an «${hesap.role}»). Onaylıyor musun? [e/H] `,
    );
    rl.close();
    if (cevap.trim().toLowerCase() !== 'e') {
      console.log('Vazgeçildi.');
      process.exit(0);
    }
  }

  await sql.begin(async (tx) => {
    await tx`UPDATE accounts SET role = ${rol} WHERE id = ${hesap.id}`;
    /**
     * ⚠️ `audit_log.world_id` NOT NULL; rol hesap düzeyinde olduğu için oyuncunun herhangi bir
     * dünyasını çıpa alıyoruz. Hiç oyuncusu yoksa (yalnız hesap açılmış) kayıt atlanır —
     * denetim kaydı için hesabı yükseltmemek yanlış olurdu.
     */
    const [p] = await tx`SELECT id, world_id FROM players WHERE account_id = ${hesap.id} LIMIT 1`;
    if (p) {
      await tx`
        INSERT INTO audit_log (world_id, player_id, action, entity, entity_id, after)
        VALUES (${p.world_id}, ${p.id}, 'account.role_changed', 'account', ${hesap.id},
                ${JSON.stringify({ from: hesap.role, to: rol, by: 'scripts/rol-ver.mjs' })}::jsonb)
      `;
    } else {
      console.warn('⚠️ Hesabın hiç oyuncusu yok — denetim kaydı yazılmadı.');
    }
  });

  console.log(`✅ ${hesap.email}: «${hesap.role}» → «${rol}»`);
  if (rol !== 'player') {
    console.log('   Panel: admin.mobilwar.com — aynı kullanıcı adı ve parola ile gir.');
    console.log('   ⚠️ Yıkıcı işlemler için üst şeritteki «Yükselt» ile parolanı tekrar gir (15 dk).');
  }
} catch (err) {
  console.error('Başarısız:', err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
