import type { Currency } from '@/types/submission';

/**
 * Resolve the from-currency → GBP rate.
 *
 * Dev / starter implementation: a static table of "good-enough" rates so the
 * captureFxRateSnapshot column is populated for audit/reporting without
 * depending on an external API. Swap to a real provider (e.g. exchangerate.host,
 * Wise API, or an internal treasury feed) by replacing the body of this
 * function — the call sites do not change.
 *
 * Returns null if the rate is unknown (calling code should treat as "not
 * captured" and skip persisting).
 */
const STATIC_RATES: Record<Currency, number> = {
  GBP: 1,
  USD: 0.79,
  EUR: 0.85,
  INR: 0.0094,
};

export async function resolveFxRate(currency: Currency): Promise<number | null> {
  const r = STATIC_RATES[currency];
  return typeof r === 'number' ? r : null;
}
