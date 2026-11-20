import { describe, expect, it } from 'vitest';
import { assertTaskOpen, isTaskOpen, isTaskOverdue, taskOrigin } from './task.js';

describe('task domain', () => {
  it('abre pendiente/en_progreso y cierra terminales', () => {
    expect(isTaskOpen('pendiente')).toBe(true);
    expect(isTaskOpen('en_progreso')).toBe(true);
    expect(isTaskOpen('completada')).toBe(false);
    expect(isTaskOpen('cancelada')).toBe(false);
    expect(() => assertTaskOpen('completada')).toThrow(/cerrada/);
    expect(() => assertTaskOpen('pendiente')).not.toThrow();
  });

  it('marca vencidas sólo si están abiertas', () => {
    expect(isTaskOverdue('2026-11-16', 'pendiente', '2026-11-17')).toBe(true);
    expect(isTaskOverdue('2026-11-17', 'pendiente', '2026-11-17')).toBe(false);
    expect(isTaskOverdue('2026-11-16', 'completada', '2026-11-17')).toBe(false);
  });

  it('deriva el origen de la tarea', () => {
    expect(taskOrigin(null, null)).toBe('manual');
    expect(taskOrigin('rule-1', null)).toBe('alert_rule');
    expect(taskOrigin(null, 'request-1')).toBe('renewal_request');
  });
});
