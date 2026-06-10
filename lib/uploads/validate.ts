import type { DocRequirement } from '@/lib/repo/documents';

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB global cap (CLAUDE.md §4)

export interface UploadValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** TRC-specific: parsed page count if PDF and detection succeeded. */
  trcPageCount?: number;
}

interface ValidateArgs {
  requirement: DocRequirement;
  buffer: Buffer;
  mime: string;
  filename: string;
}

/**
 * Per-document validation per CLAUDE.md §4. Hard failures populate `errors`;
 * soft signals (e.g. address mismatch, non-current FY) populate `warnings`.
 *
 * Address-vs-TRC fuzzy match is a Phase 3 enhancement — the rule is
 * captured here so the form surfaces a warning even though the comparison
 * itself is a stub until we have a TRC OCR pipeline.
 */
export async function validateUpload(args: ValidateArgs): Promise<UploadValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (args.buffer.length > MAX_FILE_BYTES) {
    errors.push(`File exceeds 25MB limit (got ${(args.buffer.length / 1024 / 1024).toFixed(1)}MB).`);
  }

  const rules = args.requirement.rules;
  const allowedMimes = Array.isArray(rules.mime) ? (rules.mime as string[]) : null;
  if (allowedMimes && !allowedMimes.includes(args.mime)) {
    errors.push(`File type not allowed. Expected one of: ${allowedMimes.join(', ')}.`);
  }

  const maxSizeMb = typeof rules.maxSizeMb === 'number' ? rules.maxSizeMb : null;
  if (maxSizeMb && args.buffer.length > maxSizeMb * 1024 * 1024) {
    errors.push(`File exceeds ${maxSizeMb}MB limit for this document type.`);
  }

  // TRC: must be a 3-page PDF (CLAUDE.md §4)
  if (args.requirement.docCode === 'trc' && args.mime === 'application/pdf' && errors.length === 0) {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdf = await PDFDocument.load(args.buffer, { ignoreEncryption: true });
      const pageCount = pdf.getPageCount();
      if (typeof rules.pageCount === 'number' && pageCount !== rules.pageCount) {
        errors.push(`TRC must be exactly ${rules.pageCount} pages — yours has ${pageCount}.`);
      }
      return { ok: errors.length === 0, errors, warnings, trcPageCount: pageCount };
    } catch (err) {
      errors.push(`Could not read PDF: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  // Address proof: dated within 90 days. (We capture the date in the form; this
  // check runs in the action where we have access to that field.)
  // Fuzzy address match against TRC is a Phase 3 enhancement; warn only.
  if (args.requirement.docCode === 'address_proof' && rules.fuzzyMatchTrcAddress) {
    warnings.push('Address will be compared against your TRC during review.');
  }

  return { ok: errors.length === 0, errors, warnings };
}
