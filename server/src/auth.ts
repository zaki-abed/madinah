import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Pool } from './db.js';

export const SESSION_COOKIE = 'madinah_session';
/** مدة الجلسة العادية، ومدتها مع «تذكرني على هذا الجهاز». */
const SESSION_HOURS = 12;
const REMEMBER_DAYS = 30;

export interface Permissions {
  canEdit: boolean;
  canDelete: boolean;
  viewReports: boolean;
  manageUsers: boolean;
  viewBalances: boolean;
  viewProfit: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'EMPLOYEE';
  permissions: Permissions;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** المستخدم صاحب الجلسة، أو null إن لم توجد جلسة سارية. */
    user: AuthUser | null;
  }
}

const loginBody = z.object({
  username: z.string().trim().max(100).default(''),
  password: z.string().max(200).default(''),
  remember: z.boolean().default(false),
});

interface UserRow {
  id: string;
  username: string;
  full_name: string;
  role: 'ADMIN' | 'EMPLOYEE';
  can_edit: boolean | null;
  can_delete: boolean | null;
  view_reports: boolean | null;
  manage_users: boolean | null;
  view_balances: boolean | null;
  view_profit: boolean | null;
}

const USER_SELECT = `
  SELECT u.id, u.username::text AS username, u.full_name, u.role,
         p.can_edit, p.can_delete, p.view_reports, p.manage_users, p.view_balances, p.view_profit
  FROM users u
  LEFT JOIN user_permissions p ON p.user_id = u.id`;

function toAuthUser(row: UserRow): AuthUser {
  const admin = row.role === 'ADMIN'; // المدير يملك كل الصلاحيات دائماً
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    permissions: {
      canEdit: admin || row.can_edit === true,
      canDelete: admin || row.can_delete === true,
      viewReports: admin || row.view_reports === true,
      manageUsers: admin || row.manage_users === true,
      viewBalances: admin || row.view_balances === true,
      viewProfit: admin || row.view_profit === true,
    },
  };
}

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

/** preHandler للمسارات المحمية: يرفض الطلب إن لم توجد جلسة سارية. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user) {
    await fail(reply, 401, 'UNAUTHENTICATED', 'انتهت الجلسة. يلزم تسجيل الدخول من جديد.');
  }
}

export function registerAuth(app: FastifyInstance, pool: Pool, cookieSecure: boolean): void {
  const cookieBase = { path: '/', httpOnly: true, sameSite: 'strict', secure: cookieSecure } as const;

  app.decorateRequest('user', null);

  // يحمّل المستخدم من كوكي الجلسة في كل طلب.
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const result = await pool.query<UserRow>(
      `${USER_SELECT}
       JOIN sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`,
      [hashToken(token)],
    );
    const row = result.rows[0];
    if (row) request.user = toAuthUser(row);
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    }
    const { username, password, remember } = parsed.data;
    if (!username || !password) {
      const message =
        !username && !password
          ? 'أدخل اسم المستخدم وكلمة المرور.'
          : !username
            ? 'أدخل اسم المستخدم.'
            : 'أدخل كلمة المرور.';
      return fail(reply, 400, 'MISSING_FIELDS', message);
    }

    // عبارة مستقلة (autocommit) حتى يُحفظ عدّاد المحاولات الخاطئة.
    const login = await pool.query<{ status: string; user_id: string | null; locked_until: Date | null }>(
      'SELECT status, user_id, locked_until FROM auth_login($1, $2)',
      [username, password],
    );
    const outcome = login.rows[0];

    if (outcome?.status === 'LOCKED' && outcome.locked_until) {
      const minutes = Math.max(1, Math.ceil((outcome.locked_until.getTime() - Date.now()) / 60_000));
      return fail(
        reply,
        429,
        'LOCKED',
        `أُوقف تسجيل الدخول مؤقتاً بعد 5 محاولات خاطئة. تُتاح المحاولة بعد ${minutes} دقيقة.`,
      );
    }
    if (outcome?.status !== 'OK' || !outcome.user_id) {
      return fail(reply, 401, 'INVALID_CREDENTIALS', 'اسم المستخدم أو كلمة المرور غير صحيحة.');
    }

    const token = randomBytes(32).toString('base64url');
    const lifetime = remember ? `${REMEMBER_DAYS} days` : `${SESSION_HOURS} hours`;
    await pool.query('DELETE FROM sessions WHERE expires_at < now()');
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, remember, expires_at)
       VALUES ($1, $2, $3, now() + $4::interval)`,
      [outcome.user_id, hashToken(token), remember, lifetime],
    );

    // بدون «تذكرني»: كوكي جلسة تزول بإغلاق المتصفح، والخادم ينهيها بعد 12 ساعة.
    reply.setCookie(SESSION_COOKIE, token, {
      ...cookieBase,
      ...(remember ? { maxAge: REMEMBER_DAYS * 24 * 60 * 60 } : {}),
    });

    const user = await pool.query<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [outcome.user_id]);
    return { user: toAuthUser(user.rows[0]!) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    reply.clearCookie(SESSION_COOKIE, cookieBase);
    return reply.code(204).send();
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => ({ user: request.user }));
}
