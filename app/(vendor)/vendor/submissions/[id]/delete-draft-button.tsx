'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { deleteDraftAction } from '@/lib/actions/drafts';

/**
 * Inline destructive action — visible only on draft submissions the vendor
 * decided not to send. Two-click confirm prevents accidents; toast on
 * permanent removal.
 */
export function DeleteDraftButton({ submissionId }: { submissionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const onClick = () => {
    if (!confirming) {
      setConfirming(true);
      // Auto-revert after 5s so the destructive state doesn't stick around.
      setTimeout(() => setConfirming(false), 5000);
      return;
    }
    startTransition(async () => {
      try {
        await deleteDraftAction(submissionId);
        // deleteDraftAction redirects on success, so we won't reach here.
      } catch (err) {
        // A thrown NEXT_REDIRECT is normal — we ignore it.
        const message = err instanceof Error ? err.message : String(err);
        if (!/NEXT_REDIRECT/.test(message)) {
          toast.error('Could not delete the draft.');
        }
      }
    });
  };

  return (
    <Button
      type="button"
      variant={confirming ? 'destructive' : 'outline'}
      size="sm"
      disabled={pending}
      onClick={onClick}
    >
      {pending
        ? 'Deleting…'
        : confirming
          ? 'Click again to confirm'
          : 'Delete draft'}
    </Button>
  );
}
