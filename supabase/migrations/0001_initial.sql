-- =====================================================================
-- Invoice & Compliance Management System — Initial Schema
-- Source of truth: CLAUDE.md sections 5 and 6
-- =====================================================================

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- users: mirror of Clerk identity for FK joins
-- ---------------------------------------------------------------------
create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  email text not null,
  role text not null check (role in ('vendor', 'admin', 'finance')),
  name text,
  created_at timestamptz not null default now()
);

create index idx_users_clerk_user_id on public.users(clerk_user_id);

-- ---------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  company_name text,
  country text not null,
  vendor_type text check (vendor_type in ('individual', 'company')),
  tax_id text,
  vat_number text,
  bank_details_encrypted text,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  unique(user_id)
);

-- ---------------------------------------------------------------------
-- submissions
-- ---------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  invoice_number text not null,
  po_number text,
  amount numeric(15,2) not null,
  currency text not null check (currency in ('GBP', 'USD', 'EUR', 'INR')),
  vendor_type text not null check (vendor_type in ('individual', 'company')),
  status text not null default 'draft' check (status in (
    'draft', 'pending_admin', 'pending_finance',
    'returned_to_vendor', 'returned_to_admin',
    'approved', 'paid', 'rejected'
  )),
  current_version int not null default 1,
  submitted_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vendor_id, invoice_number)
);

create index idx_submissions_status_updated on public.submissions(status, updated_at);
create index idx_submissions_vendor on public.submissions(vendor_id);

-- ---------------------------------------------------------------------
-- document_requirements (config-driven catalogue)
-- ---------------------------------------------------------------------
create table public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  doc_code text unique not null,
  display_name text not null,
  description text,
  is_mandatory boolean not null default true,
  applies_to text not null check (applies_to in ('individual', 'company', 'both')),
  validation_rules_json jsonb,
  display_order int,
  is_system_generated boolean not null default false
);

-- ---------------------------------------------------------------------
-- submission_documents
-- ---------------------------------------------------------------------
create table public.submission_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  doc_requirement_id uuid not null references public.document_requirements(id),
  file_url text,
  file_size_bytes int,
  file_mime_type text,
  version int not null default 1,
  is_current boolean not null default true,
  status text not null default 'not_uploaded' check (status in (
    'not_uploaded', 'uploaded', 'admin_approved',
    'admin_rejected', 'finance_approved', 'finance_rejected'
  )),
  -- TRC fields
  trc_issued_country text,
  trc_financial_year text,
  trc_valid_from date,
  trc_valid_to date,
  -- No PE Declaration fields
  director_name text,
  tin_number text,
  director_dob date,
  -- Address proof
  address_text text,
  document_date date,
  matches_trc_address boolean,
  -- Generic expiry
  expiry_date date,
  -- Audit
  uploaded_by uuid references public.users(id),
  uploaded_at timestamptz,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_subdocs_submission on public.submission_documents(submission_id);
create index idx_subdocs_current on public.submission_documents(submission_id, is_current);

-- ---------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  document_id uuid references public.submission_documents(id) on delete cascade,
  author_id uuid not null references public.users(id),
  body text not null,
  action_taken text check (action_taken in (
    'commented', 'approved', 'rejected',
    'returned_to_vendor', 'returned_to_admin', 'forwarded'
  )),
  visibility text not null default 'all' check (visibility in ('all', 'vendor', 'internal')),
  parent_comment_id uuid references public.comments(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_comments_submission on public.comments(submission_id, created_at);

-- ---------------------------------------------------------------------
-- audit_log (append-only)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete set null,
  actor_id uuid references public.users(id),
  event text not null,
  payload_json jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_audit_submission on public.audit_log(submission_id, created_at);

-- ---------------------------------------------------------------------
-- notifications (in-app bell + email send log; idempotency key)
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  recipient_id uuid not null references public.users(id) on delete cascade,
  submission_id uuid references public.submissions(id) on delete cascade,
  channel text not null check (channel in ('email', 'in_app')),
  subject text,
  body text,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_id, recipient_id, channel)
);

create index idx_notifications_recipient on public.notifications(recipient_id, read_at);

-- =====================================================================
-- updated_at trigger
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_submissions_updated
  before update on public.submissions
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Row-Level Security
-- Strategy: RLS is enforced based on a custom JWT claim `app_role`
-- and `app_user_id` set by Clerk → Supabase JWT template.
-- API routes also enforce role (belt + suspenders per CLAUDE.md §12).
-- =====================================================================

