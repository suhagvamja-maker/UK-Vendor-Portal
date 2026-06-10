import { db } from '@/lib/db/sqlite';
import { SLA_DAYS } from '@/lib/sla';
import type { SubmissionStatus } from '@/types/submission';

/**
 * Aggregate queries for the Finance reports dashboard.
 *
 * Kept intentionally simple: counts and averages over recent windows.
 * Real BI tooling (Metabase / Lightdash) lives downstream — we feed it
 * via the CSV export, not by reimplementing it here.
 */

export interface StatusCount {
  status: SubmissionStatus;
  count: number;
}

export function countByStatus(): StatusCount[] {
  const rows = db()
    .prepare(`select status, count(*) as c from submissions group by status order by status asc`)
    .all() as Array<{ status: SubmissionStatus; c: number }>;
  return rows.map((r) => ({ status: r.status, count: r.c }));
}

export interface ThroughputBucket {
  period: string; // ISO date (Monday of the week)
  created: number;
  paid: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** UTC Monday for the week containing the given date. */
function mondayOf(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sun
  const offsetToMonday = (day + 6) % 7;
  return new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offsetToMonday,
  ));
}

/**
 * Weekly buckets for the last `weeks` weeks. Keyed by the Monday (UTC) date.
 * We pull recent rows and bucket in JS — easier to reason about than
 * SQLite's `weekday` modifier, and 12 weeks of data is trivially small.
 */
export function throughputByWeek(weeks = 12): ThroughputBucket[] {
  const thisMonday = mondayOf(new Date());
  const start = new Date(thisMonday.getTime() - (weeks - 1) * 7 * MS_PER_DAY);
  const startIso = start.toISOString();

  const rows = db()
    .prepare(`
      select created_at, paid_at
      from submissions
      where created_at >= ? or (paid_at is not null and paid_at >= ?)
    `)
    .all(startIso, startIso) as Array<{ created_at: string; paid_at: string | null }>;

  const buckets = new Map<string, ThroughputBucket>();
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start.getTime() + i * 7 * MS_PER_DAY);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { period: key, created: 0, paid: 0 });
  }

  for (const r of rows) {
    const createdAt = new Date(r.created_at);
    if (createdAt >= start) {
      const key = mondayOf(createdAt).toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (b) b.created++;
    }
    if (r.paid_at) {
      const paidAt = new Date(r.paid_at);
      if (paidAt >= start) {
        const key = mondayOf(paidAt).toISOString().slice(0, 10);
        const b = buckets.get(key);
        if (b) b.paid++;
      }
    }
  }
  return Array.from(buckets.values());
}

export interface CycleTimes {
  /** Median days between submitted_at and approved_at (admin → finance approved). */
  submittedToApprovedDays: number | null;
  approvedToPaidDays: number | null;
  submittedToPaidDays: number | null;
  paidCount: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function cycleTimes(): CycleTimes {
  const rows = db()
    .prepare(`
      select submitted_at, approved_at, paid_at
      from submissions
      where status = 'paid' and submitted_at is not null and paid_at is not null
    `)
    .all() as Array<{ submitted_at: string; approved_at: string | null; paid_at: string }>;

  const sa: number[] = [];
  const ap: number[] = [];
  const sp: number[] = [];
  for (const r of rows) {
    const submitted = new Date(r.submitted_at).getTime();
    const paid = new Date(r.paid_at).getTime();
    sp.push((paid - submitted) / MS_PER_DAY);
    if (r.approved_at) {
      const approved = new Date(r.approved_at).getTime();
      sa.push((approved - submitted) / MS_PER_DAY);
      ap.push((paid - approved) / MS_PER_DAY);
    }
  }
  const round = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    submittedToApprovedDays: round(median(sa)),
    approvedToPaidDays: round(median(ap)),
    submittedToPaidDays: round(median(sp)),
    paidCount: rows.length,
  };
}

export interface AgingBucket {
  label: string;
  /** Lower bound inclusive, upper bound exclusive. Last bucket has no upper. */
  fromDays: number;
  toDays: number | null;
  /** Number of submissions falling in this bucket. */
  count: number;
  /** Sum of amount in original currency (best-effort, mixed currencies). */
  amount: Record<string, number>;
}

export interface AgingReport {
  scope: 'pending_admin' | 'pending_finance' | 'approved';
  buckets: AgingBucket[];
}

/**
 * Aging analysis bucketed by days since the row entered its current status.
 * Three scopes are reported because each tells a different operational story:
 *   - pending_admin: how long admin has been sitting on review
 *   - pending_finance: how long finance has been sitting on review
 *   - approved: how long approved invoices have been awaiting payment
 */
