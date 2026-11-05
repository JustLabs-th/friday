import { SquareTerminal, XIcon } from 'lucide-react';
import type { SandboxRunData } from '@/components/chat/sandbox-run';
import { EmptyState } from '@/components/panels/empty-state';
import { Button } from '@/components/ui/button';

interface TerminalPanelProps {
  onClose: () => void;
  /** Commands the active session has run, shown with their output. */
  runs?: SandboxRunData[];
}

function RunOutput({ run }: { run: SandboxRunData }) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-muted-foreground">{run.code || run.title}</p>
      <pre className="whitespace-pre-wrap">{run.output || (run.state === 'running' ? 'Running…' : run.state)}</pre>
    </div>
  );
}

export function TerminalPanel({ onClose, runs = [] }: TerminalPanelProps) {
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
      {runs.length ? (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-2 font-mono text-xs">
          {runs.map(run => (
            <RunOutput key={run.id} run={run} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={SquareTerminal}
          title="ยังไม่มีคำสั่งใน session นี้"
          detail="คำสั่งและผลลัพธ์จาก Codex จะแสดงที่นี่"
        />
      )}
    </section>
  );
}
