import type { LocalDate } from './local-date.js';

/** "Hoy" de negocio en America/Bogota a partir de un instante UTC. */
export function toBogotaLocalDate(instant: Date): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
