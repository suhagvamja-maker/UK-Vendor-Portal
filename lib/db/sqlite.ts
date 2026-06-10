import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

/**
 * SQLite-backed Phase 2 dev store.
 *
 * Schema is a translation of supabase/migrations/0001_initial.sql:
 *  - uuid → TEXT (we generate via crypto.randomUUID())
 *  - jsonb → TEXT (JSON.stringify on write, JSON.parse on read)
 *  - timestamptz → TEXT in ISO 8601
 *  - boolean → INTEGER (0/1)
 *  - check constraints kept
 *  - RLS not applicable (single-process, dev-only)
 *
 * Swap path to Supabase: replace the repository functions in lib/repo/*
 * with Supabase client calls. Call sites do not change.
 */

const DB_DIR = path.join(process.cwd(), '.data');
const DB_PATH = process.env.SQLITE_PATH ?? path.join(DB_DIR, 'app.db');

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  migrate(conn);
  // Seed the base catalogue before additive migrations: the latter inserts
  // payment_receipt which would otherwise skew the prior "count > 0" guard.
  // The seed itself is idempotent (INSERT OR IGNORE keyed on doc_code).
  seedDocumentRequirements(conn);
  applyAdditiveMigrations(conn);
  _db = conn;
  return conn;
}

/**
 * Idempotent additive migrations. SQLite doesn't support
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so we feature-detect via
 * `pragma table_info(...)` and add columns only when missing.
 */
function applyAdditiveMigrations(conn: Database.Database) {
  addColumnIfMissing(conn, 'submissions', 'gl_account_code', 'text');
  addColumnIfMissing(conn, 'submissions', 'gl_cost_center', 'text');
  addColumnIfMissing(conn, 'submissions', 'gl_notes', 'text');
  addColumnIfMissing(conn, 'document_requirements', 'uploaded_by_role', "text not null default 'vendor'");
  // is_profile_doc = compliance doc that lives on the vendor's profile (uploaded
  // once per fiscal year), not per submission. False = submission-scoped (invoice,
  // HOD approval, payment receipt).
  addColumnIfMissing(conn, 'document_requirements', 'is_profile_doc', 'integer not null default 0');
  // is_owner flag: identifies the single super-admin who can invite Admin/Finance.
  addColumnIfMissing(conn, 'users', 'is_owner', 'integer not null default 0');
  // Comments may target a vendor profile doc (in addition to or instead of a
  // submission_document). Comments are still scoped to a submission so the
  // conversation lives with the specific invoice being reviewed.
  addColumnIfMissing(conn, 'comments', 'profile_document_id', 'text');
  // Two-party dispute resolution: a comment with action_taken='disputed' is
  // only fully resolved (resolved_at set) when BOTH the vendor and finance
  // have acknowledged. For non-dispute comments these columns are unused —
  // resolved_at is set directly. Admin can resolve on behalf of finance if
  // needed (audit log captures who actually clicked).
  addColumnIfMissing(conn, 'comments', 'resolved_by_vendor_at', 'text');
  addColumnIfMissing(conn, 'comments', 'resolved_by_finance_at', 'text');
  // FX rate captured at the moment Finance approves — gives an audit trail
  // for the GBP-equivalent that downstream payment exports use. NULL on
  // unapproved + legacy rows.
  addColumnIfMissing(conn, 'submissions', 'fx_rate_to_gbp', 'real');
  addColumnIfMissing(conn, 'submissions', 'fx_rate_captured_at', 'text');
  // Human-friendly vendor code (e.g. V-A1B2C3) used in exports + UIs.
  addColumnIfMissing(conn, 'vendors', 'vendor_code', 'text');
  // Backfill vendor codes for any rows that don't have one yet.
  conn
    .prepare(`update vendors set vendor_code = 'V-' || upper(substr(hex(randomblob(3)), 1, 6)) where vendor_code is null`)
    .run();
  // Backfill: HOD Approval is system-generated, payment receipt is finance.
  conn
    .prepare(`update document_requirements set uploaded_by_role = 'system' where doc_code = 'hod_approval' and uploaded_by_role != 'system'`)
    .run();
  conn
    .prepare(`update document_requirements set uploaded_by_role = 'finance' where doc_code = 'payment_receipt' and uploaded_by_role != 'finance'`)
    .run();
  // Compliance docs live on the vendor profile.
  const profileDocCodes = ['agreement','no_pe_declaration','trc','form_10f','passport','address_proof','certificate_of_incorporation'];
  for (const code of profileDocCodes) {
    conn.prepare('update document_requirements set is_profile_doc = 1 where doc_code = ?').run(code);
  }
  // Submission-scoped docs explicitly off.
  for (const code of ['invoice','hod_approval','payment_receipt']) {
    conn.prepare('update document_requirements set is_profile_doc = 0 where doc_code = ?').run(code);
  }
  ensurePaymentReceiptRequirement(conn);
  ensureInvoiceRequirement(conn);
  ensureVendorDocumentsTable(conn);
}

