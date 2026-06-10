import { cn } from '@/lib/utils';

/**
 * Red "Dispute" pill rendered next to the status pill anywhere a submission
 * with at least one unresolved dispute is shown — tables, detail headers,
 * tab badges. Keeps the StatusPill semantics clean (it always shows the
 * workflow status) while making the dispute visible at a glance.
 */
export function DisputeBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset bg-rose-50 text-rose-800 ring-rose-200 animate-pulse-soft',
        className,
      )}
      title="This submission has an unresolved dispute"
    >
      <span className="relative flex w-1.5 h-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-600" />
      </span>
      Dispute
    </span>
  );
}
