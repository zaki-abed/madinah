import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** جذر المستودع (المجلد الذي فيه db/ و server/ و web/). */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** مسار ملف البيئة. الافتراضي ‎.env في جذر المستودع. */
export const envFilePath = process.env.MADINAH_ENV_FILE ?? path.join(repoRoot, '.env');

let loaded = false;

/** يحمّل ‎.env مرة واحدة. المتغيرات المعرّفة مسبقاً في البيئة لها الأولوية. */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  if (existsSync(envFilePath)) process.loadEnvFile(envFilePath);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `المتغير ${name} غير معرّف. شغّل الأمر: npm run db:setup (ينشئ ملف .env تلقائياً).`,
    );
  }
  return value;
}

export interface DbUrls {
  /** دور التطبيق: صلاحيات محدودة. يستعمله الخادم. */
  app: string;
  /** دور المالك: للـ migrations وأوامر الإدارة فقط. */
  owner: string;
}

export function devDbUrls(): DbUrls {
  loadEnv();
  return { app: required('DATABASE_URL'), owner: required('MIGRATION_DATABASE_URL') };
}

export function testDbUrls(): DbUrls {
  loadEnv();
  return { app: required('TEST_DATABASE_URL'), owner: required('TEST_MIGRATION_DATABASE_URL') };
}

export interface ServerConfig {
  databaseUrl: string;
  host: string;
  port: number;
  cookieSecure: boolean;
}

export function serverConfig(): ServerConfig {
  loadEnv();
  return {
    databaseUrl: required('DATABASE_URL'),
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 3001),
    cookieSecure: process.env.COOKIE_SECURE === 'true',
  };
}
