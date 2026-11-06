import { useEffect, useState } from 'react';
import type { Project } from '@/components/dialogs/new-project-dialog';
import { formatDate } from '@/components/scheduling/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ModelInfo } from '@/lib/models';
import { scheduler, type Job, type JobInput } from '@/lib/scheduler';

const selectClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm';
const PRESETS = ['0 9 * * 1-5', '0 9 * * *', '0 * * * *'];

function applyPrefill(prefill: Partial<JobInput> | null | undefined, base: JobInput): JobInput {
  return { ...base, ...prefill };
}

interface JobEditorProps {
  /** The task being edited, or null to create one. */
  job: Job | null;
  projects: Project[];
  models: ModelInfo[];
  /** Values to start a new task with, such as the skill from "save and schedule". */
  prefill?: Partial<JobInput> | null;
  onClose: () => void;
}

export function JobEditor({ job, projects, models, prefill, onClose }: JobEditorProps) {
  const [form, setForm] = useState<JobInput>(
    () =>
      job ||
      applyPrefill(prefill, {
        name: '',
        cwd: projects[0]?.path || '',
        prompt: '',
        cron: '0 9 * * 1-5',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok',
        enabled: true,
        model: null,
        effort: null,
        projectPrompt: projects[0]?.prompt || null,
        timeoutMinutes: 60,
      }),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<number[]>([]);
  const [previewError, setPreviewError] = useState('');

  // Show the next run times for the cron text, waiting a moment after each keystroke.
  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      void scheduler
        .preview(form.cron, form.timezone)
        .then(values => {
          if (current) {
            setPreview(values);
            setPreviewError('');
          }
        })
        .catch(error => {
          if (current) {
            setPreview([]);
            setPreviewError(String(error));
          }
        });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [form.cron, form.timezone]);

  function field<K extends keyof JobInput>(key: K, value: JobInput[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }
  const model = models.find(item => item.id === form.model);

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{job ? 'Edit scheduled task' : 'New scheduled task'}</DialogTitle>
          <DialogDescription>Run a prompt in a project using Liam.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            setBusy(true);
            setError('');
            void scheduler
              .save(form)
              .then(onClose)
              .catch(error => setError(String(error)))
              .finally(() => setBusy(false));
          }}
        >
          <label className="grid gap-1.5 text-sm">
            Name
            <Input
              required
              value={form.name}
              onChange={event => field('name', event.target.value)}
              placeholder="Morning project review"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Project
            <select
              className={selectClass}
              value={form.cwd}
              onChange={event => {
                const project = projects.find(item => item.path === event.target.value);
                setForm(current => ({ ...current, cwd: event.target.value, projectPrompt: project?.prompt || null }));
              }}
            >
              {!projects.some(project => project.path === form.cwd) && (
                <option value={form.cwd}>{form.cwd || 'Choose a project'}</option>
              )}
              {projects.map(project => (
                <option key={project.id} value={project.path}>
                  {project.name} — {project.path}
                </option>
              ))}
            </select>
          </label>
          {form.skill && (
            <p className="text-xs text-muted-foreground">
              Runs the skill <code>{form.skill.name}</code> first, then this prompt.
            </p>
          )}
          <label className="grid gap-1.5 text-sm">
            Prompt
            <Textarea
              required
              rows={4}
              value={form.prompt}
              onChange={event => field('prompt', event.target.value)}
              placeholder="Review changes and summarize anything that needs attention."
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Schedule
            <select
              className={selectClass}
              value={PRESETS.includes(form.cron) ? form.cron : 'custom'}
              onChange={event => field('cron', event.target.value === 'custom' ? '* * * * *' : event.target.value)}
            >
              <option value="0 9 * * 1-5">Weekdays at 09:00</option>
              <option value="0 9 * * *">Every day at 09:00</option>
              <option value="0 * * * *">Every hour</option>
              <option value="custom">Custom cron</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              Cron
              <Input required value={form.cron} onChange={event => field('cron', event.target.value)} />
              <span className="text-xs text-muted-foreground">minute hour day month weekday</span>
            </label>
            <label className="grid gap-1.5 text-sm">
              Timezone
              <Input
                required
                value={form.timezone}
                onChange={event => field('timezone', event.target.value)}
                placeholder="Asia/Bangkok"
              />
            </label>
          </div>
          <p className={`text-xs ${previewError ? 'text-destructive' : 'text-muted-foreground'}`}>
            {previewError || `Next: ${preview.map(value => formatDate(value, form.timezone)).join(' · ')}`}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              Model
              <select
                className={selectClass}
                value={form.model || ''}
                onChange={event =>
                  setForm(current => ({ ...current, model: event.target.value || null, effort: null }))
                }
              >
                <option value="">Liam default</option>
                {form.model && !model && <option value={form.model}>{form.model}</option>}
                {models.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              Reasoning effort
              <select
                className={selectClass}
                value={form.effort || ''}
                onChange={event => field('effort', event.target.value || null)}
              >
                <option value="">Model default</option>
                {(model?.efforts || []).map(effort => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1.5 text-sm">
            Maximum runtime (minutes)
            <Input
              type="number"
              min={1}
              max={1440}
              required
              value={form.timeoutMinutes}
              onChange={event => field('timeoutMinutes', Number(event.target.value))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={event => field('enabled', event.target.checked)} />
            Enable schedule
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !!previewError || !form.cwd}>
              {busy ? 'Saving…' : 'Save task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
