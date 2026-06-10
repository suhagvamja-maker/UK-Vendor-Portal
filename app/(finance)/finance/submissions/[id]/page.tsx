import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/require';
import { findSubmissionById } from '@/lib/repo/submissions';
import { findVendorByIdWithBank } from '@/lib/repo/vendors';
import { listAllDocumentsForSubmission } from '@/lib/repo/documents';
import { listAllVendorDocuments } from '@/lib/repo/vendor-documents';
import { listCommentsForSubmission } from '@/lib/repo/comments';
import { listTimelineFor } from '@/lib/repo/timeline';
import { SubmissionTimeline } from '@/components/shared/submission-timeline';
import { formatDate, formatMoney } from '@/lib/format';
import { computeSla, SLA_TONE } from '@/lib/sla';
import { StatusPill } from '@/components/shared/status-pill';
import { DisputeBadge } from '@/components/shared/dispute-badge';
import { hasOpenDispute } from '@/lib/repo/disputes';
import { cn } from '@/lib/utils';
import { ReviewPanel } from '@/components/shared/review-panel';
import {
  fromSubmissionDocument,
  fromVendorDocument,
} from '@/components/shared/reviewable-document';
import { FinanceReviewActions } from './review-actions';
import { GlCodingCard } from './gl-coding-card';
import { BankCard } from './bank-card';

export default async function FinanceReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole('finance');

  const submission = findSubmissionById(id);
  if (!submission) return notFound();
  const vendor = findVendorByIdWithBank(submission.vendorId);

  // Submission-scoped docs (invoice, HOD approval, payment receipt) merged
  // with the vendor's profile compliance docs into one reviewable list.
  // Finance can click any of them, preview, and comment.
  const submissionDocs = listAllDocumentsForSubmission(submission.id).map(fromSubmissionDocument);
  const profileDocs = vendor
    ? listAllVendorDocuments(vendor.id).map(fromVendorDocument)
    : [];
  const documents = [...submissionDocs, ...profileDocs];

  const comments = listCommentsForSubmission(submission.id, 'finance');
  const timeline = listTimelineFor(submission.id, 'finance');

  const canReview = submission.status === 'pending_finance';
  const canMarkPaid = submission.status === 'approved';
  const glEditable = submission.status === 'pending_finance' || submission.status === 'approved';
  const sla = computeSla(submission.updatedAt, 'finance');
  const disputed = hasOpenDispute(submission.id);

  return (
    <div className="space-y-6">
      <Link href="/finance/invoices" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
        <span aria-hidden>←</span> Back to invoices
      </Link>

      <div className="ink-card p-6 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">
            {submission.invoiceNumber}
          </h1>
          <StatusPill status={submission.status} />
          {disputed && <DisputeBadge />}
          {sla && canReview && (
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
        <div className="flex items-baseline gap-4 pt-1 flex-wrap">
          <span className="text-2xl font-semibold tracking-tight font-mono">
            {formatMoney(submission.amount, submission.currency)}
          </span>
          {submission.poNumber && (
            <span className="text-xs text-muted-foreground">PO {submission.poNumber}</span>
          )}
          <span className="text-xs text-muted-foreground">
            Submitted {formatDate(submission.submittedAt)}
          </span>
          {submission.approvedAt && (
            <span className="text-xs text-muted-foreground">
              · Approved {formatDate(submission.approvedAt)}
            </span>
          )}
        </div>
      </div>

      <ReviewPanel
        submissionId={submission.id}
        documents={documents}
        comments={comments}
        viewerRole="finance"
        canPostComments
        actionsSlot={
          <>
            <BankCard bank={vendor?.bankDetails ?? null} vendorCode={vendor?.vendorCode ?? null} />
            <GlCodingCard
              submissionId={submission.id}
              initial={{
                glAccountCode: submission.glAccountCode ?? '',
                glCostCenter: submission.glCostCenter ?? '',
                glNotes: submission.glNotes ?? '',
              }}
              editable={glEditable}
            />
            {(canReview || canMarkPaid) && (
              <FinanceReviewActions
                submissionId={submission.id}
                mode={canReview ? 'review' : 'pay'}
                hasGlCoding={!!(submission.glAccountCode || submission.glCostCenter)}
              />
            )}
            <SubmissionTimeline entries={timeline} />
          </>
        }
      />
    </div>
  );
}
