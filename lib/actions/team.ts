'use server';

import { revalidatePath } from 'next/cache';
import { clerkClient } from '@clerk/nextjs/server';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth/require';
import { appendAudit } from '@/lib/repo/audit';
import { env } from '@/lib/env';

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  role: z.enum(['admin', 'finance', 'vendor']),
  notify: z.boolean().default(false),
});

/** Vendor invitations expire faster than internal — per the product owner. */
const VENDOR_INVITE_EXPIRY_DAYS = 1;
const INTERNAL_INVITE_EXPIRY_DAYS = 7;

export interface InviteResult {
  ok: boolean;
  message?: string;
  inviteUrl?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Create a Clerk invitation. The role lives in publicMetadata so when the
 * recipient signs up, our lazy-sync (lib/auth/require.ts) picks it up and
 * stamps the SQLite users row with the right role.
 *
 * `notify: false` means Clerk does NOT send the email; we return the URL
 * for the owner to share manually (Slack/WhatsApp/etc.).
 */
export async function createInviteAction(_prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const user = await requireOwner();

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
    notify: formData.get('notify') === 'on',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
    return { ok: false, fieldErrors, message: 'Please fix the highlighted fields.' };
  }

  try {
    const client = await clerkClient();
    const expiresInDays = parsed.data.role === 'vendor'
      ? VENDOR_INVITE_EXPIRY_DAYS
      : INTERNAL_INVITE_EXPIRY_DAYS;
    const invitation = await client.invitations.createInvitation({
      emailAddress: parsed.data.email,
      publicMetadata: { role: parsed.data.role },
      notify: parsed.data.notify,
      redirectUrl: `${env().APP_BASE_URL}/sign-up`,
      expiresInDays,
    });

    appendAudit({
      submissionId: null,
      actorId: user.appUserId,
      event: 'team/invite_created',
      payload: { email: parsed.data.email, role: parsed.data.role, invitationId: invitation.id },
    });

    revalidatePath('/admin/team');
    return {
      ok: true,
      message: parsed.data.notify
        ? `Invitation sent to ${parsed.data.email}.`
        : `Invitation link ready — share it manually.`,
      inviteUrl: invitation.url ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create invitation.';
    return { ok: false, message };
  }
}

/**
 * Revoke an outstanding invitation (e.g. wrong email). Idempotent.
 */
export async function revokeInviteAction(invitationId: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireOwner();
  try {
    const client = await clerkClient();
    await client.invitations.revokeInvitation(invitationId);
    appendAudit({
      submissionId: null,
      actorId: user.appUserId,
      event: 'team/invite_revoked',
      payload: { invitationId },
    });
    revalidatePath('/admin/team');
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Revoke failed.' };
  }
}
