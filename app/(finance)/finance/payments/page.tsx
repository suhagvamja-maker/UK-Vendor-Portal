import { requireRole } from '@/lib/auth/require';
import { listQueueByStatus } from '@/lib/repo/submissions-queue';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QueueSearch } from '@/components/shared/queue-search';
import { PaymentsTable } from './payments-table';

export default async function FinancePaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>;
}) {
  await requireRole('finance');
  const sp = await searchParams;
  const rows = listQueueByStatus(['approved'], { q: sp.q, from: sp.from, to: sp.to });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? 'Nothing awaiting payment right now.'
            : `${rows.length} approved submission${rows.length === 1 ? '' : 's'} ready for payout.`}
        </p>
      </header>

      <Card>
        <CardContent>
          <QueueSearch />
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to pay</CardTitle>
            <CardDescription>Once you approve a submission it appears here.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <PaymentsTable rows={rows} />
      )}
    </div>
  );
}
