import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { SESSION_COOKIE } from '../src/auth.js';
import { formatAmount, parseAmount } from '../src/money.js';
import {
  addMovement,
  balanceOf,
  createAccount,
  createUser,
  openTestDb,
  providerId,
  unique,
  type TestDb,
} from './helpers.js';

let db: TestDb;
let app: FastifyInstance;
let userId: string;
let cookies: Record<string, string>;
let employeeCookies: Record<string, string>;

async function loginAs(role: 'ADMIN' | 'EMPLOYEE') {
  const user = await createUser(db, { role });
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: user.username, password: user.password },
  });
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE)!;
  return { id: user.id, cookies: { [SESSION_COOKIE]: cookie.value } };
}

beforeAll(async () => {
  db = openTestDb();
  app = await buildApp({ pool: db.app, cookieSecure: false });
  const admin = await loginAs('ADMIN');
  userId = admin.id;
  cookies = admin.cookies;
  employeeCookies = (await loginAs('EMPLOYEE')).cookies;
});

afterAll(async () => {
  await app.close();
  await db.close();
});

const expectDbError = (work: Promise<unknown>, code: string) => expect(work).rejects.toMatchObject({ code });

const api = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown, as = cookies) =>
  app.inject({ method, url, cookies: as, ...(payload === undefined ? {} : { payload: payload as object }) });

interface ListedAccount {
  id: string;
  name: string;
  status: string;
  statusSince: string | null;
  hasMovements: boolean;
  movementsCount: number;
  currencies: { id: string; currency: string; initialBalance: string; balance: string }[];
}
async function listed(id: string): Promise<ListedAccount> {
  const response = await api('GET', '/api/accounts');
  return (response.json().accounts as ListedAccount[]).find((a) => a.id === id)!;
}

describe('المبالغ', () => {
  it('تُقرأ وتُعرض بلا float', () => {
    expect(parseAmount('1,250.50')).toBe('1250.50');
    expect(parseAmount('')).toBe('0');
    expect(parseAmount('12abc')).toBeNull();
    expect(parseAmount('1.23456')).toBeNull();
    expect(formatAmount('1234567.8950')).toBe('1,234,567.90');
    expect(formatAmount('0.0000')).toBe('0.00');
    expect(formatAmount('-1850.0000')).toBe('-1,850.00');
    expect(formatAmount('-0.0010')).toBe('0.00');
    expect(formatAmount('99999999999999.9999')).toBe('100,000,000,000,000.00');
  });
});

