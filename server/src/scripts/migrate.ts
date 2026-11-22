/** تنفيذ الـ migrations الجديدة على قاعدة التطوير:  npm run db:migrate */
import { devDbUrls } from '../env.js';
import { runMigrations } from '../migrations.js';

const applied = await runMigrations(devDbUrls().owner, console.log);
console.log(applied.length ? `تم تنفيذ ${applied.length} ملف.` : 'لا جديد: القاعدة محدّثة.');
