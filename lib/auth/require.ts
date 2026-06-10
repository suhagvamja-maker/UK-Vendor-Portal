import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { ensureUserFromClerk, findUserByClerkId, type DbUser } from '@/lib/repo/users';
import { findOrCreateVendor } from '@/lib/repo/vendors';
import type { AppRole } from '@/types/roles';

export class AuthError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

interface AppUser {
  clerkUserId: string;
  role: AppRole;
  appUserId: string;
  email: string;
  name: string | null;
  isOwner: boolean;
}

/**
 * Resolves the current Clerk session into a local DbUser, creating the local
 * row on first access (lazy sync). This avoids needing a Clerk webhook in
 * development — every authed request guarantees a synced row.
 */
async function syncedUser(): Promise<DbUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const cached = findUserByClerkId(userId);
  if (cached) return cached;

  // First-time sync: pull the Clerk profile and create our row.
  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  const email = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress
    ?? clerkUser.emailAddresses[0]?.emailAddress
    ?? '';
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
  const metadataRole = (clerkUser.publicMetadata as { role?: string } | undefined)?.role ?? null;

  const dbUser = ensureUserFromClerk({
    clerkUserId: userId,
    email,
    name,
    metadataRole,
    ownerEmail: env().OWNER_EMAIL ?? null,
  });

  if (dbUser.role === 'vendor') {
    findOrCreateVendor(dbUser.id);
  }
  return dbUser;
}

export async function requireUser(): Promise<AppUser> {
  const user = await syncedUser();
  if (!user) throw new AuthError('Not signed in', 401);
  return {
    clerkUserId: user.clerkUserId,
    role: user.role,
    appUserId: user.id,
    email: user.email,
    name: user.name,
    isOwner: user.isOwner,
  };
}

export async function requireRole(...allowed: AppRole[]): Promise<AppUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    throw new ForbiddenError(`Requires role: ${allowed.join(' or ')}; got ${user.role}`);
  }
  return user;
}

/** Server-component variant: redirect on failure instead of throwing. */
export async function requireRoleOrRedirect(...allowed: AppRole[]): Promise<AppUser> {
  try {
    return await requireRole(...allowed);
  } catch (err) {
    if (err instanceof AuthError) redirect('/sign-in');
    if (err instanceof ForbiddenError) redirect('/');
    throw err;
  }
}

/** Owner-only guard for system administration screens (e.g. team invites). */
export async function requireOwner(): Promise<AppUser> {
  const user = await requireUser();
  if (!user.isOwner) throw new ForbiddenError('Owner-only');
  return user;
}
