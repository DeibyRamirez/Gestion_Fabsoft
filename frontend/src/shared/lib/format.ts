/** Formatos es-CO (docs/design.md §2). Solo presentación: nunca usar el resultado en payloads. */

const TZ = 'America/Bogota';

const dateFmt = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: TZ,
});

const dateTimeFmt = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TZ,
});

const yearFmt = new Intl.DateTimeFormat('es-CO', {
  year: 'numeric',
  timeZone: TZ,
});

const copFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** `YYYY-MM-DD` (fecha civil del API) → «28 de nov de 2026». Se ancla a mediodía UTC para no correr el día. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoDate)
    ? new Date(`${isoDate}T12:00:00Z`)
    : new Date(isoDate);
  return Number.isNaN(d.getTime()) ? isoDate : dateFmt.format(d);
}

/** ISO datetime (`occurredAt`, `createdAt`…) → «19 de nov de 2026, 10:02 a. m.». */
export function formatDateTime(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return '—';
  const d = new Date(isoDateTime);
  return Number.isNaN(d.getTime()) ? isoDateTime : dateTimeFmt.format(d);
}

/** Año de una fecha ISO, para textos como «cliente desde 2024». */
export function formatYear(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoDate)
    ? new Date(`${isoDate}T12:00:00Z`)
    : new Date(isoDate);
  return Number.isNaN(d.getTime()) ? isoDate : yearFmt.format(d);
}

/** Importe del contrato (`"1250000.00"`, moneda COP) → «$ 1.250.000». */
export function formatCop(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = typeof amount === 'number' ? amount : Number(amount);
  return Number.isFinite(n) ? copFmt.format(n) : String(amount);
}

/** `daysUntilExpiration` del API → texto corto. */
export function formatDaysLeft(days: number): string {
  if (days === 0) return 'Vence hoy';
  if (days > 0) return days === 1 ? 'Falta 1 día' : `Faltan ${days} días`;
  const n = Math.abs(days);
  return n === 1 ? 'Venció hace 1 día' : `Venció hace ${n} días`;
}
