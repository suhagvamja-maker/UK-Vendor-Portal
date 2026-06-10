import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require';
import { listExportRows, type ExportFilters } from '@/lib/repo/exports';
import { appendAudit } from '@/lib/repo/audit';
import { toCsv } from '@/lib/csv';
import type { SubmissionStatus } from '@/types/submission';

const VALID_STATUSES: SubmissionStatus[] = [
  'draft', 'pending_admin', 'pending_finance',
  'returned_to_vendor', 'returned_to_admin',
  'approved', 'paid', 'rejected',
];
const VALID_DATE_FIELDS = ['submitted_at', 'approved_at', 'paid_at'] as const;

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireRole('finance');
  } catch {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;
  const statusParam = url.searchParams.getAll('status');
  const dateFieldParam = url.searchParams.get('dateField') ?? 'paid_at';

  const filters: ExportFilters = {};
  if (from) filters.from = from;
  if (to) filters.to = to;
  if (statusParam.length > 0) {
    const filtered = statusParam.filter((s): s is SubmissionStatus =>
      (VALID_STATUSES as string[]).includes(s),
    );
    if (filtered.length > 0) filters.status = filtered;
  }
  if ((VALID_DATE_FIELDS as readonly string[]).includes(dateFieldParam)) {
    filters.dateField = dateFieldParam as ExportFilters['dateField'];
  }

  const rows = listExportRows(filters);
  const csv = toCsv(rows, [
    { key: 'invoiceNumber',     header: 'Invoice number' },
    { key: 'poNumber',          header: 'PO number' },
    { key: 'vendorCompanyName', header: 'Vendor' },
    { key: 'vendorCountry',     header: 'Country' },
    { key: 'vendorType',        header: 'Vendor type' },
    { key: 'taxId',             header: 'Tax ID' },
    { key: 'vatNumber',         header: 'VAT number' },
    { key: 'amount',            header: 'Amount' },
    { key: 'currency',          header: 'Currency' },
    { key: 'status',            header: 'Status' },
    { key: 'glAccountCode',     header: 'GL account' },
    { key: 'glCostCenter',      header: 'Cost center' },
    { key: 'glNotes',           header: 'GL notes' },
    { key: 'submittedAt',       header: 'Submitted at' },
    { key: 'approvedAt',        header: 'Approved at' },
    { key: 'paidAt',            header: 'Paid at' },
  ]);

  appendAudit({
    submissionId: null,
    actorId: user.appUserId,
    event: 'export/csv_downloaded',
    payload: { rowCount: rows.length, filters: filters as Record<string, unknown> },
  });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="submissions-${today}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
