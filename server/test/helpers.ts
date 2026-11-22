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
  options: { password?: string; role?: 'ADMIN' | 'EMPLOYEE'; username?: string } = {},
): Promise<{ id: string; username: string; password: string }> {
  const username = options.username ?? unique('user');
  const password = options.password ?? 'correct-horse-9';
  const result = await db.owner.query<{ id: string }>(
    'SELECT auth_create_user($1, $2, $3, $4) AS id',
    [username, password, 'مستخدم اختبار', options.role ?? 'ADMIN'],
  );
  return { id: result.rows[0]!.id, username, password };
}

export async function createAccount(
  db: TestDb,
  userId: string,
  options: { currency?: string; type?: string; initialBalance?: string } = {},
): Promise<string> {
  return withTransaction(db.app, userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO accounts (name, type, currency, initial_balance)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [unique('حساب'), options.type ?? 'BANK', options.currency ?? 'ILS', options.initialBalance ?? '0'],
    );
    return result.rows[0]!.id;
  });
}

export async function balanceOf(db: TestDb, accountId: string): Promise<string> {
  const result = await db.app.query<{ balance: string }>(
    'SELECT balance FROM v_account_balances WHERE account_id = $1',
    [accountId],
  );
  return result.rows[0]!.balance;
}

/** حركة على الجدول التجريبي: تولّد قيداً بمبلغها على الحساب. */
export async function addMovement(
  db: TestDb,
  userId: string,
  accountId: string,
  amount: string,
): Promise<string> {
  return withTransaction(db.app, userId, async (client) => {
    const result = await client.query<{ id: string }>(
      'INSERT INTO test_movements (account_id, amount) VALUES ($1, $2) RETURNING id',
      [accountId, amount],
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
