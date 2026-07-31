/**
 * ⭐ ADMİN TEMELİ (Faz 0) — yetki ve adım yükseltme.
 *
 * Ölçülen davranışlar, hepsi güvenlik iddiası olduğu için hepsi test edilir:
 *   • rolsüz hesap panele giremez
 *   • moderator/admin girebilir
 *   • yükseltme olmadan yıkıcı uç kapalı, parola sonrası açık
 *   • ⭐ **rol geri alınınca ANINDA etkisiz** — token'a gömülmediğinin kanıtı
 *   • yükseltme oturuma ait: aynı hesabın başka oturumu yükseltilmiş sayılmaz
 *
 * Guard'lar HTTP olmadan çağrılıyor (`alliance.test.ts` deseni): `ExecutionContext` yerine
 * en küçük sahte nesne yeterli — kural guard'ın kendisinde.
 */
import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminController, STEP_UP_MINUTES } from '../src/admin/admin.controller.ts';
import { AdminGuard, AdminStepUpGuard, type AdminRequest } from '../src/admin/admin.guard.ts';
import { PasswordService } from '../src/auth/password.service.ts';
import type { DbHandle } from '../src/db/client.ts';
import { createWorld, freshWorldId, setupTestDb } from './helpers/db.ts';

let h: DbHandle;
let guard: AdminGuard;
let stepUp: AdminStepUpGuard;
let ctl: AdminController;
let worldId: number;

const PASSWORD = 'admin-parolasi-123';

/** Guard'ın gördüğü en küçük `ExecutionContext`. */
const asContext = (req: AdminRequest): ExecutionContext => ({
  switchToHttp: () => ({ getRequest: () => req }),
} as unknown as ExecutionContext);

const asReq = (o: {
  accountId: number; playerId: number; sessionId: string;
}): AdminRequest => ({
  player: { ...o, worldId },
  headers: {},
} as unknown as AdminRequest);

