import type { SubmissionDocument } from '@/lib/repo/documents';
import { formatDate } from '@/lib/format';

interface Field {
  label: string;
  value: string | null | undefined;
  /** Render as a code-style block (for tax IDs / structured identifiers). */
  mono?: boolean;
}

function fieldsFor(doc: SubmissionDocument): Field[] {
  switch (doc.docCode) {
    case 'no_pe_declaration':
      return [
        { label: 'Director name', value: doc.directorName },
        { label: 'TIN', value: doc.tinNumber, mono: true },
        { label: 'Director DOB', value: doc.directorDob ? formatDate(doc.directorDob) : null },
      ];
    case 'address_proof':
      return [
        { label: 'Address on document', value: doc.addressText },
        { label: 'Document date', value: doc.documentDate ? formatDate(doc.documentDate) : null },
      ];
    case 'trc':
      return [
        { label: 'Issuing country', value: doc.trcIssuedCountry },
        { label: 'Financial year', value: doc.trcFinancialYear },
        { label: 'Valid from', value: doc.trcValidFrom ? formatDate(doc.trcValidFrom) : null },
        { label: 'Valid to', value: doc.trcValidTo ? formatDate(doc.trcValidTo) : null },
      ];
    case 'agreement':
      return [{ label: 'Expires on', value: doc.expiryDate ? formatDate(doc.expiryDate) : null }];
    default:
      // Generic fallback — show expiry if captured.
      return doc.expiryDate
        ? [{ label: 'Expires on', value: formatDate(doc.expiryDate) }]
        : [];
  }
}

/**
 * Compact key/value display for a document's structured fields (per CLAUDE.md §4).
 * Renders nothing when no relevant fields are present so it can be unconditionally
 * dropped into any document panel.
 */
export function DocumentMetadata({
  document,
  compact = false,
}: {
  document: SubmissionDocument;
  compact?: boolean;
}) {
  const fields = fieldsFor(document).filter((f) => f.value !== null && f.value !== undefined && f.value !== '');
  if (fields.length === 0) return null;

  return (
    <dl
      className={
        compact
          ? 'mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]'
          : 'mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs rounded-md border bg-muted/30 p-3'
      }
    >
      {fields.map((f) => (
        <div key={f.label} className="flex items-baseline gap-2">
          <dt className="text-muted-foreground shrink-0">{f.label}:</dt>
          <dd className={f.mono ? 'font-mono break-all' : 'break-words'}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
