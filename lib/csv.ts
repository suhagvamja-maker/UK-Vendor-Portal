/**
 * Minimal RFC-4180 CSV writer. Avoids a dep on csv-stringify for two
 * dozen lines of code we control.
 *
 *   - Fields containing comma, quote, CR or LF are quoted.
 *   - Embedded quotes are doubled.
 *   - Numbers/dates/null are stringified consistently.
 *   - Output uses CRLF line endings (Excel-friendly).
 */

function quote(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(
  rows: T[],
  columns: Array<{ key: keyof T; header: string }>,
): string {
  const headerLine = columns.map((c) => quote(c.header)).join(',');
  const dataLines = rows.map((r) => columns.map((c) => quote(r[c.key])).join(','));
  return [headerLine, ...dataLines].join('\r\n') + '\r\n';
}
