'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { NotificationRow } from '@/lib/repo/notifications';
import type { AppRole } from '@/types/roles';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { markAllReadAction, markOneReadAction } from '@/lib/actions/notifications';
import { cn } from '@/lib/utils';

const submissionLinkForRole: Record<AppRole, (id: string) => string> = {
  vendor: (id) => `/vendor/submissions/${id}`,
  admin: (id) => `/admin/submissions/${id}`,
  finance: (id) => `/finance/submissions/${id}`,
};

export function NotificationsInbox({
  notifications,
  viewerRole,
}: {
  notifications: NotificationRow[];
  viewerRole: AppRole;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const markAll = () => {
    startTransition(async () => {
      await markAllReadAction();
      router.refresh();
    });
  };

  const markOne = (id: string) => {
    startTransition(async () => {
      await markOneReadAction(id);
      router.refresh();
    });
  };

  if (notifications.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          You have no notifications yet.
        </CardContent>
      </Card>
    );
  }

  const linkFor = submissionLinkForRole[viewerRole];
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {unreadCount} unread of {notifications.length}
          </p>
          <Button onClick={markAll} disabled={pending || unreadCount === 0} size="sm" variant="outline">
            {pending ? 'Marking…' : 'Mark all read'}
          </Button>
        </div>
        <ul className="divide-y">
          {notifications.map((n) => {
            const target = n.submissionId ? linkFor(n.submissionId) : '#';
            return (
              <li key={n.id} className={cn('py-3 flex items-start gap-3', !n.readAt && 'bg-muted/30 -mx-3 px-3 rounded')}>
                <span
                  className={cn(
                    'mt-1.5 w-2 h-2 rounded-full shrink-0',
                    n.readAt ? 'bg-transparent border border-muted-foreground' : 'bg-blue-600',
                  )}
                  aria-hidden
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={target}
                      onClick={() => !n.readAt && markOne(n.id)}
                      className="font-medium text-sm hover:underline truncate"
                    >
                      {n.subject ?? '(no subject)'}
                    </Link>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {n.body && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{n.body}</p>
                  )}
                </div>
                {!n.readAt && (
                  <button
                    type="button"
                    onClick={() => markOne(n.id)}
                    disabled={pending}
                    className="text-[11px] text-blue-600 hover:underline shrink-0"
                  >
                    Mark read
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
