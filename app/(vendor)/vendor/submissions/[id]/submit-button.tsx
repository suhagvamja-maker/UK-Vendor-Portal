'use client';

import { useTransition, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submitForReviewAction } from '@/lib/actions/submission';

export function SubmitForReview({ submissionId, ready }: { submissionId: string; ready: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ready
            ? 'All required documents are uploaded. Send to Admin for review when ready.'
            : 'Upload every required document above to enable submission.'}
        </p>
        <Button
          type="button"
          disabled={!ready || pending}
          onClick={() =>
            startTransition(async () => {
              try {
                setError(null);
                await submitForReviewAction(submissionId);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
              }
            })
          }
        >
          {pending ? 'Submitting…' : 'Submit for review'}
        </Button>
      </CardContent>
      {error && <p className="px-6 pb-3 text-xs text-destructive">{error}</p>}
    </Card>
  );
}
