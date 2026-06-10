import { requireRole } from '@/lib/auth/require';
import { listNotificationsForUser } from '@/lib/repo/notifications';
import { NotificationsInbox } from '@/components/shared/notifications-inbox';

export default async function FinanceNotificationsPage() {
  const user = await requireRole('finance');
  const items = listNotificationsForUser(user.appUserId);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Admin approvals routed to Finance and submissions awaiting payment.
        </p>
      </header>
      <NotificationsInbox notifications={items} viewerRole="finance" />
    </div>
  );
}
