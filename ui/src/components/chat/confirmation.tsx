import { BanIcon, CircleCheckIcon, TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Trace, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace';

export interface ConfirmationRequest {
  id: string;
  /** The command the assistant wants to run. */
  command: string;
  state: 'requested' | 'approved' | 'denied' | 'resolved';
  kind?: 'command' | 'files';
  reason?: string;
  cwd?: string;
}

interface ConfirmationProps {
  request: ConfirmationRequest;
  onApprove: () => void;
  onDeny: () => void;
  /** Where this request is in the queue ("1 จาก 3"), shown when several are waiting. */
  position?: string;
  className?: string;
}

export function Confirmation({ request, onApprove, onDeny, position, className }: ConfirmationProps) {
  if (request.state === 'requested') {
    return (
      <Item size="sm" variant="outline" className={className}>
        <ItemMedia variant="icon">
          <TerminalIcon aria-hidden="true" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="min-w-0">
            <span className="min-w-0">{request.kind === 'files' ? 'Allow file changes?' : 'Allow command once?'}</span>
            {position && <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{position}</span>}
          </ItemTitle>
          <ItemDescription>{request.reason || 'Liam is waiting for your decision.'}</ItemDescription>
          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all text-xs">{request.command}</pre>
          {request.cwd && <p className="mt-1 break-all text-xs text-muted-foreground">{request.cwd}</p>}
        </ItemContent>
        <ItemActions>
          <Button onClick={onDeny} size="sm" variant="outline">
            Deny
          </Button>
          <Button onClick={onApprove} size="sm">
            Approve
          </Button>
        </ItemActions>
      </Item>
    );
  }

  const approved = request.state === 'approved';
  return (
    <Trace>
      <TraceLine>
        <TraceIcon>{approved ? <CircleCheckIcon aria-hidden="true" /> : <BanIcon aria-hidden="true" />}</TraceIcon>
        <TraceTitle>
          {approved ? 'Approved' : request.state === 'resolved' ? 'Resolved' : 'Denied'}{' '}
          <code className="font-mono">{request.command}</code>
        </TraceTitle>
      </TraceLine>
    </Trace>
  );
}
