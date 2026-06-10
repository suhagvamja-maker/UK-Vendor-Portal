import { createClient } from '@supabase/supabase-js';
import { requireSupabaseEnv } from '@/lib/env';

/**
 * Per-request Supabase client.
 *
 * Dev mode: uses the anon key only. RLS will return zero rows for any
 * table that requires a JWT claim — that's by design; the Phase 1 shells
 * don't query the DB yet.
 *
 * Production: this will be swapped to pass a Clerk-issued JWT containing
 * `app_role` and `app_user_id` claims, which the RLS policies in
 * 0001_initial.sql read via `current_app_role()` / `current_app_user_id()`.
 */
export async function supabaseServer() {
  const e = requireSupabaseEnv();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
