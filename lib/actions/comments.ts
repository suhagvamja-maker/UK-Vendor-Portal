'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, requireUser } from '@/lib/auth/require';
import {
  acknowledgeDisputeResolve,
  addComment,
  findCommentById,
  hasUnresolvedDisputeFromUser,
  resolveComment,
} from '@/lib/repo/comments';
import { findSubmissionById } from '@/lib/repo/submissions';
import { findVendorByUserId, findVendorById } from '@/lib/repo/vendors';
import { findCurrentVendorDoc } from '@/lib/repo/vendor-documents';
import { appendAudit } from '@/lib/repo/audit';
import { notifyDisputeRaised, notifyDisputeResolved, notifyReviewerForDoc } from '@/lib/notifications/notify';

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Optional payload returned on success — e.g. a hint that the dispute is now fully resolved. */
  meta?: Record<string, unknown>;
}

function revalidateAll(submissionId: string) {
  for (const p of ['/vendor', '/admin', '/finance'] as const) {
    revalidatePath(`${p}/submissions/${submissionId}`);
  }
}

/**
 * Mark a regular (non-dispute) comment as resolved. Permission rules:
 *  - Vendor can resolve a comment only on a submission they own AND only if
 *    the comment is visible to vendors (visibility != 'internal').
 *  - Admin and Finance can resolve any visible comment.
 *
 * For comments with `action_taken = 'disputed'`, this delegates to the
 * two-party resolve flow so a single click does NOT close the dispute.
 */
export async function resolveCommentAction(commentId: string): Promise<ActionResult> {
  const user = await requireUser();
  const comment = findCommentById(commentId);
  if (!comment) return { ok: false, message: 'Comment not found.' };

  // Dispute comments require two-party acknowledgement — re-route.
  if (comment.actionTaken === 'disputed') {
    return acknowledgeDisputeAction(commentId);
  }

  if (user.role === 'vendor') {
    if (comment.visibility === 'internal') {
      return { ok: false, message: 'Cannot resolve an internal comment.' };
    }
    const vendor = findVendorByUserId(user.appUserId);
    const submission = findSubmissionById(comment.submissionId);
    if (!vendor || !submission || submission.vendorId !== vendor.id) {
      return { ok: false, message: 'Not your submission.' };
    }
  }

  resolveComment(commentId);
  appendAudit({
    submissionId: comment.submissionId,
    actorId: user.appUserId,
    event: 'comment/resolved',
    payload: { commentId },
  });
  revalidateAll(comment.submissionId);
  return { ok: true };
}

/**
 * Two-party dispute resolve. Vendor click sets `resolved_by_vendor_at`;
 * Finance (or Admin standing in) click sets `resolved_by_finance_at`. Only
 * when BOTH are set does `resolved_at` flip and the dispute close.
 *
 * Returns `meta.fullyResolved` so the UI can show "still waiting on the
 * other party" vs "✓ closed" without an extra round-trip.
 */
export async function acknowledgeDisputeAction(commentId: string): Promise<ActionResult> {
  const user = await requireUser();
  const comment = findCommentById(commentId);
  if (!comment) return { ok: false, message: 'Comment not found.' };
  if (comment.actionTaken !== 'disputed') {
    return { ok: false, message: 'Not a dispute comment.' };
  }
  if (comment.resolvedAt) {
    return { ok: true, meta: { fullyResolved: true, alreadyResolved: true } };
  }

  // Permission: vendor only on own submission; admin/finance both stand in for the "finance" party.
  let party: 'vendor' | 'finance';
  if (user.role === 'vendor') {
    const vendor = findVendorByUserId(user.appUserId);
    const submission = findSubmissionById(comment.submissionId);
    if (!vendor || !submission || submission.vendorId !== vendor.id) {
      return { ok: false, message: 'Not your submission.' };
    }
    party = 'vendor';
  } else {
    party = 'finance';
  }

  const result = acknowledgeDisputeResolve(commentId, party);
  if (!result) return { ok: false, message: 'Could not acknowledge.' };

  appendAudit({
    submissionId: comment.submissionId,
    actorId: user.appUserId,
    event: result.fullyResolved ? 'dispute/resolved' : 'dispute/acknowledged',
    payload: { commentId, party, fullyResolved: result.fullyResolved },
  });

  if (result.fullyResolved) {
    notifyDisputeResolved(comment.submissionId).catch((err) =>
      console.error('[notify] disputeResolved failed', err),
    );
  }

  revalidateAll(comment.submissionId);
  return {
    ok: true,
    meta: {
      fullyResolved: result.fullyResolved,
      acknowledgedBy: party,
      pendingParty: result.fullyResolved
        ? null
        : party === 'vendor'
          ? 'finance'
          : 'vendor',
    },
  };
}

