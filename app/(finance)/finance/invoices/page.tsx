import { requireRole } from '@/lib/auth/require';
import { listAllInvoices } from '@/lib/repo/submissions-queue';
import { countSubmissionsByStatus } from '@/lib/repo/invoice-counts';
import { QueueSearch } from '@/components/shared/queue-search';
import { StatusTabs } from '@/components/shared/status-tabs';
import { InvoicesTable } from '@/components/shared/invoices-table';
import type { SubmissionStatus } from '@/types/submission';

const TAB_FILTERS: Record<string, SubmissionStatus[] | null> = {
  active:  ['pending_finance', 'pending_admin', 'returned_to_admin', 'returned_to_vendor', 'approved'],
  paid:    ['paid'],
  rejected:['rejected'],
  all:     null,
};

export default async function FinanceInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; from?: string; to?: string }>;
}) {
  await requireRole('finance');
  const sp = await searchParams;
  const tab = sp.tab ?? 'active';

  const all = listAllInvoices({ q: sp.q, from: sp.from, to: sp.to });

  // Active = currently moving through the workflow OR has an open dispute.
  const isActive = (r: typeof all[number]) =>
    TAB_FILTERS.active!.includes(r.status) || r.hasOpenDispute;

  const filter = TAB_FILTERS[tab];
  const rows =
    tab === 'active'
      ? all.filter(isActive)
      : filter === null || filter === undefined
        ? all
        : all.filter((r) => filter.includes(r.status));

  const counts = countSubmissionsByStatus();
  const activeCount = all.filter(isActive).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Every submission across the system. Switch tabs to filter.
        </p>
      </header>

      <div className="space-y-4">
        <QueueSearch />
        <StatusTabs
          tabs={[
            { key: 'active',   label: 'Active',   count: activeCount },
            { key: 'paid',     label: 'Paid',     count: counts.paid },
            { key: 'rejected', label: 'Rejected', count: counts.rejected },
            { key: 'all',      label: 'All',      count: all.length },
          ]}
        />
        <InvoicesTable rows={rows} linkBase="/finance/submissions" />
      </div>
    </div>
  );
}
