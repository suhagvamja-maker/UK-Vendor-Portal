'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';

type Status =
  | 'draft' | 'pending_admin' | 'pending_finance'
  | 'returned_to_vendor' | 'returned_to_admin'
  | 'approved' | 'paid' | 'rejected';

const ALL_STATUSES: Status[] = [
  'paid', 'approved', 'pending_finance', 'pending_admin',
  'returned_to_vendor', 'returned_to_admin', 'rejected', 'draft',
];

interface Defaults {
  from: string;
  to: string;
  status: string[];
  dateField: 'paid_at' | 'approved_at' | 'submitted_at';
}

export function ExportFilters({ defaults }: { defaults: Defaults }) {
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [dateField, setDateField] = useState(defaults.dateField);
  const [statuses, setStatuses] = useState<Set<string>>(new Set(defaults.status));

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    sp.set('dateField', dateField);
    for (const s of statuses) sp.append('status', s);
    return sp.toString();
  }, [from, to, dateField, statuses]);

  const toggleStatus = (s: string) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateField">Date field</Label>
            <select
              id="dateField"
              value={dateField}
              onChange={(e) => setDateField(e.target.value as Defaults['dateField'])}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="paid_at">Paid date</option>
              <option value="approved_at">Approved date</option>
              <option value="submitted_at">Submitted date</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Statuses</Label>
          <div className="flex flex-wrap gap-2">
            {ALL_STATUSES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={statuses.has(s)}
                  onChange={() => toggleStatus(s)}
                />
                {s.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Reload the page after changing filters to update the preview, or just download.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.search = queryString;
              }}
            >
              Apply preview
            </Button>
            <a
              href={`/api/exports?${queryString}`}
              className={buttonVariants({ size: 'sm' })}
            >
              Download CSV
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
