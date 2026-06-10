import { db } from '@/lib/db/sqlite';

/**
 * Cheap predicate: does this submission have at least one unresolved dispute?
 * Used to decide whether to render the DisputeBadge on submission detail headers.
 */
export function hasOpenDispute(submissionId: string): boolean {
  const r = db()
    .prepare(`
      select 1 as x from comments
      where submission_id = ? and action_taken = 'disputed' and resolved_at is null
      limit 1
    `)
    .get(submissionId) as { x: number } | undefined;
  return !!r;
}

/**
 * Count of unresolved disputes on a submission (for "N open" hints in UI).
 */
export function countOpenDisputes(submissionId: string): number {
  const r = db()
    .prepare(`
      select count(*) as n from comments
      where submission_id = ? and action_taken = 'disputed' and resolved_at is null
    `)
    .get(submissionId) as { n: number } | undefined;
  return r?.n ?? 0;
}