/**
 * Vendor raises a formal dispute on a (typically paid) invoice. This is
 * structurally a comment with `action_taken = 'disputed'` so it stays in
 * the immutable history, but it gets:
 *   - Visibility 'vendor' so admin + finance see it (not internal)
 *   - An audit log row distinct from a regular comment
 *   - A notification fan-out to all finance + admin users
 *
 * Vendor can raise a dispute on any submission that's already been
 * submitted (i.e. not in `draft`) — including paid invoices.
 *
 * Guard: rejects a duplicate dispute if this vendor already has an
 * unresolved dispute on the same submission.
 */
export async function raiseDisputeAction(submissionId: string, reason: string): Promise<ActionResult> {
  const user = await requireRole('vendor');
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    return { ok: false, message: 'Please describe the dispute in at least 10 characters.' };
  }
  const submission = findSubmissionById(submissionId);
  const vendor = findVendorByUserId(user.appUserId);
  if (!submission || !vendor || submission.vendorId !== vendor.id) {
    return { ok: false, message: 'Not your submission.' };
  }
  if (submission.status === 'draft') {
    return { ok: false, message: 'Submit the invoice first before raising a dispute.' };
  }
  if (hasUnresolvedDisputeFromUser(submissionId, user.appUserId)) {
    return {
      ok: false,
      message: 'You already have an open dispute on this invoice. Continue it in the conversation below.',
    };
  }

  addComment({
    submissionId,
    authorId: user.appUserId,
    body: trimmed,
    actionTaken: 'disputed',
    visibility: 'vendor',
  });

  appendAudit({
    submissionId,
    actorId: user.appUserId,
    event: 'submission/disputed',
    payload: { reasonPreview: trimmed.slice(0, 120) },
  });

  notifyDisputeRaised(submissionId, trimmed).catch((err) =>
    console.error('[notify] disputeRaised failed', err),
  );

  revalidateAll(submissionId);
  return { ok: true };
}

/**
 * Vendor pings the reviewer to re-examine a profile doc after re-upload.
 * Used by the "Awaiting reviewer" banner on the per-doc feedback card so a
 * stuck doc doesn't sit invisible forever.
 *
 * Permission: vendor only, must own the submission and the profile doc.
 */
export async function nudgeReviewerForDocAction(submissionId: string, docCode: string): Promise<ActionResult> {
  const user = await requireRole('vendor');
  const submission = findSubmissionById(submissionId);
  const vendor = findVendorByUserId(user.appUserId);
  if (!submission || !vendor || submission.vendorId !== vendor.id) {
    return { ok: false, message: 'Not your submission.' };
  }
  const doc = findCurrentVendorDoc(vendor.id, docCode);
  if (!doc) return { ok: false, message: 'Document not found on your profile.' };

  appendAudit({
    submissionId,
    actorId: user.appUserId,
    event: 'profile_document/re_review_requested',
    payload: { docCode },
  });

  notifyReviewerForDoc(submissionId, doc.displayName).catch((err) =>
    console.error('[notify] reviewerNudge failed', err),
  );

  revalidateAll(submissionId);
  return { ok: true };
}
