# Invoice & Compliance Management System

Phase 1 foundation. Next.js 16 + Clerk + Supabase + Inngest.

See `../CLAUDE.md` for the full product spec.

## Phase 1 status

What's in this scaffold:

- Next.js 16 App Router, TypeScript strict, Tailwind v4, shadcn/ui
- Clerk auth with role-based routing (`vendor` / `admin` / `finance`)
- Supabase schema + RLS for all tables (`supabase/migrations/0001_initial.sql`)
- Document requirements seed (`supabase/seed.sql`)
- State machine (`lib/state-machine/`) — the one allowed mutator of `submissions.status`
- Notifications event bus skeleton via Inngest (`lib/inngest/`, `lib/notifications/`)
- Three empty dashboard shells: `/vendor/dashboard`, `/admin/queue`, `/finance/queue`

Not in Phase 1 (start of Phase 2+):

- Submission form + file upload (Phase 2)
- Review screen + comment thread (Phase 3)
- HOD Approval PDF generation (Phase 3)
- Re-upload + versioning (Phase 5)
- Resend email templates beyond plaintext (Phase 6)
- Audit log viewer UI (Phase 6)

## Setup

### 1. Install deps

```bash
npm install
```

### 2. Create accounts

- [Clerk](https://dashboard.clerk.com) — create an application
- [Supabase](https://supabase.com/dashboard) — create a project
- [Resend](https://resend.com) — optional in Phase 1, needed for email
- [Inngest](https://app.inngest.com) — optional in Phase 1, dev server runs locally

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — from Clerk dashboard → API Keys
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from Supabase project settings → API

### 4. Run database migrations

Either paste `supabase/migrations/0001_initial.sql` into the Supabase SQL editor, then `supabase/seed.sql`, or use the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

### 5. Configure the Clerk JWT template

Clerk dashboard → JWT Templates → New template:

- **Name:** `supabase`
- **Claims:**

```json
{
  "app_role": "{{user.public_metadata.role}}",
  "app_user_id": "{{user.public_metadata.appUserId}}"
}
```

The RLS policies read `app_role` and `app_user_id` from the JWT. Without this template, every authenticated query returns zero rows.

### 6. Provision your first internal user

Phase 1 has no admin invite UI yet. To grant yourself a role:

1. Sign up at `http://localhost:3000/sign-up`
2. Open Clerk dashboard → Users → your user → Edit public metadata:

```json
{ "role": "admin", "appUserId": "<uuid from users table>" }
```

3. Insert the matching row into `public.users` (use Supabase SQL editor):

```sql
insert into public.users (id, clerk_user_id, email, role, name)
values (gen_random_uuid(), '<clerk_user_id>', '<email>', 'admin', '<name>')
returning id;
```

4. Copy the returned `id` into the Clerk user's `public_metadata.appUserId`.
5. Sign out and back in — your JWT will now include the role.

> Phase 2 ships a Clerk webhook that does steps 3–4 automatically on signup.

### 7. Run the dev server

```bash
npm run dev
```

Visit `http://localhost:3000`. Signing in as a user with role `admin` → `/admin/queue`, `vendor` → `/vendor/dashboard`, `finance` → `/finance/queue`.

## Project layout

```
app/
  (vendor)/vendor/...     — vendor routes, vendor-only layout guard
  (admin)/admin/...       — admin routes, admin-only layout guard
  (finance)/finance/...   — finance routes, finance-only layout guard
  api/inngest/route.ts    — Inngest function host
  sign-in/, sign-up/      — Clerk hosted UI
  onboarding/             — landing for users without a role yet
components/
  ui/                     — shadcn/ui primitives
  shared/                 — components used by 2+ modules (e.g. ModuleShell)
lib/
  auth/require.ts         — role guards for routes/server actions
  db/server.ts            — per-request Supabase client (RLS-enforced)
  db/admin.ts             — service-role client (Inngest, webhooks only)
  env.ts                  — Zod-validated env access
  state-machine/          — submission status transitions (single source of truth)
  notifications/          — recipient resolution + idempotent delivery
  inngest/                — event bus + handlers
supabase/
  migrations/0001_initial.sql
  seed.sql
types/                    — shared TypeScript types
proxy.ts                  — Clerk proxy (formerly middleware.ts in Next.js ≤15)
```

## Security

The defense-in-depth model from `CLAUDE.md` §12:

- **RLS policies** in Postgres enforce the data boundary regardless of caller bugs.
- **Route guards** (`requireRole(...)` in `lib/auth/require.ts`) reject wrong-role callers with a clear 403.
- **Module guards** (per-route-group `layout.tsx`) redirect early on the server.
- The service-role Supabase key is used ONLY in `lib/db/admin.ts` and is never imported from a route reachable by user input.

## Next step

Phase 2: Vendor submission flow. See `../CLAUDE.md` §11.
