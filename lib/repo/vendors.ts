import { db } from '@/lib/db/sqlite';
import { decryptJson, encryptJson } from '@/lib/crypto/secret-box';
import type { VendorType } from '@/types/submission';

export interface VendorBankDetails {
  accountHolderName?: string;
  accountNumber?: string;
  iban?: string;
  swiftBic?: string;
  bankName?: string;
  bankAddress?: string;
  paymentCurrency?: string;
  notes?: string;
}

export interface Vendor {
  id: string;
  userId: string;
  vendorCode: string | null;
  companyName: string | null;
  country: string;
  vendorType: VendorType | null;
  taxId: string | null;
  vatNumber: string | null;
  status: 'active' | 'suspended' | 'archived';
  /** Decrypted bank details — only populated by the `withBankDetails` helper.
   *  The base list/get returns this as null to avoid leaking sensitive data. */
  bankDetails: VendorBankDetails | null;
}

interface VendorRow {
  id: string;
  user_id: string;
  vendor_code: string | null;
  company_name: string | null;
  country: string;
  vendor_type: VendorType | null;
  tax_id: string | null;
  vat_number: string | null;
  bank_details_encrypted: string | null;
  status: 'active' | 'suspended' | 'archived';
}

const toVendor = (r: VendorRow, includeBank = false): Vendor => ({
  id: r.id,
  userId: r.user_id,
  vendorCode: r.vendor_code,
  companyName: r.company_name,
  country: r.country,
  vendorType: r.vendor_type,
  taxId: r.tax_id,
  vatNumber: r.vat_number,
  status: r.status,
  bankDetails: includeBank
    ? decryptJson<VendorBankDetails>(r.bank_details_encrypted)
    : null,
});

function generateVendorCode(): string {
  // 6 random hex chars → ~16 million combinations; clashes possible but
  // checked at insert time and retried.
  return `V-${Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 16).toString(16).toUpperCase(),
  ).join('')}`;
}

export function findVendorByUserId(userId: string): Vendor | null {
  const r = db().prepare('select * from vendors where user_id = ?').get(userId) as VendorRow | undefined;
  return r ? toVendor(r) : null;
}

export function findVendorById(id: string): Vendor | null {
  const r = db().prepare('select * from vendors where id = ?').get(id) as VendorRow | undefined;
  return r ? toVendor(r) : null;
}

/** Same as `findVendorById` but returns decrypted bank details too. Use only
 *  in finance/admin code paths that actually need to display them. */
export function findVendorByIdWithBank(id: string): Vendor | null {
  const r = db().prepare('select * from vendors where id = ?').get(id) as VendorRow | undefined;
  return r ? toVendor(r, true) : null;
}

export function findOrCreateVendor(userId: string, country = 'GB'): Vendor {
  const existing = findVendorByUserId(userId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  // Generate a unique vendor_code with a retry loop in case of collision.
  let code = generateVendorCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const dup = db().prepare('select 1 from vendors where vendor_code = ?').get(code);
    if (!dup) break;
    code = generateVendorCode();
  }
  db()
    .prepare('insert into vendors (id, user_id, vendor_code, country, status) values (?, ?, ?, ?, ?)')
    .run(id, userId, code, country, 'active');
  return {
    id, userId, vendorCode: code, companyName: null, country,
    vendorType: null, taxId: null, vatNumber: null,
    status: 'active', bankDetails: null,
  };
}

export interface VendorProfileInput {
  companyName: string | null;
  country: string;
  vendorType: VendorType;
  taxId: string | null;
  vatNumber: string | null;
}

export function updateVendorProfile(id: string, input: VendorProfileInput) {
  db()
    .prepare(`
      update vendors
      set company_name = ?, country = ?, vendor_type = ?, tax_id = ?, vat_number = ?
      where id = ?
    `)
    .run(input.companyName, input.country, input.vendorType, input.taxId, input.vatNumber, id);
}

export function updateVendorBankDetails(id: string, details: VendorBankDetails) {
  // Drop empty strings so the decrypted shape stays clean.
  const clean: VendorBankDetails = {};
  for (const [k, v] of Object.entries(details)) {
    if (typeof v === 'string' && v.trim().length > 0) {
      (clean as Record<string, string>)[k] = v.trim();
    }
  }
  const encrypted = Object.keys(clean).length > 0 ? encryptJson(clean) : null;
  db().prepare('update vendors set bank_details_encrypted = ? where id = ?').run(encrypted, id);
}

export function getVendorBankDetails(id: string): VendorBankDetails | null {
  const r = db()
    .prepare('select bank_details_encrypted from vendors where id = ?')
    .get(id) as { bank_details_encrypted: string | null } | undefined;
  if (!r) return null;
  return decryptJson<VendorBankDetails>(r.bank_details_encrypted);
}

/** True iff every required bank field is filled in. */
export function hasBankDetails(b: VendorBankDetails | null): boolean {
  if (!b) return false;
  return !!(b.accountHolderName && (b.accountNumber || b.iban) && (b.swiftBic || b.bankName));
}
