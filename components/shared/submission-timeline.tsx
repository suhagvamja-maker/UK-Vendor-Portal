'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TimelineEntry } from '@/lib/repo/timeline';
import type { AppRole } from '@/types/roles';
import { cn } from '@/lib/utils';

interface Props {
  entries: TimelineEntry[];
}

interface EventDisplay {
  label: string;
  tone: string;
  describe?: (payload: Record<string, unknown> | null) => string | null;
}

const reason = (p: Record<string, unknown> | null) => (typeof p?.reason === 'string' ? p.reason : null);

const EVENTS: Record<string, EventDisplay> = {
  'submission/draft_created':     { label: 'Draft created',                tone: 'bg-slate-300' },
  'submission/created':           { label: 'Submitted to Admin',           tone: 'bg-blue-500' },
  'submission/resubmitted':       { label: 'Re-submitted',                 tone: 'bg-blue-500' },
  'submission/admin_approved':    { label: 'Approved by Admin',            tone: 'bg-amber-500' },
  'submission/finance_approved':  { label: 'Approved by Finance',          tone: 'bg-emerald-500' },
  'submission/returned_to_vendor':{ label: 'Returned to vendor',           tone: 'bg-rose-500',  describe: reason },
  'submission/returned_to_admin': { label: 'Returned to Admin by Finance', tone: 'bg-amber-400', describe: reason },
  'submission/rejected':          { label: 'Rejected',                     tone: 'bg-rose-600',  describe: reason },
  'submission/paid':              { label: 'Marked paid',                  tone: 'bg-blue-600' },
  'submission/disputed':          { label: 'Vendor raised a dispute',      tone: 'bg-rose-600',
                                    describe: (p) => (typeof p?.reasonPreview === 'string' ? p.reasonPreview : null) },
  'payment/receipt_uploaded':     { label: 'Payment receipt attached',     tone: 'bg-blue-400' },
  'gl_coding/updated':            { label: 'GL coding updated',            tone: 'bg-indigo-400' },
  'document/uploaded':            { label: 'Document uploaded',            tone: 'bg-slate-400',
                                    describe: (p) => (typeof p?.docCode === 'string' ? `${p.docCode} v${p.version ?? '?'}` : null) },
};

const ROLE_TONE: Record<AppRole, string> = {
  vendor:  'bg-blue-100 text-blue-800',
  admin:   'bg-amber-100 text-amber-800',
  finance: 'bg-emerald-100 text-emerald-800',
};

export function SubmissionTimeline({ entries }: Props) {
  // Hooks must run unconditionally — derive a "no-op" view when entries is empty.
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  const latest = entries[entries.length - 1];
  const latestCfg = EVENTS[latest.event] ?? { label: latest.event, tone: 'bg-slate-400' };

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between text-left"
          aria-expanded={open}
        >
          <CardTitle className="text-base flex items-center gap-2">
            <span>Timeline</span>
            <span className="text-xs text-muted-foreground font-normal">
              ({entries.length} event{entries.length === 1 ? '' : 's'})
            </span>
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {!open && (
              <span className="hidden sm:inline">
                latest: <span className="font-medium">{latestCfg.label}</span> ·{' '}
                {new Date(latest.createdAt).toLocaleDateString()}
              </span>
            )}
            <span aria-hidden className="inline-block transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
              ▾
            </span>
          </div>
        </button>
      </CardHeader>

      {open && (
        <CardContent>
          <ol className="relative border-l border-muted ml-2 space-y-4">
            {entries.map((e) => {
              const cfg = EVENTS[e.event] ?? { label: e.event, tone: 'bg-slate-400' };
              const note = cfg.describe ? cfg.describe(e.payload) : null;
              return (
                <li key={e.id} className="ml-4">
                  <span
                    className={cn(
                      'absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full ring-2 ring-card',
                      cfg.tone,
                    )}
                    aria-hidden
                  />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{cfg.label}</span>
                      {e.actorName && (
                        <span className="text-xs text-muted-foreground">
                          by {e.actorName}
                        </span>
                      )}
                      {e.actorRole && (
                        <Badge className={cn('text-[10px]', ROLE_TONE[e.actorRole])}>
                          {e.actorRole}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {note && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{note}</p>}
                </li>
              );
            })}
          </ol>
        </CardContent>
      )}
    </Card>
  );
}
