import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../src/db.js';
import {
  addMovement,
  balanceOf,
  cancelMovement,
  createAccount,
  createUser,
  openTestDb,
  unique,
  type TestDb,
} from './helpers.js';

let db: TestDb;
let userId: string;

beforeAll(async () => {
  db = openTestDb();
  userId = (await createUser(db)).id;
});

afterAll(async () => {
  await db.close();
});

/** يتوقع أن ترفض القاعدة العملية بهذا الرمز (SQLSTATE). */
async function expectDbError(work: Promise<unknown>, code: string): Promise<void> {
  await expect(work).rejects.toMatchObject({ code });
}

describe('العملات', () => {
  it('العملات الست موجودة ومنها JOD، وكلها تسمح بفتح حسابات', async () => {
    const result = await db.app.query<{ code: string; allows_accounts: boolean }>(
      'SELECT code, allows_accounts FROM currencies ORDER BY code',
    );
    expect(result.rows.map((r) => r.code)).toEqual(['EGP', 'EUR', 'ILS', 'JOD', 'USD', 'USDT']);
    expect(result.rows.every((r) => r.allows_accounts)).toBe(true);
  });
});

describe('الحسابات', () => {
  it('لا يوجد نوع حساب CASH', async () => {
    const types = await db.app.query<{ t: string }>(
      "SELECT unnest(enum_range(NULL::account_type))::text AS t",
    );
    expect(types.rows.map((r) => r.t)).toEqual([
      'BANK', 'PAYPAL', 'PAYMENT_PLATFORM', 'EG_WALLET', 'PS_WALLET', 'USDT_PLATFORM', 'CARD_APP',
    ]);
    await expectDbError(createAccount(db, userId, { type: 'CASH' }), '22P02');
  });

  it('الحالات الأربع: نشط، مقيّد، مجمّد، مغلق', async () => {
    const statuses = await db.app.query<{ s: string }>(
      "SELECT unnest(enum_range(NULL::account_status))::text AS s",
    );
    expect(statuses.rows.map((r) => r.s)).toEqual(['ACTIVE', 'RESTRICTED', 'FROZEN', 'CLOSED']);
  });

  it('يُفتح حساب بعملة USDT', async () => {
    const id = await createAccount(db, userId, { currency: 'USDT', type: 'USDT_PLATFORM' });
    expect(await balanceOf(db, id)).toBe('0.0000');
  });

  it('عملة غير معرّفة مرفوضة', async () => {
    await expectDbError(createAccount(db, userId, { currency: 'XXX' }), '23503');
  });

  it('اسم الحساب فريد', async () => {
    const name = unique('حساب');
    const insert = () =>
      db.app.query("INSERT INTO accounts (name, type, currency) VALUES ($1, 'BANK', 'USD')", [name]);
    await insert();
    await expectDbError(insert(), '23505');
  });

  it('لا يوجد عمود رصيد في جدول الحسابات', async () => {
    const columns = await db.owner.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'accounts'",
    );
    const names = columns.rows.map((r) => r.column_name);
    expect(names).toContain('initial_balance');
    expect(names.filter((n) => n.includes('balance'))).toEqual(['initial_balance']);
  });

  it('created_by يُملأ تلقائياً من هوية المستخدم في الـ transaction', async () => {
    const id = await createAccount(db, userId);
    const row = await db.app.query<{ created_by: string }>('SELECT created_by FROM accounts WHERE id = $1', [id]);
    expect(row.rows[0]!.created_by).toBe(userId);
  });

  it('حساب بلا أي حركة يُحذف', async () => {
    const id = await createAccount(db, userId);
    const result = await db.app.query('DELETE FROM accounts WHERE id = $1', [id]);
    expect(result.rowCount).toBe(1);
  });

  it('حساب عليه حركة لا يُحذف، ويمكن تغيير حالته', async () => {
    const id = await createAccount(db, userId);
    await addMovement(db, userId, id, '100');
    await expectDbError(db.app.query('DELETE FROM accounts WHERE id = $1', [id]), 'MD004');
    await db.app.query("UPDATE accounts SET status = 'CLOSED' WHERE id = $1", [id]);
    expect(await balanceOf(db, id)).toBe('100.0000');
  });

  it('الرصيد الافتتاحي يُعدَّل قبل أول حركة ويُقفل بعدها، وكذلك العملة', async () => {
    const id = await createAccount(db, userId, { initialBalance: '50' });
    await db.app.query('UPDATE accounts SET initial_balance = 75 WHERE id = $1', [id]);
    expect(await balanceOf(db, id)).toBe('75.0000');

    await addMovement(db, userId, id, '10');
    await expectDbError(db.app.query('UPDATE accounts SET initial_balance = 80 WHERE id = $1', [id]), 'MD004');
    await expectDbError(db.app.query("UPDATE accounts SET currency = 'USD' WHERE id = $1", [id]), 'MD004');
    expect(await balanceOf(db, id)).toBe('85.0000');
  });
});

