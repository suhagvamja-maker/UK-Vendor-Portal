import { renderToBuffer } from '@react-pdf/renderer';
import { HodApprovalDocument, type HodApprovalData } from './hod-approval';
import { saveUpload } from '@/lib/repo/storage';
import {
  attachSystemDocument,
  listCurrentDocumentsForSubmission,
} from '@/lib/repo/documents';

/**
 * Generates the HOD Approval PDF, persists it as a system-generated
 * submission document, and returns the row. Caller is responsible for
 * sequencing this AFTER the state machine transition succeeds.
 */
export async function generateHodApproval(data: HodApprovalData) {
  // Determine next version by looking at any existing HOD Approval doc
  const docs = listCurrentDocumentsForSubmission(data.submissionId);
  const existing = docs.find((d) => d.docCode === 'hod_approval');
  const version = existing ? existing.version + 1 : 1;

  const buffer = await renderToBuffer(HodApprovalDocument({ data: { ...data, version } }));

  const saved = await saveUpload({
    submissionId: data.submissionId,
    docCode: 'hod_approval',
    version,
    mime: 'application/pdf',
    buffer: Buffer.from(buffer),
  });

  return attachSystemDocument({
    submissionId: data.submissionId,
    docCode: 'hod_approval',
    fileUrl: saved.storagePath,
    fileSizeBytes: saved.sizeBytes,
    fileMimeType: 'application/pdf',
    generatedBy: data.approverId,
    status: 'admin_approved',
  });
}
