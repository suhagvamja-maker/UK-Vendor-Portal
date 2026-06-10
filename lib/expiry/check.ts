import { db } from '@/lib/db/sqlite';
import { notifyTrcExpiringSoon } from '@/lib/notifications/notify';

/**
 * Compliance expiry sweep (CLAUDE.md §4).
 *
 *  - TRC: valid for one financial year. We treat April 1 as the FY rollover
 *    and warn vendors when their TRC's `trc_valid_to` is within the warning
 *    window. On April 1 (cron in prod), all expired TRC docs should be
 *    cycled — implemented here as an idempotent `markExpired` pass.
 *  - Agreement: vendor-supplied `expiry_date` on upload; warn 60 days out.
 *  - Form 10F: same annual logic as TRC.
 *
 * Dev: invoke manually from /admin/audit's "Run expiry check" action.
 * Prod: schedule via Inngest cron on a daily tick (Phase 7).
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface ExpiringDoc {
  vendorUserId: string;
  vendorCompanyName: string | null;
  docCode: string;
  docDisplayName: string;
  /** ISO date string when the doc lapses. */
  expiresOn: string;
  daysRemaining: number;
}

interface RawExpiring {
  vendor_user_id: string;
  company_name: string | null;
  doc_code: string;
  display_name: string;
  expires_on: string;
}

/**
 * All currently-attached compliance docs whose effective expiry is within
 * `withinDays` days. Returns the most-imminent first.
 */
export function listExpiringSoon(withinDays = 60): ExpiringDoc[] {
  const cutoff = new Date(Date.now() + withinDays * MS_PER_DAY).toISOString().slice(0, 10);
  // We coalesce the effective expiry: TRC uses trc_valid_to, others use expiry_date.
  const rows = db()
    .prepare(`
      select v.user_id as vendor_user_id, v.company_name,
             dr.doc_code, dr.display_name,
             coalesce(sd.trc_valid_to, sd.expiry_date) as expires_on
      from submission_documents sd
      join document_requirements dr on dr.id = sd.doc_requirement_id
      join submissions s on s.id = sd.submission_id
      join vendors v on v.id = s.vendor_id
      where sd.is_current = 1
        and coalesce(sd.trc_valid_to, sd.expiry_date) is not null
        and coalesce(sd.trc_valid_to, sd.expiry_date) <= ?
      order by expires_on asc
    `)
    .all(cutoff) as RawExpiring[];

  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({
    vendorUserId: r.vendor_user_id,
    vendorCompanyName: r.company_name,
    docCode: r.doc_code,
    docDisplayName: r.display_name,
    expiresOn: r.expires_on,
    daysRemaining: Math.max(0, Math.round(
      (new Date(r.expires_on).getTime() - new Date(today).getTime()) / MS_PER_DAY,
    )),
  }));
}

/**
 * For a single vendor user, return their imminent doc-expiry warnings.
 * Used by the vendor dashboard banner.
 */
export function expiringForVendor(vendorUserId: string, withinDays = 60): ExpiringDoc[] {
  return listExpiringSoon(withinDays).filter((d) => d.vendorUserId === vendorUserId);
}

/**
 * Send the 30-day-out TRC warning to every affected vendor. Idempotent
 * because notifyTrcExpiringSoon uses an event_id keyed on (vendor, expiry).
 */
export async function runExpirySweep(): Promise<{ notified: number }> {
  const upcoming = listExpiringSoon(30);
  let notified = 0;
  for (const d of upcoming) {
    if (d.docCode !== 'trc' && d.docCode !== 'form_10f') continue;
    try {
      await notifyTrcExpiringSoon(d.vendorUserId, d.daysRemaining, d.expiresOn);
      notified++;
    } catch (err) {
      console.error('[expiry] notify failed', err);
    }
  }
  return { notified };
}
