import { db } from '@/lib/db/sqlite';
import type { Currency, SubmissionStatus, VendorType } from '@/types/submission';

/**
 * Queue rows pre-joined with vendor info + open-dispute marker for the Admin /
 * Finance / vendor lists. Separate from the base `submissions` repo to keep
 * that file focused on pure submission CRUD.
 */

export interface QueueRow {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: Currency;
  status: SubmissionStatus;
  vendorType: VendorType;
  vendorId: string;
  vendorCompanyName: string | null;
  vendorCountry: string;
  submittedAt: string | null;
  updatedAt: string;
  /** True iff at least one unresolved comment on this submission has
   *  action_taken='disputed'. Surfaces a "Dispute" badge in lists + headers. */
  hasOpenDispute: boolean;
}

interface QueueRowRaw {
  id: string;
  invoice_number: string;
  amount: number;
  currency: Currency;
  status: SubmissionStatus;
  vendor_type: VendorType;
  vendor_id: string;
  company_name: string | null;
  country: string;
  submitted_at: string | null;
  updated_at: string;
  open_disputes: number;
}

const toRow = (r: QueueRowRaw): QueueRow => ({
  id: r.id,
  invoiceNumber: r.invoice_number,
  amount: r.amount,
  currency: r.currency,
  status: r.status,
  vendorType: r.vendor_type,
  vendorId: r.vendor_id,
  vendorCompanyName: r.company_name,
  vendorCountry: r.country,
  submittedAt: r.submitted_at,
  updatedAt: r.updated_at,
  hasOpenDispute: (r.open_disputes ?? 0) > 0,
});

/**
 * Subquery counting open disputes per submission. Inlined into both queries
 * so a row knows whether to render the Dispute badge with one trip to the DB.
 *
 * NOTE (perf): on SQLite this evaluates per row. Acceptable at dev volume
 * (hundreds of rows). When migrating to Supabase/Postgres, replace with a
 * LEFT JOIN against a `(select submission_id, count(*) ...) group by` CTE for
 * an O(n) single-pass plan. Keeping it inline keeps the SQL portable.
 */
const OPEN_DISPUTES_SUBQUERY = `
  (
    select count(*) from comments c
    where c.submission_id = s.id
      and c.action_taken = 'disputed'
      and c.resolved_at is null
  )
`;

export interface QueueFilters {
  q?: string;
  from?: string;
  to?: string;
}

export function listAllInvoices(filters: QueueFilters & { vendorId?: string } = {}): QueueRow[] {
  const conds: string[] = ['1=1'];
  const params: unknown[] = [];
  if (filters.q && filters.q.trim().length > 0) {
    conds.push(`(
      s.invoice_number like ?
      or lower(v.company_name) like ?
      or lower(v.vendor_code) like ?
    )`);
    const like = `%${filters.q.trim().toLowerCase()}%`;
    params.push(`%${filters.q.trim()}%`, like, like);
  }
  if (filters.from) {
    conds.push(`coalesce(s.submitted_at, s.created_at) >= ?`);
    params.push(filters.from);
  }
  if (filters.to) {
    conds.push(`coalesce(s.submitted_at, s.created_at) < datetime(?, '+1 day')`);
    params.push(filters.to);
  }
  if (filters.vendorId) {
    conds.push('s.vendor_id = ?');
    params.push(filters.vendorId);
  }

  const rows = db()
    .prepare(`
      select s.id, s.invoice_number, s.amount, s.currency, s.status, s.vendor_type,
             s.vendor_id, v.company_name, v.country,
             s.submitted_at, s.updated_at,
             ${OPEN_DISPUTES_SUBQUERY} as open_disputes
      from submissions s
      join vendors v on v.id = s.vendor_id
      where ${conds.join(' and ')}
      order by coalesce(s.paid_at, s.approved_at, s.submitted_at, s.created_at) desc
    `)
    .all(...params) as QueueRowRaw[];
  return rows.map(toRow);
}

export function listQueueByStatus(statuses: SubmissionStatus[], filters: QueueFilters = {}): QueueRow[] {
  if (statuses.length === 0) return [];
  const placeholders = statuses.map(() => '?').join(',');
  const params: unknown[] = [...statuses];
  const conds: string[] = [`s.status in (${placeholders})`];

  if (filters.q && filters.q.trim().length > 0) {
    conds.push(`(
      s.invoice_number like ?
      or lower(v.company_name) like ?
      or lower(v.vendor_code) like ?
    )`);
    const like = `%${filters.q.trim().toLowerCase()}%`;
    params.push(`%${filters.q.trim()}%`, like, like);
  }
  if (filters.from) {
    conds.push(`coalesce(s.submitted_at, s.updated_at) >= ?`);
    params.push(filters.from);
  }
  if (filters.to) {
    conds.push(`coalesce(s.submitted_at, s.updated_at) < datetime(?, '+1 day')`);
    params.push(filters.to);
  }

  const rows = db()
    .prepare(`
      select s.id, s.invoice_number, s.amount, s.currency, s.status, s.vendor_type,
             s.vendor_id, v.company_name, v.country,
             s.submitted_at, s.updated_at,
             ${OPEN_DISPUTES_SUBQUERY} as open_disputes
      from submissions s
      join vendors v on v.id = s.vendor_id
      where ${conds.join(' and ')}
      order by coalesce(s.submitted_at, s.updated_at) asc
    `)
    .all(...params) as QueueRowRaw[];
  return rows.map(toRow);
}
