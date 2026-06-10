import { createClient } from '@supabase/supabase-js';
import { requireSupabaseEnv } from '@/lib/env';

/**
 * Service-role Supabase client. Bypasses RLS.
 * NEVER use in code paths reachable by untrusted input without explicit role checks.
 * Use only for: Clerk webhooks, Inngest jobs, and seed/admin scripts.
 *
 * Throws a clear error if Supabase env vars aren't configured yet — Phase 1
 * dashboards don't touch the DB so this lazy-throws on first use.
 */
export function supabaseAdmin() {
  const e = requireSupabaseEnv();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
