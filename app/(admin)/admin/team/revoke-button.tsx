'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { revokeInviteAction } from '@/lib/actions/team';

export function RevokeButton({ invitationId }: { invitationId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onRevoke = () => {
    startTransition(async () => {
      const result = await revokeInviteAction(invitationId);
      if (result.ok) router.refresh();
    });
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={onRevoke} disabled={pending}>
      {pending ? 'Revoking…' : 'Revoke'}
    </Button>
  );
}
