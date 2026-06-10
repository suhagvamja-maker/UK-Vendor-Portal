'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/require';
import { findOrCreateVendor } from '@/lib/repo/vendors';
import {
  attachVendorDocument,
  findCurrentVendorDoc,
} from '@/lib/repo/vendor-documents';
import { findRequirementByCode } from '@/lib/repo/documents';
import { saveVendorUpload } from '@/lib/repo/storage';
import { appendAudit } from '@/lib/repo/audit';
import { validateUpload } from '@/lib/uploads/validate';

export interface UploadActionState {
  ok: boolean;
  message?: string;
  warnings?: string[];
}

/**
 * Upload a profile-scoped compliance document for the current vendor.
 * Same validation pipeline as submission uploads (TRC page count, MIME
 * + size limits, etc.). Re-upload bumps the version like submission docs.
 */
export async function uploadVendorDocumentAction(
  _prev: UploadActionState,
  formData: FormData,
): Promise<UploadActionState> {
  const user = await requireRole('vendor');
  const docCode = formData.get('docCode');
  const file = formData.get('file');

  if (typeof docCode !== 'string' || !(file instanceof File)) {
    return { ok: false, message: 'Missing fields' };
  }
  if (file.size === 0) return { ok: false, message: 'No file selected.' };

  const requirement = findRequirementByCode(docCode);
  if (!requirement) return { ok: false, message: 'Unknown document type.' };
  if (!requirement.isProfileDoc) {
    return { ok: false, message: 'This document is not part of the profile.' };
  }
  if (requirement.uploadedByRole !== 'vendor') {
    return { ok: false, message: 'You are not allowed to upload this document.' };
  }

  const vendor = findOrCreateVendor(user.appUserId);
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'application/octet-stream';

  const validation = await validateUpload({ requirement, buffer, mime, filename: file.name });
  if (!validation.ok) {
    return { ok: false, message: validation.errors.join(' ') };
  }

  const existing = findCurrentVendorDoc(vendor.id, docCode);
  const nextVersion = existing ? existing.version + 1 : 1;

  const saved = await saveVendorUpload({
    vendorId: vendor.id,
    docCode,
    version: nextVersion,
    mime,
    buffer,
  });

  const structured: Parameters<typeof attachVendorDocument>[0] = {
    vendorId: vendor.id,
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
    structured.trcIssuedCountry = (formData.get('trcIssuedCountry') as string | null) || null;
    structured.trcFinancialYear = (formData.get('trcFinancialYear') as string | null) || null;
    structured.trcValidFrom = (formData.get('trcValidFrom') as string | null) || null;
    structured.trcValidTo = (formData.get('trcValidTo') as string | null) || null;
  }
  if (docCode === 'agreement') {
    structured.expiryDate = (formData.get('expiryDate') as string | null) || null;
  }

  attachVendorDocument(structured);

  appendAudit({
    submissionId: null,
    actorId: user.appUserId,
    event: 'profile_document/uploaded',
    payload: { docCode, version: nextVersion, mime, sizeBytes: saved.sizeBytes },
  });

  revalidatePath('/vendor/profile');
  revalidatePath('/vendor/dashboard');
  revalidatePath('/vendor/submissions/new');
  // Submission detail pages (vendor + admin + finance) render profile docs
  // and the per-doc feedback card — they need to refresh too.
  revalidatePath('/vendor/submissions/[id]', 'page');
  revalidatePath('/admin/submissions/[id]', 'page');
  revalidatePath('/finance/submissions/[id]', 'page');
  return { ok: true, message: 'Uploaded.', warnings: validation.warnings };
}
