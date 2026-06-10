import { db } from '@/lib/db/sqlite';
import type { DocumentStatus, VendorType } from '@/types/submission';

export type DocUploadedByRole = 'vendor' | 'admin' | 'finance' | 'system';

export interface DocRequirement {
  id: string;
  docCode: string;
  displayName: string;
  description: string | null;
  isMandatory: boolean;
  appliesTo: 'individual' | 'company' | 'both';
  isSystemGenerated: boolean;
  uploadedByRole: DocUploadedByRole;
  /** True = lives on vendor profile (uploaded once per FY).
   *  False = lives on a specific submission (invoice / HOD / payment receipt). */
  isProfileDoc: boolean;
  displayOrder: number;
  rules: Record<string, unknown>;
}

interface DocReqRow {
  id: string;
  doc_code: string;
  display_name: string;
  description: string | null;
  is_mandatory: number;
  applies_to: 'individual' | 'company' | 'both';
  is_system_generated: number;
  uploaded_by_role: DocUploadedByRole;
  is_profile_doc: number;
  display_order: number;
  validation_rules_json: string | null;
}

const toReq = (r: DocReqRow): DocRequirement => ({
  id: r.id,
  docCode: r.doc_code,
  displayName: r.display_name,
  description: r.description,
  isMandatory: !!r.is_mandatory,
  appliesTo: r.applies_to,
  isSystemGenerated: !!r.is_system_generated,
  uploadedByRole: r.uploaded_by_role,
  isProfileDoc: !!r.is_profile_doc,
  displayOrder: r.display_order,
  rules: r.validation_rules_json ? (JSON.parse(r.validation_rules_json) as Record<string, unknown>) : {},
});

/** All requirements that apply to a vendor of the given type. */
export function listRequirementsFor(vendorType: VendorType): DocRequirement[] {
  const rows = db()
    .prepare(`
      select * from document_requirements
      where applies_to = 'both' or applies_to = ?
      order by display_order asc
    `)
    .all(vendorType) as DocReqRow[];
  return rows.map(toReq);
}

/**
 * Vendor-checklist filter: only docs the vendor is supposed to upload
 * themselves. Excludes system-generated (HOD) and finance-uploaded
 * (payment receipt) — those appear in the read-only Documents card
 * once they exist.
 */
export function listVendorChecklistFor(vendorType: VendorType): DocRequirement[] {
  return listRequirementsFor(vendorType).filter((r) => r.uploadedByRole === 'vendor');
}

/** Profile docs the vendor uploads once per fiscal year (CLAUDE.md §4). */
export function listProfileRequirementsFor(vendorType: VendorType): DocRequirement[] {
  return listRequirementsFor(vendorType).filter((r) => r.isProfileDoc);
}

/** Submission-scoped requirements (invoice, HOD approval, payment receipt). */
export function listSubmissionRequirements(): DocRequirement[] {
  const rows = db()
    .prepare(`select * from document_requirements where is_profile_doc = 0 order by display_order asc`)
    .all() as DocReqRow[];
  return rows.map(toReq);
}

export function findRequirementByCode(docCode: string): DocRequirement | null {
  const r = db().prepare('select * from document_requirements where doc_code = ?').get(docCode) as DocReqRow | undefined;
  return r ? toReq(r) : null;
}

// ----------------------------------------------------------------------
// Submission documents
// ----------------------------------------------------------------------

export interface SubmissionDocument {
  id: string;
  submissionId: string;
  requirementId: string;
  docCode: string;
  displayName: string;
  isMandatory: boolean;
  isSystemGenerated: boolean;
  fileUrl: string | null;
  fileSizeBytes: number | null;
  fileMimeType: string | null;
  version: number;
  isCurrent: boolean;
  status: DocumentStatus;
  uploadedAt: string | null;
  // Structured fields captured at upload (CLAUDE.md §4) — surfaced in review UIs.
  directorName: string | null;
  tinNumber: string | null;
  directorDob: string | null;
  addressText: string | null;
  documentDate: string | null;
  matchesTrcAddress: boolean | null;
  trcIssuedCountry: string | null;
  trcFinancialYear: string | null;
  trcValidFrom: string | null;
  trcValidTo: string | null;
  expiryDate: string | null;
}

interface SubmissionDocRow {
  id: string;
  submission_id: string;
  doc_requirement_id: string;
  doc_code: string;
  display_name: string;
  is_mandatory: number;
  is_system_generated: number;
  file_url: string | null;
  file_size_bytes: number | null;
  file_mime_type: string | null;
  version: number;
  is_current: number;
  status: DocumentStatus;
  uploaded_at: string | null;
  director_name: string | null;
  tin_number: string | null;
  director_dob: string | null;
  address_text: string | null;
  document_date: string | null;
  matches_trc_address: number | null;
  trc_issued_country: string | null;
  trc_financial_year: string | null;
  trc_valid_from: string | null;
  trc_valid_to: string | null;
  expiry_date: string | null;
}

