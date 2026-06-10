'use client';

import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { saveBankDetailsAction, type ActionState } from '@/lib/actions/vendor-bank';

interface Props {
  initial: {
    accountHolderName: string;
    accountNumber: string;
    iban: string;
    swiftBic: string;
    bankName: string;
    bankAddress: string;
    paymentCurrency: string;
    notes: string;
  };
}

const initialState: ActionState = { ok: false };

export function BankDetailsForm({ initial }: Props) {
  const [state, formAction, pending] = useActionState(saveBankDetailsAction, initialState);
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="accountHolderName">Account holder name</Label>
          <Input
            id="accountHolderName"
            name="accountHolderName"
            defaultValue={initial.accountHolderName}
            maxLength={120}
            placeholder="Your company / legal name"
          />
          {err('accountHolderName') && <p className="text-xs text-destructive">{err('accountHolderName')}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paymentCurrency">Currency</Label>
          <Input
            id="paymentCurrency"
            name="paymentCurrency"
            defaultValue={initial.paymentCurrency}
            maxLength={10}
            placeholder="GBP / USD / EUR"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="accountNumber">Account number</Label>
          <Input
            id="accountNumber"
            name="accountNumber"
            defaultValue={initial.accountNumber}
            maxLength={40}
            placeholder="for non-IBAN accounts"
          />
          {err('accountNumber') && <p className="text-xs text-destructive">{err('accountNumber')}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="iban">IBAN</Label>
          <Input
            id="iban"
            name="iban"
            defaultValue={initial.iban}
            maxLength={40}
            placeholder="GB29 NWBK 6016 1331 9268 19"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="swiftBic">SWIFT / BIC</Label>
          <Input
            id="swiftBic"
            name="swiftBic"
            defaultValue={initial.swiftBic}
            maxLength={20}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bankName">Bank name</Label>
          <Input
            id="bankName"
            name="bankName"
            defaultValue={initial.bankName}
            maxLength={120}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bankAddress">Bank address</Label>
        <textarea
          id="bankAddress"
          name="bankAddress"
          defaultValue={initial.bankAddress}
          rows={2}
          maxLength={300}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (intermediary banks, sort code, etc.)</Label>
        <textarea
          id="notes"
          name="notes"
          defaultValue={initial.notes}
          rows={2}
          maxLength={500}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-destructive'}`}>
          {state.message}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save bank details'}
        </Button>
      </div>
    </form>
  );
}
