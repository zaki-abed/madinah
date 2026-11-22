/**
 * تجهيز قاعدة البيانات لأول مرة:  npm run db:setup
 *
 * يتصل بـ PostgreSQL بحساب المدير (postgres) مرة واحدة، فينشئ:
 *   - الدورين madinah_owner (للـ migrations) و madinah_app (للتطبيق، صلاحيات محدودة)
 *   - القاعدتين madinah_dev و madinah_test
 * ثم يكتب بيانات الاتصال في ‎.env وينفّذ الـ migrations.
 * كلمة مرور postgres لا تُحفظ في أي ملف. تشغيله أكثر من مرة آمن.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { envFilePath } from '../env.js';
import { runMigrations } from '../migrations.js';
import { ask } from './prompt.js';

const OWNER_ROLE = 'madinah_owner';
const APP_ROLE = 'madinah_app';
const DEV_DB = 'madinah_dev';
const TEST_DB = 'madinah_test';

function readEnvFile(): Map<string, string> {
  const values = new Map<string, string>();
  if (!existsSync(envFilePath)) return values;
  for (const line of readFileSync(envFilePath, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1]) values.set(match[1], match[2] ?? '');
  }
  return values;
}

function passwordFromUrl(url: string | undefined, role: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.username === role && parsed.password ? decodeURIComponent(parsed.password) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const host = process.env.PGHOST ?? 'localhost';
  const port = Number(process.env.PGPORT ?? 5432);
  const superuser = process.env.PGUSER ?? 'postgres';

  console.log(`الاتصال بـ PostgreSQL على ${host}:${port} بالمستخدم ${superuser}`);
  const superPassword =
    process.env.PGPASSWORD ?? (await ask(`كلمة مرور المستخدم ${superuser}: `, { hidden: true }));

  const admin = new pg.Client({ host, port, user: superuser, password: superPassword, database: 'postgres' });
  try {
    await admin.connect();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '28P01') {
      console.error('\nكلمة المرور غير صحيحة. راجع قسم «قاعدة البيانات» في README.md لطريقة إعادة تعيينها.');
    } else if (code === 'ECONNREFUSED') {
      console.error('\nتعذّر الاتصال: PostgreSQL لا يعمل على هذا العنوان.');
    } else {
      console.error(`\nتعذّر الاتصال: ${(error as Error).message}`);
    }
    process.exit(1);
  }

  const env = readEnvFile();
  const ownerPassword =
    passwordFromUrl(env.get('MIGRATION_DATABASE_URL'), OWNER_ROLE) ?? randomBytes(24).toString('hex');
  const appPassword =
    passwordFromUrl(env.get('DATABASE_URL'), APP_ROLE) ?? randomBytes(24).toString('hex');

  try {
    for (const [role, password] of [
      [OWNER_ROLE, ownerPassword],
      [APP_ROLE, appPassword],
    ] as const) {
      const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      const verb = exists.rowCount ? 'ALTER' : 'CREATE';
      await admin.query(
        `${verb} ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${admin.escapeLiteral(password)}`,
      );
      console.log(`✓ الدور ${role}`);
    }

    for (const db of [DEV_DB, TEST_DB]) {
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
      if (!exists.rowCount) {
        await admin.query(`CREATE DATABASE ${db} OWNER ${OWNER_ROLE} ENCODING 'UTF8' TEMPLATE template0`);
      }
      await admin.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
      await admin.query(`GRANT CONNECT ON DATABASE ${db} TO ${APP_ROLE}`);
      console.log(`✓ القاعدة ${db}`);
    }
  } finally {
    await admin.end();
  }

  const url = (role: string, password: string, db: string) =>
    `postgres://${role}:${encodeURIComponent(password)}@${host}:${port}/${db}`;

  env.set('DATABASE_URL', url(APP_ROLE, appPassword, DEV_DB));
  env.set('MIGRATION_DATABASE_URL', url(OWNER_ROLE, ownerPassword, DEV_DB));
  env.set('TEST_DATABASE_URL', url(APP_ROLE, appPassword, TEST_DB));
  env.set('TEST_MIGRATION_DATABASE_URL', url(OWNER_ROLE, ownerPassword, TEST_DB));
  if (!env.has('HOST')) env.set('HOST', '127.0.0.1');
  if (!env.has('PORT')) env.set('PORT', '3001');
  if (!env.has('COOKIE_SECURE')) env.set('COOKIE_SECURE', 'false');

  const body =
    '# أُنشئ بالأمر npm run db:setup. ملف محلي وسري: لا يُرفع إلى المستودع.\n' +
    [...env].map(([key, value]) => `${key}=${value}`).join('\n') +
    '\n';
  writeFileSync(envFilePath, body, { mode: 0o600 });
  console.log(`✓ كُتبت بيانات الاتصال في ${envFilePath}`);

  console.log('تنفيذ الـ migrations على madinah_dev:');
  const applied = await runMigrations(env.get('MIGRATION_DATABASE_URL')!, console.log);
  if (applied.length === 0) console.log('  لا جديد: القاعدة محدّثة.');

  console.log('\nتم. الخطوة التالية: npm run create-admin');
}

await main();
