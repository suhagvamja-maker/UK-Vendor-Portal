'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/require';
import { runExpirySweep } from '@/lib/expiry/check';
import { appendAudit } from '@/lib/repo/audit';

export async function runExpirySweepAction(): Promise<{ notified: number }> {
  const user = await requireRole('admin');
  const result = await runExpirySweep();
  appendAudit({
    submissionId: null,
    actorId: user.appUserId,
    event: 'compliance/expiry_sweep',
    payload: { notified: result.notified, triggeredManually: true },
  });
  revalidatePath('/admin/audit');
  revalidatePath('/admin/expiry');
  return result;
}