function ensureInvoiceRequirement(conn: Database.Database) {
  const exists = conn.prepare('select 1 from document_requirements where doc_code = ?').get('invoice');
  if (exists) return;
  conn
    .prepare(`
      insert into document_requirements
        (id, doc_code, display_name, description, is_mandatory, applies_to,
         display_order, is_system_generated, uploaded_by_role, is_profile_doc, validation_rules_json)
      values (?, ?, ?, ?, 1, 'both', 5, 0, 'vendor', 0, ?)
    `)
    .run(
      crypto.randomUUID(),
      'invoice',
      'Invoice',
      'The invoice PDF for this submission. Uploaded once per submission.',
      JSON.stringify({ mime: ['application/pdf'], maxSizeMb: 10 }),
    );
}

function ensureVendorDocumentsTable(conn: Database.Database) {
  conn.exec(`
    create table if not exists vendor_documents (
      id text primary key,
      vendor_id text not null references vendors(id) on delete cascade,
      doc_requirement_id text not null references document_requirements(id),
      file_url text,
      file_size_bytes integer,
      file_mime_type text,
      version integer not null default 1,
      is_current integer not null default 1,
      status text not null default 'uploaded' check (status in (
        'uploaded','admin_approved','admin_rejected','finance_approved','finance_rejected','expired'
      )),
      trc_issued_country text,
      trc_financial_year text,
      trc_valid_from text,
      trc_valid_to text,
      director_name text,
      tin_number text,
      director_dob text,
      address_text text,
      document_date text,
      matches_trc_address integer,
      expiry_date text,
      uploaded_by text references users(id),
      uploaded_at text,
      created_at text not null default (datetime('now'))
    );
    create index if not exists idx_vdocs_vendor_current on vendor_documents(vendor_id, is_current);
    create index if not exists idx_vdocs_vendor_req on vendor_documents(vendor_id, doc_requirement_id);
  `);
}

function ensurePaymentReceiptRequirement(conn: Database.Database) {
  const exists = conn
    .prepare('select 1 from document_requirements where doc_code = ?')
    .get('payment_receipt');
  if (exists) return;
  conn
    .prepare(`
      insert into document_requirements
        (id, doc_code, display_name, description, is_mandatory, applies_to,
         display_order, is_system_generated, uploaded_by_role, validation_rules_json)
      values (?, ?, ?, ?, 0, 'both', 90, 0, 'finance', ?)
    `)
    .run(
      crypto.randomUUID(),
      'payment_receipt',
      'Payment receipt',
      'Finance-uploaded proof of payment (wire transfer reference, bank confirmation, etc.). Optional.',
      JSON.stringify({ mime: ['application/pdf', 'image/jpeg', 'image/png'], maxSizeMb: 10 }),
    );
}

