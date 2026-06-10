import { Inngest, eventType, staticSchema } from 'inngest';

export const events = {
  submissionCreated: eventType('submission/created', {
    schema: staticSchema<{ submissionId: string; vendorId: string }>(),
  }),
  submissionResubmitted: eventType('submission/resubmitted', {
    schema: staticSchema<{ submissionId: string; vendorId: string }>(),
  }),
  adminApproved: eventType('submission/admin_approved', {
    schema: staticSchema<{ submissionId: string; actorId: string }>(),
  }),
  financeApproved: eventType('submission/finance_approved', {
    schema: staticSchema<{ submissionId: string; actorId: string }>(),
  }),
  returnedToVendor: eventType('submission/returned_to_vendor', {
    schema: staticSchema<{ submissionId: string; actorId: string; reason?: string }>(),
  }),
  returnedToAdmin: eventType('submission/returned_to_admin', {
    schema: staticSchema<{ submissionId: string; actorId: string; reason?: string }>(),
  }),
  rejected: eventType('submission/rejected', {
    schema: staticSchema<{ submissionId: string; actorId: string; reason?: string }>(),
  }),
  paid: eventType('submission/paid', {
    schema: staticSchema<{ submissionId: string; actorId: string }>(),
  }),
};

export const inngest = new Inngest({ id: 'invoice-compliance' });
