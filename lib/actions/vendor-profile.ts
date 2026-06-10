'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/require';
import { findOrCreateVendor, updateVendorProfile } from '@/lib/repo/vendors';
import { vendorProfileSchema } from '@/lib/validators/vendor-profile';

export interface ActionState {
  ok: boolean;
  fieldErrors?: Record<string, string>;
  message?: string;
}

export async function saveVendorProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole('vendor');
  const parsed = vendorProfileSchema.safeParse({
    companyName: formData.get('companyName'),
    country: formData.get('country'),
    vendorType: formData.get('vendorType'),
    taxId: formData.get('taxId') ?? '',
    vatNumber: formData.get('vatNumber') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path.join('.');
      fieldErrors[k] = issue.message;
    }
    return { ok: false, fieldErrors, message: 'Please fix the highlighted fields.' };
  }

  const vendor = findOrCreateVendor(user.appUserId);
  updateVendorProfile(vendor.id, parsed.data);
  revalidatePath('/vendor/profile');
  revalidatePath('/vendor/dashboard');
  redirect('/vendor/dashboard?profileSaved=1');
}
