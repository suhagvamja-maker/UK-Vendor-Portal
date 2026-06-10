import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/require';
import { findOrCreateVendor } from '@/lib/repo/vendors';
import { findSubmissionById } from '@/lib/repo/submissions';
import {
  findRequirementByCode,
  listAllDocumentsForSubmission,
  listCurrentDocumentsForSubmission,
} from '@/lib/repo/documents';
import { listCurrentVendorDocuments } from '@/lib/repo/vendor-documents';
import { listCommentsForSubmission, type Comment } from '@/lib/repo/comments';
import { listTimelineFor } from '@/lib/repo/timeline';
import { SubmissionTimeline } from '@/components/shared/submission-timeline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/shared/status-pill';
import { DisputeBadge } from '@/components/shared/dispute-badge';
import { hasOpenDispute } from '@/lib/repo/disputes';
import { formatMoney, formatDate } from '@/lib/format';
import { DocumentRow } from './document-row';
import { ProfileDocFeedback } from './profile-doc-feedback';
import { SubmitForReview } from './submit-button';
import { RaiseDisputeCard } from './raise-dispute';
import { DeleteDraftButton } from './delete-draft-button';
import { CommentThread } from '@/components/shared/comment-thread';

export default async function VendorSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole('vendor');
  const submission = findSubmissionById(id);
  if (!submission) return notFound();

  const vendor = findOrCreateVendor(user.appUserId);
  if (submission.vendorId !== vendor.id) return notFound();

  const currentDocs = listCurrentDocumentsForSubmission(submission.id);
  const invoiceReq = findRequirementByCode('invoice');
  const invoiceDoc = currentDocs.find((d) => d.docCode === 'invoice') ?? null;
  const hodDoc = currentDocs.find((d) => d.docCode === 'hod_approval') ?? null;
  const paymentReceiptDoc = currentDocs.find((d) => d.docCode === 'payment_receipt') ?? null;
  const extras = [hodDoc, paymentReceiptDoc].filter(Boolean) as NonNullable<typeof hodDoc>[];

  const comments = listCommentsForSubmission(submission.id, 'vendor');
  const timeline = listTimelineFor(submission.id, 'vendor');

  const allDocs = listAllDocumentsForSubmission(submission.id);
  const docIdToCode = new Map(allDocs.map((d) => [d.id, d.docCode]));
  const commentsByDocCode = new Map<string, Comment[]>();
  const profileDocs = listCurrentVendorDocuments(vendor.id);
  const profileDocByCode = new Map(profileDocs.map((d) => [d.docCode, d]));
  const profileIdToCode = new Map<string, string>();
  for (const d of profileDocs) profileIdToCode.set(d.id, d.docCode);
  const profileCommentsByCode = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.documentId) {
      const code = docIdToCode.get(c.documentId);
      if (code) {
        const arr = commentsByDocCode.get(code) ?? [];
        arr.push(c);
        commentsByDocCode.set(code, arr);
      }
    } else if (c.profileDocumentId) {
      const code = profileIdToCode.get(c.profileDocumentId);
      if (code) {
        const arr = profileCommentsByCode.get(code) ?? [];
        arr.push(c);
        profileCommentsByCode.set(code, arr);
      }
    }
  }

  const editable = submission.status === 'draft' || submission.status === 'returned_to_vendor';
  const ready = !!invoiceDoc?.fileUrl;

  const flaggedProfileCodes = Array.from(profileCommentsByCode.keys());

  const hasOwnOpenDispute = comments.some(
    (c) => c.actionTaken === 'disputed' && !c.resolvedAt && c.authorId === user.appUserId,
  );
  const openDisputeCount = comments.filter(
    (c) => c.actionTaken === 'disputed' && !c.resolvedAt,
  ).length;

  return (
    <div className="space-y-6">
      <div className="ink-card p-6 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">
            Invoice {submission.invoiceNumber}
          </h1>
          <StatusPill status={submission.status} />
          {hasOpenDispute(submission.id) && <DisputeBadge />}
        </div>
        <div className="flex items-baseline gap-4 pt-1 flex-wrap">
          <span className="text-2xl font-semibold tracking-tight font-mono">
            {formatMoney(submission.amount, submission.currency)}
          </span>
          {submission.poNumber && (
            <span className="text-xs text-muted-foreground">PO {submission.poNumber}</span>
          )}
          <span className="text-xs text-muted-foreground">
            Created {formatDate(submission.createdAt)}
          </span>
          {submission.submittedAt && (
            <span className="text-xs text-muted-foreground">
              · Submitted {formatDate(submission.submittedAt)}
            </span>
          )}
        </div>
        {submission.status === 'draft' && (
          <div className="flex justify-end pt-2">
            <DeleteDraftButton submissionId={submission.id} />
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice file</CardTitle>
        </CardHeader>
        <CardContent>
          {invoiceDoc && invoiceReq ? (
            <DocumentRow
              submissionId={submission.id}
              requirement={invoiceReq}
              current={invoiceDoc}
              editable={editable}
              comments={commentsByDocCode.get('invoice') ?? []}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No invoice attached yet. Create a new submission to upload one.
            </p>
          )}
        </CardContent>
      </Card>

      {flaggedProfileCodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Feedback on your compliance documents</CardTitle>
            <CardDescription>
              Finance left comments on documents from your profile while reviewing this invoice.
              Update the document on your profile, then mark each comment resolved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 divide-y">
            {flaggedProfileCodes.map((code) => {
              const doc = profileDocByCode.get(code);
              if (!doc) return null;
              return (
                <div key={code} className="pt-3 first:pt-0">
                  <ProfileDocFeedback
                    submissionId={submission.id}
                    doc={doc}
                    comments={profileCommentsByCode.get(code) ?? []}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Compliance documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Compliance documents come from your profile and apply to every invoice you raise.
          </p>
          <Link href="/vendor/profile" className="text-blue-600 text-sm hover:underline inline-block">
            View / update profile →
          </Link>
        </CardContent>
      </Card>

      {extras.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Other documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 divide-y">
            {extras.map((d) => (
              <div key={d.id} className="py-3 first:pt-0 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">{d.displayName}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.isSystemGenerated ? 'System-generated' : 'Uploaded by Finance'} · v{d.version}
                  </div>
                </div>
                {d.fileUrl && (
                  <a
                    href={`/api/uploads/${d.fileUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View →
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {editable && (
        <SubmitForReview submissionId={submission.id} ready={ready} />
      )}

      <SubmissionTimeline entries={timeline} />

      {submission.status !== 'draft' && (
        <RaiseDisputeCard
          submissionId={submission.id}
          isPaid={submission.status === 'paid'}
          openDisputeCount={openDisputeCount}
          hasOwnOpenDispute={hasOwnOpenDispute}
        />
      )}

      <CommentThread
        submissionId={submission.id}
        comments={comments}
        viewerRole="vendor"
        canPost={submission.status !== 'draft'}
      />
    </div>
  );
}
