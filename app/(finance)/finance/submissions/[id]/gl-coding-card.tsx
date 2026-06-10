'use client';

import { useActionState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { saveGlCodingAction, type ActionState } from '@/lib/actions/finance';

interface Props {
  submissionId: string;
  initial: {
    glAccountCode: string;
    glCostCenter: string;
    glNotes: string;
  };
  editable: boolean;
}

const initial: ActionState = { ok: false };

export function GlCodingCard({ submissionId, initial: defaults, editable }: Props) {
  const [state, formAction, pending] = useActionState(saveGlCodingAction, initial);
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">GL coding</CardTitle>
        <CardDescription>
          Used by the accounting export. Optional, but fill in before approval where possible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="submissionId" value={submissionId} />
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="glAccountCode">GL account code</Label>
              <Input
                id="glAccountCode"
                name="glAccountCode"
                defaultValue={defaults.glAccountCode}
                disabled={!editable}
                maxLength={50}
                placeholder="e.g. 5000-Professional"
              />
              {err('glAccountCode') && <p className="text-xs text-destructive">{err('glAccountCode')}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="glCostCenter">Cost center</Label>
              <Input
                id="glCostCenter"
                name="glCostCenter"
                defaultValue={defaults.glCostCenter}
                disabled={!editable}
                maxLength={50}
                placeholder="e.g. CC-Engineering"
              />
              {err('glCostCenter') && <p className="text-xs text-destructive">{err('glCostCenter')}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="glNotes">Notes</Label>
            <textarea
              id="glNotes"
              name="glNotes"
              defaultValue={defaults.glNotes}
              disabled={!editable}
              maxLength={500}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
            {err('glNotes') && <p className="text-xs text-destructive">{err('glNotes')}</p>}
          </div>

          {state.message && (
            <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-destructive'}`}>
              {state.message}
            </p>
          )}

          {editable && (
            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                {pending ? 'Saving…' : 'Save GL coding'}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
