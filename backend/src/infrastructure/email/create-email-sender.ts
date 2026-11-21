import type { EmailSender } from '../../application/notifications/shared/email-sender.js';
import type { WorkerEnv } from '../config/worker-env.js';
import { LogEmailSender } from './log-email-sender.js';
import { ResendEmailSender } from './resend-email-sender.js';
import { SmtpEmailSender } from './smtp-email-sender.js';

export type LogFn = (entry: Record<string, unknown>) => void;

/**
 * Composition root del canal de correo. El worker sólo conoce el puerto
 * EmailSender; Resend, SMTP y log son adaptadores intercambiables.
 */
export function createEmailSender(env: WorkerEnv, log: LogFn): EmailSender {
  switch (env.CORREO_CANAL) {
    case 'resend':
      return new ResendEmailSender({
        apiKey: env.RESEND_API_KEY!,
        from: env.CORREO_DESDE,
        maxRps: env.RESEND_MAX_RPS,
      });
    case 'smtp':
      return new SmtpEmailSender({
        host: env.SMTP_HOST!,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.CORREO_DESDE,
        rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED,
      });
    case 'log':
    default:
      return new LogEmailSender(log);
  }
}
