import { describe, expect, it } from 'vitest';
import {
  alertDedupeKey,
  alertScheduledFor,
  alertTargetDate,
  hasAlertEligibleStatus,
  isRenewableForAlerts,
  resolveAlertRecipients,
  ruleAppliesToSubscription,
  shouldScheduleOnOrAfter,
  type AlertRulePolicy,
  type AlertSubscriptionState,
} from './alert-policy.js';

const rule = (over: Partial<AlertRulePolicy> = {}): AlertRulePolicy => ({
  code: 'D30',
  offsetDays: 30,
  channels: ['in_app', 'email'],
  appliesWhenNotRenewable: false,
  isActive: true,
  ...over,
});

const state = (over: Partial<AlertSubscriptionState> = {}): AlertSubscriptionState => ({
  status: 'active',
  isRenewable: true,
  renewalOutcome: 'pending',
  ...over,
});

describe('alert-policy', () => {
  it('programa a las 08:00 Bogotá y soporta offset negativo (POST1)', () => {
    expect(alertTargetDate('2026-12-31', 30)).toBe('2026-12-01');
    expect(alertScheduledFor('2026-12-31', 30).toISOString()).toBe('2026-12-01T13:00:00.000Z');
    expect(alertTargetDate('2026-12-31', -1)).toBe('2027-01-01');
  });

  it('no genera alertas retroactivas', () => {
    expect(shouldScheduleOnOrAfter('2026-11-17', '2026-11-17')).toBe(true);
    expect(shouldScheduleOnOrAfter('2026-11-16', '2026-11-17')).toBe(false);
  });

  it('construye la clave de idempotencia RN-08', () => {
    expect(alertDedupeKey('sub-1', 'D30', '2026-12-31', 'email', 'user-1')).toBe(
      'exp:sub-1:D30:2026-12-31:email:user-1',
    );
  });

  it('excluye estados terminales y pendientes', () => {
    for (const status of ['cancelled', 'not_renewed', 'pending_activation'] as const) {
      expect(hasAlertEligibleStatus(status)).toBe(false);
      expect(ruleAppliesToSubscription(rule(), state({ status }))).toBe(false);
    }
    for (const status of ['active', 'in_renewal', 'expired'] as const) {
      expect(hasAlertEligibleStatus(status)).toBe(true);
      expect(ruleAppliesToSubscription(rule(), state({ status }))).toBe(true);
    }
  });

  it('no renovable sólo recibe reglas con excepción', () => {
    expect(isRenewableForAlerts(state({ isRenewable: false }))).toBe(false);
    expect(isRenewableForAlerts(state({ renewalOutcome: 'not_renewed' }))).toBe(false);
    expect(ruleAppliesToSubscription(rule(), state({ isRenewable: false }))).toBe(false);
    expect(
      ruleAppliesToSubscription(
        rule({ appliesWhenNotRenewable: true }),
        state({ isRenewable: false }),
      ),
    ).toBe(true);
  });

  it('regla inactiva no aplica', () => {
    expect(ruleAppliesToSubscription(rule({ isActive: false }), state())).toBe(false);
  });

  it('resuelve responsable de suscripción → cliente → admins', () => {
    expect(
      resolveAlertRecipients({
        subscriptionOwnerId: 'owner',
        clientOwnerId: 'client-owner',
        activeAdminIds: ['a1', 'a2'],
      }),
    ).toEqual(['owner']);
    expect(
      resolveAlertRecipients({
        subscriptionOwnerId: null,
        clientOwnerId: 'client-owner',
        activeAdminIds: ['a1', 'a2'],
      }),
    ).toEqual(['client-owner']);
    expect(
      resolveAlertRecipients({
        subscriptionOwnerId: null,
        clientOwnerId: null,
        activeAdminIds: ['a1', 'a2', 'a1'],
      }),
    ).toEqual(['a1', 'a2']);
  });
});
