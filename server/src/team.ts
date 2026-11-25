import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth, startSession } from './auth.js';
import { withTransaction, type Pool } from './db.js';

// فريق العمل (لوحة Team.dc.html، قرار 25/11/2026): أعضاء الفريق هم من يدخل النظام، وكلهم بصلاحيات كاملة.
// قواعد الحذف والإيقاف (له حسابات أو أثر، العضو الحالي، آخر عضو نشط) تفرضها القاعدة.

const uuid = z.string().uuid();
const infoBody = z.object({ name: z.string().trim().max(60).default(''), username: z.string().trim().max(40).default('') });
const passwordBody = z.object({ password: z.string().max(200).default(''), password2: z.string().max(200).default('') });
const activeBody = z.object({ active: z.boolean() });

class InputError extends Error {}

const fail = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.code(status).send({ error: { code, message } });

function checkPassword(password: string, password2: string): void {
  if (password.length < 8) throw new InputError('كلمة المرور 8 أحرف على الأقل.');
  if (password !== password2) throw new InputError('كلمتا المرور غير متطابقتين.');
}

export function registerTeam(app: FastifyInstance, pool: Pool, cookieSecure: boolean): void {
  async function guarded<T>(reply: FastifyReply, work: () => Promise<T>): Promise<T | undefined> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof InputError) {
        await fail(reply, 400, 'INVALID_INPUT', error.message);
        return undefined;
      }
      throw error;
    }
  }

  /** الاسم ثم صيغة اسم الدخول ثم تكراره، بترتيب رسائل اللوحة. */
  async function readInfo(body: { name: string; username: string }, exceptId: string | null) {
    const username = body.username.toLowerCase();
    if (!body.name) throw new InputError('اكتب الاسم الظاهر.');
    if (!/^[a-z0-9._]{3,}$/.test(username)) {
      throw new InputError('اسم الدخول بالأحرف الإنجليزية والأرقام فقط، 3 أحرف على الأقل.');
    }
    const taken = await pool.query('SELECT 1 FROM users WHERE username = $1 AND id IS DISTINCT FROM $2', [username, exceptId]);
    if (taken.rowCount) throw new InputError('اسم الدخول مستعمل لعضو آخر.');
    return { name: body.name, username };
  }

  app.get('/api/team', { preHandler: requireAuth }, async (request) => {
    const members = await pool.query(
      `SELECT u.id, u.full_name AS name, u.username::text AS username, u.is_active AS "isActive",
              u.id = $1 AS me,
              to_char(u.last_login_at AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY') AS "lastLoginDate",
              to_char(u.last_login_at AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI') AS "lastLoginTime",
              (now() AT TIME ZONE 'Asia/Jerusalem')::date - (u.last_login_at AT TIME ZONE 'Asia/Jerusalem')::date AS "lastLoginDaysAgo",
              COALESCE((
                SELECT json_agg(p.name || ' – ' || a.name ORDER BY a.created_at, a.id)
                FROM accounts a JOIN providers p ON p.id = a.provider_id WHERE a.responsible_id = u.id
              ), '[]') AS accounts,
              EXISTS (SELECT 1 FROM audit_logs g WHERE g.user_id = u.id) AS "hasTrace"
       FROM users u ORDER BY u.created_at, u.id`,
      [request.user!.id],
    );
    return { members: members.rows };
  });

  app.post('/api/team', { preHandler: requireAuth }, async (request, reply) => {
    const info = infoBody.safeParse(request.body ?? {});
    const pass = passwordBody.safeParse(request.body ?? {});
    if (!info.success || !pass.success) return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    return guarded(reply, async () => {
      const { name, username } = await readInfo(info.data, null);
      checkPassword(pass.data.password, pass.data.password2);
      const created = await withTransaction(pool, request.user!.id, (client) =>
        client.query<{ id: string }>('SELECT auth_create_user($1, $2, $3) AS id', [username, pass.data.password, name]),
      );
      reply.code(201);
      return { id: created.rows[0]!.id, name };
    });
  });

  app.patch<{ Params: { id: string } }>('/api/team/:id', { preHandler: requireAuth }, async (request, reply) => {
    const info = infoBody.safeParse(request.body ?? {});
    if (!info.success || !uuid.safeParse(request.params.id).success) {
      return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    }
    return guarded(reply, async () => {
      const current = await pool.query<{ username: string }>('SELECT username::text AS username FROM users WHERE id = $1', [
        request.params.id,
      ]);
      if (!current.rows[0]) throw new InputError('العضو غير موجود.');
      // اسم دخول قديم لا يطابق الصيغة يبقى كما هو ما لم يُغيَّر.
      const unchanged = info.data.username.toLowerCase() === current.rows[0].username.toLowerCase();
      if (!info.data.name) throw new InputError('اكتب الاسم الظاهر.');
      const { name, username } = unchanged
        ? { name: info.data.name, username: current.rows[0].username }
        : await readInfo(info.data, request.params.id);
      await withTransaction(pool, request.user!.id, (client) =>
        client.query('UPDATE users SET full_name = $2, username = $3 WHERE id = $1', [request.params.id, name, username]),
      );
      return { id: request.params.id, name };
    });
  });

  app.post<{ Params: { id: string } }>('/api/team/:id/password', { preHandler: requireAuth }, async (request, reply) => {
    const pass = passwordBody.safeParse(request.body ?? {});
    if (!pass.success || !uuid.safeParse(request.params.id).success) {
      return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    }
    return guarded(reply, async () => {
      checkPassword(pass.data.password, pass.data.password2);
      await withTransaction(pool, request.user!.id, (client) =>
        client.query('SELECT auth_set_password($1, $2)', [request.params.id, pass.data.password]),
      );
      // تغيير كلمة المرور يُنهي جلسات العضو. من غيّر كلمته هو يبقى داخلاً بجلسة جديدة.
      if (request.params.id === request.user!.id) {
        await startSession(pool, reply, request.user!.id, false, cookieSecure);
      }
      return { id: request.params.id };
    });
  });

  app.post<{ Params: { id: string } }>('/api/team/:id/active', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = activeBody.safeParse(request.body ?? {});
    if (!parsed.success || !uuid.safeParse(request.params.id).success) {
      return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    }
    const updated = await withTransaction(pool, request.user!.id, (client) =>
      client.query('UPDATE users SET is_active = $2 WHERE id = $1', [request.params.id, parsed.data.active]),
    );
    if (!updated.rowCount) return fail(reply, 404, 'NOT_FOUND', 'العضو غير موجود.');
    return { id: request.params.id, isActive: parsed.data.active };
  });

  app.delete<{ Params: { id: string } }>('/api/team/:id', { preHandler: requireAuth }, async (request, reply) => {
    if (!uuid.safeParse(request.params.id).success) return fail(reply, 400, 'INVALID_INPUT', 'البيانات المدخلة غير صالحة.');
    const deleted = await withTransaction(pool, request.user!.id, (client) =>
      client.query('DELETE FROM users WHERE id = $1', [request.params.id]),
    );
    if (!deleted.rowCount) return fail(reply, 404, 'NOT_FOUND', 'العضو غير موجود.');
    return reply.code(204).send();
  });
}
