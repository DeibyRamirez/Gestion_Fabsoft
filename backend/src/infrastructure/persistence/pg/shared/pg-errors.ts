/** Códigos SQLSTATE usados por los repositorios. 42501 se traduce a 403 en interfaces/http. */
export const PG = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  insufficientPrivilege: '42501',
} as const;

export const pgCode = (err: unknown): string | undefined =>
  typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined;
