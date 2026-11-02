import { buildContainer } from './composition/container.js';
import { buildPgInfra } from './composition/pg-infra.js';
import { loadEnv } from './infrastructure/config/env.js';
import { createApp } from './interfaces/http/app.js';

const env = loadEnv();
const infra = await buildPgInfra(env);
const app = createApp(buildContainer(env, infra));

const server = app.listen(env.PORT, () => {
  console.log(JSON.stringify({ msg: 'api.started', port: env.PORT, env: env.APP_ENV }));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => void infra.close().finally(() => process.exit(0))));
}
