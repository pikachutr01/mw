/**
 * ⭐ DESTEK / İLETİŞİM SİSTEMİ (kullanıcı, 2026-08-14).
 *
 * Kilitlenen davranışlar — hepsi bozulduğunda **sessiz** kalır, yani ekranda hata görünmez:
 *   • Başkasının talebi **404** döner (403 değil): "var ama senin değil" bilgisi de sızmamalı.
 *   • Kapalı talebe oyuncu yazamaz; yalnız yönetici açıp kapatır.
 *   • Her talep **iki** mail üretir (yöneticiye + kullanıcıya); ikinci kullanıcı mesajı
 *     yöneticiye ikinci bir mail üretmez (kullanıcı kararı: "sadece ilk açıldığında").
 *   • Anonim jeton süresi dolunca talep 404 olur.
 *   • Yükleme: uzantıya değil **magic byte**a bakılır; piksel bombası reddedilir.
 *   • Doğrulanmamış hesap destek yazabilir — "doğrulama maili gelmedi" destek sebebinin ta
 *     kendisi ve `unverified.ts` kısıtı buraya SIZMAMALI.
 */
import { randomUUID } from 'node:crypto';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ⚠️ `vi.hoisted`: `MAIL` modül düzeyinde bir `const` ve env'i **import anında** okuyor.
 * Normal bir atama ESM hoisting yüzünden geç kalırdı ve `alertTo` boş görünürdü — yönetici
 * maili hiç yazılmaz, test de onu ölçemezdi.
 */
const ENV = vi.hoisted(() => {
  process.env['OPS_ALERT_EMAIL'] = 'ops@test.local';
  process.env['APP_ORIGIN'] = 'https://oyun.test';
  process.env['ADMIN_ORIGIN'] = 'https://panel.test';
  /**
   * ⚠️ Burada **hiçbir import kullanılamaz**: hoisted blok modül grafiği kurulmadan önce
   * koşuyor ve `node:fs`e dokunmak *"Cannot access '__vi_import_1__' before initialization"*
   * ile patlıyor. Yol düz dizeden üretiliyor; dizini `writeAttachment` zaten
   * `mkdir(recursive)` ile açıyor.
   */
  const tmp = process.env['TEMP'] ?? process.env['TMPDIR'] ?? '/tmp';
  const root = `${tmp.replace(/[\\/]+$/, '')}/mw-upload-test-${process.env['VITEST_WORKER_ID'] ?? '1'}`;
  process.env['UPLOAD_ROOT'] = root;
  process.env['UPLOAD_XACCEL'] = '';
  return { root };
});

import { AuthService } from '../src/auth/auth.service.ts';
import { TokenService } from '../src/auth/token.service.ts';
import { CityService } from '../src/cities/city.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { LIMITED } from '../src/auth/rate-limit.ts';
import { MAINTENANCE_PASSTHROUGH_TOPICS } from '../src/outbox/outbox.dispatcher.ts';
import { eventForOutbox } from '../src/realtime/realtime.bus.ts';
import { notificationForOutbox } from '../src/notify/notify.catalog.ts';
import { NOTIFY_CATEGORIES } from '../src/notify/notify.limits.ts';
import {
  SupportError, SupportService, sweepOrphanAttachments, type ActorAuthed,
} from '../src/support/support.service.ts';
import { handleUpload } from '../src/support/upload.ts';
import {
  imageSize, isValidStorageKey, newStorageKey, sniffImage, stripJpegMetadata,
} from '../src/support/storage.ts';
import { GameClockService } from '../src/world/game-clock.service.ts';
import { createWorld, freshWorldId, setupTestDb, verifyEmail } from './helpers/db.ts';

let h: DbHandle;
let auth: AuthService;
let svc: SupportService;
let worldId: number;

beforeAll(async () => {
  h = await setupTestDb();
  auth = new AuthService(
    h.db, new TokenService({ accessSecret: 'test-secret-en-az-16-karakter' }),
    new GameClockService(h.db), new CityService(h.db),
  );
  svc = new SupportService(h.db);
}, 60_000);

afterAll(async () => {
  await h?.close();
  rmSync(ENV.root, { recursive: true, force: true });
});

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
  await h.db.execute(sql`DELETE FROM support_tickets`);
  await h.db.execute(sql`DELETE FROM support_attachments`);
  await h.db.execute(sql`DELETE FROM outbox WHERE topic IN ('mail:send', 'support:changed')`);
});

