import type { SubmissionDocument } from '@/lib/repo/documents';
import type { VendorDocument } from '@/lib/repo/vendor-documents';
import type { DocumentStatus } from '@/types/submission';

/**
 * Normalised view of a document a reviewer can preview, click through, and
 * comment on. Wraps both submission-scoped docs (invoice, HOD approval,
 * payment receipt) and profile-scoped docs (compliance) under one shape.
 *
 * The `scope` field tells callers which underlying table the row came from
 * so they can route comments to the correct foreign key
 * (submission_documents.id vs vendor_documents.id).
 */
export interface ReviewableDocument {
  /** The id of the underlying row (submission_documents.id or vendor_documents.id). */
  id: string;
  scope: 'submission' | 'profile';
  docCode: string;
  displayName: string;
  fileUrl: string | null;
  fileMimeType: string | null;
  version: number;
  isCurrent: boolean;
  status: DocumentStatus | 'expired';
  uploadedAt: string | null;
  isSystemGenerated: boolean;
}

export function fromSubmissionDocument(d: SubmissionDocument): ReviewableDocument {
  return {
    id: d.id,
    scope: 'submission',
    docCode: d.docCode,
    displayName: d.displayName,
    fileUrl: d.fileUrl,
    fileMimeType: d.fileMimeType,
    version: d.version,
    isCurrent: d.isCurrent,
    status: d.status,
    uploadedAt: d.uploadedAt,
    isSystemGenerated: d.isSystemGenerated,
  };
}

export function fromVendorDocument(d: VendorDocument): ReviewableDocument {
  return {
    id: d.id,
    scope: 'profile',
    docCode: d.docCode,
    displayName: d.displayName,
    fileUrl: d.fileUrl,
    fileMimeType: d.fileMimeType,
    version: d.version,
    isCurrent: d.isCurrent,
    status: d.status,
    uploadedAt: d.uploadedAt,
    isSystemGenerated: false,
  };
}
