/**
 * ⭐⭐ POSTA KUTUSU TÜR SÜZGECİ VE FAVORİLER (kullanıcı, 2026-08-19).
 *
 * İstek: *"Mesajlar sayfasının raporlar bölümüne filtre ekleyelim… Filtre seçilince sunucu
 * yeniden seçilen filtreye göre listeyi gönderir."* ve *"bir raporun bir köşesine favorileme
 * butonu koyalım… filtreleme seçeneklerinden favoriler seçilince sadece favorilere eklenen
 * raporlar görünsün."*
 *
 * ⚠️⚠️ Bu dosyanın asıl derdi **sayfa sayısı**. Süzgeç eklenirken en kolay yapılacak hata,
 * listeyi süzüp `total`i süzmemek: 200 raporu olan oyuncu «Casusluk» seçince 3 satır görür
 * ama sayfalayıcı «1 / 10» yazar ve oyuncu boş sayfalara gezinir. Ekran "çalışıyor" görünür,
 * yani sessiz. Testlerin çoğu o hizayı ölçüyor.
 */
import { BadRequestException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BattleController } from '../src/battles/battle.controller.ts';
import type { AuthedRequest } from '../src/auth/auth.guard.ts';
import type { DbHandle } from '../src/db/client.ts';
import { createPlayer, createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let ctl: BattleController;
let worldId: number;
let ali: number;
let veli: number;

const req = (playerId: number): AuthedRequest => ({
  player: { accountId: 1, playerId, worldId, sessionId: '' },
  headers: {},
} as unknown as AuthedRequest);

/** Bir rapor satırı yazar; `at` sıralamayı belirlemiyor (uç `id DESC` ile sıralıyor). */
async function yaz(
  playerId: number,
  kind: string,
  subject = 'konu',
): Promise<number> {
  const [row] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO messages (world_id, player_id, kind, subject, body, at)
    VALUES (${worldId}, ${playerId}, ${kind}, ${subject}, '{}'::jsonb, now())
    RETURNING id
  `);
  return Number(row!['id']);
}

const liste = (
  playerId: number,
  opts: { kind?: string; type?: string } = {},
): Promise<Record<string, unknown>> =>
  ctl.messages(req(playerId), opts.kind, '0', '50', opts.type);

const kindsOf = (res: Record<string, unknown>): string[] =>
  (res['items'] as { kind: string }[]).map((i) => i.kind);

beforeAll(async () => {
  h = await setupTestDb();
  ctl = new BattleController(h.db);
  worldId = freshWorldId();
  await createWorld(h, worldId);
  ali = await createPlayer(h, worldId, 'ali');
  veli = await createPlayer(h, worldId, 'veli');
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  await h.db.execute(sql`DELETE FROM messages WHERE world_id = ${worldId}`);
});

describe('tür süzgeci', () => {
  beforeEach(async () => {
    await yaz(ali, 'battle_report');
    await yaz(ali, 'battle_report');
    await yaz(ali, 'spy_report');
    await yaz(ali, 'transport_report');
    await yaz(ali, 'support_report');
    await yaz(ali, 'found_city_report');
    await yaz(ali, 'system');
    await yaz(ali, 'alliance_invite');
  });

  it('süzgeçsiz Raporlar sekmesi yalnız `_report` ile bitenleri veriyor', async () => {
    const res = await liste(ali, { kind: 'reports' });
    expect(kindsOf(res)).toHaveLength(6);
    expect(kindsOf(res)).not.toContain('system');
    expect(kindsOf(res)).not.toContain('alliance_invite');
  });

  it('tek türe süzülünce yalnız o tür geliyor', async () => {
    const res = await liste(ali, { kind: 'reports', type: 'spy_report' });
    expect(kindsOf(res)).toEqual(['spy_report']);
  });

  /**
   * ⭐⭐ TURUN ASIL BEKÇİSİ: `total` süzgeci de görmek ZORUNDA. Süzülmemiş bir toplam,
   * sayfalayıcıyı yalancı yapar ve oyuncu var olmayan sayfalara gezinir.
   */
  it('⭐ toplam süzgece göre daralıyor (sayfa sayısı buradan hesaplanıyor)', async () => {
    const hepsi = await liste(ali, { kind: 'reports' });
    expect(hepsi['total']).toBe(6);

    const casus = await liste(ali, { kind: 'reports', type: 'spy_report' });
    expect(casus['total']).toBe(1);

    const savas = await liste(ali, { kind: 'reports', type: 'battle_report' });
    expect(savas['total']).toBe(2);
  });

  /** Sekme rozetleri süzgeçten BAĞIMSIZ: süzgeç açıkken de iki kümenin sayısı görünmeli. */
  it('sekme sayaçları süzgeçten etkilenmiyor', async () => {
    const res = await liste(ali, { kind: 'reports', type: 'spy_report' });
    const counts = res['counts'] as Record<string, number>;
    expect(counts['reports']).toBe(6);
    expect(counts['messages']).toBe(2);
  });

  /**
   * ⚠️ Bayat bir istemcinin gönderdiği bilinmeyen tür posta kutusunu KAPATMAMALI: süzgeç bir
   * gezinme tercihi, hata değil. Liste süzülmemiş ama doğru dönüyor.
   */
  it('bilinmeyen tür sessizce yok sayılıyor, hata değil', async () => {
    const res = await liste(ali, { kind: 'reports', type: 'cave_report' });
    expect(kindsOf(res)).toHaveLength(6);
    expect(res['total']).toBe(6);
  });

  it('başka oyuncunun raporları hiçbir süzgeçte görünmüyor', async () => {
    await yaz(veli, 'spy_report');
    const res = await liste(ali, { kind: 'reports', type: 'spy_report' });
    expect(kindsOf(res)).toEqual(['spy_report']);
    expect(res['total']).toBe(1);
  });
});

describe('favoriler', () => {
  it('yeni rapor favori DEĞİL', async () => {
    await yaz(ali, 'battle_report');
    const res = await liste(ali, { kind: 'reports' });
    expect((res['items'] as { favorite: boolean }[])[0]?.favorite).toBe(false);
  });

  it('favoriye alınca hem listede hem gövde ucunda işaretli', async () => {
    const id = await yaz(ali, 'battle_report');
    await ctl.setFavorite(String(id), { favorite: true }, req(ali));

    const res = await liste(ali, { kind: 'reports' });
    expect((res['items'] as { favorite: boolean }[])[0]?.favorite).toBe(true);

    /* ⚠️ Gövde ucu DA taşımalı: rapor bildirim derin bağlantısıyla listeden GEÇMEDEN
       açılabiliyor ve o yolda istemcinin elinde liste satırı hiç olmuyor. */
    const body = await ctl.messageBody(String(id), req(ali));
    expect(body.favorite).toBe(true);
  });

  it('«favoriler» süzgeci yalnız işaretlileri veriyor, türden bağımsız', async () => {
    const a = await yaz(ali, 'battle_report');
    await yaz(ali, 'battle_report');
    const c = await yaz(ali, 'spy_report');
    await ctl.setFavorite(String(a), { favorite: true }, req(ali));
    await ctl.setFavorite(String(c), { favorite: true }, req(ali));

    const res = await liste(ali, { kind: 'reports', type: 'favorites' });
    expect((res['items'] as { id: number }[]).map((i) => i.id).sort()).toEqual(
      [a, c].sort(),
    );
    expect(res['total']).toBe(2);
    expect((res['counts'] as Record<string, number>)['favorites']).toBe(2);
  });

  it('favoriden çıkarılabiliyor', async () => {
    const id = await yaz(ali, 'battle_report');
    await ctl.setFavorite(String(id), { favorite: true }, req(ali));
    await ctl.setFavorite(String(id), { favorite: false }, req(ali));

    const res = await liste(ali, { kind: 'reports', type: 'favorites' });
    expect(res['items']).toHaveLength(0);
    expect((await ctl.messageBody(String(id), req(ali))).favorite).toBe(false);
  });

  /**
   * ⭐⭐ İSTENEN DURUM GÖNDERİLİYOR, «toggle» DEĞİL. Aynı isteği iki kez göndermek aynı
   * sonucu veriyor (idempotent). Toggle olsaydı web ve telefon aynı raporu açıkken ikinci
   * dokunuş ilkini geri alırdı ve oyuncu favorinin neden kaybolduğunu anlayamazdı.
   */
  it('⭐ aynı durumu iki kez göndermek sonucu DEĞİŞTİRMİYOR', async () => {
    const id = await yaz(ali, 'battle_report');
    await ctl.setFavorite(String(id), { favorite: true }, req(ali));
    await ctl.setFavorite(String(id), { favorite: true }, req(ali));
    expect((await ctl.messageBody(String(id), req(ali))).favorite).toBe(true);
  });

  /** ⚠️ Sahiplik `WHERE`de: başkasının raporu hiç güncellenmiyor ve varlığı da sızmıyor. */
  it('⭐ başkasının raporu favorilenemiyor', async () => {
    const id = await yaz(veli, 'battle_report');
    await ctl.setFavorite(String(id), { favorite: true }, req(ali));

    const [row] = await h.db.execute<Record<string, unknown>>(sql`
      SELECT favorited_at FROM messages WHERE id = ${id}
    `);
    expect(row!['favorited_at']).toBeNull();
  });

  it('geçersiz gövde reddediliyor', async () => {
    const id = await yaz(ali, 'battle_report');
    await expect(ctl.setFavorite(String(id), { favorite: 'evet' }, req(ali)))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
