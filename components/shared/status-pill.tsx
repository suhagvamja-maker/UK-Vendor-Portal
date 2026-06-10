import type { SubmissionStatus } from '@/types/submission';
import { cn } from '@/lib/utils';

const TONE: Record<SubmissionStatus, string> = {
  draft:               'bg-slate-100 text-slate-700 ring-slate-200',
  pending_admin:       'bg-amber-50 text-amber-800 ring-amber-200',
  pending_finance:     'bg-emerald-50 text-emerald-800 ring-emerald-200',
  returned_to_vendor:  'bg-rose-50 text-rose-800 ring-rose-200',
  // Orange (not amber) to read as "bounced back" not "in queue".
  returned_to_admin:   'bg-orange-50 text-orange-800 ring-orange-300',
  approved:            'bg-blue-50 text-blue-800 ring-blue-200',
  paid:                'bg-violet-50 text-violet-800 ring-violet-200',
  rejected:            'bg-zinc-100 text-zinc-700 ring-zinc-300',
};

const LABEL: Record<SubmissionStatus, string> = {
  draft: 'Draft',
  pending_admin: 'With Admin',
  pending_finance: 'With Finance',
  returned_to_vendor: 'Action required',
  // Leading arrow makes the "bounced back" semantic visible without needing
  // a separate badge — `← Admin` reads at a glance.
  returned_to_admin: '↩ Admin',
  approved: 'Approved',
  paid: 'Paid',
  rejected: 'Rejected',
};

/**
 * Branded status pill. Uses a thin colored ring instead of solid borders so the
 * eye reads the status colour at a glance without visual noise.
 *
 * Distinguishes:
 *   - `pending_admin`    — amber dot, label "With Admin"        (in queue)
 *   - `returned_to_admin` — orange dot, label "↩ Admin"          (bounced back)
 *   - `returned_to_vendor` — rose dot, label "Action required"   (bounced back to vendor)
 */
export function StatusPill({ status }: { status: SubmissionStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        TONE[status],
      )}
      title={DESCRIPTION[status]}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dotColor(status))} aria-hidden />
      {LABEL[status]}
    </span>
  );
}

const DESCRIPTION: Record<SubmissionStatus, string> = {
  draft: 'Draft — not yet submitted',
  pending_admin: 'Sitting in the Admin review queue',
  pending_finance: 'Approved by Admin — Finance is reviewing',
  returned_to_vendor: 'Sent back to the vendor for changes',
  returned_to_admin: 'Finance bounced this back to Admin for re-review',
  approved: 'Fully approved — awaiting payment',
  paid: 'Payment processed',
  rejected: 'Rejected — terminal',
};

function dotColor(status: SubmissionStatus): string {
  switch (status) {
    case 'pending_admin':
      return 'bg-amber-500';
    case 'returned_to_admin':
      return 'bg-orange-500';
    case 'pending_finance':
      return 'bg-emerald-500';
    case 'approved':
      return 'bg-blue-500';
    case 'paid':
      return 'bg-violet-500';
    case 'returned_to_vendor':
      return 'bg-rose-500';
    case 'rejected':
      return 'bg-zinc-500';
    default:
      return 'bg-slate-400';
  }
}