async function newActor(opts: { verified?: boolean } = {}): Promise<ActorAuthed> {
  const t = randomUUID().slice(0, 8);
  const email = `sup-${t}@test.local`;
  const r = await auth.register(
    { email, password: 'parola-12345', username: `sup_${t}`, worldId },
    { deviceId: randomUUID(), ip: '85.104.12.7', userAgent: 'test', platform: 'web' },
  );
  if (opts.verified !== false) await verifyEmail(h, r.playerId);
  /**
   * ⚠️ Kayıt akışının kendisi bir **doğrulama maili** outbox'a yazıyor. Temizlenmezse destek
   * maillerini sayan her assert bir fazla görür — ilk koşuda tam bu oldu.
   */
  await h.db.execute(sql`DELETE FROM outbox WHERE topic = 'mail:send'`);
  return {
    kind: 'user', accountId: r.accountId, playerId: r.playerId, worldId,
    username: `sup_${t}`, email, emailVerified: opts.verified !== false,
  };
}

const TICKET = {
  subject: 'Giriş yapamıyorum',
  category: 'account' as const,
  body: 'Hesabıma giriş yapmaya çalışıyorum ama sürekli hata alıyorum, yardım eder misiniz.',
};

async function mails(): Promise<{ to: string; subject: string; text: string }[]> {
  const rows = await h.db.execute<Record<string, unknown>>(sql`
    SELECT payload FROM outbox WHERE topic = 'mail:send' ORDER BY id
  `);
  return rows.map((r) => r['payload'] as { to: string; subject: string; text: string });
}

/* ── Sahte resimler (magic byte doğru, içerik minimal) ────────────────────────── */

function fakePng(w = 4, h2 = 4): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h2, 20);
  return b;
}

/** SOI + APP1(Exif) + SOF0 + SOS — EXIF temizliğini ölçebilmek için. */
function fakeJpeg(w = 8, h2 = 6): Buffer {
  const app1 = Buffer.alloc(4 + 10);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(12, 2);
  app1.write('Exif\0\0GPS!', 4, 'ascii');
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(9, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h2, 5);
  sof.writeUInt16BE(w, 7);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), app1, sof, Buffer.from([0xff, 0xda, 0x00, 0x02]),
  ]);
}

const part = (buf: Buffer) => ({ toBuffer: async () => buf });

/* ═══ TESTLER ══════════════════════════════════════════════════════════════════ */

describe('talep açma', () => {
  it('kayıtlı oyuncu talep açar; İKİ mail üretilir (yöneticiye + kullanıcıya)', async () => {
    const a = await newActor();
    const { ticketId, publicToken } = await svc.create(a, TICKET);
    expect(ticketId).toBeGreaterThan(0);
    // ⚠️ Kayıtlı kullanıcıya jeton verilmez: oturumuyla giriyor.
    expect(publicToken).toBeNull();

    const m = await mails();
    expect(m).toHaveLength(2);
    expect(m[0]!.to).toBe('ops@test.local');
    expect(m[0]!.subject).toContain(`#${ticketId}`);
    expect(m[0]!.text).toContain('Hesap / giriş sorunu');   // kategori Türkçeleşmiş
    expect(m[1]!.to).toBe(a.email);
    expect(m[1]!.text).toContain('https://oyun.test/destek');
  });

  it('yönetici maili YALNIZ ilk açılışta — ikinci kullanıcı mesajı mail üretmez', async () => {
    const a = await newActor();
    const { ticketId } = await svc.create(a, TICKET);
    await h.db.execute(sql`DELETE FROM outbox WHERE topic = 'mail:send'`);

    await svc.replyAsUser(ticketId, { accountId: a.accountId }, {
      body: 'Ek bilgi: tarayıcım Chrome ve hata kodu 500 diyor.',
    });
    expect(await mails()).toHaveLength(0);
  });

  it('⭐ DOĞRULANMAMIŞ hesap destek yazabilir (kısıt buraya sızmamalı)', async () => {
    const a = await newActor({ verified: false });
    const { ticketId } = await svc.create(a, TICKET);
    expect(ticketId).toBeGreaterThan(0);
  });

  it('doğrulanmamış hesapta kullanıcının yazdığı e-posta kullanılır', async () => {
    const a = await newActor({ verified: false });
    await svc.create(a, { ...TICKET, email: 'baska@test.local' });
    const m = await mails();
    expect(m[1]!.to).toBe('baska@test.local');
  });

  it('⚠️ DOĞRULANMIŞ hesapta istekteki e-posta YOK SAYILIR (hesap devralma yüzeyi)', async () => {
    const a = await newActor();
    await svc.create(a, { ...TICKET, email: 'saldirgan@test.local' });
    const m = await mails();
    expect(m[1]!.to).toBe(a.email);
  });

  it('bal küpü doluysa reddedilir', async () => {
    const a = await newActor();
    await expect(svc.create(a, { ...TICKET, website: 'http://spam' }))
      .rejects.toMatchObject({ code: 'rejected' });
  });

  it('açık talep tavanı aşılamaz', async () => {
    const a = await newActor();
    for (let i = 0; i < 5; i++) await svc.create(a, TICKET);
    await expect(svc.create(a, TICKET)).rejects.toMatchObject({ code: 'too_many_open' });
  });
});

