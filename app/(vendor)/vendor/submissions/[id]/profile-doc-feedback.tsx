'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState, useTransition } from 'react';
import type { Comment } from '@/lib/repo/comments';
import type { VendorDocument } from '@/lib/repo/vendor-documents';
import { nudgeReviewerForDocAction, resolveCommentAction } from '@/lib/actions/comments';
import {
  uploadVendorDocumentAction,
  type UploadActionState,
} from '@/lib/actions/vendor-profile-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  submissionId: string;
  doc: VendorDocument;
  comments: Comment[];
}

const initialUpload: UploadActionState = { ok: false };

/**
 * Per-doc feedback card on the vendor's submission detail page.
 *
 * Behavior:
 *  - Shows finance/admin comments tagged to this profile doc
 *  - Inline "Re-upload" button opens a file picker right there — no need to
 *    bounce to /vendor/profile to address feedback
 *  - Vendor can mark each comment resolved once they've addressed it
 *  - When awaiting re-review, vendor can ping the reviewer
 */
export function ProfileDocFeedback({ submissionId, doc, comments }: Props) {
  const [showResolved, setShowResolved] = useState(false);
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [nudging, startNudgeTransition] = useTransition();
  const [nudgedRecently, setNudgedRecently] = useState(false);
  const [state, formAction, pending] = useActionState(uploadVendorDocumentAction, initialUpload);
  const toast = useToast();

  // Auto-close the re-upload form on success.
  useEffect(() => {
    if (state.ok) {
      setReuploadOpen(false);
      toast.success(`${doc.displayName} re-uploaded.`);
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state.ok, state.message, doc.displayName, toast]);

  const unresolved = comments.filter((c) => !c.resolvedAt);
  const resolved = comments.filter((c) => c.resolvedAt);
  const visible = showResolved ? comments : unresolved;

  // Re-upload should only be possible when there's actionable feedback —
  // i.e. unresolved comments AND the current doc was uploaded BEFORE those
  // comments arrived. Once the vendor replaces the file, the new doc's
  // uploadedAt sits after the comments, so the button disappears (the ball
  // is now in the reviewer's court). New feedback resets this naturally.
  const latestUnresolvedAt =
    unresolved.length > 0
      ? Math.max(...unresolved.map((c) => new Date(c.createdAt).getTime()))
      : 0;
  const docUploadedAt = doc.uploadedAt ? new Date(doc.uploadedAt).getTime() : 0;
  const canReupload = unresolved.length > 0 && docUploadedAt < latestUnresolvedAt;
  const awaitingReReview =
    unresolved.length > 0 && !canReupload && docUploadedAt >= latestUnresolvedAt;
  // Show "Notify reviewer" only after a few days of stuck state — picking 3
  // working days gives the reviewer a normal SLA window before we offer to nudge.
  const daysSinceUpload = docUploadedAt > 0 ? (Date.now() - docUploadedAt) / 86400000 : 0;
  const canNudge = awaitingReReview && daysSinceUpload >= 3;

  const onResolve = (id: string) => {
    setResolvingIds((prev) => new Set(prev).add(id));
    (async () => {
      try {
        const result = await resolveCommentAction(id);
        if (!result.ok) {
          toast.error(result.message ?? 'Could not resolve.');
        } else {
          toast.success('Comment resolved.');
        }
      } catch {
        toast.error('Network error — please retry.');
      } finally {
        setResolvingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    })();
  };

  const onNudge = () => {
    startNudgeTransition(async () => {
      const result = await nudgeReviewerForDocAction(submissionId, doc.docCode);
      if (!result.ok) {
        toast.error(result.message ?? 'Could not notify reviewer.');
      } else {
        toast.success('Reviewer notified.');
        setNudgedRecently(true);
      }
    });
  };

  const filename = doc.fileUrl ? doc.fileUrl.split('/').pop() ?? null : null;

  // What kind of doc — drives which structured fields to expose in the form.
  const code = doc.docCode;
  const acceptMimes =
    code === 'trc' || code === 'agreement' || code === 'no_pe_declaration' ||
    code === 'form_10f' || code === 'certificate_of_incorporation'
      ? 'application/pdf'
      : 'application/pdf,image/jpeg,image/png';

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
            {doc.displayName}
            <span className="text-[10px] uppercase rounded bg-indigo-50 px-1 py-0.5 text-indigo-700">
              profile
            </span>
            {unresolved.length > 0 && (
              <span className="text-[11px] rounded bg-rose-100 text-rose-700 px-1.5 py-0.5">
                {unresolved.length} open
              </span>
            )}
          </div>
          {doc.fileUrl && filename && (
            <a
              href={`/api/uploads/${doc.fileUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline break-all"
            >
              {filename}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canReupload && (
            <Button
              type="button"
              size="sm"
              variant={reuploadOpen ? 'outline' : 'default'}
              onClick={() => setReuploadOpen((o) => !o)}
            >
              {reuploadOpen ? 'Cancel' : 'Re-upload'}
            </Button>
          )}
          {resolved.length > 0 && (
            <button
              type="button"
              onClick={() => setShowResolved((s) => !s)}
              className="text-[11px] text-muted-foreground hover:underline"
            >
              {showResolved ? 'Hide' : `Show ${resolved.length}`}
            </button>
          )}
        </div>
      </div>

      {awaitingReReview && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center justify-between gap-2 flex-wrap">
          <span>
            <span className="font-medium">New version uploaded.</span>{' '}
            Awaiting reviewer to look at it.{' '}
            {!canNudge && daysSinceUpload < 3 && (
              <span className="text-muted-foreground">
                You can nudge them after 3 days if no response.
              </span>
            )}
          </span>
          {canNudge && (
            <button
              type="button"
              disabled={nudging || nudgedRecently}
              onClick={onNudge}
              className="text-xs font-medium text-emerald-800 underline hover:no-underline disabled:opacity-50"
            >
              {nudging ? 'Notifying…' : nudgedRecently ? 'Notified' : 'Notify reviewer'}
            </button>
          )}
        </div>
      )}

      {canReupload && reuploadOpen && (
        <form action={formAction} className="rounded-md border bg-muted/30 p-3 space-y-3">
          <input type="hidden" name="docCode" value={doc.docCode} />

          <div className="space-y-1.5">
            <Label htmlFor={`file-${doc.id}`}>New file</Label>
            <Input id={`file-${doc.id}`} name="file" type="file" accept={acceptMimes} required />
            <p className="text-[11px] text-muted-foreground">
              The new file becomes the current version of {doc.displayName} on your profile.
              Past versions stay in the history.
            </p>
          </div>

          {/* Structured fields per doc type — same shape as the profile page */}
          {code === 'no_pe_declaration' && (
            <div className="grid sm:grid-cols-3 gap-3">
              <FieldInline name="directorName" label="Director name" defaultValue={doc.directorName} />
              <FieldInline name="tinNumber" label="TIN" defaultValue={doc.tinNumber} />
              <FieldInline name="directorDob" label="Director DOB" type="date" defaultValue={doc.directorDob} />
            </div>
          )}
          {code === 'address_proof' && (
            <div className="space-y-3">
              <FieldInline name="addressText" label="Address as shown on document" defaultValue={doc.addressText} />
              <FieldInline name="documentDate" label="Document date" type="date" defaultValue={doc.documentDate} />
            </div>
          )}
          {code === 'trc' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <FieldInline name="trcIssuedCountry" label="Issuing country" placeholder="GB" defaultValue={doc.trcIssuedCountry} />
              <FieldInline name="trcFinancialYear" label="Financial year" placeholder="2026-27" defaultValue={doc.trcFinancialYear} />
              <FieldInline name="trcValidFrom" label="Valid from" type="date" defaultValue={doc.trcValidFrom} />
              <FieldInline name="trcValidTo" label="Valid to" type="date" defaultValue={doc.trcValidTo} />
            </div>
          )}
          {code === 'agreement' && (
            <FieldInline name="expiryDate" label="Agreement expiry" type="date" defaultValue={doc.expiryDate} />
          )}

          {state.message && (
            <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-destructive'}`}>
              {state.message}
            </p>
          )}
          {state.warnings?.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
          ))}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Uploading…' : 'Re-upload'}
            </Button>
          </div>
        </form>
      )}

      {visible.length === 0 ? (
        <p className="text-xs text-emerald-700">All feedback on this document is resolved.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => {
            const isResolved = !!c.resolvedAt;
            const isResolving = resolvingIds.has(c.id);
            return (
              <div
                key={c.id}
                className={cn(
                  'rounded-md border p-2.5 text-xs space-y-1',
                  isResolved
                    ? 'bg-slate-50 border-slate-200 text-muted-foreground'
                    : 'bg-indigo-50/50 border-indigo-100',
                )}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">
                    {c.authorName ?? 'Unknown'}{' '}
                    <span className="text-muted-foreground">({c.authorRole})</span>
                    {isResolved && (
                      <span className="ml-2 text-[10px] uppercase rounded bg-emerald-100 text-emerald-700 px-1 py-0.5">
                        resolved
                      </span>
                    )}
                  </span>
                  <span
                    className="text-[10px] text-muted-foreground"
                    title={new Date(c.createdAt).toLocaleString()}
                  >
                    {formatRelativeTime(c.createdAt)}
                  </span>
                </div>
                <p className={cn('whitespace-pre-wrap', isResolved && 'line-through')}>{c.body}</p>
                {!isResolved && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => onResolve(c.id)}
                      disabled={isResolving}
                      className="text-[11px] text-emerald-700 hover:underline disabled:opacity-50"
                    >
                      {isResolving ? 'Marking…' : '✓ Mark resolved'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Or update from your{' '}
        <Link href="/vendor/profile" className="text-blue-600 hover:underline">
          profile page
        </Link>
        .
      </p>
    </div>
  );
}

function FieldInline({
  name,
  label,
  type = 'text',
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string | null;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} placeholder={placeholder} defaultValue={defaultValue ?? undefined} />
    </div>
  );
}
