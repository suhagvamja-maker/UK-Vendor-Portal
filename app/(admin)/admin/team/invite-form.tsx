'use client';

import { useActionState, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { createInviteAction, type InviteResult } from '@/lib/actions/team';

const initial: InviteResult = { ok: false };

export function InviteForm() {
  const [state, formAction, pending] = useActionState(createInviteAction, initial);
  const [copied, setCopied] = useState(false);

  const err = (k: string) => state.fieldErrors?.[k];

  const copy = async () => {
    if (!state.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(state.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable on http; user can still copy manually
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invite a teammate</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid sm:grid-cols-[2fr,1fr,auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="teammate@example.com" />
              {err('email') && <p className="text-xs text-destructive">{err('email')}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                name="role"
                defaultValue="vendor"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="vendor">Vendor (24h link)</option>
                <option value="finance">Finance (7 day link)</option>
                <option value="admin">Admin (7 day link)</option>
              </select>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? 'Generating…' : 'Generate link'}
            </Button>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="notify" />
            Also email this person automatically (uses Clerk&apos;s default email)
          </label>

          {state.message && !state.inviteUrl && (
            <p className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-destructive'}`}>
              {state.message}
            </p>
          )}
        </form>

        {state.inviteUrl && (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
            <p className="text-sm font-medium text-emerald-900">{state.message}</p>
            <p className="text-xs text-emerald-900">
              Share this link with the recipient. It expires after they accept it.
            </p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 text-xs break-all bg-white border rounded px-2 py-1.5">
                {state.inviteUrl}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
