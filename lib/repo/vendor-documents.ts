import { db } from '@/lib/db/sqlite';
import type { DocumentStatus } from '@/types/submission';

export interface VendorDocument {
  id: string;
  vendorId: string;
  requirementId: string;
  docCode: string;
  displayName: string;
  isMandatory: boolean;
  fileUrl: string | null;
  fileSizeBytes: number | null;
  fileMimeType: string | null;
  version: number;
  isCurrent: boolean;
  status: DocumentStatus | 'expired';
  uploadedAt: string | null;
  // Structured fields, same shape as submission_documents
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

interface VendorDocRow {
  id: string;
  vendor_id: string;
  doc_requirement_id: string;
  doc_code: string;
  display_name: string;
  is_mandatory: number;
  file_url: string | null;
  file_size_bytes: number | null;
  file_mime_type: string | null;
  version: number;
  is_current: number;
  status: DocumentStatus | 'expired';
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

const SELECT_COLS = `
  vd.id, vd.vendor_id, vd.doc_requirement_id,
  dr.doc_code, dr.display_name, dr.is_mandatory,
  vd.file_url, vd.file_size_bytes, vd.file_mime_type,
  vd.version, vd.is_current, vd.status, vd.uploaded_at,
  vd.director_name, vd.tin_number, vd.director_dob,
  vd.address_text, vd.document_date, vd.matches_trc_address,
  vd.trc_issued_country, vd.trc_financial_year, vd.trc_valid_from, vd.trc_valid_to,
  vd.expiry_date
`;

const toDoc = (r: VendorDocRow): VendorDocument => ({
  id: r.id,
  vendorId: r.vendor_id,
  requirementId: r.doc_requirement_id,
  docCode: r.doc_code,
  displayName: r.display_name,
  isMandatory: !!r.is_mandatory,
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

export function listCurrentVendorDocuments(vendorId: string): VendorDocument[] {
  const rows = db()
    .prepare(`
      select ${SELECT_COLS}
      from vendor_documents vd
      join document_requirements dr on dr.id = vd.doc_requirement_id
      where vd.vendor_id = ? and vd.is_current = 1
      order by dr.display_order asc
    `)
    .all(vendorId) as VendorDocRow[];
  return rows.map(toDoc);
}

export function listAllVendorDocuments(vendorId: string): VendorDocument[] {
  const rows = db()
    .prepare(`
      select ${SELECT_COLS}
      from vendor_documents vd
      join document_requirements dr on dr.id = vd.doc_requirement_id
      where vd.vendor_id = ?
      order by dr.display_order asc, vd.version desc
    `)
    .all(vendorId) as VendorDocRow[];
  return rows.map(toDoc);
}

export function findCurrentVendorDoc(vendorId: string, docCode: string): VendorDocument | null {
  const r = db()
    .prepare(`
      select ${SELECT_COLS}
      from vendor_documents vd
      join document_requirements dr on dr.id = vd.doc_requirement_id
      where vd.vendor_id = ? and dr.doc_code = ? and vd.is_current = 1
    `)
    .get(vendorId, docCode) as VendorDocRow | undefined;
  return r ? toDoc(r) : null;
}

export interface AttachVendorDocumentInput {
  vendorId: string;
  requirementId: string;
  fileUrl: string;
  fileSizeBytes: number;
  fileMimeType: string;
  uploadedBy: string;
  expiryDate?: string | null;
  directorName?: string | null;
  tinNumber?: string | null;
  directorDob?: string | null;
  addressText?: string | null;
  documentDate?: string | null;
  trcIssuedCountry?: string | null;
  trcFinancialYear?: string | null;
  trcValidFrom?: string | null;
  trcValidTo?: string | null;
}

/**
 * Attach (or re-attach) a profile document. Same versioning contract as
 * submission_documents: old version flipped to is_current=0, new row at version+1.
 * Returns the freshly-attached row.
 */
export function attachVendorDocument(input: AttachVendorDocumentInput): VendorDocument {
  const conn = db();
  const tx = conn.transaction(() => {
    const existing = conn
      .prepare('select id, version from vendor_documents where vendor_id = ? and doc_requirement_id = ? and is_current = 1')
      .get(input.vendorId, input.requirementId) as { id: string; version: number } | undefined;

    const nextVersion = existing ? existing.version + 1 : 1;
    if (existing) {
      conn.prepare('update vendor_documents set is_current = 0 where id = ?').run(existing.id);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    conn
      .prepare(`
        insert into vendor_documents (
          id, vendor_id, doc_requirement_id,
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
        id, input.vendorId, input.requirementId,
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
      select ${SELECT_COLS}
      from vendor_documents vd
      join document_requirements dr on dr.id = vd.doc_requirement_id
      where vd.id = ?
    `)
    .get(newId) as VendorDocRow;
  return toDoc(r);
}

/** Mark all current profile docs for a vendor as expired (annual FY rollover). */
export function expireVendorDocuments(vendorId: string): number {
  const result = db()
    .prepare(`update vendor_documents set status = 'expired' where vendor_id = ? and is_current = 1 and status != 'expired'`)
    .run(vendorId);
  return result.changes;
}

/** Mark every vendor's current docs as expired — for the annual sweep. */
export function expireAllVendorDocuments(): number {
  const result = db()
    .prepare(`update vendor_documents set status = 'expired' where is_current = 1 and status != 'expired'`)
    .run();
  return result.changes;
}
