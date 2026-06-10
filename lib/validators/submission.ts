import { z } from 'zod';

export const newSubmissionSchema = z.object({
  vendorType: z.enum(['individual', 'company']),
  invoiceNumber: z.string().trim().min(1, 'Invoice number is required').max(50),
  poNumber: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  currency: z.enum(['GBP', 'USD', 'EUR', 'INR']),
});

export type NewSubmissionInput = z.infer<typeof newSubmissionSchema>;
