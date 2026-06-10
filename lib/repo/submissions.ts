import { db } from '@/lib/db/sqlite';
import type { Currency, SubmissionStatus, VendorType } from '@/types/submission';

export interface Submission {
  id: string;
  vendorId: string;
  invoiceNumber: string;
  poNumber: string | null;
  amount: number;
  currency: Currency;
  vendorType: VendorType;
  status: SubmissionStatus;
  currentVersion: number;
  submittedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  glAccountCode: string | null;
  glCostCenter: string | null;
  glNotes: string | null;
  /** GBP equivalent rate captured at Finance approval. NULL if not yet approved. */
  fxRateToGbp: number | null;
  fxRateCapturedAt: string | null;
}

interface SubmissionRow {
  id: string;
  vendor_id: string;
  invoice_number: string;
  po_number: string | null;
  amount: number;
  currency: Currency;
  vendor_type: VendorType;
  status: SubmissionStatus;
  current_version: number;
  submitted_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  gl_account_code: string | null;
  gl_cost_center: string | null;
  gl_notes: string | null;
  fx_rate_to_gbp: number | null;
  fx_rate_captured_at: string | null;
}

const toSubmission = (r: SubmissionRow): Submission => ({
  id: r.id,
  vendorId: r.vendor_id,
  invoiceNumber: r.invoice_number,
  poNumber: r.po_number,
  amount: r.amount,
  currency: r.currency,
  vendorType: r.vendor_type,
  status: r.status,
  currentVersion: r.current_version,
  submittedAt: r.submitted_at,
  approvedAt: r.approved_at,
  paidAt: r.paid_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  glAccountCode: r.gl_account_code,
  glCostCenter: r.gl_cost_center,
  glNotes: r.gl_notes,
  fxRateToGbp: r.fx_rate_to_gbp,
  fxRateCapturedAt: r.fx_rate_captured_at,
});

export interface CreateSubmissionInput {
  vendorId: string;
  invoiceNumber: string;
  poNumber: string | null;
  amount: number;
  currency: Currency;
  vendorType: VendorType;
}

export function createSubmission(input: CreateSubmissionInput): Submission {
  const id = crypto.randomUUID();
  db()
    .prepare(`
      insert into submissions (id, vendor_id, invoice_number, po_number, amount, currency, vendor_type, status)
      values (?, ?, ?, ?, ?, ?, ?, 'draft')
    `)
    .run(id, input.vendorId, input.invoiceNumber, input.poNumber, input.amount, input.currency, input.vendorType);
  const created = findSubmissionById(id);
  if (!created) throw new Error('Failed to create submission');
  return created;
}

export function findSubmissionById(id: string): Submission | null {
  const r = db().prepare('select * from submissions where id = ?').get(id) as SubmissionRow | undefined;
  return r ? toSubmission(r) : null;
}

export function listSubmissionsForVendor(vendorId: string): Submission[] {
  const rows = db()
    .prepare('select * from submissions where vendor_id = ? order by created_at desc')
    .all(vendorId) as SubmissionRow[];
  return rows.map(toSubmission);
}

export function listSubmissionsByStatus(...statuses: SubmissionStatus[]): Submission[] {
  if (statuses.length === 0) return [];
  const placeholders = statuses.map(() => '?').join(',');
  const rows = db()
    .prepare(`select * from submissions where status in (${placeholders}) order by updated_at asc`)
    .all(...statuses) as SubmissionRow[];
  return rows.map(toSubmission);
}

/**
 * Internal: low-level status update used ONLY by the state machine.
 * All other call sites must go through transitionSubmission().
 */
export interface GlCodingInput {
  glAccountCode: string | null;
  glCostCenter: string | null;
  glNotes: string | null;
}

/**
 * Capture the FX-rate-to-GBP at the moment of Finance approval. Idempotent —
 * a subsequent call (e.g. on returned_to_admin → approve again) refreshes the
 * snapshot. Same currency as the invoice → rate = 1.
 */
export function captureFxRateSnapshot(id: string, rate: number): void {
  db()
    .prepare(`update submissions set fx_rate_to_gbp = ?, fx_rate_captured_at = ? where id = ?`)
    .run(rate, new Date().toISOString(), id);
}

export function deleteSubmissionIfDraft(id: string, vendorId: string): boolean {
  const result = db()
    .prepare(`delete from submissions where id = ? and vendor_id = ? and status = 'draft'`)
    .run(id, vendorId);
  return result.changes > 0;
}

export function updateGlCoding(id: string, input: GlCodingInput): void {
  db()
    .prepare(`
      update submissions
      set gl_account_code = ?, gl_cost_center = ?, gl_notes = ?, updated_at = ?
      where id = ?
    `)
    .run(input.glAccountCode, input.glCostCenter, input.glNotes, new Date().toISOString(), id);
}

export function _updateSubmissionStatus(
  id: string,
  expectedFrom: SubmissionStatus,
  to: SubmissionStatus,
  timestamps: { submittedAt?: string; approvedAt?: string; paidAt?: string } = {},
): boolean {
  const now = new Date().toISOString();
  const result = db()
    .prepare(`
      update submissions
      set status = ?,
          updated_at = ?,
          submitted_at = coalesce(?, submitted_at),
          approved_at  = coalesce(?, approved_at),
          paid_at      = coalesce(?, paid_at)
      where id = ? and status = ?
    `)
    .run(to, now, timestamps.submittedAt ?? null, timestamps.approvedAt ?? null, timestamps.paidAt ?? null, id, expectedFrom);
  return result.changes === 1;
}
