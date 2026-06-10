import { requireRoleOrRedirect } from '@/lib/auth/require';
import { ModuleShell } from '@/components/shared/module-shell';
import { countUnreadForUser } from '@/lib/repo/notifications';

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect('vendor');
  const unread = countUnreadForUser(user.appUserId);
  return (
    <ModuleShell role="vendor" userName={user.name ?? user.email} unreadCount={unread}>
      {children}
    </ModuleShell>
  );
}
