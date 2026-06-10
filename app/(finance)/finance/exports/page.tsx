import { requireRole } from '@/lib/auth/require';
import { listExportRows, type ExportFilters as ExportFilterModel } from '@/lib/repo/exports';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExportFilters } from './filters';

const DEFAULT_STATUSES = ['paid'] as const;

export default async function FinanceExportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string | string[]; dateField?: string }>;
}) {
  await requireRole('finance');
  const p = await searchParams;

  const statusList = (Array.isArray(p.status) ? p.status : p.status ? [p.status] : Array.from(DEFAULT_STATUSES)) as ExportFilterModel['status'];
  const preview = listExportRows({
    from: p.from || undefined,
    to: p.to || undefined,
    status: statusList,
    dateField: (p.dateField as 'paid_at' | 'submitted_at' | 'approved_at' | undefined) ?? 'paid_at',
  }).slice(0, 5);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Accounting export</h1>
        <p className="text-sm text-muted-foreground">
          Download a CSV of submissions for upload into Tally / Zoho / QuickBooks. Defaults
          to <code>paid</code> submissions, filtered by paid date.
        </p>
      </header>

      <ExportFilters
        defaults={{
          from: p.from ?? '',
          to: p.to ?? '',
          status: statusList ?? [],
          dateField: (p.dateField ?? 'paid_at') as 'paid_at' | 'submitted_at' | 'approved_at',
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
          <CardDescription>
            First 5 rows that will be exported with the current filters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {preview.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matching submissions. Adjust your filters above.
            </p>
          ) : (
            <pre className="text-xs whitespace-pre-wrap overflow-x-auto bg-muted/30 p-3 rounded">
              {preview
                .map(
                  (r) =>
                    `${r.invoiceNumber} · ${r.vendorCompanyName ?? '—'} · ${r.amount} ${r.currency} · ${r.status} · paid ${r.paidAt ?? '—'}`,
                )
                .join('\n')}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
