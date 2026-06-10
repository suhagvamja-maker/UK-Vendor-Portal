import Link from 'next/link';
import { requireRole } from '@/lib/auth/require';
import { findOrCreateVendor } from '@/lib/repo/vendors';
import { checkProfileCompleteness } from '@/lib/expiry/fy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { NewSubmissionForm } from './new-submission-form';

export default async function NewSubmissionPage() {
  const user = await requireRole('vendor');
  const vendor = findOrCreateVendor(user.appUserId);
  const profile = checkProfileCompleteness(vendor.id, vendor.vendorType);

  if (!profile.complete) {
    return (
      <div className="space-y-6 max-w-2xl">
        <header>
          <h1 className="text-2xl font-semibold">New submission</h1>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Complete your profile first</CardTitle>
            <CardDescription>
              You can&apos;t raise invoices until your compliance documents are uploaded for the current
              financial year ({profile.fy.label}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-sm space-y-1">
              {profile.missing.map((m) => (
                <li key={m.docCode} className="flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>{m.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.reason === 'missing' && '— not uploaded'}
                    {m.reason === 'expired' && '— expired'}
                    {m.reason === 'stale' && '— uploaded before this financial year'}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/vendor/profile" className={buttonVariants()}>
              Go to profile
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold">New submission</h1>
        <p className="text-sm text-muted-foreground">
          Enter invoice details and attach the invoice PDF. Your profile&apos;s compliance documents
          (FY {profile.fy.label}) are already linked automatically.
        </p>
      </header>
      <NewSubmissionForm
        defaults={{
          vendorType: vendor.vendorType ?? 'company',
          currency: vendor.country === 'GB' ? 'GBP' : 'GBP',
        }}
      />
    </div>
  );
}