function addColumnIfMissing(conn: Database.Database, table: string, column: string, definition: string) {
  const cols = conn.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    conn.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}

function migrate(conn: Database.Database) {
  conn.exec(`
    create table if not exists users (
      id text primary key,
      clerk_user_id text unique not null,
      email text not null,
      role text not null check (role in ('vendor','admin','finance')),
      name text,
      created_at text not null default (datetime('now'))
    );

    create table if not exists vendors (
      id text primary key,
      user_id text not null unique references users(id),
      company_name text,
      country text not null,
      vendor_type text check (vendor_type in ('individual','company')),
      tax_id text,
      vat_number text,
      bank_details_encrypted text,
      status text not null default 'active' check (status in ('active','suspended','archived')),
      created_at text not null default (datetime('now'))
    );

    create table if not exists submissions (
      id text primary key,
      vendor_id text not null references vendors(id),
      invoice_number text not null,
      po_number text,
      amount real not null,
      currency text not null check (currency in ('GBP','USD','EUR','INR')),
      vendor_type text not null check (vendor_type in ('individual','company')),
      status text not null default 'draft' check (status in (
        'draft','pending_admin','pending_finance',
        'returned_to_vendor','returned_to_admin',
        'approved','paid','rejected'
      )),
      current_version integer not null default 1,
      submitted_at text,
      approved_at text,
      paid_at text,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      unique(vendor_id, invoice_number)
    );
    create index if not exists idx_submissions_status_updated on submissions(status, updated_at);
    create index if not exists idx_submissions_vendor on submissions(vendor_id);

    create table if not exists document_requirements (
      id text primary key,
      doc_code text unique not null,
      display_name text not null,
      description text,
      is_mandatory integer not null default 1,
      applies_to text not null check (applies_to in ('individual','company','both')),
      validation_rules_json text,
      display_order integer,
      is_system_generated integer not null default 0
    );

    create table if not exists submission_documents (
      id text primary key,
      submission_id text not null references submissions(id) on delete cascade,
      doc_requirement_id text not null references document_requirements(id),
      file_url text,
      file_size_bytes integer,
      file_mime_type text,
      version integer not null default 1,
      is_current integer not null default 1,
      status text not null default 'not_uploaded' check (status in (
        'not_uploaded','uploaded','admin_approved',
        'admin_rejected','finance_approved','finance_rejected'
      )),
      trc_issued_country text,
      trc_financial_year text,
      trc_valid_from text,
      trc_valid_to text,
      director_name text,
      tin_number text,
      director_dob text,
      address_text text,
      document_date text,
      matches_trc_address integer,
      expiry_date text,
      uploaded_by text references users(id),
      uploaded_at text,
      reviewed_by text references users(id),
      reviewed_at text,
      created_at text not null default (datetime('now'))
    );
    create index if not exists idx_subdocs_submission on submission_documents(submission_id);
    create index if not exists idx_subdocs_current on submission_documents(submission_id, is_current);

    create table if not exists comments (
      id text primary key,
      submission_id text not null references submissions(id) on delete cascade,
      document_id text references submission_documents(id) on delete cascade,
      author_id text not null references users(id),
      body text not null,
      action_taken text,
      visibility text not null default 'all' check (visibility in ('all','vendor','internal')),
      parent_comment_id text references comments(id),
      resolved_at text,
      created_at text not null default (datetime('now'))
    );
    create index if not exists idx_comments_submission on comments(submission_id, created_at);

    create table if not exists audit_log (
      id text primary key,
      submission_id text references submissions(id) on delete set null,
      actor_id text references users(id),
      event text not null,
      payload_json text,
      ip_address text,
      user_agent text,
      created_at text not null default (datetime('now'))
    );
    create index if not exists idx_audit_submission on audit_log(submission_id, created_at);

    create table if not exists notifications (
      id text primary key,
      event_id text not null,
      recipient_id text not null references users(id) on delete cascade,
      submission_id text references submissions(id) on delete cascade,
      channel text not null check (channel in ('email','in_app')),
      subject text,
      body text,
      read_at text,
      sent_at text,
      created_at text not null default (datetime('now')),
      unique(event_id, recipient_id, channel)
    );
    create index if not exists idx_notifications_recipient on notifications(recipient_id, read_at);
  `);
}

