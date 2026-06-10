'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadDocumentAction, type UploadActionState } from '@/lib/actions/upload';
import { resolveCommentAction } from '@/lib/actions/comments';
import { DocumentMetadata } from '@/components/shared/document-metadata';
import type { DocRequirement, SubmissionDocument } from '@/lib/repo/documents';
import type { Comment } from '@/lib/repo/comments';
import { cn } from '@/lib/utils';

interface Props {
  submissionId: string;
  requirement: DocRequirement;
  current: SubmissionDocument | null;
  editable: boolean;
  /** Comments tagged to this doc (any version) — already filtered for the viewer's visibility. */
  comments?: Comment[];
}

const initial: UploadActionState = { ok: false };

const STATUS_BADGE: Record<string, string> = {
  not_uploaded:     'bg-slate-100 text-slate-600',
  uploaded:         'bg-amber-100 text-amber-800',
  admin_approved:   'bg-blue-100 text-blue-800',
  admin_rejected:   'bg-rose-100 text-rose-800',
  finance_approved: 'bg-emerald-100 text-emerald-800',
  finance_rejected: 'bg-rose-100 text-rose-800',
};

export function DocumentRow({ submissionId, requirement, current, editable, comments = [] }: Props) {
  const [state, formAction, pending] = useActionState(uploadDocumentAction, initial);
  const [open, setOpen] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, startResolveTransition] = useTransition();

  // Auto-close the form after a successful upload. Page revalidation will
  // refresh `current` with the new version + filename.
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  const unresolved = comments.filter((c) => !c.resolvedAt);
  const resolved = comments.filter((c) => c.resolvedAt);
  const visibleComments = showResolved ? comments : unresolved;

  const onResolve = (id: string) => {
    startResolveTransition(async () => {
      await resolveCommentAction(id);
    });
  };

  const isSystemDoc = requirement.isSystemGenerated;
  const status = current?.status ?? 'not_uploaded';
  const isUploaded = !!current?.fileUrl;

  const acceptMimes = Array.isArray(requirement.rules.mime) ? (requirement.rules.mime as string[]).join(',') : undefined;

  // Derive a human-friendly filename from the stored path: "<submissionId>/<docCode>_v<n>.<ext>"
  const filename = current?.fileUrl ? current.fileUrl.split('/').pop() ?? null : null;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{requirement.displayName}</span>
            {requirement.isMandatory && <span className="text-[10px] uppercase text-muted-foreground">required</span>}
            <Badge className={cn('text-xs', STATUS_BADGE[status])}>{status.replace(/_/g, ' ')}</Badge>
            {unresolved.length > 0 && (
              <span
                className="text-[11px] rounded bg-indigo-100 text-indigo-700 px-1.5 py-0.5"
                title={`${unresolved.length} unresolved comment${unresolved.length === 1 ? '' : 's'} on this document`}
              >
                💬 {unresolved.length}
              </span>
            )}
          </div>
          {requirement.description && (
            <p className="text-xs text-muted-foreground">{requirement.description}</p>
          )}
          {isUploaded && current && filename && (
            <>
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="text-emerald-700 font-medium">✓ Uploaded</span>
                <span className="text-muted-foreground">·</span>
                <a
                  href={`/api/uploads/${current.fileUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all"
                  title="Open in new tab"
                >
                  {filename}
                </a>
                <span className="text-muted-foreground">(v{current.version})</span>
              </div>
              <DocumentMetadata document={current} compact />
            </>
          )}
        </div>
        {editable && !isSystemDoc && (
          <Button type="button" variant={isUploaded ? 'outline' : 'default'} size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : isUploaded ? 'Re-upload' : 'Upload'}
          </Button>
        )}
      </div>

      {visibleComments.length > 0 && (
        <div className="space-y-2 rounded-md border border-indigo-100 bg-indigo-50/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-indigo-900">
              Comments on this document
            </p>
            {resolved.length > 0 && (
              <button
                type="button"
                onClick={() => setShowResolved((s) => !s)}
                className="text-[10px] text-indigo-700 hover:underline"
              >
                {showResolved
                  ? `Hide ${resolved.length} resolved`
                  : `Show ${resolved.length} resolved`}
              </button>
            )}
          </div>
          {visibleComments.map((c) => {
            const isResolved = !!c.resolvedAt;
            return (
              <div
                key={c.id}
                className={cn(
                  'rounded border p-2 text-xs space-y-1',
                  isResolved ? 'bg-slate-50 border-slate-200 text-muted-foreground' : 'bg-white',
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
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className={cn('whitespace-pre-wrap', isResolved && 'line-through')}>
                  {c.body}
                </p>
                {!isResolved && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => onResolve(c.id)}
                      disabled={resolving}
                      className="text-[11px] text-emerald-700 hover:underline disabled:opacity-50"
                    >
                      {resolving ? 'Marking…' : '✓ Mark resolved'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {comments.length === 0 ? null : visibleComments.length === 0 && (
        <div className="rounded-md border border-emerald-100 bg-emerald-50/50 p-2 text-[11px] text-emerald-800 flex items-center justify-between">
          <span>All comments on this document are resolved.</span>
          <button
            type="button"
            onClick={() => setShowResolved(true)}
            className="hover:underline"
          >
            Show {resolved.length}
          </button>
        </div>
      )}

      {open && editable && !isSystemDoc && (
        <form action={formAction} className="rounded-md border bg-muted/30 p-3 space-y-3">
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="docCode" value={requirement.docCode} />

          <div className="space-y-1.5">
            <Label htmlFor={`file-${requirement.id}`}>File</Label>
            <Input
              id={`file-${requirement.id}`}
              name="file"
              type="file"
              accept={acceptMimes}
              required
            />
          </div>

          {/* Structured fields per CLAUDE.md §4 */}
          {requirement.docCode === 'no_pe_declaration' && (
            <div className="grid sm:grid-cols-3 gap-3">
              <Field name="directorName" label="Director name" />
              <Field name="tinNumber" label="TIN" />
              <Field name="directorDob" label="Director DOB" type="date" />
            </div>
          )}
          {requirement.docCode === 'address_proof' && (
            <div className="space-y-3">
              <Field name="addressText" label="Address as shown on document" />
              <Field name="documentDate" label="Document date" type="date" />
            </div>
          )}
          {requirement.docCode === 'trc' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field name="trcIssuedCountry" label="Issuing country" placeholder="GB" />
              <Field name="trcFinancialYear" label="Financial year" placeholder="2025-26" />
              <Field name="trcValidFrom" label="Valid from" type="date" />
              <Field name="trcValidTo" label="Valid to" type="date" />
            </div>
          )}
          {requirement.docCode === 'agreement' && (
            <Field name="expiryDate" label="Agreement expiry" type="date" />
          )}

          {state.message && (
            <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-destructive'}`}>{state.message}</p>
          )}
          {state.warnings?.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
          ))}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Uploading…' : isUploaded ? 'Re-upload' : 'Upload'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  type = 'text',
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={name}>
        {label}
      </Label>
      <Input id={name} name={name} type={type} placeholder={placeholder} />
    </div>
  );
}
