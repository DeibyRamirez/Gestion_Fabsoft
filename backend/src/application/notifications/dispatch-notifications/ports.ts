import type { NotificationChannel, NotificationStatus, NotificationType } from '@fabsoft/shared';
import type { LocalDate } from '../../../domain/subscriptions/local-date.js';

export interface DispatchableNotification {
  id: string;
  notificationType: NotificationType;
  subscriptionId: string | null;
  periodEnd: LocalDate | null;
  channel: NotificationChannel;
  recipientEmail: string;
  recipientName: string;
  clientName: string | null;
  productName: string | null;
  ruleCode: string | null;
  dedupeKey: string;
  attempts: number;
  maxAttempts: number;
}

export interface ClaimedNotifications {
  items: DispatchableNotification[];
  cancelled: number;
}

export interface NotificationDispatchRepository {
  /** Revalida y cancela pendientes obsoletas antes de reclamar (RN-10). */
  claimDue(now: Date, lockUntil: Date, batchSize: number): Promise<ClaimedNotifications>;
  markSent(
    id: string,
    attempts: number,
    providerMessageId: string | null,
    sentAt: Date,
  ): Promise<boolean>;
  markFailure(
    id: string,
    attempts: number,
    status: Extract<NotificationStatus, 'pendiente' | 'fallida'>,
    lastError: string,
    nextAttemptAt: Date | null,
  ): Promise<boolean>;
}

export interface NotificationDispatchRepos {
  notificationsDispatch: NotificationDispatchRepository;
}