function seedDocumentRequirements(conn: Database.Database) {
  // Idempotent seed: uses INSERT OR IGNORE keyed on doc_code (unique).
  // Safe to call every boot — adds missing docs without disturbing existing rows.
  // Previously this short-circuited on `count > 0`, which broke when
  // applyAdditiveMigrations inserted payment_receipt first.
  const insert = conn.prepare(`
    insert or ignore into document_requirements
      (id, doc_code, display_name, description, is_mandatory, applies_to, display_order, is_system_generated, validation_rules_json)
    values (@id, @doc_code, @display_name, @description, @is_mandatory, @applies_to, @display_order, @is_system_generated, @validation_rules_json)
  `);

  const rows = [
    { doc_code: 'agreement',                       display_name: 'Agreement',                       description: 'Signed agreement in name of company or individual.',                                              applies_to: 'both',       display_order: 10, is_system_generated: 0, rules: { mime: ['application/pdf'], captureExpiry: true } },
    { doc_code: 'no_pe_declaration',               display_name: 'No PE Declaration',               description: 'On letterhead, director-signed. Capture director_name, tin_number, director_dob.',                applies_to: 'both',       display_order: 20, is_system_generated: 0, rules: { mime: ['application/pdf'], structuredFields: ['director_name','tin_number','director_dob'] } },
    { doc_code: 'trc',                             display_name: 'Tax Residency Certificate',       description: '3 pages, issued by your country, for the current FY (UK: Certificate of Residence).',           applies_to: 'both',       display_order: 30, is_system_generated: 0, rules: { mime: ['application/pdf'], pageCount: 3, requireCurrentFY: true } },
    { doc_code: 'hod_approval',                    display_name: 'HOD Approval',                    description: 'System-generated on Admin approval. You cannot upload this.',                                    applies_to: 'both',       display_order: 40, is_system_generated: 1, rules: {} },
    { doc_code: 'form_10f',                        display_name: 'Form 10F Declaration',            description: 'Annual, signed.',                                                                                applies_to: 'both',       display_order: 50, is_system_generated: 0, rules: { mime: ['application/pdf'], annual: true } },
    { doc_code: 'passport',                        display_name: 'Passport (ID Proof)',             description: 'Individual vendors only. Image or PDF, max 10MB.',                                              applies_to: 'individual', display_order: 60, is_system_generated: 0, rules: { mime: ['application/pdf','image/jpeg','image/png'], maxSizeMb: 10 } },
    { doc_code: 'address_proof',                   display_name: 'Address Proof',                   description: 'Utility bill or bank statement dated within 90 days; must match TRC address.',                  applies_to: 'both',       display_order: 70, is_system_generated: 0, rules: { mime: ['application/pdf','image/jpeg','image/png'], maxAgeDays: 90, fuzzyMatchTrcAddress: true } },
    { doc_code: 'certificate_of_incorporation',    display_name: 'Certificate of Incorporation',    description: 'Company vendors only.',                                                                          applies_to: 'company',    display_order: 80, is_system_generated: 0, rules: { mime: ['application/pdf'] } },
  ];

  const tx = conn.transaction(() => {
    for (const r of rows) {
      insert.run({
        id: crypto.randomUUID(),
        doc_code: r.doc_code,
        display_name: r.display_name,
        description: r.description,
        is_mandatory: 1,
        applies_to: r.applies_to,
        display_order: r.display_order,
        is_system_generated: r.is_system_generated,
        validation_rules_json: JSON.stringify(r.rules),
      });
    }
  });
  tx();
}
