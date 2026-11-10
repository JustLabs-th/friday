import { useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { CheckIcon, CircleXIcon, CopyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';

interface StackTraceProps {
  /** The full stack: the error on the first line, then one frame per line. */
  stack: string;
  /** Show the frames right away, for a call that just failed. */
  defaultOpen?: boolean;
}

// Frames from dependencies or the runtime are muted so the reader's own code stands out.
function isLibraryFrame(frame: string) {
  return frame.includes('node_modules') || frame.includes('node:');
}

export function StackTrace({ stack, defaultOpen = false }: StackTraceProps) {
  const [error = '', ...frames] = stack
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(stack)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <Trace>
      <TraceCollapsible defaultOpen={defaultOpen}>
        {/* The copy button sits beside the trigger because a button cannot be nested in one. */}
        <div className="flex items-center gap-1">
          <TraceCollapsibleTrigger className="flex-1">
            <TraceLine status="error">
              <TraceIcon>
                <CircleXIcon aria-hidden="true" />
              </TraceIcon>
              <TraceTitle>Failed: {error}</TraceTitle>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={copied ? 'Copied' : 'Copy stack trace'}
            title="Copy stack trace"
            onClick={() => void copy()}
          >
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          </Button>
        </div>
        <TraceCollapsibleContent>
          <div className="flex flex-col gap-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
            <p className="text-destructive">{error}</p>
            <ol>
              {frames.map((frame, index) => (
                <li
                  key={`${index}-${frame}`}
                  className={isLibraryFrame(frame) ? 'text-muted-foreground' : 'text-foreground'}
                >
                  {frame}
                </li>
              ))}
            </ol>
          </div>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
