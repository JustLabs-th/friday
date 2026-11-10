import { useState } from 'react';
import { CircleCheckIcon, LoaderCircleIcon } from 'lucide-react';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';

export interface ReasoningData {
  /** What the model thought so far. */
  text: string;
  /** True while the model is still thinking. */
  running?: boolean;
  /** How long the thinking took, once it is done. */
  seconds?: number;
}

export function Reasoning({ reasoning }: { reasoning: ReasoningData }) {
  const { text, running = false, seconds } = reasoning;
  // Open while thinking; once the reader toggles it, follow the reader.
  const [open, setOpen] = useState<boolean>();

  const line = (
    <TraceLine status={running ? 'running' : undefined}>
      <TraceIcon>
        {running ? <LoaderCircleIcon aria-hidden="true" /> : <CircleCheckIcon aria-hidden="true" />}
      </TraceIcon>
      <TraceTitle>{running ? 'Thinking' : 'Thought'}</TraceTitle>
      {!running && seconds !== undefined && <TraceDescription>{seconds}s</TraceDescription>}
    </TraceLine>
  );

  return (
    <Trace>
      {text.length === 0 ? (
        line
      ) : (
        <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
          <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
          <TraceCollapsibleContent className="whitespace-pre-wrap text-muted-foreground">
            {text}
          </TraceCollapsibleContent>
        </TraceCollapsible>
      )}
    </Trace>
  );
}
