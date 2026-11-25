import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { SESSION_COOKIE } from '../src/auth.js';
import { withTransaction } from '../src/db.js';
import { createAccount, createUser, openTestDb, providerId, unique, type TestDb } from './helpers.js';

let db: TestDb;
let app: FastifyInstance;
let userId: string;
let cookies: Record<string, string>;

beforeAll(async () => {
  db = openTestDb();
  app = await buildApp({ pool: db.app, cookieSecure: false });
  const user = await createUser(db, { name: 'أحمد' });
  userId = user.id;
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: user.username, password: user.password } });
  cookies = { [SESSION_COOKIE]: login.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
});

afterAll(async () => {
  await app.close();
  await db.close();
});

const get = (url: string) => app.inject({ method: 'GET', url, cookies });

/** حركة على الجدول التجريبي بتاريخ محدد. */
const moveOn = (accountCurrencyId: string, amount: string, date: string) =>
  withTransaction(db.app, userId, (client) =>
    client.query("INSERT INTO test_movements (account_currency_id, amount, moved_at) VALUES ($1, $2, ($3 || ' 12:00 Asia/Jerusalem')::timestamptz)", [
      accountCurrencyId, amount, date,
    ]),
  );

interface Statement {
  currency: string;
  opening: { date: string; balance: string };
  rows: { date: string; title: string; kind: string; amount: string; balance: string }[];
  totals: { debit: string; credit: string; count: number };
  closing: { date: string; balance: string };
}
const statement = async (id: string, query = '') => (await get(`/api/account-currencies/${id}/statement${query}`)).json() as Statement;

describe('صفحات الأنواع', () => {
  it('تتطلب جلسة، والصفحة غير المعروفة 404', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/account-pages/banks' })).statusCode).toBe(401);
    expect((await get('/api/account-pages/cash')).statusCode).toBe(404);
  });

  it('صفحة البنوك: بيانات الحساب بتسميات قالبه، وأرصدته ووثائقه وملاحظاته', async () => {
    const name = unique('حساب المكتب');
    const created = await app.inject({
      method: 'POST', url: '/api/accounts', cookies,
      payload: {
        providerId: await providerId(db, 'بنك فلسطين'), name, responsibleId: userId,
        details: { branch: 'المغازي', acctType: 'جاري', holder: 'مكتب المدينة', accNo: '0400991', iban_ILS: 'PS35PALS000000000400400991702' },
        currencies: [{ currency: 'ILS', initialBalance: '12000' }],
        documents: [{ type: 'هوية', holder: 'أحمد', expiry: '2030-01-05', note: 'قُدّمت عند فتح الحساب' }],
        note: 'حساب المكتب الرئيسي',
      },
    });
    expect(created.statusCode).toBe(201);
    const page = (await get('/api/account-pages/banks')).json() as {
      accounts: { id: string; provider: string; name: string; status: string; fields: { label: string; value: string; copy: boolean; en: boolean }[]; currencies: { currency: string; balance: string }[]; documents: unknown[]; notes: string[] }[];
      totals: { currency: string; total: string }[];
    };
    const account = page.accounts.find((a) => a.id === created.json().id)!;
    expect(account).toMatchObject({ provider: 'بنك فلسطين', name, status: 'ACTIVE' });
    expect(account.fields.map((f) => [f.label, f.value, f.copy])).toEqual([
      ['الجهة', 'بنك فلسطين', false],
      ['الفرع', 'المغازي', true],
      ['نوع الحساب', 'جاري', false],
      ['اسم صاحب الحساب', 'مكتب المدينة', true],
      ['رقم الحساب', '0400991', true],
      ['IBAN الشيكل', 'PS35PALS000000000400400991702', true],
      ['المسؤول عنه في المكتب', 'أحمد', false],
    ]);
    expect(account.currencies.map((c) => [c.currency, c.balance])).toEqual([['ILS', '12000.0000']]);
    expect(account.documents).toEqual([{ type: 'هوية', holder: 'أحمد', expiry: '2030-01-05', note: 'قُدّمت عند فتح الحساب' }]);
    expect(account.notes).toEqual(['حساب المكتب الرئيسي']);

    const expected = await db.app.query<{ total: string }>(
      `SELECT sum(b.balance)::numeric(18,4)::text AS total FROM v_account_currency_balances b
       JOIN accounts a ON a.id = b.account_id JOIN providers p ON p.id = a.provider_id WHERE p.type = 'BANK' AND b.currency = 'ILS'`,
    );
    expect(page.totals.find((t) => t.currency === 'ILS')!.total).toBe(expected.rows[0]!.total);
    // كل صفحة تعرض حسابات نوعها فقط
    expect(page.accounts.every((a) => ['بنك فلسطين', 'البنك العربي'].includes(a.provider) || !['PayPal', 'Binance', 'KAST'].includes(a.provider))).toBe(true);
    const wallets = (await get('/api/account-pages/palestinian-wallets')).json().accounts as { id: string }[];
    expect(wallets.some((a) => a.id === account.id)).toBe(false);
  });

  it('صفحة Cash Plus تعرض حسابات جهة Cash Plus فقط', async () => {
    const mine = await createAccount(db, userId, { provider: 'Cash Plus', currencies: [['USD', '500']] });
    const page = (await get('/api/account-pages/cash-plus')).json().accounts as { id: string; provider: string }[];
    expect(page.some((a) => a.id === mine.accountId)).toBe(true);
    expect(page.every((a) => a.provider === 'Cash Plus')).toBe(true);
  });
});

