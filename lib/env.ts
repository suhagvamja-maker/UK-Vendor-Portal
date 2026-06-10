import { z } from 'zod';

/**
 * Required when Clerk is wired (the production auth path).
 * Other integrations remain optional and lazy-throw on first use.
 */
const schema = z.object({
  // Clerk — required
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, 'Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in .env.local'),
  CLERK_SECRET_KEY: z.string().min(1, 'Set CLERK_SECRET_KEY in .env.local'),
  // The single super-admin: first sign-up with this email becomes the owner.
  OWNER_EMAIL: z.string().email().optional(),
  CLERK_JWT_TEMPLATE: z.string().default('supabase'),
  // 32-byte hex string used to encrypt sensitive at-rest fields (bank details,
  // TIN, DOB). If unset, we fall back to deriving a key from CLERK_SECRET_KEY
  // in dev so things just work — set this explicitly before production.
  APP_ENCRYPTION_KEY: z.string().optional(),
  // Supabase — optional until production swap
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // Resend / Inngest — optional
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;
  cached = schema.parse(process.env);
  return cached;
}

export function requireSupabaseEnv() {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY || !e.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in .env.local.',
    );
  }
  return e as Required<Pick<typeof e, 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'>> & typeof e;
}
