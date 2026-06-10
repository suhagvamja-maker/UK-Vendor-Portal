-- Seed the document_requirements catalogue (CLAUDE.md §4)
-- Run once after migrations.

insert into public.document_requirements
  (doc_code, display_name, description, is_mandatory, applies_to, display_order, is_system_generated, validation_rules_json)
values
  ('agreement',            'Agreement',
   'Signed agreement in name of company or individual.',
   true, 'both', 10, false,
   '{"mime": ["application/pdf"], "captureExpiry": true}'),

  ('no_pe_declaration',    'No PE Declaration',
   'On official letterhead, director-signed. Capture director_name, tin_number, director_dob.',
   true, 'both', 20, false,
   '{"mime": ["application/pdf"], "structuredFields": ["director_name","tin_number","director_dob"]}'),

  ('trc',                  'Tax Residency Certificate',
   '3 pages, issued by vendor''s country, current FY (UK: Certificate of Residence).',
   true, 'both', 30, false,
   '{"mime": ["application/pdf"], "pageCount": 3, "requireCurrentFY": true}'),

  ('hod_approval',         'HOD Approval',
   'System-generated PDF on Admin approval. Vendor cannot upload.',
   true, 'both', 40, true,
   '{}'),

  ('form_10f',             'Form 10F Declaration',
   'Annual, signed.',
   true, 'both', 50, false,
   '{"mime": ["application/pdf"], "annual": true}'),

  ('passport',             'Passport (ID Proof)',
   'Individual vendors only. Image or PDF, max 10MB.',
   true, 'individual', 60, false,
   '{"mime": ["application/pdf","image/jpeg","image/png"], "maxSizeMb": 10}'),

  ('address_proof',        'Address Proof',
   'Utility bill or bank statement dated within 90 days; must match TRC address.',
   true, 'both', 70, false,
   '{"mime": ["application/pdf","image/jpeg","image/png"], "maxAgeDays": 90, "fuzzyMatchTrcAddress": true}'),

  ('certificate_of_incorporation', 'Certificate of Incorporation',
   'Company vendors only.',
   true, 'company', 80, false,
   '{"mime": ["application/pdf"]}')
on conflict (doc_code) do nothing;
