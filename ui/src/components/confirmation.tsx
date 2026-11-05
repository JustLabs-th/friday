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
}

export function Confirmation({ request, onApprove, onDeny }: ConfirmationProps) {
  if (request.state === 'requested') {
    return (
      <Item size="sm" variant="outline">
        <ItemMedia variant="icon">
          <TerminalIcon aria-hidden="true" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="min-w-0">
            <span className="min-w-0">{request.kind === 'files' ? 'Allow file changes?' : 'Allow command once?'}</span>
          </ItemTitle>
          <ItemDescription>{request.reason || 'Codex is waiting for your decision.'}</ItemDescription>
          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all text-xs">{request.command}</pre>
          {request.cwd && <p className="mt-1 break-all text-xs text-muted-foreground">{request.cwd}</p>}
        </ItemContent>
        <ItemActions>
          <Button onClick={onDeny} size="sm" variant="outline">Deny</Button>
          <Button onClick={onApprove} size="sm">Approve</Button>
        </ItemActions>
      </Item>
    );
  }

  const approved = request.state === 'approved';
  return (
    <Trace>
      <TraceLine>
        <TraceIcon>{approved ? <CircleCheckIcon aria-hidden="true" /> : <BanIcon aria-hidden="true" />}</TraceIcon>
        <TraceTitle>{approved ? 'Approved' : request.state === 'resolved' ? 'Resolved' : 'Denied'} <code className="font-mono">{request.command}</code></TraceTitle>
      </TraceLine>
    </Trace>
  );
}
