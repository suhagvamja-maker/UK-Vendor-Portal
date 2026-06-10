import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listUsersByRole } from '@/lib/repo/users';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  // Clerk's invitation flow ships a `__clerk_ticket` query param. If it's
  // present we're handling a valid invitation — render the Clerk widget.
  const ticket = params.__clerk_ticket || params.__clerk_status;
  const hasInvite = typeof ticket === 'string' && ticket.length > 0;

  // Bootstrap escape: if the system has no admin yet, allow public signup so
  // OWNER_EMAIL can self-register. The lazy-sync in lib/auth/require.ts will
  // promote that first signup to admin/owner automatically.
  const ownerExists = listUsersByRole('admin').length > 0;

  if (!hasInvite && ownerExists) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Sign-up is invitation only</CardTitle>
            <CardDescription>
              Ask your contact for a sign-up link. Links expire in 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Already have an account?{' '}
              <Link href="/sign-in" className="text-blue-600 hover:underline">
                Sign in
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <SignUp signInUrl="/sign-in" />
    </main>
  );
}
