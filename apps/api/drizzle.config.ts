import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://mobilwar:mobilwar@localhost:5432/mobilwar',
  },
  // Migration'lar depoya işlenir; sunucuda ASLA `push` yapılmaz (§4.0: sunucuda derleme yasak).
  strict: true,
  verbose: true,
} satisfies Config;
