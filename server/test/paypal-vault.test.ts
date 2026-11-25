import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { SESSION_COOKIE } from '../src/auth.js';
import { sharePercent, sumAmounts } from '../src/money.js';
import { refreshRatesIfStale, type RatesFetcher } from '../src/rates.js';
import { addMovement, balanceOf, createAccount, createUser, openTestDb, type TestDb } from './helpers.js';

let db: TestDb;
let app: FastifyInstance;
let userId: string;
let cookies: Record<string, string>;

beforeAll(async () => {
  db = openTestDb();
  app = await buildApp({ pool: db.app, cookieSecure: false });
  const user = await createUser(db);
  userId = user.id;
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: user.username, password: user.password },
  });
  cookies = { [SESSION_COOKIE]: login.cookies.find((c) => c.name === SESSION_COOKIE)!.value };
});

afterAll(async () => {
  await app.close();
  await db.close();
});

beforeEach(async () => {
  await db.owner.query('DELETE FROM exchange_rates');
});

const setRate = (currency: string, usdRate: string, fetchedAt = 'now()') =>
  db.owner.query(
    `INSERT INTO exchange_rates (currency, rate_date, usd_rate, source, fetched_at)
     VALUES ($1, current_date, $2, 'اختبار', ${fetchedAt})`,
    [currency, usdRate],
  );

interface VaultAccount {
  accountId: string;
  balance: string | null;
  approx: boolean;
  share: number;
  parts: { currency: string; balance: string }[];
}
interface Vault {
  total: string | null;
  converted: boolean;
  approx: boolean;
  ratesAt: string | null;
  totals: { currency: string; total: string }[];
  accounts: VaultAccount[];
}
const paypalVault = async () =>
  (await app.inject({ method: 'GET', url: '/api/vaults/paypal', cookies })).json() as Vault;
const vaultList = async () =>
  (await app.inject({ method: 'GET', url: '/api/accounts', cookies })).json().vaults as (Vault & {
    key: string;
    count: number;
    top: { balance: string | null }[];
  })[];

const fakeFetcher =
  (perUsd: Record<string, string>, calls: { n: number }): RatesFetcher =>
  async () => {
    calls.n += 1;
    return { date: '2026-11-20', perUsd, source: 'اختبار' };
  };

describe('حساب المبالغ المساعد', () => {
  it('الجمع والحصة بلا float', () => {
    expect(sumAmounts(['0.1000', '0.2000'])).toBe('0.3000');
    expect(sumAmounts(['2500.0000', '-100.5000'])).toBe('2399.5000');
    expect(sumAmounts([])).toBe('0.0000');
    expect(sharePercent('40000', '70000')).toBe(57);
    expect(sharePercent('0', '70000')).toBe(0);
    expect(sharePercent('5', '0')).toBe(0);
  });
});

