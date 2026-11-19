import type {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  UserRef,
} from '@fabsoft/shared';
import type { LocalDate } from '../../../domain/subscriptions/local-date.js';

export interface NotificationView {
  id: string;
  notificationType: NotificationType;
  subscriptionId: string | null;
  renewalRequestId: string | null;
  taskId: string | null;
  ruleCode: string | null;
  periodEnd: LocalDate | null;
  channel: NotificationChannel;
  recipient: UserRef;
  scheduledFor: Date;
  status: NotificationStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  sentAt: Date | null;
  readAt: Date | null;
  cancelReason: string | null;
  title: string;
}