describe('الجهات والأنواع', () => {
  it('لا يوجد نوع CASH، والحالات أربع', async () => {
    const types = await db.app.query<{ t: string }>("SELECT unnest(enum_range(NULL::account_type))::text AS t");
    expect(types.rows.map((r) => r.t)).toEqual([
      'BANK', 'PAYPAL', 'PAYMENT_PLATFORM', 'EG_WALLET', 'PS_WALLET', 'USDT_PLATFORM', 'CARD_APP',
    ]);
    const statuses = await db.app.query<{ s: string }>("SELECT unnest(enum_range(NULL::account_status))::text AS s");
    expect(statuses.rows.map((r) => r.s)).toEqual(['ACTIVE', 'RESTRICTED', 'FROZEN', 'CLOSED']);
  });

  it('الجهات الأربع عشرة الأساسية موجودة، ولا يوجد GBP', async () => {
    const result = await db.app.query<{ name: string; currencies: string[] }>(
      'SELECT name, currencies FROM providers WHERE is_builtin',
    );
    expect(result.rowCount).toBe(14);
    expect(result.rows.flatMap((r) => r.currencies)).not.toContain('GBP');
    expect(result.rows.find((r) => r.name === 'Cash Plus')!.currencies).toEqual(['USD', 'JOD', 'EUR']);
  });

  it('PayPal جهة واحدة فقط', async () => {
    await expectDbError(
      db.owner.query("INSERT INTO providers (name, type, template, currencies) VALUES ('PayPal 2', 'PAYPAL', 'paypal', '{USD}')"),
      '23505',
    );
  });

  it('لا يوجد عمود رصيد في أي جدول', async () => {
    const columns = await db.owner.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name IN ('accounts', 'account_currencies', 'providers')
         AND column_name LIKE '%balance%'`,
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual(['initial_balance']);
  });
});

describe('الحساب متعدد العملات (القاعدة)', () => {
  it('لكل عملة رصيد مستقل = افتتاحيها + قيودها', async () => {
    const account = await createAccount(db, userId, { currencies: [['ILS', '40000'], ['USD', '10000']] });
    await addMovement(db, userId, account.currencies.ILS!, '2500');
    await addMovement(db, userId, account.currencies.USD!, '-300.25');
    expect(await balanceOf(db, account.currencies.ILS!)).toBe('42500.0000');
    expect(await balanceOf(db, account.currencies.USD!)).toBe('9699.7500');
  });

  it('الاسم فريد داخل الجهة فقط', async () => {
    const name = unique('حساب المكتب');
    const insert = async (provider: string) =>
      db.app.query('INSERT INTO accounts (provider_id, name) VALUES ($1, $2)', [await providerId(db, provider), name]);
    await insert('بنك فلسطين');
    await insert('البنك العربي');
    await expectDbError(insert('بنك فلسطين'), '23505');
  });

  it('العملة من عملات الجهة فقط، والعملة لا تتكرر في الحساب', async () => {
    await expectDbError(createAccount(db, userId, { provider: 'Binance', currency: 'USD' }), 'MD006');
    await expectDbError(createAccount(db, userId, { provider: 'Vodafone Cash', currency: 'ILS' }), 'MD006');
    await expectDbError(createAccount(db, userId, { currency: 'XXX' }), 'MD006');
    await expectDbError(createAccount(db, userId, { currencies: [['ILS', '0'], ['ILS', '5']] }), '23505');
    const usdt = await createAccount(db, userId, { provider: 'Binance', currency: 'USDT', initialBalance: '6000' });
    expect(await balanceOf(db, usdt.id)).toBe('6000.0000');
  });

  it('تطبيقات البطاقات بلا عملات', async () => {
    const card = await createAccount(db, userId, { provider: 'KAST', currencies: [] });
    await expectDbError(
      db.app.query("INSERT INTO account_currencies (account_id, currency) VALUES ($1, 'USD')", [card.accountId]),
      'MD006',
    );
  });

  it('الرصيد الافتتاحي وتاريخه يُقفلان لكل عملة بعد أول حركة عليها', async () => {
    const account = await createAccount(db, userId, { currencies: [['ILS', '50'], ['USD', '20']] });
    const set = (id: string, sql: string) => db.app.query(`UPDATE account_currencies SET ${sql} WHERE id = $1`, [id]);

    await set(account.currencies.ILS!, 'initial_balance = 75');
    await addMovement(db, userId, account.currencies.ILS!, '10');
    await expectDbError(set(account.currencies.ILS!, 'initial_balance = 80'), 'MD004');
    await expectDbError(set(account.currencies.ILS!, "opening_date = '2026-01-01'"), 'MD004');
    expect(await balanceOf(db, account.currencies.ILS!)).toBe('85.0000');

    // الدولار بلا حركات، فيبقى قابلاً للتعديل
    await set(account.currencies.USD!, 'initial_balance = 30');
    expect(await balanceOf(db, account.currencies.USD!)).toBe('30.0000');
  });

  it('عملة عليها حركة لا تُحذف، والتي بلا حركة تُحذف', async () => {
    const account = await createAccount(db, userId, { currencies: [['ILS', '0'], ['USD', '0']] });
    await addMovement(db, userId, account.currencies.ILS!, '10');
    const remove = (id: string) => db.app.query('DELETE FROM account_currencies WHERE id = $1', [id]);
    await expectDbError(remove(account.currencies.ILS!), 'MD004');
    expect((await remove(account.currencies.USD!)).rowCount).toBe(1);
  });

  it('حساب بلا حركة يُحذف مع عملاته، وحساب عليه حركة لا يُحذف', async () => {
    const empty = await createAccount(db, userId, { currencies: [['ILS', '100'], ['USD', '5']] });
    expect((await db.app.query('DELETE FROM accounts WHERE id = $1', [empty.accountId])).rowCount).toBe(1);
    const left = await db.app.query('SELECT 1 FROM account_currencies WHERE account_id = $1', [empty.accountId]);
    expect(left.rowCount).toBe(0);

    const used = await createAccount(db, userId);
    await addMovement(db, userId, used.id, '100');
    await expectDbError(db.app.query('DELETE FROM accounts WHERE id = $1', [used.accountId]), 'MD004');
    await db.app.query("UPDATE accounts SET status = 'CLOSED' WHERE id = $1", [used.accountId]);
    expect(await balanceOf(db, used.id)).toBe('100.0000');
  });

  it('النقل إلى جهة أخرى: فقط بلا حركات، وبعملات متاحة في الجهة الجديدة', async () => {
    const move = async (accountId: string, provider: string) =>
      db.app.query('UPDATE accounts SET provider_id = $2 WHERE id = $1', [accountId, await providerId(db, provider)]);

    const fresh = await createAccount(db, userId, { currencies: [['ILS', '10']] });
    await move(fresh.accountId, 'البنك العربي');
    await expectDbError(move(fresh.accountId, 'Binance'), 'MD006');

    const used = await createAccount(db, userId);
    await addMovement(db, userId, used.id, '5');
    await expectDbError(move(used.accountId, 'البنك العربي'), 'MD004');
  });

  it('كل عملات PayPal في خزنة PayPal، خارج خزائن عملاتها', async () => {
    const paypal = await createAccount(db, userId, { provider: 'PayPal', currencies: [['USD', '2500'], ['EUR', '10']] });
    const bank = await createAccount(db, userId, { currency: 'USD', initialBalance: '10' });
    const keys = await db.app.query<{ account_currency_id: string; vault_key: string }>(
      'SELECT account_currency_id, vault_key FROM v_account_currency_balances WHERE account_currency_id = ANY ($1)',
      [[paypal.currencies.USD, paypal.currencies.EUR, bank.id]],
    );
    const byId = Object.fromEntries(keys.rows.map((r) => [r.account_currency_id, r.vault_key]));
    expect(byId[paypal.currencies.USD!]).toBe('PAYPAL');
    // يورو PayPal يتبع خزنة PayPal ولا يدخل خزنة اليورو
    expect(byId[paypal.currencies.EUR!]).toBe('PAYPAL');
    expect(byId[bank.id]).toBe('USD');
  });

  it('تغيير الحالة يُسجَّل مع أرصدة الحساب لحظتها', async () => {
    const account = await createAccount(db, userId, { initialBalance: '70' });
    await db.app.query("UPDATE accounts SET status = 'FROZEN' WHERE id = $1", [account.accountId]);
    const history = await db.app.query<{ from_status: string | null; to_status: string; balances: unknown }>(
      'SELECT from_status, to_status, balances FROM account_status_history WHERE account_id = $1 ORDER BY id',
      [account.accountId],
    );
    expect(history.rows.map((r) => [r.from_status, r.to_status])).toEqual([[null, 'ACTIVE'], ['ACTIVE', 'FROZEN']]);
    expect(history.rows[1]!.balances).toEqual([{ currency: 'ILS', balance: '70.0000' }]);
    await expectDbError(db.app.query('DELETE FROM account_status_history'), '42501');
  });
});

describe('واجهة الحسابات', () => {
  it('تتطلب جلسة', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/accounts' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/accounts', payload: {} })).statusCode).toBe(401);
  });

  it('إضافة حساب بعملتين ثم ظهوره في القائمة بأرصدته', async () => {
    const name = unique('حساب أحمد');
    const response = await api('POST', '/api/accounts', {
      providerId: await providerId(db, 'بنك فلسطين'),
      name,
      currencies: [
        { currency: 'USD', initialBalance: '10,000' },
        { currency: 'ILS', initialBalance: '' },
      ],
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ title: `بنك فلسطين – ${name}`, section: 'البنوك' });

    const account = await listed(response.json().id);
    expect(account).toMatchObject({ name, status: 'ACTIVE', statusSince: null, hasMovements: false, movementsCount: 0 });
    expect(account.currencies.map((c) => [c.currency, c.initialBalance, c.balance])).toEqual([
      ['USD', '10000.0000', '10000.0000'],
      ['ILS', '0.0000', '0.0000'],
    ]);
  });

  it('رسائل التحقق كما في التصميم', async () => {
    const bank = await providerId(db, 'بنك فلسطين');
    const name = unique('حساب كرم');
    const post = async (payload: unknown) => (await api('POST', '/api/accounts', payload)).json().error?.message;

    expect(await post({ name, currencies: [] })).toBe('اكتب اسم البنك أو المنصة.');
    expect(await post({ newProvider: { name: ' ', type: 'BANK' }, name })).toBe('اكتب اسم البنك أو المنصة.');
    expect(await post({ providerId: bank, name: '  ' })).toBe('اكتب اسم الحساب.');
    expect(await post({ providerId: bank, name, currencies: [] })).toBe('اختر عملة واحدة على الأقل.');
    expect(await post({ providerId: bank, name, currencies: [{ currency: 'USDT' }] })).toBe(
      'العملة USDT غير متاحة لحسابات بنك فلسطين.',
    );
    expect(await post({ providerId: bank, name, currencies: [{ currency: 'USD', initialBalance: '12x' }] })).toBe(
      'الرصيد الافتتاحي USD غير صالح.',
    );

    const created = await api('POST', '/api/accounts', { providerId: bank, name, currencies: [{ currency: 'USD' }] });
    expect(await post({ providerId: bank, name, currencies: [{ currency: 'USD' }] })).toBe(
      'يوجد حساب بنفس الاسم في بنك فلسطين. لا يمكن تكرار الحساب.',
    );
    await api('POST', `/api/accounts/${created.json().id}/status`, { status: 'CLOSED' });
    expect(await post({ providerId: bank, name, currencies: [{ currency: 'USD' }] })).toBe(
      'يوجد حساب «مغلق» بنفس الاسم في بنك فلسطين. يمكن تغيير حالته إلى «نشط» من «تعديل» بدلاً من إضافته من جديد.',
    );
  });

  it('جهة جديدة تأخذ قالب نوعها، وفشل الحساب لا يُبقي الجهة', async () => {
    const providerName = unique('بنك القدس');
    const failed = await api('POST', '/api/accounts', { newProvider: { name: providerName, type: 'BANK' }, name: '' });
    expect(failed.statusCode).toBe(400);
    expect((await db.app.query('SELECT 1 FROM providers WHERE name = $1', [providerName])).rowCount).toBe(0);

    const ok = await api('POST', '/api/accounts', {
      newProvider: { name: providerName, type: 'BANK' },
      name: 'حساب المكتب',
      currencies: [{ currency: 'JOD', initialBalance: '5' }],
    });
    expect(ok.statusCode).toBe(201);
    const provider = await db.app.query<{ template: string; currencies: string[]; is_builtin: boolean }>(
      'SELECT template, currencies, is_builtin FROM providers WHERE name = $1',
      [providerName],
    );
    expect(provider.rows[0]).toEqual({ template: 'bank', currencies: ['ILS', 'USD', 'JOD'], is_builtin: false });

    const again = await api('POST', '/api/accounts', { newProvider: { name: providerName, type: 'BANK' }, name: 'x' });
    expect(again.json().error.message).toContain('توجد جهة باسم');
  });

  it('حساب تطبيق بطاقات بلا عملات', async () => {
    const response = await api('POST', '/api/accounts', { providerId: await providerId(db, 'KAST'), name: unique('حساب زكي') });
    expect(response.statusCode).toBe(201);
    expect((await listed(response.json().id)).currencies).toEqual([]);
  });

  it('التعديل وتغيير الحالة وسجل التدقيق', async () => {
    const bank = await providerId(db, 'بنك فلسطين');
    const arab = await providerId(db, 'البنك العربي');
    const name = unique('زكي');
    const id = (
      await api('POST', '/api/accounts', { providerId: bank, name, currencies: [{ currency: 'USD', initialBalance: '3000' }] })
    ).json().id as string;

    const nothing = await api('PATCH', `/api/accounts/${id}`, { providerId: bank, name });
    expect(nothing.json().error.message).toBe('لا توجد تعديلات للحفظ.');

    const renamed = `حساب ${name}`;
    const edit = await api('PATCH', `/api/accounts/${id}`, {
      providerId: arab,
      name: renamed,
      addCurrencies: [{ currency: 'ILS', initialBalance: '1500.5' }],
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().title).toBe(`البنك العربي – ${renamed}`);

    const exists = await api('PATCH', `/api/accounts/${id}`, { providerId: arab, name: renamed, addCurrencies: [{ currency: 'ILS' }] });
    expect(exists.json().error.message).toBe('العملة ILS موجودة في الحساب.');

    expect((await api('POST', `/api/accounts/${id}/status`, { status: 'CLOSED' })).statusCode).toBe(200);
    const account = await listed(id);
    expect(account.status).toBe('CLOSED');
    expect(account.statusSince).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(account.currencies.map((c) => c.currency)).toEqual(['USD', 'ILS']);

    const log = (await api('GET', `/api/accounts/${id}/log`)).json().log as { kind: string; what: string; by: string; at: string }[];
    expect(log.map((l) => [l.kind, l.what])).toEqual([
      ['st', 'الحالة: من «نشط» إلى «مغلق» · الرصيد 1,500.50 ILS · 3,000.00 USD'],
      ['cur', 'إضافة عملة ILS برصيد افتتاحي 1,500.50'],
      ['edit', `الاسم: من «${name}» إلى «${renamed}»`],
      ['edit', 'البنك / المنصة: من «بنك فلسطين» إلى «البنك العربي»'],
      ['add', 'إنشاء الحساب بأرصدة افتتاحية'],
    ]);
    expect(log.every((l) => l.by === 'مستخدم اختبار' && /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(l.at))).toBe(true);
  });

  it('حساب عليه حركات: لا يُنقل ولا يُحذف، ورسالة القاعدة تصل كما هي', async () => {
    const account = await createAccount(db, userId, { currency: 'USD', initialBalance: '100' });
    await addMovement(db, userId, account.id, '25');
    const row = await listed(account.accountId);
    expect(row).toMatchObject({ hasMovements: true, movementsCount: 1 });

    const move = await api('PATCH', `/api/accounts/${account.accountId}`, {
      providerId: await providerId(db, 'البنك العربي'),
      name: row.name,
    });
    expect(move.statusCode).toBe(422);
    expect(move.json().error.message).toBe('لا يمكن نقل حساب عليه حركات إلى جهة أخرى.');

    const remove = await api('DELETE', `/api/accounts/${account.accountId}`);
    expect(remove.statusCode).toBe(422);
    expect(remove.json().error.message).toContain('لا يمكن حذف حساب عليه حركات');
  });

  it('حذف حساب بلا حركات', async () => {
    const account = await createAccount(db, userId);
    expect((await api('DELETE', `/api/accounts/${account.accountId}`)).statusCode).toBe(204);
    expect(await listed(account.accountId)).toBeUndefined();
  });

  it('الموظف بصلاحياته الافتراضية: يعدّل ولا يحذف', async () => {
    const account = await createAccount(db, userId);
    const remove = await api('DELETE', `/api/accounts/${account.accountId}`, undefined, employeeCookies);
    expect(remove.statusCode).toBe(403);
    const status = await api('POST', `/api/accounts/${account.accountId}/status`, { status: 'RESTRICTED' }, employeeCookies);
    expect(status.statusCode).toBe(200);
  });
});

describe('الخزائن', () => {
  it('إجمالي الخزنة = مجموع أرصدة حساباتها، مع الحصص وآخر حركة', async () => {
    const big = await createAccount(db, userId, { provider: 'JAWWAL Pay', currency: 'ILS', initialBalance: '300' });
    await addMovement(db, userId, big.id, '-50');

    const detail = (await api('GET', '/api/vaults/ils')).json() as {
      name: string; currency: string; total: string;
      accounts: { id: string; balance: string; share: number; lastAmount: string | null; type: string }[];
      moves: { amount: string; account: string }[];
    };
    expect(detail.name).toBe('خزنة الشيكل');
    expect(detail.currency).toBe('ILS');

    const expected = await db.app.query<{ total: string }>(
      "SELECT sum(balance)::numeric(18,4)::text AS total FROM v_account_currency_balances WHERE vault_key = 'ILS'",
    );
    expect(detail.total).toBe(expected.rows[0]!.total);

    const row = detail.accounts.find((a) => a.id === big.id)!;
    expect(row).toMatchObject({ balance: '250.0000', lastAmount: '-50.0000', type: 'PS_WALLET' });
    expect(detail.accounts.reduce((sum, a) => sum + a.share, 0)).toBeGreaterThan(95);
    expect(detail.moves[0]).toMatchObject({ amount: '-50.0000' });

    const list = (await api('GET', '/api/accounts')).json().vaults as { key: string; total: string; name: string; top: unknown[] }[];
    const ils = list.find((v) => v.key === 'ILS')!;
    expect(ils.total).toBe(expected.rows[0]!.total);
    expect(ils.top.length).toBeLessThanOrEqual(4);
    expect(list.map((v) => v.key)).toContain('PAYPAL');
    expect((await api('GET', '/api/vaults/cash')).statusCode).toBe(404);
  });
});
