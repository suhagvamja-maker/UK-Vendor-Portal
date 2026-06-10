'use client';

import { useActionState, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  uploadVendorDocumentAction,
  type UploadActionState,
} from '@/lib/actions/vendor-profile-upload';
import type { DocRequirement } from '@/lib/repo/documents';
import type { VendorDocument } from '@/lib/repo/vendor-documents';
import { cn } from '@/lib/utils';

interface Props {
  requirement: DocRequirement;
  current: VendorDocument | null;
}

const initial: UploadActionState = { ok: false };

const STATUS_BADGE: Record<string, string> = {
  not_uploaded:     'bg-slate-100 text-slate-600',
  uploaded:         'bg-amber-100 text-amber-800',
  admin_approved:   'bg-blue-100 text-blue-800',
  admin_rejected:   'bg-rose-100 text-rose-800',
  finance_approved: 'bg-emerald-100 text-emerald-800',
  finance_rejected: 'bg-rose-100 text-rose-800',
  expired:          'bg-rose-100 text-rose-800',
};

export function ProfileDocRow({ requirement, current }: Props) {
  const [state, formAction, pending] = useActionState(uploadVendorDocumentAction, initial);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  const isUploaded = !!current?.fileUrl;
  const status = current?.status ?? 'not_uploaded';
  const isExpired = status === 'expired';
  const filename = current?.fileUrl ? current.fileUrl.split('/').pop() ?? null : null;

  const acceptMimes = Array.isArray(requirement.rules.mime)
    ? (requirement.rules.mime as string[]).join(',')
    : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{requirement.displayName}</span>
            {requirement.isMandatory && (
              <span className="text-[10px] uppercase text-muted-foreground">required</span>
            )}
            <Badge className={cn('text-xs', STATUS_BADGE[status])}>
              {status.replace(/_/g, ' ')}
            </Badge>
          </div>
          {requirement.description && (
            <p className="text-xs text-muted-foreground">{requirement.description}</p>
          )}
          {isUploaded && current && filename && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className={isExpired ? 'text-rose-700 font-medium' : 'text-emerald-700 font-medium'}>
                {isExpired ? '⚠ Expired' : '✓ Uploaded'}
              </span>
              <span className="text-muted-foreground">·</span>
              <a
                href={`/api/uploads/${current.fileUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {filename}
              </a>
              <span className="text-muted-foreground">(v{current.version})</span>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant={isUploaded ? 'outline' : 'default'}
          size="sm"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Cancel' : isUploaded ? (isExpired ? 'Re-upload' : 'Replace') : 'Upload'}
        </Button>
      </div>

      {open && (
        <form action={formAction} className="rounded-md border bg-muted/30 p-3 space-y-3">
          <input type="hidden" name="docCode" value={requirement.docCode} />

          <div className="space-y-1.5">
            <Label htmlFor={`file-${requirement.id}`}>File</Label>
            <Input id={`file-${requirement.id}`} name="file" type="file" accept={acceptMimes} required />
          </div>

          {requirement.docCode === 'no_pe_declaration' && (
            <div className="grid sm:grid-cols-3 gap-3">
              <Field name="directorName" label="Director name" defaultValue={current?.directorName} />
              <Field name="tinNumber" label="TIN" defaultValue={current?.tinNumber} />
              <Field name="directorDob" label="Director DOB" type="date" defaultValue={current?.directorDob} />
            </div>
          )}
          {requirement.docCode === 'address_proof' && (
            <div className="space-y-3">
              <Field name="addressText" label="Address as shown on document" defaultValue={current?.addressText} />
              <Field name="documentDate" label="Document date" type="date" defaultValue={current?.documentDate} />
            </div>
          )}
          {requirement.docCode === 'trc' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field name="trcIssuedCountry" label="Issuing country" placeholder="GB" defaultValue={current?.trcIssuedCountry} />
              <Field name="trcFinancialYear" label="Financial year" placeholder="2026-27" defaultValue={current?.trcFinancialYear} />
              <Field name="trcValidFrom" label="Valid from" type="date" defaultValue={current?.trcValidFrom} />
              <Field name="trcValidTo" label="Valid to" type="date" defaultValue={current?.trcValidTo} />
            </div>
          )}
          {requirement.docCode === 'agreement' && (
            <Field name="expiryDate" label="Agreement expiry" type="date" defaultValue={current?.expiryDate} />
          )}

          {state.message && (
            <p className={`text-xs ${state.ok ? 'text-emerald-700' : 'text-destructive'}`}>
              {state.message}
            </p>
          )}
          {state.warnings?.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
          ))}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Uploading…' : isUploaded ? 'Re-upload' : 'Upload'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  type = 'text',
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string | null;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} placeholder={placeholder} defaultValue={defaultValue ?? undefined} />
    </div>
  );
}
