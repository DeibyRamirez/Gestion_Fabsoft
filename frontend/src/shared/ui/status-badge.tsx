import type { ReactNode } from 'react';
import type {
  ClientStatus,
  FollowUpStatus,
  IntegrationStatus,
  NotificationStatus,
  PaymentStatus,
  ProductStatus,
  RenewalRequestStatus,
  SubscriptionStatus,
  TaskPriority,
  TaskStatus,
  UserStatus,
} from '@fabsoft/shared';
import { formatDaysLeft } from '@/shared/lib/format';
import {
  CLIENT_STATUS_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  INTEGRATION_STATUS_LABELS,
  NOTIFICATION_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  RENEWAL_REQUEST_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  USER_STATUS_LABELS,
} from '@/shared/lib/labels';
import { cn } from '@/shared/lib/utils';

/** Tonos = pares de tokens `--color-status-*` definidos en globals.css (todos ≥ 6.2:1). */
export type Tone =
  'success' | 'info' | 'danger' | 'warning' | 'muted' | 'violet' | 'soon' | 'neutral';

export const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-status-active-bg text-status-active-fg',
  info: 'bg-status-in-renewal-bg text-status-in-renewal-fg',
  danger: 'bg-status-expired-bg text-status-expired-fg',
  warning: 'bg-status-not-renewed-bg text-status-not-renewed-fg',
  muted: 'bg-status-cancelled-bg text-status-cancelled-fg',
  violet: 'bg-status-pending-bg text-status-pending-fg',
  soon: 'bg-urgency-soon-bg text-urgency-soon-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
};

const TONE_SOFT_CLASS: Record<Tone, string> = {
  success: 'bg-status-active-bg/70 text-status-active-fg',
  info: 'bg-status-in-renewal-bg/70 text-status-in-renewal-fg',
  danger: 'bg-status-expired-bg/70 text-status-expired-fg',
  warning: 'bg-status-not-renewed-bg/70 text-status-not-renewed-fg',
  muted: 'bg-status-cancelled-bg/70 text-status-cancelled-fg',
  violet: 'bg-status-pending-bg/70 text-status-pending-fg',
  soon: 'bg-urgency-soon-bg/70 text-urgency-soon-fg',
  neutral: 'bg-status-neutral-bg/70 text-status-neutral-fg',
};

export function toneIconClass(tone: Tone): string {
  return TONE_SOFT_CLASS[tone];
}

type Kind =
  | { kind: 'subscription'; value: SubscriptionStatus }
  | { kind: 'payment'; value: PaymentStatus }
  | { kind: 'followUp'; value: FollowUpStatus }
  | { kind: 'client'; value: ClientStatus }
  | { kind: 'user'; value: UserStatus }
  | { kind: 'product'; value: ProductStatus }
  | { kind: 'integration'; value: IntegrationStatus }
  | { kind: 'taskStatus'; value: TaskStatus }
  | { kind: 'taskPriority'; value: TaskPriority }
  | { kind: 'notification'; value: NotificationStatus }
  | { kind: 'renewalRequest'; value: RenewalRequestStatus };

const SUBSCRIPTION_TONE: Record<SubscriptionStatus, Tone> = {
  pendiente_activacion: 'violet',
  activa: 'success',
  en_renovacion: 'info',
  vencida: 'danger',
  cancelada: 'muted',
  no_renovada: 'warning',
};

const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  sin_seguimiento: 'neutral',
  pendiente: 'soon',
  recibido: 'success',
};

const FOLLOW_UP_TONE: Record<FollowUpStatus, Tone> = {
  sin_gestion: 'neutral',
  en_gestion: 'info',
  esperando_cliente: 'soon',
  cerrado: 'muted',
};

const CLIENT_TONE: Record<ClientStatus, Tone> = {
  activo: 'success',
  inactivo: 'neutral',
  archivado: 'muted',
};

const USER_TONE: Record<UserStatus, Tone> = { activo: 'success', deshabilitado: 'muted' };
const PRODUCT_TONE: Record<ProductStatus, Tone> = { activo: 'success', inactivo: 'muted' };
const INTEGRATION_TONE: Record<IntegrationStatus, Tone> = {
  activa: 'success',
  deshabilitada: 'muted',
};

const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  pendiente: 'neutral',
  en_progreso: 'info',
  completada: 'success',
  cancelada: 'muted',
};

const TASK_PRIORITY_TONE: Record<TaskPriority, Tone> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

const NOTIFICATION_TONE: Record<NotificationStatus, Tone> = {
  pendiente: 'soon',
  enviada: 'success',
  fallida: 'danger',
  cancelada: 'muted',
};

const RENEWAL_REQUEST_TONE: Record<RenewalRequestStatus, Tone> = {
  pendiente_revision: 'violet',
  en_progreso: 'info',
  resuelta: 'success',
};

function resolve(props: Kind): { label: string; tone: Tone } {
  switch (props.kind) {
    case 'subscription':
      return {
        label: SUBSCRIPTION_STATUS_LABELS[props.value],
        tone: SUBSCRIPTION_TONE[props.value],
      };
    case 'payment':
      return { label: PAYMENT_STATUS_LABELS[props.value], tone: PAYMENT_TONE[props.value] };
    case 'followUp':
      return {
        label: FOLLOW_UP_STATUS_LABELS[props.value],
        tone: FOLLOW_UP_TONE[props.value],
      };
    case 'client':
      return { label: CLIENT_STATUS_LABELS[props.value], tone: CLIENT_TONE[props.value] };
    case 'user':
      return { label: USER_STATUS_LABELS[props.value], tone: USER_TONE[props.value] };
    case 'product':
      return { label: PRODUCT_STATUS_LABELS[props.value], tone: PRODUCT_TONE[props.value] };
    case 'integration':
      return {
        label: INTEGRATION_STATUS_LABELS[props.value],
        tone: INTEGRATION_TONE[props.value],
      };
    case 'taskStatus':
      return { label: TASK_STATUS_LABELS[props.value], tone: TASK_STATUS_TONE[props.value] };
    case 'taskPriority':
      return {
        label: TASK_PRIORITY_LABELS[props.value],
        tone: TASK_PRIORITY_TONE[props.value],
      };
    case 'notification':
      return {
        label: NOTIFICATION_STATUS_LABELS[props.value],
        tone: NOTIFICATION_TONE[props.value],
      };
    case 'renewalRequest':
      return {
        label: RENEWAL_REQUEST_STATUS_LABELS[props.value],
        tone: RENEWAL_REQUEST_TONE[props.value],
      };
  }
}

export function ToneBadge({
  tone,
  children,
  className,
  dot = true,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Badge de estado: el texto SIEMPRE acompaña al color (WCAG 1.4.1). */
export function StatusBadge(props: Kind & { className?: string }) {
  const { label, tone } = resolve(props);
  return (
    <ToneBadge tone={tone} {...(props.className ? { className: props.className } : {})}>
      {label}
    </ToneBadge>
  );
}

/** Urgencia por días restantes: ≤7 danger, ≤15 soon, ≤30 info. */
export function UrgencyBadge({ days, className }: { days: number; className?: string }) {
  const tone: Tone = days < 0 || days <= 7 ? 'danger' : days <= 15 ? 'soon' : 'info';
  return (
    <ToneBadge tone={tone} {...(className ? { className } : {})}>
      {formatDaysLeft(days)}
    </ToneBadge>
  );
}
