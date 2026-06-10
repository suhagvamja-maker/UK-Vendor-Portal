import { z } from 'zod';

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null);

export const glCodingSchema = z.object({
  glAccountCode: optional(50),
  glCostCenter: optional(50),
  glNotes: optional(500),
});

export type GlCodingFormInput = z.infer<typeof glCodingSchema>;
