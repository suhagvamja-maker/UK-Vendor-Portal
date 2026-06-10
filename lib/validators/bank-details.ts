import { z } from 'zod';

const text = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('')).transform((v) => v || undefined);

export const bankDetailsSchema = z.object({
  accountHolderName: text(120),
  accountNumber: text(40),
  iban: text(40),
  swiftBic: text(20),
  bankName: text(120),
  bankAddress: text(300),
  paymentCurrency: text(10),
  notes: text(500),
}).superRefine((val, ctx) => {
  if (!val.accountHolderName && !val.accountNumber && !val.iban) {
    // Empty form = clear bank details, allowed.
    return;
  }
  if (!val.accountHolderName) {
    ctx.addIssue({ path: ['accountHolderName'], code: z.ZodIssueCode.custom, message: 'Required when adding bank details.' });
  }
  if (!val.accountNumber && !val.iban) {
    ctx.addIssue({ path: ['accountNumber'], code: z.ZodIssueCode.custom, message: 'Provide either an account number or an IBAN.' });
  }
});

export type BankDetailsInput = z.infer<typeof bankDetailsSchema>;
