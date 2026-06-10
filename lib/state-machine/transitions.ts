import type { AppRole } from '@/types/roles';
import type { SubmissionAction, SubmissionStatus } from '@/types/submission';

export interface TransitionRule {
  from: SubmissionStatus;
  action: SubmissionAction;
  role: AppRole;
  to: SubmissionStatus;
  /** Event name emitted on the notification bus. */
  event: string;
}

/**
 * Single source of truth for submission status transitions (CLAUDE.md §6).
 * Any change here must be paired with an audit_log entry — see
 * `transitionSubmission` in ./transition.ts.
 */
export const TRANSITIONS: readonly TransitionRule[] = [
  { from: 'draft',              action: 'submit',           role: 'vendor',  to: 'pending_admin',      event: 'submission/created' },
  { from: 'pending_admin',      action: 'approve',          role: 'admin',   to: 'pending_finance',    event: 'submission/admin_approved' },
  { from: 'pending_admin',      action: 'return_to_vendor', role: 'admin',   to: 'returned_to_vendor', event: 'submission/returned_to_vendor' },
  { from: 'pending_admin',      action: 'reject',           role: 'admin',   to: 'rejected',           event: 'submission/rejected' },
  { from: 'pending_finance',    action: 'approve',          role: 'finance', to: 'approved',           event: 'submission/finance_approved' },
  { from: 'pending_finance',    action: 'return_to_vendor', role: 'finance', to: 'returned_to_vendor', event: 'submission/returned_to_vendor' },
  { from: 'pending_finance',    action: 'return_to_admin',  role: 'finance', to: 'returned_to_admin',  event: 'submission/returned_to_admin' },
  { from: 'pending_finance',    action: 'reject',           role: 'finance', to: 'rejected',           event: 'submission/rejected' },
  { from: 'returned_to_vendor', action: 'submit',           role: 'vendor',  to: 'pending_admin',      event: 'submission/resubmitted' },
  { from: 'returned_to_admin',  action: 'approve',          role: 'admin',   to: 'pending_finance',    event: 'submission/admin_approved' },
  { from: 'approved',           action: 'mark_paid',        role: 'finance', to: 'paid',               event: 'submission/paid' },
] as const;

export function findTransition(
  from: SubmissionStatus,
  action: SubmissionAction,
  role: AppRole,
): TransitionRule | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.action === action && t.role === role);
}
