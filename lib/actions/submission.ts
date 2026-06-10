'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/require';
import { findOrCreateVendor } from '@/lib/repo/vendors';
import { createSubmission, findSubmissionById } from '@/lib/repo/submissions';
import {
  attachDocument,
  findRequirementByCode,
  listCurrentDocumentsForSubmission,
} from '@/lib/repo/documents';
import { saveUpload } from '@/lib/repo/storage';
import { appendAudit } from '@/lib/repo/audit';
import { transitionSubmission } from '@/lib/state-machine/transition';
import { newSubmissionSchema } from '@/lib/validators/submission';
import { notifyResubmitted, notifySubmissionCreated } from '@/lib/notifications/notify';
import { checkProfileCompleteness } from '@/lib/expiry/fy';

export interface ActionState {
  ok: boolean;
  fieldErrors?: Record<string, string>;
  message?: string;
}

const INVOICE_MAX_BYTES = 10 * 1024 * 1024;

export async function createSubmissionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole('vendor');
  const parsed = newSubmissionSchema.safeParse({
    vendorType: formData.get('vendorType'),
    invoiceNumber: formData.get('invoiceNumber'),
    poNumber: formData.get('poNumber') ?? '',
    amount: formData.get('amount'),
    currency: formData.get('currency'),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
    return { ok: false, fieldErrors, message: 'Please fix the highlighted fields.' };
  }

  const file = formData.get('invoiceFile');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, fieldErrors: { invoiceFile: 'Attach the invoice PDF.' }, message: 'Invoice file is required.' };
  }
  if (file.size > INVOICE_MAX_BYTES) {
    return {
      ok: false,
      fieldErrors: { invoiceFile: `Invoice exceeds 10MB (got ${(file.size / 1024 / 1024).toFixed(1)}MB).` },
      message: 'Invoice file too large.',
    };
  }
  if (file.type && file.type !== 'application/pdf') {
    return { ok: false, fieldErrors: { invoiceFile: 'Invoice must be a PDF.' }, message: 'Invoice file invalid.' };
  }

  const vendor = findOrCreateVendor(user.appUserId);

  // Profile-complete gate: block submission creation if compliance docs are
  // missing or stale (uploaded before the current FY).
  const profile = checkProfileCompleteness(vendor.id, parsed.data.vendorType);
  if (!profile.complete) {
    return {
      ok: false,
      message: `Your profile is not complete for FY ${profile.fy.label}. Upload the missing/expired compliance documents on your profile before raising invoices.`,
    };
  }

  // Create the submission first so we can attach the invoice to it.
  let submission;
  try {
    submission = createSubmission({
      vendorId: vendor.id,
      invoiceNumber: parsed.data.invoiceNumber,
      poNumber: parsed.data.poNumber,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      vendorType: parsed.data.vendorType,
    });
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint/i.test(err.message)) {
      return {
        ok: false,
        fieldErrors: { invoiceNumber: 'You already have a submission with this invoice number.' },
        message: 'Duplicate invoice number.',
      };
    }
    throw err;
  }

  // Attach the invoice file to the new submission as the 'invoice' doc.
  const invoiceReq = findRequirementByCode('invoice');
  if (!invoiceReq) {
    throw new Error('invoice requirement missing — seed/migration is out of sync');
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveUpload({
    submissionId: submission.id,
    docCode: 'invoice',
    version: 1,
    mime: 'application/pdf',
    buffer,
  });
  attachDocument({
    submissionId: submission.id,
    requirementId: invoiceReq.id,
    fileUrl: saved.storagePath,
    fileSizeBytes: saved.sizeBytes,
    fileMimeType: 'application/pdf',
    uploadedBy: user.appUserId,
  });

  appendAudit({
    submissionId: submission.id,
    actorId: user.appUserId,
    event: 'submission/draft_created',
    payload: { vendorType: parsed.data.vendorType, currency: parsed.data.currency, fy: profile.fy.label },
  });

  revalidatePath('/vendor/dashboard');
  redirect(`/vendor/submissions/${submission.id}`);
}

/**
 * Vendor clicks "Submit for review" — transitions draft → pending_admin.
 */
export async function submitForReviewAction(submissionId: string): Promise<void> {
  const user = await requireRole('vendor');
  const submission = findSubmissionById(submissionId);
  if (!submission) throw new Error('Submission not found');

  // Ensure the invoice is actually attached.
  const docs = listCurrentDocumentsForSubmission(submissionId);
  const hasInvoice = docs.some((d) => d.docCode === 'invoice' && d.fileUrl);
  if (!hasInvoice) throw new Error('Invoice file is missing.');

  const wasReturned = submission.status === 'returned_to_vendor';

  await transitionSubmission({
    submissionId,
    action: 'submit',
    actorId: user.appUserId,
    role: 'vendor',
  });

  const dispatch = wasReturned
    ? notifyResubmitted(submissionId)
    : notifySubmissionCreated(submissionId);
  dispatch.catch((err) => console.error('[notify] submit failed', err));

  revalidatePath('/vendor/dashboard');
  revalidatePath(`/vendor/submissions/${submissionId}`);
}
