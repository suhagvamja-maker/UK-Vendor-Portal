'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Comment } from '@/lib/repo/comments';
import type { AppRole } from '@/types/roles';
import type { CommentVisibility } from '@/types/submission';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { formatRelativeTime } from '@/lib/format';
import { postCommentAction } from '@/lib/actions/admin';
import { resolveCommentAction } from '@/lib/actions/comments';

interface Props {
  submissionId: string;
  comments: Comment[];
  viewerRole: AppRole;
  canPost: boolean;
  /** When ReviewPanel coordinates filter state. Optional → no filter UI. */
  scopeFilter?: 'all' | 'doc';
  onScopeFilterChange?: (next: 'all' | 'doc') => void;
  activeDocLabel?: string | null;
  /** Set when the active doc is a submission document (invoice/HOD/receipt). */
  activeDocId?: string | null;
  /** Set when the active doc is a vendor profile document. */
  activeProfileDocId?: string | null;
}

const ROLE_TONE: Record<AppRole, string> = {
  vendor:  'bg-blue-100 text-blue-800',
  admin:   'bg-amber-100 text-amber-800',
  finance: 'bg-emerald-100 text-emerald-800',
};

const ACTION_LABEL: Record<string, string> = {
  approved:            'Approved',
  rejected:            'Rejected',
  returned_to_vendor:  'Returned to vendor',
  returned_to_admin:   'Returned to Admin',
  forwarded:           'Forwarded',
  disputed:            'Dispute',
};

const ACTION_TONE: Record<string, string> = {
  approved:            'bg-emerald-50 text-emerald-700',
  rejected:            'bg-rose-50 text-rose-700',
  returned_to_vendor:  'bg-amber-50 text-amber-700',
  returned_to_admin:   'bg-amber-50 text-amber-700',
  forwarded:           'bg-blue-50 text-blue-700',
  disputed:            'bg-rose-100 text-rose-800 ring-1 ring-rose-200',
};

