'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/require';
import { findOrCreateVendor } from '@/lib/repo/vendors';
import { findSubmissionById } from '@/lib/repo/submissions';
import {
  attachDocument,
  findRequirementByCode,
  listCurrentDocumentsForSubmission,
} from '@/lib/repo/documents';
import { saveUpload } from '@/lib/repo/storage';
import { appendAudit } from '@/lib/repo/audit';
import { validateUpload } from '@/lib/uploads/validate';

export interface UploadActionState {
  ok: boolean;
  message?: string;
  warnings?: string[];
}

const VENDOR_EDITABLE = new Set(['draft', 'returned_to_vendor']);

export async function uploadDocumentAction(
  _prev: UploadActionState,
  formData: FormData,
): Promise<UploadActionState> {
  const user = await requireRole('vendor');

  const submissionId = formData.get('submissionId');
  const docCode = formData.get('docCode');
  const file = formData.get('file');

  if (typeof submissionId !== 'string' || typeof docCode !== 'string' || !(file instanceof File)) {
    return { ok: false, message: 'Missing fields' };
  }
  if (file.size === 0) return { ok: false, message: 'No file selected.' };

  const submission = findSubmissionById(submissionId);
  if (!submission) return { ok: false, message: 'Submission not found.' };

  const vendor = findOrCreateVendor(user.appUserId);
  if (submission.vendorId !== vendor.id) return { ok: false, message: 'Not your submission.' };

  if (!VENDOR_EDITABLE.has(submission.status)) {
    return { ok: false, message: `Cannot upload while submission is ${submission.status}.` };
  }

  const requirement = findRequirementByCode(docCode);
  if (!requirement) return { ok: false, message: 'Unknown document type.' };
  if (requirement.isSystemGenerated) {
    return { ok: false, message: 'This document is system-generated and cannot be uploaded.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'application/octet-stream';

  const validation = await validateUpload({ requirement, buffer, mime, filename: file.name });
  if (!validation.ok) {
    return { ok: false, message: validation.errors.join(' ') };
  }

  // Determine version: 1 if no current row, otherwise current+1
  const existingDocs = listCurrentDocumentsForSubmission(submission.id);
  const existing = existingDocs.find((d) => d.docCode === docCode);
  const nextVersion = existing ? existing.version + 1 : 1;

  const saved = await saveUpload({
    submissionId: submission.id,
    docCode,
    version: nextVersion,
    mime,
    buffer,
  });

  // Capture structured fields for special docs
  const structured: Parameters<typeof attachDocument>[0] = {
    submissionId: submission.id,
    requirementId: requirement.id,
    fileUrl: saved.storagePath,
    fileSizeBytes: saved.sizeBytes,
    fileMimeType: mime,
    uploadedBy: user.appUserId,
  };
  if (docCode === 'no_pe_declaration') {
    structured.directorName = (formData.get('directorName') as string | null) || null;
    structured.tinNumber = (formData.get('tinNumber') as string | null) || null;
    structured.directorDob = (formData.get('directorDob') as string | null) || null;
  }
  if (docCode === 'address_proof') {
    structured.addressText = (formData.get('addressText') as string | null) || null;
    structured.documentDate = (formData.get('documentDate') as string | null) || null;
  }
  if (docCode === 'trc') {
    structured.trcFinancialYear = (formData.get('trcFinancialYear') as string | null) || null;
    structured.trcIssuedCountry = (formData.get('trcIssuedCountry') as string | null) || null;
    structured.trcValidFrom = (formData.get('trcValidFrom') as string | null) || null;
    structured.trcValidTo = (formData.get('trcValidTo') as string | null) || null;
  }
  if (docCode === 'agreement') {
    structured.expiryDate = (formData.get('expiryDate') as string | null) || null;
  }

  attachDocument(structured);

  appendAudit({
    submissionId: submission.id,
    actorId: user.appUserId,
    event: 'document/uploaded',
    payload: { docCode, version: nextVersion, mime, sizeBytes: saved.sizeBytes },
  });

  revalidatePath(`/vendor/submissions/${submission.id}`);
  return { ok: true, message: 'Uploaded.', warnings: validation.warnings };
}
