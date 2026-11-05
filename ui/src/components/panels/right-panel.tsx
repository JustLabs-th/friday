import { XIcon } from 'lucide-react';
import type { SandboxRunData } from '@/components/chat/sandbox-run';
import type { Project } from '@/components/dialogs/new-project-dialog';
import { PreviewPanel } from '@/components/panels/preview-panel';
import { SessionOverview } from '@/components/panels/session-overview';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type RightPanelTab = 'overview' | 'preview';

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
          <SessionOverview project={project} runs={runs} />
        </TabsContent>
        <TabsContent value="preview" className="min-h-0 flex-1">
          <PreviewPanel />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
