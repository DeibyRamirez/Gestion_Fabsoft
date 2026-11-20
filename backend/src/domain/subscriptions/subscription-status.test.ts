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
    expect(canTransition('pendiente_activacion', 'activa')).toBe(true);
    expect(canTransition('pendiente_activacion', 'cancelada')).toBe(true);
    expect(canTransition('pendiente_activacion', 'vencida')).toBe(false);
    expect(canTransition('activa', 'en_renovacion')).toBe(true);
    expect(canTransition('activa', 'vencida')).toBe(true);
    expect(canTransition('en_renovacion', 'activa')).toBe(true);
    expect(canTransition('vencida', 'activa')).toBe(true);
    expect(canTransition('vencida', 'en_renovacion')).toBe(true);
  });

  it('desde cancelada/no_renovada toda transición es inválida', () => {
    expect(canTransition('cancelada', 'activa')).toBe(false);
    expect(canTransition('no_renovada', 'activa')).toBe(false);
    expect(() => assertTransition('cancelada', 'activa')).toThrow(/inválida/);
    expect(() => assertTransition('no_renovada', 'vencida')).toThrow(/inválida/);
    expect(() => assertTransition('activa', 'en_renovacion')).not.toThrow();
  });

  it('toda creación nace pendiente de activación', () => {
    expect(initialStatus()).toBe('pendiente_activacion');
  });

  it('vencida ⇔ hoy > fin (fin inclusivo), sin mirar pago', () => {
    expect(evaluateExpiration('activa', '2026-11-14', '2026-11-14')).toBe('activa');
    expect(evaluateExpiration('activa', '2026-11-14', '2026-11-15')).toBe('vencida');
    expect(evaluateExpiration('en_renovacion', '2026-11-14', '2026-11-20')).toBe('vencida');
    expect(evaluateExpiration('pendiente_activacion', '2026-11-14', '2026-11-20')).toBe(
      'pendiente_activacion',
    );
    expect(evaluateExpiration('vencida', '2026-11-14', '2026-11-20')).toBe('vencida');
    expect(evaluateExpiration('cancelada', '2026-11-14', '2026-11-20')).toBe('cancelada');
    expect(evaluateExpiration('no_renovada', '2026-11-14', '2026-11-20')).toBe('no_renovada');
  });

  it('T-RN03-03 — 23:30 Bogotá no vencida; 00:05 siguiente sí', () => {
    const end = '2026-11-14';
    const before = toBogotaLocalDate(new Date('2026-11-15T04:30:00Z'));
    const after = toBogotaLocalDate(new Date('2026-11-15T05:05:00Z'));
    expect(before).toBe('2026-11-14');
    expect(after).toBe('2026-11-15');
    expect(evaluateExpiration('activa', end, before)).toBe('activa');
    expect(evaluateExpiration('activa', end, after)).toBe('vencida');
  });

  it('convierte instantes UTC a fecha de Bogotá', () => {
    expect(toBogotaLocalDate(new Date('2026-11-14T12:00:00Z'))).toBe('2026-11-14');
    expect(toBogotaLocalDate(new Date('2026-11-15T04:59:59Z'))).toBe('2026-11-14');
    expect(toBogotaLocalDate(new Date('2026-11-15T05:00:00Z'))).toBe('2026-11-15');
  });
});
