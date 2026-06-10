'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * URL-driven search box with date range. Compact, single-row on desktop.
 */
export function QueueSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    startTransition(() => {
      const sp = new URLSearchParams();
      const q = (formData.get('q') as string | null)?.trim();
      const from = (formData.get('from') as string | null)?.trim();
      const to = (formData.get('to') as string | null)?.trim();
      const tab = params.get('tab');
      if (q) sp.set('q', q);
      if (from) sp.set('from', from);
      if (to) sp.set('to', to);
      if (tab) sp.set('tab', tab);
      router.push(`${pathname}${sp.toString() ? `?${sp.toString()}` : ''}`);
    });
  };

  const hasFilters = params.get('q') || params.get('from') || params.get('to');

  return (
    <form action={submit} className={cn('ink-card p-3 flex flex-wrap items-end gap-3')}>
      <div className="flex-1 min-w-[200px] space-y-1">
        <label htmlFor="q" className="label-caps">Search</label>
        <div className="relative">
          <svg
            width="16"
            height="16"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <Input
            id="q"
            name="q"
            defaultValue={params.get('q') ?? ''}
            placeholder="Invoice #, vendor, code"
            className="pl-9"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="from" className="label-caps">From</label>
        <Input id="from" name="from" type="date" defaultValue={params.get('from') ?? ''} />
      </div>
      <div className="space-y-1">
        <label htmlFor="to" className="label-caps">To</label>
        <Input id="to" name="to" type="date" defaultValue={params.get('to') ?? ''} />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Filtering…' : 'Apply'}
      </Button>
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            const sp = new URLSearchParams();
            const tab = params.get('tab');
            if (tab) sp.set('tab', tab);
            router.push(`${pathname}${sp.toString() ? `?${sp.toString()}` : ''}`);
          }}
          className="text-xs text-muted-foreground hover:underline"
        >
          Clear
        </button>
      )}
    </form>
  );
}
