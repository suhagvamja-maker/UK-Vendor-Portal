import { requireRoleOrRedirect } from '@/lib/auth/require';
import { ModuleShell } from '@/components/shared/module-shell';
import { countUnreadForUser } from '@/lib/repo/notifications';

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect('finance');
  const unread = countUnreadForUser(user.appUserId);
  return (
    <ModuleShell role="finance" userName={user.name ?? user.email} unreadCount={unread}>
      {children}
    </ModuleShell>
  );
}
