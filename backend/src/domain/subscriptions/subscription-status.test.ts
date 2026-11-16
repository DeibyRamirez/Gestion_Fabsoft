import { describe, expect, it } from 'vitest';
import { toBogotaLocalDate } from './bogota-date.js';
import {
  assertTransition,
  canTransition,
  evaluateExpiration,
  initialStatus,
} from './subscription-status.js';

describe('subscription-status', () => {
  it('transiciones válidas por estado', () => {
    expect(canTransition('pending_activation', 'active')).toBe(true);
    expect(canTransition('pending_activation', 'cancelled')).toBe(true);
    expect(canTransition('pending_activation', 'expired')).toBe(false);
    expect(canTransition('active', 'in_renewal')).toBe(true);
    expect(canTransition('active', 'expired')).toBe(true);
    expect(canTransition('in_renewal', 'active')).toBe(true);
    expect(canTransition('expired', 'active')).toBe(true);
    expect(canTransition('expired', 'in_renewal')).toBe(true);
  });

  it('desde cancelled/not_renewed toda transición es inválida', () => {
    expect(canTransition('cancelled', 'active')).toBe(false);
    expect(canTransition('not_renewed', 'active')).toBe(false);
    expect(() => assertTransition('cancelled', 'active')).toThrow(/inválida/);
    expect(() => assertTransition('not_renewed', 'expired')).toThrow(/inválida/);
    expect(() => assertTransition('active', 'in_renewal')).not.toThrow();
  });

  it('toda creación nace pendiente de activación', () => {
    expect(initialStatus()).toBe('pending_activation');
  });

  it('vencida ⇔ hoy > fin (fin inclusivo), sin mirar pago', () => {
    expect(evaluateExpiration('active', '2026-11-14', '2026-11-14')).toBe('active');
    expect(evaluateExpiration('active', '2026-11-14', '2026-11-15')).toBe('expired');
    expect(evaluateExpiration('in_renewal', '2026-11-14', '2026-11-20')).toBe('expired');
    expect(evaluateExpiration('pending_activation', '2026-11-14', '2026-11-20')).toBe(
      'pending_activation',
    );
    expect(evaluateExpiration('expired', '2026-11-14', '2026-11-20')).toBe('expired');
    expect(evaluateExpiration('cancelled', '2026-11-14', '2026-11-20')).toBe('cancelled');
    expect(evaluateExpiration('not_renewed', '2026-11-14', '2026-11-20')).toBe('not_renewed');
  });

  it('T-RN03-03 — 23:30 Bogotá no vencida; 00:05 siguiente sí', () => {
    const end = '2026-11-14';
    const before = toBogotaLocalDate(new Date('2026-11-15T04:30:00Z'));
    const after = toBogotaLocalDate(new Date('2026-11-15T05:05:00Z'));
    expect(before).toBe('2026-11-14');
    expect(after).toBe('2026-11-15');
    expect(evaluateExpiration('active', end, before)).toBe('active');
    expect(evaluateExpiration('active', end, after)).toBe('expired');
  });

  it('convierte instantes UTC a fecha de Bogotá', () => {
    expect(toBogotaLocalDate(new Date('2026-11-14T12:00:00Z'))).toBe('2026-11-14');
    expect(toBogotaLocalDate(new Date('2026-11-15T04:59:59Z'))).toBe('2026-11-14');
    expect(toBogotaLocalDate(new Date('2026-11-15T05:00:00Z'))).toBe('2026-11-15');
  });
});
