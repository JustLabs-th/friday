import { useState } from 'react';
import { CircleCheckIcon, CircleXIcon, LoaderCircleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/ui/code-block';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';

export interface ChainStep {
  id: string;
  title: string;
  /** Unset means the step finished successfully. */
  status?: 'running' | 'error';
  /** Short labels for what the step found, such as file names or hosts. */
  tags?: string[];
  /** Raw output such as a command log or an error message. */
  output?: string;
}

function StatusIcon({ status }: { status: ChainStep['status'] }) {
  return (
    <TraceIcon>
      {status === 'running' ? (
        <LoaderCircleIcon aria-hidden="true" />
      ) : status === 'error' ? (
        <CircleXIcon aria-hidden="true" />
      ) : (
        <CircleCheckIcon aria-hidden="true" />
      )}
    </TraceIcon>
  );
}

function StepLine({ step }: { step: ChainStep }) {
  const line = (
    <TraceLine status={step.status}>
      <StatusIcon status={step.status} />
      <TraceTitle>{step.title}</TraceTitle>
    </TraceLine>
  );
  if (!step.tags?.length && !step.output) return line;
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        {step.tags && step.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {step.tags.map(tag => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {step.output && <CodeBlock>{step.output}</CodeBlock>}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

interface ChainOfThoughtProps {
  steps: ChainStep[];
}

export function ChainOfThought({ steps }: ChainOfThoughtProps) {
  const running = steps.some(step => step.status === 'running');
  const failed = steps.filter(step => step.status === 'error').length;
  // Stay open while steps run; once the user toggles it, follow the user.
  const [open, setOpen] = useState<boolean>();
  const summaryStatus = running ? 'running' : failed > 0 ? 'error' : undefined;
  const title = running
    ? 'Working'
    : failed > 0
      ? `Worked in ${steps.length} steps, ${failed} failed`
      : `Worked in ${steps.length} steps`;

  return (
    <Trace>
      <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
        <TraceCollapsibleTrigger>
          <TraceLine status={summaryStatus}>
            <StatusIcon status={summaryStatus} />
            <TraceTitle>{title}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>
            {steps.map(step => (
              <StepLine key={step.id} step={step} />
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
