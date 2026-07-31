import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const rows = await sql`
  SELECT a.email, a.email_verified_at IS NOT NULL AS dogrulandi,
         t.purpose, t.created_at, now() - t.created_at AS yas
    FROM accounts a JOIN email_tokens t ON t.account_id = a.id
   WHERE a.email = 'deneme2-mail@ornek.test' ORDER BY t.id`;
console.log(JSON.stringify(rows, null, 1));
await sql.end();
