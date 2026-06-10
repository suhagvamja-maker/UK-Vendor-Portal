'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, requireUser } from '@/lib/auth/require';
import { findSubmissionById } from '@/lib/repo/submissions';
import { findVendorById, findVendorByUserId } from '@/lib/repo/vendors';
import { findUserById } from '@/lib/repo/users';
import { addComment } from '@/lib/repo/comments';
import { transitionSubmission } from '@/lib/state-machine/transition';
import { generateHodApproval } from '@/lib/pdf/generate-hod-approval';
import {
  notifyAdminApproved,
  notifyRejected,
  notifyReturnedToVendor,
} from '@/lib/notifications/notify';
import type { CommentVisibility } from '@/types/submission';

export interface ActionState {
  ok: boolean;
  message?: string;
}

/**
 * Admin approves → status pending_admin (or returned_to_admin) → pending_finance.
 * Side effect: generate the HOD Approval PDF and attach it as a system doc.
 */
export async function adminApproveAction(submissionId: string, comment?: string): Promise<ActionState> {
  const user = await requireRole('admin');
  const submission = findSubmissionById(submissionId);
  if (!submission) return { ok: false, message: 'Submission not found.' };

  try {
    await transitionSubmission({
      submissionId,
      action: 'approve',
      actorId: user.appUserId,
      role: 'admin',
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Transition failed' };
  }

  // Generate the HOD Approval PDF after the transition. If this fails, the
  // status is already updated — the PDF will be regenerated on a subsequent
  // approval (when returned_to_admin → approve). Log and continue.
  const vendor = findVendorById(submission.vendorId);
  const approver = findUserById(user.appUserId);
  try {
    await generateHodApproval({
      submissionId: submission.id,
      invoiceNumber: submission.invoiceNumber,
      poNumber: submission.poNumber,
      amount: submission.amount,
      currency: submission.currency,
      vendorCompanyName: vendor?.companyName ?? null,
      vendorCountry: vendor?.country ?? '—',
      vendorType: submission.vendorType,
      approverName: approver?.name ?? null,
      approverId: user.appUserId,
      approverEmail: approver?.email ?? '—',
      approvedAt: new Date(),
      version: 1, // generator decides actual version
    });
  } catch (err) {
    console.error('[admin] HOD PDF generation failed', err);
  }

  if (comment?.trim()) {
    addComment({
      submissionId,
      authorId: user.appUserId,
      body: comment.trim(),
      actionTaken: 'approved',
      visibility: 'all',
    });
  }

  // Fire-and-forget in-app + email notification (CLAUDE.md §10).
  notifyAdminApproved(submissionId).catch((err) =>
    console.error('[notify] adminApproved failed', err),
  );

  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/submissions/${submissionId}`);
  return { ok: true };
}

export async function adminReturnToVendorAction(submissionId: string, reason: string): Promise<ActionState> {
  const user = await requireRole('admin');
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { ok: false, message: 'Please write at least 5 characters explaining what to fix.' };
  }

  try {
    await transitionSubmission({
      submissionId,
      action: 'return_to_vendor',
      actorId: user.appUserId,
      role: 'admin',
      payload: { reason: trimmed },
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Transition failed' };
  }

  addComment({
    submissionId,
    authorId: user.appUserId,
    body: trimmed,
    actionTaken: 'returned_to_vendor',
    visibility: 'vendor',
  });

  notifyReturnedToVendor(submissionId, trimmed).catch((err) =>
    console.error('[notify] returnedToVendor (admin) failed', err),
  );

  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/submissions/${submissionId}`);
  return { ok: true };
}

export async function adminRejectAction(submissionId: string, reason: string): Promise<ActionState> {
  const user = await requireRole('admin');
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { ok: false, message: 'Please write at least 5 characters explaining the rejection.' };
  }

  try {
    await transitionSubmission({
      submissionId,
      action: 'reject',
      actorId: user.appUserId,
      role: 'admin',
      payload: { reason: trimmed },
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Transition failed' };
  }

  addComment({
    submissionId,
    authorId: user.appUserId,
    body: trimmed,
    actionTaken: 'rejected',
    visibility: 'all',
  });

  notifyRejected(submissionId, trimmed).catch((err) =>
    console.error('[notify] rejected (admin) failed', err),
  );

  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/submissions/${submissionId}`);
  return { ok: true };
}

/**
 * Generic comment post — used by the bottom-of-thread composer.
 * Pass exactly one of `documentId` (submission doc) or `profileDocumentId`
 * (vendor profile doc), or neither for a submission-level comment.
 *
 * Authorization rules:
 *  - admin / finance can post with any visibility
 *  - vendor can post only on their own submission, only with visibility 'all'
 *    or 'vendor' (never 'internal'), regardless of submission status — a
 *    vendor can still comment on a paid invoice if they need to raise a query.
 */
export async function postCommentAction(
  submissionId: string,
  body: string,
  visibility: CommentVisibility,
  target: { documentId?: string | null; profileDocumentId?: string | null } = {},
): Promise<ActionState> {
  // Anyone signed in is allowed in principle — we narrow per-role below.
  const user = await requireUser();
  const trimmed = body.trim();
  if (trimmed.length < 1) return { ok: false, message: 'Comment cannot be empty.' };

  if (user.role === 'vendor') {
    if (visibility === 'internal') {
      return { ok: false, message: 'Vendors cannot post internal comments.' };
    }
    // Make sure the submission actually belongs to this vendor.
    const submission = findSubmissionById(submissionId);
    const vendor = findVendorByUserId(user.appUserId);
    if (!submission || !vendor || submission.vendorId !== vendor.id) {
      return { ok: false, message: 'Not your submission.' };
    }
  }

  addComment({
    submissionId,
    documentId: target.documentId ?? null,
    profileDocumentId: target.profileDocumentId ?? null,
    authorId: user.appUserId,
    body: trimmed,
    actionTaken: 'commented',
    visibility,
  });
  revalidatePath(`/admin/submissions/${submissionId}`);
  revalidatePath(`/finance/submissions/${submissionId}`);
  revalidatePath(`/vendor/submissions/${submissionId}`);
  return { ok: true };
}