/** Hesap + oyuncu + oturum kurar; oturum kimliğini döndürür. */
async function makeStaff(role: 'player' | 'moderator' | 'admin'): Promise<{
  accountId: number; playerId: number; sessionId: string;
}> {
  const tag = randomUUID().slice(0, 8);
  const hash = await new PasswordService().hash(PASSWORD);
  const [acc] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO accounts (email, password_hash, role)
    VALUES (${`${role}-${tag}@t.local`}, ${hash}, ${role}) RETURNING id
  `);
  const accountId = Number(acc!['id']);
  const [ply] = await h.db.execute<Record<string, unknown>>(sql`
    INSERT INTO players (world_id, account_id, username) VALUES (${worldId}, ${accountId}, ${`u${tag}`})
    RETURNING id
  `);
  const sessionId = randomUUID();
  await h.db.execute(sql`
    INSERT INTO sessions (id, account_id, refresh_hash, expires_at)
    VALUES (${sessionId}::uuid, ${accountId}, ${`h-${tag}`}, now() + interval '30 days')
  `);
  return { accountId, playerId: Number(ply!['id']), sessionId };
}

beforeAll(async () => {
  h = await setupTestDb();
  guard = new AdminGuard(h.db);
  stepUp = new AdminStepUpGuard();
  ctl = new AdminController(h.db);
}, 60_000);

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  worldId = freshWorldId();
  await createWorld(h, worldId);
});

describe('AdminGuard — kim girebilir', () => {
  it('rolsüz oyuncu reddedilir', async () => {
    const s = await makeStaff('player');
    await expect(guard.canActivate(asContext(asReq(s)))).rejects.toThrow();
  });

  it('moderator ve admin girebilir', async () => {
    for (const role of ['moderator', 'admin'] as const) {
      const s = await makeStaff(role);
      const req = asReq(s);
      await expect(guard.canActivate(asContext(req))).resolves.toBe(true);
      expect(req.staff?.role, role).toBe(role);
      expect(req.staff?.elevated).toBe(false);   // yeni oturum yükseltilmemiş
    }
  });

  it('oturumsuz istek reddedilir', async () => {
    const req = { headers: {} } as unknown as AdminRequest;
    await expect(guard.canActivate(asContext(req))).rejects.toThrow();
  });

  /**
   * ⭐ TOKEN'A GÖMÜLMEDİĞİNİN KANITI. Rol access token'da olsaydı geri alındıktan sonra
   * token'ın ömrü (15 dk) boyunca geçerli kalırdı. Burada aynı oturumla ikinci çağrı
   * ANINDA reddediliyor.
   */
  it('⭐ rol geri alınınca AYNI oturumda anında etkisiz', async () => {
    const s = await makeStaff('admin');
    await expect(guard.canActivate(asContext(asReq(s)))).resolves.toBe(true);

    await h.db.execute(sql`UPDATE accounts SET role = 'player' WHERE id = ${s.accountId}`);

    await expect(guard.canActivate(asContext(asReq(s)))).rejects.toThrow();
  });
});

describe('adım yükseltme', () => {
  it('yükseltmesiz yıkıcı uç kapalı', async () => {
    const s = await makeStaff('admin');
    const req = asReq(s);
    await guard.canActivate(asContext(req));
    expect(() => stepUp.canActivate(asContext(req))).toThrow();
  });

  it('doğru parolayla yükseltilir, sonra yıkıcı uç açılır', async () => {
    const s = await makeStaff('admin');
    const req = asReq(s);
    await guard.canActivate(asContext(req));

    const res = await ctl.stepUp({ password: PASSWORD }, req);
    expect(res['elevated']).toBe(true);
    const until = new Date(String(res['elevatedUntil'])).getTime();
    expect(until).toBeGreaterThan(Date.now() + (STEP_UP_MINUTES - 2) * 60_000);

    // Yeni istek: guard yükseltmeyi DB'den okumalı.
    const fresh = asReq(s);
    await guard.canActivate(asContext(fresh));
    expect(fresh.staff?.elevated).toBe(true);
    expect(stepUp.canActivate(asContext(fresh))).toBe(true);
  });

  it('yanlış parola yükseltmez', async () => {
    const s = await makeStaff('admin');
    const req = asReq(s);
    await guard.canActivate(asContext(req));
    await expect(ctl.stepUp({ password: 'yanlis-parola' }, req)).rejects.toThrow();

    const fresh = asReq(s);
    await guard.canActivate(asContext(fresh));
    expect(fresh.staff?.elevated).toBe(false);
  });

  /** ⚠️ Yükseltme OTURUMA ait, hesaba değil: bir sekmede yükseltmek diğerini açmaz. */
  it('⭐ yükseltme oturuma özel — aynı hesabın başka oturumu etkilenmez', async () => {
    const s = await makeStaff('admin');
    const req = asReq(s);
    await guard.canActivate(asContext(req));
    await ctl.stepUp({ password: PASSWORD }, req);

    const otherSession = randomUUID();
    await h.db.execute(sql`
      INSERT INTO sessions (id, account_id, refresh_hash, expires_at)
      VALUES (${otherSession}::uuid, ${s.accountId}, ${`h2-${otherSession.slice(0, 8)}`},
              now() + interval '30 days')
    `);
    const other = asReq({ ...s, sessionId: otherSession });
    await guard.canActivate(asContext(other));
    expect(other.staff?.elevated).toBe(false);
  });

  it('step-down yükseltmeyi bırakır', async () => {
    const s = await makeStaff('admin');
    const req = asReq(s);
    await guard.canActivate(asContext(req));
    await ctl.stepUp({ password: PASSWORD }, req);
    await ctl.stepDown(req);

    const fresh = asReq(s);
    await guard.canActivate(asContext(fresh));
    expect(fresh.staff?.elevated).toBe(false);
  });

  it('süresi geçmiş yükseltme sayılmaz', async () => {
    const s = await makeStaff('admin');
    await h.db.execute(sql`
      UPDATE sessions SET elevated_until = now() - interval '1 minute'
       WHERE id = ${s.sessionId}::uuid
    `);
    const req = asReq(s);
    await guard.canActivate(asContext(req));
    expect(req.staff?.elevated).toBe(false);
  });
});

describe('GET /admin/me', () => {
  it('künye rol ve yükseltme durumunu taşır', async () => {
    const s = await makeStaff('moderator');
    const req = asReq(s);
    await guard.canActivate(asContext(req));
    const me = await ctl.me(req);
    expect(me['role']).toBe('moderator');
    expect(me['elevated']).toBe(false);
    expect(me['accountId']).toBe(s.accountId);
    expect(String(me['email'])).toContain('@t.local');
  });
});
