'use client';

import type { ReviewableDocument } from './reviewable-document';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  /**
   * Doc-key → list of versions (latest first). The key is `${scope}:${docCode}`
   * so submission and profile docs with the same code never collide.
   * Pre-grouped so the list can collapse re-uploaded docs into a single row
   * with a v-selector.
   */
  groupedDocuments: Map<string, ReviewableDocument[]>;
  active: ReviewableDocument | null;
  onSelect: (doc: ReviewableDocument) => void;
  /** Optional: doc-key → number of comments scoped to that doc. */
  commentCountByDocKey?: Map<string, number>;
}

const STATUS_BADGE: Record<string, string> = {
  not_uploaded:     'bg-slate-100 text-slate-600',
  uploaded:         'bg-amber-100 text-amber-800',
  admin_approved:   'bg-blue-100 text-blue-800',
  admin_rejected:   'bg-rose-100 text-rose-800',
  finance_approved: 'bg-emerald-100 text-emerald-800',
  finance_rejected: 'bg-rose-100 text-rose-800',
  expired:          'bg-rose-100 text-rose-800',
};

export const docKey = (d: ReviewableDocument) => `${d.scope}:${d.docCode}`;

export function DocumentList({ groupedDocuments, active, onSelect, commentCountByDocKey }: Props) {
  if (groupedDocuments.size === 0) {
    return <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>;
  }

  const isPdf = active?.fileMimeType === 'application/pdf';
  const activeGroup = active ? (groupedDocuments.get(docKey(active)) ?? []) : [];
  const hasHistory = activeGroup.length > 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {Array.from(groupedDocuments.entries()).map(([key, versions]) => {
          const latest = versions[0];
          const activeHere = active && docKey(active) === key;
          const commentCount = commentCountByDocKey?.get(key) ?? 0;
          return (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={activeHere ? 'default' : 'outline'}
              onClick={() => onSelect(latest)}
            >
              {latest.displayName}
              {latest.scope === 'profile' && (
                <span className="ml-1 text-[10px] uppercase opacity-70">profile</span>
              )}
              <Badge className={cn('ml-2 text-[10px]', STATUS_BADGE[latest.status])}>
                v{latest.version}
              </Badge>
              {versions.length > 1 && (
                <span className="ml-1 text-[10px] opacity-70">+{versions.length - 1}</span>
              )}
              {commentCount > 0 && (
                <span
                  className="ml-1.5 inline-flex items-center text-[10px] rounded bg-indigo-100 text-indigo-700 px-1.5 py-0.5"
                  title={`${commentCount} comment${commentCount === 1 ? '' : 's'} on this document`}
                >
                  💬 {commentCount}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {active && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-medium text-sm">{active.displayName}</div>
              <div className="text-xs text-muted-foreground">
                {active.fileMimeType ?? 'unknown'} · v{active.version}
                {active.isCurrent ? ' · current' : ' · superseded'}
                {active.isSystemGenerated && ' · system-generated'}
                {active.scope === 'profile' && ' · vendor profile'}
              </div>
            </div>
            {active.fileUrl && (
              <a
                href={`/api/uploads/${active.fileUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                Open in new tab ↗
              </a>
            )}
          </div>

          {hasHistory && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-muted-foreground">Versions:</span>
              {activeGroup.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelect(v)}
                  className={cn(
                    'rounded px-2 py-0.5 border transition',
                    v.id === active.id
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-background hover:bg-muted',
                  )}
                  title={v.uploadedAt ?? undefined}
                >
                  v{v.version}
                  {v.isCurrent ? ' (current)' : ''}
                </button>
              ))}
            </div>
          )}

          {active.fileUrl ? (
            isPdf ? (
              <iframe
                src={`/api/uploads/${active.fileUrl}#view=FitH`}
                className="w-full h-[520px] rounded border bg-muted"
                title={active.displayName}
              />
            ) : (
              <a
                href={`/api/uploads/${active.fileUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center h-[200px] w-full rounded border border-dashed text-sm text-blue-600 hover:underline"
              >
                Preview not supported — open file
              </a>
            )
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground rounded border border-dashed">
              No file attached
            </div>
          )}
        </div>
      )}
    </div>
  );
}
