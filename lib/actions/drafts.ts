'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/require';
import { deleteSubmissionIfDraft, findSubmissionById } from '@/lib/repo/submissions';
import { findVendorByUserId } from '@/lib/repo/vendors';
import { appendAudit } from '@/lib/repo/audit';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

/**
 * Vendor deletes their own draft. Only allowed when:
 *  - the caller owns the submission, AND
 *  - the submission is still in `draft` (never been submitted).
 *
 * Submissions that have ever been submitted are intentionally NOT deletable —
 * the audit trail must survive even after a "I changed my mind" moment.
 */
export async function deleteDraftAction(submissionId: string): Promise<ActionResult> {
  const user = await requireRole('vendor');
  const submission = findSubmissionById(submissionId);
  if (!submission) return { ok: false, message: 'Submission not found.' };
  const vendor = findVendorByUserId(user.appUserId);
  if (!vendor || submission.vendorId !== vendor.id) {
    return { ok: false, message: 'Not your submission.' };
  }
  if (submission.status !== 'draft') {
    return { ok: false, message: 'Only drafts can be deleted.' };
  }

  const deleted = deleteSubmissionIfDraft(submissionId, vendor.id);
  if (!deleted) {
    return { ok: false, message: 'Could not delete the draft.' };
  }

  appendAudit({
    submissionId: null,
    actorId: user.appUserId,
    event: 'submission/draft_deleted',
    payload: { submissionId, invoiceNumber: submission.invoiceNumber },
  });

  revalidatePath('/vendor/dashboard');
  redirect('/vendor/dashboard');
}
