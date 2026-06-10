import { requireRole } from '@/lib/auth/require';
import {
  agingReport,
  countByStatus,
  cycleTimes,
  slaBreaches,
  throughputByWeek,
} from '@/lib/repo/reports';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SLA_DAYS } from '@/lib/sla';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/format';
import { cn } from '@/lib/utils';

export default async function FinanceReportsPage() {
  await requireRole('finance');

  const status = countByStatus();
  const throughput = throughputByWeek(12);
  const cycle = cycleTimes();
  const aging = agingReport();
  const breaches = slaBreaches();

  const maxBar = Math.max(1, ...throughput.flatMap((b) => [b.created, b.paid]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot metrics. For richer BI, download the CSV from Exports and feed it into
          your warehouse / spreadsheet of choice.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open inventory</CardTitle>
            <CardDescription>How many submissions sit in each status today.</CardDescription>
          </CardHeader>
          <CardContent>
            {status.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {status.map((s) => (
                  <li key={s.status} className="flex items-center justify-between text-sm">
                    <Badge className={cn('text-xs', STATUS_TONE[s.status])}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                    <span className="font-mono">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cycle time (median)</CardTitle>
            <CardDescription>
              Calculated over <span className="font-mono">{cycle.paidCount}</span> paid submission{cycle.paidCount === 1 ? '' : 's'}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 text-sm">
              <StatRow label="Submitted → Approved" value={cycle.submittedToApprovedDays} />
              <StatRow label="Approved → Paid" value={cycle.approvedToPaidDays} />
              <StatRow label="Submitted → Paid" value={cycle.submittedToPaidDays} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aging</CardTitle>
          <CardDescription>
            How long submissions have been sitting in each non-terminal status. The
            &quot;approved&quot; column is the most operationally important — it shows
            invoices already approved but not yet paid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bucket</TableHead>
                <TableHead>Pending Admin</TableHead>
                <TableHead>Pending Finance</TableHead>
                <TableHead>Approved (awaiting payment)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aging[0].buckets.map((_, idx) => {
                const a = aging[0].buckets[idx];
                const f = aging[1].buckets[idx];
                const ap = aging[2].buckets[idx];
                const tone = a.label === '90+ days' ? 'bg-rose-100 text-rose-800'
                          : a.label === '61–90 days' ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700';
                return (
                  <TableRow key={a.label}>
                    <TableCell>
                      <Badge className={cn('text-xs', tone)}>{a.label}</Badge>
                    </TableCell>
                    <AgingCell count={a.count} amounts={a.amount} />
                    <AgingCell count={f.count} amounts={f.amount} />
                    <AgingCell count={ap.count} amounts={ap.amount} />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SLA breaches</CardTitle>
          <CardDescription>
            Admin target {SLA_DAYS.admin}d · Finance target {SLA_DAYS.finance}d
            (placeholders pending product decision — CLAUDE.md §15).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Currently overdue</TableHead>
                <TableHead>Ever breached (historical)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breaches.map((b) => (
                <TableRow key={b.scope}>
                  <TableCell className="capitalize">{b.scope}</TableCell>
                  <TableCell>
                    <Badge className={cn('text-xs', b.currentlyBreached > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800')}>
                      {b.currentlyBreached}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{b.everBreached}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly throughput</CardTitle>
          <CardDescription>Last 12 weeks. Bars are relative to the busiest week.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {throughput.map((b) => (
              <li key={b.period} className="grid grid-cols-[120px_1fr_auto] gap-3 items-center text-xs">
                <span className="text-muted-foreground">{b.period}</span>
                <div className="flex gap-1 items-center">
                  <Bar value={b.created} max={maxBar} color="bg-blue-500" />
                  <Bar value={b.paid} max={maxBar} color="bg-emerald-500" />
                </div>
                <span className="font-mono text-muted-foreground">
                  {b.created} new · {b.paid} paid
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-3 text-xs mt-3 text-muted-foreground">
            <span><span className="inline-block w-2 h-2 bg-blue-500 rounded-sm mr-1" />Created</span>
            <span><span className="inline-block w-2 h-2 bg-emerald-500 rounded-sm mr-1" />Paid</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgingCell({ count, amounts }: { count: number; amounts: Record<string, number> }) {
  if (count === 0) return <TableCell className="text-muted-foreground">—</TableCell>;
  const totals = Object.entries(amounts).map(([cur, amt]) => `${cur} ${amt.toFixed(2)}`).join(' · ');
  return (
    <TableCell>
      <div className="text-sm font-medium">{count}</div>
      <div className="text-[10px] text-muted-foreground">{totals}</div>
    </TableCell>
  );
}

function StatRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value === null ? '—' : `${value}d`}</dd>
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = `${Math.round((value / max) * 100)}%`;
  return (
    <div className="flex-1 bg-muted rounded overflow-hidden h-3">
      <div className={cn('h-full', color)} style={{ width: value === 0 ? '0%' : width }} />
    </div>
  );
}
