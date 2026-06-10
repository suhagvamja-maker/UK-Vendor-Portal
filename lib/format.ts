import type { Currency, SubmissionStatus } from '@/types/submission';

export function formatMoney(amount: number, currency: Currency) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

export function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Human-friendly relative time for timestamps less than ~24h old, falling back
 * to a full datetime for older entries. Used in comment threads where "3h ago"
 * reads better than the ISO string. Computed at render time — re-renders pick
 * up the new label naturally.
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return d.toLocaleString();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 30) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  // > 24h: full timestamp (no "Xd ago" — full date is more useful then).
  return d.toLocaleString();
}

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  draft: 'Draft',
  pending_admin: 'With Admin',
  pending_finance: 'With Finance',
  returned_to_vendor: 'Action required',
  returned_to_admin: '↩ Admin',
  approved: 'Approved',
  paid: 'Paid',
  rejected: 'Rejected',
};

export const STATUS_TONE: Record<SubmissionStatus, string> = {
  draft:               'bg-slate-200 text-slate-700',
  pending_admin:       'bg-amber-100 text-amber-800',
  pending_finance:     'bg-emerald-100 text-emerald-800',
  returned_to_vendor:  'bg-rose-100 text-rose-800',
  returned_to_admin:   'bg-orange-50 text-orange-800 border border-orange-200',
  approved:            'bg-emerald-200 text-emerald-900',
  paid:                'bg-blue-200 text-blue-900',
  rejected:            'bg-slate-300 text-slate-800',
};
