/**
 * Bildirim denemesi — verilen oyuncuya sahte bir outbox satırı düşürür.
 *
 *   node --env-file=../../.env scripts/notify-poke.mjs <kullanıcıAdı> \
 *     [attack|spy|production|invite|battle|spy_in|spy_out|transport|cave]
 *
 * Neden var: bildirim yolunu uçtan uca denemek için gerçek bir saldırı göndermek gerekiyordu
 * (ordu üret → sefere çıkar → varışı bekle). Bu betik aynı outbox satırını doğrudan yazar;
 * dispatcher, katalog, tercih kontrolü, çevrimiçilik dalı ve teslim GERÇEK yoldan işler —
 * yalnız tetikleyici sahte. `smoke.mjs` ile aynı ruhta bir geliştirme aracı.
 *
 * ⚠️ `attack` ve `spy` **push atmaz** (§7.2c D1: kalkış uyarısı yalnız toast). Kilit ekranını
 * denemek için `battle`, `spy_in`, `transport` ya da `cave` kullan.
 */
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const [, , username, kind = 'attack'] = process.argv;

if (!username) {
  console.error('kullanım: node scripts/notify-poke.mjs <kullanıcıAdı> [attack|spy|production|invite|battle]');
  process.exit(1);
}

const [p] = await sql`SELECT id, world_id FROM players WHERE username = ${username}`;
if (!p) { console.error('oyuncu bulunamadı:', username); process.exit(1); }

const id = Number(p.id);
const arrivesAt = new Date(Date.now() + 23 * 60 * 1000).toISOString();

/** Gerçek yükün taşıdığı güzergâh — bildirim gövdeleri buradan yazılıyor (§7.2c D4). */
const origin = { k: 2, d: 5, s: 1, name: 'Karakule' };
const target = { k: 1, d: 45, s: 7, name: 'Çığlıktepe' };
const route = { origin, target };

const ROWS = {
  attack: ['city:incoming_attack', {
    missionId: 99001, defenderPlayerId: id, targetCityId: 1,
    originCoordinates: origin, targetCity: target, arrivesAt,
    units: { dwarf: 3000, elf: 20 }, heroCount: 2,
  }],
  spy: ['city:incoming_spy', {
    missionId: 99002, defenderPlayerId: id,
    originCoordinates: origin, targetCity: target, arrivesAt, birds: 12,
  }],
  production: ['city:building_finished', { cityId: 1, playerId: id, type: 'barracks', level: 7 }],
  invite: ['message:written', { playerId: id, kind: 'alliance_invite' }],
  battle: ['battle:resolved', {
    battleId: 99003, attackerPlayerId: id, defenderPlayerId: id, winner: 'attacker',
    cityId: 1, route,
  }],
  /** Casusluğa UĞRAYAN — "Casusluk önleme raporu", gövdede saldırganın şehri. */
  spy_in: ['message:written', { playerId: id, kind: 'spy_report', side: 'target', route }],
  /** Casusluğu GÖNDEREN — "Casusluk raporu", gövdede hedef şehir. */
  spy_out: ['message:written', { playerId: id, kind: 'spy_report', side: 'spy', route }],
  transport: ['mission:sent', {
    missionId: 99004, type: 'transport', ownerPlayerId: 0, targetPlayerId: id, originCity: origin,
  }],
  cave: ['cave:returned', { playerId: id, cityId: 1, city: target }],
};

const entry = ROWS[kind];
if (!entry) { console.error('bilinmeyen tür:', kind); process.exit(1); }

await sql`
  INSERT INTO outbox (world_id, topic, payload)
  VALUES (${p.world_id}, ${entry[0]}, ${sql.json(entry[1])})
`;
console.log(`${username} (id=${id}) → ${entry[0]} outbox'a yazıldı`);
await sql.end();
