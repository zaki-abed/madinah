import { randomUUID } from 'node:crypto';
import { createPool, withTransaction, type Pool } from '../src/db.js';
import { testDbUrls } from '../src/env.js';

export interface TestDb {
  /** دور التطبيق (madinah_app): نفس صلاحيات الخادم. */
  app: Pool;
  /** دور المالك: لتجهيز بيانات الاختبار فقط. */
  owner: Pool;
  close(): Promise<void>;
}

export function openTestDb(): TestDb {
  const urls = testDbUrls();
  const app = createPool(urls.app);
  const owner = createPool(urls.owner);
  return {
    app,
    owner,
    async close() {
      await app.end();
      await owner.end();
    },
  };
}

export const unique = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export async function createUser(
  db: TestDb,
  options: { password?: string; username?: string; name?: string } = {},
): Promise<{ id: string; username: string; password: string }> {
  const username = (options.username ?? unique('user')).toLowerCase().replace(/[^a-z0-9._]/g, '.');
  const password = options.password ?? 'correct-horse-9';
  const result = await db.owner.query<{ id: string }>(
    'SELECT auth_create_user($1, $2, $3) AS id',
    [username, password, options.name ?? 'مستخدم اختبار'],
  );
  return { id: result.rows[0]!.id, username, password };
}

export interface TestAccount {
  /** معرّف الحساب. */
  accountId: string;
  /** معرّف عملة الحساب الأولى: وحدة الرصيد التي تُربط بها القيود. */
  id: string;
  /** معرّفات عملات الحساب حسب رمز العملة. */
  currencies: Record<string, string>;
}

export async function providerId(db: TestDb, name: string): Promise<string> {
  const result = await db.app.query<{ id: string }>('SELECT id FROM providers WHERE name = $1', [name]);
  return result.rows[0]!.id;
}

/** حساب في جهة (الافتراضي بنك فلسطين) بعملة أو أكثر. */
export async function createAccount(
  db: TestDb,
  userId: string,
  options: { provider?: string; currency?: string; initialBalance?: string; currencies?: [string, string][] } = {},
): Promise<TestAccount> {
  const provider = await providerId(db, options.provider ?? 'بنك فلسطين');
  const list = options.currencies ?? [[options.currency ?? 'ILS', options.initialBalance ?? '0']];
  return withTransaction(db.app, userId, async (client) => {
    const account = await client.query<{ id: string }>(
      'INSERT INTO accounts (provider_id, name) VALUES ($1, $2) RETURNING id',
      [provider, unique('حساب')],
    );
    const accountId = account.rows[0]!.id;
    const currencies: Record<string, string> = {};
    for (const [currency, initial] of list) {
      const row = await client.query<{ id: string }>(
        'INSERT INTO account_currencies (account_id, currency, initial_balance) VALUES ($1, $2, $3) RETURNING id',
        [accountId, currency, initial],
      );
      currencies[currency] = row.rows[0]!.id;
    }
    return { accountId, id: Object.values(currencies)[0] ?? '', currencies };
  });
}

/** رصيد عملة حساب (بمعرّف عملة الحساب). */
export async function balanceOf(db: TestDb, accountCurrencyId: string): Promise<string> {
  const result = await db.app.query<{ balance: string }>(
    'SELECT balance FROM v_account_currency_balances WHERE account_currency_id = $1',
    [accountCurrencyId],
  );
  return result.rows[0]!.balance;
}

/** حركة على الجدول التجريبي: تولّد قيداً بمبلغها على الحساب. */
export async function addMovement(
  db: TestDb,
  userId: string,
  accountCurrencyId: string,
  amount: string,
): Promise<string> {
  return withTransaction(db.app, userId, async (client) => {
    const result = await client.query<{ id: string }>(
      'INSERT INTO test_movements (account_currency_id, amount) VALUES ($1, $2) RETURNING id',
      [accountCurrencyId, amount],
    );
    return result.rows[0]!.id;
  });
}

export async function cancelMovement(
  db: TestDb,
  userId: string | null,
  movementId: string,
  reason: string | null,
): Promise<void> {
  await withTransaction(db.app, userId, (client) =>
    client.query('UPDATE test_movements SET cancelled_at = now(), cancel_reason = $2 WHERE id = $1', [
      movementId,
      reason,
    ]),
  );
}
