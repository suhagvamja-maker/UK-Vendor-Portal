import type { AppRole } from '@/types/roles';

/**
 * SLA targets in calendar days. CLAUDE.md §15 flagged real numbers as an open
 * question for the product owner — placeholders here. Change in one place
 * when the answer lands; the queue + review screens read from here.
 */
export const SLA_DAYS: Record<Extract<AppRole, 'admin' | 'finance'>, number> = {
  admin: 3,
  finance: 2,
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface SlaState {
  /** Whole days elapsed since the relevant baseline. */
  ageDays: number;
  /** Hours elapsed (used to format "in 4h" for fresh items). */
  ageHours: number;
  /** Fraction of SLA consumed, e.g. 1.2 = 20% past. */
  ratio: number;
  tone: 'green' | 'amber' | 'red';
  label: string;
}

export function computeSla(baselineIso: string | null | undefined, role: 'admin' | 'finance'): SlaState | null {
  if (!baselineIso) return null;
  const baseline = new Date(baselineIso);
  if (Number.isNaN(baseline.getTime())) return null;
  const now = Date.now();
  const elapsedMs = now - baseline.getTime();
  const ageHours = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60)));
  const ageDays = Math.max(0, Math.floor(elapsedMs / MS_PER_DAY));
  const ratio = elapsedMs / (SLA_DAYS[role] * MS_PER_DAY);

  const tone: 'green' | 'amber' | 'red' =
    ratio >= 1 ? 'red' : ratio >= 0.5 ? 'amber' : 'green';

  let label: string;
  if (ageHours < 24) label = `${ageHours}h`;
  else label = `${ageDays}d`;

  return { ageDays, ageHours, ratio, tone, label };
}

export const SLA_TONE: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-800',
  red:   'bg-rose-100 text-rose-800',
};
