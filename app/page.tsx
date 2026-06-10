import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, currentUser } from '@clerk/nextjs/server';
import { buttonVariants } from '@/components/ui/button';
import { env } from '@/lib/env';
import { ensureUserFromClerk } from '@/lib/repo/users';
import { findOrCreateVendor } from '@/lib/repo/vendors';
import type { AppRole } from '@/types/roles';

const ROLE_HOME: Record<AppRole, string> = {
  vendor: '/vendor/dashboard',
  admin: '/admin/invoices',
  finance: '/finance/invoices',
};

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    const clerkUser = await currentUser();
    if (clerkUser) {
      const email = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress
        ?? clerkUser.emailAddresses[0]?.emailAddress
        ?? '';
      const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
      const metadataRole = (clerkUser.publicMetadata as { role?: string } | undefined)?.role ?? null;

      const dbUser = ensureUserFromClerk({
        clerkUserId: userId,
        email,
        name,
        metadataRole,
        ownerEmail: env().OWNER_EMAIL ?? null,
      });

      if (dbUser.role === 'vendor') {
        findOrCreateVendor(dbUser.id);
      }
      redirect(ROLE_HOME[dbUser.role]);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="text-center space-y-6 mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground text-background font-bold text-base">
            IC
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              Invoice &amp; Compliance
            </h1>
            <p className="text-sm text-muted-foreground">
              Foreign vendor invoicing &amp; tax-compliance workflow.
            </p>
          </div>
        </div>

        <div className="ink-card p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Sign in to continue</h2>
            <p className="text-xs text-muted-foreground">
              Access is invitation only. If you have an invitation link, open it to set up
              your account.
            </p>
          </div>
          <Link href="/sign-in" className={buttonVariants({ size: 'lg' })}>
            Sign in
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Trouble signing in? Ask the system owner to send you a fresh link.
        </p>
      </div>
    </main>
  );
}
