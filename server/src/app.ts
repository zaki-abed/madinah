import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAccountPages } from './account-pages.js';
import { registerAccounts } from './accounts.js';
import { registerAuth } from './auth.js';
import { businessRuleMessage, type Pool } from './db.js';
import { registerTeam } from './team.js';

export interface AppOptions {
  pool: Pool;
  cookieSecure: boolean;
  logger?: boolean;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger
      ? { redact: ['req.headers.cookie', 'req.headers.authorization'] }
      : false,
  });

  await app.register(cookie);

  app.setErrorHandler((error, request, reply) => {
    // قاعدة مالية رفضتها القاعدة: رسالتها عربية وتُعرض كما هي.
    const ruleMessage = businessRuleMessage(error);
    if (ruleMessage) {
      return reply.code(422).send({ error: { code: 'RULE_VIOLATION', message: ruleMessage } });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: 'BAD_REQUEST', message: 'الطلب غير صالح.' } });
    }
    request.log.error(error);
    return reply
      .code(500)
      .send({ error: { code: 'INTERNAL', message: 'حدث خطأ غير متوقع. تُعاد المحاولة لاحقاً.' } });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'المسار غير موجود.' } }),
  );

  registerAuth(app, options.pool, options.cookieSecure);
  registerAccounts(app, options.pool);
  registerAccountPages(app, options.pool);
  registerTeam(app, options.pool, options.cookieSecure);

  app.get('/api/health', async () => {
    await options.pool.query('SELECT 1');
    return { ok: true };
  });

  return app;
}
