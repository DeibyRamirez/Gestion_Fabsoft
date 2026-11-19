import { describe, expect, it } from 'vitest';
import { assertTaskOpen, isTaskOpen, isTaskOverdue, taskOrigin } from './task.js';

describe('task domain', () => {
  it('abre pending/in_progress y cierra terminales', () => {
    expect(isTaskOpen('pending')).toBe(true);
    expect(isTaskOpen('in_progress')).toBe(true);
    expect(isTaskOpen('completed')).toBe(false);
    expect(isTaskOpen('cancelled')).toBe(false);
    expect(() => assertTaskOpen('completed')).toThrow(/cerrada/);
    expect(() => assertTaskOpen('pending')).not.toThrow();
  });

  it('marca vencidas sólo si están abiertas', () => {
    expect(isTaskOverdue('2026-11-16', 'pending', '2026-11-17')).toBe(true);
    expect(isTaskOverdue('2026-11-17', 'pending', '2026-11-17')).toBe(false);
    expect(isTaskOverdue('2026-11-16', 'completed', '2026-11-17')).toBe(false);
  });

  it('deriva el origen de la tarea', () => {
    expect(taskOrigin(null, null)).toBe('manual');
    expect(taskOrigin('rule-1', null)).toBe('alert_rule');
    expect(taskOrigin(null, 'request-1')).toBe('renewal_request');
  });
});