describe('anonim akış', () => {
  it('e-postasız anonim talep açılamaz', async () => {
    await expect(svc.create({ kind: 'anon', ip: '1.2.3.4' }, TICKET))
      .rejects.toBeInstanceOf(SupportError);
  });

  it('jetonla talebini okur ve yanıtlar', async () => {
    const r = await svc.create({ kind: 'anon', ip: '1.2.3.4' },
      { ...TICKET, email: 'ziyaretci@test.local' });
    expect(r.publicToken).toBeTruthy();

    const id = await svc.ticketIdForToken(r.publicToken!);
    expect(id).toBe(r.ticketId);

    const t = await svc.thread(id, { token: r.publicToken! });
    expect(t.messages).toHaveLength(1);
    await svc.replyAsUser(id, { token: r.publicToken! }, { body: 'Ek bilgi veriyorum, teşekkürler.' });
  });

  it('süresi dolmuş jeton 404 (var-yok ayrımı sızmasın)', async () => {
    const r = await svc.create({ kind: 'anon', ip: '1.2.3.4' },
      { ...TICKET, email: 'ziyaretci@test.local' });
    await h.db.execute(sql`
      UPDATE support_tickets SET public_token_expires_at = now() - interval '1 day'
       WHERE id = ${r.ticketId}
    `);
    await expect(svc.ticketIdForToken(r.publicToken!))
      .rejects.toMatchObject({ status: 404 });
  });

  it('IP başına saatlik anonim tavan', async () => {
    for (let i = 0; i < 3; i++) {
      await svc.create({ kind: 'anon', ip: '9.9.9.9' }, { ...TICKET, email: 'z@test.local' });
    }
    await expect(svc.create({ kind: 'anon', ip: '9.9.9.9' }, { ...TICKET, email: 'z@test.local' }))
      .rejects.toMatchObject({ code: 'rejected' });
  });
});

