'use client';

import { useActionState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { saveVendorProfile, type ActionState } from '@/lib/actions/vendor-profile';

interface Props {
  initial: {
    companyName: string;
    country: string;
    vendorType: 'individual' | 'company';
    taxId: string;
    vatNumber: string;
  };
}

const initialState: ActionState = { ok: false };

export function ProfileForm({ initial }: Props) {
  const [state, formAction, pending] = useActionState(saveVendorProfile, initialState);

  const err = (key: string) => state.fieldErrors?.[key];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="companyName">Legal name</Label>
            <Input
              id="companyName"
              name="companyName"
              defaultValue={initial.companyName}
              required
              maxLength={200}
            />
            {err('companyName') && <p className="text-xs text-destructive">{err('companyName')}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country (ISO)</Label>
              <Input
                id="country"
                name="country"
                defaultValue={initial.country}
                required
                maxLength={2}
                placeholder="GB"
              />
              {err('country') && <p className="text-xs text-destructive">{err('country')}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendorType">Vendor type</Label>
              <select
                id="vendorType"
                name="vendorType"
                defaultValue={initial.vendorType}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="company">Company</option>
                <option value="individual">Individual</option>
              </select>
              {err('vendorType') && <p className="text-xs text-destructive">{err('vendorType')}</p>}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taxId">Tax ID</Label>
              <Input id="taxId" name="taxId" defaultValue={initial.taxId} maxLength={50} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatNumber">VAT number (UK: GB + 9/12 digits)</Label>
              <Input
                id="vatNumber"
                name="vatNumber"
                defaultValue={initial.vatNumber}
                maxLength={20}
                placeholder="GB123456789"
              />
              {err('vatNumber') && <p className="text-xs text-destructive">{err('vatNumber')}</p>}
            </div>
          </div>

          {state.message && (
            <p className={`text-sm ${state.ok ? 'text-emerald-600' : 'text-destructive'}`}>
              {state.message}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
