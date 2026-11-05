import type { ReactNode } from 'react';
import {
  CheckIcon,
  FileTextIcon,
  FolderIcon,
  GitPullRequestIcon,
  LaptopIcon,
  TerminalIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import type { SandboxRunData } from '@/components/chat/sandbox-run';
import type { Project } from '@/components/dialogs/new-project-dialog';
import { Button } from '@/components/ui/button';

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
  /** Commands the active session has run, shown as background tasks. */
  runs: SandboxRunData[];
}

export function SessionOverview({ project, runs }: SessionOverviewProps) {
  const files = runs.flatMap(run => run.files || []);
  const { added, removed } = countChanges(files);
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

      <Section title="Context">
        <div className="flex items-center justify-between text-sm">
          <span>Usage</span>
          <span className="text-muted-foreground">ยังไม่มีข้อมูล</span>
        </div>
        <div
          className="h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Context usage"
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </Section>

      <Section title="Outputs">
        {files.length ? (
          files.map((file, index) => (
            <Row key={`${file.path}:${index}`} icon={FileTextIcon}>
              {file.path}
            </Row>
          ))
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileTextIcon className="size-4 shrink-0" aria-hidden="true" />
            ยังไม่มีไฟล์ที่ session นี้สร้าง
          </p>
        )}
      </Section>

      <Section title="Changes">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">
            <span className="text-green-600 dark:text-green-400">+{added}</span>{' '}
            <span className="text-destructive">−{removed}</span>
          </span>
          <Button size="sm" variant="outline" disabled title="ยังไม่มีการเปลี่ยนแปลงให้สร้าง PR">
            <GitPullRequestIcon aria-hidden="true" />
            Create PR
          </Button>
        </div>
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
