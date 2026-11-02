import { z } from 'zod';

/** Variables de entorno validadas con Zod; objeto congelado (docs/deployment.md §2). */
const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );

const EnvSchema = z
  .object({
    APP_ENV: z.enum(['dev', 'test', 'staging', 'prod']).default('dev'),
    PORT: z.coerce.number().int().positive().default(4000),
    APP_VERSION: z.string().default('0.1.0'),
    DB_PROVIDER: z.enum(['supabase', 'postgres']).default('postgres'),
    DATABASE_URL: z.string().url().optional(),
    /** Rol fabsoft_worker (0003 M1): sólo el worker; pg-boss en el esquema pgboss. */
    WORKER_DATABASE_URL: z.string().url().optional(),
    /** Rol fabsoft_bootstrap (0005): sólo scripts/create-admin.ts. Nunca en la API. */
    BOOTSTRAP_DATABASE_URL: z.string().url().optional(),
    DATABASE_SSL_MODE: z.enum(['disable', 'require', 'verify-full']).default('disable'),
    DATABASE_SSL_CA: z.string().optional(),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    JWT_PRIVATE_KEY: z.string().optional(),
    JWT_PUBLIC_KEYS: z.string().optional(),
    JWT_ACTIVE_KID: z.string().default('dev'),
    JWT_ISSUER: z.string().default('fabsoft-api'),
    JWT_AUDIENCE: z.string().default('fabsoft-web'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
    CORS_ALLOWED_ORIGINS: csv,
    COOKIE_DOMAIN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.WORKER_DATABASE_URL &&
      !/^postgres(ql)?:\/\/fabsoft_worker[.:@]/.test(env.WORKER_DATABASE_URL)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['WORKER_DATABASE_URL'],
        message: 'Debe usar el rol fabsoft_worker',
      });
    }
    if (env.APP_ENV === 'staging' || env.APP_ENV === 'prod') {
      for (const key of [
        'DATABASE_URL',
        'WORKER_DATABASE_URL',
        'JWT_PRIVATE_KEY',
        'JWT_PUBLIC_KEYS',
      ] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} es obligatoria en ${env.APP_ENV}`,
          });
      }
    }
  });

export type Env = Readonly<z.infer<typeof EnvSchema>>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source.NODE_ENV === 'production' && !source.APP_ENV) {
    throw new Error('APP_ENV es obligatoria cuando NODE_ENV=production');
  }
  return Object.freeze(EnvSchema.parse(source));
}
