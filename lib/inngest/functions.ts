import { events, inngest } from './client';
import {
  notifyAdminApproved,
  notifyFinanceApproved,
  notifyPaid,
  notifyRejected,
  notifyReturnedToAdmin,
  notifyReturnedToVendor,
  notifySubmissionCreated,
  notifyResubmitted,
} from '@/lib/notifications/notify';

/**
 * Inngest registrations — production async dispatch. The same handlers in
 * lib/notifications/notify.ts are invoked synchronously from server actions
 * (see lib/actions/admin.ts and lib/actions/finance.ts) so dev works without
 * a running Inngest dev server.
 *
 * When the Inngest dev server is running and we want to switch dispatch
 * to async (recommended for prod), replace the `await notify*()` calls in
 * the actions with `await inngest.send({ name, data })`.
 */

export const onSubmissionCreated = inngest.createFunction(
  { id: 'notify-on-submission-created', triggers: [events.submissionCreated] },
  async ({ event }) => notifySubmissionCreated(event.data.submissionId),
);

export const onResubmitted = inngest.createFunction(
  { id: 'notify-on-resubmitted', triggers: [events.submissionResubmitted] },
  async ({ event }) => notifyResubmitted(event.data.submissionId),
);

export const onAdminApproved = inngest.createFunction(
  { id: 'notify-on-admin-approved', triggers: [events.adminApproved] },
  async ({ event }) => notifyAdminApproved(event.data.submissionId),
);

export const onReturnedToVendor = inngest.createFunction(
  { id: 'notify-on-returned-to-vendor', triggers: [events.returnedToVendor] },
  async ({ event }) => notifyReturnedToVendor(event.data.submissionId, event.data.reason),
);

export const onReturnedToAdmin = inngest.createFunction(
  { id: 'notify-on-returned-to-admin', triggers: [events.returnedToAdmin] },
  async ({ event }) => notifyReturnedToAdmin(event.data.submissionId, event.data.reason),
);

export const onFinanceApproved = inngest.createFunction(
  { id: 'notify-on-finance-approved', triggers: [events.financeApproved] },
  async ({ event }) => notifyFinanceApproved(event.data.submissionId),
);

export const onRejected = inngest.createFunction(
  { id: 'notify-on-rejected', triggers: [events.rejected] },
  async ({ event }) => notifyRejected(event.data.submissionId, event.data.reason),
);

export const onPaid = inngest.createFunction(
  { id: 'notify-on-paid', triggers: [events.paid] },
  async ({ event }) => notifyPaid(event.data.submissionId),
);

export const functions = [
  onSubmissionCreated,
  onResubmitted,
  onAdminApproved,
  onReturnedToVendor,
  onReturnedToAdmin,
  onFinanceApproved,
  onRejected,
  onPaid,
];
