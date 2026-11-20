import { describe, expect, it } from 'vitest';
import { formatCop, formatDate, formatDateTime, formatDaysLeft, formatYear } from './format';

describe('formatos es-CO', () => {
  it('formatea fechas civiles sin correr el día', () => {
    expect(formatDate('2026-11-28')).toBe('28 de nov de 2026');
    expect(formatDate(null)).toBe('—');
  });

  it('formatea instantes en America/Bogota', () => {
    expect(formatDateTime('2026-11-19T15:02:00.000Z')).toBe('19 de nov de 2026, 10:02 a. m.');
  });

  it('extrae el año para textos de antigüedad', () => {
    expect(formatYear('2024-03-01T12:00:00.000Z')).toBe('2024');
  });

  it('formatea importes COP sin decimales', () => {
    const formatted = formatCop('1250000.00');
    expect(formatted).toContain('1.250.000');
    expect(formatted).not.toContain(',00');
  });

  it('traduce días restantes', () => {
    expect(formatDaysLeft(0)).toBe('Vence hoy');
    expect(formatDaysLeft(1)).toBe('Falta 1 día');
    expect(formatDaysLeft(12)).toBe('Faltan 12 días');
    expect(formatDaysLeft(-2)).toBe('Venció hace 2 días');
  });
});