describe('دفتر القيود والأرصدة', () => {
  it('الرصيد = الافتتاحي + مجموع القيود', async () => {
    const id = await createAccount(db, userId, { initialBalance: '1000.50' });
    expect(await balanceOf(db, id)).toBe('1000.5000');

    await addMovement(db, userId, id, '250.25');
    await addMovement(db, userId, id, '-100');
    expect(await balanceOf(db, id)).toBe('1150.7500');

    const entries = await db.app.query<{ amount: string; currency: string }>(
      'SELECT amount, currency FROM ledger_entries WHERE account_id = $1 ORDER BY id',
      [id],
    );
    expect(entries.rows).toEqual([
      { amount: '250.2500', currency: 'ILS' },
      { amount: '-100.0000', currency: 'ILS' },
    ]);
  });

  it('المبالغ numeric دقيقة وليست float', async () => {
    const id = await createAccount(db, userId);
    await addMovement(db, userId, id, '0.1');
    await addMovement(db, userId, id, '0.2');
    expect(await balanceOf(db, id)).toBe('0.3000');
  });

  it('التطبيق لا يكتب مباشرة على دفتر القيود', async () => {
    const id = await createAccount(db, userId);
    const movement = await addMovement(db, userId, id, '10');
    await expectDbError(
      db.app.query(
        `INSERT INTO ledger_entries (entry_at, currency, account_id, amount, source_type, source_id)
         VALUES (now(), 'ILS', $1, 999, 'TRANSFER', $2)`,
        [id, movement],
      ),
      '42501',
    );
    await expectDbError(db.app.query('UPDATE ledger_entries SET amount = 999 WHERE account_id = $1', [id]), '42501');
    await expectDbError(db.app.query('DELETE FROM ledger_entries WHERE account_id = $1', [id]), '42501');
    await expectDbError(
      db.app.query("SELECT ledger_post($1, 999, 'TRANSFER', $2, now())", [id, movement]),
      '42501',
    );
  });

  it('حتى مالك القاعدة لا يكتب مباشرة: القيود من الـ Triggers فقط', async () => {
    const id = await createAccount(db, userId);
    const movement = await addMovement(db, userId, id, '10');
    await expectDbError(
      db.owner.query(
        `INSERT INTO ledger_entries (entry_at, currency, account_id, amount, source_type, source_id)
         VALUES (now(), 'ILS', $1, 999, 'TRANSFER', $2)`,
        [id, movement],
      ),
      'MD005',
    );
    await expectDbError(db.owner.query('UPDATE ledger_entries SET amount = 999 WHERE account_id = $1', [id]), 'MD005');
    await expectDbError(db.owner.query('DELETE FROM ledger_entries WHERE account_id = $1', [id]), 'MD005');
    await expectDbError(db.owner.query('TRUNCATE ledger_entries'), 'MD005');
    expect(await balanceOf(db, id)).toBe('10.0000');
  });
});

