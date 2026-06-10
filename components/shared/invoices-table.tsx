import Link from 'next/link';
import type { QueueRow } from '@/lib/repo/submissions-queue';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill } from '@/components/shared/status-pill';
import { DisputeBadge } from '@/components/shared/dispute-badge';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  rows: QueueRow[];
  /** Module the row links into for full detail. */
  linkBase: '/admin/submissions' | '/finance/submissions' | '/vendor/submissions';
  /** When true, show vendor column. False for vendor's own list. */
  showVendor?: boolean;
}

export function InvoicesTable({ rows, linkBase, showVendor = true }: Props) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-base font-medium text-muted-foreground">No invoices to show</p>
          <p className="text-xs text-muted-foreground mt-1">
            Try clearing your filters or switching to another status tab.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {showVendor && <TableHead>Vendor</TableHead>}
              <TableHead>Invoice</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className={cn(
                  r.status === 'paid' && !r.hasOpenDispute && 'opacity-90',
                  // Slightly stronger tint than before — the dispute row
                  // should jump out above paid/approved peers without
                  // overwhelming the table.
                  r.hasOpenDispute && 'bg-rose-50 hover:bg-rose-100/70',
                )}
              >
                {showVendor && (
                  <TableCell className="font-medium">
                    <div>{r.vendorCompanyName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.vendorCountry} · {r.vendorType}
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`${linkBase}/${r.id}`} className="font-mono text-sm hover:underline">
                    {r.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatMoney(r.amount, r.currency)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusPill status={r.status} />
                    {r.hasOpenDispute && <DisputeBadge />}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(r.submittedAt ?? r.updatedAt)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`${linkBase}/${r.id}`}
                    className="text-xs text-primary hover:underline whitespace-nowrap"
                  >
                    Open →
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
