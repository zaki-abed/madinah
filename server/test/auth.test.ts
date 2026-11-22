import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { SESSION_COOKIE } from '../src/auth.js';
import { createUser, openTestDb, unique, type TestDb } from './helpers.js';

let db: TestDb;
let app: FastifyInstance;

beforeAll(async () => {
  db = openTestDb();
  app = await buildApp({ pool: db.app, cookieSecure: false });
});

afterAll(async () => {
  await app.close();
  await db.close();
});

const login = (payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload });

function sessionCookie(response: Awaited<ReturnType<typeof login>>) {
  return response.cookies.find((c) => c.name === SESSION_COOKIE);
}

describe('كلمات المرور', () => {
  it('تُحفظ مشفّرة bcrypt وليست نصاً', async () => {
    const user = await createUser(db, { password: 'my-secret-pass' });
    const row = await db.owner.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [user.id],
    );
    expect(row.rows[0]!.password_hash).toMatch(/^\$2a\$12\$/);
    expect(row.rows[0]!.password_hash).not.toContain('my-secret-pass');
  });

  it('التطبيق لا يقرأ password_hash ولا ينشئ مستخدمين مباشرة', async () => {
    await expect(db.app.query('SELECT password_hash FROM users')).rejects.toMatchObject({ code: '42501' });
    await expect(db.app.query('SELECT * FROM users')).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.app.query("SELECT auth_create_user('x', 'password-123', 'x', 'ADMIN')"),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('كلمة مرور أقصر من 8 أحرف مرفوضة', async () => {
    await expect(createUser(db, { password: 'short' })).rejects.toMatchObject({ code: 'MD010' });
  });

  it('لا تظهر في سجل التدقيق', async () => {
    const user = await createUser(db, { password: 'audit-secret-1' });
    await db.owner.query('SELECT auth_set_password($1, $2)', [user.id, 'audit-secret-2']);
    const logs = await db.owner.query<{ text: string; details: string | null }>(
      "SELECT (COALESCE(before, '{}') || COALESCE(after, '{}'))::text AS text, details FROM audit_logs WHERE entity = 'users' AND entity_id = $1",
      [user.id],
    );
    expect(logs.rowCount).toBe(2);
    expect(logs.rows.some((r) => r.details === 'تغيير كلمة المرور')).toBe(true);
    for (const row of logs.rows) {
      expect(row.text).not.toContain('password_hash');
      expect(row.text).not.toContain('$2a$');
    }
  });
});

describe('تسجيل الدخول', () => {
  it('بيانات صحيحة: جلسة في كوكي HttpOnly، وتُسجَّل في التدقيق', async () => {
    const user = await createUser(db, { username: unique('Ahmad') });
    // اسم المستخدم بلا حساسية لحالة الأحرف
    const response = await login({ username: user.username.toUpperCase(), password: user.password });
    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ id: user.id, role: 'ADMIN', fullName: 'مستخدم اختبار' });
    expect(response.body).not.toContain('password');

    const cookie = sessionCookie(response)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    expect(cookie.maxAge).toBeUndefined();

    // الرمز لا يُحفظ نصاً في القاعدة
    const stored = await db.owner.query<{ hex: string; hours: number }>(
      "SELECT encode(token_hash, 'hex') AS hex, round(extract(epoch FROM expires_at - now()) / 3600)::int AS hours FROM sessions WHERE user_id = $1",
      [user.id],
    );
    expect(stored.rows[0]!.hex).not.toBe(Buffer.from(cookie.value).toString('hex'));
    expect(stored.rows[0]!.hours).toBe(12);

    const audit = await db.owner.query(
      "SELECT 1 FROM audit_logs WHERE action = 'LOGIN' AND user_id = $1",
      [user.id],
    );
    expect(audit.rowCount).toBe(1);
    const lastLogin = await db.owner.query<{ last_login_at: Date | null }>(
      'SELECT last_login_at FROM users WHERE id = $1',
      [user.id],
    );
    expect(lastLogin.rows[0]!.last_login_at).not.toBeNull();

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: cookie.value } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.permissions.manageUsers).toBe(true);
  });

  it('«تذكرني» يمدّ الجلسة إلى 30 يوماً', async () => {
    const user = await createUser(db);
    const response = await login({ username: user.username, password: user.password, remember: true });
    expect(sessionCookie(response)!.maxAge).toBe(30 * 24 * 60 * 60);
    const stored = await db.owner.query<{ days: number }>(
      'SELECT round(extract(epoch FROM expires_at - now()) / 86400)::int AS days FROM sessions WHERE user_id = $1',
      [user.id],
    );
    expect(stored.rows[0]!.days).toBe(30);
  });

  it('كلمة مرور خاطئة أو مستخدم غير موجود: نفس الرسالة', async () => {
    const user = await createUser(db);
    const wrong = await login({ username: user.username, password: 'wrong-password' });
    const unknown = await login({ username: unique('nobody'), password: 'wrong-password' });
    for (const response of [wrong, unknown]) {
      expect(response.statusCode).toBe(401);
      expect(response.json().error.message).toBe('اسم المستخدم أو كلمة المرور غير صحيحة.');
      expect(sessionCookie(response)).toBeUndefined();
    }
  });

  it('مستخدم معطّل لا يدخل، وجلسته السابقة تتوقف', async () => {
    const user = await createUser(db);
    const first = await login({ username: user.username, password: user.password });
    const cookie = sessionCookie(first)!.value;

    await db.owner.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);

    const again = await login({ username: user.username, password: user.password });
    expect(again.statusCode).toBe(401);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('الحقول الفارغة: رسائل التصميم', async () => {
    const both = await login({ username: '  ', password: '' });
    const noUser = await login({ username: '', password: 'x' });
    const noPass = await login({ username: 'x', password: '' });
    expect(both.statusCode).toBe(400);
    expect(both.json().error.message).toBe('أدخل اسم المستخدم وكلمة المرور.');
    expect(noUser.json().error.message).toBe('أدخل اسم المستخدم.');
    expect(noPass.json().error.message).toBe('أدخل كلمة المرور.');
  });

  it('قفل 15 دقيقة بعد 5 محاولات خاطئة، ثم يعود الدخول بعد انتهاء القفل', async () => {
    const user = await createUser(db);
    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await login({ username: user.username, password: 'wrong-password' });
      expect(response.statusCode).toBe(401);
    }
    const fifth = await login({ username: user.username, password: 'wrong-password' });
    expect(fifth.statusCode).toBe(429);
    expect(fifth.json().error.message).toContain('15 دقيقة');

    // حتى الكلمة الصحيحة مرفوضة أثناء القفل
    const during = await login({ username: user.username, password: user.password });
    expect(during.statusCode).toBe(429);

    const lock = await db.owner.query<{ minutes: number }>(
      'SELECT round(extract(epoch FROM locked_until - now()) / 60)::int AS minutes FROM login_throttle WHERE username = $1',
      [user.username],
    );
    expect(lock.rows[0]!.minutes).toBe(15);

    await db.owner.query(
      "UPDATE login_throttle SET locked_until = now() - interval '1 second' WHERE username = $1",
      [user.username],
    );
    const after = await login({ username: user.username, password: user.password });
    expect(after.statusCode).toBe(200);
  });

  it('الدخول الصحيح يصفّر عدّاد المحاولات الخاطئة', async () => {
    const user = await createUser(db);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await login({ username: user.username, password: 'wrong-password' });
    }
    expect((await login({ username: user.username, password: user.password })).statusCode).toBe(200);
    for (let attempt = 1; attempt <= 4; attempt++) {
      const response = await login({ username: user.username, password: 'wrong-password' });
      expect(response.statusCode).toBe(401);
    }
  });
});

