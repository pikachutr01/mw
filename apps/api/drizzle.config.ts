import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://mobiwar:mobiwar@localhost:5432/mobiwar',
  },
  // Migration'lar depoya işlenir; sunucuda ASLA `push` yapılmaz (§4.0: sunucuda derleme yasak).
  strict: true,
  verbose: true,
} satisfies Config;
