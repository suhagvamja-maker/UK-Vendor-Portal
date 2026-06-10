import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/require';
import { findSubmissionById } from '@/lib/repo/submissions';
import { findVendorById } from '@/lib/repo/vendors';
import { listAllDocumentsForSubmission } from '@/lib/repo/documents';
import { listCommentsForSubmission } from '@/lib/repo/comments';
import { listTimelineFor } from '@/lib/repo/timeline';
import { SubmissionTimeline } from '@/components/shared/submission-timeline';
import { formatDate, formatMoney } from '@/lib/format';
import { computeSla, SLA_TONE } from '@/lib/sla';
import { StatusPill } from '@/components/shared/status-pill';
import { DisputeBadge } from '@/components/shared/dispute-badge';
import { hasOpenDispute } from '@/lib/repo/disputes';
import { ReviewPanel } from '@/components/shared/review-panel';
import { fromSubmissionDocument } from '@/components/shared/reviewable-document';
import { ReviewActions } from './review-actions';
import { cn } from '@/lib/utils';

export default async function AdminReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole('admin');

  const submission = findSubmissionById(id);
  if (!submission) return notFound();
  const vendor = findVendorById(submission.vendorId);

  // Admin sees only invoice-related submission docs. Compliance documents
  // live on the vendor profile and are NOT shown here — that is Finance's job.
  // Admin sees only invoice + HOD approval — no vendor compliance docs.
  const adminVisibleCodes = new Set(['invoice', 'hod_approval']);
  const documents = listAllDocumentsForSubmission(submission.id)
    .filter((d) => adminVisibleCodes.has(d.docCode))
    .map(fromSubmissionDocument);

  const comments = listCommentsForSubmission(submission.id, 'admin');
  const timeline = listTimelineFor(submission.id, 'admin');

  const canAct = submission.status === 'pending_admin' || submission.status === 'returned_to_admin';
  const sla = computeSla(submission.submittedAt ?? submission.updatedAt, 'admin');
  const disputed = hasOpenDispute(submission.id);

  return (
    <div className="space-y-6">
      <Link href="/admin/invoices" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
        <span aria-hidden>←</span> Back to invoices
      </Link>

      <div className="ink-card p-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">
              {submission.invoiceNumber}
            </h1>
            <StatusPill status={submission.status} />
            {disputed && <DisputeBadge />}
            {sla && (
              <span className={cn('inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full', SLA_TONE[sla.tone])}>
                SLA · {sla.label}{sla.tone === 'red' && ' overdue'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground">
              {vendor?.companyName ?? 'Unknown vendor'}
            </span>
            {vendor?.vendorCode && (
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                {vendor.vendorCode}
              </span>
            )}
            <span aria-hidden>·</span>
            <span>{vendor?.country ?? '—'} · {submission.vendorType}</span>
          </div>
          <div className="flex items-baseline gap-4 pt-1">
            <span className="text-2xl font-semibold tracking-tight font-mono">
              {formatMoney(submission.amount, submission.currency)}
            </span>
            {submission.poNumber && (
              <span className="text-xs text-muted-foreground">PO {submission.poNumber}</span>
            )}
            <span className="text-xs text-muted-foreground">
              Submitted {formatDate(submission.submittedAt)}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground max-w-xs">
          You review the invoice only. Compliance is handled by Finance using the vendor&apos;s
          profile documents.
        </p>
      </div>

      <ReviewPanel
        submissionId={submission.id}
        documents={documents}
        comments={comments}
        viewerRole="admin"
        canPostComments
        actionsSlot={
          <>
            {canAct && <ReviewActions submissionId={submission.id} />}
            <SubmissionTimeline entries={timeline} />
          </>
        }
      />
    </div>
  );
}
