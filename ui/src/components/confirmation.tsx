import { BanIcon, CircleCheckIcon, TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Trace, TraceIcon, TraceLine, TraceTitle } from '@/components/ui/trace';

export interface ConfirmationRequest {
  id: string;
  /** The command the assistant wants to run. */
  command: string;
  state: 'requested' | 'approved' | 'denied';
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
            <span className="truncate">Run <code className="font-mono">{request.command}</code>?</span>
          </ItemTitle>
          <ItemDescription>The command runs in this project.</ItemDescription>
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
        <TraceTitle>{approved ? 'Approved' : 'Denied'} <code className="font-mono">{request.command}</code></TraceTitle>
      </TraceLine>
    </Trace>
  );
}
