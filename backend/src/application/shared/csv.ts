/** CSV UTF-8 con BOM para que Excel lo abra correctamente. */
export function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
