import { buildApp } from './app.js';
import { createPool } from './db.js';
import { serverConfig } from './env.js';

const config = serverConfig();
const pool = createPool(config.databaseUrl);
const app = await buildApp({ pool, cookieSecure: config.cookieSecure, logger: true });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: config.host, port: config.port });
