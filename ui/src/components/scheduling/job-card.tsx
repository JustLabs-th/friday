import { Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { formatDate } from '@/components/scheduling/format';
import { Button } from '@/components/ui/button';
import type { Job } from '@/lib/scheduler';

interface JobCardProps {
  job: Job;
  /** Another request is in flight, so the buttons wait. */
  pending: boolean;
  /** A run of this task is active, so it cannot be started again or deleted. */
  running: boolean;
  onRun: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function JobCard({ job, pending, running, onRun, onToggle, onEdit, onDelete }: JobCardProps) {
  return (
    <article className="rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">
            {job.name}
            <span className="ml-3 text-xs font-normal text-muted-foreground">{job.enabled ? 'Enabled' : 'Paused'}</span>
          </h2>
          <p className="mt-1 break-all text-xs text-muted-foreground">{job.cwd}</p>
          {job.skill && (
            <p className="mt-1 text-xs text-muted-foreground">
              Skill: <code>{job.skill.name}</code>
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Run ${job.name} now`}
            disabled={pending || running}
            onClick={onRun}
          >
            <Play />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${job.enabled ? 'Pause' : 'Enable'} ${job.name}`}
            disabled={pending}
            onClick={onToggle}
          >
            {job.enabled ? <Pause /> : <Play />}
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Edit ${job.name}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${job.name}`}
            disabled={pending || running}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm">{job.prompt}</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <code>{job.cron}</code>
        <span>{job.timezone}</span>
        <span>Next: {formatDate(job.nextRunAt, job.timezone)}</span>
      </div>
    </article>
  );
}
