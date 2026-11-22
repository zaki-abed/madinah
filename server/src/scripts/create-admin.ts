/**
 * إنشاء مدير للنظام، أو إعادة تعيين كلمة مرور مستخدم موجود:  npm run create-admin
 * كلمة المرور تُطلب في الطرفية وتُشفَّر داخل القاعدة (bcrypt). لا تُكتب في أي ملف.
 */
import pg from 'pg';
import { businessRuleMessage } from '../db.js';
import { devDbUrls } from '../env.js';
import { ask } from './prompt.js';

async function askPassword(): Promise<string> {
  for (;;) {
    const first = await ask('كلمة المرور (8 أحرف على الأقل): ', { hidden: true });
    if (first.length < 8) {
      console.log('كلمة المرور قصيرة.');
      continue;
    }
    const second = await ask('تأكيد كلمة المرور: ', { hidden: true });
    if (first === second) return first;
    console.log('الكلمتان غير متطابقتين.');
  }
}

const client = new pg.Client({ connectionString: devDbUrls().owner });
await client.connect();
try {
  const username = (await ask('اسم المستخدم (بالإنجليزية، مثل ahmad): ')).trim();
  if (!username) throw new Error('اسم المستخدم مطلوب.');

  const existing = await client.query<{ id: string; full_name: string }>(
    'SELECT id, full_name FROM users WHERE username = $1',
    [username],
  );
  const user = existing.rows[0];

  if (user) {
    const answer = (await ask(`المستخدم «${user.full_name}» موجود. تعيين كلمة مرور جديدة؟ (نعم/لا): `)).trim();
    if (answer !== 'نعم') {
      console.log('لم يتغير شيء.');
    } else {
      await client.query('SELECT auth_set_password($1, $2)', [user.id, await askPassword()]);
      console.log('✓ تم تعيين كلمة المرور الجديدة، وأُنهيت الجلسات المفتوحة لهذا المستخدم.');
    }
  } else {
    const fullName = (await ask('الاسم الظاهر في النظام (مثل أحمد): ')).trim();
    if (!fullName) throw new Error('الاسم مطلوب.');
    await client.query("SELECT auth_create_user($1, $2, $3, 'ADMIN')", [
      username,
      await askPassword(),
      fullName,
    ]);
    console.log(`✓ تم إنشاء المدير «${fullName}» باسم المستخدم ${username}.`);
  }
} catch (error) {
  console.error(businessRuleMessage(error) ?? (error as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
