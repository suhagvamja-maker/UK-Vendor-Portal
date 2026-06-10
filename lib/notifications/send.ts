import { env } from '@/lib/env';
import { insertNotification } from '@/lib/repo/notifications';
import type { Recipient } from './recipients';

interface DeliverArgs {
  /** Idempotency key — `${event}:${submissionId}` is the typical form. */
  eventId: string;
  recipients: Recipient[];
  submissionId?: string | null;
  subject: string;
  body: string;
}

/**
 * Multi-channel, idempotent dispatch.
 *  - in_app: always written to the SQLite notifications table (unique on
 *    (event_id, recipient_id, channel) so retries are safe).
 *  - email:  only attempted when RESEND_API_KEY + RESEND_FROM_EMAIL are set.
 *
 * Returns counts for the caller's audit. Errors per recipient are swallowed
 * to avoid one bad address taking down the whole notification fan-out.
 */
export async function deliver(args: DeliverArgs): Promise<{ inApp: number; email: number }> {
  let inApp = 0;
  let email = 0;
  const seen = new Set<string>();

  for (const r of args.recipients) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    const created = insertNotification({
      eventId: args.eventId,
      recipientId: r.userId,
      submissionId: args.submissionId ?? null,
      channel: 'in_app',
      subject: args.subject,
      body: args.body,
    });
    if (created) inApp++;
  }

  const e = env();
  if (!e.RESEND_API_KEY || !e.RESEND_FROM_EMAIL) {
    return { inApp, email };
  }

  // Lazy-load Resend to keep the cold path off the critical path
  // when no key is configured.
  const { Resend } = await import('resend');
  const resend = new Resend(e.RESEND_API_KEY);

  for (const r of args.recipients) {
    const created = insertNotification({
      eventId: args.eventId,
      recipientId: r.userId,
      submissionId: args.submissionId ?? null,
      channel: 'email',
      subject: args.subject,
      body: args.body,
    });
    if (!created) continue; // dedup: already sent for this event/recipient
    try {
      await resend.emails.send({
        from: e.RESEND_FROM_EMAIL,
        to: r.email,
        subject: args.subject,
        text: args.body,
      });
      email++;
    } catch (err) {
      console.error('[notifications] Resend send failed', err);
    }
  }

  return { inApp, email };
}
