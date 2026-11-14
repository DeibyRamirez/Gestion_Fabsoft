/** Normalización alineada con `tax_id_normalized` en Postgres (mayúsculas, solo 0-9A-Z). */
export function normalizeTaxId(taxId: string): string {
  return taxId.toUpperCase().replace(/[^0-9A-Z]/g, '');
}