/**
 * Column list reused across selects so every read returns the full document
 * shape — including the structured fields captured at upload.
 */
const DOC_SELECT_COLS = `
  sd.id, sd.submission_id, sd.doc_requirement_id,
  dr.doc_code, dr.display_name, dr.is_mandatory, dr.is_system_generated,
  sd.file_url, sd.file_size_bytes, sd.file_mime_type,
  sd.version, sd.is_current, sd.status, sd.uploaded_at,
  sd.director_name, sd.tin_number, sd.director_dob,
  sd.address_text, sd.document_date, sd.matches_trc_address,
  sd.trc_issued_country, sd.trc_financial_year, sd.trc_valid_from, sd.trc_valid_to,
  sd.expiry_date
`;

const toDoc = (r: SubmissionDocRow): SubmissionDocument => ({
  id: r.id,
  submissionId: r.submission_id,
  requirementId: r.doc_requirement_id,
  docCode: r.doc_code,
  displayName: r.display_name,
  isMandatory: !!r.is_mandatory,
  isSystemGenerated: !!r.is_system_generated,
  fileUrl: r.file_url,
  fileSizeBytes: r.file_size_bytes,
  fileMimeType: r.file_mime_type,
  version: r.version,
  isCurrent: !!r.is_current,
  status: r.status,
  uploadedAt: r.uploaded_at,
  directorName: r.director_name,
  tinNumber: r.tin_number,
  directorDob: r.director_dob,
  addressText: r.address_text,
  documentDate: r.document_date,
  matchesTrcAddress: r.matches_trc_address === null ? null : !!r.matches_trc_address,
  trcIssuedCountry: r.trc_issued_country,
  trcFinancialYear: r.trc_financial_year,
  trcValidFrom: r.trc_valid_from,
  trcValidTo: r.trc_valid_to,
  expiryDate: r.expiry_date,
});

/** Documents currently attached to a submission, joined with their requirement. */
export function listCurrentDocumentsForSubmission(submissionId: string): SubmissionDocument[] {
  const rows = db()
    .prepare(`
      select ${DOC_SELECT_COLS}
      from submission_documents sd
      join document_requirements dr on dr.id = sd.doc_requirement_id
      where sd.submission_id = ? and sd.is_current = 1
    `)
    .all(submissionId) as SubmissionDocRow[];
  return rows.map(toDoc);
}

/**
 * All document rows for a submission INCLUDING superseded ones (is_current=0).
 * Used by the version-history viewer (CLAUDE.md §8 rule 2) so reviewers can
 * see what was uploaded before a re-upload.
 */
export function listAllDocumentsForSubmission(submissionId: string): SubmissionDocument[] {
  const rows = db()
    .prepare(`
      select ${DOC_SELECT_COLS}
      from submission_documents sd
      join document_requirements dr on dr.id = sd.doc_requirement_id
      where sd.submission_id = ?
      order by dr.display_order asc, sd.version desc
    `)
    .all(submissionId) as SubmissionDocRow[];
  return rows.map(toDoc);
}

export interface AttachDocumentInput {
  submissionId: string;
  requirementId: string;
  fileUrl: string;
  fileSizeBytes: number;
  fileMimeType: string;
  uploadedBy: string;
  expiryDate?: string | null;
  // No PE
  directorName?: string | null;
  tinNumber?: string | null;
  directorDob?: string | null;
  // Address proof
  addressText?: string | null;
  documentDate?: string | null;
  // TRC
  trcIssuedCountry?: string | null;
  trcFinancialYear?: string | null;
  trcValidFrom?: string | null;
  trcValidTo?: string | null;
}

/**
 * Attach a document. If a current version exists, mark it superseded and
 * insert a new row at version+1. Never hard-delete (CLAUDE.md §4).
 */
