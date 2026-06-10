import { z } from 'zod';

export const vendorProfileSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name is required').max(200),
  country: z
    .string()
    .trim()
    .length(2, 'Use a 2-letter ISO country code (e.g. GB, US)')
    .toUpperCase(),
  vendorType: z.enum(['individual', 'company']),
  taxId: z.string().trim().max(50).optional().or(z.literal('')).transform((v) => v || null),
  // VAT only validated when country is GB; per CLAUDE.md §9.
  vatNumber: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
}).superRefine((val, ctx) => {
  if (val.country === 'GB' && val.vatNumber) {
    const ok = /^GB\d{9}(\d{3})?$/.test(val.vatNumber);
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vatNumber'],
        message: 'UK VAT must be GB followed by 9 or 12 digits',
      });
    }
  }
});

export type VendorProfileInput = z.infer<typeof vendorProfileSchema>;
