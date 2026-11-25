import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { repoRoot } from './env.js';

export const migrationsDir = path.join(repoRoot, 'db', 'migrations');

const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;
const LOCK_KEY = 7243001;

interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

async function readMigrationFiles(): Promise<MigrationFile[]> {
  const names = (await readdir(migrationsDir)).filter((n) => n.endsWith('.sql')).sort();
  const files: MigrationFile[] = [];
  for (const name of names) {
    const match = FILE_PATTERN.exec(name);
    if (!match?.[1]) throw new Error(`اسم ملف migration غير صالح: ${name}`);
    const sql = await readFile(path.join(migrationsDir, name), 'utf8');
    files.push({
      version: match[1],
      name,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  const versions = new Set(files.map((f) => f.version));
  if (versions.size !== files.length) throw new Error('يوجد رقم migration مكرر.');
  return files;
}

/**
 * ينفّذ الملفات غير المنفّذة بالترتيب، كل ملف داخل transaction.
 * يرفض العمل إذا تغيّر محتوى ملف سبق تنفيذه: الـ migration القديم لا يُعدَّل.
 */
export async function runMigrations(
  ownerUrl: string,
  log: (message: string) => void = () => undefined,
  /** للاختبارات فقط: التوقف بعد هذا الرقم (مثل '0012') لتجهيز بيانات قديمة قبل الباقي. */
  upTo?: string,
): Promise<string[]> {
  const files = (await readMigrationFiles()).filter((f) => !upTo || f.version <= upTo);
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        name       text NOT NULL,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const done = new Map<string, { name: string; checksum: string }>();
    const rows = await client.query<{ version: string; name: string; checksum: string }>(
      'SELECT version, name, checksum FROM schema_migrations',
    );
    for (const row of rows.rows) done.set(row.version, row);

    for (const file of files) {
      const previous = done.get(file.version);
      if (previous) {
        if (previous.checksum !== file.checksum) {
          throw new Error(
            `الملف ${file.name} تغيّر بعد تنفيذه. لا يُعدَّل migration قديم: أضف ملفاً جديداً مرقّماً.`,
          );
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [file.version, file.name, file.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`فشل تنفيذ ${file.name}: ${(error as Error).message}`, { cause: error });
      }
      applied.push(file.name);
      log(`✓ ${file.name}`);
    }
  } finally {
    await client.end();
  }
  return applied;
}
