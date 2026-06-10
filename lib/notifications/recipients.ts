import { db } from '@/lib/db/sqlite';
import { listUsersByRole, findUserById } from '@/lib/repo/users';
import { findVendorById } from '@/lib/repo/vendors';
import { findSubmissionById } from '@/lib/repo/submissions';
import type { AppRole } from '@/types/roles';

export interface Recipient {
  userId: string;
  email: string;
  name: string | null;
  role: AppRole;
}

export function usersByRole(role: AppRole): Recipient[] {
  return listUsersByRole(role).map((u) => ({
    userId: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
  }));
}

export function vendorForSubmission(submissionId: string): Recipient | null {
  const sub = findSubmissionById(submissionId);
  if (!sub) return null;
  const vendor = findVendorById(sub.vendorId);
  if (!vendor) return null;
  const user = findUserById(vendor.userId);
  if (!user) return null;
  return { userId: user.id, email: user.email, name: user.name, role: user.role };
}

/**
 * The most recent Admin who approved this submission — used to route
 * "Finance returned to Admin" notifications back to the original approver
 * instead of paging the entire admin queue.
 */
export function lastAdminActor(submissionId: string): Recipient | null {
  const row = db()
    .prepare(`
      select actor_id from audit_log
      where submission_id = ? and event = 'submission/admin_approved'
      order by created_at desc
      limit 1
    `)
    .get(submissionId) as { actor_id: string | null } | undefined;
  if (!row?.actor_id) return null;
  const user = findUserById(row.actor_id);
  if (!user || user.role !== 'admin') return null;
  return { userId: user.id, email: user.email, name: user.name, role: 'admin' };
}
