import { requireRole } from '@/lib/auth/require';
import { listNotificationsForUser } from '@/lib/repo/notifications';
import { NotificationsInbox } from '@/components/shared/notifications-inbox';

export default async function VendorNotificationsPage() {
  const user = await requireRole('vendor');
  const items = listNotificationsForUser(user.appUserId);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Status changes and action requests from Admin and Finance.
        </p>
      </header>
      <NotificationsInbox notifications={items} viewerRole="vendor" />
    </div>
  );
}
