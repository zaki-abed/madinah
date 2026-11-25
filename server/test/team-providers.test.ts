import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { SESSION_COOKIE } from '../src/auth.js';
import { withTransaction } from '../src/db.js';
import { createAccount, createUser, openTestDb, providerId, unique, type TestDb } from './helpers.js';

let db: TestDb;
let app: FastifyInstance;
let me: { id: string; username: string; password: string };
let cookies: Record<string, string>;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
const call = (method: Method, url: string, payload?: unknown, as = cookies) =>
  app.inject({ method, url, cookies: as, ...(payload === undefined ? {} : { payload: payload as object }) });
const message = async (method: Method, url: string, payload?: unknown) => (await call(method, url, payload)).json().error?.message;

async function loginCookies(username: string, password: string) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
  const jar: Record<string, string> = cookie ? { [SESSION_COOKIE]: cookie.value } : {};
  return { status: response.statusCode, cookies: jar };
}

beforeAll(async () => {
  db = openTestDb();
  app = await buildApp({ pool: db.app, cookieSecure: false });
  me = await createUser(db, { name: 'أحمد' });
  cookies = (await loginCookies(me.username, me.password)).cookies;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

const expectDbError = (work: Promise<unknown>, code: string) => expect(work).rejects.toMatchObject({ code });

interface Member {
  id: string; name: string; username: string; isActive: boolean; me: boolean;
  lastLoginDate: string | null; lastLoginDaysAgo: number | null; accounts: string[]; hasTrace: boolean;
}
const members = async () => (await call('GET', '/api/team')).json().members as Member[];
const member = async (id: string) => (await members()).find((m) => m.id === id)!;

async function addMember(name = unique('كرم')) {
  const username = unique('karam').toLowerCase().replace(/[^a-z0-9._]/g, '.');
  const response = await call('POST', '/api/team', { name, username, password: 'member-pass-1', password2: 'member-pass-1' });
  return { id: response.json().id as string, name, username, password: 'member-pass-1', status: response.statusCode };
}

describe('دمج المستخدمين مع فريق العمل (migration 0013)', () => {
  it('لا أدوار ولا صلاحيات ولا قائمة أسماء منفصلة', async () => {
    const tables = await db.owner.query<{ t: string }>(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('staff_members', 'user_permissions')",
    );
    expect(tables.rows).toEqual([]);
    const role = await db.owner.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role'");
    expect(role.rowCount).toBe(0);
  });

  it('اسم قديم يطابق عضواً: حساباته تُربط به', async () => {
    const row = await db.owner.query<{ username: string; is_active: boolean; n: number }>(
      `SELECT u.username::text AS username, u.is_active, count(*) OVER ()::int AS n
       FROM accounts a JOIN users u ON u.id = a.responsible_id WHERE a.name = 'حساب قديم لكرم'`,
    );
    expect(row.rows[0]).toMatchObject({ username: 'Legacy.Admin', is_active: true });
    expect((await db.owner.query("SELECT 1 FROM users WHERE full_name = 'كرم القديم'")).rowCount).toBe(1);
  });

  it('اسم قديم بلا عضو مطابق: يصير عضواً موقوفاً لا يدخل، ويبقى «المسؤول عنه» محفوظاً', async () => {
    const row = await db.owner.query<{ id: string; username: string; is_active: boolean; full_name: string }>(
      `SELECT u.id, u.username::text AS username, u.is_active, u.full_name
       FROM accounts a JOIN users u ON u.id = a.responsible_id WHERE a.name = 'حساب قديم لهبة'`,
    );
    const heba = row.rows[0]!;
    expect(heba).toMatchObject({ full_name: 'هبة القديمة', is_active: false });
    expect(heba.username).toMatch(/^member\.[a-f0-9]{12}$/);
    expect((await loginCookies(heba.username, '')).status).toBe(400);
    expect((await loginCookies(heba.username, 'legacy-pass-1')).status).toBe(401);

    // يُفعَّل من الشاشة بتعيين كلمة مرور وإعادة التفعيل
    await call('POST', `/api/team/${heba.id}/password`, { password: 'heba-new-pass', password2: 'heba-new-pass' });
    await call('POST', `/api/team/${heba.id}/active`, { active: true });
    expect((await loginCookies(heba.username, 'heba-new-pass')).status).toBe(200);
  });

  it('اسم دخول قديم لا يطابق الصيغة يبقى يعمل، والصيغة تُفرض عند تغييره', async () => {
    const legacy = await loginCookies('legacy.admin', 'legacy-pass-1');
    expect(legacy.status).toBe(200);
    const row = await db.owner.query<{ id: string }>("SELECT id FROM users WHERE username = 'Legacy.Admin'");
    const id = row.rows[0]!.id;
    // تعديل الاسم الظاهر فقط لا يمس اسم الدخول القديم
    expect((await call('PATCH', `/api/team/${id}`, { name: 'كرم القديم', username: 'Legacy.Admin' })).statusCode).toBe(200);
    expect(await message('PATCH', `/api/team/${id}`, { name: 'كرم القديم', username: 'Legacy Admin!' })).toBe(
      'اسم الدخول بالأحرف الإنجليزية والأرقام فقط، 3 أحرف على الأقل.',
    );
    await expectDbError(db.owner.query("UPDATE users SET username = 'Bad Name' WHERE id = $1", [id]), 'MD012');
  });
});

describe('فريق العمل', () => {
  it('كل عضو يدخل النظام، وبصلاحيات كاملة', async () => {
    const added = await addMember();
    expect(added.status).toBe(201);
    const session = await loginCookies(added.username, added.password);
    expect(session.status).toBe(200);
    // العضو الجديد يضيف عضواً ويحذف حساباً بلا حركات: لا فرق بين الأعضاء
    const account = await createAccount(db, me.id);
    expect((await call('DELETE', `/api/accounts/${account.accountId}`, undefined, session.cookies)).statusCode).toBe(204);
    const other = await call('POST', '/api/team', { name: 'عضو', username: unique('m').toLowerCase().replace(/[^a-z0-9._]/g, '.'), password: 'another-pass-1', password2: 'another-pass-1' }, session.cookies);
    expect(other.statusCode).toBe(201);
  });

  it('القائمة: «أنت»، آخر دخول، والحسابات المسؤول عنها', async () => {
    const account = await createAccount(db, me.id);
    await db.app.query('UPDATE accounts SET responsible_id = $2 WHERE id = $1', [account.accountId, me.id]);
    const mine = await member(me.id);
    expect(mine).toMatchObject({ name: 'أحمد', me: true, isActive: true, hasTrace: true, lastLoginDaysAgo: 0 });
    expect(mine.lastLoginDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(mine.accounts.some((title) => title.startsWith('بنك فلسطين – '))).toBe(true);

    const fresh = await addMember();
    expect(await member(fresh.id)).toMatchObject({ me: false, lastLoginDate: null, accounts: [], hasTrace: false });
  });

  it('رسائل الإضافة والتعديل كما في التصميم', async () => {
    const base = { name: 'كرم', username: unique('k').toLowerCase().replace(/[^a-z0-9._]/g, '.'), password: 'member-pass-1', password2: 'member-pass-1' };
    expect(await message('POST', '/api/team', { ...base, name: ' ' })).toBe('اكتب الاسم الظاهر.');
    expect(await message('POST', '/api/team', { ...base, username: 'كرم' })).toBe('اسم الدخول بالأحرف الإنجليزية والأرقام فقط، 3 أحرف على الأقل.');
    expect(await message('POST', '/api/team', { ...base, username: 'ab' })).toBe('اسم الدخول بالأحرف الإنجليزية والأرقام فقط، 3 أحرف على الأقل.');
    expect(await message('POST', '/api/team', { ...base, username: me.username.toUpperCase() })).toBe('اسم الدخول مستعمل لعضو آخر.');
    expect(await message('POST', '/api/team', { ...base, password: 'short', password2: 'short' })).toBe('كلمة المرور 8 أحرف على الأقل.');
    expect(await message('POST', '/api/team', { ...base, password2: 'member-pass-2' })).toBe('كلمتا المرور غير متطابقتين.');

    const added = await addMember();
    expect(await message('PATCH', `/api/team/${added.id}`, { name: 'كرم', username: me.username })).toBe('اسم الدخول مستعمل لعضو آخر.');
    const renamed = unique('renamed').toLowerCase().replace(/[^a-z0-9._]/g, '.');
    expect((await call('PATCH', `/api/team/${added.id}`, { name: 'كرم الجديد', username: renamed })).statusCode).toBe(200);
    expect(await member(added.id)).toMatchObject({ name: 'كرم الجديد', username: renamed });
    expect((await loginCookies(renamed, added.password)).status).toBe(200);
  });

  it('تغيير كلمة المرور: يُنهي جلسات العضو، ومن غيّر كلمته يبقى داخلاً', async () => {
    const added = await addMember();
    const theirs = await loginCookies(added.username, added.password);
    expect(await message('POST', `/api/team/${added.id}/password`, { password: 'new-pass-123', password2: 'x' })).toBe('كلمتا المرور غير متطابقتين.');
    expect((await call('POST', `/api/team/${added.id}/password`, { password: 'new-pass-123', password2: 'new-pass-123' })).statusCode).toBe(200);
    expect((await call('GET', '/api/auth/me', undefined, theirs.cookies)).statusCode).toBe(401);
    expect((await loginCookies(added.username, added.password)).status).toBe(401);
    expect((await loginCookies(added.username, 'new-pass-123')).status).toBe(200);

    const own = await call('POST', `/api/team/${me.id}/password`, { password: 'my-new-pass-1', password2: 'my-new-pass-1' });
    expect(own.statusCode).toBe(200);
    const renewed = own.cookies.find((c) => c.name === SESSION_COOKIE)!;
    expect((await call('GET', '/api/auth/me')).statusCode).toBe(401); // الجلسة القديمة انتهت
    cookies = { [SESSION_COOKIE]: renewed.value };
    expect((await call('GET', '/api/auth/me')).statusCode).toBe(200);
    me.password = 'my-new-pass-1';
    const hash = await db.owner.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [me.id]);
    expect(hash.rows[0]!.password_hash).toMatch(/^\$2a\$12\$/);
  });

  it('عضو بلا حسابات ولا أثر يُحذف', async () => {
    const added = await addMember();
    expect((await call('DELETE', `/api/team/${added.id}`)).statusCode).toBe(204);
    expect(await member(added.id)).toBeUndefined();
  });

  it('عضو دخل النظام (أثر في سجل التدقيق) لا يُحذف بل يُوقَف', async () => {
    const added = await addMember();
    const theirs = await loginCookies(added.username, added.password);
    expect(await message('DELETE', `/api/team/${added.id}`)).toBe('لا يمكن حذف عضو له حسابات أو حركات في النظام. يمكن إيقافه بدلاً من الحذف.');
    await expectDbError(db.owner.query('DELETE FROM users WHERE id = $1', [added.id]), 'MD013');

    expect((await call('POST', `/api/team/${added.id}/active`, { active: false })).statusCode).toBe(200);
    // الإيقاف يُنهي جلسته فوراً ولا يدخل بعدها
    expect((await call('GET', '/api/auth/me', undefined, theirs.cookies)).statusCode).toBe(401);
    expect((await loginCookies(added.username, added.password)).status).toBe(401);
    expect((await member(added.id)).isActive).toBe(false);

    expect((await call('POST', `/api/team/${added.id}/active`, { active: true })).statusCode).toBe(200);
    expect((await loginCookies(added.username, added.password)).status).toBe(200);
  });

  it('عضو مسؤول عن حساب لا يُحذف', async () => {
    const added = await addMember();
    const account = await createAccount(db, me.id);
    await db.app.query('UPDATE accounts SET responsible_id = $2 WHERE id = $1', [account.accountId, added.id]);
    expect((await call('DELETE', `/api/team/${added.id}`)).statusCode).toBe(422);
    expect((await member(added.id)).accounts).toHaveLength(1);
  });

  it('لا أحد يوقف نفسه أو يحذف نفسه', async () => {
    expect(await message('POST', `/api/team/${me.id}/active`, { active: false })).toBe('لا يمكن إيقاف العضو الحالي.');
    expect(await message('DELETE', `/api/team/${me.id}`)).toBe('لا يمكن حذف العضو الحالي.');
    expect((await member(me.id)).isActive).toBe(true);
  });

  it('يبقى عضو نشط واحد على الأقل (القاعدة ترفض إيقاف الكل)', async () => {
    await expectDbError(
      withTransaction(db.owner, null, (client) => client.query('UPDATE users SET is_active = false')),
      'MD013',
    );
    expect((await db.owner.query('SELECT 1 FROM users WHERE is_active')).rowCount).toBeGreaterThan(0);
  });

  it('«المسؤول عنه» عضو نشط فقط', async () => {
    const added = await addMember();
    await loginCookies(added.username, added.password);
    await call('POST', `/api/team/${added.id}/active`, { active: false });
    const account = await createAccount(db, me.id);
    await expectDbError(db.app.query('UPDATE accounts SET responsible_id = $2 WHERE id = $1', [account.accountId, added.id]), 'MD014');

    const refused = await call('POST', '/api/accounts', {
      providerId: await providerId(db, 'KAST'), name: unique('حساب'), responsibleId: added.id, details: { email: 'a@b.co', holder: 'Z' },
    });
    expect(refused.json().error.issues.map((i: { label: string }) => i.label)).toEqual([
      'المسؤول عنه في المكتب: يُختار من أعضاء فريق العمل النشطين',
    ]);
    expect((await call('GET', '/api/staff')).statusCode).toBe(404);
  });
});

interface ProviderRow {
  id: string; name: string; type: string; currencies: string[]; isActive: boolean; isBuiltin: boolean; accounts: string[]; usedCurrencies: string[];
}
const providers = async () => (await call('GET', '/api/providers')).json().providers as ProviderRow[];
const provider = async (id: string) => (await providers()).find((p) => p.id === id)!;
async function addProvider(type = 'BANK', currencies = ['ILS', 'USD']) {
  const name = unique('جهة');
  const response = await call('POST', '/api/providers', { name, type, currencies });
  return { id: response.json().provider.id as string, name };
}
/** حساب تحت جهة معيّنة بعملة. */
async function accountUnder(providerName: string, currency: string | null) {
  return createAccount(db, me.id, { provider: providerName, currencies: currency ? [[currency, '0']] : [] });
}

describe('الجهات', () => {
  it('القائمة: العملات المسموحة لكل نوع، والحسابات والعملات المستعملة', async () => {
    const response = (await call('GET', '/api/providers')).json();
    expect(response.typeCurrencies).toEqual({
      BANK: ['ILS', 'USD', 'JOD', 'EUR'], PAYMENT_PLATFORM: ['USD', 'EUR', 'ILS', 'JOD'], PAYPAL: ['USD', 'EUR', 'ILS', 'JOD'],
      USDT_PLATFORM: ['USDT'], EG_WALLET: ['EGP'], PS_WALLET: ['ILS', 'USD'], CARD_APP: [],
    });
    const created = await addProvider();
    await accountUnder(created.name, 'USD');
    expect(await provider(created.id)).toMatchObject({ isActive: true, isBuiltin: false, usedCurrencies: ['USD'] });
    expect((await provider(created.id)).accounts).toHaveLength(1);
  });

  it('التعديل: الاسم والعملات، والعملات تُرتَّب بترتيب نوعها', async () => {
    const created = await addProvider('BANK', ['USD', 'ILS']);
    expect((await provider(created.id)).currencies).toEqual(['ILS', 'USD']);
    const renamed = unique('بنك');
    const edit = await call('PATCH', `/api/providers/${created.id}`, { name: renamed, type: 'BANK', currencies: ['EUR', 'ILS'] });
    expect(edit.statusCode).toBe(200);
    expect(await provider(created.id)).toMatchObject({ name: renamed, currencies: ['ILS', 'EUR'] });

    expect(await message('PATCH', `/api/providers/${created.id}`, { name: ' ', type: 'BANK', currencies: ['ILS'] })).toBe('اكتب اسم الجهة.');
    expect(await message('PATCH', `/api/providers/${created.id}`, { name: 'بنك فلسطين', type: 'BANK', currencies: ['ILS'] })).toBe('توجد جهة بنفس الاسم.');
    expect(await message('PATCH', `/api/providers/${created.id}`, { name: renamed, type: 'BANK', currencies: [] })).toBe('اختر عملة واحدة على الأقل.');
    expect(await message('PATCH', `/api/providers/${created.id}`, { name: renamed, type: 'BANK', currencies: ['EGP'] })).toBe('عملة غير مسموحة لهذا النوع من الجهات.');
    await expectDbError(db.owner.query("UPDATE providers SET currencies = '{EGP}' WHERE id = $1", [created.id]), 'MD006');
  });

  it('جهة بلا حسابات تُحذف، بما فيها الأساسية', async () => {
    const created = await addProvider();
    expect((await call('DELETE', `/api/providers/${created.id}`)).statusCode).toBe(204);
    expect(await provider(created.id)).toBeUndefined();

    // الجهة الأساسية بلا حسابات تُحذف كذلك (جهة اختبار موسومة «أساسية» حتى لا تُحذف جهة يحتاجها اختبار آخر)
    const builtin = await addProvider();
    await db.owner.query('UPDATE providers SET is_builtin = true WHERE id = $1', [builtin.id]);
    expect((await provider(builtin.id)).isBuiltin).toBe(true);
    expect((await call('DELETE', `/api/providers/${builtin.id}`)).statusCode).toBe(204);
  });

  it('جهة عليها حسابات لا تُحذف بل تُوقَف، والموقوفة لا يُضاف تحتها حساب', async () => {
    const created = await addProvider('PS_WALLET', ['ILS', 'USD']);
    const existing = await accountUnder(created.name, 'ILS');
    expect(await message('DELETE', `/api/providers/${created.id}`)).toBe('لا يمكن حذف جهة عليها حسابات. يمكن إيقافها بدلاً من الحذف.');
    await expectDbError(db.owner.query('DELETE FROM providers WHERE id = $1', [created.id]), 'MD015');

    expect((await call('POST', `/api/providers/${created.id}/active`, { active: false })).statusCode).toBe(200);
    expect((await provider(created.id)).isActive).toBe(false);

    await expectDbError(accountUnder(created.name, 'USD'), 'MD016');
    const viaApi = await call('POST', '/api/accounts', {
      providerId: created.id, name: unique('محفظة'), responsibleId: me.id, details: { no: '0599123456', holder: 'أحمد' }, currencies: [{ currency: 'ILS' }],
    });
    expect(viaApi.json().error.message).toBe('الجهة موقوفة. لا يُضاف تحتها حساب جديد.');
    // ولا يُنقل إليها حساب
    const elsewhere = await accountUnder('JAWWAL Pay', 'ILS');
    await expectDbError(db.app.query('UPDATE accounts SET provider_id = $2 WHERE id = $1', [elsewhere.accountId, created.id]), 'MD016');
    // حساباتها الحالية تبقى وتعمل: تغيير حالتها مثلاً
    await db.app.query("UPDATE accounts SET status = 'FROZEN' WHERE id = $1", [existing.accountId]);

    expect((await call('POST', `/api/providers/${created.id}/active`, { active: true })).statusCode).toBe(200);
    await accountUnder(created.name, 'USD');
  });

  it('النوع لا يتغير إذا على الجهة حسابات، ويتغير مع قالبه إذا كانت بلا حسابات', async () => {
    const empty = await addProvider('BANK', ['ILS']);
    const moved = await call('PATCH', `/api/providers/${empty.id}`, { name: empty.name, type: 'PS_WALLET', currencies: ['ILS'] });
    expect(moved.json().provider).toMatchObject({ type: 'PS_WALLET', template: 'plw' });

    const used = await addProvider('BANK', ['ILS']);
    await accountUnder(used.name, 'ILS');
    expect(await message('PATCH', `/api/providers/${used.id}`, { name: used.name, type: 'PS_WALLET', currencies: ['ILS'] })).toBe(
      'لا يتغير النوع لأن على الجهة حسابات.',
    );
  });

  it('العملة التي عليها حسابات لا تُحذف من الجهة، وغيرها تُحذف', async () => {
    const created = await addProvider('BANK', ['ILS', 'USD', 'JOD']);
    await accountUnder(created.name, 'USD');
    expect(await message('PATCH', `/api/providers/${created.id}`, { name: created.name, type: 'BANK', currencies: ['ILS'] })).toBe(
      'العملة التي عليها حسابات لا تُحذف من الجهة.',
    );
    expect((await call('PATCH', `/api/providers/${created.id}`, { name: created.name, type: 'BANK', currencies: ['USD'] })).statusCode).toBe(200);
    expect((await provider(created.id)).currencies).toEqual(['USD']);
  });

  it('PayPal جهة ثابتة: لا تُحذف ولا يتغير نوعها، وتُعدَّل عملاتها وتُوقَف', async () => {
    const paypal = await providerId(db, 'PayPal');
    await expectDbError(db.owner.query('DELETE FROM providers WHERE id = $1', [paypal]), 'MD015');
    expect((await call('DELETE', `/api/providers/${paypal}`)).statusCode).toBe(422);
    await expectDbError(db.owner.query("UPDATE providers SET type = 'PAYMENT_PLATFORM' WHERE id = $1", [paypal]), 'MD015');
    const other = await addProvider('PAYMENT_PLATFORM', ['USD']);
    await expectDbError(db.owner.query("UPDATE providers SET type = 'PAYPAL' WHERE id = $1", [other.id]), 'MD015');

    // الشاشة ترسل نوع «منصات الدفع» لـ PayPal، والنوع يبقى PAYPAL
    const before = (await provider(paypal)).currencies;
    const edit = await call('PATCH', `/api/providers/${paypal}`, { name: 'PayPal', type: 'PAYMENT_PLATFORM', currencies: [...before, 'ILS'] });
    expect(edit.json().provider).toMatchObject({ type: 'PAYPAL', template: 'paypal' });
    expect(edit.json().provider.currencies).toContain('ILS');
    await call('PATCH', `/api/providers/${paypal}`, { name: 'PayPal', type: 'PAYMENT_PLATFORM', currencies: before });

    expect((await call('POST', `/api/providers/${paypal}/active`, { active: false })).statusCode).toBe(200);
    expect((await call('POST', `/api/providers/${paypal}/active`, { active: true })).statusCode).toBe(200);
  });

  it('كل تعديل على الجهة يُسجَّل في سجل التدقيق باسم العضو', async () => {
    const created = await addProvider();
    await call('POST', `/api/providers/${created.id}/active`, { active: false });
    await call('DELETE', `/api/providers/${created.id}`);
    const logs = await db.owner.query<{ action: string; user_id: string }>(
      "SELECT action, user_id FROM audit_logs WHERE entity = 'providers' AND entity_id = $1 ORDER BY id",
      [created.id],
    );
    expect(logs.rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE', 'DELETE']);
    expect(logs.rows.every((r) => r.user_id === me.id)).toBe(true);
  });
});