export function attachDocument(input: AttachDocumentInput): SubmissionDocument {
  const conn = db();
  const tx = conn.transaction(() => {
    const existing = conn
      .prepare('select id, version from submission_documents where submission_id = ? and doc_requirement_id = ? and is_current = 1')
      .get(input.submissionId, input.requirementId) as { id: string; version: number } | undefined;

    const nextVersion = existing ? existing.version + 1 : 1;
    if (existing) {
      conn
        .prepare('update submission_documents set is_current = 0 where id = ?')
        .run(existing.id);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    conn
      .prepare(`
        insert into submission_documents (
          id, submission_id, doc_requirement_id,
          file_url, file_size_bytes, file_mime_type,
          version, is_current, status,
          director_name, tin_number, director_dob,
          address_text, document_date,
          trc_issued_country, trc_financial_year, trc_valid_from, trc_valid_to,
          expiry_date,
          uploaded_by, uploaded_at
        ) values (
          ?, ?, ?,
          ?, ?, ?,
          ?, 1, 'uploaded',
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?,
          ?, ?
        )
      `)
      .run(
        id, input.submissionId, input.requirementId,
        input.fileUrl, input.fileSizeBytes, input.fileMimeType,
        nextVersion,
        input.directorName ?? null, input.tinNumber ?? null, input.directorDob ?? null,
        input.addressText ?? null, input.documentDate ?? null,
        input.trcIssuedCountry ?? null, input.trcFinancialYear ?? null, input.trcValidFrom ?? null, input.trcValidTo ?? null,
        input.expiryDate ?? null,
        input.uploadedBy, now,
      );
    return id;
  });

  const newId = tx();
  const r = db()
    .prepare(`
      select ${DOC_SELECT_COLS}
      from submission_documents sd
      join document_requirements dr on dr.id = sd.doc_requirement_id
      where sd.id = ?
    `)
    .get(newId) as SubmissionDocRow;
  return toDoc(r);
}

/**
 * Attach a system-generated document (HOD Approval PDF). Bypasses validation;
 * starts in 'admin_approved' status. Bumps version on re-approval.
 */
export function attachSystemDocument(input: {
  submissionId: string;
  docCode: string;
  fileUrl: string;
  fileSizeBytes: number;
  fileMimeType: string;
  generatedBy: string;
  status: DocumentStatus;
  /** Override the requirement lookup — system docs require `is_system_generated`,
   *  finance-uploaded docs require `uploaded_by_role = 'finance'`. */
  requireFinanceUploaded?: boolean;
}): SubmissionDocument {
  const conn = db();
  const tx = conn.transaction(() => {
    const lookupCondition = input.requireFinanceUploaded
      ? `uploaded_by_role = 'finance'`
      : `is_system_generated = 1`;
    const requirement = conn
      .prepare(`select id from document_requirements where doc_code = ? and ${lookupCondition}`)
      .get(input.docCode) as { id: string } | undefined;
    if (!requirement) throw new Error(`No matching requirement for code: ${input.docCode}`);

    const existing = conn
      .prepare('select id, version from submission_documents where submission_id = ? and doc_requirement_id = ? and is_current = 1')
      .get(input.submissionId, requirement.id) as { id: string; version: number } | undefined;

    const nextVersion = existing ? existing.version + 1 : 1;
    if (existing) {
      conn.prepare('update submission_documents set is_current = 0 where id = ?').run(existing.id);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    conn
      .prepare(`
        insert into submission_documents (
          id, submission_id, doc_requirement_id,
          file_url, file_size_bytes, file_mime_type,
          version, is_current, status,
          uploaded_by, uploaded_at, reviewed_by, reviewed_at
        ) values (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.submissionId,
        requirement.id,
        input.fileUrl,
        input.fileSizeBytes,
        input.fileMimeType,
        nextVersion,
        input.status,
        input.generatedBy,
        now,
        input.generatedBy,
        now,
      );
    return id;
  });

  const newId = tx();
  const r = db()
    .prepare(`
      select ${DOC_SELECT_COLS}
      from submission_documents sd
      join document_requirements dr on dr.id = sd.doc_requirement_id
      where sd.id = ?
    `)
    .get(newId) as SubmissionDocRow;
  return toDoc(r);
}

/** Update the status of a current submission document (for admin/finance approval flags). */
export function updateDocumentStatus(id: string, status: DocumentStatus, reviewerId: string) {
  db()
    .prepare(`
      update submission_documents
      set status = ?, reviewed_by = ?, reviewed_at = ?
      where id = ?
    `)
    .run(status, reviewerId, new Date().toISOString(), id);
}

/**
 * Mark all current documents on a submission with the given status.
 * Used when an Admin or Finance bulk-approves at the submission level.
 */
export function bulkMarkCurrentDocuments(
  submissionId: string,
  status: DocumentStatus,
  reviewerId: string,
): number {
  const result = db()
    .prepare(`
      update submission_documents
      set status = ?, reviewed_by = ?, reviewed_at = ?
      where submission_id = ? and is_current = 1
    `)
    .run(status, reviewerId, new Date().toISOString(), submissionId);
  return result.changes;
}
