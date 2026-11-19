import type { AuthUnitOfWork, Clock } from '../../shared/ports.js';
import {
  PermanentEmailError,
  RetryableEmailError,
  type EmailSender,
} from '../shared/email-sender.js';
import { decideRetry, truncateError } from '../shared/retry-policy.js';
import { buildEmail } from './email-content.js';
import type { NotificationDispatchRepos } from './ports.js';

export interface DispatchResult {
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
}

const LOCK_MS = 2 * 60_000;

export class DispatchNotifications {
  constructor(
    private readonly uow: AuthUnitOfWork<NotificationDispatchRepos>,
    private readonly emailSender: EmailSender,
    private readonly clock: Clock,
    private readonly batchSize: number,
    private readonly frontendUrl: string,
  ) {}

  async execute(requestId: string): Promise<DispatchResult> {
    const now = this.clock.now();
    const claimed = await this.uow.run(requestId, ({ notificationsDispatch }) =>
      notificationsDispatch.claimDue(now, new Date(now.getTime() + LOCK_MS), this.batchSize),
    );
    const result: DispatchResult = {
      sent: 0,
      retried: 0,
      failed: 0,
      cancelled: claimed.cancelled,
    };

    for (const item of claimed.items) {
      if (item.channel === 'in_app') {
        const sent = await this.uow.run(requestId, ({ notificationsDispatch }) =>
          notificationsDispatch.markSent(item.id, item.attempts, null, this.clock.now()),
        );
        if (sent) result.sent++;
        continue;
      }

      const attempt = item.attempts + 1;
      try {
        const message = buildEmail(item, this.frontendUrl);
        const sent = await this.emailSender.send(message);
        const marked = await this.uow.run(requestId, ({ notificationsDispatch }) =>
          notificationsDispatch.markSent(
            item.id,
            attempt,
            sent.providerMessageId,
            this.clock.now(),
          ),
        );
        if (marked) result.sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retryAfterMs = err instanceof RetryableEmailError ? err.retryAfterMs : undefined;
        const permanent = err instanceof PermanentEmailError;
        const decision = permanent
          ? { failed: true, nextAttemptAt: null }
          : decideRetry(attempt, item.maxAttempts, this.clock.now(), retryAfterMs);
        await this.uow.run(requestId, ({ notificationsDispatch }) =>
          notificationsDispatch.markFailure(
            item.id,
            attempt,
            decision.failed ? 'failed' : 'pending',
            truncateError(message),
            decision.nextAttemptAt,
          ),
        );
        if (decision.failed) result.failed++;
        else result.retried++;
      }
    }
    return result;
  }
}
