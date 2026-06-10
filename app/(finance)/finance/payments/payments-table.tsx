import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { QueueRow } from '@/lib/repo/submissions-queue';
import { formatDate, formatMoney } from '@/lib/format';

/**
 * Approved-but-not-paid list. Each row links to the submission review screen
 * where Finance uploads a transaction PDF and marks paid (per-submission, no
 * bulk path — the receipt requirement is mandatory).
 */
export function PaymentsTable({ rows }: { rows: QueueRow[] }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Open each submission to upload its transaction PDF and mark paid.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <div>{r.vendorCompanyName ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{r.vendorCountry} · {r.vendorType}</div>
                </TableCell>
                <TableCell>
                  <Link href={`/finance/submissions/${r.id}`} className="hover:underline">
                    {r.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell>{formatMoney(r.amount, r.currency)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(r.updatedAt)}</TableCell>
                <TableCell>
                  <Link
                    href={`/finance/submissions/${r.id}`}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Mark paid →
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
