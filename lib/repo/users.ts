import { db } from '@/lib/db/sqlite';
import type { AppRole } from '@/types/roles';
import { isAppRole } from '@/types/roles';

export interface DbUser {
  id: string;
  clerkUserId: string;
  email: string;
  role: AppRole;
  name: string | null;
  isOwner: boolean;
}

interface UserRow {
  id: string;
  clerk_user_id: string;
  email: string;
  role: AppRole;
  name: string | null;
  is_owner: number;
}

const SELECT_COLS = 'id, clerk_user_id, email, role, name, is_owner';

const toUser = (r: UserRow): DbUser => ({
  id: r.id,
  clerkUserId: r.clerk_user_id,
  email: r.email,
  role: r.role,
  name: r.name,
  isOwner: !!r.is_owner,
});

export function findUserById(id: string): DbUser | null {
  const r = db().prepare(`select ${SELECT_COLS} from users where id = ?`).get(id) as UserRow | undefined;
  return r ? toUser(r) : null;
}

export function findUserByClerkId(clerkUserId: string): DbUser | null {
  const r = db()
    .prepare(`select ${SELECT_COLS} from users where clerk_user_id = ?`)
    .get(clerkUserId) as UserRow | undefined;
  return r ? toUser(r) : null;
}

export function findUserByEmail(email: string): DbUser | null {
  const r = db()
    .prepare(`select ${SELECT_COLS} from users where lower(email) = lower(?)`)
    .get(email) as UserRow | undefined;
  return r ? toUser(r) : null;
}

export function listUsersByRole(role: AppRole): DbUser[] {
  const rows = db().prepare(`select ${SELECT_COLS} from users where role = ?`).all(role) as UserRow[];
  return rows.map(toUser);
}

/**
 * Idempotent sync from a Clerk user to our local users table. Called on every
 * authenticated request so freshly-signed-up users always have a matching DB row
 * (no webhook required).
 *
 * Role resolution priority:
 *  1. Clerk publicMetadata.role (set by Admin invitations) — admin / finance
 *  2. Email matches OWNER_EMAIL → admin + is_owner = 1
 *  3. Default → vendor
 */
export function ensureUserFromClerk(input: {
  clerkUserId: string;
  email: string;
  name: string | null;
  metadataRole?: string | null;
  ownerEmail?: string | null;
}): DbUser {
  const existing = findUserByClerkId(input.clerkUserId);
  if (existing) return existing;

  const claimedRole = input.metadataRole && isAppRole(input.metadataRole) ? input.metadataRole : null;
  const isOwnerEmail = !!input.ownerEmail && input.email.toLowerCase() === input.ownerEmail.toLowerCase();

  const role: AppRole = claimedRole ?? (isOwnerEmail ? 'admin' : 'vendor');
  const isOwner = isOwnerEmail || role === 'admin' && !!input.ownerEmail && input.email.toLowerCase() === input.ownerEmail.toLowerCase();

  const id = crypto.randomUUID();
  db()
    .prepare(`insert into users (id, clerk_user_id, email, role, name, is_owner) values (?, ?, ?, ?, ?, ?)`)
    .run(id, input.clerkUserId, input.email, role, input.name, isOwner ? 1 : 0);

  return {
    id,
    clerkUserId: input.clerkUserId,
    email: input.email,
    role,
    name: input.name,
    isOwner,
  };
}
