import { env } from '@/lib/env';
import { lastAdminActor, usersByRole, vendorForSubmission, type Recipient } from './recipients';
import { deliver } from './send';
import { findSubmissionById } from '@/lib/repo/submissions';

const link = (submissionId: string, modulePrefix: 'vendor' | 'admin' | 'finance') =>
  `${env().APP_BASE_URL}/${modulePrefix}/submissions/${submissionId}`;

const inv = (id: string) => findSubmissionById(id)?.invoiceNumber ?? id.slice(0, 8);

/**
 * Pure dispatch functions — one per CLAUDE.md §10 event. Safe to call from
 * either a server action (fire-and-forget) or an Inngest function (async).
 *
 * Each picks recipients per the spec table and uses a deterministic event_id
 * so retries are idempotent.
 */

export async function notifySubmissionCreated(submissionId: string) {
  const admins = usersByRole('admin');
  if (admins.length === 0) return;
  await deliver({
    eventId: `submission/created:${submissionId}`,
    recipients: admins,
    submissionId,
    subject: `New submission ready for review — ${inv(submissionId)}`,
    body: `A new vendor submission is ready for Admin review.\n\n${link(submissionId, 'admin')}`,
  });
}

export async function notifyResubmitted(submissionId: string) {
  const admins = usersByRole('admin');
  if (admins.length === 0) return;
  await deliver({
    eventId: `submission/resubmitted:${submissionId}:${Date.now()}`,
    recipients: admins,
    submissionId,
    subject: `Re-submission ready for review — ${inv(submissionId)}`,
    body: `A vendor has uploaded corrections and re-submitted.\n\n${link(submissionId, 'admin')}`,
  });
}

export async function notifyAdminApproved(submissionId: string) {
  const finance = usersByRole('finance');
  if (finance.length === 0) return;
  await deliver({
    eventId: `submission/admin_approved:${submissionId}`,
    recipients: finance,
    submissionId,
    subject: `Ready for Finance review — ${inv(submissionId)}`,
    body: `Admin has approved a submission. Finance review needed.\n\n${link(submissionId, 'finance')}`,
  });
}

export async function notifyReturnedToVendor(submissionId: string, reason?: string) {
  const vendor = vendorForSubmission(submissionId);
  if (!vendor) return;
  await deliver({
    // Include a timestamp so subsequent returns send fresh emails per CLAUDE.md §10.
    eventId: `submission/returned_to_vendor:${submissionId}:${Date.now()}`,
    recipients: [vendor],
    submissionId,
    subject: `Action required: ${inv(submissionId)}`,
    body: `Your submission has been returned for changes.${reason ? `\n\nReason:\n${reason}` : ''}\n\n${link(submissionId, 'vendor')}`,
  });
}

export async function notifyReturnedToAdmin(submissionId: string, reason?: string) {
  // Route to the original approver, not the whole admin queue (CLAUDE.md §10 design note).
  const admin: Recipient | null = lastAdminActor(submissionId);
  if (!admin) return;
  await deliver({
    eventId: `submission/returned_to_admin:${submissionId}:${Date.now()}`,
    recipients: [admin],
    submissionId,
    subject: `Returned for re-review by Finance — ${inv(submissionId)}`,
    body: `Finance has returned a submission you approved.${reason ? `\n\nReason:\n${reason}` : ''}\n\n${link(submissionId, 'admin')}`,
  });
}

export async function notifyFinanceApproved(submissionId: string) {
  const vendor = vendorForSubmission(submissionId);
  const admins = usersByRole('admin');
  const recipients = [vendor, ...admins].filter(Boolean) as Recipient[];
  if (recipients.length === 0) return;
  await deliver({
    eventId: `submission/finance_approved:${submissionId}`,
    recipients,
    submissionId,
    subject: `Approved: ${inv(submissionId)}`,
    body: `The submission has been fully approved.\n\nVendor view: ${link(submissionId, 'vendor')}`,
  });
}

