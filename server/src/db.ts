import pg from 'pg';

// المبالغ numeric تبقى نصوصاً (السلوك الافتراضي لـ pg) ولا تُحوَّل إلى float أبداً.

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export function createPool(connectionString: string): Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

/**
 * ينفّذ العمل داخل transaction واحدة مع ضبط هوية المستخدم (app.user_id)،
 * فتُملأ created_by و cancelled_by وسجل التدقيق تلقائياً داخل القاعدة.
 * كل كتابة مالية يجب أن تمر من هنا.
 */
export async function withTransaction<T>(
  pool: Pool,
  userId: string | null,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId ?? '']);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** أخطاء القواعد المالية التي ترفعها القاعدة (SQLSTATE يبدأ بـ MD) ورسالتها عربية جاهزة للعرض. */
export function businessRuleMessage(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const { code, message } = error as { code: unknown; message: unknown };
    if (typeof code === 'string' && code.startsWith('MD') && typeof message === 'string') {
      return message;
    }
  }
  return null;
}
