import { requireRoleOrRedirect } from '@/lib/auth/require';
import { ModuleShell } from '@/components/shared/module-shell';
import { countUnreadForUser } from '@/lib/repo/notifications';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect('admin');
  const unread = countUnreadForUser(user.appUserId);
  return (
    <ModuleShell role="admin" userName={user.name ?? user.email} unreadCount={unread} isOwner={user.isOwner}>
      {children}
    </ModuleShell>
  );
}