describe('كشف الحساب', () => {
  it('الرصيد الافتتاحي أول سطر، والرصيد الجاري = الافتتاحي + القيود بالترتيب', async () => {
    const account = await createAccount(db, userId, { currency: 'USD', initialBalance: '1000' });
    await moveOn(account.id, '250.50', '2026-10-05');
    await moveOn(account.id, '-100', '2026-10-20');
    await moveOn(account.id, '40', '2026-11-03');

    const all = await statement(account.id);
    expect(all.currency).toBe('USD');
    expect(all.opening.balance).toBe('1000.0000');
    expect(all.rows.map((r) => [r.date, r.amount, r.balance])).toEqual([
      ['2026-10-05', '250.5000', '1250.5000'],
      ['2026-10-20', '-100.0000', '1150.5000'],
      ['2026-11-03', '40.0000', '1190.5000'],
    ]);
    expect(all.rows[0]).toMatchObject({ title: 'حركة اختبار', kind: 'حوالة' });
    expect(all.totals).toEqual({ debit: '100.0000', credit: '290.5000', count: 3 });
    expect(all.closing.balance).toBe('1190.5000');
    const view = await db.app.query<{ balance: string }>('SELECT balance::text FROM v_account_currency_balances WHERE account_currency_id = $1', [account.id]);
    expect(all.closing.balance).toBe(view.rows[0]!.balance);
  });

  it('فترة محددة: رصيد أول الفترة = ما قبلها، والإجماليات للفترة فقط', async () => {
    const account = await createAccount(db, userId, { currency: 'USD', initialBalance: '1000' });
    await moveOn(account.id, '250', '2026-10-05');
    await moveOn(account.id, '-100', '2026-10-20');
    await moveOn(account.id, '40', '2026-11-03');

    const october = await statement(account.id, '?from=2026-10-10&to=2026-10-31');
    expect(october.opening).toEqual({ date: '2026-10-10', balance: '1250.0000' });
    expect(october.rows.map((r) => [r.date, r.balance])).toEqual([['2026-10-20', '1150.0000']]);
    expect(october.totals).toEqual({ debit: '100.0000', credit: '0.0000', count: 1 });
    expect(october.closing).toEqual({ date: '2026-10-31', balance: '1150.0000' });

    const empty = await statement(account.id, '?from=2026-12-01');
    expect(empty.rows).toEqual([]);
    expect(empty.opening.balance).toBe('1190.0000');
    expect(empty.closing.balance).toBe('1190.0000');
    expect(empty.totals).toEqual({ debit: '0.0000', credit: '0.0000', count: 0 });
  });

  it('حساب بلا حركات: الرصيد الافتتاحي فقط بتاريخه', async () => {
    const account = await createAccount(db, userId, { currency: 'ILS', initialBalance: '75' });
    await db.app.query("UPDATE account_currencies SET opening_date = '2026-09-01' WHERE id = $1", [account.id]);
    const result = await statement(account.id);
    expect(result.opening).toEqual({ date: '2026-09-01', balance: '75.0000' });
    expect(result.rows).toEqual([]);
    expect(result.closing.balance).toBe('75.0000');
  });

  it('الحركة الملغاة تخرج من الكشف', async () => {
    const account = await createAccount(db, userId, { currency: 'USD', initialBalance: '10' });
    await moveOn(account.id, '5', '2026-10-05');
    const movement = await db.app.query<{ id: string }>('SELECT id FROM test_movements WHERE account_currency_id = $1', [account.id]);
    await withTransaction(db.app, userId, (client) =>
      client.query("UPDATE test_movements SET cancelled_at = now(), cancel_reason = 'خطأ' WHERE id = $1", [movement.rows[0]!.id]),
    );
    const result = await statement(account.id);
    expect(result.rows).toEqual([]);
    expect(result.closing.balance).toBe('10.0000');
  });

  it('مدخلات غير صالحة', async () => {
    expect((await get('/api/account-currencies/not-a-uuid/statement')).statusCode).toBe(400);
    expect((await get('/api/account-currencies/01938f4e-0000-7000-8000-000000000000/statement')).statusCode).toBe(404);
    const account = await createAccount(db, userId);
    expect((await get(`/api/account-currencies/${account.id}/statement?from=10/2026`)).statusCode).toBe(400);
  });
});
