import { notFound } from 'next/navigation';
import { clerkClient } from '@clerk/nextjs/server';
import { requireRole } from '@/lib/auth/require';
import { listUsersByRole } from '@/lib/repo/users';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InviteForm } from './invite-form';
import { RevokeButton } from './revoke-button';
import { cn } from '@/lib/utils';

const ROLE_TONE: Record<string, string> = {
  admin: 'bg-amber-100 text-amber-800',
  finance: 'bg-emerald-100 text-emerald-800',
  vendor: 'bg-blue-100 text-blue-800',
};

export default async function AdminTeamPage() {
  const user = await requireRole('admin');
  if (!user.isOwner) return notFound();

  const admins = listUsersByRole('admin');
  const finance = listUsersByRole('finance');

  // Pending invitations from Clerk — accepted ones drop off automatically.
  const client = await clerkClient();
  const invitationsList = await client.invitations.getInvitationList({ status: 'pending' });
  const pending = invitationsList.data.filter((i) => {
    const role = (i.publicMetadata as { role?: string } | undefined)?.role;
    return role === 'admin' || role === 'finance' || role === 'vendor';
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Invitations</h1>
        <p className="text-sm text-muted-foreground">
          Generate an invitation link for any user — vendor, admin, or finance. Vendor
          links expire in <strong>24 hours</strong>; admin / finance links last 7 days.
        </p>
      </header>

      <InviteForm />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending invitations</CardTitle>
          <CardDescription>
            Links you have generated that have not yet been accepted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((i) => {
                  const role = (i.publicMetadata as { role?: string }).role ?? '—';
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.emailAddress}</TableCell>
                      <TableCell>
                        <Badge className={cn('text-xs', ROLE_TONE[role])}>{role}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(i.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <RevokeButton invitationId={i.id} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active team</CardTitle>
          <CardDescription>
            Internal users who already have access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {admins.length === 0 && finance.length === 0 ? (
            <p className="text-sm text-muted-foreground">Just you for now.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...admins, ...finance].map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name ?? '—'} {u.isOwner && <span className="text-[10px] text-muted-foreground">(owner)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge className={cn('text-xs', ROLE_TONE[u.role])}>{u.role}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