alter table public.users enable row level security;
alter table public.vendors enable row level security;
alter table public.submissions enable row level security;
alter table public.document_requirements enable row level security;
alter table public.submission_documents enable row level security;
alter table public.comments enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;

-- Helpers ------------------------------------------------------------
create or replace function public.current_app_role() returns text
language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'app_role', '');
$$;

create or replace function public.current_app_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'app_user_id', '')::uuid;
$$;

-- users --------------------------------------------------------------
create policy users_self_select on public.users
  for select using (id = public.current_app_user_id() or public.current_app_role() in ('admin','finance'));

-- vendors ------------------------------------------------------------
create policy vendors_self_select on public.vendors
  for select using (
    user_id = public.current_app_user_id()
    or public.current_app_role() in ('admin','finance')
  );

create policy vendors_self_update on public.vendors
  for update using (user_id = public.current_app_user_id());

-- document_requirements: read-only catalogue for all authenticated users
create policy doc_req_read on public.document_requirements
  for select using (public.current_app_role() in ('vendor','admin','finance'));

-- submissions --------------------------------------------------------
create policy submissions_vendor_select on public.submissions
  for select using (
    public.current_app_role() = 'vendor'
    and vendor_id in (select id from public.vendors where user_id = public.current_app_user_id())
  );

create policy submissions_internal_select on public.submissions
  for select using (public.current_app_role() in ('admin','finance'));

create policy submissions_vendor_insert on public.submissions
  for insert with check (
    public.current_app_role() = 'vendor'
    and vendor_id in (select id from public.vendors where user_id = public.current_app_user_id())
  );

create policy submissions_vendor_update on public.submissions
  for update using (
    public.current_app_role() = 'vendor'
    and status in ('draft','returned_to_vendor')
    and vendor_id in (select id from public.vendors where user_id = public.current_app_user_id())
  );

create policy submissions_admin_update on public.submissions
  for update using (
    public.current_app_role() = 'admin'
    and status in ('pending_admin','returned_to_admin')
  );

create policy submissions_finance_update on public.submissions
  for update using (
    public.current_app_role() = 'finance'
    and status in ('pending_finance','approved')
  );

-- submission_documents ----------------------------------------------
create policy subdocs_select on public.submission_documents
  for select using (
    public.current_app_role() in ('admin','finance')
    or submission_id in (
      select s.id from public.submissions s
      join public.vendors v on v.id = s.vendor_id
      where v.user_id = public.current_app_user_id()
    )
  );

create policy subdocs_vendor_write on public.submission_documents
  for insert with check (
    public.current_app_role() = 'vendor'
    and submission_id in (
      select s.id from public.submissions s
      join public.vendors v on v.id = s.vendor_id
      where v.user_id = public.current_app_user_id() and s.status in ('draft','returned_to_vendor')
    )
  );

create policy subdocs_vendor_update on public.submission_documents
  for update using (
    public.current_app_role() = 'vendor'
    and submission_id in (
      select s.id from public.submissions s
      join public.vendors v on v.id = s.vendor_id
      where v.user_id = public.current_app_user_id() and s.status in ('draft','returned_to_vendor')
    )
  );

create policy subdocs_internal_update on public.submission_documents
  for update using (public.current_app_role() in ('admin','finance'));

-- comments -----------------------------------------------------------
create policy comments_select on public.comments
  for select using (
    public.current_app_role() in ('admin','finance')
    or (
      public.current_app_role() = 'vendor'
      and visibility in ('all','vendor')
      and submission_id in (
        select s.id from public.submissions s
        join public.vendors v on v.id = s.vendor_id
        where v.user_id = public.current_app_user_id()
      )
    )
  );

create policy comments_insert on public.comments
  for insert with check (
    author_id = public.current_app_user_id()
    and (
      (public.current_app_role() = 'vendor' and visibility in ('all','vendor'))
      or public.current_app_role() in ('admin','finance')
    )
  );

-- audit_log: read-only for internal roles, append by anyone authenticated.
-- Critically: no UPDATE or DELETE policy → log is append-only by default.
create policy audit_select on public.audit_log
  for select using (public.current_app_role() in ('admin','finance'));

create policy audit_insert on public.audit_log
  for insert with check (public.current_app_role() in ('vendor','admin','finance'));

-- notifications ------------------------------------------------------
create policy notif_self_select on public.notifications
  for select using (recipient_id = public.current_app_user_id());

create policy notif_self_update on public.notifications
  for update using (recipient_id = public.current_app_user_id());
