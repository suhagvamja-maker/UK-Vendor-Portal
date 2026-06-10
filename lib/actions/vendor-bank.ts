'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/require';
import { findOrCreateVendor, updateVendorBankDetails } from '@/lib/repo/vendors';
import { appendAudit } from '@/lib/repo/audit';
import { bankDetailsSchema } from '@/lib/validators/bank-details';

export interface ActionState {
  ok: boolean;
  fieldErrors?: Record<string, string>;
  message?: string;
}

export async function saveBankDetailsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole('vendor');
  const parsed = bankDetailsSchema.safeParse({
    accountHolderName: formData.get('accountHolderName') ?? '',
    accountNumber:     formData.get('accountNumber') ?? '',
    iban:              formData.get('iban') ?? '',
    swiftBic:          formData.get('swiftBic') ?? '',
    bankName:          formData.get('bankName') ?? '',
    bankAddress:       formData.get('bankAddress') ?? '',
    paymentCurrency:   formData.get('paymentCurrency') ?? '',
    notes:             formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
    return { ok: false, fieldErrors, message: 'Please fix the highlighted fields.' };
  }
  const vendor = findOrCreateVendor(user.appUserId);
  updateVendorBankDetails(vendor.id, parsed.data);
  appendAudit({
    submissionId: null,
    actorId: user.appUserId,
    event: 'vendor/bank_updated',
    payload: {}, // never log the actual details
  });
  revalidatePath('/vendor/profile');
  return { ok: true, message: 'Bank details saved.' };
}
