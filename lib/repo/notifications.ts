import { db } from '@/lib/db/sqlite';

export interface NotificationRow {
  id: string;
  eventId: string;
  recipientId: string;
  submissionId: string | null;
  channel: 'email' | 'in_app';
  subject: string | null;
  body: string | null;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface NotifRaw {
  id: string;
  event_id: string;
  recipient_id: string;
  submission_id: string | null;
  channel: 'email' | 'in_app';
  subject: string | null;
  body: string | null;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

const toRow = (r: NotifRaw): NotificationRow => ({
  id: r.id,
  eventId: r.event_id,
  recipientId: r.recipient_id,
  submissionId: r.submission_id,
  channel: r.channel,
  subject: r.subject,
  body: r.body,
  readAt: r.read_at,
  sentAt: r.sent_at,
  createdAt: r.created_at,
});

/**
 * Insert a notification. Idempotent via the (event_id, recipient_id, channel)
 * unique constraint — duplicate inserts are silently ignored. Returns true
 * iff a new row was actually created.
 */
export function insertNotification(args: {
  eventId: string;
  recipientId: string;
  submissionId: string | null;
  channel: 'email' | 'in_app';
  subject: string;
  body: string;
}): boolean {
  const now = new Date().toISOString();
  const result = db()
    .prepare(`
      insert or ignore into notifications
        (id, event_id, recipient_id, submission_id, channel, subject, body, sent_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      crypto.randomUUID(),
      args.eventId,
      args.recipientId,
      args.submissionId,
      args.channel,
      args.subject,
      args.body,
      now,
    );
  return result.changes === 1;
}

export function listNotificationsForUser(userId: string, limit = 50): NotificationRow[] {
  const rows = db()
    .prepare(`
      select * from notifications
      where recipient_id = ? and channel = 'in_app'
      order by created_at desc
      limit ?
    `)
    .all(userId, limit) as NotifRaw[];
  return rows.map(toRow);
}

export function countUnreadForUser(userId: string): number {
  const r = db()
    .prepare(`
      select count(*) as n from notifications
      where recipient_id = ? and channel = 'in_app' and read_at is null
    `)
    .get(userId) as { n: number };
  return r.n;
}

export function markAllReadForUser(userId: string): number {
  const result = db()
    .prepare(`
      update notifications set read_at = ?
      where recipient_id = ? and channel = 'in_app' and read_at is null
    `)
    .run(new Date().toISOString(), userId);
  return result.changes;
}

export function markOneRead(userId: string, notificationId: string): boolean {
  const result = db()
    .prepare(`
      update notifications set read_at = coalesce(read_at, ?)
      where id = ? and recipient_id = ?
    `)
    .run(new Date().toISOString(), notificationId, userId);
  return result.changes > 0;
}
