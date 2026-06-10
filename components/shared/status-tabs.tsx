'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * URL-driven tab group. Each tab sets a `tab` query param so the surrounding
 * server component re-fetches with the right filter. Counts (optional) appear
 * as little chips next to the label.
 */
export interface Tab {
  key: string;
  label: string;
  count?: number;
}

export function StatusTabs({ tabs, paramKey = 'tab' }: { tabs: Tab[]; paramKey?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(paramKey) ?? tabs[0]?.key;

  const navigate = (key: string) => {
    const sp = new URLSearchParams(params.toString());
    if (key === tabs[0]?.key) sp.delete(paramKey);
    else sp.set(paramKey, key);
    const qs = sp.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ''}`);
  };

  return (
    <div className="border-b border-border">
      <nav className="flex gap-1 -mb-px overflow-x-auto" aria-label="Tabs">
        {tabs.map((t) => {
          const active = current === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => navigate(t.key)}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap',
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold',
                    active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
