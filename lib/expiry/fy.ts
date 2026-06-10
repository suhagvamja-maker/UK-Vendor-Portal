import { listCurrentVendorDocuments } from '@/lib/repo/vendor-documents';
import { listProfileRequirementsFor } from '@/lib/repo/documents';
import type { VendorType } from '@/types/submission';

/**
 * Indian financial year: 1 April → 31 March.
 * A doc uploaded inside the current FY is "fresh"; anything uploaded before
 * the current FY start is treated as expired for the new year (CLAUDE.md §4
 * adapted per user policy: profile docs reset every 1 April).
 */

export interface FiscalYear {
  startsAt: Date;  // 1 April yyyy at 00:00 UTC
  endsAt: Date;    // 31 March (yyyy+1) at 23:59:59.999 UTC
  label: string;   // e.g. "2026-27"
}

export function currentFiscalYear(now: Date = new Date()): FiscalYear {
  // Use UTC to avoid DST/local-time off-by-ones.
  const utcMonth = now.getUTCMonth(); // 0 = Jan, 3 = Apr
  const utcYear = now.getUTCFullYear();
  const startYear = utcMonth >= 3 ? utcYear : utcYear - 1;
  const startsAt = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0, 0));
  const endsAt = new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999));
  const label = `${startYear}-${String(startYear + 1).slice(-2)}`;
  return { startsAt, endsAt, label };
}

/** A doc is "in scope" for the current FY iff uploaded on or after 1 April of that FY. */
export function isWithinCurrentFy(uploadedAtIso: string | null, fy: FiscalYear = currentFiscalYear()): boolean {
  if (!uploadedAtIso) return false;
  const t = new Date(uploadedAtIso).getTime();
  return t >= fy.startsAt.getTime() && t <= fy.endsAt.getTime();
}

export interface ProfileCompleteness {
  /** True iff every mandatory profile doc is uploaded AND within current FY AND not status='expired'. */
  complete: boolean;
  /** docCodes that are missing or stale. */
  missing: Array<{ docCode: string; displayName: string; reason: 'missing' | 'expired' | 'stale' }>;
  fy: FiscalYear;
}

/**
 * Profile-completeness check used by the vendor dashboard banner and the
 * "block new submission" guard.
 */
export function checkProfileCompleteness(
  vendorId: string,
  vendorType: VendorType | null,
): ProfileCompleteness {
  const fy = currentFiscalYear();
  if (!vendorType) {
    return {
      complete: false,
      missing: [{ docCode: '__profile__', displayName: 'Company details', reason: 'missing' }],
      fy,
    };
  }
  const required = listProfileRequirementsFor(vendorType).filter((r) => r.isMandatory);
  const current = listCurrentVendorDocuments(vendorId);
  const byCode = new Map(current.map((d) => [d.docCode, d]));

  const missing: ProfileCompleteness['missing'] = [];
  for (const req of required) {
    const doc = byCode.get(req.docCode);
    if (!doc || !doc.fileUrl) {
      missing.push({ docCode: req.docCode, displayName: req.displayName, reason: 'missing' });
      continue;
    }
    if (doc.status === 'expired') {
      missing.push({ docCode: req.docCode, displayName: req.displayName, reason: 'expired' });
      continue;
    }
    if (!isWithinCurrentFy(doc.uploadedAt, fy)) {
      missing.push({ docCode: req.docCode, displayName: req.displayName, reason: 'stale' });
    }
  }

  return { complete: missing.length === 0, missing, fy };
}