describe('خزنة PayPal', () => {
  it('سطر واحد لكل حساب: مجموع عملاته محوّلاً إلى الدولار، والإجمالي مع ≈', async () => {
    await setRate('EUR', '1.10000000');
    const mixed = await createAccount(db, userId, { provider: 'PayPal', currencies: [['USD', '2500'], ['EUR', '100']] });
    const usdOnly = await createAccount(db, userId, { provider: 'PayPal', currencies: [['USD', '300.25']] });

    const vault = await paypalVault();
    expect(vault.converted).toBe(true);
    expect(vault.approx).toBe(true);
    expect(vault.ratesAt).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

    const rows = vault.accounts.filter((a) => a.accountId === mixed.accountId);
    expect(rows).toHaveLength(1);
    // 2500 + 100 × 1.10 = 2610
    expect(rows[0]).toMatchObject({
      balance: '2610.0000',
      approx: true,
      parts: [{ currency: 'USD', balance: '2500.0000' }, { currency: 'EUR', balance: '100.0000' }],
    });
    // حساب بالدولار فقط: رقمه حقيقي بلا ≈
    expect(vault.accounts.find((a) => a.accountId === usdOnly.accountId)).toMatchObject({
      balance: '300.2500',
      approx: false,
    });
    expect(vault.total).toBe(sumAmounts(vault.accounts.map((a) => a.balance!)));
    expect(vault.accounts.reduce((sum, a) => sum + a.share, 0)).toBeGreaterThan(95);

    const summary = (await vaultList()).find((v) => v.key === 'PAYPAL')!;
    expect(summary).toMatchObject({ total: vault.total, approx: true, converted: true, count: vault.accounts.length });
  });

  it('يورو PayPal لا يدخل خزنة اليورو', async () => {
    const eurBefore = (await vaultList()).find((v) => v.key === 'EUR')?.total ?? '0.0000';
    await createAccount(db, userId, { provider: 'PayPal', currencies: [['EUR', '777']] });
    const eurAfter = (await vaultList()).find((v) => v.key === 'EUR')?.total ?? '0.0000';
    expect(eurAfter).toBe(eurBefore);

    const paypalEur = (await paypalVault()).totals.find((t) => t.currency === 'EUR')!;
    const expected = await db.app.query<{ total: string }>(
      "SELECT sum(balance)::numeric(18,4)::text AS total FROM v_account_currency_balances WHERE vault_key = 'PAYPAL' AND currency = 'EUR'",
    );
    expect(paypalEur.total).toBe(expected.rows[0]!.total);
  });

  it('بدون أسعار محفوظة: أرصدة كل عملة بلا تحويل', async () => {
    const account = await createAccount(db, userId, { provider: 'PayPal', currencies: [['USD', '50'], ['EUR', '20']] });
    const vault = await paypalVault();
    expect(vault).toMatchObject({ converted: false, approx: false, total: null, ratesAt: null });
    expect(vault.totals.map((t) => t.currency)).toEqual(['USD', 'EUR']);
    expect(vault.accounts.find((a) => a.accountId === account.accountId)).toMatchObject({
      balance: null,
      approx: false,
      parts: [{ currency: 'USD', balance: '50.0000' }, { currency: 'EUR', balance: '20.0000' }],
    });
    const summary = (await vaultList()).find((v) => v.key === 'PAYPAL')!;
    expect(summary.total).toBeNull();
    expect(summary.top.every((row) => row.balance === null)).toBe(true);
  });

  it('السعر للعرض فقط: تغييره لا يغيّر أي رصيد حقيقي ولا أي قيد', async () => {
    const account = await createAccount(db, userId, { provider: 'PayPal', currencies: [['USD', '10'], ['EUR', '200']] });
    await addMovement(db, userId, account.currencies.EUR!, '50');
    const entriesBefore = await db.app.query('SELECT id, amount, currency FROM ledger_entries ORDER BY id');

    await setRate('EUR', '1.00000000');
    const first = (await paypalVault()).accounts.find((a) => a.accountId === account.accountId)!;
    await db.owner.query("UPDATE exchange_rates SET usd_rate = 2 WHERE currency = 'EUR'");
    const second = (await paypalVault()).accounts.find((a) => a.accountId === account.accountId)!;

    expect(first.balance).toBe('260.0000'); // 10 + 250 × 1
    expect(second.balance).toBe('510.0000'); // 10 + 250 × 2
    expect(await balanceOf(db, account.currencies.EUR!)).toBe('250.0000');
    expect(await balanceOf(db, account.currencies.USD!)).toBe('10.0000');
    expect(second.parts).toEqual(first.parts);
    const entriesAfter = await db.app.query('SELECT id, amount, currency FROM ledger_entries ORDER BY id');
    expect(entriesAfter.rows).toEqual(entriesBefore.rows);
  });

  it('لا يقرأ أي عرض أرصدة ولا أي Trigger جدول الأسعار', async () => {
    const views = await db.owner.query<{ viewname: string }>(
      "SELECT viewname FROM pg_views WHERE schemaname = 'public' AND definition ILIKE '%exchange_rates%'",
    );
    expect(views.rows).toEqual([]);
    const functions = await db.owner.query<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosrc ILIKE '%exchange_rates%'`,
    );
    expect(functions.rows).toEqual([]);
  });
});

describe('جلب الأسعار', () => {
  it('يحفظ عملات النظام فقط، بسعر الوحدة بالدولار', async () => {
    const calls = { n: 0 };
    const result = await refreshRatesIfStale(db.app, fakeFetcher({ EUR: '0.8', ILS: '4', GBP: '0.76', XYZ: '9' }, calls));
    expect(result).toBe('updated');
    const saved = await db.app.query<{ currency: string; usd_rate: string; rate_date: string }>(
      "SELECT currency, usd_rate::text, to_char(rate_date, 'YYYY-MM-DD') AS rate_date FROM exchange_rates ORDER BY currency",
    );
    expect(saved.rows).toEqual([
      { currency: 'EUR', usd_rate: '1.25000000', rate_date: '2026-11-20' },
      { currency: 'ILS', usd_rate: '0.25000000', rate_date: '2026-11-20' },
    ]);
  });

  it('مرة واحدة في اليوم: لا يُعاد الجلب بعد نجاحه', async () => {
    const calls = { n: 0 };
    const fetcher = fakeFetcher({ EUR: '0.9' }, calls);
    expect(await refreshRatesIfStale(db.app, fetcher)).toBe('updated');
    expect(await refreshRatesIfStale(db.app, fetcher)).toBe('fresh');
    expect(calls.n).toBe(1);
  });

  it('أسعار الأمس تُجدَّد اليوم', async () => {
    await setRate('EUR', '1.05000000', "now() - interval '1 day'");
    const calls = { n: 0 };
    expect(await refreshRatesIfStale(db.app, fakeFetcher({ EUR: '0.8' }, calls))).toBe('updated');
    expect(calls.n).toBe(1);
  });

  it('فشل الجلب يُبقي آخر أسعار محفوظة مستعملة', async () => {
    await setRate('EUR', '1.20000000', "now() - interval '3 days'");
    const account = await createAccount(db, userId, { provider: 'PayPal', currencies: [['EUR', '100']] });
    const messages: string[] = [];
    const failing: RatesFetcher = async () => {
      throw new Error('لا يوجد اتصال');
    };
    expect(await refreshRatesIfStale(db.app, failing, (m) => messages.push(m))).toBe('failed');
    expect(messages[0]).toContain('فشل الجلب');

    const rates = await db.app.query<{ usd_rate: string }>('SELECT usd_rate::text FROM exchange_rates');
    expect(rates.rows).toEqual([{ usd_rate: '1.20000000' }]);
    const vault = await paypalVault();
    expect(vault.converted).toBe(true);
    expect(vault.accounts.find((a) => a.accountId === account.accountId)!.balance).toBe('120.0000');
  });

  it('رد بلا عملات النظام يُعدّ فشلاً ولا يحفظ شيئاً', async () => {
    const calls = { n: 0 };
    expect(await refreshRatesIfStale(db.app, fakeFetcher({ GBP: '0.76' }, calls))).toBe('failed');
    expect((await db.app.query('SELECT 1 FROM exchange_rates')).rowCount).toBe(0);
  });
});
