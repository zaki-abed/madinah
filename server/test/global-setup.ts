import pg from 'pg';
import { testDbUrls } from '../src/env.js';
import { runMigrations } from '../src/migrations.js';

/**
 * قبل الاختبارات: تُفرَّغ قاعدة الاختبار وتُبنى من الـ migrations من الصفر،
 * ثم يُضاف جدول حركات تجريبي تُختبر عليه قواعد القيود والإلغاء.
 * (جداول الحركات الحقيقية تأتي في المراحل القادمة وتُربط بنفس القواعد.)
 */
export default async function setup(): Promise<void> {
  const { owner } = testDbUrls();
  const dbName = new URL(owner).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`رفض تفريغ القاعدة «${dbName}»: الاختبارات تعمل فقط على قاعدة ينتهي اسمها بـ _test.`);
  }

  const client = new pg.Client({ connectionString: owner });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }

  await runMigrations(owner);

  const fixture = new pg.Client({ connectionString: owner });
  await fixture.connect();
  try {
    await fixture.query(`
      CREATE TABLE test_movements (
        id            uuid PRIMARY KEY DEFAULT uuidv7(),
        account_currency_id uuid NOT NULL REFERENCES account_currencies (id),
        amount        numeric(18,4) NOT NULL CHECK (amount <> 0),
        moved_at      timestamptz NOT NULL DEFAULT now(),
        notes         text,
        cancelled_at  timestamptz,
        cancelled_by  uuid REFERENCES users (id),
        cancel_reason text,
        created_by    uuid REFERENCES users (id) DEFAULT app_current_user_id()
      );

      SELECT enable_cancel_rules('test_movements');

      CREATE FUNCTION test_movements_ledger() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
      AS $$
      BEGIN
        PERFORM ledger_clear('TRANSFER', NEW.id);
        IF NEW.cancelled_at IS NULL THEN
          PERFORM ledger_post(NEW.account_currency_id, NEW.amount, 'TRANSFER', NEW.id, NEW.moved_at, 'حركة اختبار');
        END IF;
        RETURN NULL;
      END;
      $$;

      CREATE TRIGGER test_movements_ledger AFTER INSERT OR UPDATE ON test_movements
        FOR EACH ROW EXECUTE FUNCTION test_movements_ledger();

      -- DELETE ممنوح عمداً: الاختبار يثبت أن القاعدة ترفضه حتى مع وجود الصلاحية.
      GRANT SELECT, INSERT, UPDATE, DELETE ON test_movements TO madinah_app;
    `);
  } finally {
    await fixture.end();
  }
}
