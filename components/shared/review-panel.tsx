'use client';

import { useMemo, useState } from 'react';
import type { Comment } from '@/lib/repo/comments';
import type { AppRole } from '@/types/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DocumentList, docKey } from './document-list';
import { CommentThread } from './comment-thread';
import { resolveCommentAction } from '@/lib/actions/comments';
import { useToast } from '@/components/ui/toast';
import { formatRelativeTime } from '@/lib/format';
import type { ReviewableDocument } from './reviewable-document';
import { cn } from '@/lib/utils';

const ROLE_TONE: Record<AppRole, string> = {
  vendor:  'bg-blue-100 text-blue-800',
  admin:   'bg-amber-100 text-amber-800',
  finance: 'bg-emerald-100 text-emerald-800',
};

interface Props {
  submissionId: string;
  /** ALL documents the reviewer should see — submission docs + profile docs.
   *  Pass current + superseded versions; the panel groups them by docCode. */
  documents: ReviewableDocument[];
  comments: Comment[];
  viewerRole: AppRole;
  canPostComments: boolean;
  actionsSlot?: React.ReactNode;
}

export function ReviewPanel({
  submissionId,
  documents,
  comments,
  viewerRole,
  canPostComments,
  actionsSlot,
}: Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, ReviewableDocument[]>();
    for (const d of documents) {
      const key = docKey(d);
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => b.version - a.version);
    return map;
  }, [documents]);

  const initial = useMemo(() => {
    const cur = documents.find((d) => d.isCurrent);
    return cur ?? documents[0] ?? null;
  }, [documents]);

  const [activeDoc, setActiveDoc] = useState<ReviewableDocument | null>(initial);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'doc'>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const toast = useToast();

  const idToKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of documents) m.set(d.id, docKey(d));
    return m;
  }, [documents]);

  const commentDocKey = (c: Comment): string | null => {
    if (c.documentId) return idToKey.get(c.documentId) ?? null;
    if (c.profileDocumentId) return idToKey.get(c.profileDocumentId) ?? null;
    return null;
  };

  const visibleComments = useMemo(() => {
    return comments.filter((c) => {
      if (!c.documentId && !c.profileDocumentId) return true;
      return commentDocKey(c) !== null;
    });
  }, [comments, idToKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const commentCountByDocKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of visibleComments) {
      if (c.resolvedAt) continue;
      const key = commentDocKey(c);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [visibleComments, idToKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeKey = activeDoc ? docKey(activeDoc) : null;

  const commentsForActiveDoc = useMemo(() => {
    if (!activeKey) return [];
    return visibleComments.filter((c) => commentDocKey(c) === activeKey);
  }, [visibleComments, activeKey, idToKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredComments = useMemo(() => {
    if (scopeFilter === 'all' || !activeDoc) return visibleComments;
    return commentsForActiveDoc;
  }, [visibleComments, scopeFilter, activeDoc, commentsForActiveDoc]);

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
          toast[fullyResolved ? 'success' : 'info'](
            fullyResolved ? 'Dispute resolved.' : 'Acknowledged — waiting on the other party.',
          );
        } else {
          toast.success('Comment resolved.');
        }
      } catch (err) {
        console.error('[review] resolve failed', err);
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-4 min-h-[600px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentList
              groupedDocuments={grouped}
              active={activeDoc}
              onSelect={setActiveDoc}
              commentCountByDocKey={commentCountByDocKey}
            />
          </CardContent>
        </Card>

        {activeDoc && commentsForActiveDoc.length > 0 && (() => {
          const unresolved = commentsForActiveDoc.filter((c) => !c.resolvedAt);
          const resolved = commentsForActiveDoc.filter((c) => c.resolvedAt);
          const visible = showResolved ? commentsForActiveDoc : unresolved;
          return (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">
                  Comments on {activeDoc.displayName}{' '}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({unresolved.length} open{resolved.length > 0 ? ` · ${resolved.length} resolved` : ''})
                  </span>
                </CardTitle>
                {resolved.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowResolved((s) => !s)}
                    className="text-[11px] text-muted-foreground hover:underline"
                  >
                    {showResolved ? 'Hide resolved' : 'Show resolved'}
                  </button>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {visible.length === 0 ? (
                  <p className="text-xs text-emerald-700">All comments on this document are resolved.</p>
                ) : (
                  visible.map((c) => {
                    const isResolved = !!c.resolvedAt;
                    const isDispute = c.actionTaken === 'disputed';
                    const isResolving = resolvingIds.has(c.id);
                    const youAcked =
                      (viewerRole === 'vendor' && !!c.resolvedByVendorAt) ||
                      (viewerRole !== 'vendor' && !!c.resolvedByFinanceAt);
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          'rounded-md border p-2.5 text-xs space-y-1',
                          isResolved
                            ? 'bg-slate-50 border-slate-200 text-muted-foreground'
                            : isDispute
                              ? 'bg-rose-50 border-rose-300'
                              : 'bg-card',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Badge className={cn('text-[10px]', ROLE_TONE[c.authorRole])}>
                              {c.authorRole}
                            </Badge>
                            <span className="font-medium">{c.authorName ?? 'Unknown'}</span>
                            {c.visibility === 'internal' && (
                              <span className="text-[10px] uppercase rounded bg-slate-200 px-1 py-0.5 text-slate-700">internal</span>
                            )}
                            {isDispute && !isResolved && (
                              <span className="text-[10px] uppercase rounded bg-rose-100 px-1 py-0.5 text-rose-700 font-semibold">
                                dispute
                              </span>
                            )}
                            {isResolved && (
                              <span className="text-[10px] uppercase rounded bg-emerald-100 text-emerald-700 px-1 py-0.5">
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
                        <p className={cn('whitespace-pre-wrap', isResolved && 'line-through')}>
                          {c.body}
                        </p>
                        {!isResolved && (
                          <div className="flex justify-end pt-1">
                            {youAcked ? (
                              <span className="text-[11px] text-muted-foreground italic">
                                You confirmed — waiting on the other party
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isResolving}
                                onClick={() => startResolve(c.id, isDispute)}
                                className={cn(
                                  'text-[11px] hover:underline disabled:opacity-50',
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
                  })
                )}
              </CardContent>
            </Card>
          );
        })()}

        {actionsSlot}
      </div>

      <CommentThread
        submissionId={submissionId}
        comments={filteredComments}
        viewerRole={viewerRole}
        canPost={canPostComments}
        scopeFilter={scopeFilter}
        onScopeFilterChange={setScopeFilter}
        activeDocLabel={activeDoc?.displayName ?? null}
        activeDocId={activeDoc?.scope === 'submission' ? activeDoc.id : null}
        activeProfileDocId={activeDoc?.scope === 'profile' ? activeDoc.id : null}
      />
    </div>
  );
}