describe('yetki', () => {
  it('⚠️ başkasının talebi 404 döner (403 DEĞİL)', async () => {
    const a = await newActor();
    const b = await newActor();
    const { ticketId } = await svc.create(a, TICKET);
    await expect(svc.thread(ticketId, { accountId: b.accountId }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('yönetici her talebi görür', async () => {
    const a = await newActor();
    const { ticketId } = await svc.create(a, TICKET);
    const t = await svc.thread(ticketId, { staff: true });
    expect(t.ticket.id).toBe(ticketId);
  });

  /** ⚠️ Yanıt sözleşmenin ÖTESİNE geçmemeli — `requireTicket` iç alanları sızmasın. */
  it('yazışma yanıtı iç alanları (e-posta, hesap/dünya kimliği) TAŞIMAZ', async () => {
    const a = await newActor();
    const { ticketId } = await svc.create(a, TICKET);
    const t = await svc.thread(ticketId, { accountId: a.accountId });
    expect(Object.keys(t.ticket).sort()).toEqual([
      'category', 'createdAt', 'id', 'lastSender', 'status', 'subject', 'unreadCount', 'updatedAt',
    ].sort());
  });

  it('yanlış jetonla okunamaz', async () => {
    const r = await svc.create({ kind: 'anon', ip: '1.2.3.4' },
      { ...TICKET, email: 'z@test.local' });
    await expect(svc.thread(r.ticketId, { token: 'x'.repeat(43) }))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('kapatma ve yanıt', () => {
  it('kapalı talebe oyuncu YAZAMAZ', async () => {
    const a = await newActor();
    const { ticketId } = await svc.create(a, TICKET);
    await svc.setStatus(ticketId, 'closed', a.playerId);

    await expect(svc.replyAsUser(ticketId, { accountId: a.accountId }, { body: 'Hâlâ sorun var, bakar mısınız.' }))
      .rejects.toMatchObject({ code: 'ticket_closed' });

    const t = await svc.thread(ticketId, { accountId: a.accountId });
    expect(t.canReply).toBe(false);
  });

  it('yönetici yanıtı → kullanıcıya mail + tam gövde + okunmamış sayacı', async () => {
    const a = await newActor();
    const { ticketId } = await svc.create(a, TICKET);
    await h.db.execute(sql`DELETE FROM outbox WHERE topic = 'mail:send'`);

    await svc.replyAsAdmin(ticketId, a.accountId, { body: 'Merhaba, şifreni sıfırladık; tekrar dener misin.' });

    const m = await mails();
    expect(m).toHaveLength(1);
    expect(m[0]!.to).toBe(a.email);
    // ⚠️ Gövde TAM gidiyor — "girip bak" değil (oltalama kalıbından kaçınma).
    expect(m[0]!.text).toContain('şifreni sıfırladık');

    const list = await svc.listForAccount(a.accountId);
    expect(list[0]!.unreadCount).toBe(1);
    expect(list[0]!.lastSender).toBe('admin');

    // Yazışmayı açmak okundu işaretler.
    await svc.thread(ticketId, { accountId: a.accountId });
    expect(await svc.unreadForAccount(a.accountId)).toBe(0);
  });

  it('yönetici mesajının yazarı oyuncuya «Yönetim» görünür', async () => {
    const a = await newActor();
    const { ticketId } = await svc.create(a, TICKET);
    await svc.replyAsAdmin(ticketId, a.accountId, { body: 'Talebini inceliyoruz, kısa sürede döneceğiz.' });
    const t = await svc.thread(ticketId, { accountId: a.accountId });
    expect(t.messages[1]!.authorName).toBe('Yönetim');
  });

  it('«yanıt bekleyen» sayacı yalnız oyuncunun son yazdığı AÇIK talepleri sayar', async () => {
    const a = await newActor();
    const { ticketId } = await svc.create(a, TICKET);
    expect(await svc.pendingCount()).toBe(1);
    await svc.replyAsAdmin(ticketId, a.accountId, { body: 'Yanıtımız burada, iyi oyunlar.' });
    expect(await svc.pendingCount()).toBe(0);
  });
});

describe('yükleme', () => {
  it('PNG kabul edilir, boyut başlıktan okunur', async () => {
    const a = await newActor();
    const r = await handleUpload(h.db, part(fakePng(120, 80)), { accountId: a.accountId, ip: '1.1.1.1' });
    expect(r.mime).toBe('image/png');
    expect(r.width).toBe(120);
    expect(r.height).toBe(80);
  });

  it('⚠️ .png ADLI metin dosyası reddedilir (magic byte)', async () => {
    const a = await newActor();
    await expect(handleUpload(h.db, part(Buffer.from('bu bir metin')), {
      accountId: a.accountId, ip: '1.1.1.1',
    })).rejects.toMatchObject({ code: 'attachment_invalid' });
  });

  it('SVG reddedilir (betik çalıştırabilir)', async () => {
    const a = await newActor();
    await expect(handleUpload(h.db, part(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), {
      accountId: a.accountId, ip: '1.1.1.1',
    })).rejects.toMatchObject({ code: 'attachment_invalid' });
  });

  it('⭐ piksel bombası reddedilir (küçük dosya, dev resim)', async () => {
    const a = await newActor();
    await expect(handleUpload(h.db, part(fakePng(100_000, 100_000)), {
      accountId: a.accountId, ip: '1.1.1.1',
    })).rejects.toMatchObject({ code: 'attachment_invalid' });
  });

  it('boyut tavanı aşılamaz', async () => {
    const a = await newActor();
    const big = Buffer.concat([fakePng(), Buffer.alloc(6 * 1024 * 1024)]);
    await expect(handleUpload(h.db, part(big), { accountId: a.accountId, ip: '1.1.1.1' }))
      .rejects.toMatchObject({ code: 'attachment_too_large' });
  });

  it('JPEG yüklenirken EXIF/APP1 segmenti ATILIR', async () => {
    const a = await newActor();
    const raw = fakeJpeg(40, 30);
    expect(raw.includes(Buffer.from('GPS!'))).toBe(true);

    const r = await handleUpload(h.db, part(raw), { accountId: a.accountId, ip: '1.1.1.1' });
    expect(r.mime).toBe('image/jpeg');
    expect(r.width).toBe(40);
    expect(r.bytes).toBeLessThan(raw.length);   // segment düştü
  });

  it('yetim ek süpürücüsü dosyayı VE satırı siler', async () => {
    const a = await newActor();
    const r = await handleUpload(h.db, part(fakePng()), { accountId: a.accountId, ip: '1.1.1.1' });
    const rows = await h.db.execute<Record<string, unknown>>(sql`
      SELECT storage_key FROM support_attachments WHERE id = ${r.attachmentId}
    `);
    const abs = join(ENV.root, 'support', ...String(rows[0]!['storage_key']).split('/'));
    expect(existsSync(abs)).toBe(true);

    await h.db.execute(sql`
      UPDATE support_attachments SET created_at = now() - interval '2 days'
       WHERE id = ${r.attachmentId}
    `);
    expect(await sweepOrphanAttachments(h.db, 24)).toBe(1);
    expect(existsSync(abs)).toBe(false);
  });

  it('mesaja iliştirilen ek YETİM SAYILMAZ', async () => {
    const a = await newActor();
    const up = await handleUpload(h.db, part(fakePng()), { accountId: a.accountId, ip: '1.1.1.1' });
    await svc.create(a, { ...TICKET, attachmentId: up.attachmentId });
    await h.db.execute(sql`UPDATE support_attachments SET created_at = now() - interval '2 days'`);
    expect(await sweepOrphanAttachments(h.db, 24)).toBe(0);
  });
});

describe('depolama anahtarı — yol kaçışı', () => {
  it('üretilen anahtar geçerli, elle bozulmuş olan reddedilir', () => {
    expect(isValidStorageKey(newStorageKey('image/png'))).toBe(true);
    expect(isValidStorageKey('2026/08/a3/../../../etc/passwd')).toBe(false);
    expect(isValidStorageKey('/etc/passwd')).toBe(false);
    expect(isValidStorageKey('2026/08/a3/zzzz.png')).toBe(false);
    expect(isValidStorageKey('2026/08/a3/' + 'a'.repeat(32) + '.svg')).toBe(false);
  });

  it('tanınmayan tür sniff edilmez', () => {
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImage(fakePng())).toBe('image/png');
  });

  it('boyut okunamayan dosya için null döner (çağıran REDDETMELİ)', () => {
    expect(imageSize(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'))
      .toBeNull();
  });

  it('bozuk JPEG metadata temizliğinde girdi aynen döner', () => {
    const junk = Buffer.from([0xff, 0xd8, 0x11, 0x22]);
    expect(stripJpegMetadata(junk).equals(junk)).toBe(true);
  });
});

describe('tesisat — sessiz kırılma bekçileri', () => {
  it('⚠️ `support:changed` gerçek zamanlı olaya çevriliyor (sessizce yutulmuyor)', () => {
    const ev = eventForOutbox('support:changed', { ticketId: 7, playerId: 42, by: 'admin' }, 1);
    expect(ev).not.toBeNull();
    expect(ev!.playerIds).toEqual([42]);
  });

  it('⚠️ ANONİM talepte olay üretilmez (dünya odasına düşüp herkese sızmasın)', () => {
    expect(eventForOutbox('support:changed', { ticketId: 7, playerId: null }, null)).toBeNull();
  });

  it('bildirim YALNIZ yönetici yanıtında üretilir', () => {
    expect(notificationForOutbox('support:changed', { ticketId: 7, playerId: 42, by: 'admin' }, 1))
      .toHaveLength(1);
    expect(notificationForOutbox('support:changed', { ticketId: 7, playerId: 42, by: 'user' }, 1))
      .toHaveLength(0);
  });

  it('`ticket` bildirim kategorisi kayıtlı', () => {
    expect(NOTIFY_CATEGORIES).toContain('ticket');
  });

  it('bakımda destek konusu geçer (oyuncu tam da o an yazar)', () => {
    expect(MAINTENANCE_PASSTHROUGH_TOPICS).toContain('support:changed');
  });

  it('⚠️ hız sınırı YALNIZ kimliksiz destek uçlarında', () => {
    const paths = LIMITED.map((r) => r.path);
    expect(paths).toContain('/api/v1/support/public/tickets');
    expect(paths).toContain('/api/v1/support/public/uploads');
    // Girişli uçlar ASLA listede olmamalı (oyun içi trafiğe IP sınırı uygulanmaz).
    expect(paths.some((p) => p === '/api/v1/support' || p === '/api/v1/support/uploads')).toBe(false);
  });
});
