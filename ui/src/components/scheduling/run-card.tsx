import { ArrowUpRight, Square } from 'lucide-react';
import { formatDate } from '@/components/scheduling/format';
import { Button } from '@/components/ui/button';
import { isRunActive, type ScheduledRun } from '@/lib/scheduler';

interface RunCardProps {
  run: ScheduledRun;
  /** Another request is in flight, so the Stop button waits. */
  pending: boolean;
  onStop: () => void;
  onOpenSession: () => void;
}

export function RunCard({ run, pending, onStop, onOpenSession }: RunCardProps) {
  return (
    <article className="rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{run.jobName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(run.startedAt)} · {run.trigger} · <span role="status">{run.status}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {isRunActive(run.status) && (
            <Button size="sm" variant="outline" disabled={pending || run.status === 'stopping'} onClick={onStop}>
              <Square />
              Stop
            </Button>
          )}
          {run.threadId && (
            <Button size="sm" variant="outline" onClick={onOpenSession}>
              <ArrowUpRight />
              Open session
            </Button>
          )}
        </div>
      </div>
      {run.status === 'waitingApproval' && (
        <p className="mt-3 text-sm text-amber-600">Open session to review the approval request.</p>
      )}
      {run.error && <p className="mt-3 text-sm text-destructive">{run.error}</p>}
      {run.output && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">View result</summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans leading-relaxed">
            {run.output}
          </pre>
        </details>
      )}
    </article>
  );
}
