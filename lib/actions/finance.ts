'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/require';
import {
  captureFxRateSnapshot,
  findSubmissionById,
  updateGlCoding,
} from '@/lib/repo/submissions';
import { resolveFxRate } from '@/lib/fx/rates';
import {
  attachSystemDocument,
  bulkMarkCurrentDocuments,
  listCurrentDocumentsForSubmission,
} from '@/lib/repo/documents';
import { saveUpload } from '@/lib/repo/storage';
import { addComment } from '@/lib/repo/comments';
import { appendAudit } from '@/lib/repo/audit';
import { transitionSubmission } from '@/lib/state-machine/transition';
import { glCodingSchema } from '@/lib/validators/gl-coding';
import {
  notifyFinanceApproved,
  notifyPaid,
  notifyRejected,
  notifyReturnedToAdmin,
  notifyReturnedToVendor,
} from '@/lib/notifications/notify';

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const revalidate = (id: string) => {
  revalidatePath('/finance/invoices');
  revalidatePath('/finance/payments');
  revalidatePath(`/finance/submissions/${id}`);
  revalidatePath(`/admin/submissions/${id}`); // Admin sees finance-return events
};

/**
 * Finance approves the submission → status pending_finance → approved.
 * Side effect: stamp all current submission_documents as 'finance_approved'
 * so the per-doc audit trail matches CLAUDE.md §4.
 */