export async function notifyRejected(submissionId: string, reason?: string) {
  const vendor = vendorForSubmission(submissionId);
  const admins = usersByRole('admin');
  const recipients = [vendor, ...admins].filter(Boolean) as Recipient[];
  if (recipients.length === 0) return;
  await deliver({
    eventId: `submission/rejected:${submissionId}`,
    recipients,
    submissionId,
    subject: `Rejected: ${inv(submissionId)}`,
    body: `The submission has been rejected.${reason ? `\n\nReason:\n${reason}` : ''}`,
  });
}

export async function notifyPaid(submissionId: string) {
  const vendor = vendorForSubmission(submissionId);
  if (!vendor) return;
  await deliver({
    eventId: `submission/paid:${submissionId}`,
    recipients: [vendor],
    submissionId,
    subject: `Payment processed: ${inv(submissionId)}`,
    body: `Your invoice has been marked as paid.\n\n${link(submissionId, 'vendor')}`,
  });
}

/**
 * Dispute is now fully resolved (both vendor + finance acknowledged).
 * Routes to vendor + all finance + all admins so everyone sees the conversation closed.
 */
export async function notifyDisputeResolved(submissionId: string) {
  const vendor = vendorForSubmission(submissionId);
  const finance = usersByRole('finance');
  const admins = usersByRole('admin');
  const recipients = [vendor, ...finance, ...admins].filter(Boolean) as Recipient[];
  if (recipients.length === 0) return;
  await deliver({
    eventId: `submission/dispute_resolved:${submissionId}:${Date.now()}`,
    recipients,
    submissionId,
    subject: `Dispute resolved — ${inv(submissionId)}`,
    body: `Both parties have acknowledged the dispute. The conversation is now closed.\n\n${link(submissionId, 'vendor')}`,
  });
}

/**
 * Vendor nudges the reviewer (admin + finance) when they've re-uploaded a
 * profile doc in response to feedback and want a fresh look. Best-effort —
 * deliberately separate from the auto fan-out on dispute / approval / etc.
 */
export async function notifyReviewerForDoc(submissionId: string, docDisplayName: string) {
  const finance = usersByRole('finance');
  const admins = usersByRole('admin');
  const recipients = [...finance, ...admins];
  if (recipients.length === 0) return;
  await deliver({
    eventId: `submission/doc_re_review_requested:${submissionId}:${Date.now()}`,
    recipients,
    submissionId,
    subject: `Re-review requested: ${docDisplayName} — ${inv(submissionId)}`,
    body: `The vendor has re-uploaded ${docDisplayName} after your feedback and is asking for another look.\n\n${link(submissionId, 'finance')}`,
  });
}

/**
 * Vendor raised a dispute on a paid submission. Routes to all finance users
 * (primary handlers) and all admins (visibility / oversight).
 */
export async function notifyDisputeRaised(submissionId: string, reason: string) {
  const finance = usersByRole('finance');
  const admins = usersByRole('admin');
  const recipients = [...finance, ...admins];
  if (recipients.length === 0) return;
  await deliver({
    eventId: `submission/disputed:${submissionId}:${Date.now()}`,
    recipients,
    submissionId,
    subject: `Vendor raised a dispute — ${inv(submissionId)}`,
    body: `A vendor has raised a dispute on a paid invoice.\n\n${reason}\n\nReview at ${link(submissionId, 'finance')}`,
  });
}

/** Compliance expiry reminder — emitted from the daily expiry scan. */
export async function notifyTrcExpiringSoon(vendorUserId: string, daysRemaining: number, trcValidTo: string) {
  // Fetch the recipient directly to avoid coupling to a submission.
  const { findUserById } = await import('@/lib/repo/users');
  const user = findUserById(vendorUserId);
  if (!user) return;
  await deliver({
    eventId: `compliance/trc_expiring:${vendorUserId}:${trcValidTo}`,
    recipients: [{ userId: user.id, email: user.email, name: user.name, role: user.role }],
    subject: `Reminder: TRC expires in ${daysRemaining} days`,
    body: `Your Tax Residency Certificate expires on ${trcValidTo}. Upload a fresh TRC before the FY rollover to avoid blocking future submissions.\n\n${env().APP_BASE_URL}/vendor/dashboard`,
  });
}
