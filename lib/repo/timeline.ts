import { db } from '@/lib/db/sqlite';
import type { AppRole } from '@/types/roles';

export interface TimelineEntry {
  id: string;
  event: string;
  actorName: string | null;
  actorRole: AppRole | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface RawRow {
  id: string;
  event: string;
  actor_name: string | null;
  actor_role: AppRole | null;
  payload_json: string | null;
  created_at: string;
}

/**
 * Events surfaced on the per-role timeline. The vendor list excludes any
 * internal-only event (e.g. Finance → Admin returns, GL coding updates).
 * Admin/Finance see everything except low-signal noise (audit-only events
 * with no narrative value are dropped here).
 */
const VENDOR_VISIBLE = new Set<string>([
  'submission/draft_created',
  'submission/created',
  'submission/resubmitted',
  'submission/admin_approved',
  'submission/finance_approved',
  'submission/returned_to_vendor',
  'submission/rejected',
  'submission/paid',
  'submission/disputed',
  'payment/receipt_uploaded',
]);

const INTERNAL_DISPLAY = new Set<string>([
  ...VENDOR_VISIBLE,
  'submission/returned_to_admin',
  'gl_coding/updated',
  'document/uploaded',
]);

export function listTimelineFor(submissionId: string, viewerRole: AppRole): TimelineEntry[] {
  const rows = db()
    .prepare(`
      select a.id, a.event, u.name as actor_name, u.role as actor_role,
             a.payload_json, a.created_at
      from audit_log a
      left join users u on u.id = a.actor_id
      where a.submission_id = ?
      order by a.created_at asc
    `)
    .all(submissionId) as RawRow[];

  const allow = viewerRole === 'vendor' ? VENDOR_VISIBLE : INTERNAL_DISPLAY;

  return rows
    .filter((r) => allow.has(r.event))
    .map((r) => ({
      id: r.id,
      event: r.event,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      payload: r.payload_json ? (JSON.parse(r.payload_json) as Record<string, unknown>) : null,
      createdAt: r.created_at,
    }));
}
