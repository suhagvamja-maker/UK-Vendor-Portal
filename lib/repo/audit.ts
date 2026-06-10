import { db } from '@/lib/db/sqlite';

export interface AuditEntry {
  id: string;
  submissionId: string | null;
  actorId: string | null;
  event: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditRow {
  id: string;
  submission_id: string | null;
  actor_id: string | null;
  event: string;
  payload_json: string | null;
  created_at: string;
}

export function appendAudit(input: {
  submissionId: string | null;
  actorId: string | null;
  event: string;
  payload?: Record<string, unknown>;
}) {
  db()
    .prepare(`
      insert into audit_log (id, submission_id, actor_id, event, payload_json)
      values (?, ?, ?, ?, ?)
    `)
    .run(
      crypto.randomUUID(),
      input.submissionId,
      input.actorId,
      input.event,
      input.payload ? JSON.stringify(input.payload) : null,
    );
}

export function listAuditForSubmission(submissionId: string): AuditEntry[] {
  const rows = db()
    .prepare('select * from audit_log where submission_id = ? order by created_at asc')
    .all(submissionId) as AuditRow[];
  return rows.map((r) => ({
    id: r.id,
    submissionId: r.submission_id,
    actorId: r.actor_id,
    event: r.event,
    payload: r.payload_json ? (JSON.parse(r.payload_json) as Record<string, unknown>) : null,
    createdAt: r.created_at,
  }));
}
