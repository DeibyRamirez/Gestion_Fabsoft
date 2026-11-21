import { z } from 'zod';

const booleanEnv = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

/**
 * Variables del proceso worker (API y worker no comparten secretos de correo).
 * `WORKER_DATABASE_URL` debe usar el rol `fabsoft_worker` (ADR-005).
 */
const WorkerEnvSchema = z
  .object({
    APP_ENV: z.enum(['dev', 'test', 'staging', 'prod']).default('dev'),
    APP_VERSION: z.string().default('0.1.0'),
    WORKER_DATABASE_URL: z.string().url(),
    DATABASE_SSL_MODE: z.enum(['disable', 'require', 'verify-full']).default('disable'),
    DATABASE_SSL_CA: z.string().optional(),
    DB_POOL_MAX: z.coerce.number().int().positive().default(4),
    BUSINESS_TIMEZONE: z.string().default('America/Bogota'),
    CORREO_CANAL: z.enum(['log', 'resend', 'smtp']).default('log'),
    RESEND_API_KEY: z.string().optional(),
    CORREO_DESDE: z.string().trim().optional(),
    RESEND_MAX_RPS: z.coerce.number().int().positive().default(2),
    SMTP_HOST: z.string().trim().optional(),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    SMTP_SECURE: booleanEnv.default(false),
    SMTP_USER: z.string().trim().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_REJECT_UNAUTHORIZED: booleanEnv.default(true),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    WORKER_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(50),
    WORKER_RUN_ON_START: booleanEnv.default(true),
  })
  .superRefine((env, ctx) => {
    if (!/^postgres(ql)?:\/\/fabsoft_worker[.:@]/.test(env.WORKER_DATABASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['WORKER_DATABASE_URL'],
        message: 'Debe usar el rol fabsoft_worker',
      });
    }
    if (env.CORREO_CANAL === 'resend') {
      if (!env.RESEND_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['RESEND_API_KEY'],
          message: 'RESEND_API_KEY es obligatoria con CORREO_CANAL=resend',
        });
      }
    }
    if (env.CORREO_CANAL === 'resend' || env.CORREO_CANAL === 'smtp') {
      if (!env.CORREO_DESDE?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORREO_DESDE'],
          message: 'CORREO_DESDE es obligatorio con CORREO_CANAL=resend|smtp',
        });
      }
    }
    if (env.CORREO_CANAL === 'smtp') {
      if (!env.SMTP_HOST) {
        ctx.addIssue({
          code: 'custom',
          path: ['SMTP_HOST'],
          message: 'SMTP_HOST es obligatorio con CORREO_CANAL=smtp',
        });
      }
      if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
        ctx.addIssue({
          code: 'custom',
          path: ['SMTP_USER'],
          message: 'SMTP_USER y SMTP_PASSWORD deben configurarse juntos',
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    CORREO_DESDE: env.CORREO_DESDE ?? 'FabSoft <alertas@fabsoft.test>',
  }));

export type WorkerEnv = Readonly<z.infer<typeof WorkerEnvSchema>>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  if (source.NODE_ENV === 'production' && !source.APP_ENV) {
    throw new Error('APP_ENV es obligatoria cuando NODE_ENV=production');
  }
  return Object.freeze(WorkerEnvSchema.parse(source));
}