export function agingReport(): AgingReport[] {
  const ranges: Array<{ label: string; fromDays: number; toDays: number | null }> = [
    { label: '0–7 days',    fromDays: 0,  toDays: 7 },
    { label: '8–30 days',   fromDays: 8,  toDays: 30 },
    { label: '31–60 days',  fromDays: 31, toDays: 60 },
    { label: '61–90 days',  fromDays: 61, toDays: 90 },
    { label: '90+ days',    fromDays: 91, toDays: null },
  ];

  const buildScope = (scope: AgingReport['scope']): AgingReport => {
    const baselineField = scope === 'pending_admin'
      ? 'submitted_at'
      : 'updated_at'; // for pending_finance / approved we use the latest transition timestamp
    const statusFilter = scope === 'approved' ? "status = 'approved'" : `status = '${scope}'`;
    const rows = db()
      .prepare(`
        select amount, currency, ${baselineField} as baseline
        from submissions
        where ${statusFilter} and ${baselineField} is not null
      `)
      .all() as Array<{ amount: number; currency: string; baseline: string }>;

    const now = Date.now();
    const buckets: AgingBucket[] = ranges.map((r) => ({
      label: r.label, fromDays: r.fromDays, toDays: r.toDays, count: 0, amount: {},
    }));

    for (const row of rows) {
      const days = Math.max(0, Math.floor((now - new Date(row.baseline).getTime()) / MS_PER_DAY));
      const b = buckets.find((b) =>
        days >= b.fromDays && (b.toDays === null || days <= b.toDays),
      );
      if (b) {
        b.count++;
        b.amount[row.currency] = (b.amount[row.currency] ?? 0) + row.amount;
      }
    }
    return { scope, buckets };
  };

  return [buildScope('pending_admin'), buildScope('pending_finance'), buildScope('approved')];
}

export interface SlaBreach {
  scope: 'admin' | 'finance';
  /** Submissions currently sitting past SLA in the relevant pending status. */
  currentlyBreached: number;
  /** Submissions that have ever spent longer than SLA in this stage (historical). */
  everBreached: number;
}

/**
 * Currently-breached: in pending_admin (or returned_to_admin) for > admin SLA,
 * or in pending_finance for > finance SLA.
 *
 * Ever-breached: estimated from audit_log durations between the entering and
 * exiting events of each pending stage.
 */
export function slaBreaches(): SlaBreach[] {
  const adminSlaMs = SLA_DAYS.admin * MS_PER_DAY;
  const financeSlaMs = SLA_DAYS.finance * MS_PER_DAY;
  const now = Date.now();

  const currentAdmin = (db()
    .prepare(`
      select count(*) as c from submissions
      where status in ('pending_admin','returned_to_admin')
        and ? - strftime('%s', coalesce(submitted_at, updated_at)) * 1000 > ?
    `)
    .get(now, adminSlaMs) as { c: number }).c;

  const currentFinance = (db()
    .prepare(`
      select count(*) as c from submissions
      where status = 'pending_finance'
        and ? - strftime('%s', updated_at) * 1000 > ?
    `)
    .get(now, financeSlaMs) as { c: number }).c;

  // Historical breach detection via audit_log spans is approximate;
  // for v1 we just sum recent transitions where the dwell time exceeded SLA.
  // Calculated client-side from a flat audit dump to avoid SQLite gymnastics.
  const auditRows = db()
    .prepare(`
      select submission_id, event, created_at
      from audit_log
      where event in (
        'submission/created','submission/resubmitted','submission/admin_approved',
        'submission/finance_approved','submission/returned_to_vendor',
        'submission/returned_to_admin','submission/rejected'
      )
      order by submission_id, created_at asc
    `)
    .all() as Array<{ submission_id: string; event: string; created_at: string }>;

  let everAdmin = 0;
  let everFinance = 0;
  const byId = new Map<string, typeof auditRows>();
  for (const r of auditRows) {
    if (!byId.has(r.submission_id)) byId.set(r.submission_id, []);
    byId.get(r.submission_id)!.push(r);
  }
  for (const events of byId.values()) {
    for (let i = 0; i < events.length - 1; i++) {
      const a = events[i];
      const b = events[i + 1];
      const dwellMs = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      const enteredAdmin =
        a.event === 'submission/created' || a.event === 'submission/resubmitted';
      const enteredFinance = a.event === 'submission/admin_approved';
      if (enteredAdmin && dwellMs > adminSlaMs) everAdmin++;
      if (enteredFinance && dwellMs > financeSlaMs) everFinance++;
    }
  }

  return [
    { scope: 'admin', currentlyBreached: currentAdmin, everBreached: everAdmin },
    { scope: 'finance', currentlyBreached: currentFinance, everBreached: everFinance },
  ];
}