export async function financeApproveAction(submissionId: string, comment?: string): Promise<ActionState> {
  const user = await requireRole('finance');
  const submission = findSubmissionById(submissionId);
  if (!submission) return { ok: false, message: 'Submission not found.' };

  try {
    await transitionSubmission({
      submissionId,
      action: 'approve',
      actorId: user.appUserId,
      role: 'finance',
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Transition failed' };
  }

  bulkMarkCurrentDocuments(submissionId, 'finance_approved', user.appUserId);

  // Snapshot the FX→GBP rate at the exact moment of approval so the payment
  // export and reconciliation reports have a stable, auditable value. Same
  // currency → 1.0. If the FX provider is unavailable we still approve, just
  // skip the snapshot — finance can re-trigger via "return to admin" → approve.
  try {
    const rate = await resolveFxRate(submission.currency);
    if (rate !== null) captureFxRateSnapshot(submissionId, rate);
  } catch (err) {
    console.error('[finance] FX snapshot failed', err);
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

  notifyFinanceApproved(submissionId).catch((err) =>
    console.error('[notify] financeApproved failed', err),
  );

  revalidate(submissionId);
  return { ok: true };
}

export async function financeReturnToVendorAction(submissionId: string, reason: string): Promise<ActionState> {
  const user = await requireRole('finance');
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { ok: false, message: 'Please write at least 5 characters explaining what to fix.' };
  }
  try {
    await transitionSubmission({
      submissionId,
      action: 'return_to_vendor',
      actorId: user.appUserId,
      role: 'finance',
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
    console.error('[notify] returnedToVendor (finance) failed', err),
  );
  revalidate(submissionId);
  return { ok: true };
}

/**
 * Finance sends back to Admin — internal-only by default per CLAUDE.md §8.
 * Vendor must not see internal back-and-forth.
 */
export async function financeReturnToAdminAction(submissionId: string, reason: string): Promise<ActionState> {
  const user = await requireRole('finance');
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { ok: false, message: 'Please write at least 5 characters explaining what Admin needs to address.' };
  }
  try {
    await transitionSubmission({
      submissionId,
      action: 'return_to_admin',
      actorId: user.appUserId,
      role: 'finance',
      payload: { reason: trimmed },
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Transition failed' };
  }
  addComment({
    submissionId,
    authorId: user.appUserId,
    body: trimmed,
    actionTaken: 'returned_to_admin',
    visibility: 'internal',
  });
  notifyReturnedToAdmin(submissionId, trimmed).catch((err) =>
    console.error('[notify] returnedToAdmin failed', err),
  );
  revalidate(submissionId);
  return { ok: true };
}

export async function financeRejectAction(submissionId: string, reason: string): Promise<ActionState> {
  const user = await requireRole('finance');
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { ok: false, message: 'Please write at least 5 characters explaining the rejection.' };
  }
  try {
    await transitionSubmission({
      submissionId,
      action: 'reject',
      actorId: user.appUserId,
      role: 'finance',
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
    console.error('[notify] rejected (finance) failed', err),
  );
  revalidate(submissionId);
  return { ok: true };
}

const PAYMENT_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
const PAYMENT_RECEIPT_ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/**
 * Mark a submission as paid. Requires a transaction PDF (proof of payment)
 * as a hard precondition — the action refuses to transition without one.
 */
export async function markPaidAction(formData: FormData): Promise<ActionState> {
  const user = await requireRole('finance');
  const submissionId = formData.get('submissionId');
  if (typeof submissionId !== 'string') return { ok: false, message: 'Missing submission id.' };

  const comment = (formData.get('comment') as string | null)?.trim() ?? '';
  const file = formData.get('receipt');
  const hasReceipt = file instanceof File && file.size > 0;

  if (!hasReceipt) {
    return { ok: false, message: 'A transaction PDF is required before marking paid.' };
  }
  if (file.size > PAYMENT_RECEIPT_MAX_BYTES) {
    return { ok: false, message: `Receipt exceeds 10MB limit (got ${(file.size / 1024 / 1024).toFixed(1)}MB).` };
  }
  const mime = file.type || 'application/octet-stream';
  if (!PAYMENT_RECEIPT_ALLOWED_MIMES.has(mime)) {
    return { ok: false, message: 'Receipt must be PDF, JPG, or PNG.' };
  }

  try {
    await transitionSubmission({
      submissionId,
      action: 'mark_paid',
      actorId: user.appUserId,
      role: 'finance',
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Transition failed' };
  }

  {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Match the version that attachSystemDocument will pick (current+1)
    // so the stored filename and DB row agree.
    const existing = listCurrentDocumentsForSubmission(submissionId)
      .find((d) => d.docCode === 'payment_receipt');
    const version = existing ? existing.version + 1 : 1;
    const saved = await saveUpload({
      submissionId,
      docCode: 'payment_receipt',
      version,
      mime,
      buffer,
    });
    attachSystemDocument({
      submissionId,
      docCode: 'payment_receipt',
      fileUrl: saved.storagePath,
      fileSizeBytes: saved.sizeBytes,
      fileMimeType: mime,
      generatedBy: user.appUserId,
      status: 'finance_approved',
      requireFinanceUploaded: true,
    });
    appendAudit({
      submissionId,
      actorId: user.appUserId,
      event: 'payment/receipt_uploaded',
      payload: { fileSizeBytes: saved.sizeBytes, mime },
    });
  }

  if (comment) {
    addComment({
      submissionId,
      authorId: user.appUserId,
      body: comment,
      actionTaken: 'commented',
      visibility: 'all',
    });
  }

  notifyPaid(submissionId).catch((err) => console.error('[notify] paid failed', err));
  revalidate(submissionId);
  return { ok: true };
}

/**
 * Mark multiple submissions as paid in a single user gesture. Each transition
 * runs through the state machine independently — partial failures don't roll
 * back successful ones, but each is independently audited.
 */
export async function bulkMarkPaidAction(submissionIds: string[]): Promise<ActionState & { paidCount?: number; failures?: string[] }> {
  const user = await requireRole('finance');
  let paidCount = 0;
  const failures: string[] = [];
  for (const id of submissionIds) {
    try {
      await transitionSubmission({
        submissionId: id,
        action: 'mark_paid',
        actorId: user.appUserId,
        role: 'finance',
      });
      paidCount++;
      notifyPaid(id).catch((err) => console.error('[notify] bulk paid failed', err));
    } catch (err) {
      failures.push(`${id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
  revalidatePath('/finance/payments');
  revalidatePath('/finance/invoices');
  return {
    ok: failures.length === 0,
    paidCount,
    failures: failures.length > 0 ? failures : undefined,
    message:
      failures.length === 0
        ? `Marked ${paidCount} paid.`
        : `Marked ${paidCount} paid; ${failures.length} failed.`,
  };
}

export async function saveGlCodingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole('finance');
  const submissionId = formData.get('submissionId');
  if (typeof submissionId !== 'string') return { ok: false, message: 'Missing submission id.' };

  const parsed = glCodingSchema.safeParse({
    glAccountCode: formData.get('glAccountCode') ?? '',
    glCostCenter: formData.get('glCostCenter') ?? '',
    glNotes: formData.get('glNotes') ?? '',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
    return { ok: false, fieldErrors, message: 'Please fix the highlighted fields.' };
  }

  const submission = findSubmissionById(submissionId);
  if (!submission) return { ok: false, message: 'Submission not found.' };

  updateGlCoding(submissionId, parsed.data);
  appendAudit({
    submissionId,
    actorId: user.appUserId,
    event: 'gl_coding/updated',
    payload: parsed.data,
  });
  revalidate(submissionId);
  return { ok: true, message: 'GL coding saved.' };
}
