import Link from 'next/link';
import { requireRole } from '@/lib/auth/require';
import { findOrCreateVendor } from '@/lib/repo/vendors';
import { listAllInvoices } from '@/lib/repo/submissions-queue';
import { countSubmissionsByStatus } from '@/lib/repo/invoice-counts';
import { checkProfileCompleteness } from '@/lib/expiry/fy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { InvoicesTable } from '@/components/shared/invoices-table';
import { StatusTabs } from '@/components/shared/status-tabs';
import type { SubmissionStatus } from '@/types/submission';
import { cn } from '@/lib/utils';

const TAB_FILTERS: Record<string, SubmissionStatus[] | null> = {
  active:  ['draft', 'pending_admin', 'pending_finance', 'returned_to_vendor', 'returned_to_admin', 'approved'],
  paid:    ['paid'],
  rejected:['rejected'],
  all:     null,
};

export default async function VendorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ profileSaved?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireRole('vendor');
  const vendor = findOrCreateVendor(user.appUserId);
  const profile = checkProfileCompleteness(vendor.id, vendor.vendorType);

  const allRows = listAllInvoices({ vendorId: vendor.id });
  const counts = countSubmissionsByStatus(vendor.id);
  // Anything currently active in the workflow, OR anything with an open
  // dispute (even on a paid invoice), counts as "needs attention" and shows
  // in the Active tab.
  const isActive = (r: { status: typeof allRows[number]['status']; hasOpenDispute: boolean }) =>
    TAB_FILTERS.active!.includes(r.status) || r.hasOpenDispute;
  const activeCount = allRows.filter(isActive).length;

  const tab = sp.tab ?? 'active';
  const filter = TAB_FILTERS[tab];
  const rows =
    tab === 'active'
      ? allRows.filter(isActive)
      : filter === undefined || filter === null
        ? allRows
        : allRows.filter((r) => filter.includes(r.status));

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My submissions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {allRows.length === 0
              ? 'You have not raised any invoices yet.'
              : `${allRows.length} invoice${allRows.length === 1 ? '' : 's'} on record.`}
          </p>
        </div>
        <Link
          href="/vendor/submissions/new"
          className={cn(buttonVariants(), !profile.complete && 'opacity-50 pointer-events-none')}
          aria-disabled={!profile.complete}
        >
          New submission
        </Link>
      </header>

      {sp.profileSaved === '1' && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Profile saved.
        </p>
      )}

      {!profile.complete && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-900">
              Your profile is not complete for FY {profile.fy.label}
            </CardTitle>
            <CardDescription className="text-amber-900">
              You can&apos;t raise invoices until these are addressed:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="text-sm space-y-1 text-amber-900">
              {profile.missing.map((m) => (
                <li key={m.docCode} className="flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>{m.displayName}</span>
                  <span className="text-xs opacity-70">
                    {m.reason === 'missing' && '— not uploaded'}
                    {m.reason === 'expired' && '— expired'}
                    {m.reason === 'stale' && '— uploaded before this FY'}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/vendor/profile" className={buttonVariants({ size: 'sm' })}>
              Go to profile
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <StatusTabs
          tabs={[
            { key: 'active',   label: 'Active',   count: activeCount },
            { key: 'paid',     label: 'Paid',     count: counts.paid },
            { key: 'rejected', label: 'Rejected', count: counts.rejected },
            { key: 'all',      label: 'All',      count: allRows.length },
          ]}
        />
        {allRows.length === 0 && profile.complete ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <p className="text-base font-medium">No invoices yet</p>
              <p className="text-sm text-muted-foreground">
                Raise your first invoice once you&apos;re ready — your profile is good to go.
              </p>
              <Link
                href="/vendor/submissions/new"
                className={buttonVariants({ size: 'sm' })}
              >
                Create your first submission →
              </Link>
            </CardContent>
          </Card>
        ) : (
          <InvoicesTable rows={rows} linkBase="/vendor/submissions" showVendor={false} />
        )}
      </div>
    </div>
  );
}
