import { db } from '@/lib/db/sqlite';
import type { SubmissionStatus } from '@/types/submission';

/** Counts of submissions per status — used to populate tab badges. */
export function countSubmissionsByStatus(vendorId?: string): Record<SubmissionStatus, number> {
  const where = vendorId ? 'where vendor_id = ?' : '';
  const params = vendorId ? [vendorId] : [];
  const rows = db()
    .prepare(`select status, count(*) as n from submissions ${where} group by status`)
    .all(...params) as Array<{ status: SubmissionStatus; n: number }>;
  const out: Record<SubmissionStatus, number> = {
    draft: 0,
    pending_admin: 0,
    pending_finance: 0,
    returned_to_vendor: 0,
    returned_to_admin: 0,
    approved: 0,
    paid: 0,
    rejected: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/**
 * Submissions that have at least one unresolved dispute. Optionally filter to
 * a single vendor (vendor dashboard) or count globally (admin/finance).
 */
export function countSubmissionsWithOpenDisputes(vendorId?: string): number {
  const where = vendorId ? 'and s.vendor_id = ?' : '';
  const params = vendorId ? [vendorId] : [];
  const r = db()
    .prepare(`
      select count(distinct s.id) as n
      from submissions s
      where exists (
        select 1 from comments c
        where c.submission_id = s.id
          and c.action_taken = 'disputed'
          and c.resolved_at is null
      ) ${where}
    `)
    .get(...params) as { n: number };
  return r.n;
}
