import { CheckIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/ui/code-block';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type SandboxRunState = 'running' | 'completed' | 'error';

export interface SandboxRunData {
  id: string;
  title: string;
  state: SandboxRunState;
  /** The code or command that was run. */
  code?: string;
  /** What it printed. For an error run this is the failure message. */
  output?: string;
  /** Start collapsed. Runs are open by default. */
  collapsed?: boolean;
}

function StateBadge({ state }: { state: SandboxRunState }) {
  if (state === 'running') {
    return (
      <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400">
        <span className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" aria-hidden="true" />
        Running
      </Badge>
    );
  }
  if (state === 'error') {
    return (
      <Badge variant="destructive">
        <XIcon aria-hidden="true" />
        Error
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400">
      <CheckIcon aria-hidden="true" />
      Completed
    </Badge>
  );
}

export function SandboxRun({ run }: { run: SandboxRunData }) {
  const hasCode = Boolean(run.code);
  const hasOutput = Boolean(run.output) || run.state === 'running';
  const firstTab = hasCode ? 'code' : 'console';

  return (
    <Collapsible defaultOpen={!run.collapsed} className="overflow-hidden rounded-lg border bg-card text-card-foreground">
      <CollapsibleTrigger className="group/run flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="min-w-0 flex-1 truncate font-medium">{run.title}</span>
        <StateBadge state={run.state} />
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/run:rotate-90" aria-hidden="true" />
      </CollapsibleTrigger>
      {(hasCode || hasOutput) && (
        <CollapsibleContent>
          <Tabs defaultValue={firstTab} className="gap-0 border-t">
            <div className="px-2 pt-1">
              <TabsList variant="line">
                {hasCode && <TabsTrigger value="code">Code</TabsTrigger>}
                {hasOutput && <TabsTrigger value="console">Console</TabsTrigger>}
              </TabsList>
            </div>
            {hasCode && (
              <TabsContent value="code">
                <CodeBlock className="rounded-none border-0 border-t bg-transparent">{run.code}</CodeBlock>
              </TabsContent>
            )}
            {hasOutput && (
              <TabsContent value="console">
                <CodeBlock className={`rounded-none border-0 border-t bg-transparent ${run.state === 'error' ? 'text-destructive' : ''}`}>
                  {run.output || (run.state === 'running' ? 'Waiting for output...' : '')}
                </CodeBlock>
              </TabsContent>
            )}
          </Tabs>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
