import { describe, expect, it } from 'vitest';
import type { WorkerEnv } from '../config/worker-env.js';
import { createEmailSender } from './create-email-sender.js';
import { LogEmailSender } from './log-email-sender.js';
import { ResendEmailSender } from './resend-email-sender.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

const env = (over: Partial<WorkerEnv>): WorkerEnv =>
  ({
    APP_ENV: 'test',
    APP_VERSION: 'test',
    WORKER_DATABASE_URL: 'postgres://fabsoft_worker:x@localhost:5432/fabsoft',
    DATABASE_SSL_MODE: 'disable',
    DB_POOL_MAX: 4,
    BUSINESS_TIMEZONE: 'America/Bogota',
    CORREO_CANAL: 'log',
    CORREO_DESDE: 'FabSoft <alertas@fabsoft.test>',
    RESEND_MAX_RPS: 2,
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_REJECT_UNAUTHORIZED: true,
    FRONTEND_URL: 'http://localhost:3000',
    WORKER_BATCH_SIZE: 50,
    WORKER_RUN_ON_START: false,
    ...over,
  }) as WorkerEnv;

describe('createEmailSender', () => {
  const log = () => undefined;

  it('selecciona log por defecto', () => {
    expect(createEmailSender(env({ CORREO_CANAL: 'log' }), log)).toBeInstanceOf(LogEmailSender);
  });

  it('selecciona Resend', () => {
    const sender = createEmailSender(
      env({ CORREO_CANAL: 'resend', RESEND_API_KEY: 're_test' }),
      log,
    );
    expect(sender).toBeInstanceOf(ResendEmailSender);
  });

  it('selecciona SMTP', () => {
    const sender = createEmailSender(
      env({ CORREO_CANAL: 'smtp', SMTP_HOST: 'smtp.example.test' }),
      log,
    );
    expect(sender).toBeInstanceOf(SmtpEmailSender);
  });
});