export function CommentThread({
  submissionId,
  comments,
  viewerRole,
  canPost,
  scopeFilter,
  onScopeFilterChange,
  activeDocLabel,
  activeDocId,
  activeProfileDocId,
}: Props) {
  const hasActiveDoc = !!(activeDocId || activeProfileDocId);
  const draftStorageKey = `comment-draft:${submissionId}`;
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<CommentVisibility>(
    viewerRole === 'vendor' ? 'vendor' : 'internal',
  );
  const [composerScope, setComposerScope] = useState<'submission' | 'doc'>(
    hasActiveDoc ? 'doc' : 'submission',
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [showResolved, setShowResolved] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setComposerScope(hasActiveDoc ? 'doc' : 'submission');
  }, [hasActiveDoc]);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const saved = window.sessionStorage.getItem(draftStorageKey);
      if (saved) setBody(saved);
    } catch {
      /* sessionStorage may be unavailable (SSR, privacy mode) — fall through. */
    }
  }, [draftStorageKey]);

  useEffect(() => {
    try {
      if (body) window.sessionStorage.setItem(draftStorageKey, body);
      else window.sessionStorage.removeItem(draftStorageKey);
    } catch {
      /* see above */
    }
  }, [body, draftStorageKey]);

  const startResolve = (commentId: string, isDispute: boolean) => {
    setResolvingIds((prev) => new Set(prev).add(commentId));
    (async () => {
      try {
        const result = await resolveCommentAction(commentId);
        if (!result.ok) {
          toast.error(result.message ?? 'Could not resolve comment.');
          return;
        }
        if (isDispute) {
          const fullyResolved = result.meta?.fullyResolved === true;
          const pendingParty = result.meta?.pendingParty as string | null | undefined;
          if (fullyResolved) {
            toast.success('Dispute resolved.');
          } else {
            toast.info(
              pendingParty === 'vendor'
                ? 'Acknowledged. Waiting on the vendor to confirm.'
                : 'Acknowledged. Waiting on Finance to confirm.',
            );
          }
        } else {
          toast.success('Comment resolved.');
        }
      } catch (err) {
        console.error('[comment] resolve failed', err);
        toast.error('Network error — please retry.');
      } finally {
        setResolvingIds((prev) => {
          const next = new Set(prev);
          next.delete(commentId);
          return next;
        });
      }
    })();
  };

  const handlePost = () => {
    if (!body.trim()) return;
    startTransition(async () => {
      setError(null);
      const target = composerScope === 'doc'
        ? { documentId: activeDocId ?? null, profileDocumentId: activeProfileDocId ?? null }
        : {};
      const result = await postCommentAction(submissionId, body, visibility, target);
      if (!result.ok) {
        setError(result.message ?? 'Failed to post');
        toast.error(result.message ?? 'Failed to post comment.');
      } else {
        setBody('');
        try { window.sessionStorage.removeItem(draftStorageKey); } catch { /* ignore */ }
        toast.success(
          visibility === 'internal'
            ? 'Internal comment posted.'
            : composerScope === 'doc' && activeDocLabel
              ? `Comment posted on ${activeDocLabel}.`
              : 'Comment posted.',
        );
      }
    });
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Comments</CardTitle>
        {scopeFilter && onScopeFilterChange && (
          <div className="flex rounded-md border text-xs overflow-hidden">
            <button
              type="button"
              onClick={() => onScopeFilterChange('all')}
              className={cn(
                'px-2 py-1 transition',
                scopeFilter === 'all' ? 'bg-foreground text-background' : 'hover:bg-muted',
              )}
            >
              All
            </button>
            <button
              type="button"
              disabled={!activeDocLabel}
              onClick={() => onScopeFilterChange('doc')}
              className={cn(
                'px-2 py-1 transition disabled:opacity-50',
                scopeFilter === 'doc' ? 'bg-foreground text-background' : 'hover:bg-muted',
              )}
              title={activeDocLabel ? `Only comments on ${activeDocLabel}` : 'Select a document above first'}
            >
              This document
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
        {(() => {
          const unresolved = comments.filter((c) => !c.resolvedAt);
          const resolved = comments.filter((c) => c.resolvedAt);
          return (
            <>
              {(unresolved.length > 0 || resolved.length > 0) && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {unresolved.length} open
                    {resolved.length > 0 && ` · ${resolved.length} resolved`}
                  </span>
                  {resolved.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowResolved((s) => !s)}
                      className="hover:underline"
                    >
                      {showResolved ? 'Hide resolved' : 'Show resolved'}
                    </button>
                  )}
                </div>
              )}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {unresolved.length === 0 && (!showResolved || resolved.length === 0) ? (
                  <p className="text-sm text-muted-foreground">
                    {scopeFilter === 'doc' ? 'No comments on this document.' : 'No open comments.'}
                  </p>
                ) : (
                  <>
                    {unresolved.map((c) =>
                      renderCommentCard(c, resolvingIds, startResolve, viewerRole),
                    )}
                    {showResolved && resolved.length > 0 && (
                      <>
                        <div className="relative pt-2">
                          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
                          <div className="relative bg-card px-2 mx-auto w-max text-[10px] uppercase tracking-wide text-muted-foreground">
                            Resolved
                          </div>
                        </div>
                        {resolved.map((c) =>
                          renderCommentCard(c, resolvingIds, startResolve, viewerRole),
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          );
        })()}

        {canPost && (
          <div className="border-t pt-3 space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a comment…"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {viewerRole !== 'vendor' && (
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as CommentVisibility)}
                    className={cn(
                      'h-8 rounded-md border bg-background px-2 text-xs',
                      visibility === 'internal'
                        ? 'border-slate-300'
                        : 'border-blue-300 text-blue-700',
                    )}
                    title={visibility === 'internal'
                      ? 'Internal — only admin + finance can see this'
                      : 'Vendor-visible — the vendor will see this'}
                  >
                    <option value="internal">Internal only</option>
                    <option value="vendor">Visible to vendor</option>
                  </select>
                )}
                {hasActiveDoc && activeDocLabel && (
                  <select
                    value={composerScope}
                    onChange={(e) => setComposerScope(e.target.value as 'submission' | 'doc')}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    title={`Tag this comment to ${activeDocLabel} or to the submission overall.`}
                  >
                    <option value="submission">On submission</option>
                    <option value="doc">On {activeDocLabel}</option>
                  </select>
                )}
              </div>
              <Button type="button" size="sm" disabled={pending || !body.trim()} onClick={handlePost}>
                {pending ? 'Posting…' : 'Post'}
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function renderCommentCard(
  c: Comment,
  resolvingIds: Set<string>,
  startResolve: (id: string, isDispute: boolean) => void,
  viewerRole: AppRole,
) {
  const isResolved = !!c.resolvedAt;
  const isDispute = c.actionTaken === 'disputed';
  const isResolving = resolvingIds.has(c.id);
  const vendorAck = !!c.resolvedByVendorAt;
  const financeAck = !!c.resolvedByFinanceAt;
  const youAcked =
    (viewerRole === 'vendor' && vendorAck) ||
    (viewerRole !== 'vendor' && financeAck);
  const pendingPartyLabel = isDispute && !isResolved
    ? vendorAck && !financeAck
      ? 'waiting on Finance to confirm'
      : !vendorAck && financeAck
        ? 'waiting on the vendor to confirm'
        : null
    : null;
  return (
    <div
      key={c.id}
      className={cn(
        'rounded-md border p-3 space-y-1',
        isResolved
          ? 'bg-slate-50 border-slate-200 text-muted-foreground'
          : isDispute
            ? 'bg-rose-50 border-rose-300'
            : 'bg-card',
      )}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <Badge className={cn(ROLE_TONE[c.authorRole])}>
            {c.authorRole}
          </Badge>
          <span className="font-medium">{c.authorName ?? 'Unknown'}</span>
          {c.visibility === 'internal' && (
            <span className="text-[10px] uppercase tracking-wide rounded bg-slate-200 px-1 py-0.5 text-slate-700">
              internal
            </span>
          )}
          {(c.documentId || c.profileDocumentId) && (
            <span className="text-[10px] uppercase tracking-wide rounded bg-indigo-50 px-1 py-0.5 text-indigo-700">
              {c.profileDocumentId ? 'profile doc' : 'doc'}
            </span>
          )}
          {c.actionTaken && c.actionTaken !== 'commented' && (
            <span
              className={cn(
                'text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 font-semibold',
                ACTION_TONE[c.actionTaken] ?? 'bg-blue-50 text-blue-700',
              )}
            >
              {ACTION_LABEL[c.actionTaken] ?? c.actionTaken}
            </span>
          )}
          {isResolved && (
            <span className="text-[10px] uppercase tracking-wide rounded bg-emerald-100 text-emerald-700 px-1.5 py-0.5 font-semibold">
              resolved
            </span>
          )}
        </div>
        <span
          className="text-[10px] text-muted-foreground"
          title={new Date(c.createdAt).toLocaleString()}
        >
          {formatRelativeTime(c.createdAt)}
        </span>
      </div>
      <p
        className={cn(
          'text-sm whitespace-pre-wrap',
          isResolved && 'line-through',
        )}
      >
        {c.body}
      </p>
      {pendingPartyLabel && (
        <p className="text-[11px] text-rose-700 italic">
          Acknowledged — {pendingPartyLabel}.
        </p>
      )}
      {!isResolved && (
        <div className="flex justify-end pt-1">
          {youAcked ? (
            <span className="text-[11px] text-muted-foreground italic">You confirmed — waiting on the other party</span>
          ) : (
            <button
              type="button"
              disabled={isResolving}
              onClick={() => startResolve(c.id, isDispute)}
              className={cn(
                'text-[11px] hover:underline disabled:opacity-50 font-medium',
                isDispute ? 'text-rose-700' : 'text-emerald-700',
              )}
            >
              {isResolving
                ? 'Marking…'
                : isDispute
                  ? '✓ Confirm dispute resolved'
                  : '✓ Mark resolved'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
