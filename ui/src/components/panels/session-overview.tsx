import { useState, type ReactNode } from 'react';
import { CheckIcon, FileTextIcon, FolderIcon, LaptopIcon, TerminalIcon, XIcon, type LucideIcon } from 'lucide-react';
import type { SandboxRunData } from '@/components/chat/sandbox-run';
import type { Project } from '@/components/dialogs/new-project-dialog';
import { invoke } from '@tauri-apps/api/core';
import { formatTokens } from '@/components/chat/turn-activity';
import { useChanges } from '@/lib/changes';
import { codex, useCodex, type ThreadUsage } from '@/lib/codex';

/** Files Liam can open from the Outputs list (the same documents the backend allows). */
const OPENABLE = new Set(['html', 'htm', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'md', 'csv', 'json', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt']);
const MAX_OUTPUTS = 30;

const fileExtension = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** The Context box of a chat: reads what the engine reported and lets the person compact the chat. */
function ContextBox({ threadId, running }: { threadId: string | null; running: boolean }) {
  const engine = useCodex();
  const [compacting, setCompacting] = useState(false);

  async function compact() {
    if (!threadId) return;
    setCompacting(true);
    try {
      await codex.compact(threadId);
    } catch (error) {
      codex.report(error);
    } finally {
      setCompacting(false);
    }
  }

  return <ContextView usage={threadId ? engine.usage[threadId] : undefined} running={running} compacting={compacting} onCompact={() => void compact()} />;
}

/** How much of the model's window the chat fills, as the engine counts it. */
export function ContextView({ usage, running, compacting, onCompact }: { usage?: ThreadUsage; running: boolean; compacting: boolean; onCompact: () => void }) {
  const window = usage?.window ?? null;
  // The size of the latest request is about what the next one starts from.
  const used = usage?.last.total ?? 0;
  const fresh = Math.max(0, (usage?.last.input ?? 0) - (usage?.last.cached ?? 0));
  const rows = [
    { key: 'input', label: 'Input (new)', value: fresh, color: 'bg-blue-500' },
    { key: 'cached', label: 'Cached input', value: usage?.last.cached ?? 0, color: 'bg-emerald-500' },
    { key: 'output', label: 'Output', value: usage?.last.output ?? 0, color: 'bg-amber-500' },
    ...((usage?.last.reasoning ?? 0) > 0 ? [{ key: 'reasoning', label: 'Reasoning', value: usage!.last.reasoning, color: 'bg-violet-500' }] : []),
  ];
  const free = window ? Math.max(0, window - used) : null;
  const percent = window ? Math.min(100, Math.round((used / window) * 100)) : null;
  const share = (value: number) => (window ? `${((value / window) * 100).toFixed(1)}%` : '');

  return (
    <Section title="Context">
      {usage ? (
        <>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{percent !== null ? `${percent}% used` : `${formatTokens(used)} tokens`}</span>
            <span className="text-muted-foreground">{window ? `${formatTokens(used)} / ${formatTokens(window)}` : formatTokens(used)}</span>
          </div>
          <div
            className="flex h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Context usage"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
          >
            {window &&
              rows.map(row => <div key={row.key} className={row.color} style={{ width: `${Math.min(100, (row.value / window) * 100)}%` }} />)}
          </div>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {rows.map(row => (
              <li key={row.key} className="flex items-center gap-2">
                <span className={`size-2.5 shrink-0 rounded-[3px] ${row.color}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                <span className="tabular-nums text-muted-foreground">{formatTokens(row.value)}</span>
                <span className="w-12 text-right tabular-nums text-muted-foreground">{share(row.value)}</span>
              </li>
            ))}
            {free !== null && (
              <li className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-[3px] border" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">Free space</span>
                <span className="tabular-nums text-muted-foreground">{formatTokens(free)}</span>
                <span className="w-12 text-right tabular-nums text-muted-foreground">{share(free)}</span>
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={onCompact}
            disabled={running || compacting}
            className="mt-2 w-fit self-end rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {compacting ? 'Compacting…' : 'Compact session'}
          </button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No data yet (shown after the first model call)</p>
      )}
    </Section>
  );
}

/** The files the chat created or changed in the project folder; the ones that are documents open on click. */
function OutputsBox({ names, folder }: { names: string[]; folder?: string }) {
  if (names.length === 0) {
    return (
      <Section title="Outputs">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileTextIcon className="size-4 shrink-0" aria-hidden="true" />
          No files created in this session yet
        </p>
      </Section>
    );
  }
  const open = (name: string) => {
    if (!folder) return;
    void invoke('open_local_file', { path: `${folder.replace(/[\\/]+$/, '')}/${name}` }).catch(error => codex.report(error));
  };
  return (
    <Section title={`Outputs · ${names.length}`}>
      {names.slice(0, MAX_OUTPUTS).map(name =>
        folder && OPENABLE.has(fileExtension(name)) ? (
          <button key={name} type="button" onClick={() => open(name)} className="rounded text-left hover:bg-muted">
            <Row icon={FileTextIcon}>{name}</Row>
          </button>
        ) : (
          <Row key={name} icon={FileTextIcon}>
            {name}
          </Row>
        ),
      )}
      {names.length > MAX_OUTPUTS && <p className="text-xs text-muted-foreground">+{names.length - MAX_OUTPUTS} more files</p>}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-b px-4 py-3 last:border-b-0">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Row({ icon: Icon, children, trailing }: { icon: LucideIcon; children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 py-0.5 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </div>
  );
}

function TaskState({ state }: { state: SandboxRunData['state'] }) {
  if (state === 'running') {
    return (
      <span
        className="size-2 shrink-0 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none"
        role="img"
        aria-label="Running"
      />
    );
  }
  if (state === 'error') return <XIcon className="size-3.5 shrink-0 text-destructive" aria-label="Failed" />;
  return <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Finished" />;
}

// Counts the lines a unified diff adds and removes, ignoring the `+++` / `---` file headers.
function countChanges(files: NonNullable<SandboxRunData['files']>) {
  const lines = files.flatMap(file => file.diff.split('\n'));
  return {
    added: lines.filter(line => line.startsWith('+') && !line.startsWith('+++')).length,
    removed: lines.filter(line => line.startsWith('-') && !line.startsWith('---')).length,
  };
}

interface SessionOverviewProps {
  project: Project | null;
  /** The open chat and whether it is working, to read what it changed in the project folder. */
  threadId?: string | null;
  running?: boolean;
  /** Commands the active session has run, shown as background tasks. */
  runs: SandboxRunData[];
}

export function SessionOverview({
  project,
  runs,
  threadId = null,
  running: chatRunning = false,
}: SessionOverviewProps) {
  const files = runs.flatMap(run => run.files || []);
  // Counted from the project folder itself: the agent writes files through the shell, so there are no
  // edit records to add up. Falls back to the edits the chat reported (browser preview).
  const folder = useChanges(threadId, chatRunning);
  const reported = countChanges(files);
  const added = folder.files ? folder.added : reported.added;
  const removed = folder.files ? folder.removed : reported.removed;
  // The files of the folder first; the edits the chat reported when the folder cannot be read (browser preview).
  const outputs = folder.names.length ? folder.names : [...new Set(files.map(file => file.path))];
  const running = runs.filter(run => run.state === 'running');
  const finished = runs.length - running.length;

  return (
    <div className="h-full overflow-y-auto">
      <Section title="Environment">
        <Row icon={LaptopIcon}>This computer</Row>
        {project ? (
          <Row icon={FolderIcon}>
            {project.name}
            {project.path && <span className="text-muted-foreground"> · {project.path}</span>}
          </Row>
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่ได้เลือก project</p>
        )}
      </Section>

      <ContextBox threadId={threadId} running={chatRunning} />

      <OutputsBox names={outputs} folder={project?.path || undefined} />

      <Section title="Changes">
        <span className="text-sm">
          <span className="text-green-600 dark:text-green-400">+{added}</span>{' '}
          <span className="text-destructive">−{removed}</span>
        </span>
      </Section>

      <Section title="Background tasks">
        {runs.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีงานที่รัน</p>}
        {running.map(run => (
          <Row key={run.id} icon={TerminalIcon} trailing={<TaskState state={run.state} />}>
            {run.title}
          </Row>
        ))}
        {finished > 0 && <Row icon={CheckIcon}>{finished} finished</Row>}
      </Section>
    </div>
  );
}
