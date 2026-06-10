import type { AppRole } from '@/types/roles';
import type { SubmissionAction } from '@/types/submission';
import { _updateSubmissionStatus, findSubmissionById } from '@/lib/repo/submissions';
import { appendAudit } from '@/lib/repo/audit';
import { findTransition } from './transitions';

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransitionError';
  }
}

interface TransitionInput {
  submissionId: string;
  action: SubmissionAction;
  actorId: string;
  role: AppRole;
  payload?: Record<string, unknown>;
}

interface TransitionResult {
  submissionId: string;
  from: string;
  to: string;
  event: string;
}

/**
 * Atomically transitions a submission's status and writes an audit_log row.
 * The ONLY function that may mutate submissions.status.
 *
 * Concurrency: _updateSubmissionStatus uses an optimistic check
 * (`where status = expectedFrom`) so a second concurrent attempt fails
 * cleanly instead of double-transitioning.
 */
export async function transitionSubmission(input: TransitionInput): Promise<TransitionResult> {
  const current = findSubmissionById(input.submissionId);
  if (!current) throw new InvalidTransitionError(`Submission ${input.submissionId} not found`);

  const rule = findTransition(current.status, input.action, input.role);
  if (!rule) {
    throw new InvalidTransitionError(
      `Cannot ${input.action} from ${current.status} as ${input.role}`,
    );
  }

  const now = new Date().toISOString();
  const timestamps: { submittedAt?: string; approvedAt?: string; paidAt?: string } = {};
  if (rule.to === 'pending_admin' && current.status === 'draft') timestamps.submittedAt = now;
  if (rule.to === 'approved') timestamps.approvedAt = now;
  if (rule.to === 'paid') timestamps.paidAt = now;

  const ok = _updateSubmissionStatus(input.submissionId, current.status, rule.to, timestamps);
  if (!ok) {
    throw new InvalidTransitionError(
      `Concurrent update detected for ${input.submissionId} (status changed under us)`,
    );
  }

  appendAudit({
    submissionId: input.submissionId,
    actorId: input.actorId,
    event: rule.event,
    payload: { action: input.action, from: current.status, to: rule.to, ...input.payload },
  });

  return { submissionId: input.submissionId, from: current.status, to: rule.to, event: rule.event };
}
