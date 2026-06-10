'use client';

import { useActionState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { createSubmissionAction, type ActionState } from '@/lib/actions/submission';

interface Props {
  defaults: {
    vendorType: 'individual' | 'company';
    currency: 'GBP' | 'USD' | 'EUR' | 'INR';
  };
}

const initial: ActionState = { ok: false };

export function NewSubmissionForm({ defaults }: Props) {
  const [state, formAction, pending] = useActionState(createSubmissionAction, initial);
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="vendorType">Submitting as</Label>
            <select
              id="vendorType"
              name="vendorType"
              defaultValue={defaults.vendorType}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="company">Company</option>
              <option value="individual">Individual</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Drives which compliance documents we&apos;ll ask for next.
            </p>
            {err('vendorType') && <p className="text-xs text-destructive">{err('vendorType')}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiceNumber">Invoice number</Label>
            <Input id="invoiceNumber" name="invoiceNumber" required maxLength={50} />
            {err('invoiceNumber') && <p className="text-xs text-destructive">{err('invoiceNumber')}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="poNumber">PO number (optional)</Label>
            <Input id="poNumber" name="poNumber" maxLength={50} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiceFile">Invoice PDF</Label>
            <Input
              id="invoiceFile"
              name="invoiceFile"
              type="file"
              accept="application/pdf"
              required
            />
            <p className="text-xs text-muted-foreground">
              PDF only, max 10MB. Compliance documents come from your profile automatically.
            </p>
            {err('invoiceFile') && <p className="text-xs text-destructive">{err('invoiceFile')}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
              {err('amount') && <p className="text-xs text-destructive">{err('amount')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                name="currency"
                defaultValue={defaults.currency}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="INR">INR</option>
              </select>
            </div>
          </div>

          {state.message && (
            <p className={`text-sm ${state.ok ? 'text-emerald-600' : 'text-destructive'}`}>
              {state.message}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create submission'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
