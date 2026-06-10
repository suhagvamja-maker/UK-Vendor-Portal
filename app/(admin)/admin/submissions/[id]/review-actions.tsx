'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  adminApproveAction,
  adminReturnToVendorAction,
  adminRejectAction,
} from '@/lib/actions/admin';

type Mode = 'idle' | 'approve' | 'return' | 'reject';

export function ReviewActions({ submissionId }: { submissionId: string }) {
  const [mode, setMode] = useState<Mode>('idle');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const reset = () => {
    setMode('idle');
    setReason('');
    setError(null);
  };

  const run = (action: () => Promise<{ ok: boolean; message?: string }>) => {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? 'Action failed');
        return;
      }
      reset();
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Decision</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode('approve')}>Approve</Button>
            <Button variant="outline" onClick={() => setMode('return')}>
              Return to vendor
            </Button>
            <Button variant="destructive" onClick={() => setMode('reject')}>
              Reject
            </Button>
          </div>
        )}

        {mode === 'approve' && (
          <div className="space-y-3">
            <p className="text-sm">
              Approving generates an HOD Approval PDF and forwards to Finance.
              Add an optional comment for the audit trail.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Optional approval note…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset} disabled={pending}>Cancel</Button>
              <Button
                onClick={() => run(() => adminApproveAction(submissionId, reason || undefined))}
                disabled={pending}
              >
                {pending ? 'Approving…' : 'Confirm approve'}
              </Button>
            </div>
          </div>
        )}

        {mode === 'return' && (
          <div className="space-y-3">
            <Label htmlFor="return-reason">Reason (visible to vendor)</Label>
            <textarea
              id="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="What does the vendor need to fix?"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset} disabled={pending}>Cancel</Button>
              <Button
                onClick={() => run(() => adminReturnToVendorAction(submissionId, reason))}
                disabled={pending || reason.trim().length < 5}
              >
                {pending ? 'Returning…' : 'Send back to vendor'}
              </Button>
            </div>
          </div>
        )}

        {mode === 'reject' && (
          <div className="space-y-3">
            <Label htmlFor="reject-reason">Rejection reason (terminal — visible to vendor)</Label>
            <textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Why is this being rejected?"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset} disabled={pending}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => run(() => adminRejectAction(submissionId, reason))}
                disabled={pending || reason.trim().length < 5}
              >
                {pending ? 'Rejecting…' : 'Confirm reject'}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
