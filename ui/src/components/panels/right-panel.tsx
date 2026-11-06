import { XIcon } from 'lucide-react';
import type { SandboxRunData } from '@/components/chat/sandbox-run';
import type { Project } from '@/components/dialogs/new-project-dialog';
import { PreviewPanel } from '@/components/panels/preview-panel';
import { SessionOverview } from '@/components/panels/session-overview';
import { Button } from '@/components/ui/button';

interface RightPanelProps {
  /** A preview is open. It takes the place of the overview until it is closed. */
  preview: boolean;
  /** Closes the preview, which brings the overview back. */
  onClose: () => void;
  project: Project | null;
  runs: SandboxRunData[];
  /** The open chat, so the overview can show what it changed. */
  threadId?: string | null;
  running?: boolean;
}

/** The side of the chat: the session overview, replaced by the preview while one is open. */
export function RightPanel({ preview, onClose, project, runs, threadId, running }: RightPanelProps) {
  return (
    <aside
      aria-label={preview ? 'Preview' : 'Session overview'}
      className="flex w-80 shrink-0 flex-col border-l bg-background"
    >
      {preview && (
        <div className="flex h-9 items-center justify-between border-b px-3">
          <h2 className="text-sm font-medium">Preview</h2>
          <Button variant="ghost" size="icon-xs" aria-label="Close preview" onClick={onClose}>
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {preview ? (
          <PreviewPanel />
        ) : (
          <SessionOverview project={project} runs={runs} threadId={threadId} running={running} />
        )}
      </div>
    </aside>
  );
}
