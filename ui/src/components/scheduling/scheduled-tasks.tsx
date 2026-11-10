import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { CalendarClock, Plus } from 'lucide-react';
import type { Project } from '@/components/dialogs/new-project-dialog';
import { DeleteJobDialog } from '@/components/scheduling/delete-job-dialog';
import { JobCard } from '@/components/scheduling/job-card';
import { JobEditor } from '@/components/scheduling/job-editor';
import { RunCard } from '@/components/scheduling/run-card';
import { Button } from '@/components/ui/button';
import type { ModelInfo } from '@/lib/models';
import { isRunActive, scheduler, useScheduler, type Job, type JobInput, type ScheduledRun } from '@/lib/scheduler';

interface ScheduledTasksProps {
  projects: Project[];
  models: ModelInfo[];
  onOpenSession: (run: ScheduledRun) => void;
  /** Values for a new task, such as the skill from "save and schedule"; opens the editor. */
  prefill?: Partial<JobInput> | null;
  onPrefillUsed?: () => void;
}

export function ScheduledTasks({ projects, models, onOpenSession, prefill, onPrefillUsed }: ScheduledTasksProps) {
  const state = useScheduler();
  const [editor, setEditor] = useState<Job | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // A skill saved with "save and schedule" arrives here and opens the editor with it filled in.
  useEffect(() => {
    if (prefill) setEditor('new');
  }, [prefill]);

  // Runs one change, keeping the buttons disabled meanwhile and showing any failure.
  async function act(action: () => Promise<unknown>) {
    setPending(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(String(error));
    } finally {
      setPending(false);
    }
  }
  const hasActiveRun = (job: Job) => state.runs.some(run => run.jobId === job.id && isRunActive(run.status));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-7 p-6 lg:p-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="size-5" />
              <span className="text-xs">AUTOMATIONS</span>
            </div>
            <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
              Scheduled tasks
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">ตั้งเวลาให้ Liam ทำงานในโปรเจกต์ของคุณ</p>
          </div>
          <Button
            disabled={!isTauri() || !state.ready || !!state.error || !projects.length || pending}
            onClick={() => setEditor('new')}
          >
            <Plus />
            New task
          </Button>
        </header>

        <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
          งานรันเมื่อเปิด Friday อยู่ เวลาที่พลาดตอนปิดแอปหรือพักเครื่องจะไม่รันย้อนหลัง งานที่รออนุมัติให้เปิด session
          เพื่ออนุมัติคำสั่งตามปกติ
        </div>
        {!isTauri() && <p className="text-sm text-muted-foreground">Open Liam Desktop to manage scheduled tasks.</p>}
        {(error || state.error) && (
          <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
            {error || state.error}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setError('');
                void scheduler.refresh();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        <section aria-label="Tasks" className="space-y-3">
          {!state.jobs.length && (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {projects.length ? 'Create your first scheduled task.' : 'Add a project before creating a task.'}
            </div>
          )}
          {state.jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              pending={pending}
              running={hasActiveRun(job)}
              onRun={() => void act(() => scheduler.run(job.id))}
              onToggle={() => void act(() => scheduler.save({ ...job, enabled: !job.enabled }))}
              onEdit={() => setEditor(job)}
              onDelete={() => setDeleting(job)}
            />
          ))}
        </section>

        <section aria-label="Run history" className="space-y-3">
          <h2 className="text-sm font-medium">Run history</h2>
          {!state.runs.length && (
            <p className="text-sm text-muted-foreground">Results will appear here after a task runs.</p>
          )}
          {state.runs.map(run => (
            <RunCard
              key={run.id}
              run={run}
              pending={pending}
              onStop={() => void act(() => scheduler.stop(run.id))}
              onOpenSession={() => onOpenSession(run)}
            />
          ))}
        </section>

        {editor !== null && (
          <JobEditor
            job={editor === 'new' ? null : editor}
            projects={projects}
            models={models}
            prefill={editor === 'new' ? prefill : null}
            onClose={() => {
              setEditor(null);
              onPrefillUsed?.();
            }}
          />
        )}
        <DeleteJobDialog
          job={deleting}
          pending={pending}
          onCancel={() => setDeleting(null)}
          onConfirm={job =>
            void act(async () => {
              await scheduler.remove(job.id);
              setDeleting(null);
            })
          }
        />
      </div>
    </div>
  );
}
