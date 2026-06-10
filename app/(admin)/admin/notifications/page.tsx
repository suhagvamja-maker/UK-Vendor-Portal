import { requireRole } from '@/lib/auth/require';
import { listNotificationsForUser } from '@/lib/repo/notifications';
import { NotificationsInbox } from '@/components/shared/notifications-inbox';

export default async function AdminNotificationsPage() {
  const user = await requireRole('admin');
  const items = listNotificationsForUser(user.appUserId);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Vendor submissions, Finance returns, and compliance reminders.
        </p>
      </header>
      <NotificationsInbox notifications={items} viewerRole="admin" />
    </div>
  );
}
