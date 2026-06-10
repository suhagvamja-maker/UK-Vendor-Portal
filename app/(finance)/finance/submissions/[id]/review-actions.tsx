'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  financeApproveAction,
  financeReturnToVendorAction,
  financeReturnToAdminAction,
  financeRejectAction,
  markPaidAction,
} from '@/lib/actions/finance';

type ReviewMode = 'review' | 'pay';
type FormMode = 'idle' | 'approve' | 'return-vendor' | 'return-admin' | 'reject' | 'mark-paid';

export function FinanceReviewActions({
  submissionId,
  mode,
  hasGlCoding,
}: {
  submissionId: string;
  mode: ReviewMode;
  hasGlCoding: boolean;
}) {
  const [form, setForm] = useState<FormMode>('idle');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const reset = () => {
    setForm('idle');
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
        <CardTitle className="text-base">{mode === 'review' ? 'Decision' : 'Payment'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {form === 'idle' && mode === 'review' && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setForm('approve')}>Approve</Button>
              <Button variant="outline" onClick={() => setForm('return-admin')}>
                Return to Admin
              </Button>
              <Button variant="outline" onClick={() => setForm('return-vendor')}>
                Return to vendor
              </Button>
              <Button variant="destructive" onClick={() => setForm('reject')}>
                Reject
              </Button>
            </div>
            {!hasGlCoding && (
              <p className="text-xs text-amber-700">
                ⚠ GL coding is not set. You can still approve, but the export will be missing fields.
              </p>
            )}
          </>
        )}

        {form === 'idle' && mode === 'pay' && (
          <>
            <p className="text-sm">
              Approved — ready for payment processing.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setForm('mark-paid')}>Mark as paid</Button>
            </div>
          </>
        )}

        {form === 'approve' && (
          <ConfirmForm
            title="Approving sends final approval to the vendor. Add an optional note."
            placeholder="Optional approval note…"
            confirmLabel="Confirm approve"
            value={reason}
            onChange={setReason}
            onCancel={reset}
            onSubmit={() => run(() => financeApproveAction(submissionId, reason || undefined))}
            pending={pending}
            minLength={0}
          />
        )}

        {form === 'return-admin' && (
          <ConfirmForm
            title="Send back to Admin"
            placeholder="What does Admin need to address?"
            label="Reason (internal — vendor will NOT see this)"
            confirmLabel="Return to Admin"
            value={reason}
            onChange={setReason}
            onCancel={reset}
            onSubmit={() => run(() => financeReturnToAdminAction(submissionId, reason))}
            pending={pending}
            minLength={5}
          />
        )}

        {form === 'return-vendor' && (
          <ConfirmForm
            title="Return to vendor"
            label="Reason (visible to vendor)"
            placeholder="What does the vendor need to fix?"
            confirmLabel="Send back to vendor"
            value={reason}
            onChange={setReason}
            onCancel={reset}
            onSubmit={() => run(() => financeReturnToVendorAction(submissionId, reason))}
            pending={pending}
            minLength={5}
          />
        )}

        {form === 'reject' && (
          <ConfirmForm
            title="Reject (terminal)"
            label="Reason (visible to vendor)"
            placeholder="Why is this being rejected?"
            confirmLabel="Confirm reject"
            confirmVariant="destructive"
            value={reason}
            onChange={setReason}
            onCancel={reset}
            onSubmit={() => run(() => financeRejectAction(submissionId, reason))}
            pending={pending}
            minLength={5}
          />
        )}

        {form === 'mark-paid' && (
          <MarkPaidForm
            submissionId={submissionId}
            onCancel={reset}
            onDone={() => {
              reset();
              router.refresh();
            }}
          />
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function MarkPaidForm({
  submissionId,
  onCancel,
  onDone,
}: {
  submissionId: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (formData: FormData) => {
    startTransition(async () => {
      setError(null);
      formData.set('submissionId', submissionId);
      const result = await markPaidAction(formData);
      if (!result.ok) {
        setError(result.message ?? 'Action failed');
        return;
      }
      onDone();
    });
  };

  return (
    <form action={onSubmit} className="space-y-3">
      <p className="text-sm">
        Upload the transaction PDF (proof of payment), then mark this submission as paid.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="receipt">
          Transaction PDF <span className="text-rose-600">*</span>
        </Label>
        <Input
          id="receipt"
          name="receipt"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required
        />
        <p className="text-xs text-muted-foreground">
          PDF / JPG / PNG, max 10MB. Required.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="comment">Note (optional, visible to all)</Label>
        <textarea
          id="comment"
          name="comment"
          rows={2}
          placeholder="Wire reference, transaction ID, etc."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Marking…' : 'Confirm mark paid'}
        </Button>
      </div>
    </form>
  );
}

function ConfirmForm({
  title,
  label,
  placeholder,
  value,
  onChange,
  onCancel,
  onSubmit,
  pending,
  minLength,
  confirmLabel,
  confirmVariant = 'default',
}: {
  title: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
  minLength: number;
  confirmLabel: string;
  confirmVariant?: 'default' | 'destructive';
}) {
  const disabled = pending || value.trim().length < minLength;
  return (
    <div className="space-y-3">
      <p className="text-sm">{title}</p>
      {label && <Label className="text-xs">{label}</Label>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={onSubmit} disabled={disabled}>
          {pending ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
