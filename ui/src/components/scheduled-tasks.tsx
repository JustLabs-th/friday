import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { CalendarClock, Plus, Play, Pause, Pencil, Trash2, Square, ArrowUpRight } from 'lucide-react';
import { scheduler, useScheduler, isRunActive, type Job, type JobInput, type ScheduledRun } from '@/lib/scheduler';
import type { Project } from '@/components/new-project-dialog';
import type { ModelInfo } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

const selectClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm';
function date(value: number | null, zone?: string) {
  return value === null ? 'Paused' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(value);
}
function applyPrefill(prefill: Partial<JobInput> | null | undefined, base: JobInput): JobInput { return { ...base, ...prefill }; }
function JobEditor({ job, projects, models, prefill, onClose }: { job: Job | null; projects: Project[]; models: ModelInfo[]; prefill?: Partial<JobInput> | null; onClose: () => void }) {
  const [form, setForm] = useState<JobInput>(() => job || applyPrefill(prefill, {
    name: '', cwd: projects[0]?.path || '', prompt: '', cron: '0 9 * * 1-5',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok', enabled: true,
    model: null, effort: null, projectPrompt: projects[0]?.prompt || null, timeoutMinutes: 60,
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<number[]>([]);
  const [previewError, setPreviewError] = useState('');
  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      void scheduler.preview(form.cron, form.timezone).then(values => { if (current) { setPreview(values); setPreviewError(''); } }).catch(error => { if (current) { setPreview([]); setPreviewError(String(error)); } });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [form.cron, form.timezone]);
  function field<K extends keyof JobInput>(key: K, value: JobInput[K]) { setForm(current => ({ ...current, [key]: value })); }
  const model = models.find(model => model.id === form.model);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{job ? 'Edit scheduled task' : 'New scheduled task'}</DialogTitle><DialogDescription>Run a prompt in a project using Codex.</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={event => {
        event.preventDefault(); setBusy(true); setError('');
        void scheduler.save(form).then(onClose).catch(error => setError(String(error))).finally(() => setBusy(false));
      }}>
        <label className="grid gap-1.5 text-sm">Name<Input required value={form.name} onChange={event => field('name', event.target.value)} placeholder="Morning project review" /></label>
        <label className="grid gap-1.5 text-sm">Project<select className={selectClass} value={form.cwd} onChange={event => { const project = projects.find(project => project.path === event.target.value); setForm(current => ({ ...current, cwd: event.target.value, projectPrompt: project?.prompt || null })); }}>
          {!projects.some(project => project.path === form.cwd) && <option value={form.cwd}>{form.cwd || 'Choose a project'}</option>}
          {projects.map(project => <option key={project.id} value={project.path}>{project.name} — {project.path}</option>)}
        </select></label>
        {form.skill && <p className="text-xs text-muted-foreground">Runs the skill <code>{form.skill.name}</code> first, then this prompt.</p>}
        <label className="grid gap-1.5 text-sm">Prompt<Textarea required rows={4} value={form.prompt} onChange={event => field('prompt', event.target.value)} placeholder="Review changes and summarize anything that needs attention." /></label>
        <label className="grid gap-1.5 text-sm">Schedule<select className={selectClass} value={['0 9 * * 1-5', '0 9 * * *', '0 * * * *'].includes(form.cron) ? form.cron : 'custom'} onChange={event => field('cron', event.target.value === 'custom' ? '* * * * *' : event.target.value)}>
          <option value="0 9 * * 1-5">Weekdays at 09:00</option><option value="0 9 * * *">Every day at 09:00</option><option value="0 * * * *">Every hour</option><option value="custom">Custom cron</option>
        </select></label>
        <div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-sm">Cron<Input required value={form.cron} onChange={event => field('cron', event.target.value)} /><span className="text-xs text-muted-foreground">minute hour day month weekday</span></label>
          <label className="grid gap-1.5 text-sm">Timezone<Input required value={form.timezone} onChange={event => field('timezone', event.target.value)} placeholder="Asia/Bangkok" /></label></div>
        <p className={`text-xs ${previewError ? 'text-destructive' : 'text-muted-foreground'}`}>{previewError || `Next: ${preview.map(value => date(value, form.timezone)).join(' · ')}`}</p>
        <div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-sm">Model<select className={selectClass} value={form.model || ''} onChange={event => setForm(current => ({ ...current, model: event.target.value || null, effort: null }))}><option value="">Codex default</option>{form.model && !model && <option value={form.model}>{form.model}</option>}{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm">Reasoning effort<select className={selectClass} value={form.effort || ''} onChange={event => field('effort', event.target.value || null)}><option value="">Model default</option>{(model?.efforts || []).map(effort => <option key={effort} value={effort}>{effort}</option>)}</select></label></div>
        <label className="grid gap-1.5 text-sm">Maximum runtime (minutes)<Input type="number" min={1} max={1440} required value={form.timeoutMinutes} onChange={event => field('timeoutMinutes', Number(event.target.value))} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={event => field('enabled', event.target.checked)} />Enable schedule</label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !!previewError || !form.cwd}>{busy ? 'Saving…' : 'Save task'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function ScheduledTasks({ projects, models, onOpenSession, prefill, onPrefillUsed }: { projects: Project[]; models: ModelInfo[]; onOpenSession: (run: ScheduledRun) => void; prefill?: Partial<JobInput> | null; onPrefillUsed?: () => void }) {
  const state = useScheduler();
  const [editor, setEditor] = useState<Job | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  // A skill saved with "save and schedule" arrives here and opens the editor with it filled in.
  useEffect(() => { if (prefill) setEditor('new'); }, [prefill]);
  async function act(action: () => Promise<unknown>) { setPending(true); setError(''); try { await action(); } catch (error) { setError(String(error)); } finally { setPending(false); } }
  return <div className="flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-4xl space-y-7 p-6 lg:p-10">
    <header className="flex items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-muted-foreground"><CalendarClock className="size-5" /><span className="text-xs">AUTOMATIONS</span></div><h1 id="page-title" className="text-2xl font-semibold tracking-tight">Scheduled tasks</h1><p className="mt-2 text-sm text-muted-foreground">ตั้งเวลาให้ Codex ทำงานในโปรเจกต์ของคุณ</p></div><Button disabled={!isTauri() || !state.ready || !!state.error || !projects.length || pending} onClick={() => setEditor('new')}><Plus />New task</Button></header>
    <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">งานรันเมื่อเปิด Friday อยู่ เวลาที่พลาดตอนปิดแอปหรือพักเครื่องจะไม่รันย้อนหลัง งานที่รออนุมัติให้เปิด session เพื่ออนุมัติคำสั่งตามปกติ</div>
    {!isTauri() && <p className="text-sm text-muted-foreground">Open Friday Desktop to manage scheduled tasks.</p>}
    {(error || state.error) && <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error || state.error}<Button variant="ghost" size="sm" onClick={() => { setError(''); void scheduler.refresh(); }}>Retry</Button></div>}
    <section aria-label="Tasks" className="space-y-3">{!state.jobs.length && <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{projects.length ? 'Create your first scheduled task.' : 'Add a project before creating a task.'}</div>}
      {state.jobs.map(job => <article key={job.id} className="rounded-xl border p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-medium">{job.name}<span className="ml-3 text-xs font-normal text-muted-foreground">{job.enabled ? 'Enabled' : 'Paused'}</span></h2><p className="mt-1 break-all text-xs text-muted-foreground">{job.cwd}</p>{job.skill && <p className="mt-1 text-xs text-muted-foreground">Skill: <code>{job.skill.name}</code></p>}</div><div className="flex gap-1">
        <Button variant="ghost" size="icon" aria-label={`Run ${job.name} now`} disabled={pending || state.runs.some(run => run.jobId === job.id && isRunActive(run.status))} onClick={() => { void act(() => scheduler.run(job.id)); }}><Play /></Button>
        <Button variant="ghost" size="icon" aria-label={`${job.enabled ? 'Pause' : 'Enable'} ${job.name}`} disabled={pending} onClick={() => { void act(() => scheduler.save({ ...job, enabled: !job.enabled })); }}>{job.enabled ? <Pause /> : <Play />}</Button>
        <Button variant="ghost" size="icon" aria-label={`Edit ${job.name}`} onClick={() => setEditor(job)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${job.name}`} disabled={pending || state.runs.some(run => run.jobId === job.id && isRunActive(run.status))} onClick={() => setDeleting(job)}><Trash2 /></Button>
      </div></div><p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm">{job.prompt}</p><div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><code>{job.cron}</code><span>{job.timezone}</span><span>Next: {date(job.nextRunAt, job.timezone)}</span></div></article>)}
    </section>
    <section aria-label="Run history" className="space-y-3"><h2 className="text-sm font-medium">Run history</h2>{!state.runs.length && <p className="text-sm text-muted-foreground">Results will appear here after a task runs.</p>}
      {state.runs.map(run => <article key={run.id} className="rounded-xl border p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-medium">{run.jobName}</h3><p className="mt-1 text-xs text-muted-foreground">{date(run.startedAt)} · {run.trigger} · <span role="status">{run.status}</span></p></div><div className="flex gap-2">{isRunActive(run.status) && <Button size="sm" variant="outline" disabled={pending || run.status === 'stopping'} onClick={() => { void act(() => scheduler.stop(run.id)); }}><Square />Stop</Button>}{run.threadId && <Button size="sm" variant="outline" onClick={() => onOpenSession(run)}><ArrowUpRight />Open session</Button>}</div></div>{run.status === 'waitingApproval' && <p className="mt-3 text-sm text-amber-600">Open session to review the approval request.</p>}{run.error && <p className="mt-3 text-sm text-destructive">{run.error}</p>}{run.output && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">View result</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans leading-relaxed">{run.output}</pre></details>}</article>)}
    </section>
    {editor !== null && <JobEditor job={editor === 'new' ? null : editor} projects={projects} models={models} prefill={editor === 'new' ? prefill : null} onClose={() => { setEditor(null); onPrefillUsed?.(); }} />}
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>This removes the schedule and its run history from Friday. Codex sessions and project files are kept.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} onClick={() => { if (deleting) void act(async () => { await scheduler.remove(deleting.id); setDeleting(null); }); }}>Delete task</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></div>;
}
