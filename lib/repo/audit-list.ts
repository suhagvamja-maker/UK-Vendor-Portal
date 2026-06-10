import { db } from '@/lib/db/sqlite';

export interface AuditListRow {
  id: string;
  submissionId: string | null;
  invoiceNumber: string | null;
  event: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface RawRow {
  id: string;
  submission_id: string | null;
  invoice_number: string | null;
  event: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  payload_json: string | null;
  created_at: string;
}

export interface AuditFilters {
  event?: string;
  actorId?: string;
  submissionId?: string;
  limit?: number;
}

/**
 * Page-friendly audit log with vendor + actor joined. Most recent first.
 * Filters are exact-match on event / actor / submission.
 */
export function listAudit(filters: AuditFilters = {}): AuditListRow[] {
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.event) {
    conds.push('a.event = ?');
    params.push(filters.event);
  }
  if (filters.actorId) {
    conds.push('a.actor_id = ?');
    params.push(filters.actorId);
  }
  if (filters.submissionId) {
    conds.push('a.submission_id = ?');
    params.push(filters.submissionId);
  }
  const where = conds.length > 0 ? 'where ' + conds.join(' and ') : '';
  const rows = db()
    .prepare(`
      select a.id, a.submission_id, s.invoice_number, a.event,
             a.actor_id, u.name as actor_name, u.role as actor_role,
             a.payload_json, a.created_at
      from audit_log a
      left join submissions s on s.id = a.submission_id
      left join users u on u.id = a.actor_id
      ${where}
      order by a.created_at desc
      limit ?
    `)
    .all(...params, limit) as RawRow[];

  return rows.map((r) => ({
    id: r.id,
    submissionId: r.submission_id,
    invoiceNumber: r.invoice_number,
    event: r.event,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    payload: r.payload_json ? (JSON.parse(r.payload_json) as Record<string, unknown>) : null,
    createdAt: r.created_at,
  }));
}

/** Distinct event names present in the log — used to populate the filter dropdown. */
export function distinctEvents(): string[] {
  const rows = db()
    .prepare('select distinct event from audit_log order by event asc')
    .all() as Array<{ event: string }>;
  return rows.map((r) => r.event);
}
