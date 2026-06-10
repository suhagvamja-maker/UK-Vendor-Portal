import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { VendorBankDetails } from '@/lib/repo/vendors';

export function BankCard({ bank, vendorCode }: { bank: VendorBankDetails | null; vendorCode: string | null }) {
  const rows: Array<[string, string | undefined]> = [
    ['Vendor code', vendorCode ?? undefined],
    ['Account holder', bank?.accountHolderName],
    ['Account number', bank?.accountNumber],
    ['IBAN', bank?.iban],
    ['SWIFT / BIC', bank?.swiftBic],
    ['Bank', bank?.bankName],
    ['Bank address', bank?.bankAddress],
    ['Currency', bank?.paymentCurrency],
    ['Notes', bank?.notes],
  ];
  const filled = rows.filter(([, v]) => v && v.trim().length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment details</CardTitle>
        <CardDescription>Where this vendor should be paid.</CardDescription>
      </CardHeader>
      <CardContent>
        {filled.length === 0 ? (
          <p className="text-sm text-amber-700">
            ⚠ Vendor has not added bank details. Ask them to update their profile.
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm">
            {filled.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium break-all whitespace-pre-wrap">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
