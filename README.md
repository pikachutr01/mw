# MobilWar — yeniden inşa

Tersine mühendislikle çözülen J2ME oyunu **Mobiwar**'ın modern yeniden yazımı. Ürünün adı
**MobilWar** (`mobilwar.com`); `docs/` altında geçen *Mobiwar* yazımları **orijinal oyuna**
aittir ve bilerek korunur.

Tasarımın tamamı `docs/MOBIWAR_SISTEM_PLANI.md` dosyasındadır (2026-07-31'de depoya alındı);
başlangıç için `docs/BASLANGIC.md`. Bu README yalnız kodun nasıl çalıştırılacağını anlatır.
Kod/dosya/URL **İngilizce**, açıklamalar **Türkçe** (§13.14).

## Hızlı başlangıç

```bash
pnpm install
pnpm test
```

Altyapı (Postgres 17 + Redis + Mailpit) yalnız geliştirme için:

```bash
docker compose -f compose.dev.yml up -d
```

API'yi çalıştır (varsayılan port 3002):

```bash
cp .env.example .env && pnpm --filter @mobilwar/api dev
```

Sağlık kontrolü: <http://localhost:3002/healthz> — motor sürümünü ve katalog hash'ini de döner.

## Paketler

| Paket | Ne yapar |
|---|---|
| `packages/engine` | Savaş motoru. **Saf ve yan etkisiz**; DB/zaman/IO bilmez. Rastgelelik yalnız seed'li PRNG'den (`rng.ts`) gelir → her savaş yeniden oynatılabilir. Savunma tabanı (§13.11.10) ve ganimet sırası (§13.10.4) burada. |
| `packages/catalog` | Denge verisi: birim/yapı/teknik statları, maliyetler, doğrulanmış formüller. `catalogHash()` her savaşa yazılır. |
| `packages/contracts` | zod şemaları — sunucu doğrulaması + istemci tipleri TEK kaynaktan. |
| `packages/design-tokens` | Gece/gündüz antik palet. `tokens.json` **tek kaynak** → CSS + Tailwind + Dart üretilir. |
| `apps/api` | NestJS (Fastify) iskeleti: `/healthz`, `/api/v1/simulate`, Drizzle şeması. |

## Komutlar

| Komut | Açıklama |
|---|---|
| `pnpm test` | Tüm paketlerin testleri |
| `pnpm build` | Derleme (turbo, bağımlılık sırasına göre) |
| `pnpm typecheck` | Tip kontrolü |
| `pnpm tokens:build` | `tokens.json` → `dist/tokens.{css,tw.css,ts,dart}` |
| `pnpm tokens:check` | Üretilen token'lar kaynakla senkron mu (CI kapısı) |
| `pnpm db:generate` | Drizzle migration üret |

## Değişmez kurallar

1. **Motor saf kalır.** `packages/engine` içinde `Math.random()`, `Date.now()`, DB veya IO **yasak**.
   Rastgelelik parametreyle gelir; aksi hâlde savaşlar yeniden oynatılamaz.
2. **Sihirli sayı yok.** Denge sabitleri `CombatConfig`/`world_config`'te; koda gömülmez.
3. **Renk kodu yazılmaz.** Bileşenler yalnız semantik token kullanır; ham hex CI'da reddedilir.
4. **Dünya yalıtımı.** `world_id` taşımayan sohbet/oyuncu sorgusu yazılmaz (§13.12.1b).
5. **Üretilen dosyalar depoda.** `design-tokens/dist` işlenir; `tokens:check` sürüklenmeyi yakalar.
