import { db } from '@/lib/db/sqlite';
import type { Currency, SubmissionStatus, VendorType } from '@/types/submission';

export interface ExportRow {
  invoiceNumber: string;
  poNumber: string | null;
  vendorCompanyName: string | null;
  vendorCountry: string;
  vendorType: VendorType;
  taxId: string | null;
  vatNumber: string | null;
  amount: number;
  currency: Currency;
  status: SubmissionStatus;
  glAccountCode: string | null;
  glCostCenter: string | null;
  glNotes: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
}

interface RawRow {
  invoice_number: string;
  po_number: string | null;
  company_name: string | null;
  country: string;
  vendor_type: VendorType;
  tax_id: string | null;
  vat_number: string | null;
  amount: number;
  currency: Currency;
  status: SubmissionStatus;
  gl_account_code: string | null;
  gl_cost_center: string | null;
  gl_notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
}

export interface ExportFilters {
  /** ISO yyyy-mm-dd inclusive — compared against the chosen `dateField`. */
  from?: string;
  to?: string;
  status?: SubmissionStatus[];
  /** Which timestamp the date range filters on. */
  dateField?: 'submitted_at' | 'approved_at' | 'paid_at';
}

/**
 * Pre-joined rows for the accounting CSV. Defaults to `paid` submissions
 * (what Finance actually wants to push downstream), filtered by paid date.
 */
export function listExportRows(filters: ExportFilters = {}): ExportRow[] {
  const dateField = filters.dateField ?? 'paid_at';
  const conds: string[] = [];
  const params: unknown[] = [];

  const statuses = filters.status ?? (['paid'] as SubmissionStatus[]);
  if (statuses.length > 0) {
    conds.push(`s.status in (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (filters.from) {
    conds.push(`s.${dateField} >= ?`);
    params.push(filters.from);
  }
  if (filters.to) {
    // inclusive end-of-day
    conds.push(`s.${dateField} < datetime(?, '+1 day')`);
    params.push(filters.to);
  }

  const where = conds.length > 0 ? 'where ' + conds.join(' and ') : '';
  const rows = db()
    .prepare(`
      select s.invoice_number, s.po_number,
             v.company_name, v.country, s.vendor_type, v.tax_id, v.vat_number,
             s.amount, s.currency, s.status,
             s.gl_account_code, s.gl_cost_center, s.gl_notes,
             s.submitted_at, s.approved_at, s.paid_at
      from submissions s
      join vendors v on v.id = s.vendor_id
      ${where}
      order by s.${dateField} asc nulls last, s.invoice_number asc
    `)
    .all(...params) as RawRow[];

  return rows.map((r) => ({
    invoiceNumber: r.invoice_number,
    poNumber: r.po_number,
    vendorCompanyName: r.company_name,
    vendorCountry: r.country,
    vendorType: r.vendor_type,
    taxId: r.tax_id,
    vatNumber: r.vat_number,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    glAccountCode: r.gl_account_code,
    glCostCenter: r.gl_cost_center,
    glNotes: r.gl_notes,
    submittedAt: r.submitted_at,
    approvedAt: r.approved_at,
    paidAt: r.paid_at,
  }));
}