describe('الجلسة', () => {
  it('بدون جلسة: 401', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(401);
    const forged = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: 'forged' } });
    expect(forged.statusCode).toBe(401);
  });

  it('تسجيل الخروج يحذف الجلسة من القاعدة', async () => {
    const user = await createUser(db);
    const cookie = sessionCookie(await login({ username: user.username, password: user.password }))!.value;

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { [SESSION_COOKIE]: cookie } });
    expect(logout.statusCode).toBe(204);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: cookie } });
    expect(me.statusCode).toBe(401);
    const left = await db.owner.query('SELECT 1 FROM sessions WHERE user_id = $1', [user.id]);
    expect(left.rowCount).toBe(0);
  });

  it('الجلسة المنتهية مرفوضة', async () => {
    const user = await createUser(db);
    const cookie = sessionCookie(await login({ username: user.username, password: user.password }))!.value;
    await db.owner.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [user.id]);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [SESSION_COOKIE]: cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('صلاحيات الموظف الافتراضية من جدول الصلاحيات', async () => {
    const user = await createUser(db, { role: 'EMPLOYEE' });
    const response = await login({ username: user.username, password: user.password });
    expect(response.json().user.permissions).toEqual({
      canEdit: true,
      canDelete: false,
      viewReports: false,
      manageUsers: false,
      viewBalances: true,
      viewProfit: false,
    });
  });
});
