'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { raiseDisputeAction } from '@/lib/actions/comments';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface Props {
  submissionId: string;
  /** True when the invoice has already been paid — copy + tone shifts to a sharper
   *  "we need to fix this" framing. */
  isPaid?: boolean;
  /** Number of unresolved disputes on this submission — for the visible status hint. */
  openDisputeCount?: number;
  /** True when this vendor already has an unresolved dispute open on this submission —
   *  blocks raising a duplicate. */
  hasOwnOpenDispute?: boolean;
}

/**
 * Card that lets the vendor escalate a comment into a formal dispute.
 * Always available once the invoice is submitted; the framing changes for paid
 * invoices since that's the most common case where a vendor needs a clear
 * channel to flag a problem after settlement.
 */
export function RaiseDisputeCard({
  submissionId,
  isPaid,
  openDisputeCount = 0,
  hasOwnOpenDispute = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const submit = () => {
    startTransition(async () => {
      setError(null);
      const result = await raiseDisputeAction(submissionId, reason);
      if (!result.ok) {
        setError(result.message ?? 'Failed to raise dispute.');
        toast.error(result.message ?? 'Failed to raise dispute.');
        return;
      }
      setReason('');
      setOpen(false);
      toast.success('Dispute raised — Finance and Admin have been notified.');
      router.refresh();
    });
  };

  return (
    <Card className={cn(isPaid ? 'border-rose-200 bg-rose-50/30' : 'border-amber-200 bg-amber-50/30')}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {isPaid ? 'Something wrong with this payment?' : 'Need to flag an issue?'}
        </CardTitle>
        <CardDescription>
          {isPaid
            ? 'Raise a dispute and Finance will reopen the conversation. Admin will be looped in.'
            : 'Open a dispute to flag any concern with this submission. Admin + Finance will be notified.'}
          {openDisputeCount > 0 && (
            <span className="ml-1 font-medium text-rose-700">
              · {openDisputeCount} open
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasOwnOpenDispute ? (
          <p className="text-sm text-rose-700">
            You already have an open dispute on this invoice. Continue the conversation in the
            thread below — once both sides confirm the dispute is resolved, it will close.
          </p>
        ) : !open ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant={isPaid ? 'destructive' : 'outline'}
              onClick={() => setOpen(true)}
            >
              Raise a dispute
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dispute-reason">What&apos;s wrong?</Label>
              <textarea
                id="dispute-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Describe the issue — wrong amount, missing payment, late delivery, etc."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-[11px] text-muted-foreground">
                Minimum 10 characters. Finance will respond in the conversation below.
              </p>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  setReason('');
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={pending || reason.trim().length < 10}
                variant={isPaid ? 'destructive' : 'default'}
              >
                {pending ? 'Sending…' : 'Submit dispute'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
