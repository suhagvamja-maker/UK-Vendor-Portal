import { requireRole } from '@/lib/auth/require';
import { findOrCreateVendor, getVendorBankDetails } from '@/lib/repo/vendors';
import { listProfileRequirementsFor } from '@/lib/repo/documents';
import { listCurrentVendorDocuments } from '@/lib/repo/vendor-documents';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProfileForm } from './profile-form';
import { ProfileDocRow } from './profile-doc-row';
import { BankDetailsForm } from './bank-details-form';

export default async function VendorProfilePage() {
  const user = await requireRole('vendor');
  const vendor = findOrCreateVendor(user.appUserId);
  const bank = getVendorBankDetails(vendor.id);

  const profileDocs = vendor.vendorType
    ? listProfileRequirementsFor(vendor.vendorType)
    : [];
  const current = listCurrentVendorDocuments(vendor.id);
  const docByCode = new Map(current.map((d) => [d.docCode, d]));

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Company profile</h1>
          <p className="text-sm text-muted-foreground">
            Your company details, bank info, and compliance documents.
          </p>
        </div>
        {vendor.vendorCode && (
          <Badge className="text-xs bg-slate-100 text-slate-700 font-mono">
            {vendor.vendorCode}
          </Badge>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Company details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initial={{
              companyName: vendor.companyName ?? '',
              country: vendor.country ?? 'GB',
              vendorType: vendor.vendorType ?? 'company',
              taxId: vendor.taxId ?? '',
              vatNumber: vendor.vatNumber ?? '',
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank details</CardTitle>
          <CardDescription>
            Where you want to be paid. Stored encrypted at rest. Finance sees these
            only while reviewing your invoices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BankDetailsForm
            initial={{
              accountHolderName: bank?.accountHolderName ?? '',
              accountNumber: bank?.accountNumber ?? '',
              iban: bank?.iban ?? '',
              swiftBic: bank?.swiftBic ?? '',
              bankName: bank?.bankName ?? '',
              bankAddress: bank?.bankAddress ?? '',
              paymentCurrency: bank?.paymentCurrency ?? '',
              notes: bank?.notes ?? '',
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance documents</CardTitle>
          <CardDescription>
            Required to raise invoices. Documents reset every <strong>1 April</strong> for the new
            financial year — re-upload after that date to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!vendor.vendorType ? (
            <p className="text-sm text-muted-foreground">
              Save your company details above first — the compliance checklist depends on whether
              you are submitting as an individual or a company.
            </p>
          ) : profileDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No compliance documents required.</p>
          ) : (
            <div className="space-y-2 divide-y">
              {profileDocs.map((req) => (
                <div key={req.id} className="py-3 first:pt-0">
                  <ProfileDocRow requirement={req} current={docByCode.get(req.docCode) ?? null} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
