'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require';
import { markAllReadForUser, markOneRead } from '@/lib/repo/notifications';

const revalidateAll = () => {
  for (const p of ['/vendor', '/admin', '/finance'] as const) {
    revalidatePath(`${p}/notifications`);
    revalidatePath(`${p}/dashboard`);
    revalidatePath(`${p}/queue`);
  }
};

export async function markAllReadAction(): Promise<{ marked: number }> {
  const user = await requireUser();
  const marked = markAllReadForUser(user.appUserId);
  revalidateAll();
  return { marked };
}

export async function markOneReadAction(notificationId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const ok = markOneRead(user.appUserId, notificationId);
  revalidateAll();
  return { ok };
}