describe('الإلغاء بدل الحذف', () => {
  it('الإلغاء بسبب يعكس أثر العملية ويُبقيها في السجل', async () => {
    const id = await createAccount(db, userId, { initialBalance: '500' });
    const movement = await addMovement(db, userId, id, '120');
    expect(await balanceOf(db, id)).toBe('620.0000');

    await cancelMovement(db, userId, movement, '  أُدخلت بالخطأ  ');
    expect(await balanceOf(db, id)).toBe('500.0000');

    const row = await db.app.query<{ cancelled_by: string; cancel_reason: string; amount: string }>(
      'SELECT cancelled_by, cancel_reason, amount FROM test_movements WHERE id = $1',
      [movement],
    );
    expect(row.rows[0]).toEqual({ cancelled_by: userId, cancel_reason: 'أُدخلت بالخطأ', amount: '120.0000' });
  });

  it('الإلغاء بدون سبب مرفوض، والأثر يبقى كما هو', async () => {
    const id = await createAccount(db, userId);
    const movement = await addMovement(db, userId, id, '40');
    await expectDbError(cancelMovement(db, userId, movement, null), 'MD001');
    await expectDbError(cancelMovement(db, userId, movement, ''), 'MD001');
    await expectDbError(cancelMovement(db, userId, movement, '   '), 'MD001');
    expect(await balanceOf(db, id)).toBe('40.0000');
  });

  it('الإلغاء بدون مستخدم معروف مرفوض', async () => {
    const id = await createAccount(db, userId);
    const movement = await addMovement(db, userId, id, '40');
    await expectDbError(cancelMovement(db, null, movement, 'سبب'), 'MD001');
  });

  it('حذف العملية المالية مرفوض', async () => {
    const id = await createAccount(db, userId);
    const movement = await addMovement(db, userId, id, '40');
    await expectDbError(db.app.query('DELETE FROM test_movements WHERE id = $1', [movement]), 'MD002');
    await expectDbError(db.owner.query('DELETE FROM test_movements WHERE id = $1', [movement]), 'MD002');
    await expectDbError(db.owner.query('TRUNCATE test_movements'), 'MD002');
    expect(await balanceOf(db, id)).toBe('40.0000');
  });

  it('العملية الملغاة لا تُعدَّل ولا يُتراجع عن إلغائها ولا تُحذف', async () => {
    const id = await createAccount(db, userId);
    const movement = await addMovement(db, userId, id, '40');
    await cancelMovement(db, userId, movement, 'مكررة');

    await expectDbError(db.app.query('UPDATE test_movements SET amount = 1 WHERE id = $1', [movement]), 'MD003');
    await expectDbError(
      db.app.query(
        'UPDATE test_movements SET cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL WHERE id = $1',
        [movement],
      ),
      'MD003',
    );
    await expectDbError(cancelMovement(db, userId, movement, 'سبب آخر'), 'MD003');
    await expectDbError(db.app.query('DELETE FROM test_movements WHERE id = $1', [movement]), 'MD002');
    expect(await balanceOf(db, id)).toBe('0.0000');
  });

  it('الإلغاء لا يغيّر بيانات العملية في نفس الخطوة', async () => {
    const id = await createAccount(db, userId);
    const movement = await addMovement(db, userId, id, '40');
    await expectDbError(
      withTransaction(db.app, userId, (client) =>
        client.query(
          "UPDATE test_movements SET amount = 1, cancelled_at = now(), cancel_reason = 'سبب' WHERE id = $1",
          [movement],
        ),
      ),
      'MD003',
    );
    expect(await balanceOf(db, id)).toBe('40.0000');
  });

  it('تعديل عملية سارية يعيد كتابة قيودها', async () => {
    const id = await createAccount(db, userId);
    const movement = await addMovement(db, userId, id, '40');
    await db.app.query('UPDATE test_movements SET amount = 55 WHERE id = $1', [movement]);
    expect(await balanceOf(db, id)).toBe('55.0000');
    const count = await db.app.query('SELECT 1 FROM ledger_entries WHERE source_id = $1', [movement]);
    expect(count.rowCount).toBe(1);
  });
});

describe('سجل التدقيق', () => {
  it('يسجّل الإضافة والتعديل والحذف قبل/بعد مع المستخدم', async () => {
    const id = await createAccount(db, userId);
    await withTransaction(db.app, userId, (c) =>
      c.query("UPDATE accounts SET status = 'FROZEN' WHERE id = $1", [id]),
    );
    await withTransaction(db.app, userId, (c) => c.query('DELETE FROM accounts WHERE id = $1', [id]));

    const logs = await db.app.query<{
      action: string;
      user_id: string;
      before: { status: string } | null;
      after: { status: string } | null;
    }>(
      "SELECT action, user_id, before, after FROM audit_logs WHERE entity = 'accounts' AND entity_id = $1 ORDER BY id",
      [id],
    );
    expect(logs.rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE', 'DELETE']);
    expect(logs.rows.every((r) => r.user_id === userId)).toBe(true);
    expect(logs.rows[1]!.before!.status).toBe('ACTIVE');
    expect(logs.rows[1]!.after!.status).toBe('FROZEN');
    expect(logs.rows[2]!.after).toBeNull();
  });

  it('التطبيق لا يعدّل سجل التدقيق ولا يحذف منه', async () => {
    await expectDbError(db.app.query('DELETE FROM audit_logs'), '42501');
    await expectDbError(db.app.query("UPDATE audit_logs SET details = 'x'"), '42501');
    await expectDbError(
      db.app.query("INSERT INTO audit_logs (action, entity) VALUES ('CREATE', 'x')"),
      '42501',
    );
  });
});
