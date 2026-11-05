import { useState, type FormEvent, type ReactNode } from 'react';
import { CheckIcon, FileTextIcon, FolderIcon, GitPullRequestIcon, GlobeIcon, LaptopIcon, SquareTerminal, TerminalIcon, XIcon } from 'lucide-react';
import type { Project } from '@/components/new-project-dialog';
import type { SandboxRunData } from '@/components/sandbox-run';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type RightPanelTab = 'overview' | 'preview';

function EmptyState({ icon: Icon, title, detail }: { icon: typeof GlobeIcon; title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
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

function Row({ icon: Icon, children, trailing }: { icon: typeof GlobeIcon; children: ReactNode; trailing?: ReactNode }) {
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
    return <span className="size-2 shrink-0 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none" role="img" aria-label="Running" />;
  }
  if (state === 'error') return <XIcon className="size-3.5 shrink-0 text-destructive" aria-label="Failed" />;
  return <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Finished" />;
}

interface OverviewProps {
  project: Project | null;
  /** Commands the active session has run, shown as background tasks. */
  runs: SandboxRunData[];
}

function Overview({ project, runs }: OverviewProps) {
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
        <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Context usage" aria-valuemin={0} aria-valuemax={100} />
      </Section>

      <Section title="Outputs">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileTextIcon className="size-4 shrink-0" aria-hidden="true" />
          ยังไม่มีไฟล์ที่ session นี้สร้าง
        </p>
      </Section>

      <Section title="Changes">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">
            <span className="text-green-600 dark:text-green-400">+0</span> <span className="text-destructive">−0</span>
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
          <Row key={run.id} icon={TerminalIcon} trailing={<TaskState state={run.state} />}>{run.title}</Row>
        ))}
        {finished > 0 && (
          <Row icon={CheckIcon}>{finished} finished</Row>
        )}
      </Section>
    </div>
  );
}

function Preview() {
  const [draft, setDraft] = useState('http://localhost:3000');
  const [url, setUrl] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setUrl(/^https?:\/\//i.test(value) ? value : `http://${value}`);
  }

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={submit} className="border-b p-2">
        <Input value={draft} onChange={event => setDraft(event.target.value)} aria-label="Preview address" placeholder="localhost:3000" />
      </form>
      {url ? (
        <iframe title="Preview" src={url} className="min-h-0 flex-1 bg-white" />
      ) : (
        <EmptyState icon={GlobeIcon} title="Preview" detail="ใส่ที่อยู่ของ dev server เช่น localhost:3000 แล้วกด Enter เพื่อดูหน้าเว็บของ project" />
      )}
    </div>
  );
}

interface RightPanelProps {
  tab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  onClose: () => void;
  project: Project | null;
  runs: SandboxRunData[];
}

export function RightPanel({ tab, onTabChange, onClose, project, runs }: RightPanelProps) {
  return (
    <aside aria-label="Session panel" className="flex w-80 shrink-0 flex-col border-l bg-background">
      <Tabs value={tab} onValueChange={value => onTabChange(value as RightPanelTab)} className="min-h-0 flex-1 gap-0">
        <div className="flex items-center justify-between border-b px-2 pt-1">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="icon-xs" aria-label="Close panel" onClick={onClose}>
            <XIcon aria-hidden="true" />
          </Button>
        </div>
        <TabsContent value="overview" className="min-h-0 flex-1">
          <Overview project={project} runs={runs} />
        </TabsContent>
        <TabsContent value="preview" className="min-h-0 flex-1">
          <Preview />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

export function TerminalPanel({ onClose }: { onClose: () => void }) {
  return (
    <section aria-label="Terminal" className="flex h-48 shrink-0 flex-col border-t bg-background">
      <div className="flex items-center justify-between border-b px-3 py-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <SquareTerminal className="size-4" aria-hidden="true" />
          Terminal
        </span>
        <Button variant="ghost" size="icon-xs" aria-label="Close terminal" onClick={onClose}>
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <EmptyState icon={SquareTerminal} title="ยังไม่ได้เชื่อมต่อเทอร์มินัล" detail="เมื่อเชื่อมกับ Codex แล้ว คำสั่งที่รันจะแสดงที่นี่" />
    </section>
  );
}
